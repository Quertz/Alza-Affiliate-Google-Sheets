/** Import the one authenticated partner's financial documents and payouts. */
function affDocFromApi_(raw, identityIdp, origin, paymentId, paymentState) {
  if(raw.id===null||raw.id===undefined)throw new Error('Finanční doklad nemá ID.');
  const idp=raw.idp===null||raw.idp===undefined ? identityIdp : String(raw.idp);
  if(idp!==identityIdp)throw new Error('IDP finančního dokladu neodpovídá přihlášenému účtu.');
  const provision=affNumber_(raw.provision,'provision'),turnover=affNumber_(raw.turnover,'turnover');
  const timestamp=String(raw.createdDate||'');
  const date=affDate_(timestamp);
  if(!date || !/^\d{4}-\d\d-\d\dT\d\d:\d\d/.test(timestamp))
    throw new Error('Finanční doklad '+raw.id+': neplatný createdDate.');
  const currency=String(raw.currencyCode||'').trim();
  if(!/^[A-Z]{3}$/.test(currency))throw new Error('Finanční doklad '+raw.id+': neznámá měna.');
  // Some upstream credit notes legitimately have amount 0. Neither 0 nor a
  // conflicting type/sign stops the entire historical sync. Preserve the
  // actual signed amount; do not silently convert it, and audit anomalies.
  const typeId=Number(raw.documentType);
  const type=typeId===1?'Dobropis':typeId===0?'Provize':'Jiný typ';
  return [affSafe_(idp),String(raw.id),affSafe_(String(raw.orderCode||'')),date,
    timestamp,type,provision,turnover,currency,raw.closedProvision===true||Boolean(paymentId),
    paymentId?String(paymentId):raw.paymentId?String(raw.paymentId):'',
    paymentState!==undefined&&paymentState!==null?Number(paymentState):raw.paymentState??'',
    origin,affUtc_()];
}
function affRestoreDocuments_() {
  const map=new Map();
  affRead_(AFF.sheets.documents,H.documents).forEach(row=>{
    row[3]=affDate_(row[3]);
    if(!row[3])throw new Error('Archiv dokladů má neplatné datum.');
    const key=String(row[1]);
    if(!/^\d+$/.test(key)||map.has(key))throw new Error('Archiv má neplatné nebo duplicitní ID dokladu.');
    map.set(key,row);
  });
  return map;
}
function affSyncDocuments_() {
  const conf=affConfig_(),cookie=affLogin_(conf.email,conf.password);
  const user=affIdentity_(cookie);
  if(conf.idp && user.idp!==conf.idp)throw new Error('IDP není shodné s instalovaným účtem.');
  const docMap=affRestoreDocuments_();
  const payoutMap=new Map(affRead_(AFF.sheets.payouts,H.payouts).map(r=>[String(r[0]),r]));
  let hasMismatch=false, signWarnings=0;
  // We first fetch payout data. A payment amount is validation data, not extra revenue.
  const payments=affPayments_(cookie,conf.start);
  for(const pay of payments){
    const pid=String(pay.id),detail=affPaymentDetail_(cookie,pid);
    const payment=detail.payment;
    if(String(payment.idp)!==user.idp)throw new Error('Vyúčtování má jiné IDP.');
    const declared=affNumber_(pay.provision,'částka vyúčtování '+pid);
    const sum=detail.documents.reduce((s,r)=>s+affNumber_(r.provision,'položka vyúčtování'),0);
    const diff=sum-declared;
    const currency=String(pay.currencyCode||payment.currencyCode||'');
    if(!/^[A-Z]{3}$/.test(currency))throw new Error('Neznámá měna vyúčtování.');
    const status=Number(pay.state);
    payoutMap.set(pid,[pid,affDate_(pay.dateCreated),
      status===0?'Čeká na schválení':status===1?'Přijato':status===2?'Zamítnuto':'Neznámý stav',
      declared,sum,diff,detail.documents.length,currency,
      Math.abs(diff)<=AFF.tolerance?'OK':'NESOUHLASÍ',affUtc_()]);
    if(Math.abs(diff)>AFF.tolerance)hasMismatch=true;
    for(const raw of detail.documents){
      if(affDate_(raw.createdDate)<conf.start)continue;
      const id=String(raw.id),old=docMap.get(id);
      const row=affDocFromApi_(Object.assign({},raw,{currencyCode:raw.currencyCode||currency}),
        user.idp,'VYÚČTOVÁNÍ',pid,status);
      if(affSignMismatch_(raw))signWarnings++;
      // Never silently overwrite conflicting amounts returned for the same document.
      if(old && String(old[12])==='VYÚČTOVÁNÍ' && Math.abs(Number(old[6])-row[6])>AFF.tolerance)
        hasMismatch=true;
      if(old && old[4] && !row[4])row[4]=old[4];
      docMap.set(id,row);
    }
  }
  // Unclosed docs not in any payment remain active. Don't delete missing archived docs.
  const unclosed=affUnclosed_(cookie,conf.start);
  for(const raw of unclosed){
    if(affDate_(raw.createdDate)<conf.start)continue;
    const id=String(raw.id),existing=docMap.get(id);
    if(existing && String(existing[12])==='VYÚČTOVÁNÍ')continue;
    const row=affDocFromApi_(raw,user.idp,'NEUZAVŘENÉ',null,null);
    if(affSignMismatch_(raw))signWarnings++;
    if(existing && existing[10] && !row[10])row[10]=existing[10];
    if(existing && existing[11]!=='' && row[11]==='')row[11]=existing[11];
    docMap.set(id,row);
  }
  const docs=Array.from(docMap.values()).sort((a,b)=>String(a[3]).localeCompare(String(b[3]))||Number(a[1])-Number(b[1]));
  const payouts=Array.from(payoutMap.values()).sort((a,b)=>String(a[1]).localeCompare(String(b[1])));
  const dayMap=new Map();
  for(const r of docs){
    const key=r[3]+'|'+r[8];
    if(!dayMap.has(key))dayMap.set(key,{day:r[3],currency:r[8],positive:0,negative:0,count:0});
    const d=dayMap.get(key),n=affNumber_(r[6],'archivní provize');
    if(n>=0)d.positive+=n;else d.negative+=n;
    d.count++;
  }
  const daily=Array.from(dayMap.values()).sort((a,b)=>a.day.localeCompare(b.day)||a.currency.localeCompare(b.currency))
    .map(x=>[x.day,x.currency,x.positive,x.negative,x.positive+x.negative,x.count]);
  const profit=daily.map(r=>[r[0],r[1],r[4]]);
  affWrite_(AFF.sheets.documents,H.documents,docs);
  affWrite_(AFF.sheets.payouts,H.payouts,payouts);
  affWrite_(AFF.sheets.daily,H.daily,daily);
  affWrite_(AFF.sheets.profit,H.profit,profit);
  affMoneyFormat_(AFF.sheets.documents,[7,8],docs.length);
  affMoneyFormat_(AFF.sheets.daily,[3,4,5],daily.length);
  affMoneyFormat_(AFF.sheets.profit,[3],profit.length);
  const byCurrency=new Map();
  for(const d of daily){
    if(!byCurrency.has(d[1]))byCurrency.set(d[1],{positive:0,negative:0,count:0});
    const v=byCurrency.get(d[1]);v.positive+=d[2];v.negative+=d[3];v.count+=d[5];
  }
  const summary=[
    ['Doklady',docs.length],['Vyúčtování',payouts.length],
    ['Historie od',conf.start],
    ['Kontrola vyúčtování',hasMismatch?'Nesouhlasí':'OK'],
    ...(signWarnings?[['Nesoulad typu a znaménka',signWarnings]]:[]),
    ...Array.from(byCurrency.entries()).flatMap(([cur,v])=>[
      ['Kladné provize '+cur,v.positive],
      ['Dobropisy '+cur,v.negative],
      ['Čisté provize '+cur,v.positive+v.negative]
    ])
  ];
  affWrite_(AFF.sheets.summary,H.summary,summary);
  affFormatSummary_();
  affWriteHourAnalytics_(docs);
  // The main dashboard KPI is the running balance after the last accepted
  // settlement. Historical commission remains a separate, smaller KPI.
  const afterClosure=affSinceClosure_(docs,payouts);
  affRefreshDashboard_(user,conf.start,byCurrency,docs.length,payouts.length,hasMismatch,daily,signWarnings,afterClosure);
  if(signWarnings)affLog_('DOKLADY','VAROVÁNÍ',
    'Nesoulad znaménka a typu u '+signWarnings+' dokladů; částky převzaty z API.');
  return {documents:docs.length,payouts:payouts.length,mismatch:hasMismatch};
}
/**
 * Commission not included in an accepted settlement. Use the actual payout
 * relationship, not createdDate > payout date: an order can be credited later
 * while retaining an earlier creation timestamp. Treat amounts as signed.
 * No double counting: financial documents are the only commission source.
 */
function affSinceClosure_(docs,payouts) {
  const accepted=new Set(payouts.filter(p=>String(p[2])==='Přijato')
    .map(p=>String(p[0])));
  const sums=new Map();
  for(const row of docs){
    const payoutId=String(row[10]||'');
    if((payoutId && accepted.has(payoutId)) || (row[9]===true && !payoutId))continue;
    const cur=String(row[8]),value=affNumber_(row[6],'provize od uzávěrky');
    sums.set(cur,(sums.get(cur)||0)+value);
  }
  return sums;
}
/** Mismatch is informational; zero-value documents of either type are valid. */
function affSignMismatch_(raw) {
  const n=affNumber_(raw.provision,'provision');
  const kind=Number(raw.documentType);
  return n!==0 && ((kind===0 && n<0) || (kind===1 && n>0));
}
/** Hourly metrics are computed from EVERY archived document, not item backfill. */
function affHoursFromDocuments_(docs,currentMonth) {
  const parts=/^(\d{4})-(\d{2})$/.exec(currentMonth);
  if(!parts)throw new Error('Neplatný měsíc pro hodinovou analytiku.');
  const previous=new Date(Date.UTC(Number(parts[1]),Number(parts[2])-2,1,12)).toISOString().slice(0,7);
  const life=new Map(),month=new Map(),currencies=new Set();
  docs.forEach(row=>{
    const timestamp=String(row[4]||''),hour=Number(timestamp.slice(11,13));
    const day=affDate_(row[3]),cur=String(row[8]);
    if(!/T\d{2}:\d{2}/.test(timestamp) || !Number.isInteger(hour)||hour<0||hour>23)return;
    const amount=Number(row[6]);if(!Number.isFinite(amount))return;
    currencies.add(cur);
    const key=cur+'|'+hour;
    if(!life.has(key))life.set(key,{orders:new Set(),count:0,commission:0});
    const a=life.get(key);a.count++;a.commission+=amount;
    if(row[2])a.orders.add(String(row[2]));
    if(day.slice(0,7)===previous){
      if(!month.has(key))month.set(key,{orders:new Set(),count:0,commission:0});
      const b=month.get(key);b.count++;b.commission+=amount;
      if(row[2])b.orders.add(String(row[2]));
    }
  });
  const full=[],previousRows=[];
  Array.from(currencies).sort().forEach(cur=>{
    for(let hour=0;hour<24;hour++){
      const a=life.get(cur+'|'+hour)||{orders:new Set(),count:0,commission:0};
      const b=month.get(cur+'|'+hour)||{orders:new Set(),count:0,commission:0};
      full.push([hour,cur,a.orders.size,a.count,a.commission]);
      previousRows.push([previous,hour,cur,b.orders.size,b.count,b.commission]);
    }
  });
  full.sort((a,b)=>a[1].localeCompare(b[1])||b[4]-a[4]||a[0]-b[0]);
  previousRows.sort((a,b)=>a[2].localeCompare(b[2])||b[5]-a[5]||a[1]-b[1]);
  return {life:full,previous:previousRows,month:previous};
}
function affWriteHourAnalytics_(docs) {
  const month=Utilities.formatDate(new Date(),AFF.timezone,'yyyy-MM');
  const stats=affHoursFromDocuments_(docs,month);
  affWrite_(AFF.sheets.hours,H.hours,stats.life);
  affWrite_(AFF.sheets.monthHours,H.monthHours,stats.previous);
  affMoneyFormat_(AFF.sheets.hours,[5],stats.life.length);
  affMoneyFormat_(AFF.sheets.monthHours,[6],stats.previous.length);
  return stats;
}
/** Dashboard uses only presentation cells. Flat fact sheets are Looker sources. */
function affRefreshDashboard_(user,start,byCurrency,docCount,payoutCount,warnings,daily,signWarnings,afterClosure) {
  const sheet=affBook_().getSheetByName(AFF.sheets.dashboard)||affBook_().insertSheet(AFF.sheets.dashboard);
  affDashboardClear_(sheet);
  const brand='#15263c',green='#1b987e',muted='#64748b',panel='#edf3f8';
  sheet.getRange('A1:L2').merge().setValue('ALZA  |  AFFILIATE ANALYTICS')
    .setBackground(brand).setFontColor('#ffffff').setFontSize(18).setFontWeight('bold');
  sheet.getRange('A3:G3').merge().setValue('PŘEHLED PROVIZÍ')
    .setFontWeight('bold').setFontColor(muted).setFontSize(10);
  sheet.getRange('H3:L3').merge().setValue('PARTNER')
    .setBackground(brand).setFontColor('#ffffff').setFontWeight('bold');
  const amounts=Array.from(byCurrency.entries());
  const primary=amounts.length===1?amounts[0]:null;
  const kpis=[
    ['Od poslední uzávěrky',primary?(afterClosure?.get(primary[0])||0):'—',primary?primary[0]:'Více měn'],
    ['Doklady',docCount,''],
    ['Vyúčtování',payoutCount,''],
  ];
  const cards=[['A4:B4','A5:B6','A7:B7'],['C4:D4','C5:D6','C7:D7'],['E4:G4','E5:G6','E7:G7']];
  kpis.forEach((value,i)=>{
    sheet.getRange(cards[i][0]).merge().setValue(value[0]).setFontSize(10).setFontColor(muted).setBackground(panel);
    sheet.getRange(cards[i][1]).merge().setValue(value[1]).setNumberFormat(i===0?AFF_FORMAT_MONEY:AFF_FORMAT_INTEGER)
      .setFontSize(20).setFontWeight('bold').setFontColor(brand).setBackground(panel);
    sheet.getRange(cards[i][2]).merge().setValue(value[2]).setFontSize(10).setFontColor(green).setBackground(panel);
  });
  // Secondary value: full commission history, with native numeric precision.
  sheet.getRange('A9:B9').merge().setValue('Historicky celkem')
    .setFontSize(10).setFontColor(muted);
  sheet.getRange('A10:B11').merge()
    .setValue(primary?primary[1].positive+primary[1].negative:'—')
    .setNumberFormat(AFF_FORMAT_MONEY)
    .setFontSize(15).setFontWeight('bold').setFontColor(brand);
  sheet.getRange('A12:B12').merge().setValue(primary?primary[0]:'Více měn')
    .setFontSize(10).setFontColor(green);
  const label=user.companyName||user.partnerName||'Affiliate partner';
  const fields=[['Jméno / společnost',label],['E-mail',user.email||''],['IDP',user.idp],
    ['E-shop',user.eshopName||''],['Historie od',start]];
  fields.forEach((line,i)=>{
    const row=4+i;
    sheet.getRange('H'+row+':I'+row).merge().setValue(line[0]).setFontColor(muted);
    const cell=sheet.getRange('J'+row+':L'+row);
    const value=i===4?affSheetDay_(line[1]):affSafe_(line[1]);
    cell.merge().setValue(value).setFontWeight('bold');
    if(i===4)cell.setNumberFormat(AFF_FORMAT_DATE);
    if(i===2)cell.setNumberFormat('@');
  });
  sheet.getRange('A14:G14').merge().setValue('PROVIZE PODLE MĚNY')
    .setFontWeight('bold').setFontSize(10).setFontColor(muted);
  const breakdown=amounts.flatMap(([currency,v])=>[
    [currency+' – kladné',v.positive],
    [currency+' – dobropisy',v.negative],
    [currency+' – celkem',v.positive+v.negative]
  ]);
  if(breakdown.length){
    sheet.getRange(15,1,breakdown.length,2).setValues(breakdown);
    sheet.getRange(15,2,breakdown.length,1).setNumberFormat(AFF_FORMAT_MONEY);
  }
  const status=warnings?'Nesouhlasí vyúčtování':signWarnings?'Zkontrolovat znaménka':'OK';
  sheet.getRange('H10:I10').merge().setValue('Kontrola').setFontColor(muted);
  sheet.getRange('J10:L10').merge().setValue(status).setFontWeight('bold')
    .setFontColor(status==='OK'?green:'#b45309');
  const chartTitleRow=Math.max(19,16+breakdown.length);
  sheet.getRange(chartTitleRow,1,1,7).merge().setValue('VÝVOJ PROVIZÍ')
    .setFontWeight('bold').setFontColor(muted);
  // Keep source data outside visible dashboard; one currency = one chart.
  sheet.getRange('N1:O80').clearContent();
  if(sheet.getCharts)sheet.getCharts().forEach(c=>sheet.removeChart(c));
  if(daily && daily.length>1 && byCurrency.size===1 && sheet.newChart){
    const data=[['Datum','Provize']].concat(daily.slice(-60).map(r=>[affSheetDay_(r[0]),r[4]]));
    sheet.getRange(1,14,data.length,2).setValues(data);
    const chart=sheet.newChart().setChartType(Charts.ChartType.LINE)
      .addRange(sheet.getRange(1,14,data.length,2))
      .setPosition(chartTitleRow+1,1,0,0).setOption('title','Provize po dnech')
      .setOption('legend',{position:'none'}).build();
    sheet.insertChart(chart);
  }
  affDashboardProgress_(sheet);
}
function affDashboardClear_(sheet){
  const area=sheet.getRange('A1:L38');
  if(area.breakApart)area.breakApart();
  area.clearContent();
  sheet.setHiddenGridlines(true);
  for(let c=1;c<=12;c++)sheet.setColumnWidth(c,c>=8?95:104);
  sheet.setRowHeight(1,28);sheet.setRowHeight(2,24);
}
function affDashboardProgress_(sheet) {
  const docs=affBook_().getSheetByName(AFF.sheets.documents);
  const state=affBook_().getSheetByName(AFF.sheets.itemState);
  const total=docs?Math.max(0,docs.getLastRow()-1):0;
  const rows=state?affRead_(AFF.sheets.itemState,H.itemState):[];
  const ok=rows.filter(r=>r[8]==='OK').length;
  const error=rows.filter(r=>r[8]==='CHYBA'||r[8]==='NESOUHLASÍ').length;
  const area=sheet.getRange('H12:L14');
  if(area.breakApart)area.breakApart();
  area.clearContent();
  sheet.getRange('H12:L12').merge().setValue('SYNCHRONIZACE POLOŽEK')
    .setFontWeight('bold').setFontColor('#64748b');
  sheet.getRange('H13:I13').merge().setValue('Hotovo');
  sheet.getRange('J13:L13').merge().setValue(ok+' / '+total);
  sheet.getRange('H14:I14').merge().setValue('Ke kontrole');
  sheet.getRange('J14:L14').merge().setValue(error);
}
