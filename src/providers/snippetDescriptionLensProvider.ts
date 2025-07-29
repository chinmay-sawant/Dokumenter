import * as vscode from 'vscode';
import * as path from 'path';
import { CodeSnippet } from '../types/types';

export class SnippetDescriptionLensProvider implements vscode.CodeLensProvider {
    private _onDidChangeCodeLenses: vscode.EventEmitter<void> = new vscode.EventEmitter<void>();
    public readonly onDidChangeCodeLenses: vscode.Event<void> = this._onDidChangeCodeLenses.event;

    private snippets: CodeSnippet[] = [];
    private onSnippetsUpdatedCallback?: (snippets: CodeSnippet[]) => void;
    private showEditWebviewCallback?: (snippet: CodeSnippet, onSave: (description: string, explanation?: string) => void) => void;

    public setOnSnippetsUpdatedCallback(callback: (snippets: CodeSnippet[]) => void) {
        this.onSnippetsUpdatedCallback = callback;
    }

    public setShowEditWebviewCallback(callback: (snippet: CodeSnippet, onSave: (description: string, explanation?: string) => void) => void) {
        this.showEditWebviewCallback = callback;
    }

    public provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
        const codeLenses: vscode.CodeLens[] = [];
        const filePath = document.uri.fsPath;
        
        // Get snippets for current file with their global indexes
        const fileSnippets = this.getSnippetsForFile(filePath);
        
        fileSnippets.forEach((snippet, localIndex) => {
            const globalIndex = this.snippets.indexOf(snippet) + 1; // 1-based index
            const line = snippet.range.start.line;
            
            // Add index number to description display
            const descriptionText = `📝 [${globalIndex}] ${snippet.description}`;
            
            codeLenses.push(new vscode.CodeLens(
                new vscode.Range(line, 0, line, 0),
                {
                    title: descriptionText,
                    command: '',
                    tooltip: snippet.explanation || 'No explanation provided'
                }
            ));

            // Edit and Delete buttons with index reference
            codeLenses.push(new vscode.CodeLens(
                new vscode.Range(line, 0, line, 0),
                {
                    title: '✏️ Edit',
                    command: 'dokumenter.editDescription',
                    arguments: [line, filePath]
                }
            ));

            codeLenses.push(new vscode.CodeLens(
                new vscode.Range(line, 0, line, 0),
                {
                    title: '🗑️ Delete',
                    command: 'dokumenter.deleteDescription',
                    arguments: [line, filePath]
                }
            ));
        });

        return codeLenses;
    }

    private getSnippetsForFile(filePath: string): CodeSnippet[] {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        const relativePath = workspaceFolder ? path.relative(workspaceFolder.uri.fsPath, filePath) : filePath;
        
        return this.snippets.filter(snippet => snippet.relativePath === relativePath);
    }

    public async handleEditDescription(snippetLine: number, filePath: string) {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        const relativePath = workspaceFolder ? path.relative(workspaceFolder.uri.fsPath, filePath) : filePath;
        
        const snippet = this.snippets.find(s => s.relativePath === relativePath && s.range.start.line === snippetLine);
        if (!snippet) return;

        // If snippet has both description and explanation, show webview panel
        if (snippet.explanation && snippet.explanation.trim() && this.showEditWebviewCallback) {
            this.showEditWebviewCallback(snippet, (newDescription: string, newExplanation?: string) => {
                snippet.description = newDescription;
                snippet.explanation = newExplanation;
                this._onDidChangeCodeLenses.fire();
                this.notifySnippetsUpdated();
            });
            return;
        }

        // Otherwise, show simple input box for description only
        const newDescription = await vscode.window.showInputBox({
            prompt: 'Edit description',
            value: snippet.description,
            placeHolder: 'Enter new description...'
        });

        if (newDescription !== undefined) {
            snippet.description = newDescription;
            this._onDidChangeCodeLenses.fire();
            this.notifySnippetsUpdated();
        }
    }

    public async handleEditExplanation(snippetLine: number, filePath: string) {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        const relativePath = workspaceFolder ? path.relative(workspaceFolder.uri.fsPath, filePath) : filePath;
        
        const snippet = this.snippets.find(s => s.relativePath === relativePath && s.range.start.line === snippetLine);
        if (!snippet) return;

        // Show webview panel for editing explanation with description
        if (this.showEditWebviewCallback) {
            this.showEditWebviewCallback(snippet, (newDescription: string, newExplanation?: string) => {
                snippet.description = newDescription;
                snippet.explanation = newExplanation;
                this._onDidChangeCodeLenses.fire();
                this.notifySnippetsUpdated();
            });
            return;
        }

        // Fallback to simple input box
        const newExplanation = await vscode.window.showInputBox({
            prompt: 'Edit explanation',
            value: snippet.explanation || '',
            placeHolder: 'Enter new explanation...'
        });

        if (newExplanation !== undefined) {
            snippet.explanation = newExplanation;
            this._onDidChangeCodeLenses.fire();
            this.notifySnippetsUpdated();
        }
    }

    public async handleDeleteDescription(snippetLine: number, filePath: string) {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        const relativePath = workspaceFolder ? path.relative(workspaceFolder.uri.fsPath, filePath) : filePath;
        
        const snippet = this.snippets.find(s => s.relativePath === relativePath && s.range.start.line === snippetLine);
        if (!snippet) return;

        const confirm = await vscode.window.showWarningMessage(
            `Delete description: "${snippet.description}"?`,
            { modal: true },
            'Delete'
        );

        if (confirm === 'Delete') {
            // Remove snippet from local array
            this.snippets = this.snippets.filter(s => !(s.relativePath === relativePath && s.range.start.line === snippetLine));
            this._onDidChangeCodeLenses.fire();
            
            // Notify snippet manager to remove highlights and update internal state
            this.notifySnippetsUpdated();
            
            vscode.window.showInformationMessage('Snippet deleted successfully!');
        }
    }

    public async handleDeleteExplanation(snippetLine: number, filePath: string) {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        const relativePath = workspaceFolder ? path.relative(workspaceFolder.uri.fsPath, filePath) : filePath;
        
        const snippet = this.snippets.find(s => s.relativePath === relativePath && s.range.start.line === snippetLine);
        if (!snippet) return;

        const confirm = await vscode.window.showWarningMessage(
            `Delete explanation: "${snippet.explanation}"?`,
            { modal: true },
            'Delete'
        );

        if (confirm === 'Delete') {
            snippet.explanation = '';
            this._onDidChangeCodeLenses.fire();
            this.notifySnippetsUpdated();
        }
    }

    private notifySnippetsUpdated() {
        if (this.onSnippetsUpdatedCallback) {
            this.onSnippetsUpdatedCallback([...this.snippets]);
        }
    }

    public updateSnippets(snippets: CodeSnippet[]) {
        this.snippets = snippets;
        this._onDidChangeCodeLenses.fire();
    }

    public clear() {
        this.snippets = [];
        this._onDidChangeCodeLenses.fire();
    }
}
