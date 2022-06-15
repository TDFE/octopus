const fs = require('fs');
const { isString } = require('lodash');
const inquirer = require('inquirer');
const questions = require('../config/init');
const { extractAll } = require('../src/extract/extract');

exports.command = 'extract <dirPath> [prefix]';

exports.describe = 'extract <dirPath> [prefix] 一键批量替换指定文件夹下的所有文案';

exports.handler = async (argv) => {
    console.log(argv)
    if (argv.prefix) {
        console.log('请指定翻译后文案 key 值的前缀 extract src xxx');
    }
    if (isString(argv.prefix) && !new RegExp(/^([-_a-zA-Z1-9$]+)+$/).test(argv.prefix)) {
        console.log('字母、下滑线、破折号、$ 字符组成的变量名');
    } else {
        let answers = await inquirer.prompt(questions);
        const extractAllParams = {
            prefix: isString(argv.prefix) && argv.prefix,
            dirPath: isString(argv.dirPath) && argv.dirPath,
            type: answers.type
        };

        extractAll(extractAllParams);
    }
}