const slash = require('slash2');
const _ = require('lodash');
const path = require('path');
const Parser = require('properties');

const { getSpecifiedFiles, readFile, writeFile, isFile, isDirectory } = require('../utils/file');
const { translateText, findMatchKey, findMatchValue, translateKeyText, getProjectConfig } = require('../utils');
const { successInfo, failInfo, highlightText } = require('../utils/colors');

const CONFIG = getProjectConfig();

function formatExclude(exclude) {
  return (exclude || []).map(p => path.resolve(process.cwd(), p));
}

const findAllCnFile = (dir) => {
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
    flag = (file.endsWith('.properties') && file.indexOf('cn.properties') !== -1);
    return (isFile(file) && flag);
  });
  return filterFiles
}

function findAllCnFileSrc(dir, keyMap) {
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
      flag = file.endsWith(element);
      if (flag) {
        break;
      }
    }
    return (isFile(file) && flag);
  });
  let replaceList = []
  let list = []
  let errorList = []
  for (let index = 0; index < filterFiles.length; index++) {
    const file = filterFiles[index];
    let code = readFile(file);
    const pathKey = regPathSrc(file);
    replaceList = []
    const regRresource1 = new RegExp('this\\.resource\\([\'|\"](\\S*?)[\'|\"]\\)', 'g')
    const regRresource = new RegExp('this\\.resource\\([\'|\"](\\S*?)[\'|\"]\\)', 'g')
    if (regRresource1.test(code)) {
      if (keyMap[pathKey] && errorList.length === 0) {
        let r = "";
        while (r = regRresource.exec(code)) {
          replaceList.push({
            source: r[0],
            key: r[1]
          })
          list.push({
            source: r[0],
            key: r[1]
          })
        }
        console.log(`${highlightText(file)} 发现 ${highlightText(replaceList.length)} 处 this.resource`);
        for (let index = 0; index < replaceList.length; index++) {
          const item = replaceList[index];
          code = code.replace(item.source, `'${keyMap[pathKey][item.key] ? keyMap[pathKey][item.key] : keyMap['common'][item.key]}'`)
        }
        writeFile(file, code);
      } else {
        errorList.push(file);
        failInfo(`${file} 文件目录没匹配`);
      }
    }
  }

  return errorList.length ? [] : list;
}

const regPath = (file) => {
  const tempPath = CONFIG.regPath ? CONFIG.regPath : 'locale'
  const reg = new RegExp(`${tempPath}\/(\\S*?)\/cn\.`, 'g');
  const list = reg.exec(file)
  return list ? list[1].toLocaleLowerCase() : ''
}

const regPathSrc = (file) => {
  const reg = new RegExp(`src\/(\\S*)[\/|\.]?`, 'g');
  const list = reg.exec(file)
  let temp = list[1] ? list[1].toLocaleLowerCase() : ''
  temp = temp.split('/')
  let str = temp[0] + '/' + temp[1]
  if (temp[0] === 'routes' || temp[0] === 'pages') {
    str = temp[1] + '/' + temp[2]
  }
  return str
}

/**
 * 递归匹配项目中所有的代码的中文
 * @param {dirPath} 文件夹路径
 */
function extractAll({ dirPath, resourcePath }) {
  const dirArr = dirPath ? [dirPath] : CONFIG.include && CONFIG.include.length > 0 ? CONFIG.include : ['./'];

  const dirResourceArr = resourcePath ? [resourcePath] : CONFIG.resourcePath && CONFIG.resourcePath.length > 0 ? CONFIG.resourcePath : ['./'];

  const allFlies = _.flatten(dirResourceArr.map(findAllCnFile));
  let allKeyObj = {}
  allFlies.forEach((file) => {
    let code = readFile(file);
    Parser.parse(code, {}, (err, obj) => {
      if (err) {
        console.log(err);
      } else {
        const pathKey = regPath(file);
        allKeyObj[pathKey] = obj
      }
    });
  });


  const allTargetStrs = _.flatten(dirArr.map((dir) => {
    return findAllCnFileSrc(dir, allKeyObj)
  }));


  if (allTargetStrs.length === 0) {
    console.log(highlightText('以上文件中没有发现源文件 this.resource！'), allTargetStrs);
    return;
  }

  successInfo('替换成功！')

}

module.exports = { extractAll };
