const { transLang } = require('../src/transLang');

exports.command = 'transLang [dirPath]';

exports.describe = 'transLang 将某些工程里面constants/lang提取到.octopus';

exports.handler = (argv) => {
    const { dirPath } = argv
    transLang(dirPath)
}
