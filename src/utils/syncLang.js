const fs = require('fs')
const { otpPath } = require('./translate');

module.exports = (lang) => {
  try {
    const list = fs.readdirSync(otpPath + '/' + lang);
    let langMap = {};
    list.forEach((i) => {
        const suffixCheck = ['.js', '.ts', '.jsx', 'tsx'].some(it => i.endsWith(it));
        if (suffixCheck && !['index.js', 'index.jsx', 'index.ts', 'index.tsx'].includes(i)) {
            const str = fs.readFileSync(`${otpPath}/${lang}/${i}`, 'utf-8');
            const replaceStr = str.replace(/export default|\;/g, '');
            const json = eval("(" + replaceStr + ")");
            const key = i.split('.')[0];

            langMap[key] = json;
        }
    });
    return langMap
  }catch (e) {
    console.log(e.message, 'e.message')
    return {}
}
}
