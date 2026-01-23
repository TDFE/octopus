const { main } = require('../src/pop');

exports.command = 'pop';

exports.describe = 'pop 将项目中缺少的key, 原始项目的.octopus复制到当前项目public目录下，会帮你自助将缺失的key补充上去';

exports.handler = () => {
    main()
}
