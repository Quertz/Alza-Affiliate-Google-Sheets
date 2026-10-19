/** Incremental document-item downloader, analytical tables and TOP10 rankings. */
function affExistingItems_() {
  const groups=new Map();
  affRead_(AFF.sheets.items,H.items).forEach(row=>{
    const key=String(row[0]);
    if(!groups.has(key))groups.set(key,[]);
    groups.get(key).push(row);
  });
  return groups;
}
function affItemAudit_() {
  const map=new Map();
  affRead_(AFF.sheets.itemState,H.itemState).forEach(row=>{
    const id=String(row[0]);if(map.has(id))throw new Error('Duplicitní doklad v auditu položek.');
    map.set(id,row);
  });
  return map;
}
function affLineItems_(detail,doc,now) {
  const root=detail.document, expected=doc[6],timestamp=String(root.createdDate||'');
  if(affDate_(timestamp)!==doc[3] || !/^\d{4}-\d\d-\d\dT\d\d:\d\d/.test(timestamp))
    throw new Error('Datum detailu a dokladu se liší.');
  const cur=String(root.currencyCode||doc[8]);
  if(cur!==String(doc[8]))throw new Error('Měna detailu nesouhlasí s dokladem.');
  const hh=Number(timestamp.slice(11,13));
  if(hh<0||hh>23)throw new Error('Neplatná hodina dokladu.');
  const items=[],idSet=new Set();let sum=0;
  for(const item of detail.items){
    const itemId=String(item.id),code=String(item.productCode||'');
    if(!/^\d+$/.test(itemId)||!code||idSet.has(itemId))throw new Error('Neplatné/duplicitní ID položky nebo productCode.');
    idSet.add(itemId);
    const quantity=affNumber_(item.amount,'amount'),price=affNumber_(item.price,'price');
    const provision=affNumber_(item.provision,'provision'),rate=item.provisionRate===null?0:affNumber_(item.provisionRate,'rate');
    const fixed=item.fixedProvision===null||item.fixedProvision===undefined?0:affNumber_(item.fixedProvision,'fixed');
    sum+=provision;
    const url='https://www.alza.cz/kod/'+encodeURIComponent(code);
    items.push([doc[1],itemId,doc[2],doc[3],hh,affSafe_(code),url,
      quantity,price,rate,fixed,provision,cur,doc[10]||'',affSafe_(item.provisionDescription||'')]);
  }
  const delta=sum-affNumber_(expected,'provize dokladu');
  const ok=Math.abs(delta)<=AFF.tolerance;
  return {items,audit:[doc[1],doc[3],cur,detail.items.length,items.length,
    sum,expected,delta,ok?'OK':'NESOUHLASÍ',now]};
}
function affSyncItems_() {
  affConfig_();const docs=affRead_(AFF.sheets.documents,H.documents);
  const items=affExistingItems_(),audits=affItemAudit_();
  const docIndex=new Map(docs.map(d=>[String(d[1]),d]));
  docs.forEach(d=>{d[3]=affDate_(d[3]);if(!d[3])throw new Error('Neplatné datum v archivu dokladů.');});
  const ordered=docs.slice().sort((a,b)=>String(b[3]).localeCompare(String(a[3]))||Number(b[1])-Number(a[1]));
  const now=affUtc_(),start=Date.now();let checked=0,errors=0;
  let cookie=null;
  for(const doc of ordered){
    if(checked>=AFF.itemsPerRun || Date.now()-start>AFF.maxItemsRuntimeMs)break;
    const id=String(doc[1]),audit=audits.get(id);
    const lastTime=audit?Date.parse(String(audit[9])):NaN;
    const elapsed=Number.isFinite(lastTime)?Date.now()-lastTime:Infinity;
    const recent=(Date.now()-Date.parse(String(doc[3])+'T12:00:00Z'))<30*86400000;
    const same=Boolean(audit && Number.isFinite(Number(audit[6])) &&
      Math.abs(Number(audit[6])-Number(doc[6]))<=AFF.tolerance);
    const hasRows=items.has(id)?items.get(id).length>0:true;
    if(audit && audit[8]==='OK' && same && hasRows && (!recent || elapsed<7*86400000))continue;
    if(audit && audit[8]!=='OK' && elapsed<24*3600000)continue;
    checked++;
    try{
      if(!cookie){const c=affConfig_();cookie=affLogin_(c.email,c.password);}
      const result=affDocumentDetail_(cookie,id);
      const normalized=affLineItems_(result,doc,now);
      // Never use mismatched documents in product analytics.
      if(normalized.audit[8]==='OK')items.set(id,normalized.items);
      audits.set(id,normalized.audit);
    }catch(e){
      errors++;
      audits.set(id,[id,doc[3],doc[8],'','','',doc[6],'','CHYBA',now]);
      // Do not log raw response/user data; error is visible only in Apps Script execution.
    }
  }
  const auditRows=Array.from(audits.values()).sort((a,b)=>String(a[1]).localeCompare(String(b[1]))||Number(a[0])-Number(b[0]));
  const activeItems=[];
  items.forEach((group,id)=>{
    if(docIndex.has(id))activeItems.push(...group);
  });
  const aggregate=affItemAnalytics_(activeItems,audits,docIndex);
  affWrite_(AFF.sheets.itemState,H.itemState,auditRows);
  affWrite_(AFF.sheets.items,H.items,activeItems);
  affWrite_(AFF.sheets.products,H.products,aggregate.products);
  affWrite_(AFF.sheets.hours,H.hours,aggregate.hours);
  affWrite_(AFF.sheets.topWeeks,H.top,aggregate.weeks);
  affWrite_(AFF.sheets.topMonths,H.top,aggregate.months);
  affMoneyFormat_(AFF.sheets.items,[9,11,12],activeItems.length);
  affMoneyFormat_(AFF.sheets.products,[6,7],aggregate.products.length);
  affMoneyFormat_(AFF.sheets.hours,[5],aggregate.hours.length);
  affMoneyFormat_(AFF.sheets.topWeeks,[5],aggregate.weeks.length);
  affMoneyFormat_(AFF.sheets.topMonths,[5],aggregate.months.length);
  affWrite_(AFF.sheets.progress,H.progress,[
    ['Známých dokladů',docs.length,'Jen doklady stažené z Alzy'],
    ['Kontrolováno',audits.size,'Počet dokladů s výsledkem stažení položek'],
    ['V pořádku',auditRows.filter(r=>r[8]==='OK' && docIndex.has(String(r[0]))).length,'Součet položek souhlasí s dokladem'],
    ['Nesouhlasí',auditRows.filter(r=>r[8]==='NESOUHLASÍ' && docIndex.has(String(r[0]))).length,'Doklady vynechané z žebříčků'],
    ['Chybné',auditRows.filter(r=>r[8]==='CHYBA' && docIndex.has(String(r[0]))).length,'Opakovat po 24 hodinách'],
    ['Zbývá',docs.filter(r=>!audits.has(String(r[1]))).length,'Nové dokumenty bez auditu'],
    ['Položky',activeItems.length,'Položky z archivu'],
    ['Poslední běh UTC',now,'Provádí se po dávkách']]);
  affLinkify_(AFF.sheets.items,7,activeItems);
  affLinkify_(AFF.sheets.products,9,aggregate.products);
  affLinkify_(AFF.sheets.topWeeks,9,aggregate.weeks);
  affLinkify_(AFF.sheets.topMonths,9,aggregate.months);
  return {checked,items:activeItems.length,errors};
}
function affLinkify_(sheetName,urlColumn,rows) {
  if(!rows.length)return;
  const sheet=affBook_().getSheetByName(sheetName);
  for(let start=0;start<rows.length;start+=1000){
    const chunk=rows.slice(start,start+1000).map(row=>{
      const url=String(row[urlColumn-1]);
      return [SpreadsheetApp.newRichTextValue().setText(url).setLinkUrl(url).build()];
    });
    sheet.getRange(start+2,urlColumn,chunk.length,1).setRichTextValues(chunk);
  }
}
/** ISO 8601 week, correctly handles years with week 53. */
function affIsoWeek_(day) {
  const d=new Date(day+'T12:00:00Z'),weekDay=d.getUTCDay()||7;
  d.setUTCDate(d.getUTCDate()+4-weekDay);
  const yr=d.getUTCFullYear();
  const first=new Date(Date.UTC(yr,0,4,12));
  first.setUTCDate(first.getUTCDate()+4-(first.getUTCDay()||7));
  return yr+'-W'+String(1+Math.round((d-first)/604800000)).padStart(2,'0');
}
function affItemAnalytics_(rows,auditMap,docsMap) {
  const products=new Map(),hours=new Map(),weeks=new Map(),months=new Map();
  function add(map,key,base,row){
    if(!map.has(key))map.set(key,Object.assign({orders:new Set(),docs:new Set(),pieces:0,value:0,commission:0,last:''},base));
    const target=map.get(key);
    target.docs.add(String(row[0]));if(row[2])target.orders.add(String(row[2]));
    target.pieces+=Number(row[7]);target.value+=Number(row[8]);target.commission+=Number(row[11]);
    target.last=target.last>row[3]?target.last:row[3];
    return target;
  }
  rows.forEach(row=>{
    const id=String(row[0]),audit=auditMap.get(id),doc=docsMap.get(id);
    if(!doc || !audit || audit[8]!=='OK' || Math.abs(Number(audit[6])-Number(doc[6]))>AFF.tolerance)return;
    const currency=String(row[12]),code=String(row[5]).replace(/^'(?=[=+@\-])/,'');
    const url=String(row[6]),hour=Number(row[4]),day=String(row[3]);
    add(products,currency+'|'+code,{code,currency,url},row);
    add(hours,currency+'|'+hour,{hour,currency},row);
    const week=affIsoWeek_(day),month=day.slice(0,7);
    add(weeks,week+'|'+currency+'|'+code,{period:week,currency,code,url},row);
    add(months,month+'|'+currency+'|'+code,{period:month,currency,code,url},row);
  });
  const productRows=Array.from(products.values()).sort((a,b)=>b.commission-a.commission).map(p=>[
    affSafe_(p.code),p.currency,p.orders.size,p.docs.size,p.pieces,p.value,p.commission,p.last,p.url
  ]);
  const hourRows=Array.from(hours.values()).sort((a,b)=>a.currency.localeCompare(b.currency)||a.hour-b.hour).map(h=>[
    h.hour,h.currency,h.orders.size,h.docs.size,h.commission
  ]);
  function ranking(map){
    const byPeriod=new Map();
    map.forEach(x=>{
      const key=x.period+'|'+x.currency;
      if(!byPeriod.has(key))byPeriod.set(key,[]);
      byPeriod.get(key).push(x);
    });
    const result=[];
    Array.from(byPeriod.keys()).sort().reverse().forEach(period=>{
      byPeriod.get(period).sort((a,b)=>b.commission-a.commission||a.code.localeCompare(b.code))
        .slice(0,10).forEach((r,index)=>result.push([
          r.period,index+1,affSafe_(r.code),r.currency,r.commission,r.orders.size,r.docs.size,r.pieces,r.url
        ]));
    });
    return result;
  }
  return {products:productRows,hours:hourRows,weeks:ranking(weeks),months:ranking(months)};
}
