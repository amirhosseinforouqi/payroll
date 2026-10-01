(function(root) {
  'use strict';
  const PC=root.PayrollCore;
  const fmt=v=>v==null?'NEEDS REVIEW':PC.money(v).replace('−','-');
  const labels={'14':'Employment income','16':'Employee CPP','16A':'Employee CPP2','18':'Employee EI','20':'Employee RPP contributions','22':'Income tax deducted','24':'EI insurable earnings','26':'CPP / CPP2 pensionable earnings','44':'Union dues','52':'Pension adjustment','40':'Other taxable benefits (already in box 14)'};
  function statementRows(s) {
    const r=s.first.result,c=r.current,y=r.ytd,e=s.first.extra,x=s.first.extraYtd;
    const otherKnown=[x.rpp,x.rrsp,x.union,x.after].every(v=>v!=null);
    const details=root.PayrollCalculator.afterNames.map((f,i)=>[root.PayrollCalculator.afterLabels[i],Number(s.settings[f]||0),s.estimatedOpening?PC.r2(Number(s.settings[f]||0)*(Number(s.settings.priorPeriods)+1)):s.opening.periods===0?Number(s.settings[f]||0):null]).filter(([,v])=>v>0);
    const pairs=[['Cash gross',c.cashGross,y.cashGross],['Non-cash taxable benefits',c.benefits,y.benefits],['Taxable employment income',c.gross,y.gross],
      ['CPP',c.cpp,y.cpp],['CPP2',c.cpp2,y.cpp2],['EI',c.ei,y.ei],['Federal tax',c.federalTax,s.opening.periods===0?y.federalTax:null],['Provincial / territorial tax',c.provincialTax,s.opening.periods===0?y.provincialTax:null],['Income tax total',c.tax,s.taxKnown?y.tax:null],
      ['Employee RPP (before tax)',e.rpp,x.rpp],['Group RRSP (before tax)',e.rrsp,x.rrsp],['Union dues (before tax)',e.union,x.union],...details,['After-tax deductions total',e.after,x.after],
      ['All employee deductions',c.totalDeductions,s.taxKnown&&otherKnown?y.totalDeductions:null],['NET PAY',c.net,s.taxKnown&&otherKnown?y.net:null],
      ['Employer CPP',c.employerCpp,y.employerCpp],['Employer CPP2',c.employerCpp2,y.employerCpp2],['Employer EI (standard 1.4x)',c.employerEi,y.employerEi],['Employer RPP',e.employerRpp,x.employerRpp]];
    return pairs;
  }
  function reportDoc(s,type) {
    const ops=[], text=(x,y,value,size=10,bold=false,align='left',color='#17324d')=>ops.push({t:'text',x,y,text:String(value),s:size,f:bold?'B':'R',align,c:color});
    const line=(y)=>ops.push({t:'line',x1:40,y1:y,x2:572,y2:y,c:'#d8e0e7',lw:.5});
    const st=s.settings, isT4=type==='t4',r=s.first.result;
    text(40,46,isT4?'T4 PROJECTION':'PAYROLL ESTIMATE',21,true);
    text(572,45,'2026',15,true,'right');
    text(40,65,isT4?'Planning worksheet - employer must verify before filing':'Calculation worksheet - not an employer-issued pay statement',9,false,'left','#ad3f3f');
    let y=94;
    for(const [label,val] of [['Employer',st.employerName||'Not supplied'],['Employee',st.employeeName||'Not supplied'],['Address',st.address||'Not supplied']]) {
      const lines=PC.wrap(label+': '+val,10,'R',532);
      for(const l of lines.slice(0,3)) {text(40,y,l);y+=13;}
    }
    text(40,y+4,'Province of employment: '+st.province+'   |   '+PC.PAY_FREQUENCIES[st.frequency].label,9);
    y+=23;
    text(40,y,isT4?'Totals through '+s.rows.at(-1).period.payday+' ('+s.rows.length+' projected payments)':'Period '+st.start+' to '+st.end+'   |   Paid '+st.payday,9,true);
    if(isT4) {y+=16;text(40,y,(s.estimatedOpening?'Opening balances: equal-pay ESTIMATE.':'Opening balances: entered records / first payment.')+(s.endsYear?'':' Partial-year totals.'),9,true);}
    y+=20; line(y); y+=17;
    if(isT4) {
      text(40,y,'BOX / CODE',9,true);text(126,y,'DESCRIPTION',9,true);text(572,y,'PROJECTED AMOUNT',9,true,'right');y+=23;
      for(const k of ['14','16','16A','18','20','22','24','26','44','52','40']) {
        text(40,y,k,11,true);text(126,y,labels[k],k==='40'?9:10);text(572,y,k==='52'&&s.boxes[k]!=null?'$'+s.boxes[k].toLocaleString('en-CA'):fmt(s.boxes[k]),11,true,'right',s.boxes[k]==null?'#b02e35':'#17324d');line(y+8);y+=28;
      }
      y+=9;
      for(const value of ['Box 14 includes the code 40 benefits once. Group RRSP is excluded from box 20.','Box 52 is a separate pension calculation. Unknown amounts need review.','Future regular pay, benefits and deductions stay the same; the current bonus is not repeated.']) {
        for(const l of PC.wrap(value,9,'R',532)) {text(40,y,l,9);y+=13;}y+=3;
      }
    } else {
      text(40,y,'EARNINGS / DEDUCTIONS',9,true);text(433,y,'CURRENT',9,true,'right');text(572,y,'YTD AFTER PAY',9,true,'right');y+=21;
      for(const [label,c,total] of statementRows(s)) {
        text(40,y,label,9,label==='NET PAY');text(433,y,fmt(c),9,true,'right');text(572,y,fmt(total),total==null?8:9,true,'right',total==null?'#b02e35':'#17324d');line(y+5);y+=17;
      }
      y+=10;
      text(40,y,'Opening balances: '+(s.estimatedOpening?'equal-pay ESTIMATE':'entered payroll records / first payment'),9,true);y+=14;
      const t=r.audit.find(a=>a.key==='taxable').inputs;
      text(40,y,'Annual taxable income: '+fmt(r.audit.find(a=>a.key==='taxable').result)+'   |   Current additional CPP deduction: '+fmt(t.F5),9);
    }
    text(40,742,'CRA T4127 Option 1 | Rates selected by payment date | '+s.effective,8);
    text(40,757,'Verify actual YTD, TD1, pension plan and benefit treatment before using the results.',8);
    text(572,774,'1 / 1',8,false,'right');
    return {pages:[{ops}]};
  }
  const api={reportDoc,statementRows,boxLabels:labels,formatAmount:fmt};
  root.PayrollReports=api;
  if(typeof module!=='undefined'&&module.exports) module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);
