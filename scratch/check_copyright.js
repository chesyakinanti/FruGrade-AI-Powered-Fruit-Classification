const fs = require('fs');
['index.html', 'upload.html', 'result.html'].forEach(f => {
  const c = fs.readFileSync(f, 'utf8');
  const m = c.match(/data-i18n="footer\.copyright">([^<]+)</);
  console.log(f, '=>', m ? m[1] : 'NOT FOUND');
});
