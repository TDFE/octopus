const { main } = require('../src/storage');

exports.command = 'storage';

exports.describe = 'storage 将项目中用到的中英文存储到缓存中';

exports.handler = () => {
    main()
}
