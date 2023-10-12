/*
 * @Description: 翻译
 * @Author: 郑泳健
 * @Date: 2023-10-12 10:04:22
 * @LastEditors: 郑泳健
 * @LastEditTime: 2023-10-12 10:09:37
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
function index() {
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
        const zhCNFlat = flatObject(zhCN);
        const enUS = syncLang('en-US')
        const enUSFlat = flatObject(enUS);

        // 删除掉多余的key，增加新的key，同时提取没有翻译过的key的列表
        const { allList } = await getAdjustLangObjAndAddList('en-US', enUSFlat, zhCNFlat, null, spinner);
        spinner.succeed('同步文件的key成功')
        spinner.start(`正在生成${'en-US'} excel`)
        // 生成excel
        generateExcel(allList, otpPath + '/' + 'en-US', 'en-US');
        spinner.succeed('生成成功')
    })()
}

module.exports = {
    index
}
