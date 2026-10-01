# Canadian Payroll Calculator

A browser tool for calculating a Canadian pay period and projecting T4 boxes from gross pay and opening YTD balances. It uses the CRA T4127 Option 1 formulas for **2026**, including the January and July parameter sets. Calculations, comparisons and PDF creation run locally; the app does not upload payroll data or use external scripts.

## Open the tool

Download this repository as a ZIP, extract it, and open `index.html` in a modern browser. It also works on any static web host, with the repository root as the published directory and no build step.

The opening example is fictional. Enter your period dates, payday, province of employment, pay frequency, regular cash gross and cash gross YTD. Enter the number of **previous** payments, excluding the selected payment. Gross can be identified as before or including the selected pay; all other opening balances must be from **before** this pay.

Choose **estimated balances** for equal prior payments, or **recorded balances** for actual payroll inputs. Recorded mode requires prior CPP, CPP2, EI and eligible pensionable/insurable earnings; it does not infer those deductions from gross income. Estimated mode explicitly assumes equal prior regular payments, one employer, unchanged eligibility and benefit treatment. A change in salary makes this estimate less reliable.

Income tax previously deducted is separate: leave it blank if unknown. Box 22 and YTD net pay then remain `NEEDS REVIEW`, rather than assuming zero withholding. Enter pension, group RRSP, union dues and after-tax deductions where applicable. TD1 basic mode uses the CRA basic amount formulas; entered mode uses the signed TD1 totals you provide.

## Results and exports

- Paystub worksheet: cash gross, taxable benefits, CPP, CPP2, EI, federal/provincial income tax, before/after-tax deductions, net and YTD totals, and employer contributions.
- T4 projection: boxes 14, 16, 16A, 18, 20, 22, 24, 26, 44, 52, and code 40. Code 40 is already included in box 14; employee group RRSP is excluded from box 20. Box 24 is capped at the EI maximum, and box 26 at YAMPE.
- A payment-by-payment schedule through the final scheduled payday of the year, with a CSV download. Rates and annual caps are recalculated for each payday; a current one-time bonus is not repeated.
- Selectable-text PDF downloads of the paystub worksheet and T4 projection. These are planning documents, not official employer statements or CRA filing slips.
- A formula audit, input JSON save/load, and comparison with amounts manually entered from CRA, ADP or an existing paystub. Differences and unknowns appear in red; clicking a mismatch shows its row in the preview.

No SIN, bank account, real employee, or client PDF is bundled. Data stays in memory until you close/reload the page unless you explicitly save an input JSON file or a report. External CRA/ADP links open empty calculators. They are verification links, not an API integration.

## Pension adjustment

Box 52 is separately reviewed. You can enter the plan administrator's annual PA, confirm that no RPP/DPSP adjustment applies, or select a **simple money-purchase estimate**. The estimate is employee plus employer RPP contributions, rounded to whole dollars, and assumes no forfeitures, refunds, transfers, DPSP amounts, defined-benefit components or other adjustments. It is not a general pension-plan PA calculator.

## Scope

2026 ordinary salary/wages and simple bonuses paid with regular salary are calculated for CRA-covered provinces/territories. Quebec is blocked because QPP, QPIP and provincial tax require Revenu Québec rules. Other years are blocked until their parameters are added and verified. The app supports weekly (52/53), biweekly (26/27), semi-monthly (24) and monthly (12) schedules.

Non-cash benefits entered here are ordinary code 40 taxable, CPP pensionable, EI non-insurable benefits. Different benefit codes, cash allowances, employer RRSP benefits and per-line tax treatments need separate handling. The engine's ordinary regular-bonus method requires recorded prior bonus amounts and the related contributions when there are previous payments. Standalone bonuses, F3/F4 deductions from bonuses, commissions/TD1X, cumulative averaging (Option 2), retroactive pay, clergy, reserve exemptions, multi-province/QPP transfers, reduced employer EI rates, CPT30/disability changes, special tax credits and filing XML are outside this UI's scope.

Confirm future payment dates with the employer's payroll calendar. Monthly and semi-monthly dates retain the selected period's payment lag. A manual payment count ending before the final scheduled payday is clearly marked as a partial-year projection. Employer CPP matches employee CPP; employer EI uses the standard 1.4 multiplier. The built-in PDF fonts support Latin/WinAnsi names; browser Print can retain other scripts.

## Verification

Run the calculation and T4 checks with Node:

```text
node check.cjs
node --test tests/engine.test.js
```

`check.cjs` covers independently observed calculator amounts, annual limits, period-by-period projection, unknown YTD, inclusive/exclusive gross timing, pension/benefit box mapping, age eligibility, invalid dates/years/inputs, bonus handling and PDF reports. The reused engine tests include the CRA published bonus worked example. PDF output was text-extracted, rendered and inspected; browser tabs, recalculation, review links and comparison highlighting were checked. Export controls leave a visible download link so a blocked automatic download can be retried in the browser.

Saved-input import and recalculation were verified in the preview browser. That browser did not expose a download event for local Blob links, so saving files through its download controls remains unverified. The PDF-generation checks above verify the generated report bytes and layout independently.

On October 1, 2026, the following fictional cases were checked directly:

| Case | CPP | CPP2 | EI | Federal tax | Ontario tax | Total tax | Net |
|---|---:|---:|---:|---:|---:|---:|---:|
| CRA PDOC: $5,000 biweekly, Sept 18, TD1 $16,452 / $12,989, no opening contributions | 289.49 | 0.00 | 81.50 | 771.80 | 427.02 | 1,198.82 | 3,430.19 |
| ADP quick calculator: same gross/frequency/claims, Oct 1, no YTD | 289.49 | 0.00 | 81.50 | 771.80 | 427.02 | 1,198.82 | 3,430.19 |
| CRA PDOC: same Sept 18 pay with CPP/CPP2/EI annual maximums reached | 0.00 | 0.00 | 0.00 | 784.45 | 435.49 | 1,219.94 | 3,780.06 |

These matches validate the documented cases. They do not establish that every employer's payroll method or benefit treatment will produce identical tax withholding. Recheck against PDOC when changing parameters.

## CRA sources

Rates and formulas checked October 1, 2026:

- [T4127, January 2026, 122nd edition](https://www.canada.ca/en/revenue-agency/services/forms-publications/payroll/t4127-payroll-deductions-formulas/t4127-jan/t4127-jan-payroll-deductions-formulas-computer-programs.html)
- [T4127, July 2026, 123rd edition](https://www.canada.ca/en/revenue-agency/services/forms-publications/payroll/t4127-payroll-deductions-formulas/t4127-jul/t4127-jul-payroll-deductions-formulas.html)
- [CPP rates, maximums and exemptions](https://www.canada.ca/en/revenue-agency/services/tax/businesses/topics/payroll/payroll-deductions-contributions/canada-pension-plan-cpp/cpp-contribution-rates-maximums-exemptions.html)
- [CPP2 rates and maximums](https://www.canada.ca/en/revenue-agency/services/tax/businesses/topics/payroll/calculating-deductions/making-deductions/second-additional-cpp-contribution-rates-maximums.html)
- [EI rates and maximums](https://www.canada.ca/en/revenue-agency/services/tax/businesses/topics/payroll/payroll-deductions-contributions/employment-insurance-ei/ei-premium-rates-maximums.html)
- [T4 employer box instructions](https://www.canada.ca/en/revenue-agency/services/tax/businesses/topics/payroll/completing-filing-information-returns/t4-information-employers/t4-slip.html)
- [CRA PDOC](https://apps.cra-arc.gc.ca/ebci/rhpd/beta/entry) and [ADP calculator](https://www.adp.ca/en/resources/tools/calculator.aspx#/simple/regular)

The engine, parameter tables, template helpers and PDF writer are reused from the owner's [payroll-system](https://github.com/amirhosseinforouqi/payroll-system) project. This simpler interface and T4 projection layer live in `app.js`, `src/calculator.js` and `src/reports.js`. Future tax-year updates belong in `src/tax-params.js` and must be validated with current CRA sources and calculator cases.
