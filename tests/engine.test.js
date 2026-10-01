// Run: node --test tests/
// All data here is fictional.
const test = require('node:test');
const assert = require('node:assert/strict');
require('../src/tax-params.js');
require('../src/engine.js');
require('../src/templates.js');
require('../src/pdf.js');
const PC = globalThis.PayrollCore;

const near = (a, b, tol = 0.005) => assert.ok(Math.abs(a - b) <= tol, `expected ${b}, got ${a}`);
const baseEmployee = (over = {}) => ({
  id: 'emp-1', firstName: 'Sample', lastName: 'Worker', province: 'ON', dateOfBirth: '1990-06-15',
  td1: { federalFiled: false, provincialFiled: false }, ...over,
});
const period = (payday, frequency = 'weekly', start = '2026-03-01', end = '2026-03-07') => ({ start, end, payday, frequency });
const ytdWith = (o) => Object.assign(PC.emptyYtd(), o);
const calc = (over = {}, ytd) => PC.calculate({
  mode: 'calculated', employee: baseEmployee(), period: period('2026-03-13'),
  earnings: [{ kind: 'regular', label: 'Regular', amount: 1000 }], deductions: [], ...over,
}, ytd);
const audit = (r, key) => r.audit.find((a) => a.key === key);

// ---------- CRA worked example (T4127, bonus method) ----------
test('CRA bonus worked example: weekly $1,000 + $2,500 bonus reproduces T4127 figures', () => {
  const r = calc({ earnings: [{ kind: 'regular', label: 'Regular', amount: 1000 }, { kind: 'bonus', label: 'Bonus', amount: 2500 }] },
    ytdWith({ bonus: 1500, f5b: 14.60, bonusCpp: 89.25, bonusEi: 24.45, cpp: 1000, ei: 300, pensionable: 20000 }));
  assert.equal(r.ok, true);
  assert.equal(r.current.cpp, 204.25);
  const t = audit(r, 'taxable').inputs;
  assert.equal(t.F5, 34.33); assert.equal(t.F5A, 9.81); assert.equal(t.F5B, 24.52);
  const b = audit(r, 'bonus').inputs;
  assert.equal(b['A step 1'], 55450.76);
  assert.equal(b['K2 step 1'], 491.63);
  assert.equal(b['T3 step 1'], 4758.06);
  assert.equal(b['A step 2'], 52975.28);
  assert.equal(b['K2 step 2'], 468.60);
  assert.equal(b['T3 step 2'], 4434.52);
  assert.equal(b['TB federal'], 323.54);
});

// ---------- CPP / CPP2 / EI ----------
test('CPP stops at the annual maximum', () => {
  const r = calc({ earnings: [{ kind: 'regular', label: 'Regular', amount: 3000 }] }, ytdWith({ cpp: 4200, pensionable: 70000 }));
  assert.equal(r.current.cpp, 30.45);
  assert.equal(r.ytd.cpp, 4230.45);
});
test('CPP per-period exemption uses 3,500 / P', () => {
  const r = calc();
  assert.equal(r.current.cpp, PC.r2(0.0595 * (1000 - 3500 / 52)));
});
test('CPP2 starts only above the YMPE and stops at its maximum', () => {
  const p = period('2026-10-15', 'monthly', '2026-10-01', '2026-10-31');
  const e = [{ kind: 'regular', label: 'Regular', amount: 2000 }];
  assert.equal(calc({ period: p, earnings: e }, ytdWith({ pensionable: 60000 })).current.cpp2, 0);
  assert.equal(calc({ period: p, earnings: e }, ytdWith({ pensionable: 74000 })).current.cpp2, 56);
  assert.equal(calc({ period: p, earnings: e }, ytdWith({ pensionable: 80000, cpp2: 400 })).current.cpp2, 16);
});
test('EI stops at the annual maximum premium; employer EI is 1.4x', () => {
  const r = calc({}, ytdWith({ ei: 1120 }));
  assert.equal(r.current.ei, 3.07);
  assert.equal(r.current.employerEi, 4.3);
  assert.equal(calc().current.ei, 16.3);
});
test('Non-cash taxable benefit is pensionable, not insurable, and not paid out', () => {
  const r = calc({ earnings: [{ kind: 'regular', label: 'Regular', amount: 1000 }, { kind: 'benefit', label: 'Group life', amount: 20 }] });
  assert.equal(r.current.pensionable, 1020);
  assert.equal(r.current.insurable, 1000);
  assert.equal(r.current.cashGross, 1000);
  assert.equal(r.current.net, PC.r2(1000 - r.current.totalDeductions));
});

// ---------- CPP age window ----------
test('CPP months: starts the month after the 18th birthday, ends with the 70th-birthday month', () => {
  const cpp = PC.TAX_YEARS[2026].periods[0].cpp;
  assert.equal(PC.cppMonths('2008-05-20', 2026, cpp).pm, 7);
  assert.equal(PC.cppMonths('1956-03-10', 2026, cpp).pm, 3);
  assert.equal(PC.cppMonths('2010-01-01', 2026, cpp).pm, 0);
  assert.equal(PC.cppMonths('1950-01-01', 2026, cpp).pm, 0);
  const young = baseEmployee({ dateOfBirth: '2008-05-20' });
  assert.equal(calc({ employee: young, period: period('2026-05-29') }).current.cpp, 0);
  assert.ok(calc({ employee: young, period: period('2026-06-05') }).current.cpp > 0);
  const senior = baseEmployee({ dateOfBirth: '1956-03-10' });
  assert.equal(calc({ employee: senior, period: period('2026-04-03') }).current.cpp, 0);
});

// ---------- income tax pieces ----------
const jan = PC.paramsFor('2026-03-13');
const jul = PC.paramsFor('2026-08-14');
const tax = (p, prov, A, extra = {}) => PC.annualTax(p, prov, { A, HD: 0, grossAnnual: A, cppBase: 0, eiAnnual: 0, td1: {}, ...extra });

test('Parameters are selected by payday (Jan vs Jul 2026 editions)', () => {
  assert.equal(jan.id, '2026-01');
  assert.equal(jul.id, '2026-07');
  assert.equal(PC.paramsFor('2027-01-15'), null);
});
test('Federal BPAF phases out between the 4th and 5th bracket thresholds', () => {
  assert.equal(tax(jan, 'ON', 100000).f.BPAF, 16452);
  assert.equal(tax(jan, 'ON', 200000).f.BPAF, 16061.01);
  assert.equal(tax(jan, 'ON', 300000).f.BPAF, 14829);
});
test('Ontario surtax (V1) and health premium (V2)', () => {
  const r = tax(jan, 'ON', 100000);
  near(r.p.T4, 6284.06);
  near(r.p.V1, 0.2 * (6284.06 - 5818));
  assert.equal(r.p.V2, 750);
  assert.equal(r.p.S, 0);
});
test('Ontario tax reduction (S) at low income', () => {
  const r = tax(jan, 'ON', 20000);
  near(r.p.T4, 354.06);
  near(r.p.S, 245.94);
  near(r.T2, 108.12);
});
test('BC tax reduction and rate differ between Jan and Jul 2026', () => {
  const a = tax(jan, 'BC', 30000);
  near(a.p.T4, 849.27); near(a.p.S, 417.292); near(a.T2, 431.978);
  const b = tax(jul, 'BC', 30000);
  near(b.p.T4, 1030.54); near(b.p.S, 647.292); near(b.T2, 383.248);
});
test('Alberta supplemental credit (K5P)', () => {
  assert.equal(tax(jan, 'AB', 100000, { cppBase: 3519.45, eiAnnual: 1123.07 }).p.K5P, 0);
  const r = tax(jan, 'AB', 100000, { cppBase: 3519.45, eiAnnual: 1123.07, td1: { provincialFiled: true, provincialClaim: 60000 } });
  assert.equal(r.p.K2P, 371.4);
  assert.equal(r.p.K5P, 68.85);
});
test('Manitoba basic amount phases out above $200,000', () => {
  assert.equal(tax(jan, 'MB', 100000).p.BPAP, 15780);
  assert.equal(tax(jan, 'MB', 300000).p.BPAP, 7890);
  assert.equal(tax(jan, 'MB', 450000).p.BPAP, 0);
});
test('TD1 claim amounts replace the basic personal amounts', () => {
  const r = tax(jan, 'ON', 50000, { td1: { federalFiled: true, federalClaim: 20000, provincialFiled: true, provincialClaim: 15000 } });
  assert.equal(r.f.K1, 2800);
  assert.equal(r.p.K1P, 757.5);
});
test('Additional tax (L) is added to federal tax for the period', () => {
  const a = calc();
  const b = calc({ employee: baseEmployee({ td1: { federalFiled: false, provincialFiled: false, additionalTax: 25 } }) });
  assert.equal(PC.r2(b.current.federalTax - a.current.federalTax), 25);
});
test('RRSP deduction reduces taxable income; after-tax deduction does not', () => {
  const a = calc();
  const b = calc({ deductions: [{ label: 'Group RRSP', type: 'rrsp', amount: 100 }] });
  const c = calc({ deductions: [{ label: 'Parking', type: 'posttax', amount: 100 }] });
  assert.ok(b.current.tax < a.current.tax);
  assert.equal(c.current.tax, a.current.tax);
  assert.equal(c.current.net, PC.r2(a.current.net - 100));
});

// ---------- modes & required inputs ----------
test('Calculated mode lists missing fields instead of guessing', () => {
  const r = calc({ employee: baseEmployee({ dateOfBirth: '', td1: {} }) });
  assert.equal(r.ok, false);
  const fields = r.missing.map((m) => m.field);
  assert.ok(fields.includes('employee.dateOfBirth'));
  assert.ok(fields.includes('employee.td1.federalFiled'));
  assert.ok(fields.includes('employee.td1.provincialFiled'));
});
test('Quebec and unsupported years are refused in Calculated mode', () => {
  assert.match(calc({ employee: baseEmployee({ province: 'QC' }) }).missing[0].label, /Revenu Québec/);
  assert.ok(calc({ period: period('2025-06-13') }).missing.some((m) => m.field === 'period.payday'));
});
test('Manual mode uses entered amounts unchanged', () => {
  const r = calc({ mode: 'manual', employee: baseEmployee({ province: 'QC' }), manual: { cpp: 50, cpp2: 0, ei: 12, federalTax: 80, provincialTax: 70 } });
  assert.equal(r.ok, true);
  assert.equal(r.current.totalDeductions, 212);
  assert.equal(r.current.net, 788);
  assert.equal(r.current.employerCpp, 50);
  assert.equal(r.current.employerEi, 16.8);
});

// ---------- YTD ----------
test('priorYtd sums only finalized, non-superseded, earlier stubs for the same employer and year', () => {
  const emp = baseEmployee({ openingYtd: { 2026: { gross: 500, cpp: 20 } } });
  const mk = (id, payday, status, extra = {}) => ({
    id, chainId: id, status, employeeId: emp.id, employerId: 'er-1', taxYear: 2026, period: { payday },
    result: calc({ period: period(payday) }), ...extra,
  });
  const stubs = [
    mk('a', '2026-01-09', 'finalized'),
    mk('b', '2026-01-16', 'draft'),
    mk('c', '2026-01-23', 'superseded'),
    mk('d', '2026-03-20', 'finalized'),
    mk('e', '2026-01-30', 'finalized', { employerId: 'er-2' }),
  ];
  const y = PC.priorYtd(stubs, { employee: emp, employerId: 'er-1', taxYear: 2026, payday: '2026-03-13' });
  assert.equal(y.periods, 1);
  assert.equal(y.gross, 1500);
  assert.equal(y.cpp, PC.r2(20 + stubs[0].result.current.cpp));
  assert.equal(y.lines['regular|regular'], 1000);
  const r = calc({ employee: emp }, y);
  assert.equal(r.ytd.gross, 2500);
  assert.equal(r.lines[0].ytd, 2000);
});

// ---------- deposits ----------
test('Deposit allocation: fixed, then percent, then remainder', () => {
  const d = PC.allocateDeposits(1000, [
    { label: 'Savings', method: 'amount', value: 200 },
    { label: 'TFSA', method: 'percent', value: 10 },
    { label: 'Chequing', method: 'remainder' },
  ]);
  assert.deepEqual(d.lines.map((l) => l.allocated), [200, 80, 720]);
  assert.equal(d.unallocated, 0);
  assert.equal(PC.allocateDeposits(500, [{ method: 'amount', value: 200 }]).unallocated, 300);
});

// ---------- validation ----------
const stubOf = (o = {}) => ({ id: 's1', chainId: 's1', status: 'draft', employeeId: 'emp-1', employerId: 'er-1', taxYear: 2026, mode: 'calculated',
  period: period('2026-03-13'), earnings: [{ kind: 'regular', amount: 1000 }], deductions: [], ...o });
const levels = (issues, field) => issues.filter((i) => i.field.startsWith(field)).map((i) => i.level);

test('Validation: impossible dates, reversed period, payday before start, wrong year', () => {
  assert.ok(levels(PC.validate(stubOf({ period: period('2026-02-30') })), 'period.payday').includes('error'));
  assert.ok(levels(PC.validate(stubOf({ period: period('2026-03-13', 'weekly', '2026-03-07', '2026-03-01') })), 'period.end').includes('error'));
  assert.ok(levels(PC.validate(stubOf({ period: period('2026-02-20') })), 'period.payday').includes('error'));
  assert.ok(levels(PC.validate(stubOf({ taxYear: 2025 })), 'period.payday').includes('error'));
  assert.ok(levels(PC.validate(stubOf({ period: period('2026-03-13', 'weekly', '2026-03-01', '2026-03-14') })), 'period.end').includes('warning'));
});
test('Validation: invalid frequency and negative amounts', () => {
  assert.ok(levels(PC.validate(stubOf({ period: period('2026-03-13', 'fortnightly') })), 'period.frequency').includes('error'));
  assert.ok(levels(PC.validate(stubOf({ earnings: [{ kind: 'regular', hours: -2, rate: 20 }] })), 'earnings').includes('error'));
  assert.ok(levels(PC.validate(stubOf({ deductions: [{ label: 'x', amount: -5 }] })), 'deductions').includes('error'));
});
test('Validation: manual amounts over CPP/CPP2/EI maxima and inconsistent YTD', () => {
  const s = stubOf({ mode: 'manual', manual: { cpp: 100, cpp2: 50, ei: 30 } });
  const r = PC.calculate({ ...s, employee: baseEmployee(), manual: s.manual }, ytdWith({ cpp: 4200, cpp2: 400, ei: 1100 }));
  const issues = PC.validate(s, r, { employee: baseEmployee() });
  for (const f of ['manual.cpp', 'manual.cpp2', 'manual.ei']) assert.ok(levels(issues, f).includes('error'), f);
  const bad = PC.calculate({ ...s, employee: baseEmployee(), manual: s.manual }, ytdWith({ gross: -5000 }));
  const v2 = PC.validate(s, bad, { employee: baseEmployee() });
  assert.ok(v2.some((i) => i.field === 'ytd.gross' && i.level === 'error'));
});
test('Validation: overlapping and duplicate periods are flagged; values are never changed', () => {
  const other = stubOf({ id: 's0', chainId: 's0', status: 'finalized', stubNumber: 'SMP-2026-00001' });
  const s = stubOf();
  const before = JSON.stringify(s);
  const issues = PC.validate(s, null, { stubs: [other] });
  assert.ok(issues.some((i) => i.field === 'period' && /Overlaps/.test(i.message)));
  assert.equal(JSON.stringify(s), before);
});
test('Validation: negative net pay is an error', () => {
  const s = stubOf({ deductions: [{ label: 'Advance repayment', type: 'posttax', amount: 5000 }] });
  const r = PC.calculate({ ...s, employee: baseEmployee() }, null);
  assert.ok(PC.validate(s, r).some((i) => i.field === 'net' && i.level === 'error'));
});

// ---------- periods, numbering, integrity ----------
test('Next period dates', () => {
  assert.deepEqual(PC.nextPeriod({ start: '2026-03-01', end: '2026-03-14', payday: '2026-03-20', frequency: 'biweekly' }),
    { start: '2026-03-15', end: '2026-03-28', payday: '2026-04-03', frequency: 'biweekly' });
  const s = PC.nextPeriod({ start: '2026-02-01', end: '2026-02-15', payday: '2026-02-15', frequency: 'semimonthly' });
  assert.deepEqual([s.start, s.end, s.payday], ['2026-02-16', '2026-02-28', '2026-02-28']);
  const m = PC.nextPeriod({ start: '2026-01-01', end: '2026-01-31', payday: '2026-01-31', frequency: 'monthly' });
  assert.deepEqual([m.start, m.end], ['2026-02-01', '2026-02-28']);
});
test('Stub numbers and canonical hashing', async () => {
  assert.equal(PC.stubNumber('smp', 2026, 7), 'SMP-2026-00007');
  assert.equal(PC.stubNumber('smp', 2026, 7, 2), 'SMP-2026-00007-R2');
  assert.equal(PC.canonical({ b: 1, a: [2, { d: 1, c: 2 }] }), PC.canonical({ a: [2, { c: 2, d: 1 }], b: 1 }));
  const h = await PC.sha256Hex('abc');
  assert.equal(h, 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
});

// ---------- templates & PDF ----------
const employer = { id: 'er-1', legalName: '[Your Company Name]', code: 'SMP', businessNumber: '000000000RP0001',
  address: { line1: '100 Example Street', city: 'Sampletown', province: 'ON', postal: 'A1A 1A1' } };

function renderSample(templateId, earningsCount = 1, logo) {
  const s = stubOf({ stubNumber: 'SMP-2026-00001' });
  const earnings = Array.from({ length: earningsCount }, (_, i) => ({ kind: 'other', label: 'Line ' + (i + 1), amount: 10 }));
  const r = PC.calculate({ ...s, employee: baseEmployee(), earnings, deposits: [{ label: 'Chequing', method: 'remainder', accountLast4: '0000' }] }, null);
  const view = PC.buildStubView({ stub: s, employer: { ...employer, logo }, employee: baseEmployee(), result: r });
  return PC.renderStub(templateId, view);
}
function checkPdf(bytes) {
  const text = Buffer.from(bytes).toString('latin1');
  assert.ok(text.startsWith('%PDF-1.4'));
  assert.ok(text.trimEnd().endsWith('%%EOF'));
  const startxref = Number(/startxref\n(\d+)/.exec(text)[1]);
  assert.ok(text.slice(startxref).startsWith('xref'));
  const rows = text.slice(startxref).split('\n').filter((l) => / 00000 n $/.test(l));
  rows.forEach((row, i) => assert.ok(text.slice(Number(row.slice(0, 10))).startsWith((i + 1) + ' 0 obj'), 'xref row ' + (i + 1)));
  return text;
}

test('Templates are registered and render every page with a footer', () => {
  assert.deepEqual(PC.listTemplates().map((t) => t.id), ['ledger', 'slip']);
  for (const id of ['ledger', 'slip']) {
    const one = renderSample(id);
    assert.equal(one.pages.length, 1);
    const many = renderSample(id, 60);
    assert.ok(many.pages.length >= 2, id + ' paginates');
    const last = many.pages[many.pages.length - 1].ops.map((o) => o.text).join('|');
    assert.match(last, new RegExp(many.pages.length + '( of |/)' + many.pages.length));
    for (const p of many.pages) for (const o of p.ops) if (o.t === 'text' && !o.rot) assert.ok(o.y <= 780 && o.y > 0, id + ' text inside page');
  }
});
test('PDF output is a valid text PDF with correct xref offsets', () => {
  const doc = renderSample('ledger', 60);
  const text = checkPdf(PC.buildPdf(doc, { title: 'Statement (test)', author: '[Your Company Name]' }));
  assert.ok(text.includes('/Count ' + doc.pages.length + ' '));
  assert.match(text, /\(EARNINGS STATEMENT\) Tj/);
  assert.match(text, /\/Title \(Statement \\\(test\\\)\)/);
});
test('PDF embeds a JPEG logo and encodes WinAnsi characters', () => {
  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x00, 0x02, 0x00, 0x03, 0x03, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1, 0xff, 0xd9]);
  const logo = { dataUrl: 'data:image/jpeg;base64,' + jpeg.toString('base64'), w: 3, h: 2 };
  const text = checkPdf(PC.buildPdf(renderSample('ledger', 1, logo)));
  assert.match(text, /\/Subtype \/Image \/Width 3 \/Height 2 \/ColorSpace \/DeviceRGB/);
  assert.match(text, /\/Im1 Do/);
  assert.equal(PC.pdfString('Café – (x) €'), '(Caf\\351 \\226 \\(x\\) \\200)');
});

