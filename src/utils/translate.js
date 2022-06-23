/*
 * @Description: 公用方法
 * @Author: 郑泳健
 * @Date: 2022-06-02 10:09:01
 * @LastEditors: 郑泳健
 * @LastEditTime: 2022-06-19 18:42:59
 */
const fs = require('fs');
const path = require('path');
const shell = require('shelljs');
const _ = require('lodash');
const XLSX = require('xlsx');
const { PROJECT_CONFIG } = require('./const')

const otpPath = path.resolve(process.cwd(), PROJECT_CONFIG.dir);

/**
 * 判断对象是否为纯对象
 * @param {*} obj
 * @returns boolean
 */
const isObj = function (obj) {
    return Object.prototype.toString.call(obj) === '[object Object]';
};

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
 * 同步文件,删除多余的文件，增加没有的文件
 * @param {*} distLangs 目录名 []
 */
function syncFiles(distLangs = []) {
    const zhCNPath = otpPath + '/zh-CN';
    const files = shell.ls('-A', zhCNPath);

    distLangs.forEach((lang) => {
        const currentLangPath = otpPath + '/' + lang;
        // 如果目录不存在就全部复制过去
        if (!shell.test('-e', currentLangPath)) {
            shell.cp('-R', zhCNPath, currentLangPath);
        } else {
            const currentDirFiles = shell.ls('-A', currentLangPath);

            // 删除多余的文件
            currentDirFiles.forEach((i) => {
                if (!files.includes(i)) {
                    shell.rm('-rf', currentLangPath + '/' + i);
                }
            });

            // 增加没有的文件
            files.forEach((i) => {
                if (!currentDirFiles.includes(i)) {
                    shell.touch(currentLangPath + '/' + i);
                }
            });
        }
        // 直接复制index.js到对应的语种目录下
        shell.cp('-R', zhCNPath + '/index.js', currentLangPath + '/index.js');
    });
}

/**
 * 将多层级的对象扁平化
 * {a: {b: {c: '测试'}}} ==> {"a.b.c": "测试"}
 * @param {*} obj 原对象
 * @param {*} prefix 每一层的key都要上一层的key + 本级的key
 * @param {*} result 扁平化后的结果 {"a.b.c": "测试"}
 */
function flatObject(obj, prefix = '', result = {}) {
    if (!isObj(obj)) {
        return result;
    }

    Object.entries(obj).forEach(([key, value]) => {
        const sumKey = prefix ? prefix + '.' + key : key;
        if (!isObj(value)) {
            result[sumKey] = value;
        }
        flatObject(value, sumKey, result);
    });

    return result;
}

/**
 * 将文件名提取出来，因为第一个.前面的代码的是文件名 {a.b.c: "测试", a.d.e: "姓名"} => [{fileName: a, value: {b.c: "测试", d.e: "姓名"}}]
 * @param {*} adjustLangObj {a.b.c: "测试", a.d.e: "姓名"}
 * @returns [{fileName: a, value: {b.c: "测试", d.e: "姓名"}}]
 */
function getFileKeyValueList(adjustLangObj) {
    const adjustLangObjKeys = Object.keys(adjustLangObj);
    const fileKeyValueList = adjustLangObjKeys.reduce((total, item) => {
        const [fileName, ...rest] = item.split('.');
        const index = total.findIndex((i) => i.fileName === fileName);

        if (index >= 0) {
            total[index].value[rest.join('.')] = adjustLangObj[item];
        } else {
            total.push({
                fileName,
                value: { [rest.join('.')]: adjustLangObj[item] }
            });
        }
        return total;
    }, []);

    return fileKeyValueList;
}

/**
 * 当前语言包和zh-CN语言包的diff对比后 ==> 最终语言包key/value & 需要新增的key/value
 * @param {*} langObj 语言包当前的 key/value
 * @param {*} zhCNObj zh-CN 的key/value
 * @returns { fileKeyValueList: [{fileName: a, value: {"b.c": xx}}], addList: [["a.b.c": "dd"]] }
 */
function getAdjustLangObjAndAddList(langObj = {}, zhCNObj = {}) {
    const langObjKeys = Object.keys(langObj);
    // 调整后的语言包key/value
    const adjustLangObj = {};
    // 需要新增的key/value
    const addList = [];
    // 循环zh-CN的key，得到当前语言包的key
    for (let key in zhCNObj) {
        // 4种情况下，需要将key放入到翻译对象里面去
        // 1: 这个key不存在当前的语言包key/value中
        // 2: 语言包的key的value类型不是string
        // 3: 语言包的key的value值为""
        // 4: 语言包的key的value和zh-CN的key的value一样
        if (!langObjKeys.includes(key) || typeof langObj[key] !== 'string' || langObj[key] === '' || langObj[key] === zhCNObj[key]) {
            addList.push([key, zhCNObj[key], '', '']);
        }

        adjustLangObj[key] = langObj[key] || zhCNObj[key];
    }

    return {
        fileKeyValueList: getFileKeyValueList(adjustLangObj),
        addList
    };
}

/**
 * 转换数据结构 {"a.b.c": "测试"} ==> {a: {b: {c: "测试"}}}
 * @param {*} adjustLangObj
 */
function getDistRst(adjustLangObj) {
    const rst = {};
    traverse(adjustLangObj, (message, key) => {
        _.setWith(rst, key, message, Object);
    });
    return rst;
}

/**
 * 生成excel
 * @param {*} addList 需要翻译的列表
 * @param {*} path 生成的路径
 */
function generateExcel(addList, path, lang) {
    const excleData = [['需要翻译的字段', '中文', '人工翻译'], ...addList];

    const options = {
        '!cols': [{ wpx: 100 }, { wpx: 100 }, { wpx: 100 }]
    };

    const worksheet = XLSX.utils.aoa_to_sheet(excleData);
    worksheet['!cols'] = options['!cols'];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Sheet1');
    XLSX.writeFile(workbook, `${path}/translate_${lang}.xlsx`);
}

/**
 * 解析excel
 * @param {*} path excel的路径地址
 * @returns {"a.b.c": "test"}
 */
function parseExcel(path, callback) {
    if (!shell.test('-e', path)) {
        console.log('当前目录下没有找到翻译.xlsx文件');
        return;
    }
    const excelBinary = fs.readFileSync(path);
    const excel = XLSX.read(excelBinary, {
        type: 'buffer'
    });

    try {
        const sheet0 = excel.Sheets[excel.SheetNames[0]];
        const list = XLSX.utils.sheet_to_json(sheet0);

        const translateMap = list.reduce((total, item) => {
            const key = item['需要翻译的字段'];
            const value = item['人工翻译'];

            total[key] = value;
            return total;
        }, {});

        callback(translateMap);
    } catch (e) {
        console.log(e)
    }
}

/**
 * 重写文件
 * @param {*} langFlat
 * @param {*} lang
 */
function rewriteFiles(fileKeyValueList, lang) {
    // 将新的key/value重新写入
    if (Array.isArray(fileKeyValueList) && fileKeyValueList.length) {
        fileKeyValueList.forEach(({ fileName, value }) => {
            const distRst = getDistRst(value);
            fs.writeFileSync(`${otpPath}/${lang}/${fileName}.js`, 'module.exports =' + JSON.stringify(distRst, null, 4));
        });
    }
}

module.exports = {
    isObj,
    traverse,
    otpPath,
    syncFiles,
    flatObject,
    getAdjustLangObjAndAddList,
    getFileKeyValueList,
    getDistRst,
    generateExcel,
    parseExcel,
    rewriteFiles
};
