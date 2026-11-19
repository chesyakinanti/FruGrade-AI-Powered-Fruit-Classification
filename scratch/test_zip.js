const cp = require('child_process');
const out = cp.execSync('tar -xOf frontend-deploy.zip index.html', {encoding: 'utf8'});
const m = out.match(/data-i18n="footer\.copyright">([^<]+)</);
console.log('frontend-deploy.zip index.html =>', m ? m[1] : 'NOT FOUND');
