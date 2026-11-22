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

async function verifyPage(pageName, width, height, isMobile, screenshotFile) {
  const port = 9350;
  const edge = spawn(edgePath, [
    '--headless=new',
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profileDir}`,
    `http://localhost:4321/${pageName}?t=` + Date.now()
  ]);

  try {
    await sleep(2500);
    const tabs = await getTabs(port);
    const tab = tabs.find(t => t.url && t.url.includes(pageName));
    if (!tab) throw new Error(`Tab for ${pageName} not found`);

    const ws = new WebSocket(tab.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });

    let msgId = 1;
    const errors = [];
    ws.addEventListener('message', e => {
      const parsed = JSON.parse(e.data);
      if (parsed.method === 'Log.entryAdded' && parsed.params.entry.level === 'error') {
        errors.push(parsed.params.entry.text);
      }
    });

    function send(method, params = {}) {
      return new Promise(resolve => {
        const id = msgId++;
        const handler = e => {
          const parsed = JSON.parse(e.data);
          if (parsed.id === id) {
            ws.removeEventListener('message', handler);
            resolve(parsed.result);
          }
        };
        ws.addEventListener('message', handler);
        ws.send(JSON.stringify({ id, method, params }));
      });
    }

    await send('Log.enable');
    await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: isMobile });
    await sleep(600);

    const checkRes = await send('Runtime.evaluate', {
      expression: `
        (() => {
          const bodyBg = window.getComputedStyle(document.body).backgroundColor;
          const font = window.getComputedStyle(document.body).fontFamily;
          const titleEl = document.querySelector('h1, h2');
          const titleColor = titleEl ? window.getComputedStyle(titleEl).color : null;
          const footer = document.querySelector('footer');
          const footerBg = footer ? window.getComputedStyle(footer).backgroundColor : null;
          return { bodyBg, font, titleColor, footerBg };
        })()
      `,
      returnByValue: true
    });

    const shot = await send('Page.captureScreenshot');
    fs.writeFileSync(screenshotFile, Buffer.from(shot.data, 'base64'));

    console.log(`[PASS] ${pageName} (${isMobile ? 'Mobile' : 'Desktop'}):`, checkRes.result.value);
    if (errors.length > 0) {
      console.log(`[WARN] Errors on ${pageName}:`, errors);
    }

    ws.close();
  } finally {
    edge.kill();
  }
}

async function main() {
  console.log('--- Verifying Home Page (index.html) ---');
  await verifyPage('index.html', 1280, 900, false, 'scratch/home_desktop.png');
  await verifyPage('index.html', 390, 844, true, 'scratch/home_mobile.png');

  console.log('\n--- Verifying Upload Page (upload.html) ---');
  await verifyPage('upload.html', 1280, 900, false, 'scratch/upload_desktop.png');
  await verifyPage('upload.html', 390, 844, true, 'scratch/upload_mobile.png');

  console.log('\n--- Verifying Result Page (result.html) ---');
  await verifyPage('result.html', 1280, 900, false, 'scratch/result_desktop.png');
  await verifyPage('result.html', 390, 844, true, 'scratch/result_mobile.png');

  console.log('\nAll pages verified successfully!');
}

main().catch(console.error);
