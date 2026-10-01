import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createCanvas, loadImage, DOMMatrix, Path2D, ImageData } from '@napi-rs/canvas';
import { prepareZXingModule, readBarcodes } from 'zxing-wasm/reader';
import { LIMITS } from '../docs/core.mjs';
globalThis.DOMMatrix ??= DOMMatrix; globalThis.Path2D ??= Path2D; globalThis.ImageData ??= ImageData;
const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
const pdfBase = new URL('./', import.meta.resolve('pdfjs-dist/package.json')), wasm = await readFile(new URL('../docs/vendor/zxing/zxing_reader.wasm', import.meta.url));
await prepareZXingModule({ overrides: { wasmBinary: wasm }, fireImmediately: true });
export const adapter = {
  canvas: createCanvas,
  hash: async bytes => createHash('sha256').update(bytes).digest('hex'),
  png: async canvas => new Uint8Array(await canvas.encode('png')),
  decode: readBarcodes,
  async open(file) {
    if (/\.pdf$/i.test(file.name)) {
      const resource = name => fileURLToPath(new URL(name + '/', pdfBase)).replace(/\\/g, '/') + '/';
      const task = pdfjs.getDocument({ data: new Uint8Array(file.bytes), isEvalSupported: false, stopAtErrors: true, useSystemFonts: false, standardFontDataUrl: resource('standard_fonts'), cMapUrl: resource('cmaps'), cMapPacked: true, wasmUrl: resource('wasm') });
      let pdf; try { pdf = await task.promise; } catch (error) { await task.destroy(); throw error; }
      return { count: pdf.numPages, close: () => task.destroy(), async render(n) {
        const page = await pdf.getPage(n), scale = LIMITS.pdfDpi / 72, viewport = page.getViewport({ scale });
        if (Math.ceil(viewport.width) * Math.ceil(viewport.height) > LIMITS.pagePixels) throw Error('This PDF page exceeds 24 million pixels at 200 DPI. Reduce its size.');
        const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
        try { await page.render({ canvasContext: canvas.getContext('2d'), viewport, background: '#ffffff' }).promise; } finally { page.cleanup(); }
        return { canvas, scale };
      } };
    }
    const image = await loadImage(file.bytes);
    if (image.width * image.height > LIMITS.pagePixels) throw Error('This image exceeds 24 million pixels. Reduce its size.');
    return { count: 1, close: async () => {}, render: async () => { const canvas = createCanvas(image.width, image.height), ctx = canvas.getContext('2d'); ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.drawImage(image, 0, 0); return { canvas, scale: 1 }; } };
  }
};
