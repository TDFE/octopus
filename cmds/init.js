const { initProject } = require('../src/init');
const inquirer = require('inquirer');
const { spining } = require('../src/utils')

exports.command = 'init';

exports.describe = 'init 初始化配置文件';

exports.handler = async () => {
    const answers = await inquirer.prompt([
        {
            type: 'list',
            name: 'type',
            message: '请选择项目类型',
            choices: ['react', 'vue', 'typescript'],
            default: 'react'
        }
    ]);
    spining('初始化项目', async () => {
        initProject(answers);
    });
}