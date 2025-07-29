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
let detailsPanel: vscode.WebviewPanel | undefined; // Panel for the "Add with Details" view

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

/** 2. Add with Details: Opens a webview for description and explanation. */
async function addWithDetails(selection: vscode.Selection) {
    codeLensProvider.clear();
    const editor = vscode.window.activeTextEditor;
    if (!editor) { return; }

    const column = editor.viewColumn ? editor.viewColumn + 1 : vscode.ViewColumn.Two;

    if (detailsPanel) {
        detailsPanel.reveal(column);
        return;
    }

    detailsPanel = vscode.window.createWebviewPanel(
        'addSnippetDetails',
        'Add Snippet Details',
        column,
        { enableScripts: true }
    );
    
    detailsPanel.webview.html = getWebviewContent(editor.document.getText(selection));
    
    // Handle messages from the webview
    detailsPanel.webview.onDidReceiveMessage(
        async message => {
            switch (message.command) {
                case 'save':
                    await processSnippet(editor, selection, message.description, { explanation: message.explanation });
                    detailsPanel?.dispose();
                    return;
                case 'cancel':
                    detailsPanel?.dispose();
                    return;
            }
        },
        undefined,
        [] // Disposables
    );

    // Reset the panel variable when the user closes it
    detailsPanel.onDidDispose(() => {
        detailsPanel = undefined;
    }, null, []);
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

/** Escapes HTML characters in a string to prevent XSS. */
function escapeHtml(unsafe: string): string {
    return unsafe
         .replace(/&/g, "&")
         .replace(/</g, "<")
         .replace(/>/g, ">")
         .replace(/"/g, "\"")
         .replace(/'/g, "'");
}


/** Generates the HTML content for the "Add with Details" webview. */
function getWebviewContent(selectedCode: string): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Add Snippet Details</title>
    <style>
        body {
            font-family: var(--vscode-font-family);
            color: var(--vscode-editor-foreground);
            background-color: var(--vscode-editor-background);
            padding: 1.2rem;
        }
        h1, h3 {
            color: var(--vscode-side-bar-title-foreground);
            border-bottom: 1px solid var(--vscode-text-separator-foreground);
            padding-bottom: 0.5rem;
            margin-top: 0;
        }
        label {
            display: block;
            margin-top: 1rem;
            margin-bottom: 0.3rem;
            font-weight: bold;
        }
        input[type="text"], textarea {
            width: 95%;
            padding: 8px;
            border-radius: 4px;
            border: 1px solid var(--vscode-input-border);
            background-color: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            font-family: var(--vscode-font-family);
        }
        input#description:invalid {
            border-color: var(--vscode-input-validation-errorBorder);
        }
        textarea {
            height: 120px;
            resize: vertical;
        }
        .code-block {
            background-color: var(--vscode-text-block-quote-background);
            border: 1px solid var(--vscode-text-block-quote-border);
            padding: 10px;
            border-radius: 4px;
            white-space: pre-wrap;
            word-wrap: break-word;
            font-family: var(--vscode-editor-font-family);
            max-height: 200px;
            overflow-y: auto;
        }
        .buttons {
            margin-top: 1.5rem;
            display: flex;
            gap: 0.5rem;
        }
        button {
            padding: 10px 15px;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-weight: bold;
            font-size: 1em;
        }
        .save-button {
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
        }
        .save-button:hover {
            background-color: var(--vscode-button-hoverBackground);
        }
        .cancel-button {
            background-color: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
        }
        .cancel-button:hover {
            background-color: var(--vscode-button-secondaryHoverBackground);
        }
    </style>
</head>
<body>
    <h1>Add Snippet with Details</h1>
    
    <h3>Selected Code Preview</h3>
    <pre class="code-block"><code>${escapeHtml(selectedCode)}</code></pre>

    <label for="description">Description (Required)</label>
    <input type="text" id="description" placeholder="e.g., Database connection logic" required />

    <label for="explanation">Explanation (Optional)</label>
    <textarea id="explanation" placeholder="e.g., Uses connection pooling and handles retry logic"></textarea>

    <div class="buttons">
        <button class="save-button">Save Snippet</button>
        <button type="button" class="cancel-button">Cancel</button>
    </div>

    <script>
        (function() {
            const vscode = acquireVsCodeApi();

            const saveButton = document.querySelector('.save-button');
            const cancelButton = document.querySelector('.cancel-button');
            const descriptionInput = document.getElementById('description');
            const explanationInput = document.getElementById('explanation');

            saveButton.addEventListener('click', () => {
                const description = descriptionInput.value;
                if (!description) {
                    descriptionInput.focus();
                    return;
                }
                const explanation = explanationInput.value;
                vscode.postMessage({
                    command: 'save',
                    description: description,
                    explanation: explanation
                });
            });

            cancelButton.addEventListener('click', () => {
                vscode.postMessage({ command: 'cancel' });
            });

        }());
    </script>
</body>
</html>`;
}

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
        await vscode.workspace.fs.writeFile(fileUri, new TextEncoder().encode(content));
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
    const fileDecorations = decorations.get(filePath);

    if (fileDecorations && fileDecorations.length > 0) {
        // A simple approach: if a decorated file is changed, remove all snippets and decorations from that file.
        // A more complex (but better) approach would involve tracking changes and updating decoration ranges.
        console.log(`Clearing ${fileDecorations.length} snippets from modified file: ${path.basename(filePath)}`);
        decorations.delete(filePath);
        
        const originalSnippetCount = snippets.length;
        snippets = snippets.filter(s => s.relativePath !== path.relative(vscode.workspace.workspaceFolders?.[0].uri.fsPath || '', filePath));
        
        if (snippets.length < originalSnippetCount) {
             vscode.window.showWarningMessage(`Snippets cleared from ${path.basename(filePath)} due to document changes.`);
        }

        const editor = vscode.window.visibleTextEditors.find(e => e.document.uri.fsPath === filePath);
        if (editor) {
            updateDecorationsForEditor(editor);
        }
        updateClearButtonVisibility();
        codeLensProvider.clear();
    }
}

export function deactivate() {
    if (selectionDebounce) clearTimeout(selectionDebounce);
    if (detailsPanel) detailsPanel.dispose();
}