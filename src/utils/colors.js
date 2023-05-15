const colors = require('colors');

/**
 * 成功的提示
 */
function successInfo(message) {
  console.log(colors.green(message));
}

/**
 * 失败的提示
 */
function failInfo(message) {
  console.log(colors.red(message));
}

/**
 * 普通提示
 */
function highlightText(message) {
  return colors.yellow(`${message}`);
}

module.exports = {
  successInfo,
  failInfo,
  highlightText
};
