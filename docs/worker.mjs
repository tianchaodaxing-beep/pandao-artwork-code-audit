import { prepareZXingModule, readBarcodes } from './vendor/zxing/reader/index.js';
const ready = prepareZXingModule({ overrides: { locateFile: name => new URL('./vendor/zxing/' + name, import.meta.url).href }, fireImmediately: true });
self.onmessage = async ({ data }) => {
  try { await ready; const decoded = await readBarcodes(data.pixels, data.options); self.postMessage({ id: data.id, codes: decoded.map(c => ({ format: c.format, text: c.text, position: c.position, rotation: c.rotation, isValid: c.isValid, error: c.error })) }); }
  catch (error) { self.postMessage({ id: data.id, error: error.message }); }
};
