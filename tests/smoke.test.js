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
  setFontWeight(){return this}setBackground(){return this}setNumberFormat(){return this}
  clearContent(){for(let i=0;i<this.n;i++)for(let j=0;j<this.m;j++)this.sh.set(this.r+i,this.c+j,'');return this}
}
class Sheet {
  constructor(name){this.name=name;this.data=[];this.maxRows=1000;this.maxCols=26;this.charts=[]}
  get(r,c){return this.data[r-1]?.[c-1]??''}
  set(r,c,value){while(this.data.length<r)this.data.push([]);this.data[r-1][c-1]=value}
  getRange(r,c,n=1,m=1){return new Range(this,r,c,n,m)}
  getLastRow(){for(let i=this.data.length-1;i>=0;i--)if(this.data[i].some(x=>x!==''&&x!==undefined&&x!==null))return i+1;return 0}
  getMaxRows(){return this.maxRows}getMaxColumns(){return this.maxCols}
  setFrozenRows(){return this}insertRowsAfter(_n,n){this.maxRows+=n;return this}
  insertColumnsAfter(_n,n){this.maxCols+=n;return this}
  appendRow(values){this.getRange(this.getLastRow()+1,1,1,values.length).setValues([values]);return this}
  deleteRows(r,n){this.data.splice(r-1,n);return this}
  getCharts(){return this.charts}removeChart(ch){this.charts.splice(this.charts.indexOf(ch),1)}
  newChart(){return {setChartType(){return this},addRange(){return this},setPosition(){return this},setOption(){return this},build(){return {fake:true}}}}
  insertChart(ch){this.charts.push(ch)}
  rows(){return this.data.slice(1).filter(r=>r.some(x=>x!==''&&x!==null&&x!==undefined))}
}
class Book {
  constructor(){this.tabs=new Map()}
  getSheetByName(s){return this.tabs.get(s)||null}
  insertSheet(s){const sh=new Sheet(s);this.tabs.set(s,sh);return sh}
}
const book=new Book(),triggers=[],props=new Map();let auth=0, itemCalls=0;
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
  if(pathname==='/api/authentication/current-user')return response({idp:12345,eshopName:'alza.de'});
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
  SpreadsheetApp:{getActiveSpreadsheet:()=>book,newRichTextValue:()=>({setText(x){this.text=x;return this},setLinkUrl(x){this.url=x;return this},build(){return this}}),
    getUi:()=>({createMenu:()=>({addItem(){return this},addSeparator(){return this},addToUi(){return this}}),showModalDialog(){}})},
  PropertiesService:{getUserProperties:()=>propsApi},
  Utilities:{formatDate:(v,_tz,format)=>format==='yyyy-MM-dd'?new Date(v).toISOString().slice(0,10):new Date(v).toISOString()},
  LockService:{getScriptLock:()=>({tryLock:()=>true,releaseLock:()=>{}})},
  HtmlService:{createHtmlOutputFromFile:()=>({setWidth(){return this},setHeight(){return this}})},
  Charts:{ChartType:{LINE:'LINE'}},
  ScriptApp:{getProjectTriggers:()=>[...triggers],deleteTrigger:t=>{triggers.splice(triggers.indexOf(t),1)},newTrigger:fn=>({fn,getHandlerFunction(){return fn},timeBased(){return this},everyHours(h){this.hours=h;return this},create(){triggers.push(this);return this}})},
  UrlFetchApp:{fetch:upstream}
};
vm.createContext(ctx);
for(const file of ['Config.gs','Api.gs','Sheets.gs','Setup.gs','Sync.gs','Items.gs']){
  const code=fs.readFileSync(path.join(root,file),'utf8');
  new vm.Script(code,{filename:file}).runInContext(ctx);
}
assert.throws(()=>ctx.setupAffiliate({email:'no',password:'x',start:'2026-01-01'}),/e-mail/);
const setup=ctx.setupAffiliate({email:'partner@example.invalid',password:'SOME_PRIVATE_PASSWORD',start:'2026-01-01'});
assert.equal(setup.idp,'12345');
assert.equal(triggers.length,2);
assert.deepEqual(triggers.map(x=>x.hours).sort(),[2,4]);
assert.equal(book.tabs.size,14,'All exactly 14 requested/necessary sheets are created');
const first=ctx.autoAffiliateSync();
assert.equal(first.documents,2);assert.equal(first.payouts,1);
assert.equal(book.getSheetByName('Alza doklady').getLastRow(),3);
assert.equal(book.getSheetByName('Alza vyúčtování').getLastRow(),2);
assert(Math.abs(book.getSheetByName('Alza denni').rows()[0][4]-7.6374)<1e-10);
assert(Math.abs(book.getSheetByName('Denní profit').rows()[0][2]-7.6374)<1e-10);
assert(Math.abs(book.getSheetByName('Alza Souhrn').rows().find(r=>r[0]==='Čisté provize EUR')[1]-7.6374)<1e-10);
const second=ctx.autoAffiliateSync();
assert.equal(second.documents,2,'repeated sync must not duplicate history');
const imported=ctx.autoAffiliateItems();
assert.equal(imported.checked,2);assert.equal(imported.items,3);assert.equal(imported.errors,0);
assert.equal(itemCalls,3,'2 pages for the first document, one for the second');
const items=book.getSheetByName('Alza položky').rows();
assert.equal(items.length,3);
assert.equal(items[0][6],'https://www.alza.cz/kod/EXAMPLE-ITEM-A');
assert.equal(items.find(r=>Number(r[11])===-1)[11],-1);
const prods=book.getSheetByName('Alza produkty').rows();
assert.equal(prods.length,2);
assert(Math.abs(prods.find(r=>r[0]==='EXAMPLE-ITEM-A')[6]-4.5945)<1e-10);
assert.equal(book.getSheetByName('TOP10 týdny').rows().length,2);
assert.equal(book.getSheetByName('TOP10 měsíce').rows().length,2);
assert.equal(book.getSheetByName('TOP10 týdny').rows()[0][2],'EXAMPLE-ITEM-A');
assert.equal(book.getSheetByName('Alza hodiny').rows().length,2);
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
console.log('PASS: installer, identity, 14 sheets, 4h/2h, payouts, signed EUR credits, details pagination, product TOP10, weekly ISO, idempotence and privacy');
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
ctx.affRefreshDashboard_({idp:'12345'},'2026-01-01',new Map([['EUR',{positive:10,negative:-1}]]),2,1,false,
  [['2026-10-17','EUR',5,0,5,1],['2026-10-18','EUR',5,-1,4,2]]);
assert.equal(book.getSheetByName('Dashboard').getCharts().length,1);
console.log('PASS: 857-page-capped payout documents, currency isolation, spreadsheet-injection protection, dashboard chart');
