
const OCTOPUS_CONFIG_FILE = 'otp-config.json';

const PROJECT_CONFIG = {
  dir: './.octopus',
  defaultConfig: {
    kiwiDir: './.octopus',
    srcLang: 'zh-CN',
    distLangs: ['en-US'],
    googleApiKey: '',
    baiduApiKey: {
      appId: '',
      appKey: ''
    },
    baiduLangMap: {
      ['en-US']: 'en'
    },
    translateOptions: {
      concurrentLimit: 10,
      requestOptions: {}
    },
    defaultTranslateKeyApi: 'Pinyin', // 批量提取文案时生成key值时的默认翻译源
    importI18N: `import I18N from 'src/utils/I18N';`,
    ignoreDir: '',
    ignoreFile: ''
  },
  langMap: {
    ['en-US']: 'en',
    ['en_US']: 'en'
  },
  zhIndexFile: `import common from './common';
export default Object.assign({}, {
  common
});`,
  zhTestFile: `export default {
    test: '测试'
  }`
};

module.exports = {
  OCTOPUS_CONFIG_FILE,
  PROJECT_CONFIG
}
