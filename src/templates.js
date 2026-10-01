/*
 * Payroll Studio: pay-stub template registry.
 * A template turns a formatted view (buildStubView) into drawing ops on US Letter
 * pages (612 × 792 pt, y measured from the top). The on-screen preview and the PDF
 * writer both draw these same ops, so the preview matches the PDF.
 *
 * Ops:
 *   {t:'text', x, y(baseline), s(size pt), f:'R'|'B', c:'#rrggbb', text, align:'left'|'right'|'center', rot?}
 *   {t:'rect', x, y, w, h, fill?, stroke?, lw?}
 *   {t:'line', x1, y1, x2, y2, c, lw, dash?}
 *   {t:'image', x, y, w, h, src(JPEG data URL)}
 */
(function (root) {
  'use strict';

  const PAGE = { w: 612, h: 792 };

  // Helvetica / Helvetica-Bold advance widths (Adobe AFM), chars 32–126, per 1000 em
  const W_R = [278,278,355,556,556,889,667,191,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,278,278,584,584,584,556,1015,667,667,722,722,667,611,778,722,278,500,667,556,833,722,778,667,778,722,667,611,722,667,944,667,667,611,278,278,278,469,556,333,556,556,500,556,556,278,556,556,222,222,500,222,833,556,556,556,556,333,500,278,556,500,722,500,500,500,334,260,334,584];
  const W_B = [278,333,474,556,556,889,722,238,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,333,333,584,584,584,611,975,722,722,722,722,667,611,778,722,278,556,722,611,833,722,778,667,778,722,667,611,722,667,944,667,667,611,333,278,333,584,556,333,556,611,556,611,556,333,611,611,278,278,556,278,889,611,611,611,611,389,556,333,611,556,778,556,556,500,389,280,389,584];
  const W_EXTRA = { '•': 350, '–': 556, '—': 1000, '‘': 222, '’': 222, '“': 333, '”': 333, '×': 584, '©': 737, '·': 278, '…': 1000, '€': 556 };

  function charWidth(ch, bold) {
    const code = ch.charCodeAt(0);
    const table = bold ? W_B : W_R;
    if (code >= 32 && code <= 126) return table[code - 32];
    if (W_EXTRA[ch]) return bold && ch === '’' ? 278 : W_EXTRA[ch];
    const base = ch.normalize('NFD').charAt(0); // accented letter → base letter width
    const bc = base.charCodeAt(0);
    if (bc >= 32 && bc <= 126) return table[bc - 32];
    return 556;
  }
  function measureText(text, size, font) {
    let w = 0;
    for (const ch of String(text)) w += charWidth(ch, font === 'B');
    return (w * size) / 1000;
  }
  function fit(text, size, font, maxW) {
    text = String(text == null ? '' : text);
    if (measureText(text, size, font) <= maxW) return text;
    while (text.length > 1 && measureText(text + '…', size, font) > maxW) text = text.slice(0, -1);
    return text.trimEnd() + '…';
  }
  function wrap(text, size, font, maxW) {
    const out = [];
    for (const para of String(text || '').split('\n')) {
      let line = '';
      for (const word of para.split(/\s+/)) {
        const next = line ? line + ' ' + word : word;
        if (measureText(next, size, font) <= maxW || !line) line = next; else { out.push(line); line = word; }
      }
      out.push(fit(line, size, font, maxW));
    }
    return out;
  }

  // ---------- view model (formatting only; no calculation) ----------
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const fmtDate = (s) => { if (!s) return '—'; const [y, m, d] = s.split('-').map(Number); return MONTHS[m - 1] + ' ' + d + ', ' + y; };
  const amt = (n) => { const v = Math.round((Number(n) || 0) * 100) / 100; return (v < 0 ? '-' : '') + Math.abs(v).toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); };
  const cur = (n) => { const s = amt(n); return s.startsWith('-') ? '-$' + s.slice(1) : '$' + s; };
  const hrs = (n) => (n == null ? '' : (Math.round(n * 100) / 100).toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
  const addrLines = (a) => (a ? [a.line1, a.line2, [a.city, a.province].filter(Boolean).join(', ') + (a.postal ? '  ' + a.postal : '')].filter((x) => x && x.trim()) : []);

  function buildStubView({ stub, employer, employee, result, generatedAt }) {
    const PC = root.PayrollCore || {};
    const freq = (PC.PAY_FREQUENCIES || {})[stub.period.frequency];
    const c = result.current, y = result.ytd;
    const earnings = result.lines.concat(result.ytdOnlyLines || []).map((l) => ({
      label: l.label + (l.kind === 'benefit' ? ' (non-cash)' : ''),
      hours: hrs(l.hours), rate: l.rate == null ? '' : amt(l.rate * (l.multiplier || 1)),
      current: l.amount ? amt(l.amount) : '', ytd: amt(l.ytd),
    }));
    const statutory = [
      ['Canada Pension Plan (CPP)', c.cpp, y.cpp],
      ['CPP second additional (CPP2)', c.cpp2, y.cpp2],
      ['Employment Insurance (EI)', c.ei, y.ei],
      ['Federal income tax', c.federalTax, y.federalTax],
      ['Provincial income tax', c.provincialTax, y.provincialTax],
    ].filter(([, cc, yy]) => cc || yy).map(([label, cc, yy]) => ({ label, current: amt(cc), ytd: amt(yy) }));
    const other = result.deductionLines.concat(result.ytdOnlyDeductions || []).map((d) => ({
      label: d.label + (d.type === 'rrsp' ? ' (pre-tax)' : d.type === 'union' ? ' (union dues)' : ''),
      current: d.amount ? amt(d.amount) : '', ytd: amt(d.ytd),
    }));
    const employerContribs = [
      ['CPP (employer)', c.employerCpp, y.employerCpp],
      ['CPP2 (employer)', c.employerCpp2, y.employerCpp2],
      ['EI (employer)', c.employerEi, y.employerEi],
    ].filter(([, cc, yy]) => cc || yy).map(([label, cc, yy]) => ({ label, current: amt(cc), ytd: amt(yy) }));
    const deposits = result.deposits.lines.map((d) => ({
      label: d.label || 'Account',
      detail: [d.institution, d.accountLast4 ? 'acct ••••' + d.accountLast4 : ''].filter(Boolean).join('  '),
      amount: cur(d.allocated),
    }));
    const src = result.paramsSource;
    return {
      status: stub.status, isDraft: stub.status !== 'finalized' && stub.status !== 'superseded', isSuperseded: stub.status === 'superseded',
      revision: stub.revision || 0, supersedesNumber: stub.supersedesNumber || '',
      stubNumber: stub.stubNumber || '(assigned at finalization)', recordId: stub.id,
      calcVersion: result.calcVersion, mode: result.mode,
      paramsLabel: result.mode === 'manual' ? 'Manual entry' : src ? src.title.replace('CRA T4127 Payroll Deductions Formulas, ', 'CRA T4127 ') + ' (eff. ' + src.effective + ')' : '',
      hashShort: stub.contentHash ? stub.contentHash.slice(0, 16) : 'not sealed',
      employer: {
        name: employer.legalName || employer.displayName || '[Employer name]',
        addressLines: addrLines(employer.address), bn: employer.businessNumber || '',
        contact: [employer.phone, employer.email].filter(Boolean).join('  ·  '), logo: employer.logo || null,
      },
      employee: {
        name: [employee.firstName, employee.lastName].filter(Boolean).join(' ') || '[Employee]',
        number: employee.employeeNumber || '', addressLines: addrLines(employee.address),
        department: employee.department || '', jobTitle: employee.jobTitle || '', province: employee.province || '',
      },
      period: { start: fmtDate(stub.period.start), end: fmtDate(stub.period.end), payday: fmtDate(stub.period.payday), frequency: freq ? freq.label : stub.period.frequency },
      earnings, statutory, other, employerContribs, deposits,
      payMethod: deposits.length ? 'Direct deposit' : 'Cheque',
      totals: {
        gross: cur(c.gross), deductions: cur(c.totalDeductions), net: cur(c.net),
        ytdGross: cur(y.gross), ytdDeductions: cur(y.totalDeductions), ytdNet: cur(y.net),
        grossA: amt(c.gross), dedA: amt(c.totalDeductions), netA: amt(c.net),
        ytdGrossA: amt(y.gross), ytdDedA: amt(y.totalDeductions), ytdNetA: amt(y.net),
        statCurA: amt(c.cpp + c.cpp2 + c.ei + c.tax), statYtdA: amt(y.cpp + y.cpp2 + y.ei + y.tax),
        otherCurA: amt(c.otherDeductions), otherYtdA: amt(y.otherDeductions),
        erCurA: amt(c.employerCpp + c.employerCpp2 + c.employerEi), erYtdA: amt(y.employerCpp + y.employerCpp2 + y.employerEi),
      },
      ytdSummary: [
        ['Gross earnings', 'Gross', y.gross], ['Taxable benefits', 'Benefits', y.benefits], ['CPP + CPP2', 'CPP + CPP2', y.cpp + y.cpp2], ['EI', 'EI', y.ei],
        ['Income tax', 'Income tax', y.tax], ['Other deductions', 'Other ded.', y.otherDeductions], ['Net pay', 'Net pay', y.net], ['Pay periods', 'Periods', null],
      ].map(([label, short, v]) => ({ label, short, value: v == null ? String((result.ytdPrior.periods || 0) + 1) : cur(v) })),
      memo: stub.memo || '',
      generatedAt: generatedAt || new Date().toISOString(),
    };
  }

  // ---------- drawing helper with pagination ----------
  function Canvas(opts) {
    const pages = [];
    let ops;
    const self = {
      top: opts.top, bottom: opts.bottom, y: 0,
      newPage() { ops = []; pages.push({ ops }); self.y = opts.onPage(self, pages.length) || self.top; },
      text(x, y, text, s, f, c, align, rot) { if (text !== '' && text != null) ops.push({ t: 'text', x, y, s, f: f || 'R', c: c || '#1d2327', text: String(text), align: align || 'left', rot }); },
      rect(x, y, w, h, fill, stroke, lw) { ops.push({ t: 'rect', x, y, w, h, fill, stroke, lw }); },
      line(x1, y1, x2, y2, c, lw, dash) { ops.push({ t: 'line', x1, y1, x2, y2, c, lw: lw || 0.5, dash }); },
      image(x, y, w, h, src) { ops.push({ t: 'image', x, y, w, h, src }); },
      need(h) { if (self.y + h > self.bottom) self.newPage(); },
      pages,
      finish(footer) { pages.forEach((p, i) => { ops = p.ops; footer(self, i + 1, pages.length); }); return { pages }; },
    };
    return self;
  }
  // Fit a logo into a box, preserving aspect ratio
  function logoBox(logo, x, y, w, h) {
    const k = Math.min(w / logo.w, h / logo.h);
    return { x, y: y + (h - logo.h * k) / 2, w: logo.w * k, h: logo.h * k };
  }

  // ---------- Template: Ledger (default) ----------
  const L = { ink: '#1d2327', mute: '#5b6469', teal: '#1f5f5b', tint: '#e9f0ef', ochre: '#8a5d17', rule: '#c9cfcc', faint: '#eef0ee' };
  const M = 40, RIGHT = PAGE.w - M, CW = PAGE.w - 2 * M;

  function ledger(v) {
    const d = Canvas({
      top: 60, bottom: 744,
      onPage(d, n) {
        if (v.isDraft || v.isSuperseded) d.text(PAGE.w / 2 - 150, 520, v.isDraft ? 'DRAFT · NOT FINAL' : 'SUPERSEDED', 46, 'B', '#e3e6e4', 'left', 35);
        if (n === 1) return null;
        d.text(M, 44, v.employer.name, 9, 'B', L.ink);
        d.text(RIGHT, 44, 'Earnings statement ' + v.stubNumber + ' · ' + v.employee.name + ' (continued)', 8, 'R', L.mute, 'right');
        d.line(M, 52, RIGHT, 52, L.teal, 1);
        return 72;
      },
    });
    d.newPage();

    // Header
    const logoW = 132, logoH = 52;
    if (v.employer.logo && v.employer.logo.dataUrl) {
      const b = logoBox(v.employer.logo, M, 36, logoW, logoH);
      d.image(b.x, b.y, b.w, b.h, v.employer.logo.dataUrl);
    } else {
      d.rect(M, 36, logoW, logoH, '#f6f7f6', L.rule, 0.75);
      d.text(M + logoW / 2, 36 + logoH / 2 + 3, 'YOUR LOGO', 8, 'B', '#7a8386', 'center');
    }
    const ex = M + logoW + 16;
    d.text(ex, 50, fit(v.employer.name, 13, 'B', 230), 13, 'B', L.ink);
    let ay = 63;
    for (const l of v.employer.addressLines) { d.text(ex, ay, fit(l, 8, 'R', 230), 8, 'R', L.mute); ay += 10.5; }
    if (v.employer.contact) d.text(ex, ay, fit(v.employer.contact, 8, 'R', 230), 8, 'R', L.mute);

    d.text(RIGHT, 50, 'EARNINGS STATEMENT', 15, 'B', L.teal, 'right');
    d.text(RIGHT, 65, 'No. ' + v.stubNumber, 9, 'B', L.ink, 'right');
    d.text(RIGHT, 77, 'Pay date  ' + v.period.payday, 9, 'R', L.ink, 'right');
    if (v.revision) d.text(RIGHT, 89, 'Revision ' + v.revision + (v.supersedesNumber ? ' · replaces ' + v.supersedesNumber : ''), 7.5, 'B', L.ochre, 'right');
    d.line(M, 100, RIGHT, 100, L.teal, 1.5);

    // Info block: three columns
    const colW = CW / 3;
    const info = [
      ['EMPLOYEE', [[v.employee.name, 'B'], ...v.employee.addressLines.map((l) => [l, 'R'])],
        [['Employee no.', v.employee.number], ['Position', v.employee.jobTitle], ['Department', v.employee.department]]],
      ['PAY PERIOD', [[v.period.start + ' – ' + v.period.end, 'B']],
        [['Pay date', v.period.payday], ['Frequency', v.period.frequency], ['Province of employment', v.employee.province]]],
      ['EMPLOYER', [[v.employer.name, 'B']],
        [['Business number', v.employer.bn], ['Payment method', v.payMethod], ['Statement status', v.isDraft ? 'Draft' : v.isSuperseded ? 'Superseded' : 'Final']]],
    ];
    let infoBottom = 0;
    info.forEach(([head, lines, kv], i) => {
      const x = M + i * colW, w = colW - 16;
      let yy = 118;
      d.text(x, yy, head, 7, 'B', L.teal); yy += 13;
      for (const [t, f] of lines) { d.text(x, yy, fit(t, 9, f, w), 9, f, L.ink); yy += 11.5; }
      yy += 3;
      for (const [k, val] of kv) {
        if (!val) continue;
        d.text(x, yy, k, 7.5, 'R', L.mute);
        d.text(x + w, yy, fit(val, 7.5, 'B', w - measureText(k, 7.5, 'R') - 8), 7.5, 'B', L.ink, 'right');
        yy += 10.5;
      }
      infoBottom = Math.max(infoBottom, yy);
    });

    // Summary tiles
    let y = infoBottom + 4;
    const tiles = [['Gross pay', v.totals.gross], ['Deductions', v.totals.deductions], ['Net pay', v.totals.net], ['Net pay, year to date', v.totals.ytdNet]];
    const gap = 8, tw = (CW - gap * 3) / 4, th = 38;
    tiles.forEach(([label, val], i) => {
      const x = M + i * (tw + gap);
      const hero = i === 2;
      d.rect(x, y, tw, th, hero ? L.teal : L.tint);
      d.text(x + 10, y + 13, label.toUpperCase(), 6.5, 'B', hero ? '#d5e6e3' : L.mute);
      d.text(x + 10, y + 30, fit(val, 15, 'B', tw - 20), 15, 'B', hero ? '#ffffff' : L.ink);
    });
    y += th + 6;

    // YTD summary strip, directly under the tiles
    const per = 8, cw8 = CW / per, sh = 28;
    d.rect(M, y, CW, sh, null, L.rule, 0.5);
    v.ytdSummary.forEach((s, i) => {
      const x = M + 10 + (i % per) * ((CW - 10) / per), yy = y + Math.floor(i / per) * sh;
      d.text(x, yy + 11, fit((i ? s.short : 'YTD ' + s.short).toUpperCase(), 6, 'B', cw8 - 6), 6, 'B', i ? L.mute : L.teal);
      d.text(x, yy + 22, fit(s.value, 8.5, 'B', cw8 - 6), 8.5, 'B', L.ink);
    });
    d.y = y + Math.ceil(v.ytdSummary.length / per) * sh + 16;

    // Tables
    const cols = [
      { key: 'label', x: M, w: 250, align: 'left' },
      { key: 'hours', x: M + 322, align: 'right' },
      { key: 'rate', x: M + 392, align: 'right' },
      { key: 'current', x: M + 462, align: 'right' },
      { key: 'ytd', x: RIGHT, align: 'right' },
    ];
    const heads = { label: 'Description', hours: 'Hours', rate: 'Rate', current: 'This period', ytd: 'Year to date' };
    function section(title, rows, useCols, total) {
      const rowH = 13;
      d.need(38 + rowH);
      const drawHead = () => {
        d.text(M, d.y, title, 10, 'B', L.ink);
        d.y += 8;
        d.line(M, d.y, RIGHT, d.y, L.ink, 0.75);
        d.y += 10;
        for (const c of useCols) d.text(c.align === 'right' ? c.x : c.x, d.y, heads[c.key], 7, 'B', L.mute, c.align);
        d.y += 5;
        d.line(M, d.y, RIGHT, d.y, L.rule, 0.5);
        d.y += 11;
      };
      drawHead();
      if (!rows.length) { d.text(M, d.y, 'None this period', 8.5, 'R', L.mute); d.y += rowH; }
      rows.forEach((r) => {
        if (d.y + rowH > d.bottom) { d.newPage(); drawHead(); }
        for (const c of useCols) {
          const val = c.key === 'label' ? fit(r.label, 8.5, 'R', c.w) : r[c.key];
          d.text(c.x, d.y, val, 8.5, 'R', L.ink, c.align);
        }
        d.line(M, d.y + 4, RIGHT, d.y + 4, L.faint, 0.5);
        d.y += rowH;
      });
      if (total) {
        d.need(rowH + 6);
        d.y += 1;
        d.line(M, d.y - 9, RIGHT, d.y - 9, L.ink, 0.5);
        d.text(M, d.y + 1, total[0], 8.5, 'B', L.ink);
        d.text(M + 462, d.y + 1, total[1], 8.5, 'B', L.ink, 'right');
        d.text(RIGHT, d.y + 1, total[2], 8.5, 'B', L.ink, 'right');
        d.y += rowH + 2;
      }
      d.y += 4;
    }
    const noHours = [cols[0], cols[3], cols[4]];
    section('Earnings', v.earnings, cols, ['Gross earnings', v.totals.grossA, v.totals.ytdGrossA]);
    section('Statutory deductions', v.statutory, noHours, v.other.length ? ['Statutory total', v.totals.statCurA, v.totals.statYtdA] : null);
    if (v.other.length) section('Other deductions', v.other, noHours, ['Other deductions total', v.totals.otherCurA, v.totals.otherYtdA]);

    // Net pay band
    d.need(40);
    d.rect(M, d.y - 4, CW, 30, L.tint);
    d.text(M + 10, d.y + 15, 'NET PAY', 8, 'B', L.teal);
    d.text(M + 90, d.y + 15, 'Gross ' + v.totals.gross + '  less deductions ' + v.totals.deductions, 8, 'R', L.mute);
    d.text(RIGHT - 10, d.y + 16, v.totals.net, 13, 'B', L.ink, 'right');
    d.y += 38;

    // Two columns: employer contributions | net pay distribution
    const half = (CW - 24) / 2, rx = M + half + 24;
    const blockH = 30 + Math.max(v.employerContribs.length + 1, Math.max(v.deposits.length, 1) * 1.6) * 13;
    d.need(blockH);
    const by = d.y;
    d.text(M, by, 'Employer contributions', 10, 'B', L.ink);
    d.line(M, by + 8, M + half, by + 8, L.ink, 0.75);
    d.text(M + half - 70, by + 20, 'This period', 7, 'B', L.mute, 'right');
    d.text(M + half, by + 20, 'Year to date', 7, 'B', L.mute, 'right');
    let ly = by + 34;
    if (!v.employerContribs.length) { d.text(M, ly, 'None this period', 8.5, 'R', L.mute); ly += 13; }
    for (const r of v.employerContribs) {
      d.text(M, ly, r.label, 8.5, 'R', L.ink);
      d.text(M + half - 70, ly, r.current, 8.5, 'R', L.ink, 'right');
      d.text(M + half, ly, r.ytd, 8.5, 'R', L.ink, 'right');
      ly += 13;
    }
    if (v.employerContribs.length) {
      d.text(M, ly, 'Total (not deducted from pay)', 8.5, 'B', L.ink);
      d.text(M + half - 70, ly, v.totals.erCurA, 8.5, 'B', L.ink, 'right');
      d.text(M + half, ly, v.totals.erYtdA, 8.5, 'B', L.ink, 'right');
      ly += 13;
    }

    d.text(rx, by, 'Net pay distribution', 10, 'B', L.ink);
    d.line(rx, by + 8, RIGHT, by + 8, L.ink, 0.75);
    let ry = by + 24;
    if (!v.deposits.length) {
      d.text(rx, ry, 'Paid by cheque', 8.5, 'B', L.ink);
      d.text(RIGHT, ry, v.totals.net, 8.5, 'B', L.ink, 'right');
      ry += 13;
    }
    for (const r of v.deposits) {
      d.text(rx, ry, fit(r.label, 8.5, 'B', half - 80), 8.5, 'B', L.ink);
      d.text(RIGHT, ry, r.amount, 8.5, 'B', L.ink, 'right');
      if (r.detail) { ry += 10.5; d.text(rx, ry, fit(r.detail, 7.5, 'R', half), 7.5, 'R', L.mute); }
      ry += 14;
    }
    d.y = Math.max(ly, ry) + 4;

    if (v.memo) {
      const lines = wrap(v.memo, 8.5, 'R', CW);
      d.need(16 + lines.length * 11);
      d.text(M, d.y, 'Message', 8, 'B', L.teal);
      d.y += 12;
      for (const l of lines) { d.need(11); d.text(M, d.y, l, 8.5, 'R', L.ink); d.y += 11; }
    }

    return d.finish((d, n, total) => {
      d.line(M, 752, RIGHT, 752, L.rule, 0.5);
      d.text(M, 763, fit('Record ' + v.recordId + '  ·  ' + v.calcVersion + '  ·  Tax tables: ' + v.paramsLabel, 6.5, 'R', CW - 60), 6.5, 'R', L.mute);
      d.text(M, 772, fit('Integrity SHA-256 ' + v.hashShort + '  ·  Keep this statement for your records.', 6.5, 'R', CW - 60), 6.5, 'R', L.mute);
      d.text(RIGHT, 763, 'Page ' + n + ' of ' + total, 7, 'B', L.ink, 'right');
    });
  }

  // ---------- Template: Slip (compact, monochrome, single column) ----------
  function slip(v) {
    const ink = '#111111', mute = '#555555', rule = '#999999';
    const d = Canvas({
      top: 50, bottom: 748,
      onPage(d, n) {
        if (v.isDraft || v.isSuperseded) d.text(PAGE.w / 2 - 150, 520, v.isDraft ? 'DRAFT · NOT FINAL' : 'SUPERSEDED', 46, 'B', '#e6e6e6', 'left', 35);
        if (n > 1) { d.text(M, 40, v.employer.name + ' · ' + v.stubNumber + ' (continued)', 8, 'R', mute); return 60; }
        return null;
      },
    });
    d.newPage();
    d.rect(M, 36, CW, 64, null, ink, 1);
    if (v.employer.logo && v.employer.logo.dataUrl) {
      const b = logoBox(v.employer.logo, M + 10, 42, 90, 52);
      d.image(b.x, b.y, b.w, b.h, v.employer.logo.dataUrl);
    } else {
      d.rect(M + 10, 44, 90, 48, null, rule, 0.5);
      d.text(M + 55, 71, 'LOGO', 7, 'B', mute, 'center');
    }
    d.text(M + 112, 56, fit(v.employer.name, 11, 'B', 250), 11, 'B', ink);
    d.text(M + 112, 68, fit(v.employer.addressLines.join(', '), 7.5, 'R', 250), 7.5, 'R', mute);
    if (v.employer.bn) d.text(M + 112, 79, 'BN ' + v.employer.bn, 7.5, 'R', mute);
    d.text(RIGHT - 10, 55, 'PAY SLIP', 12, 'B', ink, 'right');
    d.text(RIGHT - 10, 68, v.stubNumber, 8, 'R', ink, 'right');
    d.text(RIGHT - 10, 79, 'Paid ' + v.period.payday, 8, 'R', ink, 'right');
    if (v.revision) d.text(RIGHT - 10, 90, 'Revision ' + v.revision, 7, 'B', ink, 'right');

    let y = 118;
    const kv = [['Employee', v.employee.name + (v.employee.number ? '  #' + v.employee.number : '')], ['Period', v.period.start + ' – ' + v.period.end + '  (' + v.period.frequency + ')'],
      ['Position', [v.employee.jobTitle, v.employee.department].filter(Boolean).join(', ')], ['Province', v.employee.province]];
    kv.forEach(([k, val], i) => {
      const x = M + (i % 2) * (CW / 2), yy = y + Math.floor(i / 2) * 12;
      d.text(x, yy, k + ':', 8, 'B', ink);
      d.text(x + 52, yy, fit(val || '—', 8, 'R', CW / 2 - 60), 8, 'R', ink);
    });
    d.y = y + 34;

    const rows = [];
    const add = (group, list, cols) => { rows.push({ group }); list.forEach((r) => rows.push({ ...r, cols })); };
    add('EARNINGS', v.earnings, true);
    rows.push({ label: 'Gross', current: v.totals.grossA, ytd: v.totals.ytdGrossA, bold: true });
    add('DEDUCTIONS', v.statutory.concat(v.other), false);
    rows.push({ label: 'Total deductions', current: v.totals.dedA, ytd: v.totals.ytdDedA, bold: true });
    rows.push({ label: 'NET PAY', current: v.totals.netA, ytd: v.totals.ytdNetA, bold: true, big: true });
    if (v.employerContribs.length) add('EMPLOYER CONTRIBUTIONS', v.employerContribs, false);

    const head = () => {
      d.line(M, d.y - 9, RIGHT, d.y - 9, ink, 0.75);
      d.text(M, d.y, 'Item', 7, 'B', ink);
      d.text(M + 330, d.y, 'Hrs', 7, 'B', ink, 'right');
      d.text(M + 400, d.y, 'Rate', 7, 'B', ink, 'right');
      d.text(M + 466, d.y, 'Current', 7, 'B', ink, 'right');
      d.text(RIGHT, d.y, 'YTD', 7, 'B', ink, 'right');
      d.line(M, d.y + 4, RIGHT, d.y + 4, ink, 0.5);
      d.y += 16;
    };
    head();
    for (const r of rows) {
      if (d.y + 13 > d.bottom) { d.newPage(); d.y += 10; head(); }
      if (r.group) { d.y += 3; d.text(M, d.y, r.group, 7, 'B', mute); d.y += 12; continue; }
      const f = r.bold ? 'B' : 'R', s = r.big ? 10 : 8.5;
      if (r.bold) d.line(M, d.y - 9, RIGHT, d.y - 9, rule, 0.5, true);
      d.text(M + (r.bold ? 0 : 8), d.y, fit(r.label, s, f, 300), s, f, ink);
      if (r.cols) { d.text(M + 330, d.y, r.hours, s, f, ink, 'right'); d.text(M + 400, d.y, r.rate, s, f, ink, 'right'); }
      d.text(M + 466, d.y, r.current, s, f, ink, 'right');
      d.text(RIGHT, d.y, r.ytd, s, f, ink, 'right');
      d.y += r.big ? 16 : 13;
    }
    d.y += 10;
    d.need(24 + v.deposits.length * 12);
    d.text(M, d.y, 'DEPOSITED TO', 7, 'B', mute);
    d.y += 12;
    if (!v.deposits.length) { d.text(M + 8, d.y, 'Cheque', 8.5, 'R', ink); d.text(RIGHT, d.y, v.totals.net, 8.5, 'B', ink, 'right'); d.y += 12; }
    for (const r of v.deposits) {
      d.text(M + 8, d.y, fit(r.label + (r.detail ? '  ·  ' + r.detail : ''), 8.5, 'R', 400), 8.5, 'R', ink);
      d.text(RIGHT, d.y, r.amount, 8.5, 'B', ink, 'right');
      d.y += 12;
    }
    if (v.memo) {
      d.y += 8;
      for (const l of wrap(v.memo, 8, 'R', CW)) { d.need(10); d.text(M, d.y, l, 8, 'R', ink); d.y += 10; }
    }
    return d.finish((d, n, total) => {
      d.text(M, 770, fit(v.recordId + ' · ' + v.calcVersion + ' · ' + v.paramsLabel + ' · ' + v.hashShort, 6.5, 'R', CW - 50), 6.5, 'R', mute);
      d.text(RIGHT, 770, n + '/' + total, 6.5, 'R', mute, 'right');
    });
  }

  // ---------- registry ----------
  const TEMPLATES = {};
  function registerTemplate(t) {
    if (!t || !t.id || typeof t.render !== 'function') throw new Error('A template needs an id and a render(view) function');
    TEMPLATES[t.id] = t;
    return t;
  }
  const getTemplate = (id) => TEMPLATES[id] || TEMPLATES.ledger;
  const listTemplates = () => Object.values(TEMPLATES).map(({ id, name, description }) => ({ id, name, description }));

  registerTemplate({ id: 'ledger', name: 'Ledger', description: 'Full statement: logo header, summary tiles, earnings and deduction tables with YTD, employer contributions, deposit split and YTD summary.', render: ledger });
  registerTemplate({ id: 'slip', name: 'Slip', description: 'Compact monochrome slip: one combined table, prints well on any printer.', render: slip });

  function renderStub(templateId, view) { return getTemplate(templateId).render(view); }

  const api = { PAGE, measureText, fit, wrap, buildStubView, registerTemplate, getTemplate, listTemplates, renderStub, fmtDate };
  root.PayrollCore = Object.assign(root.PayrollCore || {}, api);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

