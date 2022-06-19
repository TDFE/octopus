/*
 * @Description: 翻译
 * @Author: 郑泳健
 * @Date: 2022-06-01 13:56:18
 * @LastEditors: 郑泳健
 * @LastEditTime: 2022-06-19 18:58:45
 */
const fs = require('fs');
const path = require('path');
const {
    syncFiles,
    otpPath,
    flatObject,
    getAdjustLangObjAndAddList,
    generateExcel,
    rewriteFiles
} = require('../utils/translate');

const zhCN = require(otpPath + '/zh-CN');

const zhCNflat = flatObject(zhCN);

// 同步不同的语言包
function translate() {
    const otpConfig = fs.readFileSync(path.resolve(otpPath + '/../otp-config.json'), 'utf-8')
    const distLang = otpConfig && JSON.parse(otpConfig) && JSON.parse(otpConfig).distLangs

    if (!Array.isArray(distLang)) {
        console.log('请配置otp-config.json里面的distLangs')
        return;
    }
    syncFiles(distLang);

    distLang.forEach((lang) => {
        const langFlat = flatObject(require(otpPath + '/' + lang));

        // 删除掉多余的key，增加新的key，同时提取没有翻译过的key的列表
        const { fileKeyValueList, addList } = getAdjustLangObjAndAddList(langFlat, zhCNflat);

        // 重写文件
        rewriteFiles(fileKeyValueList, lang);
        // 生成excel
        generateExcel(addList, otpPath + '/' + lang);
    });
}

module.exports = {
    translate
}
