require('ts-node').register({
    compilerOptions: {
        module: 'commonjs'
    }
});
const shell = require('shelljs');
const path = require('path');
const {
    otpPath,
    changeFileSuffix,
    getNeedChangeNameFileList
} = require('./translate');


module.exports = async () => {
    await shell.rm('-rf', path.resolve(__dirname, '../temp'));
    await shell.cp(
        '-R',
        otpPath,
        path.resolve(__dirname, '../temp')
    );
    const filelist = getNeedChangeNameFileList(path.resolve(__dirname, '../temp'), '.js')

    changeFileSuffix(filelist, '.js', '.ts')
}
