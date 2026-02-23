/**
 * Arduino C++ to JavaScript Transpiler (v2 — AST-based)
 *
 * Replaces the regex-based transpiler with a proper lexer → parser → codegen
 * pipeline. Handles the subset of C/C++ used in the NSWI170 FunShield labs.
 *
 * Public API (same as v1):
 *   ArduinoTranspiler.transpile(code) → { code, errors, warnings }
 */

const ArduinoTranspiler = (() => {
    'use strict';

    // =====================================================================
    // Token types
    // =====================================================================
    const T = Object.freeze({
        // Literals
        NUMBER:     'NUMBER',
        STRING:     'STRING',
        CHAR:       'CHAR',
        // Identifiers & keywords
        IDENT:      'IDENT',
        // Punctuation & operators
        LPAREN:     '(',
        RPAREN:     ')',
        LBRACE:     '{',
        RBRACE:     '}',
        LBRACKET:   '[',
        RBRACKET:   ']',
        SEMICOLON:  ';',
        COMMA:      ',',
        DOT:        '.',
        ARROW:      '->',
        SCOPE:      '::',
        COLON:      ':',
        QUESTION:   '?',
        HASH:       '#',
        // Arithmetic
        PLUS:       '+',
        MINUS:      '-',
        STAR:       '*',
        SLASH:      '/',
        PERCENT:    '%',
        // Bitwise
        AMP:        '&',
        PIPE:       '|',
        CARET:      '^',
        TILDE:      '~',
        LSHIFT:     '<<',
        RSHIFT:     '>>',
        // Logical
        AND:        '&&',
        OR:         '||',
        NOT:        '!',
        // Comparison
        EQ:         '==',
        NEQ:        '!=',
        LT:         '<',
        GT:         '>',
        LTE:        '<=',
        GTE:        '>=',
        // Assignment
        ASSIGN:     '=',
        PLUS_EQ:    '+=',
        MINUS_EQ:   '-=',
        STAR_EQ:    '*=',
        SLASH_EQ:   '/=',
        PERCENT_EQ: '%=',
        AMP_EQ:     '&=',
        PIPE_EQ:    '|=',
        CARET_EQ:   '^=',
        LSHIFT_EQ:  '<<=',
        RSHIFT_EQ:  '>>=',
        // Increment/decrement
        INC:        '++',
        DEC:        '--',
        // Special
        ELLIPSIS:   '...',
        EOF:        'EOF',
    });

    // C type keywords
    const TYPE_KEYWORDS = new Set([
        'void', 'int', 'long', 'short', 'unsigned', 'signed',
        'char', 'float', 'double', 'bool', 'boolean', 'byte',
        'size_t', 'uint8_t', 'int8_t', 'uint16_t', 'int16_t',
        'uint32_t', 'int32_t', 'uint64_t', 'int64_t',
        'word', 'String', 'auto',
    ]);

    // Storage / qualifier keywords that prefix types
    const QUALIFIER_KEYWORDS = new Set([
        'const', 'volatile', 'static', 'extern', 'register', 'inline',
    ]);

    const CONTROL_KEYWORDS = new Set([
        'if', 'else', 'for', 'while', 'do', 'switch', 'case',
        'return', 'break', 'continue', 'default', 'goto',
    ]);

    const STRUCT_KEYWORDS = new Set(['struct', 'class', 'enum']);

    // sizeof table for AVR (Arduino Uno)
    const SIZEOF_TABLE = {
        'char': 1, 'byte': 1, 'uint8_t': 1, 'int8_t': 1, 'bool': 1, 'boolean': 1,
        'short': 2, 'int': 2, 'uint16_t': 2, 'int16_t': 2, 'word': 2,
        'long': 4, 'float': 4, 'uint32_t': 4, 'int32_t': 4, 'double': 4,
        'unsigned long': 4,
        'uint64_t': 8, 'int64_t': 8, 'unsigned long long': 8, 'long long': 8,
    };

    // Integer types (for division tracking)
    const INT_TYPES = new Set([
        'int', 'short', 'long', 'char', 'byte', 'bool', 'boolean',
        'unsigned int', 'unsigned long', 'unsigned short', 'unsigned char',
        'unsigned long long', 'long long',
        'uint8_t', 'int8_t', 'uint16_t', 'int16_t',
        'uint32_t', 'int32_t', 'uint64_t', 'int64_t',
        'size_t', 'word',
    ]);

    const FLOAT_TYPES = new Set(['float', 'double']);

    // =====================================================================
    // Preprocessor
    // =====================================================================
    function preprocess(code) {
        const defines = {};     // name → { params, body } or { body }
        const lines = code.split('\n');
        const result = [];

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const trimmed = line.trim();

            if (trimmed.startsWith('#')) {
                const directive = trimmed.slice(1).trim();

                if (directive.startsWith('include')) {
                    // Strip #include entirely
                    result.push('');
                } else if (directive.startsWith('define')) {
                    const rest = directive.slice(6).trim();
                    // Function-like macro: #define NAME(a,b) body
                    const funcMatch = rest.match(/^(\w+)\(([^)]*)\)\s+(.*)/);
                    if (funcMatch) {
                        const name = funcMatch[1];
                        const params = funcMatch[2].split(',').map(p => p.trim());
                        const body = funcMatch[3].trim();
                        defines[name] = { params, body };
                    } else {
                        // Simple macro: #define NAME value
                        const simpleMatch = rest.match(/^(\w+)(?:\s+(.*))?/);
                        if (simpleMatch) {
                            const name = simpleMatch[1];
                            const body = simpleMatch[2] ? simpleMatch[2].trim() : 'true';
                            defines[name] = { body };
                        }
                    }
                    result.push('');
                } else {
                    // Unknown directive — strip
                    result.push('');
                }
            } else {
                result.push(line);
            }
        }

        // Apply defines
        let output = result.join('\n');
        for (const [name, def] of Object.entries(defines)) {
            if (def.params) {
                // Function-like macro: replace NAME(args) with expanded body
                const re = new RegExp(`\\b${name}\\s*\\(`, 'g');
                let m;
                while ((m = re.exec(output)) !== null) {
                    // Find matching paren
                    let depth = 1;
                    let j = m.index + m[0].length;
                    const argStart = j;
                    const args = [];
                    let lastComma = j;
                    while (j < output.length && depth > 0) {
                        if (output[j] === '(') depth++;
                        else if (output[j] === ')') {
                            depth--;
                            if (depth === 0) {
                                args.push(output.slice(lastComma, j).trim());
                            }
                        } else if (output[j] === ',' && depth === 1) {
                            args.push(output.slice(lastComma, j).trim());
                            lastComma = j + 1;
                        }
                        j++;
                    }
                    // Expand body
                    let expanded = def.body;
                    for (let k = 0; k < def.params.length; k++) {
                        expanded = expanded.replace(new RegExp(`\\b${def.params[k]}\\b`, 'g'), args[k] || '');
                    }
                    output = output.slice(0, m.index) + expanded + output.slice(j);
                    re.lastIndex = m.index + expanded.length;
                }
            } else {
                // Simple macro: replace NAME with body
                output = output.replace(new RegExp(`\\b${name}\\b`, 'g'), def.body);
            }
        }

        return output;
    }

    // =====================================================================
    // Lexer
    // =====================================================================
    function tokenize(code) {
        const tokens = [];
        let pos = 0;
        let line = 1;
        let col = 1;

        function peek(n) { return code[pos + (n || 0)]; }
        function advance() {
            const ch = code[pos++];
            if (ch === '\n') { line++; col = 1; } else { col++; }
            return ch;
        }
        function match(s) {
            if (code.startsWith(s, pos)) {
                for (let i = 0; i < s.length; i++) advance();
                return true;
            }
            return false;
        }
        function emit(type, value) {
            tokens.push({ type, value, line: tokLine, col: tokCol });
        }

        let tokLine, tokCol;

        while (pos < code.length) {
            tokLine = line;
            tokCol = col;
            const ch = peek();

            // Whitespace
            if (ch === ' ' || ch === '\t' || ch === '\r' || ch === '\n') {
                advance();
                continue;
            }

            // Line comments
            if (ch === '/' && peek(1) === '/') {
                while (pos < code.length && peek() !== '\n') advance();
                continue;
            }

            // Block comments
            if (ch === '/' && peek(1) === '*') {
                advance(); advance(); // skip /*
                while (pos < code.length) {
                    if (peek() === '*' && peek(1) === '/') {
                        advance(); advance();
                        break;
                    }
                    advance();
                }
                continue;
            }

            // String literals
            if (ch === '"') {
                let s = '';
                advance(); // skip opening "
                while (pos < code.length && peek() !== '"') {
                    if (peek() === '\\') {
                        s += advance(); // backslash
                        if (pos < code.length) s += advance(); // escaped char
                    } else {
                        s += advance();
                    }
                }
                if (pos < code.length) advance(); // skip closing "
                emit(T.STRING, s);
                continue;
            }

            // Char literals
            if (ch === '\'') {
                let s = '';
                advance(); // skip opening '
                while (pos < code.length && peek() !== '\'') {
                    if (peek() === '\\') {
                        s += advance();
                        if (pos < code.length) s += advance();
                    } else {
                        s += advance();
                    }
                }
                if (pos < code.length) advance(); // skip closing '
                emit(T.CHAR, s);
                continue;
            }

            // Numbers: hex, binary, decimal, float
            if (ch >= '0' && ch <= '9') {
                let num = '';
                if (ch === '0' && (peek(1) === 'x' || peek(1) === 'X')) {
                    num += advance(); num += advance(); // 0x
                    while (pos < code.length && /[0-9a-fA-F]/.test(peek())) num += advance();
                } else if (ch === '0' && (peek(1) === 'b' || peek(1) === 'B')) {
                    num += advance(); num += advance(); // 0b
                    while (pos < code.length && (peek() === '0' || peek() === '1')) num += advance();
                } else {
                    while (pos < code.length && peek() >= '0' && peek() <= '9') num += advance();
                    if (pos < code.length && peek() === '.') {
                        num += advance();
                        while (pos < code.length && peek() >= '0' && peek() <= '9') num += advance();
                    }
                }
                // Strip integer suffixes: ULL, UL, LL, U, L (case insensitive)
                while (pos < code.length && /[uUlL]/.test(peek())) advance();
                emit(T.NUMBER, num);
                continue;
            }

            // Arduino B prefix binary literal: B01010101
            if (ch === 'B' && pos + 1 < code.length && (peek(1) === '0' || peek(1) === '1')) {
                advance(); // skip B
                let num = '0b';
                while (pos < code.length && (peek() === '0' || peek() === '1')) num += advance();
                emit(T.NUMBER, num);
                continue;
            }

            // Identifiers and keywords
            if ((ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z') || ch === '_') {
                let id = '';
                while (pos < code.length && /[a-zA-Z0-9_]/.test(peek())) id += advance();

                // C++ alternative operators
                if (id === 'and') { emit(T.AND, '&&'); continue; }
                if (id === 'or') { emit(T.OR, '||'); continue; }
                if (id === 'not') { emit(T.NOT, '!'); continue; }

                // nullptr/NULL → null identifier
                if (id === 'nullptr' || id === 'NULL') { emit(T.IDENT, 'null'); continue; }

                // PROGMEM keyword — skip
                if (id === 'PROGMEM') continue;

                emit(T.IDENT, id);
                continue;
            }

            // Multi-char operators (order matters — longest match first)
            if (match('<<=')) { emit(T.LSHIFT_EQ, '<<='); continue; }
            if (match('>>=')) { emit(T.RSHIFT_EQ, '>>='); continue; }
            if (match('...')) { emit(T.ELLIPSIS, '...'); continue; }
            if (match('<<'))  { emit(T.LSHIFT, '<<'); continue; }
            if (match('>>'))  { emit(T.RSHIFT, '>>'); continue; }
            if (match('&&'))  { emit(T.AND, '&&'); continue; }
            if (match('||'))  { emit(T.OR, '||'); continue; }
            if (match('=='))  { emit(T.EQ, '=='); continue; }
            if (match('!='))  { emit(T.NEQ, '!='); continue; }
            if (match('<='))  { emit(T.LTE, '<='); continue; }
            if (match('>='))  { emit(T.GTE, '>='); continue; }
            if (match('+='))  { emit(T.PLUS_EQ, '+='); continue; }
            if (match('-='))  { emit(T.MINUS_EQ, '-='); continue; }
            if (match('*='))  { emit(T.STAR_EQ, '*='); continue; }
            if (match('/='))  { emit(T.SLASH_EQ, '/='); continue; }
            if (match('%='))  { emit(T.PERCENT_EQ, '%='); continue; }
            if (match('&='))  { emit(T.AMP_EQ, '&='); continue; }
            if (match('|='))  { emit(T.PIPE_EQ, '|='); continue; }
            if (match('^='))  { emit(T.CARET_EQ, '^='); continue; }
            if (match('++'))  { emit(T.INC, '++'); continue; }
            if (match('--'))  { emit(T.DEC, '--'); continue; }
            if (match('->'))  { emit(T.ARROW, '->'); continue; }
            if (match('::'))  { emit(T.SCOPE, '::'); continue; }

            // Single-char operators & punctuation
            const singles = {
                '(': T.LPAREN, ')': T.RPAREN,
                '{': T.LBRACE, '}': T.RBRACE,
                '[': T.LBRACKET, ']': T.RBRACKET,
                ';': T.SEMICOLON, ',': T.COMMA,
                '.': T.DOT, ':': T.COLON,
                '?': T.QUESTION, '#': T.HASH,
                '+': T.PLUS, '-': T.MINUS,
                '*': T.STAR, '/': T.SLASH, '%': T.PERCENT,
                '&': T.AMP, '|': T.PIPE, '^': T.CARET,
                '~': T.TILDE, '!': T.NOT,
                '<': T.LT, '>': T.GT,
                '=': T.ASSIGN,
            };
            if (singles[ch]) {
                advance();
                emit(singles[ch], ch);
                continue;
            }

            // Unknown character — skip
            advance();
        }

        emit(T.EOF, '');
        return tokens;
    }

    // =====================================================================
    // Parser — recursive descent → AST
    // =====================================================================
    function parse(tokens, errors) {
        let pos = 0;

        function cur() { return tokens[pos] || { type: T.EOF, value: '', line: 0, col: 0 }; }
        function at(type, val) {
            const t = cur();
            if (val !== undefined) return t.type === type && t.value === val;
            return t.type === type;
        }
        function eat(type, val) {
            if (at(type, val)) { return tokens[pos++]; }
            return null;
        }
        function expect(type, val) {
            const t = eat(type, val);
            if (!t) {
                const c = cur();
                errors.push({ line: c.line, message: `Expected ${val || type}, got '${c.value}' (${c.type})` });
                // Try to recover by skipping one token
                if (!at(T.EOF)) pos++;
                return { type, value: val || '', line: c.line, col: c.col };
            }
            return t;
        }
        function isType() {
            const t = cur();
            return t.type === T.IDENT && (
                TYPE_KEYWORDS.has(t.value) ||
                QUALIFIER_KEYWORDS.has(t.value) ||
                STRUCT_KEYWORDS.has(t.value)
            );
        }

        // ── Type parsing ─────────────────────────────────────────────
        // Returns a type string like "int", "unsigned long", "const int", etc.
        function parseType() {
            let parts = [];

            // Qualifiers
            while (cur().type === T.IDENT && QUALIFIER_KEYWORDS.has(cur().value)) {
                parts.push(tokens[pos++].value);
            }

            // struct/class/enum keyword
            if (cur().type === T.IDENT && STRUCT_KEYWORDS.has(cur().value)) {
                parts.push(tokens[pos++].value);
                // Optional struct name
                if (cur().type === T.IDENT) {
                    parts.push(tokens[pos++].value);
                }
                return parts.join(' ');
            }

            // signed/unsigned
            if (cur().type === T.IDENT && (cur().value === 'unsigned' || cur().value === 'signed')) {
                parts.push(tokens[pos++].value);
            }

            // Core type
            if (cur().type === T.IDENT && TYPE_KEYWORDS.has(cur().value)) {
                parts.push(tokens[pos++].value);
                // Handle "long long", "unsigned long long", "long int", etc.
                while (cur().type === T.IDENT && (cur().value === 'long' || cur().value === 'int' || cur().value === 'short')) {
                    parts.push(tokens[pos++].value);
                }
            } else if (parts.length > 0) {
                // "unsigned" alone means "unsigned int"
            } else {
                // Not a type — shouldn't happen if isType was checked
                errors.push({ line: cur().line, message: `Expected type, got '${cur().value}'` });
            }

            // Pointer stars
            while (at(T.STAR)) {
                parts.push('*');
                pos++;
            }

            // Reference &
            while (at(T.AMP)) {
                parts.push('&');
                pos++;
            }

            return parts.join(' ');
        }

        // ── Expressions ──────────────────────────────────────────────
        // Precedence climbing / Pratt style

        function parseExpr() { return parseAssignment(); }

        function parseAssignment() {
            let left = parseTernary();
            const assignOps = [T.ASSIGN, T.PLUS_EQ, T.MINUS_EQ, T.STAR_EQ, T.SLASH_EQ,
                T.PERCENT_EQ, T.AMP_EQ, T.PIPE_EQ, T.CARET_EQ, T.LSHIFT_EQ, T.RSHIFT_EQ];
            if (assignOps.includes(cur().type)) {
                const op = tokens[pos++];
                const right = parseAssignment(); // right-associative
                return { type: 'AssignExpr', op: op.value, left, right, line: op.line };
            }
            return left;
        }

        function parseTernary() {
            let cond = parseLogicalOr();
            if (eat(T.QUESTION)) {
                const consequent = parseExpr();
                expect(T.COLON);
                const alternate = parseTernary();
                return { type: 'TernaryExpr', cond, consequent, alternate, line: cond.line };
            }
            return cond;
        }

        function parseLogicalOr() {
            let left = parseLogicalAnd();
            while (eat(T.OR)) {
                const right = parseLogicalAnd();
                left = { type: 'BinaryExpr', op: '||', left, right, line: left.line };
            }
            return left;
        }

        function parseLogicalAnd() {
            let left = parseBitwiseOr();
            while (eat(T.AND)) {
                const right = parseBitwiseOr();
                left = { type: 'BinaryExpr', op: '&&', left, right, line: left.line };
            }
            return left;
        }

        function parseBitwiseOr() {
            let left = parseBitwiseXor();
            while (at(T.PIPE) && !at(T.OR)) {
                pos++;
                const right = parseBitwiseXor();
                left = { type: 'BinaryExpr', op: '|', left, right, line: left.line };
            }
            return left;
        }

        function parseBitwiseXor() {
            let left = parseBitwiseAnd();
            while (eat(T.CARET)) {
                const right = parseBitwiseAnd();
                left = { type: 'BinaryExpr', op: '^', left, right, line: left.line };
            }
            return left;
        }

        function parseBitwiseAnd() {
            let left = parseEquality();
            while (at(T.AMP) && !at(T.AND)) {
                pos++;
                const right = parseEquality();
                left = { type: 'BinaryExpr', op: '&', left, right, line: left.line };
            }
            return left;
        }

        function parseEquality() {
            let left = parseComparison();
            while (at(T.EQ) || at(T.NEQ)) {
                const op = tokens[pos++].value;
                const right = parseComparison();
                left = { type: 'BinaryExpr', op, left, right, line: left.line };
            }
            return left;
        }

        function parseComparison() {
            let left = parseShift();
            while (at(T.LT) || at(T.GT) || at(T.LTE) || at(T.GTE)) {
                const op = tokens[pos++].value;
                const right = parseShift();
                left = { type: 'BinaryExpr', op, left, right, line: left.line };
            }
            return left;
        }

        function parseShift() {
            let left = parseAddSub();
            while (at(T.LSHIFT) || at(T.RSHIFT)) {
                const op = tokens[pos++].value;
                const right = parseAddSub();
                left = { type: 'BinaryExpr', op, left, right, line: left.line };
            }
            return left;
        }

        function parseAddSub() {
            let left = parseMulDiv();
            while (at(T.PLUS) || at(T.MINUS)) {
                const op = tokens[pos++].value;
                const right = parseMulDiv();
                left = { type: 'BinaryExpr', op, left, right, line: left.line };
            }
            return left;
        }

        function parseMulDiv() {
            let left = parseUnary();
            while (at(T.STAR) || at(T.SLASH) || at(T.PERCENT)) {
                const op = tokens[pos++].value;
                const right = parseUnary();
                left = { type: 'BinaryExpr', op, left, right, line: left.line };
            }
            return left;
        }

        function parseUnary() {
            if (at(T.NOT) || at(T.TILDE)) {
                const op = tokens[pos++];
                const operand = parseUnary();
                return { type: 'UnaryExpr', op: op.value, operand, prefix: true, line: op.line };
            }
            if (at(T.MINUS)) {
                const op = tokens[pos++];
                const operand = parseUnary();
                return { type: 'UnaryExpr', op: '-', operand, prefix: true, line: op.line };
            }
            if (at(T.PLUS)) {
                const op = tokens[pos++];
                const operand = parseUnary();
                return { type: 'UnaryExpr', op: '+', operand, prefix: true, line: op.line };
            }
            if (at(T.INC) || at(T.DEC)) {
                const op = tokens[pos++];
                const operand = parseUnary();
                return { type: 'UnaryExpr', op: op.value, operand, prefix: true, line: op.line };
            }
            // C-style cast: (type)expr — only if it looks like a type in parens
            if (at(T.LPAREN) && isCastAhead()) {
                const save = pos;
                pos++; // skip (
                const castType = parseType();
                if (eat(T.RPAREN)) {
                    const operand = parseUnary();
                    return { type: 'CastExpr', castType, operand, line: tokens[save].line };
                }
                // Not a cast — backtrack
                pos = save;
            }
            // sizeof
            if (cur().type === T.IDENT && cur().value === 'sizeof') {
                return parseSizeof();
            }
            return parsePostfix();
        }

        // Check if (type) cast is ahead (heuristic)
        function isCastAhead() {
            const save = pos;
            pos++; // skip (
            // Check if next tokens form a type + closing paren
            if (isType()) {
                parseType();
                if (at(T.RPAREN)) {
                    pos = save;
                    return true;
                }
            }
            pos = save;
            return false;
        }

        function parseSizeof() {
            const tok = tokens[pos++]; // eat 'sizeof'
            expect(T.LPAREN);
            // Could be a type or a variable
            if (isType()) {
                const typeName = parseType();
                expect(T.RPAREN);
                return { type: 'SizeofType', typeName, line: tok.line };
            }
            const operand = parseExpr();
            expect(T.RPAREN);
            return { type: 'SizeofExpr', operand, line: tok.line };
        }

        function parsePostfix() {
            let node = parsePrimary();

            while (true) {
                // Function call
                if (at(T.LPAREN)) {
                    pos++;
                    const args = [];
                    if (!at(T.RPAREN)) {
                        args.push(parseExpr());
                        while (eat(T.COMMA)) {
                            args.push(parseExpr());
                        }
                    }
                    expect(T.RPAREN);
                    node = { type: 'CallExpr', callee: node, args, line: node.line };
                    continue;
                }
                // Array subscript
                if (at(T.LBRACKET)) {
                    pos++;
                    const index = parseExpr();
                    expect(T.RBRACKET);
                    node = { type: 'IndexExpr', object: node, index, line: node.line };
                    continue;
                }
                // Member access (.  ->  ::)
                if (at(T.DOT) || at(T.ARROW) || at(T.SCOPE)) {
                    pos++;
                    const member = expect(T.IDENT);
                    node = { type: 'MemberExpr', object: node, member: member.value, line: node.line };
                    continue;
                }
                // Postfix ++ / --
                if (at(T.INC) || at(T.DEC)) {
                    const op = tokens[pos++];
                    node = { type: 'UnaryExpr', op: op.value, operand: node, prefix: false, line: op.line };
                    continue;
                }
                break;
            }
            return node;
        }

        function parsePrimary() {
            // Number literal
            if (at(T.NUMBER)) {
                const t = tokens[pos++];
                return { type: 'NumberLiteral', value: t.value, line: t.line };
            }
            // String literal
            if (at(T.STRING)) {
                const t = tokens[pos++];
                return { type: 'StringLiteral', value: t.value, line: t.line };
            }
            // Char literal
            if (at(T.CHAR)) {
                const t = tokens[pos++];
                return { type: 'CharLiteral', value: t.value, line: t.line };
            }
            // Identifier (including true/false)
            if (at(T.IDENT)) {
                const t = tokens[pos++];
                return { type: 'Identifier', name: t.value, line: t.line };
            }
            // Parenthesized expression
            if (eat(T.LPAREN)) {
                const expr = parseExpr();
                expect(T.RPAREN);
                return expr;
            }
            // Brace initializer (as expression in some contexts)
            if (at(T.LBRACE)) {
                return parseArrayInit();
            }

            const c = cur();
            errors.push({ line: c.line, message: `Unexpected token '${c.value}'` });
            if (!at(T.EOF)) pos++;
            return { type: 'ErrorExpr', line: c.line };
        }

        function parseArrayInit() {
            const tok = expect(T.LBRACE);
            const elements = [];
            if (!at(T.RBRACE)) {
                elements.push(parseExpr());
                while (eat(T.COMMA)) {
                    if (at(T.RBRACE)) break; // trailing comma
                    elements.push(parseExpr());
                }
            }
            expect(T.RBRACE);
            return { type: 'ArrayInit', elements, line: tok.line };
        }

        // ── Statements ───────────────────────────────────────────────

        function parseBlock() {
            expect(T.LBRACE);
            const body = [];
            while (!at(T.RBRACE) && !at(T.EOF)) {
                body.push(parseStatement());
            }
            expect(T.RBRACE);
            return { type: 'Block', body };
        }

        function parseStatement() {
            // Empty statement
            if (eat(T.SEMICOLON)) {
                return { type: 'EmptyStmt' };
            }

            // Block
            if (at(T.LBRACE)) {
                return parseBlock();
            }

            // return
            if (cur().type === T.IDENT && cur().value === 'return') {
                return parseReturnStmt();
            }

            // if
            if (cur().type === T.IDENT && cur().value === 'if') {
                return parseIfStmt();
            }

            // for
            if (cur().type === T.IDENT && cur().value === 'for') {
                return parseForStmt();
            }

            // while
            if (cur().type === T.IDENT && cur().value === 'while') {
                return parseWhileStmt();
            }

            // do-while
            if (cur().type === T.IDENT && cur().value === 'do') {
                return parseDoWhileStmt();
            }

            // switch
            if (cur().type === T.IDENT && cur().value === 'switch') {
                return parseSwitchStmt();
            }

            // break / continue
            if (cur().type === T.IDENT && (cur().value === 'break' || cur().value === 'continue')) {
                const t = tokens[pos++];
                expect(T.SEMICOLON);
                return { type: t.value === 'break' ? 'BreakStmt' : 'ContinueStmt', line: t.line };
            }

            // Variable declaration or function definition or expression statement
            // Peek ahead to distinguish declaration from expression
            if (isDeclarationAhead()) {
                return parseDeclaration();
            }

            // Expression statement
            const expr = parseExpr();
            expect(T.SEMICOLON);
            return { type: 'ExprStmt', expr, line: expr.line };
        }

        function parseReturnStmt() {
            const tok = tokens[pos++]; // eat 'return'
            if (eat(T.SEMICOLON)) {
                return { type: 'ReturnStmt', value: null, line: tok.line };
            }
            const value = parseExpr();
            expect(T.SEMICOLON);
            return { type: 'ReturnStmt', value, line: tok.line };
        }

        function parseIfStmt() {
            const tok = tokens[pos++]; // eat 'if'
            expect(T.LPAREN);
            const condition = parseExpr();
            expect(T.RPAREN);
            const consequent = at(T.LBRACE) ? parseBlock() : parseStatement();
            let alternate = null;
            if (cur().type === T.IDENT && cur().value === 'else') {
                pos++;
                alternate = (cur().type === T.IDENT && cur().value === 'if')
                    ? parseIfStmt()
                    : (at(T.LBRACE) ? parseBlock() : parseStatement());
            }
            return { type: 'IfStmt', condition, consequent, alternate, line: tok.line };
        }

        function parseForStmt() {
            const tok = tokens[pos++]; // eat 'for'
            expect(T.LPAREN);

            // init: declaration or expression or empty
            let init = null;
            if (!at(T.SEMICOLON)) {
                if (isDeclarationAhead()) {
                    init = parseDeclaration(); // already eats ;
                } else {
                    init = parseExpr();
                    expect(T.SEMICOLON);
                }
            } else {
                eat(T.SEMICOLON);
            }

            // condition
            let condition = null;
            if (!at(T.SEMICOLON)) condition = parseExpr();
            expect(T.SEMICOLON);

            // update
            let update = null;
            if (!at(T.RPAREN)) update = parseExpr();
            expect(T.RPAREN);

            const body = at(T.LBRACE) ? parseBlock() : parseStatement();
            return { type: 'ForStmt', init, condition, update, body, line: tok.line };
        }

        function parseWhileStmt() {
            const tok = tokens[pos++]; // eat 'while'
            expect(T.LPAREN);
            const condition = parseExpr();
            expect(T.RPAREN);
            const body = at(T.LBRACE) ? parseBlock() : parseStatement();
            return { type: 'WhileStmt', condition, body, line: tok.line };
        }

        function parseDoWhileStmt() {
            const tok = tokens[pos++]; // eat 'do'
            const body = at(T.LBRACE) ? parseBlock() : parseStatement();
            if (cur().type === T.IDENT && cur().value === 'while') pos++;
            else expect(T.IDENT, 'while');
            expect(T.LPAREN);
            const condition = parseExpr();
            expect(T.RPAREN);
            expect(T.SEMICOLON);
            return { type: 'DoWhileStmt', condition, body, line: tok.line };
        }

        function parseSwitchStmt() {
            const tok = tokens[pos++]; // eat 'switch'
            expect(T.LPAREN);
            const discriminant = parseExpr();
            expect(T.RPAREN);
            expect(T.LBRACE);

            const cases = [];
            while (!at(T.RBRACE) && !at(T.EOF)) {
                if (cur().type === T.IDENT && cur().value === 'case') {
                    pos++;
                    const value = parseExpr();
                    expect(T.COLON);
                    const body = [];
                    while (!at(T.RBRACE) && !at(T.EOF) &&
                        !(cur().type === T.IDENT && (cur().value === 'case' || cur().value === 'default'))) {
                        body.push(parseStatement());
                    }
                    cases.push({ type: 'SwitchCase', value, body, line: value.line });
                } else if (cur().type === T.IDENT && cur().value === 'default') {
                    pos++;
                    expect(T.COLON);
                    const body = [];
                    while (!at(T.RBRACE) && !at(T.EOF) &&
                        !(cur().type === T.IDENT && cur().value === 'case')) {
                        body.push(parseStatement());
                    }
                    cases.push({ type: 'SwitchDefault', body, line: tok.line });
                } else {
                    // Unexpected token in switch — skip
                    errors.push({ line: cur().line, message: `Unexpected token '${cur().value}' in switch body` });
                    pos++;
                }
            }
            expect(T.RBRACE);
            return { type: 'SwitchStmt', discriminant, cases, line: tok.line };
        }

        // ── Declaration detection ────────────────────────────────────
        // Returns true if current position looks like a declaration (type + name)
        function isDeclarationAhead() {
            if (!isType()) return false;

            // Save position and try parsing a type + identifier
            const save = pos;
            try {
                parseType();

                // After the type, we should see an identifier (possibly with *)
                if (cur().type === T.IDENT &&
                    !CONTROL_KEYWORDS.has(cur().value) &&
                    !TYPE_KEYWORDS.has(cur().value) &&
                    cur().value !== 'sizeof') {
                    pos = save;
                    return true;
                }
            } catch (e) {
                // parse failed
            }
            pos = save;
            return false;
        }

        // ── Declarations (variables, functions, structs) ─────────────

        function parseDeclaration() {
            const startLine = cur().line;
            const typeName = parseType();

            // struct/class/enum body definition
            if (STRUCT_KEYWORDS.has(typeName.split(' ')[0]) && at(T.LBRACE)) {
                return parseStructDef(typeName);
            }

            const name = expect(T.IDENT).value;

            // Function definition or forward declaration
            if (at(T.LPAREN)) {
                return parseFunctionDef(typeName, name, startLine);
            }

            // Variable declaration (possibly array, possibly multi)
            return parseVarDecl(typeName, name, startLine);
        }

        function parseFunctionDef(returnType, name, startLine) {
            expect(T.LPAREN);
            const params = [];
            if (!at(T.RPAREN)) {
                // Parse parameter list
                do {
                    if (at(T.RPAREN)) break;
                    if (at(T.ELLIPSIS)) { pos++; break; } // varargs
                    const pType = parseType();
                    let pName = '';
                    if (at(T.IDENT)) pName = tokens[pos++].value;
                    // Default value
                    let pDefault = null;
                    if (eat(T.ASSIGN)) pDefault = parseExpr();
                    params.push({ type: pType, name: pName, defaultValue: pDefault });
                } while (eat(T.COMMA));
            }
            expect(T.RPAREN);

            // Forward declaration (just a prototype)
            if (eat(T.SEMICOLON)) {
                return { type: 'ForwardDecl', returnType, name, params, line: startLine };
            }

            // Function body
            const body = parseBlock();
            return { type: 'FunctionDef', returnType, name, params, body, line: startLine };
        }

        function parseVarDecl(typeName, firstName, startLine) {
            const declarators = [];

            // First declarator
            declarators.push(parseDeclarator(typeName, firstName));

            // Multiple declarators: int a = 1, b = 2;
            while (eat(T.COMMA)) {
                const nextName = expect(T.IDENT).value;
                declarators.push(parseDeclarator(typeName, nextName));
            }

            expect(T.SEMICOLON);
            return { type: 'VarDecl', typeName, declarators, line: startLine };
        }

        function parseDeclarator(typeName, name) {
            let arraySize = null;
            let isArray = false;

            // Array: name[size] or name[]
            if (eat(T.LBRACKET)) {
                isArray = true;
                if (!at(T.RBRACKET)) arraySize = parseExpr();
                expect(T.RBRACKET);
            }

            let init = null;
            if (eat(T.ASSIGN)) {
                if (at(T.LBRACE)) {
                    init = parseArrayInit();
                } else {
                    init = parseExpr();
                }
            }

            return { name, isArray, arraySize, init };
        }

        function parseStructDef(typeName) {
            const body = [];
            expect(T.LBRACE);
            while (!at(T.RBRACE) && !at(T.EOF)) {
                if (isDeclarationAhead()) {
                    body.push(parseDeclaration());
                } else {
                    body.push(parseStatement());
                }
            }
            expect(T.RBRACE);
            eat(T.SEMICOLON);

            // Extract struct name from typeName (e.g., "struct Button")
            const parts = typeName.split(' ');
            const structName = parts.length > 1 ? parts[1] : '';

            return { type: 'StructDef', name: structName, keyword: parts[0], body, line: 0 };
        }

        // ── Top-level program ────────────────────────────────────────

        function parseProgram() {
            const body = [];
            while (!at(T.EOF)) {
                if (at(T.SEMICOLON)) {
                    pos++;
                    continue;
                }
                body.push(parseDeclaration());
            }
            return { type: 'Program', body };
        }

        return parseProgram();
    }

    // =====================================================================
    // Type tracking — for integer division detection
    // =====================================================================
    function createTypeTracker() {
        const scopes = [{}]; // stack of scope maps: name → typeString

        return {
            enter() { scopes.push({}); },
            leave() { scopes.pop(); },
            declare(name, typeName) {
                scopes[scopes.length - 1][name] = typeName;
            },
            lookup(name) {
                for (let i = scopes.length - 1; i >= 0; i--) {
                    if (name in scopes[i]) return scopes[i][name];
                }
                return null;
            },
            isFloat(typeName) {
                if (!typeName) return false;
                // Strip qualifiers
                const base = typeName.replace(/\b(const|volatile|static|extern|inline)\b/g, '').trim().replace(/\s*[*&]+$/, '');
                return FLOAT_TYPES.has(base);
            },
            isInt(typeName) {
                if (!typeName) return false;
                const base = typeName.replace(/\b(const|volatile|static|extern|inline)\b/g, '').trim().replace(/\s*[*&]+$/, '');
                return INT_TYPES.has(base);
            },
        };
    }

    // =====================================================================
    // Code Generator — AST → JavaScript
    // =====================================================================
    function generate(ast, errors) {
        const types = createTypeTracker();
        const warnings = [];

        // Track which names are function-like (for knowing if identifier is a function)
        const functionNames = new Set();

        // First pass: collect function names and global variable types
        for (const node of ast.body) {
            if (node.type === 'FunctionDef' || node.type === 'ForwardDecl') {
                functionNames.add(node.name);
            }
        }

        function gen(node) {
            if (!node) return '';
            switch (node.type) {
                case 'Program': return genProgram(node);
                case 'FunctionDef': return genFunctionDef(node);
                case 'ForwardDecl': return ''; // skip forward declarations
                case 'VarDecl': return genVarDecl(node);
                case 'StructDef': return genStructDef(node);
                case 'Block': return genBlock(node);
                case 'ExprStmt': return gen(node.expr) + ';';
                case 'ReturnStmt': return node.value ? `return ${gen(node.value)};` : 'return;';
                case 'IfStmt': return genIfStmt(node);
                case 'ForStmt': return genForStmt(node);
                case 'WhileStmt': return `while (${gen(node.condition)}) ${gen(node.body)}`;
                case 'DoWhileStmt': return `do ${gen(node.body)} while (${gen(node.condition)});`;
                case 'SwitchStmt': return genSwitchStmt(node);
                case 'BreakStmt': return 'break;';
                case 'ContinueStmt': return 'continue;';
                case 'EmptyStmt': return '';
                case 'BinaryExpr': return genBinaryExpr(node);
                case 'UnaryExpr': return genUnaryExpr(node);
                case 'TernaryExpr': return `(${gen(node.cond)} ? ${gen(node.consequent)} : ${gen(node.alternate)})`;
                case 'AssignExpr': return genAssignExpr(node);
                case 'CallExpr': return genCallExpr(node);
                case 'IndexExpr': return `${gen(node.object)}[${gen(node.index)}]`;
                case 'MemberExpr': return `${gen(node.object)}.${node.member}`;
                case 'CastExpr': return genCastExpr(node);
                case 'SizeofType': return genSizeofType(node);
                case 'SizeofExpr': return `__sizeof(${gen(node.operand)})`;
                case 'NumberLiteral': return node.value;
                case 'StringLiteral': return `"${node.value}"`;
                case 'CharLiteral': return `'${node.value}'`;
                case 'Identifier': return genIdentifier(node);
                case 'ArrayInit': return `[${node.elements.map(e => gen(e)).join(', ')}]`;
                case 'ErrorExpr': return 'undefined';
                default:
                    errors.push({ line: node.line || 0, message: `Unknown AST node type: ${node.type}` });
                    return '/* unknown */';
            }
        }

        function genProgram(node) {
            // Global scope
            types.enter();
            const parts = [];
            for (const item of node.body) {
                const code = gen(item);
                if (code) parts.push(code);
            }
            types.leave();
            return parts.join('\n');
        }

        function genFunctionDef(node) {
            functionNames.add(node.name);
            types.enter();
            // Register params
            for (const p of node.params) {
                types.declare(p.name, p.type);
            }
            const params = node.params.map(p => p.name).join(', ');
            const body = gen(node.body);
            types.leave();
            return `function ${node.name}(${params}) ${body}`;
        }

        function genVarDecl(node) {
            const parts = [];
            for (const d of node.declarators) {
                types.declare(d.name, node.typeName);

                const keyword = node.typeName.includes('const') ? 'const' : 'let';
                let initStr = '';

                if (d.init) {
                    if (d.init.type === 'ArrayInit') {
                        initStr = ` = [${d.init.elements.map(e => gen(e)).join(', ')}]`;
                    } else if (d.init.type === 'StringLiteral' && d.isArray) {
                        // char array with string init — convert to array of chars as a string
                        // Keep as string for indexing compatibility
                        initStr = ` = "${d.init.value}"`;
                    } else {
                        initStr = ` = ${gen(d.init)}`;
                    }
                } else if (d.isArray && d.arraySize) {
                    // Uninitialized sized array → fill with zeros
                    initStr = ` = new Array(${gen(d.arraySize)}).fill(0)`;
                } else if (!d.isArray) {
                    // Uninitialized scalar — no initializer needed in JS
                    initStr = '';
                }

                parts.push(`${keyword} ${d.name}${initStr};`);
            }
            return parts.join('\n');
        }

        function genStructDef(node) {
            types.enter();
            const memberNames = new Set();
            const memberInits = [];
            const methods = [];

            // First pass: collect member names
            for (const item of node.body) {
                if (item.type === 'VarDecl') {
                    for (const d of item.declarators) {
                        memberNames.add(d.name);
                    }
                }
            }

            // Second pass: generate
            for (const item of node.body) {
                if (item.type === 'FunctionDef') {
                    // Generate as class method (no 'function' keyword)
                    types.enter();
                    for (const p of item.params) types.declare(p.name, p.type);
                    const params = item.params.map(p => p.name).join(', ');
                    // Generate body with member references prefixed with 'this.'
                    const bodyCode = genBlockWithThis(item.body, memberNames);
                    types.leave();
                    methods.push(`${item.name}(${params}) ${bodyCode}`);
                } else if (item.type === 'VarDecl') {
                    for (const d of item.declarators) {
                        types.declare(d.name, item.typeName);
                        const initVal = d.init ? gen(d.init) : (d.isArray ? '[]' : '0');
                        memberInits.push(`this.${d.name} = ${initVal};`);
                    }
                }
            }
            types.leave();

            const constructorBody = memberInits.length > 0 ? memberInits.join('\n') : '';
            const methodsStr = methods.join('\n');
            return `class ${node.name} {\nconstructor() {\n${constructorBody}\n}\n${methodsStr}\n}`;
        }

        // Generate a block body where member names are prefixed with 'this.'
        function genBlockWithThis(blockNode, memberNames) {
            // Simple approach: generate the block, then replace bare member references
            const code = gen(blockNode);
            let result = code;
            for (const name of memberNames) {
                // Replace bare member name references (not after . and not as declarations)
                result = result.replace(new RegExp(`(?<!\\.)\\b${name}\\b(?!\\s*[(:])`, 'g'), `this.${name}`);
            }
            return result;
        }

        function genBlock(node) {
            types.enter();
            const stmts = node.body.map(s => gen(s)).filter(s => s);
            types.leave();
            return `{\n${stmts.join('\n')}\n}`;
        }

        function genIfStmt(node) {
            let s = `if (${gen(node.condition)}) ${gen(node.consequent)}`;
            if (node.alternate) {
                if (node.alternate.type === 'IfStmt') {
                    s += ` else ${gen(node.alternate)}`;
                } else {
                    s += ` else ${gen(node.alternate)}`;
                }
            }
            return s;
        }

        function genForStmt(node) {
            types.enter();
            let init = '';
            if (node.init) {
                if (node.init.type === 'VarDecl') {
                    // Generate without trailing semicolon for for-loop init
                    const d = node.init.declarators[0];
                    types.declare(d.name, node.init.typeName);
                    const initVal = d.init ? ` = ${gen(d.init)}` : '';
                    init = `let ${d.name}${initVal}`;
                } else {
                    init = gen(node.init);
                }
            }
            const cond = node.condition ? gen(node.condition) : '';
            const update = node.update ? gen(node.update) : '';
            const body = gen(node.body);
            types.leave();
            return `for (${init}; ${cond}; ${update}) ${body}`;
        }

        function genSwitchStmt(node) {
            let s = `switch (${gen(node.discriminant)}) {\n`;
            for (const c of node.cases) {
                if (c.type === 'SwitchCase') {
                    s += `case ${gen(c.value)}:\n`;
                    for (const stmt of c.body) s += gen(stmt) + '\n';
                } else {
                    s += `default:\n`;
                    for (const stmt of c.body) s += gen(stmt) + '\n';
                }
            }
            s += '}';
            return s;
        }

        function genBinaryExpr(node) {
            const left = gen(node.left);
            const right = gen(node.right);

            // Integer division detection
            if (node.op === '/') {
                if (needsIntTrunc(node)) {
                    return `Math.trunc(${left} / ${right})`;
                }
            }

            return `(${left} ${node.op} ${right})`;
        }

        // Determine if a division expression needs Math.trunc wrapping
        function needsIntTrunc(divNode) {
            const leftType = inferType(divNode.left);
            const rightType = inferType(divNode.right);

            // If either side is explicitly float, don't truncate
            if (types.isFloat(leftType) || types.isFloat(rightType)) return false;

            // If either side is a float literal, don't truncate
            if (isFloatLiteral(divNode.left) || isFloatLiteral(divNode.right)) return false;

            // Default: truncate (assume integer division)
            return true;
        }

        function isFloatLiteral(node) {
            if (node.type === 'NumberLiteral') {
                return node.value.includes('.');
            }
            return false;
        }

        function inferType(node) {
            switch (node.type) {
                case 'Identifier': return types.lookup(node.name);
                case 'NumberLiteral':
                    return node.value.includes('.') ? 'float' : 'int';
                case 'CallExpr': {
                    // Some known function return types
                    const callee = gen(node.callee);
                    if (callee === 'millis' || callee === 'micros') return 'unsigned long';
                    if (callee === 'analogRead') return 'int';
                    if (callee === 'digitalRead') return 'int';
                    if (callee === 'map') return 'long';
                    if (callee === 'constrain') return 'long';
                    if (callee === 'random') return 'long';
                    return null; // unknown
                }
                case 'BinaryExpr': {
                    // If either operand is float, result is float
                    const lt = inferType(node.left);
                    const rt = inferType(node.right);
                    if (types.isFloat(lt) || types.isFloat(rt)) return 'float';
                    if (isFloatLiteral(node.left) || isFloatLiteral(node.right)) return 'float';
                    return 'int';
                }
                case 'CastExpr':
                    return node.castType;
                case 'UnaryExpr':
                    return inferType(node.operand);
                case 'IndexExpr':
                    return inferType(node.object);
                case 'MemberExpr':
                    return null; // can't easily infer
                default:
                    return null;
            }
        }

        function genUnaryExpr(node) {
            const operand = gen(node.operand);
            if (node.prefix) {
                // Don't wrap simple negative literals in extra parens
                if (node.op === '-' && node.operand.type === 'NumberLiteral') {
                    return `-${operand}`;
                }
                // Don't wrap simple prefix inc/dec
                if ((node.op === '++' || node.op === '--') &&
                    (node.operand.type === 'Identifier' || node.operand.type === 'IndexExpr')) {
                    return `${node.op}${operand}`;
                }
                return `(${node.op}${operand})`;
            }
            // Don't wrap simple postfix inc/dec
            if ((node.op === '++' || node.op === '--') &&
                (node.operand.type === 'Identifier' || node.operand.type === 'IndexExpr')) {
                return `${operand}${node.op}`;
            }
            return `(${operand}${node.op})`;
        }

        function genAssignExpr(node) {
            const left = gen(node.left);
            const right = gen(node.right);

            // Integer division in compound assignment: x /= y
            if (node.op === '/=') {
                const leftType = inferType(node.left);
                const rightType = inferType(node.right);
                if (!types.isFloat(leftType) && !types.isFloat(rightType) && !isFloatLiteral(node.right)) {
                    return `${left} = Math.trunc(${left} / ${right})`;
                }
            }

            return `${left} ${node.op} ${right}`;
        }

        function genCallExpr(node) {
            const callee = gen(node.callee);
            const args = node.args.map(a => gen(a)).join(', ');

            // pgm_read_byte / pgm_read_word → just call with args (identity)
            if (callee === 'pgm_read_byte' || callee === 'pgm_read_word') {
                return `(${args})`;
            }

            return `${callee}(${args})`;
        }

        function genCastExpr(node) {
            // C-style casts: (int)x, (float)x, etc.
            // For integer casts, wrap in Math.trunc; for float, use Number
            const base = node.castType.replace(/\b(const|volatile|static|extern|inline|unsigned|signed)\b/g, '').trim();
            if (INT_TYPES.has(base) || INT_TYPES.has(node.castType)) {
                return `Math.trunc(${gen(node.operand)})`;
            }
            // For float/double casts, just pass through (JS numbers are already doubles)
            return `(${gen(node.operand)})`;
        }

        function genSizeofType(node) {
            const lookup = SIZEOF_TABLE[node.typeName] || SIZEOF_TABLE[node.typeName.replace(/\b(const|volatile)\b/g, '').trim()];
            if (lookup !== undefined) return String(lookup);
            return `__sizeof("${node.typeName}")`;
        }

        function genIdentifier(node) {
            // Convert C++ boolean literals
            if (node.name === 'true') return 'true';
            if (node.name === 'false') return 'false';
            if (node.name === 'null') return 'null';
            return node.name;
        }

        return { code: gen(ast), warnings };
    }

    // =====================================================================
    // Public API
    // =====================================================================
    function transpile(code) {
        const errors = [];

        try {
            // Phase 1: Preprocess
            const preprocessed = preprocess(code);

            // Phase 2: Tokenize
            const tokens = tokenize(preprocessed);

            // Phase 3: Parse
            const ast = parse(tokens, errors);

            if (errors.length > 0) {
                return { code: '', errors, warnings: [] };
            }

            // Phase 4: Generate JavaScript
            const result = generate(ast, errors);

            if (errors.length > 0) {
                return { code: '', errors, warnings: result.warnings || [] };
            }

            return { code: result.code, errors: [], warnings: result.warnings || [] };
        } catch (e) {
            errors.push({ line: 0, message: `Transpiler error: ${e.message}` });
            return { code: '', errors, warnings: [] };
        }
    }

    return { transpile };
})();

// Export for Node.js testing
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ArduinoTranspiler;
}
