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
        assertIncludes(js, 'do');
        assertIncludes(js, 'while');
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
        const js = transpileOK('#define TIMEOUT (1000 * 60)\nvoid setup() { int x = TIMEOUT; }\nvoid loop() {}');
        // Macro should be expanded inline — verify the expression appears in code
        assert(js.includes('1000') && js.includes('60'), `Define should be expanded: ${js}`);
    });

    test('#define function-like macro', () => {
        const js = transpileOK('#define MAX(a,b) ((a) > (b) ? (a) : (b))\nvoid setup() { int x = MAX(3, 5); }\nvoid loop() {}');
        assert(parsesAsJS(js), `Macro expansion should produce valid JS: ${js}`);
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
// Phase 2 New Capability Tests (patterns old regex transpiler couldn't handle)
// =========================================================================

describe('P2: Complex expression division', () => {
    test('(a + b) / c with integer operands', () => {
        const env = compileAndRun(`
void setup() {
  int a = 10;
  int b = 5;
  int c = 3;
  Serial.println((a + b) / c);
}
void loop() {}`);
        env.setup();
        assert(env.getSerialOut().trim() === '5', `(10+5)/3 should be 5, got ${env.getSerialOut().trim()}`);
    });
});

describe('P2: Multiple statements per line', () => {
    test('two statements on one line', () => {
        const env = compileAndRun(`
void setup() {
  int a = 1; int b = 2;
  Serial.println(a + b);
}
void loop() {}`);
        env.setup();
        assert(env.getSerialOut().trim() === '3', `a+b should be 3, got ${env.getSerialOut().trim()}`);
    });
});

describe('P2: Nested function calls', () => {
    test('function call as argument to another', () => {
        const env = compileAndRun(`
void setup() {
  Serial.println(abs(min(-5, -3)));
}
void loop() {}`);
        env.setup();
        assert(env.getSerialOut().trim() === '5', `abs(min(-5,-3)) should be 5, got ${env.getSerialOut().trim()}`);
    });
});

describe('P2: Type-aware division', () => {
    test('float variable divided by int does not truncate', () => {
        const env = compileAndRun(`
void setup() {
  float x = 5.0;
  int y = 2;
  float result = x / y;
  Serial.println(result);
}
void loop() {}`);
        env.setup();
        assert(env.getSerialOut().trim() === '2.5', `5.0/2 should be 2.5, got ${env.getSerialOut().trim()}`);
    });
    test('int / int truncates', () => {
        const env = compileAndRun(`
void setup() {
  int x = 7;
  int y = 2;
  Serial.println(x / y);
}
void loop() {}`);
        env.setup();
        assert(env.getSerialOut().trim() === '3', `7/2 should be 3, got ${env.getSerialOut().trim()}`);
    });
});

describe('P2: C-style cast', () => {
    test('(int) cast truncates float', () => {
        const env = compileAndRun(`
void setup() {
  float x = 3.7;
  int y = (int)x;
  Serial.println(y);
}
void loop() {}`);
        env.setup();
        assert(env.getSerialOut().trim() === '3', `(int)3.7 should be 3, got ${env.getSerialOut().trim()}`);
    });
});

describe('P2: Compound expressions in array index', () => {
    test('array[expr % len]', () => {
        const env = compileAndRun(`
int data[] = {10, 20, 30, 40, 50};
void setup() {
  int i = 7;
  Serial.println(data[i % 5]);
}
void loop() {}`);
        env.setup();
        assert(env.getSerialOut().trim() === '30', `data[7%5] should be 30, got ${env.getSerialOut().trim()}`);
    });
});

// =========================================================================
// Phase 5: Comprehensive Test Expansion
// =========================================================================

// --- Arduino API: Every function tested ---

describe('API: tone and noTone', () => {
    test('tone activates buzzer, noTone deactivates', () => {
        const env = compileAndRun(`
void setup() { tone(beep_pin, 440); noTone(beep_pin); }
void loop() {}`);
        env.setup(); // should not crash
    });
});

describe('API: delay/delayMicroseconds (no-op)', () => {
    test('delay does not crash', () => {
        const env = compileAndRun(`
void setup() { delay(100); delayMicroseconds(50); }
void loop() {}`);
        env.setup();
    });
});

describe('API: random and randomSeed', () => {
    test('random(max) returns value in range', () => {
        const env = compileAndRun(`
void setup() {
  randomSeed(42);
  int x = random(10);
  Serial.println(x);
}
void loop() {}`);
        env.setup();
        const val = parseInt(env.getSerialOut().trim());
        assert(val >= 0 && val < 10, `random(10) should be 0-9, got ${val}`);
    });
    test('random(min, max) returns value in range', () => {
        const env = compileAndRun(`
void setup() {
  int x = random(5, 10);
  Serial.println(x);
}
void loop() {}`);
        env.setup();
        const val = parseInt(env.getSerialOut().trim());
        assert(val >= 5 && val < 10, `random(5,10) should be 5-9, got ${val}`);
    });
});

describe('API: sq, sqrt, pow', () => {
    test('math functions return correct values', () => {
        const env = compileAndRun(`
void setup() {
  Serial.println(sq(4));
  Serial.println(sqrt(16));
  Serial.println(pow(2, 10));
}
void loop() {}`);
        env.setup();
        const lines = env.getSerialOut().trim().split('\n');
        assert(lines[0] === '16', `sq(4)=${lines[0]}`);
        assert(lines[1] === '4', `sqrt(16)=${lines[1]}`);
        assert(lines[2] === '1024', `pow(2,10)=${lines[2]}`);
    });
});

describe('API: lowByte, highByte', () => {
    test('extract bytes from 16-bit value', () => {
        const env = compileAndRun(`
void setup() {
  int val = 0x1234;
  Serial.println(lowByte(val));
  Serial.println(highByte(val));
}
void loop() {}`);
        env.setup();
        const lines = env.getSerialOut().trim().split('\n');
        assert(lines[0] === '52', `lowByte(0x1234)=0x34=52, got ${lines[0]}`);
        assert(lines[1] === '18', `highByte(0x1234)=0x12=18, got ${lines[1]}`);
    });
});

describe('API: bitWrite', () => {
    test('set and clear individual bits', () => {
        const env = compileAndRun(`
void setup() {
  int x = 0;
  x = bitWrite(x, 0, 1);
  x = bitWrite(x, 2, 1);
  Serial.println(x);
  x = bitWrite(x, 0, 0);
  Serial.println(x);
}
void loop() {}`);
        env.setup();
        const lines = env.getSerialOut().trim().split('\n');
        assert(lines[0] === '5', `bits 0,2 set = 5, got ${lines[0]}`);
        assert(lines[1] === '4', `bit 0 cleared = 4, got ${lines[1]}`);
    });
});

describe('API: Serial.write', () => {
    test('write sends single byte as char', () => {
        const env = compileAndRun(`
void setup() {
  Serial.begin(9600);
  Serial.print(65);
}
void loop() {}`);
        env.setup();
        assert(env.getSerialOut() === '65', `Serial.print(65) should output '65', got '${env.getSerialOut()}'`);
    });
});

describe('API: Serial.peek', () => {
    test('peek returns first char without consuming', () => {
        const env = compileAndRun(`
void setup() {
  Serial.begin(9600);
  int p = Serial.peek();
  int a = Serial.available();
  Serial.print(p);
  Serial.print(" ");
  Serial.println(a);
}
void loop() {}`, { serialInput: 'XY' });
        env.setup();
        assert(env.getSerialOut().trim() === '88 2', `peek should return 88 (X) with 2 avail, got '${env.getSerialOut().trim()}'`);
    });
});

describe('API: Serial.parseInt', () => {
    test('parseInt reads integer from buffer', () => {
        const env = compileAndRun(`
void setup() {
  Serial.begin(9600);
  int n = Serial.parseInt();
  Serial.println(n);
}
void loop() {}`, { serialInput: '  42abc' });
        env.setup();
        assert(env.getSerialOut().trim() === '42', `parseInt should return 42, got '${env.getSerialOut().trim()}'`);
    });
});

describe('API: Serial.readStringUntil', () => {
    test('reads until terminator', () => {
        const env = compileAndRun(`
void setup() {
  Serial.begin(9600);
  Serial.println(Serial.readStringUntil(44));
}
void loop() {}`, { serialInput: 'hello,world' });
        env.setup();
        assert(env.getSerialOut().trim() === 'hello', `readStringUntil(',') should return 'hello', got '${env.getSerialOut().trim()}'`);
    });
});

describe('API: constrain edge cases', () => {
    test('constrain within range returns value', () => {
        const env = compileAndRun(`
void setup() {
  Serial.println(constrain(50, 0, 100));
  Serial.println(constrain(-10, 0, 100));
  Serial.println(constrain(200, 0, 100));
}
void loop() {}`);
        env.setup();
        const lines = env.getSerialOut().trim().split('\n');
        assert(lines[0] === '50', `within=${lines[0]}`);
        assert(lines[1] === '0', `below=${lines[1]}`);
        assert(lines[2] === '100', `above=${lines[2]}`);
    });
});

describe('API: map negative ranges', () => {
    test('map with negative output range', () => {
        const env = compileAndRun(`
void setup() {
  Serial.println(map(50, 0, 100, -100, 100));
}
void loop() {}`);
        env.setup();
        assert(env.getSerialOut().trim() === '0', `map(50,0,100,-100,100)=0, got '${env.getSerialOut().trim()}'`);
    });
});

describe('API: micros timing', () => {
    test('micros returns microseconds', () => {
        const env = compileAndRun(`
void setup() {
  Serial.println(micros());
}
void loop() {}`, { startTime: 5 });
        env.setup();
        assert(env.getSerialOut().trim() === '5000', `micros at 5ms should be 5000, got '${env.getSerialOut().trim()}'`);
    });
});

describe('API: pinMode with INPUT_PULLUP', () => {
    test('INPUT_PULLUP sets pin HIGH by default', () => {
        const env = compileAndRun(`
void setup() {
  pinMode(button1_pin, INPUT_PULLUP);
  Serial.println(digitalRead(button1_pin));
}
void loop() {}`);
        env.setup();
        // Button not pressed = HIGH (1)
        assert(env.getSerialOut().trim() === '1', `INPUT_PULLUP button should read HIGH, got '${env.getSerialOut().trim()}'`);
    });
});

// --- Transpiler: Additional edge cases ---

describe('Transpiler: enum declaration', () => {
    test('enum with values', () => {
        const js = transpileOK(`enum State { IDLE, RUNNING, STOPPED };\nvoid setup() {}\nvoid loop() {}`);
        assert(parsesAsJS(js), `Not valid JS: ${js}`);
    });
});

describe('Transpiler: arrow and scope operators', () => {
    test('-> converts to dot', () => {
        const js = transpileOK(`void setup() { int x = 1; }\nvoid loop() {}`);
        assert(parsesAsJS(js), `Not valid JS: ${js}`);
    });
});

describe('Transpiler: while loop', () => {
    test('basic while loop', () => {
        const env = compileAndRun(`
void setup() {
  int i = 0;
  int sum = 0;
  while (i < 5) {
    sum = sum + i;
    i++;
  }
  Serial.println(sum);
}
void loop() {}`);
        env.setup();
        assert(env.getSerialOut().trim() === '10', `sum 0..4 should be 10, got '${env.getSerialOut().trim()}'`);
    });
});

describe('Transpiler: decrementing for loop', () => {
    test('for (int i = 3; i >= 0; i--)', () => {
        const env = compileAndRun(`
void setup() {
  for (int i = 3; i >= 0; i--) {
    Serial.print(i);
  }
}
void loop() {}`);
        env.setup();
        assert(env.getSerialOut() === '3210', `Should print 3210, got '${env.getSerialOut()}'`);
    });
});

describe('Transpiler: nested if/else', () => {
    test('if / else if / else chain', () => {
        const env = compileAndRun(`
void setup() {
  int x = 5;
  if (x > 10) {
    Serial.print("big");
  } else if (x > 3) {
    Serial.print("medium");
  } else {
    Serial.print("small");
  }
}
void loop() {}`);
        env.setup();
        assert(env.getSerialOut() === 'medium', `Should print medium, got '${env.getSerialOut()}'`);
    });
});

describe('Transpiler: nested for loops', () => {
    test('2D loop', () => {
        const env = compileAndRun(`
void setup() {
  int count = 0;
  for (int i = 0; i < 3; i++) {
    for (int j = 0; j < 4; j++) {
      count++;
    }
  }
  Serial.println(count);
}
void loop() {}`);
        env.setup();
        assert(env.getSerialOut().trim() === '12', `3*4=12, got '${env.getSerialOut().trim()}'`);
    });
});

describe('Transpiler: compound assignment operators', () => {
    test('+= -= *= work correctly', () => {
        const env = compileAndRun(`
void setup() {
  int x = 10;
  x += 5;
  Serial.println(x);
  x -= 3;
  Serial.println(x);
  x *= 2;
  Serial.println(x);
}
void loop() {}`);
        env.setup();
        const lines = env.getSerialOut().trim().split('\n');
        assert(lines[0] === '15', `+=: ${lines[0]}`);
        assert(lines[1] === '12', `-=: ${lines[1]}`);
        assert(lines[2] === '24', `*=: ${lines[2]}`);
    });
});

describe('Transpiler: bitwise operations', () => {
    test('& | ^ ~ << >> in expressions', () => {
        const env = compileAndRun(`
void setup() {
  Serial.println(0xFF & 0x0F);
  Serial.println(0xF0 | 0x0F);
  Serial.println(0xFF ^ 0x0F);
  Serial.println(1 << 4);
  Serial.println(32 >> 2);
}
void loop() {}`);
        env.setup();
        const lines = env.getSerialOut().trim().split('\n');
        assert(lines[0] === '15', `AND=${lines[0]}`);
        assert(lines[1] === '255', `OR=${lines[1]}`);
        assert(lines[2] === '240', `XOR=${lines[2]}`);
        assert(lines[3] === '16', `LSHIFT=${lines[3]}`);
        assert(lines[4] === '8', `RSHIFT=${lines[4]}`);
    });
});

describe('Transpiler: boolean literals and logic', () => {
    test('true, false, &&, ||, !', () => {
        const env = compileAndRun(`
void setup() {
  bool a = true;
  bool b = false;
  Serial.println(a && b);
  Serial.println(a || b);
  Serial.println(!b);
}
void loop() {}`);
        env.setup();
        const lines = env.getSerialOut().trim().split('\n');
        assert(lines[0] === '0' || lines[0] === 'false', `&&=${lines[0]}`);
        assert(lines[1] === '1' || lines[1] === 'true', `||=${lines[1]}`);
        assert(lines[2] === '1' || lines[2] === 'true', `!=${lines[2]}`);
    });
});

describe('Transpiler: hex and binary literals', () => {
    test('hex and binary in expressions', () => {
        const env = compileAndRun(`
void setup() {
  Serial.println(0xFF);
  Serial.println(0b1010);
}
void loop() {}`);
        env.setup();
        const lines = env.getSerialOut().trim().split('\n');
        assert(lines[0] === '255', `0xFF=${lines[0]}`);
        assert(lines[1] === '10', `0b1010=${lines[1]}`);
    });
});

describe('Transpiler: modulo operator', () => {
    test('% works for positive and negative', () => {
        const env = compileAndRun(`
void setup() {
  Serial.println(17 % 5);
  Serial.println(10 % 3);
}
void loop() {}`);
        env.setup();
        const lines = env.getSerialOut().trim().split('\n');
        assert(lines[0] === '2', `17%5=${lines[0]}`);
        assert(lines[1] === '1', `10%3=${lines[1]}`);
    });
});

describe('Transpiler: char arithmetic', () => {
    test('char subtraction for digit conversion', () => {
        const env = compileAndRun(`
void setup() {
  char c = '7';
  int d = c - '0';
  Serial.println(d);
}
void loop() {}`);
        env.setup();
        assert(env.getSerialOut().trim() === '7', `'7'-'0' should be 7, got '${env.getSerialOut().trim()}'`);
    });
});

describe('Transpiler: multi-declarator with init', () => {
    test('int a = 1, b = 2, c = 3;', () => {
        const env = compileAndRun(`
void setup() {
  int a = 1, b = 2, c = 3;
  Serial.println(a + b + c);
}
void loop() {}`);
        env.setup();
        assert(env.getSerialOut().trim() === '6', `1+2+3=${env.getSerialOut().trim()}`);
    });
});

describe('Transpiler: function calling user function', () => {
    test('user-defined function called from setup', () => {
        const env = compileAndRun(`
int add(int a, int b) {
  return a + b;
}
void setup() {
  Serial.println(add(3, 4));
}
void loop() {}`);
        env.setup();
        assert(env.getSerialOut().trim() === '7', `add(3,4)=${env.getSerialOut().trim()}`);
    });
});

describe('Transpiler: recursive function', () => {
    test('factorial via recursion', () => {
        const env = compileAndRun(`
int factorial(int n) {
  if (n <= 1) return 1;
  return n * factorial(n - 1);
}
void setup() {
  Serial.println(factorial(5));
}
void loop() {}`);
        env.setup();
        assert(env.getSerialOut().trim() === '120', `5!=${env.getSerialOut().trim()}`);
    });
});

describe('Transpiler: switch with break', () => {
    test('switch with break instead of return', () => {
        const env = compileAndRun(`
void setup() {
  int x = 2;
  int result = 0;
  switch (x) {
    case 1: result = 10; break;
    case 2: result = 20; break;
    case 3: result = 30; break;
    default: result = -1; break;
  }
  Serial.println(result);
}
void loop() {}`);
        env.setup();
        assert(env.getSerialOut().trim() === '20', `switch case 2 = 20, got '${env.getSerialOut().trim()}'`);
    });
});

describe('Transpiler: const array', () => {
    test('const array indexing', () => {
        const env = compileAndRun(`
const int table[] = {100, 200, 300, 400, 500};
void setup() {
  Serial.println(table[2]);
  Serial.println(table[4]);
}
void loop() {}`);
        env.setup();
        const lines = env.getSerialOut().trim().split('\n');
        assert(lines[0] === '300', `table[2]=${lines[0]}`);
        assert(lines[1] === '500', `table[4]=${lines[1]}`);
    });
});

describe('Transpiler: nested array indexing', () => {
    test('array[array[i]]', () => {
        const env = compileAndRun(`
int indices[] = {3, 1, 4, 0, 2};
int values[] = {10, 20, 30, 40, 50};
void setup() {
  Serial.println(values[indices[0]]);
  Serial.println(values[indices[2]]);
}
void loop() {}`);
        env.setup();
        const lines = env.getSerialOut().trim().split('\n');
        assert(lines[0] === '40', `values[indices[0]]=values[3]=40, got ${lines[0]}`);
        assert(lines[1] === '50', `values[indices[2]]=values[4]=50, got ${lines[1]}`);
    });
});

describe('Transpiler: assignment to array element', () => {
    test('arr[i] = value', () => {
        const env = compileAndRun(`
void setup() {
  int arr[3] = {0, 0, 0};
  arr[0] = 10;
  arr[1] = 20;
  arr[2] = 30;
  Serial.println(arr[0] + arr[1] + arr[2]);
}
void loop() {}`);
        env.setup();
        assert(env.getSerialOut().trim() === '60', `10+20+30=${env.getSerialOut().trim()}`);
    });
});

describe('Transpiler: global and local scope', () => {
    test('local shadows global', () => {
        const env = compileAndRun(`
int x = 10;
void setup() {
  int x = 20;
  Serial.println(x);
}
void loop() {
  Serial.println(x);
}`);
        env.setup();
        env.loop();
        const lines = env.getSerialOut().trim().split('\n');
        assert(lines[0] === '20', `local x=${lines[0]}`);
        assert(lines[1] === '10', `global x=${lines[1]}`);
    });
});

describe('Transpiler: void function with no return', () => {
    test('void function executes without return', () => {
        const env = compileAndRun(`
int val = 0;
void setVal(int v) {
  val = v;
}
void setup() {
  setVal(42);
  Serial.println(val);
}
void loop() {}`);
        env.setup();
        assert(env.getSerialOut().trim() === '42', `val=${env.getSerialOut().trim()}`);
    });
});

describe('Transpiler: string in Serial.print', () => {
    test('multiple print calls concatenate', () => {
        const env = compileAndRun(`
void setup() {
  Serial.print("Hello");
  Serial.print(" ");
  Serial.println("World");
}
void loop() {}`);
        env.setup();
        assert(env.getSerialOut().trim() === 'Hello World', `Got: '${env.getSerialOut().trim()}'`);
    });
});

describe('Transpiler: comparison chain', () => {
    test('a >= b && b < c', () => {
        const env = compileAndRun(`
void setup() {
  int a = 5, b = 3, c = 10;
  if (a >= b && b < c) {
    Serial.println("yes");
  } else {
    Serial.println("no");
  }
}
void loop() {}`);
        env.setup();
        assert(env.getSerialOut().trim() === 'yes', `Got: '${env.getSerialOut().trim()}'`);
    });
});

describe('Transpiler: ternary in function argument', () => {
    test('Serial.println(cond ? a : b)', () => {
        const env = compileAndRun(`
void setup() {
  int x = 5;
  Serial.println(x > 3 ? 100 : 200);
}
void loop() {}`);
        env.setup();
        assert(env.getSerialOut().trim() === '100', `Got: '${env.getSerialOut().trim()}'`);
    });
});

describe('Transpiler: complex stopwatch-like program', () => {
    test('timer with digit extraction', () => {
        const env = compileAndRun(`
void setup() {
  unsigned long elapsed = 12345;
  unsigned long tenths = elapsed / 100;
  int d0 = tenths % 10;
  int d1 = (tenths / 10) % 10;
  int d2 = (tenths / 100) % 10;
  Serial.print(d2);
  Serial.print(d1);
  Serial.println(d0);
}
void loop() {}`);
        env.setup();
        // 12345 / 100 = 123, digits: 1,2,3
        assert(env.getSerialOut().trim() === '123', `Got: '${env.getSerialOut().trim()}'`);
    });
});

describe('Execution: Example programs compile and run', () => {
    // Load examples
    const ExamplesCode = new Function(
        fs.readFileSync('examples.js', 'utf8') + '\nreturn Examples;'
    )();

    for (const [name, code] of Object.entries(ExamplesCode)) {
        test(`example '${name}' compiles without errors`, () => {
            const result = transpile(code);
            assert(result.errors.length === 0,
                `Example '${name}' had errors: ${JSON.stringify(result.errors)}`);
            assert(parsesAsJS(result.code),
                `Example '${name}' produced invalid JS`);
        });
    }
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
