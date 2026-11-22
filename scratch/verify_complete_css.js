const postcss = require('postcss');
const fs = require('fs');

const orig = fs.readFileSync('assets/css/app.css', 'utf8');
const fmt = fs.readFileSync('scratch/formatted_exact.css', 'utf8');

const oRoot = postcss.parse(orig);
const fRoot = postcss.parse(fmt);

let ruleCount = 0;
let declCount = 0;
let atruleCount = 0;
let commentCount = 0;

function walk(node, path = '') {
  const items = [];
  (node.nodes || []).forEach((child, idx) => {
    const curPath = `${path}[${idx}](${child.type})`;
    if (child.type === 'rule') {
      ruleCount++;
      items.push({
        type: 'rule',
        selector: child.selector.replace(/\s+/g, ' ').replace(/\s*,\s*/g, ',').trim(),
        children: walk(child, curPath)
      });
    } else if (child.type === 'decl') {
      declCount++;
      items.push({
        type: 'decl',
        prop: child.prop,
        val: child.value,
        imp: child.important
      });
    } else if (child.type === 'atrule') {
      atruleCount++;
      items.push({
        type: 'atrule',
        name: child.name,
        params: child.params.replace(/\s+/g, ' ').trim(),
        children: walk(child, curPath)
      });
    } else if (child.type === 'comment') {
      commentCount++;
      items.push({
        type: 'comment',
        text: child.text.trim()
      });
    }
  });
  return items;
}

const origTree = walk(oRoot, 'root');
const origCounts = { ruleCount, declCount, atruleCount, commentCount };

ruleCount = 0;
declCount = 0;
atruleCount = 0;
commentCount = 0;

const fmtTree = walk(fRoot, 'root');
const fmtCounts = { ruleCount, declCount, atruleCount, commentCount };

console.log('Original counts :', origCounts);
console.log('Formatted counts:', fmtCounts);

const origJSON = JSON.stringify(origTree);
const fmtJSON = JSON.stringify(fmtTree);

if (origJSON === fmtJSON) {
  console.log('\n=== VERIFICATION RESULT: 100% IDENTICAL AST ===');
  console.log(`- Total Rules: ${origCounts.ruleCount}`);
  console.log(`- Total Declarations: ${origCounts.declCount}`);
  console.log(`- Total At-Rules: ${origCounts.atruleCount}`);
  console.log(`- Total Comments: ${origCounts.commentCount}`);
  console.log('All rules, selectors, properties, values, and order are completely identical!');
} else {
  console.error('\n=== MISMATCH DETECTED ===');
  process.exit(1);
}
