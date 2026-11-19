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
  const port = 9335;
  const edge = spawn(edgePath, [
    '--headless=new',
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profileDir}`,
    'http://localhost:4321/upload.html?v=test'
  ]);

  try {
    await sleep(2500);
    const tabs = await getTabs(port);
    const target = tabs.find(t => t.url.includes('4321/upload.html'));
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

    console.log('--- 1. Switching to camera tab ---');
    await send('Runtime.evaluate', {
      expression: `document.getElementById('tab-camera').click();`
    });
    await sleep(500);

    console.log('--- 2. Checking camera elements and initial state ---');
    const initCheck = await send('Runtime.evaluate', {
      expression: `(() => {
        const video = document.getElementById('camera-video');
        const chip = document.getElementById('camera-mirror-chip');
        const chipLabel = document.getElementById('camera-mirror-label');
        const btnMirror = document.getElementById('btn-mirror-camera');
        const btnFlip = document.getElementById('btn-flip-camera');
        return {
          videoFound: !!video,
          chipFound: !!chip,
          chipLabelText: chipLabel ? chipLabel.textContent.trim() : null,
          btnMirrorFound: !!btnMirror,
          btnFlipFound: !!btnFlip,
          videoTransform: video ? video.style.transform : null,
          storage: localStorage.getItem('frugrade_camera_mirrored')
        };
      })()`,
      returnByValue: true
    });
    console.log('Init check result:', initCheck.result.value);

    console.log('--- 3. Clicking #btn-mirror-camera to toggle mirror ON ---');
    await send('Runtime.evaluate', {
      expression: `document.getElementById('btn-mirror-camera').click();`
    });
    await sleep(300);

    const mirrorOnCheck = await send('Runtime.evaluate', {
      expression: `(() => {
        const video = document.getElementById('camera-video');
        const chipLabel = document.getElementById('camera-mirror-label');
        const btnMirror = document.getElementById('btn-mirror-camera');
        return {
          videoTransform: video ? video.style.transform : null,
          chipLabelText: chipLabel ? chipLabel.textContent.trim() : null,
          btnPressed: btnMirror ? btnMirror.getAttribute('aria-pressed') : null,
          storage: localStorage.getItem('frugrade_camera_mirrored')
        };
      })()`,
      returnByValue: true
    });
    console.log('Mirror ON check result:', mirrorOnCheck.result.value);

    console.log('--- 4. Clicking #camera-mirror-chip to toggle mirror OFF ---');
    await send('Runtime.evaluate', {
      expression: `document.getElementById('camera-mirror-chip').click();`
    });
    await sleep(300);

    const mirrorOffCheck = await send('Runtime.evaluate', {
      expression: `(() => {
        const video = document.getElementById('camera-video');
        const chipLabel = document.getElementById('camera-mirror-label');
        const btnMirror = document.getElementById('btn-mirror-camera');
        return {
          videoTransform: video ? video.style.transform : null,
          chipLabelText: chipLabel ? chipLabel.textContent.trim() : null,
          btnPressed: btnMirror ? btnMirror.getAttribute('aria-pressed') : null,
          storage: localStorage.getItem('frugrade_camera_mirrored')
        };
      })()`,
      returnByValue: true
    });
    console.log('Mirror OFF check result:', mirrorOffCheck.result.value);

    console.log('--- 5. Switching language to EN and checking mirror labels ---');
    await send('Runtime.evaluate', {
      expression: `
        if (window.FG && window.FG.i18n && window.FG.i18n.setLang) {
          window.FG.i18n.setLang('en');
        }
      `
    });
    await sleep(400);

    const enCheck = await send('Runtime.evaluate', {
      expression: `(() => {
        const chipLabel = document.getElementById('camera-mirror-label');
        const btnMirror = document.getElementById('btn-mirror-camera');
        return {
          chipLabelText: chipLabel ? chipLabel.textContent.trim() : null,
          btnText: btnMirror ? btnMirror.innerText.trim() : null
        };
      })()`,
      returnByValue: true
    });
    console.log('EN check result:', enCheck.result.value);

    console.log('--- 6. Taking screenshot of camera UI ---');
    await send('Emulation.setDeviceMetricsOverride', {
      width: 1280,
      height: 900,
      deviceScaleFactor: 1,
      mobile: false
    });
    await send('Runtime.evaluate', {
      expression: `
        document.getElementById('view-camera').scrollIntoView({ block: 'center' });
      `
    });
    await sleep(400);
    const screenshot = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(__dirname, 'verified_camera_mirror.png'), Buffer.from(screenshot.data, 'base64'));
    console.log('Screenshot saved to scratch/verified_camera_mirror.png');

    ws.close();
  } finally {
    edge.kill();
  }
}

run().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
