const { excel } = require('../src/import');

exports.command = 'import [langs]';

exports.describe = 'import [langs] 将excel中人工翻译的部分替换未翻译的key';

exports.handler = (args) => {
    excel(args.langs)
}