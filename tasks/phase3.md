# Phase 3: Code Editor Upgrade (CodeMirror 6)

**Effort:** 1-2 days | **Blocks launch:** No

## Checklist

- [ ] **P3.1** Install CodeMirror 6 dependencies
  - @codemirror/view, @codemirror/state, @codemirror/lang-cpp
  - @codemirror/theme-one-dark (or custom dark theme)
  - Bundle via Vite or load from CDN for POC

- [ ] **P3.2** Replace textarea with CodeMirror editor
  - Initialize EditorView in app.js
  - Load C++ language support
  - Match existing dark theme colors
  - Preserve: get/set code content, focus management

- [ ] **P3.3** Wire compiler errors to editor diagnostics
  - Use @codemirror/lint for error/warning markers
  - Show red squiggles on error lines
  - Show error message on hover
  - Clear diagnostics on new compile

- [ ] **P3.4** Add editor features
  - Line numbers
  - Bracket matching
  - Auto-indent
  - Search/replace (Ctrl+F)
  - Undo/redo
  - Keyboard shortcuts (Ctrl+Enter to compile)

- [ ] **P3.5** Preserve example loading
  - When user clicks an example, replace editor content
  - Scroll to top after loading

## Verification

```bash
node tests.js          # Tests should still pass (editor is UI-only)
node scripts/verify.js
```

Manual browser test: load each example, edit code, compile, verify errors show inline.
