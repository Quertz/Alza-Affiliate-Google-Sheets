/** Spreadsheet storage. Names are deliberately stable for public integrations. */
function affBook_() {
  const ss=SpreadsheetApp.getActiveSpreadsheet();
  if(!ss)throw new Error('Použijte skript navázaný na konkrétní Google Sheet.');
  return ss;
}
function affTab_(name,headers) {
  const ss=affBook_();let sheet=ss.getSheetByName(name);
  if(!sheet)sheet=ss.insertSheet(name);
  if(sheet.getLastRow()===0){
    sheet.getRange(1,1,1,headers.length).setValues([headers]);
    sheet.setFrozenRows(1);
    sheet.getRange(1,1,1,headers.length).setFontWeight('bold').setBackground('#e9f2ff');
  }else{
    const actual=sheet.getRange(1,1,1,headers.length).getDisplayValues()[0];
    if(actual.join('\u001e')!==headers.join('\u001e'))
      throw new Error('List '+name+' má neznámou strukturu. Nedojde k přepisu.');
  }
  return sheet;
}
function affRead_(name,headers) {
  const sheet=affTab_(name,headers);
  const count=sheet.getLastRow()-1;
  return count>0?sheet.getRange(2,1,count,headers.length).getValues():[];
}
function affWrite_(name,headers,rows) {
  const sheet=affTab_(name,headers);
  if(sheet.getMaxRows()<rows.length+1)sheet.insertRowsAfter(sheet.getMaxRows(),rows.length+1-sheet.getMaxRows());
  if(sheet.getMaxColumns()<headers.length)sheet.insertColumnsAfter(sheet.getMaxColumns(),headers.length-sheet.getMaxColumns());
  if(sheet.getLastRow()>1)sheet.getRange(2,1,sheet.getLastRow()-1,headers.length).clearContent();
  // Force reporting-day columns to ISO text. Sheets may otherwise return Date objects.
  const dayColumns={
    [AFF.sheets.documents]:[4], [AFF.sheets.payouts]:[2],
    [AFF.sheets.daily]:[1], [AFF.sheets.profit]:[1],
    [AFF.sheets.items]:[4], [AFF.sheets.itemState]:[2],
    [AFF.sheets.products]:[8]
  };
  (dayColumns[name]||[]).forEach(c=>sheet.getRange(1,c,sheet.getMaxRows(),1).setNumberFormat('@'));
  const textColumns={
    [AFF.sheets.documents]:[1,2,3,11], [AFF.sheets.payouts]:[1],
    [AFF.sheets.items]:[1,2,3,6,14], [AFF.sheets.itemState]:[1],
    [AFF.sheets.products]:[1], [AFF.sheets.topWeeks]:[3],
    [AFF.sheets.topMonths]:[3]
  };
  (textColumns[name]||[]).forEach(c=>sheet.getRange(1,c,sheet.getMaxRows(),1).setNumberFormat('@'));
  if(rows.length){
    for(let i=0;i<rows.length;i+=1200)sheet.getRange(i+2,1,Math.min(1200,rows.length-i),headers.length)
      .setValues(rows.slice(i,i+1200));
  }
  return sheet;
}
function affMoneyFormat_(name, columns, n) {
  if(n<=0)return;
  const sh=affBook_().getSheetByName(name);
  columns.forEach(c=>sh.getRange(2,c,n,1).setNumberFormat('#,##0.0000'));
}
function affLog_(task,status,description) {
  const sh=affTab_(AFF.sheets.log,H.log);
  // Do not include passwords, cookies, raw upstream payloads, email or PII.
  const detail=String(description||'').replace(/[\r\n\t]/g,' ').slice(0,250);
  sh.appendRow([affUtc_(),task,status,detail]);
  if(sh.getLastRow()>501)sh.deleteRows(2,sh.getLastRow()-501);
}
function affCreateTabs_() {
  affTab_(AFF.sheets.dashboard,H.summary);
  affTab_(AFF.sheets.summary,H.summary);
  affTab_(AFF.sheets.log,H.log);
  affTab_(AFF.sheets.profit,H.profit);
  affTab_(AFF.sheets.documents,H.documents);
  affTab_(AFF.sheets.daily,H.daily);
  affTab_(AFF.sheets.items,H.items);
  affTab_(AFF.sheets.itemState,H.itemState);
  affTab_(AFF.sheets.products,H.products);
  affTab_(AFF.sheets.hours,H.hours);
  affTab_(AFF.sheets.progress,H.progress);
  affTab_(AFF.sheets.payouts,H.payouts);
  affTab_(AFF.sheets.topWeeks,H.top);
  affTab_(AFF.sheets.topMonths,H.top);
}
