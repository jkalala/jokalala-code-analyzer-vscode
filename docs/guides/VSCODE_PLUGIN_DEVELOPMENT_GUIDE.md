# VS Code Extension (Plug-in) Development Guide

A comprehensive guide for building professional Visual Studio Code extensions.

---

## Table of Contents

1. [Introduction](#introduction)
2. [Getting Started](#getting-started)
3. [Extension Anatomy](#extension-anatomy)
4. [Core Concepts](#core-concepts)
5. [Extension Manifest (package.json)](#extension-manifest-packagejson)
6. [Activation Events](#activation-events)
7. [Commands](#commands)
8. [User Interface Components](#user-interface-components)
9. [Working with Files](#working-with-files)
10. [Language Features](#language-features)
11. [Webviews](#webviews)
12. [State Management](#state-management)
13. [Testing](#testing)
14. [Debugging](#debugging)
15. [Publishing](#publishing)
16. [Best Practices](#best-practices)
17. [Security Considerations](#security-considerations)

---

## Introduction

VS Code extensions are add-ons that extend the functionality of Visual Studio Code. They can:

- Add new commands and keyboard shortcuts
- Support new programming languages
- Add debuggers
- Integrate with external services
- Customize the editor's appearance
- Create custom views and panels

### Extension Types

| Type | Description | Example |
|------|-------------|---------|
| **Language Support** | Syntax highlighting, IntelliSense | Python, Go |
| **Debuggers** | Debug adapters for languages | Node Debug |
| **Linters/Formatters** | Code quality tools | ESLint, Prettier |
| **Themes** | Color themes, icon themes | One Dark Pro |
| **Snippets** | Code snippets | ES6 Snippets |
| **Keymaps** | Keyboard shortcut mappings | Vim, Sublime |
| **Source Control** | SCM providers | GitLens |

---

## Getting Started

### Prerequisites

```bash
# Install Node.js (18.x or higher recommended)
node --version  # Should be v18.x+

# Install Yeoman and VS Code Extension Generator
npm install -g yo generator-code

# Install VS Code Extension CLI
npm install -g @vscode/vsce
```

### Create Your First Extension

```bash
# Generate a new extension
yo code

# Follow the prompts:
# ? What type of extension do you want to create? New Extension (TypeScript)
# ? What's the name of your extension? my-first-extension
# ? What's the identifier of your extension? my-first-extension
# ? What's the description of your extension? My first VS Code extension
# ? Initialize a git repository? Yes
# ? Bundle the source code with webpack? No
# ? Which package manager to use? npm

# Navigate to the extension directory
cd my-first-extension

# Open in VS Code
code .
```

### Run the Extension

1. Press `F5` to open a new VS Code window with your extension loaded
2. Run your command from the Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`)
3. Type "Hello World" to see your extension in action

---

## Extension Anatomy

### Project Structure

```
my-extension/
├── .vscode/
│   ├── launch.json          # Debug configurations
│   └── tasks.json           # Build tasks
├── src/
│   ├── extension.ts         # Extension entry point
│   ├── commands/            # Command implementations
│   ├── providers/           # Tree views, hover, completion
│   ├── services/            # Business logic
│   └── utils/               # Utility functions
├── test/
│   ├── suite/               # Test suites
│   └── runTest.ts           # Test runner
├── resources/               # Icons, images
├── package.json             # Extension manifest
├── tsconfig.json            # TypeScript configuration
├── .vscodeignore            # Files to exclude from package
└── README.md                # Extension documentation
```

### Extension Entry Point

**File:** `src/extension.ts`

```typescript
import * as vscode from 'vscode';

// Called when your extension is activated
export function activate(context: vscode.ExtensionContext) {
    console.log('Extension "my-extension" is now active!');

    // Register a command
    const disposable = vscode.commands.registerCommand(
        'my-extension.helloWorld',
        () => {
            vscode.window.showInformationMessage('Hello World from My Extension!');
        }
    );

    // Add to subscriptions for proper cleanup
    context.subscriptions.push(disposable);
}

// Called when your extension is deactivated
export function deactivate() {
    console.log('Extension "my-extension" is now deactivated');
}
```

---

## Core Concepts

### Extension Context

The `ExtensionContext` provides access to extension-specific utilities:

```typescript
export function activate(context: vscode.ExtensionContext) {
    // Extension's installation path
    const extensionPath = context.extensionPath;

    // URI for extension resources
    const resourceUri = context.extensionUri;

    // Global state (persists across sessions)
    context.globalState.update('key', 'value');
    const value = context.globalState.get('key');

    // Workspace state (persists per workspace)
    context.workspaceState.update('key', 'value');

    // Secret storage (for sensitive data)
    await context.secrets.store('apiKey', 'secret-value');
    const secret = await context.secrets.get('apiKey');

    // Storage paths
    const globalStoragePath = context.globalStorageUri;
    const workspaceStoragePath = context.storageUri;

    // Subscriptions (for cleanup)
    context.subscriptions.push(disposable);
}
```

### Disposables

Disposables are objects that need cleanup. Always add them to `context.subscriptions`:

```typescript
// Commands
const command = vscode.commands.registerCommand('ext.cmd', () => {});
context.subscriptions.push(command);

// Event listeners
const listener = vscode.workspace.onDidSaveTextDocument((doc) => {});
context.subscriptions.push(listener);

// File system watchers
const watcher = vscode.workspace.createFileSystemWatcher('**/*.ts');
context.subscriptions.push(watcher);

// Custom disposables
const customDisposable = {
    dispose: () => {
        // Cleanup logic
    }
};
context.subscriptions.push(customDisposable);
```

### Events

VS Code uses an event-driven architecture:

```typescript
// Document events
vscode.workspace.onDidOpenTextDocument((document) => {
    console.log('Opened:', document.fileName);
});

vscode.workspace.onDidSaveTextDocument((document) => {
    console.log('Saved:', document.fileName);
});

vscode.workspace.onDidChangeTextDocument((event) => {
    console.log('Changed:', event.document.fileName);
    console.log('Changes:', event.contentChanges);
});

// Editor events
vscode.window.onDidChangeActiveTextEditor((editor) => {
    if (editor) {
        console.log('Active editor:', editor.document.fileName);
    }
});

vscode.window.onDidChangeTextEditorSelection((event) => {
    console.log('Selection changed:', event.selections);
});

// Configuration events
vscode.workspace.onDidChangeConfiguration((event) => {
    if (event.affectsConfiguration('myExtension.setting')) {
        console.log('Setting changed');
    }
});
```

---

## Extension Manifest (package.json)

The `package.json` file defines your extension's metadata and contributions:

```json
{
    "name": "my-extension",
    "displayName": "My Extension",
    "description": "A helpful VS Code extension",
    "version": "1.0.0",
    "publisher": "your-publisher-name",
    "engines": {
        "vscode": "^1.85.0"
    },
    "categories": [
        "Other",
        "Linters",
        "Programming Languages"
    ],
    "keywords": [
        "productivity",
        "tools"
    ],
    "icon": "images/icon.png",
    "repository": {
        "type": "git",
        "url": "https://github.com/user/my-extension"
    },
    "main": "./out/extension.js",
    "activationEvents": [],
    "contributes": {
        "commands": [],
        "configuration": {},
        "views": {},
        "menus": {},
        "keybindings": []
    },
    "scripts": {
        "vscode:prepublish": "npm run compile",
        "compile": "tsc -p ./",
        "watch": "tsc -watch -p ./",
        "lint": "eslint src --ext ts",
        "test": "node ./out/test/runTest.js"
    },
    "devDependencies": {
        "@types/vscode": "^1.85.0",
        "@types/node": "^18.x",
        "typescript": "^5.3.0",
        "@vscode/test-electron": "^2.3.8"
    }
}
```

---

## Activation Events

Control when your extension loads:

```json
{
    "activationEvents": [
        // Activate on specific command
        "onCommand:myExtension.start",

        // Activate for specific languages
        "onLanguage:javascript",
        "onLanguage:typescript",

        // Activate when workspace contains files
        "workspaceContains:**/*.config.js",

        // Activate on file open
        "onFileSystem:sftp",

        // Activate on debug
        "onDebug",
        "onDebugResolve:node",

        // Activate on view
        "onView:myExtension.treeView",

        // Activate on URI
        "onUri",

        // Activate on startup (use sparingly!)
        "onStartupFinished",

        // Always activate (avoid if possible)
        "*"
    ]
}
```

**Best Practice:** Use the most specific activation events to minimize startup impact.

---

## Commands

### Registering Commands

```typescript
// Simple command
const simpleCmd = vscode.commands.registerCommand(
    'myExtension.simpleCommand',
    () => {
        vscode.window.showInformationMessage('Simple command executed!');
    }
);

// Command with arguments
const argCmd = vscode.commands.registerCommand(
    'myExtension.commandWithArgs',
    (arg1: string, arg2: number) => {
        console.log(`Args: ${arg1}, ${arg2}`);
    }
);

// Async command
const asyncCmd = vscode.commands.registerCommand(
    'myExtension.asyncCommand',
    async () => {
        const result = await someAsyncOperation();
        return result;
    }
);

// Text editor command (only when editor is active)
const editorCmd = vscode.commands.registerTextEditorCommand(
    'myExtension.editorCommand',
    (textEditor, edit, ...args) => {
        // Access to active editor and edit builder
        const selection = textEditor.selection;
        const text = textEditor.document.getText(selection);

        edit.replace(selection, text.toUpperCase());
    }
);
```

### Declaring Commands in package.json

```json
{
    "contributes": {
        "commands": [
            {
                "command": "myExtension.simpleCommand",
                "title": "Simple Command",
                "category": "My Extension",
                "icon": {
                    "light": "resources/light/icon.svg",
                    "dark": "resources/dark/icon.svg"
                },
                "enablement": "editorLangId == typescript"
            }
        ]
    }
}
```

### Executing Commands

```typescript
// Execute a VS Code command
await vscode.commands.executeCommand('editor.action.formatDocument');

// Execute with arguments
await vscode.commands.executeCommand('vscode.open', vscode.Uri.file('/path/to/file'));

// Execute your own command
await vscode.commands.executeCommand('myExtension.commandWithArgs', 'hello', 42);

// Get command result
const result = await vscode.commands.executeCommand<string>('myExtension.asyncCommand');
```

---

## User Interface Components

### Information Messages

```typescript
// Simple message
vscode.window.showInformationMessage('Hello!');
vscode.window.showWarningMessage('Warning!');
vscode.window.showErrorMessage('Error!');

// Message with actions
const selection = await vscode.window.showInformationMessage(
    'Do you want to proceed?',
    'Yes',
    'No',
    'Cancel'
);

if (selection === 'Yes') {
    // Handle yes
}

// Message with modal
const modalSelection = await vscode.window.showWarningMessage(
    'This action cannot be undone!',
    { modal: true },
    'Proceed',
    'Cancel'
);
```

### Input Box

```typescript
const input = await vscode.window.showInputBox({
    prompt: 'Enter your name',
    placeHolder: 'John Doe',
    value: 'Default Value',
    password: false,
    ignoreFocusOut: true,
    validateInput: (value) => {
        if (value.length < 3) {
            return 'Name must be at least 3 characters';
        }
        return null; // Valid
    }
});

if (input !== undefined) {
    console.log('User entered:', input);
}
```

### Quick Pick

```typescript
// Simple quick pick
const selected = await vscode.window.showQuickPick(
    ['Option 1', 'Option 2', 'Option 3'],
    {
        placeHolder: 'Select an option',
        canPickMany: false
    }
);

// Quick pick with objects
interface MyItem extends vscode.QuickPickItem {
    id: number;
}

const items: MyItem[] = [
    { label: 'Item 1', description: 'First item', detail: 'More details', id: 1 },
    { label: 'Item 2', description: 'Second item', id: 2 },
    { label: 'Item 3', description: 'Third item', picked: true, id: 3 }
];

const selectedItem = await vscode.window.showQuickPick(items, {
    placeHolder: 'Select an item',
    matchOnDescription: true,
    matchOnDetail: true
});

if (selectedItem) {
    console.log('Selected ID:', selectedItem.id);
}

// Multi-select quick pick
const multiSelected = await vscode.window.showQuickPick(items, {
    placeHolder: 'Select items',
    canPickMany: true
});
```

### Progress Notification

```typescript
await vscode.window.withProgress(
    {
        location: vscode.ProgressLocation.Notification,
        title: 'Processing...',
        cancellable: true
    },
    async (progress, token) => {
        // Check for cancellation
        token.onCancellationRequested(() => {
            console.log('User cancelled');
        });

        // Report progress
        progress.report({ increment: 0, message: 'Starting...' });

        await doWork1();
        progress.report({ increment: 50, message: 'Half done...' });

        await doWork2();
        progress.report({ increment: 50, message: 'Complete!' });
    }
);

// Status bar progress
await vscode.window.withProgress(
    {
        location: vscode.ProgressLocation.Window,
        title: 'Indexing files...'
    },
    async () => {
        await indexFiles();
    }
);
```

### Status Bar

```typescript
// Create status bar item
const statusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    100 // Priority
);

statusBarItem.text = '$(sync~spin) Syncing...';
statusBarItem.tooltip = 'Click to see details';
statusBarItem.command = 'myExtension.showDetails';
statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
statusBarItem.show();

// Update later
statusBarItem.text = '$(check) Synced';
statusBarItem.backgroundColor = undefined;

// Don't forget to dispose
context.subscriptions.push(statusBarItem);
```

### Tree View

```typescript
// Tree data provider
class MyTreeDataProvider implements vscode.TreeDataProvider<MyTreeItem> {
    private _onDidChangeTreeData = new vscode.EventEmitter<MyTreeItem | undefined>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    private data: MyTreeItem[] = [];

    refresh(): void {
        this._onDidChangeTreeData.fire(undefined);
    }

    getTreeItem(element: MyTreeItem): vscode.TreeItem {
        return element;
    }

    getChildren(element?: MyTreeItem): Thenable<MyTreeItem[]> {
        if (!element) {
            return Promise.resolve(this.data);
        }
        return Promise.resolve(element.children || []);
    }

    // Optional: parent for revealing items
    getParent(element: MyTreeItem): vscode.ProviderResult<MyTreeItem> {
        return element.parent;
    }
}

class MyTreeItem extends vscode.TreeItem {
    children?: MyTreeItem[];
    parent?: MyTreeItem;

    constructor(
        label: string,
        collapsibleState: vscode.TreeItemCollapsibleState,
        children?: MyTreeItem[]
    ) {
        super(label, collapsibleState);
        this.children = children;

        // Set additional properties
        this.tooltip = `Tooltip for ${label}`;
        this.description = 'description';
        this.iconPath = new vscode.ThemeIcon('file');
        this.contextValue = 'myTreeItem';

        // Command on click
        this.command = {
            command: 'myExtension.itemClicked',
            title: 'Item Clicked',
            arguments: [this]
        };
    }
}

// Register in package.json
// "contributes": {
//     "views": {
//         "explorer": [
//             {
//                 "id": "myExtension.treeView",
//                 "name": "My Tree View"
//             }
//         ]
//     }
// }

// Register the provider
const treeDataProvider = new MyTreeDataProvider();
const treeView = vscode.window.createTreeView('myExtension.treeView', {
    treeDataProvider,
    showCollapseAll: true,
    canSelectMany: true
});

context.subscriptions.push(treeView);
```

---

## Working with Files

### Reading Files

```typescript
// Read file content
const uri = vscode.Uri.file('/path/to/file.txt');
const content = await vscode.workspace.fs.readFile(uri);
const text = Buffer.from(content).toString('utf8');

// Read workspace file
const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
if (workspaceFolder) {
    const fileUri = vscode.Uri.joinPath(workspaceFolder.uri, 'src', 'file.ts');
    const fileContent = await vscode.workspace.fs.readFile(fileUri);
}

// Open text document
const document = await vscode.workspace.openTextDocument(uri);
const documentText = document.getText();
```

### Writing Files

```typescript
// Write file
const uri = vscode.Uri.file('/path/to/file.txt');
const content = Buffer.from('Hello, World!', 'utf8');
await vscode.workspace.fs.writeFile(uri, content);

// Create directory
const dirUri = vscode.Uri.file('/path/to/new/directory');
await vscode.workspace.fs.createDirectory(dirUri);
```

### File System Operations

```typescript
// Check if file exists
try {
    await vscode.workspace.fs.stat(uri);
    console.log('File exists');
} catch {
    console.log('File does not exist');
}

// Delete file
await vscode.workspace.fs.delete(uri, { recursive: false });

// Rename/Move file
await vscode.workspace.fs.rename(oldUri, newUri, { overwrite: false });

// Copy file
await vscode.workspace.fs.copy(sourceUri, targetUri, { overwrite: false });

// Read directory
const entries = await vscode.workspace.fs.readDirectory(dirUri);
for (const [name, type] of entries) {
    if (type === vscode.FileType.File) {
        console.log('File:', name);
    } else if (type === vscode.FileType.Directory) {
        console.log('Directory:', name);
    }
}
```

### File System Watcher

```typescript
// Watch for file changes
const watcher = vscode.workspace.createFileSystemWatcher(
    '**/*.{ts,js}',  // Glob pattern
    false,           // Ignore creates
    false,           // Ignore changes
    false            // Ignore deletes
);

watcher.onDidCreate((uri) => {
    console.log('Created:', uri.fsPath);
});

watcher.onDidChange((uri) => {
    console.log('Changed:', uri.fsPath);
});

watcher.onDidDelete((uri) => {
    console.log('Deleted:', uri.fsPath);
});

context.subscriptions.push(watcher);
```

### Working with Text Documents

```typescript
// Get active editor
const editor = vscode.window.activeTextEditor;
if (!editor) {
    return;
}

const document = editor.document;

// Document properties
const fileName = document.fileName;
const languageId = document.languageId;
const lineCount = document.lineCount;
const isDirty = document.isDirty;
const isUntitled = document.isUntitled;

// Get text
const allText = document.getText();
const lineText = document.lineAt(0).text;
const rangeText = document.getText(new vscode.Range(0, 0, 1, 10));

// Edit document
await editor.edit((editBuilder) => {
    // Insert text
    editBuilder.insert(new vscode.Position(0, 0), 'Hello\n');

    // Replace text
    editBuilder.replace(
        new vscode.Range(1, 0, 1, 5),
        'World'
    );

    // Delete text
    editBuilder.delete(new vscode.Range(2, 0, 2, 10));
});

// Save document
await document.save();
```

---

## Language Features

### Diagnostics (Problems/Errors)

```typescript
// Create diagnostic collection
const diagnosticCollection = vscode.languages.createDiagnosticCollection('myExtension');
context.subscriptions.push(diagnosticCollection);

// Add diagnostics
function updateDiagnostics(document: vscode.TextDocument): void {
    const diagnostics: vscode.Diagnostic[] = [];

    // Example: Find all TODO comments
    const text = document.getText();
    const regex = /TODO:/g;
    let match;

    while ((match = regex.exec(text)) !== null) {
        const startPos = document.positionAt(match.index);
        const endPos = document.positionAt(match.index + match[0].length);
        const range = new vscode.Range(startPos, endPos);

        const diagnostic = new vscode.Diagnostic(
            range,
            'TODO comment found',
            vscode.DiagnosticSeverity.Warning
        );

        diagnostic.code = 'TODO_FOUND';
        diagnostic.source = 'My Extension';
        diagnostic.relatedInformation = [
            new vscode.DiagnosticRelatedInformation(
                new vscode.Location(document.uri, range),
                'Consider completing this task'
            )
        ];

        diagnostics.push(diagnostic);
    }

    diagnosticCollection.set(document.uri, diagnostics);
}

// Update on document change
vscode.workspace.onDidChangeTextDocument((event) => {
    updateDiagnostics(event.document);
});
```

### Hover Provider

```typescript
class MyHoverProvider implements vscode.HoverProvider {
    provideHover(
        document: vscode.TextDocument,
        position: vscode.Position,
        token: vscode.CancellationToken
    ): vscode.ProviderResult<vscode.Hover> {
        const wordRange = document.getWordRangeAtPosition(position);
        const word = document.getText(wordRange);

        if (word === 'myKeyword') {
            const markdown = new vscode.MarkdownString();
            markdown.appendMarkdown('**myKeyword**\n\n');
            markdown.appendMarkdown('This is a special keyword.\n\n');
            markdown.appendCodeblock('const myKeyword = "value";', 'typescript');

            return new vscode.Hover(markdown, wordRange);
        }

        return null;
    }
}

// Register provider
const hoverProvider = vscode.languages.registerHoverProvider(
    { scheme: 'file', language: 'typescript' },
    new MyHoverProvider()
);
context.subscriptions.push(hoverProvider);
```

### Completion Provider

```typescript
class MyCompletionProvider implements vscode.CompletionItemProvider {
    provideCompletionItems(
        document: vscode.TextDocument,
        position: vscode.Position,
        token: vscode.CancellationToken,
        context: vscode.CompletionContext
    ): vscode.ProviderResult<vscode.CompletionItem[]> {
        const completions: vscode.CompletionItem[] = [];

        // Simple completion
        const simpleCompletion = new vscode.CompletionItem(
            'myFunction',
            vscode.CompletionItemKind.Function
        );
        simpleCompletion.detail = 'My custom function';
        simpleCompletion.documentation = new vscode.MarkdownString(
            'This function does something useful.'
        );
        completions.push(simpleCompletion);

        // Snippet completion
        const snippetCompletion = new vscode.CompletionItem(
            'mySnippet',
            vscode.CompletionItemKind.Snippet
        );
        snippetCompletion.insertText = new vscode.SnippetString(
            'function ${1:name}(${2:params}) {\n\t${0}\n}'
        );
        snippetCompletion.documentation = 'Insert a function template';
        completions.push(snippetCompletion);

        return completions;
    }

    // Optional: Resolve completion item for additional details
    resolveCompletionItem(
        item: vscode.CompletionItem,
        token: vscode.CancellationToken
    ): vscode.ProviderResult<vscode.CompletionItem> {
        // Add more details when item is selected
        item.documentation = new vscode.MarkdownString(
            '### Detailed Documentation\n\nMore info here...'
        );
        return item;
    }
}

// Register provider
const completionProvider = vscode.languages.registerCompletionItemProvider(
    { scheme: 'file', language: 'typescript' },
    new MyCompletionProvider(),
    '.'  // Trigger characters
);
context.subscriptions.push(completionProvider);
```

### Code Actions (Quick Fixes)

```typescript
class MyCodeActionProvider implements vscode.CodeActionProvider {
    public static readonly providedCodeActionKinds = [
        vscode.CodeActionKind.QuickFix,
        vscode.CodeActionKind.Refactor
    ];

    provideCodeActions(
        document: vscode.TextDocument,
        range: vscode.Range,
        context: vscode.CodeActionContext,
        token: vscode.CancellationToken
    ): vscode.ProviderResult<vscode.CodeAction[]> {
        const actions: vscode.CodeAction[] = [];

        // Quick fix for diagnostics
        for (const diagnostic of context.diagnostics) {
            if (diagnostic.code === 'TODO_FOUND') {
                const fix = new vscode.CodeAction(
                    'Remove TODO comment',
                    vscode.CodeActionKind.QuickFix
                );

                fix.edit = new vscode.WorkspaceEdit();
                fix.edit.delete(document.uri, diagnostic.range);
                fix.diagnostics = [diagnostic];
                fix.isPreferred = true;

                actions.push(fix);
            }
        }

        // Refactoring action
        const selectedText = document.getText(range);
        if (selectedText) {
            const extractAction = new vscode.CodeAction(
                'Extract to constant',
                vscode.CodeActionKind.RefactorExtract
            );

            extractAction.command = {
                command: 'myExtension.extractConstant',
                title: 'Extract to Constant',
                arguments: [document, range, selectedText]
            };

            actions.push(extractAction);
        }

        return actions;
    }
}

// Register provider
const codeActionProvider = vscode.languages.registerCodeActionsProvider(
    { scheme: 'file', language: 'typescript' },
    new MyCodeActionProvider(),
    {
        providedCodeActionKinds: MyCodeActionProvider.providedCodeActionKinds
    }
);
context.subscriptions.push(codeActionProvider);
```

### Definition Provider

```typescript
class MyDefinitionProvider implements vscode.DefinitionProvider {
    provideDefinition(
        document: vscode.TextDocument,
        position: vscode.Position,
        token: vscode.CancellationToken
    ): vscode.ProviderResult<vscode.Definition | vscode.LocationLink[]> {
        const wordRange = document.getWordRangeAtPosition(position);
        const word = document.getText(wordRange);

        // Find definition location
        const definitionUri = vscode.Uri.file('/path/to/definition.ts');
        const definitionPosition = new vscode.Position(10, 0);

        return new vscode.Location(definitionUri, definitionPosition);

        // Or return LocationLink for more control
        // return [{
        //     targetUri: definitionUri,
        //     targetRange: new vscode.Range(10, 0, 10, word.length),
        //     targetSelectionRange: new vscode.Range(10, 0, 10, word.length),
        //     originSelectionRange: wordRange
        // }];
    }
}

// Register provider
const definitionProvider = vscode.languages.registerDefinitionProvider(
    { scheme: 'file', language: 'typescript' },
    new MyDefinitionProvider()
);
context.subscriptions.push(definitionProvider);
```

---

## Webviews

Webviews allow you to create custom UI using HTML, CSS, and JavaScript:

```typescript
class MyWebviewPanel {
    public static currentPanel: MyWebviewPanel | undefined;
    private readonly _panel: vscode.WebviewPanel;
    private _disposables: vscode.Disposable[] = [];

    private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
        this._panel = panel;

        // Set HTML content
        this._panel.webview.html = this._getHtmlContent(
            this._panel.webview,
            extensionUri
        );

        // Handle messages from webview
        this._panel.webview.onDidReceiveMessage(
            (message) => {
                switch (message.command) {
                    case 'alert':
                        vscode.window.showInformationMessage(message.text);
                        return;
                    case 'getData':
                        this._panel.webview.postMessage({
                            command: 'receiveData',
                            data: { name: 'value' }
                        });
                        return;
                }
            },
            null,
            this._disposables
        );

        // Handle panel disposal
        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
    }

    public static createOrShow(extensionUri: vscode.Uri): void {
        const column = vscode.window.activeTextEditor
            ? vscode.window.activeTextEditor.viewColumn
            : undefined;

        // If panel exists, show it
        if (MyWebviewPanel.currentPanel) {
            MyWebviewPanel.currentPanel._panel.reveal(column);
            return;
        }

        // Create new panel
        const panel = vscode.window.createWebviewPanel(
            'myWebview',
            'My Webview',
            column || vscode.ViewColumn.One,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [
                    vscode.Uri.joinPath(extensionUri, 'media')
                ]
            }
        );

        MyWebviewPanel.currentPanel = new MyWebviewPanel(panel, extensionUri);
    }

    private _getHtmlContent(
        webview: vscode.Webview,
        extensionUri: vscode.Uri
    ): string {
        // Get URIs for resources
        const scriptUri = webview.asWebviewUri(
            vscode.Uri.joinPath(extensionUri, 'media', 'main.js')
        );
        const styleUri = webview.asWebviewUri(
            vscode.Uri.joinPath(extensionUri, 'media', 'style.css')
        );

        // Use nonce for security
        const nonce = this._getNonce();

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <link href="${styleUri}" rel="stylesheet">
    <title>My Webview</title>
</head>
<body>
    <h1>Hello from Webview!</h1>
    <button id="alertBtn">Show Alert</button>
    <div id="output"></div>

    <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
    }

    private _getNonce(): string {
        let text = '';
        const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        for (let i = 0; i < 32; i++) {
            text += possible.charAt(Math.floor(Math.random() * possible.length));
        }
        return text;
    }

    public dispose(): void {
        MyWebviewPanel.currentPanel = undefined;
        this._panel.dispose();
        while (this._disposables.length) {
            const d = this._disposables.pop();
            if (d) {
                d.dispose();
            }
        }
    }
}
```

**Webview JavaScript (media/main.js):**

```javascript
(function () {
    const vscode = acquireVsCodeApi();

    // Handle button click
    document.getElementById('alertBtn').addEventListener('click', () => {
        vscode.postMessage({
            command: 'alert',
            text: 'Hello from webview!'
        });
    });

    // Handle messages from extension
    window.addEventListener('message', (event) => {
        const message = event.data;
        switch (message.command) {
            case 'receiveData':
                document.getElementById('output').textContent =
                    JSON.stringify(message.data);
                break;
        }
    });

    // Persist state
    const previousState = vscode.getState();
    if (previousState) {
        // Restore previous state
    }

    // Save state
    vscode.setState({ someData: 'value' });
})();
```

---

## State Management

### Global State (Persists across sessions)

```typescript
// Store global state
await context.globalState.update('myKey', { data: 'value' });

// Retrieve global state
const value = context.globalState.get<{ data: string }>('myKey');

// Set keys for sync (synced across devices if user enabled Settings Sync)
context.globalState.setKeysForSync(['myKey']);
```

### Workspace State (Per workspace)

```typescript
// Store workspace state
await context.workspaceState.update('workspaceKey', { setting: true });

// Retrieve workspace state
const workspaceValue = context.workspaceState.get<{ setting: boolean }>('workspaceKey');
```

### Secret Storage (For sensitive data)

```typescript
// Store secret
await context.secrets.store('apiToken', 'secret-token-value');

// Retrieve secret
const token = await context.secrets.get('apiToken');

// Delete secret
await context.secrets.delete('apiToken');

// Listen for changes
context.secrets.onDidChange((e) => {
    console.log('Secret changed:', e.key);
});
```

### Configuration

```typescript
// Read configuration
const config = vscode.workspace.getConfiguration('myExtension');
const setting = config.get<string>('mySetting', 'default');
const nested = config.get<number>('category.subSetting');

// Update configuration
await config.update('mySetting', 'newValue', vscode.ConfigurationTarget.Global);
await config.update('mySetting', 'workspaceValue', vscode.ConfigurationTarget.Workspace);

// Listen for changes
vscode.workspace.onDidChangeConfiguration((e) => {
    if (e.affectsConfiguration('myExtension.mySetting')) {
        const newValue = config.get<string>('mySetting');
        console.log('Setting changed to:', newValue);
    }
});
```

**Declare configuration in package.json:**

```json
{
    "contributes": {
        "configuration": {
            "title": "My Extension",
            "properties": {
                "myExtension.mySetting": {
                    "type": "string",
                    "default": "defaultValue",
                    "description": "Description of the setting"
                },
                "myExtension.enableFeature": {
                    "type": "boolean",
                    "default": true,
                    "description": "Enable or disable feature"
                },
                "myExtension.maxItems": {
                    "type": "number",
                    "default": 10,
                    "minimum": 1,
                    "maximum": 100,
                    "description": "Maximum number of items"
                },
                "myExtension.mode": {
                    "type": "string",
                    "enum": ["fast", "normal", "thorough"],
                    "default": "normal",
                    "enumDescriptions": [
                        "Fast mode with minimal checks",
                        "Normal mode with standard checks",
                        "Thorough mode with comprehensive checks"
                    ]
                }
            }
        }
    }
}
```

---

## Testing

### Test Setup

**File:** `src/test/runTest.ts`

```typescript
import * as path from 'path';
import { runTests } from '@vscode/test-electron';

async function main() {
    try {
        const extensionDevelopmentPath = path.resolve(__dirname, '../../');
        const extensionTestsPath = path.resolve(__dirname, './suite/index');

        await runTests({
            extensionDevelopmentPath,
            extensionTestsPath,
            launchArgs: [
                '--disable-extensions' // Disable other extensions during tests
            ]
        });
    } catch (err) {
        console.error('Failed to run tests');
        process.exit(1);
    }
}

main();
```

**File:** `src/test/suite/index.ts`

```typescript
import * as path from 'path';
import * as Mocha from 'mocha';
import * as glob from 'glob';

export function run(): Promise<void> {
    const mocha = new Mocha({
        ui: 'tdd',
        color: true,
        timeout: 10000
    });

    const testsRoot = path.resolve(__dirname, '..');

    return new Promise((resolve, reject) => {
        glob('**/**.test.js', { cwd: testsRoot }, (err, files) => {
            if (err) {
                return reject(err);
            }

            files.forEach((f) => mocha.addFile(path.resolve(testsRoot, f)));

            try {
                mocha.run((failures) => {
                    if (failures > 0) {
                        reject(new Error(`${failures} tests failed.`));
                    } else {
                        resolve();
                    }
                });
            } catch (err) {
                reject(err);
            }
        });
    });
}
```

### Writing Tests

**File:** `src/test/suite/extension.test.ts`

```typescript
import * as assert from 'assert';
import * as vscode from 'vscode';

suite('Extension Test Suite', () => {
    vscode.window.showInformationMessage('Start all tests.');

    test('Extension should be present', () => {
        assert.ok(vscode.extensions.getExtension('publisher.my-extension'));
    });

    test('Extension should activate', async () => {
        const extension = vscode.extensions.getExtension('publisher.my-extension');
        await extension?.activate();
        assert.ok(extension?.isActive);
    });

    test('Command should be registered', async () => {
        const commands = await vscode.commands.getCommands(true);
        assert.ok(commands.includes('myExtension.helloWorld'));
    });

    test('Configuration should have default values', () => {
        const config = vscode.workspace.getConfiguration('myExtension');
        assert.strictEqual(config.get('mySetting'), 'defaultValue');
    });

    test('Document operations', async () => {
        // Create a new document
        const document = await vscode.workspace.openTextDocument({
            content: 'Hello, World!',
            language: 'plaintext'
        });

        assert.strictEqual(document.getText(), 'Hello, World!');

        // Show the document
        const editor = await vscode.window.showTextDocument(document);
        assert.ok(editor);

        // Edit the document
        await editor.edit((editBuilder) => {
            editBuilder.insert(new vscode.Position(0, 0), 'Test: ');
        });

        assert.strictEqual(document.getText(), 'Test: Hello, World!');
    });
});
```

### Running Tests

```bash
# Run tests
npm test

# Or with VS Code launch configuration
# Press F5 with "Extension Tests" configuration selected
```

---

## Debugging

### Launch Configuration

**File:** `.vscode/launch.json`

```json
{
    "version": "0.2.0",
    "configurations": [
        {
            "name": "Run Extension",
            "type": "extensionHost",
            "request": "launch",
            "args": [
                "--extensionDevelopmentPath=${workspaceFolder}"
            ],
            "outFiles": [
                "${workspaceFolder}/out/**/*.js"
            ],
            "preLaunchTask": "${defaultBuildTask}"
        },
        {
            "name": "Extension Tests",
            "type": "extensionHost",
            "request": "launch",
            "args": [
                "--extensionDevelopmentPath=${workspaceFolder}",
                "--extensionTestsPath=${workspaceFolder}/out/test/suite/index"
            ],
            "outFiles": [
                "${workspaceFolder}/out/test/**/*.js"
            ],
            "preLaunchTask": "${defaultBuildTask}"
        }
    ]
}
```

### Debugging Tips

```typescript
// Console output (visible in Debug Console)
console.log('Debug message');
console.error('Error message');

// Output channel (visible in Output panel)
const outputChannel = vscode.window.createOutputChannel('My Extension');
outputChannel.appendLine('Log message');
outputChannel.show(); // Show the output panel

// Developer Tools
// Help > Toggle Developer Tools (in Extension Development Host)
```

---

## Publishing

### Prepare for Publishing

1. **Update package.json:**
   - Ensure `publisher` is set correctly
   - Update `version`
   - Add `icon`, `repository`, `license`
   - Write a good `description`

2. **Create .vscodeignore:**

```
.vscode/**
.vscode-test/**
src/**
.gitignore
.yarnrc
vsc-extension-quickstart.md
**/tsconfig.json
**/.eslintrc.json
**/*.map
**/*.ts
node_modules/**
```

3. **Update README.md** with:
   - Features description
   - Installation instructions
   - Usage examples
   - Screenshots/GIFs
   - Configuration options
   - Known issues

### Create Publisher Account

```bash
# Create account at https://marketplace.visualstudio.com/manage

# Create Personal Access Token (PAT):
# 1. Go to https://dev.azure.com
# 2. User Settings > Personal Access Tokens
# 3. Create token with "Marketplace (Manage)" scope

# Login with vsce
vsce login <publisher-name>
```

### Package and Publish

```bash
# Package extension
vsce package

# This creates: my-extension-1.0.0.vsix

# Publish to marketplace
vsce publish

# Publish with version bump
vsce publish patch  # 1.0.0 -> 1.0.1
vsce publish minor  # 1.0.0 -> 1.1.0
vsce publish major  # 1.0.0 -> 2.0.0

# Publish specific version
vsce publish 1.2.3
```

### CI/CD Publishing

**File:** `.github/workflows/publish.yml`

```yaml
name: Publish Extension

on:
  release:
    types: [published]

jobs:
  publish:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '18'

      - name: Install dependencies
        run: npm ci

      - name: Publish to VS Code Marketplace
        run: npx vsce publish -p ${{ secrets.VSCE_PAT }}

      - name: Publish to Open VSX Registry
        run: npx ovsx publish -p ${{ secrets.OVSX_PAT }}
```

---

## Best Practices

### Performance

```typescript
// 1. Use lazy activation
// Don't use "*" activation event

// 2. Defer expensive operations
setTimeout(() => {
    // Non-critical initialization
}, 1000);

// 3. Use caching
const cache = new Map<string, any>();

function getCachedData(key: string): any {
    if (!cache.has(key)) {
        cache.set(key, computeExpensiveData(key));
    }
    return cache.get(key);
}

// 4. Debounce frequent operations
function debounce<T extends (...args: any[]) => any>(
    func: T,
    wait: number
): (...args: Parameters<T>) => void {
    let timeout: NodeJS.Timeout | null = null;

    return (...args: Parameters<T>) => {
        if (timeout) {
            clearTimeout(timeout);
        }
        timeout = setTimeout(() => func(...args), wait);
    };
}

const debouncedAnalyze = debounce(analyzeDocument, 500);

// 5. Cancel previous operations
let currentOperation: vscode.CancellationTokenSource | null = null;

async function startOperation(): Promise<void> {
    // Cancel previous
    if (currentOperation) {
        currentOperation.cancel();
    }

    currentOperation = new vscode.CancellationTokenSource();
    const token = currentOperation.token;

    try {
        await longRunningOperation(token);
    } finally {
        if (currentOperation) {
            currentOperation.dispose();
            currentOperation = null;
        }
    }
}
```

### Error Handling

```typescript
// 1. Always handle errors gracefully
try {
    await riskyOperation();
} catch (error) {
    if (error instanceof vscode.CancellationError) {
        // User cancelled, don't show error
        return;
    }

    const message = error instanceof Error ? error.message : 'Unknown error';
    vscode.window.showErrorMessage(`Operation failed: ${message}`);

    // Log for debugging
    console.error('Operation failed:', error);
}

// 2. Validate inputs
function processFile(uri: vscode.Uri | undefined): void {
    if (!uri) {
        vscode.window.showWarningMessage('No file selected');
        return;
    }

    // Continue with valid uri
}

// 3. Provide meaningful error messages
function validateConfig(config: unknown): config is ValidConfig {
    if (typeof config !== 'object' || config === null) {
        throw new Error('Configuration must be an object');
    }

    if (!('apiKey' in config)) {
        throw new Error('Configuration missing required field: apiKey');
    }

    return true;
}
```

### Code Organization

```typescript
// 1. Separate concerns into modules
// src/commands/analyze.ts
export function registerAnalyzeCommand(context: vscode.ExtensionContext): void {
    const command = vscode.commands.registerCommand('ext.analyze', analyze);
    context.subscriptions.push(command);
}

// src/providers/hover.ts
export function registerHoverProvider(context: vscode.ExtensionContext): void {
    const provider = vscode.languages.registerHoverProvider('typescript', new MyHoverProvider());
    context.subscriptions.push(provider);
}

// src/extension.ts
import { registerAnalyzeCommand } from './commands/analyze';
import { registerHoverProvider } from './providers/hover';

export function activate(context: vscode.ExtensionContext): void {
    registerAnalyzeCommand(context);
    registerHoverProvider(context);
}

// 2. Use dependency injection
class AnalysisService {
    constructor(
        private readonly outputChannel: vscode.OutputChannel,
        private readonly diagnosticCollection: vscode.DiagnosticCollection
    ) {}
}

// 3. Define interfaces for complex objects
interface AnalysisResult {
    issues: Issue[];
    metrics: Metrics;
}

interface Issue {
    line: number;
    message: string;
    severity: 'error' | 'warning' | 'info';
}
```

---

## Security Considerations

### Content Security Policy for Webviews

```typescript
// Always use CSP in webviews
const nonce = getNonce();
const csp = `
    default-src 'none';
    style-src ${webview.cspSource} 'unsafe-inline';
    script-src 'nonce-${nonce}';
    img-src ${webview.cspSource} https: data:;
    font-src ${webview.cspSource};
`;
```

### Secure Storage

```typescript
// Never store sensitive data in globalState or workspaceState
// Use SecretStorage instead
await context.secrets.store('apiKey', sensitiveValue);

// Never log sensitive data
console.log('API Key:', apiKey); // BAD!
console.log('API Key configured:', !!apiKey); // Good
```

### Input Validation

```typescript
// Validate all user inputs
function validateInput(input: string): boolean {
    // Check length
    if (input.length > 1000) {
        return false;
    }

    // Check for dangerous patterns
    if (input.includes('..') || input.includes('\0')) {
        return false;
    }

    return true;
}

// Sanitize file paths
function sanitizePath(userPath: string): string {
    return userPath
        .replace(/\.\./g, '')
        .replace(/[<>:"|?*]/g, '');
}
```

### External Requests

```typescript
// Use HTTPS for external requests
async function fetchData(url: string): Promise<any> {
    const parsedUrl = new URL(url);

    if (parsedUrl.protocol !== 'https:') {
        throw new Error('Only HTTPS connections are allowed');
    }

    // Use allowlist for domains
    const allowedDomains = ['api.example.com', 'cdn.example.com'];
    if (!allowedDomains.includes(parsedUrl.hostname)) {
        throw new Error('Domain not allowed');
    }

    return fetch(url);
}
```

---

## Resources

### Official Documentation
- [VS Code Extension API](https://code.visualstudio.com/api)
- [Extension Guidelines](https://code.visualstudio.com/api/references/extension-guidelines)
- [Extension Manifest](https://code.visualstudio.com/api/references/extension-manifest)
- [Contribution Points](https://code.visualstudio.com/api/references/contribution-points)

### Samples and Examples
- [VS Code Extension Samples](https://github.com/microsoft/vscode-extension-samples)
- [Extension API Playground](https://github.com/nicolo-ribaudo/vscode-extension-api-playground)

### Tools
- [VSCE - Publishing Tool](https://github.com/microsoft/vscode-vsce)
- [Yeoman Generator](https://github.com/Microsoft/vscode-generator-code)
- [Extension Test CLI](https://github.com/microsoft/vscode-test)

### Community
- [VS Code GitHub Discussions](https://github.com/microsoft/vscode-discussions)
- [Stack Overflow - vscode-extensions tag](https://stackoverflow.com/questions/tagged/vscode-extensions)

---

*Version: 1.0.0 | Last Updated: December 2025*
