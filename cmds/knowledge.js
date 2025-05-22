const { doExportKnowledge } = require('../src/export');

exports.command = 'knowledge';

exports.describe = 'knowledge 导出所有文件,并生成知识库的excel文件';

exports.handler = () => {
  doExportKnowledge()
}