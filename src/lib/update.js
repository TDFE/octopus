'use strict';
const updateNotifier = require('update-notifier')

const pkg = require('../../package.json');

const interval = 1000 * 60


const checkUpdate = () => {

    const notifier = updateNotifier({
        pkg: pkg,
        updateCheckInterval: interval
    })

    notifier.notify();
}

module.exports = checkUpdate