/**
 * Dev-only responsive audit.
 *
 * Launches headless Chrome, drives it over the DevTools Protocol (no deps - Node
 * ships a global WebSocket), and measures REAL horizontal overflow at several
 * viewport widths, on both the setup screen and a live session.
 *
 * Children of horizontally scrollable containers are excluded, since scrolling is
 * the intended behaviour there.
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = 9333;
const URL = 'http://localhost:4173/';
const OUT_DIR = path.join(import.meta.dirname, '..', '.resp-audit');

const VIEWPORTS = [
  { name: '320 phone', width: 320, height: 640, mobile: true },
  { name: '360 phone', width: 360, height: 740, mobile: true },
  { name: '390 phone', width: 390, height: 844, mobile: true },
  { name: '768 tablet', width: 768, height: 1024, mobile: false },
  { name: '1024 small laptop', width: 1024, height: 768, mobile: false },
  { name: '1440 desktop', width: 1440, height: 900, mobile: false }
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const MEASURE = `(() => {
  const vw = document.documentElement.clientWidth;
  const isInsideScroller = (el) => {
    let p = el.parentElement;
    while (p && p !== document.body) {
      const ox = getComputedStyle(p).overflowX;
      if (ox === 'auto' || ox === 'scroll') return true;
      p = p.parentElement;
    }
    return false;
  };
  const offenders = [];
  let scrollerKids = 0;
  for (const el of document.querySelectorAll('body *')) {
    const r = el.getBoundingClientRect();
    if (r.width < 1 && r.height < 1) continue;
    if (r.right > vw + 1 || r.left < -1) {
      if (isInsideScroller(el)) { scrollerKids += 1; continue; }
      offenders.push({
        tag: el.tagName.toLowerCase(),
        cls: String(el.className || '').slice(0, 80),
        left: Math.round(r.left), right: Math.round(r.right), w: Math.round(r.width)
      });
    }
  }
  return JSON.stringify({
    vw,
    docScrollW: document.documentElement.scrollWidth,
    pageOverflow: document.documentElement.scrollWidth > vw + 1,
    offenderCount: offenders.length,
    scrollerKids,
    offenders: offenders.slice(0, 8)
  });
})()`;

const CLICK_PRACTICE = `(() => {
  const b = [...document.querySelectorAll('button')].find((x) => /Practice Offline/i.test(x.textContent));
  if (!b) return 'not-found';
  b.click();
  return 'clicked';
})()`;

// Runtime health of the live chat: real messages rendered, console error count.
const CHAT_STATE = `(() => {
  const chat = document.querySelectorAll('[class*="rounded-2xl"] p');
  const texts = [...chat].map((p) => p.textContent.trim()).filter(Boolean);
  const customer = texts.filter((t) => /Hello, my name is/.test(t));
  return JSON.stringify({
    chatBubbles: texts.length,
    customerBubbles: customer.length,
    firstCustomer: customer[0] ? customer[0].slice(0, 80) : null,
    errorCount: (window.__auditErrors || []).length,
    errors: (window.__auditErrors || []).slice(0, 3)
  });
})()`;

// Error hook must be installed before the SPA boots, so reinstall on reload.
const INSTALL_HOOK = `(() => {
  if (window.__auditErrors) return 'already';
  window.__auditErrors = [];
  window.addEventListener('error', (e) => {
    window.__auditErrors.push(String(e.message || e.error || 'unknown error').slice(0, 120));
  });
  return 'installed';
})()`;

// --- minimal CDP client -------------------------------------------------------
class Cdp {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
    ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result);
      }
    });
  }
  send(method, params = {}) {
    const id = ++this.id;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error(`CDP timeout: ${method}`));
        }
      }, 20000);
    });
  }
  async evaluate(expression) {
    const res = await this.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    return res.result?.value;
  }
}

const GEOMETRY = `(() => {
  const header = document.querySelector('header');
  if (!header) return JSON.stringify({ error: 'no header' });
  const themeBtn = header.querySelector('button[aria-label^="Switch to"]');
  const hudLabel = [...header.querySelectorAll('p')].find((p) => /Live Quality Score/i.test(p.textContent));
  const rect = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); return { top: Math.round(r.top), left: Math.round(r.left), right: Math.round(r.right), h: Math.round(r.height) }; };
  const t = rect(themeBtn);
  const h = rect(hudLabel);
  return JSON.stringify({
    headerHeight: Math.round(header.getBoundingClientRect().height),
    headerScrollW: header.scrollWidth,
    headerClientW: header.clientWidth,
    themeToggle: t,
    hudLabel: h,
    sameRow: t && h ? Math.abs(t.top - h.top) < 30 : null
  });
})()`;

// --- driver -------------------------------------------------------------------
fs.mkdirSync(OUT_DIR, { recursive: true });
const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'resp-audit-'));

const chrome = spawn(CHROME, [
  '--headless=new',
  `--remote-debugging-port=${PORT}`,
  '--remote-allow-origins=*',
  `--user-data-dir=${userDataDir}`,
  '--no-first-run',
  '--no-default-browser-check',
  '--disable-gpu',
  '--hide-scrollbars',
  '--window-size=1440,900',
  URL
], { stdio: 'ignore' });

const cleanup = () => {
  try { chrome.kill(); } catch {}
  try { fs.rmSync(userDataDir, { recursive: true, force: true }); } catch {}
};

const waitForTarget = async () => {
  for (let i = 0; i < 60; i += 1) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json/list`);
      const list = await res.json();
      const page = list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
      if (page) return page;
    } catch {}
    await sleep(500);
  }
  throw new Error('Chrome DevTools endpoint never became available');
};

const main = async () => {
  const target = await waitForTarget();
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve);
    ws.addEventListener('error', () => reject(new Error('CDP websocket failed')));
  });

  const cdp = new Cdp(ws);
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');

  for (let i = 0; i < 40; i += 1) {
    if ((await cdp.evaluate('document.readyState')) === 'complete') break;
    await sleep(300);
  }
  await sleep(900);
  await cdp.evaluate(INSTALL_HOOK);

  const report = [];
  let failures = 0;

  const sweep = async (screen, label) => {
    console.log(`\n=== ${label} ===`);
    for (const vp of VIEWPORTS) {
      await cdp.send('Emulation.setDeviceMetricsOverride', {
        width: vp.width, height: vp.height, deviceScaleFactor: 1, mobile: vp.mobile
      });
      await sleep(500);
      const m = JSON.parse(await cdp.evaluate(MEASURE));
      const g = JSON.parse(await cdp.evaluate(GEOMETRY));
      const h = JSON.parse(await cdp.evaluate(CHAT_STATE));
      const bad = m.pageOverflow || m.offenderCount > 0;
      if (bad) failures += 1;
      console.log(
        `${bad ? 'FAIL' : 'PASS'}  ${vp.name.padEnd(18)} vw=${String(m.vw).padStart(4)} docScrollW=${String(m.docScrollW).padStart(4)} ` +
        `offenders=${m.offenderCount} scrollerKids=${m.scrollerKids} headerH=${g.headerHeight} sameRow=${g.sameRow} chat=${h.chatBubbles}/${h.customerBubbles} consoleErrors=${h.errorCount}`
      );
      for (const o of m.offenders) console.log(`        -> <${o.tag} class="${o.cls}"> w=${o.w} right=${o.right}`);
      report.push({ screen, vp: vp.name, ...m, headerHeight: g.headerHeight, sameRow: g.sameRow, chat: h });
    }
  };

  await sweep('setup', 'SETUP SCREEN');

  const clicked = await cdp.evaluate(CLICK_PRACTICE);
  await sleep(3000);
  const chatNow = JSON.parse(await cdp.evaluate(CHAT_STATE));
  console.log(`practice clicked: ${clicked} chatBubbles=${chatNow.chatBubbles} customerBubbles=${chatNow.customerBubbles} consoleErrors=${chatNow.errorCount}`);
  if (chatNow.errorCount > 0) console.log('  errors: ' + chatNow.errors.join(' | '));
  if (chatNow.customerBubbles === 0) {
    failures += 1;
    console.log('  FAIL: no customer greeting rendered after starting a practice session');
  }
  await sweep('session', `LIVE SESSION (practice: ${clicked})`);

  // Light theme at phone width must not overflow either.
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await cdp.evaluate(`document.querySelector('header button[aria-label^="Switch to"]')?.click()`);
  await sleep(800);
  const light = JSON.parse(await cdp.evaluate(MEASURE));
  const themeNow = await cdp.evaluate(`document.documentElement.classList.contains('dark') ? 'dark' : 'light'`);
  if (light.pageOverflow || light.offenderCount > 0) failures += 1;
  console.log(`\n=== LIGHT THEME @390 (theme=${themeNow}) ===`);
  console.log(`${light.pageOverflow || light.offenderCount ? 'FAIL' : 'PASS'}  offenders=${light.offenderCount} docScrollW=${light.docScrollW}`);
  for (const o of light.offenders) console.log(`        -> <${o.tag} class="${o.cls}"> w=${o.w} right=${o.right}`);

  const shot = await cdp.send('Page.captureScreenshot', { format: 'png' });
  const shotPath = path.join(OUT_DIR, 'session-390.png');
  fs.writeFileSync(shotPath, Buffer.from(shot.data, 'base64'));
  fs.writeFileSync(path.join(OUT_DIR, 'report.json'), JSON.stringify(report, null, 2));
  console.log(`\nscreenshot: ${shotPath}`);

  ws.close();
  cleanup();
  console.log(`\n${failures === 0 ? 'ALL VIEWPORTS CLEAN' : failures + ' viewport(s) with overflow'}`);
  process.exit(failures ? 1 : 0);
};

main().catch((err) => {
  console.error('audit failed:', err.message);
  cleanup();
  process.exit(2);
});
