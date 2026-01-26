const fs = require('fs');
const path = require('path');
const {
    otpPath,
    flatObject,
    getFileKeyValueList,
    parseExcelArr,
    generateExcel,
    rewriteFiles
} = require('../utils/translate');
const syncLang = require('../utils/syncLang')
const { getProjectConfig } = require('../utils/index')
const ora = require('ora');
const { OCTOPUS_CONFIG_FILE } = require('../utils/const')

const spinner = ora('开始insetEn');
// 人工翻译后对象
function insertEn() {
    (async () => {
        const otpConfig = getProjectConfig()
        const distLang = otpConfig && otpConfig.distLangs;
        const obj = JSON.parse(fs.readFileSync(path.resolve(otpPath, '../transLang.json'), 'utf-8'));

        if (!Array.isArray(distLang)) {
            console.log(`请配置${OCTOPUS_CONFIG_FILE}里面的distLangs`)
            return;
        }
        parseExcelArr(otpPath + `/en-US/translate_en-US.xls`, function (list) {
            let addList = Array.isArray(list) ? list.map(({key, value}) => {
                const val = obj[key] ? String(obj[key]) : value;
                return [key, '', '',  val];
            }) : [];
           generateExcel(addList, otpPath + '/' + 'en-US', 'en-US');
        })
        spinner.succeed('从excel同步成功')
    })()
}

module.exports = {
    insertEn
}
