const postcss = require('postcss');
const fs = require('fs');

const origCSS = fs.readFileSync('assets/css/app.css', 'utf8');
const root = postcss.parse(origCSS);

function formatNode(node, indent = '') {
  if (node.type === 'rule') {
    const selectorLines = formatSelector(node.selector, indent);
    let out = indent + selectorLines + ' {\n';
    for (const child of node.nodes || []) {
      out += formatNode(child, indent + '  ');
    }
    out += indent + '}\n';
    return out;
  }

  if (node.type === 'decl') {
    const important = node.important ? ' !important' : '';
    // Preserve exact value string; if it was empty whitespace, keep a single space
    const valStr = node.value.trim() === '' ? ' ' : ' ' + node.value;
    return indent + node.prop + ':' + valStr + important + ';\n';
  }

  if (node.type === 'atrule') {
    const params = node.params ? ' ' + node.params : '';
    if (!node.nodes) {
      return indent + '@' + node.name + params + ';\n';
    }
    let out = indent + '@' + node.name + params + ' {\n';
    const childNodes = node.nodes || [];
    for (let i = 0; i < childNodes.length; i++) {
      out += formatNode(childNodes[i], indent + '  ');
      if (node.name === 'media' && i < childNodes.length - 1) {
        out += '\n';
      }
    }
    out += indent + '}\n';
    return out;
  }

  if (node.type === 'comment') {
    const commentText = node.text.endsWith(' ') ? node.text : node.text + ' ';
    const prefix = commentText.startsWith(' ') ? '' : ' ';
    return indent + '/*' + prefix + commentText + '*/\n';
  }

  return '';
}

function formatSelector(sel, indent) {
  let parts = [];
  let current = '';
  let inParen = 0;
  let inBracket = 0;

  for (let i = 0; i < sel.length; i++) {
    const ch = sel[i];
    if (ch === '(') inParen++;
    else if (ch === ')') inParen--;
    else if (ch === '[') inBracket++;
    else if (ch === ']') inBracket--;

    if (ch === ',' && inParen === 0 && inBracket === 0) {
      parts.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  if (current.trim()) parts.push(current.trim());

  if (parts.length <= 1) {
    return parts[0] || sel.trim();
  }

  return parts.join(',\n' + indent);
}

let result = '';
for (let i = 0; i < root.nodes.length; i++) {
  const node = root.nodes[i];
  result += formatNode(node, '');
  if (i < root.nodes.length - 1) {
    result += '\n';
  }
}

// Write to formatted file
fs.writeFileSync('scratch/formatted_final.css', result, 'utf8');
console.log('Formatted final CSS generated. Lines:', result.split('\n').length);
