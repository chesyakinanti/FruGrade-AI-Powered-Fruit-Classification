const { spawn } = require('child_process');
const http = require('http');
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
  const port = 9345;
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

    // Set lang to ID
    await evalCode(`window.FG.i18n.setLang('id')`);
    await sleep(200);

    // Simulate uploading a corrupted file
    console.log('--- Simulating Corrupted File Upload ---');
    await evalCode(`(async () => {
      const input = document.getElementById('file-input');
      const fakeCorruptBlob = new Blob(['not a valid jpeg binary content at all corrupt 123456789'], { type: 'image/jpeg' });
      const fakeFile = new File([fakeCorruptBlob], 'Test_Gambar_Rusak.jpg', { type: 'image/jpeg' });
      
      const dt = new DataTransfer();
      dt.items.add(fakeFile);
      input.files = dt.files;
      input.dispatchEvent(new Event('change'));
    })()`);

    await sleep(500);

    const domState = await evalCode(`(() => {
      const errorPanel = document.getElementById('error-panel');
      const errorTitle = document.getElementById('error-title');
      const errorCode = document.getElementById('error-code');
      const errorMsg = document.getElementById('error-message');
      const previewFilled = document.getElementById('preview-filled');
      const previewEmpty = document.getElementById('preview-empty');
      const analyzeBtn = document.getElementById('analyze-btn');

      return {
        errorVisible: errorPanel ? (!errorPanel.hidden && !errorPanel.classList.contains('is-hidden')) : false,
        errorTitle: errorTitle ? errorTitle.textContent.trim() : '',
        errorCode: errorCode ? errorCode.textContent.trim() : '',
        errorMsg: errorMsg ? errorMsg.textContent.trim() : '',
        previewFilledVisible: previewFilled ? (!previewFilled.hidden && !previewFilled.classList.contains('is-hidden')) : false,
        previewEmptyVisible: previewEmpty ? (!previewEmpty.hidden && !previewEmpty.classList.contains('is-hidden')) : false,
        btnDisabled: analyzeBtn ? analyzeBtn.disabled : false
      };
    })()`);

    console.log('DOM State after corrupt upload (ID):', domState);

    // Assertions
    if (!domState.errorVisible) throw new Error('Error panel should be visible');
    if (domState.errorCode !== 'UNREADABLE_IMAGE') throw new Error('Error code should be UNREADABLE_IMAGE');
    if (domState.errorTitle !== 'Berkas tidak valid') throw new Error('Error title should be "Berkas tidak valid"');
    if (!domState.errorMsg.includes('rusak atau korup')) throw new Error('Error message must mention "rusak atau korup"');
    if (domState.previewFilledVisible) throw new Error('Preview filled must NOT be visible');
    if (!domState.previewEmptyVisible) throw new Error('Preview empty MUST be visible');
    if (!domState.btnDisabled) throw new Error('Analyze button MUST be disabled');

    // Test Lang switch to EN
    console.log('--- Switching Language to EN ---');
    await evalCode(`window.FG.i18n.setLang('en')`);
    await sleep(200);

    const enState = await evalCode(`(() => {
      const errorTitle = document.getElementById('error-title');
      const errorCode = document.getElementById('error-code');
      const errorMsg = document.getElementById('error-message');
      return {
        errorTitle: errorTitle ? errorTitle.textContent.trim() : '',
        errorCode: errorCode ? errorCode.textContent.trim() : '',
        errorMsg: errorMsg ? errorMsg.textContent.trim() : ''
      };
    })()`);

    console.log('DOM State after corrupt upload (EN):', enState);
    if (enState.errorTitle !== 'Invalid file') throw new Error('Error title EN should be "Invalid file"');
    if (!enState.errorMsg.includes('damaged or corrupted')) throw new Error('Error message EN must mention "damaged or corrupted"');

    // Test File Too Large (>10MB)
    console.log('--- Simulating File Too Large (>10MB) ---');
    await evalCode(`window.FG.i18n.setLang('id')`);
    await evalCode(`(async () => {
      const input = document.getElementById('file-input');
      const largeBlob = new Blob([new Uint8Array(11 * 1024 * 1024)], { type: 'image/png' });
      const largeFile = new File([largeBlob], 'Test_Gambar_12MB.png', { type: 'image/png' });
      const dt = new DataTransfer();
      dt.items.add(largeFile);
      input.files = dt.files;
      input.dispatchEvent(new Event('change'));
    })()`);
    await sleep(400);

    const largeState = await evalCode(`(() => {
      const errorTitle = document.getElementById('error-title');
      const errorCode = document.getElementById('error-code');
      const errorMsg = document.getElementById('error-message');
      const previewEmpty = document.getElementById('preview-empty');
      const analyzeBtn = document.getElementById('analyze-btn');
      return {
        errorTitle: errorTitle ? errorTitle.textContent.trim() : '',
        errorCode: errorCode ? errorCode.textContent.trim() : '',
        errorMsg: errorMsg ? errorMsg.textContent.trim() : '',
        previewEmpty: previewEmpty ? !previewEmpty.hidden : false,
        btnDisabled: analyzeBtn ? analyzeBtn.disabled : false
      };
    })()`);
    console.log('DOM State after large file upload:', largeState);
    if (largeState.errorCode !== 'FILE_TOO_LARGE') throw new Error('Expected FILE_TOO_LARGE');
    if (!largeState.btnDisabled) throw new Error('Analyze btn must be disabled');

    // Test Invalid Non-Image Format (.pdf)
    console.log('--- Simulating Invalid Non-Image Format (.pdf) ---');
    await evalCode(`(async () => {
      const input = document.getElementById('file-input');
      const pdfBlob = new Blob(['%PDF-1.4 test dummy content'], { type: 'application/pdf' });
      const pdfFile = new File([pdfBlob], 'Dokumen_Laporan.pdf', { type: 'application/pdf' });
      const dt = new DataTransfer();
      dt.items.add(pdfFile);
      input.files = dt.files;
      input.dispatchEvent(new Event('change'));
    })()`);
    await sleep(400);

    const pdfState = await evalCode(`(() => {
      const errorTitle = document.getElementById('error-title');
      const errorCode = document.getElementById('error-code');
      const errorMsg = document.getElementById('error-message');
      const previewEmpty = document.getElementById('preview-empty');
      const analyzeBtn = document.getElementById('analyze-btn');
      return {
        errorTitle: errorTitle ? errorTitle.textContent.trim() : '',
        errorCode: errorCode ? errorCode.textContent.trim() : '',
        errorMsg: errorMsg ? errorMsg.textContent.trim() : '',
        previewEmpty: previewEmpty ? !previewEmpty.hidden : false,
        btnDisabled: analyzeBtn ? analyzeBtn.disabled : false
      };
    })()`);
    console.log('DOM State after PDF file upload:', pdfState);
    if (pdfState.errorCode !== 'INVALID_FORMAT') throw new Error('Expected INVALID_FORMAT');
    if (!pdfState.btnDisabled) throw new Error('Analyze btn must be disabled');

    console.log('ALL ASSERTIONS PASSED 100%!');
  } finally {
    edge.kill();
  }
}

run().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
