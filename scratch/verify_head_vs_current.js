const cp = require('child_process');
const fs = require('fs');
const postcss = require('postcss');

const gitExe = 'C:\\Users\\chesy\\AppData\\Local\\GitHubDesktop\\app-3.6.11\\resources\\app\\git\\cmd\\git.exe';
const headCss = cp.execFileSync(gitExe, ['show', 'HEAD:assets/css/app.css'], { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
const currentCss = fs.readFileSync('assets/css/app.css', 'utf8');

const headRoot = postcss.parse(headCss);
const currentRoot = postcss.parse(currentCss);

let ruleCount = 0;
let declCount = 0;
let atruleCount = 0;
let commentCount = 0;

function walk(node) {
  const items = [];
  (node.nodes || []).forEach(child => {
    if (child.type === 'rule') {
      ruleCount++;
      items.push({
        type: 'rule',
        selector: child.selector.replace(/\s+/g, ' ').replace(/\s*,\s*/g, ',').trim(),
        children: walk(child)
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

const currentTree = walk(currentRoot);
const currentCounts = { ruleCount, declCount, atruleCount, commentCount };

console.log('HEAD CSS counts   :', headCounts);
console.log('Current CSS counts:', currentCounts);

const isMatch = JSON.stringify(headTree) === JSON.stringify(currentTree);
console.log('100% AST Match with HEAD:', isMatch);

if (!isMatch) {
  process.exit(1);
}
