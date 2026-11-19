const http = require('http');

['index.html', 'upload.html', 'result.html'].forEach(page => {
  http.get('http://localhost:4321/' + page, res => {
    let d = '';
    res.on('data', c => d += c);
    res.on('end', () => {
      const m = d.match(/data-i18n="footer\.copyright">([^<]+)</);
      console.log(page, 'served:', m ? m[1] : 'null');
    });
  });
});
