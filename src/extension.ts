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
import { SnippetCodeLensProvider } from './providers/codeLensProvider';
import { SnippetDescriptionLensProvider } from './providers/snippetDescriptionLensProvider';
import { SnippetManager } from './services/snippetManager';
import { getAddSnippetWebviewContent, getUpdateSnippetWebviewContent, getMultiSnippetWebviewContent } from './webview/webviewContent';

// --- Global State ---
let snippetManager: SnippetManager;
let clearStatusBarItem: vscode.StatusBarItem;
let codeLensProvider: SnippetCodeLensProvider;
let snippetDescriptionLensProvider: SnippetDescriptionLensProvider;
let selectionDebounce: NodeJS.Timeout | undefined;
let detailsPanel: vscode.WebviewPanel | undefined;

// --- Main Activation Function ---
export function activate(context: vscode.ExtensionContext) {
    snippetManager = new SnippetManager();
    codeLensProvider = new SnippetCodeLensProvider();
    snippetDescriptionLensProvider = new SnippetDescriptionLensProvider();
    
    // Set up two-way communication between snippet manager and description lens provider
    snippetManager.setOnSnippetsChangedCallback((snippets) => {
        snippetDescriptionLensProvider.updateSnippets(snippets);
    });
    
    snippetDescriptionLensProvider.setOnSnippetsUpdatedCallback((snippets) => {
        // Update snippet manager's internal state when changes are made via code lens
        snippetManager.updateSnippetsFromExternal(snippets);
    });
    
    // --- Register Providers and Commands ---
    context.subscriptions.push(
        vscode.languages.registerCodeLensProvider('*', codeLensProvider),
        vscode.languages.registerCodeLensProvider('*', snippetDescriptionLensProvider),
        vscode.commands.registerCommand('codeSnippetCollector.quickAdd', quickAdd),
        vscode.commands.registerCommand('codeSnippetCollector.addWithDetails', addWithDetails),
        vscode.commands.registerCommand('codeSnippetCollector.updateSnippetDetails', updateSnippetDetails),
        vscode.commands.registerCommand('codeSnippetCollector.cancelAction', cancelAction),
        vscode.commands.registerCommand('codeSnippetCollector.clearAll', clearAll),
        vscode.commands.registerCommand('codeSnippetCollector.quickSaveToFile', quickSaveSnippetsToFile),
        vscode.commands.registerCommand('codeSnippetCollector.saveAllAs', saveAllAs),
        vscode.commands.registerCommand('dokumenter.editDescription', (line: number, filePath: string) => 
            snippetDescriptionLensProvider.handleEditDescription(line, filePath)),
        vscode.commands.registerCommand('dokumenter.deleteDescription', (line: number, filePath: string) => 
            snippetDescriptionLensProvider.handleDeleteDescription(line, filePath)),
        vscode.commands.registerCommand('dokumenter.editExplanation', (line: number, filePath: string) => 
            snippetDescriptionLensProvider.handleEditExplanation(line, filePath)),
        vscode.commands.registerCommand('dokumenter.deleteExplanation', (line: number, filePath: string) => 
            snippetDescriptionLensProvider.handleDeleteExplanation(line, filePath))
    );

    // --- Status Bar ---
    clearStatusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    clearStatusBarItem.command = 'codeSnippetCollector.clearAll';
    clearStatusBarItem.text = `$(clear-all) Snippets`;
    clearStatusBarItem.tooltip = `Clear ${snippetManager.getSnippetsCount()} Snippet(s) & All Highlights`;
    context.subscriptions.push(clearStatusBarItem);
    
    // --- Event Listeners ---
    context.subscriptions.push(
        vscode.window.onDidChangeTextEditorSelection(handleSelectionChange),
        vscode.window.onDidChangeActiveTextEditor(editor => {
            if (editor) {
                snippetManager.updateDecorationsForEditor(editor);
            }
            codeLensProvider.clear();
        }),
        vscode.workspace.onDidChangeTextDocument(handleTextChange),
        snippetManager
    );

    if (vscode.window.activeTextEditor) {
        snippetManager.updateDecorationsForEditor(vscode.window.activeTextEditor);
    }
    updateClearButtonVisibility();
}

// --- Command Implementations ---

async function quickAdd(selections: vscode.Selection | vscode.Selection[]) {
    codeLensProvider.clear();
    const editor = vscode.window.activeTextEditor;
    if (!editor) return;

    const selectionsArray = Array.isArray(selections) ? selections : [selections];
    
    if (selectionsArray.length === 1) {
        const description = await vscode.window.showInputBox({
            prompt: "Enter a brief description for this snippet",
            placeHolder: `e.g., Function to parse user data`,
        });

        if (description) {
            snippetManager.addSnippet(editor, selectionsArray[0], description);
            vscode.window.showInformationMessage(`Snippet saved! Total in collection: ${snippetManager.getSnippetsCount()}`);
            codeLensProvider.setSnippetsLength(snippetManager.getSnippetsCount());
            updateClearButtonVisibility();
        }
    } else {
        // Multiple selections - ask for a common description or individual descriptions
        const choice = await vscode.window.showQuickPick([
            { label: 'Same description for all', value: 'common' },
            { label: 'Individual descriptions', value: 'individual' }
        ], { placeHolder: `You have ${selectionsArray.length} selections. How would you like to describe them?` });

        if (!choice) return;

        if (choice.value === 'common') {
            const description = await vscode.window.showInputBox({
                prompt: `Enter a description for all ${selectionsArray.length} snippets`,
                placeHolder: `e.g., Related utility functions`,
            });

            if (description) {
                for (let i = 0; i < selectionsArray.length; i++) {
                    const numberedDescription = selectionsArray.length > 1 ? `${description} (${i + 1}/${selectionsArray.length})` : description;
                    snippetManager.addSnippet(editor, selectionsArray[i], numberedDescription);
                }
                vscode.window.showInformationMessage(`${selectionsArray.length} snippets saved! Total in collection: ${snippetManager.getSnippetsCount()}`);
                updateClearButtonVisibility();
            }
        } else {
            for (let i = 0; i < selectionsArray.length; i++) {
                const description = await vscode.window.showInputBox({
                    prompt: `Enter description for snippet ${i + 1} of ${selectionsArray.length}`,
                    placeHolder: `e.g., Helper function for validation`,
                });

                if (description) {
                    snippetManager.addSnippet(editor, selectionsArray[i], description);
                } else {
                    break; // User cancelled, stop processing remaining selections
                }
            }
            vscode.window.showInformationMessage(`Snippets saved! Total in collection: ${snippetManager.getSnippetsCount()}`);
            updateClearButtonVisibility();
        }
    }
}

async function addWithDetails(selections: vscode.Selection | vscode.Selection[]) {
    codeLensProvider.clear();
    const editor = vscode.window.activeTextEditor;
    if (!editor) return;

    const selectionsArray = Array.isArray(selections) ? selections : [selections];

    if (selectionsArray.length === 1) {
        await showDetailsPanel(editor, selectionsArray[0]);
    } else {
        await showMultiDetailsPanel(editor, selectionsArray);
    }
}

async function updateSnippetDetails() {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return;

    const position = editor.selection.active;
    const filePath = editor.document.uri.fsPath;
    
    const result = snippetManager.findSnippetAtPosition(filePath, position);
    if (!result) {
        vscode.window.showWarningMessage('No highlighted snippet found at cursor position.');
        return;
    }

    await showUpdatePanel(editor, result.snippet, result.index);
}

async function showDetailsPanel(editor: vscode.TextEditor, selection: vscode.Selection) {
    return new Promise<void>((resolve) => {
        const column = editor.viewColumn ? editor.viewColumn + 1 : vscode.ViewColumn.Two;
        if (detailsPanel) detailsPanel.dispose();

        detailsPanel = vscode.window.createWebviewPanel(
            'addSnippetDetails',
            'Add Snippet Details',
            column,
            { enableScripts: true }
        );

        const selectedCode = editor.document.getText(selection);
        detailsPanel.webview.html = getAddSnippetWebviewContent(selectedCode);

        detailsPanel.webview.onDidReceiveMessage(
            async message => {
                switch (message.command) {
                    case 'save':
                        if (message.description) {
                            snippetManager.addSnippet(editor, selection, message.description, message.explanation);
                            vscode.window.showInformationMessage(`Snippet saved! Total in collection: ${snippetManager.getSnippetsCount()}`);
                            updateClearButtonVisibility();
                        }
                        detailsPanel?.dispose();
                        resolve();
                        return;
                    case 'cancel':
                        detailsPanel?.dispose();
                        resolve();
                        return;
                }
            },
            undefined,
            []
        );

        detailsPanel.onDidDispose(() => {
            detailsPanel = undefined;
            resolve();
        }, null, []);
    });
}

async function showMultiDetailsPanel(editor: vscode.TextEditor, selections: vscode.Selection[]) {
    return new Promise<void>((resolve) => {
        const column = editor.viewColumn ? editor.viewColumn + 1 : vscode.ViewColumn.Two;
        if (detailsPanel) detailsPanel.dispose();

        detailsPanel = vscode.window.createWebviewPanel(
            'addMultiSnippetDetails',
            `Add Multiple Snippet Details (${selections.length})`,
            column,
            { enableScripts: true }
        );

        detailsPanel.webview.html = getMultiSnippetWebviewContent(editor, selections);

        detailsPanel.webview.onDidReceiveMessage(
            async message => {
                switch (message.command) {
                    case 'save':
                        for (let i = 0; i < selections.length; i++) {
                            const desc = message.descriptions[i];
                            const expl = message.explanations[i];
                            if (desc) {
                                snippetManager.addSnippet(editor, selections[i], desc, expl);
                            }
                        }
                        vscode.window.showInformationMessage(`${selections.length} snippets saved! Total in collection: ${snippetManager.getSnippetsCount()}`);
                        updateClearButtonVisibility();
                        detailsPanel?.dispose();
                        resolve();
                        return;
                    case 'cancel':
                        detailsPanel?.dispose();
                        resolve();
                        return;
                }
            },
            undefined,
            []
        );

        detailsPanel.onDidDispose(() => {
            detailsPanel = undefined;
            resolve();
        }, null, []);
    });
}

async function showUpdatePanel(editor: vscode.TextEditor, snippet: any, index: number) {
    return new Promise<void>((resolve) => {
        const column = editor.viewColumn ? editor.viewColumn + 1 : vscode.ViewColumn.Two;
        if (detailsPanel) detailsPanel.dispose();

        detailsPanel = vscode.window.createWebviewPanel(
            'updateSnippetDetails',
            'Update Snippet Details',
            column,
            { enableScripts: true }
        );

        detailsPanel.webview.html = getUpdateSnippetWebviewContent(snippet);

        detailsPanel.webview.onDidReceiveMessage(
            async message => {
                switch (message.command) {
                    case 'save':
                        if (message.description) {
                            snippetManager.updateSnippet(index, message.description, message.explanation);
                            vscode.window.showInformationMessage('Snippet details updated successfully!');
                        }
                        detailsPanel?.dispose();
                        resolve();
                        return;
                    case 'cancel':
                        detailsPanel?.dispose();
                        resolve();
                        return;
                }
            },
            undefined,
            []
        );

        detailsPanel.onDidDispose(() => {
            detailsPanel = undefined;
            resolve();
        }, null, []);
    });
}

async function quickSaveSnippetsToFile() {
    codeLensProvider.clear();
    if (snippetManager.getSnippetsCount() === 0) {
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

async function saveAllAs() {
    codeLensProvider.clear();
    if (snippetManager.getSnippetsCount() === 0) {
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

function cancelAction() {
    codeLensProvider.clear();
}

function clearAll(showMessage = true) {
    snippetManager.clearAll();
    codeLensProvider.setSnippetsLength(0);
    snippetDescriptionLensProvider.clear();
    updateClearButtonVisibility();
    codeLensProvider.clear();
    if (showMessage) {
        vscode.window.showInformationMessage('All highlights and the snippet collection have been cleared.');
    }
}

// --- Helper Functions ---

async function saveAndFinalize(fileUri: vscode.Uri) {
    const content = snippetManager.generateMarkdownContent();
    try {
        await vscode.workspace.fs.writeFile(fileUri, new TextEncoder().encode(content));
        vscode.window.showInformationMessage(`${snippetManager.getSnippetsCount()} snippets saved to ${path.basename(fileUri.fsPath)}`);
        
        clearAll(false);
        
        const doc = await vscode.workspace.openTextDocument(fileUri);
        await vscode.window.showTextDocument(doc);
    } catch (error: any) {
        vscode.window.showErrorMessage(`Failed to save snippets: ${error.message}`);
    }
}

function handleSelectionChange(event: vscode.TextEditorSelectionChangeEvent) {
    if (selectionDebounce) clearTimeout(selectionDebounce);
    
    const nonEmptySelections = event.selections.filter(selection => !selection.isEmpty);
    
    if (nonEmptySelections.length === 0) {
        codeLensProvider.clear();
        return;
    }
    
    // Check if any selection overlaps with existing decorations - this logic would need to be moved to SnippetManager
    // For now, simplified approach
    selectionDebounce = setTimeout(() => {
        const currentNonEmptySelections = event.textEditor.selections.filter(selection => !selection.isEmpty);
        if (currentNonEmptySelections.length > 0) {
            codeLensProvider.update(currentNonEmptySelections);
        }
    }, 300);
}

function handleTextChange(event: vscode.TextDocumentChangeEvent) {
    const filePath = event.document.uri.fsPath;
    snippetManager.handleTextChange(filePath);
    updateClearButtonVisibility();
    codeLensProvider.clear();
}

function updateClearButtonVisibility() {
    const count = snippetManager.getSnippetsCount();
    codeLensProvider.setSnippetsLength(count);
    if (count > 0) {
        clearStatusBarItem.text = `$(clear-all) Snippets (${count})`;
        clearStatusBarItem.tooltip = `Clear ${count} Snippet(s) & All Highlights`;
        clearStatusBarItem.show();
    } else {
        clearStatusBarItem.hide();
    }
}

export function deactivate() {
    if (selectionDebounce) clearTimeout(selectionDebounce);
    if (detailsPanel) detailsPanel.dispose();
    if (snippetManager) snippetManager.dispose();
}