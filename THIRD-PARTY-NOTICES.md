# Third-party notices

The independently implemented audit workflow uses these rendering and decoding libraries. Their licenses remain applicable to their code and bundled assets.

| Component | Version | License | Upstream |
|---|---|---|---|
| PDF.js / pdfjs-dist | 6.3.289 | Apache-2.0 | https://github.com/mozilla/pdf.js |
| zxing-wasm | 3.1.4 | MIT | https://github.com/Sec-ant/zxing-wasm |
| @napi-rs/canvas | 1.0.9 | MIT | https://github.com/Brooooooklyn/canvas |

PDF.js browser build, worker, character maps, standard fonts and WASM resources are bundled under `docs/vendor/pdfjs`. The upstream Apache license is included there. Font licenses (`LICENSE_FOXIT`, `LICENSE_LIBERATION`) and decoder licenses in `wasm` are retained beside their assets. All character maps are retained to support document rendering. JavaScript CJK literals, where present, are represented with equivalent Unicode escapes; mappings are preserved. Source maps are not distributed.

ZXing WASM reader, ESM wrapper and shared bindings are bundled under `docs/vendor/zxing` with its MIT license. The Node dependency supplies the corresponding wrapper. The underlying ZXing-C++ decoder is Apache-2.0 licensed: https://github.com/zxing-cpp/zxing-cpp. Its license is retained as `docs/vendor/zxing/LICENSE-ZXING-CPP`.

The Node canvas library is installed through the exact dependency in `package-lock.json`; its license is included in `docs/vendor/canvas-LICENSE`. Optional native platform binaries retain their upstream licensing. Sample images and PDFs were independently generated for this project with Pillow, Segno, ReportLab and a separate Python ZXing binding; those generators are not application runtime dependencies.

Contact: tianchaodaxing@gmail.com
