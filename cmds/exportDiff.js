const { doExportDiff } = require('../src/exportDiff');

exports.command = 'exportDiff [type]';

exports.describe = 'exportDiff 导出增量或者差异的未翻译文件';

exports.handler = (argv) => {
  doExportDiff(argv.type === 'all');
};
