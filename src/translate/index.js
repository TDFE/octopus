/*
 * @Description: 翻译
 * @Author: 郑泳健
 * @Date: 2022-06-01 13:56:18
 * @LastEditors: 郑泳健
 * @LastEditTime: 2023-06-12 11:33:51
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
        const baiduApiKey = otpConfig && otpConfig.baiduApiKey

        if (!Array.isArray(distLang)) {
            console.log(`请配置${OCTOPUS_CONFIG_FILE}里面的distLangs`)
            return;
        }
        spinner.start('正在同步文件')
        await syncFiles(distLang);
        spinner.succeed('同步文件成功')

        const zhCN = syncLang('zh-CN');
        const zhCNflat = flatObject(zhCN);

        for (const lang of distLang) {
            const currentLangMap = syncLang(lang);
            const langFlat = flatObject(currentLangMap);
            spinner.start('正在同步文件的key')
            // 删除掉多余的key，增加新的key，同时提取没有翻译过的key的列表
            const { fileKeyValueList, addList } = await getAdjustLangObjAndAddList(lang, langFlat, zhCNflat, baiduApiKey, spinner);
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
