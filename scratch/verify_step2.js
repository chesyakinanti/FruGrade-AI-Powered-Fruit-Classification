const { spawn } = require('child_process');
const http = require('http');
const path = require('path');
const fs = require('fs');

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
  const port = 9345;
  const edge = spawn(edgePath, [
    '--headless=new',
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profileDir}`,
    'http://localhost:4321/index.html?v=' + Date.now()
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

    await send('Page.enable');
    await send('DOM.enable');
    await send('Emulation.setDeviceMetricsOverride', {
      width: 1280,
      height: 900,
      deviceScaleFactor: 1,
      mobile: false
    });

    await sleep(1000);

    // Evaluate Step 02 content in Indonesian (default)
    const idStep2 = await send('Runtime.evaluate', {
      expression: `(() => {
        const section = document.querySelector('#how-it-works');
        const articles = section.querySelectorAll('article');
        const step2 = articles[1];
        return {
          text: step2.innerText,
          desc: step2.querySelector('[data-i18n="how.step2Desc"]').innerText,
          meta: step2.querySelector('[data-i18n="how.step2Meta"]').innerText
        };
      })()`,
      returnByValue: true
    });
    console.log('--- ID (Default) Step 02 Content ---');
    console.log(JSON.stringify(idStep2.result.value, null, 2));

    // Switch to English
    await send('Runtime.evaluate', {
      expression: `(() => {
        const btn = document.querySelector('[data-lang-btn="en"]') || document.querySelector('#lang-btn-en');
        if (btn) btn.click();
        else if (window.I18n && window.I18n.setLanguage) window.I18n.setLanguage('en');
      })()`
    });
    await sleep(500);

    const enStep2 = await send('Runtime.evaluate', {
      expression: `(() => {
        const section = document.querySelector('#how-it-works');
        const articles = section.querySelectorAll('article');
        const step2 = articles[1];
        return {
          desc: step2.querySelector('[data-i18n="how.step2Desc"]').innerText,
          meta: step2.querySelector('[data-i18n="how.step2Meta"]').innerText
        };
      })()`,
      returnByValue: true
    });
    console.log('--- EN Step 02 Content ---');
    console.log(JSON.stringify(enStep2.result.value, null, 2));

    // Switch back to Indonesian
    await send('Runtime.evaluate', {
      expression: `(() => {
        if (window.I18n && window.I18n.setLanguage) window.I18n.setLanguage('id');
      })()`
    });
    await sleep(500);

    // Scroll to #how-it-works and take screenshot
    await send('Runtime.evaluate', {
      expression: `document.querySelector('#how-it-works').scrollIntoView({ behavior: 'instant', block: 'center' });`
    });
    await sleep(500);

    const shot = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(__dirname, 'how_it_works_verified.png'), Buffer.from(shot.data, 'base64'));
    console.log('Screenshot saved to scratch/how_it_works_verified.png');

    // Mobile emulation
    await send('Emulation.setDeviceMetricsOverride', {
      width: 375,
      height: 812,
      deviceScaleFactor: 2,
      mobile: true
    });
    await sleep(500);
    await send('Runtime.evaluate', {
      expression: `document.querySelectorAll('#how-it-works article')[1].scrollIntoView({ behavior: 'instant', block: 'center' });`
    });
    await sleep(500);
    const mobileShot = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(__dirname, 'how_it_works_mobile_verified.png'), Buffer.from(mobileShot.data, 'base64'));
    console.log('Mobile screenshot saved to scratch/how_it_works_mobile_verified.png');

    ws.close();
  } finally {
    edge.kill();
  }
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
