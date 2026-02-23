# Phase 7: Advanced Features (Post-Launch)

**Effort:** Ongoing | **Blocks launch:** No

## Checklist

### P7.1 — Web Worker Execution Sandbox
- [ ] Move Arduino runtime into a Web Worker
- [ ] loop() runs in worker, UI updates via postMessage
- [ ] User code can't freeze the main thread
- [ ] Implement real delay() (sleep the worker)
- [ ] Better timing accuracy (no animation frame dependency)
- [ ] Removes need for unsafe-eval CSP on main page

### P7.2 — Save/Load/Share Sketches
- [ ] LocalStorage auto-save (save on every compile)
- [ ] Restore last sketch on page load
- [ ] URL-encoded sketch sharing (gzip + base64 in URL hash)
- [ ] Optional: backend for short URLs (Cloudflare KV / Supabase)

### P7.3 — Component Library (Stretch)
- [ ] Drag-and-drop components beyond FunShield
- [ ] External LEDs, servos, LCD displays, sensors
- [ ] Each component: JS class with render() + pin interface
- [ ] Wire editor for connections

### P7.4 — Serial Plotter
- [ ] Graph numeric serial output over time
- [ ] Like Arduino IDE's Serial Plotter
- [ ] Configurable time window and Y-axis range
- [ ] Multiple series support (comma-separated values)

### P7.5 — Multiple Board Support
- [ ] Arduino Mega (more pins, more memory)
- [ ] ESP32 (WiFi, different pin layout)
- [ ] Board selector in UI
- [ ] Different pin maps and constants per board

### P7.6 — Export to Real Arduino
- [ ] "Download .ino" button (download editor content)
- [ ] Verify code against Moccarduino-compatible subset
- [ ] Show warnings for emulator-only features

## Verification

Each feature should have its own test suite addition.
```bash
node tests.js
node scripts/verify.js
```
