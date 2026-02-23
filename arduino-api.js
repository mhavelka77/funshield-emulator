/**
 * Arduino API Emulation Layer
 * 
 * Provides all standard Arduino functions and constants, plus the FunShield
 * hardware emulation (shift register, 7-segment display, LEDs, buttons, trimmer).
 * 
 * The API is injected into the transpiled code's execution scope so that
 * calls like digitalWrite(13, HIGH) work identically to real hardware.
 */

const ArduinoAPI = (() => {

    // =========================================================================
    // Arduino Constants
    // =========================================================================
    const HIGH = 1;
    const LOW = 0;
    const INPUT = 0;
    const OUTPUT = 1;
    const INPUT_PULLUP = 2;

    const LED_BUILTIN = 13;

    // Analog pins as numeric identifiers
    const A0 = 54;
    const A1 = 55;
    const A2 = 56;
    const A3 = 57;
    const A4 = 58;
    const A5 = 59;

    // Bit order for shiftOut
    const LSBFIRST = 0;
    const MSBFIRST = 1;

    // =========================================================================
    // FunShield Constants (from funshield.h)
    // =========================================================================
    const ON = LOW;   // Active low
    const OFF = HIGH;

    // 7-seg shift register pins
    const latch_pin = 4;
    const clock_pin = 7;
    const data_pin = 8;

    // Buzzer
    const beep_pin = 3;

    // LEDs (active low - ON=LOW, OFF=HIGH)
    const led1_pin = 13;
    const led2_pin = 12;
    const led3_pin = 11;
    const led4_pin = 10;

    // Buttons (active low - pressed=LOW, released=HIGH)
    const button1_pin = A1; // 55
    const button2_pin = A2; // 56
    const button3_pin = A3; // 57

    // Trimmer
    const trimmer_pin = A0; // 54

    // 7-segment digit glyphs (active low segments)
    // Bit layout: dp g f e d c b a  (bit 7 = dp, bit 0 = a)
    const digits = [0xc0, 0xf9, 0xa4, 0xb0, 0x99, 0x92, 0x82, 0xf8, 0x80, 0x90];
    const empty_glyph = 0xff;

    // Additional character glyphs for the 7-seg display
    // Letters that can be displayed on 7-seg
    const CHAR_GLYPHS = {
        '0': 0xc0, '1': 0xf9, '2': 0xa4, '3': 0xb0, '4': 0x99,
        '5': 0x92, '6': 0x82, '7': 0xf8, '8': 0x80, '9': 0x90,
        'a': 0x88, 'A': 0x88,
        'b': 0x83, 'B': 0x83,
        'c': 0xc6, 'C': 0xc6,
        'd': 0xa1, 'D': 0xa1,
        'e': 0x86, 'E': 0x86,
        'f': 0x8e, 'F': 0x8e,
        'g': 0x90, 'G': 0x90,
        'h': 0x89, 'H': 0x89,
        'i': 0xf9, 'I': 0xf9,
        'j': 0xf1, 'J': 0xf1,
        'l': 0xc7, 'L': 0xc7,
        'n': 0xab, 'N': 0xab,
        'o': 0xa3, 'O': 0xc0,
        'p': 0x8c, 'P': 0x8c,
        'r': 0xaf, 'R': 0xaf,
        's': 0x92, 'S': 0x92,
        't': 0x87, 'T': 0x87,
        'u': 0xc1, 'U': 0xc1,
        'y': 0x91, 'Y': 0x91,
        '-': 0xbf,
        '_': 0xf7,
        ' ': 0xff,
        '.': 0x7f,
    };

    // =========================================================================
    // Hardware State
    // =========================================================================
    function createHardwareState() {
        return {
            // Pin state
            pinModes: new Array(70).fill(INPUT),
            pinValues: new Array(70).fill(LOW),

            // Timing
            startTime: 0,           // When the program started (performance.now())
            
            // Shift register state for 7-seg display
            shiftRegister: {
                bytes: [],           // All bytes shifted since last latch
                latchState: HIGH,    // Current latch pin state
            },

            // 7-segment display state (what's currently visible)
            display: {
                // Each position stores: { glyph, timestamp }
                // We track the last written glyph per position for multiplexing
                positions: [
                    { glyph: 0xff, lastUpdate: 0, brightness: 0 },
                    { glyph: 0xff, lastUpdate: 0, brightness: 0 },
                    { glyph: 0xff, lastUpdate: 0, brightness: 0 },
                    { glyph: 0xff, lastUpdate: 0, brightness: 0 },
                ],

            },

            // LED states
            leds: [false, false, false, false], // LED1-4 on/off

            // Button states (set by UI)
            buttons: [false, false, false], // BTN1-3 pressed?

            // Trimmer value (set by UI)
            trimmerValue: 512,

            // Buzzer
            buzzer: { active: false, frequency: 0 },

            // Serial
            serial: {
                begun: false,
                baudRate: 0,
                outputBuffer: '',
                inputBuffer: '',
                onOutput: null,     // Callback when serial data is printed
            },

            // Callbacks for UI updates
            onLedChange: null,
            onDisplayChange: null,
            onBuzzerChange: null,
        };
    }

    let hw = createHardwareState();

    // =========================================================================
    // Timing Functions
    // =========================================================================
    function millis() {
        return Math.floor(performance.now() - hw.startTime);
    }

    function micros() {
        return Math.floor((performance.now() - hw.startTime) * 1000);
    }

    function delay(ms) {
        // In the course, delay() is prohibited. We log a warning but still
        // implement it as a busy-wait approximation (non-blocking, just advances time).
        // This should NOT be used, but won't hang the browser.
        console.warn('delay() is prohibited in this course. Use millis()-based timing instead.');
        const target = performance.now() + ms;
        // We can't actually block, so this is a no-op in the emulator
    }

    function delayMicroseconds(us) {
        console.warn('delayMicroseconds() is not recommended. Use micros()-based timing.');
    }

    // =========================================================================
    // Pin I/O Functions
    // =========================================================================
    function pinMode(pin, mode) {
        if (pin >= 0 && pin < hw.pinModes.length) {
            hw.pinModes[pin] = mode;
            // Buttons with INPUT_PULLUP should default to HIGH (not pressed)
            if (mode === INPUT_PULLUP) {
                hw.pinValues[pin] = HIGH;
            }
        }
    }

    function digitalWrite(pin, value) {
        if (pin >= 0 && pin < hw.pinValues.length) {
            hw.pinValues[pin] = value ? HIGH : LOW;

            // Check if this is an LED pin
            updateLedState(pin);

            // Check if this is the latch pin for shift register
            if (pin === latch_pin) {
                handleLatchChange(value);
            }

            // Buzzer
            if (pin === beep_pin) {
                hw.buzzer.active = (value === LOW); // Active low
                if (hw.onBuzzerChange) hw.onBuzzerChange(hw.buzzer);
            }
        }
    }

    function digitalRead(pin) {
        if (pin >= 0 && pin < hw.pinValues.length) {
            // Handle button reads
            if (pin === button1_pin) {
                return hw.buttons[0] ? LOW : HIGH; // Active low
            }
            if (pin === button2_pin) {
                return hw.buttons[1] ? LOW : HIGH;
            }
            if (pin === button3_pin) {
                return hw.buttons[2] ? LOW : HIGH;
            }
            return hw.pinValues[pin];
        }
        return LOW;
    }

    function analogRead(pin) {
        // Normalize: analogRead accepts both channel numbers (0-5) and pin
        // constants (A0-A5 = 54-59). Convert pin constants to channel numbers.
        let channel = pin >= 54 ? pin - 54 : pin;

        // Channel 0 = trimmer (A0)
        if (channel === 0) {
            return hw.trimmerValue;
        }
        // Channels 1-3 = buttons (A1-A3), read as analog (active low)
        if (channel >= 1 && channel <= 3) {
            return hw.buttons[channel - 1] ? 0 : 1023;
        }
        return 0;
    }

    function analogWrite(pin, value) {
        // PWM output (0-255)
        if (pin >= 0 && pin < hw.pinValues.length) {
            hw.pinValues[pin] = value;

            // For LED pins, map PWM value to brightness
            let ledIndex = -1;
            if (pin === led1_pin) ledIndex = 0;
            else if (pin === led2_pin) ledIndex = 1;
            else if (pin === led3_pin) ledIndex = 2;
            else if (pin === led4_pin) ledIndex = 3;

            if (ledIndex >= 0) {
                // LEDs are active LOW: 0 = full brightness, 255 = off
                const brightness = 1.0 - (value / 255);
                hw.leds[ledIndex] = brightness > 0;
                if (hw.onLedChange) {
                    hw.onLedChange(ledIndex, hw.leds[ledIndex], brightness);
                }
            } else if (pin === beep_pin) {
                // Buzzer: any nonzero PWM value = active
                hw.buzzer.active = value > 0;
                if (hw.onBuzzerChange) hw.onBuzzerChange(hw.buzzer);
            }
        }
    }

    // =========================================================================
    // Shift Register / 7-Segment Display
    // =========================================================================
    function shiftOut(dataPin, clockPin, bitOrder, value) {
        // This is the key function for driving the 7-seg display
        // The FunShield uses two cascaded 74HC595 shift registers:
        //   - First byte: segment data (which segments to light)
        //   - Second byte: digit select (which position to display on)
        
        value = value & 0xFF;
        hw.shiftRegister.bytes.push(value);
    }

    function handleLatchChange(newValue) {
        let oldValue = hw.shiftRegister.latchState;
        hw.shiftRegister.latchState = newValue;

        // On rising edge of latch (LOW -> HIGH), the shift register outputs update
        if (oldValue === LOW && newValue === HIGH) {
            processShiftRegisterOutput();
        }
        
        // On falling edge (HIGH -> LOW), we start collecting new bytes
        if (oldValue === HIGH && newValue === LOW) {
            hw.shiftRegister.bytes = [];
        }
    }

    function processShiftRegisterOutput() {
        let bytes = hw.shiftRegister.bytes;
        
        if (bytes.length >= 2) {
            // Standard FunShield protocol:
            // First shiftOut: segment data (which segments are on - active LOW)
            // Second shiftOut: digit select (which position - active HIGH, one-hot)
            let segmentData = bytes[0];
            let digitSelect = bytes[1];

            // Determine which digit position is selected
            // digitSelect is one-hot: 0x01=pos0, 0x02=pos1, 0x04=pos2, 0x08=pos3
            for (let pos = 0; pos < 4; pos++) {
                if (digitSelect & (1 << pos)) {
                    hw.display.positions[pos].glyph = segmentData;
                    hw.display.positions[pos].lastUpdate = performance.now();
                    hw.display.positions[pos].brightness = 1.0;
                }
            }

            if (hw.onDisplayChange) {
                hw.onDisplayChange(hw.display);
            }
        }
        // Single-byte shifts are ignored (protocol requires 2 bytes)

        hw.shiftRegister.bytes = [];
    }

    // =========================================================================
    // LED State Management
    // =========================================================================
    function updateLedState(pin) {
        let ledIndex = -1;
        if (pin === led1_pin) ledIndex = 0;
        else if (pin === led2_pin) ledIndex = 1;
        else if (pin === led3_pin) ledIndex = 2;
        else if (pin === led4_pin) ledIndex = 3;

        if (ledIndex >= 0) {
            // LEDs are active LOW on FunShield
            const isOn = (hw.pinValues[pin] === LOW);
            hw.leds[ledIndex] = isOn;
            if (hw.onLedChange) {
                // brightness: 1.0 for full on (digitalWrite LOW), 0.0 for off
                hw.onLedChange(ledIndex, isOn, isOn ? 1.0 : 0.0);
            }
        }
    }

    // =========================================================================
    // Serial Interface
    // =========================================================================
    const Serial = {
        begin(baudRate) {
            hw.serial.begun = true;
            hw.serial.baudRate = baudRate || 9600;
        },
        end() {
            hw.serial.begun = false;
        },
        print(value) {
            if (!hw.serial.begun) return;
            let str = String(value);
            hw.serial.outputBuffer += str;
            // Cap output buffer to prevent unbounded memory growth
            if (hw.serial.outputBuffer.length > 10000) {
                hw.serial.outputBuffer = hw.serial.outputBuffer.slice(-5000);
            }
            if (hw.serial.onOutput) hw.serial.onOutput(str);
        },
        println(value) {
            if (value === undefined) {
                Serial.print('\n');
            } else {
                Serial.print(String(value) + '\n');
            }
        },
        write(value) {
            Serial.print(String.fromCharCode(value & 0xFF));
        },
        available() {
            return hw.serial.inputBuffer.length;
        },
        read() {
            if (hw.serial.inputBuffer.length > 0) {
                let ch = hw.serial.inputBuffer.charCodeAt(0);
                hw.serial.inputBuffer = hw.serial.inputBuffer.substring(1);
                return ch;
            }
            return -1;
        },
        readString() {
            let s = hw.serial.inputBuffer;
            hw.serial.inputBuffer = '';
            // Strip trailing newline/carriage return (matches Arduino behavior)
            return s.replace(/[\r\n]+$/, '');
        },
        readStringUntil(terminator) {
            let idx = hw.serial.inputBuffer.indexOf(String.fromCharCode(terminator));
            if (idx === -1) return '';
            let s = hw.serial.inputBuffer.substring(0, idx);
            hw.serial.inputBuffer = hw.serial.inputBuffer.substring(idx + 1);
            return s;
        },
        peek() {
            if (hw.serial.inputBuffer.length > 0) {
                return hw.serial.inputBuffer.charCodeAt(0);
            }
            return -1;
        },
        parseInt() {
            let match = hw.serial.inputBuffer.match(/^\s*(-?\d+)/);
            if (match) {
                hw.serial.inputBuffer = hw.serial.inputBuffer.substring(match[0].length);
                return parseInt(match[1]);
            }
            return 0;
        },
        parseFloat() {
            let match = hw.serial.inputBuffer.match(/^\s*(-?\d+\.?\d*)/);
            if (match) {
                hw.serial.inputBuffer = hw.serial.inputBuffer.substring(match[0].length);
                return parseFloat(match[1]);
            }
            return 0.0;
        },
        flush() { /* no-op */ },
    };

    // =========================================================================
    // Math / Utility Functions
    // =========================================================================
    function constrain(x, a, b) { return Math.min(Math.max(x, a), b); }
    function map(value, fromLow, fromHigh, toLow, toHigh) {
        // Arduino's map() uses integer arithmetic (long), so division truncates
        return Math.trunc((value - fromLow) * (toHigh - toLow) / (fromHigh - fromLow) + toLow);
    }
    function min(a, b) { return Math.min(a, b); }
    function max(a, b) { return Math.max(a, b); }
    function abs(x) { return Math.abs(x); }
    function sq(x) { return x * x; }
    function sqrt(x) { return Math.sqrt(x); }
    function pow(base, exp) { return Math.pow(base, exp); }
    function sin(x) { return Math.sin(x); }
    function cos(x) { return Math.cos(x); }
    function tan(x) { return Math.tan(x); }
    function randomSeed(seed) { /* no-op, JS Math.random can't be seeded */ }
    function random(minOrMax, maxVal) {
        if (maxVal === undefined) {
            return Math.floor(Math.random() * minOrMax);
        }
        return Math.floor(Math.random() * (maxVal - minOrMax)) + minOrMax;
    }

    // =========================================================================
    // Bit Manipulation Functions
    // =========================================================================
    function bit(n) { return 1 << n; }
    function bitRead(value, bitNum) { return (value >> bitNum) & 1; }
    function bitSet(value, bitNum) { return value | (1 << bitNum); }
    function bitClear(value, bitNum) { return value & ~(1 << bitNum); }
    function bitWrite(value, bitNum, bitVal) {
        return bitVal ? bitSet(value, bitNum) : bitClear(value, bitNum);
    }
    function lowByte(w) { return w & 0xFF; }
    function highByte(w) { return (w >> 8) & 0xFF; }

    // =========================================================================
    // Tone Functions
    // =========================================================================
    function tone(pin, frequency, duration) {
        if (pin === beep_pin) {
            hw.buzzer.active = true;
            hw.buzzer.frequency = frequency;
            if (hw.onBuzzerChange) hw.onBuzzerChange(hw.buzzer);
        }
    }
    function noTone(pin) {
        if (pin === beep_pin) {
            hw.buzzer.active = false;
            hw.buzzer.frequency = 0;
            if (hw.onBuzzerChange) hw.onBuzzerChange(hw.buzzer);
        }
    }

    // =========================================================================
    // Sizeof helper
    // =========================================================================
    function __sizeof(x) {
        if (Array.isArray(x)) return x.length;
        if (typeof x === 'string') return x.length + 1; // +1 for null terminator
        return 2; // Default to int size (AVR is 16-bit)
    }

    // =========================================================================
    // Public Interface
    // =========================================================================
    function reset() {
        hw = createHardwareState();
    }

    function getState() {
        return hw;
    }

    function setButtonState(index, pressed) {
        if (index >= 0 && index < 3) {
            hw.buttons[index] = pressed;
        }
    }

    function setTrimmerValue(value) {
        hw.trimmerValue = constrain(value, 0, 1023);
    }

    function sendSerialData(data) {
        hw.serial.inputBuffer += data;
    }

    function setStartTime(t) {
        hw.startTime = t;
    }

    /**
     * Returns an object containing all Arduino API functions and constants
     * to be injected into the execution scope.
     */
    function getAPIScope() {
        return {
            // Constants
            HIGH, LOW, INPUT, OUTPUT, INPUT_PULLUP,
            LED_BUILTIN,
            A0, A1, A2, A3, A4, A5,
            LSBFIRST, MSBFIRST,
            ON, OFF,
            latch_pin, clock_pin, data_pin,
            beep_pin,
            led1_pin, led2_pin, led3_pin, led4_pin,
            button1_pin, button2_pin, button3_pin,
            trimmer_pin,
            digits, empty_glyph,

            // Pin I/O
            pinMode, digitalWrite, digitalRead,
            analogRead, analogWrite,

            // Shift register
            shiftOut,

            // Timing
            millis, micros, delay, delayMicroseconds,

            // Serial
            Serial,

            // Math
            constrain, map, min, max, abs, sq, sqrt, pow,
            sin, cos, tan, random, randomSeed,

            // Bit manipulation
            bit, bitRead, bitSet, bitClear, bitWrite,
            lowByte, highByte,

            // Tone
            tone, noTone,

            // Helpers
            __sizeof,
        };
    }

    return {
        reset,
        getState,
        getAPIScope,
        setButtonState,
        setTrimmerValue,
        sendSerialData,
        setStartTime,
        CHAR_GLYPHS,
    };

})();
