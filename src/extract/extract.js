const slash = require('slash2');
const _ = require('lodash');
const path = require('path');

const { getSpecifiedFiles, readFile, writeFile, isFile, isDirectory } = require('./file');
const { translateText, findMatchKey, findMatchValue,  translateKeyText,  getProjectConfig } = require('../utils');
const { successInfo, failInfo, highlightText } = require('../utils/colors');
const { findChineseText } = require('./findChineseText');
const { getSuggestLangObj } = require('./getLangData');

const { replaceAndUpdate, hasImportI18N, createImportI18N } = require('./replace');

const CONFIG = getProjectConfig();

function formatExclude(exclude){
  return (exclude || []).map(p => path.resolve(process.cwd(), p));
}

function removeLangsFiles(files) {
  const langsDir = path.resolve(process.cwd(), CONFIG.otpDir);
  return files.filter(file => {
    const completeFile = path.resolve(process.cwd(), file);
    return !completeFile.includes(langsDir);
  });
}

/**
 * 递归匹配项目中所有的代码的中文
 */
function findAllChineseText(dir) {
  const first = dir.split(',')[0];

  let files = [];
  if (isDirectory(first)) {
    const dirPath = path.resolve(process.cwd(), dir);
    files = getSpecifiedFiles(dirPath, formatExclude(CONFIG.exclude));
  } else {
    files = removeLangsFiles(dir.split(','));
  }
  const filterFiles = files.filter(file => {
    let flag = false;
    for (let index = 0; index < CONFIG.fileSuffix.length; index++) {
      const element = CONFIG.fileSuffix[index];
      flag  = file.endsWith(element);
      if (flag) {
        break;
      }
    }
    return (isFile(file) && flag);
  });
  const allTexts = filterFiles.reduce((pre, file) => {
    const code = readFile(file);
    const texts = findChineseText(code, file);
    // 调整文案顺序，保证从后面的文案往前替换，避免位置更新导致替换出错
    const sortTexts = _.sortBy(texts, obj => -obj.range.start);
    if (texts.length > 0) {
      console.log(`${highlightText(file)} 发现 ${highlightText(texts.length)} 处中文文案`);
    }

    return texts.length > 0 ? pre.concat({ file, texts: sortTexts }) : pre;
  }, []);

  return allTexts;
}

/**
 * 处理作为key值的翻译原文
 */
function getTransOriginText(text) {
  // 避免翻译的字符里包含数字或者特殊字符等情况，只过滤出汉字和字母
  const reg = /[a-zA-Z\u4e00-\u9fa5]+/g;
  const findText = text.match(reg) || [];
  const transOriginText = findText ? findText.join('').slice(0, 5) : '中文符号';

  return transOriginText;
}

/**
 * @param currentFilename 文件路径
 * @returns string[]
 */
function getSuggestion(currentFilename) {
  let suggestion = [];
  const suggestPageRegex = /\/pages\/\w+\/([^\/]+)\/([^\/\.]+)/;

  if (currentFilename.includes('/pages/')) {
    suggestion = currentFilename.match(suggestPageRegex);
  }
  if (suggestion) {
    suggestion.shift();
  }
  /** 如果没有匹配到 Key */
  if (!(suggestion && suggestion.length)) {
    const names = slash(currentFilename).split('/');
    const fileName = _.last(names);
    let fileKey = fileName.split('.')[0].replace(new RegExp('-', 'g'), '_');
    let dir = names[names.length - 2].replace(new RegExp('-', 'g'), '_');
    if (dir === fileKey) {
      suggestion = [dir];
    } else {
      suggestion = [dir, fileKey];
    }
  }

  return suggestion;
}

/**
 * 统一处理key值，已提取过的文案直接替换，翻译后的key若相同，加上出现次数
 * @param currentFilename 文件路径
 * @param langsPrefix 替换后的前缀
 * @param translateTexts 翻译后的key值
 * @param targetStrs 当前文件提取后的文案
 * @returns any[] 最终可用于替换的key值和文案
 */
function getReplaceableStrs(currentFilename, langsPrefix, translateTexts, targetStrs) {
  const finalLangObj = getSuggestLangObj();
  const virtualMemory = {};
  const suggestion = getSuggestion(currentFilename);

  const replaceableStrs = targetStrs.reduce((prev, curr, i) => {
    const key = findMatchKey(finalLangObj, curr.text);
    if (!virtualMemory[curr.text]) {
      if (key) {
        virtualMemory[curr.text] = key;
        return prev.concat({
          fileName:currentFilename,
          target: curr,
          key,
          targetStrs,
          needWrite: false
        });
      }
      const transText = translateTexts[i] && _.camelCase(translateTexts[i]);
      let suffix = suggestion.length ? suggestion.join('.') + '.' : '';
      suffix = suffix.toLocaleLowerCase();
      let transKey = `${suffix}${transText}`;
      if (langsPrefix) {
        transKey = `${langsPrefix}.${transText}`;
      }
      let occurTime = 1;
      // 防止出现前四位相同但是整体文案不同的情况
      while (
        findMatchValue(finalLangObj, transKey) !== curr.text &&
        _.keys(finalLangObj).includes(`${transKey}${occurTime >= 2 ? occurTime : ''}`)
      ) {
        occurTime++;
      }
      if (occurTime >= 2) {
        transKey = `${transKey}${occurTime}`;
      }
      virtualMemory[curr.text] = transKey;
      finalLangObj[transKey] = curr.text;
      return prev.concat({
        fileName:currentFilename,
        target: curr,
        key: transKey,
        targetStrs,
        needWrite: true
      });
    } else {
      return prev.concat({
        fileName:currentFilename,
        target: curr,
        key: virtualMemory[curr.text],
        targetStrs,
        needWrite: true
      });
    }
  }, []);

  return replaceableStrs;
}

/**
 * 递归匹配项目中所有的代码的中文
 * @param {dirPath} 文件夹路径
 */
function extractAll({ dirPath, prefix }) {
    const searchErrorMsg=[]; // 检索失败
    const extractAction = []; // 执行翻译行为
    const proType = CONFIG.proType;
    const dirArr = dirPath ? [dirPath] : CONFIG.include && CONFIG.include.length > 0 ? CONFIG.include : ['./'];
    // 去除I18N
    const langsPrefix = prefix ? prefix : null;
    // 翻译源配置错误，则终止
    const origin = CONFIG.defaultTranslateKeyApi || 'Pinyin';
    if (!['Pinyin', 'Google', 'Baidu'].includes(CONFIG.defaultTranslateKeyApi)) {
        console.log(
        `opt 仅支持 ${highlightText('Pinyin、Google、Baidu')}，请修改 ${highlightText('defaultTranslateKeyApi')} 配置项`
        );
        return;
    }

    const allTargetStrs = _.flatten(dirArr.map(findAllChineseText));
    if (allTargetStrs.length === 0) {
        console.log(highlightText('没有发现可替换的文案！'));
        return;
    }

    // 对当前文件进行文案检索
    const generateSearch = async (item, proType) => {
        const currentFilename = item.file;

        // 过滤掉模板字符串内的中文，避免替换时出现异常
        const targetStrs = item.texts.reduce((pre, strObj, i) => {
            // 因为文案已经根据位置倒排，所以比较时只需要比较剩下的文案即可
            const afterStrs = item.texts.slice(i + 1);
            if (afterStrs.some(obj => strObj.range.end <= obj.range.end)) {
                return pre;
            }
            return pre.concat(strObj);
        }, []);

        const len = item.texts.length - targetStrs.length;
        if (len > 0) {
            searchErrorMsg.push(`${currentFilename}中存在 ${highlightText(len)} 处文案，请避免在模板字符串的变量中嵌套中文`);
            return;
        }

        let translateTexts;

        if (origin !== 'Google') {
            // 翻译中文文案，百度和pinyin将文案进行拼接统一翻译
            const delimiter = origin === 'Baidu' ? '\n' : '$';
            const translateOriginTexts = targetStrs.reduce((prev, curr, i) => {
                const transOriginText = getTransOriginText(curr.text);
                if (i === 0) {
                return transOriginText;
                }
                return `${prev}${delimiter}${transOriginText}`;
            }, []);

            translateTexts = await translateKeyText(translateOriginTexts, origin);
        } else {
            // google并发性较好，且未找到有效的分隔符，故仍然逐个文案进行翻译
            const translatePromises = targetStrs.reduce((prev, curr) => {
                const transOriginText = getTransOriginText(curr.text);
                return prev.concat(translateText(transOriginText, 'en_US'));
            }, []);

            [...translateTexts] = await Promise.all(translatePromises);
        }

        if (translateTexts.length === 0) {
            failInfo(`${currentFilename}未得到翻译结果！`);
            return;
        }

        // 记录替换对象
        const replaceableStrs = getReplaceableStrs(currentFilename, langsPrefix, translateTexts, targetStrs);
        extractAction.push(replaceableStrs);
    };

    // 对文件进行替换
    const generateReplace = async (item, proType) => {
        let [currentFilename,targetStrs]=[,];
        await item
        .reduce((prev, obj) => {
            return prev.then(() => {
                currentFilename = obj.fileName;
                targetStrs = obj.targetStrs;
                console.log(`${currentFilename} 替换中...`);
                return replaceAndUpdate(currentFilename, obj.target, `I18N.${obj.key}`, false, obj.needWrite, proType);
            });
        }, Promise.resolve())
        .then(() => {
            // 添加 import I18N
            if (!hasImportI18N(currentFilename)) {
                const code = createImportI18N(currentFilename);
                writeFile(currentFilename, code);
            }
            successInfo(`${currentFilename} 替换完成，共替换 ${targetStrs.length} 处文案！`);
        })
        .catch(e => {
            failInfo(e.message);
        });
    };

    new Promise((resolve)=>{
        allTargetStrs
        .reduce((prev, current) => {
            return prev.then(() => {
                return generateSearch(current, proType);
            });
        }, Promise.resolve())
        .then(() => {
            successInfo('📢 📢 📢 📢 检索完成！');
            // 如果全部检索成功则进行翻译
            if(!searchErrorMsg?.length){
                resolve();
            }else{
                failInfo("--------------------------------");
                failInfo("但存在以下文件检索失败：");
                failInfo("--------------------------------");
                searchErrorMsg?.forEach(msg=>{
                    failInfo(msg||"替换失败");
                })
            }
        }).catch(e=>{
            failInfo(e||"替换失败");
        });
    }).then(()=>{
        // 开始替换
        // 提示翻译源
        if (CONFIG.defaultTranslateKeyApi === 'Pinyin') {
            console.log(
            `当前使用 ${highlightText('Pinyin')} 作为key值的翻译源，若想得到更好的体验，可配置 ${highlightText(
                'googleApiKey'
            )} 或 ${highlightText('baiduApiKey')}，并切换 ${highlightText('defaultTranslateKeyApi')}`
            );
        } else {
            console.log(`当前使用 ${highlightText(CONFIG.defaultTranslateKeyApi)} 作为key值的翻译源`);
        }

        console.log('即将截取每个中文文案的前5位翻译生成key值，并替换中...');

        extractAction.reduce((prev,current)=>{
            return prev.then(() => {
                return generateReplace(current, proType);
            });
        }, Promise.resolve())
        .then(() => {
            successInfo('替换完成！');
        }).catch(e=>{
            failInfo(e||"替换成功");
        });
    })

}

module.exports = { extractAll };
