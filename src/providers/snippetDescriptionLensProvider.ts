import * as vscode from 'vscode';
import { CodeSnippet } from '../types/types';

export class SnippetDescriptionLensProvider implements vscode.CodeLensProvider {
    private _onDidChangeCodeLenses: vscode.EventEmitter<void> = new vscode.EventEmitter<void>();
    public readonly onDidChangeCodeLenses: vscode.Event<void> = this._onDidChangeCodeLenses.event;

    private snippets: CodeSnippet[] = [];

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

            // Create description lens
            const descriptionLens = new vscode.CodeLens(lensRange, {
                title: `📝 ${snippet.description}`,
                command: ''
            });
            lenses.push(descriptionLens);

            // Create explanation lens if it exists
            if (snippet.explanation && snippet.explanation.trim()) {
                const explanationLens = new vscode.CodeLens(lensRange, {
                    title: `💡 ${snippet.explanation}`,
                    command: ''
                });
                lenses.push(explanationLens);
            }
        }

        return lenses;
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
