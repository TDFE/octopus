const { main } = require('../src/check');

exports.command = 'check';

exports.describe = 'check 将项目中缺少的key';

exports.handler = () => {
    main()
}
