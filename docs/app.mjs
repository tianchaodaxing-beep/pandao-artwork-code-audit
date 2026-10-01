import { packetZip } from './packet.mjs';
import { parseManifest, escapeHtml as e, LIMITS } from './core.mjs';
import { runAudit } from './engine.mjs';
const $ = id => document.getElementById(id);
let report, previews = new Map(), urls = [], controller, selected, busy = false;
function message(text, error = false) { $('status').textContent = text; $('status').classList.toggle('error', error); }
function updateInputs() { $('manifest-name').textContent = $('manifest').files[0]?.name ?? 'No approved list selected'; $('artwork-name').textContent = Array.from($('artwork').files, f => f.name).join(', ') || 'Select one or more artwork files'; $('run').disabled = busy || !$('manifest').files.length || !$('artwork').files.length; }
function setBusy(value) { busy = value; $('sample').disabled = value; $('manifest').disabled = value; $('artwork').disabled = value; $('cancel').hidden = !value; updateInputs(); }
function clear() { urls.forEach(URL.revokeObjectURL); urls = []; report = undefined; previews = new Map(); $('results').hidden = true; $('detail').replaceChildren(); $('pages').replaceChildren(); }
function renderList() {
  const pages = report.pages.filter(p => $('filter').value === 'all' || p.status === $('filter').value);
  $('pages').innerHTML = pages.map(p => '<button class="page-button" data-id="' + p.id + '" aria-pressed="' + (p.id === selected) + '"><span class="badge ' + p.status + '">' + p.status.toUpperCase() + '</span><strong>' + e(p.file) + ' · Page ' + p.page + '</strong><small>' + e(p.sku || 'Not in approved list') + '</small></button>').join('') || '<p>No pages in this view.</p>';
  if (!pages.some(p => p.id === selected)) selected = pages[0]?.id;
  $('pages').querySelectorAll('button').forEach(b => { b.setAttribute('aria-pressed', String(b.dataset.id === selected)); b.onclick = () => { selected = b.dataset.id; renderList(); }; });
  renderDetail();
}
function renderDetail() {
  const p = report.pages.find(p => p.id === selected);
  if (!p) { $('detail').innerHTML = '<p>No pages in this view.</p>'; return; }
  $('detail').innerHTML = '<h3>' + e(p.file) + ' · Page ' + p.page + '</h3><p>SKU: ' + e(p.sku || 'Not listed') + ' · Approved GTIN: ' + e(p.approvedGtin || 'Not listed') + '</p>' + (p.issues.length ? '<ul>' + p.issues.map(i => '<li><strong>' + e(i.code) + '</strong> — ' + e(i.message) + '</li>').join('') + '</ul>' : '<p>Supported code data matches the approved product and expected counts.</p>') + (previews.has(p.id) ? '<img alt="Artwork with numbered decoded codes">' : '<p>No preview available for this page.</p>') + '<ol>' + p.codes.map(c => '<li><strong>' + e(c.format) + '</strong><br><code>' + e(c.text) + '</code></li>').join('') + '</ol>';
  const img = $('detail').querySelector('img'); if (img) { const url = URL.createObjectURL(new Blob([previews.get(p.id)], { type: 'image/png' })); urls.push(url); img.src = url; }
}
async function audit(prepare) {
  if (busy) return;
  clear(); setBusy(true); message('Opening artwork…');
  const active = controller = new AbortController(); let adapter;
  try {
        const { manifest, files } = await prepare(active.signal); active.signal.throwIfAborted(); parseManifest(manifest);
        const { createAdapter } = await import('./browser-adapter.mjs'); adapter = createAdapter(active.signal);
        const data = await runAudit(manifest, files, adapter, progress => message('Reading ' + progress.file + ' · Page ' + progress.page));
        active.signal.throwIfAborted(); report = data.report; previews = data.previews; selected = report.pages.find(p => p.status === 'review')?.id || report.pages[0].id;
        $('total').textContent = report.summary.pages; $('matched').textContent = report.summary.matched; $('review').textContent = report.summary.review; $('filter').value = 'all'; $('results').hidden = false;
        renderList(); message('Audit complete. ' + report.summary.suppliedPages + ' supplied pages · ' + report.summary.review + ' review items.');
  } catch (error) { if (!active.signal.aborted) message(error.message, true); }
  finally { adapter?.close(); if (controller === active) { controller = undefined; setBusy(false); } }
}
$('manifest').onchange = updateInputs; $('artwork').onchange = updateInputs; $('filter').onchange = renderList;
$('run').onclick = () => audit(async signal => {
  const manifest = $('manifest').files[0], files = Array.from($('artwork').files); if (manifest.size > LIMITS.manifestBytes) throw Error('The approved CSV must be under 1 MB.');
  if (files.some(f => f.size > LIMITS.fileBytes) || files.reduce((n, f) => n + f.size, 0) > LIMITS.totalBytes) throw Error('Use at most 100 MB per artwork file and 300 MB per batch.');
  const data = { manifest: await manifest.text(), files: await Promise.all(files.map(async f => ({ name: f.name, bytes: new Uint8Array(await f.arrayBuffer()) }))) }; signal.throwIfAborted(); return data;
});
$('sample').onclick = () => audit(async signal => {
  message('Loading the synthetic sample…');
  const [csv, pdf] = await Promise.all([fetch('samples/approved.csv', { signal }), fetch('samples/proofs.pdf', { signal })]); if (!csv.ok || !pdf.ok) throw Error('The sample could not be loaded. Download the sample files and select them manually.');
  return { manifest: await csv.text(), files: [{ name: 'proofs.pdf', bytes: new Uint8Array(await pdf.arrayBuffer()) }] };
});
$('cancel').onclick = () => { controller?.abort(); clear(); message('Audit cancelled. Choose files to start again.'); };
$('download').onclick = () => { try { const url = URL.createObjectURL(new Blob([packetZip(report, previews)], { type: 'application/zip' })), a = document.createElement('a'); a.href = url; a.download = 'artwork-review.zip'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 30000); message('Review packet ready. Open review.html from the extracted folder.'); } catch (error) { message(error.message, true); } };
