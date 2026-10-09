/*
 * @Descripttion: 校验项目中缺少的翻译项
 * @Author: 郑泳健
 * @Date: 2024-12-12 15:00:24
 * @LastEditors: 郑泳健
 * @LastEditTime: 2026-04-20 15:29:52
 */
const path = require('path');
const fs = require('fs');
const { parse } = require('@babel/parser');
const generate = require('@babel/generator').default;
const syncLang = require('../utils/syncLang');
const { flatObject, rewriteFiles, getFileKeyValueList } = require('../utils/translate');
const { autoImportJSFiles, getProjectConfig } = require('../utils/index');

const { ESLint } = require('eslint');

const ora = require('ora');

const spinner = ora('开始check');

function extractThreeLevelI18NKeys(code) {
    // 匹配恰好三级的I18N键值（I18N.xxx.xxx.xxx）
    // 使用正则表达式确保前面不是点，后面也不是点或字母数字下划线
    const pattern = /(?<!\.)I18N\.[a-zA-Z0-9_]+\.[a-zA-Z0-9_]+\.[a-zA-Z0-9_]+(?![a-zA-Z0-9_\.])/g;

    const matches = code.match(pattern) || [];

    // 去重并返回
    return [...new Set(matches)];
}

// 递归读取文件夹中所有 .js 文件内容
function readJsFiles(folderPath) {
    let jsContent = '';

    const files = fs.readdirSync(folderPath); // 读取文件夹内容
    for (const file of files) {
        const fullPath = path.join(folderPath, file);
        const stats = fs.statSync(fullPath); // 获取文件或文件夹状态

        if (stats.isDirectory()) {
            // 如果是文件夹，递归处理
            jsContent += readJsFiles(fullPath);
        } else if (path.extname(fullPath) === '.js') {
            // 如果是 .js 文件，读取文件内容
            let content = fs.readFileSync(fullPath, 'utf-8');
            const ast = parse(content, { sourceType: 'module', plugins: ['decorators-legacy', 'jsx', 'typescript'] });
            const output = generate(ast, { comments: false });
            content = output.code;
            jsContent += `\n/* File: ${fullPath} */\n${content}\n`;
        }
    }

    return jsContent;
}

/**
 * 找出目标语言包相对源语言包缺失的 key。
 * @param {Object} sourceFlat 源语言扁平化语言包
 * @param {Object} targetFlat 目标语言扁平化语言包
 * @returns {string[]} 目标语言包缺失的 key
 */
function getMissingKeys(sourceFlat = {}, targetFlat = {}) {
    return Object.keys(sourceFlat).filter(
        (key) => !Object.prototype.hasOwnProperty.call(targetFlat, key)
    );
}

/**
 * 按源语言包顺序合并目标语言包和缓存内容。
 * @param {Object} sourceFlat 源语言扁平化语言包
 * @param {Object} targetFlat 目标语言现有的扁平化语言包
 * @param {Object} stashFlat 目标语言缓存的扁平化语言包
 * @param {Object} sourceStashFlat 源语言缓存的扁平化语言包，用于保持原始顺序
 * @param {string[]} extraKeys 源语言包之外、但需要恢复的 key
 * @returns {Object} 按源语言包顺序排列的合并结果
 */
function mergeLanguageFlat(sourceFlat = {}, targetFlat = {}, stashFlat = {}, sourceStashFlat = {}, extraKeys = []) {
    const result = {};
    const activeSourceKeys = new Set([...Object.keys(sourceFlat), ...extraKeys]);
    const sourceKeys = Object.keys(sourceStashFlat).filter((key) => activeSourceKeys.has(key));
    const sourceKeySet = new Set(sourceKeys);

    [...Object.keys(sourceFlat), ...extraKeys].forEach((key) => {
        if (!sourceKeySet.has(key)) {
            sourceKeys.push(key);
            sourceKeySet.add(key);
        }
    });

    sourceKeys.forEach((key) => {
        if (Object.prototype.hasOwnProperty.call(targetFlat, key)) {
            result[key] = targetFlat[key];
        } else if (Object.prototype.hasOwnProperty.call(stashFlat, key)) {
            result[key] = stashFlat[key];
        }
    });

    Object.keys(targetFlat).forEach((key) => {
        if (!Object.prototype.hasOwnProperty.call(result, key)) {
            result[key] = targetFlat[key];
        }
    });
    extraKeys.forEach((key) => {
        if (!Object.prototype.hasOwnProperty.call(result, key)
            && Object.prototype.hasOwnProperty.call(stashFlat, key)) {
            result[key] = stashFlat[key];
        }
    });

    return result;
}

// 同步不同的语言包
function main() {
    (async () => {
        const config = getProjectConfig();
        const srcLang = typeof config.srcLang === 'string' && config.srcLang ? config.srcLang : 'zh-CN';
        const distLangs = Array.isArray(config.distLangs) ? config.distLangs : ['en-US'];
        const allLangs = [...new Set([srcLang, ...distLangs])];
        const srcLangData = syncLang(srcLang);
        const srcLangFlat = flatObject(srcLangData);
        const totalText = readJsFiles(path.resolve(process.cwd(), 'src'));
        const totalTranslateList = extractThreeLevelI18NKeys(totalText);
        const srcLangKey = Object.keys(srcLangFlat);
        const lostKey = totalTranslateList.filter((item) => !srcLangKey.includes(item.replace('I18N.', '')));
        // lostI18N.js 保留 I18N 前缀；语言包和缓存使用扁平化 key。
        const lostFlatKeys = lostKey.map((item) => item.replace(/^I18N\./, ''));
        const langDataMap = { [srcLang]: { flat: srcLangFlat } };
        const missingKeysByLang = { [srcLang]: lostFlatKeys };

        // distLangs 中的语言以 srcLang 为基准，单独检查自身缺失的 key。
        distLangs.forEach((lang) => {
            const data = syncLang(lang);
            const flat = flatObject(data);
            langDataMap[lang] = { flat };
            missingKeysByLang[lang] = [...new Set([...lostFlatKeys, ...getMissingKeys(srcLangFlat, flat)])];
        });

        const missingKeysCount = Object.values(missingKeysByLang).reduce(
            (total, keys) => total + keys.length,
            0
        );
        const missingStashLangs = allLangs.filter(
            (lang) => !fs.existsSync(path.resolve(__dirname, `../octopus/${lang}.js`))
        );
        const cachedStashLangs = allLangs.filter(
            (lang) => !missingStashLangs.includes(lang)
        );
        fs.writeFileSync(path.resolve(process.cwd(), 'lostI18N.js'), JSON.stringify(lostKey, null, 4), 'utf-8');

        if (!missingKeysCount) {
            spinner.succeed('查询完毕，各语言包无缺失');
            return;
        }

        if (missingStashLangs.length) {
            spinner.succeed(`查询完毕，srcLang（${srcLang}）缺失 ${lostKey.length} 个 key，各语言共需恢复 ${missingKeysCount} 项`);
            spinner.warn(`原 stash 已缓存：${cachedStashLangs.join('、') || '无'}；未缓存：${missingStashLangs.join('、')}，无法恢复未缓存语言的原始文案`);
            spinner.warn('请使用删除前包含全部语言的 stash 重试；现在执行 otp stash 只会缓存当前状态，不能恢复已丢失文案');
            return;
        }
        spinner.start(`查询完毕，srcLang（${srcLang}）缺失 ${lostKey.length} 个 key，各语言共需恢复 ${missingKeysCount} 项，开始同步`);

        const unresolvedKeysByLang = {};
        const sourceStashFlat = JSON.parse(
            fs.readFileSync(path.resolve(__dirname, `../octopus/${srcLang}.js`), 'utf-8')
        );

        // 遍历所有语言进行同步
        for (const lang of allLangs) {
            const langFromFlat = JSON.parse(fs.readFileSync(path.resolve(__dirname, `../octopus/${lang}.js`), 'utf-8'));
            const { flat: langFlat } = langDataMap[lang];
            const missingKeys = missingKeysByLang[lang];
            const restorableKeys = missingKeys.filter((key) =>
                Object.prototype.hasOwnProperty.call(langFromFlat, key)
            );
            const unresolvedKeys = missingKeys.filter(
                (key) => !Object.prototype.hasOwnProperty.call(langFromFlat, key)
            );

            if (unresolvedKeys.length) {
                unresolvedKeysByLang[lang] = unresolvedKeys;
            }

            const langResult = mergeLanguageFlat(
                srcLangFlat,
                langFlat,
                langFromFlat,
                sourceStashFlat,
                lostFlatKeys
            );

            if (!restorableKeys.length) {
                continue;
            }

            rewriteFiles(getFileKeyValueList(langResult), lang);
            const langJSON = fs.readFileSync(path.resolve(process.cwd(), `.octopus/${lang}/index.js`), 'utf-8');
            autoImportJSFiles(path.resolve(process.cwd(), `.octopus/${lang}`), langJSON);
        }

        fs.rmSync(path.resolve(__dirname, '../octopus'), { recursive: true, force: true });
        spinner.succeed('同步完成,如果需要重新check，请先执行otp stash');
        Object.entries(unresolvedKeysByLang).forEach(([lang, keys]) => {
            spinner.warn(`${lang} 缓存中不存在 ${keys.length} 个 key，无法自动恢复`);
        });
    })();
}

module.exports = {
    main
};
