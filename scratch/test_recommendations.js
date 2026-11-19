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
  const port = 9348;
  const edge = spawn(edgePath, [
    '--headless=new',
    '--window-size=1280,900',
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profileDir}`,
    'http://localhost:4321/result.html'
  ]);

  try {
    await sleep(2500);
    const tabs = await getTabs(port);
    const target = tabs.find(t => t.url.includes('4321/result.html'));
    if (!target) throw new Error('Target tab not found');

    const ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
      ws.onopen = resolve;
      ws.onerror = reject;
    });

    let msgId = 1;
    ws.addEventListener('message', evt => {
      const resp = JSON.parse(evt.data);
      if (resp.method === 'Runtime.consoleAPICalled') {
        console.log('BROWSER CONSOLE:', resp.params.args.map(a => a.value));
      }
      if (resp.method === 'Runtime.exceptionThrown') {
        console.error('BROWSER EXCEPTION:', resp.params.exceptionDetails);
      }
    });
    await send('Runtime.enable');
    await send('Page.enable');
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

    // 1. Test Fresh Fruit (Tomato Fresh)
    console.log('--- Test 1: Fresh Tomato Result ---');
    await evalCode(`(() => {
      window.FG.i18n.setLang('id');
      const freshPayload = {
        at: new Date().toISOString(),
        image: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
        result: {
          label: 'FreshTomato',
          confidence: 0.95,
          freshness: 'fresh',
          fruit: 'tomato',
          mock: false,
          latency_ms: 80,
          probabilities: [
            { label: 'FreshTomato', p: 0.95 },
            { label: 'RottenTomato', p: 0.05 }
          ]
        }
      };
      sessionStorage.setItem('frugrade:last-result', JSON.stringify(freshPayload));
    })()`);

    await send('Page.reload');
    await sleep(2000);

    const freshDom = await evalCode(`(() => {
      const card = document.getElementById('recommendation-card');
      const badgeTitle = document.getElementById('recom-badge-title');
      const statusTag = document.getElementById('recom-status-tag');
      const actionTitle = document.getElementById('recom-action-title');
      const tipTitle = document.getElementById('recom-tip-title');
      const tipDesc = document.getElementById('recom-tip-desc');
      return {
        cardVisible: card ? !card.hidden : false,
        badgeTitle: badgeTitle ? badgeTitle.textContent.trim() : '',
        statusTag: statusTag ? statusTag.textContent.trim() : '',
        actionTitle: actionTitle ? actionTitle.textContent.trim() : '',
        tipTitle: tipTitle ? tipTitle.textContent.trim() : '',
        tipDesc: tipDesc ? tipDesc.textContent.trim() : ''
      };
    })()`);

    console.log('Fresh Tomato Card:', freshDom);
    if (!freshDom.cardVisible) throw new Error('Recommendation card must be visible');
    if (freshDom.statusTag !== 'Konsumsi Aman') throw new Error('Expected "Konsumsi Aman", got: ' + freshDom.statusTag);
    if (!freshDom.tipDesc.includes('suhu ruang')) throw new Error('Expected storage tip to mention "suhu ruang" for tomato');

    // Scroll fresh card into view
    await evalCode(`document.getElementById('recommendation-card').scrollIntoView({ block: 'center' })`);
    await sleep(400);
    const shotFresh = await send('Page.captureScreenshot', { format: 'png' });
    const fs = require('fs');
    fs.writeFileSync(path.join(__dirname, 'recom_fresh_fixed.png'), Buffer.from(shotFresh.data, 'base64'));
    console.log('Fresh screenshot saved to scratch/recom_fresh_fixed.png');

    // 2. Test Rotten Fruit (Tomato Rotten)
    console.log('--- Test 2: Rotten Tomato Result ---');
    await evalCode(`(() => {
      const rottenPayload = {
        at: new Date().toISOString(),
        image: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
        result: {
          label: 'RottenTomato',
          confidence: 0.99,
          freshness: 'rotten',
          fruit: 'tomato',
          mock: false,
          latency_ms: 90,
          probabilities: [
            { label: 'RottenTomato', p: 0.99 },
            { label: 'FreshTomato', p: 0.01 }
          ]
        }
      };
      sessionStorage.setItem('frugrade:last-result', JSON.stringify(rottenPayload));
    })()`);

    await send('Page.reload');
    await sleep(2000);

    const rottenDom = await evalCode(`(() => {
      const badgeTitle = document.getElementById('recom-badge-title');
      const statusTag = document.getElementById('recom-status-tag');
      const actionTitle = document.getElementById('recom-action-title');
      const tipTitle = document.getElementById('recom-tip-title');
      const tipDesc = document.getElementById('recom-tip-desc');
      return {
        badgeTitle: badgeTitle ? badgeTitle.textContent.trim() : '',
        statusTag: statusTag ? statusTag.textContent.trim() : '',
        actionTitle: actionTitle ? actionTitle.textContent.trim() : '',
        tipTitle: tipTitle ? tipTitle.textContent.trim() : '',
        tipDesc: tipDesc ? tipDesc.textContent.trim() : ''
      };
    })()`);

    console.log('Rotten Tomato Card (ID):', rottenDom);
    if (rottenDom.statusTag !== 'Hindari Konsumsi') throw new Error('Expected "Hindari Konsumsi", got: ' + rottenDom.statusTag);
    if (!rottenDom.tipDesc.includes('sampah organik') && !rottenDom.tipDesc.includes('Pisahkan')) {
      throw new Error('Expected rotten handling tip');
    }

    // 3. Test Bilingual Switch to EN
    console.log('--- Test 3: Bilingual Switch to EN ---');
    await evalCode(`window.FG.i18n.setLang('en')`);
    await sleep(300);

    const enDom = await evalCode(`(() => {
      const badgeTitle = document.getElementById('recom-badge-title');
      const statusTag = document.getElementById('recom-status-tag');
      const actionTitle = document.getElementById('recom-action-title');
      const tipTitle = document.getElementById('recom-tip-title');
      const tipDesc = document.getElementById('recom-tip-desc');
      return {
        badgeTitle: badgeTitle ? badgeTitle.textContent.trim() : '',
        statusTag: statusTag ? statusTag.textContent.trim() : '',
        actionTitle: actionTitle ? actionTitle.textContent.trim() : '',
        tipTitle: tipTitle ? tipTitle.textContent.trim() : '',
        tipDesc: tipDesc ? tipDesc.textContent.trim() : ''
      };
    })()`);

    console.log('Rotten Tomato Card (EN):', enDom);
    if (enDom.statusTag !== 'Do Not Consume') throw new Error('Expected "Do Not Consume", got: ' + enDom.statusTag);
    if (enDom.badgeTitle !== 'Food Safety & Handling Advice') throw new Error('Expected "Food Safety & Handling Advice", got: ' + enDom.badgeTitle);

    // Scroll card into view
    await evalCode(`document.getElementById('recommendation-card').scrollIntoView({ block: 'center' })`);
    await sleep(400);

    // Capture screenshot of the card to verify icons render visually
    const shot = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(__dirname, 'recom_fixed.png'), Buffer.from(shot.data, 'base64'));
    console.log('Screenshot saved to scratch/recom_fixed.png');

    console.log('ALL RECOMMENDATION TESTS PASSED 100%!');
  } finally {
    edge.kill();
  }
}

run().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
