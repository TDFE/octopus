const convertJsonToXlsx = (data, n) => {

    let module = ["中文", "英文"]
    const result = [{ name: 'Sheet1', data: [['需要翻译的字段'].concat(["中文", "人工翻译"])] }];

    const traverse = (node) => {
        if (node.children && node.children.length > 0) {
            node.children.forEach(child => traverse(child));
        } else {
            let arr = [node.path]
            module?.map(item => {
                arr.push(node[item])
            })
            result[0].data.push(arr);
        }
    };
    data?.map(item => {
        return traverse(item);
    })
    return result;
};

module.exports = {
    convertJsonToXlsx
}
