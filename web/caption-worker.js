let recognizer;
self.onmessage = async ({ data: { samples, language } }) => {
  try {
    if (!recognizer) {
      const { pipeline, env } = await import('/vendor/transformers/transformers.js');
      env.allowLocalModels = false;
      // Single-thread WASM also works on shared hosting without isolation headers.
      env.backends.onnx.wasm.numThreads = 1;
      env.backends.onnx.wasm.wasmPaths = '/vendor/transformers/';
      recognizer = await pipeline('automatic-speech-recognition', 'Xenova/whisper-tiny', {
        device: 'wasm', dtype: 'q8',
        progress_callback: event => {
          if (event.status === 'progress') self.postMessage({ type: 'progress', message: `Downloading speech model: ${event.file} · ${Math.round(event.progress || 0)}%` });
          else if (event.status === 'initiate') self.postMessage({ type: 'progress', message: 'Downloading speech model files. Your audio stays on this device.' });
        }
      });
    }
    self.postMessage({ type: 'progress', message: 'Transcribing the selected clip on this device…' });
    const options = { return_timestamps: 'word', chunk_length_s: 30, stride_length_s: 5, task: 'transcribe' };
    if (language) options.language = language;
    const result = await recognizer(samples, options);
    const chunks = [], words = result.chunks || [];
    let group = [];
    for (const word of words) {
      group.push(word);
      if (group.length >= 5 || /[.!?۔؟]$/.test(word.text.trim())) {
        chunks.push({ text: group.map(w => w.text).join(''), timestamp: [group[0].timestamp[0], group.at(-1).timestamp[1]] });
        group = [];
      }
    }
    if (group.length) chunks.push({ text: group.map(w => w.text).join(''), timestamp: [group[0].timestamp[0], group.at(-1).timestamp[1]] });
    self.postMessage({ type: 'result', chunks });
  } catch (error) {
    self.postMessage({ type: 'error', message: `Automatic captions could not finish: ${error.message || error}. You can add captions manually.` });
  }
};
