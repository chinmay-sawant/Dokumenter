import { CodeSnippet } from '../types/types';

function escapeHtml(unsafe: string): string {
    return unsafe
         .replace(/&/g, "&amp;")
         .replace(/</g, "&lt;")
         .replace(/>/g, "&gt;")
         .replace(/"/g, "&quot;")
         .replace(/'/g, "&#039;");
}

export function getAddSnippetWebviewContent(selectedCode: string): string {
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

export function getUpdateSnippetWebviewContent(snippet: CodeSnippet): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Update Snippet Details</title>
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
    <h1>Update Snippet Details</h1>
    
    <h3>Code Preview</h3>
    <pre class="code-block"><code>${escapeHtml(snippet.code)}</code></pre>

    <label for="description">Description (Required)</label>
    <input type="text" id="description" value="${escapeHtml(snippet.description)}" required />

    <label for="explanation">Explanation (Optional)</label>
    <textarea id="explanation">${escapeHtml(snippet.explanation || '')}</textarea>

    <div class="buttons">
        <button class="save-button">Update Snippet</button>
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

export function getMultiSnippetWebviewContent(editor: any, selections: any[]): string {
    let blocks = '';
    for (let i = 0; i < selections.length; i++) {
        const code = escapeHtml(editor.document.getText(selections[i]));
        blocks += `
        <div class="snippet-block">
            <h3>Snippet ${i + 1} Preview</h3>
            <pre class="code-block"><code>${code}</code></pre>
            <label for="desc${i}">Description (Required)</label>
            <input type="text" id="desc${i}" placeholder="e.g., Description for snippet ${i + 1}" required />
            <label for="expl${i}">Explanation (Optional)</label>
            <textarea id="expl${i}" placeholder="Explanation for snippet ${i + 1}"></textarea>
        </div>
        <hr/>
        `;
    }
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Add Multiple Snippet Details</title>
    <style>
        body {
            font-family: var(--vscode-font-family);
            color: var(--vscode-editor-foreground);
            background-color: var(--vscode-editor-background);
            padding: 1.2rem;
        }
        h1 {
            color: var(--vscode-side-bar-title-foreground);
            border-bottom: 1px solid var(--vscode-text-separator-foreground);
            padding-bottom: 0.5rem;
            margin-top: 0;
        }
        .snippet-block {
            margin-bottom: 1.5rem;
        }
        h3 {
            margin-bottom: 0.5rem;
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
        textarea {
            height: 80px;
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
            max-height: 120px;
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
        hr {
            border: none;
            border-top: 1px solid var(--vscode-text-separator-foreground);
            margin: 2rem 0;
        }
    </style>
</head>
<body>
    <h1>Add Multiple Snippet Details</h1>
    ${blocks}
    <div class="buttons">
        <button class="save-button">Save All Snippets</button>
        <button type="button" class="cancel-button">Cancel</button>
    </div>
    <script>
        (function() {
            const vscode = acquireVsCodeApi();
            const saveButton = document.querySelector('.save-button');
            const cancelButton = document.querySelector('.cancel-button');
            saveButton.addEventListener('click', () => {
                const descriptions = [];
                const explanations = [];
                let valid = true;
                ${selections.map((_, i) => `
                const desc${i} = document.getElementById('desc${i}').value;
                if (!desc${i}) {
                    document.getElementById('desc${i}').focus();
                    valid = false;
                }
                descriptions.push(desc${i});
                explanations.push(document.getElementById('expl${i}').value);
                `).join('\n')}
                if (!valid) return;
                vscode.postMessage({
                    command: 'save',
                    descriptions: descriptions,
                    explanations: explanations
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
