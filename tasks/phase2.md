# Phase 2: Replace the Regex Transpiler

**Effort:** 3-5 days | **Blocks launch:** Yes
**Status:** COMPLETE

## Approach Chosen

Hand-written recursive descent parser in vanilla JS (no dependencies).
Keeps the project pure vanilla JS with zero build step.

## Architecture

```
C++ source
  → Preprocessor: #include → strip, #define → inline expansion
  → Lexer: tokenize into typed tokens (NUMBER, IDENT, operators, etc.)
  → Parser: recursive descent → AST
  → Type Tracker: scope-based variable type tracking
  → Code Generator: AST → JavaScript with type-aware integer division
```

## Checklist

- [x] **P2.1** Lexer/tokenizer
  - Handles: all C operators, string/char literals (with escapes), hex/binary/decimal/float numbers
  - Strips: integer suffixes (UL, LL, etc.), comments (// and /* */), PROGMEM keyword
  - Converts: C++ alternative operators (and→&&, or→||, not→!), nullptr/NULL→null
  - Arduino B-prefix binary literals (B01010101 → 0b01010101)

- [x] **P2.2** Recursive descent parser
  - Full expression parser with correct precedence (15 levels)
  - Statements: if/else, for, while, do-while, switch/case, return, break, continue
  - Declarations: variables (scalar, array, const, multi-declarator), functions, forward decls
  - Structs/classes with member variables and methods
  - C-style casts, sizeof (type and expression), array initializers
  - Error recovery: reports line numbers, continues parsing after errors

- [x] **P2.3** AST → JS code generator
  - Type declarations → let/const
  - Array initializers → JS array literals
  - Char arrays with string init → JS strings (indexable)
  - Structs → ES6 classes with constructor
  - Struct methods → class method syntax with this. member access
  - C-style casts → Math.trunc for integer, pass-through for float
  - sizeof(type) → AVR size table lookup at compile time
  - sizeof(variable) → __sizeof() runtime call

- [x] **P2.4** Type-aware integer division
  - Scope-based type tracking: declares variable types, lookups through scope chain
  - Float detection: float/double types, float literals (contains .)
  - Known function return types: millis→unsigned long, analogRead→int, etc.
  - int/int → Math.trunc(a / b)
  - float/anything or anything/float → plain a / b (no truncation)
  - Compound /= assignment → expanded to Math.trunc

- [x] **P2.5** Preprocessor (inline expansion)
  - #include → stripped entirely
  - #define NAME value → inline replacement
  - #define NAME(args) body → function-like macro expansion
  - No const/function declarations emitted (cleaner than v1)

- [x] **P2.6** Test migration + new tests
  - All 44 existing tests pass (some test expectations updated for valid-but-different output)
  - Added 7 new tests for v2 capabilities:
    - Complex expression division: (a + b) / c
    - Multiple statements per line
    - Nested function calls as arguments
    - Type-aware division (float/int vs int/int)
    - C-style cast truncation
    - Compound array index expressions
  - Total: 51 tests passing

- [x] **P2.7** Old transpiler archived as `transpiler-legacy.js`

## What V2 Fixes Over V1

| Pattern | V1 (regex) | V2 (AST) |
|---------|-----------|----------|
| `(a + b) / c` | Broken | Correct |
| Multiple statements per line | Broken | Correct |
| Nested function calls | Broken | Correct |
| Type-aware division (float vs int) | Regex heuristic | AST + type inference |
| C-style casts | Partial removal | Proper Math.trunc/pass-through |
| sizeof(type) in declarations | Mangled by cast stripping | Correct |
| Error messages | No line numbers | Line numbers from tokens |
| Struct methods | Broken | Class method syntax + this. |

## Verification

```bash
node tests.js          # 51 passed, 0 failed
node scripts/verify.js # 31 passed, 0 failed
```

All 6 example programs compile and produce valid JS.
