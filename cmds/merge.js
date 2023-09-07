const { doMerge } = require('../src/exportDiff');

exports.command = 'merge';

exports.describe = 'merge 翻译合并复用';

exports.handler = () => {
  doMerge();
};
