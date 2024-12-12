/*
 * @Descripttion: 删除多余的key
 * @Author: 郑泳健
 * @Date: 2024-12-12 15:00:24
 * @LastEditors: 郑泳健
 * @LastEditTime: 2024-12-12 15:00:33
 */
const path = require('path')
const fs = require('fs')
const shell = require('shelljs');
const { getSpecifiedFiles, isFile } = require('../utils/file')
const syncLang = require('../utils/syncLang')
const { flatObject, rewriteFiles, getFileKeyValueList, getAdjustLangObjAndAddList } = require('../utils/translate');
const { failInfo, highlightText } = require('../utils/colors');
const { getProjectConfig } = require('../utils/index')
const ora = require('ora');

const CONFIG = getProjectConfig();

const spinner = ora('开始reduce');

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

        // 删除中文下躲雨的key
        const zhCN = syncLang('zh-CN');
        const zhCNFlat = flatObject(zhCN);
        // 当前项目所有的key
        const keys = Object.keys(zhCNFlat)
        const totalText = readJsFiles(path.resolve(process.cwd(), 'src'))
        let result = {}
        for(let i in zhCNFlat){
            if(totalText.includes(i)){
                result[i] = zhCNFlat[i]
            }
        }
        
        rewriteFiles(getFileKeyValueList(result), 'zh-CN')

        for (const lang of distLang) {
            const currentLangMap = syncLang(lang);
            const langFlat = flatObject(currentLangMap);
            spinner.start(`正在清理${lang}下多余的key`)
            // 删除掉多余的key，增加新的key，同时提取没有翻译过的key的列表
            const { fileKeyValueList, addList } = await getAdjustLangObjAndAddList(lang, langFlat, result, '', spinner);
            spinner.succeed(`已完成清理${lang}下多余的key`)
            // 重写文件
            rewriteFiles(fileKeyValueList, lang);
        }
    })()
}

module.exports = {
    main
}
