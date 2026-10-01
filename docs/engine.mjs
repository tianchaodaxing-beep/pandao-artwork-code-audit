import { LIMITS, parseManifest, auditPages, classify } from './core.mjs';
export const decodeOptions = { formats: [], tryHarder: true, tryRotate: true, tryInvert: true, maxNumberOfSymbols: 0, textMode: 'Plain', returnErrors: true };
export function checkInputs(files) {
  if (!files.length) throw Error('Choose at least one PDF, PNG or JPEG artwork file.');
  let total = 0; const names = new Set();
  for (const f of files) {
    if (!/\.(pdf|png|jpe?g)$/i.test(f.name)) throw Error('Use PDF, PNG or JPEG artwork: ' + f.name);
    if (names.has(f.name.toLowerCase())) throw Error('Artwork filenames must be unique: ' + f.name);
    names.add(f.name.toLowerCase()); total += f.bytes.length;
    if (!f.bytes.length || f.bytes.length > LIMITS.fileBytes) throw Error('Each artwork file must be nonempty and at most 100 MB.');
  }
  if (total > LIMITS.totalBytes) throw Error('Split artwork batches larger than 300 MB.');
}
export async function runAudit(manifestText, files, adapter, progress = () => {}) {
  const manifest = parseManifest(manifestText); checkInputs(files);
  const inputs = [{ name: 'approved.csv', bytes: new TextEncoder().encode(manifestText).length, sha256: await adapter.hash(new TextEncoder().encode(manifestText)), role: 'manifest' }];
  const pages = [], previews = new Map(); let processed = 0;
  for (const file of files) {
    adapter.checkAbort?.();
    inputs.push({ name: file.name, bytes: file.bytes.length, sha256: await adapter.hash(file.bytes), role: 'artwork' });
    let source;
    try { source = await adapter.open(file); } catch (error) { throw Error('Cannot open ' + file.name + ': ' + error.message); }
    try {
      if (processed + source.count > LIMITS.pages) throw Error('Split batches with more than 200 artwork pages.');
      for (let n = 1; n <= source.count; n++) {
        adapter.checkAbort?.();
        const id = 'page-' + String(++processed).padStart(4, '0'); progress({ file: file.name, page: n, processed });
        let canvas;
        try {
          const rendered = await source.render(n); canvas = rendered.canvas;
          if (canvas.width * canvas.height > LIMITS.pagePixels) throw Error('This page exceeds 24 million pixels. Reduce the artwork size.');
          const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height);
          const decoded = await adapter.decode(pixels, decodeOptions);
          const codes = decoded.map(c => ({ format: c.format, text: c.text, position: c.position, rotation: c.rotation, decodeError: c.isValid === false ? c.error || 'The barcode decoder reported an invalid symbol.' : '' }));
          const pixelHash = await adapter.hash(new Uint8Array(pixels.data.buffer, pixels.data.byteOffset, pixels.data.byteLength));
          pages.push({ id, file: file.name, page: n, width: canvas.width, height: canvas.height, renderScale: rendered.scale, pixelHash, codes });
          previews.set(id, await annotatedPreview(canvas, codes, adapter));
        } catch (error) {
          if (error.name === 'AbortError') throw error;
          pages.push({ id, file: file.name, page: n, codes: [], error: error.message });
        } finally { if (canvas) { canvas.width = 1; canvas.height = 1; } }
      }
    } finally { await source.close(); }
  }
  adapter.checkAbort?.(); return { report: auditPages(manifest, pages, inputs), previews };
}
export async function annotatedPreview(canvas, codes, adapter) {
  const scale = Math.min(1, 1100 / Math.max(canvas.width, canvas.height));
  const view = adapter.canvas(Math.max(1, Math.round(canvas.width * scale)), Math.max(1, Math.round(canvas.height * scale))), ctx = view.getContext('2d');
  ctx.drawImage(canvas, 0, 0, view.width, view.height); ctx.lineWidth = 3; ctx.font = 'bold 16px sans-serif';
  codes.forEach((code, i) => {
    const p = code.position; if (!p) return;
    const points = [p.topLeft, p.topRight, p.bottomRight, p.bottomLeft].map(q => ({ x: q.x * scale, y: q.y * scale }));
    ctx.strokeStyle = classify(code).kind === 'unsupported' ? '#c04424' : '#00786a'; ctx.beginPath(); points.forEach((q, j) => j ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y)); ctx.closePath(); ctx.stroke();
    const x = Math.max(0, Math.min(view.width - 28, points[0].x)), y = Math.max(18, points[0].y - 4);
    ctx.fillStyle = ctx.strokeStyle; ctx.fillRect(x, y - 18, 27, 22); ctx.fillStyle = '#ffffff'; ctx.fillText(String(i + 1), x + 6, y - 1);
  });
  const png = await adapter.png(view); view.width = 1; view.height = 1; return png;
}
