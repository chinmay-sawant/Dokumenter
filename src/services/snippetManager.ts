import * as vscode from 'vscode';
import * as path from 'path';
import { CodeSnippet } from '../types/types';

export class SnippetManager {
    private snippets: CodeSnippet[] = [];
    private decorationType: vscode.TextEditorDecorationType;
    private decorations: Map<string, vscode.DecorationOptions[]> = new Map();
    private onSnippetsChangedCallback?: (snippets: CodeSnippet[]) => void;

    constructor() {
        this.decorationType = vscode.window.createTextEditorDecorationType({
            backgroundColor: 'rgba(255, 255, 0, 0.3)',
            border: '1px solid #cca700',
        });
    }

    public setOnSnippetsChangedCallback(callback: (snippets: CodeSnippet[]) => void) {
        this.onSnippetsChangedCallback = callback;
    }

    public addSnippet(editor: vscode.TextEditor, selection: vscode.Selection, description: string, explanation?: string): void {
        const document = editor.document;
        const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
        
        const snippet: CodeSnippet = {
            relativePath: workspaceFolder ? path.relative(workspaceFolder.uri.fsPath, document.uri.fsPath) : document.uri.fsPath,
            code: document.getText(selection),
            language: document.languageId,
            description,
            explanation: explanation || undefined,
            range: selection
        };

        this.snippets.push(snippet);
        this.addHighlight(editor, selection, snippet.description, snippet.explanation);
        this.notifySnippetsChanged();
    }

    public updateSnippet(index: number, description: string, explanation?: string): void {
        if (index >= 0 && index < this.snippets.length) {
            this.snippets[index].description = description;
            this.snippets[index].explanation = explanation;
            this.notifySnippetsChanged();
        }
    }

    public findSnippetAtPosition(filePath: string, position: vscode.Position): { snippet: CodeSnippet; index: number } | null {
        const fileDecorations = this.decorations.get(filePath) || [];
        const targetDecoration = fileDecorations.find(deco => deco.range.contains(position));
        
        if (!targetDecoration) return null;

        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        const relativePath = workspaceFolder ? path.relative(workspaceFolder.uri.fsPath, filePath) : filePath;
        
        const snippetIndex = this.snippets.findIndex(s => 
            s.relativePath === relativePath && 
            s.range.isEqual(targetDecoration.range)
        );

        return snippetIndex !== -1 ? { snippet: this.snippets[snippetIndex], index: snippetIndex } : null;
    }

    public getAllSnippets(): CodeSnippet[] {
        return [...this.snippets];
    }

    public getSnippetsCount(): number {
        return this.snippets.length;
    }

    public clearAll(): void {
        this.snippets = [];
        this.decorations.clear();
        vscode.window.visibleTextEditors.forEach(editor => {
            editor.setDecorations(this.decorationType, []);
        });
        this.notifySnippetsChanged();
    }

    public generateMarkdownContent(): string {
        let content = `# Code Snippets Collection\n\n*Generated on: ${new Date().toLocaleString()}*\n\n---\n\n`;
        this.snippets.forEach((snippet) => {
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

    public updateDecorationsForEditor(editor: vscode.TextEditor): void {
        editor.setDecorations(this.decorationType, this.decorations.get(editor.document.uri.fsPath) || []);
    }

    private addHighlight(editor: vscode.TextEditor, range: vscode.Range, description: string, explanation?: string): void {
        const filePath = editor.document.uri.fsPath;
        if (!this.decorations.has(filePath)) this.decorations.set(filePath, []);
        
        // Create hover message with description and explanation
        const hoverText = explanation ? 
            `**📝 Saved Snippet**\n\n**Description:** ${description}\n\n**Explanation:** ${explanation}` :
            `**📝 Saved Snippet**\n\n**Description:** ${description}`;
        
        this.decorations.get(filePath)!.push({
            range: range,
            hoverMessage: new vscode.MarkdownString(hoverText)
        });
        
        this.updateDecorationsForEditor(editor);
    }

    public handleTextChange(filePath: string): void {
        const fileDecorations = this.decorations.get(filePath);
        if (fileDecorations && fileDecorations.length > 0) {
            this.decorations.delete(filePath);
            
            const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
            const relativePath = workspaceFolder ? path.relative(workspaceFolder.uri.fsPath, filePath) : filePath;
            
            const originalSnippetCount = this.snippets.length;
            this.snippets = this.snippets.filter(s => s.relativePath !== relativePath);
            
            if (this.snippets.length < originalSnippetCount) {
                vscode.window.showWarningMessage(`Snippets cleared from ${path.basename(filePath)} due to document changes.`);
                this.notifySnippetsChanged();
            }

            const editor = vscode.window.visibleTextEditors.find(e => e.document.uri.fsPath === filePath);
            if (editor) {
                this.updateDecorationsForEditor(editor);
            }
        }
    }

    public updateSnippetsFromExternal(updatedSnippets: CodeSnippet[]): void {
        this.snippets = [...updatedSnippets];
        // Update decorations and other visual elements as needed
        vscode.window.visibleTextEditors.forEach(editor => {
            this.updateDecorationsForEditor(editor);
        });
    }

    private notifySnippetsChanged() {
        if (this.onSnippetsChangedCallback) {
            this.onSnippetsChangedCallback([...this.snippets]);
        }
    }

    public dispose(): void {
        this.decorationType.dispose();
    }
}