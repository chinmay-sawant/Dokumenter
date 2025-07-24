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

export function activate(context: vscode.ExtensionContext) {
    // Create decoration type for highlighting
    decorationType = vscode.window.createTextEditorDecorationType({
        backgroundColor: 'rgba(255, 255, 0, 0.3)',
        border: '1px solid yellow',
        after: {
            contentText: ' ✕',
            color: 'red',
            fontWeight: 'bold',
            margin: '0 0 0 5px'
        }
    });

    // Register commands
    const saveSnippetCommand = vscode.commands.registerCommand('codeSnippetCollector.saveSnippet', saveSnippet);
    const clearHighlightsCommand = vscode.commands.registerCommand('codeSnippetCollector.clearHighlights', clearHighlights);

    // Handle editor changes to maintain decorations
    const onDidChangeActiveEditor = vscode.window.onDidChangeActiveTextEditor(updateDecorations);
    const onDidChangeTextDocument = vscode.workspace.onDidChangeTextDocument(handleTextChange);

    context.subscriptions.push(
        saveSnippetCommand,
        clearHighlightsCommand,
        onDidChangeActiveEditor,
        onDidChangeTextDocument,
        decorationType
    );

    updateDecorations();
}

async function saveSnippet() {
    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.selection.isEmpty) {
        vscode.window.showWarningMessage('Please select some code first');
        return;
    }

    const document = editor.document;
    const selection = editor.selection;
    const selectedText = document.getText(selection);
    
    // Get relative path
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
    const relativePath = workspaceFolder 
        ? path.relative(workspaceFolder.uri.fsPath, document.uri.fsPath)
        : document.uri.fsPath;

    // Get language ID
    const language = document.languageId;

    // Prompt for description
    const description = await vscode.window.showInputBox({
        prompt: 'Enter a description for this code snippet',
        placeHolder: 'e.g., Function to validate email format'
    });

    if (!description) {
        return;
    }

    // Prompt for optional explanation
    const explanation = await vscode.window.showInputBox({
        prompt: 'Enter an explanation (optional)',
        placeHolder: 'Additional details about the code snippet'
    });

    const snippet: CodeSnippet = {
        relativePath,
        code: selectedText,
        language,
        description,
        explanation: explanation || undefined,
        range: selection
    };

    snippets.push(snippet);
    
    // Add highlight decoration
    addHighlight(editor, selection);
    
    // Ask if user wants to save to file
    const saveToFile = await vscode.window.showQuickPick(
        ['Save to file now', 'Add to collection only'],
        { placeHolder: 'What would you like to do?' }
    );

    if (saveToFile === 'Save to file now') {
        await saveSnippetsToFile();
    }

    vscode.window.showInformationMessage(`Snippet saved! Total: ${snippets.length}`);
}

function addHighlight(editor: vscode.TextEditor, range: vscode.Range) {
    const filePath = editor.document.uri.fsPath;
    
    if (!decorations.has(filePath)) {
        decorations.set(filePath, []);
    }

    const decoration: vscode.DecorationOptions = {
        range: range,
        hoverMessage: 'Code snippet saved - Click ✕ to remove'
    };

    decorations.get(filePath)!.push(decoration);
    editor.setDecorations(decorationType, decorations.get(filePath)!);
}

function clearHighlights() {
    decorations.clear();
    vscode.window.visibleTextEditors.forEach(editor => {
        editor.setDecorations(decorationType, []);
    });
    vscode.window.showInformationMessage('All highlights cleared');
}

function updateDecorations() {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        return;
    }

    const filePath = editor.document.uri.fsPath;
    const fileDecorations = decorations.get(filePath) || [];
    editor.setDecorations(decorationType, fileDecorations);
}

function handleTextChange(event: vscode.TextDocumentChangeEvent) {
    // Clear decorations for the changed file to avoid misalignment
    const filePath = event.document.uri.fsPath;
    if (decorations.has(filePath)) {
        decorations.delete(filePath);
        const editor = vscode.window.visibleTextEditors.find(e => e.document.uri.fsPath === filePath);
        if (editor) {
            editor.setDecorations(decorationType, []);
        }
    }
}

async function saveSnippetsToFile() {
    if (snippets.length === 0) {
        vscode.window.showWarningMessage('No snippets to save');
        return;
    }

    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
        vscode.window.showErrorMessage('No workspace folder found');
        return;
    }

    const defaultPath = path.join(workspaceFolder.uri.fsPath, 'code-snippets.md');
    
    const fileUri = await vscode.window.showSaveDialog({
        defaultUri: vscode.Uri.file(defaultPath),
        filters: {
            'Markdown': ['md']
        }
    });

    if (!fileUri) {
        return;
    }

    const appendMode = await vscode.window.showQuickPick(
        ['Overwrite file', 'Append to file'],
        { placeHolder: 'How should the snippets be saved?' }
    );

    let content = '';
    
    if (appendMode === 'Append to file' && fs.existsSync(fileUri.fsPath)) {
        content = fs.readFileSync(fileUri.fsPath, 'utf8') + '\n\n';
    }

    content += '# Code Snippets\n\n';
    content += `*Generated on: ${new Date().toLocaleString()}*\n\n`;

    snippets.forEach((snippet, index) => {
        content += `## Snippet ${index + 1}\n\n`;
        content += `**File:** \`${snippet.relativePath}\`\n\n`;
        content += `**Description:** ${snippet.description}\n\n`;
        
        if (snippet.explanation) {
            content += `**Explanation:** ${snippet.explanation}\n\n`;
        }
        
        content += '**Code:**\n';
        content += `\`\`\`${snippet.language}\n`;
        content += snippet.code;
        content += '\n```\n\n';
        content += '---\n\n';
    });

    try {
        fs.writeFileSync(fileUri.fsPath, content);
        vscode.window.showInformationMessage(`${snippets.length} snippets saved to ${path.basename(fileUri.fsPath)}`);
        
        // Clear the snippets array after saving
        snippets = [];
        clearHighlights();
        
        // Open the saved file
        const doc = await vscode.workspace.openTextDocument(fileUri);
        vscode.window.showTextDocument(doc);
        
    } catch (error) {
        vscode.window.showErrorMessage(`Failed to save snippets: ${error}`);
    }
}

export function deactivate() {
    decorationType?.dispose();
}
