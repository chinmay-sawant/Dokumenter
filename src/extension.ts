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

    // --- Register the CodeLens Provider ---
    codeLensProvider = new SnippetCodeLensProvider();
    const codeLensProviderDisposable = vscode.languages.registerCodeLensProvider('*', codeLensProvider);

    // --- Register Commands ---
    const handleLensActionCommand = vscode.commands.registerCommand('codeSnippetCollector.handleLensAction', handleLensAction);
    const clearAllCommand = vscode.commands.registerCommand('codeSnippetCollector.clearAll', clearAll);
    const quickSaveCommand = vscode.commands.registerCommand('codeSnippetCollector.quickSaveToFile', quickSaveSnippetsToFile);

    // --- Status Bar ---
    clearStatusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    clearStatusBarItem.command = 'codeSnippetCollector.clearAll';
    clearStatusBarItem.text = `$(clear-all) Clear Snippets`;
    clearStatusBarItem.tooltip = 'Clear All Snippet Highlights & Reset Collection';
    
    // --- Event Listeners ---
    const onDidChangeSelection = vscode.window.onDidChangeTextEditorSelection(handleSelectionChange);
    const onDidChangeActiveEditor = vscode.window.onDidChangeActiveTextEditor(editor => {
        if (editor) updateDecorationsForEditor(editor);
        codeLensProvider.clear(); // Clear lenses when switching files
    });
    const onDidChangeTextDocument = vscode.workspace.onDidChangeTextDocument(handleTextChange);

    context.subscriptions.push(
        codeLensProviderDisposable,
        handleLensActionCommand,
        clearAllCommand,
        quickSaveCommand,
        onDidChangeSelection,
        onDidChangeActiveEditor,
        onDidChangeTextDocument,
        decorationType,
        clearStatusBarItem
    );

    if (vscode.window.activeTextEditor) {
        updateDecorationsForEditor(vscode.window.activeTextEditor);
    }
    updateClearButtonVisibility();
}

// --- Core Logic ---

/**
 * Handles the actions triggered by clicking on a CodeLens.
 */
async function handleLensAction(action: 'quickAdd' | 'detailedAdd' | 'cancel', selection: vscode.Selection) {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return;

    // Always clear the lens after an action is taken
    codeLensProvider.clear();

    if (action === 'cancel') {
        return; // Do nothing
    }

    const description = await vscode.window.showInputBox({
        prompt: "Enter a brief description for this snippet",
        placeHolder: `e.g., Function to parse user data`,
    });

    if (!description) return; // User cancelled the input

    let explanation: string | undefined;
    if (action === 'detailedAdd') {
        explanation = await vscode.window.showInputBox({
            prompt: "Enter an optional explanation",
            placeHolder: "e.g., This snippet handles null inputs gracefully"
        });
    }

    await processSnippet(editor, selection, description, { explanation });
}

/**
 * Creates and stores the snippet, then highlights it.
 */
async function processSnippet(
    editor: vscode.TextEditor,
    selection: vscode.Selection,
    description: string,
    options: { explanation?: string; }
) {
    const document = editor.document;
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
    
    const snippet: CodeSnippet = {
        relativePath: workspaceFolder
            ? path.relative(workspaceFolder.uri.fsPath, document.uri.fsPath)
            : document.uri.fsPath,
        code: document.getText(selection),
        language: document.languageId,
        description,
        explanation: options.explanation || undefined,
        range: selection
    };

    snippets.push(snippet);
    addHighlight(editor, selection, snippet.description);
    
    vscode.window.showInformationMessage(`Snippet saved! Total in collection: ${snippets.length}`);
}

/**
 * NEW: Saves all collected snippets to a file with an auto-generated name.
 */
async function quickSaveSnippetsToFile() {
    codeLensProvider.clear(); // Hide lenses after action

    if (snippets.length === 0) {
        vscode.window.showWarningMessage('No snippets in the collection to save.');
        return;
    }

    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
        vscode.window.showErrorMessage('Cannot save, please open a workspace folder first.');
        return;
    }

    // Generate filename: parentFolder_YYYYMMDD_HHMMSS.md
    const parentFolderName = path.basename(workspaceFolder.uri.fsPath);
    const markdownsDir = vscode.Uri.joinPath(workspaceFolder.uri, 'markdowns');
    if (!fs.existsSync(markdownsDir.fsPath)) {
        fs.mkdirSync(markdownsDir.fsPath);
    }
    const timestamp = new Date().toISOString().replace(/[-:.]/g, '').replace('T', '_').slice(0, 15);
    const fileName = `${parentFolderName}_${timestamp}.md`;
    const fileUri = vscode.Uri.joinPath(markdownsDir, fileName);

    const content = generateMarkdownContent(snippets);

    try {
        fs.writeFileSync(fileUri.fsPath, content);
        vscode.window.showInformationMessage(`${snippets.length} snippets saved to ${fileName}`);
        
        // Clear everything after a successful save
        clearAll(false); // Pass false to avoid redundant message
        
        // Open the saved file for the user
        const doc = await vscode.workspace.openTextDocument(fileUri);
        await vscode.window.showTextDocument(doc);
        
    } catch (error: any) {
        vscode.window.showErrorMessage(`Failed to quick-save snippets: ${error.message}`);
    }
}

// --- Event Handlers and Providers ---

class SnippetCodeLensProvider implements vscode.CodeLensProvider {
    private _onDidChangeCodeLenses: vscode.EventEmitter<void> = new vscode.EventEmitter<void>();
    public readonly onDidChangeCodeLenses: vscode.Event<void> = this._onDidChangeCodeLenses.event;

    private activeSelection: vscode.Selection | undefined;
    private activeEditorUri: string | undefined;

    public provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] | Thenable<vscode.CodeLens[]> {
        if (!this.activeSelection || this.activeEditorUri !== document.uri.toString()) {
            return [];
        }

        const range = new vscode.Range(this.activeSelection.start, this.activeSelection.start);
        const lenses: vscode.CodeLens[] = [
            new vscode.CodeLens(range, {
                title: "✓ Quick Add",
                command: 'codeSnippetCollector.handleLensAction',
                arguments: ['quickAdd', this.activeSelection],
                tooltip: "Save snippet with a description"
            }),
            new vscode.CodeLens(range, {
                title: "＋ Add with Details",
                command: 'codeSnippetCollector.handleLensAction',
                arguments: ['detailedAdd', this.activeSelection],
                tooltip: "Save with description and explanation"
            }),
        ];

        // NEW: Conditionally show the "Quick Save" button
        if (snippets.length > 0) {
            lenses.push(new vscode.CodeLens(range, {
                title: `⚡ Quick Save All (${snippets.length})`,
                command: 'codeSnippetCollector.quickSaveToFile',
                tooltip: 'Save all collected snippets to a new file'
            }));
        }

        lenses.push(new vscode.CodeLens(range, {
            title: "✕ Cancel",
            command: 'codeSnippetCollector.handleLensAction',
            arguments: ['cancel', this.activeSelection],
        }));

        return lenses;
    }

    public update(selection: vscode.Selection, editor: vscode.TextEditor) {
        this.activeSelection = selection;
        this.activeEditorUri = editor.document.uri.toString();
        this._onDidChangeCodeLenses.fire();
    }

    public clear() {
        this.activeSelection = undefined;
        this.activeEditorUri = undefined;
        this._onDidChangeCodeLenses.fire();
    }
}

function handleSelectionChange(event: vscode.TextEditorSelectionChangeEvent) {
    if (selectionDebounce) clearTimeout(selectionDebounce);
    
    const editor = event.textEditor;
    const selection = event.selections[0];

    if (!editor || selection.isEmpty) {
        codeLensProvider.clear();
        return;
    }

    const fileDecorations = decorations.get(editor.document.uri.fsPath) || [];
    const isAlreadyHighlighted = fileDecorations.some(deco => deco.range.contains(selection));
    if (isAlreadyHighlighted) {
        codeLensProvider.clear();
        return;
    }

    selectionDebounce = setTimeout(() => {
        if (!editor.selection.isEmpty) {
            codeLensProvider.update(selection, editor);
        }
    }, 300); // Reduced delay for faster response
}

function handleTextChange(event: vscode.TextDocumentChangeEvent) {
    const filePath = event.document.uri.fsPath;
    if (decorations.has(filePath)) {
        decorations.delete(filePath);
        snippets = snippets.filter(s => s.relativePath !== filePath);
        codeLensProvider.clear();
        const editor = vscode.window.visibleTextEditors.find(e => e.document.uri.fsPath === filePath);
        if (editor) editor.setDecorations(decorationType, []);
        updateClearButtonVisibility();
    }
}


// --- Helper and Utility Functions ---

function addHighlight(editor: vscode.TextEditor, range: vscode.Range, description: string) {
    const filePath = editor.document.uri.fsPath;
    if (!decorations.has(filePath)) decorations.set(filePath, []);
    
    decorations.get(filePath)!.push({
        range: range,
        hoverMessage: new vscode.MarkdownString(`**Saved Snippet:**\n\n> ${description}`)
    });
    
    editor.setDecorations(decorationType, decorations.get(filePath)!);
    updateClearButtonVisibility();
}

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

function updateDecorationsForEditor(editor: vscode.TextEditor | undefined) {
    if (!editor) return;
    const filePath = editor.document.uri.fsPath;
    editor.setDecorations(decorationType, decorations.get(filePath) || []);
}

function updateClearButtonVisibility() {
    if (decorations.size > 0) {
        clearStatusBarItem.show();
    } else {
        clearStatusBarItem.hide();
    }
}

function generateMarkdownContent(snippetsToSave: CodeSnippet[]): string {
    let content = `# Code Snippets Collection\n\n`;
    content += `*Generated on: ${new Date().toLocaleString()}*\n\n`;
    snippetsToSave.forEach((snippet) => {
        content += `## ${snippet.description}\n\n`;
        content += `**File:** \`${snippet.relativePath}\`\n\n`;
        if (snippet.explanation) {
            content += `**Explanation:**\n\n${snippet.explanation}\n\n`;
        }
        content += `**Code:**\n`;
        content += '```' + `${snippet.language}\n`;
        content += snippet.code;
        content += '\n```\n\n---\n\n';
    });
    return content;
}

export function deactivate() {
    if (selectionDebounce) clearTimeout(selectionDebounce);
    decorationType?.dispose();
    clearStatusBarItem?.dispose();
}