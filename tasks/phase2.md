# Phase 2: Replace the Regex Transpiler

**Effort:** 3-5 days | **Blocks launch:** Yes

## Approach

Replace the regex-based transpiler with a proper C parser. Recommended:
**tree-sitter-c** compiled to WASM (see PLAN.md Phase 2 for alternatives).

## Checklist

- [ ] **P2.1** Set up tree-sitter-c WASM in the project
  - Install tree-sitter CLI and tree-sitter-c grammar
  - Compile C grammar to WASM
  - Add WASM loader to index.html (async init)
  - Verify the parser can parse all 6 example programs

- [ ] **P2.2** Build AST → JS code generator
  - Walk tree-sitter AST nodes
  - Handle: function definitions, variable declarations, expressions, statements
  - Handle: for/while/do-while/if-else/switch
  - Handle: arrays, structs/classes, string/char literals
  - Handle: #include (strip), #define (transform to const)

- [ ] **P2.3** Implement type-aware integer division
  - Track variable types from declarations
  - For int/int division → wrap in Math.trunc()
  - For float or double operands → leave as-is
  - Test: `5/3` → `1`, `5.0/3` → `1.666...`, `int a=5; float b=3; a/b` → `1.666...`

- [ ] **P2.4** Handle Arduino-specific patterns
  - `byte` → `let` (unsigned 8-bit, but JS doesn't need the distinction)
  - `unsigned long` → `let` (treat as regular number)
  - `sizeof(type)` → lookup table
  - `(int)expr` / `(byte)expr` → appropriate cast
  - `nullptr` / `NULL` → `null`
  - `HIGH`/`LOW`/`INPUT`/`OUTPUT` → constants from API scope

- [ ] **P2.5** Preserve good error messages
  - Parser errors should include line and column number
  - Map tree-sitter error nodes to human-readable messages
  - Show "unexpected token" with the actual token text
  - Highlight the error line in the editor (via error callback)

- [ ] **P2.6** Migrate all existing tests
  - Every test in tests.js must still pass with the new transpiler
  - Add new tests for patterns the regex transpiler couldn't handle:
    - `(a + b) / c`
    - Multiple statements on one line: `a = 1; b = 2;`
    - Complex array expressions
    - Nested function calls as arguments
  - Target: 60+ tests

- [ ] **P2.7** Remove old transpiler
  - Delete regex transpiler code from transpiler.js
  - Or: keep it as `transpiler-legacy.js` for reference
  - Ensure no code references old transpiler

## Verification

```bash
node tests.js        # Must be 60+ pass, 0 fail
node scripts/verify.js  # Must pass all checks
```

Test all 6 examples in browser. Pay special attention to:
- Lab 4 (segment display) — complex shift register patterns
- Lab 6 (scrolling text) — string indexing, array lookup, division
