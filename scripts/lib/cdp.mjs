// A small Chrome DevTools Protocol driver for headless Chrome, used by the tutorial screenshot script.
// It runs Chrome with its own throw-away profile, so the projects in your normal browser are never touched.
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const require = createRequire(import.meta.url);
// Node 18 has no global WebSocket; Next.js ships the ws package.
const WebSocket = globalThis.WebSocket ?? require('next/dist/compiled/ws');

const CHROME_PATHS = [
  process.env.CHROME_PATH,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
].filter(Boolean);

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

export async function launchChrome({ port = 9333, width = 1440, height = 900 } = {}) {
  const { existsSync } = await import('node:fs');
  const binary = CHROME_PATHS.find(path => existsSync(path));
  if (!binary) throw new Error('Chrome not found. Set CHROME_PATH.');
  const profile = mkdtempSync(join(tmpdir(), 'hvac-tutorial-'));
  const chrome = spawn(
    binary,
    [
      '--headless=new',
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${profile}`,
      `--window-size=${width},${height}`,
      '--hide-scrollbars',
      '--no-first-run',
      '--no-default-browser-check',
      '--force-device-scale-factor=1',
      'about:blank',
    ],
    { stdio: 'ignore' }
  );
  let target;
  for (let tries = 0; tries < 50 && !target; tries += 1) {
    await sleep(200);
    try {
      const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
      target = list.find(item => item.type === 'page');
    } catch {
      // Chrome still starting.
    }
  }
  if (!target) throw new Error('Chrome did not start.');
  const page = await connect(target.webSocketDebuggerUrl);
  await page.send('Page.enable');
  await page.send('Runtime.enable');
  await page.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
  const close = async () => {
    page.close();
    chrome.kill();
    await sleep(300);
    rmSync(profile, { recursive: true, force: true });
  };
  return { page, close };
}

async function connect(url) {
  const socket = new WebSocket(url);
  await new Promise((resolve, reject) => {
    socket.addEventListener ? socket.addEventListener('open', resolve) : socket.on('open', resolve);
    socket.onerror = reject;
  });
  let nextId = 1;
  const pending = new Map();
  const onMessage = raw => {
    const message = JSON.parse(typeof raw === 'string' ? raw : raw.data ?? raw.toString());
    if (message.id && pending.has(message.id)) {
      const { resolve, reject } = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) reject(new Error(message.error.message));
      else resolve(message.result);
    }
  };
  socket.addEventListener ? socket.addEventListener('message', onMessage) : socket.on('message', onMessage);
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = nextId++;
      pending.set(id, { resolve, reject });
      socket.send(JSON.stringify({ id, method, params }));
    });
  /** Run an expression (or an async function body wrapped in an IIFE) in the page and return its value. */
  const evaluate = async expression => {
    const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) {
      const detail = result.exceptionDetails.exception?.description ?? result.exceptionDetails.text;
      throw new Error(`Page error: ${detail}`);
    }
    return result.result.value;
  };
  const navigate = async url => {
    await send('Page.navigate', { url });
    await sleep(500);
    for (let tries = 0; tries < 60; tries += 1) {
      if ((await evaluate('document.readyState')) === 'complete') return;
      await sleep(200);
    }
  };
  const screenshot = async (file, quality = 88) => {
    const { data } = await send('Page.captureScreenshot', { format: 'webp', quality });
    writeFileSync(file, Buffer.from(data, 'base64'));
  };
  return { send, evaluate, navigate, screenshot, close: () => socket.close() };
}
