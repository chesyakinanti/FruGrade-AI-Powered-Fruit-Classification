const cp = require('child_process');
const fs = require('fs');
const postcss = require('postcss');

const gitExe = 'C:\\Users\\chesy\\AppData\\Local\\GitHubDesktop\\app-3.6.11\\resources\\app\\git\\cmd\\git.exe';
const headCss = cp.execFileSync(gitExe, ['show', 'HEAD:assets/css/app.css'], { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
const curCss = fs.readFileSync('assets/css/app.css', 'utf8');

function getSels(css) {
  const s = new Set();
  postcss.parse(css).walkRules(r => {
    r.selectors.forEach(sel => {
      const normalized = sel
        .replace(/\s+/g, ' ')
        .replace(/['"]/g, '')
        .replace(/:+(before|after)/g, '::$1')
        .replace(/^\*::/, '::')
        .trim();
      s.add(normalized);
    });
  });
  return s;
}

const headSels = getSels(headCss);
const curSels = getSels(curCss);

console.log('HEAD unique normalized selectors:', headSels.size);
console.log('Current unique normalized selectors:', curSels.size);

let diffs = 0;
headSels.forEach(x => {
  if (!curSels.has(x)) {
    console.log('Missing in cur:', x);
    diffs++;
  }
});
curSels.forEach(x => {
  if (!headSels.has(x)) {
    console.log('Extra in cur:', x);
    diffs++;
  }
});

console.log('Exact semantic selector differences:', diffs);
