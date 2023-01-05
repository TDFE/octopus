 const fs = require('fs');
 const path = require('path');
 const _ = require('lodash');
 const ts = require('typescript');
 const compilerVue = require('vue-template-compiler');
 const babel = require('@babel/core');
 
/** unicode cjk 中日韩文 范围 */
const DOUBLE_BYTE_REGEX = /[\u4E00-\u9FFF]/g

function transerI18n(code, filename, lang) {
  if (lang === 'ts') {
    return typescriptI18n(code, filename);
  } else {
    return javascriptI18n(code, filename);
  }
}
function javascriptI18n(code, filename) {
  let arr = [];
  let visitor = {
    StringLiteral(path) {
      if (path.node.value.match(DOUBLE_BYTE_REGEX)) {
        arr.push(path.node.value);
      }
    }
  };
  let arrayPlugin = { visitor };
  babel.transformSync(code.toString(), {
    filename,
    plugins: [arrayPlugin]
  });
  return arr;
}
function typescriptI18n(code, fileName) {
  let arr = [];
  const ast = ts.createSourceFile('', code, ts.ScriptTarget.ES2015, true, ts.ScriptKind.TS);
  function visit(node) {
    switch (node.kind) {
      case ts.SyntaxKind.StringLiteral: {
        /** 判断 Ts 中的字符串含有中文 */
        const { text } = node;
        if (text.match(DOUBLE_BYTE_REGEX)) {
          arr.push(text);
        }
        break;
      }
    }
    ts.forEachChild(node, visit);
  }
  ts.forEachChild(ast, visit);
  return arr;
}
/**
 * 去掉文件中的注释
 * @param code
 * @param fileName
 */
function removeFileComment(code, fileName) {
  const printer = ts.createPrinter({ removeComments: true });
  const sourceFile = ts.createSourceFile(
    '',
    code,
    ts.ScriptTarget.ES2015,
    true,
    fileName.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  );
  return printer.printFile(sourceFile);
}

/**
 * 查找 Ts 文件中的中文
 * @param code
 */
function findTextInTs(code, fileName) {
  const matches = [];
  const ast = ts.createSourceFile('', code, ts.ScriptTarget.ES2015, true, ts.ScriptKind.TSX);
function visit(node) {
    switch (node.kind) {
      case ts.SyntaxKind.StringLiteral: {
        /** 判断 Ts 中的字符串含有中文 */
        const { text } = node;
        if (text.match(DOUBLE_BYTE_REGEX)) {
          const start = node.getStart();
          const end = node.getEnd();
          const range = { start, end };
          matches.push({
            range,
            text,
            isString: true
          });
        }
        break;
      }
      case ts.SyntaxKind.JsxElement: {
        const { children } = node;

        children.forEach(child => {
          if (child.kind === ts.SyntaxKind.JsxText) {
            const text = child.getText();
            /** 修复注释含有中文的情况，Angular 文件错误的 Ast 情况 */
            const noCommentText = removeFileComment(text, fileName);

            if (noCommentText.match(DOUBLE_BYTE_REGEX)) {
              const start = child.getStart();
              const end = child.getEnd();
              const range = { start, end };

              matches.push({
                range,
                text: text.trim(),
                isString: false
              });
            }
          }
        });
        break;
      }
      case ts.SyntaxKind.TemplateExpression: {
        const { pos, end } = node;
        const templateContent = code.slice(pos, end);

        if (templateContent.match(DOUBLE_BYTE_REGEX)) {
          const start = node.getStart();
          const end = node.getEnd();
          const range = { start, end };
          matches.push({
            range,
            text: code.slice(start + 1, end - 1),
            isString: true
          });
        }
        break;
      }
      case ts.SyntaxKind.NoSubstitutionTemplateLiteral: {
        const { pos, end } = node;
        const templateContent = code.slice(pos, end);

        if (templateContent.match(DOUBLE_BYTE_REGEX)) {
          const start = node.getStart();
          const end = node.getEnd();
          const range = { start, end };
          matches.push({
            range,
            text: code.slice(start + 1, end - 1),
            isString: true
          });
        }
        break;
      }
      // 兼容<TabPane tab={<>中国风险地区统计</>} key="china" />这种场景
      case ts.SyntaxKind.JsxText: {
        const text = node.text;
        /** 修复注释含有中文的情况，Angular 文件错误的 Ast 情况 */
        const noCommentText = removeFileComment(text, fileName);

        if (noCommentText.match(DOUBLE_BYTE_REGEX)) {
          const start = node.getStart();
          const end = node.getEnd();
          const range = { start, end };

          matches.push({
            range,
            text: text.trim(),
            isString: false
          });
        }
        break;
      }
    }

    ts.forEachChild(node, visit);
  }
  ts.forEachChild(ast, visit);

  return matches;
}

/**
 * 递归匹配vue代码的中文
 * @param code
 */
function findTextInVue(code) {
  let rexspace1 = new RegExp(/&ensp;/, 'g');
  let rexspace2 = new RegExp(/&emsp;/, 'g');
  let rexspace3 = new RegExp(/&nbsp;/, 'g');
  code = code
    .replace(rexspace1, 'ccsp&;')
    .replace(rexspace2, 'ecsp&;')
    .replace(rexspace3, 'ncsp&;');
  let coverRex1 = new RegExp(/ccsp&;/, 'g');
  let coverRex2 = new RegExp(/ecsp&;/, 'g');
  let coverRex3 = new RegExp(/ncsp&;/, 'g');
  let matches = [];
  var result;
  const vueObejct = compilerVue.compile(code.toString(), { outputSourceRange: true });
  let vueAst = vueObejct.ast;
  let expressTemp = findVueText(vueAst);
  expressTemp.forEach(item => {
    item.arrf = [item.start, item.end];
  });
  matches = expressTemp;
  let outcode = vueObejct.render.toString().replace('with(this)', 'function a()');
  let vueTemp = transerI18n(outcode, 'as.vue', null);

  /**删除所有的html中的头部空格 */
  vueTemp = vueTemp.map(item => {
    return item.trim();
  });

  vueTemp = Array.from(new Set(vueTemp));
  let codeStaticArr = [];
  vueObejct.staticRenderFns.forEach(item => {
    let childcode = item.toString().replace('with(this)', 'function a()');
    let vueTempChild = transerI18n(childcode, 'as.vue', null);
    codeStaticArr = codeStaticArr.concat(Array.from(new Set(vueTempChild)));
  });
  vueTemp = Array.from(new Set(codeStaticArr.concat(vueTemp)));
  vueTemp.forEach(item => {
    let items = item
      .replace(/\{/g, '\\{')
      .replace(/\}/g, '\\}')
      .replace(/\$/g, '\\$')
      .replace(/\(/g, '\\(')
      .replace(/\)/g, '\\)')
      .replace(/\+/g, '\\+')
      .replace(/\*/g, '\\*')
      .replace(/\^/g, '\\^');
    let rex = new RegExp(items, 'g');
    let codeTemplate = code.substring((vueObejct.ast).start, (vueObejct.ast).end);
    while ((result = rex.exec(codeTemplate))) {
      let res = result;
      let last = rex.lastIndex;
      last = last - (res[0].length - res[0].trimRight().length);
      const range = { start: res.index, end: last };
      matches.push({
        arrf: [res.index, last],
        range,
        text: res[0]
          .trimRight()
          .replace(coverRex1, '&ensp;')
          .replace(coverRex2, '&emsp;')
          .replace(coverRex3, '&nbsp;'),
        isString:
          (codeTemplate.substr(res.index - 1, 1) === '"' && codeTemplate.substr(last, 1) === '"') ||
          (codeTemplate.substr(res.index - 1, 1) === "'" && codeTemplate.substr(last, 1) === "'")
            ? true
            : false
      });
    }
  });
  let matchesTemp = matches;
  let matchesTempResult = matchesTemp.filter((item, index) => {
    let canBe = true;
    matchesTemp.forEach(items => {
      if (
        (item.arrf[0] > items.arrf[0] && item.arrf[1] <= items.arrf[1]) ||
        (item.arrf[0] >= items.arrf[0] && item.arrf[1] < items.arrf[1]) ||
        (item.arrf[0] > items.arrf[0] && item.arrf[1] < items.arrf[1])
      ) {
        canBe = false;
      }
    });
    if (canBe) return item;
  });
  const sfc = compilerVue.parseComponent(code.toString());
  return matchesTempResult.concat(findTextInVueTs(sfc.script.content, 'AS', sfc.script.start));
}
function findTextInVueTs(code, fileName, startNum) {
  const matches = [];
  const ast = ts.createSourceFile('', code, ts.ScriptTarget.ES2015, true, ts.ScriptKind.TS);

  function visit(node) {
    switch (node.kind) {
      case ts.SyntaxKind.StringLiteral: {
        /** 判断 Ts 中的字符串含有中文 */
        const { text } = node;
        if (text.match(DOUBLE_BYTE_REGEX)) {
          const start = node.getStart();
          const end = node.getEnd();
          /** 加一，减一的原因是，去除引号 */
          const range = { start: start + startNum, end: end + startNum };
          matches.push({
            range,
            text,
            isString: true
          });
        }
        break;
      }
      case ts.SyntaxKind.TemplateExpression: {
        const { pos, end } = node;
        let templateContent = code.slice(pos, end);
        templateContent = templateContent.toString().replace(/\$\{[^\}]+\}/, '');
        if (templateContent.match(DOUBLE_BYTE_REGEX)) {
          const start = node.getStart();
          const end = node.getEnd();
          /** 加一，减一的原因是，去除`号 */
          const range = { start: start + startNum, end: end + startNum };
          matches.push({
            range,
            text: code.slice(start + 1, end - 1),
            isString: true
          });
        }
        break;
      }
    }

    ts.forEachChild(node, visit);
  }
  ts.forEachChild(ast, visit);

  return matches;
}
function findVueText(ast) {
  let arr = [];
  const regex1 = /\`(.+?)\`/g;
  function emun(ast) {
    if (ast.expression) {
      let text = ast.expression.match(regex1);
      if (text && text[0].match(DOUBLE_BYTE_REGEX)) {
        text.forEach(itemText => {
          const varInStr = itemText.match(/(\$\{[^\}]+?\})/g);
          if (varInStr)
            itemText.match(DOUBLE_BYTE_REGEX) &&
              arr.push({ text: ' ' + itemText, range: { start: ast.start + 2, end: ast.end - 2 }, isString: true });
          else
            itemText.match(DOUBLE_BYTE_REGEX) &&
              arr.push({ text: itemText, range: { start: ast.start, end: ast.end }, isString: false });
        });
      } else {
        ast.tokens &&
          ast.tokens.forEach(element => {
            if (typeof element === 'string' && element.match(DOUBLE_BYTE_REGEX)) {
              arr.push({
                text: element,
                range: {
                  start: ast.start + ast.text.indexOf(element),
                  end: ast.start + ast.text.indexOf(element) + element.length
                },
                isString: false
              });
            }
          });
      }
    } else if (!ast.expression && ast.text) {
      ast.text.match(DOUBLE_BYTE_REGEX) &&
        arr.push({ text: ast.text, range: { start: ast.start, end: ast.end }, isString: false });
    } else {
      ast.children &&
        ast.children.forEach(item => {
          emun(item);
        });
    }
  }
  emun(ast);
  return arr;
}
/**
 * 递归匹配代码的中文
 * @param code
 */
function findChineseText(code, fileName) {
   if (fileName.endsWith('.vue')) {
    return findTextInVue(code);
  } else {
    return findTextInTs(code, fileName);
  }
}

module.exports = { findChineseText, findTextInVue };
