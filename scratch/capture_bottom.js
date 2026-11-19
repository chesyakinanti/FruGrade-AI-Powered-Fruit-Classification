const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');

const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const profileDir = path.join(__dirname, 'edge_temp_profile');

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
async function getTabs(port) {
  for (let i = 0; i < 10; i++) {
    try {
      const data = await new Promise((resolve, reject) => {
        http.get('http://127.0.0.1:' + port + '/json', res => {
          let d = ''; res.on('data', chunk => d += chunk);
          res.on('end', () => resolve(JSON.parse(d)));
        }).on('error', reject);
      });
      return data;
    } catch (e) {
      await sleep(500);
    }
  }
  throw new Error('Failed to connect to CDP');
}

async function main() {
  const port = 9338;
  const edge = spawn(edgePath, [
    '--headless=new',
    '--remote-debugging-port=' + port,
    '--user-data-dir=' + profileDir,
    'http://localhost:4321/index.html'
  ]);
  try {
    const tabs = await getTabs(port);
    const target = tabs.find(t => t.url.includes('4321/index.html'));
    const ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise(r => ws.onopen = r);
    let msgId = 1;
    function send(method, params = {}) {
      return new Promise(resolve => {
        const id = msgId++;
        const handler = e => {
          const data = JSON.parse(e.data);
          if (data.id === id) { ws.removeEventListener('message', handler); resolve(data.result); }
        };
        ws.addEventListener('message', handler);
        ws.send(JSON.stringify({ id, method, params }));
      });
    }
    await send('Runtime.enable');
    await send('Page.enable');

    // Desktop
    await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
    await send('Runtime.evaluate', { expression: `document.querySelector('footer .border-t').scrollIntoView({ block: 'center', inline: 'nearest' });` });
    await sleep(600);
    const shot = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(__dirname, 'verified_bottom_desktop.png'), Buffer.from(shot.data, 'base64'));

    // Mobile
    await send('Emulation.setDeviceMetricsOverride', { width: 375, height: 812, deviceScaleFactor: 2, mobile: true });
    await send('Runtime.evaluate', { expression: `document.querySelector('[data-i18n="footer.copyright"]').scrollIntoView({ block: 'center' });` });
    await sleep(600);
    const shotM = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(__dirname, 'verified_bottom_mobile.png'), Buffer.from(shotM.data, 'base64'));

    console.log('Screenshots saved successfully');
    ws.close();
  } finally {
    edge.kill();
  }
}
main().catch(console.error);
