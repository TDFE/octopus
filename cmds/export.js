const { doExport } = require('../src/export');

exports.command = 'export';

exports.describe = 'export 导出所有文件,并生成excel文件';

exports.handler = () => {
  doExport()
}