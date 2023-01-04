/*
 * @Description: 翻译公用方法
 * @Author: 郑泳健
 * @Date: 2022-06-02 10:09:01
 * @LastEditors: 郑泳健
 * @LastEditTime: 2023-01-04 14:54:06
 */
const fs = require('fs');
const path = require('path');
const baiduTranslate = require('baidu-translate');
const shell = require('shelljs');
const _ = require('lodash');
const XLSX = require('xlsx');
const { getProjectConfig, prettierFile } = require('../utils/index');

const otpPath = path.resolve(process.cwd(), getProjectConfig().otpDir);

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
async function syncFiles(distLangs = []) {
    const zhCNPath = otpPath + '/zh-CN';
    const files = shell.ls('-A', zhCNPath);

    for (const lang of distLangs) {
        const currentLangPath = otpPath + '/' + lang;
        // 如果目录不存在就全部复制过去
        if (!shell.test('-e', currentLangPath)) {
            await shell.cp('-R', zhCNPath, currentLangPath);
        } else {
            const currentDirFiles = await shell.ls('-A', currentLangPath);

            // 删除多余的文件
            for (const i of currentDirFiles) {
                if (!files.includes(i)) {
                    await shell.rm('-rf', currentLangPath + '/' + i);
                }
            }

            // 增加没有的文件
            for (const i of files) {
                if (!currentDirFiles.includes(i)) {
                    shell.touch(currentLangPath + '/' + i);
                }
            }
        }
        // 直接复制index.js到对应的语种目录下
        await shell.cp('-R', zhCNPath + '/index.js', currentLangPath + '/index.js');
    }
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
async function getAdjustLangObjAndAddList(lang, langObj = {}, zhCNObj = {}) {
    const langObjKeys = Object.keys(langObj);
    // 调整后的语言包key/value
    const adjustLangObj = {};
    // 需要新增的key/value
    const needAddList = [];
    // 循环zh-CN的key，得到当前语言包的key
    for (let key in zhCNObj) {
        // 4种情况下，需要将key放入到翻译对象里面去
        // 1: 这个key不存在当前的语言包key/value中
        // 2: 语言包的key的value类型不是string
        // 3: 语言包的key的value值为""
        // 4: 语言包的key的value和zh-CN的key的value一样
        if (!langObjKeys.includes(key) || typeof langObj[key] !== 'string' || langObj[key] === '' || langObj[key] === zhCNObj[key]) {
            needAddList.push([key, zhCNObj[key], '', '']);
        }

        adjustLangObj[key] = langObj[key] || zhCNObj[key];
    }

    const addList = await combinText(needAddList, lang);

    return {
        fileKeyValueList: getFileKeyValueList(adjustLangObj),
        addList
    };
}

/**
 * 合并需要翻译的中文，因为百度翻译限制一次性中文只能有3000字
 * 因为百度免费翻译有时候会抽风，会导致翻译结果出错，为了减少没被翻译的，所以现在设置一次性翻译200字
 * @param {*} needAddList 
 */
async function combinText(needAddList, lang) {
    const otpConfig = getProjectConfig()
    const { baiduApiKey, baiduLangMap } = otpConfig || {}
    const { appId, appKey } = baiduApiKey || {}
    const toLang = baiduLangMap?.[lang] || '';

    if (!Array.isArray(needAddList)) {
        return []
    }

    // 如果不配置百度翻译就直接返回
    if (!appId || !appKey || !toLang) {
        return needAddList;
    }

    // 分组
    const groupList = groupByLength(needAddList, 200)
    // 分组翻译结果
    const transformResultList = await getTransformResultList(groupList, appId, appKey, 'zh', toLang)

    return needAddList.map((i, index) => {
        i[2] = transformResultList[index];
        return i
    })
}

/**
 * 对分组的结果进行翻译
 * @param {*} groupList 
 * @param {*} appId 
 * @param {*} appKey 
 * @param {*} fromLang 
 * @param {*} toLang 
 * @returns 
 */
async function getTransformResultList(groupList, appId, appKey, fromLang, toLang) {
    let translatList = []
    for (const i of groupList) {
        const baiduResult = await baiduTranslation(appId, appKey, fromLang, toLang, JSON.stringify(i))

        try {
            const splitBaiduResult = baiduResult?.[0]
            const transResultList = JSON.parse(splitBaiduResult);
            // 这里是判断百度翻译返回的长度是不是和传入的一样
            const reduceNum = i.length - transResultList.length;
            translatList = [...translatList, ...transResultList].concat(Array(reduceNum).fill(''))

        } catch (e) {
            console.log(`百度翻译出现部分失败, 失败原因: ${e.message}`)
            translatList = translatList.concat(Array(i.length).fill(''))
        }
    }

    return translatList
}

/**
 * 对数组进行分组
 * @param {*} groupList 原数组
 * @param {*} max 最大多少字
 * @returns 
 */
function groupByLength(groupList, max) {
    const list = [[]]
    let str = ''
    // 变成${max}个字符一组的数组，用于一次百度翻译
    groupList.forEach((it) => {
        let [, text] = it;

        if ((str + text).length < max) {
            list[list.length - 1] = Array.isArray(list[list.length - 1]) ? [...list[list.length - 1], text] : [text]
            str = str + text
        } else {
            list.push([text])
            str = ''
        }
    })
    return list
}

/**
 * 百度翻译
 * @param {*} from 
 * @param {*} to 
 * @param {*} text 
 * @returns 
 */
async function baiduTranslation(appId, appKey, from, to, text) {
    return new Promise((resolve, reject) => {
        // 延迟1000ms是因为百度翻译对调用频率有限制
        setTimeout(() => {
            return baiduTranslate(appId, appKey, to, from)(text)
                .then(data => {
                    if (data && data.trans_result) {
                        const result = data.trans_result.map(item => item.dst) || [];
                        resolve(result);
                    } else {
                        resolve('[]')
                    }
                }).catch(err => {
                    reject('[]');
                });
        }, 1000)
    })
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
    const excleData = [['需要翻译的字段', '中文', '百度翻译', '人工翻译'], ...addList];

    const options = {
        '!cols': [{ wpx: 100 }, { wpx: 100 }, { wpx: 100 }]
    };

    const worksheet = XLSX.utils.aoa_to_sheet(excleData);
    worksheet['!cols'] = options['!cols'];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Sheet1');
    XLSX.writeFile(workbook, `${path}/translate_${lang}.xls`);
}

/**
 * 解析excel
 * @param {*} path excel的路径地址
 * @returns {"a.b.c": "test"}
 */
function parseExcel(path, callback) {
    if (!shell.test('-e', path)) {
        console.log('当前目录下没有找到翻译.xls文件');
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
            fs.writeFileSync(`${otpPath}/${lang}/${fileName}.js`, prettierFile('export default ' + JSON.stringify(distRst, null, 2)));
        });
    }
}

/**
 * 动态修改文件名
 * @param {*} filelist 需要修改后缀的文件列表, 每一项都不带后缀 string[]
 * @param {*} originSuffix 原后缀
 * @param {*} changedSuffix 新后缀
 */
async function changeFileSuffix(filelist, originSuffix, changedSuffix) {
    for (let i of filelist) {
        await fs.renameSync(i + originSuffix, i + changedSuffix)
    }
}

/**
 * 递归获取所有要修改名字的目录
 * @param {*} path 要翻译的目录
 * @param {*} originSuffix 要翻译的文件原后缀
 * @param {*} fileList 返回哪些文件要修改后缀
 * @returns
 */
function getNeedChangeNameFileList(path, originSuffix, fileList = []) {
    const files = fs.readdirSync(path);

    files.forEach(function (file) {
        const stat = fs.statSync(path + '/' + file);
        if (stat.isDirectory()) {
            getNeedChangeNameFileList(path + '/' + file, originSuffix, fileList);
        }
        if (stat.isFile() && file.endsWith(originSuffix)) {
            // 去掉文件后缀，因为后面还要转回来
            const filename = file.substring(0, file.lastIndexOf('.'));
            fileList.push(`${path}/${filename}`);
        }
    });
    return fileList;
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
    rewriteFiles,
    changeFileSuffix,
    getNeedChangeNameFileList
};
