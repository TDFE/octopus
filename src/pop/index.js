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

// 同步不同的语言包
function main() {
    (async () => {
        const config = getProjectConfig();
        const distLangs = config.distLangs || ['en-US'];
        const zhCN = syncLang('zh-CN');
        const zhCNFlat = flatObject(zhCN);
        const totalText = readJsFiles(path.resolve(process.cwd(), 'src'));
        const totalTranslateList = extractThreeLevelI18NKeys(totalText);
        const zhCnKey = Object.keys(zhCNFlat);
        const lostKey = totalTranslateList.filter((item) => !zhCnKey.includes(item.replace('I18N.', '')));
        fs.writeFileSync(path.resolve(process.cwd(), 'lostI18N.js'), JSON.stringify(lostKey, null, 4), 'utf-8');

        if (!lostKey.length) {
            spinner.succeed('查询完毕，无丢失');
            return;
        }

        if (!fs.existsSync(path.resolve(__dirname, '../octopus/zh-CN.js'))) {
            spinner.succeed(`查询完毕，共计丢失${lostKey.length}个，请在lostI18N.js中查看`);
            spinner.warn('请先执行otp stash');
            return;
        }
        spinner.start(`查询完毕，共计丢失${lostKey.length}个,开始同步开始`);

        // 所有需要同步的语言，包含 zh-CN 和 distLangs
        const allLangs = ['zh-CN', ...distLangs];
        const langDataMap = { 'zh-CN': { data: zhCN, flat: zhCNFlat } };

        // 遍历所有语言进行同步
        for (const lang of allLangs) {
            const langFromFlat = JSON.parse(fs.readFileSync(path.resolve(__dirname, `../octopus/${lang}.js`), 'utf-8'));
            const { data: langData, flat: langFlat } = langDataMap[lang] || (langDataMap[lang] = {
                data: syncLang(lang),
                flat: flatObject(syncLang(lang))
            });

            const langResult = lostKey.reduce((total, item) => {
                if (langFromFlat[item.replace('I18N.', '')]) {
                    total[item.replace('I18N.', '')] = langFromFlat[item.replace('I18N.', '')];
                }
                return total;
            }, langFlat);

            rewriteFiles(getFileKeyValueList(langResult), lang);
            const langJSON = fs.readFileSync(path.resolve(process.cwd(), `.octopus/${lang}/index.js`), 'utf-8');
            autoImportJSFiles(path.resolve(process.cwd(), `.octopus/${lang}`), langJSON);
        }

        fs.rmSync(path.resolve(__dirname, '../octopus'), { recursive: true, force: true });
        spinner.succeed('同步完成,如果需要重新check，请先执行otp stash');
    })();
}

module.exports = {
    main
};
