const { insertEn } = require('../src/insertEn');

exports.command = 'insertEn';

exports.describe = 'insertEn 将constants/lang塞入到translate_en-US';

exports.handler = () => {
    insertEn()
}
