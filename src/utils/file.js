const fs = require('fs');
const path = require('path');
const _ = require('lodash');

/**
 * 获取文件夹下符合要求的所有文件
 * @function getSpecifiedFiles
 * @param  {string} dir 路径
 * @param {exclude} 忽略文件夹或文件
 */
function getSpecifiedFiles(dir, exclude = []) {
  return fs.readdirSync(dir).reduce((files, file) => {
    const name = path.join(dir, file);
    const isDirectory = fs.statSync(name).isDirectory();
    const isFile = fs.statSync(name).isFile();

    if (isDirectory) {
      return files.concat(getSpecifiedFiles(name, exclude));
    }

    if (isFile && !_.find(exclude, (p) => name.includes(p))) {
      return files.concat(name);
    }
    return files;
  }, []);
}

/**
 * 读取文件
 * @param fileName
 */
function readFile(fileName) {
  if (fs.existsSync(fileName)) {
    return fs.readFileSync(fileName, 'utf-8');
  }
}

/**
 * 读取文件
 * @param fileName
 */
function writeFile(filePath, file) {
  if (fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, file);
  }
}

/**
 * 判断是文件
 * @param path
 */
function isFile(path) {
  return fs.statSync(path).isFile();
}

/**
 * 判断是文件夹
 * @param path
 */
function isDirectory(path) {
  return fs.statSync(path).isDirectory();
}

module.exports = { getSpecifiedFiles, readFile, writeFile, isFile, isDirectory };
