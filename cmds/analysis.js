const { analysis } = require('../src/analysis');

exports.command = 'analysis';

exports.describe = 'analysis 分析现有情况，并把结果导出到文件';

exports.handler = () => {
  analysis();
};
