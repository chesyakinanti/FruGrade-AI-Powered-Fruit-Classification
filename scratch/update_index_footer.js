const fs = require('fs');

let content = fs.readFileSync('index.html', 'utf8');
const footerStart = content.indexOf('<!-- ================= MODERN ELEVATED FOOTER ================= -->');
const footerEnd = content.indexOf('<!-- ================= MOBILE NAV ================= -->');

if (footerStart === -1 || footerEnd === -1) {
  console.error('Marker not found in index.html');
  process.exit(1);
}

const uploadContent = fs.readFileSync('upload.html', 'utf8');
const upStart = uploadContent.indexOf('<!-- ================= MODERN ELEVATED FOOTER ================= -->');
const upEnd = uploadContent.indexOf('<!-- ================= MOBILE NAV ================= -->');

if (upStart === -1 || upEnd === -1) {
  console.error('Marker not found in upload.html');
  process.exit(1);
}

let newFooter = uploadContent.substring(upStart, upEnd);
// In index.html, anchors to sections on the same page can be #how-it-works and #fun-fact
newFooter = newFooter.replace('href="index.html#how-it-works"', 'href="#how-it-works"');
newFooter = newFooter.replace('href="index.html#fun-fact"', 'href="#fun-fact"');

content = content.substring(0, footerStart) + newFooter + content.substring(footerEnd);
fs.writeFileSync('index.html', content, 'utf8');
console.log('Successfully updated index.html footer!');
