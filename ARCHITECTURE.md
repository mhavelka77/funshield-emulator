# Architecture: Internals Reference

## Data Flow

```
                    ┌─────────────┐
                    │  index.html  │  Loads all scripts via <script>
                    └──────┬──────┘
                           │
            ┌──────────────┼──────────────┐
            │              │              │
    ┌───────▼──────┐ ┌────▼─────┐ ┌──────▼──────┐
    │ transpiler.js │ │ emulator │ │   app.js    │
    │              │ │   .js    │ │ (UI wiring) │
    │ C++ → JS     │ │ compile  │ │ DOM ↔ HW    │
    │ transform    │ │ + run    │ │ callbacks   │
    └───────┬──────┘ └────┬─────┘ └──────┬──────┘
            │              │              │
            │        ┌─────▼──────┐       │
            └───────►│arduino-api │◄──────┘
                     │   .js     │
                     │ HW state  │
                     │ + API fns │
                     └───────────┘
```

## Module Contracts

### ArduinoTranspiler (transpiler.js)
- **Input:** Arduino C++ source string
- **Output:** `{ code: string, errors: [{line, message}], warnings: [{line, message}] }`
- **Side effects:** None (pure function)
- **Key invariant:** Output must be valid JS that can be passed to `new Function()`

### ArduinoAPI (arduino-api.js)
- **Singleton** with mutable hardware state
- `reset()` — clear all state to defaults
- `getAPIScope()` — returns object of all Arduino functions/constants to inject
- `getState()` — returns mutable hardware state (for UI callbacks)
- `setButtonState(idx, pressed)` — called by UI
- `setTrimmerValue(val)` — called by UI
- `sendSerialData(text)` — called by UI serial monitor
- `setStartTime(t)` — called by emulator when program starts

### Emulator (emulator.js)
- `compile(sourceCode)` → `{ success, errors, warnings }`
- `run(onError)` — starts setup() + loop() cycle
- `stop()` — halts execution
- `reset(sourceCode, onError)` — stop + recompile + run
- `isRunning()` — boolean

### App (app.js)
- IIFE, runs on load
- Wires DOM elements to emulator + API
- Registers hardware callbacks (LED, display, buzzer, serial)
- Handles keyboard shortcuts (1/2/3 for buttons, Ctrl+Enter, Escape)

## Hardware State Shape (arduino-api.js)

```js
{
  pinModes: Array(70),        // INPUT/OUTPUT/INPUT_PULLUP per pin
  pinValues: Array(70),       // HIGH/LOW per pin
  startTime: number,          // performance.now() at program start

  shiftRegister: {
    bytes: [],                // accumulated bytes between latch LOW→HIGH
    latchState: HIGH,         // current latch pin value
  },

  display: {
    positions: [              // 4 digits
      { glyph: 0xff, lastUpdate: 0, brightness: 0 },
      ...
    ],
  },

  leds: [bool, bool, bool, bool],
  buttons: [bool, bool, bool],
  trimmerValue: 0-1023,
  buzzer: { active: bool, frequency: number },

  serial: {
    begun: bool,
    outputBuffer: string,     // BUG: grows unbounded
    inputBuffer: string,
    onOutput: callback,
  },

  // UI callbacks
  onLedChange: (index, isOn) => void,
  onDisplayChange: (display) => void,
  onBuzzerChange: (buzzer) => void,
}
```

## Shift Register Protocol (7-Segment Display)

Real FunShield uses two cascaded 74HC595 shift registers:

```
1. digitalWrite(latch_pin, LOW)     — open the gate
2. shiftOut(data, clock, MSBFIRST, segmentByte)  — which segments to light
3. shiftOut(data, clock, MSBFIRST, positionByte)  — which digit position
4. digitalWrite(latch_pin, HIGH)    — close gate, outputs update
```

In our emulator:
- `shiftOut()` appends byte to `hw.shiftRegister.bytes[]`
- `digitalWrite(latch_pin, LOW)` clears the byte buffer
- `digitalWrite(latch_pin, HIGH)` triggers `processShiftRegisterOutput()`
  which reads bytes[0] as segment data and bytes[1] as position select

Segment byte encoding (active LOW — 0 = ON):
```
bit 0 = segment a (top)
bit 1 = segment b (top right)
bit 2 = segment c (bottom right)
bit 3 = segment d (bottom)
bit 4 = segment e (bottom left)
bit 5 = segment f (top left)
bit 6 = segment g (middle)
bit 7 = dp (decimal point)
```

Position byte (one-hot):
```
0x01 = digit 0 (rightmost)
0x02 = digit 1
0x04 = digit 2
0x08 = digit 3 (leftmost)
```

## Transpiler Architecture (Phase 2 — AST-based)

The transpiler uses a 4-stage pipeline:

1. **Preprocess** — `#include` → strip, `#define` → inline expansion (both simple and function-like macros)
2. **Tokenize** — lexer produces typed token stream with line/col tracking. Handles: all C operators, string/char literals with escapes, hex/binary/decimal/float numbers, integer suffix stripping, comment removal, Arduino B-prefix binary literals
3. **Parse** — recursive descent parser produces AST. 15-level expression precedence. Handles: declarations, functions, structs, all control flow (if/for/while/do-while/switch), C-style casts, sizeof. Error recovery with line numbers
4. **Generate** — AST → JavaScript. Scope-based type tracker for integer division detection. Struct → ES6 class. Cast → Math.trunc/pass-through. sizeof(type) → AVR size table lookup

### Key improvements over v1 (regex-based):
- Handles `(a + b) / c` — any complex expression
- Multiple statements per line
- Type-aware integer division (float vs int)
- Proper C-style cast handling
- Accurate error messages with line numbers
- Struct methods with `this.` member access

The old regex transpiler is archived as `transpiler-legacy.js` for reference.

## Timing Model

- `millis()` = `Math.floor(performance.now() - startTime)`
- `micros()` = `Math.floor((performance.now() - startTime) * 1000)`
- `loop()` runs in batches of 200 per `requestAnimationFrame` (~60fps)
- Effective loop rate: ~12,000/sec (real Arduino: ~1,000,000/sec)
- Display fade: digits not refreshed within 8ms begin fading
- Fade check interval: 4ms via `setInterval`

## Pin Map (Arduino Uno + FunShield)

```
Digital pins:
  0  = RX (Serial)
  1  = TX (Serial)
  3  = beep_pin (buzzer, active LOW)
  4  = latch_pin (shift register)
  7  = clock_pin (shift register)
  8  = data_pin (shift register)
  10 = led4_pin (active LOW)
  11 = led3_pin (active LOW)
  12 = led2_pin (active LOW)
  13 = led1_pin (active LOW) = LED_BUILTIN

Analog pins (mapped to 54+):
  A0 (54) = trimmer_pin (0-1023)
  A1 (55) = button1_pin (active LOW)
  A2 (56) = button2_pin (active LOW)
  A3 (57) = button3_pin (active LOW)
```

## Dead Code Inventory — CLEANED (Phase 1)

The following items were removed in Phase 1:
- `hw.shiftRegister.data`, `hw.shiftRegister.bitCount`, `hw.shiftRegister.displayBytes`
- `hw.display.activePosition`
- `elapsed` variable in emulator.js display fade
- `segments` variable in app.js `updateDisplayDigit`
- `freshAPI()` and `ArduinoAPIFactory` in tests.js

Kept intentionally:
- `CHAR_GLYPHS` — exported, useful for future features
- `hw.buzzer` state — now wired to callback (Phase 4 will add visual)
- `hw.serial.baudRate` — matches real Arduino API
- `hw.serial.outputBuffer` — now capped at 10K chars
- `loopCount` / `getLoopCount()` — public API, useful for debugging
