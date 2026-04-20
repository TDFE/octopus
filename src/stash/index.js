/*
 * @Descripttion: 将项目中用到的中英文存储到缓存中
 * @Author: 郑泳健
 * @Date: 2024-12-12 15:00:24
 * @LastEditors: 郑泳健
 * @LastEditTime: 2026-04-20 15:34:33
 */
const path = require('path');
const fs = require('fs');
const syncLang = require('../utils/syncLang');
const { flatObject } = require('../utils/translate');
const ora = require('ora');
const { getProjectConfig } = require('../utils/index');
const spinner = ora('开始check');

// 同步不同的语言包
function main() {
    (async () => {
        const config = getProjectConfig();
        const distLangs = config.distLangs || ['en-US'];
        const outpuDir = path.resolve(__dirname, '../octopus');
        fs.mkdirSync(outpuDir, { recursive: true });
        const allLangs = ['zh-CN', ...distLangs];
        spinner.start('开始缓存');
        for (const lang of allLangs) {
            const syncLangData = syncLang(lang);
            const syncLangDataFlat = flatObject(syncLangData);
            fs.writeFileSync(path.resolve(outpuDir, `${lang}.js`), JSON.stringify(syncLangDataFlat, null, 2), 'utf-8');
        }
        spinner.succeed('缓存完成');
    })();
}

module.exports = {
    main
};
