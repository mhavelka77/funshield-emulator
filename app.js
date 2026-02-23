/**
 * Main Application
 * 
 * Connects the UI elements to the emulator engine, handles button interactions,
 * display rendering, serial monitor, and compile/run controls.
 */

const App = (function () {
    'use strict';

    // =========================================================================
    // Editor Abstraction — CodeMirror or textarea fallback
    // =========================================================================
    const textareaEl = document.getElementById('code-editor');

    // Default editor API backed by the textarea
    let editor = {
        getValue() { return textareaEl.value; },
        setValue(code) { textareaEl.value = code; },
        setErrors(_errors) {},
        setWarnings(_warnings) {},
        clearErrors() {},
        focus() { textareaEl.focus(); },
    };

    // =========================================================================
    // DOM References
    // =========================================================================
    const codeEditor = textareaEl; // keep for backward compat (keyboard handler ref)
    const exampleSelect = document.getElementById('example-select');
    const btnCompile = document.getElementById('btn-compile');
    const btnStop = document.getElementById('btn-stop');
    const btnReset = document.getElementById('btn-reset');
    const statusIndicator = document.getElementById('status-indicator');
    const compilerMessages = document.getElementById('compiler-messages');
    const serialOutput = document.getElementById('serial-output');
    const serialInput = document.getElementById('serial-input');
    const serialSend = document.getElementById('serial-send');
    const serialClear = document.getElementById('serial-clear');
    const trimmer = document.getElementById('trimmer');
    const trimmerValue = document.getElementById('trimmer-value');

    // Execution controls
    const speedSlider = document.getElementById('speed-slider');
    const speedValueEl = document.getElementById('speed-value');
    const btnPause = document.getElementById('btn-pause');
    const btnStep = document.getElementById('btn-step');
    const loopCounterEl = document.getElementById('loop-counter');
    const millisClockEl = document.getElementById('millis-clock');

    // Buzzer indicator
    const buzzerIndicator = document.getElementById('buzzer-indicator');
    const buzzerFreqEl = document.getElementById('buzzer-freq');

    // LED elements
    const ledEls = [
        document.getElementById('led-1'),
        document.getElementById('led-2'),
        document.getElementById('led-3'),
        document.getElementById('led-4'),
    ];

    // Button elements
    const hwBtnEls = [
        document.getElementById('hw-btn-1'),
        document.getElementById('hw-btn-2'),
        document.getElementById('hw-btn-3'),
    ];

    // 7-segment digit containers
    const digitEls = [
        document.getElementById('digit-0'),
        document.getElementById('digit-1'),
        document.getElementById('digit-2'),
        document.getElementById('digit-3'),
    ];

    // =========================================================================
    // Compiler Output Helpers
    // =========================================================================
    function clearCompilerOutput() {
        compilerMessages.innerHTML = '';
    }

    function logCompiler(text, className) {
        const line = document.createElement('div');
        line.className = className || '';
        line.textContent = text;
        compilerMessages.appendChild(line);
        compilerMessages.scrollTop = compilerMessages.scrollHeight;
    }

    // =========================================================================
    // Status Management
    // =========================================================================
    function setStatus(text, className) {
        statusIndicator.textContent = text;
        statusIndicator.className = className || '';
    }

    function updateButtonStates(isRunning) {
        btnCompile.disabled = isRunning;
        btnStop.disabled = !isRunning;
        btnReset.disabled = !isRunning;
        exampleSelect.disabled = isRunning;
        if (btnPause) btnPause.disabled = !isRunning;
        if (btnStep) btnStep.disabled = !isRunning;
        if (!isRunning && btnPause) {
            btnPause.textContent = 'Pause';
            btnPause.classList.remove('paused');
        }
    }

    // =========================================================================
    // 7-Segment Display Rendering
    // =========================================================================
    // Segment bit positions (in the glyph byte, active LOW):
    // Bit 0 = a (top)
    // Bit 1 = b (top right)
    // Bit 2 = c (bottom right)
    // Bit 3 = d (bottom)
    // Bit 4 = e (bottom left)
    // Bit 5 = f (top left)
    // Bit 6 = g (middle)
    // Bit 7 = dp (decimal point)
    const SEG_MAP = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'dp'];

    function updateDisplayDigit(position, glyph, brightness) {
        if (position < 0 || position > 3) return;
        const digitEl = digitEls[position];
        if (!digitEl) return;

        for (let i = 0; i < 8; i++) {
            const segName = SEG_MAP[i];
            // Find the segment element by data-seg attribute
            const segEl = digitEl.querySelector(`[data-seg="${segName}"]`);
            if (segEl) {
                // Active LOW: bit=0 means segment is ON
                const isOn = !(glyph & (1 << i));
                if (isOn && brightness > 0.1) {
                    segEl.classList.add('lit');
                    segEl.style.opacity = brightness;
                } else {
                    segEl.classList.remove('lit');
                    segEl.style.opacity = '';
                }
            }
        }
    }

    function clearDisplay() {
        for (let pos = 0; pos < 4; pos++) {
            updateDisplayDigit(pos, 0xFF, 0);
        }
    }

    // =========================================================================
    // LED Rendering
    // =========================================================================
    function updateLed(index, isOn, brightness) {
        if (index >= 0 && index < 4 && ledEls[index]) {
            if (isOn) {
                ledEls[index].classList.add('on');
                // PWM brightness support (0.0 to 1.0)
                if (brightness !== undefined && brightness < 1.0) {
                    ledEls[index].style.opacity = brightness;
                } else {
                    ledEls[index].style.opacity = '';
                }
            } else {
                ledEls[index].classList.remove('on');
                ledEls[index].style.opacity = '';
            }
        }
    }

    function clearLeds() {
        ledEls.forEach(el => el.classList.remove('on'));
    }

    // =========================================================================
    // Serial Monitor
    // =========================================================================
    function appendSerialOutput(text) {
        serialOutput.textContent += text;
        serialOutput.scrollTop = serialOutput.scrollHeight;
    }

    function clearSerialOutput() {
        serialOutput.textContent = '';
    }

    // =========================================================================
    // Hardware Callbacks - Connect Arduino API to UI
    // =========================================================================
    function connectHardwareCallbacks() {
        const hw = ArduinoAPI.getState();

        hw.onLedChange = function (index, isOn, brightness) {
            updateLed(index, isOn, brightness);
        };

        hw.onDisplayChange = function (display) {
            for (let i = 0; i < 4; i++) {
                updateDisplayDigit(i, display.positions[i].glyph, display.positions[i].brightness);
            }
        };

        hw.onBuzzerChange = function (buzzer) {
            if (buzzerIndicator) {
                if (buzzer.active) {
                    buzzerIndicator.classList.add('active');
                    if (buzzerFreqEl) {
                        buzzerFreqEl.textContent = buzzer.frequency ? `${buzzer.frequency}Hz` : '';
                    }
                } else {
                    buzzerIndicator.classList.remove('active');
                    if (buzzerFreqEl) buzzerFreqEl.textContent = '';
                }
            }
        };

        hw.serial.onOutput = function (text) {
            appendSerialOutput(text);
        };
    }

    // =========================================================================
    // Compile & Run
    // =========================================================================
    function doCompileAndRun() {
        // Stop any existing program
        Emulator.stop();
        clearDisplay();
        clearLeds();
        clearCompilerOutput();
        clearSerialOutput();

        const source = editor.getValue();

        setStatus('Compiling...', '');
        logCompiler('Compiling sketch...', 'info');
        editor.clearErrors();

        // Small delay so UI updates
        setTimeout(() => {
            const result = Emulator.compile(source);

            // Show warnings
            for (const w of result.warnings) {
                logCompiler(`Warning: ${w.message}`, 'warning');
            }
            if (result.warnings.length > 0) {
                editor.setWarnings(result.warnings);
            }

            if (!result.success) {
                // Show errors
                for (const e of result.errors) {
                    logCompiler(`Error: ${e.message}`, 'error');
                }
                editor.setErrors(result.errors);
                setStatus('Compilation Failed', 'error');
                updateButtonStates(false);
                return;
            }

            logCompiler('Compilation successful.', 'success');
            logCompiler('Uploading to board...', 'info');

            setTimeout(() => {
                logCompiler('Upload complete. Running...', 'success');
                setStatus('Running', 'running');
                updateButtonStates(true);

                // Connect hardware callbacks
                connectHardwareCallbacks();

                // Start execution
                Emulator.run((errorMsg) => {
                    logCompiler(`Runtime Error: ${errorMsg}`, 'error');
                    setStatus('Error', 'error');
                    updateButtonStates(false);
                });
            }, 100);
        }, 50);
    }

    function doStop() {
        Emulator.stop();
        setStatus('Stopped', '');
        updateButtonStates(false);
        logCompiler('Program stopped.', 'info');
        // Clear buzzer indicator
        if (buzzerIndicator) buzzerIndicator.classList.remove('active');
        if (buzzerFreqEl) buzzerFreqEl.textContent = '';
    }

    function doReset() {
        clearDisplay();
        clearLeds();
        clearSerialOutput();
        logCompiler('Resetting...', 'info');

        const source = editor.getValue();
        const result = Emulator.reset(source, (errorMsg) => {
            logCompiler(`Runtime Error: ${errorMsg}`, 'error');
            setStatus('Error', 'error');
            updateButtonStates(false);
        });

        if (result.success) {
            connectHardwareCallbacks();
            setStatus('Running', 'running');
            updateButtonStates(true);
            logCompiler('Reset complete. Running...', 'success');
        } else {
            for (const e of result.errors) {
                logCompiler(`Error: ${e.message}`, 'error');
            }
            setStatus('Compilation Failed', 'error');
            updateButtonStates(false);
        }
    }

    // =========================================================================
    // Button Interaction (mousedown/mouseup + touch + keyboard)
    // =========================================================================
    function setupButtonInteraction(el, index) {
        function press() {
            ArduinoAPI.setButtonState(index, true);
            el.classList.add('pressed');
        }
        function release() {
            ArduinoAPI.setButtonState(index, false);
            el.classList.remove('pressed');
        }

        el.addEventListener('mousedown', (e) => { e.preventDefault(); press(); });
        el.addEventListener('mouseup', (e) => { e.preventDefault(); release(); });
        el.addEventListener('mouseleave', (e) => { release(); });

        el.addEventListener('touchstart', (e) => { e.preventDefault(); press(); });
        el.addEventListener('touchend', (e) => { e.preventDefault(); release(); });
        el.addEventListener('touchcancel', (e) => { release(); });
    }

    // Keyboard shortcuts for buttons: 1, 2, 3
    const keyButtonMap = { '1': 0, '2': 1, '3': 2 };
    const activeKeys = {};

    document.addEventListener('keydown', (e) => {
        // Don't capture if typing in editor or serial input
        const editorContainer = document.getElementById('cm-editor-container');
        if (e.target === codeEditor || e.target === serialInput) return;
        if (editorContainer && editorContainer.contains(e.target)) return;

        if (e.key in keyButtonMap && !activeKeys[e.key]) {
            activeKeys[e.key] = true;
            const idx = keyButtonMap[e.key];
            ArduinoAPI.setButtonState(idx, true);
            hwBtnEls[idx].classList.add('pressed');
        }
    });

    document.addEventListener('keyup', (e) => {
        if (e.key in keyButtonMap) {
            activeKeys[e.key] = false;
            const idx = keyButtonMap[e.key];
            ArduinoAPI.setButtonState(idx, false);
            hwBtnEls[idx].classList.remove('pressed');
        }
    });

    // =========================================================================
    // Trimmer Interaction
    // =========================================================================
    trimmer.addEventListener('input', () => {
        const val = parseInt(trimmer.value);
        ArduinoAPI.setTrimmerValue(val);
        trimmerValue.textContent = val;
    });

    // =========================================================================
    // Serial Monitor Interaction
    // =========================================================================
    serialSend.addEventListener('click', () => {
        const text = serialInput.value;
        if (text) {
            ArduinoAPI.sendSerialData(text + '\n');
            serialInput.value = '';
        }
    });

    serialInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            serialSend.click();
        }
    });

    serialClear.addEventListener('click', clearSerialOutput);

    // =========================================================================
    // Example Loader
    // =========================================================================
    exampleSelect.addEventListener('change', () => {
        const key = exampleSelect.value;
        if (key && Examples[key]) {
            editor.setValue(Examples[key]);
            editor.clearErrors();
        }
        exampleSelect.value = '';
    });

    // =========================================================================
    // Control Buttons
    // =========================================================================
    btnCompile.addEventListener('click', doCompileAndRun);
    btnStop.addEventListener('click', doStop);
    btnReset.addEventListener('click', doReset);

    // =========================================================================
    // Execution Controls: Speed, Pause, Step, Stats
    // =========================================================================
    if (speedSlider) {
        // Speed slider: value 1-20, maps to 0.05x-2.0x
        // 10 = 1x (default)
        function updateSpeed() {
            const val = parseInt(speedSlider.value);
            let mult;
            if (val <= 10) {
                // 1-10 maps to 0.05-1.0
                mult = val / 10;
            } else {
                // 11-20 maps to 1.0-2.0
                mult = 1.0 + (val - 10) / 10;
            }
            Emulator.setSpeed(mult);
            if (speedValueEl) {
                if (mult < 1) {
                    speedValueEl.textContent = `${mult.toFixed(1)}x`;
                } else {
                    speedValueEl.textContent = `${mult.toFixed(1)}x`;
                }
            }
        }
        speedSlider.addEventListener('input', updateSpeed);
        updateSpeed(); // set initial
    }

    if (btnPause) {
        btnPause.addEventListener('click', () => {
            if (Emulator.isPaused()) {
                Emulator.resume();
                btnPause.textContent = 'Pause';
                btnPause.classList.remove('paused');
                setStatus('Running', 'running');
            } else {
                Emulator.pause();
                btnPause.textContent = 'Resume';
                btnPause.classList.add('paused');
                setStatus('Paused', 'warning');
            }
        });
    }

    if (btnStep) {
        btnStep.addEventListener('click', () => {
            if (!Emulator.isPaused()) {
                // Auto-pause first
                Emulator.pause();
                if (btnPause) {
                    btnPause.textContent = 'Resume';
                    btnPause.classList.add('paused');
                }
                setStatus('Paused', 'warning');
            }
            Emulator.step();
        });
    }

    // Stats callback — update loop counter and millis clock
    Emulator.setStatsCallback(function (loops) {
        if (loopCounterEl) loopCounterEl.textContent = `Loops: ${loops.toLocaleString()}`;
        if (millisClockEl) {
            const hw = ArduinoAPI.getState();
            const ms = Math.floor(performance.now() - hw.startTime);
            if (ms >= 1000) {
                millisClockEl.textContent = `Time: ${(ms / 1000).toFixed(1)}s`;
            } else {
                millisClockEl.textContent = `Time: ${Math.round(ms)}ms`;
            }
        }
    });

    // Keyboard shortcut: Ctrl+Enter to compile and run
    document.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
            e.preventDefault();
            if (!Emulator.isRunning()) {
                doCompileAndRun();
            }
        }
        // Escape to stop
        if (e.key === 'Escape' && Emulator.isRunning()) {
            doStop();
        }
    });

    // =========================================================================
    // Tab key support in editor (textarea fallback only)
    // =========================================================================
    if (textareaEl && textareaEl.style.display !== 'none') {
        textareaEl.addEventListener('keydown', (e) => {
            if (e.key === 'Tab') {
                e.preventDefault();
                const start = textareaEl.selectionStart;
                const end = textareaEl.selectionEnd;
                textareaEl.value = textareaEl.value.substring(0, start) + '  ' + textareaEl.value.substring(end);
                textareaEl.selectionStart = textareaEl.selectionEnd = start + 2;
            }
        });
    }

    // =========================================================================
    // Button setup
    // =========================================================================
    hwBtnEls.forEach((el, index) => {
        setupButtonInteraction(el, index);
    });

    // =========================================================================
    // Initialize
    // =========================================================================
    setStatus('Ready', '');
    updateButtonStates(false);
    logCompiler('Arduino + FunShield Emulator ready.', 'info');
    logCompiler('Press "Compile & Upload" or Ctrl+Enter to run your code.', 'info');
    logCompiler('Use keys 1, 2, 3 to press FunShield buttons (when not typing in editor).', 'info');

    // =========================================================================
    // Public API for CodeMirror integration
    // =========================================================================
    return {
        /**
         * Replace the default textarea editor with a custom editor API.
         * The editor object must have: getValue(), setValue(code), setErrors(arr),
         * setWarnings(arr), clearErrors(), focus()
         */
        setEditor(editorApi) {
            editor = editorApi;
        },
        compile: doCompileAndRun,
    };

})();
