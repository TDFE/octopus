const { read, utils, readFile, writeFile } = require('xlsx');

const wb = readFile('./n.xls');
const ws = wb.Sheets[wb.SheetNames[0]]; // get the first worksheet
const data = utils.sheet_to_json(ws); // generate objects

const old = readFile('./o.xls');
const oldws = old.Sheets[old.SheetNames[0]]; // get the first worksheet
const olddata = utils.sheet_to_json(oldws); // generate objects
for (let index = 0; index < data.length; index++) {
    const element = data[index];
    const cun =  olddata.find(res => {
        return res['中文'] === element['中文'] && res['需要翻译的字段'] === element['需要翻译的字段']
    })
    const cun2 =  olddata.find(res => {
        return res['中文'] === element['中文']
    })
    if (cun) {
        element['人工翻译'] = cun['人工翻译']
    } else if (cun2) {
        element['人工翻译'] = cun2['人工翻译']
    }
}

const header = [
    ['需要翻译的字段', "中文", '百度翻译', '人工翻译'],
]
const body = data.map(x => ([x["需要翻译的字段"], x["中文"],  x["百度翻译"], x["人工翻译"],]))
body.unshift(...header);
const workbook = utils.book_new();
var sheet = utils.aoa_to_sheet(body);


utils.book_append_sheet(workbook, sheet, 'sheet名称'); // 向 workbook 中添加 sheet
writeFile(workbook, 'xxx_translate_en-US.xls'); // 导出 workbook