/*
 * Payroll Studio: calculation engine (CRA T4127 Option 1, salary/wages).
 * Pure functions: no DOM, no storage, no template knowledge.
 * Depends only on tax-params.js (PayrollCore.paramsFor / PAY_FREQUENCIES).
 */
(function (root) {
  'use strict';

  const CALC_VERSION = 'PS-ENGINE 1.1.0 (T4127 Option 1, 2026)';
  const core = () => root.PayrollCore;

  // CRA: "round the resulting amount to the nearest $0.01"
  const r2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
  const num = (v) => (v === '' || v === null || v === undefined || isNaN(Number(v)) ? 0 : Number(v));
  const has = (v) => v !== '' && v !== null && v !== undefined && !isNaN(Number(v));
  const money = (n) => (n < 0 ? '−' : '') + '$' + Math.abs(r2(n)).toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const pct = (n) => (n * 100).toLocaleString('en-CA', { maximumFractionDigits: 4 }) + '%';

  // ---------- earnings & deduction line kinds ----------
  // Defaults follow CRA treatment; every flag can be overridden per line.
  const EARNING_KINDS = {
    regular: { label: 'Regular pay', periodic: true, pensionable: true, insurable: true, taxable: true, cash: true },
    overtime: { label: 'Overtime', periodic: true, pensionable: true, insurable: true, taxable: true, cash: true },
    vacation: { label: 'Vacation pay', periodic: true, pensionable: true, insurable: true, taxable: true, cash: true },
    bonus: { label: 'Bonus', periodic: false, pensionable: true, insurable: true, taxable: true, cash: true },
    benefit: { label: 'Taxable benefit (non-cash)', periodic: true, pensionable: true, insurable: false, taxable: true, cash: false },
    other: { label: 'Other earnings', periodic: true, pensionable: true, insurable: true, taxable: true, cash: true },
  };
  const DEDUCTION_TYPES = {
    rrsp: { label: 'RPP / group RRSP (reduces taxable income)' },
    union: { label: 'Union dues (reduces taxable income)' },
    posttax: { label: 'After-tax deduction' },
  };

  function lineAmount(l) {
    if (has(l.hours) && has(l.rate) && (l.kind === 'regular' || l.kind === 'overtime' || l.kind === 'other' || l.kind === 'vacation')) {
      const mult = l.kind === 'overtime' ? (has(l.multiplier) ? num(l.multiplier) : 1) : 1;
      return r2(num(l.hours) * num(l.rate) * mult);
    }
    return r2(num(l.amount));
  }
  function lineFlags(l) {
    const d = EARNING_KINDS[l.kind] || EARNING_KINDS.other;
    const f = {};
    for (const k of ['periodic', 'pensionable', 'insurable', 'taxable', 'cash']) f[k] = typeof l[k] === 'boolean' ? l[k] : d[k];
    return f;
  }
  const lineKey = (l) => (l.kind || 'other') + '|' + String(l.label || '').trim().toLowerCase();
  const dedKey = (d) => (d.type || 'posttax') + '|' + String(d.label || '').trim().toLowerCase();

  // ---------- CPP eligibility (age window) ----------
  // Contributions start the month after the 18th birthday and stop the month after the 70th.
  function cppMonths(dob, year, cpp) {
    const [by, bm] = String(dob).split('-').map(Number); // bm 1..12
    const start18 = by + cpp.minAge; const end70 = by + cpp.maxAge;
    let first = 0, last = 11;
    if (start18 > year) return { pm: 0, first: 12, last: -1 };
    if (start18 === year) first = bm; // bm (1-based) === index of the month after
    if (end70 < year) return { pm: 0, first: 12, last: -1 };
    if (end70 === year) last = bm - 1;
    return { pm: Math.max(0, last - first + 1), first, last };
  }

  function bracketFor(brackets, A) {
    let b = brackets[0];
    for (const x of brackets) if (A >= x.from) b = x;
    return b;
  }
  function phasedAmount(ni, max, min, start, end) {
    if (ni <= start) return max;
    if (ni >= end) return min;
    return r2(max - (ni - start) * ((max - min) / (end - start)));
  }

  // ---------- annual tax (Steps 2–5) ----------
  function annualTax(p, provCode, x) {
    const fed = p.federal, prov = p.provinces[provCode];
    const NI = x.A + x.HD;
    const bpaf = phasedAmount(NI, fed.bpa.max, fed.bpa.min, fed.bpa.phaseStart, fed.bpa.phaseEnd);
    const lowF = fed.brackets[0].rate;
    const TC = x.td1.federalFiled ? num(x.td1.federalClaim) : bpaf;
    const fb = bracketFor(fed.brackets, x.A);
    const K1 = r2(lowF * TC);
    const K2 = r2(lowF * x.cppBase + lowF * x.eiAnnual);
    const K3 = num(x.td1.otherFederalCredits);
    const K4 = r2(Math.min(lowF * x.grossAnnual, lowF * fed.canadaEmploymentAmount));
    const T3 = Math.max(0, fb.rate * x.A - fb.k - K1 - K2 - K3 - K4);
    const T1 = T3;

    const lowP = prov.brackets[0].rate;
    let bpaP;
    if (prov.basicAmountFollowsFederal) bpaP = bpaf;
    else if (prov.basicAmountPhaseOut) bpaP = phasedAmount(NI, prov.basicAmount, 0, prov.basicAmountPhaseOut.start, prov.basicAmountPhaseOut.end);
    else bpaP = prov.basicAmount;
    const TCP = x.td1.provincialFiled ? num(x.td1.provincialClaim) : bpaP;
    const pb = bracketFor(prov.brackets, x.A);
    const K1P = r2(lowP * TCP);
    const K2P = r2(lowP * x.cppBase + lowP * x.eiAnnual);
    const K3P = num(x.td1.otherProvincialCredits);
    const K4P = prov.territorialEmploymentAmount ? r2(Math.min(lowP * x.grossAnnual, lowP * prov.territorialEmploymentAmount)) : 0;
    const K5P = prov.supplementalCredit ? r2(Math.max(0, (K1P + K2P - prov.supplementalCredit.threshold) * prov.supplementalCredit.rate)) : 0;
    const T4 = Math.max(0, pb.rate * x.A - pb.k - K1P - K2P - K3P - K4P - K5P);

    let V1 = 0, V2 = 0, S = 0;
    if (prov.surtax) for (const s of prov.surtax) V1 += s.rate * Math.max(0, T4 - s.over);
    if (prov.healthPremium) {
      const h = prov.healthPremium.find((t) => x.A > t.from && x.A <= t.to);
      V2 = h ? Math.min(h.cap, h.base + h.rate * (x.A - h.from)) : 0;
    }
    const tr = prov.taxReduction;
    if (tr && tr.kind === 'ON') {
      const Y = tr.perDependant * num(x.td1.dependants);
      S = Math.max(0, Math.min(T4 + V1, 2 * (tr.basic + Y) - (T4 + V1)));
    } else if (tr && tr.kind === 'BC') {
      if (x.A <= tr.fullUpTo) S = Math.min(T4, tr.amount);
      else if (x.A <= tr.zeroAbove) S = Math.max(0, Math.min(T4, tr.amount - (x.A - tr.fullUpTo) * tr.phaseRate));
    }
    const T2 = Math.max(0, T4 + V1 + V2 - S);
    return {
      T1, T2,
      f: { A: x.A, NI, BPAF: bpaf, TC, R: fb.rate, K: fb.k, K1, K2, K3, K4, T3, T1 },
      p: { V: pb.rate, KP: pb.k, BPAP: bpaP, TCP, K1P, K2P, K3P, K4P, K5P, T4, V1, V2, S, T2 },
    };
  }

  // ---------- YTD ----------
  const YTD_FIELDS = ['gross', 'cashGross', 'benefits', 'pensionable', 'insurable', 'cpp', 'cpp2', 'ei', 'federalTax', 'provincialTax', 'tax',
    'otherDeductions', 'totalDeductions', 'net', 'bonus', 'bonusCpp', 'bonusEi', 'f5b', 'employerCpp', 'employerCpp2', 'employerEi'];
  const emptyYtd = () => { const o = { lines: {}, deductions: {}, periods: 0 }; for (const f of YTD_FIELDS) o[f] = 0; return o; };

  // Sums finalized (non-superseded) stubs of this employee/employer/tax year paid before `payday`,
  // plus any opening balances recorded on the employee for that year.
  function priorYtd(stubs, { employee, employerId, taxYear, payday, excludeId, excludeChain }) {
    const y = emptyYtd();
    const open = employee && employee.openingYtd && employee.openingYtd[taxYear];
    if (open) for (const f of YTD_FIELDS) y[f] += num(open[f]);
    // Opening balances appear as their own YTD-only lines so line totals still add up to the YTD totals
    if (open && num(open.gross)) y.lines['other|opening balance (before this system)'] = r2(num(open.gross));
    if (open && num(open.otherDeductions)) y.deductions['posttax|opening balance (before this system)'] = r2(num(open.otherDeductions));
    const lastRegular = { amount: 0, payday: '' };
    for (const s of stubs || []) {
      if (s.status !== 'finalized' || !s.result) continue;
      if (s.employeeId !== employee.id || s.employerId !== employerId || s.taxYear !== taxYear) continue;
      if (s.id === excludeId || (excludeChain && s.chainId === excludeChain)) continue;
      if (!(s.period.payday < payday)) continue;
      const c = s.result.current;
      for (const f of YTD_FIELDS) y[f] = r2(y[f] + num(c[f]));
      for (const l of s.result.lines) y.lines[l.key] = r2((y.lines[l.key] || 0) + l.amount);
      for (const d of s.result.deductionLines) y.deductions[d.key] = r2((y.deductions[d.key] || 0) + d.amount);
      y.periods += 1;
      if (c.periodicTaxable > 0 && s.period.payday > lastRegular.payday) { lastRegular.amount = c.periodicTaxable; lastRegular.payday = s.period.payday; }
    }
    y.lastRegularIncome = lastRegular.amount;
    return y;
  }

  // ---------- required inputs (Calculated mode asks instead of guessing) ----------
  function missingInputs({ employee, period, earnings }) {
    const m = [];
    const P = core().PAY_FREQUENCIES[period.frequency];
    if (!P) m.push({ field: 'period.frequency', label: 'Pay frequency' });
    if (!period.payday) m.push({ field: 'period.payday', label: 'Payday' });
    else if (!core().paramsFor(period.payday)) m.push({ field: 'period.payday', label: 'Payday in a supported tax year (tax parameters on file: ' + Object.keys(core().TAX_YEARS).join(', ') + ')' });
    const prov = employee.province;
    if (!prov) m.push({ field: 'employee.province', label: 'Province/territory of employment' });
    else if (core().UNSUPPORTED_JURISDICTIONS[prov]) m.push({ field: 'employee.province', label: core().UNSUPPORTED_JURISDICTIONS[prov] });
    else if (period.payday && core().paramsFor(period.payday) && !core().paramsFor(period.payday).provinces[prov]) m.push({ field: 'employee.province', label: 'A supported province/territory code' });
    if (!employee.cppExempt && !employee.cppFullYear && !employee.dateOfBirth) m.push({ field: 'employee.dateOfBirth', label: 'Date of birth, full-year CPP eligibility, or CPP exemption' });
    const td1 = employee.td1 || {};
    if (typeof td1.federalFiled !== 'boolean') m.push({ field: 'employee.td1.federalFiled', label: 'Federal TD1: filed or not filed' });
    else if (td1.federalFiled && !has(td1.federalClaim)) m.push({ field: 'employee.td1.federalClaim', label: 'Federal TD1 total claim amount' });
    if (typeof td1.provincialFiled !== 'boolean') m.push({ field: 'employee.td1.provincialFiled', label: 'Provincial TD1: filed or not filed' });
    else if (td1.provincialFiled && !has(td1.provincialClaim)) m.push({ field: 'employee.td1.provincialClaim', label: 'Provincial TD1 total claim amount' });
    if (!earnings || !earnings.length) m.push({ field: 'earnings', label: 'At least one earnings line' });
    (earnings || []).forEach((l, i) => {
      const hourly = ['regular', 'overtime', 'vacation', 'other'].includes(l.kind) && (has(l.hours) || has(l.rate));
      if (hourly && !(has(l.hours) && has(l.rate))) m.push({ field: 'earnings.' + i, label: (l.label || 'Line ' + (i + 1)) + ': both hours and rate' });
      if (!hourly && !has(l.amount)) m.push({ field: 'earnings.' + i, label: (l.label || 'Line ' + (i + 1)) + ': amount' });
    });
    return m;
  }

  // ---------- main calculation ----------
  /*
   * input = { mode:'calculated'|'manual', employee, period:{start,end,payday,frequency},
   *           earnings:[line], deductions:[{label,type,amount}], manual:{cpp,cpp2,ei,federalTax,provincialTax,employerCpp,employerCpp2,employerEi},
   *           deposits:[...] }
   * ytd = priorYtd(...)
   */
  function calculate(input, ytd) {
    const { employee, period } = input;
    const mode = input.mode === 'manual' ? 'manual' : 'calculated';
    ytd = ytd || emptyYtd();
    const audit = [];
    const step = (key, title, formula, inputs, result, note) => audit.push({ key, title, formula, inputs, result, note: note || '' });

    if (mode === 'calculated') {
      const missing = missingInputs(input);
      if (missing.length) return { ok: false, mode, missing, audit: [] };
    }
    const p = period.payday ? core().paramsFor(period.payday) : null;
    const freq = core().PAY_FREQUENCIES[period.frequency];
    const P = freq ? freq.periods : 0;

    // 1. Gross
    const lines = (input.earnings || []).map((l) => {
      const f = lineFlags(l);
      return { key: lineKey(l), kind: l.kind, label: l.label || (EARNING_KINDS[l.kind] || EARNING_KINDS.other).label,
        hours: has(l.hours) ? num(l.hours) : null, rate: has(l.rate) ? num(l.rate) : null,
        multiplier: l.kind === 'overtime' && has(l.multiplier) ? num(l.multiplier) : null,
        amount: lineAmount(l), ...f };
    });
    const sum = (pred) => r2(lines.filter(pred).reduce((a, l) => a + l.amount, 0));
    const cashGross = sum((l) => l.cash);
    const benefits = sum((l) => !l.cash);
    const gross = r2(cashGross + benefits);
    step('gross', 'Gross earnings', 'Σ earnings lines (hours × rate × multiplier, or entered amount)',
      Object.fromEntries(lines.map((l) => [l.label, l.amount])), gross,
      'Cash earnings ' + money(cashGross) + ' + non-cash taxable benefits ' + money(benefits));

    const PI = sum((l) => l.pensionable);
    const PIB = sum((l) => l.pensionable && !l.periodic);
    const IE = sum((l) => l.insurable);
    const IEB = sum((l) => l.insurable && !l.periodic);
    const I = sum((l) => l.taxable && l.periodic);
    const B = sum((l) => l.taxable && !l.periodic);

    // Deductions
    const deductionLines = (input.deductions || []).map((d) => ({ key: dedKey(d), label: d.label || 'Deduction', type: d.type || 'posttax', amount: r2(num(d.amount)) }));
    const F = r2(deductionLines.filter((d) => d.type === 'rrsp').reduce((a, d) => a + d.amount, 0));
    const U1 = r2(deductionLines.filter((d) => d.type === 'union').reduce((a, d) => a + d.amount, 0));
    const otherDeductions = r2(deductionLines.reduce((a, d) => a + d.amount, 0));

    let C = 0, C2 = 0, EI = 0, fedTax = 0, provTax = 0, erCpp = 0, erCpp2 = 0, erEi = 0;
    let bonusCpp = 0, bonusEi = 0, F5B = 0;
    const td1 = employee.td1 || {};

    if (mode === 'calculated') {
      const cpp = p.cpp, ei = p.ei;
      const year = Number(period.payday.slice(0, 4));
      const month = Number(period.payday.slice(5, 7)) - 1;

      // 2. Pensionable
      step('pensionable', 'Pensionable earnings (PI)', 'Σ lines flagged pensionable (includes taxable benefits and bonuses)',
        { 'Periodic pensionable': r2(PI - PIB), 'Non-periodic pensionable (B)': PIB }, PI);

      // 3. CPP / CPP2
      const win = employee.cppExempt ? { pm: 0, first: 12, last: -1 } : employee.cppFullYear ? { pm: 12, first: 0, last: 11 } : cppMonths(employee.dateOfBirth, year, cpp);
      const PM = win.pm;
      const inWindow = !employee.cppExempt && month >= win.first && month <= win.last;
      const D = ytd.cpp, D2 = ytd.cpp2;
      const exemptP = Math.floor(cpp.basicExemption / P * 100) / 100;
      const maxC = cpp.maxContribution * PM / 12;
      const cppOn = (pi) => (inWindow ? r2(Math.max(0, Math.min(maxC - D, cpp.rate * (pi - exemptP)))) : 0);
      C = cppOn(PI);
      const Creg = PIB > 0 ? cppOn(PI - PIB) : C;
      bonusCpp = r2(C - Creg);
      step('cpp', 'CPP contribution (C)', 'C = min( ' + cpp.maxContribution + ' × PM/12 − D ,  ' + cpp.rate + ' × (PI − ' + cpp.basicExemption + '/P) ), ≥ 0',
        { PI, P, PM, 'D (CPP YTD)': D, 'Exemption per period': r2(exemptP), 'Annual maximum × PM/12': r2(maxC) }, C,
        employee.cppExempt ? 'Employee marked CPP-exempt.' : (!inWindow ? 'Payday is outside the CPP age window (18–70) for this employee.' : (PIB > 0 ? 'Of which on regular pay ' + money(Creg) + ', on non-periodic pay ' + money(bonusCpp) + '.' : '')));

      const W = Math.max(ytd.pensionable, cpp.ympe * PM / 12);
      const maxC2 = cpp.cpp2MaxContribution * PM / 12;
      C2 = inWindow ? r2(Math.max(0, Math.min(maxC2 - D2, (ytd.pensionable + PI - W) * cpp.cpp2Rate))) : 0;
      step('cpp2', 'Second additional CPP (C2)', 'C2 = min( ' + cpp.cpp2MaxContribution + ' × PM/12 − D2 , (PIYTD + PI − W) × ' + cpp.cpp2Rate + ' ),  W = max(PIYTD, YMPE × PM/12)',
        { 'PIYTD': ytd.pensionable, PI, YMPE: cpp.ympe, W: r2(W), 'D2 (CPP2 YTD)': D2 }, C2,
        C2 === 0 ? 'No CPP2 until year-to-date pensionable earnings pass the YMPE (' + money(cpp.ympe) + ').' : '');

      // 4–5. Insurable / EI
      step('insurable', 'Insurable earnings (IE)', 'Σ lines flagged insurable (non-cash benefits excluded)',
        { 'Periodic insurable': r2(IE - IEB), 'Non-periodic insurable': IEB }, IE);
      const D1 = ytd.ei;
      const eiOn = (ie) => (employee.eiExempt ? 0 : r2(Math.max(0, Math.min(ei.maxPremium - D1, ei.rate * ie))));
      EI = eiOn(IE);
      const EIreg = IEB > 0 ? eiOn(IE - IEB) : EI;
      bonusEi = r2(EI - EIreg);
      step('ei', 'EI premium', 'EI = min( ' + ei.maxPremium + ' − D1 , ' + ei.rate + ' × IE ), ≥ 0',
        { IE, 'D1 (EI YTD)': D1, 'Maximum insurable earnings': ei.maxInsurableEarnings }, EI,
        employee.eiExempt ? 'Employee marked EI-exempt.' : '');

      erCpp = C; erCpp2 = C2; erEi = r2(EI * ei.employerMultiplier);

      // 6. Taxable income
      const F5 = r2(C * (cpp.firstAdditionalRate / cpp.rate) + C2);
      F5B = PI > 0 ? r2(F5 * (PIB / PI)) : 0;
      const F5A = r2(F5 - F5B);
      let Iuse = I, note6 = '';
      if (I === 0 && B > 0 && ytd.lastRegularIncome > 0) { Iuse = ytd.lastRegularIncome; note6 = 'No regular pay this period: CRA directs using the most recent regular income (' + money(Iuse) + ') to annualize.'; }
      const HD = num(td1.prescribedZone), F1 = num(td1.annualDeductions);
      const A = Math.max(0, P * (Iuse - F - F5A - U1) - HD - F1);
      step('taxable', 'Annual taxable income (A)', 'F5 = C × (' + cpp.firstAdditionalRate + '/' + cpp.rate + ') + C2;  F5A = F5 × (PI − B)/PI;  A = P × (I − F − F5A − U1) − HD − F1',
        { I: Iuse, B, P, F, U1, F5, F5A, F5B, HD, F1 }, r2(A), note6);

      // K2 bases: per-period base CPP rounded to cents, annualized; replaced by the annual maximum once reached (T4127 note on K2)
      const ratio = cpp.baseRate / cpp.rate;
      const baseCap = cpp.maxBaseContribution * PM / 12;
      const cppReached = PM > 0 && D + C >= maxC - 0.005;
      const eiReached = !employee.eiExempt && D1 + EI >= ei.maxPremium - 0.005;
      const cppBaseFor = (extra) => (cppReached ? baseCap : Math.min(baseCap, Math.max(P * r2(Creg * ratio) + extra, r2(D * ratio))));
      const eiFor = (extra) => (eiReached ? ei.maxPremium : Math.min(ei.maxPremium, Math.max(P * EIreg + extra, D1)));
      const ctx = { HD, td1: { ...td1, dependants: td1.dependants } };

      // 7. Regular tax
      let Treg = { T1: 0, T2: 0 };
      if (I > 0) {
        Treg = annualTax(p, employee.province, { ...ctx, A, grossAnnual: P * I, cppBase: cppBaseFor(0), eiAnnual: eiFor(0) });
        step('federal', 'Federal tax (annual T1)', 'T3 = R × A − K − K1 − K2 − K3 − K4;  K1 = ' + p.federal.brackets[0].rate + ' × TC;  K2 = ' + p.federal.brackets[0].rate + ' × (base CPP + EI, annualized);  K4 = min(' + p.federal.brackets[0].rate + ' × gross, ' + p.federal.brackets[0].rate + ' × CEA)',
          Treg.f, r2(Treg.T1), td1.federalFiled ? 'TC from federal TD1.' : 'No federal TD1 on file: TC = BPAF formula.');
        step('provincial', 'Provincial/territorial tax (annual T2): ' + employee.province, 'T4 = V × A − KP − K1P − K2P − K3P − K4P − K5P;  T2 = T4 + V1 + V2 − S',
          Treg.p, r2(Treg.T2), td1.provincialFiled ? 'TCP from provincial TD1.' : 'No provincial TD1 on file: TCP = provincial basic personal amount.');
      } else {
        step('federal', 'Tax on regular pay', 'No periodic taxable income this period', { I }, 0);
      }

      // 8. Bonus (non-periodic) tax: TB = tax(A with B) − tax(A without B)
      let TBf = 0, TBp = 0;
      if (B > 0) {
        const B1net = Math.max(0, ytd.bonus - ytd.f5b);
        const Awithout = A + B1net;
        const Awith = Awithout + Math.max(0, B - F5B);
        if (Awith <= p.bonus.flatRateIncomeLimit) {
          TBf = B * p.bonus.flatRate;
          step('bonus', 'Tax on non-periodic payment (TB)', 'A (with B) ≤ ' + p.bonus.flatRateIncomeLimit + ' → TB = ' + p.bonus.flatRate + ' × B', { B, 'A with B': r2(Awith) }, r2(TBf));
        } else {
          const ytdBase = r2(ytd.bonusCpp * ratio);
          const s1 = annualTax(p, employee.province, { ...ctx, A: Awith, grossAnnual: P * Iuse + B + ytd.bonus,
            cppBase: cppBaseFor(r2(bonusCpp * ratio) + ytdBase), eiAnnual: eiFor(bonusEi + ytd.bonusEi) });
          const s2 = annualTax(p, employee.province, { ...ctx, A: Awithout, grossAnnual: P * Iuse + ytd.bonus,
            cppBase: cppBaseFor(ytdBase), eiAnnual: eiFor(ytd.bonusEi) });
          TBf = Math.max(0, s1.T1 - s2.T1); TBp = Math.max(0, s1.T2 - s2.T2);
          if (s1.T1 + s1.T2 - (s2.T1 + s2.T2) < 0) { TBf = 0; TBp = 0; }
          step('bonus', 'Tax on non-periodic payment (TB)', 'Step 1: A = P × (I − F − F5A − U1) − HD − F1 + (B − F5B) + (B1 − F5BYTD);  Step 2: same without (B − F5B);  TB = (T1 + T2)step1 − (T1 + T2)step2',
            { B, 'B1 (YTD non-periodic)': ytd.bonus, F5BYTD: ytd.f5b, 'A step 1': r2(Awith), 'K2 step 1': s1.f.K2, 'T3 step 1': r2(s1.T1), 'T2 step 1': r2(s1.T2),
              'A step 2': r2(Awithout), 'K2 step 2': s2.f.K2, 'T3 step 2': r2(s2.T1), 'T2 step 2': r2(s2.T2), 'TB federal': r2(TBf), 'TB provincial': r2(TBp) },
            r2(TBf + TBp));
        }
      }

      // 9. Tax for the period
      const L = num(td1.additionalTax);
      const T = r2((Treg.T1 + Treg.T2) / P + L + TBf + TBp);
      fedTax = r2(Treg.T1 / P + L + TBf);
      provTax = r2(T - fedTax);
      step('tax', 'Income tax for the pay period (T)', 'T = (T1 + T2) / P + L + TB',
        { 'T1 / P': r2(Treg.T1 / P), 'T2 / P': r2(Treg.T2 / P), 'L (additional tax, TD1)': L, TB: r2(TBf + TBp) }, T,
        'Federal ' + money(fedTax) + ', provincial ' + money(provTax) + '.');
    } else {
      const m = input.manual || {};
      C = r2(num(m.cpp)); C2 = r2(num(m.cpp2)); EI = r2(num(m.ei));
      fedTax = r2(num(m.federalTax)); provTax = r2(num(m.provincialTax));
      erCpp = has(m.employerCpp) ? r2(num(m.employerCpp)) : C;
      erCpp2 = has(m.employerCpp2) ? r2(num(m.employerCpp2)) : C2;
      erEi = has(m.employerEi) ? r2(num(m.employerEi)) : (p ? r2(EI * p.ei.employerMultiplier) : 0);
      step('manual', 'Manual entry', 'Statutory deductions entered by the user; no CRA formula applied', { CPP: C, CPP2: C2, EI, 'Federal tax': fedTax, 'Provincial tax': provTax }, r2(C + C2 + EI + fedTax + provTax));
    }

    const tax = r2(fedTax + provTax);
    const statutory = r2(C + C2 + EI + tax);
    const totalDeductions = r2(statutory + otherDeductions);
    step('other', 'Other deductions', 'Σ deduction lines', Object.fromEntries(deductionLines.map((d) => [d.label, d.amount])), otherDeductions);
    const net = r2(cashGross - totalDeductions);
    step('net', 'Net pay', 'Net = cash earnings − (CPP + CPP2 + EI + tax + other deductions)',
      { 'Cash earnings': cashGross, CPP: C, CPP2: C2, EI, Tax: tax, 'Other deductions': otherDeductions }, net,
      benefits > 0 ? 'Non-cash taxable benefits (' + money(benefits) + ') are taxed but not paid out.' : '');

    const current = { gross, cashGross, benefits, pensionable: PI, insurable: IE, periodicTaxable: I, cpp: C, cpp2: C2, ei: EI,
      federalTax: fedTax, provincialTax: provTax, tax, otherDeductions, totalDeductions, net,
      bonus: B, bonusCpp, bonusEi, f5b: F5B, employerCpp: erCpp, employerCpp2: erCpp2, employerEi: erEi };
    const ytdAfter = {};
    for (const f of YTD_FIELDS) ytdAfter[f] = r2(num(ytd[f]) + num(current[f]));
    const linesYtd = lines.map((l) => ({ ...l, ytd: r2((ytd.lines[l.key] || 0) + l.amount) }));
    // YTD-only lines (paid earlier this year, not this period)
    const ytdOnlyLines = Object.entries(ytd.lines).filter(([k]) => !lines.some((l) => l.key === k))
      .map(([k, v]) => ({ key: k, kind: k.split('|')[0], label: labelFromKey(k), amount: 0, hours: null, rate: null, ytd: v }));
    const dedYtd = deductionLines.map((d) => ({ ...d, ytd: r2((ytd.deductions[d.key] || 0) + d.amount) }));
    const ytdOnlyDed = Object.entries(ytd.deductions).filter(([k]) => !deductionLines.some((d) => d.key === k))
      .map(([k, v]) => ({ key: k, type: k.split('|')[0], label: labelFromKey(k), amount: 0, ytd: v }));

    return {
      ok: true, mode, calcVersion: CALC_VERSION,
      paramsPeriodId: p ? p.id : null, paramsSource: p ? p.source : null,
      periodsPerYear: P,
      lines: linesYtd, ytdOnlyLines, deductionLines: dedYtd, ytdOnlyDeductions: ytdOnlyDed,
      current, ytdPrior: ytd, ytd: ytdAfter,
      deposits: allocateDeposits(net, input.deposits || []),
      audit,
    };
  }
  function labelFromKey(k) { const s = k.split('|')[1] || ''; return s.charAt(0).toUpperCase() + s.slice(1); }

  // ---------- deposit allocation ----------
  // Fixed amounts first, then percentages of net, then one "remainder" account.
  function allocateDeposits(net, deposits) {
    let left = r2(net);
    const out = deposits.map((d) => ({ ...d, allocated: 0 }));
    for (const d of out) if (d.method === 'amount') { d.allocated = r2(Math.min(num(d.value), Math.max(0, left))); left = r2(left - d.allocated); }
    const base = left;
    for (const d of out) if (d.method === 'percent') { d.allocated = r2(Math.min(base * num(d.value) / 100, Math.max(0, left))); left = r2(left - d.allocated); }
    const rem = out.find((d) => d.method === 'remainder');
    if (rem) { rem.allocated = r2(Math.max(0, left)); left = r2(left - rem.allocated); }
    return { lines: out, unallocated: left };
  }

  // ---------- validation (never mutates; reports) ----------
  const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s || '') && !isNaN(Date.parse(s + 'T00:00:00Z')) && new Date(s + 'T00:00:00Z').toISOString().slice(0, 10) === s;
  const days = (a, b) => (Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400000;

  function validate(stub, result, { stubs = [], employee } = {}) {
    const out = [];
    const err = (field, message) => out.push({ level: 'error', field, message });
    const warn = (field, message) => out.push({ level: 'warning', field, message });
    const pd = stub.period || {};
    for (const [f, label] of [['start', 'Period start'], ['end', 'Period end'], ['payday', 'Payday']]) {
      if (!pd[f]) err('period.' + f, label + ' is required.');
      else if (!isDate(pd[f])) err('period.' + f, label + ' "' + pd[f] + '" is not a real calendar date.');
    }
    if (isDate(pd.start) && isDate(pd.end) && pd.end < pd.start) err('period.end', 'Period end is before period start.');
    const freq = core().PAY_FREQUENCIES[pd.frequency];
    if (!freq) err('period.frequency', 'Pay frequency "' + (pd.frequency || '') + '" is not valid.');
    if (isDate(pd.start) && isDate(pd.end) && freq && pd.end >= pd.start) {
      const len = days(pd.start, pd.end) + 1;
      const expect = { weekly: [7, 7], biweekly: [14, 14], semimonthly: [13, 16], monthly: [28, 31] }[pd.frequency];
      if (expect && (len < expect[0] || len > expect[1])) warn('period.end', 'Period is ' + len + ' days long; ' + freq.label.toLowerCase() + ' periods are usually ' + (expect[0] === expect[1] ? expect[0] : expect[0] + '–' + expect[1]) + ' days.');
    }
    if (isDate(pd.payday) && isDate(pd.end)) {
      if (pd.payday < pd.start) err('period.payday', 'Payday is before the pay period starts.');
      else if (pd.payday < pd.end) warn('period.payday', 'Payday falls before the period ends (paying in advance).');
      if (days(pd.end, pd.payday) > 31) warn('period.payday', 'Payday is more than 31 days after the period ends.');
    }
    if (isDate(pd.payday) && stub.taxYear && Number(pd.payday.slice(0, 4)) !== Number(stub.taxYear)) err('period.payday', 'Payday year (' + pd.payday.slice(0, 4) + ') does not match tax year ' + stub.taxYear + '. Tax year follows the date paid.');

    (stub.earnings || []).forEach((l, i) => {
      for (const f of ['hours', 'rate', 'amount', 'multiplier']) if (has(l[f]) && num(l[f]) < 0) err('earnings.' + i, (l.label || 'Earnings line') + ': ' + f + ' cannot be negative.');
    });
    (stub.deductions || []).forEach((d, i) => { if (has(d.amount) && num(d.amount) < 0) err('deductions.' + i, (d.label || 'Deduction') + ': amount cannot be negative.'); });
    const m = stub.manual || {};
    if (stub.mode === 'manual') for (const f of ['cpp', 'cpp2', 'ei', 'federalTax', 'provincialTax', 'employerCpp', 'employerCpp2', 'employerEi']) if (has(m[f]) && num(m[f]) < 0) err('manual.' + f, f + ' cannot be negative.');

    if (result && result.ok) {
      const p = core().paramsFor(pd.payday);
      const y = result.ytd, c = result.current;
      if (p) {
        if (y.cpp > p.cpp.maxContribution + 0.005) err('manual.cpp', 'CPP year-to-date ' + money(y.cpp) + ' exceeds the ' + p.id.slice(0, 4) + ' maximum ' + money(p.cpp.maxContribution) + '.');
        if (y.cpp2 > p.cpp.cpp2MaxContribution + 0.005) err('manual.cpp2', 'CPP2 year-to-date ' + money(y.cpp2) + ' exceeds the maximum ' + money(p.cpp.cpp2MaxContribution) + '.');
        if (y.ei > p.ei.maxPremium + 0.005) err('manual.ei', 'EI year-to-date ' + money(y.ei) + ' exceeds the maximum ' + money(p.ei.maxPremium) + '.');
        if (y.cpp2 > 0 && y.pensionable <= p.cpp.ympe && stub.mode === 'manual') warn('manual.cpp2', 'CPP2 is present but year-to-date pensionable earnings have not passed the YMPE.');
      }
      for (const f of ['gross', 'cpp', 'cpp2', 'ei', 'tax', 'totalDeductions', 'net']) {
        if (result.ytdPrior[f] < -0.005) err('ytd.' + f, 'Prior year-to-date ' + f + ' is negative (' + money(result.ytdPrior[f]) + ').');
        if (c[f] > 0 && y[f] + 0.005 < c[f]) err('ytd.' + f, 'Current ' + f + ' is greater than year-to-date ' + f + '.');
      }
      if (c.net < 0) err('net', 'Net pay is negative (' + money(c.net) + '). Deductions exceed cash earnings.');
      if (c.gross === 0) warn('earnings', 'Gross earnings are zero.');
      const dep = result.deposits;
      if (dep.lines.length && Math.abs(dep.unallocated) > 0.004) err('deposits', 'Deposit allocation leaves ' + money(dep.unallocated) + ' unassigned. Add a remainder account or adjust amounts.');
      if (stub.mode === 'manual' && p && employee) {
        const PI = c.pensionable;
        if (c.cpp === 0 && PI > p.cpp.basicExemption / result.periodsPerYear && !employee.cppExempt && y.cpp < p.cpp.maxContribution) warn('manual.cpp', 'CPP is zero although pensionable earnings exceed the per-period exemption.');
        if (c.ei === 0 && c.insurable > 0 && !employee.eiExempt && y.ei < p.ei.maxPremium) warn('manual.ei', 'EI is zero although there are insurable earnings.');
      }
    }

    // Duplicate / overlapping periods for the same employee
    for (const s of stubs) {
      if (s.id === stub.id || s.status === 'superseded' || s.chainId === stub.chainId) continue;
      if (s.employeeId !== stub.employeeId || s.employerId !== stub.employerId) continue;
      const sp = s.period || {};
      if (sp.start && pd.start && sp.start <= pd.end && pd.start <= sp.end) warn('period', 'Overlaps ' + (s.status === 'finalized' ? 'finalized' : 'draft') + ' stub ' + (s.stubNumber || 'dated ' + sp.payday) + ' (' + sp.start + ' to ' + sp.end + ').');
      else if (sp.payday && sp.payday === pd.payday) warn('period.payday', (s.stubNumber ? 'Stub ' + s.stubNumber : 'A draft stub') + ' has the same payday.');
    }
    if (stub.status === 'draft' && isDate(pd.payday)) {
      const later = stubs.filter((s) => s.status === 'finalized' && s.employeeId === stub.employeeId && s.employerId === stub.employerId && s.chainId !== stub.chainId && s.taxYear === stub.taxYear && s.period.payday > pd.payday);
      if (later.length) warn('period.payday', later.length + ' finalized stub(s) have a later payday. Their year-to-date figures will not include this pay.');
    }
    return out;
  }

  // ---------- record integrity ----------
  function canonical(v) {
    if (Array.isArray(v)) return '[' + v.map(canonical).join(',') + ']';
    if (v && typeof v === 'object') return '{' + Object.keys(v).sort().map((k) => JSON.stringify(k) + ':' + canonical(v[k])).join(',') + '}';
    return JSON.stringify(v === undefined ? null : v);
  }
  async function sha256Hex(text) {
    const buf = await root.crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
  }
  function sealPayload(stub) {
    const { contentHash, updatedAt, supersededById, supersededAt, status, ...rest } = stub;
    return canonical(rest);
  }

  function stubNumber(employerCode, year, seq, revision) {
    return String(employerCode || 'EMP').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6) + '-' + year + '-' + String(seq).padStart(5, '0') + (revision ? '-R' + revision : '');
  }

  // Next pay period dates from the current one
  function nextPeriod(period) {
    const add = (s, d) => { const t = new Date(s + 'T00:00:00Z'); t.setUTCDate(t.getUTCDate() + d); return t.toISOString().slice(0, 10); };
    const addMonths = (s, n) => { const [y, m, d] = s.split('-').map(Number); const t = new Date(Date.UTC(y, m - 1 + n, 1)); const last = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0)).getUTCDate(); t.setUTCDate(Math.min(d, last)); return t.toISOString().slice(0, 10); };
    const lag = days(period.end, period.payday);
    let start, end;
    if (period.frequency.startsWith('weekly') || period.frequency.startsWith('biweekly')) {
      const n = period.frequency.startsWith('weekly') ? 7 : 14;
      start = add(period.start, n); end = add(period.end, n);
    } else if (period.frequency === 'semimonthly') {
      start = add(period.end, 1);
      const [y, m, d] = start.split('-').map(Number);
      end = d <= 15 ? start.slice(0, 8) + '15' : new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
    } else {
      start = add(period.end, 1);
      end = add(addMonths(start, 1), -1);
    }
    return { ...period, start, end, payday: add(end, isNaN(lag) ? 0 : lag) };
  }

  const api = { CALC_VERSION, EARNING_KINDS, DEDUCTION_TYPES, calculate, priorYtd, emptyYtd, missingInputs, validate, allocateDeposits,
    annualTax, cppMonths, canonical, sha256Hex, sealPayload, stubNumber, nextPeriod, r2, money, pct, lineAmount, isDate };
  root.PayrollCore = Object.assign(root.PayrollCore || {}, api);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

