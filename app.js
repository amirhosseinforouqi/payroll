'use strict';
const PC=PayrollCore, Calc=PayrollCalculator, Reports=PayrollReports;
const $=id=>document.getElementById(id);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let scenario=null,tabName='paystub';
const select=(id,label,options,help='')=>`<div><label for="${id}">${label}</label><select id="${id}" name="${id}">${options.map(([v,t])=>`<option value="${v}">${esc(t)}</option>`).join('')}</select>${help?`<div class="help">${help}</div>`:''}</div>`;
const field=(id,label,value='',help='',type='number',full=false)=>`<div class="${full?'full':''}"><label for="${id}">${label}</label><input id="${id}" name="${id}" type="${type}" value="${esc(value)}" ${type==='number'?'min="0" max="1000000000" step="0.01" inputmode="decimal"':type==='date'?'':'maxlength="80"'}>${help?`<div class="help">${help}</div>`:''}</div>`;
const group=(title,html)=>`<fieldset><legend>${title}</legend><div class="grid">${html}</div></fieldset>`;
const detail=(title,html)=>`<details><summary>${title}</summary><div class="grid">${html}</div></details>`;
const provs=Object.entries(PC.paramsFor('2026-01-01').provinces).map(([v,p])=>[v,p.name]);provs.push(['QC','Quebec (separate rules required)']);
$('payroll-form').innerHTML=
  group('1. Pay period',field('start','Period start','2026-09-06','','date')+field('end','Period end','2026-09-19','','date')+field('payday','Pay date','2026-09-18','Rates and tax year follow the date paid.','date')+select('frequency','Pay frequency',Object.entries(PC.PAY_FREQUENCIES).map(([k,p])=>[k,p.label+` · ${p.periods} / year`]))+select('province','Province of employment',provs))+
  group('2. Gross earnings & YTD',field('gross','Regular cash gross','5000','This pay period, before deductions. Excludes the bonus and non-cash benefits below.')+field('priorGross','Cash gross YTD','90000','Cash earnings only. Non-cash benefits are entered separately.')+select('ytdTiming','This gross YTD amount is…',[['before','Before this payment'],['includes','Including this payment']],'Only cash gross is adjusted by this setting. Every other opening balance below is BEFORE this payment.')+field('priorPeriods','Previous payments this year','18','Excludes the selected payment; use the payroll calendar, not hours worked.')+field('bonus','One-time bonus','0','Added to cash gross for this payment only.')+field('benefit','Non-cash taxable benefits','0','Per pay; code 40 benefits, CPP pensionable, EI not insurable.')+select('balanceMode','Opening contribution balances',[['estimate','Estimate from equal prior payments'],['records','Use recorded YTD balances']],'Estimating assumes equal prior pay, one employer and unchanged benefit treatment.'))+
  `<div id="recorded-balances" hidden>${detail('Recorded opening balances (before this payment)',field('priorBenefits','YTD taxable benefits')+field('priorPensionable','YTD CPP pensionable earnings','', 'Eligible earnings; may be capped at YAMPE on a slip.')+field('priorInsurable','YTD EI insurable earnings')+field('priorCpp','YTD CPP deducted')+field('priorCpp2','YTD CPP2 deducted')+field('priorEi','YTD EI deducted')+field('priorBonus','YTD bonuses')+field('priorBonusCpp','CPP deducted on prior bonuses')+field('priorBonusEi','EI deducted on prior bonuses')+field('priorF5b','Additional CPP deduction on prior bonuses'))}</div>`+
  field('priorTax','Income tax deducted before this payment','','Combined federal + provincial. Leave blank if unknown; T4 box 22 will need review.', 'number',true)+
  detail('3. Pension, RRSP & other deductions',select('rppMode','Pension entry method',[['percent','% of regular cash gross'],['fixed','Fixed amount per pay']],'Pension percentages exclude the one-time bonus.')+field('rpp','Employee RPP (% or $)','0')+field('employerRpp','Employer RPP (% or $)','0')+field('rrsp','Employee group RRSP / pay','0')+field('union','Union dues / pay','0')+Calc.afterNames.map((f,i)=>field(f,Calc.afterLabels[i]+' / pay','0')).join('')+`<p class="help full">Health, dental, disability and optional insurance above are employee after-tax deductions. Non-taxable employer health benefits are not inferred from gross income.</p>`)+
  detail('4. TD1 claims & contribution eligibility',select('td1','TD1 claims',[['basic','Use CRA basic personal amounts'],['entered','Use entered TD1 totals']],'Basic mode applies the CRA income-dependent basic amounts; actual signed TD1 claims may differ.')+field('federalClaim','Federal TD1 total claim','','Used only with entered TD1 totals.')+field('provincialClaim','Provincial TD1 total claim','','Used only with entered TD1 totals.')+field('additionalTax','Additional tax / pay','0')+field('dependants','Ontario eligible dependants','0')+select('cppStatus','CPP eligibility',[['full','Eligible for all 12 months'],['exempt','Exempt for the whole year'],['age','Use date of birth']],'Confirm eligibility. Age 65–69 CPT30 elections and disability changes need payroll review.')+field('dob','Date of birth','','Only needed when using the age window.','date')+`<div class="full"><label class="check-label" for="eiExempt"><input type="checkbox" id="eiExempt" name="eiExempt">EI-exempt employment for the whole year</label></div>`)+
  detail('5. T4 projection & opening deductions',field('remaining','Payments to project, including this one','','Blank uses scheduled paydates through December 31.')+select('paMode','Pension adjustment (box 52)',[['review','Use plan administrator / needs review'],['dc','Estimate simple money-purchase PA'],['manual','Enter annual PA from plan'],['none','No RPP / DPSP pension adjustment']])+field('pensionAdjustment','Annual pension adjustment','','Used only when entering the annual PA.')+field('priorRpp','Prior employee RPP contributions')+field('priorEmployerRpp','Prior employer RPP contributions')+field('priorRrsp','Prior employee group RRSP')+field('priorUnion','Prior union dues')+field('priorAfter','Prior after-tax deductions','', 'Combined total. In estimate mode, blank deductions use current amount × previous pay count.')+`<p class="help full">Recorded mode keeps unknown deduction totals blank. Group RRSP is not reported as employee RPP in box 20. Box 52 may differ from box 20.</p>`)+
  detail('6. Optional report names & address',field('employerName','Employer name','','','text',true)+field('employeeName','Employee name','','','text',true)+`<div class="full"><label for="address">Employee address</label><textarea id="address" name="address" rows="2" maxlength="140"></textarea></div>`)+
  `<div class="actions"><button type="button" id="save-inputs" class="secondary">Save inputs</button><button type="button" id="load-inputs" class="secondary">Load inputs</button><input type="file" id="input-file" accept=".json,application/json" hidden></div><button class="calculate" type="submit">Calculate paystub & T4</button>`;
$('frequency').value='biweekly';$('province').value='ON';
$('comparison-inputs').innerHTML=['cpp','cpp2','ei','tax','net'].map(k=>field('actual-'+k,({cpp:'CPP',cpp2:'CPP2',ei:'EI',tax:'Total income tax',net:'Net pay'})[k])).join('');
const sources=[['CRA T4127 January 2026','https://www.canada.ca/en/revenue-agency/services/forms-publications/payroll/t4127-payroll-deductions-formulas/t4127-jan/t4127-jan-payroll-deductions-formulas-computer-programs.html'],['CRA T4127 July 2026','https://www.canada.ca/en/revenue-agency/services/forms-publications/payroll/t4127-payroll-deductions-formulas/t4127-jul/t4127-jul-payroll-deductions-formulas.html'],['CPP rates & maximums','https://www.canada.ca/en/revenue-agency/services/tax/businesses/topics/payroll/payroll-deductions-contributions/canada-pension-plan-cpp/cpp-contribution-rates-maximums-exemptions.html'],['CPP2 rates & maximums','https://www.canada.ca/en/revenue-agency/services/tax/businesses/topics/payroll/calculating-deductions/making-deductions/second-additional-cpp-contribution-rates-maximums.html'],['EI rates & maximums','https://www.canada.ca/en/revenue-agency/services/tax/businesses/topics/payroll/payroll-deductions-contributions/employment-insurance-ei/ei-premium-rates-maximums.html'],['T4 employer instructions','https://www.canada.ca/en/revenue-agency/services/tax/businesses/topics/payroll/completing-filing-information-returns/t4-information-employers/t4-slip.html']];
$('sources').innerHTML=`<p>Rates checked October 1, 2026. CPP 5.95%, maximum $4,230.45; CPP2 4%, maximum $416; EI 1.63%, maximum $1,123.07. July rules apply to BC, NL and PE when selected by payday.</p><ul>${sources.map(([t,u])=>`<li><a href="${u}" target="_blank" rel="noopener noreferrer">${t}</a></li>`).join('')}</ul><p>This is a local CRA formula engine. It does not call a CRA or ADP API. Ordinary code 40 non-cash benefits are pensionable and not insurable. Cash allowances, different benefit codes, QPP transfers, Option 2 and complex tax exemptions need separate treatment. Bonuses use the regular annualization method with no F3/F4 deductions.</p>`;
function settings() {
  const s=Object.fromEntries(new FormData($('payroll-form')));s.eiExempt=$('eiExempt').checked;return s;
}
function showIssueGroups(issues) {
  for(const f of $('payroll-form').elements) f.removeAttribute?.('aria-invalid');
  $('messages').innerHTML=['error','warning'].map(level=>{
    const group=issues.filter(i=>i.level===level);if(!group.length)return '';
    return `<div class="issue-list ${level==='error'?'error':''}"><p>${level==='error'?'Check these inputs':'Review these assumptions'}</p>${group.map(i=>`<button type="button" data-field="${esc(i.field)}">${esc(i.message)}</button>`).join('')}</div>`;
  }).join('');
  for(const i of issues) if(i.level==='error') $(i.field)?.setAttribute('aria-invalid','true');
}
function invalidate() {
  scenario=null;$('totals').innerHTML='';$('result-body').innerHTML='<p class="empty">Inputs changed. Calculate again to update the paystub and projection.</p>';$('comparison').innerHTML='';$('messages').innerHTML='';
  $('recorded-balances').hidden=$('balanceMode').value!=='records';
  $('federalClaim').disabled=$('provincialClaim').disabled=$('td1').value!=='entered';
  $('dob').disabled=$('cppStatus').value!=='age';$('pensionAdjustment').disabled=$('paMode').value!=='manual';
}
function calc(event) {
  event?.preventDefault();
  if(!$('payroll-form').reportValidity())return;
  try {scenario=Calc.calculateScenario(settings());showIssueGroups(scenario.issues);if(!scenario.ok){$('totals').innerHTML='';$('result-body').innerHTML='<p class="empty">Correct the highlighted inputs to calculate.</p>';return;}
    const c=scenario.first.result.current;
    $('totals').innerHTML=[['Cash gross',c.cashGross,''],['Employee deductions',c.totalDeductions,''],['Net pay',c.net,'net']].map(([t,v,cl])=>`<div class="tile ${cl}"><small>${t}</small><strong>${Reports.formatAmount(v)}</strong></div>`).join('');
    render();$('comparison').innerHTML='';
  }catch(e){scenario=null;showIssueGroups([{level:'error',field:'gross',message:'The calculation could not finish: '+e.message}]);$('totals').innerHTML='';$('result-body').innerHTML='<p class="empty">Review the inputs and calculate again.</p>';}
}
const moneyCell=v=>`<td class="money ${v==null?'review':''}">${esc(Reports.formatAmount(v))}</td>`;
const table=(head,rows)=>`<div class="table-wrap"><table><thead><tr>${head.map((v,i)=>`<th class="${i?'money':''}">${v}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table></div>`;
function render() {
  document.querySelectorAll('[data-tab]').forEach(b=>{b.classList.toggle('active',b.dataset.tab===tabName);b.setAttribute('aria-pressed',b.dataset.tab===tabName?'true':'false');});
  if(!scenario?.ok)return;
  const s=scenario,c=s.first.result.current,st=s.settings;
  const notice=`<p class="notice">${s.estimatedOpening?'Opening CPP, CPP2 and EI are estimates from equal prior payments.':'Opening balances use recorded inputs, or start from zero for the first payment.'} Unknown amounts appear in red. Future pay is a projection.</p>`;
  if(tabName==='paystub') {
    const rows=Reports.statementRows(s).map(([label,cur,ytd])=>`<tr id="row-${esc(label)}" data-stat="${({CPP:'cpp',CPP2:'cpp2',EI:'ei','Income tax total':'tax','NET PAY':'net'})[label]||''}" class="${label==='NET PAY'?'total':''}"><td>${esc(label)}</td>${moneyCell(cur)}${moneyCell(ytd)}</tr>`).join('');
    const t=s.first.result.audit.find(a=>a.key==='taxable');
    $('result-body').innerHTML=`<div class="toolbar"><div><h2>Paystub calculation</h2><span class="subtle">${st.start} to ${st.end} · Paid ${st.payday}</span></div><button type="button" data-pdf="paystub">Download PDF</button></div>${notice}${table(['Earnings & deductions','Current','YTD after pay'],rows)}<p class="subtle">Additional CPP tax deduction this pay: ${Reports.formatAmount(t.inputs.F5)}. Annual taxable income used for withholding: ${Reports.formatAmount(t.result)}. Federal/provincial YTD splits need their own recorded balances.</p>`;
  } else if(tabName==='t4') {
    $('result-body').innerHTML=`<div class="toolbar"><div><h2>2026 T4 projection</h2><span class="subtle">${s.rows.length} payments projected · Through ${s.rows.at(-1).period.payday}</span></div><button type="button" data-pdf="t4">Download PDF</button></div>${notice}<p class="subtle">Future cash gross: ${Reports.formatAmount(s.futureGross)}. Future income tax: ${Reports.formatAmount(s.futureTax)}. ${s.endsYear?'Includes all remaining scheduled 2026 paydates.':'Partial-year projection: stops before the last scheduled payday.'}</p><div class="box-grid">${['14','16','16A','18','20','22','24','26','44','52','40'].map(k=>`<div class="box ${s.boxes[k]==null?'needs-review':''}" id="box-${k}"><small>${k==='40'?'CODE':'BOX'} ${k}</small><span>${Reports.boxLabels[k]}</span><strong class="${s.boxes[k]==null?'review':''}">${k==='52'&&s.boxes[k]!=null?s.boxes[k].toLocaleString('en-CA'):esc(Reports.formatAmount(s.boxes[k]))}</strong></div>`).join('')}</div><p class="subtle">Code 40 is already included in box 14. Employee group RRSP is excluded from box 20. Box 52 is separately entered or estimated from the confirmed pension plan.</p>`;
  } else if(tabName==='schedule') {
    const rows=s.rows.map(r=>`<tr><td>${r.period.payday}${r===s.first?' · selected pay':''}</td>${['cashGross','cpp','cpp2','ei','tax','net'].map(k=>moneyCell(r.result.current[k])).join('')}</tr>`).join('');
    $('result-body').innerHTML=`<div class="toolbar"><div><h2>Remaining payment schedule</h2><span class="subtle">Bonus is included only in the selected pay period.</span></div><button type="button" id="download-schedule">Download CSV</button></div>${table(['Pay date','Cash gross','CPP','CPP2','EI','Tax','Net'],rows)}<p class="subtle">Review paydates against the employer's actual calendar. Semi-monthly and monthly future dates retain the current payment lag.</p>`;
  } else {
    $('result-body').innerHTML=`<h2>How this pay was calculated</h2><p class="subtle">CRA T4127 Option 1 · Effective parameter set ${s.effective}</p>${s.first.result.audit.map(a=>`<div class="audit-row"><h3>${esc(a.title)}: ${Reports.formatAmount(a.result)}</h3><p class="formula">${esc(a.formula)}</p><details><summary>Inputs used</summary><pre>${esc(Object.entries(a.inputs).map(([k,v])=>k+': '+v).join('\n'))}</pre><p class="subtle">${esc(a.note)}</p></details></div>`).join('')}`;
  }
}
function download(bytes,name,type) {
  const status=$('download-status'),old=status.querySelector('a');if(old)URL.revokeObjectURL(old.href);
  const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([bytes],{type}));a.download=name;a.textContent='Download '+name;status.replaceChildren(a);status.hidden=false;a.click();
}
function pdf(type) {
  if(!scenario?.ok)return;
  // ponytail: standard PDF fonts cover Latin/WinAnsi; browser Print handles other scripts.
  if(/[\u0100-\uffff]/u.test((scenario.settings.employeeName||'')+(scenario.settings.employerName||'')+(scenario.settings.address||''))) {
    showIssueGroups([...scenario.issues,{level:'warning',field:'employeeName',message:'PDF fonts cover Latin characters. Use browser Print / Save as PDF to retain names written in other scripts.'}]);return;
  }
  const doc=Reports.reportDoc(scenario,type);download(PC.buildPdf(doc,{title:type==='t4'?'2026 T4 projection':'Payroll estimate',author:scenario.settings.employerName||'Canadian Payroll'}),`${type==='t4'?'T4-projection-2026':'Payroll-estimate-'+scenario.settings.payday}.pdf`,'application/pdf');
}
$('payroll-form').addEventListener('submit',calc);
$('payroll-form').addEventListener('input',invalidate);
$('payroll-form').addEventListener('change',invalidate);
$('result-body').addEventListener('click',e=>{
  const button=e.target.closest('button');if(!button)return;
  if(button.dataset.pdf)pdf(button.dataset.pdf);
  if(button.id==='download-schedule'&&scenario?.ok)download('Pay date,Cash gross,CPP,CPP2,EI,Income tax,Net pay\r\n'+scenario.rows.map(r=>[r.period.payday,...['cashGross','cpp','cpp2','ei','tax','net'].map(k=>r.result.current[k].toFixed(2))].join(',')).join('\r\n'),'payroll-projection-2026.csv','text/csv');
});
document.querySelector('nav').addEventListener('click',e=>{const b=e.target.closest('[data-tab]');if(b){tabName=b.dataset.tab;render();}});
$('messages').addEventListener('click',e=>{const b=e.target.closest('[data-field]'),el=b&&$(b.dataset.field);if(!el)return;let p=el.parentElement;while(p){if(p.tagName==='DETAILS')p.open=true;p=p.parentElement;}const box=({priorTax:'22',paMode:'52',priorRpp:'20'})[b.dataset.field];if(scenario?.ok&&box){tabName='t4';render();const preview=$('box-'+box);preview?.classList.add('selected-issue');preview?.scrollIntoView({behavior:'smooth',block:'center'});}else{el.scrollIntoView({behavior:'smooth',block:'center'});el.focus();}});
$('compare').onclick=()=>{
  if(!scenario?.ok){$('comparison').innerHTML='<p class="review">Calculate the paystub first.</p>';return;}
  const rows=['cpp','cpp2','ei','tax','net'].filter(k=>$('actual-'+k).value!=='').map(k=>{
    const actual=Number($('actual-'+k).value),expected=scenario.first.result.current[k],diff=PC.r2(actual-expected);
    if(!Number.isFinite(actual)||actual<0)return `<tr><td>${k.toUpperCase()}</td><td colspan="3" class="review">Enter a valid non-negative amount.</td></tr>`;
    return `<tr class="${diff?'mismatch':''}"><td><button type="button" class="quiet" data-stat-jump="${k}">${k.toUpperCase()} · ${diff?'Mismatch':'Matches'}</button></td>${moneyCell(actual)}${moneyCell(expected)}${moneyCell(diff)}</tr>`;
  });$('comparison').innerHTML=rows.length?table(['Item','Entered','Calculated','Difference'],rows.join('')):'<p class="subtle">Enter at least one amount to compare.</p>';
};
$('comparison').onclick=e=>{const b=e.target.closest('[data-stat-jump]');if(!b)return;tabName='paystub';render();const row=document.querySelector(`#result-body [data-stat="${b.dataset.statJump}"]`);row?.classList.add('selected-issue');row?.scrollIntoView({behavior:'smooth',block:'center'});};
$('save-inputs').onclick=()=>download(JSON.stringify({version:1,inputs:settings()},null,2),'payroll-inputs.json','application/json');
$('load-inputs').onclick=()=>$('input-file').click();
$('input-file').onchange=async()=>{
  const file=$('input-file').files[0];if(!file)return;
  try{if(file.size>128*1024)throw Error('Input file is too large.');const data=JSON.parse(await file.text());if(data.version!==1||!data.inputs||Array.isArray(data.inputs))throw Error('Choose a saved payroll input file.');
    for(const [k,v] of Object.entries(data.inputs)){const el=$(k);if(!el||!el.name||!$('payroll-form').contains(el))continue;if(!['string','number','boolean'].includes(typeof v))throw Error('Invalid input value.');if(String(v).length>1000)throw Error('Input text is too long.');}
    for(const [k,v] of Object.entries(data.inputs)){const el=$(k);if(!el||!el.name||!$('payroll-form').contains(el))continue;if(el.type==='checkbox')el.checked=v===true;else el.value=String(v);}
    invalidate();
  }catch(e){showIssueGroups([{field:'input-file',level:'error',message:e.message}]);}$('input-file').value='';
};
$('example').onclick=()=>{$('payroll-form').reset();$('frequency').value='biweekly';$('province').value='ON';invalidate();calc();};
invalidate();calc();
