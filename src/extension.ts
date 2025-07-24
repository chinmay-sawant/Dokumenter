/**
 * VSCode Extension Installation Instructions:
 *
 * 1. Open a terminal in this folder.
 * 2. Run: npm install
 * 3. Run: npm run compile
 * 4. In VSCode, press F5 to launch a new Extension Development Host window.
 *    (This will run and test your extension.)
 * 5. To install permanently:
 *    a. Run: vsce package
 *    b. In VSCode, open the command palette (Ctrl+Shift+P), choose "Extensions: Install from VSIX..."
 *    c. Select the generated .vsix file.
 *
 * You need to have 'vsce' installed globally for packaging:
 *   npm install -g vsce
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

// --- Interfaces and Global State ---
interface CodeSnippet {
    relativePath: string;
    code: string;
    language: string;
    description: string;
    explanation?: string;
    range: vscode.Range;
}

let snippets: CodeSnippet[] = [];
let decorationType: vscode.TextEditorDecorationType;
let decorations: Map<string, vscode.DecorationOptions[]> = new Map();
let clearStatusBarItem: vscode.StatusBarItem;
let codeLensProvider: SnippetCodeLensProvider;
let selectionDebounce: NodeJS.Timeout | undefined;

// --- Main Activation Function ---
export function activate(context: vscode.ExtensionContext) {
    decorationType = vscode.window.createTextEditorDecorationType({
        backgroundColor: 'rgba(255, 255, 0, 0.3)',
        border: '1px solid #cca700',
    });

    codeLensProvider = new SnippetCodeLensProvider();
    
    // --- Register Providers and Commands ---
    context.subscriptions.push(
        vscode.languages.registerCodeLensProvider('*', codeLensProvider),
        vscode.commands.registerCommand('codeSnippetCollector.quickAdd', quickAdd),
        vscode.commands.registerCommand('codeSnippetCollector.addWithDetails', addWithDetails),
        vscode.commands.registerCommand('codeSnippetCollector.cancelAction', cancelAction),
        vscode.commands.registerCommand('codeSnippetCollector.clearAll', clearAll),
        vscode.commands.registerCommand('codeSnippetCollector.quickSaveToFile', quickSaveSnippetsToFile),
        vscode.commands.registerCommand('codeSnippetCollector.saveAllAs', saveAllAs)
    );

    // --- Status Bar ---
    clearStatusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    clearStatusBarItem.command = 'codeSnippetCollector.clearAll';
    clearStatusBarItem.text = `$(clear-all) Snippets`;
    clearStatusBarItem.tooltip = `Clear ${snippets.length} Snippet(s) & All Highlights`;
    context.subscriptions.push(clearStatusBarItem);
    
    // --- Event Listeners ---
    context.subscriptions.push(
        vscode.window.onDidChangeTextEditorSelection(handleSelectionChange),
        vscode.window.onDidChangeActiveTextEditor(editor => {
            if (editor) updateDecorationsForEditor(editor);
            codeLensProvider.clear();
        }),
        vscode.workspace.onDidChangeTextDocument(handleTextChange),
        decorationType
    );

    if (vscode.window.activeTextEditor) {
        updateDecorationsForEditor(vscode.window.activeTextEditor);
    }
    updateClearButtonVisibility();
}


// --- CodeLens-Triggered Commands ---

/** 1. Quick Add: Asks only for description. */
async function quickAdd(selection: vscode.Selection) {
    codeLensProvider.clear();
    const editor = vscode.window.activeTextEditor;
    if (!editor) return;

    const description = await vscode.window.showInputBox({
        prompt: "Enter a brief description for this snippet",
        placeHolder: `e.g., Function to parse user data`,
    });

    if (description) {
        await processSnippet(editor, selection, description, {});
    }
}

/** 2. Add with Details: Asks for description, then explanation. */
async function addWithDetails(selection: vscode.Selection) {
    codeLensProvider.clear();
    const editor = vscode.window.activeTextEditor;
    if (!editor) return;

    const description = await vscode.window.showInputBox({
        prompt: "Step 1: Enter a description for this snippet",
        placeHolder: "e.g., Database connection logic"
    });
    if (!description) return; // User cancelled

    const explanation = await vscode.window.showInputBox({
        prompt: "Step 2: Enter an optional explanation",
        placeHolder: "e.g., Uses connection pooling and handles retry logic"
    });

    await processSnippet(editor, selection, description, { explanation });
}

/** 3. Quick Save: Saves all snippets to an auto-generated file. */
async function quickSaveSnippetsToFile() {
    codeLensProvider.clear();
    if (snippets.length === 0) {
        vscode.window.showWarningMessage('No snippets to save.');
        return;
    }

    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
        vscode.window.showErrorMessage('Cannot save, please open a workspace folder.');
        return;
    }

    const parentFolderName = path.basename(workspaceFolder.uri.fsPath);
    const timestamp = new Date().toISOString().replace(/[-:.]/g, '').replace('T', '_').slice(0, 15);
    const fileName = `${parentFolderName}_${timestamp}.md`;
    const fileUri = vscode.Uri.joinPath(workspaceFolder.uri, "markdowns", fileName);
    const markdownFolderPath = path.join(workspaceFolder.uri.fsPath, "markdowns");
    if (!fs.existsSync(markdownFolderPath)) {
        fs.mkdirSync(markdownFolderPath, { recursive: true });
    }
    await saveAndFinalize(fileUri);
}

/** 4. Save As: Lets user choose file name and location. */
async function saveAllAs() {
    codeLensProvider.clear();
    if (snippets.length === 0) {
        vscode.window.showWarningMessage('No snippets to save.');
        return;
    }

    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
        vscode.window.showErrorMessage('Cannot save, please open a workspace folder.');
        return;
    }

    const fileUri = await vscode.window.showSaveDialog({
        defaultUri: vscode.Uri.joinPath(workspaceFolder.uri, 'code-snippets.md'),
        filters: { 'Markdown': ['md'] }
    });

    if (fileUri) {
        await saveAndFinalize(fileUri);
    }
}

/** 5. Cancel: Hides the CodeLens UI. */
function cancelAction() {
    codeLensProvider.clear();
}

/** 6. Clear All: Resets the entire collection and all highlights. */
function clearAll(showMessage = true) {
    snippets = []; 
    decorations.clear();
    vscode.window.visibleTextEditors.forEach(editor => {
        editor.setDecorations(decorationType, []);
    });
    updateClearButtonVisibility();
    codeLensProvider.clear();
    if (showMessage) {
        vscode.window.showInformationMessage('All highlights and the snippet collection have been cleared.');
    }
}


// --- Core Logic and Providers ---

class SnippetCodeLensProvider implements vscode.CodeLensProvider {
    private _onDidChangeCodeLenses: vscode.EventEmitter<void> = new vscode.EventEmitter<void>();
    public readonly onDidChangeCodeLenses: vscode.Event<void> = this._onDidChangeCodeLenses.event;

    private activeSelection: vscode.Selection | undefined;

    public provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
        if (!this.activeSelection || vscode.window.activeTextEditor?.document.uri.toString() !== document.uri.toString()) {
            return [];
        }

        const range = new vscode.Range(this.activeSelection.start, this.activeSelection.start);
        
        // --- Snippet-specific actions ---
        const lenses: vscode.CodeLens[] = [
            new vscode.CodeLens(range, { title: "⚡ Quick Add", command: 'codeSnippetCollector.quickAdd', arguments: [this.activeSelection]}),
            new vscode.CodeLens(range, { title: "＋ Add with Details", command: 'codeSnippetCollector.addWithDetails', arguments: [this.activeSelection]}),
        ];

        // --- Collection-level actions (only show if snippets exist) ---
        if (snippets.length > 0) {
            lenses.push(new vscode.CodeLens(range, { title: "|", command: ""})); // Separator
            lenses.push(new vscode.CodeLens(range, { title: `⚡ Quick Save All (${snippets.length})`, command: 'codeSnippetCollector.quickSaveToFile' }));
            lenses.push(new vscode.CodeLens(range, { title: `💾 Save All As...`, command: 'codeSnippetCollector.saveAllAs' }));
            lenses.push(new vscode.CodeLens(range, { title: `🗑️ Clear All`, command: 'codeSnippetCollector.clearAll' }));
        }

        lenses.push(new vscode.CodeLens(range, { title: "✕ Cancel", command: 'codeSnippetCollector.cancelAction' }));

        return lenses;
    }

    public update(selection: vscode.Selection) {
        this.activeSelection = selection;
        this._onDidChangeCodeLenses.fire();
    }

    public clear() {
        this.activeSelection = undefined;
        this._onDidChangeCodeLenses.fire();
    }
}

function handleSelectionChange(event: vscode.TextEditorSelectionChangeEvent) {
    if (selectionDebounce) clearTimeout(selectionDebounce);
    
    const selection = event.selections[0];
    if (selection.isEmpty) {
        codeLensProvider.clear();
        return;
    }
    
    const fileDecorations = decorations.get(event.textEditor.document.uri.fsPath) || [];
    if (fileDecorations.some(deco => deco.range.contains(selection))) {
        codeLensProvider.clear();
        return;
    }

    selectionDebounce = setTimeout(() => {
        if (!event.textEditor.selection.isEmpty) {
            codeLensProvider.update(selection);
        }
    }, 300);
}


// --- Helper and Utility Functions ---

async function processSnippet(editor: vscode.TextEditor, selection: vscode.Selection, description: string, options: { explanation?: string }) {
    const document = editor.document;
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
    
    const snippet: CodeSnippet = {
        relativePath: workspaceFolder ? path.relative(workspaceFolder.uri.fsPath, document.uri.fsPath) : document.uri.fsPath,
        code: document.getText(selection),
        language: document.languageId,
        description,
        explanation: options.explanation || undefined,
        range: selection
    };

    snippets.push(snippet);
    addHighlight(editor, selection, snippet.description);
    vscode.window.showInformationMessage(`Snippet saved! Total in collection: ${snippets.length}`);
    codeLensProvider.update(selection); // Refresh lenses to show collection actions
}

async function saveAndFinalize(fileUri: vscode.Uri) {
    const content = generateMarkdownContent(snippets);
    try {
        fs.writeFileSync(fileUri.fsPath, content);
        vscode.window.showInformationMessage(`${snippets.length} snippets saved to ${path.basename(fileUri.fsPath)}`);
        
        clearAll(false); // Clear collection without showing a redundant message
        
        const doc = await vscode.workspace.openTextDocument(fileUri);
        await vscode.window.showTextDocument(doc);
    } catch (error: any) {
        vscode.window.showErrorMessage(`Failed to save snippets: ${error.message}`);
    }
}

function generateMarkdownContent(snippetsToSave: CodeSnippet[]): string {
    let content = `# Code Snippets Collection\n\n*Generated on: ${new Date().toLocaleString()}*\n\n---\n\n`;
    snippetsToSave.forEach((snippet) => {
        content += `## ${snippet.description}\n\n`;
        content += `**File:** \`${snippet.relativePath}\`\n\n`;
        if (snippet.explanation) {
            content += `**Explanation:**\n\n> ${snippet.explanation.replace(/\n/g, '\n> ')}\n\n`;
        }
        content += `**Code:**\n`;
        content += '```' + `${snippet.language}\n${snippet.code}\n` + '```\n\n---\n\n';
    });
    return content;
}

function addHighlight(editor: vscode.TextEditor, range: vscode.Range, description: string) {
    const filePath = editor.document.uri.fsPath;
    if (!decorations.has(filePath)) decorations.set(filePath, []);
    decorations.get(filePath)!.push({
        range: range,
        hoverMessage: new vscode.MarkdownString(`**Saved Snippet:**\n\n> ${description}`)
    });
    updateDecorationsForEditor(editor);
    updateClearButtonVisibility();
}

function updateDecorationsForEditor(editor: vscode.TextEditor) {
    editor.setDecorations(decorationType, decorations.get(editor.document.uri.fsPath) || []);
}

function updateClearButtonVisibility() {
    if (snippets.length > 0) {
        clearStatusBarItem.text = `$(clear-all) Snippets (${snippets.length})`;
        clearStatusBarItem.tooltip = `Clear ${snippets.length} Snippet(s) & All Highlights`;
        clearStatusBarItem.show();
    } else {
        clearStatusBarItem.hide();
    }
}

function handleTextChange(event: vscode.TextDocumentChangeEvent) {
    const filePath = event.document.uri.fsPath;
    if (decorations.has(filePath)) {
        decorations.delete(filePath);
        snippets = snippets.filter(s => s.relativePath !== filePath);
        codeLensProvider.clear();
        updateDecorationsForEditor(event.document.uri.fsPath as any);
        updateClearButtonVisibility();
    }
}

export function deactivate() {
    if (selectionDebounce) clearTimeout(selectionDebounce);
}