const { main } = require('../src/stash');

exports.command = 'stash';

exports.describe = 'stash 将项目中用到的中英文存储到缓存中';

exports.handler = () => {
    main()
}
