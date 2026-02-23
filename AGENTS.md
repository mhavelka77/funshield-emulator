# Agent Handoff Specification

> This file is the single entry point for any agent picking up this project.
> Read this FIRST. It contains everything you need to understand, test, and
> extend the codebase.

## What This Is

A browser-based emulator for Arduino Uno + FunShield shield. Users write
Arduino C++ in a CodeMirror 6 editor, click "Compile & Upload", and see the
hardware respond visually: 4 LEDs, 3 buttons, a 4-digit 7-segment display,
a trimmer potentiometer, a buzzer, and a serial monitor.

Built for the NSWI170 Computer Systems course at Charles University (Prague).
Course website: https://teaching.ms.mff.cuni.cz/nswi170-web/pages/labs/

## Current State: Phases 1-6 Complete (Launch Ready)

- 97/97 tests pass (`node tests.js`)
- 31/31 health checks pass (`node scripts/verify.js`)
- All 6 lab examples compile and execute correctly
- Vite build produces optimized `dist/` output (~620KB total, ~185KB gzipped)
- GitHub Actions CI: tests → build → deploy to GitHub Pages on push to main
- CodeMirror 6 editor with C++ syntax highlighting and error diagnostics
- Execution controls: speed slider, pause/resume, step mode, loop counter, millis clock
- Buzzer visual indicator with animation
- Mobile responsive layout

## How to Work With This Project

```bash
# Run tests (ALWAYS run after any change)
node tests.js

# Run full project health check
node scripts/verify.js

# Development server (hot reload)
npm run dev

# Production build
npm run build

# Preview production build
npm run preview

# The app also works by opening index.html directly (without CodeMirror)
```

## File Map

```
index.html           — Single-page app, loads source files via <script> tags
style.css            — All styling, dark theme, board visualization, responsive
transpiler.js        — C++ → JS AST-based transpiler (lexer → parser → codegen)
transpiler-legacy.js — Old regex-based transpiler (archived for reference)
arduino-api.js       — Arduino function implementations + FunShield hardware state
emulator.js          — Execution engine: compile → setup() → loop() cycle
app.js               — UI controller: wires DOM to emulator + hardware callbacks
examples.js          — 6 example programs (Labs 2-6 + test sample)
tests.js             — 97-test suite covering transpiler + execution + API

src/
  editor.js          — CodeMirror 6 integration (syntax highlight, diagnostics)
  main.js            — Module entry point (loads CodeMirror, injects into App)

.github/workflows/
  ci.yml             — GitHub Actions: test → build → deploy to Pages

vite.config.js       — Vite build config with custom inline plugin
package.json         — npm project config and scripts
scripts/verify.js    — 31-check health check script

PLAN.md              — Full production plan with 7 phases
ARCHITECTURE.md      — Detailed internals, data flow
tasks/               — One file per phase with atomic checklist items
```

## Execution Pipeline (How Code Runs)

```
User's C++ code
  → transpiler.js (AST-based):
    → Preprocess: #include → strip, #define → inline expansion
    → Tokenize: lexer produces typed token stream
    → Parse: recursive descent → AST (with error recovery)
    → Generate: AST → JavaScript (type-aware integer division)
  → emulator.js: wraps transpiled JS in new Function() with Arduino API as params
  → Calls setup() once
  → Calls loop() N times per requestAnimationFrame (N scales with speed setting)
  → Arduino API calls (digitalWrite, shiftOut, etc.) update hardware state
  → Hardware state changes fire callbacks → app.js updates DOM
```

## Architecture: Dual-Mode File Loading

The source files (transpiler.js, arduino-api.js, emulator.js, examples.js, app.js) use
IIFE/global variable patterns. This allows:

- **Browser direct**: Load via `<script>` tags, globals are available
- **Node.js tests**: `require()` in tests.js (transpiler.js has module.exports)
- **Vite dev**: Vite serves files as-is, `<script type="module" src="src/main.js">` loads CodeMirror
- **Vite build**: Custom plugin inlines the IIFE scripts into HTML, Vite bundles the ES module (CodeMirror)

The CodeMirror editor is loaded as an ES module (`src/main.js` → `src/editor.js`).
It calls `App.setEditor(editorApi)` to inject itself into the app. If CodeMirror
fails to load (e.g., opening index.html directly without Vite), the textarea fallback works.

## The FunShield Hardware Model

```
7-Segment Display (4 digits):
  - Controlled via 74HC595 shift register
  - Protocol: latch LOW → shiftOut(segmentData) → shiftOut(digitSelect) → latch HIGH
  - segmentData: active-LOW glyph byte (bit 0=a, 1=b, ... 6=g, 7=dp)
  - digitSelect: one-hot position (0x01=pos0, 0x02=pos1, 0x04=pos2, 0x08=pos3)
  - Multiplexed: code lights one digit at a time, fast switching creates illusion

4 LEDs: pins 13,12,11,10 — active LOW (LOW=on, HIGH=off)
3 Buttons: pins A1,A2,A3 — active LOW (pressed=LOW, released=HIGH)
Trimmer: pin A0 — analog 0-1023
Buzzer: pin 3 — active LOW (tone/noTone, visual indicator with frequency display)
```

## Known Limitations (By Design)

- **`delay()` is a no-op.** The course prohibits it, so this is intentional.
  Phase 7 (Web Worker) could implement real delay.

- **`new Function()` requires `unsafe-eval` CSP.** GitHub Pages doesn't enforce
  strict CSP, so this works. Phase 7 (Web Worker) would fix this for strict
  CSP environments.

- **`randomSeed()` is a no-op.** JS `Math.random()` can't be seeded.

## Implementation Phases (see tasks/ for details)

| Phase | Summary | Status |
|-------|---------|--------|
| P1 | Fix known bugs | **DONE** |
| P2 | AST-based transpiler (hand-written recursive descent) | **DONE** |
| P3 | CodeMirror 6 code editor | **DONE** |
| P4 | UI/UX polish (buzzer viz, speed control, error UX, mobile) | **DONE** |
| P5 | 97 tests + GitHub Actions CI | **DONE** |
| P6 | Vite build + GitHub Pages deploy | **DONE** |
| P7 | Web Worker sandbox, save/share, serial plotter | Pending (post-launch) |

## Rules for Agents

1. **Run `node tests.js` after every change.** Zero failures is the invariant.
2. **Run `node scripts/verify.js` before declaring a phase complete.**
3. **Do not delete tests.** Add new ones. The count should only go up.
4. **Mark tasks complete in the task file** as you finish them.
5. **Keep this file updated** if you change architecture or add new files.
6. **The examples in examples.js are integration tests.** All 6 must always
   compile and execute without errors.
7. **Test in the browser too** — not just Node. Run `npm run dev` and try every
   example manually. The 7-seg display multiplexing is a visual behavior
   that automated tests can't fully verify.
8. **Run `npm run build`** to verify the production build still works.

## External References

- Course labs: https://teaching.ms.mff.cuni.cz/nswi170-web/pages/labs/
- FunShield info: https://teaching.ms.mff.cuni.cz/nswi170-web/pages/labs/arduino
- Moccarduino (course's own emulator): https://github.com/krulis-martin/Moccarduino
- funshield.h constants: documented in arduino-api.js and on the course page
- Arduino API reference: https://www.arduino.cc/reference/en/
