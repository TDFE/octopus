/*
 * @Description: 讲excel的内容导入会json
 * @Author: 郑泳健
 * @Date: 2022-06-26 11:29:33
 * @LastEditors: 郑泳健
 * @LastEditTime: 2022-12-28 16:48:55
 */
const {
    otpPath,
    flatObject,
    getFileKeyValueList,
    parseExcel,
    rewriteFiles
} = require('../utils/translate');
const syncLang = require('../utils/syncLang')
const { getProjectConfig } = require('../utils/index')
const ora = require('ora');
const { OCTOPUS_CONFIG_FILE } = require('../utils/const')

const spinner = ora('开始import');
// 人工翻译后对象
function importExcel() {
    (async () => {
        const otpConfig = getProjectConfig()
        const distLang = otpConfig && otpConfig.distLangs

        if (!Array.isArray(distLang)) {
            console.log(`请配置${OCTOPUS_CONFIG_FILE}里面的distLangs`)
            return;
        }

        spinner.start('正在从excel开始同步')
        distLang.concat("zh-CN").forEach((lang) => {
            let isZhCN = lang === "zh-CN"
            parseExcel(otpPath + `/${isZhCN ? "en-US" : lang}/translate_${isZhCN ? "en-US" : lang}.xls`, function (translateMap) {
                const currentLangMap = syncLang(lang);
                const langFlat = flatObject(currentLangMap);

                for (let i in langFlat) {
                    langFlat[i] = translateMap[i] ? String(translateMap[i]) : langFlat[i];
                }

                const fileKeyValueList = getFileKeyValueList(langFlat);

                // 重新生成翻译文件
                rewriteFiles(fileKeyValueList, lang);
            }, isZhCN);
        })
        spinner.succeed('从excel同步成功')
    })()
}

module.exports = {
    importExcel
}
