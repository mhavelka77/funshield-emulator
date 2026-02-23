# Agent Handoff Specification

> This file is the single entry point for any agent picking up this project.
> Read this FIRST. It contains everything you need to understand, test, and
> extend the codebase.

## What This Is

A browser-based emulator for Arduino Uno + FunShield shield. Users write
Arduino C++ in an editor, click "Compile & Upload", and see the hardware
respond visually: 4 LEDs, 3 buttons, a 4-digit 7-segment display, a
trimmer potentiometer, a buzzer, and a serial monitor.

Built for the NSWI170 Computer Systems course at Charles University (Prague).
Course website: https://teaching.ms.mff.cuni.cz/nswi170-web/pages/labs/

## Current State: POC + Phase 1 Complete

- 44/44 tests pass (`node tests.js`)
- 31/31 health checks pass (`node scripts/verify.js`)
- All 6 lab examples compile and execute correctly
- Pure client-side: open `index.html` in browser, no server needed
- ~3,700 lines across 7 source files
- Phase 1 (bug fixes) is complete — see `tasks/phase1.md`

## How to Work With This Project

```bash
# Run tests (ALWAYS run after any change)
node tests.js

# Run full project health check
node scripts/verify.js

# Serve locally
python3 -m http.server 8080
# Then open http://localhost:8080

# The app is index.html — just open it directly in a browser too
```

## File Map

```
index.html          — Single-page app, loads all JS via <script> tags
style.css           — All styling, dark theme, board visualization
transpiler.js       — C++ → JS source-to-source transpiler (REGEX-BASED — the weak link)
arduino-api.js      — Arduino function implementations + FunShield hardware state
emulator.js         — Execution engine: compile → setup() → loop() cycle
app.js              — UI controller: wires DOM to emulator + hardware callbacks
examples.js         — 6 example programs (Labs 2-6 + test sample)
tests.js            — 39-test suite covering transpiler + execution

PLAN.md             — Full production plan with 7 phases
ARCHITECTURE.md     — Detailed internals, data flow, known bugs
tasks/              — One file per phase with atomic checklist items
scripts/verify.js   — Health check script (tests + lint + structure)
```

## Execution Pipeline (How Code Runs)

```
User's C++ code
  → transpiler.js: extract string literals → strip comments
    → preprocess (#include/#define) → join multiline constructs
    → line-by-line transform (functions, variables, for-loops)
    → post-process (integer division, casts, nullptr, operators)
    → restore string literals
  → emulator.js: wraps transpiled JS in new Function() with Arduino API as params
  → Calls setup() once
  → Calls loop() 200x per requestAnimationFrame
  → Arduino API calls (digitalWrite, shiftOut, etc.) update hardware state
  → Hardware state changes fire callbacks → app.js updates DOM
```

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
Buzzer: pin 3 — active LOW
```

## Known Bugs — ALL FIXED (Phase 1 Complete)

All 6 bugs from the original audit have been fixed. See `tasks/phase1.md` for details.

## Known Limitations (By Design)

- **Transpiler is regex-based.** Works for lab code patterns but breaks on:
  multiple statements per line, complex expressions like `(a+b)/c`, templates,
  lambdas, pointer arithmetic, 2D arrays, typedef, static_cast.
  → Fix: Phase 2 replaces with tree-sitter-c or hand-written parser.

- **`delay()` is a no-op.** The course prohibits it, so this is intentional.
  Phase 7 (Web Worker) could implement real delay.

- **`new Function()` requires `unsafe-eval` CSP.** Deployment blocker for
  strict CSP environments. Phase 7 (Web Worker) fixes this.

- **`randomSeed()` is a no-op.** JS `Math.random()` can't be seeded.

## Implementation Phases (see tasks/ for details)

| Phase | Summary | Effort | Blocks launch? | Status |
|-------|---------|--------|----------------|--------|
| P1 | Fix known bugs | 1-2 days | Yes | **DONE** |
| P2 | Replace regex transpiler with real parser | 3-5 days | Yes | Next |
| P3 | CodeMirror 6 code editor | 1-2 days | No | Pending |
| P4 | UI/UX polish (board viz, speed control, errors) | 2-3 days | No | Pending |
| P5 | Expand tests to 100+, add CI | 2-3 days | Yes | Pending |
| P6 | Vite build + deploy to hosting | 1-2 days | Yes | Pending |
| P7 | Web Worker sandbox, save/share, advanced features | Ongoing | No | Pending |

**Minimum launch = P1 + P2 + P5 + P6 (~8-12 days)**

## Rules for Agents

1. **Run `node tests.js` after every change.** Zero failures is the invariant.
2. **Run `node scripts/verify.js` before declaring a phase complete.**
3. **Do not delete tests.** Add new ones. The count should only go up.
4. **Mark tasks complete in the task file** as you finish them.
5. **Keep this file updated** if you change architecture or add new files.
6. **The examples in examples.js are integration tests.** All 6 must always
   compile and execute without errors.
7. **Test in the browser too** — not just Node. Open index.html and try every
   example manually. The 7-seg display multiplexing is a visual behavior
   that automated tests can't fully verify.

## External References

- Course labs: https://teaching.ms.mff.cuni.cz/nswi170-web/pages/labs/
- FunShield info: https://teaching.ms.mff.cuni.cz/nswi170-web/pages/labs/arduino
- Moccarduino (course's own emulator): https://github.com/krulis-martin/Moccarduino
- funshield.h constants: documented in arduino-api.js and on the course page
- Arduino API reference: https://www.arduino.cc/reference/en/
