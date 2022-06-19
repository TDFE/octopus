#!/usr/bin / env node
const { excel } = require('../src/excel');

exports.command = 'excel [langs]';

exports.describe = 'excel [langs] 将excel中人工翻译的部分替换未翻译的key';

exports.handler = (args) => {
    excel(args.langs)
}