const fs = require('fs');
const path = require('path');
const parser = require('@babel/parser');
const traverse = require('@babel/traverse').default;
const generate = require('@babel/generator').default;
const t = require('@babel/types');
const { ESLint } = require('eslint');
const prettier = require('eslint-plugin-prettier');
const unusedImports = require('eslint-plugin-unused-imports');

// ===== 工具函数：判断 key 是否匹配指定名称 =====
function isKeyNamed(node, name) {
    if (t.isIdentifier(node)) {
        return node.name === name;
    }
    if (t.isStringLiteral(node)) {
        return node.value === name;
    }
    return false;
}

function extractCnKeyDirect(node) {
    if (t.isStringLiteral(node)) {
        return node.value;
    }

    if (t.isMemberExpression(node)) {
        let parts = [];
        let current = node;

        while (t.isMemberExpression(current)) {
            if (current.computed) return null;
            const prop = current.property;
            if (!t.isIdentifier(prop)) return null;
            parts.unshift(prop.name);
            current = current.object;
        }

        if (t.isIdentifier(current) && current.name === 'I18N') {
            parts.unshift('I18N');
        } else {
            return null;
        }

        if (parts.length === 4) {
            return parts.join('.');
        }
    }

    return null;
}

// ===== 提取 cn 的 key（仅支持：字符串字面量 或 I18N.a.b.c 四层）=====
function extractCnKey(node, scope) {
    // 情况1: 字符串字面量
    if (t.isStringLiteral(node)) {
        return node.value;
    }
 
     // 情况2: Identifier → 查找其定义
    if (t.isIdentifier(node)) {
        const binding = scope.getBinding(node.name);
        
        if (binding && binding.path.isVariableDeclarator()) {
            const init = binding.path.node.init;
           
            if (init) {
                // 递归解析初始化表达式（不再传 scope，避免无限递归）
                return extractCnKeyDirect(init);
            }
        }
        return null;
    }

    // 情况3: 检查是否为 I18N.a.b.c（必须是四层 MemberExpression，非 computed）
   return extractCnKeyDirect(node);
}

function extractEnValue(node, scope) {
    // 直接是字符串字面量
    if (t.isStringLiteral(node)) {
        return node.value;
    }

    // 是变量（Identifier），尝试回溯
    if (t.isIdentifier(node)) {
        const binding = scope.getBinding(node.name);
        if (binding && binding.path.isVariableDeclarator()) {
            const init = binding.path.node.init;
            if (init && t.isStringLiteral(init)) {
                return init.value;
            }
        }
    }

    // 其他情况（表达式、模板、多变量等）不支持
    return null;
}

// ===== 单文件转换函数 =====
const transformToChinese = (code, globalList) => {
    let localList = {}; // 每个文件独立的 list

    const ast = parser.parse(code, {
        sourceType: 'module',
        plugins: ['jsx', 'typescript']
    });

    const langVariableNames = new Set();

    // 第一阶段：收集 getLang / getLanguage 的变量名
    traverse(ast, {
        VariableDeclarator(path) {
            const { id, init } = path.node;
            if (
                t.isIdentifier(id) &&
                t.isCallExpression(init) &&
                t.isIdentifier(init.callee) &&
                ['getLanguage', 'getLang'].includes(init.callee.name)
            ) {
                langVariableNames.add(id.name);
            }
        }
    });

    // 第二阶段：处理对象和成员表达式
    traverse(ast, {
        ObjectExpression(path) {
            const props = path.node.properties;
            if (props.length === 0) return;

            const cnProp = props.find(
                (prop) => t.isObjectProperty(prop) && !prop.computed && isKeyNamed(prop.key, 'cn') && !prop.method
            );
            const enProp = props.find(
                (prop) => t.isObjectProperty(prop) && !prop.computed && isKeyNamed(prop.key, 'en') && !prop.method
            );
            
            // 仅当 en 是字符串字面量，且 cn 符合提取规则时，才记录
            if (cnProp && enProp) {
                const enStr = extractEnValue(enProp.value, path.scope);
                const cnKey = extractCnKey(cnProp.value, path.scope);
                
                if (cnKey !== null && enStr !== null) {
                    localList[cnKey] = enStr;
                }
            }
        },

        MemberExpression(path) {
            const node = path.node;
            if (!node.computed) return;

            const isLangAccess =
                (t.isIdentifier(node.property) && langVariableNames.has(node.property.name)) ||
                (t.isCallExpression(node.property) &&
                    t.isIdentifier(node.property.callee) &&
                    ['getLang', 'getLanguage'].includes(node.property.callee.name));

            if (isLangAccess) {
                // 替换为 obj['cn']
                path.replaceWith(
                    t.memberExpression(node.object, t.stringLiteral('cn'), true)
                );
            }
        },

        // 清理无用的 lang 变量声明
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
        },

        Identifier(path) {
            if (langVariableNames.has(path.node.name)) {
                const parent = path.parentPath;
                if (parent.isExpressionStatement()) {
                    parent.remove();
                }
            }
        }
    });

    // 第三阶段：清理 getLang / getLanguage 导入
    traverse(ast, {
        ImportDeclaration(path) {
            const specifiers = path.node.specifiers;
            const newSpecifiers = specifiers.filter((spec) => {
                if (t.isImportSpecifier(spec)) {
                    return !t.isIdentifier(spec.imported, { name: 'getLanguage' }) &&
                           !t.isIdentifier(spec.imported, { name: 'getLang' });
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

    // 合并到全局翻译表
    Object.assign(globalList, localList);
    return transformedCode;
};

// ===== ESLint 实例（用于格式化和清理未使用导入）=====
const eslint = new ESLint({
    fix: true,
    cwd: process.cwd(),
    plugins: {
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
        plugins: ["td-rules-plugin"],
        rules: {
            'prettier/prettier': [
                1,
                {
                    endOfLine: 'auto',
                    printWidth: 140,
                    semi: true,
                    singleQuote: true,
                    tabWidth: 4,
                    trailingComma: 'none',
                    jsxBracketSameLine: true,
                }
            ]
        }
    }
});

// ===== 递归读取所有 .js 文件（排除 index.js）=====
const getAllJsFiles = (dir) => {
    let results = [];
    const files = fs.readdirSync(dir);

    for (const file of files) {
        const fullPath = path.join(dir, file);
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
            results = results.concat(getAllJsFiles(fullPath));
        } else if (file.endsWith('.js') && file !== 'index.js') {
            results.push(fullPath);
        }
    }
    return results;
};

// ===== 处理单个文件 =====
const processFile = async (filePath, globalList) => {
    const code = fs.readFileSync(filePath, 'utf-8');
    let transformedCode = transformToChinese(code, globalList);

    const results = await eslint.lintText(transformedCode, { filePath });
    const finalCode = results[0].output || transformedCode;

    fs.writeFileSync(filePath, finalCode, 'utf-8');
};

// ===== 导出接口 =====
module.exports = {
    processFile,
    getAllJsFiles,
    transformToChinese // 便于单元测试
};
