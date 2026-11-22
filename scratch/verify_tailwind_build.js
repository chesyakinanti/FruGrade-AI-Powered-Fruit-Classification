const cp = require('child_process');
const fs = require('fs');
const postcss = require('postcss');

const gitExe = 'C:\\Users\\chesy\\AppData\\Local\\GitHubDesktop\\app-3.6.11\\resources\\app\\git\\cmd\\git.exe';
const headCss = cp.execFileSync(gitExe, ['show', 'HEAD:assets/css/app.css'], { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
const unminCss = fs.readFileSync('scratch/tailwind_unminified.css', 'utf8');

const headRoot = postcss.parse(headCss);
const unminRoot = postcss.parse(unminCss);

let ruleCount = 0;
let declCount = 0;
let atruleCount = 0;
let commentCount = 0;

function walk(node) {
  const items = [];
  (node.nodes || []).forEach(child => {
    if (child.type === 'rule') {
      ruleCount++;
      // normalize selector whitespace & pseudo-element single/double colons (e.g. :before vs ::before)
      const normalizedSel = child.selector
        .replace(/\s+/g, ' ')
        .replace(/\s*,\s*/g, ',')
        .replace(/:(before|after)/g, '::$1')
        .trim();
      items.push({
        type: 'rule',
        selector: normalizedSel,
        children: walk(child)
      });
    } else if (child.type === 'decl') {
      declCount++;
      items.push({
        type: 'decl',
        prop: child.prop,
        val: child.value.replace(/\s+/g, ' ').trim(),
        imp: child.important
      });
    } else if (child.type === 'atrule') {
      atruleCount++;
      items.push({
        type: 'atrule',
        name: child.name,
        params: child.params.replace(/\s+/g, ' ').trim(),
        children: walk(child)
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

const headTree = walk(headRoot);
const headCounts = { ruleCount, declCount, atruleCount, commentCount };

ruleCount = 0;
declCount = 0;
atruleCount = 0;
commentCount = 0;

const unminTree = walk(unminRoot);
const unminCounts = { ruleCount, declCount, atruleCount, commentCount };

console.log('HEAD CSS counts         :', headCounts);
console.log('Unminified Build counts :', unminCounts);

console.log('Top-level items count match:', headTree.length === unminTree.length);

let diffCount = 0;
for (let i = 0; i < Math.min(headTree.length, unminTree.length); i++) {
  const h = JSON.stringify(headTree[i]);
  const u = JSON.stringify(unminTree[i]);
  if (h !== u) {
    diffCount++;
    if (diffCount <= 5) {
      console.log(`\nDiff at index ${i}:`);
      console.log('HEAD  :', h);
      console.log('UNMIN :', u);
    }
  }
}

console.log('\nTotal differences:', diffCount);
if (diffCount === 0 && headTree.length === unminTree.length) {
  console.log('SUCCESS: Tailwind build output is 100% IDENTICAL to HEAD CSS!');
}
