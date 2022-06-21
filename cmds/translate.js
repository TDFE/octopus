#!/usr/bin / env node
const { translate } = require('../src/translate');

exports.command = 'translate';

exports.describe = 'translate 通过对比zh-CN目录,获取各语言未翻译的部分,并生成excel文件';

exports.handler = () => {
    translate()
}