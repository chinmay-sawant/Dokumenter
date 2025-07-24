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

// --- Global State ---
let snippets: CodeSnippet[] = [];
let decorationType: vscode.TextEditorDecorationType;
let decorations: Map<string, vscode.DecorationOptions[]> = new Map();
let clearStatusBarItem: vscode.StatusBarItem;


export function activate(context: vscode.ExtensionContext) {
    // Create decoration type for highlighting
    decorationType = vscode.window.createTextEditorDecorationType({
        backgroundColor: 'rgba(255, 255, 0, 0.3)',
        border: '1px solid yellow',
    });

    // --- Register Commands ---
    const saveSnippetCommand = vscode.commands.registerCommand('codeSnippetCollector.saveSnippet', saveSnippet);
    const clearHighlightsCommand = vscode.commands.registerCommand('codeSnippetCollector.clearHighlights', clearHighlights);

    // --- Status Bar Item for Clearing Highlights ---
    clearStatusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    clearStatusBarItem.command = 'codeSnippetCollector.clearHighlights';
    clearStatusBarItem.text = `$(clear-all) Clear Snippets`;
    clearStatusBarItem.tooltip = 'Clear All Snippet Highlights from Editor';
    
    // --- Register Event Handlers ---
    const onDidChangeActiveEditor = vscode.window.onDidChangeActiveTextEditor(editor => {
        if (editor) {
            updateDecorationsForEditor(editor);
        }
    });
    const onDidChangeTextDocument = vscode.workspace.onDidChangeTextDocument(handleTextChange);

    // --- Add to Subscriptions for Disposal ---
    context.subscriptions.push(
        saveSnippetCommand,
        clearHighlightsCommand,
        onDidChangeActiveEditor,
        onDidChangeTextDocument,
        decorationType,
        clearStatusBarItem
    );

    // Initial setup
    if (vscode.window.activeTextEditor) {
        updateDecorationsForEditor(vscode.window.activeTextEditor);
    }
    updateClearButtonVisibility();
}

/**
 * Replaces the old input prompts with a new, interactive QuickPick UI.
 */
async function saveSnippet() {
    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.selection.isEmpty) {
        vscode.window.showWarningMessage('Please select some code first');
        return;
    }

    const document = editor.document;
    const selection = editor.selection;

    // --- Define QuickPick buttons ---
    const quickAddButton: vscode.QuickInputButton = {
        iconPath: new vscode.ThemeIcon('add'),
        tooltip: 'Quick Add: Save snippet to the in-memory collection.'
    };
    const detailedAddButton: vscode.QuickInputButton = {
        iconPath: new vscode.ThemeIcon('file-add'),
        tooltip: 'Add with Details: Provide an explanation and choose to save to a file.'
    };
    const cancelButton: vscode.QuickInputButton = {
        iconPath: new vscode.ThemeIcon('close'),
        tooltip: 'Cancel'
    };

    // --- Create and configure the QuickPick UI ---
    const quickPick = vscode.window.createQuickPick();
    quickPick.title = 'Save Code Snippet';
    quickPick.placeholder = 'Enter a description (or use a button for more options)';
    quickPick.buttons = [quickAddButton, detailedAddButton, cancelButton];
    quickPick.ignoreFocusOut = true; // Keep UI open until an action is taken

    // --- Event Handlers for the QuickPick ---
    // User clicks one of the custom buttons
    quickPick.onDidTriggerButton(async (button) => {
        const description = quickPick.value || `Untitled snippet from ${path.basename(document.uri.fsPath)}`;
        
        if (button === cancelButton) {
            quickPick.hide();
            return;
        }
        
        quickPick.hide(); // Close the UI before processing

        if (button === quickAddButton) {
            await processSnippet(editor, selection, description, { detailed: false });
        } else if (button === detailedAddButton) {
            await processSnippet(editor, selection, description, { detailed: true });
        }
    });

    // User presses 'Enter'
    quickPick.onDidAccept(async () => {
        const description = quickPick.value || `Untitled snippet from ${path.basename(document.uri.fsPath)}`;
        quickPick.hide();
        // Default action for 'Enter' is Quick Add
        await processSnippet(editor, selection, description, { detailed: false });
    });

    // User cancels via 'Esc' key or the cancel button hides the pick
    quickPick.onDidHide(() => {
        quickPick.dispose();
    });

    quickPick.show();
}

/**
 * Handles the logic of creating and storing a snippet after the UI interaction.
 */
async function processSnippet(
    editor: vscode.TextEditor,
    selection: vscode.Selection,
    description: string,
    options: { detailed: boolean }
) {
    const document = editor.document;
    const selectedText = document.getText(selection);

    const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
    const relativePath = workspaceFolder
        ? path.relative(workspaceFolder.uri.fsPath, document.uri.fsPath)
        : document.uri.fsPath;
    
    const language = document.languageId;
    let explanation: string | undefined = undefined;

    if (options.detailed) {
        explanation = await vscode.window.showInputBox({
            prompt: 'Enter an optional explanation for this snippet',
            placeHolder: 'e.g., This function uses a regex to handle edge cases...'
        });
    }
    
    const snippet: CodeSnippet = {
        relativePath,
        code: selectedText,
        language,
        description,
        explanation: explanation || undefined,
        range: selection
    };

    snippets.push(snippet);
    addHighlight(editor, selection, snippet.description);
    
    vscode.window.showInformationMessage(`Snippet saved! Total in collection: ${snippets.length}`);

    if (options.detailed) {
        const saveChoice = await vscode.window.showQuickPick(
            ['Save collection to file now', 'Keep in collection for later'],
            { placeHolder: 'What would you like to do next?' }
        );

        if (saveChoice === 'Save collection to file now') {
            await saveSnippetsToFile();
        }
    }
}


function addHighlight(editor: vscode.TextEditor, range: vscode.Range, description: string) {
    const filePath = editor.document.uri.fsPath;
    
    if (!decorations.has(filePath)) {
        decorations.set(filePath, []);
    }

    const decoration: vscode.DecorationOptions = {
        range: range,
        hoverMessage: new vscode.MarkdownString(`**Saved Snippet:**\n\n${description}`)
    };

    decorations.get(filePath)!.push(decoration);
    editor.setDecorations(decorationType, decorations.get(filePath)!);
    updateClearButtonVisibility();
}

function clearHighlights() {
    // Note: This only clears highlights, not the in-memory snippet array.
    // Saving to file is the action that clears the array.
    decorations.clear();
    vscode.window.visibleTextEditors.forEach(editor => {
        editor.setDecorations(decorationType, []);
    });
    updateClearButtonVisibility();
    vscode.window.showInformationMessage('All highlights cleared from the editor.');
}

function updateDecorationsForEditor(editor: vscode.TextEditor | undefined) {
    if (!editor) return;
    const filePath = editor.document.uri.fsPath;
    const fileDecorations = decorations.get(filePath) || [];
    editor.setDecorations(decorationType, fileDecorations);
}

function updateClearButtonVisibility() {
    if (decorations.size > 0) {
        clearStatusBarItem.show();
    } else {
        clearStatusBarItem.hide();
    }
}

function handleTextChange(event: vscode.TextDocumentChangeEvent) {
    // To prevent misaligned highlights after edits, we remove them.
    // A more advanced implementation could try to adjust ranges.
    const filePath = event.document.uri.fsPath;
    if (decorations.has(filePath)) {
        decorations.delete(filePath);
        const editor = vscode.window.visibleTextEditors.find(e => e.document.uri.fsPath === filePath);
        if (editor) {
            editor.setDecorations(decorationType, []);
        }
        updateClearButtonVisibility();
    }
}

async function saveSnippetsToFile() {
    if (snippets.length === 0) {
        vscode.window.showWarningMessage('No snippets in the collection to save.');
        return;
    }

    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
        vscode.window.showErrorMessage('Cannot save, please open a workspace folder first.');
        return;
    }

    const defaultPath = path.join(workspaceFolder.uri.fsPath, 'code-snippets.md');
    
    const fileUri = await vscode.window.showSaveDialog({
        defaultUri: vscode.Uri.file(defaultPath),
        filters: { 'Markdown': ['md'] }
    });

    if (!fileUri) return;

    const fileExists = fs.existsSync(fileUri.fsPath);
    let appendMode = false;
    if (fileExists) {
        const choice = await vscode.window.showQuickPick(
            ['Overwrite existing file', 'Append to existing file'],
            { placeHolder: `File '${path.basename(fileUri.fsPath)}' already exists.` }
        );
        if (!choice) return; // User cancelled
        if (choice.startsWith('Append')) {
            appendMode = true;
        }
    }

    let content = '';
    if (appendMode) {
        content = fs.readFileSync(fileUri.fsPath, 'utf8') + '\n\n---\n\n';
    }

    content += `# Code Snippets Collection\n\n`;
    content += `*Generated on: ${new Date().toLocaleString()}*\n\n`;

    snippets.forEach((snippet, index) => {
        const titleIndex = appendMode ? ` (New)` : ` ${index + 1}`;
        content += `## Snippet${titleIndex}: ${snippet.description}\n\n`;
        content += `**File:** \`${snippet.relativePath}\`\n\n`;
        
        if (snippet.explanation) {
            content += `**Explanation:**\n${snippet.explanation}\n\n`;
        }
        
        content += `**Code:**\n`;
        content += `\`\`\`${snippet.language}\n`;
        content += snippet.code;
        content += '\n```\n\n';
    });

    try {
        fs.writeFileSync(fileUri.fsPath, content);
        vscode.window.showInformationMessage(`${snippets.length} snippets saved to ${path.basename(fileUri.fsPath)}`);
        
        // Clear the collection and highlights after a successful save
        snippets = [];
        clearHighlights();
        
        // Open the saved file for the user
        const doc = await vscode.workspace.openTextDocument(fileUri);
        await vscode.window.showTextDocument(doc);
        
    } catch (error: any) {
        vscode.window.showErrorMessage(`Failed to save snippets: ${error.message}`);
    }
}

export function deactivate() {
    decorationType?.dispose();
    clearStatusBarItem?.dispose();
}