# Phase 5: Robustness & Testing

**Effort:** 2-3 days | **Blocks launch:** Yes

## Checklist

### P5.1 — Expand Test Suite to 100+
- [ ] Every Arduino API function gets at least one test
- [ ] Timing precision tests (millis-based patterns with exact assertions)
- [ ] Shift register protocol edge cases (partial writes, multiple latches)
- [ ] Serial protocol edge cases (empty buffer, overflow, binary data)
- [ ] Transpiler: one test per C syntax pattern
- [ ] Integer division: comprehensive edge cases
- [ ] Type coercion: byte overflow, int overflow, unsigned behavior
- [ ] String handling: charAt, length, concatenation, comparison

### P5.2 — Fuzz the Transpiler
- [ ] Generate random valid C programs
- [ ] Feed through transpiler, assert no crashes
- [ ] Assert output parses as valid JS (try `new Function()`)
- [ ] Scrape Arduino forum examples as additional test inputs

### P5.3 — Regression Tests from Real Student Code
- [ ] Collect anonymized real solutions from the course (ask instructor)
- [ ] Add as integration tests
- [ ] Verify each produces expected hardware state

### P5.4 — CI Pipeline
- [ ] GitHub Actions workflow: run `node tests.js` on push
- [ ] ESLint configuration and lint step
- [ ] Bundle size check (warn if > threshold)
- [ ] Auto-run verify.js in CI

## Verification

```bash
node tests.js          # Must be 100+ pass, 0 fail
node scripts/verify.js # All checks green
```
