const fs = require('fs');
const axios = require('axios');
const XLSX = require('xlsx');
const path = require('path');

const { getProjectConfig } = require('../src/utils');
const { convertJsonToXlsx } = require('../src/download');
const { OCTOPUS_CONFIG_FILE } = require('../src/utils/const')

exports.command = 'download';

exports.describe = 'download 正确配置downloadUrl里的code与projectId后执行，可以从司南下载翻译文档xls到本地目录';

exports.handler = async (argv) => {
    const config = getProjectConfig();
    const otpPath = path.resolve(process.cwd(), config.otpDir);
    const url = config.downloadUrl
    let lang = "en-US"
    if (!url) {
        console.log(`请配置${OCTOPUS_CONFIG_FILE}里面的downloadUrl`)
        return;
    }
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
            console.error(`请正确配置downloadUrl里的code与projectId`);

        });
}

