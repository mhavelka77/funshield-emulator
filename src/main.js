/**
 * Entry point for CodeMirror integration.
 * Loaded as <script type="module"> after app.js.
 * Initializes CodeMirror and injects it into the App.
 */

import { initEditor } from './editor.js';

// Wait for DOM to be ready (should already be since we use defer or are at bottom)
const textarea = document.getElementById('code-editor');
if (textarea && typeof App !== 'undefined') {
    const editorApi = initEditor(textarea, () => {
        App.compile();
    });
    App.setEditor(editorApi);
}
