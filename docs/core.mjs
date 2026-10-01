export const VERSION = '0.1.1';
export const LIMITS = { fileBytes: 100_000_000, totalBytes: 300_000_000, manifestBytes: 1_000_000, pages: 200, pagePixels: 24_000_000, pdfDpi: 200, rows: 2000 };
export function csvRows(text) {
  if (new TextEncoder().encode(text).length > LIMITS.manifestBytes) throw Error('The approved CSV must be under 1 MB.');
  text = text.replace(/^\uFEFF/, '');
  const rows = []; let row = [], value = '', quoted = false, closed = false;
  const push = () => { row.push(value); value = ''; closed = false; };
  for (let i = 0; i <= text.length; i++) {
    const c = text[i];
    if (quoted) { if (c === undefined) throw Error('The CSV has an unclosed quoted cell.'); if (c === '"') { if (text[i + 1] === '"') { value += '"'; i++; } else { quoted = false; closed = true; } } else value += c; continue; }
    if (c === '"') { if (value || closed) throw Error('A CSV quote must begin an empty cell.'); quoted = true; continue; }
    if (c === ',' || c === '\n' || c === '\r' || c === undefined) { push(); if (c !== ',') { if (row.some(x => x.trim())) rows.push(row); row = []; if (c === '\r' && text[i + 1] === '\n') i++; } }
    else { if (closed) throw Error('Unexpected text after a quoted CSV cell.'); value += c; }
  }
  if (rows.length > LIMITS.rows + 1) throw Error('The approved CSV may contain up to 2,000 product rows.');
  return rows;
}
export function normalizeGtin(value) {
  if (typeof value !== 'string' || !/^(?:\d{8}|\d{12}|\d{13}|\d{14})$/.test(value)) throw Error('Use an 8, 12, 13 or 14 digit GTIN as text. Do not use scientific notation.');
  let sum = 0;
  for (let i = value.length - 2, weight = 3; i >= 0; i--, weight = 4 - weight) sum += Number(value[i]) * weight;
  if ((10 - sum % 10) % 10 !== Number(value.at(-1))) throw Error('The GTIN check digit is incorrect: ' + value);
  return value.padStart(14, '0');
}
export function parseManifest(text) {
  const rows = csvRows(text), headers = rows.shift()?.map(x => x.trim());
  const allowed = ['file', 'page', 'sku', 'gtin', 'linear_count', 'link_count', 'link_host'];
  if (!headers || new Set(headers).size !== headers.length || headers.some(x => !allowed.includes(x)) || ['file', 'page', 'sku', 'gtin'].some(x => !headers.includes(x))) throw Error('CSV columns: file,page,sku,gtin,linear_count,link_count,link_host. The first four are required.');
  if (!rows.length) throw Error('The approved CSV needs at least one product row.');
  const seen = new Set();
  return rows.map((cells, index) => {
    if (cells.length !== headers.length) throw Error('CSV row ' + (index + 2) + ' has the wrong number of cells.');
    const row = Object.fromEntries(headers.map((name, i) => [name, cells[i].trim()]));
    if (!row.file || row.file.length > 180 || /[\/\\\x00-\x1F]/.test(row.file) || ['.', '..'].includes(row.file)) throw Error('CSV file values must be filenames without folders or control characters.');
    if (!/^[1-9]\d*$/.test(row.page) || Number(row.page) > LIMITS.pages) throw Error('CSV page numbers start at 1 and may be up to 200.');
    if (!row.sku || row.sku.length > 160 || /[\x00-\x1F]/.test(row.sku)) throw Error('Each CSV row needs a SKU under 160 characters.');
    const gtin = normalizeGtin(row.gtin), key = row.file.toLowerCase() + ':' + row.page;
    if (seen.has(key)) throw Error('The CSV repeats a file/page: ' + row.file + ', ' + row.page); seen.add(key);
    const count = name => { const value = row[name] || '1'; if (!/^(?:0|[1-9]\d*)$/.test(value) || Number(value) > 16) throw Error('Barcode counts must be whole numbers from 0 to 16.'); return Number(value); };
    const linearCount = count('linear_count'), linkCount = count('link_count');
    if (!linearCount && !linkCount) throw Error('A product row must expect at least one barcode.');
    const linkHost = row.link_host?.toLowerCase() || '';
    if (linkHost && !/^(?:[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?)(?::[1-9]\d{0,4})?$/.test(linkHost)) throw Error('link_host must be a host such as id.example.com, without a URL path.');
    return { file: row.file, page: Number(row.page), sku: row.sku, gtin, linearCount, linkCount, linkHost };
  });
}
export function digitalLink(text) {
  let url; try { url = new URL(text); } catch { throw Error('This 2D code does not contain an uncompressed GS1 Digital Link URL.'); }
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.hash) throw Error('Use an HTTP(S) Digital Link without credentials or a fragment.');
  const parts = url.pathname.split('/').filter(Boolean), positions = parts.flatMap((x, i) => x === '01' ? [i] : []);
  if (positions.length !== 1 || !/^\d{14}$/.test(parts[positions[0] + 1] ?? '') || url.searchParams.has('01')) throw Error('The Digital Link must have one /01/ followed by a 14 digit GTIN. Compressed links are not supported.');
  return { gtin: normalizeGtin(parts[positions[0] + 1]), host: url.host.toLowerCase(), url: url.href };
}
export function classify(code) {
  try {
    if (code.decodeError) throw Error(code.decodeError);
    const format = code.format.replace(/[-_ ]/g, '').toLowerCase();
    if (['ean8', 'ean13', 'upca'].includes(format)) {
      const length = { ean8: 8, ean13: 13, upca: 12 }[format];
      if (code.text.length !== length) throw Error('The decoded digit count does not match ' + code.format + '.');
      return { kind: 'linear', gtin: normalizeGtin(code.text), host: '' };
    }
    if (['qrcode', 'datamatrix'].includes(format)) return { kind: 'link', ...digitalLink(code.text) };
    return { kind: 'unsupported', reason: 'This barcode format is outside the supported comparison: ' + code.format };
  } catch (error) { return { kind: 'unsupported', reason: error.message }; }
}
export function auditPages(manifest, pages, inputs) {
  if (!pages.length) throw Error('No artwork pages could be read.');
  const key = (file, page) => file.toLowerCase() + ':' + page, expected = new Map(manifest.map(row => [key(row.file, row.page), row])), seen = new Set(), images = new Map(), results = [];
  for (const page of pages) {
    const pageKey = key(page.file, page.page);
    if (seen.has(pageKey)) throw Error('Duplicate input file/page: ' + page.file + ', ' + page.page); seen.add(pageKey);
    const row = expected.get(pageKey), issues = [], codes = (page.codes ?? []).map(code => ({ ...code, ...classify(code) }));
    if (!row) issues.push({ code: 'UNLISTED_PAGE', message: 'This artwork page has no approved CSV row.' });
    if (page.error) issues.push({ code: 'PAGE_ERROR', message: page.error });
    if (page.pixelHash) { const imageKey = page.width + ':' + page.height + ':' + page.pixelHash, previous = images.get(imageKey); if (previous) { issues.push({ code: 'DUPLICATE_ARTWORK', message: 'The rendered page is identical to ' + previous + '. Review whether this repeat is intended.' }); const first = results.find(x => x.id === previous); first.issues.push({ code: 'DUPLICATE_ARTWORK', message: 'The rendered page is repeated by ' + page.id + '.' }); first.status = 'review'; } else images.set(imageKey, page.id); }
    for (const code of codes) {
      if (code.kind === 'unsupported') issues.push({ code: 'UNSUPPORTED_CODE', message: code.reason });
      else if (row && code.gtin !== row.gtin) issues.push({ code: 'WRONG_PRODUCT', message: 'Decoded GTIN ' + code.gtin + ' differs from approved ' + row.gtin + '.' });
      if (row?.linkHost && code.kind === 'link' && code.host !== row.linkHost) issues.push({ code: 'WRONG_HOST', message: 'Digital Link host ' + code.host + ' differs from approved ' + row.linkHost + '.' });
    }
    const linears = codes.filter(c => c.kind === 'linear'), links = codes.filter(c => c.kind === 'link');
    if (row) { if (linears.length !== row.linearCount) issues.push({ code: 'LINEAR_COUNT', message: `Expected ${row.linearCount} readable linear codes; found ${linears.length}.` }); if (links.length !== row.linkCount) issues.push({ code: 'LINK_COUNT', message: `Expected ${row.linkCount} readable Digital Link codes; found ${links.length}.` }); }
    if (new Set([...linears, ...links].map(c => c.gtin)).size > 1) issues.push({ code: 'CODE_DISAGREEMENT', message: 'The supported barcodes on this page identify different products.' });
    results.push({ id: page.id, file: page.file, page: page.page, sku: row?.sku ?? '', approvedGtin: row?.gtin ?? '', expectedCounts: row ? { linear: row.linearCount, link: row.linkCount } : null, width: page.width, height: page.height, renderScale: page.renderScale, pixelHash: page.pixelHash, codes, issues, status: issues.length ? 'review' : 'matched' });
  }
  for (const row of manifest) if (!seen.has(key(row.file, row.page))) results.push({ id: 'missing-' + String(results.length + 1).padStart(4, '0'), file: row.file, page: row.page, sku: row.sku, approvedGtin: row.gtin, expectedCounts: { linear: row.linearCount, link: row.linkCount }, codes: [], issues: [{ code: 'MISSING_PAGE', message: 'The approved artwork file or page was not supplied.' }], status: 'review' });
  return { version: VERSION, policy: LIMITS, inputs, summary: { pages: results.length, suppliedPages: pages.length, matched: results.filter(x => x.status === 'matched').length, review: results.filter(x => x.status === 'review').length }, pages: results };
}
export const escapeHtml = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const cell = value => '"' + (/^[=+\-@\t\r]/.test(String(value)) ? "'" : '') + String(value).replace(/"/g, '""') + '"';
export function reportCsv(report) {
  return 'file,page,sku,approved_gtin,status,linear_codes,digital_link_codes,issues\n' + report.pages.map(p => [p.file, p.page, p.sku, p.approvedGtin, p.status, p.codes.filter(c => c.kind === 'linear').map(c => c.text).join(';'), p.codes.filter(c => c.kind === 'link').map(c => c.text).join(';'), p.issues.map(i => i.code + ': ' + i.message).join(' | ')].map(cell).join(',')).join('\n') + '\n';
}
