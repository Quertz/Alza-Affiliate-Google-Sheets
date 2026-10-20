/* Self-contained mock Google Apps Script integration test. No external network. */
'use strict';
const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict'),path=require('path');
const root=path.join(__dirname,'..','src');
class Range {
  constructor(sh,r,c,n,m){Object.assign(this,{sh,r,c,n,m})}
  getValues(){return Array.from({length:this.n},(_,i)=>Array.from({length:this.m},(_,j)=>this.sh.get(this.r+i,this.c+j)))}
  getDisplayValues(){return this.getValues().map(r=>r.map(x=>String(x??'')))}
  setValues(rows){assert.equal(rows.length,this.n);rows.forEach((r,i)=>{assert.equal(r.length,this.m);r.forEach((v,j)=>this.sh.set(this.r+i,this.c+j,v))});return this}
  setRichTextValues(rows){rows.forEach((r,i)=>r.forEach((v,j)=>this.sh.set(this.r+i,this.c+j,v.text)));return this}
  setFontWeight(){return this}setBackground(){return this}setNumberFormat(format){this.sh.formatCalls.push({r:this.r,c:this.c,n:this.n,m:this.m,format});return this}
  setFontColor(){return this}setFontSize(){return this}merge(){return this}
  breakApart(){return this}setValue(v){this.sh.set(this.r,this.c,v);return this}
  clearContent(){for(let i=0;i<this.n;i++)for(let j=0;j<this.m;j++)this.sh.set(this.r+i,this.c+j,'');return this}
}
function a1Range(addr){
  const parts=addr.split(':');
  function rc(part){
    const m=/^([A-Z]+)(\d+)$/.exec(part);if(!m)throw Error('Invalid A1: '+part);
    let col=0;for(const x of m[1])col=col*26+x.charCodeAt(0)-64;
    return [Number(m[2]),col];
  }
  const start=rc(parts[0]),end=rc(parts[1]||parts[0]);
  return [start[0],start[1],end[0]-start[0]+1,end[1]-start[1]+1];
}
class Sheet {
  constructor(name){this.name=name;this.data=[];this.maxRows=1000;this.maxCols=26;this.charts=[];this.formatCalls=[]}
  get(r,c){return this.data[r-1]?.[c-1]??''}
  set(r,c,value){while(this.data.length<r)this.data.push([]);this.data[r-1][c-1]=value}
  getRange(r,c,n=1,m=1){if(typeof r==='string')[r,c,n,m]=a1Range(r);return new Range(this,r,c,n,m)}
  setName(s){if(this.book){this.book.tabs.delete(this.name);this.name=s;this.book.tabs.set(s,this);}else this.name=s;return this}
  getLastRow(){for(let i=this.data.length-1;i>=0;i--)if(this.data[i].some(x=>x!==''&&x!==undefined&&x!==null))return i+1;return 0}
  getMaxRows(){return this.maxRows}getMaxColumns(){return this.maxCols}
  setFrozenRows(){return this}
  setHiddenGridlines(){return this}setColumnWidth(){return this}setRowHeight(){return this}
  insertRowsAfter(_n,n){this.maxRows+=n;return this}
  insertColumnsAfter(_n,n){this.maxCols+=n;return this}
  appendRow(values){this.getRange(this.getLastRow()+1,1,1,values.length).setValues([values]);return this}
  deleteRows(r,n){this.data.splice(r-1,n);return this}
  getCharts(){return this.charts}removeChart(ch){this.charts.splice(this.charts.indexOf(ch),1)}
  newChart(){return {setChartType(){return this},addRange(){return this},setPosition(){return this},setOption(){return this},build(){return {fake:true}}}}
  insertChart(ch){this.charts.push(ch)}
  rows(){return this.data.slice(1).filter(r=>r.some(x=>x!==''&&x!==null&&x!==undefined))}
  formatAt(r,c){const f=this.formatCalls.slice().reverse().find(f=>r>=f.r&&r<f.r+f.n&&c>=f.c&&c<f.c+f.m);return f?f.format:null}
}
class Book {
  constructor(){this.tabs=new Map()}
  getId(){return 'TEST_SHEET_ID'}
  getSheetByName(s){return this.tabs.get(s)||null}
  insertSheet(s){const sh=new Sheet(s);sh.book=this;this.tabs.set(s,sh);return sh}
  getSheets(){return [...this.tabs.values()]}
  setSpreadsheetLocale(x){this.locale=x;return this}
  setSpreadsheetTimeZone(x){this.timezone=x;return this}
}
const book=new Book(),triggers=[],props=new Map();let auth=0, itemCalls=0;
book.insertSheet('List1'); // Real newly created Google Sheets start with a blank tab.
const products=[
{id:8001001,amount:1,price:186.4824,productCode:'EXAMPLE-ITEM-A',provision:5.5945,provisionDescription:'user',provisionRate:3,fixedProvision:0},
{id:8001002,amount:1,price:101.4315,productCode:'EXAMPLE-ITEM-B',provision:3.0429,provisionDescription:'user',provisionRate:3,fixedProvision:0}
];
const creditItem={id:1011,amount:1,price:-100,productCode:'EXAMPLE-ITEM-A',provision:-1,provisionDescription:'credit',provisionRate:3,fixedProvision:0};
const date='2026-10-18T18:10:00';
const rows=[
{id:7001001,idp:12345,orderCode:'123',createdDate:date,documentType:0,provision:8.6374,turnover:287.9139,currencyCode:'EUR'},
{id:7001002,idp:12345,orderCode:'124',createdDate:'2026-10-18T19:10:00',documentType:1,provision:-1,turnover:-100,currencyCode:'EUR'}
];
function response(json){return {getResponseCode:()=>200,getContentText:()=>JSON.stringify(json)}}
function upstream(url,options){
  const parsed=new URL(url),pathname=parsed.pathname,page=Number(parsed.searchParams.get('page'))||1;
  if(pathname==='/api/authentication/login'){
    auth++;assert.equal(options.method,'post');
    return {getResponseCode:()=>204,getAllHeaders:()=>({'Set-Cookie':['affil.auth=TEST; Path=/','__cf_bm=unused; Path=/']})};
  }
  if(pathname==='/api/authentication/current-user')return response({idp:12345,eshopName:'alza.de',companyName:'Example GmbH',email:'partner@example.invalid'});
  if(pathname==='/api/payment')return response({values:[{id:901,state:1,provision:8.6374,currencyCode:'EUR',dateCreated:'2026-10-18T20:00:00'}],totalItems:1});
  if(pathname==='/api/payment/901')return response({id:901,idp:12345,currencyCode:'EUR',financialDocuments:{values:page===1?[rows[0]]:[],totalItems:1}});
  if(pathname==='/api/financial-document')return response({values:page===1?[rows[1]]:[],totalItems:1});
  if(pathname==='/api/financial-document/7001001'){
    itemCalls++;return response({...rows[0],items:{values:products.slice(page-1,page),totalItems:2}});
  }
  if(pathname==='/api/financial-document/7001002'){
    itemCalls++;return response({...rows[1],items:{values:page===1?[creditItem]:[],totalItems:1}});
  }
  throw Error('Unexpected API path '+pathname);
}
const propsApi={getProperty:k=>props.get(k)||null,setProperty:(k,v)=>props.set(k,v),
  setProperties:o=>Object.entries(o).forEach(([k,v])=>props.set(k,v)),deleteProperty:k=>props.delete(k)};
const ctx={console,Date,JSON,Map,Set,Array,Object,String,Number,RegExp,Math,encodeURIComponent,isNaN,
  SpreadsheetApp:{getActiveSpreadsheet:()=>book,openById:(id)=>{assert.equal(id,'TEST_SHEET_ID');return book},newRichTextValue:()=>({setText(x){this.text=x;return this},setLinkUrl(x){this.url=x;return this},build(){return this}}),
    getUi:()=>({createMenu:()=>({addItem(){return this},addSeparator(){return this},addToUi(){return this}}),showModalDialog(){}})},
  PropertiesService:{getUserProperties:()=>propsApi},
  Utilities:{getUuid:()=>Math.random().toString(16).slice(2).padEnd(8,'a')+'-aaaa-4aaa-aaaa-aaaaaaaaaaaa',formatDate:(v,_tz,format)=>format==='yyyy-MM-dd'?new Date(v).toISOString().slice(0,10):format==='yyyy-MM'?new Date(v).toISOString().slice(0,7):format==='HH:mm'?new Date(v).toISOString().slice(11,16):new Date(v).toISOString()},
  LockService:{getScriptLock:()=>({tryLock:()=>true,releaseLock:()=>{}})},
  HtmlService:{createHtmlOutputFromFile:(name)=>{assert(['Set','PhonePanel'].includes(name),'dialog HTML must exist');return {setWidth(){return this},setHeight(){return this}}}},
  Charts:{ChartType:{LINE:'LINE'}},
  ScriptApp:{getService:()=>({getUrl:()=> 'https://script.google.com/macros/s/TEST/exec'}),getProjectTriggers:()=>[...triggers],deleteTrigger:t=>{triggers.splice(triggers.indexOf(t),1)},newTrigger:fn=>({fn,getHandlerFunction(){return fn},timeBased(){return this},everyHours(h){this.hours=h;return this},create(){triggers.push(this);return this}})},
  ContentService:{MimeType:{JSON:'application/json'},createTextOutput:s=>({body:s,setMimeType(m){this.mime=m;return this},getContent(){return this.body}})},
  UrlFetchApp:{fetch:upstream}
};
vm.createContext(ctx);
for(const file of ['Config.gs','Api.gs','Sheets.gs','iPhoneGateway.gs','Setup.gs','Sync.gs','Items.gs']){
  const code=fs.readFileSync(path.join(root,file),'utf8');
  new vm.Script(code,{filename:file}).runInContext(ctx);
}
assert.throws(()=>ctx.setupAffiliate({email:'no',password:'x',start:'2026-01-01'}),/e-mail/);
ctx.openAffiliateSetup(); // Regression: 'Set.html' and 'Setup.gs' are distinct filenames.
const setup=ctx.setupAffiliate({email:'partner@example.invalid',password:'SOME_PRIVATE_PASSWORD',start:'2026-01-01'});
assert.equal(setup.idp,'12345');
assert.equal(triggers.length,2);
assert.deepEqual(triggers.map(x=>x.hours).sort(),[1,4]);
assert.equal(book.tabs.size,14,'All exactly 14 requested/necessary sheets are created');
assert.equal(book.getSheetByName('List1'),null,'blank default tab renamed to Dashboard');
const first=ctx.autoAffiliateSync();
assert.equal(first.documents,2);assert.equal(first.payouts,1);
assert.equal(book.getSheetByName('Doklady').getLastRow(),3);
assert.equal(book.getSheetByName('Alza vyúčtování').getLastRow(),2);
assert(Math.abs(book.getSheetByName('Provize po dnech').rows()[0][4]-7.6374)<1e-10);
assert(Math.abs(book.getSheetByName('Denní profit').rows()[0][2]-7.6374)<1e-10);
assert(Math.abs(book.getSheetByName('Souhrn').rows().find(r=>r[0]==='Čisté provize EUR')[1]-7.6374)<1e-10);
// Dashboard: current unsettled commissions prominently; historical total below.
assert.equal(book.getSheetByName('Dashboard').getRange('A4').getValues()[0][0],'Od poslední uzávěrky');
assert.equal(book.getSheetByName('Dashboard').getRange('A9').getValues()[0][0],'Historicky celkem');
assert.equal(book.getSheetByName('Dashboard').getRange('A5').getValues()[0][0],-1);
assert(Math.abs(book.getSheetByName('Dashboard').getRange('A10').getValues()[0][0]-7.6374)<1e-10);
assert.equal(book.getSheetByName('Dashboard').formatAt(5,1),'#,##0.00');
assert.equal(book.getSheetByName('Dashboard').formatAt(10,1),'#,##0.00');
const second=ctx.autoAffiliateSync();
assert.equal(second.documents,2,'repeated sync must not duplicate history');
const imported=ctx.autoAffiliateItems();
assert.equal(imported.checked,2);assert.equal(imported.items,3);assert.equal(imported.errors,0);
assert.equal(itemCalls,3,'2 pages for the first document, one for the second');
const items=book.getSheetByName('Polozky').rows();
assert.equal(items.length,3);
assert.equal(items[0][6],'https://www.alza.cz/kod/EXAMPLE-ITEM-A');
assert.equal(items.find(r=>Number(r[11])===-1)[11],-1);
const prods=book.getSheetByName('Produkty').rows();
assert.equal(prods.length,2);
assert(Math.abs(prods.find(r=>r[0]==='EXAMPLE-ITEM-A')[6]-4.5945)<1e-10);
assert.equal(book.getSheetByName('TOP10 týdny').rows().length,2);
assert.equal(book.getSheetByName('TOP10 měsíce').rows().length,2);
assert.equal(book.getSheetByName('TOP10 týdny').rows()[0][2],'EXAMPLE-ITEM-A');
assert.equal(book.getSheetByName('TOP Hodiny life').rows().length,24);
assert.equal(ctx.affIsoWeek_('2020-12-31'),'2020-W53');
assert.equal(ctx.affIsoWeek_('2021-01-01'),'2020-W53');
assert.equal(ctx.affIsoWeek_('2021-01-04'),'2021-W01');
const callsBefore=itemCalls;
ctx.autoAffiliateItems();assert.equal(itemCalls,callsBefore,'no repeated requests for checked documents');
ctx.setupAffiliate({email:'partner@example.invalid',password:'SOME_PRIVATE_PASSWORD',start:'2026-01-01'});
assert.equal(triggers.length,2,'re-running setup should not create duplicate triggers');
assert.throws(()=>ctx.setupAffiliate({email:'x@example.invalid',password:'x',start:'2026-02-30'}),/datum/);
ctx.stopAffiliateAutomation();assert.equal(triggers.length,0);
for(const sh of book.tabs.values())for(const row of sh.data)for(const val of row)
  assert(!String(val||'').includes('SOME_PRIVATE_PASSWORD'),'secrets never appear in Sheet');
console.log('PASS: installer, identity, 14 sheets, 4h/1h, payouts, signed EUR credits, details pagination, product TOP10, weekly ISO, idempotence and privacy');
// A capped upstream can return only 20 rows even when pageSize=1000.
let detailPages=0;
const capturedFetch=ctx.UrlFetchApp.fetch;
ctx.UrlFetchApp.fetch=(url,options)=>{
  if(new URL(url).pathname==='/api/payment/999'){
    detailPages++;
    const p=Number(new URL(url).searchParams.get('page'));
    const fake=Array.from({length:857},(_,i)=>({id:9900000+i,provision:1,turnover:20,
      createdDate:'2026-10-18T12:00:00',currencyCode:'EUR'}));
    return response({id:999,idp:12345,financialDocuments:{
      values:fake.slice((p-1)*20,p*20),totalItems:fake.length}});
  }
  return capturedFetch(url,options);
};
const paged=ctx.affPaymentDetail_('affil.auth=TEST','999');
assert.equal(paged.documents.length,857);
assert.equal(detailPages,43,'857 entries at 20/page must fetch 43 pages');
// Multi-currency TOP10 must not sum product commissions across currencies.
const sample=(cur,id)=>[String(id),'9001','ORDER','2026-10-18',15,'DEMO-CODE',
  'https://www.alza.cz/kod/DEMO-CODE',1,100,3,0,10,cur,'',''];
const analytics=ctx.affItemAnalytics_([sample('CZK',1),sample('EUR',2)],
  new Map([['1',['1','2026-10-18','CZK',1,1,10,10,0,'OK','now']],
    ['2',['2','2026-10-18','EUR',1,1,10,10,0,'OK','now']]]),
  new Map([['1',['','1','','2026-10-18','','',10,0,'CZK']],
    ['2',['','2','','2026-10-18','','',10,0,'EUR']]]));
assert.equal(analytics.weeks.length,2);
assert.equal(analytics.months.length,2);
assert.equal(analytics.products.length,2);
assert.equal(ctx.affSafe_('=IMPORTXML("malicious")'),"'=IMPORTXML(\"malicious\")");
ctx.affRefreshDashboard_({idp:'12345',companyName:'Example GmbH'},'2026-01-01',new Map([['EUR',{positive:10,negative:-1}]]),2,1,false,
  [['2026-10-17','EUR',5,0,5,1],['2026-10-18','EUR',5,-1,4,2]]);
assert.equal(book.getSheetByName('Dashboard').getCharts().length,1);
console.log('PASS: 857-page-capped payout documents, currency isolation, spreadsheet-injection protection, dashboard chart');

// Data Studio: real dates, stable headers and numeric measures.
assert.equal(book.getSheetByName('Denní profit').data[0].length,3);
assert.equal(book.getSheetByName('Souhrn').data[0].length,2);
assert(book.getSheetByName('Doklady').rows()[0][3] instanceof Date);
assert(book.getSheetByName('Provize po dnech').rows()[0][0] instanceof Date);
assert(book.getSheetByName('Polozky').rows()[0][3] instanceof Date);
assert(book.getSheetByName('TOP Hodiny Měsíc').rows()[0][0] instanceof Date);
assert.equal(book.getSheetByName('Dashboard').getRange('J4').getValues()[0][0],'Example GmbH');
// Status detail and progress intentionally unified, without duplicate Sheet titles.
assert.equal(book.getSheetByName('Polozky sync status').rows().length,2);
assert.equal(book.getSheetByName('TOP Hodiny Měsíc').rows().length,24);
assert.equal(book.tabs.size,14);
// The upstream legitimately produces 0-valued documents for either documentType.
assert.equal(ctx.affSignMismatch_({documentType:1,provision:0}),false);
assert.equal(ctx.affSignMismatch_({documentType:0,provision:0}),false);
assert.equal(ctx.affSignMismatch_({documentType:1,provision:25}),true);
assert.equal(ctx.affSignMismatch_({documentType:0,provision:-25}),true);
assert.equal(ctx.affDocFromApi_({...rows[0],id:7001009,provision:0,documentType:1},'12345','NEUZAVŘENÉ',null,null)[6],0);
const h=[
  ['', '1','A','2026-09-01','2026-09-01T09:00:00','Provize',10,20,'EUR'],
  ['', '2','B','2026-09-30','2026-09-30T09:30:00','Dobropis',-3,-20,'EUR'],
  ['', '3','C','2026-10-01','2026-10-01T09:30:00','Provize',7,40,'EUR']
];
const history=ctx.affHoursFromDocuments_(h,'2026-10');
assert.equal(history.month,'2026-09');
assert.equal(history.life.length,24);
assert.equal(history.previous.length,24);
assert.deepEqual(Array.from(history.life.find(r=>r[0]===9).slice(2)),[3,3,14]);
assert.deepEqual(Array.from(history.previous.find(r=>r[1]===9).slice(3)),[2,2,7]);
console.log('PASS: profile dashboard, native Looker dates, zero-value credits, anomalous sign audit, 24-hour lifetime/previous-month reports.');
// The closure balance uses payout membership, NOT document creation date.
const closureRows=[
  ['', '1', 'ORDER1', '2026-08-01', '', '', 100, 0, 'CZK', true, '901'],
  ['', '2', 'ORDER2', '2026-08-02', '', '', -15, 0, 'CZK', false, ''],
  ['', '3', 'ORDER3', '2026-10-01', '', '', 45, 0, 'CZK', true, '902'],
  ['', '4', 'ORDER4', '2026-10-01', '', '', 99, 0, 'CZK', true, '']
];
const sinceClose=ctx.affSinceClosure_(closureRows,[['901','','Přijato'],['902','','Čeká na schválení']]);
assert.equal(sinceClose.get('CZK'),30,'an older unclosed credit note and a pending payout count; accepted payout and unlinked closed doc do not');
assert(!sinceClose.has('EUR'));

// Main sync must continue past zero-value documents and non-zero sign/type disagreement.
const originalUnclosed=rows[1];
rows[1]={...originalUnclosed,documentType:1,provision:0,turnover:0};
ctx.autoAffiliateSync();
assert.equal(book.getSheetByName('Doklady').rows().find(r=>r[1]==='7001002')[6],0);
rows[1]={...originalUnclosed,documentType:0,provision:-1};
ctx.autoAffiliateSync();
assert.equal(book.getSheetByName('Doklady').rows().find(r=>r[1]==='7001002')[6],-1);
assert(book.getSheetByName('Sync Log').rows().some(r=>r[2]==='VAROVÁNÍ'));
console.log('PASS: actual financial sync tolerates zero-value notes and mismatched documentType sign, with audit warning.');

// RC2: display formats must not alter underlying numeric and date types.
assert.equal(book.locale,'cs_CZ');
assert.equal(book.timezone,'Europe/Prague');
assert.equal(book.getSheetByName('Dashboard').formatAt(5,1),'#,##0.00');
assert.equal(book.getSheetByName('Dashboard').formatAt(5,3),'#,##0');
assert.equal(book.getSheetByName('Dashboard').formatAt(10,2),'#,##0.00');
assert.equal(book.getSheetByName('Dashboard').formatAt(8,10),'dd.mm.yyyy');
assert.equal(book.getSheetByName('Dashboard').getRange('J6').getValues()[0][0],'12345');
assert.equal(book.getSheetByName('Dashboard').formatAt(6,10),'@');
assert(book.getSheetByName('Dashboard').getRange('J8').getValues()[0][0] instanceof Date);
const reportDate=book.getSheetByName('Provize po dnech').rows()[0][0];
const reportAmount=book.getSheetByName('Provize po dnech').rows()[0][4];
assert.equal(book.getSheetByName('Provize po dnech').formatAt(2,1),'dd.mm.yyyy');
assert.equal(book.getSheetByName('Provize po dnech').formatAt(2,5),'#,##0.00');
assert.equal(book.getSheetByName('Alza vyúčtování').formatAt(2,4),'#,##0.00');
assert.equal(book.getSheetByName('Polozky').formatAt(2,10),'#,##0.00');
assert.equal(book.getSheetByName('TOP Hodiny Měsíc').formatAt(2,1),'mm.yyyy');
assert.equal(book.getSheetByName('Souhrn').rows().find(r=>r[0]==='Historie od')[1] instanceof Date,true);
assert.equal(book.getSheetByName('Souhrn').formatAt(4,2)!==null,true);
assert.equal(ctx.applyAffiliateFormatting().status,'OK');
assert.equal(book.getSheetByName('Provize po dnech').rows()[0][4],reportAmount);
assert.equal(book.getSheetByName('Provize po dnech').rows()[0][0].getTime(),reportDate.getTime());
// The desired presentation 269 745,52 must retain the full financial precision.
ctx.affWrite_('Denní profit',['Datum','Měna','Provize'],[['2026-02-10','CZK',269745.5186]]);
assert.equal(book.getSheetByName('Denní profit').rows()[0][2],269745.5186);
assert.equal(book.getSheetByName('Denní profit').formatAt(2,3),'#,##0.00');
assert(book.getSheetByName('Denní profit').rows()[0][0] instanceof Date);
console.log('PASS: all sheets use localized numeric/date formats, numeric precision preserved, old dashboard reformatted without import.');

// RC3: optional iPhone Shortcuts Gateway. Web requests never log secrets or disclose credentials.
const parseText=x=>JSON.parse(x.getContent());
assert.equal(parseText(ctx.doGet()).error,'POST_REQUIRED');
assert.equal(parseText(ctx.doPost({postData:{contents:'{}'}})).error,'DISABLED');
ctx.openIPhoneGateway();
assert.equal(ctx.getIPhoneGatewaySettings().enabled,false,'phone disabled by default');
const enabled=ctx.updateIPhoneGateway(true);
assert.equal(enabled.enabled,true);
assert(enabled.secret.length>60,'long random access secret');
assert.equal(enabled.url,'https://script.google.com/macros/s/TEST/exec');
assert.equal(props.get('AFF_SPREADSHEET_ID'),'TEST_SHEET_ID');
assert.equal(parseText(ctx.doPost({postData:{contents:JSON.stringify({secret:'bad'})}})).error,'UNAUTHORIZED');
const invoke=secret=>parseText(ctx.doPost({postData:{contents:JSON.stringify({secret})}}));
const gatewayResult=invoke(enabled.secret);
assert.equal(gatewayResult.ok,true);
assert.equal(gatewayResult.currency,'EUR');
assert.equal(gatewayResult.totalDocuments,2);
assert(Math.abs(gatewayResult.totalCommission-7.6374)<1e-9);
assert(gatewayResult.lastSync.endsWith('Z'),'last completed docs sync is timestamped');
assert.equal(gatewayResult.lastClosureDate,'2026-10-18');
assert.equal(gatewayResult.notification.split('\n').length,4);
assert(gatewayResult.notification.startsWith('Celkem '));
assert(!JSON.stringify(gatewayResult).includes('SOME_PRIVATE_PASSWORD'));
assert(!JSON.stringify(gatewayResult).includes('partner@example.invalid'));
assert(!JSON.stringify(gatewayResult).includes('7001001'));
const changed=ctx.rotateIPhoneGatewaySecret();
assert.notEqual(changed.secret,enabled.secret);
assert.equal(invoke(enabled.secret).error,'UNAUTHORIZED');
assert.equal(invoke(changed.secret).ok,true);
ctx.updateIPhoneGateway(false);
assert.equal(invoke(changed.secret).error,'DISABLED');
assert.equal(ctx.getIPhoneGatewaySettings().secret,'');
const testDoc=(when,amount,id,currency='CZK')=>['',String(id),'ORDER',when,'','',amount,0,currency];
const countSample=ctx.affPhoneAggregate_([
  testDoc('2026-10-18',10,1),testDoc('2026-10-19',20,2),
  testDoc('2026-10-20',-5,3),testDoc('2026-10-20',0,4)
],[[901,new Date('2026-10-18T12:00:00Z'),'Přijato']],
  '2026-10-20','2026-10-20T08:51:00.000Z');
assert.equal(countSample.totalCommission,25);
assert.equal(countSample.yesterdayCommission,20);
assert.equal(countSample.todayCommission,-5);
assert.equal(countSample.totalDocuments,4);
assert.equal(countSample.yesterdayDocuments,1);
assert.equal(countSample.todayDocuments,2);
assert.equal(countSample.lastClosureDate,'2026-10-18');
assert.equal(countSample.daysSinceLastClosure,2);
assert.equal(countSample.notification.split('\n').length,4);
assert.equal(countSample.notification.includes('25,00 Kč (4 Dok)'),true);
const multi=ctx.affPhoneAggregate_([testDoc('2026-10-19',10,1,'CZK'),testDoc('2026-10-19',5,2,'EUR')],[],
  '2026-10-20',null);
assert.equal(multi.warning,'MULTI_CURRENCY');
assert.equal(multi.totalCommission,null);
assert.equal(multi.currencies.length,2);
console.log('PASS: optional install, protected POST JSON, secret generation/rotation/disable, mixed-currency isolation, last-sync/closure, four-line notification, credentials never exposed.');

// Installer checkbox must generate secret without a separate settings call.
const setupPhone=ctx.setupAffiliate({email:'partner@example.invalid',password:'SOME_PRIVATE_PASSWORD',
  start:'2026-01-01',iphoneGateway:true});
assert.equal(setupPhone.iphoneGateway,true);
assert.equal(ctx.getIPhoneGatewaySettings().enabled,true);
assert(ctx.getIPhoneGatewaySettings().secret.length>60);
assert.deepEqual(triggers.map(x=>x.hours).sort(),[1,4]);
ctx.setupAffiliate({email:'partner@example.invalid',password:'SOME_PRIVATE_PASSWORD',
  start:'2026-01-01',iphoneGateway:false});
assert.equal(ctx.getIPhoneGatewaySettings().enabled,false);
console.log('PASS: installer checkbox starts/stops gateway without extra triggers.');
