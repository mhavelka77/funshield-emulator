#!/usr/bin/env node

/**
 * Project Health Check Script
 * 
 * Runs a series of checks to verify the project is in a good state:
 * 1. All tests pass
 * 2. All source files exist and are non-empty
 * 3. No obvious syntax errors in JS files
 * 4. Examples array is populated
 * 5. All required exports/globals are present
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
let passed = 0;
let failed = 0;
const errors = [];

function check(name, fn) {
    try {
        fn();
        console.log(`  PASS  ${name}`);
        passed++;
    } catch (e) {
        console.log(`  FAIL  ${name}`);
        console.log(`        ${e.message}`);
        errors.push({ name, error: e.message });
        failed++;
    }
}

function assert(condition, message) {
    if (!condition) throw new Error(message);
}

// ─── 1. Run tests ────────────────────────────────────────────────────────────

console.log('\n--- Running test suite ---');
check('node tests.js passes', () => {
    try {
        const output = execSync('node tests.js', { cwd: ROOT, encoding: 'utf-8', timeout: 30000 });
        assert(output.includes('0 failed'), `Tests had failures:\n${output.slice(-200)}`);
    } catch (e) {
        throw new Error(`Test suite crashed: ${e.message}`);
    }
});

// ─── 2. Source files exist and are non-empty ─────────────────────────────────

console.log('\n--- Checking source files ---');
const requiredFiles = [
    'index.html',
    'style.css',
    'transpiler.js',
    'arduino-api.js',
    'emulator.js',
    'app.js',
    'examples.js',
    'tests.js',
    'package.json',
    'AGENTS.md',
];

for (const file of requiredFiles) {
    check(`${file} exists and is non-empty`, () => {
        const fullPath = path.join(ROOT, file);
        assert(fs.existsSync(fullPath), `File not found: ${file}`);
        const stat = fs.statSync(fullPath);
        assert(stat.size > 0, `File is empty: ${file}`);
    });
}

// ─── 3. JS files parse without syntax errors ────────────────────────────────

console.log('\n--- Checking JS syntax ---');
const jsFiles = ['transpiler.js', 'arduino-api.js', 'emulator.js', 'app.js', 'examples.js'];

for (const file of jsFiles) {
    check(`${file} has valid JS syntax`, () => {
        const fullPath = path.join(ROOT, file);
        const content = fs.readFileSync(fullPath, 'utf-8');
        // Try to parse as a function body (since these are scripts, not modules)
        try {
            new Function(content);
        } catch (e) {
            // Some files use browser globals (document, window) which won't exist in Node
            // But syntax errors will still be caught
            if (e instanceof SyntaxError) {
                throw new Error(`Syntax error in ${file}: ${e.message}`);
            }
            // ReferenceErrors etc. are fine — those mean the syntax parsed OK
        }
    });
}

// ─── 4. Key patterns present in source ──────────────────────────────────────

console.log('\n--- Checking key patterns ---');

check('transpiler.js exports ArduinoTranspiler', () => {
    const content = fs.readFileSync(path.join(ROOT, 'transpiler.js'), 'utf-8');
    assert(
        content.includes('ArduinoTranspiler') || content.includes('arduinoTranspiler'),
        'ArduinoTranspiler not found in transpiler.js'
    );
});

check('arduino-api.js exports ArduinoAPI', () => {
    const content = fs.readFileSync(path.join(ROOT, 'arduino-api.js'), 'utf-8');
    assert(
        content.includes('ArduinoAPI') || content.includes('arduinoAPI'),
        'ArduinoAPI not found in arduino-api.js'
    );
});

check('emulator.js exports Emulator', () => {
    const content = fs.readFileSync(path.join(ROOT, 'emulator.js'), 'utf-8');
    assert(
        content.includes('Emulator'),
        'Emulator not found in emulator.js'
    );
});

check('examples.js has at least 6 examples', () => {
    const content = fs.readFileSync(path.join(ROOT, 'examples.js'), 'utf-8');
    // Examples is an object with named properties containing template literals
    // Count top-level property assignments (e.g., "blink: `", "counter: `")
    const matches = content.match(/^\s+\w+:\s*`/gm) || [];
    assert(matches.length >= 6, `Only found ${matches.length} examples, expected at least 6`);
});

check('index.html loads all required scripts', () => {
    const content = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf-8');
    for (const file of ['transpiler.js', 'arduino-api.js', 'emulator.js', 'app.js', 'examples.js']) {
        assert(content.includes(file), `index.html doesn't load ${file}`);
    }
});

// ─── 5. Documentation files exist ───────────────────────────────────────────

console.log('\n--- Checking documentation ---');

check('AGENTS.md exists', () => {
    assert(fs.existsSync(path.join(ROOT, 'AGENTS.md')), 'AGENTS.md not found');
});

check('PLAN.md exists', () => {
    assert(fs.existsSync(path.join(ROOT, 'PLAN.md')), 'PLAN.md not found');
});

check('ARCHITECTURE.md exists', () => {
    assert(fs.existsSync(path.join(ROOT, 'ARCHITECTURE.md')), 'ARCHITECTURE.md not found');
});

// ─── 6. Task files exist ────────────────────────────────────────────────────

console.log('\n--- Checking task files ---');

for (let i = 1; i <= 7; i++) {
    check(`tasks/phase${i}.md exists`, () => {
        const taskPath = path.join(ROOT, 'tasks', `phase${i}.md`);
        assert(fs.existsSync(taskPath), `tasks/phase${i}.md not found`);
    });
}

// ─── Results ─────────────────────────────────────────────────────────────────

console.log('\n' + '='.repeat(60));
console.log(`HEALTH CHECK: ${passed} passed, ${failed} failed, ${passed + failed} total`);
console.log('='.repeat(60));

if (failed > 0) {
    console.log('\nFailed checks:');
    for (const { name, error } of errors) {
        console.log(`  - ${name}: ${error}`);
    }
    process.exit(1);
} else {
    console.log('\nAll checks passed!');
    process.exit(0);
}
