// Run with Node: node check.cjs. All examples are fictional.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
for(const f of ['tax-params','engine','templates','pdf','calculator','reports']) require('./src/'+f+'.js');
const PC=global.PayrollCore, calc=global.PayrollCalculator.calculateScenario;
const base={start:'2026-09-06',end:'2026-09-19',payday:'2026-09-18',frequency:'biweekly',province:'ON',gross:'5000',priorGross:'0',priorPeriods:'0',bonus:'0',benefit:'0',balanceMode:'estimate',ytdTiming:'before',td1:'entered',federalClaim:'16452',provincialClaim:'12989',cppStatus:'full',rppMode:'percent',rpp:'0',employerRpp:'0',rrsp:'0',union:'0',additionalTax:'0',dependants:'0',paMode:'none'};
function run(over={}) {const r=calc({...base,...over});assert.equal(r.ok,true,JSON.stringify(r.issues));return r;}
// CRA PDOC, observed 2026-10-01: Ontario, Sept 18, biweekly 5000, TD1 16452/12989, opening zero.
const first=run();
assert.deepEqual(['cpp','cpp2','ei','federalTax','provincialTax','tax','net'].map(k=>first.first.result.current[k]),[289.49,0,81.5,771.8,427.02,1198.82,3430.19]);
assert.equal(global.PayrollReports.statementRows(first).find(r=>r[0]==='Federal tax')[2],771.8);
// ADP regular salary calculator, same Ontario inputs, Oct 1: identical amounts above.
// CRA PDOC annual caps reached: CPP/CPP2/EI = 0, federal 784.45, provincial 435.49.
const capped=run({priorGross:'90000',priorPeriods:'18'});
assert.deepEqual(['cpp','cpp2','ei','federalTax','provincialTax','tax','net'].map(k=>capped.first.result.current[k]),[0,0,0,784.45,435.49,1219.94,3780.06]);
assert.equal(capped.rows.length,8);assert.equal(capped.rows.at(-1).period.payday,'2026-12-25');
assert.equal(capped.boxes['14'],130000);assert.equal(capped.boxes['26'],85000);assert.equal(capped.boxes['24'],68900);assert.equal(capped.boxes['22'],null);
const income=run({priorGross:'90000',priorPeriods:'18',priorTax:'21000',benefit:'10',rpp:'2',employerRpp:'2',rrsp:'10',paMode:'dc',health:'30',dental:'15',disability:'18',life:'11',accident:'9',critical:'16',otherAfter:'4',employerName:'Example Employer',employeeName:'Sample Worker',address:'100 Example Street, Sampletown ON A1A 1A1'});
assert.equal(income.boxes['14'],130260);assert.equal(income.boxes['40'],260);assert.equal(income.boxes['20'],2600);assert.equal(income.boxes['52'],5200);assert.equal(income.boxes['22'],PC.r2(21000+income.futureTax));
const c=income.first.result.current;assert.equal(c.net,PC.r2(c.cashGross-c.totalDeductions));assert.equal(c.otherDeductions,213);
assert.deepEqual(income.boxes,run({...income.settings,priorGross:'95000',ytdTiming:'includes'}).boxes);
assert.equal(run({priorGross:'90000',priorPeriods:'18',paMode:'review'}).boxes['52'],null);
const recorded={balanceMode:'records',priorGross:'90000',priorPeriods:'18',priorBenefits:'0',priorPensionable:'90000',priorInsurable:'90000',priorCpp:'4230.45',priorCpp2:'416',priorEi:'1123.07'};
assert.equal(run(recorded).first.result.current.tax,1219.94);assert.equal(run(recorded).boxes['20'],null);
for(const bad of [{payday:'2027-01-01'},{end:'2026-02-30'},{province:'QC'},{gross:'-1'},{gross:'Infinity'},{gross:'NaN'},{priorGross:'200',ytdTiming:'includes'},{priorGross:'90000',priorPeriods:'0'},{priorPeriods:'1.5'},{remaining:'9',priorPeriods:'18',priorGross:'90000'},{...recorded,priorCpp:'5000'},{...recorded,priorCpp2:''},{...recorded,bonus:'100'},{rpp:'2',paMode:'none'},{balanceMode:'estimate',priorGross:'1000',priorPeriods:'1',cppStatus:'age',dob:'2008-06-01'},{gross:'0',bonus:'100'},{employerName:'x'.repeat(81)}]) assert.equal(calc({...base,...bad}).ok,false,JSON.stringify(bad));
const boundary=run({...recorded,gross:'2000',priorGross:'74000',priorPeriods:'18',priorPensionable:'74000',priorCpp:'4000',priorCpp2:'0',priorEi:'1123.07'});assert.equal(boundary.first.result.current.cpp2,56);
assert.equal(run({cppStatus:'exempt',eiExempt:true}).boxes['26'],0);
assert.equal(run({cppStatus:'exempt',eiExempt:true}).boxes['24'],0);
assert.equal(run({balanceMode:'records',cppStatus:'age',dob:'2008-10-01'}).first.result.current.cpp,0);
assert.equal(run({balanceMode:'records',cppStatus:'age',dob:'2008-10-01'}).rows[4].result.current.cpp>0,true);
assert.equal(run({frequency:'biweekly27',priorGross:'90000',priorPeriods:'18'}).first.result.periodsPerYear,27);
assert.equal(run({start:'2026-12-01',end:'2026-12-31',payday:'2026-12-31',frequency:'monthly',gross:'1000'}).first.result.audit.find(a=>a.key==='cpp').inputs['Exemption per period'],291.66);
assert.equal(run({start:'2026-12-01',end:'2026-12-31',payday:'2026-12-31',frequency:'monthly',gross:'1000',priorGross:'0.03',priorBenefits:'0.03',priorPeriods:'4'}).ok,true);
const bonus=run({...recorded,bonus:'1000',priorBonus:'0',priorBonusCpp:'0',priorBonusEi:'0',priorF5b:'0'});
assert.equal(bonus.rows[0].result.current.cashGross,6000);assert.equal(bonus.rows[1].result.current.cashGross,5000);
for(const province of Object.keys(PC.paramsFor(base.payday).provinces)) assert.ok(run({province,td1:'basic'}).first.result.current.net>0,province);
// Optional QA output directory, supplied explicitly by the maintainer; nothing generated by default.
for(const type of ['paystub','t4']) {
  const doc=global.PayrollReports.reportDoc(income,type),bytes=PC.buildPdf(doc,{title:type+' fictional example'});
  assert.ok(Buffer.from(bytes).toString('latin1').startsWith('%PDF-1.4'));
  for(const op of doc.pages[0].ops)if(op.t==='text')assert.ok(op.y<780 && op.y>20,'Text inside page');
  if(process.argv[2]){fs.mkdirSync(process.argv[2],{recursive:true});fs.writeFileSync(path.join(process.argv[2],type+'-fictional.pdf'),bytes);}
}
console.log('PASS: CRA/ADP reference amounts, caps, YTD timing, pension/T4 mapping, eligibility, input validation and PDF reports.');
