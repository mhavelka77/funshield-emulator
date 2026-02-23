# Phase 1: Fix Known Bugs

**Effort:** 1-2 days | **Blocks launch:** Yes
**Status:** COMPLETE

## Checklist

- [x] **P1.1** `map()` uses `Math.round()` — changed to `Math.trunc()` (Arduino truncates)
  - Fixed in `arduino-api.js` and test mock in `tests.js`
  - Added regression test: `map(512,0,1023,0,255)` → 127 (not 128)
  - Added regression test: `map(1,0,3,0,100)` → 33 (not 33.33)

- [x] **P1.2** `sizeof(int)` returns 4 — changed to 2 (AVR is 16-bit)
  - Fixed `__sizeof` default in `arduino-api.js` (4 → 2)
  - Moved sizeof(type) resolution to before line-by-line transform in `transpiler.js`
    (was being mangled by cast-stripping regex when in postProcess)
  - Removed duplicate sizeof handling from postProcess
  - sizeof table: char=1, short=2, int=2, long=4, float=4, double=4, uint64_t=8
  - Added regression tests for sizeof(arr) and sizeof(long)

- [x] **P1.3** Unified `analogRead` channel/pin mapping
  - Fixed in `arduino-api.js`: normalize pin ≥ 54 to channel number
  - Fixed test mock in `tests.js` to use same normalization
  - Added regression test: `analogRead(0)` and `analogRead(A0)` return same value

- [x] **P1.4** Capped `Serial.outputBuffer` (memory leak)
  - In `arduino-api.js`: cap at 10,000 chars, trim from front keeping last 5,000

- [x] **P1.5** Dead code cleanup
  - Removed: `hw.shiftRegister.data`, `hw.shiftRegister.bitCount`, `hw.shiftRegister.displayBytes`
  - Removed: `hw.display.activePosition` (write-only)
  - Removed: dead `elapsed` variable in emulator.js display fade
  - Removed: unused `segments` variable in app.js `updateDisplayDigit`
  - Removed: unused `freshAPI()` and `ArduinoAPIFactory` from tests.js
  - Added TODO comment to empty buzzer callback
  - Kept: `CHAR_GLYPHS` (exported, useful for future), `getLoopCount` (public API),
    `Serial.baudRate` (matches real API), `loopCount` (debugging)

- [x] **P1.6** `analogWrite` PWM brightness for LEDs
  - `analogWrite` on LED pins: maps 0-255 to brightness (active LOW: 0=full, 255=off)
  - `onLedChange` callback now receives `(index, isOn, brightness)` third parameter
  - `app.js` uses CSS opacity for intermediate brightness levels
  - `analogWrite` on buzzer pin: any nonzero = active
  - Added regression test for analogWrite storing PWM value

## Verification

```bash
node tests.js          # 44 passed, 0 failed (was 39)
node scripts/verify.js # 31 passed, 0 failed
```
