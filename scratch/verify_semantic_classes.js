const fs = require('fs');
const postcss = require('postcss');

const css = fs.readFileSync('assets/css/app.css', 'utf8');
const root = postcss.parse(css);

// Check custom classes from src/input.css
const customClasses = [
  '.shell',
  '.btn',
  '.btn-primary',
  '.btn-secondary',
  '.btn-ghost',
  '.panel',
  '.panel-flat',
  '.nav-link',
  '.chip',
  '.chip-fresh',
  '.chip-rotten',
  '.chip-error',
  '.chip-demo',
  '.chip-neutral',
  '.dot',
  '.icon',
  '.hairline',
  '.meta-row',
  '.section-label',
  '.skip-link'
];

console.log('--- Checking custom classes from src/input.css ---');
customClasses.forEach(cls => {
  let found = false;
  root.walkRules(r => {
    if (r.selector.includes(cls)) found = true;
  });
  console.log(`${cls}: ${found ? 'PRESENT' : 'MISSING'}`);
});

// Check theme custom colors from tailwind.config.js
const customColors = [
  'bg-strawberry-red',
  'bg-forest-green',
  'bg-peach-orange',
  'bg-sunny-yellow',
  'bg-leaf-green',
  'bg-warm-white',
  'bg-soft-charcoal',
  'bg-surface',
  'bg-secondary-container',
  'bg-primary-container'
];

console.log('\n--- Checking custom color utility classes ---');
customColors.forEach(cls => {
  const selector = '.' + cls;
  let found = false;
  root.walkRules(r => {
    if (r.selector.includes(selector)) found = true;
  });
  console.log(`${cls}: ${found ? 'PRESENT' : 'MISSING'}`);
});

// Check keyframes
console.log('\n--- Checking keyframes ---');
const keyframes = [];
root.walkAtRules('keyframes', k => keyframes.push(k.params));
console.log('Keyframes:', keyframes);

// Check media queries
console.log('\n--- Checking media queries ---');
const mediaQueries = new Set();
root.walkAtRules('media', m => mediaQueries.add(m.params));
console.log('Media queries:', Array.from(mediaQueries));
