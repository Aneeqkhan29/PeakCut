import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = path.join(root, 'artifacts');
const dist = path.join(root, 'dist');
await mkdir(output, { recursive: true });
const fixture = path.join(output, 'browser-input.mp4');
execFileSync('ffmpeg', ['-hide_banner','-loglevel','error','-y','-f','lavfi','-i','testsrc2=size=640x360:rate=15','-f','lavfi','-i','sine=frequency=440:sample_rate=16000','-t','4','-c:v','libx264','-pix_fmt','yuv420p','-c:a','aac',fixture]);
const mime = { '.html':'text/html', '.css':'text/css', '.js':'text/javascript', '.mjs':'text/javascript', '.wasm':'application/wasm', '.svg':'image/svg+xml', '.ttf':'font/ttf', '.mp4':'video/mp4', '.jpg':'image/jpeg' };
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    const pathname = decodeURIComponent(url.pathname);
    let target = path.resolve(dist, '.' + (pathname === '/' ? '/index.html' : pathname));
    if (!target.startsWith(dist + path.sep)) { res.writeHead(403).end(); return; }
    try { await stat(target); } catch { target += '.html'; }
    const bytes = await readFile(target);
    res.writeHead(200, {'Content-Type': mime[path.extname(target)] || 'application/octet-stream'});
    res.end(bytes);
  } catch { res.writeHead(404).end('Not found'); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
  const errors = [], uploads = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => { if (!['GET','HEAD'].includes(request.method())) uploads.push(request.url()); });
  await page.goto(origin + '/app');
  await page.locator('#file').setInputFiles(fixture);
  await page.locator('#render').waitFor({ state: 'visible' });
  await page.waitForFunction(() => !document.getElementById('settings').disabled);
  await page.locator('#duration').fill('2');
  await page.locator('#manual').fill('Hello from PeakCut\nA real browser export {\\pos(0,0)}');
  await page.locator('#apply-manual').click();
  assert.equal(await page.locator('.caption-row').count(), 2);
  await page.locator('#render').click();
  await page.locator('#download').waitFor({ state: 'visible', timeout: 180000 });
  const downloadEvent = page.waitForEvent('download');
  await page.locator('#download').click();
  const download = await downloadEvent;
  const rendered = path.join(output, 'browser-output.mp4');
  await download.saveAs(rendered);
  const info = JSON.parse(execFileSync('ffprobe', ['-v','quiet','-show_streams','-show_format','-of','json',rendered], { encoding: 'utf8' }));
  const video = info.streams.find(s => s.codec_type === 'video');
  assert.equal(video.width, 480);
  assert.equal(video.height, 854);
  assert.equal(video.codec_name, 'h264');
  assert.ok(info.streams.some(s => s.codec_type === 'audio'));
  assert.ok(Math.abs(Number(info.format.duration) - 2) < 0.25);
  const srtEvent = page.waitForEvent('download');
  await page.locator('#download-srt').click();
  await (await srtEvent).saveAs(path.join(output, 'browser-output.srt'));
  const srt = await readFile(path.join(output, 'browser-output.srt'), 'utf8');
  assert.match(srt, /00:00:00,000 --> 00:00:01,000/);
  assert.match(srt, /Hello from PeakCut/);
  execFileSync('ffmpeg', ['-hide_banner','-loglevel','error','-y','-i',rendered,'-frames:v','1',path.join(output,'browser-output.png')]);
  await page.screenshot({ path: path.join(output, 'browser-studio.png'), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'Mobile layout must not overflow');
  await page.screenshot({ path: path.join(output, 'browser-studio-mobile.png'), fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.locator('#find').click();
  await page.waitForFunction(() => !document.getElementById('settings').disabled, null, { timeout: 60000 });
  await page.locator('#suggestion').waitFor({ state: 'visible' });
  await page.locator('#duration').fill('0');
  await page.locator('#duration').blur();
  await page.locator('#render').click();
  console.log('Range validation:', await page.locator('#status').textContent());
  await page.waitForFunction(() => document.getElementById('status').textContent.includes('between 1 and 180'));
  await page.locator('#duration').fill('3');
  await page.locator('#render').click();
  await page.locator('#cancel').click();
  await page.waitForFunction(() => document.getElementById('status').textContent.includes('cancelled'));
  await page.locator('#duration').fill('1');
  await page.locator('#render').click();
  await page.waitForFunction(() => document.getElementById('status').textContent.includes('Your short is ready'), null, { timeout: 60000 });
  assert.deepEqual(uploads, [], 'Video processing must not send uploads');
  assert.deepEqual(errors, []);
  console.log('PASS: real browser render, H.264/AAC output, vertical dimensions, captions, SRT, audio highlight, invalid range, cancellation/retry, mobile layout, no upload requests.');

  if (process.env.RUN_CAPTIONS === '1') {
    const response = await fetch('https://huggingface.co/datasets/Xenova/transformers.js-docs/resolve/main/jfk.wav');
    assert.ok(response.ok);
    const wav = path.join(output, 'speech.wav');
    await writeFile(wav, new Uint8Array(await response.arrayBuffer()));
    const speechVideo = path.join(output, 'speech.mp4');
    execFileSync('ffmpeg', ['-hide_banner','-loglevel','error','-y','-f','lavfi','-i','testsrc2=size=320x180:rate=10','-i',wav,'-t','8','-c:v','libx264','-pix_fmt','yuv420p','-c:a','aac',speechVideo]);
    await page.locator('#file').setInputFiles(speechVideo);
    await page.waitForFunction(() => !document.getElementById('settings').disabled);
    await page.locator('#language').selectOption('english');
    await page.locator('#transcribe').click();
    await page.waitForFunction(() => document.getElementById('status').textContent.includes('Captions generated') || document.getElementById('state-badge').classList.contains('error'), null, { timeout: 600000 });
    const status = await page.locator('#status').textContent();
    assert.match(status, /Captions generated/, (await page.locator('#log').textContent()) + '\n' + status);
    assert.ok(await page.locator('.caption-row').count() > 0);
    console.log('PASS: real browser Whisper transcription:', await page.locator('.caption-row input').first().inputValue());
  }
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
