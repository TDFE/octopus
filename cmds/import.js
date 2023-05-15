const { importExcel } = require('../src/import');

exports.command = 'import';

exports.describe = 'import 将excel中人工翻译的部分替换未翻译的key';

exports.handler = () => {
  importExcel();
};
