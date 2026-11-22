const postcss = require('postcss');
const fs = require('fs');

const origCSS = fs.readFileSync('assets/css/app.css', 'utf8');
const fmtCSS = fs.readFileSync('scratch/formatted_prettier.css', 'utf8');

const origRoot = postcss.parse(origCSS);
const fmtRoot = postcss.parse(fmtCSS);

function serializeNode(node) {
  if (node.type === 'rule') {
    return {
      type: 'rule',
      // Normalize whitespace in selectors for comparison (e.g. "*,:after" vs "*,\n:after")
      selector: node.selector.replace(/\s+/g, ' ').trim(),
      nodes: (node.nodes || []).map(serializeNode)
    };
  }
  if (node.type === 'decl') {
    return {
      type: 'decl',
      prop: node.prop.trim(),
      value: node.value.replace(/\s+/g, ' ').trim(),
      important: !!node.important
    };
  }
  if (node.type === 'atrule') {
    return {
      type: 'atrule',
      name: node.name.trim(),
      params: node.params.replace(/\s+/g, ' ').trim(),
      nodes: (node.nodes || []).map(serializeNode)
    };
  }
  if (node.type === 'comment') {
    return {
      type: 'comment',
      text: node.text.trim()
    };
  }
  return { type: node.type };
}

const origSerialized = (origRoot.nodes || []).map(serializeNode);
const fmtSerialized = (fmtRoot.nodes || []).map(serializeNode);

console.log('Original top-level nodes count:', origSerialized.length);
console.log('Formatted top-level nodes count:', fmtSerialized.length);

let diffCount = 0;
const minLen = Math.min(origSerialized.length, fmtSerialized.length);

for (let i = 0; i < minLen; i++) {
  const o = JSON.stringify(origSerialized[i]);
  const f = JSON.stringify(fmtSerialized[i]);
  if (o !== f) {
    diffCount++;
    if (diffCount <= 10) {
      console.log(`\nDiff at index ${i}:`);
      console.log('ORIG:', JSON.stringify(origSerialized[i], null, 2));
      console.log('FMT :', JSON.stringify(fmtSerialized[i], null, 2));
    }
  }
}

if (origSerialized.length !== fmtSerialized.length) {
  console.log('Length mismatch!');
} else if (diffCount === 0) {
  console.log('SUCCESS: All nodes, rules, properties, and values are 100% IDENTICAL!');
} else {
  console.log(`Total diffs: ${diffCount}`);
}
