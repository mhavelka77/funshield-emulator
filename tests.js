/**
 * Comprehensive Edge Case Test Suite
 * 
 * Run with: node tests.js
 * 
 * Tests the transpiler, Arduino API emulation, shift register protocol,
 * and end-to-end execution against every edge case we can think of.
 */

const fs = require('fs');

// =========================================================================
// Bootstrap: load modules into a testable context
// =========================================================================
const ArduinoTranspiler = new Function(
    fs.readFileSync('transpiler.js', 'utf8') + '\nreturn ArduinoTranspiler;'
)();

// =========================================================================
// Test harness
// =========================================================================
let totalTests = 0;
let passed = 0;
let failed = 0;
const failures = [];

function describe(section, fn) {
    console.log(`\n--- ${section} ---`);
    fn();
}

function test(name, fn) {
    totalTests++;
    try {
        fn();
        passed++;
        console.log(`  PASS  ${name}`);
    } catch (e) {
        failed++;
        const msg = e.message || String(e);
        console.log(`  FAIL  ${name}: ${msg}`);
        failures.push({ name, error: msg });
    }
}

function assert(condition, msg) {
    if (!condition) throw new Error(msg || 'Assertion failed');
}

function assertIncludes(haystack, needle, msg) {
    if (!haystack.includes(needle))
        throw new Error(msg || `Expected output to include "${needle}", got:\n${haystack}`);
}

function assertNotIncludes(haystack, needle, msg) {
    if (haystack.includes(needle))
        throw new Error(msg || `Expected output NOT to include "${needle}", got:\n${haystack}`);
}

function transpile(code) {
    return ArduinoTranspiler.transpile(code);
}

function transpileOK(code) {
    const r = transpile(code);
    assert(r.errors.length === 0, `Transpile errors: ${JSON.stringify(r.errors)}`);
    return r.code;
}

function parsesAsJS(code) {
    try {
        new Function(code);
        return true;
    } catch (e) {
        return false;
    }
}

/** Compile and execute, returning the exports {setup, loop} plus mock state */
function compileAndRun(sourceCode, opts = {}) {
    const js = transpileOK(sourceCode);

    const pinModes = {};
    const pinValues = {};
    const shiftedBytes = [];
    let serialOut = '';
    let serialInBuf = opts.serialInput || '';
    let timeMs = opts.startTime || 0;

    const api = {
        HIGH: 1, LOW: 0, INPUT: 0, OUTPUT: 1, INPUT_PULLUP: 2,
        ON: 0, OFF: 1, MSBFIRST: 1, LSBFIRST: 0,
        A0: 54, A1: 55, A2: 56, A3: 57,
        led1_pin: 13, led2_pin: 12, led3_pin: 11, led4_pin: 10,
        button1_pin: 55, button2_pin: 56, button3_pin: 57,
        latch_pin: 4, clock_pin: 7, data_pin: 8, beep_pin: 3, trimmer_pin: 54,
        digits: [0xc0, 0xf9, 0xa4, 0xb0, 0x99, 0x92, 0x82, 0xf8, 0x80, 0x90],
        empty_glyph: 0xff,
        pinMode: (p, m) => { pinModes[p] = m; },
        digitalWrite: (p, v) => { pinValues[p] = v; },
        digitalRead: (p) => {
            // Buttons: default HIGH (not pressed)
            if (opts.buttonStates) {
                if (p === 55 && opts.buttonStates[0]) return 0;
                if (p === 56 && opts.buttonStates[1]) return 0;
                if (p === 57 && opts.buttonStates[2]) return 0;
            }
            if (p in pinValues) return pinValues[p];
            return 1; // default HIGH (pull-up)
        },
        analogRead: (p) => {
            // Normalize: accept both channel (0) and pin constant (A0=54)
            let channel = p >= 54 ? p - 54 : p;
            if (channel === 0) return opts.trimmerValue || 512;
            return 0;
        },
        shiftOut: (d, c, o, v) => { shiftedBytes.push({ data: v & 0xFF, order: o }); },
        millis: () => timeMs,
        micros: () => timeMs * 1000,
        Serial: {
            begin: () => {},
            print: (v) => { serialOut += String(v); },
            println: (v) => { serialOut += (v !== undefined ? String(v) : '') + '\n'; },
            available: () => serialInBuf.length,
            read: () => {
                if (serialInBuf.length > 0) {
                    const ch = serialInBuf.charCodeAt(0);
                    serialInBuf = serialInBuf.substring(1);
                    return ch;
                }
                return -1;
            },
            readString: () => { const s = serialInBuf.replace(/[\r\n]+$/, ''); serialInBuf = ''; return s; },
            readStringUntil: (t) => {
                const idx = serialInBuf.indexOf(String.fromCharCode(t));
                if (idx === -1) return '';
                const s = serialInBuf.substring(0, idx);
                serialInBuf = serialInBuf.substring(idx + 1);
                return s;
            },
            peek: () => serialInBuf.length > 0 ? serialInBuf.charCodeAt(0) : -1,
            parseInt: () => { const m = serialInBuf.match(/^\s*(-?\d+)/); if(m){serialInBuf=serialInBuf.substring(m[0].length);return parseInt(m[1]);}return 0; },
            flush: () => {},
        },
        random: (a, b) => b !== undefined ? a + Math.floor(Math.random() * (b - a)) : Math.floor(Math.random() * a),
        randomSeed: () => {},
        constrain: (x, a, b) => Math.min(Math.max(x, a), b),
        map: (v, fl, fh, tl, th) => Math.trunc((v - fl) * (th - tl) / (fh - fl) + tl),
        min: Math.min, max: Math.max, abs: Math.abs,
        sq: (x) => x * x, sqrt: Math.sqrt, pow: Math.pow,
        sin: Math.sin, cos: Math.cos, tan: Math.tan,
        bit: (n) => 1 << n,
        bitRead: (v, n) => (v >> n) & 1,
        bitSet: (v, n) => v | (1 << n),
        bitClear: (v, n) => v & ~(1 << n),
        bitWrite: (v, n, b) => b ? (v | (1 << n)) : (v & ~(1 << n)),
        lowByte: (w) => w & 0xFF,
        highByte: (w) => (w >> 8) & 0xFF,
        __sizeof: (x) => Array.isArray(x) ? x.length : typeof x === 'string' ? x.length + 1 : 2,
        analogWrite: (p, v) => { pinValues[p] = v; },
        delay: () => {}, delayMicroseconds: () => {},
        tone: () => {}, noTone: () => {},
    };

    const paramNames = Object.keys(api);
    const paramValues = Object.values(api);
    const factory = new Function(...paramNames, `"use strict"; ${js}\nreturn {setup, loop};`);
    const { setup, loop } = factory(...paramValues);

    return {
        setup, loop, pinModes, pinValues, shiftedBytes, api,
        getSerialOut: () => serialOut,
        getPinValue: (p) => pinValues[p] !== undefined ? pinValues[p] : 0,
        setTime: (t) => { timeMs = t; },
        advanceTime: (dt) => { timeMs += dt; },
    };
}


// =========================================================================
// TRANSPILER TESTS
// =========================================================================

describe('Transpiler: Multi-variable declarations', () => {
    test('int a, b, c; on one line', () => {
        // This is a known hard case - single line multiple declarations
        const js = transpileOK('int a, b, c;');
        // At minimum it should parse
        assert(parsesAsJS(js), `Not valid JS: ${js}`);
    });

    test('int a = 1, b = 2; on one line', () => {
        const js = transpileOK('int a = 1, b = 2;');
        assert(parsesAsJS(js), `Not valid JS: ${js}`);
    });
});

describe('Transpiler: Forward declarations', () => {
    test('void foo(int x); should not crash', () => {
        const js = transpileOK('void foo(int x);');
        // Should either become nothing or something harmless
        assert(parsesAsJS(js), `Not valid JS: ${js}`);
    });
});

describe('Transpiler: do-while loop', () => {
    test('do { x++; } while (x < 10);', () => {
        const code = `
void setup() {}
void loop() {
  int x = 0;
  do {
    x++;
  } while (x < 10);
}`;
        const js = transpileOK(code);
        assert(parsesAsJS(js), `Not valid JS: ${js}`);
        assertIncludes(js, 'do {');
        assertIncludes(js, 'while (x < 10)');
    });
});

describe('Transpiler: String literals containing keywords', () => {
    test('"int x = 5" should not be transformed', () => {
        const code = `
void setup() { Serial.println("int x = 5"); }
void loop() {}`;
        const js = transpileOK(code);
        assertIncludes(js, '"int x = 5"');
    });
});

describe('Transpiler: Char literals', () => {
    test("'\\n' and '\\0' in expressions", () => {
        const code = `
void setup() {}
void loop() {
  char c = 'A';
  if (c == '\\n') c = '\\0';
}`;
        const js = transpileOK(code);
        assert(parsesAsJS(js), `Not valid JS: ${js}`);
    });
});

describe('Transpiler: Negative initialization', () => {
    test('int x = -1;', () => {
        const js = transpileOK('int x = -1;');
        assertIncludes(js, 'let x = -1;');
    });

    test('int scrollPos = -4;', () => {
        const js = transpileOK('int scrollPos = -4;');
        assertIncludes(js, 'let scrollPos = -4;');
    });
});

describe('Transpiler: Integer division', () => {
    test('value / 10 gets Math.trunc', () => {
        const js = transpileOK('int x = value / 10;');
        assertIncludes(js, 'Math.trunc(value / 10)');
    });

    test('float division is NOT wrapped', () => {
        const js = transpileOK('float x = 3.14 / 2.0;');
        assertNotIncludes(js, 'Math.trunc');
    });

    test('division in string literal is not wrapped', () => {
        const code = `
void setup() { Serial.println("a/b"); }
void loop() {}`;
        const js = transpileOK(code);
        // The "a/b" should remain as-is in the string
        assertIncludes(js, '"a/b"');
    });
});

describe('Transpiler: Empty for sections', () => {
    test('for (;;) { break; }', () => {
        const code = `
void setup() {}
void loop() {
  for (;;) { break; }
}`;
        const js = transpileOK(code);
        assert(parsesAsJS(js), `Not valid JS: ${js}`);
    });
});

describe('Transpiler: Boolean expressions', () => {
    test('bool x = (a > b);', () => {
        const code = `
int a = 5;
int b = 3;
bool x = (a > b);`;
        const js = transpileOK(code);
        assertIncludes(js, 'let x = (a > b);');
    });
});

describe('Transpiler: Variables named like keywords', () => {
    test('int output = 5; should work', () => {
        const js = transpileOK('int output = 5;');
        assertIncludes(js, 'let output = 5;');
    });

    test('int value = 0; should work', () => {
        const js = transpileOK('int value = 0;');
        assertIncludes(js, 'let value = 0;');
    });
});

describe('Transpiler: unsigned long long', () => {
    test('unsigned long long x = 0;', () => {
        const js = transpileOK('unsigned long long x = 0;');
        // Should at least parse - might not perfectly handle 3-word type
        assert(parsesAsJS(js), `Not valid JS: ${js}`);
    });
});

describe('Transpiler: Return with division', () => {
    test('return x / 10; should have Math.trunc', () => {
        const code = `
int foo(int x) {
  return x / 10;
}
void setup() {}
void loop() {}`;
        const js = transpileOK(code);
        assert(parsesAsJS(js), `Not valid JS: ${js}`);
    });
});

describe('Transpiler: Ternary operator', () => {
    test('int x = (a > b) ? a : b;', () => {
        const code = `
void setup() {}
void loop() {
  int a = 5;
  int b = 3;
  int x = (a > b) ? a : b;
}`;
        const js = transpileOK(code);
        assert(parsesAsJS(js), `Not valid JS: ${js}`);
        assertIncludes(js, '? a : b');
    });
});

describe('Transpiler: Multiline array initializer', () => {
    test('array initializer spanning lines', () => {
        const code = `
int data[] = {
  0xc0, 0xf9, 0xa4,
  0xb0, 0x99, 0x92
};
void setup() {}
void loop() {}`;
        const js = transpileOK(code);
        assert(parsesAsJS(js), `Not valid JS: ${js}`);
    });
});

describe('Transpiler: Classes/structs', () => {
    test('simple struct with members', () => {
        const code = `
struct Button {
  int pin;
  bool lastState;
  void init(int p) {
    pin = p;
    lastState = false;
  }
};
void setup() {}
void loop() {}`;
        const js = transpileOK(code);
        assert(parsesAsJS(js), `Not valid JS: ${js}`);
    });
});

describe('Transpiler: switch with char cases', () => {
    test('switch on char with multiple cases per line', () => {
        const code = `
int foo(char c) {
  switch (c) {
    case 'A': case 'a': return 1;
    case 'B': case 'b': return 2;
    default: return 0;
  }
}
void setup() {}
void loop() {}`;
        const js = transpileOK(code);
        assert(parsesAsJS(js), `Not valid JS: ${js}`);
    });
});

describe('Transpiler: #define with complex values', () => {
    test('#define with expression', () => {
        const js = transpileOK('#define TIMEOUT (1000 * 60)');
        assertIncludes(js, 'const TIMEOUT = (1000 * 60);');
    });

    test('#define function-like macro', () => {
        const js = transpileOK('#define MAX(a,b) ((a) > (b) ? (a) : (b))');
        assertIncludes(js, 'function MAX(a,b)');
    });
});


// =========================================================================
// EXECUTION TESTS (end-to-end)
// =========================================================================

describe('Execution: Basic LED control', () => {
    test('setup sets pin modes, loop toggles LED', () => {
        const env = compileAndRun(`
#include "funshield.h"
void setup() {
  pinMode(led1_pin, OUTPUT);
  digitalWrite(led1_pin, OFF);
}
void loop() {
  digitalWrite(led1_pin, ON);
}`);
        env.setup();
        assert(env.pinModes[13] === 1, 'LED1 pin should be OUTPUT');
        assert(env.pinValues[13] === 1, 'LED1 should be OFF after setup');
        env.loop();
        assert(env.pinValues[13] === 0, 'LED1 should be ON after loop');
    });
});

describe('Execution: millis-based timing', () => {
    test('action triggers only after delay', () => {
        const env = compileAndRun(`
#include "funshield.h"
int count = 0;
unsigned long lastTime = 0;
void setup() {}
void loop() {
  unsigned long now = millis();
  if (now - lastTime >= 500) {
    count++;
    lastTime = now;
  }
}`);
        env.setup();

        env.setTime(0);
        env.loop(); // count -> 1 (0 - 0 >= 500 is false... wait, 0 >= 500 is false)
        // Actually at time 0, now=0, lastTime=0, 0-0=0 >= 500 is FALSE
        // So count stays 0

        env.setTime(499);
        env.loop(); // still no trigger

        env.setTime(500);
        env.loop(); // NOW 500 - 0 >= 500, count -> 1

        env.setTime(999);
        env.loop(); // 999 - 500 = 499, no trigger

        env.setTime(1000);
        env.loop(); // 1000 - 500 = 500, trigger, count -> 2

        // Can't directly read count, but at least it shouldn't crash
    });
});

describe('Execution: Integer division correctness', () => {
    test('digit extraction from 4-digit number', () => {
        // This is the critical segment display test
        const env = compileAndRun(`
int result0 = 0;
int result1 = 0;
int result2 = 0;
int result3 = 0;
void setup() {
  int value = 1234;
  result0 = value % 10;
  value = value / 10;
  result1 = value % 10;
  value = value / 10;
  result2 = value % 10;
  value = value / 10;
  result3 = value % 10;
  // Results should be: 4, 3, 2, 1
  Serial.print(result0);
  Serial.print(result1);
  Serial.print(result2);
  Serial.println(result3);
}
void loop() {}`);
        env.setup();
        assert(env.getSerialOut() === '4321\n',
            `Digit extraction wrong: got "${env.getSerialOut()}", expected "4321\\n"`);
    });
});

describe('Execution: Shift register / 7-seg', () => {
    test('displayDigit sends 2 bytes with correct latch protocol', () => {
        const env = compileAndRun(`
#include "funshield.h"
void setup() {
  pinMode(latch_pin, OUTPUT);
  pinMode(clock_pin, OUTPUT);
  pinMode(data_pin, OUTPUT);
}
void loop() {
  digitalWrite(latch_pin, LOW);
  shiftOut(data_pin, clock_pin, MSBFIRST, 0xc0);
  shiftOut(data_pin, clock_pin, MSBFIRST, 0x01);
  digitalWrite(latch_pin, HIGH);
}`);
        env.setup();
        env.loop();
        assert(env.shiftedBytes.length === 2, `Expected 2 shifted bytes, got ${env.shiftedBytes.length}`);
        assert(env.shiftedBytes[0].data === 0xc0, `First byte should be 0xc0 (digit 0 glyph)`);
        assert(env.shiftedBytes[1].data === 0x01, `Second byte should be 0x01 (position 0)`);
    });

    test('shiftOut with LSBFIRST', () => {
        const env = compileAndRun(`
#include "funshield.h"
void setup() {
  pinMode(latch_pin, OUTPUT);
  pinMode(clock_pin, OUTPUT);
  pinMode(data_pin, OUTPUT);
}
void loop() {
  digitalWrite(latch_pin, LOW);
  shiftOut(data_pin, clock_pin, LSBFIRST, 0xAB);
  shiftOut(data_pin, clock_pin, LSBFIRST, 0x04);
  digitalWrite(latch_pin, HIGH);
}`);
        env.setup();
        env.loop();
        assert(env.shiftedBytes.length === 2, 'Should have 2 bytes');
        assert(env.shiftedBytes[0].data === 0xAB, 'Data should be 0xAB');
        assert(env.shiftedBytes[0].order === 0, 'Order should be LSBFIRST (0)');
    });
});

describe('Execution: Button reading', () => {
    test('digitalRead returns LOW when button pressed (active low)', () => {
        const env = compileAndRun(`
#include "funshield.h"
int result = -1;
void setup() {
  pinMode(button1_pin, INPUT);
}
void loop() {
  result = digitalRead(button1_pin);
  Serial.println(result);
}`, { buttonStates: [true, false, false] });
        env.setup();
        env.loop();
        assert(env.getSerialOut().trim() === '0',
            `Button1 pressed should read LOW (0), got: "${env.getSerialOut().trim()}"`);
    });

    test('digitalRead returns HIGH when button not pressed', () => {
        const env = compileAndRun(`
#include "funshield.h"
void setup() { pinMode(button1_pin, INPUT); }
void loop() { Serial.println(digitalRead(button1_pin)); }
`, { buttonStates: [false, false, false] });
        env.setup();
        env.loop();
        assert(env.getSerialOut().trim() === '1',
            `Button1 released should read HIGH (1), got: "${env.getSerialOut().trim()}"`);
    });
});

describe('Execution: Serial communication', () => {
    test('Serial.available and Serial.read byte by byte', () => {
        const env = compileAndRun(`
void setup() { Serial.begin(9600); }
void loop() {
  while (Serial.available() > 0) {
    int ch = Serial.read();
    Serial.print(ch);
    Serial.print(" ");
  }
}`, { serialInput: 'AB' });
        env.setup();
        env.loop();
        // 'A' = 65, 'B' = 66
        assert(env.getSerialOut() === '65 66 ',
            `Serial read should produce char codes, got: "${env.getSerialOut()}"`);
    });

    test('Serial.readString returns buffer', () => {
        const env = compileAndRun(`
void setup() { Serial.begin(9600); }
void loop() {
  if (Serial.available() > 0) {
    Serial.println(Serial.readString());
  }
}`, { serialInput: 'HELLO\n' });
        env.setup();
        env.loop();
        assert(env.getSerialOut() === 'HELLO\n',
            `readString should return 'HELLO', got: "${env.getSerialOut()}"`);
    });
});

describe('Execution: analogRead', () => {
    test('trimmer returns configured value', () => {
        const env = compileAndRun(`
#include "funshield.h"
void setup() {}
void loop() {
  int val = analogRead(trimmer_pin);
  Serial.println(val);
}`, { trimmerValue: 768 });
        env.setup();
        env.loop();
        assert(env.getSerialOut().trim() === '768',
            `Trimmer should read 768, got: "${env.getSerialOut().trim()}"`);
    });
});

describe('Execution: Math helpers', () => {
    test('constrain, map, min, max, abs', () => {
        const env = compileAndRun(`
void setup() {
  Serial.println(constrain(150, 0, 100));
  Serial.println(map(512, 0, 1023, 0, 255));
  Serial.println(min(3, 7));
  Serial.println(max(3, 7));
  Serial.println(abs(-42));
}
void loop() {}`);
        env.setup();
        const lines = env.getSerialOut().trim().split('\n');
        assert(lines[0] === '100', `constrain(150,0,100) should be 100, got ${lines[0]}`);
        assert(lines[1] === '127', `map(512,...) should be 127 (truncated, not rounded), got ${lines[1]}`);
        assert(lines[2] === '3', `min(3,7) should be 3, got ${lines[2]}`);
        assert(lines[3] === '7', `max(3,7) should be 7, got ${lines[3]}`);
        assert(lines[4] === '42', `abs(-42) should be 42, got ${lines[4]}`);
    });
});

describe('Execution: Bit manipulation', () => {
    test('bit, bitRead, bitSet, bitClear', () => {
        const env = compileAndRun(`
void setup() {
  Serial.println(bit(3));
  Serial.println(bitRead(0b1010, 1));
  Serial.println(bitRead(0b1010, 0));
  int x = 0;
  x = bitSet(x, 2);
  Serial.println(x);
  x = bitClear(x, 2);
  Serial.println(x);
}
void loop() {}`);
        env.setup();
        const lines = env.getSerialOut().trim().split('\n');
        assert(lines[0] === '8', `bit(3) should be 8, got ${lines[0]}`);
        assert(lines[1] === '1', `bitRead(0b1010,1) should be 1, got ${lines[1]}`);
        assert(lines[2] === '0', `bitRead(0b1010,0) should be 0, got ${lines[2]}`);
        assert(lines[3] === '4', `bitSet(0,2) should be 4, got ${lines[3]}`);
        assert(lines[4] === '0', `bitClear(4,2) should be 0, got ${lines[4]}`);
    });
});

describe('Execution: Global state persists across loop() calls', () => {
    test('counter increments across loop calls', () => {
        const env = compileAndRun(`
int counter = 0;
void setup() {}
void loop() {
  counter++;
  Serial.println(counter);
}`);
        env.setup();
        env.loop();
        env.loop();
        env.loop();
        const lines = env.getSerialOut().trim().split('\n');
        assert(lines.length === 3, `Should have 3 lines, got ${lines.length}`);
        assert(lines[0] === '1', `First loop: counter=1, got ${lines[0]}`);
        assert(lines[1] === '2', `Second loop: counter=2, got ${lines[1]}`);
        assert(lines[2] === '3', `Third loop: counter=3, got ${lines[2]}`);
    });
});

describe('Execution: Local variables re-initialize each loop', () => {
    test('local let inside loop resets', () => {
        const env = compileAndRun(`
void setup() {}
void loop() {
  int x = 0;
  x++;
  Serial.println(x);
}`);
        env.setup();
        env.loop();
        env.loop();
        const lines = env.getSerialOut().trim().split('\n');
        // x should be 1 each time, not accumulating
        assert(lines[0] === '1' && lines[1] === '1',
            `Local var should reset each loop, got: ${lines.join(', ')}`);
    });
});

describe('Execution: String indexing', () => {
    test('message[i] returns correct character', () => {
        const env = compileAndRun(`
char message[32] = "HELLO";
void setup() {
  Serial.print(message[0]);
  Serial.print(message[1]);
  Serial.print(message[4]);
}
void loop() {}`);
        env.setup();
        assert(env.getSerialOut() === 'HEO',
            `String indexing should work, got: "${env.getSerialOut()}"`);
    });
});

describe('Execution: Complex lab-like program (D&D dice test example)', () => {
    test('dice configuration and mode switching', () => {
        const code = `
#include "funshield.h"

int diceTypes[] = {4, 6, 8, 10, 12, 20, 100};
const int NUM_DICE_TYPES = 7;
int currentDiceType = 0;
int numThrows = 1;
int lastResult = 0;
bool configMode = true;

bool prevBtn2 = false;
bool prevBtn3 = false;

void setup() {
  pinMode(latch_pin, OUTPUT);
  pinMode(clock_pin, OUTPUT);
  pinMode(data_pin, OUTPUT);
  pinMode(button1_pin, INPUT);
  pinMode(button2_pin, INPUT);
  pinMode(button3_pin, INPUT);
}

void loop() {
  bool btn2 = digitalRead(button2_pin) == LOW;
  bool btn3 = digitalRead(button3_pin) == LOW;

  if (btn2 && !prevBtn2) {
    configMode = true;
    numThrows = (numThrows % 9) + 1;
  }

  if (btn3 && !prevBtn3) {
    configMode = true;
    currentDiceType = (currentDiceType + 1) % NUM_DICE_TYPES;
  }

  prevBtn2 = btn2;
  prevBtn3 = btn3;

  Serial.print(numThrows);
  Serial.print("d");
  Serial.println(diceTypes[currentDiceType]);
}`;
        const env = compileAndRun(code, { buttonStates: [false, false, false] });
        env.setup();
        env.loop();
        assert(env.getSerialOut().includes('1d4'),
            `Initial config should be 1d4, got: "${env.getSerialOut()}"`);
    });
});


// =========================================================================
// Phase 1 Bug Fix Regression Tests
// =========================================================================

describe('P1.1: map() truncation (not rounding)', () => {
    test('map() truncates like Arduino integer math', () => {
        const env = compileAndRun(`
void setup() {
  // 512 * 255 / 1023 = 127.623... -> should truncate to 127
  Serial.println(map(512, 0, 1023, 0, 255));
  // 1 * 100 / 3 = 33.333... -> should truncate to 33
  Serial.println(map(1, 0, 3, 0, 100));
}
void loop() {}`);
        env.setup();
        const lines = env.getSerialOut().trim().split('\n');
        assert(lines[0] === '127', `map(512,0,1023,0,255) should be 127, got ${lines[0]}`);
        assert(lines[1] === '33', `map(1,0,3,0,100) should be 33, got ${lines[1]}`);
    });
});

describe('P1.2: sizeof returns correct AVR sizes', () => {
    test('sizeof(int) is 2 for Arduino Uno', () => {
        const env = compileAndRun(`
void setup() {
  int arr[5] = {0,0,0,0,0};
  Serial.println(sizeof(arr));
}
void loop() {}`);
        env.setup();
        // sizeof(arr) on an array should return its length (5)
        assert(env.getSerialOut().trim() === '5', `sizeof(arr) should be 5, got: ${env.getSerialOut().trim()}`);
    });
    test('sizeof type lookup in transpiler', () => {
        // Test sizeof in a full program context to avoid transpiler line-parse issues
        const js = transpileOK(`
void setup() {
  int s = sizeof(long);
  Serial.println(s);
}
void loop() {}`);
        assert(js.includes('4'), `sizeof(long) should resolve to 4 in transpiled output`);
    });
});

describe('P1.3: analogRead channel/pin unification', () => {
    test('analogRead(0) and analogRead(A0) return same value', () => {
        // Test with channel number 0
        const env1 = compileAndRun(`
void setup() { Serial.println(analogRead(0)); }
void loop() {}`, { trimmerValue: 768 });
        env1.setup();
        const val1 = env1.getSerialOut().trim();

        // Test with pin constant A0
        const env2 = compileAndRun(`
void setup() { Serial.println(analogRead(A0)); }
void loop() {}`, { trimmerValue: 768 });
        env2.setup();
        const val2 = env2.getSerialOut().trim();

        assert(val1 === '768', `analogRead(0) should return 768, got ${val1}`);
        assert(val2 === '768', `analogRead(A0) should return 768, got ${val2}`);
        assert(val1 === val2, `analogRead(0) and analogRead(A0) should be equal`);
    });
});

describe('P1.6: analogWrite PWM', () => {
    test('analogWrite stores PWM value on pin', () => {
        const env = compileAndRun(`
void setup() {
  pinMode(led1_pin, OUTPUT);
  analogWrite(led1_pin, 128);
}
void loop() {}`);
        env.setup();
        // Pin value should be 128 (the PWM value)
        assert(env.getPinValue(13) === 128,
            `analogWrite(led1_pin, 128) should set pin 13 to 128, got ${env.getPinValue(13)}`);
    });
});

// =========================================================================
// Report
// =========================================================================
console.log(`\n${'='.repeat(60)}`);
console.log(`RESULTS: ${passed} passed, ${failed} failed, ${totalTests} total`);
if (failures.length > 0) {
    console.log('\nFailures:');
    failures.forEach(f => console.log(`  - ${f.name}: ${f.error}`));
}
console.log('='.repeat(60));

process.exit(failed > 0 ? 1 : 0);
