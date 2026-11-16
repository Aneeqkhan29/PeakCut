import { chromium } from 'playwright-core';
import { execFileSync } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const artifacts = path.join(root, 'artifacts');
await mkdir(artifacts, { recursive: true });
const origin = process.env.BROWSER_TEST_ORIGIN || 'https://peakcut-ochre.vercel.app';
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
  await page.goto(origin + '/app');
  // Record actual YouTube availability; a platform refusal must never be reported as success.
  await page.locator('#video-link').fill('https://youtu.be/jNQXAC9IVRw');
  await page.locator('#import-link').click();
  await page.waitForFunction(() => document.getElementById('state-badge').classList.contains('error') || document.getElementById('status').textContent.includes('Your automatic short is ready'), null, { timeout: 600000 });
  const youtubeStatus = await page.locator('#link-status').textContent();
  assert.match(youtubeStatus, /Your automatic short is ready|YouTube refused downloads/);
  console.log('YouTube availability:', youtubeStatus);
  await page.locator('#video-link').fill('https://clips.twitch.tv/FaintLightGullWholeWheat');
  await page.locator('#import-link').click();
  await page.waitForFunction(() => document.getElementById('status').textContent.includes('Your automatic short is ready') || document.getElementById('state-badge').classList.contains('error'), null, { timeout: 600000 });
  const status = await page.locator('#status').textContent();
  assert.match(status, /Your automatic short is ready/, status);
  const downloadEvent = page.waitForEvent('download');
  await page.locator('#download').click();
  const target = path.join(artifacts, 'twitch-browser-short.mp4');
  await (await downloadEvent).saveAs(target);
  const info = JSON.parse(execFileSync('ffprobe', ['-v','quiet','-show_streams','-show_format','-of','json',target], { encoding: 'utf8' }));
  const video = info.streams.find(stream => stream.codec_type === 'video');
  assert.equal(video.width, 480);
  assert.equal(video.height, 854);
  assert.ok(info.streams.some(stream => stream.codec_type === 'audio'));
  assert.ok(Number(info.format.duration) > 29 && Number(info.format.duration) < 31);
  await page.screenshot({ path: path.join(artifacts, 'twitch-live-website.png'), fullPage: true });
  console.log('PASS: live Twitch URL → real backend download → browser automatic short → downloaded 30-second MP4.', status);
  console.log('Generated caption rows:', await page.locator('.caption-row').count());
} finally {
  await browser.close();
}
