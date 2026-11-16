import { mkdir, readFile, writeFile, cp } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const root = fileURLToPath(new URL('../', import.meta.url));
if (process.env.VERCEL === '1') execFileSync('python3', ['deploy/prepare-link-runtime.py'], { cwd: root, stdio: 'inherit' });
const out = path.join(root, 'dist');
const repo = 'https://github.com/Aneeqkhan29/PeakCut';
const host = process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL;
const site = new URL(process.env.BROWSER_SITE_URL || (host ? `https://${host}` : 'http://localhost:3000')).origin;
await mkdir(path.join(out, 'assets'), { recursive: true });
await cp(path.join(root, 'web/brand'), path.join(out, 'brand'), { recursive: true });
await cp(path.join(root, 'web/gradient-ascii.js'), path.join(out, 'assets/gradient-ascii.js'));
for (const file of ['browser.js', 'browser.css', 'caption-worker.js']) await cp(path.join(root, 'web', file), path.join(out, 'assets', file));
await cp(path.join(root, 'web/browser.html'), path.join(out, 'app.html'));
await cp(path.join(root, 'studio/fonts'), path.join(out, 'fonts'), { recursive: true });
await cp(path.join(root, 'web/browser-fonts'), path.join(out, 'fonts'), { recursive: true });
await mkdir(path.join(out, 'vendor'), { recursive: true });
await cp(path.join(root, 'node_modules/@ffmpeg/ffmpeg/dist/esm'), path.join(out, 'vendor/ffmpeg'), { recursive: true });
await cp(path.join(root, 'node_modules/@ffmpeg/core/dist/esm'), path.join(out, 'vendor/core'), { recursive: true });
await mkdir(path.join(out, 'vendor/transformers'), { recursive: true });
for (const file of ['transformers.min.js', 'ort-wasm-simd-threaded.jsep.mjs', 'ort-wasm-simd-threaded.jsep.wasm']) {
  await cp(path.join(root, 'node_modules/@huggingface/transformers/dist', file), path.join(out, 'vendor/transformers', file === 'transformers.min.js' ? 'transformers.js' : file));
}
await cp(path.join(root, 'deploy/hostinger.htaccess'), path.join(out, '.htaccess'));
await mkdir(path.join(out, 'licenses'), { recursive: true });
for (const [name, folder] of [['ffmpeg', '@ffmpeg/ffmpeg'], ['core', '@ffmpeg/core'], ['transformers', '@huggingface/transformers']]) {
  for (const file of ['LICENSE', 'LICENSE.txt', 'LICENSE.md']) {
    try { await cp(path.join(root, 'node_modules', folder, file), path.join(out, 'licenses', `${name}-${file}`)); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
}
await cp(path.join(root, 'deploy/BROWSER-THIRD-PARTY.md'), path.join(out, 'licenses/README.md'));
await cp(path.join(root, 'deploy/browser-licenses'), path.join(out, 'licenses'), { recursive: true });

let landing = await readFile(path.join(root, 'web/landing.html'), 'utf8');
landing = landing.replaceAll('{{SITE}}', site);
landing = landing.replace(/<title>.*?<\/title>/, '<title>PeakCut — Make captioned shorts in your browser</title>')
  .replace(/<meta name="description" content="[^"]*">/, '<meta name="description" content="Trim, caption and render vertical videos on your own device, directly in your browser. No installation or account required.">')
  .replace(/<meta property="og:title" content="[^"]*">/, '<meta property="og:title" content="PeakCut browser studio">')
  .replace(/<meta property="og:description" content="[^"]*">/, '<meta property="og:description" content="Turn a local video into a captioned vertical short. Processing happens on your device.">');
// The browser edition has no server accounts or remote video downloads.
landing = landing.replace(/href="\/(?:login|signup)"/g, 'href="/app"').replace('href="/reset"', 'href="/get-started"');
landing = landing.replace('>Sign in</a>', '>Open studio</a>')
  .replaceAll('>Sign up</a>', '>Start clipping</a>')
  .replace('>Create an account</a>', '>Open browser studio</a>')
  .replace('>Sign in</a>', '>Open studio</a>')
  .replace('>Reset password</a>', '>How it works</a>');
landing = landing.replace('Clip live streams <span class="hl">while they are still live</span>', 'Turn your videos <span class="hl">into vertical shorts</span>')
  .replace('Add a streamer once. PeakCut records the stream, finds the best moments and hands you captioned vertical clips while it is still live. Replays work too.', 'Open a video from your device, choose a moment and export a captioned vertical short. No account, installation or video upload to a server.');
const formStart = landing.indexOf('    <div class="ask reveal"');
const formEnd = landing.indexOf('    <div class="notes reveal"', formStart);
if (formStart < 0 || formEnd < 0) throw new Error('Landing page action section changed.');
landing = landing.slice(0, formStart) + `    <div class="ask reveal" style="--d:.2s"><a class="btn primary" href="/app">Open browser studio</a></div>
    <p class="reveal" style="--d:.24s">Browser edition: file import, trim, captions and MP4 export. Live clipping and social posting below are features of the separate desktop/server edition.</p>
` + landing.slice(formEnd);
const scriptStart = landing.indexOf('// the link bar:');
const scriptEnd = landing.indexOf('</script>', scriptStart);
if (scriptStart < 0 || scriptEnd < 0) throw new Error('Landing page account script changed.');
landing = landing.slice(0, scriptStart) + landing.slice(scriptEnd);
await writeFile(path.join(out, 'index.html'), landing);

const template = await readFile(path.join(root, 'web/legal.html'), 'utf8');
const styles = template.match(/<style>([\s\S]*?)<\/style>/)[1];
const pages = {
  'get-started': ['Start clipping in your browser', `<div class="box"><p><a href="/app">Open PeakCut browser studio</a></p><p>No signup, Python installation or API key required.</p></div><h2>1. Paste a link or choose a video</h2><p>Paste a public YouTube or Twitch recording/clip URL into the link form to import and automatically process it. Link imports are limited to 20 minutes and 150 MB, and may be refused by the platform depending on the download server network. You can also open a video file up to 500 MB from your device. Your video stays in browser memory and is not uploaded to the hosting server.</p><h2>2. Make the short automatically</h2><p>Press <strong>Make short automatically</strong>. PeakCut selects a high-energy moment, generates speech captions and renders an MP4. You can turn automatic captions off, or adjust clip length and framing before starting. If there is no audio, the current start time is used. If captions cannot be generated, export continues without captions and explains what happened.</p><h2>3. Download and review</h2><p>Download the MP4 before leaving the page and check the transcript before publishing. You can edit generated captions and render again. Keep the tab open while processing. Start with a short clip; larger files need more memory. Manual selection, captions and rendering are also available below the automatic button.</p><h2>What downloads?</h2><p>The video engine downloads on first processing. Automatic captions additionally download a Whisper speech model from Hugging Face. Only model files are downloaded; video and audio are not uploaded. Recent desktop Chrome or Edge is recommended.</p><h2>Browser and desktop editions</h2><p>The browser edition supports files, trimming, audio-energy highlights, captions and MP4 export. YouTube/Twitch link imports use the download backend; platform refusals are shown explicitly. Live recording, social posting and the desktop app's AI clip ranking are not available here.</p><p>For those features, see the <a href="${repo}#quick-start">separate Python desktop/server edition</a>.</p>`],
  privacy: ['Privacy', '<p>Local files selected in the browser studio are processed on your device and are not uploaded to our hosting server. For a YouTube/Twitch import, the video URL is sent to the download service, which fetches that video into temporary server storage and streams it to your browser. Temporary files are removed after the response. The hosting and source platforms receive the requests needed for this download. Captions and final rendering run on your device. No account or API key is required.</p><p>Processing assets download from this website. If you request automatic captions, your browser downloads model files from Hugging Face and may cache them locally. The model provider receives requests for model files, not your video or audio.</p><p>The hosting provider may process request information such as IP addresses and browser details to deliver and protect this website. Google Fonts is used on the landing page.</p><p>Exported videos remain available in the tab until you clear them or leave. Download your work before closing the page. Clearing browser site data removes cached models.</p>'],
  terms: ['Website and software', `<p>The browser studio processes your chosen files on your device. Results and speed depend on your browser, available memory and video format. Review generated captions before publishing.</p><p>PeakCut software is provided under its <a href="${repo}/blob/main/LICENSE">MIT license</a>. The browser engine and speech libraries have their own <a href="/licenses/README.md">licenses and source links</a>.</p><p>You are responsible for the videos you process and publish.</p>`],
  'acceptable-use': ['Using PeakCut', '<p>Process and publish videos you own or have permission to use. Follow the rules of the video platforms where you publish your work.</p><p>Files are processed on your own device in the browser studio. This website does not provide a public upload or video storage service.</p>']
};
for (const [slug, [title, body]] of Object.entries(pages)) {
  await writeFile(path.join(out, `${slug}.html`), `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title} | PeakCut</title><link rel="icon" href="/brand/favicon.svg"><style>${styles}</style></head><body><header><div class="bar"><a href="/"><img src="/brand/logo.svg" alt="PeakCut" width="120" height="30"></a><nav><a href="/">Home</a><a href="/get-started">Get started</a><a href="${repo}">GitHub</a></nav></div></header><main><h1>${title}</h1>${body}</main></body></html>`);
}
await writeFile(path.join(out, 'robots.txt'), `User-agent: *\nAllow: /\nSitemap: ${site}/sitemap.xml\n`);
await writeFile(path.join(out, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${['', 'app', ...Object.keys(pages)].map(p => `<url><loc>${site}/${p}</loc></url>`).join('')}</urlset>`);
console.log('Built PeakCut browser studio. Video processing runs entirely on the visitor\'s device.');
