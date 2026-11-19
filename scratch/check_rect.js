const { spawn } = require('child_process');
const http = require('http');
const path = require('path');
const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const profileDir = path.join(__dirname, 'edge_temp_profile');
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
async function main() {
  const edge = spawn(edgePath, ['--headless=new', '--remote-debugging-port=9340', '--user-data-dir=' + profileDir, 'http://localhost:4321/upload.html']);
  try {
    await sleep(2000);
    const tabs = await new Promise((res, rej) => http.get('http://127.0.0.1:9340/json', r => {
      let d = ''; r.on('data', c => d += c); r.on('end', () => res(JSON.parse(d)));
    }).on('error', rej));
    const target = tabs.find(t => t.url.includes('4321/index.html'));
    const ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise(r => ws.onopen = r);
    let id = 1;
    function send(m, p = {}) {
      return new Promise(res => {
        const i = id++;
        const h = e => { const d = JSON.parse(e.data); if (d.id === i) { ws.removeEventListener('message', h); res(d.result); } };
        ws.addEventListener('message', h);
        ws.send(JSON.stringify({ id: i, method: m, params: p }));
      });
    }
    await send('Runtime.enable');
    await send('Emulation.setDeviceMetricsOverride', { width: 375, height: 812, deviceScaleFactor: 2, mobile: true });
    await sleep(500);
    await send('Runtime.evaluate', {
      expression: `
        window.scrollTo(0, 7800);
      `
    });
    await sleep(600);
    const fs = require('fs');
    const shot = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(__dirname, 'verified_mobile_bottommost.png'), Buffer.from(shot.data, 'base64'));
    const scrollInfo = await send('Runtime.evaluate', {
      expression: `({
        scrollY: window.scrollY,
        footerTop: document.querySelector('footer').offsetTop,
        footerHeight: document.querySelector('footer').offsetHeight,
        bodyH: document.body.scrollHeight
      })`,
      returnByValue: true
    });
    console.log('Scroll Info:', scrollInfo.result.value);
    ws.close();
  } finally { edge.kill(); }
}
main().catch(console.error);
