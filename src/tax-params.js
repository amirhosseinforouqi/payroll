/*
 * Payroll Studio: statutory parameters, stored by tax year and effective period.
 * Every number the engine uses comes from here. Each period cites its CRA source.
 * To add a year: append an entry to TAX_YEARS (copy the last period, update values
 * from that year's T4127 tables 8.1 / 8.2 and chapters 6 & 7) and run the tests.
 */
(function (root) {
  'use strict';

  // [threshold A, rate, constant K]: Table 8.1 rows
  const br = (rows) => rows.map(([from, rate, k]) => ({ from, rate, k }));

  const T4127_JAN_2026 = {
    title: 'CRA T4127 Payroll Deductions Formulas, 122nd Edition',
    effective: '2026-01-01',
    url: 'https://www.canada.ca/en/revenue-agency/services/forms-publications/payroll/t4127-payroll-deductions-formulas/t4127-jan.html',
    tables: 'Table 8.1 (rates, thresholds, constants), Table 8.2 (other rates and amounts), Chapter 6 (CPP), Chapter 7 (EI)',
  };
  const T4127_JUL_2026 = {
    title: 'CRA T4127 Payroll Deductions Formulas, 123rd Edition',
    effective: '2026-07-01',
    url: 'https://www.canada.ca/en/revenue-agency/services/forms-publications/payroll/t4127-payroll-deductions-formulas/t4127-jul.html',
    tables: 'Table 8.1 / 8.2 CSV (rates-income-thresholds-constants-26e.csv, other-rates-amounts-26e.csv); prorated BC, NL and PE values for payments on or after July 1, 2026',
  };

  const FEDERAL_2026 = {
    brackets: br([[0, 0.14, 0], [58523, 0.205, 3804], [117045, 0.26, 10241], [181440, 0.29, 15685], [258482, 0.33, 26024]]),
    // BPAF: full amount up to phaseStart, reduced linearly to `min` at phaseEnd (NI = A + HD)
    bpa: { max: 16452, min: 14829, phaseStart: 181440, phaseEnd: 258482 },
    canadaEmploymentAmount: 1501,
  };

  const CPP_2026 = {
    rate: 0.0595, // base 4.95% + first additional 1.00%
    baseRate: 0.0495,
    firstAdditionalRate: 0.01,
    basicExemption: 3500,
    ympe: 74600,
    yampe: 85000,
    maxContribution: 4230.45,
    maxBaseContribution: 3519.45,
    cpp2Rate: 0.04,
    cpp2MaxContribution: 416.0,
    minAge: 18, // contributions start the month after the 18th birthday
    maxAge: 70, // and stop the month after the 70th birthday
  };

  const EI_2026 = {
    rate: 0.0163,
    maxInsurableEarnings: 68900,
    maxPremium: 1123.07,
    employerMultiplier: 1.4,
  };

  // Tax on a non-periodic payment when annual taxable income with it is at most this (T4127 bonus method, Step 1 note)
  const BONUS_2026 = { flatRateIncomeLimit: 5000, flatRate: 0.15 };

  const PROVINCES_JAN_2026 = {
    AB: { name: 'Alberta', brackets: br([[0, 0.08, 0], [61200, 0.10, 1224], [154259, 0.12, 4309], [185111, 0.13, 6160], [246813, 0.14, 8628], [370220, 0.15, 12331]]),
      basicAmount: 22769, supplementalCredit: { threshold: 4896, rate: 0.25 } },
    BC: { name: 'British Columbia', brackets: br([[0, 0.0506, 0], [50363, 0.077, 1330], [100728, 0.105, 4150], [115648, 0.1229, 6220], [140430, 0.147, 9604], [190405, 0.168, 13603], [265545, 0.205, 23428]]),
      basicAmount: 13216, taxReduction: { kind: 'BC', amount: 575, fullUpTo: 25570, zeroAbove: 41722, phaseRate: 0.0356 } },
    MB: { name: 'Manitoba', brackets: br([[0, 0.108, 0], [47000, 0.1275, 917], [100000, 0.174, 5567]]),
      basicAmount: 15780, basicAmountPhaseOut: { start: 200000, end: 400000 } },
    NB: { name: 'New Brunswick', brackets: br([[0, 0.094, 0], [52333, 0.14, 2407], [104666, 0.16, 4501], [193861, 0.195, 11286]]),
      basicAmount: 13664 },
    NL: { name: 'Newfoundland and Labrador', brackets: br([[0, 0.087, 0], [44678, 0.145, 2591], [89354, 0.158, 3753], [159528, 0.178, 6943], [223340, 0.198, 11410], [285319, 0.208, 14263], [570638, 0.213, 17117], [1141275, 0.218, 22823]]),
      basicAmount: 11188 },
    NS: { name: 'Nova Scotia', brackets: br([[0, 0.0879, 0], [30995, 0.1495, 1909], [61991, 0.1667, 2976], [97417, 0.175, 3784], [157124, 0.21, 9283]]),
      basicAmount: 11932 },
    NT: { name: 'Northwest Territories', brackets: br([[0, 0.059, 0], [53003, 0.086, 1431], [106009, 0.122, 5247], [172346, 0.1405, 8436]]),
      basicAmount: 18198 },
    NU: { name: 'Nunavut', brackets: br([[0, 0.04, 0], [55801, 0.07, 1674], [111602, 0.09, 3906], [181439, 0.115, 8442]]),
      basicAmount: 19659 },
    ON: { name: 'Ontario', brackets: br([[0, 0.0505, 0], [53891, 0.0915, 2210], [107785, 0.1116, 4376], [150000, 0.1216, 5876], [220000, 0.1316, 8076]]),
      basicAmount: 12989,
      surtax: [{ over: 5818, rate: 0.20 }, { over: 7446, rate: 0.36 }],
      // Ontario Health Premium on annual taxable income A: premium = min(cap, base + rate × (A − from)) for A in (from, to]
      healthPremium: [
        { from: 0, to: 20000, base: 0, rate: 0, cap: 0 },
        { from: 20000, to: 36000, base: 0, rate: 0.06, cap: 300 },
        { from: 36000, to: 48000, base: 300, rate: 0.06, cap: 450 },
        { from: 48000, to: 72000, base: 450, rate: 0.25, cap: 600 },
        { from: 72000, to: 200000, base: 600, rate: 0.25, cap: 750 },
        { from: 200000, to: Infinity, base: 750, rate: 0.25, cap: 900 },
      ],
      taxReduction: { kind: 'ON', basic: 300, perDependant: 554 } },
    PE: { name: 'Prince Edward Island', brackets: br([[0, 0.095, 0], [33928, 0.1347, 1347], [65820, 0.166, 3407], [106890, 0.1762, 4497], [142520, 0.19, 6464]]),
      basicAmount: 15000 },
    SK: { name: 'Saskatchewan', brackets: br([[0, 0.105, 0], [54532, 0.125, 1091], [155805, 0.145, 4207]]),
      basicAmount: 20381 },
    YT: { name: 'Yukon', brackets: br([[0, 0.064, 0], [58523, 0.09, 1522], [117045, 0.109, 3745], [181440, 0.128, 7193], [500000, 0.15, 18193]]),
      basicAmountFollowsFederal: true, territorialEmploymentAmount: 1501 },
  };

  const PROVINCES_JUL_2026 = Object.assign({}, PROVINCES_JAN_2026, {
    BC: Object.assign({}, PROVINCES_JAN_2026.BC, {
      brackets: br([[0, 0.0614, 0], [50363, 0.077, 786], [100728, 0.105, 3606], [115648, 0.1229, 5676], [140430, 0.147, 9061], [190405, 0.168, 13059], [265545, 0.205, 22884]]),
      taxReduction: { kind: 'BC', amount: 805, fullUpTo: 25570, zeroAbove: 44952, phaseRate: 0.0356 },
    }),
    NL: Object.assign({}, PROVINCES_JAN_2026.NL, { basicAmount: 15000 }),
    PE: Object.assign({}, PROVINCES_JAN_2026.PE, {
      brackets: br([[0, 0.095, 0], [33928, 0.1347, 1347], [65820, 0.166, 3407], [106890, 0.1762, 4497], [142520, 0.19, 6464], [200000, 0.21, 10464]]),
    }),
  });

  const common2026 = { federal: FEDERAL_2026, cpp: CPP_2026, ei: EI_2026, bonus: BONUS_2026 };

  const TAX_YEARS = {
    2026: {
      year: 2026,
      periods: [
        Object.assign({ id: '2026-01', effectiveFrom: '2026-01-01', effectiveTo: '2026-06-30', source: T4127_JAN_2026, provinces: PROVINCES_JAN_2026 }, common2026),
        Object.assign({ id: '2026-07', effectiveFrom: '2026-07-01', effectiveTo: '2026-12-31', source: T4127_JUL_2026, provinces: PROVINCES_JUL_2026 }, common2026),
      ],
    },
  };

  // Provinces the CRA formulas do not cover for provincial income tax.
  const UNSUPPORTED_JURISDICTIONS = {
    QC: 'Quebec income tax, QPP and QPIP are administered by Revenu Québec (TP-1015.F), not CRA T4127. Use Manual mode for Quebec employees.',
  };

  const PAY_FREQUENCIES = {
    weekly: { label: 'Weekly', periods: 52 },
    weekly53: { label: 'Weekly (53 paydays)', periods: 53 },
    biweekly: { label: 'Bi-weekly', periods: 26 },
    biweekly27: { label: 'Bi-weekly (27 paydays)', periods: 27 },
    semimonthly: { label: 'Semi-monthly', periods: 24 },
    monthly: { label: 'Monthly', periods: 12 },
  };

  // Paydays determine the tax year and the effective period (CRA: deductions follow the date paid).
  function paramsFor(payday) {
    const year = Number(String(payday || '').slice(0, 4));
    const y = TAX_YEARS[year];
    if (!y) return null;
    return y.periods.find((p) => payday >= p.effectiveFrom && payday <= p.effectiveTo) || null;
  }

  const api = { TAX_YEARS, UNSUPPORTED_JURISDICTIONS, PAY_FREQUENCIES, paramsFor };
  root.PayrollCore = Object.assign(root.PayrollCore || {}, api);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

