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
/** Display-only regional settings. This does not stringify numeric/date values. */
function affConfigureLocale_() {
  const ss=affBook_();
  ss.setSpreadsheetLocale('cs_CZ');
  ss.setSpreadsheetTimeZone(AFF.timezone);
}
// Formats use Google Sheets syntax; separators are supplied by sheet locale.
const AFF_FORMAT_MONEY = '#,##0.00';
const AFF_FORMAT_INTEGER = '#,##0';
const AFF_FORMAT_DATE = 'dd.mm.yyyy';
const AFF_FORMAT_MONTH = 'mm.yyyy';
/** Full-column native data formatting for consistent Looker Studio schemas. */
function affFormatColumns_(name) {
  const sh=affBook_().getSheetByName(name);
  if(!sh)return;
  const dates={
    [AFF.sheets.documents]:[4], [AFF.sheets.payouts]:[2],
    [AFF.sheets.daily]:[1], [AFF.sheets.profit]:[1],
    [AFF.sheets.items]:[4], [AFF.sheets.itemState]:[2],
    [AFF.sheets.products]:[8], [AFF.sheets.monthHours]:[1]
  };
  const numeric={
    [AFF.sheets.documents]:{money:[7,8]},
    [AFF.sheets.payouts]:{money:[4,5,6],int:[7]},
    [AFF.sheets.daily]:{money:[3,4,5],int:[6]},
    [AFF.sheets.profit]:{money:[3]},
    [AFF.sheets.items]:{money:[9,10,11,12],int:[5,8]},
    [AFF.sheets.itemState]:{money:[6,7,8],int:[4,5]},
    [AFF.sheets.products]:{money:[6,7],int:[3,4,5]},
    [AFF.sheets.hours]:{money:[5],int:[1,3,4]},
    [AFF.sheets.monthHours]:{money:[6],int:[2,4,5]},
    [AFF.sheets.topWeeks]:{money:[5],int:[2,6,7,8]},
    [AFF.sheets.topMonths]:{money:[5],int:[2,6,7,8]}
  };
  const n=sh.getMaxRows();
  if(n<2)return;
  (dates[name]||[]).forEach(c=>sh.getRange(2,c,n-1,1)
    .setNumberFormat(name===AFF.sheets.monthHours?AFF_FORMAT_MONTH:AFF_FORMAT_DATE));
  const spec=numeric[name]||{};
  (spec.money||[]).forEach(c=>sh.getRange(2,c,n-1,1).setNumberFormat(AFF_FORMAT_MONEY));
  (spec.int||[]).forEach(c=>sh.getRange(2,c,n-1,1).setNumberFormat(AFF_FORMAT_INTEGER));
}
/** Format the mixed-value Souhrn without casting dates/numbers to strings. */
function affFormatSummary_() {
  const sh=affBook_().getSheetByName(AFF.sheets.summary);
  if(!sh||sh.getLastRow()<2)return;
  const values=sh.getRange(2,1,sh.getLastRow()-1,2).getValues();
  values.forEach((r,i)=>{
    const label=String(r[0]),cell=sh.getRange(i+2,2);
    if(label==='Historie od'){
      if(!(r[1] instanceof Date) && affDate_(r[1]))cell.setValue(affSheetDay_(r[1]));
      cell.setNumberFormat(AFF_FORMAT_DATE);
    } else if(/^(Kladné provize|Dobropisy|Čisté provize)\s+[A-Z]{3}$/.test(label)){
      cell.setNumberFormat(AFF_FORMAT_MONEY);
    } else if(label==='Doklady'||label==='Vyúčtování'||label==='Nesoulad typu a znaménka'){
      cell.setNumberFormat(AFF_FORMAT_INTEGER);
    }
  });
}
/** Format an already populated RC1 workbook, with no API calls or data loss. */
function applyAffiliateFormatting() {
  affConfigureLocale_();
  Object.keys(AFF.sheets).forEach(k=>affFormatColumns_(AFF.sheets[k]));
  affFormatSummary_();
  const dashboard=affBook_().getSheetByName(AFF.sheets.dashboard);
  if(dashboard){
    dashboard.getRange('A5:B6').setNumberFormat(AFF_FORMAT_MONEY);
    dashboard.getRange('C5:D6').setNumberFormat(AFF_FORMAT_INTEGER);
    dashboard.getRange('E5:G6').setNumberFormat(AFF_FORMAT_INTEGER);
    dashboard.getRange('B10:B50').setNumberFormat(AFF_FORMAT_MONEY);
    dashboard.getRange('J6:L6').setNumberFormat('@');
    const from=dashboard.getRange('J8').getValues()[0][0];
    if(!(from instanceof Date) && affDate_(from))dashboard.getRange('J8:L8').setValue(affSheetDay_(from));
    dashboard.getRange('J8:L8').setNumberFormat(AFF_FORMAT_DATE);
  }
  return {status:'OK',sheets:affBook_().getSheets().length};
}
/** Store dates as dates (not strings), safely away from midnight/DST rollover. */
function affSheetDay_(value) {
  const day=affDate_(value);
  if(!/^\d{4}-\d{2}-\d{2}$/.test(day))
    throw new Error('Neplatné datum pro Sheets: '+String(value));
  return new Date(day+'T12:00:00Z');
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
  // Store native dates for Google Sheets and Looker Studio (no ISO text dates).
  const dayColumns={
    [AFF.sheets.documents]:[4], [AFF.sheets.payouts]:[2],
    [AFF.sheets.daily]:[1], [AFF.sheets.profit]:[1],
    [AFF.sheets.items]:[4], [AFF.sheets.itemState]:[2],
    [AFF.sheets.products]:[8], [AFF.sheets.monthHours]:[1]
  };
  // Column formats are applied after writing; dates stay native Google Sheets dates.
  const textColumns={
    [AFF.sheets.documents]:[1,2,3,11], [AFF.sheets.payouts]:[1],
    [AFF.sheets.items]:[1,2,3,6,14], [AFF.sheets.itemState]:[1],
    [AFF.sheets.products]:[1], [AFF.sheets.topWeeks]:[3],
    [AFF.sheets.topMonths]:[3]
  };
  (textColumns[name]||[]).forEach(c=>sheet.getRange(1,c,sheet.getMaxRows(),1).setNumberFormat('@'));
  if(rows.length){
    for(let i=0;i<rows.length;i+=1200)sheet.getRange(i+2,1,Math.min(1200,rows.length-i),headers.length)
      .setValues(rows.slice(i,i+1200).map(original=>{
        const row=original.slice();
        (dayColumns[name]||[]).forEach(c=>{
          if(row[c-1]!==''&&row[c-1]!==null&&row[c-1]!==undefined)
            row[c-1]=affSheetDay_(name===AFF.sheets.monthHours && /^\d{4}-\d{2}$/.test(String(row[c-1]))
              ? row[c-1]+'-01' : row[c-1]);
        });
        return row;
      }));
  }
  affFormatColumns_(name);
  return sheet;
}
function affMoneyFormat_(name, columns, n) {
  if(n<=0)return;
  const sh=affBook_().getSheetByName(name);
  columns.forEach(c=>sh.getRange(2,c,n,1).setNumberFormat(AFF_FORMAT_MONEY));
}
function affLog_(task,status,description) {
  const sh=affTab_(AFF.sheets.log,H.log);
  // Do not include passwords, cookies, raw upstream payloads, email or PII.
  const detail=String(description||'').replace(/[\r\n\t]/g,' ').slice(0,250);
  sh.appendRow([affUtc_(),task,status,detail]);
  if(sh.getLastRow()>501)sh.deleteRows(2,sh.getLastRow()-501);
}
function affCreateTabs_() {
  const book=affBook_();
  if(!book.getSheetByName(AFF.sheets.dashboard)) {
    // Reuse the one empty tab that a newly created Google Sheet includes.
    const existing=book.getSheets();
    if(existing.length===1 && existing[0].getLastRow()===0)
      existing[0].setName(AFF.sheets.dashboard);
    else book.insertSheet(AFF.sheets.dashboard);
  }
  affTab_(AFF.sheets.summary,H.summary);
  affTab_(AFF.sheets.log,H.log);
  affTab_(AFF.sheets.profit,H.profit);
  affTab_(AFF.sheets.documents,H.documents);
  affTab_(AFF.sheets.daily,H.daily);
  affTab_(AFF.sheets.items,H.items);
  affTab_(AFF.sheets.itemState,H.itemState);
  affTab_(AFF.sheets.products,H.products);
  affTab_(AFF.sheets.hours,H.hours);
  affTab_(AFF.sheets.monthHours,H.monthHours);
  affTab_(AFF.sheets.payouts,H.payouts);
  affTab_(AFF.sheets.topWeeks,H.top);
  affTab_(AFF.sheets.topMonths,H.top);
  Object.keys(AFF.sheets).forEach(k=>affFormatColumns_(AFF.sheets[k]));
}
