import * as vscode from 'vscode';
import { CodeSnippet } from '../types/types';

export class SnippetDescriptionLensProvider implements vscode.CodeLensProvider {
    private _onDidChangeCodeLenses: vscode.EventEmitter<void> = new vscode.EventEmitter<void>();
    public readonly onDidChangeCodeLenses: vscode.Event<void> = this._onDidChangeCodeLenses.event;

    private snippets: CodeSnippet[] = [];
    private onSnippetsUpdatedCallback?: (snippets: CodeSnippet[]) => void;

    public setOnSnippetsUpdatedCallback(callback: (snippets: CodeSnippet[]) => void) {
        this.onSnippetsUpdatedCallback = callback;
    }

    public provideCodeLenses(document: vscode.TextDocument, token: vscode.CancellationToken): vscode.CodeLens[] {
        const lenses: vscode.CodeLens[] = [];
        
        // Get workspace folder to match relative paths
        const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
        const currentFilePath = workspaceFolder ? 
            require('path').relative(workspaceFolder.uri.fsPath, document.uri.fsPath) : 
            document.uri.fsPath;

        // Find snippets for current file
        const fileSnippets = this.snippets.filter(snippet => snippet.relativePath === currentFilePath);

        for (const snippet of fileSnippets) {
            // Create lens above the snippet line
            const lensRange = new vscode.Range(
                new vscode.Position(snippet.range.start.line, 0),
                new vscode.Position(snippet.range.start.line, 0)
            );

            // Create description lens with larger font and actions
            const descriptionLens = new vscode.CodeLens(lensRange, {
                title: `## 📝 ${snippet.description}`,
                command: ''
            });
            lenses.push(descriptionLens);

            // Add edit and delete actions for description
            const editDescriptionLens = new vscode.CodeLens(lensRange, {
                title: `✏️ Edit`,
                command: 'dokumenter.editDescription',
                arguments: [snippet.range.start.line, currentFilePath]
            });
            lenses.push(editDescriptionLens);

            const deleteDescriptionLens = new vscode.CodeLens(lensRange, {
                title: `🗑️ Delete`,
                command: 'dokumenter.deleteDescription',
                arguments: [snippet.range.start.line, currentFilePath]
            });
            lenses.push(deleteDescriptionLens);

            // Create explanation lens if it exists
            if (snippet.explanation && snippet.explanation.trim()) {
                const explanationLens = new vscode.CodeLens(lensRange, {
                    title: `## 💡 ${snippet.explanation}`,
                    command: ''
                });
                lenses.push(explanationLens);

                // Add edit and delete actions for explanation
                const editExplanationLens = new vscode.CodeLens(lensRange, {
                    title: `✏️ Edit Explanation`,
                    command: 'dokumenter.editExplanation',
                    arguments: [snippet.range.start.line, currentFilePath]
                });
                lenses.push(editExplanationLens);

                const deleteExplanationLens = new vscode.CodeLens(lensRange, {
                    title: `🗑️ Delete Explanation`,
                    command: 'dokumenter.deleteExplanation',
                    arguments: [snippet.range.start.line, currentFilePath]
                });
                lenses.push(deleteExplanationLens);
            }
        }

        return lenses;
    }

    public async handleEditDescription(snippetLine: number, filePath: string) {
        const snippet = this.snippets.find(s => s.relativePath === filePath && s.range.start.line === snippetLine);
        if (!snippet) return;

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
        const snippet = this.snippets.find(s => s.relativePath === filePath && s.range.start.line === snippetLine);
        if (!snippet) return;

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
        const snippet = this.snippets.find(s => s.relativePath === filePath && s.range.start.line === snippetLine);
        if (!snippet) return;

        const confirm = await vscode.window.showWarningMessage(
            `Delete description: "${snippet.description}"?`,
            { modal: true },
            'Delete'
        );

        if (confirm === 'Delete') {
            this.snippets = this.snippets.filter(s => !(s.relativePath === filePath && s.range.start.line === snippetLine));
            this._onDidChangeCodeLenses.fire();
            this.notifySnippetsUpdated();
        }
    }

    public async handleDeleteExplanation(snippetLine: number, filePath: string) {
        const snippet = this.snippets.find(s => s.relativePath === filePath && s.range.start.line === snippetLine);
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
