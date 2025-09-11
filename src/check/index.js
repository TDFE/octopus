/*
 * @Descripttion: 校验项目中缺少的翻译项
 * @Author: 郑泳健
 * @Date: 2024-12-12 15:00:24
 * @LastEditors: 郑泳健
 * @LastEditTime: 2025-09-11 09:56:54
 */
const path = require('path')
const fs = require('fs')
const shell = require('shelljs');
const { getSpecifiedFiles, isFile } = require('../utils/file')
const syncLang = require('../utils/syncLang')
const { flatObject, rewriteFiles, getFileKeyValueList, getAdjustLangObjAndAddList } = require('../utils/translate');
const { failInfo, highlightText } = require('../utils/colors');
const { getProjectConfig, autoImportJSFiles } = require('../utils/index')
const ora = require('ora');

const CONFIG = getProjectConfig();

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
        const content = fs.readFileSync(fullPath, 'utf-8');
        jsContent += `\n/* File: ${fullPath} */\n${content}\n`;
      }
    }
  
    return jsContent;
  }

// 同步不同的语言包
function main() {
    (async () => {
        const distLang = Array.isArray(CONFIG.distLangs) ? CONFIG.distLangs : []
        const zhCN = syncLang('zh-CN');
        const zhCNFlat = flatObject(zhCN);
        // 当前项目所有的key
        const keys = Object.keys(zhCNFlat)
        const totalText = readJsFiles(path.resolve(process.cwd(), 'src'))
        const totalTranslateList = extractThreeLevelI18NKeys(totalText);
        const zhCnKey = Object.keys(zhCNFlat)
        let result = {}
        const lostKey = totalTranslateList.filter(item => !zhCnKey.includes(item.replace('I18N.', '')))
        fs.writeFileSync(path.resolve(process.cwd(), 'lostI18N.js'), JSON.stringify(lostKey, null, 4), 'utf-8')
       
        if(!lostKey.length) {
            spinner.succeed(`查询完毕，无丢失`);
            return 
        }
        
        if (!fs.existsSync(path.resolve(process.cwd(), 'public/.octopus'))) {
            spinner.succeed(`查询完毕，共计丢失${lostKey.length}个，请在lostI18N.js中查看`);
            spinner.warn('请将原始项目的.octopus复制到当前项目public目录下，会帮你自助将缺失的key补充上去');
            return;
        }
        spinner.start(`查询完毕，共计丢失${lostKey.length}个,开始同步开始`);
        const zhFrom = syncLang('zh-CN', path.resolve(process.cwd(), 'public/.octopus'))
        const enFrom = syncLang('en-US', path.resolve(process.cwd(), 'public/.octopus'))
        const zhFromFlat = flatObject(zhFrom);
        const enFromFlat = flatObject(enFrom);

        const enUS = syncLang('en-US');
        const enUSFlat = flatObject(enUS);

        const zhCNResult = lostKey.reduce((total, item) => {
            if(zhFromFlat[item.replace('I18N.', '')]){
                total[item.replace('I18N.', '')] = zhFromFlat[item.replace('I18N.', '')]
            }
            return total;
        }, zhCNFlat)
      
        const enCNResult = lostKey.reduce((total, item) => {
            if(enFromFlat[item.replace('I18N.', '')]){
                total[item.replace('I18N.', '')] = enFromFlat[item.replace('I18N.', '')]
            }
            return total;
        }, enUSFlat)

        rewriteFiles(getFileKeyValueList(zhCNResult), 'zh-CN');
        rewriteFiles(getFileKeyValueList(enCNResult), 'en-US');
        const cnJSON = fs.readFileSync(path.resolve(process.cwd(), '.octopus/zh-CN/index.js'), 'utf-8');
        const enJSON = fs.readFileSync(path.resolve(process.cwd(), '.octopus/en-US/index.js'), 'utf-8');

        autoImportJSFiles(path.resolve(process.cwd(), '.octopus/zh-CN'), cnJSON)
        autoImportJSFiles(path.resolve(process.cwd(), '.octopus/en-US'), enJSON)
        spinner.succeed(`同步完成`);
    })()
}

module.exports = {
    main
}
