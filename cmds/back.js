const { back } = require('../src/back');

exports.command = 'back';

exports.describe = 'back 将项目中已经翻译的部分回滚回去';

exports.handler = () => {
  back();
};
