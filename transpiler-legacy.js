/**
 * Arduino C++ to JavaScript Transpiler
 * 
 * Converts Arduino/C++ code into executable JavaScript by performing
 * source-to-source transformation. Handles the subset of C++ used
 * in the NSWI170 FunShield labs.
 */

const ArduinoTranspiler = (() => {

    const TYPE_KEYWORDS = new Set([
        'void', 'int', 'long', 'short', 'unsigned', 'signed',
        'char', 'float', 'double', 'bool', 'boolean', 'byte',
        'size_t', 'uint8_t', 'int8_t', 'uint16_t', 'int16_t',
        'uint32_t', 'int32_t', 'uint64_t', 'int64_t',
        'word', 'String', 'auto'
    ]);

    const CONTROL_KEYWORDS = new Set([
        'if', 'else', 'for', 'while', 'do', 'switch', 'case',
        'return', 'class', 'struct', 'enum', 'new', 'delete',
        'break', 'continue', 'default', 'catch', 'try', 'throw'
    ]);

    function transpile(code) {
        const errors = [];
        const warnings = [];

        try {
            let js = code;

            // Phase 1: Extract and protect string/char literals from transformation
            const strings = [];
            js = js.replace(/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/g, (m) => {
                strings.push(m);
                return `__STR_${strings.length - 1}__`;
            });

            // Phase 2: Strip comments
            js = stripComments(js);

            // Phase 3: Handle preprocessor
            js = handlePreprocessor(js);

            // Phase 4: Join multi-line constructs (arrays, etc.)
            js = joinMultilineConstructs(js);

            // Phase 4.5: Resolve sizeof(type) before line transform eats type names
            js = resolveSizeof(js);

            // Phase 5: Line-by-line transformation
            js = transformCode(js);

            // Phase 6: Post-processing fixups
            js = postProcess(js);

            // Phase 7: Restore string literals
            js = js.replace(/__STR_(\d+)__/g, (m, idx) => strings[parseInt(idx)]);

            return { code: js, errors, warnings };
        } catch (e) {
            errors.push({ line: 0, message: `Transpiler error: ${e.message}` });
            return { code: '', errors, warnings };
        }
    }

    function stripComments(code) {
        let result = code.replace(/\/\/.*$/gm, '');
        result = result.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '));
        return result;
    }

    function handlePreprocessor(code) {
        return code.split('\n').map(line => {
            const trimmed = line.trim();
            if (!trimmed.startsWith('#')) return line;

            if (/^#\s*include/.test(trimmed)) return '';

            let m = trimmed.match(/^#\s*define\s+(\w+)\(([^)]*)\)\s+(.+)$/);
            if (m) return `function ${m[1]}(${m[2]}) { return (${m[3]}); }`;

            m = trimmed.match(/^#\s*define\s+(\w+)\s+(.+)$/);
            if (m) return `const ${m[1]} = ${m[2]};`;

            m = trimmed.match(/^#\s*define\s+(\w+)\s*$/);
            if (m) return `const ${m[1]} = true;`;

            return '';
        }).join('\n');
    }

    /**
     * Join multi-line array initializers and other constructs that span lines.
     * e.g., int data[] = {\n  1, 2, 3,\n  4, 5, 6\n};
     */
    function joinMultilineConstructs(code) {
        let lines = code.split('\n');
        let result = [];
        let accumulator = '';
        let braceDepth = 0;
        let inMultiline = false;

        for (let line of lines) {
            if (inMultiline) {
                accumulator += ' ' + line.trim();
                for (let ch of line) {
                    if (ch === '{') braceDepth++;
                    if (ch === '}') braceDepth--;
                }
                if (braceDepth <= 0) {
                    result.push(accumulator);
                    accumulator = '';
                    inMultiline = false;
                }
            } else {
                // Check if this line opens a brace-init that doesn't close
                let trimmed = line.trim();
                // Detect: something = { ... without closing }; on this line
                // But NOT function bodies (those have type name(params) { pattern)
                let openBraces = 0;
                let hasBraceInit = false;
                for (let i = 0; i < trimmed.length; i++) {
                    if (trimmed[i] === '{') {
                        openBraces++;
                        // Check if preceded by = (brace initializer)
                        let before = trimmed.substring(0, i).trim();
                        if (before.endsWith('=')) hasBraceInit = true;
                    }
                    if (trimmed[i] === '}') openBraces--;
                }

                if (hasBraceInit && openBraces > 0) {
                    // This is a multi-line initializer
                    inMultiline = true;
                    braceDepth = openBraces;
                    accumulator = line;
                } else {
                    result.push(line);
                }
            }
        }

        if (accumulator) result.push(accumulator);
        return result.join('\n');
    }

    function transformCode(code) {
        let lines = code.split('\n');
        let result = [];

        for (let i = 0; i < lines.length; i++) {
            result.push(transformLine(lines[i]));
        }

        return result.join('\n');
    }

    function transformLine(line) {
        let trimmed = line.trim();
        if (!trimmed) return line;

        let indent = line.match(/^(\s*)/)[1];

        // Skip lines that are just braces, returns, breaks, etc.
        if (/^[{}]$/.test(trimmed)) return line;
        if (/^};?\s*$/.test(trimmed)) return line;
        if (/^(return|break|continue)\b/.test(trimmed)) return line;
        if (/^(else)\s*\{?\s*$/.test(trimmed)) return line;
        if (/^(case\s|default\s*:)/.test(trimmed)) return line;

        // Access specifiers -> remove
        if (/^(public|private|protected)\s*:/.test(trimmed)) return indent;

        // class/struct definition
        let m = trimmed.match(/^(class|struct)\s+(\w+)\s*(?::\s*(?:public|private|protected)\s+\w+\s*)?\{/);
        if (m) return `${indent}class ${m[2]} {`;

        // Forward declaration: type name(params); (no body)
        m = trimmed.match(
            /^(?:(?:const|constexpr|static|volatile|inline|virtual|explicit)\s+)*(?:(?:unsigned|signed)\s+)?(?:void|int|long|short|char|float|double|bool|boolean|byte|size_t|u?int(?:8|16|32|64)_t|word|auto|String|[A-Z]\w*)(?:\s+long)?\s*[*&]*\s+(\w+)\s*\([^)]*\)\s*;$/
        );
        if (m && !CONTROL_KEYWORDS.has(m[1])) {
            // Forward declaration - emit as empty comment or nothing
            return `${indent}/* forward: ${m[1]} */`;
        }

        // Function definition: type name(params) { body } (all on one line)
        let funcResult = tryMatchFunctionOneLiner(trimmed);
        if (funcResult) {
            return `${indent}function ${funcResult.name}(${funcResult.params}) {${funcResult.body}}`;
        }

        // Function definition: type name(params) { (opening brace, body on next lines)
        funcResult = tryMatchFunction(trimmed);
        if (funcResult) {
            if (funcResult.emptyBody) {
                return `${indent}function ${funcResult.name}(${funcResult.params}) {}`;
            }
            return `${indent}function ${funcResult.name}(${funcResult.params}) {`;
        }

        // Variable declarations
        let varResult = tryTransformVariableDecl(trimmed);
        if (varResult !== null) {
            return `${indent}${varResult}`;
        }

        // For-loop with type in init
        if (/^for\s*\(/.test(trimmed)) {
            return `${indent}${transformForLoop(trimmed)}`;
        }

        return line;
    }

    /**
     * Match: type name(params) { body } all on one line (with content inside braces)
     */
    function tryMatchFunctionOneLiner(line) {
        const re = new RegExp(
            '^(?:(?:const|constexpr|static|volatile|inline|virtual|explicit)\\s+)*' +
            '(?:(?:unsigned|signed)\\s+)?' +
            '(?:void|int|long|short|char|float|double|bool|boolean|byte|size_t|u?int(?:8|16|32|64)_t|word|auto|String|[A-Z]\\w*)' +
            '(?:\\s+long)?\\s*[*&]*' +
            '\\s+(\\w+)' +       // group 1: name
            '\\s*\\(([^)]*)\\)' + // group 2: params
            '\\s*(?:const)?\\s*\\{(.+)\\}\\s*$'  // group 3: body (non-empty)
        );
        let m = line.match(re);
        if (!m) return null;
        if (CONTROL_KEYWORDS.has(m[1])) return null;
        return { name: m[1], params: transformParams(m[2]), body: ' ' + m[3].trim() + ' ' };
    }

    /**
     * Match: type name(params) { (or type name(params) {})
     */
    function tryMatchFunction(line) {
        const funcRe = new RegExp(
            '^(?:(?:const|constexpr|static|volatile|inline|virtual|explicit)\\s+)*' +
            '(?:(?:unsigned|signed)\\s+)?' +
            '(?:void|int|long|short|char|float|double|bool|boolean|byte|size_t|u?int(?:8|16|32|64)_t|word|auto|String|[A-Z]\\w*)' +
            '(?:\\s+long)?\\s*[*&]*' +
            '\\s+(\\w+)' +
            '\\s*\\(([^)]*)\\)' +
            '\\s*(?:const)?\\s*\\{(\\s*\\})?\\s*$'
        );

        let m = line.match(funcRe);
        if (!m) return null;
        if (CONTROL_KEYWORDS.has(m[1])) return null;

        return {
            name: m[1],
            params: transformParams(m[2]),
            emptyBody: !!m[3]
        };
    }

    function transformParams(params) {
        if (!params.trim()) return '';

        return params.split(',').map(p => {
            p = p.trim();
            if (!p) return '';

            let defaultVal = '';
            let eqIdx = findTopLevelEquals(p);
            if (eqIdx !== -1) {
                defaultVal = p.substring(eqIdx);
                p = p.substring(0, eqIdx).trim();
            }

            let cleaned = p.replace(/\[.*?\]/g, '');
            let tokens = cleaned.split(/[\s*&]+/).filter(t => t.length > 0);
            let name = tokens[tokens.length - 1];

            if (TYPE_KEYWORDS.has(name)) return '';

            return defaultVal ? `${name} ${defaultVal}` : name;
        }).filter(p => p.length > 0).join(', ');
    }

    function findTopLevelEquals(s) {
        let depth = 0;
        for (let i = 0; i < s.length; i++) {
            if (s[i] === '(' || s[i] === '<') depth++;
            if (s[i] === ')' || s[i] === '>') depth--;
            if (s[i] === '=' && depth === 0 && s[i + 1] !== '=') return i;
        }
        return -1;
    }

    function tryTransformVariableDecl(line) {
        let m;

        // ---- const char* / char* with string ----
        m = line.match(/^(const\s+)?char\s*\*\s*(\w+)\s*=\s*(__STR_\d+__)\s*;$/);
        if (m) return `${m[1] ? 'const' : 'let'} ${m[2]} = ${m[3]};`;

        // ---- char array with string: char name[N] = "..."; ----
        m = line.match(/^(?:const\s+)?char\s+(\w+)\s*\[\s*\d*\s*\]\s*=\s*(__STR_\d+__)\s*;$/);
        if (m) return `let ${m[1]} = ${m[2]};`;

        // ---- char array without init: char name[N]; ----
        m = line.match(/^char\s+(\w+)\s*\[\s*(\d+)\s*\]\s*;$/);
        if (m) return `let ${m[1]} = new Array(${m[2]}).fill(0);`;

        // ---- constexpr array ----
        m = line.match(/^constexpr\s+(?:(?:unsigned|signed)\s+)?(?:int|long|short|char|float|double|byte|u?int(?:8|16|32|64)_t)\s+(\w+)\s*\[\s*\d*\s*\]\s*=\s*(\{[^}]*\})\s*;$/);
        if (m) return `const ${m[1]} = ${m[2].replace(/\{/g, '[').replace(/\}/g, ']')};`;

        // ---- const array ----
        m = line.match(/^const\s+(?:(?:unsigned|signed)\s+)?(?:int|long|short|char|float|double|byte|bool|u?int(?:8|16|32|64)_t)\s+(\w+)\s*\[\s*\d*\s*\]\s*=\s*(\{[^}]*\})\s*;$/);
        if (m) return `const ${m[1]} = ${m[2].replace(/\{/g, '[').replace(/\}/g, ']')};`;

        // ---- regular array with init ----
        m = line.match(/^(?:(?:static|volatile)\s+)?(?:(?:unsigned|signed)\s+)?(?:int|long|short|char|float|double|bool|boolean|byte|size_t|u?int(?:8|16|32|64)_t|word)\s+(\w+)\s*\[\s*\d*\s*\]\s*=\s*(\{[^}]*\})\s*;$/);
        if (m) return `let ${m[1]} = ${m[2].replace(/\{/g, '[').replace(/\}/g, ']')};`;

        // ---- array without init ----
        m = line.match(/^(?:(?:static|volatile)\s+)?(?:(?:unsigned|signed)\s+)?(?:int|long|short|char|float|double|bool|boolean|byte|size_t|u?int(?:8|16|32|64)_t|word)\s+(\w+)\s*\[\s*(\d+)\s*\]\s*;$/);
        if (m) return `let ${m[1]} = new Array(${m[2]}).fill(0);`;

        // ---- constexpr scalar ----
        m = line.match(/^constexpr\s+(?:(?:unsigned|signed)\s+)?(?:int|long|short|char|float|double|bool|boolean|byte|size_t|u?int(?:8|16|32|64)_t|word)(?:\s+long)?\s+(\w+)\s*=\s*(.+);$/);
        if (m) return `const ${m[1]} = ${cleanValue(m[2])};`;

        // ---- const scalar ----
        m = line.match(/^const\s+(?:(?:unsigned|signed)\s+)?(?:int|long|short|char|float|double|bool|boolean|byte|size_t|u?int(?:8|16|32|64)_t|word)(?:\s+long)?\s+(\w+)\s*=\s*(.+);$/);
        if (m) return `const ${m[1]} = ${cleanValue(m[2])};`;

        // ---- multi-variable declaration: type a, b, c; ----
        m = line.match(/^(?:(?:static|volatile)\s+)?(?:(?:unsigned|signed)\s+)?(?:int|long|short|char|float|double|bool|boolean|byte|size_t|u?int(?:8|16|32|64)_t|word)(?:\s+long)?\s+(\w+(?:\s*=\s*[^,;]+)?(?:\s*,\s*\w+(?:\s*=\s*[^,;]+)?)+)\s*;$/);
        if (m) {
            let vars = m[1].split(',').map(v => {
                v = v.trim();
                let eqIdx = v.indexOf('=');
                if (eqIdx !== -1) {
                    let name = v.substring(0, eqIdx).trim();
                    let val = cleanValue(v.substring(eqIdx + 1).trim());
                    return `let ${name} = ${val}`;
                }
                return `let ${v} = 0`;
            });
            return vars.join('; ') + ';';
        }

        // ---- regular variable with init ----
        m = line.match(/^(?:(?:static|volatile)\s+)?(?:(?:unsigned|signed)\s+)?(?:int|long|short|char|float|double|bool|boolean|byte|size_t|u?int(?:8|16|32|64)_t|word)(?:\s+long)?\s+[*&]*\s*(\w+)\s*=\s*(.+);$/);
        if (m) {
            if (m[2].trim().endsWith('{')) return null;
            return `let ${m[1]} = ${cleanValue(m[2])};`;
        }

        // ---- regular variable without init ----
        m = line.match(/^(?:(?:static|volatile)\s+)?(?:(?:unsigned|signed)\s+)?(?:int|long|short|char|float|double|bool|boolean|byte|size_t|u?int(?:8|16|32|64)_t|word)(?:\s+long)?\s+[*&]*\s*(\w+)\s*;$/);
        if (m) {
            if (CONTROL_KEYWORDS.has(m[1])) return null;
            return `let ${m[1]} = 0;`;
        }

        // ---- enum ----
        m = line.match(/^enum\s+(?:class\s+)?(\w+)?\s*\{([^}]*)\}\s*;?$/);
        if (m) return transformEnum(m[2]);

        return null;
    }

    function transformEnum(body) {
        let items = body.split(',').map(s => s.trim()).filter(s => s.length > 0);
        let val = 0;
        let decls = [];
        for (let item of items) {
            let parts = item.split('=').map(s => s.trim());
            if (parts.length > 1) val = parseInt(parts[1]);
            decls.push(`const ${parts[0]} = ${val};`);
            val++;
        }
        return decls.join(' ');
    }

    function transformForLoop(line) {
        let m = line.match(/^for\s*\(\s*(?:(?:const\s+)?(?:auto|int|long|char|float|double|byte|bool|unsigned\s+\w+|u?int\d+_t)\s*[&*]?\s+)(\w+)\s*:\s*([^)]+)\)\s*\{?\s*$/);
        if (m) return `for (let ${m[1]} of ${m[2]}) {`;

        m = line.match(/^for\s*\(\s*(?:(?:unsigned|signed)\s+)?(?:int|long|short|char|float|double|byte|size_t|u?int(?:8|16|32|64)_t|word|auto)\s+/);
        if (m) {
            return line.replace(
                /^(for\s*\(\s*)(?:(?:unsigned|signed)\s+)?(?:int|long|short|char|float|double|byte|size_t|u?int(?:8|16|32|64)_t|word|auto)(?:\s+long)?\s+/,
                '$1let '
            );
        }

        return line;
    }

    function cleanValue(val) {
        val = val.trim();
        val = val.replace(/(\d+)\s*[uU]?[lL]{1,2}\b/g, '$1');
        return val;
    }

    /**
     * Resolve sizeof(type) to numeric constants before the line-by-line transform.
     * This prevents the transform from eating type names like (int), (long) as casts.
     */
    function resolveSizeof(code) {
        const sizes = {
            'char': 1, 'byte': 1, 'uint8_t': 1, 'int8_t': 1, 'bool': 1,
            'short': 2, 'int': 2, 'uint16_t': 2, 'int16_t': 2,
            'long': 4, 'float': 4, 'uint32_t': 4, 'int32_t': 4,
            'double': 4, 'uint64_t': 8, 'int64_t': 8
        };
        return code.replace(/\bsizeof\s*\(\s*(\w+)\s*\)/g, (match, arg) => {
            if (sizes[arg] !== undefined) return String(sizes[arg]);
            return `__sizeof(${arg})`;
        });
    }

    function postProcess(code) {
        let result = code;

        // Integer division: wrap x / y with Math.trunc when both sides look like ints
        // Use negative lookbehind/lookahead to avoid matching inside string placeholders
        result = result.replace(
            /(\w[\w\[\]\.]*)\s*\/\s*(\w[\w\[\]\.]*)/g,
            (match, lhs, rhs) => {
                // Don't wrap if either side is a float literal
                if (/\d*\.\d+/.test(lhs) || /\d*\.\d+/.test(rhs)) return match;
                // Don't wrap if it's inside a string placeholder (__STR_N__)
                if (/__STR_/.test(lhs) || /__STR_/.test(rhs)) return match;
                return `Math.trunc(${lhs} / ${rhs})`;
            }
        );

        // this-> to this.
        result = result.replace(/this\s*->/g, 'this.');
        // -> to .
        result = result.replace(/->/g, '.');
        // :: to .
        result = result.replace(/::/g, '.');

        // nullptr -> null
        result = result.replace(/\bnullptr\b/g, 'null');

        // C-style casts
        result = result.replace(/\(\s*(?:(?:unsigned|signed)\s+)?(?:int|long|short|char|float|double|bool|boolean|byte|size_t|u?int(?:8|16|32|64)_t|word)\s*(?:\s+(?:int|long|short))?\s*[*]*\s*\)\s*/g, '');

        // Remaining type keywords before variable names in inline contexts
        // e.g., inside multi-statement lines that weren't caught line-by-line
        result = result.replace(/\b(?:unsigned|signed)\s+(?:int|long|short|char)\s+(?=\w+\s*[=;,)])/g, 'let ');

        // Fix struct/class member declarations: "let x = 0;" inside class body -> "x = 0;"
        // This is a simplified fix: in JS class bodies, you use field syntax without let
        // We detect class bodies and strip "let " from field declarations
        result = fixClassMembers(result);

        // Binary literals
        result = result.replace(/\bB([01]{1,8})\b/g, '0b$1');

        // Integer suffixes
        result = result.replace(/(\d+)\s*[uU]?[lL]{1,2}\b/g, '$1');

        // sizeof(type) is already resolved in resolveSizeof() (Phase 4.5)
        // Only sizeof(variable) remains, handled by __sizeof at runtime

        // PROGMEM
        result = result.replace(/\bPROGMEM\b/g, '');
        result = result.replace(/\bpgm_read_byte\s*\(/g, '(');
        result = result.replace(/\bpgm_read_word\s*\(/g, '(');

        // C++ alternative operators
        result = result.replace(/\band\b/g, '&&');
        result = result.replace(/\bor\b/g, '||');
        result = result.replace(/\bnot\b/g, '!');

        // delete
        result = result.replace(/\bdelete\s*\[\s*\]\s+(\w+)\s*;/g, '$1 = null;');
        result = result.replace(/\bdelete\s+(\w+)\s*;/g, '$1 = null;');

        // String type
        result = result.replace(/\bString\s+(\w+)\s*=\s*/g, 'let $1 = ');
        result = result.replace(/\bString\s+(\w+)\s*;/g, 'let $1 = "";');

        return result;
    }

    /**
     * Fix class/struct member declarations.
     * In JS class bodies, field declarations use bare names: "x = 0;" not "let x = 0;"
     * Also, methods inside class bodies use bare function name, not "function name()".
     */
    function fixClassMembers(code) {
        let lines = code.split('\n');
        let result = [];
        let classDepth = 0;
        let braceDepth = 0;
        let inClass = false;
        let classBraceStart = 0;

        for (let line of lines) {
            let trimmed = line.trim();

            // Track class/struct openings
            if (/^class\s+\w+\s*\{/.test(trimmed)) {
                inClass = true;
                classBraceStart = braceDepth;
            }

            // Count braces
            for (let ch of trimmed) {
                if (ch === '{') braceDepth++;
                if (ch === '}') braceDepth--;
            }

            if (inClass && braceDepth > classBraceStart) {
                // Inside class body: fix member declarations
                // "let x = 0;" -> "x = 0;" (field declaration)
                // "function name()" -> "name()" (method)
                line = line.replace(/^(\s*)let\s+/, '$1');
                line = line.replace(/^(\s*)function\s+(\w+)\s*\(/, '$1$2(');
            }

            if (inClass && braceDepth <= classBraceStart) {
                inClass = false;
            }

            result.push(line);
        }

        return result.join('\n');
    }

    return { transpile };
})();
