/*
 * @Description: 翻译
 * @Author: 郑泳健
 * @Date: 2022-06-01 13:56:18
 * @LastEditors: 郑泳健
 * @LastEditTime: 2022-12-28 15:47:31
 */
const _ = require("lodash");
const ora = require("ora");
const { otpPath, parseExcelToArray, generateExcel } = require("../utils/translate");
const { getProjectConfig } = require("../utils/index");
const { OCTOPUS_CONFIG_FILE } = require("../utils/const");

const spinner = ora("开始export diff");

// 同步不同的语言包
function doExportDiff(exportAll) {
  (async () => {
    const otpConfig = getProjectConfig();
    const distLang = otpConfig && otpConfig.distLangs;

    if (!Array.isArray(distLang)) {
      console.log(`请配置${OCTOPUS_CONFIG_FILE}里面的distLangs`);
      return;
    }

    spinner.start("正在比较");
    distLang.forEach((lang) => {
      parseExcelToArray(otpPath + `/${lang}/translate_${lang}.xls`, function (excelArr) {
        parseExcelToArray(otpPath + `/${lang}/translate_${lang}_old.xls`, function (oldExcelArr) {
          const allList = [];
          for (let i = 0; i < excelArr.length; i++) {
            const [key, zhCName, baiduName, enUSName] = excelArr[i];
            const findSame = _.find(oldExcelArr, (it) => it[0] === key);

            if (exportAll) {
              // 导出全部
              allList.push([key, zhCName, enUSName, findSame ? findSame[3] : enUSName]);
            } else if (!findSame) {
              // 导出没翻译的
              allList.push([key, zhCName, enUSName, ""]);
            }
          }
          spinner.start(`正在生成${lang} excel`);
          // 生成excel
          generateExcel(allList, otpPath + "/" + lang, lang + "_diff");
          spinner.succeed(`生成${lang} excel成功`);
        });
      });
    });
    spinner.succeed("比较成功");
  })();
}

// 相同key和名称的翻译可以合并
function doMerge() {
  (async () => {
    const otpConfig = getProjectConfig();
    const distLang = otpConfig && otpConfig.distLangs;

    if (!Array.isArray(distLang)) {
      console.log(`请配置${OCTOPUS_CONFIG_FILE}里面的distLangs`);
      return;
    }

    spinner.start("正在比较");
    distLang.forEach((lang) => {
      parseExcelToArray(otpPath + `/${lang}/translate_${lang}.xls`, function (excelArr) {
        parseExcelToArray(otpPath + `/${lang}/translate_${lang}_old.xls`, function (oldExcelArr) {
          const allList = [];
          let sameNum = 0;
          for (let i = 0; i < excelArr.length; i++) {
            const [key, zhCName, baiduName, enUSName] = excelArr[i];
            // const findSame = _.find(oldExcelArr, (it) => it[0] === key && it[1] === zhCName);
            const findSame = _.find(oldExcelArr, (it) => it[1] === zhCName);
            allList.push([key, zhCName, enUSName, findSame ? findSame[3] : enUSName]);
            if (findSame) {
              sameNum++;
            }
          }
          spinner.start(`正在生成${lang} excel。`);
          // 生成excel
          generateExcel(allList, otpPath + "/" + lang, lang + "_new");
          spinner.succeed(`生成${lang} excel成功。总共:${excelArr.length}, 复用:${sameNum}`);
        });
      });
    });
    spinner.succeed("比较成功");
  })();
}

module.exports = {
  doExportDiff,
  doMerge,
};
