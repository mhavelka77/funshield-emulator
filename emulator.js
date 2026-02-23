/**
 * Emulator Engine
 * 
 * Manages the compile -> run -> loop cycle.
 * Takes transpiled JS code, wraps it with the Arduino API scope,
 * and runs setup() once followed by repeated loop() calls via requestAnimationFrame.
 */

const Emulator = (() => {
    let running = false;
    let paused = false;
    let animFrameId = null;
    let userSetup = null;
    let userLoop = null;
    let loopCount = 0;
    let errorCallback = null;
    let speedMultiplier = 1.0; // 0.1x to 2x
    let onStatsUpdate = null; // callback for UI stats updates

    // Display fade timer - for multiplexed 7-seg display
    // Segments fade out if not refreshed within ~5ms (simulates real persistence of vision)
    const DISPLAY_FADE_MS = 8;
    let displayFadeInterval = null;

    /**
     * Compile Arduino C++ source code and prepare it for execution.
     * Returns { success, errors, warnings }
     */
    function compile(sourceCode) {
        // Step 1: Transpile C++ to JS
        const result = ArduinoTranspiler.transpile(sourceCode);

        if (result.errors.length > 0) {
            return { success: false, errors: result.errors, warnings: result.warnings };
        }

        // Step 2: Try to evaluate the transpiled code
        try {
            // Reset hardware state
            ArduinoAPI.reset();

            // Build the execution environment
            const api = ArduinoAPI.getAPIScope();

            // Create a function that has all Arduino API in scope
            // We wrap the user code so that setup() and loop() are captured
            const wrappedCode = `
                "use strict";
                ${result.code}
                return { setup: typeof setup === 'function' ? setup : null, loop: typeof loop === 'function' ? loop : null };
            `;

            // Build parameter names and values from API
            const paramNames = Object.keys(api);
            const paramValues = Object.values(api);

            // Create the function with API injected as parameters
            const factory = new Function(...paramNames, wrappedCode);
            const exported = factory(...paramValues);

            if (!exported.setup) {
                return {
                    success: false,
                    errors: [{ line: 0, message: 'No setup() function found.' }],
                    warnings: result.warnings
                };
            }
            if (!exported.loop) {
                return {
                    success: false,
                    errors: [{ line: 0, message: 'No loop() function found.' }],
                    warnings: result.warnings
                };
            }

            userSetup = exported.setup;
            userLoop = exported.loop;

            return { success: true, errors: [], warnings: result.warnings };

        } catch (e) {
            return {
                success: false,
                errors: [{ line: 0, message: `Compilation error: ${e.message}` }],
                warnings: result.warnings
            };
        }
    }

    /**
     * Start executing the Arduino program (setup + loop).
     */
    function run(onError) {
        if (running) return;
        if (!userSetup || !userLoop) return;

        running = true;
        paused = false;
        loopCount = 0;
        errorCallback = onError;

        // Set the start time for millis()/micros()
        ArduinoAPI.setStartTime(performance.now());

        // Run setup()
        try {
            userSetup();
        } catch (e) {
            running = false;
            if (errorCallback) errorCallback(`Error in setup(): ${e.message}`);
            return;
        }

        // Start the display fade checker
        startDisplayFade();

        // Start the loop
        scheduleLoop();
    }

    function scheduleLoop() {
        if (!running) return;

        animFrameId = requestAnimationFrame(runLoopBatch);
    }

    function runLoopBatch(timestamp) {
        if (!running || paused) return;

        // Run multiple loop iterations per frame to simulate fast execution
        // Real Arduino runs loop() millions of times per second
        // We run enough iterations to keep timing accurate
        // Speed multiplier scales the batch size
        const baseBatchSize = 200;
        const batchSize = Math.max(1, Math.round(baseBatchSize * speedMultiplier));

        try {
            for (let i = 0; i < batchSize; i++) {
                if (!running || paused) break;
                userLoop();
                loopCount++;
            }
        } catch (e) {
            running = false;
            if (errorCallback) errorCallback(`Error in loop() (iteration ${loopCount}): ${e.message}`);
            return;
        }

        // Notify stats update
        if (onStatsUpdate) onStatsUpdate(loopCount);

        // Schedule next batch
        scheduleLoop();
    }

    function startDisplayFade() {
        // Check every 4ms if any digit should fade
        displayFadeInterval = setInterval(() => {
            if (!running) return;
            const hw = ArduinoAPI.getState();
            const now = performance.now();
            let changed = false;

            for (let i = 0; i < 4; i++) {
                const pos = hw.display.positions[i];
                const timeSinceUpdate = now - pos.lastUpdate;
                if (timeSinceUpdate > DISPLAY_FADE_MS && pos.brightness > 0) {
                    // Gradually fade - but keep showing if recently updated
                    pos.brightness = Math.max(0, 1.0 - (timeSinceUpdate - DISPLAY_FADE_MS) / 20);
                    changed = true;
                }
            }

            if (changed && hw.onDisplayChange) {
                hw.onDisplayChange(hw.display);
            }
        }, 4);
    }

    /**
     * Stop the running program.
     */
    function stop() {
        running = false;
        paused = false;
        if (animFrameId) {
            cancelAnimationFrame(animFrameId);
            animFrameId = null;
        }
        if (displayFadeInterval) {
            clearInterval(displayFadeInterval);
            displayFadeInterval = null;
        }
        userSetup = null;
        userLoop = null;
    }

    /**
     * Reset and re-run the current program.
     */
    function reset(sourceCode, onError) {
        stop();
        const result = compile(sourceCode);
        if (result.success) {
            run(onError);
        }
        return result;
    }

    function pause() {
        if (!running || paused) return;
        paused = true;
    }

    function resume() {
        if (!running || !paused) return;
        paused = false;
        scheduleLoop();
    }

    function isPaused() {
        return paused;
    }

    function step() {
        if (!running || !userLoop) return;
        // Execute one loop iteration
        try {
            userLoop();
            loopCount++;
            if (onStatsUpdate) onStatsUpdate(loopCount);
        } catch (e) {
            running = false;
            if (errorCallback) errorCallback(`Error in loop() (iteration ${loopCount}): ${e.message}`);
        }
    }

    function setSpeed(multiplier) {
        speedMultiplier = Math.max(0.05, Math.min(2.0, multiplier));
    }

    function setStatsCallback(cb) {
        onStatsUpdate = cb;
    }

    function isRunning() {
        return running;
    }

    function getLoopCount() {
        return loopCount;
    }

    return {
        compile,
        run,
        stop,
        reset,
        pause,
        resume,
        isPaused,
        step,
        setSpeed,
        setStatsCallback,
        isRunning,
        getLoopCount,
    };
})();
