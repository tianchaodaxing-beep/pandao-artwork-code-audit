import { reportCsv, escapeHtml as e } from './core.mjs';
import { zipBytes } from './zip.mjs';
export function packetFiles(report, previews) {
  const files = [
    { name: 'report.json', text: JSON.stringify(report, null, 2) + '\n' },
    { name: 'issues.csv', text: reportCsv(report) },
    { name: 'READ-ME.txt', text: 'Artwork Code Audit\n\nOpen review.html beside the previews folder. Compare each result with your approved product data. Matched means supported code data agrees with the CSV; it is not a print-quality grade or GS1 certification. An unreadable, hidden, cropped or unsupported code needs manual review. This tool does not visit code URLs or modify artwork. Source input fingerprints are in report.json.\n\nContact: tianchaodaxing@gmail.com\n' }
  ];
  for (const [id, bytes] of previews) files.push({ name: 'previews/' + id + '.png', bytes });
  files.push({ name: 'review.html', text: reviewHtml(report, previews) }); return files;
}
export const packetZip = (report, previews) => zipBytes(packetFiles(report, previews));
function reviewHtml(report, previews) {
  return '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Artwork code review</title><style>body{font:16px system-ui;max-width:1100px;margin:32px auto;padding:0 20px;background:#f7f8f5;color:#152e29}article{background:white;border:1px solid #cad8cf;padding:24px;margin:20px 0;border-radius:12px}img{max-width:100%;max-height:680px}li{margin:8px 0}code{overflow-wrap:anywhere}small{color:#52645a}</style><h1>Artwork code review</h1><p>' + report.summary.matched + ' matched · ' + report.summary.review + ' need review · ' + report.summary.suppliedPages + ' supplied pages</p><p>Review flagged pages before approving your artwork. Matched describes code data, not printed quality.</p>' + report.pages.map(p => '<article><h2>' + e(p.file) + ' · Page ' + p.page + ' · ' + e(p.status.toUpperCase()) + '</h2><p>SKU: ' + e(p.sku || 'Not listed') + ' · Approved GTIN: ' + e(p.approvedGtin || 'Not listed') + '</p><ul>' + p.issues.map(i => '<li><strong>' + e(i.code) + '</strong>: ' + e(i.message) + '</li>').join('') + '</ul>' + (previews.has(p.id) ? '<img alt="Artwork with numbered decoded codes" src="previews/' + p.id + '.png">' : '<p>No page preview available.</p>') + '<ol>' + p.codes.map(c => '<li><strong>' + e(c.format) + '</strong> · <code>' + e(c.text) + '</code></li>').join('') + '</ol></article>').join('') + '<footer><a href="mailto:tianchaodaxing@gmail.com">Contact PANDAO</a></footer></html>';
}
