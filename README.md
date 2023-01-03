# octopus
====

## 安装

```

npm install td-octopus -g

```

## 使用

```
otp <cmd> [-args]

命令：
  otp extract [dirPath] [prefix]  extract [dirPath] [prefix]
                                  一键批量替换指定文件夹下的所有文案
  otp import [langs]              import [langs]
                                  将excel中人工翻译的部分替换未翻译的key
  otp init                        init 初始化配置文件
  otp translate                   translate 通过对比zh-CN目录,获取各语言未翻译的
                                  部分,并生成excel文件

选项：
  -v, --version  显示版本号                                               [布尔]
  -h, --help     显示帮助信息                                             [布尔]

copyright 2022 同盾

```

## otp-config.json 说明

```
{
  "otpDir": "./.octopus", // 语言包目录
  "proType": "react", // 项目类型
  "srcLang": "zh-CN", // 提取中文目录
  "distLangs": [ "en-US", "zh-TW" ], // 需要转换的语言
  "googleApiKey": "", // google翻译 这期没做
  "baiduApiKey": { "appId": "", "appKey": "" }, // 百度翻译 这期没做
  "baiduLangMap": { "en-US": "en" }, // 百度翻译 这期没做
  "translateOptions": { "concurrentLimit": 10, "requestOptions": {} }, // google翻译 这期没做
  "fileSuffix": [".ts", ".js", ".vue", ".jsx", ".tsx"], // 支持符合JS语法的后缀名
  "defaultTranslateKeyApi": "Pinyin", // 默认生成的JSON key 使用拼音前5个
  "importI18N": "import I18N from 'src/utils/I18N';",
  "include": [], // 需要翻译的目录&也可以命令行输入参数
  "exclude": [], // 过滤目录&文件
  "reservedKey": ["template", "case"] // js关键词以及I18N内置方法不能作为目录名，会统一添加td作为前缀
}
```
￼













