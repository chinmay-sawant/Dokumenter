# CodeMark (code-snippet-collector)

## Description

This plugin was created as I have to go through 40+ GO microservices for which code was not built, which was adding extra time to do the analysis and documentation part. This is created for easing the document creation process by removing the file creation and copy snippet part, which saves a lot of time for developers.

CodeMark helps you collect and store code snippets from any file in your workspace, along with their relative paths, descriptions, and explanations. It streamlines the process of documenting code, making it easy to generate markdown documentation with just a few clicks.

---
![Sample Usecase](https://github.com/chinmay-sawant/Dokumenter/blob/master/screenshots/demov2.gif)

---

## Features

- Quickly save selected code snippets with descriptions and explanations
- Highlights saved snippets in the editor
- Save all collected snippets to a markdown file (auto-named or custom location)
- Status bar indicator for snippet collection and clearing
- CodeLens UI for snippet actions
- Works with any language and file type

---

## Installation

### From VSIX File

1. Download the latest `.vsix` file from the [Releases](https://github.com/chinmay-sawant/Dokumenter/releases) or build it yourself (see below).
2. In VS Code, open the Command Palette (`Ctrl+Shift+P`).
3. Type `Extensions: Install from VSIX...` and select the downloaded `.vsix` file.
4. Reload VS Code if prompted.

### From Source

1. Clone this repository:
   ```sh
   git clone https://github.com/chinmay-sawant/Dokumenter.git
   cd Dokumenter
   ```
2. Install dependencies:
   ```sh
   npm install
   ```
3. Compile the extension:
   ```sh
   npm run compile
   ```
4. Press `F5` in VS Code to launch a new Extension Development Host window for testing.
5. To package for installation:
   ```sh
   npm install -g vsce
   vsce package
   ```
   Then follow the VSIX installation steps above.

---

## Usage

1. Select any code in your editor.
2. Use the CodeLens actions above the selection:
   - ⚡ Quick Add: Save with description
   - ＋ Add with Details: Save with description and explanation
   - ⚡ Quick Save All: Save all snippets to a markdown file
   - 💾 Save All As...: Choose file name/location for saving
   - 🗑️ Clear All: Remove all highlights and snippets
   - ✕ Cancel: Hide CodeLens UI
3. View and manage your snippets from the status bar or context menu.
4. Saved markdown files are stored in the `markdowns/` folder by default.

---

## Commands

- `codeSnippetCollector.saveSnippet`: Save selected code as a snippet
- `codeSnippetCollector.clearHighlights`: Clear all highlights
- `codeSnippetCollector.quickAdd`: Quick add snippet
- `codeSnippetCollector.addWithDetails`: Add snippet with details
- `codeSnippetCollector.quickSaveToFile`: Save all snippets to file
- `codeSnippetCollector.saveAllAs`: Save all snippets as...
- `codeSnippetCollector.clearAll`: Clear all snippets
- `codeSnippetCollector.cancelAction`: Cancel CodeLens UI

---

## Keybindings

- `Ctrl+Shift+S`: Save selected code as a snippet (when selection is active)

---

## Context Menu

- Right-click with a selection to save a snippet via the context menu.

---

## Requirements

- VS Code v1.74.0 or higher
- Node.js (for building from source)

---

## License

MIT License. See [LICENSE](./LICENSE) for details.

---

## Contributing

Pull requests and issues are welcome! Please open an issue for bugs or feature requests.

---

## Author

Chinmay Sawant
