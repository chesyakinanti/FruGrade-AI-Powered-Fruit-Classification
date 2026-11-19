const fs = require('fs');

const files = ['index.html', 'upload.html', 'result.html'];
const newVersion = '40';

files.forEach(file => {
  let content = fs.readFileSync(file, 'utf8');
  // Replace ?v=\d+ with ?v=40
  content = content.replace(/\.js\?v=\d+/g, `.js?v=${newVersion}`);
  content = content.replace(/\.css\?v=\d+/g, `.css?v=${newVersion}`);
  fs.writeFileSync(file, content, 'utf8');
  console.log(`Updated ${file} to ?v=${newVersion}`);
});
