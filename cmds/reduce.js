const { main } = require('../src/reduce');

exports.command = 'reduce';

exports.describe = 'reduce 将项目中多余的key删除';

exports.handler = () => {
    main()
}
