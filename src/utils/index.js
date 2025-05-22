/**
 * @author linhuiw
 * @desc 工具方法
 */
const fs = require("fs");
const path = require("path");
const _ = require("lodash");
const inquirer = require("inquirer");
const { pinyin } = require("pinyin-pro");
const ora = require('ora');
const { PROJECT_CONFIG, OCTOPUS_CONFIG_FILE } = require("./const");
const prettier = require('prettier');
const colors = require('colors');

function lookForFiles(dir, fileName) {
  const files = fs.readdirSync(dir);

  for (let file of files) {
    const currName = path.join(dir, file);
    const info = fs.statSync(currName);
    if (info.isDirectory()) {
      if (file === '.git' || file === 'node_modules') {
        continue;
      }
      const result = lookForFiles(currName, fileName);
      if (result) {
        return result;
      }
    } else if (info.isFile() && file === fileName) {
      return currName;
    }
  }
}

/**
 * 获得项目配置信息
 */
function getProjectConfig() {
  const configFile = path.resolve(process.cwd(), `./${OCTOPUS_CONFIG_FILE}`);
  let obj = PROJECT_CONFIG.defaultConfig;

  if (configFile && fs.existsSync(configFile)) {
    obj = {
      ...obj,
      ...JSON.parse(fs.readFileSync(configFile, 'utf8'))
    };
  }
  return obj;
}

/**
 * 获取语言资源的根目录
 */
function getOtpDir() {
  const config = getProjectConfig();

  if (config) {
    return config.otpDir;
  }
}

/**
 * 获取对应语言的目录位置
 * @param lang
 */
function getLangDir(lang) {
  const langsDir = getOtpDir();
  return path.resolve(langsDir, lang);
}

/**
 * 深度优先遍历对象中的所有 string 属性，即文案
 */
function traverse(obj, cb) {
  function traverseInner(obj, cb, path) {
    _.forEach(obj, (val, key) => {
      if (typeof val === 'string') {
        cb(val, [...path, key].join('.'));
      } else if (typeof val === 'object' && val !== null) {
        traverseInner(val, cb, [...path, key]);
      }
    });
  }

  traverseInner(obj, cb, []);
}

/**
 * 获取所有文案
 */
function getAllMessages(lang, filter = { message, key }) {
  const srcLangDir = getLangDir(lang);
  let files = fs.readdirSync(srcLangDir);
  files = files.filter(file => file.endsWith('.ts') && file !== 'index.ts').map(file => path.resolve(srcLangDir, file));

  const allMessages = files.map(file => {
    const { default: messages } = require(file);
    const fileNameWithoutExt = path.basename(file).split('.')[0];
    const flattenedMessages = {};

    traverse(messages, (message, path) => {
      const key = fileNameWithoutExt + '.' + path;
      if (filter(message, key)) {
        flattenedMessages[key] = message;
      }
    });

    return flattenedMessages;
  });

  return Object.assign({}, ...allMessages);
}

/**
 * 重试方法
 * @param asyncOperation
 * @param times
 */
function retry(asyncOperation, times = 1) {
  let runTimes = 1;
  const handleReject = e => {
    if (runTimes++ < times) {
      return asyncOperation().catch(handleReject);
    } else {
      throw e;
    }
  };
  return asyncOperation().catch(handleReject);
}

/**
 * 设置超时
 * @param promise
 * @param ms
 */
function withTimeout(promise, ms) {
  const timeoutPromise = new Promise((resolve, reject) => {
    setTimeout(() => {
      reject(`Promise timed out after ${ms} ms.`);
    }, ms);
  });
  return Promise.race([promise, timeoutPromise]);
}

/**
 * 使用google翻译
 */
function translateText(text, toLang) {
  const CONFIG = getProjectConfig();
  const options = CONFIG.translateOptions;
  const { translate: googleTranslate } = require('google-translate')(CONFIG.googleApiKey, options);
  return withTimeout(
    new Promise((resolve, reject) => {
      googleTranslate(text, 'zh', PROJECT_CONFIG.langMap[toLang], (err, translation) => {
        if (err) {
          reject(err);
        } else {
          resolve(translation.translatedText);
        }
      });
    }),
    5000
  );
}

/**
 * 翻译中文
 */
function translateKeyText(text, origin) {
  const CONFIG = getProjectConfig();
  const { appId, appKey } = CONFIG.baiduApiKey;
  const baiduTranslate = require('baidu-translate');

  function _translateText() {
    return withTimeout(
      new Promise((resolve, reject) => {
        // Baidu
        if (origin === 'Baidu') {
          baiduTranslate(appId, appKey, 'en', 'zh')(text)
            .then(data => {
              if (data && data.trans_result) {
                const result = data.trans_result.map(item => item.dst) || [];
                resolve(result);
              }
            })
            .catch(err => {
              reject(err);
            });
        }
        // Pinyin
        if (origin === 'Pinyin') {
          const result = pinyin(text, { toneType: 'none' });
          resolve(result.split('$'));
        }
      }),
      3000
    );
  }

  return retry(_translateText, 3);
}

function findMatchKey(langObj, text) {
  for (const key in langObj) {
    if (langObj[key] === text) {
      return key;
    }
  }

  return null;
}

function findMatchValue(langObj, key) {
  return langObj[key];
}

/**
 * 将对象拍平
 * @param obj 原始对象
 * @param prefix
 */
function flatten(obj, prefix = '') {
  var propName = prefix ? prefix + '.' : '',
    ret = {};

  for (var attr in obj) {
    if (_.isArray(obj[attr])) {
      var len = obj[attr].length;
      ret[attr] = obj[attr].join(',');
    } else if (typeof obj[attr] === 'object') {
      _.extend(ret, flatten(obj[attr], propName + attr));
    } else {
      ret[propName + attr] = obj[attr];
    }
  }
  return ret;
}

/**
 * 进度条加载
 * @param text
 * @param callback
 */
function spining(text, callback) {
  const spinner = ora(`${text}中...`).start();
  if (callback) {
    if (callback() !== false) {
      spinner.succeed(`${text}成功`);
    } else {
      spinner.fail(`${text}失败`);
    }
  }
}

/**
 * 使用 Prettier 格式化文件
 * @param fileContent
 */
function prettierFile(fileContent, proType) {
    try {
      return prettier.format(fileContent, {
        parser: proType === 'vue' ? 'vue' : 'typescript',
        trailingComma: 'all',
        singleQuote: true
      });
      // return fileContent;
    } catch (e) {
      failInfo(`代码格式化报错！${e.toString()}\n代码为：${fileContent}`);
      return fileContent;
    }
  }

module.exports = {
  getOtpDir,
  getLangDir,
  traverse,
  retry,
  withTimeout,
  getAllMessages,
  getProjectConfig,
  translateText,
  findMatchKey,
  findMatchValue,
  flatten,
  lookForFiles,
  translateKeyText,
  spining,
  prettierFile
};
