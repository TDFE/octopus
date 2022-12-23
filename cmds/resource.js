const fs = require('fs');
const { isString } = require('lodash');
const { extractAll } = require('../src/resource/extract');

exports.command = 'resource [dirPath] [resourcePath]';

exports.describe = 'resource [dirPath] [resourcePath] resourcePath 为目前系统已翻译的文件目录；一键批量替换指定文件夹下的所有 this.resource';

exports.handler = async (argv) => {
    extractAll({
        dirPath: isString(argv.dirPath) && argv.dirPath,
        resourcePath: isString(argv.resourcePath) && argv.resourcePath,
    });
}

