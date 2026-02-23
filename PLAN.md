# Production Plan: Arduino + FunShield Emulator

## Current State

Working POC: 3,700 lines of vanilla JS/HTML/CSS. Transpiles Arduino C++ to JS
via regex, emulates the FunShield hardware (LEDs, buttons, 7-seg display,
shift register, trimmer, serial). 39 tests pass, all 6 lab examples work.

**Core weakness:** the transpiler is regex-based, line-by-line. It handles
the lab subset well but will break on anything non-trivial (templates,
lambdas, pointer arithmetic, complex expressions, multiple statements
per line).

---

## Phase 1: Fix Known Bugs (1-2 days)

These are factual errors found by audit that produce wrong behavior.

### P1.1 — `map()` uses rounding, should truncate
Arduino's `map()` does integer truncation, not `Math.round()`.
```js
// WRONG:  Math.round(...)
// RIGHT:  Math.trunc(...)
```

### P1.2 — `sizeof(int)` returns 4, should be 2
Arduino Uno (AVR) has 16-bit `int`. The `__sizeof` default and the
transpiler's sizeof table both need correcting.

### P1.3 — `analogRead(0)` vs `analogRead(A0)` ambiguity
`analogRead` takes a **channel number** (0-5), not a pin number. Both
`analogRead(0)` and `analogRead(A0)` should work, but the current code
handles them through separate conditions. Unify with:
```js
function analogRead(pin) {
    // Normalize: if pin >= 54, convert to channel number
    let channel = pin >= 54 ? pin - 54 : pin;
    // channel 0 = trimmer, 1-3 = buttons, etc.
}
```

### P1.4 — `Serial.outputBuffer` grows unbounded (memory leak)
Cap the buffer or don't accumulate it at all since `onOutput` callback
is the real delivery path.

### P1.5 — Dead code cleanup
Remove 17 instances of dead code identified in audit (unused variables,
unreachable writes, unexported helpers).

### P1.6 — `analogWrite` / PWM LED brightness
Currently only 0 turns LED on. Should support brightness levels for
`analogWrite(pin, 0-255)` by mapping to LED opacity.

---

## Phase 2: Replace the Transpiler (3-5 days)

**This is the single highest-impact change.** The regex transpiler is the
weakest link. Replace it with a proper parser.

### Option A: Use an existing C parser compiled to WASM (Recommended)
- Use [tree-sitter-c](https://github.com/tree-sitter/tree-sitter-c) compiled
  to WASM. Tree-sitter has official WASM support and runs in the browser.
- Parse the Arduino code into a real AST.
- Walk the AST and emit JS.
- **Pros:** Handles all C syntax correctly, battle-tested parser, great
  error messages with line/column info.
- **Cons:** ~200KB WASM bundle, async init.

### Option B: Write a recursive descent parser for the C subset
- Only parse what Arduino code actually uses (no templates, no preprocessor
  complexity beyond #define/#include).
- ~1000-2000 lines of JS.
- **Pros:** Zero dependencies, small bundle, full control over error messages.
- **Cons:** More work, risk of edge cases.

### Option C: Use Emscripten to compile C++ in-browser
- Compile actual C++ with clang/emscripten running in WASM.
- **Pros:** Real compilation, catches type errors.
- **Cons:** Massive bundle (5-50MB), slow compile times, complex integration.

### Recommendation: Option A (tree-sitter)
The parser is ~200KB, loads in <100ms, and gives us a real AST that
handles every C syntax pattern. The transpiler becomes an AST→JS
code generator, which is straightforward and reliable.

This fixes every transpiler failure:
- Multi-statement lines
- Complex expressions with division `(a + b) / c`
- Nested braces
- Pointer syntax
- Any valid C code structure

### Integer Division Strategy (with AST)
With a real AST, we can do **type inference**: track which variables are
declared as `int`/`long` vs `float`/`double`, and only insert
`Math.trunc()` for integer÷integer. This eliminates both false positives
and false negatives from the current regex approach.

---

## Phase 3: Code Editor Upgrade (1-2 days)

Replace the `<textarea>` with a proper code editor.

### Recommended: CodeMirror 6
- ~150KB gzipped, modular
- C/C++ syntax highlighting
- Line numbers, bracket matching, auto-indent
- Error/warning markers (squiggly underlines with messages)
- Search/replace
- Undo/redo
- Mobile support

### Integration:
```html
<script type="module">
  import { EditorView } from "@codemirror/view"
  import { cpp } from "@codemirror/lang-cpp"
</script>
```

Wire compiler errors to editor diagnostics so red squiggles appear
on the line that caused the error.

---

## Phase 4: UI/UX Polish (2-3 days)

### P4.1 — Board visualization
- Make the board look more like a real Arduino + FunShield photo
- Add pin labels and traces
- Add a buzzer indicator (speaker icon, animation when active)
- Animate LED glow with CSS transitions at correct brightness
- Show pin state tooltip on hover

### P4.2 — Display improvements
- Adjust 7-seg multiplexing simulation for smoother persistence-of-vision
- Show which digit is currently being driven (debug mode)
- Add option to show decoded display value as text below the segments

### P4.3 — Execution controls
- Speed slider (0.1x to 10x realtime)
- Step mode: execute one `loop()` iteration at a time
- Pause/resume
- Show loop iteration count and elapsed virtual time
- Show `millis()` clock

### P4.4 — Error UX
- Compiler errors: show line number, highlight in editor
- Runtime errors: show the C++ line that caused it (via source map)
- Warnings for prohibited patterns (delay, blocking loop)

### P4.5 — Mobile responsiveness
- Stack layout vertically
- Touch-friendly button sizes
- Test on iOS Safari and Android Chrome

---

## Phase 5: Robustness & Testing (2-3 days)

### P5.1 — Expand test suite to 100+ tests
- Every Arduino API function gets at least one test
- Timing precision tests (millis-based patterns with exact assertions)
- Shift register protocol edge cases
- Serial protocol edge cases
- Transpiler: one test per C syntax pattern

### P5.2 — Fuzz the transpiler
- Generate random valid C programs (or scrape Arduino forum examples)
- Feed them through the transpiler
- Assert: no crashes, output parses as valid JS

### P5.3 — Regression tests from real student code
- Collect (anonymized) real solutions from the course
- Use as integration tests
- These are the best tests because they represent actual usage

### P5.4 — CI pipeline
- GitHub Actions: run `node tests.js` on every push
- Lint with ESLint
- Check bundle size doesn't regress

---

## Phase 6: Build & Deploy (1-2 days)

### P6.1 — Build system
- Vite (minimal config, fast, handles ES modules)
- Bundle all JS into one file, minify
- Hash filenames for cache busting
- Output: `dist/` folder with `index.html` + `assets/`

### P6.2 — CSP compatibility
The current `new Function()` approach requires `unsafe-eval` in
Content-Security-Policy. Two options:
1. **Accept it** — most CDN/static hosts don't enforce CSP. Document it.
2. **Web Worker** — run transpiled code in a Worker with `eval()`, communicate
   via `postMessage`. This also prevents user code from freezing the UI.
   (Recommended for Phase 7.)

### P6.3 — Deploy
- **Static hosting:** Netlify, Vercel, Cloudflare Pages, or GitHub Pages
- Custom domain: point DNS, enable HTTPS
- Add `<meta>` tags for SEO/social sharing
- Add a favicon

### P6.4 — Analytics (optional)
- Lightweight (Plausible or similar, no cookies)
- Track: page views, compile button clicks, which examples are loaded
- No tracking of user code content

---

## Phase 7: Advanced Features (ongoing, after launch)

### P7.1 — Web Worker execution sandbox
- Move the Arduino runtime into a Web Worker
- `loop()` runs in the worker, UI updates via `postMessage`
- **Benefits:**
  - User code can't freeze the main thread
  - Can implement real `delay()` (sleep the worker)
  - Better timing accuracy (no animation frame dependency)
  - Safer (user code can't access DOM)

### P7.2 — Save/load/share sketches
- LocalStorage for auto-save
- URL-encoded sketch sharing (gzip + base64 in URL hash)
- Or: a simple backend (Cloudflare KV / Supabase) for short URLs

### P7.3 — Wokwi-style component library (stretch)
- Drag-and-drop components beyond FunShield
- External LEDs, servos, LCD displays, sensors
- Each component is a JS class with render + pin interface

### P7.4 — Serial plotter
- Graph numeric serial output over time
- Like Arduino IDE's Serial Plotter

### P7.5 — Multiple board support
- Arduino Mega (more pins, more memory)
- ESP32 (WiFi, different pin layout)
- Just need different pin maps and constants

### P7.6 — Export to real Arduino
- "Download .ino" button (trivial — just download the editor content)
- Verify button that checks code against Moccarduino-compatible subset

---

## Priority / Timeline Summary

| Phase | Effort | Impact | Ship blocker? |
|-------|--------|--------|---------------|
| P1: Fix bugs | 1-2 days | Medium | Yes |
| P2: Real parser | 3-5 days | **Critical** | Yes |
| P3: Code editor | 1-2 days | High | No (nice-to-have) |
| P4: UI polish | 2-3 days | High | No |
| P5: Testing | 2-3 days | High | Yes |
| P6: Build/deploy | 1-2 days | **Critical** | Yes |
| P7: Advanced | Ongoing | Medium | No |

**Minimum viable launch: P1 + P2 + P5 + P6 = ~8-12 days**

P3 and P4 can ship incrementally after launch.

---

## Architecture After Phase 2+6

```
src/
  index.html
  style.css
  parser/
    tree-sitter-c.wasm      # C parser (or hand-written parser.js)
    codegen.js               # AST → JavaScript code generator
  runtime/
    arduino-api.js           # Arduino function implementations
    funshield.js             # FunShield-specific hardware emulation
    shift-register.js        # 74HC595 shift register model
    seven-segment.js         # 7-seg display decoder + multiplexing
  ui/
    app.js                   # Main controller
    display-renderer.js      # SVG 7-seg rendering
    board-view.js            # Board visualization
    serial-monitor.js        # Serial I/O panel
    editor.js                # CodeMirror integration
  examples/
    lab2-blink.ino
    lab3-counter.ino
    lab4-segment.ino
    lab5-stopwatch.ino
    lab6-scroll.ino
    test-dice.ino
tests/
  transpiler.test.js
  api.test.js
  execution.test.js
  integration.test.js
```
