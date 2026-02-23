/**
 * CodeMirror 6 Editor Integration
 * 
 * Replaces the plain <textarea> with a CodeMirror editor providing:
 * - C++ syntax highlighting
 * - Line numbers
 * - Bracket matching
 * - Auto-indent
 * - Search/replace (Ctrl+F)
 * - Dark theme matching the app
 * - Error diagnostics (red squiggles on compiler errors)
 * - Ctrl+Enter to compile
 */

import { EditorView, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter, drawSelection, rectangularSelection } from '@codemirror/view';
import { EditorState } from '@codemirror/state';
import { cpp } from '@codemirror/lang-cpp';
import { oneDark } from '@codemirror/theme-one-dark';
import { defaultKeymap, indentWithTab, history, historyKeymap, undo, redo } from '@codemirror/commands';
import { searchKeymap, highlightSelectionMatches } from '@codemirror/search';
import { bracketMatching, indentOnInput, foldGutter, foldKeymap } from '@codemirror/language';
import { setDiagnostics } from '@codemirror/lint';
import { closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete';

// Custom theme adjustments to match our dark UI
const customTheme = EditorView.theme({
    '&': {
        fontSize: '14px',
        height: '100%',
    },
    '.cm-scroller': {
        fontFamily: '"Fira Code", "Cascadia Code", "JetBrains Mono", "Consolas", monospace',
        overflow: 'auto',
    },
    '.cm-content': {
        caretColor: '#528bff',
    },
    '.cm-gutters': {
        minWidth: '40px',
    },
    '&.cm-focused': {
        outline: 'none',
    },
});

let editorView = null;
let compileCallback = null;

/**
 * Initialize CodeMirror editor, replacing the textarea.
 * @param {HTMLTextAreaElement} textarea - The textarea element to replace
 * @param {Function} onCompile - Callback when user presses Ctrl+Enter
 * @returns {object} Editor API: { getValue, setValue, setErrors, clearErrors, focus }
 */
export function initEditor(textarea, onCompile) {
    compileCallback = onCompile;

    const initialCode = textarea.value;
    const parent = textarea.parentElement;

    // Create editor container
    const editorContainer = document.createElement('div');
    editorContainer.id = 'cm-editor-container';

    const compileKeymap = keymap.of([{
        key: 'Ctrl-Enter',
        mac: 'Cmd-Enter',
        run: () => {
            if (compileCallback) compileCallback();
            return true;
        },
    }]);

    const state = EditorState.create({
        doc: initialCode,
        extensions: [
            lineNumbers(),
            highlightActiveLineGutter(),
            highlightActiveLine(),
            drawSelection(),
            rectangularSelection(),
            indentOnInput(),
            bracketMatching(),
            closeBrackets(),
            foldGutter(),
            history(),
            highlightSelectionMatches(),
            cpp(),
            oneDark,
            customTheme,
            compileKeymap,
            keymap.of([
                indentWithTab,
                ...closeBracketsKeymap,
                ...defaultKeymap,
                ...searchKeymap,
                ...historyKeymap,
                ...foldKeymap,
            ]),
            EditorView.lineWrapping,
        ],
    });

    editorView = new EditorView({
        state,
        parent: editorContainer,
    });

    // Replace textarea with CodeMirror
    textarea.style.display = 'none';
    parent.insertBefore(editorContainer, textarea.nextSibling);

    return {
        getValue() {
            return editorView.state.doc.toString();
        },
        setValue(code) {
            editorView.dispatch({
                changes: {
                    from: 0,
                    to: editorView.state.doc.length,
                    insert: code,
                },
            });
        },
        setErrors(errors) {
            // errors: array of { line: number, message: string }
            const diagnostics = errors
                .filter(e => e.line > 0)
                .map(e => {
                    const line = Math.min(e.line, editorView.state.doc.lines);
                    const lineObj = editorView.state.doc.line(line);
                    return {
                        from: lineObj.from,
                        to: lineObj.to,
                        severity: 'error',
                        message: e.message,
                    };
                });
            editorView.dispatch(setDiagnostics(editorView.state, diagnostics));
        },
        setWarnings(warnings) {
            const diagnostics = warnings
                .filter(w => w.line > 0)
                .map(w => {
                    const line = Math.min(w.line, editorView.state.doc.lines);
                    const lineObj = editorView.state.doc.line(line);
                    return {
                        from: lineObj.from,
                        to: lineObj.to,
                        severity: 'warning',
                        message: w.message,
                    };
                });
            editorView.dispatch(setDiagnostics(editorView.state, diagnostics));
        },
        clearErrors() {
            editorView.dispatch(setDiagnostics(editorView.state, []));
        },
        focus() {
            editorView.focus();
        },
        getView() {
            return editorView;
        },
    };
}
