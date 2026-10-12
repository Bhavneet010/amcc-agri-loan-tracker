import { chromium } from '/opt/node-tools/node_modules/playwright/index.mjs';
const dir = process.argv[2], out = process.argv[3];
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1280, height: 960 }, deviceScaleFactor: 2 });
for (const n of [1,2,3,4]) { await p.goto(`file://${dir}/${n}.html`); await p.waitForLoadState('networkidle').catch(()=>{}); await p.evaluate(() => document.fonts.ready); await p.screenshot({ path: `${out}/option-${n}.jpg`, type: 'jpeg', quality: 90 }); }
await b.close();
