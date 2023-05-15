/*
 * @Description: 翻译
 * @Author: 郑泳健
 * @Date: 2022-06-01 13:56:18
 * @LastEditors: 郑泳健
 * @LastEditTime: 2022-12-28 15:47:31
 */
const _ = require('lodash');
const ora = require('ora');
const fs = require('fs');
const { otpPath, flatObject } = require('../utils/translate');
const syncLang = require('../utils/syncLang');
const { getProjectConfig } = require('../utils/index');
const { OCTOPUS_CONFIG_FILE } = require('../utils/const');

const spinner = ora('开始analysis');

// 同步不同的语言包
function analysis() {
  (async () => {
    const otpConfig = getProjectConfig();
    const distLang = otpConfig && otpConfig.distLangs;

    if (!Array.isArray(distLang)) {
      console.log(`请配置${OCTOPUS_CONFIG_FILE}里面的distLangs`);
      return;
    }

    spinner.start('正在分析');
    distLang.forEach((lang) => {
      const currentLangMap = syncLang(lang);
      const langFlat = flatObject(currentLangMap);
      const textArr = Object.values(langFlat);
      const firstLowercase = [];
      const endWithColon = [];
      for (let i = 0; i < textArr.length; i++) {
        const text = textArr[i];
        if (/^[a-z]*$/.test(text[0])) {
          firstLowercase.push(text);
        }
        if (text.endsWith(':')) {
          endWithColon.push(text);
        }
      }
      fs.writeFileSync(
        otpPath + `/${lang}/analysis.json`,
        JSON.stringify(
          { firstLowercase: _.uniq(firstLowercase), endWithColon: _.uniq(endWithColon) },
          ' ',
          2
        )
      );
    });
    spinner.succeed('分析成功');
  })();
}

module.exports = {
  analysis
};
