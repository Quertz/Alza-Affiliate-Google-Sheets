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
  const type=Number(raw.documentType)===1?'Dobropis':Number(raw.documentType)===0?'Provize':'Jiný typ';
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
  let hasMismatch=false;
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
  const profit=daily.map(r=>[r[0],r[1],r[4],'Jen provize – bez reklamních a dalších nákladů']);
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
  const summary=[['IDP',user.idp,'Pouze aktuálně přihlášený partnerský účet'],
    ['Počátek sledování',conf.start,'Filtr data vytvoření'],
    ['Archiv dokladů',docs.length,'Unikátní ID dokladů, včetně historických vyúčtování'],
    ['Vyúčtování',payouts.length,'Vyúčtování nejsou další provizí'],
    ['Kontrola vyúčtování',hasMismatch?'VAROVÁNÍ':'OK','Nesouhlasné součty zkontrolujte v Alza vyúčtování'],
    ...Array.from(byCurrency.entries()).flatMap(([cur,v])=>[
      ['Kladné provize '+cur,v.positive,'V měně účtu/dokladů'],
      ['Dobropisy '+cur,v.negative,'Záporné provize započteny celé'],
      ['Čisté provize '+cur,v.positive+v.negative,'Nejde o zisk po nákladech']
    ])];
  affWrite_(AFF.sheets.summary,H.summary,summary);
  affRefreshDashboard_(user,conf.start,byCurrency,docs.length,payouts.length,hasMismatch,daily);
  return {documents:docs.length,payouts:payouts.length,mismatch:hasMismatch};
}
function affRefreshDashboard_(user,start,byCurrency,docCount,payoutCount,warnings,daily) {
  const rows=[['Partnerské IDP',user.idp,'Data pouze jednoho partnera'],
    ['Historie od',start,'Datum dokladu'],
    ['Doklady',docCount,'Provize a dobropisy'],
    ['Vyúčtování',payoutCount,'Žádosti o výplatu se nepřičítají znovu'],
    ['Kontrola vyúčtování',warnings?'VAROVÁNÍ':'OK','Viz Alza vyúčtování'],
    ...Array.from(byCurrency.entries()).map(([currency,v])=>[
      'Provize netto '+currency,v.positive+v.negative,'Bez jakýchkoliv nákladů'
    ]),
    ['TOP produkty','Alza produkty / TOP10 týdny / TOP10 měsíce','Po importu položek'],
    ['Aktualizace','4 h provize + 2 h položky','Spouštěče vlastníka Google Sheetu']];
  const sheet=affWrite_(AFF.sheets.dashboard,H.summary,rows);
  // Chart source values live in E:F and must not retain stale observations.
  if(sheet.getLastRow()>0)sheet.getRange(1,5,sheet.getMaxRows(),2).clearContent();
  // A chart only makes sense for one settlement currency. Never sum CZK and EUR.
  if (sheet.getCharts) sheet.getCharts().forEach(chart=>sheet.removeChart(chart));
  if(daily && daily.length>1 && byCurrency.size===1 && sheet.newChart) {
    const chartRows=[['Datum','Čisté provize']].concat(daily.slice(-45).map(r=>[r[0],r[4]]));
    sheet.getRange(1,5,chartRows.length,2).setValues(chartRows);
    const chart=sheet.newChart().setChartType(Charts.ChartType.LINE)
      .addRange(sheet.getRange(1,5,chartRows.length,2))
      .setPosition(11,1,0,0).setOption('title','Denní provize bez nákladů')
      .setOption('legend',{position:'none'}).build();
    sheet.insertChart(chart);
  }
}
