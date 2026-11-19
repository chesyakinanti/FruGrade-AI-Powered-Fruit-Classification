const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');

const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const profileDir = path.join(__dirname, 'edge_temp_profile');

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function getTabs(port) {
  return new Promise((resolve, reject) => {
    http.get(`http://127.0.0.1:${port}/json`, res => {
      let data = '';
      res.on('data', d => data += d);
      res.on('end', () => resolve(JSON.parse(data)));
    }).on('error', reject);
  });
}

async function run() {
  const port = 9336;
  const edge = spawn(edgePath, [
    '--headless=new',
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profileDir}`,
    'http://localhost:4321/index.html?v=test'
  ]);

  try {
    await sleep(2500);
    const tabs = await getTabs(port);
    const target = tabs.find(t => t.url.includes('4321/index.html'));
    if (!target) throw new Error('Target tab not found');

    const ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
      ws.onopen = resolve;
      ws.onerror = reject;
    });

    let msgId = 1;
    function send(method, params = {}) {
      return new Promise(resolve => {
        const id = msgId++;
        const handler = e => {
          const data = JSON.parse(e.data);
          if (data.id === id) {
            ws.removeEventListener('message', handler);
            resolve(data.result);
          }
        };
        ws.addEventListener('message', handler);
        ws.send(JSON.stringify({ id, method, params }));
      });
    }

    await send('Runtime.enable');
    await send('Page.enable');
    await send('DOM.enable');

    console.log('--- 1. Checking Footer in ID (default) ---');
    const footerCheckID = await send('Runtime.evaluate', {
      expression: `(() => {
        const tagline = document.querySelector('[data-i18n="footer.tagline"]')?.textContent.trim();
        const copyright = document.querySelector('[data-i18n="footer.copyright"]')?.textContent.trim();
        const modelTitle = document.querySelector('[data-i18n="footer.modelTitle"]')?.textContent.trim();
        const fruitsTitle = document.querySelector('[data-i18n="footer.fruitsTitle"]')?.textContent.trim();
        const navTitle = document.querySelector('[data-i18n="footer.navTitle"]')?.textContent.trim();
        
        const fruits = Array.from(document.querySelectorAll('footer [data-i18n^="fruit."]')).map(el => el.textContent.trim());
        const navLinks = Array.from(document.querySelectorAll('footer a[data-i18n^="nav."]')).map(a => ({
          text: a.textContent.trim(),
          href: a.getAttribute('href')
        }));

        const modelSpecs = Array.from(document.querySelectorAll('footer ul.space-y-2 li')).map(li => li.innerText.replace(/\\n/g, ' ').trim());

        return {
          tagline,
          copyright,
          modelTitle,
          fruitsTitle,
          navTitle,
          fruits,
          navLinks,
          modelSpecs
        };
      })()`,
      returnByValue: true
    });
    console.log('ID Footer Check:', JSON.stringify(footerCheckID.result.value, null, 2));

    console.log('--- 2. Switching to EN ---');
    await send('Runtime.evaluate', {
      expression: `
        if (window.FG && window.FG.i18n && window.FG.i18n.setLang) {
          window.FG.i18n.setLang('en');
        }
      `
    });
    await sleep(400);

    const footerCheckEN = await send('Runtime.evaluate', {
      expression: `(() => {
        const tagline = document.querySelector('[data-i18n="footer.tagline"]')?.textContent.trim();
        const copyright = document.querySelector('[data-i18n="footer.copyright"]')?.textContent.trim();
        const fruits = Array.from(document.querySelectorAll('footer [data-i18n^="fruit."]')).map(el => el.textContent.trim());
        const navTitle = document.querySelector('[data-i18n="footer.navTitle"]')?.textContent.trim();
        const fruitsTitle = document.querySelector('[data-i18n="footer.fruitsTitle"]')?.textContent.trim();
        const modelTitle = document.querySelector('[data-i18n="footer.modelTitle"]')?.textContent.trim();

        return {
          tagline,
          copyright,
          navTitle,
          fruitsTitle,
          modelTitle,
          fruits
        };
      })()`,
      returnByValue: true
    });
    console.log('EN Footer Check:', JSON.stringify(footerCheckEN.result.value, null, 2));

    console.log('--- 3. Taking Desktop Screenshot of Footer ---');
    // Switch back to ID
    await send('Runtime.evaluate', {
      expression: `if (window.FG && window.FG.i18n && window.FG.i18n.setLang) { window.FG.i18n.setLang('id'); }`
    });
    await sleep(300);

    await send('Emulation.setDeviceMetricsOverride', {
      width: 1280,
      height: 900,
      deviceScaleFactor: 1,
      mobile: false
    });
    await send('Runtime.evaluate', {
      expression: `document.querySelector('footer').scrollIntoView({ block: 'end' });`
    });
    await sleep(500);

    const shotDesktop = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(__dirname, 'verified_footer_desktop.png'), Buffer.from(shotDesktop.data, 'base64'));
    console.log('Saved scratch/verified_footer_desktop.png');

    console.log('--- 4. Taking Mobile Screenshot of Footer ---');
    await send('Emulation.setDeviceMetricsOverride', {
      width: 375,
      height: 812,
      deviceScaleFactor: 2,
      mobile: true
    });
    await send('Runtime.evaluate', {
      expression: `document.querySelector('footer').scrollIntoView({ block: 'end' });`
    });
    await sleep(500);

    const shotMobile = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(__dirname, 'verified_footer_mobile.png'), Buffer.from(shotMobile.data, 'base64'));
    console.log('Saved scratch/verified_footer_mobile.png');

    console.log('--- 5. Checking upload.html and result.html footers ---');
    await send('Page.navigate', { url: 'http://localhost:4321/upload.html?v=test' });
    await sleep(1500);
    const uploadFooterCheck = await send('Runtime.evaluate', {
      expression: `(() => {
        return {
          tagline: document.querySelector('[data-i18n="footer.tagline"]')?.textContent.trim(),
          copyright: document.querySelector('[data-i18n="footer.copyright"]')?.textContent.trim()
        };
      })()`,
      returnByValue: true
    });
    console.log('upload.html Footer Check:', uploadFooterCheck.result.value);

    await send('Page.navigate', { url: 'http://localhost:4321/result.html?v=test' });
    await sleep(1500);
    const resultFooterCheck = await send('Runtime.evaluate', {
      expression: `(() => {
        return {
          tagline: document.querySelector('[data-i18n="footer.tagline"]')?.textContent.trim(),
          copyright: document.querySelector('[data-i18n="footer.copyright"]')?.textContent.trim()
        };
      })()`,
      returnByValue: true
    });
    console.log('result.html Footer Check:', resultFooterCheck.result.value);

    ws.close();
  } finally {
    edge.kill();
  }
}

run().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
