/*
 * @Description: 
 * @Author: 郑泳健
 * @Date: 2022-06-26 11:29:33
 * @LastEditors: 郑泳健
 * @LastEditTime: 2022-06-30 18:36:59
 */
const fs = require('fs');
const path = require('path');
const {
    otpPath,
    flatObject,
    getFileKeyValueList,
    parseExcel,
    rewriteFiles
} = require('../utils/translate');
const syncLang = require('../utils/syncLang')
const { getProjectConfig } = require('../utils/index')

const { OCTOPUS_CONFIG_FILE } = require('../utils/const')

// 人工翻译后对象
function excel(str) {
    (async () => {
        const list = str ? str.split(',') : undefined;
        const otpConfig = getProjectConfig()
        const distLang = otpConfig && otpConfig.distLangs

        if (str && (!Array.isArray(list) || !list.length)) {
            console.log('参数必须为各语言用逗号隔开,例如en-US,zh-TW')
            return;
        }
        if (!str && !Array.isArray(distLang)) {
            console.log(`请配置${OCTOPUS_CONFIG_FILE}里面的distLangs`)
            return;
        }

        await syncLang();

        const arr = list || distLang

        arr.forEach((lang) => {
            parseExcel(otpPath + `/${lang}/translate_${lang}.xls`, function (translateMap) {
                const { default: currentLangMap } = require(`../temp/${lang}`);
                const langFlat = flatObject(currentLangMap);

                for (let i in langFlat) {
                    langFlat[i] = translateMap[i] ? String(translateMap[i]) : langFlat[i];
                }

                const fileKeyValueList = getFileKeyValueList(langFlat);

                // 重新生成翻译文件
                rewriteFiles(fileKeyValueList, lang);
            });
        })
    })()
}

module.exports = {
    excel
}