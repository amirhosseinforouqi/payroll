/* Simple input adapter and year-end projection. Reuses PayrollCore's CRA engine. */
(function(root) {
  'use strict';
  const PC = root.PayrollCore;
  const optional = v => v === '' || v == null;
  const amount = v => optional(v) ? null : Number(v);
  const sum = values => values.some(v => v == null) ? null : PC.r2(values.reduce((a,b) => a+b,0));
  const afterNames = ['health','dental','disability','life','accident','critical','otherAfter'];
  const afterLabels = ['Health','Dental','Long-term disability','Optional life','Optional AD&D','Critical illness','Other after-tax deduction'];
  const numeric = ['gross','bonus','benefit','priorGross','priorPeriods','priorBenefits','priorPensionable','priorInsurable','priorCpp','priorCpp2','priorEi','priorTax','priorRpp','priorRrsp','priorUnion','priorAfter','priorEmployerRpp','priorBonus','priorBonusCpp','priorBonusEi','priorF5b','rpp','employerRpp','rrsp','union','federalClaim','provincialClaim','additionalTax','dependants','remaining','pensionAdjustment',...afterNames];

  function periodOf(s) { return {start:s.start,end:s.end,payday:s.payday,frequency:s.frequency}; }
  function eligible(s,date) {
    if(s.cppStatus === 'exempt') return false;
    if(s.cppStatus === 'full') return true;
    const w=PC.cppMonths(s.dob,Number(date.slice(0,4)),PC.paramsFor(date).cpp), m=Number(date.slice(5,7))-1;
    return m>=w.first && m<=w.last;
  }
  function inputOf(s, period, withBonus) {
    const pensionable = eligible(s,period.payday), insurable=!s.eiExempt;
    const cash=Number(s.gross), bonus=withBonus?Number(s.bonus||0):0;
    const rpp=PC.r2(s.rppMode==='percent'?cash*Number(s.rpp||0)/100:Number(s.rpp||0));
    const erRpp=PC.r2(s.rppMode==='percent'?cash*Number(s.employerRpp||0)/100:Number(s.employerRpp||0));
    const employee={province:s.province,cppFullYear:s.cppStatus==='full',cppExempt:s.cppStatus==='exempt',dateOfBirth:s.dob,eiExempt:!!s.eiExempt,
      td1:{federalFiled:s.td1==='entered',provincialFiled:s.td1==='entered',federalClaim:amount(s.federalClaim),provincialClaim:amount(s.provincialClaim),additionalTax:Number(s.additionalTax||0),dependants:Number(s.dependants||0)}};
    const earnings=[{kind:'regular',label:'Regular cash earnings',amount:cash,pensionable,insurable},
      {kind:'bonus',label:'One-time bonus',amount:bonus,pensionable,insurable},
      {kind:'benefit',label:'Non-cash taxable benefits (code 40)',amount:Number(s.benefit||0),pensionable}];
    const deductions=[{label:'Employee RPP',type:'rrsp',amount:rpp},{label:'Employee group RRSP',type:'rrsp',amount:Number(s.rrsp||0)},{label:'Union dues',type:'union',amount:Number(s.union||0)},
      ...afterNames.map((f,i)=>({label:afterLabels[i],type:'posttax',amount:Number(s[f]||0)}))];
    return {mode:'calculated',employee,period,earnings,deductions,rpp,erRpp,after:PC.r2(afterNames.reduce((a,f)=>a+Number(s[f]||0),0))};
  }
  function calculateScenario(s) {
    const issues=[];
    const issue=(field,message,level='error')=>issues.push({field,message,level});
    for(const f of numeric) if(!optional(s[f]) && (!Number.isFinite(Number(s[f])) || Number(s[f])<0 || Number(s[f])>1e9)) issue(f,'Enter a finite, non-negative amount (up to 1 billion).');
    for(const f of ['start','end','payday']) if(!PC.isDate(s[f])) issue(f,'Enter a real calendar date.');
    if(s.start>s.end) issue('end','Period end must be on or after the start.');
    if(s.payday<s.start) issue('payday','Payday is before the period starts.');
    const p=PC.paramsFor(s.payday), freq=PC.PAY_FREQUENCIES[s.frequency];
    if(!p) issue('payday','This calculator has verified rates for 2026 only.');
    if(!freq) issue('frequency','Choose a pay frequency.');
    if(p && !p.provinces[s.province]) issue('province',s.province==='QC'?'Quebec requires QPP, QPIP and Revenu Québec tax rules. Use ADP or Revenu Québec for this calculation.':'Choose a supported province or territory.');
    if(optional(s.gross)) issue('gross','Enter this period\'s regular cash gross.');
    if(optional(s.priorGross)) issue('priorGross','Enter gross YTD, or enter 0 for the first payment.');
    if(!['full','exempt','age'].includes(s.cppStatus)) issue('cppStatus','Confirm CPP eligibility.');
    if(s.cppStatus==='age' && (!PC.isDate(s.dob) || s.dob>s.payday)) issue('dob','Enter a valid date of birth before payday.');
    if(!['basic','entered'].includes(s.td1)) issue('td1','Choose TD1 basic amounts or entered claims.');
    if(s.td1==='entered') for(const f of ['federalClaim','provincialClaim']) if(optional(s[f])) issue(f,'Enter the total claim from the TD1, including 0 if no claim.');
    if(!['estimate','records'].includes(s.balanceMode)) issue('balanceMode','Choose estimated or recorded YTD balances.');
    if(!['before','includes'].includes(s.ytdTiming)) issue('ytdTiming','Identify whether cash gross YTD includes this payment.');
    if(!Number.isInteger(Number(s.priorPeriods)) || optional(s.priorPeriods) || Number(s.priorPeriods)<0 || (freq && Number(s.priorPeriods)>=freq.periods)) issue('priorPeriods','Enter the number of previous payments, below the annual pay count.');
    if(!optional(s.remaining) && (!Number.isInteger(Number(s.remaining)) || Number(s.remaining)<1 || (freq && Number(s.remaining)>freq.periods))) issue('remaining','Payments to project must be a whole number from 1 to the annual pay count.');
    if(!Number.isInteger(Number(s.dependants||0))) issue('dependants','Enter a whole number of eligible Ontario dependants.');
    if(!['percent','fixed'].includes(s.rppMode)) issue('rppMode','Choose a pension percentage or fixed amount.');
    if(s.rppMode==='percent' && (Number(s.rpp)>100 || Number(s.employerRpp)>100)) issue('rpp','Pension percentages cannot exceed 100%.');
    if(!['review','none','dc','manual'].includes(s.paMode)) issue('paMode','Choose a pension adjustment method.');
    if(Number(s.bonus)>0 && Number(s.gross)===0) issue('gross','A standalone bonus needs the most recent regular salary. Use CRA PDOC for this case.');
    for(const [f,max] of [['employeeName',80],['employerName',80],['address',140]]) if(String(s[f]||'').length>max) issue(f,'This report field exceeds its maximum length of '+max+' characters.');
    if(s.paMode==='manual' && optional(s.pensionAdjustment)) issue('pensionAdjustment','Enter the plan administrator\'s annual pension adjustment.');
    if(issues.length) return {ok:false,issues};
    const n=Number(s.priorPeriods), benefit=Number(s.benefit||0), currentCash=PC.r2(Number(s.gross)+Number(s.bonus||0));
    const priorCash=PC.r2(Number(s.priorGross)-(s.ytdTiming==='includes'?currentCash:0));
    if(priorCash<0) issue('priorGross','YTD including this payment must be at least this payment\'s cash gross.');
    if(n===0 && priorCash!==0) issue('priorPeriods','Non-zero opening income needs at least one previous payment.');
    if(n===0) for(const f of ['priorBenefits','priorPensionable','priorInsurable','priorCpp','priorCpp2','priorEi','priorTax','priorRpp','priorRrsp','priorUnion','priorAfter','priorEmployerRpp','priorBonus','priorBonusCpp','priorBonusEi','priorF5b']) if(Number(s[f])>0) issue(f,'A first payment cannot have non-zero opening balances. Correct the previous payment count.');
    if(s.balanceMode==='estimate' && s.cppStatus==='age' && priorCash>0) issue('balanceMode','Use recorded CPP balances when CPP eligibility changes during the year.');
    if(s.balanceMode==='records' && n>0) for(const f of ['priorBenefits','priorPensionable','priorInsurable','priorCpp','priorCpp2','priorEi']) if(optional(s[f])) issue(f,'Enter the balance BEFORE this payment from payroll records. Enter 0 only if it is known to be zero.');
    if(s.balanceMode==='estimate' && priorCash>0) {
      issue('balanceMode','Opening contributions assume equal prior regular payments, the same benefit treatment and one employer. These are estimates; use payroll records for exact opening balances.','warning');
      if(PC.r2(priorCash/n)!==Number(s.gross)) issue('priorGross','Past average cash pay differs from current pay. Opening deductions are only an approximation.','warning');
    }
    if(issues.some(i=>i.level==='error')) return {ok:false,issues};
    const base=inputOf(s,periodOf(s),true), y=PC.emptyYtd();
    let priorBenefits = s.balanceMode==='estimate' && optional(s.priorBenefits) ? PC.r2(benefit*n) : amount(s.priorBenefits);
    if(n===0) priorBenefits=0;
    Object.assign(y,{cashGross:priorCash,benefits:priorBenefits,gross:PC.r2(priorCash+priorBenefits),periods:n});
    const extras={};
    for(const [key,f,current] of [['rpp','priorRpp',base.rpp],['rrsp','priorRrsp',Number(s.rrsp||0)],['union','priorUnion',Number(s.union||0)],['after','priorAfter',base.after],['employerRpp','priorEmployerRpp',base.erRpp]]) {
      extras[key]=n===0?0:s.balanceMode==='estimate'&&optional(s[f])?PC.r2(current*n):amount(s[f]);
    }
    if(s.balanceMode==='estimate') {
      // ponytail: equal-pay simulation; import actual payroll balances for irregular pay history.
      const avg=Math.floor(priorCash*100/(n||1))/100, avgBenefit=Math.floor(priorBenefits*100/(n||1))/100;
      const sim=PC.emptyYtd();
      for(let i=0;i<n;i++) {
        const past=PC.calculate({...base,earnings:[{kind:'regular',amount:i===n-1?PC.r2(priorCash-avg*(n-1)):avg,pensionable:s.cppStatus!=='exempt',insurable:!s.eiExempt},{kind:'benefit',amount:i===n-1?PC.r2(priorBenefits-avgBenefit*(n-1)):avgBenefit,pensionable:s.cppStatus!=='exempt'}],deductions:[]},sim);
        Object.assign(sim,past.ytd);
      }
      for(const f of ['pensionable','insurable','cpp','cpp2','ei','employerCpp','employerCpp2','employerEi']) y[f]=sim[f];
      Object.assign(y,{bonus:0,bonusCpp:0,bonusEi:0,f5b:0});
    } else {
      for(const [f,key] of [['pensionable','priorPensionable'],['insurable','priorInsurable'],['cpp','priorCpp'],['cpp2','priorCpp2'],['ei','priorEi'],['bonus','priorBonus'],['bonusCpp','priorBonusCpp'],['bonusEi','priorBonusEi'],['f5b','priorF5b']]) y[f]=n===0?0:Number(s[key]||0);
      Object.assign(y,{employerCpp:y.cpp,employerCpp2:y.cpp2,employerEi:PC.r2(y.ei*p.ei.employerMultiplier)});
    }
    if(y.cpp>p.cpp.maxContribution || y.cpp2>p.cpp.cpp2MaxContribution || y.ei>p.ei.maxPremium) issue('priorCpp','Opening CPP, CPP2 or EI exceeds the annual maximum. Resolve or verify the payroll overpayment before projecting.');
    if(y.cpp2>0 && y.pensionable<=p.cpp.ympe && s.cppStatus==='full') issue('priorCpp2','CPP2 opening contributions need pensionable earnings above the YMPE.');
    if((s.cppStatus==='exempt' && (y.pensionable||y.cpp||y.cpp2)) || (s.eiExempt && (y.insurable||y.ei))) issue('cppStatus','Full-year exemption conflicts with non-zero opening earnings or contributions.');
    if(Number(s.bonus)>0 && s.balanceMode==='estimate' && n>0) issue('balanceMode','For a current bonus, use recorded YTD bonus/CPP/EI balances.');
    if(Number(s.bonus)>0 && s.balanceMode==='records' && n>0) for(const f of ['priorBonus','priorBonusCpp','priorBonusEi','priorF5b']) if(optional(s[f])) issue(f,'Bonus tax needs this recorded prior bonus balance, including 0 if no prior bonuses.');
    if(issues.some(i=>i.level==='error')) return {ok:false,issues};
    const taxKnown=n===0||!optional(s.priorTax);
    y.tax=n===0?0:Number(s.priorTax||0);
    y.otherDeductions=sum(Object.values(extras).slice(0,4))||0;
    y.totalDeductions=PC.r2(y.cpp+y.cpp2+y.ei+y.tax+y.otherDeductions);
    y.net=PC.r2(y.cashGross-y.totalDeductions);
    y.lines={'regular|regular cash earnings':priorCash,'benefit|non-cash taxable benefits (code 40)':priorBenefits};
    for(const d of base.deductions) y.deductions[d.type+'|'+d.label.toLowerCase()] = d.label==='Employee RPP'?(extras.rpp||0):d.label==='Employee group RRSP'?(extras.rrsp||0):d.label==='Union dues'?(extras.union||0):0;
    let period=periodOf(s), opening=y, priorExtra={...extras};
    const rows=[]; const explicit=!optional(s.remaining), count=explicit?Number(s.remaining):Infinity;
    for(let i=0;i<count && period.payday.slice(0,4)===s.payday.slice(0,4);i++) {
      const input=inputOf(s,period,i===0), result=PC.calculate(input,opening);
      if(!result.ok) {for(const m of result.missing) issue(m.field,m.label);break;}
      const errors=PC.validate({...input,taxYear:2026},result,{employee:input.employee}).filter(a=>a.level==='error');
      if(errors.length){issues.push(...errors);break;}
      const ex={rpp:input.rpp,rrsp:Number(s.rrsp||0),union:Number(s.union||0),after:input.after,employerRpp:input.erRpp};
      const exAfter={};for(const k of Object.keys(ex)) exAfter[k]=sum([priorExtra[k],ex[k]]);
      rows.push({period,result,extra:ex,extraPrior:priorExtra,extraYtd:exAfter});
      priorExtra=exAfter;opening={...opening,...result.ytd,lines:opening.lines,deductions:opening.deductions};
      period=PC.nextPeriod(period);
      if(i>54) {issue('remaining','Projection exceeded the annual payment limit.');break;}
    }
    if(explicit && rows.length<count && !issues.some(i=>i.level==='error')) issue('remaining','The requested payment count goes into another tax year. Choose fewer payments.');
    if(n+rows.length>freq.periods) issue('priorPeriods','Previous plus projected payments exceed the selected annual frequency. Check dates or choose a 53/27-payday year.');
    if(issues.some(i=>i.level==='error')||!rows.length) return {ok:false,issues};
    const first=rows[0], last=rows.at(-1), annual=last.result.ytd, ex=last.extraYtd;
    if(s.paMode==='none' && ((ex.rpp||0)>0 || (ex.employerRpp||0)>0)) {issue('paMode','RPP contributions conflict with no pension adjustment. Enter the PA or choose a confirmed money-purchase estimate.');return {ok:false,issues};}
    const pa=s.paMode==='manual'?Math.round(Number(s.pensionAdjustment)):s.paMode==='none'?0:s.paMode==='dc'?sum([ex.rpp,ex.employerRpp]):null;
    const boxes={'14':annual.gross,'16':annual.cpp,'16A':annual.cpp2,'18':annual.ei,'20':ex.rpp,'22':taxKnown?annual.tax:null,'24':Math.min(annual.insurable,p.ei.maxInsurableEarnings),'26':Math.min(annual.pensionable,p.cpp.yampe),'44':ex.union,'52':pa==null?null:Math.round(pa),'40':annual.benefits};
    if(!taxKnown) issue('priorTax','Prior income tax is unknown: T4 box 22 and YTD net pay need review. Future tax deductions are still shown.','warning');
    if(pa==null) issue('paMode','T4 box 52 needs the plan administrator\'s PA, or a confirmed simple money-purchase estimate.','warning');
    if(Object.values(ex).some(v=>v==null)) issue('priorRpp','Some opening deduction balances are unknown. Enter them to complete YTD and T4 totals.','warning');
    if(s.paMode==='dc') issue('paMode','Money-purchase PA assumes only employee + employer RPP contributions, with no forfeitures, refunds, transfers or other adjustments.','warning');
    if(PC.nextPeriod(last.period).payday.slice(0,4)===s.payday.slice(0,4)) issue('remaining','Projection stops before the last scheduled payday of the year. These T4 amounts are partial-year totals.','warning');
    return {ok:true,issues,settings:s,first,rows,annual,boxes,taxKnown,extras:ex,opening:y,estimatedOpening:s.balanceMode==='estimate'&&priorCash>0,
      futureTax:PC.r2(rows.reduce((a,r)=>a+r.result.current.tax,0)),futureGross:PC.r2(rows.reduce((a,r)=>a+r.result.current.cashGross,0)),effective:p.id,
      endsYear:PC.nextPeriod(last.period).payday.slice(0,4)!==s.payday.slice(0,4)};
  }
  const api={calculateScenario,afterNames,afterLabels};
  root.PayrollCalculator=api;
  if(typeof module!=='undefined'&&module.exports) module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);
