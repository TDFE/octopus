const fs = require('fs');
const path = require('path');
const _ = require('lodash');
const { PROJECT_CONFIG, OCTOPUS_CONFIG_FILE } = require('../utils/const')

function creteConfigFile(answers) {
    const configDir = path.resolve(process.cwd(), `./${OCTOPUS_CONFIG_FILE}`);
    if (!fs.existsSync(configDir)) {
        const config = JSON.stringify({
            ...PROJECT_CONFIG.defaultConfig, 
            proType: answers.type
        }, null, 2);
        fs.writeFile(configDir, config, err => {
            if (err) {
                console.log(err);
            }
        });
    }
}

function createCnFile() {
    const cnDir = `${PROJECT_CONFIG.dir}/zh-CN`;
    if (!fs.existsSync(cnDir)) {
        fs.mkdirSync(cnDir);
        fs.writeFile(`${cnDir}/index.js`, PROJECT_CONFIG.zhIndexFile, err => {
            if (err) {
                console.log(err);
            }
        });
        fs.writeFile(`${cnDir}/common.js`, PROJECT_CONFIG.zhTestFile, err => {
            if (err) {
                console.log(err);
            }
        });
    }
}

function initProject(answers) {
    /** 初始化配置文件夹 */
    if (!fs.existsSync(PROJECT_CONFIG.dir)) {
        fs.mkdirSync(PROJECT_CONFIG.dir);
    }
    creteConfigFile(answers);
    createCnFile();
}

module.exports = { initProject };
