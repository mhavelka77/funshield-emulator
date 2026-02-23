import { defineConfig } from 'vite';
import { resolve } from 'path';
import { readFileSync } from 'fs';

const __dirname = import.meta.dirname;

/**
 * Custom Vite plugin that inlines the non-module scripts into index.html
 * during build. This avoids the need to convert them to ES modules while
 * still producing a single bundled output.
 * 
 * In dev mode, the <script> tags work as-is (Vite serves the files).
 * In build mode, we inline them into <script> blocks in the HTML.
 */
function inlineScriptsPlugin() {
    const scriptsToInline = [
        'transpiler.js',
        'arduino-api.js',
        'emulator.js',
        'examples.js',
        'app.js',
    ];

    return {
        name: 'inline-non-module-scripts',
        enforce: 'pre',
        transformIndexHtml: {
            order: 'pre',
            handler(html) {
                for (const scriptFile of scriptsToInline) {
                    const tag = `<script src="${scriptFile}"></script>`;
                    if (html.includes(tag)) {
                        try {
                            const content = readFileSync(resolve(__dirname, scriptFile), 'utf-8');
                            html = html.replace(tag, `<script>\n${content}\n</script>`);
                        } catch (e) {
                            console.warn(`Warning: Could not inline ${scriptFile}: ${e.message}`);
                        }
                    }
                }
                return html;
            },
        },
    };
}

export default defineConfig({
    root: '.',

    // For GitHub Pages, set base to './' for relative paths
    // This works for both root deployment and subdirectory deployment
    base: './',

    build: {
        outDir: 'dist',
        emptyOutDir: true,
        sourcemap: true,
    },

    server: {
        port: 3000,
        open: true,
    },

    plugins: [
        inlineScriptsPlugin(),
    ],
});
