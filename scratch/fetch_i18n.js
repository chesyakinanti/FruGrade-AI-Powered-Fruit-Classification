const http = require('http');

http.get('http://localhost:4321/assets/js/i18n.js?v=35', res => {
  let d = '';
  res.on('data', c => d += c);
  res.on('end', () => {
    const lines = d.split('\n');
    lines.forEach((l, i) => {
      if (l.includes('footer.copyright')) {
        console.log('Served i18n line', (i+1), l.trim());
      }
    });
  });
});
