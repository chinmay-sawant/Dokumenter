import * as vscode from 'vscode';

export class SnippetCodeLensProvider implements vscode.CodeLensProvider {
    private _onDidChangeCodeLenses: vscode.EventEmitter<void> = new vscode.EventEmitter<void>();
    public readonly onDidChangeCodeLenses: vscode.Event<void> = this._onDidChangeCodeLenses.event;

    private activeSelections: vscode.Selection[] = [];
    private snippetsLength: number = 0;

    public provideCodeLenses(document: vscode.TextDocument, token: vscode.CancellationToken): vscode.CodeLens[] {
        if (this.activeSelections.length === 0 || vscode.window.activeTextEditor?.document.uri.toString() !== document.uri.toString()) {
            return [];
        }

        // Position the CodeLens directly on the latest (last) selection line
        const lastSelection = this.activeSelections[this.activeSelections.length - 1];
        const range = new vscode.Range(
            new vscode.Position(lastSelection.start.line, 0),
            new vscode.Position(lastSelection.start.line, 0)
        );
        
        // --- Snippet-specific actions ---
        const selectionCount = this.activeSelections.length;
        const selectionText = selectionCount > 1 ? ` (${selectionCount} selections)` : '';
        
        const lenses: vscode.CodeLens[] = [
            new vscode.CodeLens(range, { title: `⚡ Quick Add${selectionText}`, command: 'codeSnippetCollector.quickAdd', arguments: [this.activeSelections]}),
            new vscode.CodeLens(range, { title: `＋ Add with Details${selectionText}`, command: 'codeSnippetCollector.addWithDetails', arguments: [this.activeSelections]}),
        ];

        // --- Collection-level actions (only show if snippets exist) ---
        if (this.snippetsLength > 0) {
            lenses.push(new vscode.CodeLens(range, { title: "|", command: ""})); // Separator
            lenses.push(new vscode.CodeLens(range, { title: `⚡ Quick Save All (${this.snippetsLength})`, command: 'codeSnippetCollector.quickSaveToFile' }));
            lenses.push(new vscode.CodeLens(range, { title: `💾 Save All As...`, command: 'codeSnippetCollector.saveAllAs' }));
            lenses.push(new vscode.CodeLens(range, { title: `🗑️ Clear All`, command: 'codeSnippetCollector.clearAll' }));
        }

        lenses.push(new vscode.CodeLens(range, { title: "✕ Cancel", command: 'codeSnippetCollector.cancelAction' }));

        return lenses;
    }

    public setSnippetsLength(length: number) {
        this.snippetsLength = length;
        this._onDidChangeCodeLenses.fire();
    }

    public update(selections: vscode.Selection[]) {
        this.activeSelections = selections.filter(selection => !selection.isEmpty);
        this._onDidChangeCodeLenses.fire();
    }

    public clear() {
        this.activeSelections = [];
        this._onDidChangeCodeLenses.fire();
    }
}
