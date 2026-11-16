const $ = id => document.getElementById(id);
const ui = Object.fromEntries(['file','dropzone','settings','source','source-panel','filename','filemeta','replace','start','duration','layout','size','use-playhead','find','suggestion','language','transcribe','captions','manual','apply-manual','clear-captions','render','status','state-badge','progress','cancel','log','result','output','download','download-srt','resultmeta','clear-result','automatic','auto-captions','auto-status'].map(id => [id, $(id)]));
let sourceFile, sourceURL, outputURL, srtURL, ffmpeg, modelWorker;
let sourceDuration = 0, busy = false, generation = 0, engineInput = false, progressSeconds = 1;
let captions = [], logs = [];
let cancelModel;

function log(message) {
  logs.push(message);
  logs = logs.slice(-150);
  ui.log.textContent = logs.join('\n');
}
function status(message, error = false) {
  ui.status.textContent = message;
  ui['auto-status'].textContent = message;
  ui['auto-status'].hidden = !sourceFile;
  ui['state-badge'].textContent = error ? 'Needs attention' : busy ? 'Processing' : 'Ready';
  ui['state-badge'].className = `badge ${error ? 'error' : busy ? 'working' : ''}`;
}
function setBusy(value) {
  busy = value;
  ui.automatic.textContent = value ? 'Processing…' : 'Make short automatically';
  ui.settings.disabled = value || !sourceFile;
  ui.replace.disabled = value;
  ui.file.disabled = value;
  ui.cancel.hidden = !value;
  ui.progress.hidden = !value;
  if (value) ui.progress.removeAttribute('value');
  else ui.progress.value = 0;
  ui['state-badge'].textContent = value ? 'Processing' : 'Ready';
  ui['state-badge'].className = `badge ${value ? 'working' : ''}`;
}
function selectedRange() {
  const start = Number(ui.start.value), length = Number(ui.duration.value);
  if (!sourceFile || !Number.isFinite(sourceDuration) || sourceDuration <= 0) throw new Error('Choose a readable video first.');
  if (!Number.isFinite(start) || start < 0 || start >= sourceDuration) throw new Error('Start must be inside the video.');
  if (!Number.isFinite(length) || length < 1 || length > 180) throw new Error('Choose a clip length between 1 and 180 seconds.');
  const duration = Math.min(length, sourceDuration - start);
  if (duration < 0.25) throw new Error('Choose a start time earlier in the video.');
  return { start, duration };
}
async function run(task) {
  if (busy) return;
  const token = ++generation;
  setBusy(true);
  try {
    await task(token);
  } catch (error) {
    if (token !== generation) return;
    const detail = error?.message || String(error);
    log(detail);
    setBusy(false);
    status(detail, true);
  } finally {
    if (token === generation && busy) setBusy(false);
  }
}
function checkToken(token) {
  if (token !== generation) throw new Error('Processing cancelled.');
}
async function loadEngine(token) {
  if (!ffmpeg) {
    status('Loading the video engine. First use downloads about 32 MB.');
    const { FFmpeg } = await import('/vendor/ffmpeg/index.js');
    checkToken(token);
    const engine = new FFmpeg();
    ffmpeg = engine;
    engine.on('log', ({ message }) => log(message));
    engine.on('progress', ({ time }) => {
      if (busy && time >= 0) ui.progress.value = Math.min(0.99, time / 1e6 / progressSeconds);
    });
    try {
      await engine.load({ coreURL: new URL('/vendor/core/ffmpeg-core.js', location.href).href, wasmURL: new URL('/vendor/core/ffmpeg-core.wasm', location.href).href });
      checkToken(token);
      await engine.createDir('fonts');
      const font = await fetch('/fonts/Poppins-ExtraBold.ttf');
      if (!font.ok) throw new Error('The caption font could not be loaded.');
      await engine.writeFile('fonts/Poppins-ExtraBold.ttf', new Uint8Array(await font.arrayBuffer()));
      for (const name of ['NotoSansDevanagari.ttf', 'NotoNaskhArabic.ttf']) {
        const response = await fetch(`/fonts/${name}`);
        if (!response.ok) throw new Error('A caption font could not be loaded.');
        await engine.writeFile(`fonts/${name}`, new Uint8Array(await response.arrayBuffer()));
      }
    } catch (error) {
      engine.terminate();
      if (ffmpeg === engine) ffmpeg = undefined;
      engineInput = false;
      throw error;
    }
  }
  checkToken(token);
  if (!engineInput) {
    status('Reading your video into browser memory. No upload is made.');
    const bytes = new Uint8Array(await sourceFile.arrayBuffer());
    checkToken(token);
    await ffmpeg.writeFile('input.video', bytes);
    engineInput = true;
  }
  return ffmpeg;
}
async function exec(engine, args) {
  const code = await engine.exec(['-hide_banner', '-y', ...args]);
  if (code !== 0) throw new Error('The video engine could not finish. Check the processing log; the file may use an unsupported codec or have no audio.');
}
async function removeFile(engine, name) {
  try { await engine.deleteFile(name); } catch { /* It may not have been created. */ }
}
function clearResult() {
  ui.output.pause();
  ui.output.removeAttribute('src');
  ui.output.load();
  ui.result.hidden = true;
  if (outputURL) URL.revokeObjectURL(outputURL);
  if (srtURL) URL.revokeObjectURL(srtURL);
  outputURL = srtURL = undefined;
  ui.download.removeAttribute('href');
  ui['download-srt'].removeAttribute('href');
}
function clearCaptions() {
  captions = [];
  ui.captions.replaceChildren();
  ui.manual.value = '';
}
function drawCaptions() {
  ui.captions.replaceChildren();
  captions.forEach((caption, index) => {
    const row = document.createElement('label');
    row.className = 'caption-row';
    const time = document.createElement('span');
    time.textContent = `${caption.start.toFixed(1)}–${caption.end.toFixed(1)}s`;
    const text = document.createElement('input');
    text.value = caption.text;
    text.maxLength = 240;
    text.setAttribute('aria-label', `Caption ${index + 1}, ${time.textContent}`);
    text.addEventListener('input', () => { caption.text = text.value; });
    row.append(time, text);
    ui.captions.append(row);
  });
}
async function chooseFile(file) {
  if (busy || !file) return;
  if (file.size > 500 * 1024 * 1024) { status('Choose a file under 500 MB. Browser processing needs space for the source and rendered video in memory.', true); return; }
  if (!file.size) { status('That file is empty. Choose another video.', true); return; }
  if (file.type && !file.type.startsWith('video/') && !/\.(mp4|mov|mkv|webm|m4v|avi)$/i.test(file.name)) { status('Choose a video file.', true); return; }
  if (ffmpeg) { ffmpeg.terminate(); ffmpeg = undefined; }
  engineInput = false;
  clearResult();
  clearCaptions();
  if (sourceURL) URL.revokeObjectURL(sourceURL);
  sourceFile = file;
  sourceDuration = 0;
  ui.settings.disabled = true;
  sourceURL = URL.createObjectURL(file);
  ui.source.src = sourceURL;
  ui['source-panel'].hidden = false;
  ui.dropzone.hidden = true;
  ui.filename.textContent = file.name;
  ui.filemeta.textContent = `${(file.size / 1024 / 1024).toFixed(1)} MB`;
  ui.suggestion.hidden = true;
  status('Reading video details…');
}
ui.source.addEventListener('loadedmetadata', () => {
  sourceDuration = ui.source.duration;
  if (!Number.isFinite(sourceDuration) || sourceDuration < 1) { status('Choose a video with a readable duration of at least one second.', true); return; }
  ui.start.value = 0;
  ui.start.max = Math.max(0, sourceDuration - 0.25);
  ui.duration.value = Math.min(30, Math.floor(sourceDuration));
  ui.filemeta.textContent = `${(sourceFile.size / 1024 / 1024).toFixed(1)} MB · ${Math.round(sourceDuration)} seconds · ${ui.source.videoWidth} × ${ui.source.videoHeight}`;
  ui.settings.disabled = false;
  status('Video ready. Choose your moment and render a short.');
});
ui.source.addEventListener('error', () => status('This browser cannot preview that video. Try converting it to MP4 (H.264) first.', true));
ui.file.addEventListener('change', () => { chooseFile(ui.file.files[0]); ui.file.value = ''; });
ui.replace.addEventListener('click', () => ui.file.click());
for (const event of ['dragenter','dragover']) ui.dropzone.addEventListener(event, e => { e.preventDefault(); ui.dropzone.classList.add('dragover'); });
for (const event of ['dragleave','drop']) ui.dropzone.addEventListener(event, e => { e.preventDefault(); ui.dropzone.classList.remove('dragover'); });
ui.dropzone.addEventListener('drop', e => chooseFile(e.dataTransfer.files[0]));
for (const field of [ui.start, ui.duration]) field.addEventListener('change', () => { clearCaptions(); ui.suggestion.hidden = true; });
ui['use-playhead'].addEventListener('click', () => { ui.start.value = Math.min(ui.source.currentTime, sourceDuration - 0.25).toFixed(1); clearCaptions(); });
ui['clear-captions'].addEventListener('click', clearCaptions);
ui['clear-result'].addEventListener('click', clearResult);
ui['apply-manual'].addEventListener('click', () => {
  try {
    const { duration } = selectedRange();
    const lines = ui.manual.value.split('\n').map(s => s.trim()).filter(Boolean);
    if (!lines.length) throw new Error('Write at least one caption line.');
    if (lines.length > 100) throw new Error('Use at most 100 caption lines per clip.');
    captions = lines.map((text, i) => ({ start: i * duration / lines.length, end: (i + 1) * duration / lines.length, text: text.slice(0,240) }));
    drawCaptions();
    status('Manual captions added. They will be burned into the exported MP4.');
  } catch (error) { status(error.message, true); }
});

// Audio is decoded inside the same local engine; only Float32 samples go to the model worker.
async function extractAudio(engine, start, duration) {
  progressSeconds = duration;
  await exec(engine, ['-ss', String(start), '-i', 'input.video', '-t', String(duration), '-vn', '-ac', '1', '-ar', '16000', '-f', 'f32le', 'audio.raw']);
  const bytes = await engine.readFile('audio.raw');
  const samples = new Float32Array(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
  await removeFile(engine, 'audio.raw');
  return samples;
}
async function findMoment(token) {
  const { duration } = selectedRange();
  if (sourceDuration > 1800) throw new Error('Highlight search supports videos up to 30 minutes in browser mode. Choose a moment manually for longer videos.');
  const engine = await loadEngine(token);
  status('Scanning audio on this device for the most energetic moment…');
  const samples = await extractAudio(engine, 0, sourceDuration);
  checkToken(token);
  const seconds = Math.ceil(samples.length / 16000);
  const energy = new Float64Array(seconds + 1);
  for (let s = 0; s < seconds; s++) {
    let sum = 0, count = 0;
    for (let i = s * 16000; i < Math.min(samples.length, (s + 1) * 16000); i += 8) { sum += samples[i] * samples[i]; count++; }
    energy[s + 1] = energy[s] + (count ? sum / count : 0);
  }
  let best = 0, bestValue = -1;
  const window = Math.min(Math.ceil(duration), seconds);
  for (let i = 0; i + window <= seconds; i++) {
    const value = energy[i + window] - energy[i];
    if (value > bestValue) { best = i; bestValue = value; }
  }
  if (bestValue < 1e-9) throw new Error('No useful audio energy found. Choose your clip manually.');
  ui.start.value = Math.min(best, Math.max(0, sourceDuration - duration)).toFixed(1);
  ui.source.currentTime = Number(ui.start.value);
  clearCaptions();
  ui.suggestion.textContent = `Suggested start: ${ui.start.value}s. This is the loudest ${duration.toFixed(1)}-second window; review the content before rendering.`;
  ui.suggestion.hidden = false;
  status('Highlight suggestion ready. Review the selected moment.');
}
ui.find.addEventListener('click', () => run(findMoment));

function transcribe(samples, language, token) {
  if (!modelWorker) modelWorker = new Worker('/assets/caption-worker.js', { type: 'module' });
  const worker = modelWorker;
  return new Promise((resolve, reject) => {
    const cleanup = () => { worker.removeEventListener('message', receive); worker.removeEventListener('error', failed); worker.removeEventListener('messageerror', failed); cancelModel = undefined; };
    const failed = event => { cleanup(); worker.terminate(); if (modelWorker === worker) modelWorker = undefined; reject(new Error(event.message || 'The speech model could not run in this browser. You can still add captions manually.')); };
    const receive = ({ data }) => {
      if (token !== generation) { cleanup(); reject(new Error('Processing cancelled.')); return; }
      if (data.type === 'progress') { status(data.message); ui.progress.removeAttribute('value'); }
      if (data.type === 'result') { cleanup(); resolve(data.chunks); }
      if (data.type === 'error') { cleanup(); worker.terminate(); if (modelWorker === worker) modelWorker = undefined; reject(new Error(data.message)); }
    };
    worker.addEventListener('message', receive);
    worker.addEventListener('error', failed);
    worker.addEventListener('messageerror', failed);
    cancelModel = () => { cleanup(); reject(new Error('Processing cancelled.')); };
    worker.postMessage({ samples, language }, [samples.buffer]);
  });
}
async function captionSelected(token) {
  const { start, duration } = selectedRange();
  const engine = await loadEngine(token);
  status('Extracting the selected clip audio locally…');
  const audio = await extractAudio(engine, start, duration);
  checkToken(token);
  status('Loading the speech model. First use can take several minutes.');
  const chunks = await transcribe(audio, ui.language.value, token);
  checkToken(token);
  captions = chunks.map(chunk => ({ start: Math.max(0, Number(chunk.timestamp[0]) || 0), end: Math.min(duration, chunk.timestamp[1] == null ? duration : Number(chunk.timestamp[1])), text: chunk.text.trim() })).filter(c => c.text && c.end > c.start);
  if (!captions.length) throw new Error('No speech was recognised in this clip. Try another moment or write captions manually.');
  drawCaptions();
  status('Captions generated on this device. Review and edit them before rendering.');
}
ui.transcribe.addEventListener('click', () => run(captionSelected));

function assTime(seconds) {
  const cs = Math.max(0, Math.round(seconds * 100));
  return `${Math.floor(cs/360000)}:${String(Math.floor(cs/6000)%60).padStart(2,'0')}:${String(Math.floor(cs/100)%60).padStart(2,'0')}.${String(cs%100).padStart(2,'0')}`;
}
function cleanCaption(text) {
  return text.replace(/\\/g, '/').replace(/[{}]/g, '').replace(/[\r\n]+/g, ' ').trim();
}
function styledCaption(text) {
  return cleanCaption(text).replace(/([\u0600-\u06ff\u0750-\u077f\u08a0-\u08ff\ufb50-\ufdff\ufe70-\ufeff]+)|([\u0900-\u097f\ua8e0-\ua8ff]+)/g,
    (run, arabic) => `{\\fn${arabic ? 'Noto Naskh Arabic' : 'Noto Sans Devanagari'}}${run}{\\fnPoppins ExtraBold}`);
}
function makeAss(width, height) {
  const fontSize = Math.round(width * 0.065);
  return `[Script Info]\nScriptType: v4.00+\nPlayResX: ${width}\nPlayResY: ${height}\nWrapStyle: 0\n\n[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\nStyle: Default,Poppins ExtraBold,${fontSize},&H00FFFFFF,&H000000FF,&H00120E0B,&H80000000,-1,0,0,0,100,100,0,0,1,${Math.max(2,Math.round(width/180))},0,2,${Math.round(width*.07)},${Math.round(width*.07)},${Math.round(height*.12)},1\n\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n` + captions.filter(c => c.text.trim()).map(c => `Dialogue: 0,${assTime(c.start)},${assTime(c.end)},Default,,0,0,0,,${styledCaption(c.text)}\n`).join('');
}
function srtTime(seconds) {
  const ms = Math.max(0, Math.round(seconds * 1000));
  return `${String(Math.floor(ms/3600000)).padStart(2,'0')}:${String(Math.floor(ms/60000)%60).padStart(2,'0')}:${String(Math.floor(ms/1000)%60).padStart(2,'0')},${String(ms%1000).padStart(3,'0')}`;
}
async function renderSelected(token) {
  const { start, duration } = selectedRange();
  const engine = await loadEngine(token);
  checkToken(token);
  status('Rendering your short on this device. Keep this tab open.');
  const width = Number(ui.size.value), height = width === 480 ? 854 : 1280;
  let frameWidth = width, frameHeight = height;
  const filters = [];
  if (ui.layout.value === 'crop') filters.push(`scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height}`);
  else if (ui.layout.value === 'fit') filters.push(`scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:color=black`);
  else { frameWidth = ui.source.videoWidth; frameHeight = ui.source.videoHeight; filters.push('scale=trunc(iw/2)*2:trunc(ih/2)*2'); }
  filters.push('setsar=1');
  if (captions.some(c => c.text.trim())) {
    await engine.writeFile('captions.ass', new TextEncoder().encode(makeAss(frameWidth, frameHeight)));
    filters.push('ass=captions.ass:fontsdir=fonts');
  }
  progressSeconds = duration;
  try {
    await exec(engine, ['-ss', String(start), '-i', 'input.video', '-t', String(duration), '-map', '0:v:0', '-map', '0:a:0?', '-vf', filters.join(','), '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '23', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', 'output.mp4']);
    checkToken(token);
    const bytes = await engine.readFile('output.mp4');
    checkToken(token);
    clearResult();
    outputURL = URL.createObjectURL(new Blob([bytes], { type: 'video/mp4' }));
    ui.output.src = outputURL;
    ui.download.href = outputURL;
    const base = sourceFile.name.replace(/\.[^.]+$/, '').replace(/[^\p{L}\p{N} _-]/gu, '').slice(0,80) || 'peakcut';
    ui.download.download = `${base}-short.mp4`;
    const usable = captions.filter(c => c.text.trim());
    ui['download-srt'].hidden = !usable.length;
    if (usable.length) {
      const srt = usable.map((c, i) => `${i + 1}\n${srtTime(c.start)} --> ${srtTime(c.end)}\n${c.text.trim()}\n`).join('\n');
      srtURL = URL.createObjectURL(new Blob([srt], { type: 'application/x-subrip;charset=utf-8' }));
      ui['download-srt'].href = srtURL;
      ui['download-srt'].download = `${base}-captions.srt`;
    }
    ui.resultmeta.textContent = `${duration.toFixed(1)} seconds · ${(bytes.length/1024/1024).toFixed(1)} MB · MP4`;
    ui.result.hidden = false;
    status('Your short is ready. Download it before leaving this page.');
  } finally {
    await removeFile(engine, 'output.mp4');
    await removeFile(engine, 'captions.ass');
  }
}
ui.render.addEventListener('click', () => run(renderSelected));
ui.automatic.addEventListener('click', () => run(async token => {
  selectedRange();
  clearResult();
  clearCaptions();
  const notices = [];
  try {
    await findMoment(token);
  } catch (error) {
    checkToken(token);
    log(`Automatic selection: ${error.message}`);
    notices.push('A highlight could not be selected; the current start time was used.');
  }
  checkToken(token);
  if (ui['auto-captions'].checked) {
    try {
      await captionSelected(token);
    } catch (error) {
      checkToken(token);
      log(`Automatic captions: ${error.message}`);
      clearCaptions();
      notices.push('Captions could not be generated. You can add them manually and render again.');
    }
  }
  checkToken(token);
  await renderSelected(token);
  checkToken(token);
  status(`Your automatic short is ready. ${notices.join(' ')} Download it before leaving this page.`);
  ui.result.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}));
ui.cancel.addEventListener('click', () => {
  generation++;
  if (cancelModel) cancelModel();
  if (ffmpeg) { ffmpeg.terminate(); ffmpeg = undefined; }
  if (modelWorker) { modelWorker.terminate(); modelWorker = undefined; }
  engineInput = false;
  setBusy(false);
  status('Processing cancelled. You can change the clip and try again.');
  log('Cancelled by user.');
});
window.addEventListener('beforeunload', event => { if (busy) { event.preventDefault(); event.returnValue = ''; } });
if (!('WebAssembly' in window) || !('Worker' in window)) {
  ui.file.disabled = true;
  status('This browser does not support the video engine. Use a recent Chrome, Edge, Firefox or Safari.', true);
}
