const fs = require('fs');
const path = require('path');
const {
    otpPath,
    flatObject,
    getFileKeyValueList,
    parseExcel,
    rewriteFiles
} = require('../utils/translate');

const { PROJECT_CONFIG, OCTOPUS_CONFIG_FILE } = require('../utils/const')

// 人工翻译后对象
function excel(str) {
    const list = str ? str.split(',') : undefined;
    const otpConfig = fs.readFileSync(path.resolve(otpPath + `/../${OCTOPUS_CONFIG_FILE}`), 'utf-8')
    const distLang = otpConfig && JSON.parse(otpConfig) && JSON.parse(otpConfig).distLangs

    if (str && (!Array.isArray(list) || !list.length)) {
        console.log('参数必须为各语言用逗号隔开,例如en-US,zh-TW')
        return;
    }
    if (!str && !Array.isArray(distLang)) {
        console.log(`请配置${OCTOPUS_CONFIG_FILE}里面的distLangs`)
        return;
    }

    const arr = list || distLang

    arr.forEach((lang) => {
        parseExcel(otpPath + `/${lang}/translate_${lang}.xlsx`, function (translateMap) {
            const langFlat = flatObject(require(otpPath + '/' + lang));

            for (let i in langFlat) {
                langFlat[i] = translateMap[i] ? String(translateMap[i]) : langFlat[i];
            }

            const fileKeyValueList = getFileKeyValueList(langFlat);

            // 重新生成翻译文件
            rewriteFiles(fileKeyValueList, lang);
        });
    })
}

module.exports = {
    excel
}