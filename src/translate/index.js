/*
 * @Description: 翻译
 * @Author: 郑泳健
 * @Date: 2022-06-01 13:56:18
 * @LastEditors: 郑泳健
 * @LastEditTime: 2022-07-06 14:21:43
 */
const {
    syncFiles,
    otpPath,
    flatObject,
    getAdjustLangObjAndAddList,
    generateExcel,
    rewriteFiles,
} = require('../utils/translate');
const syncLang = require('../utils/syncLang')
const { getProjectConfig } = require('../utils/index')
const ora = require('ora');
const { OCTOPUS_CONFIG_FILE } = require('../utils/const')

const spinner = ora('开始translate');

// 同步不同的语言包
function translate() {
    (async () => {
        const otpConfig = getProjectConfig()
        const distLang = otpConfig && otpConfig.distLangs

        if (!Array.isArray(distLang)) {
            console.log(`请配置${OCTOPUS_CONFIG_FILE}里面的distLangs`)
            return;
        }
        spinner.start('正在同步文件')
        await syncFiles(distLang);
        spinner.succeed('同步文件成功')
        await syncLang();

        const { default: zhCN } = require('../temp/zh-CN');
        const zhCNflat = flatObject(zhCN);

        for (const lang of distLang) {
            const { default: currentLangMap } = require(`../temp/${lang}`);
            const langFlat = flatObject(currentLangMap);
            spinner.start('正在同步文件的key')
            // 删除掉多余的key，增加新的key，同时提取没有翻译过的key的列表
            const { fileKeyValueList, addList } = await getAdjustLangObjAndAddList(lang, langFlat, zhCNflat);
            spinner.succeed('同步文件的key成功')
            // 重写文件
            rewriteFiles(fileKeyValueList, lang);
            spinner.start(`正在生成${lang} excel`)
            // 生成excel
            generateExcel(addList, otpPath + '/' + lang, lang);
            spinner.succeed(`生成${lang} excel成功`)
        }

        spinner.stop('translate成功')
    })()
}

module.exports = {
    translate
}
