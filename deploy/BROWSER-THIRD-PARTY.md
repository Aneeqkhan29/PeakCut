# Browser edition dependencies

The browser build uses unmodified binaries from these npm packages:

- `@ffmpeg/ffmpeg` 0.12.15: MIT. Source and releases: https://github.com/ffmpegwasm/ffmpeg.wasm
- `@ffmpeg/core` 0.12.10: GPL-2.0-or-later for the compiled FFmpeg core. Source, build scripts and library versions: https://github.com/ffmpegwasm/ffmpeg.wasm/tree/v0.12.10 and https://github.com/ffmpegwasm/ffmpeg.wasm/tree/main/build. Underlying FFmpeg source: https://github.com/ffmpegwasm/FFmpeg. The binary is distributed as a separate, unmodified WebAssembly engine. See the package license included alongside this notice.
- `@huggingface/transformers` 3.8.1: Apache-2.0. Source: https://github.com/huggingface/transformers.js/tree/3.8.1
- ONNX Runtime Web, included in Transformers.js: MIT. Source and notices: https://github.com/microsoft/onnxruntime/tree/v1.21.0
- `Xenova/whisper-tiny`, downloaded on demand by the user: Apache-2.0. Model and license: https://huggingface.co/Xenova/whisper-tiny
- Poppins, Archivo Black, Anton, Noto Sans Devanagari and Noto Naskh Arabic fonts: SIL Open Font License; see the license files in `/fonts/`. Noto font sources: https://github.com/google/fonts/tree/main/ofl/notosansdevanagari and https://github.com/google/fonts/tree/main/ofl/notonaskharabic.

PeakCut's original license is in the source repository. Libraries retain their respective licenses and notices.
