/*
 * @Description: 翻译
 * @Author: 郑泳健
 * @Date: 2022-06-01 13:56:18
 * @LastEditors: 郑泳健
 * @LastEditTime: 2026-01-26 18:39:38
 */
const fs = require('fs');
const path = require('path');
const ora = require('ora');
const { getAllJsFiles, processFile } = require('./single')
const spinner = ora('开始transLang');

function transLang(dir) {
    (async () => {
        if(!dir){
            spinner.fail('请指定需要转换的目录')
            return
        }
        // ===== 全局 list 汇总 =====
        const globalList = {};
        const targetDir = path.resolve(process.cwd(), dir); // 要批量处理的根目录
        spinner.start('正在转换')
        const files = getAllJsFiles(targetDir);
        
        for (const file of files) {
            await processFile(file, globalList);
        }
    
        fs.writeFileSync(path.join(process.cwd(), 'transLang.json'), JSON.stringify(globalList, null, 2), 'utf-8');
        spinner.succeed('转换成功')
        spinner.stop('translate成功')
    })()
}

module.exports = {
    transLang
}
