#!/usr/bin/env node
const { initProject } = require('../src/init');
const inquirer = require('inquirer');
const { spining } = require('../src/utils')

exports.command = 'init';

exports.describe = 'init 初始化配置文件';

exports.handler = async () => {
    const result = await inquirer.prompt({
        type: 'confirm',
        name: 'confirm',
        default: true,
        message: '项目中是否已存在octopus相关目录？'
    });
    if (!result.confirm) {
        spining('初始化项目', async () => {
            initProject();
        });
    } else {
        const value = await inquirer.prompt({
            type: 'input',
            name: 'dir',
            message: '请输入相关目录：'
        });
        spining('初始化项目', async () => {
            initProject(value.dir);
        });
    }
}