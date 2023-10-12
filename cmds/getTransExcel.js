const { index } = require('../src/translateExcel');

exports.command = 'transExcel';

exports.describe = '';

exports.handler = () => {
    index()
}
