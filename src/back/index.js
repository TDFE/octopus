/*
 * @Description: 将国际化转换回去
 * @Author: 郑泳健
 * @Date: 2022-06-01 13:56:18
 * @LastEditors: 郑泳健
 * @LastEditTime: 2023-01-18 15:25:47
 */
const path = require('path');
const fs = require('fs');
const ts = require('typescript');
const shell = require('shelljs');
const { getSpecifiedFiles, isFile } = require('../utils/file');
const syncLang = require('../utils/syncLang');
const { flatObject } = require('../utils/translate');
const { failInfo, highlightText } = require('../utils/colors');
const { getProjectConfig } = require('../utils/index');

function formatExclude(exclude) {
  return (exclude || []).map((p) => path.resolve(process.cwd(), p));
}

// 匹配I18N.
const I18N_REGEX = /I18N(\.[a-zA-Z0-9_]+)+/g;

// 匹配I18N.template()里面的内容
const TEMPLATE_INNER_REGEX = /I18N\.template\(([\s\S]*?})\)/g;

// 匹配{}之间的内容
const JSON_KEY_REGEX = /{([\s\S]*?)}/g;

// 匹配{}之间的value
const JSON_VALYR_REGEX = /(?<=: )[^,}]+/g;

/**
 * 获取需要back的所有文件目录
 * @returns
 */
function getFilePaths() {
  const CONFIG = getProjectConfig();
  const dirArr = CONFIG.include && CONFIG.include.length > 0 ? CONFIG.include : ['./'];
  let filePaths = [];

  dirArr.forEach((i) => {
    const dirPath = path.resolve(process.cwd(), i);
    const files = getSpecifiedFiles(dirPath, formatExclude(CONFIG.exclude));
    filePaths = filePaths.concat(files);
  });

  return filePaths.filter((file) => {
    let flag = false;
    for (let index = 0; index < CONFIG.fileSuffix.length; index++) {
      const element = CONFIG.fileSuffix[index];
      flag = file.endsWith(element);
      if (flag) {
        break;
      }
    }
    return isFile(file) && flag;
  });
}

/**
 * 获取I18N.template里面{}每个value对应的value
 * @param {*} str {val1: h, val2: m, val3: s}
 * @returns [h, m, s]
 */
function getTemplateValue(str) {
  try {
    const values = str.match(JSON_VALYR_REGEX);
    return values;
  } catch (e) {
    console.log(e);
    throw e;
  }
}

/**
 * 如果文件中存在I18N.template，先转换一下
 * @param {*} code
 * @param {*} flatObj
 * @returns
 */
function transformTemplate(filePath, code, flatObj) {
  try {
    const templates = code.match(TEMPLATE_INNER_REGEX) || [];
    let sum = Array.isArray(templates) ? templates.length : 0;
    if (Array.isArray(templates) && templates.length) {
      templates.forEach((i) => {
        const [jsonStr] = i ? i.match(JSON_KEY_REGEX) : [];
        const keys = getTemplateValue(jsonStr);
        let matchList = getValueByI18N(filePath, i, flatObj) || [];
        let matchText = matchList[0] && matchList[0]['value'];
        if (matchText) {
          matchText = matchText.replace(/{(val\d+)}/g, (match, group, index) => {
            if (!keys[0]) {
              throw new Error(`${filePath}文件中的 ${highlightText(i)} 转换有问题，请手动检查`);
            }
            const res = '${' + keys[0].trim() + '}';
            keys.splice(0, 1);
            return res;
          });

          code = code.replace(i, '`' + matchText + '`');
        }
      });
    }
    return { code, sum };
  } catch (e) {
    console.log(e);
    throw e;
  }
}

/**
 * 获取I18N.xx.xx所对应的中文
 * @param {*} filePath 文件路径
 * @param {*} str
 * @param {*} flatObj
 * @returns { key: I18N.xx, value: '测试' }
 */
function getValueByI18N(filePath, str, flatObj) {
  try {
    const matchs = str.match(I18N_REGEX);
    if (!Array.isArray(matchs) || !matchs.length) {
      return [];
    }

    const matchList = matchs.reduce((total, item) => {
      if (!['I18N.template', 'I18N.setLang'].includes(item)) {
        const text = flatObj[item.replace('I18N.', '')];
        if (text) {
          total.push({ key: item, value: text });
        } else {
          throw new Error(
            `${filePath}文件中的 ${highlightText(item)} 未发现有对应的中文文案，请检查`
          );
        }
      }
      return total;
    }, []);

    return matchList;
  } catch (e) {
    console.log(e);
    throw e;
  }
}

/**
 * 获取需要被重写的文件
 * @param {*} filePath 文件路径
 * @param {*} flatObj 所有key对应的中文
 * @returns
 */
function getNeedRewriteFiles(filePath, flatObj) {
  try {
    const str = fs.readFileSync(filePath, 'utf-8');
    let { code, sum } = transformTemplate(filePath, str, flatObj);

    let matchList = getValueByI18N(filePath, code, flatObj) || [];
    if (Array.isArray(matchList) && matchList.length) {
      sum += matchList.length;
      matchList.forEach(({ key, value }) => {
        // 兼容翻译的文案中有\n \r \t 这种情况
        value = value.replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/\t/g, '\\t');
        const replaceVal = value && value.includes("'") ? '"' + value + '"' : "'" + value + "'";
        code = code.replace(key, replaceVal);
      });
    }

    return {
      filePath,
      code,
      sum
    };
  } catch (e) {
    console.log(e);
    throw e;
  }
}

// 同步不同的语言包
function back() {
  try {
    const filePaths = getFilePaths();
    const zhCN = syncLang('zh-CN');
    const zhCNFlat = flatObject(zhCN);
    /** 获取需要被重写的文件 */
    const needRewriteFiles = filePaths.map((i) => getNeedRewriteFiles(i, zhCNFlat));

    needRewriteFiles.forEach(({ filePath, code, sum }) => {
      if (sum > 0) {
        console.log(
          `正在对 ${highlightText(filePath)} 文件进行回滚操作, 共计${highlightText(sum)}处`
        );

        fs.writeFileSync(filePath, code);
        console.log(`${highlightText(filePath)} 文件回滚完毕`);
      }
    });

    console.log('正在删除zh-CN文件夹下的文件');
    shell.rm('-rf', path.resolve(process.cwd(), './.octopus/zh-CN/*'));
    console.log('已成功删除zh-CN文件夹下的文件');
  } catch (e) {
    failInfo(e.message);
  }
}

module.exports = {
  back
};
