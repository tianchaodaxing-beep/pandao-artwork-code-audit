import * as pdfjs from './vendor/pdfjs/pdf.min.mjs';
import { LIMITS } from './core.mjs';
pdfjs.GlobalWorkerOptions.workerSrc = new URL('./vendor/pdfjs/pdf.worker.min.mjs', import.meta.url).href;
export function createAdapter(signal) {
  signal.throwIfAborted();
  const decoder = new Worker(new URL('./worker.mjs', import.meta.url), { type: 'module' }), pending = new Map(); let sequence = 0;
  const close = () => { decoder.terminate(); for (const p of pending.values()) p.reject(new DOMException('Audit cancelled.', 'AbortError')); pending.clear(); };
  signal.addEventListener('abort', close, { once: true });
  decoder.onmessage = ({ data }) => { const p = pending.get(data.id); if (!p) return; pending.delete(data.id); data.error ? p.reject(Error(data.error)) : p.resolve(data.codes); };
  decoder.onerror = event => { for (const p of pending.values()) p.reject(Error(event.message || 'The barcode reader could not start.')); pending.clear(); };
  const canvas = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
  return {
    canvas, checkAbort: () => signal.throwIfAborted(), close,
    hash: async bytes => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), n => n.toString(16).padStart(2, '0')).join(''),
    png: async c => { const blob = await new Promise(resolve => c.toBlob(resolve, 'image/png')); if (!blob) throw Error('The page preview could not be exported.'); return new Uint8Array(await blob.arrayBuffer()); },
    decode: (pixels, options) => new Promise((resolve, reject) => { signal.throwIfAborted(); const id = ++sequence; pending.set(id, { resolve, reject }); decoder.postMessage({ id, pixels, options }); }),
    async open(file) {
      if (/\.pdf$/i.test(file.name)) {
        const base = new URL('./vendor/pdfjs/', import.meta.url).href;
        const task = pdfjs.getDocument({ data: new Uint8Array(file.bytes), isEvalSupported: false, stopAtErrors: true, useSystemFonts: false, standardFontDataUrl: base + 'standard_fonts/', cMapUrl: base + 'cmaps/', cMapPacked: true, wasmUrl: base + 'wasm/' });
        const abort = () => { task.destroy().catch(() => {}); }; signal.addEventListener('abort', abort, { once: true });
        let pdf; try { pdf = await task.promise; } catch (error) { signal.removeEventListener('abort', abort); await task.destroy(); signal.throwIfAborted(); throw error; }
        return { count: pdf.numPages, close: async () => { signal.removeEventListener('abort', abort); await task.destroy(); }, async render(n) {
          signal.throwIfAborted(); const page = await pdf.getPage(n), scale = LIMITS.pdfDpi / 72, viewport = page.getViewport({ scale });
          if (Math.ceil(viewport.width) * Math.ceil(viewport.height) > LIMITS.pagePixels) throw Error('This PDF page exceeds 24 million pixels at 200 DPI. Reduce its size.');
          const c = canvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
          try { await page.render({ canvasContext: c.getContext('2d'), viewport, background: '#ffffff' }).promise; } finally { page.cleanup(); }
          return { canvas: c, scale };
        } };
      }
      const image = await createImageBitmap(new Blob([file.bytes]));
      if (image.width * image.height > LIMITS.pagePixels) { image.close(); throw Error('This image exceeds 24 million pixels. Reduce its size.'); }
      return { count: 1, close: async () => image.close(), render: async () => { signal.throwIfAborted(); const c = canvas(image.width, image.height), ctx = c.getContext('2d'); ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, c.width, c.height); ctx.drawImage(image, 0, 0); return { canvas: c, scale: 1 }; } };
    }
  };
}
