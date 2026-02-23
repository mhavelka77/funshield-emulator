# Phase 3: Code Editor Upgrade (CodeMirror 6)

**Effort:** 1-2 days | **Blocks launch:** No | **Status: DONE**

## Checklist

- [x] **P3.1** Install CodeMirror 6 dependencies
  - @codemirror/view, @codemirror/state, @codemirror/lang-cpp
  - @codemirror/theme-one-dark
  - @codemirror/commands, @codemirror/search, @codemirror/autocomplete, @codemirror/lint
  - Bundled via Vite

- [x] **P3.2** Replace textarea with CodeMirror editor
  - src/editor.js: initEditor() creates EditorView
  - src/main.js: entry point loads CodeMirror and injects into App
  - C++ language support via @codemirror/lang-cpp
  - One Dark theme matches existing dark UI
  - Custom theme adjustments for font, sizing
  - Textarea hidden when CodeMirror loads (graceful fallback)

- [x] **P3.3** Wire compiler errors to editor diagnostics
  - setErrors() maps error line numbers to CodeMirror diagnostics (red squiggles)
  - setWarnings() maps warnings as well
  - clearErrors() on new compile and example load
  - Uses @codemirror/lint setDiagnostics API

- [x] **P3.4** Add editor features
  - Line numbers
  - Bracket matching
  - Auto-indent (indentOnInput)
  - Close brackets
  - Code folding
  - Search/replace (Ctrl+F via searchKeymap)
  - Undo/redo (history + historyKeymap)
  - Keyboard shortcut: Ctrl+Enter to compile
  - Tab inserts indentation (indentWithTab)
  - Active line highlight

- [x] **P3.5** Preserve example loading
  - App.setEditor() allows CodeMirror to replace textarea API
  - Example select uses editor.setValue() to replace content
  - editor.clearErrors() on example load

## Verification

```bash
node tests.js          # 97 pass, 0 fail (tests are Node-only, unaffected by UI changes)
node scripts/verify.js # 31 checks, all green
npm run build          # Vite build succeeds
```

Manual browser test: `npm run dev`, load each example, edit code, compile, verify errors show inline.
