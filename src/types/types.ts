import * as vscode from 'vscode';

export interface CodeSnippet {
    relativePath: string;
    code: string;
    language: string;
    description: string;
    explanation?: string;
    range: vscode.Range;
}
