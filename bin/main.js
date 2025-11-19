#!/usr/bin/env node

const checkUpdate = require('../src/lib/update');

const curTime = new Date();
const year = curTime.getFullYear();

checkUpdate()

const pkg = require('../package');
const argv = require('yargs')
    .usage('$0 <cmd> [-args]')
    .commandDir('../cmds')
    .demand(1)
    .version(pkg.version)
    .alias('v', 'version')
    .help()
    .alias('h', 'help')
    .epilog(`copyright ${year} 同盾 npm i td-octopus -g`)
    .argv;
