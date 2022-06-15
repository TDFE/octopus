#!/usr/bin/env node

const checkUpdate = require('../src/lib/update');

checkUpdate()

const fs = require("fs");

const pkg = require('../package');
const argv = require('yargs')
    .usage('$0 <cmd> [-args]')
    .commandDir('../cmds')
    .demand(1)
    .version(pkg.version)
    .alias('v', 'version')
    .help()
    .alias('h', 'help')
    .epilog('copyright 2020 Anthony Li')
    .argv;