/*
 * Payroll Studio: minimal PDF 1.4 writer for template ops.
 * Real, selectable text in the standard Helvetica fonts (WinAnsiEncoding); JPEG logos.
 * No dependencies. Output: Uint8Array.
 */
(function (root) {
  'use strict';

  const WIN = { '€': 0x80, '‚': 0x82, '„': 0x84, '…': 0x85, '†': 0x86, '‡': 0x87, '‘': 0x91, '’': 0x92, '“': 0x93, '”': 0x94, '•': 0x95, '–': 0x96, '—': 0x97, '™': 0x99 };

  // PDF literal string, WinAnsi bytes; non-ASCII written as octal escapes so the file stays 7-bit
  function pdfString(s) {
    let out = '(';
    for (const ch of String(s)) {
      let code = ch.codePointAt(0);
      if (WIN[ch]) code = WIN[ch];
      else if (code > 255) code = 63; // '?'
      if (ch === '\\' || ch === '(' || ch === ')') out += '\\' + ch;
      else if (code < 32 || code > 126) out += '\\' + code.toString(8).padStart(3, '0');
      else out += String.fromCharCode(code);
    }
    return out + ')';
  }
  const n = (v) => { const r = Math.round(v * 1000) / 1000; return String(Object.is(r, -0) ? 0 : r); };
  function rgb(hex) {
    const h = String(hex || '#000000').replace('#', '');
    const f = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
    return [0, 2, 4].map((i) => n(parseInt(f.slice(i, i + 2), 16) / 255)).join(' ');
  }
  function base64ToBytes(b64) {
    const bin = root.atob(b64);
    const u = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    return u;
  }
  // JPEG pixel size + component count from the SOF marker
  function jpegInfo(bytes) {
    let i = 2;
    while (i < bytes.length) {
      if (bytes[i] !== 0xff) { i++; continue; }
      const marker = bytes[i + 1];
      const len = (bytes[i + 2] << 8) | bytes[i + 3];
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return { h: (bytes[i + 5] << 8) | bytes[i + 6], w: (bytes[i + 7] << 8) | bytes[i + 8], comps: bytes[i + 9] };
      }
      i += 2 + len;
    }
    throw new Error('Unreadable JPEG');
  }
  const pdfDate = (d) => 'D:' + d.toISOString().replace(/[-:T]/g, '').slice(0, 14) + 'Z';

  /**
   * @param {{pages:{ops:any[]}[]}} doc  output of a template's render()
   * @param {{title?,author?,subject?,creator?,createdAt?:Date}} meta
   */
  function buildPdf(doc, meta = {}) {
    const H = 792, Wp = 612;
    const objects = []; // index+1 = object number; entries are arrays of string|Uint8Array
    const add = (parts) => { objects.push(parts); return objects.length; };
    const reserve = () => { objects.push(null); return objects.length; };

    const catalogId = reserve(), pagesId = reserve();
    const fR = add(['<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>']);
    const fB = add(['<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>']);

    const images = new Map(); // dataUrl → {name, id}
    const pageIds = [];
    for (const page of doc.pages) {
      const used = new Set();
      let c = '';
      for (const op of page.ops) {
        if (op.t === 'rect') {
          const y = H - op.y - op.h;
          if (op.fill) c += rgb(op.fill) + ' rg ' + [op.x, y, op.w, op.h].map(n).join(' ') + ' re f\n';
          if (op.stroke) c += rgb(op.stroke) + ' RG ' + n(op.lw || 0.5) + ' w [] 0 d ' + [op.x, y, op.w, op.h].map(n).join(' ') + ' re S\n';
        } else if (op.t === 'line') {
          c += rgb(op.c) + ' RG ' + n(op.lw || 0.5) + ' w ' + (op.dash ? '[2 2] 0 d ' : '[] 0 d ') +
            n(op.x1) + ' ' + n(H - op.y1) + ' m ' + n(op.x2) + ' ' + n(H - op.y2) + ' l S\n';
        } else if (op.t === 'text') {
          const width = root.PayrollCore.measureText(op.text, op.s, op.f);
          const x = op.align === 'right' ? op.x - width : op.align === 'center' ? op.x - width / 2 : op.x;
          let tm;
          if (op.rot) {
            const a = (op.rot * Math.PI) / 180, cs = Math.cos(a), sn = Math.sin(a);
            tm = [cs, sn, -sn, cs, x, H - op.y].map(n).join(' ');
          } else tm = '1 0 0 1 ' + n(x) + ' ' + n(H - op.y);
          c += 'BT /' + (op.f === 'B' ? 'F2' : 'F1') + ' ' + n(op.s) + ' Tf ' + rgb(op.c) + ' rg ' + tm + ' Tm ' + pdfString(op.text) + ' Tj ET\n';
        } else if (op.t === 'image') {
          let img = images.get(op.src);
          if (!img) {
            const m = /^data:image\/jpe?g;base64,(.*)$/.exec(op.src || '');
            if (!m) continue; // only JPEG is embedded; the app converts uploads to JPEG
            const bytes = base64ToBytes(m[1]);
            const info = jpegInfo(bytes);
            const cs = info.comps === 1 ? '/DeviceGray' : info.comps === 4 ? '/DeviceCMYK' : '/DeviceRGB';
            const id = add(['<< /Type /XObject /Subtype /Image /Width ' + info.w + ' /Height ' + info.h + ' /ColorSpace ' + cs +
              ' /BitsPerComponent 8 /Filter /DCTDecode' + (info.comps === 4 ? ' /Decode [1 0 1 0 1 0 1 0]' : '') + ' /Length ' + bytes.length + ' >>\nstream\n', bytes, '\nendstream']);
            img = { name: 'Im' + (images.size + 1), id };
            images.set(op.src, img);
          }
          used.add(img);
          c += 'q ' + [op.w, 0, 0, op.h, op.x, H - op.y - op.h].map(n).join(' ') + ' cm /' + img.name + ' Do Q\n';
        }
      }
      const contentId = add(['<< /Length ' + c.length + ' >>\nstream\n' + c + 'endstream']);
      const xo = used.size ? ' /XObject << ' + [...used].map((i) => '/' + i.name + ' ' + i.id + ' 0 R').join(' ') + ' >>' : '';
      pageIds.push(add(['<< /Type /Page /Parent ' + pagesId + ' 0 R /MediaBox [0 0 ' + Wp + ' ' + H + '] /Resources << /Font << /F1 ' + fR + ' 0 R /F2 ' + fB + ' 0 R >>' + xo + ' >> /Contents ' + contentId + ' 0 R >>']));
    }
    objects[pagesId - 1] = ['<< /Type /Pages /Kids [' + pageIds.map((i) => i + ' 0 R').join(' ') + '] /Count ' + pageIds.length + ' >>'];
    objects[catalogId - 1] = ['<< /Type /Catalog /Pages ' + pagesId + ' 0 R >>'];
    const when = pdfDate(meta.createdAt || new Date());
    const infoId = add(['<< /Title ' + pdfString(meta.title || 'Earnings statement') + ' /Author ' + pdfString(meta.author || '') +
      ' /Subject ' + pdfString(meta.subject || '') + ' /Creator ' + pdfString(meta.creator || 'Payroll Studio') +
      ' /Producer (Payroll Studio PDF writer) /CreationDate (' + when + ') /ModDate (' + when + ') >>']);

    // Serialize; every string part is 7-bit so its length equals its byte length
    const chunks = [];
    let offset = 0;
    const push = (p) => { const b = typeof p === 'string' ? latin1(p) : p; chunks.push(b); offset += b.length; };
    push('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');
    const offsets = [];
    objects.forEach((parts, i) => {
      offsets.push(offset);
      push((i + 1) + ' 0 obj\n');
      parts.forEach(push);
      push('\nendobj\n');
    });
    const xref = offset;
    let x = 'xref\n0 ' + (objects.length + 1) + '\n0000000000 65535 f \n';
    for (const o of offsets) x += String(o).padStart(10, '0') + ' 00000 n \n';
    push(x + 'trailer\n<< /Size ' + (objects.length + 1) + ' /Root ' + catalogId + ' 0 R /Info ' + infoId + ' 0 R >>\nstartxref\n' + xref + '\n%%EOF\n');

    const out = new Uint8Array(offset);
    let p = 0;
    for (const b of chunks) { out.set(b, p); p += b.length; }
    return out;
  }
  function latin1(s) {
    const u = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i) & 0xff;
    return u;
  }

  const api = { buildPdf, pdfString };
  root.PayrollCore = Object.assign(root.PayrollCore || {}, api);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

