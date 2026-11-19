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
  const port = 9341;
  const edge = spawn(edgePath, [
    '--headless=new',
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profileDir}`,
    'http://localhost:4321/upload.html'
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
      return new Promise((resolve) => {
        const id = msgId++;
        const handler = (evt) => {
          const resp = JSON.parse(evt.data);
          if (resp.id === id) {
            ws.removeEventListener('message', handler);
            resolve(resp.result);
          }
        };
        ws.addEventListener('message', handler);
        ws.send(JSON.stringify({ id, method, params }));
      });
    }

    async function evalCode(expression) {
      const res = await send('Runtime.evaluate', {
        expression,
        returnByValue: true,
        awaitPromise: true
      });
      if (res.exceptionDetails) {
        throw new Error('Eval error: ' + JSON.stringify(res.exceptionDetails));
      }
      return res.result ? res.result.value : undefined;
    }

    console.log('1. Check mode state in UI...');
    const modeState = await evalCode(`(() => {
      const demoOnlyBadge = document.querySelector('[data-demo-only]');
      const cfg = window.FG.config;
      return {
        mode: cfg.mode,
        apiBase: cfg.apiBase,
        demoBadgeHidden: demoOnlyBadge ? (demoOnlyBadge.hidden || demoOnlyBadge.classList.contains('is-hidden')) : true
      };
    })()`);
    console.log('Mode state:', modeState);
    if (modeState.mode !== 'live') throw new Error('Mode should be live');
    if (!modeState.demoBadgeHidden) throw new Error('Demo banner should be hidden in live mode');

    console.log('2. Upload strawberry.jpg from disk...');
    // Load strawberry image via sampleFile or file upload
    await evalCode(`(async () => {
      const resp = await fetch('assets/img/strawberry.jpg');
      const blob = await resp.blob();
      const file = new File([blob], 'strawbery_test.jpg', { type: 'image/jpeg' });
      const dt = new DataTransfer();
      dt.items.add(file);
      const input = document.getElementById('file-input');
      input.files = dt.files;
      input.dispatchEvent(new Event('change', { bubbles: true }));
    })()`);
    await sleep(1000);

    console.log('3. Click Pindai Buah...');
    await evalCode(`document.getElementById('analyze-btn').click()`);

    console.log('4. Waiting for live model prediction...');
    await sleep(4000);

    const currentUrl = await evalCode(`window.location.href`);
    console.log('Current URL after scan:', currentUrl);
    if (!currentUrl.includes('result.html')) throw new Error('Expected redirect to result.html, got ' + currentUrl);

    const resultData = await evalCode(`(() => {
      const stored = window.FG.store.load();
      return {
        result: stored ? stored.result : null,
        fruitText: document.getElementById('fruit-name') ? document.getElementById('fruit-name').textContent.trim() : ''
      };
    })()`);

    console.log('Live Result Data:', resultData);
    if (!resultData.result) throw new Error('No result stored in session');
    if (resultData.result.mock !== false) throw new Error('Expected mock to be false for real model');
    console.log('Model used:', resultData.result.model);
    console.log('Predicted label:', resultData.result.label);
    console.log('Confidence:', resultData.result.confidence);
    console.log('Latency ms:', resultData.result.latency_ms);

    console.log('\n>>> LIVE CNN MODEL PREDICTION TEST PASSED 100%! <<<\n');
    ws.close();
  } finally {
    edge.kill();
  }
}

run().catch(err => {
  console.error('LIVE TEST FAILED:', err);
  process.exit(1);
});
