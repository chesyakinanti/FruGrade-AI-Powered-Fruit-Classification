const fs = require('fs');
const content = fs.readFileSync('assets/js/i18n.js', 'utf8');
const lines = content.split('\n');
console.log(lines.slice(560).join('\n'));
