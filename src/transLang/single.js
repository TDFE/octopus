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

    // 处理 I18N.template(I18N.lang.xxx.yyy, {...}) 形式
    if (t.isCallExpression(node)) {
        const { callee, arguments: args } = node;

        // 检查是否为 I18N.template 调用
        if (t.isMemberExpression(callee) &&
            t.isIdentifier(callee.object, { name: 'I18N' }) &&
            t.isIdentifier(callee.property, { name: 'template' }) &&
            args.length >= 1) {

            // 提取第一个参数（I18N.lang.xxx.yyy）
            const firstArg = args[0];
            if (t.isMemberExpression(firstArg)) {
                let parts = [];
                let current = firstArg;

                while (t.isMemberExpression(current)) {
                    if (current.computed) return null;
                    const prop = current.property;
                    if (!t.isIdentifier(prop)) return null;
                    parts.unshift(prop.name);
                    current = current.object;
                }

                if (t.isIdentifier(current) && current.name === 'I18N') {
                    // 不包含 I18N，直接返回 lang.xxx.yyy
                    return parts.join('.');
                }
            }
        }
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

// ===== 从 TemplateLiteral 中提取所有部分 =====
function extractTemplateParts(node) {
    const parts = [];

    for (let i = 0; i < node.quasis.length; i++) {
        // 添加字符串部分
        if (node.quasis[i].value.raw) {
            parts.push({ type: 'string', value: node.quasis[i].value.raw });
        }

        // 如果不是最后一个 quasi，添加表达式部分
        if (i < node.expressions.length) {
            const expr = node.expressions[i];
            if (t.isIdentifier(expr)) {
                parts.push({ type: 'variable', value: expr.name });
            } else {
                parts.push({ type: 'expr', value: expr });
            }
        }
    }

    return parts;
}

// ===== 从 BinaryExpression 中提取所有部分（I18N引用、字符串、变量）=====
function extractBinaryParts(node) {
    const parts = [];

    function traverse(n) {
        if (t.isBinaryExpression(n) && n.operator === '+') {
            traverse(n.left);
            traverse(n.right);
        } else if (t.isMemberExpression(n)) {
            // I18N 引用
            const key = extractCnKeyDirect(n);
            if (key && key.includes('.')) {
                parts.push({ type: 'i18n', value: key });
            } else {
                parts.push({ type: 'expr', value: n });
            }
        } else if (t.isStringLiteral(n)) {
            // 字符串字面量
            parts.push({ type: 'string', value: n.value });
        } else if (t.isIdentifier(n)) {
            // 变量
            parts.push({ type: 'variable', value: n.name });
        } else {
            // 其他表达式
            parts.push({ type: 'expr', value: n });
        }
    }

    traverse(node);
    return parts;
}

// ===== 尝试匹配 cn 和 en 的表达式，返回多个映射 =====
function matchBinaryExpressions(cnNode, enNode) {
    // 提取 cn 部分
    let cnParts;
    if (t.isBinaryExpression(cnNode) && cnNode.operator === '+') {
        cnParts = extractBinaryParts(cnNode);
    } else {
        return [];
    }

    // 提取 en 部分（可能是 BinaryExpression 或 TemplateLiteral）
    let enParts;
    if (t.isBinaryExpression(enNode) && enNode.operator === '+') {
        enParts = extractBinaryParts(enNode);
    } else if (t.isTemplateLiteral(enNode)) {
        enParts = extractTemplateParts(enNode);
    } else {
        return [];
    }

    const mappings = [];

    // 提取所有 I18N 引用
    const i18nParts = cnParts.filter(p => p.type === 'i18n');

    // 如果没有 I18N 引用，返回空
    if (i18nParts.length === 0) {
        return mappings;
    }

    // 如果只有一个 I18N 引用，将整个 en 表达式映射给它
    if (i18nParts.length === 1) {
        let enValue = '';
        let varIndex = 1;
        for (const part of enParts) {
            if (part.type === 'string') {
                enValue += part.value;
            } else if (part.type === 'variable' || part.type === 'expr') {
                enValue += `{val${varIndex}}`;
                varIndex++;
            }
        }
        mappings.push({ key: i18nParts[0].value, value: enValue });
        return mappings;
    }

    // 多个 I18N 引用：使用变量位置作为锚点进行匹配
    // 策略：找到 cn 和 en 中的共同变量，根据变量前后的位置匹配字符串

    // 构建位置索引：记录每个 I18N 和字符串前后的变量
    const cnMap = [];
    const enMap = [];

    // 记录 cn 中每个 I18N 前后的变量
    for (let i = 0; i < cnParts.length; i++) {
        const part = cnParts[i];
        if (part.type === 'i18n') {
            const prevVar = i > 0 && cnParts[i - 1].type === 'variable' ? cnParts[i - 1].value : null;
            const nextVar = i < cnParts.length - 1 && cnParts[i + 1].type === 'variable' ? cnParts[i + 1].value : null;
            cnMap.push({
                index: i,
                key: part.value,
                prevVar,
                nextVar,
                position: prevVar ? 'after' : (nextVar ? 'before' : 'standalone')
            });
        }
    }

    // 记录 en 中每个字符串前后的变量
    for (let i = 0; i < enParts.length; i++) {
        const part = enParts[i];
        if (part.type === 'string') {
            const prevVar = i > 0 && enParts[i - 1].type === 'variable' ? enParts[i - 1].value : null;
            const nextVar = i < enParts.length - 1 && enParts[i + 1].type === 'variable' ? enParts[i + 1].value : null;
            enMap.push({
                index: i,
                value: part.value,
                prevVar,
                nextVar,
                position: prevVar ? 'after' : (nextVar ? 'before' : 'standalone')
            });
        }
    }

    // 匹配：根据前后变量的位置进行匹配
    for (const cnItem of cnMap) {
        // 查找具有相同前后变量的 en 字符串
        const matchedEnItem = enMap.find(enItem => {
            // 优先匹配前后都相同的
            if (cnItem.prevVar && cnItem.nextVar) {
                return enItem.prevVar === cnItem.prevVar && enItem.nextVar === cnItem.nextVar;
            }
            // 匹配前一个变量相同的
            if (cnItem.prevVar) {
                return enItem.prevVar === cnItem.prevVar;
            }
            // 匹配后一个变量相同的
            if (cnItem.nextVar) {
                return enItem.nextVar === cnItem.nextVar;
            }
            // 都没有变量的情况
            return cnItem.position === enItem.position;
        });

        if (matchedEnItem) {
            mappings.push({ key: cnItem.key, value: matchedEnItem.value });
            // 标记已使用，避免重复匹配
            enMap.splice(enMap.indexOf(matchedEnItem), 1);
        }
    }

    return mappings;
}

// ===== 提取 cn 的 key（支持：字符串字面量、I18N.a.b.c、BinaryExpression）=====
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

    // 情况3: BinaryExpression (字符串拼接) - 返回第一个 I18N 引用
    if (t.isBinaryExpression(node) && node.operator === '+') {
        const parts = extractBinaryParts(node);
        const i18nPart = parts.find(p => p.type === 'i18n');
        return i18nPart ? i18nPart.value : null;
    }

    // 情况4: 检查是否为 I18N.a.b.c（必须是四层 MemberExpression，非 computed）
    return extractCnKeyDirect(node);
}

function extractEnValue(node, scope) {
    // 直接是字符串字面量
    if (t.isStringLiteral(node)) {
        return node.value;
    }

    // 处理模板字符串：`xxx ${a} yyy ${b}` -> "xxx {val1} yyy {val2}"
    if (t.isTemplateLiteral(node)) {
        let result = '';
        let varIndex = 1;

        for (let i = 0; i < node.quasis.length; i++) {
            result += node.quasis[i].value.raw;

            // 如果不是最后一个 quasi，说明后面有变量表达式
            if (i < node.expressions.length) {
                result += `{val${varIndex}}`;
                varIndex++;
            }
        }

        return result;
    }

    // 处理字符串拼接：'str1' + var + 'str2' -> "str1{val1}str2"
    if (t.isBinaryExpression(node) && node.operator === '+') {
        let result = '';
        let varIndex = 1;

        function traverseBinary(n) {
            if (t.isBinaryExpression(n) && n.operator === '+') {
                traverseBinary(n.left);
                traverseBinary(n.right);
            } else if (t.isStringLiteral(n)) {
                // 字符串字面量，直接拼接
                result += n.value;
            } else if (t.isIdentifier(n)) {
                // 变量，替换为占位符
                result += `{val${varIndex}}`;
                varIndex++;
            } else {
                // 其他表达式（如函数调用等），也用占位符
                result += `{val${varIndex}}`;
                varIndex++;
            }
        }

        traverseBinary(node);
        return result;
    }

    // 是变量（Identifier），尝试回溯
    if (t.isIdentifier(node)) {
        const binding = scope.getBinding(node.name);
        if (binding && binding.path.isVariableDeclarator()) {
            const init = binding.path.node.init;
            if (init && t.isStringLiteral(init)) {
                return init.value;
            }
            // 如果是模板字符串，递归处理
            if (init && t.isTemplateLiteral(init)) {
                let result = '';
                let varIndex = 1;

                for (let i = 0; i < init.quasis.length; i++) {
                    result += init.quasis[i].value.raw;
                    if (i < init.expressions.length) {
                        result += `{val${varIndex}}`;
                        varIndex++;
                    }
                }

                return result;
            }
        }
    }

    // 其他情况（表达式、多变量等）不支持
    return null;
}

// ===== 单文件转换函数 =====
const transformToChinese = (code, globalList) => {
    let localList = {}; // 每个文件独立的 list

    const ast = parser.parse(code, {
        sourceType: 'module',
        plugins: ['decorators-legacy', 'jsx', 'typescript']
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
        // 处理函数或块作用域内的连续 cn/en 变量声明
        BlockStatement(path) {
            const body = path.node.body;

            // 查找所有变量声明
            for (let i = 0; i < body.length; i++) {
                const node = body[i];

                // 跳过非变量声明
                if (!t.isVariableDeclaration(node)) continue;

                // 支持 cn/cnName 变量
                const cnDeclarator = node.declarations.find(
                    (decl) => t.isIdentifier(decl.id) &&
                              (decl.id.name === 'cn' || decl.id.name === 'cnName') &&
                              decl.init
                );

                if (!cnDeclarator) continue;

                // 在当前和后续语句中查找 en/enName 变量
                let enDeclarator = null;
                const cnVarName = cnDeclarator.id.name;
                const enVarName = cnVarName === 'cn' ? 'en' : 'enName';

                // 先在同一个声明中查找
                enDeclarator = node.declarations.find(
                    (decl) => t.isIdentifier(decl.id, { name: enVarName }) && decl.init
                );

                // 如果同一声明中没找到，查找后续语句
                if (!enDeclarator) {
                    for (let j = i + 1; j < body.length; j++) {
                        const nextNode = body[j];
                        if (t.isVariableDeclaration(nextNode)) {
                            enDeclarator = nextNode.declarations.find(
                                (decl) => t.isIdentifier(decl.id, { name: enVarName }) && decl.init
                            );
                            if (enDeclarator) break;
                        }
                        // 遇到 switch、if 等控制结构，停止搜索
                        if (t.isSwitchStatement(nextNode) || t.isIfStatement(nextNode)) {
                            break;
                        }
                    }
                }

                // 如果找到了 cn/cnName 和 en/enName，提取值
                if (enDeclarator) {
                    const cnInit = cnDeclarator.init;
                    const enInit = enDeclarator.init;

                    // 特殊处理：如果 cn 是 BinaryExpression，en 是 BinaryExpression 或 TemplateLiteral
                    if (t.isBinaryExpression(cnInit) && cnInit.operator === '+' &&
                        (t.isBinaryExpression(enInit) && enInit.operator === '+' || t.isTemplateLiteral(enInit))) {

                        const mappings = matchBinaryExpressions(cnInit, enInit);
                        for (const mapping of mappings) {
                            localList[mapping.key.replace('I18N.', '')] = mapping.value;
                        }
                    } else {
                        // 常规处理
                        const cnKey = extractCnKey(cnInit, path.scope);
                        const enStr = extractEnValue(enInit, path.scope);

                        if (cnKey !== null && enStr !== null) {
                            localList[cnKey.replace('I18N.', '')] = enStr;
                        }
                    }
                }
            }
        },

        // 单独处理 SwitchStatement
        SwitchStatement(path) {
            path.node.cases.forEach((caseNode) => {
                const consequent = caseNode.consequent;

                let cnAssignment = null;
                let enAssignment = null;

                // 在每个 case 中查找 cnName = xxx 和 enName = xxx
                for (const stmt of consequent) {
                    if (t.isExpressionStatement(stmt) && t.isAssignmentExpression(stmt.expression)) {
                        const { left, right } = stmt.expression;

                        if (t.isIdentifier(left, { name: 'cnName' }) || t.isIdentifier(left, { name: 'cn' })) {
                            cnAssignment = right;
                        }
                        if (t.isIdentifier(left, { name: 'enName' }) || t.isIdentifier(left, { name: 'en' })) {
                            enAssignment = right;
                        }
                    }
                }

                // 如果找到了 cnName 和 enName 的赋值，提取值
                if (cnAssignment && enAssignment) {
                    // 特殊处理：如果 cn 是 BinaryExpression，en 是 BinaryExpression 或 TemplateLiteral
                    if (t.isBinaryExpression(cnAssignment) && cnAssignment.operator === '+' &&
                        (t.isBinaryExpression(enAssignment) && enAssignment.operator === '+' || t.isTemplateLiteral(enAssignment))) {

                        const mappings = matchBinaryExpressions(cnAssignment, enAssignment);
                        for (const mapping of mappings) {
                            localList[mapping.key.replace('I18N.', '')] = mapping.value;
                        }
                    } else {
                        // 常规处理
                        const cnKey = extractCnKey(cnAssignment, path.scope);
                        const enStr = extractEnValue(enAssignment, path.scope);

                        if (cnKey !== null && enStr !== null) {
                            localList[cnKey.replace('I18N.', '')] = enStr;
                        }
                    }
                }
            });
        },

        ObjectExpression(path) {
            const props = path.node.properties;
            if (props.length === 0) return;

            const cnProp = props.find(
                (prop) => t.isObjectProperty(prop) && !prop.computed && isKeyNamed(prop.key, 'cn') && !prop.method
            );
            const enProp = props.find(
                (prop) => t.isObjectProperty(prop) && !prop.computed && isKeyNamed(prop.key, 'en') && !prop.method
            );

            // 情况1: 简单的 { cn: xxx, en: yyy } 结构
            if (cnProp && enProp && !t.isObjectExpression(cnProp.value) && !t.isObjectExpression(enProp.value)) {
                const enStr = extractEnValue(enProp.value, path.scope);
                const cnKey = extractCnKey(cnProp.value, path.scope);

                if (cnKey !== null && enStr !== null) {
                    localList[cnKey.replace('I18N.', '')] = enStr;
                }
            }

            // 情况2: 嵌套对象结构 { cn: { [I18N.xxx]: value }, en: { 'key': value } }
            if (cnProp && enProp && t.isObjectExpression(cnProp.value) && t.isObjectExpression(enProp.value)) {
                const cnProps = cnProp.value.properties;
                const enProps = enProp.value.properties;

                // 提取 cn 对象的计算属性 key
                const cnKeys = [];
                for (const prop of cnProps) {
                    if (t.isObjectProperty(prop) && prop.computed) {
                        // 提取计算属性中的 I18N 引用
                        const cnKey = extractCnKeyDirect(prop.key);
                        if (cnKey) {
                            cnKeys.push({ key: cnKey, index: cnKeys.length });
                        }
                    }
                }

                // 提取 en 对象的字符串 key（支持计算属性和普通属性）
                const enKeys = [];
                for (const prop of enProps) {
                    if (t.isObjectProperty(prop)) {
                        let enKeyValue = null;

                        // 计算属性: ['string']
                        if (prop.computed && t.isStringLiteral(prop.key)) {
                            enKeyValue = prop.key.value;
                        }
                        // 普通字符串属性: 'string' 或 "string"
                        else if (!prop.computed && t.isStringLiteral(prop.key)) {
                            enKeyValue = prop.key.value;
                        }
                        // 普通标识符属性: identifier (如 Today)
                        else if (!prop.computed && t.isIdentifier(prop.key)) {
                            enKeyValue = prop.key.name;
                        }

                        if (enKeyValue) {
                            enKeys.push({ key: enKeyValue, index: enKeys.length });
                        }
                    }
                }

                // 按索引位置匹配
                for (let i = 0; i < Math.min(cnKeys.length, enKeys.length); i++) {
                    const cnKey = cnKeys[i].key;
                    const enKey = enKeys[i].key;
                    if (cnKey && enKey) {
                        localList[cnKey.replace('I18N.', '')] = enKey;
                    }
                }
            }
        },

        // 处理三元表达式：getLanguage() === 'cn' ? cn : en
        ConditionalExpression(path) {
            const { test, consequent, alternate } = path.node;

            // 检查是否为 getLanguage() === 'cn' 或 'cn' === getLanguage()
            let isLanguageCheck = false;
            if (t.isBinaryExpression(test) && test.operator === '===') {
                const isLeftLangCall =
                    t.isCallExpression(test.left) &&
                    t.isIdentifier(test.left.callee) &&
                    ['getLang', 'getLanguage'].includes(test.left.callee.name);
                const isRightCn = t.isStringLiteral(test.right, { value: 'cn' });

                const isRightLangCall =
                    t.isCallExpression(test.right) &&
                    t.isIdentifier(test.right.callee) &&
                    ['getLang', 'getLanguage'].includes(test.right.callee.name);
                const isLeftCn = t.isStringLiteral(test.left, { value: 'cn' });

                isLanguageCheck = (isLeftLangCall && isRightCn) || (isRightLangCall && isLeftCn);
            }

            // 如果是语言检查，直接替换为 consequent（cn 分支）
            if (isLanguageCheck) {
                path.replaceWith(consequent);
            }
        },

        MemberExpression(path) {
            const node = path.node;
            if (!node.computed) return;

            // 检查是否为语言访问
            let isLangAccess = false;

            // 情况1: 已收集的 lang 变量名
            if (t.isIdentifier(node.property) && langVariableNames.has(node.property.name)) {
                isLangAccess = true;
            }
            // 情况2: 直接调用 getLang/getLanguage
            else if (t.isCallExpression(node.property) &&
                    t.isIdentifier(node.property.callee) &&
                    ['getLang', 'getLanguage'].includes(node.property.callee.name)) {
                isLangAccess = true;
            }
            // 情况3: 未定义的 lang 标识符（不管作用域）
            else if (t.isIdentifier(node.property) && node.property.name === 'lang') {
                isLangAccess = true;
            }

            if (isLangAccess) {
                // 替换为 obj['cn']
                path.replaceWith(
                    t.memberExpression(node.object, t.stringLiteral('cn'), true)
                );
            }
        },

        // 处理可选链：obj?.[lang]
        OptionalMemberExpression(path) {
            const node = path.node;
            if (!node.computed) return;

            // 检查是否为语言访问
            let isLangAccess = false;

            // 情况1: 已收集的 lang 变量名
            if (t.isIdentifier(node.property) && langVariableNames.has(node.property.name)) {
                isLangAccess = true;
            }
            // 情况2: 直接调用 getLang/getLanguage
            else if (t.isCallExpression(node.property) &&
                    t.isIdentifier(node.property.callee) &&
                    ['getLang', 'getLanguage'].includes(node.property.callee.name)) {
                isLangAccess = true;
            }
            // 情况3: 未定义的 lang 标识符（不管作用域）
            else if (t.isIdentifier(node.property) && node.property.name === 'lang') {
                isLangAccess = true;
            }

            if (isLangAccess) {
                // 替换为 obj?.['cn']
                path.replaceWith(
                    t.optionalMemberExpression(node.object, t.stringLiteral('cn'), true, node.optional)
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
const getAllJsFiles = (pathInput) => {
    // 检查路径是文件还是目录
    const stat = fs.statSync(pathInput);

    // 如果是文件，直接返回（只要是 .js 文件）
    if (stat.isFile()) {
        if (pathInput.endsWith('.js')) {
            return [pathInput];
        }
        return [];
    }

    // 如果是目录，递归处理
    let results = [];
    const files = fs.readdirSync(pathInput);

    for (const file of files) {
        const fullPath = path.join(pathInput, file);
        const fileStat = fs.statSync(fullPath);
        if (fileStat.isDirectory()) {
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
