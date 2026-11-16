import { mkdir, readFile, writeFile, cp } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const out = path.join(root, 'dist');
const repo = 'https://github.com/Aneeqkhan29/PeakCut';
const host = process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL;
const site = host ? `https://${host}` : 'http://localhost:3000';
await mkdir(path.join(out, 'assets'), { recursive: true });
await cp(path.join(root, 'web/brand'), path.join(out, 'brand'), { recursive: true });
await cp(path.join(root, 'web/gradient-ascii.js'), path.join(out, 'assets/gradient-ascii.js'));

let landing = await readFile(path.join(root, 'web/landing.html'), 'utf8');
landing = landing.replaceAll('{{SITE}}', site);
// This export has no accounts or processing API. Keep every action honest.
landing = landing.replace(/href="\/(?:login|signup|reset)"/g, 'href="/get-started"');
landing = landing.replace('>Sign in</a>', '>Open locally</a>')
  .replaceAll('>Sign up</a>', '>Get started</a>')
  .replace('>Create an account</a>', '>Install PeakCut</a>')
  .replace('>Reset password</a>', '>Setup guide</a>');
const formStart = landing.indexOf('    <div class="ask reveal"');
const formEnd = landing.indexOf('    <div class="notes reveal"', formStart);
if (formStart < 0 || formEnd < 0) throw new Error('Landing page action section changed.');
landing = landing.slice(0, formStart) + `    <div class="ask reveal" style="--d:.2s"><a class="btn primary" href="/get-started">Start clipping on your computer</a></div>
    <p class="reveal" style="--d:.24s">Run PeakCut locally to upload and process videos. This website introduces the app.</p>
` + landing.slice(formEnd);
const scriptStart = landing.indexOf('// the link bar:');
const scriptEnd = landing.indexOf('</script>', scriptStart);
if (scriptStart < 0 || scriptEnd < 0) throw new Error('Landing page account script changed.');
landing = landing.slice(0, scriptStart) + landing.slice(scriptEnd);
await writeFile(path.join(out, 'index.html'), landing);

const template = await readFile(path.join(root, 'web/legal.html'), 'utf8');
const styles = template.match(/<style>([\s\S]*?)<\/style>/)[1];
const pages = {
  'get-started': ['Start clipping with PeakCut', `<p>The PeakCut website is live. Video processing runs on your own computer; online accounts and uploads are not enabled on this website.</p><div class="box"><h2>Already installed on this computer?</h2><p>Start PeakCut using <code>Start-PeakCut.ps1</code> in the project folder, then open the local dashboard.</p><p><a href="http://127.0.0.1:8765/app">Open local PeakCut</a></p><p>This link works only on the computer running PeakCut. Keep the app running while clipping.</p></div><h2>Install it yourself</h2><p>Download the repository, install Python 3.10 or newer and FFmpeg, then follow the README. Add your AI key in Settings, AI.</p><p><a href="${repo}#quick-start">Installation instructions on GitHub</a></p><h2>Online video processing</h2><p>A separate processing server is required for online uploads, accounts and live clipping. It has not been connected to this website yet.</p>`],
  privacy: ['Privacy', '<p>This website contains information and sample clips. It does not offer accounts, accept video uploads, or ask for AI keys. Videos and settings in the local PeakCut app stay in the data folder on the computer running it.</p><p>The hosting provider may process request information such as IP addresses and browser details to deliver and protect this website. Google Fonts is used for typography.</p><p>When you configure an AI provider in the local app, its terms and privacy policy apply to requests sent to it.</p>'],
  terms: ['Website and software', `<p>This website introduces PeakCut. Online video processing and account registration are not available here.</p><p>The software is provided under its <a href="${repo}/blob/main/LICENSE">MIT license</a>. See the repository for installation instructions and the full license.</p><p>You are responsible for the videos you process and publish through your own installation.</p>`],
  'acceptable-use': ['Using PeakCut', '<p>Process and publish videos you own or have permission to use. Follow the rules of the video platforms and services you connect to your installation.</p><p>This website does not accept videos for processing. Use your own PeakCut installation to create clips.</p>']
};
for (const [slug, [title, body]] of Object.entries(pages)) {
  await writeFile(path.join(out, `${slug}.html`), `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title} | PeakCut</title><link rel="icon" href="/brand/favicon.svg"><style>${styles}</style></head><body><header><div class="bar"><a href="/"><img src="/brand/logo.svg" alt="PeakCut" width="120" height="30"></a><nav><a href="/">Home</a><a href="/get-started">Get started</a><a href="${repo}">GitHub</a></nav></div></header><main><h1>${title}</h1>${body}</main></body></html>`);
}
await writeFile(path.join(out, 'robots.txt'), `User-agent: *\nAllow: /\nSitemap: ${site}/sitemap.xml\n`);
await writeFile(path.join(out, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${['', ...Object.keys(pages)].map(p => `<url><loc>${site}/${p}</loc></url>`).join('')}</urlset>`);
console.log('Built PeakCut website. Video processing remains in the local app.');
