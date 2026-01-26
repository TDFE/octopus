
const fs = require('fs');
const path = require('path');
const parser = require('@babel/parser');
const traverse = require('@babel/traverse').default;
const generate = require('@babel/generator').default;
const t = require('@babel/types');
const { ESLint } = require('eslint');
const prettier = require('eslint-plugin-prettier');
const unusedImports = require('eslint-plugin-unused-imports');

// ===== 工具函数 =====
const astNodeToString = (node) => {
    if (t.isStringLiteral(node)) {
        return node.value;
    }
    if (t.isIdentifier(node)) {
        return node.name;
    }
    if (t.isMemberExpression(node)) {
        const objectStr = astNodeToString(node.object);
        const propertyStr = astNodeToString(node.property);
        if(objectStr === 'I18N'){
            return propertyStr;
        }
        return `${objectStr}.${propertyStr}`;
    }
    return generate(node, { concise: true, comments: false }).code;
}

function isKeyNamed(node, name) {
    if (t.isIdentifier(node)) {
        return node.name === name;
    }
    if (t.isStringLiteral(node)) {
        return node.value === name;
    }
    return false;
}

// ===== 单文件转换函数（接受 code 和 filePath）=====
const transformToChinese = (code, globalList) => {
    let localList = {}; // 每个文件独立的 list

    const ast = parser.parse(code, {
        sourceType: 'module',
        plugins: ['jsx', 'typescript']
    });

    const langVariableNames = new Set();

    // 第一阶段：找 getLanguage()
    traverse(ast, {
        VariableDeclarator(path) {
            const { id, init } = path.node;
            if (t.isIdentifier(id) && t.isCallExpression(init) && t.isIdentifier(init.callee, { name: 'getLanguage' })) {
                langVariableNames.add(id.name);
            }
        }
    });

    // 第二阶段：处理多语言对象
    traverse(ast, {
        ObjectExpression(path) {
            const props = path.node.properties;
            if (props.length === 0) return;

            const cnProp = props.find(
                (prop) => t.isObjectProperty(prop) && !prop.computed && isKeyNamed(prop.key,  'cn') && !prop.method
                
            );

            const enProp = props.find(
                (prop) => t.isObjectProperty(prop) && !prop.computed && isKeyNamed(prop.key, 'en') && !prop.method &&  t.isStringLiteral(prop.value)
            );
  
            if (cnProp && enProp) {
                const cnText = astNodeToString(cnProp.value);
                localList[cnText] = enProp.value.value
            }

            if (cnProp) {
                path.replaceWith(cnProp.value);
            }
        },

        MemberExpression(path) {
            const node = path.node;
            if (t.isMemberExpression(node.object) && t.isIdentifier(node.property) && langVariableNames.has(node.property.name)) {
                path.replaceWith(node.object);
            }
        },

        Identifier(path) {
            if (langVariableNames.has(path.node.name)) {
                const parent = path.parentPath;
                if (parent.isExpressionStatement()) {
                    parent.remove();
                }
            }
        },

        VariableDeclarator(path) {
            const { id } = path.node;
            if (t.isIdentifier(id) && langVariableNames.has(id.name)) {
                const parent = path.parentPath;
                if (parent.isVariableDeclaration()) {
                    if (parent.node.declarations.length === 1) {
                        parent.remove();
                    } else {
                        path.remove();
                    }
                }
            }
        }
    });

    // 第三阶段：清理 getLanguage 导入
    traverse(ast, {
        ImportDeclaration(path) {
            const specifiers = path.node.specifiers;
            const newSpecifiers = specifiers.filter((spec) => {
                if (t.isImportSpecifier(spec)) {
                    return !t.isIdentifier(spec.imported, { name: 'getLanguage' });
                }
                return true;
            });

            if (newSpecifiers.length === 0) {
                path.remove();
            } else if (newSpecifiers.length !== specifiers.length) {
                path.node.specifiers = newSpecifiers;
            }
        }
    });

    const transformedCode = generate(ast, {
        retainLines: true,
        concise: false,
        comments: false
    }).code;

    // 合并到全局 list
    
    Object.assign(globalList, localList);
    return transformedCode;
}

// ===== ESLint 实例（复用）=====
const eslint = new ESLint({
    fix: true,
    cwd: process.cwd(),
    useEslintrc: false,
    plugins: {
        prettier,
        'unused-imports': unusedImports
    },
    baseConfig: {
        parserOptions: { ecmaVersion: 'latest', sourceType: 'module' },
        plugins: ['prettier', 'unused-imports'],
        rules: {
            'unused-imports/no-unused-imports': 'error',
            'prettier/prettier': 'error'
        }
    },
    overrideConfig: {
        env: { browser: true, es2021: true, node: true },
        extends: ['eslint:recommended'],
        parserOptions: { ecmaVersion: 2022, sourceType: 'module' },
        rules: {
            'no-unused-vars': ['error', { vars: 'all', args: 'none', caughtErrors: 'none', ignoreRestSiblings: true }],
            semi: ['error', 'always'],
            indent: ['error', 4, { SwitchCase: 1 }],
            quotes: ['error', 'single'],
            'comma-dangle': ['error', 'never'],
            'prettier/prettier': [
                1,
                {
                    endOfLine: 'auto',
                    printWidth: 140,
                    semi: true,
                    singleQuote: true,
                    tabWidth: 4,
                    trailingComma: 'none',
                    jsxBracketSameLine: true
                }
            ]
        }
    }
});

// ===== 递归读取所有 .js 文件 =====
const getAllJsFiles = (dir) => {
    let results = [];
    const files = fs.readdirSync(dir);

    for (const file of files) {
        const fullPath = path.join(dir, file);
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
            results = results.concat(getAllJsFiles(fullPath)); // 递归
        } else if (file.endsWith('.js') && !['index.js'].includes(file)) {
            results.push(fullPath);
        }
    }

    return results;
}

// ===== 处理单个文件 =====
const processFile = async (filePath, globalList) => {
    const code = fs.readFileSync(filePath, 'utf-8');
    let transformedCode = transformToChinese(code, globalList);

    const results = await eslint.lintText(transformedCode, { filePath });
    const finalCode = results[0].output || transformedCode;

    fs.writeFileSync(filePath, finalCode, 'utf-8');
}

module.exports = {
    processFile,
    getAllJsFiles
}
