/** Read-only connector for observed Alza Affiliate internal web endpoints. */
function affLogin_(email,password) {
  const res=UrlFetchApp.fetch(AFF.base+'/api/authentication/login',{
    method:'post',contentType:'application/json',
    payload:JSON.stringify({email,password,rememberMe:false}),
    muteHttpExceptions:true,followRedirects:false
  });
  if(res.getResponseCode()!==204)throw new Error('Alza login HTTP '+res.getResponseCode());
  const headers=res.getAllHeaders(), cookies=[];
  Object.keys(headers).forEach(k=>{
    if(k.toLowerCase()==='set-cookie') {
      const values=Array.isArray(headers[k])?headers[k]:[headers[k]];
      values.forEach(s=>{
        const match=/(?:^|[,\s])affil\.auth=([^;,\s]+)/.exec(String(s));
        if(match)cookies.push('affil.auth='+match[1]);
      });
    }
  });
  if(!cookies.length) throw new Error('Alza login: nenalezena cookie affil.auth.');
  return cookies[0];
}
function affGet_(cookie,path,parameters) {
  const url=AFF.base+path+(parameters?'?'+parameters:'');
  const res=UrlFetchApp.fetch(url,{
    method:'get',headers:{Cookie:cookie,Accept:'application/json'},
    muteHttpExceptions:true,followRedirects:false
  });
  if(res.getResponseCode()!==200)throw new Error('Alza GET '+path+' HTTP '+res.getResponseCode());
  try{return JSON.parse(res.getContentText());}catch(e){throw new Error('Alza GET '+path+': neplatný JSON.');}
}
function affQs_(params) {
  return Object.keys(params).map(k=>encodeURIComponent(k)+'='+encodeURIComponent(params[k])).join('&');
}
/** A requested pageSize is not necessarily honored by the upstream! */
function affPages_(cookie,path,query,unwrap) {
  const rows=[],seen=new Set();let total=null,first=null;
  for(let page=1;page<=AFF.maxPages;page++) {
    const root=affGet_(cookie,path,affQs_(Object.assign({},query,{page,pageSize:AFF.pageSize})));
    const block=unwrap(root);
    if(!block || !Array.isArray(block.values) || !Number.isSafeInteger(Number(block.totalItems)) || Number(block.totalItems)<0)
      throw new Error(path+': neznámý formát stránky '+page);
    if(total===null){total=Number(block.totalItems);first=root;}
    else if(total!==Number(block.totalItems))throw new Error(path+': během importu se změnilo totalItems.');
    for(const row of block.values){
      if(row.id===null||row.id===undefined)throw new Error(path+': položka bez ID.');
      const key=String(row.id);
      if(seen.has(key))throw new Error(path+': duplicitní ID při stránkování.');
      seen.add(key);rows.push(row);
    }
    if(rows.length===total)return {rows,root:first};
    if(!block.values.length||rows.length>total)throw new Error(path+': stránkování neúplné.');
  }
  throw new Error(path+': překročen počet stránek '+AFF.maxPages);
}
function affDateRange_(start) {
  const end=new Date().getFullYear()+'-12-31 23:59:59';
  return {dateFrom:start+'T00:00:00',dateTo:end};
}
function affUnclosed_(cookie,start) {
  return affPages_(cookie,'/api/financial-document',Object.assign({
    '$count':'true',sortDesc:'true',sortKey:2,state:1
  },affDateRange_(start)),r=>r).rows;
}
function affPayments_(cookie,start) {
  return affPages_(cookie,'/api/payment',Object.assign({
    '$count':'true',sortDesc:'true',sortKey:0
  },affDateRange_(start)),r=>r).rows;
}
function affPaymentDetail_(cookie,paymentId) {
  const id=String(paymentId);
  if(!/^\d+$/.test(id))throw new Error('Neplatné ID vyúčtování.');
  const result=affPages_(cookie,'/api/payment/'+id,
    {'$count':'true',sortDesc:'false'},r=>r.financialDocuments);
  if(String(result.root.id)!==id)throw new Error('Vyúčtování: nesouhlasí ID.');
  return {payment:result.root,documents:result.rows};
}
function affDocumentDetail_(cookie,docId) {
  const id=String(docId);
  if(!/^\d+$/.test(id))throw new Error('Neplatné ID dokladu.');
  const result=affPages_(cookie,'/api/financial-document/'+id,
    {'$count':'true',sortDesc:'false'},r=>r.items);
  if(String(result.root.id)!==id)throw new Error('Doklad: nesouhlasí ID.');
  return {document:result.root,items:result.rows};
}
function affIdentity_(cookie) {
  const user=affGet_(cookie,'/api/authentication/current-user','');
  if(!user || user.idp===undefined||user.idp===null)throw new Error('current-user: chybí IDP.');
  return {idp:String(user.idp),eshopName:String(user.eshopName||''),
    companyName:String(user.companyName||''),email:String(user.email||''),
    partnerName:[user.firstName,user.lastName].filter(Boolean).join(' ').trim()};
}
