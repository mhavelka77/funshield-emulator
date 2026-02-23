# Phase 4: UI/UX Polish

**Effort:** 2-3 days | **Blocks launch:** No

## Checklist

### P4.1 — Board Visualization
- [ ] Improve board layout to resemble real Arduino + FunShield
- [ ] Add pin labels and connection traces
- [ ] Add buzzer indicator (speaker icon, animation when active)
- [ ] Animate LED glow with CSS transitions
- [ ] Show pin state tooltips on hover

### P4.2 — Display Improvements
- [ ] Improve 7-seg multiplexing simulation for smoother persistence-of-vision
- [ ] Add debug mode: show which digit is currently being driven
- [ ] Add option to show decoded display value as text below segments

### P4.3 — Execution Controls
- [ ] Speed slider (0.1x to 10x realtime)
- [ ] Step mode: execute one loop() iteration at a time
- [ ] Pause/resume button
- [ ] Show loop iteration count
- [ ] Show elapsed virtual time / millis() clock

### P4.4 — Error UX
- [ ] Compiler errors: show line number, highlight in editor
- [ ] Runtime errors: show the C++ line that caused it (source map)
- [ ] Warnings for prohibited patterns (delay, blocking loops)
- [ ] Error panel with clear/copy buttons

### P4.5 — Mobile Responsiveness
- [ ] Stack layout vertically on small screens
- [ ] Touch-friendly button sizes (44px minimum)
- [ ] Test on iOS Safari and Android Chrome
- [ ] Responsive font sizes

## Verification

```bash
node tests.js
node scripts/verify.js
```

Manual testing on desktop + mobile browsers. All 6 examples must work visually.
