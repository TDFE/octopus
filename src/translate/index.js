/*
 * @Description: 翻译
 * @Author: 郑泳健
 * @Date: 2022-06-01 13:56:18
 * @LastEditors: 郑泳健
 * @LastEditTime: 2022-06-30 20:20:06
 */
const fs = require('fs');
const path = require('path');
const {
    syncFiles,
    otpPath,
    flatObject,
    getAdjustLangObjAndAddList,
    generateExcel,
    rewriteFiles,
} = require('../utils/translate');
const { getProjectConfig } = require('../utils/index')
const syncLang = require('../utils/syncLang')

// 同步不同的语言包
function translate() {
    (async () => {
        const otpConfig = getProjectConfig()
        const distLang = otpConfig && otpConfig.distLangs
        await syncFiles(distLang);
        await syncLang();

        const { default: zhCN } = require('../temp/zh-CN');
        const zhCNflat = flatObject(zhCN);

        if (!Array.isArray(distLang)) {
            console.log('请配置otp-config.json里面的distLangs')
            return;
        }

        distLang.forEach((lang) => {
            const { default: currentLangMap } = require(`../temp/${lang}`);
            const langFlat = flatObject(currentLangMap);

            // 删除掉多余的key，增加新的key，同时提取没有翻译过的key的列表
            const { fileKeyValueList, addList } = getAdjustLangObjAndAddList(langFlat, zhCNflat);

            // 重写文件
            rewriteFiles(fileKeyValueList, lang);
            // 生成excel
            generateExcel(addList, otpPath + '/' + lang, lang);
        });
    })()
}

module.exports = {
    translate
}
