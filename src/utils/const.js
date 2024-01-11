const OCTOPUS_CONFIG_FILE = 'otp-config.json';

const PROJECT_CONFIG = {
  dir: './.octopus',
  defaultConfig: {
    otpDir: './.octopus',
    proType: '',
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
    fileSuffix: ['.ts', '.js', '.vue', '.jsx', '.tsx'], //默认只提取当前后缀名
    defaultTranslateKeyApi: 'Pinyin', // 批量提取文案时生成key值时的默认翻译源
    importI18N: `import I18N from 'src/utils/I18N';`,
    include: ['./src'],
    exclude: [],
    regPath: 'locale', // 正则匹配路径地址使用
    resourcePath: [
      "./src/constants/locale"
    ],
    reservedKey: ["template", "case"],
    downloadUrl: "https://sinan.tongdun.me/api/i18n/queryConfig?code=&projectId="
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
