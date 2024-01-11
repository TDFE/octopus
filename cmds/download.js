const fs = require('fs');
const axios = require('axios');
const XLSX = require('xlsx');
const path = require('path');

const { isString } = require('lodash');
const { extractAll } = require('../src/resource/extract');
const { getProjectConfig } = require('../src/utils');
const { convertJsonToXlsx } = require('../src/download');
const { OCTOPUS_CONFIG_FILE } = require('../src/utils/const')

exports.command = 'download';

exports.describe = 'download';

exports.handler = async (argv) => {
    const config = getProjectConfig();
    const otpPath = path.resolve(process.cwd(), getProjectConfig().otpDir);
    const url = getProjectConfig().downloadUrl
    let lang = "en-US"
    if (!url) {
        console.log(`请配置${OCTOPUS_CONFIG_FILE}里面的downloadUrl`)
        return;
    }
    // let url = "http://sinan-dev.tongdun.me:8088/api/i18n/queryConfig?code=12312312312312312321312&projectId=1175"
    axios.get(url)
        .then((response) => {
            // 给目录和翻译文件item赋值
            const jsonData = response?.data?.data?.jsonData?.children || [];
            // 将嵌套的 JSON 数据转换为 node-xlsx 格式
            const xlsxData = convertJsonToXlsx(jsonData, module);

            const options = {
                '!cols': [{ wpx: 100 }, { wpx: 100 }, { wpx: 100 }, { wpx: 100 }]
            };

            const worksheet = XLSX.utils.aoa_to_sheet(xlsxData[0]?.data);
            worksheet['!cols'] = options['!cols'];

            const workbook = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(workbook, worksheet, 'Sheet1');
            XLSX.writeFile(workbook, `${otpPath}/${lang}/translate_${lang}.xls`);
            console.log(`下载成功`)

        })
        .catch((error) => {
            console.error(`Error: ${error.message}`);
        });
}

