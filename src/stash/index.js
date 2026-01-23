/*
 * @Descripttion: 将项目中用到的中英文存储到缓存中
 * @Author: 郑泳健
 * @Date: 2024-12-12 15:00:24
 * @LastEditors: 郑泳健
 * @LastEditTime: 2025-10-13 10:55:39
 */
const path = require('path');
const fs = require('fs');
const syncLang = require('../utils/syncLang');
const { flatObject } = require('../utils/translate');
const ora = require('ora');

const spinner = ora('开始check');

// 同步不同的语言包
function main() {
    (async () => {
        const zhCN = syncLang('zh-CN');
        const zhCNFlat = flatObject(zhCN);
        const enUS = syncLang('en-US');
        const enUSFlat = flatObject(enUS);
        const outpuDir = path.resolve(__dirname, '../octopus');

        fs.mkdirSync(outpuDir, { recursive: true });
        spinner.start('开始缓存');
        fs.writeFileSync(path.resolve(outpuDir, 'zh-CN.js'), JSON.stringify(zhCNFlat, null, 2), 'utf-8');
        fs.writeFileSync(path.resolve(outpuDir, 'en-US.js'), JSON.stringify(enUSFlat, null, 2), 'utf-8');
        spinner.succeed('缓存完成');
    })();
}

module.exports = {
    main
};
