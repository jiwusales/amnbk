const SS_ID='10Q4EOGZPMsu9WOyabxZjU8j6QNuGduM8L-h_mZ10ypQ';
const ONLINE='線上銷售';
const STORE='店面銷售';
const STOCK='商品庫存';
const SHIP='出貨記錄';

const CACHE_KEY='JIWU_ONLINE_DATA_V7';
const CACHE_SEC=300;
const ONLINE_GROUP_SYNC_CACHE_KEY='JIWU_ONLINE_GROUP_SYNC_V1';
const STORE_ACTIVE_SALESPERSON_KEY='JIWU_STORE_ACTIVE_SALESPERSON';
const AUTH_PASSWORD_PROPERTY='ADMIN_PASSWORD';
const AUTH_SECRET_CACHE_KEY='JIWU_AUTH_SECRET_V1';
const AUTH_TOKEN_PREFIX='JIWU_AUTH_';
const AUTH_TOKEN_TTL_SEC=43200;
const AUTH_TRUSTED_TOKEN_TTL_SEC=30*24*60*60;
const PUBLIC_GROUP_WORK_CACHE_KEY='JIWU_PUBLIC_GROUP_WORK_V1';

function authSecret_(){
  const cache=CacheService.getScriptCache();
  const cached=cache.get(AUTH_SECRET_CACHE_KEY);
  if(cached!==null)return cached;
  const expected=PropertiesService.getScriptProperties().getProperty(AUTH_PASSWORD_PROPERTY)||'';
  if(expected)cache.put(AUTH_SECRET_CACHE_KEY,expected,300);
  return expected;
}

function authLogin(p){
  const expected=authSecret_();
  if(!expected)throw new Error('尚未設定後台密碼');
  if(!safeEqual_(String(p.password||''),expected))throw new Error('密碼錯誤');
  const ttl=String(p.trusted||'')==='true'||p.trusted===true?AUTH_TRUSTED_TOKEN_TTL_SEC:AUTH_TOKEN_TTL_SEC;
  const expiresAt=Date.now()+ttl*1000;
  const payload=String(expiresAt)+'.'+Utilities.getUuid().replace(/-/g,'');
  const signature=Utilities.base64EncodeWebSafe(
    Utilities.computeHmacSha256Signature(payload,expected,Utilities.Charset.UTF_8)
  ).replace(/=+$/,'');
  const token=payload+'.'+signature;
  return {ok:true,token:token,expiresIn:ttl};
}

function requireAuth_(p){
  const token=String((p&&p.token)||'');
  if(!token)throw new Error('登入已失效，請重新登入');
  const parts=token.split('.');
  if(parts.length!==3)throw new Error('登入已失效，請重新登入');
  const expected=authSecret_();
  if(!expected)throw new Error('尚未設定後台密碼');
  const payload=parts[0]+'.'+parts[1];
  const signature=Utilities.base64EncodeWebSafe(
    Utilities.computeHmacSha256Signature(payload,expected,Utilities.Charset.UTF_8)
  ).replace(/=+$/,'');
  const expiresAt=Number(parts[0]||0);
  if(!payload||!safeEqual_(parts[2],signature)||!expiresAt||Date.now()>=expiresAt){
    throw new Error('登入已失效，請重新登入');
  }
}

/* 可在編輯器手動執行一次，移除舊版登入流程累積的權杖屬性。 */
function cleanupLegacyAuthTokens(){
  const properties=PropertiesService.getScriptProperties();
  const all=properties.getProperties();
  let count=0;
  Object.keys(all).forEach(key=>{if(key.indexOf(AUTH_TOKEN_PREFIX)===0){properties.deleteProperty(key);count++;}});
  return count;
}

function safeEqual_(a,b){
  const ah=Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,a,Utilities.Charset.UTF_8);
  const bh=Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,b,Utilities.Charset.UTF_8);
  let diff=ah.length^bh.length;
  for(let i=0;i<Math.max(ah.length,bh.length);i++)diff|=(ah[i%ah.length]^bh[i%bh.length]);
  return diff===0;
}

function doGet(e){
  try{
    const p=(e&&e.parameter)?e.parameter:{};

    const action=p.action||'ping';
    if(action==='authWarmup')return jsonp(e,{ok:true,configured:!!authSecret_()});
    if(action==='authLogin')return jsonp(e,authLogin(p));
    // 提供給客人查看的團務進度表，只有公開、唯讀的欄位。
    if(action==='publicGroupWork')return jsonp(e,publicGroupWork_());

    // 舊版手機捷徑只會傳 id 與 format=text，沒有瀏覽器登入權杖。
    // 僅允許此精確格式執行掃碼；其他 API 一律走登入驗證。
    if(p.id&&p.format==='text'&&!p.action){
      return jsonp(e,storeScan({barcode:p.id,salesperson:p.user||p.salesperson||''}));
    }

    requireAuth_(p);
    if(action==='authCheck')return jsonp(e,{ok:true});
    if(action.indexOf('launch')===0)return jsonp(e,launchDispatch_(action,p));

    if(p.id||p.barcode){
      const data=storeScan({
        barcode:p.id||p.barcode||'',
        salesperson:p.user||p.salesperson||''
      });

      return jsonp(e,data);
    }

    let data;

    if(action==='ping')data={ok:true};
    else if(action==='customerLineChatData')data=customerLineChatData();
    else if(action==='saveLineChatContact')data=saveLineChatContact(p);
    else if(action==='bindCustomerLineChat')data=bindCustomerLineChat(p);
    else if(action==='lineChatCustomers')data=lineChatCustomers();
    else if(action==='getCustomerLineChat')data=getCustomerLineChat(p);
    else if(action==='saveCustomerLineChat')data=saveCustomerLineChat(p);
    else if(action==='online')data=onlineResponse(p);
    else if(action==='onlineCustomer')data=getOnlineCustomer(p);
    else if(action==='onlineCargo')data=getOnlineCargo(p);
    else if(action==='group')data=getGroup(p);
    else if(action==='saveOnlinePayment')data=saveOnlinePayment(p);
    else if(action==='setOnlineFaceToFace')data=setOnlineFaceToFace(p);
    else if(action==='setOnlineStar')data=setOnlineStar(p);
    else if(action==='setOnlineReconciled')data=setOnlineReconciled(p);
    else if(action==='setOnlineOpened')data=setOnlineOpened(p);
    else if(action==='setOnlineItemBadge')data=setOnlineItemBadge(p);
    else if(action==='purchaseRestock')data=purchaseRestock(p);
    else if(action==='addOnlineOrder')data=addOnlineOrder(p);
    else if(action==='appendOnlineOrder')data=appendOnlineOrder(p);
    else if(action==='editOnlineOrder')data=editOnlineOrder(p);
    else if(action==='deleteOnlineOrder')data=deleteOnlineOrder(p);
    else if(action==='renameOnlineCustomer')data=renameOnlineCustomer(p);

    else if(action==='storeSales')data=getStoreSales();
    else if(action==='updateStoreSaleNote')data=updateStoreSaleNote(p);
    else if(action==='updateStoreSalePayment')data=updateStoreSalePayment(p);
    else if(action==='addStoreSale')data=addStoreSale(p);
    else if(action==='storeProduct')data=getStoreProduct(p);
    else if(action==='purchaseChannels')data=purchaseChannels_();
    else if(action==='purchaseOrders')data=purchaseOrders_();
    else if(action==='purchaseMatch')data=purchaseMatch_(p);
    else if(action==='purchaseSave')data=purchaseSave_(p);
    else if(action==='purchaseSync')data=purchaseSync_(p);
    else if(action==='purchaseImage')data=purchaseImage_(p);
    else if(action==='purchaseEdit')data=purchaseEdit_(p);
    else if(action==='inventory')data=inventoryResponse(p);
    else if(action==='setInventoryPrice')data=setInventoryPrice(p);
    else if(action==='updateInventoryProduct')data=updateInventoryProduct(p);
    else if(action==='deleteInventoryProduct')data=deleteInventoryProduct(p);
    else if(action==='setInventoryStock')data=setInventoryStock(p);
    else if(action==='setInventoryStore')data=setInventoryStore(p);
    else if(action==='setInventoryImage')data=setInventoryImage(p);
    else if(action==='reorderInventory')data=reorderInventory(p);
    else if(action==='addInventoryProduct')data=addInventoryProduct(p);
    else if(action==='checkInventoryAvailability')data=checkInventoryAvailability(p);
    else if(action==='storeScan')data=storeScan(p);
    else if(action==='storeCart')data=getStoreTempCart(p);
    else if(action==='storeActiveSalesperson')data=getStoreActiveSalesperson();
    else if(action==='storeCartSet')data=setStoreTempCart(p);
    else if(action==='storeCartClear')data=clearStoreTempCart(p);
    else if(action==='storeCheckout')data=storeCheckout(p);

    else if(action==='ship')data=getShip();
    else if(action==='createShip')data=createShip(p);
    else if(action==='setShip')data=setShip(p);
    else if(action==='setShipPacked')data=setShipPacked(p);
    else if(action==='deleteShipOrder')data=deleteShipOrder(p);

    else throw new Error('未知 action：'+action);

    return jsonp(e,data);

  }catch(err){
    return jsonp(e,{
      ok:false,
      error:String(err.message||err)
    });
  }
}


function doPost(e){
  try{
    const p=(e&&e.parameter)?e.parameter:{};
    let body={};

    if(e&&e.postData&&e.postData.contents){
      try{
        body=JSON.parse(e.postData.contents);
      }catch(_){}
    }

    const data=Object.assign({},p,body);

    const action=data.action||'ping';
    if(action==='authWarmup'){
      return ContentService.createTextOutput(JSON.stringify({ok:true,configured:!!authSecret_()}))
        .setMimeType(ContentService.MimeType.JSON);
    }
    if(action==='authLogin'){
      return ContentService.createTextOutput(JSON.stringify(authLogin(data)))
        .setMimeType(ContentService.MimeType.JSON);
    }
    if(action==='publicGroupWork'){
      return ContentService.createTextOutput(JSON.stringify(publicGroupWork_()))
        .setMimeType(ContentService.MimeType.JSON);
    }
    requireAuth_(data);
    if(action==='authCheck'){
      return ContentService.createTextOutput(JSON.stringify({ok:true}))
        .setMimeType(ContentService.MimeType.JSON);
    }
    if(action.indexOf('launch')===0)return ContentService.createTextOutput(JSON.stringify(launchDispatch_(action,data))).setMimeType(ContentService.MimeType.JSON);
    let result;

    if(action==='ping')result={ok:true};
    else if(action==='customerLineChatData')result=customerLineChatData();
    else if(action==='saveLineChatContact')result=saveLineChatContact(data);
    else if(action==='bindCustomerLineChat')result=bindCustomerLineChat(data);
    else if(action==='lineChatCustomers')result=lineChatCustomers();
    else if(action==='getCustomerLineChat')result=getCustomerLineChat(data);
    else if(action==='saveCustomerLineChat')result=saveCustomerLineChat(data);
    else if(action==='online')result=onlineResponse(data);
    else if(action==='onlineCustomer')result=getOnlineCustomer(data);
    else if(action==='onlineCargo')result=getOnlineCargo(data);
    else if(action==='group')result=getGroup(data);
    else if(action==='saveOnlinePayment')result=saveOnlinePayment(data);
    else if(action==='setOnlineFaceToFace')result=setOnlineFaceToFace(data);
    else if(action==='setOnlineStar')result=setOnlineStar(data);
    else if(action==='setOnlineReconciled')result=setOnlineReconciled(data);
    else if(action==='setOnlineOpened')result=setOnlineOpened(data);
    else if(action==='setOnlineItemBadge')result=setOnlineItemBadge(data);
    else if(action==='purchaseRestock')result=purchaseRestock(data);
    else if(action==='addOnlineOrder')result=addOnlineOrder(data);
    else if(action==='editOnlineOrder')result=editOnlineOrder(data);
    else if(action==='deleteOnlineOrder')result=deleteOnlineOrder(data);
    else if(action==='renameOnlineCustomer')result=renameOnlineCustomer(data);

    else if(action==='storeSales')result=getStoreSales();
    else if(action==='updateStoreSaleNote')result=updateStoreSaleNote(data);
    else if(action==='updateStoreSalePayment')result=updateStoreSalePayment(data);
    else if(action==='addStoreSale')result=addStoreSale(data);
    else if(action==='storeProduct')result=getStoreProduct(data);
    else if(action==='purchaseChannels')result=purchaseChannels_();
    else if(action==='purchaseOrders')result=purchaseOrders_();
    else if(action==='purchaseMatch')result=purchaseMatch_(data);
    else if(action==='purchaseSave')result=purchaseSave_(data);
    else if(action==='purchaseSync')result=purchaseSync_(data);
    else if(action==='purchaseImage')result=purchaseImage_(data);
    else if(action==='purchaseEdit')result=purchaseEdit_(data);
    else if(action==='inventory')result=inventoryResponse(data);
    else if(action==='setInventoryPrice')result=setInventoryPrice(data);
    else if(action==='updateInventoryProduct')result=updateInventoryProduct(data);
    else if(action==='setInventoryStock')result=setInventoryStock(data);
    else if(action==='setInventoryStore')result=setInventoryStore(data);
    else if(action==='setInventoryImage')result=setInventoryImage(data);
    else if(action==='reorderInventory')result=reorderInventory(data);
    else if(action==='addInventoryProduct')result=addInventoryProduct(data);
    else if(action==='checkInventoryAvailability')result=checkInventoryAvailability(data);
    else if(action==='storeScan')result=storeScan(data);
    else if(action==='storeCart')result=getStoreTempCart(data);
    else if(action==='storeActiveSalesperson')result=getStoreActiveSalesperson();
    else if(action==='storeCartSet')result=setStoreTempCart(data);
    else if(action==='storeCartClear')result=clearStoreTempCart(data);
    else if(action==='storeCheckout')result=storeCheckout(data);

    else if(action==='ship')result=getShip();
    else if(action==='createShip')result=createShip(data);
    else if(action==='setShip')result=setShip(data);
    else if(action==='setShipPacked')result=setShipPacked(data);
    else if(action==='deleteShipOrder')result=deleteShipOrder(data);

    else throw new Error('未知 action：'+action);

    return ContentService
      .createTextOutput(JSON.stringify(result))
      .setMimeType(ContentService.MimeType.JSON);

  }catch(err){
    return ContentService
      .createTextOutput(JSON.stringify({
        ok:false,
        error:String(err.message||err)
      }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function jsonp(e,data){
  const p=(e&&e.parameter)?e.parameter:{};
  const isScan=!!(p.id||p.barcode||p.action==='storeScan');
  if(p.format==='text'&&isScan){
    const message=data.ok===false
      ?'❌'+String(data.error||'掃描失敗')
      :String(data.message||'掃描完成');
    return ContentService
      .createTextOutput(message)
      .setMimeType(ContentService.MimeType.TEXT);
  }
  const cb=e&&e.parameter&&e.parameter.callback;
  const json=JSON.stringify(data);

  if(cb){
    return ContentService
      .createTextOutput(cb+'('+json+')')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }

  return ContentService
    .createTextOutput(json)
    .setMimeType(ContentService.MimeType.JSON);
}

function ss(){
  return SpreadsheetApp.openById(SS_ID);
}

function sh(name){
  const s=ss().getSheetByName(name);
  if(!s)throw new Error('找不到分頁：'+name);
  return s;
}

function values(name,rawOnly=false){
  const s=sh(name);
  const r=s.getDataRange().getValues();

  if(!r.length){
    return {
      sheet:s,
      headers:[],
      rows:[],
      formats:[]
    };
  }

  const formats=rawOnly?[]:s.getDataRange().getNumberFormats();
  const displays=rawOnly?[]:s.getDataRange().getDisplayValues();

  return {
    sheet:s,
    headers:r[0].map(x=>String(x).trim()),
    rows:r.slice(1),
    formats:formats.slice(1),
    displays:displays.slice(1)
  };
}

function norm(v){
  return String(v==null?'':v).trim();
}

function num(v){
  if(typeof v==='number')return v;
  const n=parseFloat(String(v).replace(/[^\d.-]/g,''));
  return isNaN(n)?0:n;
}

function col(headers,names){
  for(const n of names){
    const i=headers.findIndex(x=>x===n);
    if(i>=0)return i;
  }
  return -1;
}

function rowObj(headers,row){
  const o={};
  headers.forEach((h,i)=>o[h]=row[i]);
  return o;
}

function truthy(v){
  if(v===true)return true;

  const x=norm(v).toLowerCase();

  return [
    'true',
    '1',
    'y',
    'yes',
    '是',
    '已',
    '已訂購',
    '已出貨',
    '已開單'
  ].includes(x);
}

/* =========================================================
   線上資料
========================================================= */

function formatOnlineTimeBatch(raw,format){
  if(raw===''||raw==null)return '';

  if(Object.prototype.toString.call(raw)==='[object Date]'&&!isNaN(raw.getTime())){
    return Utilities.formatDate(
      raw,
      'Asia/Taipei',
      'MM/dd'
    );
  }

  const s=norm(raw);

  let m=s.match(/(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})/);
  if(m){
    return String(m[2]).padStart(2,'0')+'/'+
           String(m[3]).padStart(2,'0');
  }

  m=s.match(/(\d{1,2})[-\/](\d{1,2})/);
  if(m){
    return String(m[1]).padStart(2,'0')+'/'+
           String(m[2]).padStart(2,'0');
  }

  return s;
}

function normalizeCargo(v){
  const x=norm(v);

  if(!x)return '';

  if(
    x==='補貨登記'||
    x==='SOLD OUT'||
    x==='S☹LD OUT'||
    x==='補登'
  )return '補貨登記';

  if(/^\d{1,2}月$/.test(x))return '受注';
  if(x==='現貨')return '現貨';
  if(x==='已訂購')return '已訂購';

  return x;
}

/* 只合併指定的新進列，不重整已存在的線上訂單。 */
function mergeOnlineOrderRows(firstDataRow,lastDataRow){
  const sheet=ss().getSheetByName(ONLINE);
  if(!sheet||lastDataRow<=firstDataRow)return false;
  const lastCol=sheet.getLastColumn();
  const headers=sheet.getRange(1,1,1,lastCol).getValues()[0].map(norm);
  const customeri=col(headers,['顧客名稱','客戶名稱','客人名稱','姓名']);
  const timei=col(headers,['購買時間','時間']);
  const targetCols=[
    col(headers,['訂金']),
    col(headers,['後五碼','匯款後五碼']),
    col(headers,['對帳','已對帳']),
    col(headers,['備註','備註欄'])
  ].filter((value,index,array)=>value>=0&&array.indexOf(value)===index);
  if(customeri<0||timei<0||targetCols.length<2)return false;

  const count=lastDataRow-firstDataRow+1;
  const rows=sheet.getRange(firstDataRow,1,count,lastCol).getValues();
  const groups=[];
  const orderTimeKey=value=>value instanceof Date&&!isNaN(value.getTime())
    ?'date:'+value.getTime():'text:'+norm(value);
  let start=0,activeKey='';
  for(let i=0;i<=rows.length;i++){
    const row=i<rows.length?rows[i]:null;
    const customer=row?norm(row[customeri]):'';
    const time=row?orderTimeKey(row[timei]):'';
    const key=customer&&time!=='text:'?customer+'\\u0000'+time:'';
    if(key&&key===activeKey)continue;
    if(activeKey&&i-start>1)groups.push({first:firstDataRow+start,last:firstDataRow+i-1});
    start=i;activeKey=key;
  }
  let changed=false;
  const reconcilei=col(headers,['對帳','已對帳']);
  const notei=col(headers,['備註','備註欄']);
  groups.forEach(group=>{
    const groupSize=group.last-group.first+1;
    targetCols.forEach(index=>{
      const range=sheet.getRange(group.first,index+1,groupSize,1);
      if(range.isPartOfMerge())return;
      const values=range.getValues().map(row=>row[0]);
      let value='';
      if(index===reconcilei)value=values.some(truthy);
      else if(index===notei)value=[...new Set(values.map(norm).filter(Boolean))].join('｜');
      else value=values.find(item=>item!==''&&item!=null)??'';
      range.getCell(1,1).setValue(value);
      range.offset(1,0,groupSize-1,1).clearContent();
      range.mergeVertically();
      changed=true;
    });
  });
  return changed;
}

/* 外部 LINE 接單寫入不會觸發一般 onEdit，游標只處理安裝後新增的列。 */
function processOnlineOrderFieldMerges(){
  const sheet=ss().getSheetByName(ONLINE);
  if(!sheet)return;
  const properties=PropertiesService.getScriptProperties();
  const cursorKey='JIWU_ONLINE_ORDER_MERGE_CURSOR';
  const cursorValue=properties.getProperty(cursorKey);
  if(cursorValue==null){
    properties.setProperty(cursorKey,String(sheet.getLastRow()));
    return;
  }
  const cursor=Number(cursorValue)||1;
  const lastRow=sheet.getLastRow();
  if(lastRow<=cursor)return;
  const firstNewRow=cursor+1;
  const lastCol=sheet.getLastColumn();
  const headers=sheet.getRange(1,1,1,lastCol).getValues()[0].map(norm);
  const customeri=col(headers,['顧客名稱','客戶名稱','客人名稱','姓名']);
  const timei=col(headers,['購買時間','時間']);
  if(customeri<0||timei<0)return;
  const added=sheet.getRange(firstNewRow,1,lastRow-cursor,lastCol).getValues();
  const keyFor=row=>{
    const customer=norm(row[customeri]);
    const time=row[timei];
    const timeKey=time instanceof Date&&!isNaN(time.getTime())?'date:'+time.getTime():'text:'+norm(time);
    return customer&&timeKey!=='text:'?customer+'\\u0000'+timeKey:'';
  };
  const groups=[];
  let start=0,activeKey='';
  for(let i=0;i<=added.length;i++){
    const key=i<added.length?keyFor(added[i]):'';
    if(key&&key===activeKey)continue;
    groups.push({first:firstNewRow+start,last:firstNewRow+i-1,key:activeKey});
    start=i;activeKey=key;
  }
  const lastGroup=groups[groups.length-1];
  // 暫留最後一個單商品群組，等 LINE 同一則訊息的下一個商品列寫入後再合併。
  const processThrough=lastGroup&&lastGroup.key&&lastGroup.first===lastGroup.last
    ?lastGroup.first-1:lastRow;
  if(processThrough<firstNewRow)return;
  const changed=mergeOnlineOrderRows(firstNewRow,processThrough);
  properties.setProperty(cursorKey,String(processThrough));
  if(changed)clearOnlineCache();
  // 安裝的分鐘觸發器同時登記新團，毋須等後台再次開啟線上銷售頁面。
  try{syncOnlineGroupsShipping_(buildOnlineData());}catch(err){console.warn('團務表自動登記失敗：'+err);}
}

/* 部署後執行一次；游標從當前最後一列開始，舊訂單不會被重整。 */
function installOnlineOrderFieldMergeTrigger(){
  const sheet=ss().getSheetByName(ONLINE);
  if(!sheet)throw new Error('找不到線上銷售工作表');
  const properties=PropertiesService.getScriptProperties();
  const cursorKey='JIWU_ONLINE_ORDER_MERGE_CURSOR';
  if(properties.getProperty(cursorKey)==null){
    properties.setProperty(cursorKey,String(sheet.getLastRow()));
  }
  ScriptApp.getProjectTriggers()
    .filter(trigger=>trigger.getHandlerFunction()==='processOnlineOrderFieldMerges')
    .forEach(trigger=>ScriptApp.deleteTrigger(trigger));
  ScriptApp.newTrigger('processOnlineOrderFieldMerges').timeBased().everyMinutes(1).create();
  return {ok:true,message:'已啟用新進線上訂單欄位合併；既有資料不會修改'};
}

function buildOnlineData(){
  const d=values(ONLINE,true);
  const timei=col(d.headers,['購買時間','時間']);
  const cargoi=col(d.headers,['貨況','狀態']);
  const orderi=col(d.headers,['已訂購','購買']);
  const last5i=col(d.headers,['後五碼','匯款後五碼']);
  const depositi=col(d.headers,['訂金']);
  const notei=col(d.headers,['備註','備註欄']);
  const reconcilei=col(d.headers,['對帳','已對帳']);
  const mergedLast5=new Map();
  const mergedNotes=new Map();
  const mergedReconciled=new Map();
  const depositMergeKeys=new Map();
  const orderMergeKeys=new Map();
  if(last5i>=0&&d.rows.length){
    const mergedRanges=d.sheet.getRange(2,last5i+1,d.rows.length,1).getMergedRanges();
    mergedRanges.forEach(range=>{
      const first=range.getRow();
      const last=first+range.getNumRows()-1;
      const value=d.rows[first-2]?d.rows[first-2][last5i]:'';
      for(let row=Math.max(2,first);row<=Math.min(last,d.rows.length+1);row++){
        mergedLast5.set(row,value);
      }
    });
  }

  if(notei>=0&&d.rows.length){
    const mergedRanges=d.sheet.getRange(2,notei+1,d.rows.length,1).getMergedRanges();
    mergedRanges.forEach(range=>{
      const first=range.getRow();
      const last=first+range.getNumRows()-1;
      const value=d.rows[first-2]?d.rows[first-2][notei]:'';
      for(let row=Math.max(2,first);row<=Math.min(last,d.rows.length+1);row++){
        mergedNotes.set(row,value);
      }
    });
  }

  if(reconcilei>=0&&d.rows.length){
    const mergedRanges=d.sheet.getRange(2,reconcilei+1,d.rows.length,1).getMergedRanges();
    mergedRanges.forEach(range=>{
      const first=range.getRow();
      const last=first+range.getNumRows()-1;
      const value=d.rows[first-2]?d.rows[first-2][reconcilei]:false;
      for(let row=Math.max(2,first);row<=Math.min(last,d.rows.length+1);row++){
        mergedReconciled.set(row,value);
      }
    });
  }

  if(depositi>=0&&d.rows.length){
    const mergedRanges=d.sheet.getRange(2,depositi+1,d.rows.length,1).getMergedRanges();
    mergedRanges.forEach(range=>{
      if(range.getNumRows()<2)return;
      const first=range.getRow();
      const last=first+range.getNumRows()-1;
      const key='deposit-'+first;
      for(let row=Math.max(2,first);row<=Math.min(last,d.rows.length+1);row++){
        depositMergeKeys.set(row,key);
      }
    });
  }

  if(reconcilei>=0&&d.rows.length){
    const mergedRanges=d.sheet.getRange(2,reconcilei+1,d.rows.length,1).getMergedRanges();
    mergedRanges.forEach(range=>{
      if(range.getNumRows()<2)return;
      const first=range.getRow();
      const last=first+range.getNumRows()-1;
      const key='order-'+first;
      for(let row=Math.max(2,first);row<=Math.min(last,d.rows.length+1);row++){
        orderMergeKeys.set(row,key);
      }
    });
  }

  const rows=d.rows.map((r,i)=>{
    const data=rowObj(d.headers,r);
    const sheetRow=i+2;
    if(last5i>=0&&mergedLast5.has(sheetRow)){
      data[d.headers[last5i]]=mergedLast5.get(sheetRow);
    }
    if(notei>=0&&mergedNotes.has(sheetRow)){
      data[d.headers[notei]]=mergedNotes.get(sheetRow);
    }
    if(reconcilei>=0&&mergedReconciled.has(sheetRow)){
      data[d.headers[reconcilei]]=mergedReconciled.get(sheetRow);
    }

    if(timei>=0){
      data[d.headers[timei]]=formatOnlineTimeBatch(
        r[timei],
        d.formats[i]&&d.formats[i][timei]
          ?d.formats[i][timei]
          :''
      );
    }

    if(cargoi>=0){
      data[d.headers[cargoi]]=norm(r[cargoi]);
    }

    if(
      orderi>=0&&
      truthy(r[orderi])&&
      cargoi>=0&&
      !norm(r[cargoi])
    ){
      data[d.headers[cargoi]]='預訂';
      const statusi=col(d.headers,['狀態','訂購狀態']);if(statusi>=0&&!norm(data[d.headers[statusi]]))data[d.headers[statusi]]='已訂購';
    }

    return {
      row:i+2,
      data,
      depositMergeKey:depositMergeKeys.get(i+2)||'',
      orderMergeKey:orderMergeKeys.get(i+2)||depositMergeKeys.get(i+2)||''
    };
  });

  return {
    ok:true,
    headers:d.headers,
    rows:rows
  };
}

function clearOnlineCache(){
  const cache=CacheService.getScriptCache();
  cache.remove(CACHE_KEY);
  cache.remove(ONLINE_GROUP_SYNC_CACHE_KEY);
}

/* 將訂單卡上的付款資訊回寫到「線上銷售」。 */
function saveOnlinePayment(p){
  const rows=JSON.parse(p.rows||'[]')
    .map(Number)
    .filter(x=>x>=2);

  if(!rows.length){
    throw new Error('缺少線上銷售列');
  }

  const payment=norm(p.payment);
  const code=String(p.last5==null?'':p.last5).trim();
  const deposit=norm(p.deposit);
  const appendPayment=String(p.append||'').toLowerCase()==='true';
  const d=values(ONLINE);
  const paymenti=col(d.headers,['付款方式','支付方式','付款','收款方式']);
  const last5i=col(d.headers,['後五碼','匯款後五碼']);
  const depositi=col(d.headers,['訂金']);
  const notei=col(d.headers,['備註','備註欄']);
  if(payment!=='面交'&&last5i<0){
    throw new Error('線上銷售找不到「後五碼」欄位');
  }

  let last5Value=payment;
  if(payment==='中信')last5Value='中信'+code;
  if(payment==='LB')last5Value='LB '+code;

  const mergedAnchorsByColumn=new Map();
  [last5i,depositi,notei].filter(index=>index>=0).forEach(index=>{
    const anchors=new Map();
    const dataRows=d.sheet.getLastRow()-1;
    if(dataRows>0){
      d.sheet.getRange(2,index+1,dataRows,1).getMergedRanges().forEach(range=>{
        const first=range.getRow();
        const last=first+range.getNumRows()-1;
        for(let row=first;row<=last;row++)anchors.set(row,first);
      });
    }
    mergedAnchorsByColumn.set(index,anchors);
  });
  const uniqueRowsForColumn=index=>[...new Set(rows.map(row=>(mergedAnchorsByColumn.get(index)||new Map()).get(row)||row))];
  rows.forEach(row=>{
    if(paymenti>=0)d.sheet.getRange(row,paymenti+1).setValue(payment);
  });
  if(payment==='面交'){
    if(notei>=0)uniqueRowsForColumn(notei).forEach(row=>d.sheet.getRange(row,notei+1).setValue('面交'));
  }else if(appendPayment){
    uniqueRowsForColumn(last5i).forEach(row=>{
      const cell=d.sheet.getRange(row,last5i+1),existing=norm(cell.getDisplayValue());
      cell.setValue(existing?existing+'\n'+last5Value:last5Value);
    });
  }else{
    uniqueRowsForColumn(last5i).forEach(row=>d.sheet.getRange(row,last5i+1).setValue(last5Value));
  }
  if(deposit!==''&&depositi>=0){
    uniqueRowsForColumn(depositi).forEach(row=>{
      const cell=d.sheet.getRange(row,depositi+1),existing=norm(cell.getDisplayValue());
      cell.setValue(appendPayment&&existing?existing+'\n'+num(deposit):num(deposit));
    });
  }

  clearOnlineCache();

  return {ok:true,count:rows.length};
}

function normalizeManualOrderDate(value){
const text=String(value||'').trim().replace(/[０-９]/g,c=>String.fromCharCode(c.charCodeAt(0)-65248));
const match=text.match(/^(\d{1,2})\/(\d{1,2})$/)||text.match(/^(\d{2})(\d{2})$/);
if(!match)throw new Error('日期請輸入 3/3 或 0303');
const month=Number(match[1]),day=Number(match[2]);
if(month<1||month>12||day<1||day>[31,29,31,30,31,30,31,31,30,31,30,31][month-1])throw new Error('請輸入有效的月／日');
return month+'/'+day;
}
function addOnlineOrder(p){
  const customer=norm(p.customer),source=norm(p.source)||'LINE';
  let items=[];try{items=JSON.parse(p.items||'[]');}catch(_){}
  if(!customer||!items.length)throw new Error('請填寫顧客與商品');
  items=items.map(item=>{const cargo=norm(item.cargo)||'未訂購';if(!['未訂購','已訂購','補貨登記','現貨'].includes(cargo))throw new Error('商品貨況無效');return Object.assign({},item,{cargo});});
  const sheet=sh(ONLINE);
  const headers=sheet.getRange(1,1,1,sheet.getLastColumn()).getDisplayValues()[0].map(norm);
  const start=sheet.getLastRow()+1,now=new Date(),payment=norm(p.payment),code=String(p.last5||'').trim(),deposit=norm(p.deposit);
  const hasOrderDate=norm(p.orderDate)!=='';
  const orderDate=hasOrderDate?normalizeManualOrderDate(p.orderDate):now;
  if(payment==='面交'&&col(headers,['備註','備註欄'])<0){
    sheet.getRange(1,headers.length+1).setValue('備註');
    headers.push('備註');
  }
  const last5=payment==='面交'?'':payment==='中信'?'中信'+code:payment==='LB'?'LB '+code:payment;
  const rows=items.map(item=>{const row=new Array(headers.length).fill('');const put=(names,value)=>{const i=col(headers,names);if(i>=0)row[i]=value;};put(['來源','通路','平台'],source);put(['顧客名稱','客戶名稱','客人名稱','姓名'],customer);put(['名稱','商品名稱','品名','商品'],norm(item.name));put(['售價','價格'],num(item.price));put(['購買時間','時間'],orderDate);put(['貨況'],item.cargo==='現貨'?'現貨':item.cargo==='補貨登記'?'補登':'預訂');put(['狀態','訂購狀態'],item.cargo==='已訂購'?'已訂購':item.cargo==='未訂購'?'未訂購':'');put(['已訂購','購買','訂購'],item.cargo==='已訂購'?true:'');put(['付款方式','支付方式','付款','收款方式'],payment);put(['後五碼','匯款後五碼'],last5);put(['訂金'],item.deposit==null?(deposit===''?'':num(deposit)):(norm(item.deposit)===''?'':num(item.deposit)));if(payment==='面交')put(['備註','備註欄'],'面交');return row;});
  const dateCol=col(headers,['購買時間','時間']);
  if(dateCol>=0)sheet.getRange(start,dateCol+1,rows.length,1).setNumberFormat(hasOrderDate?'@':'M/d HH:mm');
  sheet.getRange(start,1,rows.length,headers.length).setValues(rows);
  if(items.some(item=>item.cargo==='現貨'))syncOnlineStock_(sheet,items.flatMap((item,i)=>item.cargo==='現貨'?[start+i]:[]),false);
  [['後五碼','匯款後五碼'],...(items.some(item=>item.deposit!=null)?[]:[['訂金']]),['備註','備註欄']].forEach(names=>{const i=col(headers,names);if(i>=0&&rows.length>1)sheet.getRange(start,i+1,rows.length,1).mergeVertically();});
  clearOnlineCache();
  return {ok:true,count:rows.length};
}

/* 在既有訂單卡內加入商品或備註；新增的商品沿用原訂單資訊與下單時間。 */
function appendOnlineOrder(p){
  const requestedRows=[...new Set(JSON.parse(p.rows||'[]').map(Number).filter(row=>Number.isInteger(row)&&row>=2))].sort((a,b)=>a-b);
  let items=[];try{items=JSON.parse(p.items||'[]');}catch(_){}
  items=items.map(item=>({name:norm(item.name),price:num(item.price)})).filter(item=>item.name);
  const note=norm(p.note);
  if(!requestedRows.length)throw new Error('缺少原訂單資料');
  if(!items.length&&!note)throw new Error('請輸入商品或備註');

  const lock=LockService.getScriptLock();
  lock.waitLock(20000);
  try{
    const d=values(ONLINE,true),sheet=d.sheet,headers=d.headers;
    const lastRow=sheet.getLastRow();
    const rows=requestedRows.filter(row=>row<=lastRow);
    if(!rows.length)throw new Error('找不到原訂單資料');
    const first=rows[0],last=rows[rows.length-1];
    const template=d.rows[first-2]||[];
    const sourcei=col(headers,['來源','通路','平台']);
    const customeri=col(headers,['顧客名稱','客戶名稱','客人名稱','姓名']);
    const groupi=col(headers,['團名','團組','團']);
    const timei=col(headers,['購買時間','時間']);
    const cargoi=col(headers,['貨況','狀態']);
    const paymenti=col(headers,['付款方式','支付方式','付款','收款方式']);
    const last5i=col(headers,['後五碼','匯款後五碼']);
    const depositi=col(headers,['訂金']);
    const remittanceTimei=col(headers,['匯款時間','付款時間']);
    const notei=col(headers,['備註','備註欄']);
    const reconcilei=col(headers,['對帳','已對帳']);
    const namei=col(headers,['名稱','商品名稱','品名','商品']);
    const pricei=col(headers,['售價','價格']);
    const originalNote=notei>=0?norm(template[notei]):'';

    if(items.length){
      sheet.insertRowsAfter(last,items.length);
      const newRows=items.map(item=>{
        const row=new Array(headers.length).fill('');
        [sourcei,customeri,groupi,timei,cargoi,paymenti].filter(index=>index>=0).forEach(index=>row[index]=template[index]);
        if(namei>=0)row[namei]=item.name;
        if(pricei>=0)row[pricei]=item.price;
        return row;
      });
      sheet.getRange(last+1,1,newRows.length,headers.length).setValues(newRows);

      /* 合併共用的付款／備註欄，讓前端持續視為同一張訂單。 */
      [last5i,depositi,remittanceTimei,reconcilei,notei].filter(index=>index>=0).forEach(index=>{
        const range=sheet.getRange(first,index+1,last-first+1+items.length,1);
        const value=template[index];
        range.breakApart();
        range.getCell(1,1).setValue(value==null?'':value);
        if(range.getNumRows()>1)range.mergeVertically();
      });
    }

    if(note&&notei>=0){
      const noteCell=sheet.getRange(first,notei+1);
      const current=norm(noteCell.getValue())||originalNote;
      noteCell.setValue(current?(current+'｜'+note):note);
    }
    clearOnlineCache();
    return {ok:true,count:items.length,note:!!note};
  }finally{lock.releaseLock();}
}

/* 編輯既有訂單的商品與備註，並可在同一張訂單尾端新增商品。 */
/* Preserve shared payment fields before removing order rows. */
function syncOnlineStock_(sheet,rows,restore){
 if(sheet.getName()!=='線上銷售'||!rows.length)return;
 const lock=LockService.getScriptLock(),owned=!lock.hasLock();if(owned)lock.waitLock(20000);
 try{
 const clean=v=>String(v==null?'':v).trim(),headers=sheet.getRange(1,1,1,sheet.getLastColumn()).getDisplayValues()[0].map(clean);
 const find=(h,names)=>names.map(n=>h.indexOf(n)).find(i=>i>=0);
 let flag=headers.indexOf('扣庫存');if(flag<0){if(restore)return;flag=headers.length;sheet.getRange(1,flag+1).setValue('扣庫存');headers.push('扣庫存');}
 const stock=sheet.getParent().getSheetByName('商品庫存');if(!stock||stock.getLastRow()<2)return;
 const data=stock.getDataRange().getValues(),h=data[0].map(clean),si=find(h,['庫存','總庫存','數量','庫存量']),ci=find(h,['貨號','商品貨號','SN']),ni=find(h,['名稱','商品名稱','品名']),ri=h.indexOf('角色');if(si==null)return;
 const oc=find(headers,['貨號','商品貨號','SN']),on=find(headers,['名稱','商品名稱','品名']),cg=headers.indexOf('貨況'),qi=find(headers,['數量','購買數量']);
 const changes=new Map(),marks=[];
 [...new Set(rows)].forEach(row=>{
 const values=sheet.getRange(row,1,1,headers.length).getValues()[0],marked=values[flag]===true||clean(values[flag]).toLowerCase()==='true';
 if(cg<0||clean(values[cg])!=='現貨'||(restore?!marked:marked))return;
 const code=oc==null?'':clean(values[oc]),name=on==null?'':clean(values[on]);
 const matches=data.slice(1).map((v,i)=>({v,row:i+2})).filter(x=>code?ci!=null&&clean(x.v[ci])===code:ni!=null&&[clean(x.v[ni]),[clean(x.v[ni]),ri>=0?clean(x.v[ri]):''].filter(Boolean).join(' ')].includes(name));
 // 沒有庫存對應的手動商品可直接刪除；唯一對應且曾扣庫存才補回數量。
 if(!matches.length)return;
 if(matches.length!==1)throw new Error('現貨商品無法唯一比對庫存：'+(code||name));
 const item=matches[0],raw=clean(item.v[si]);if(!/^\d+$/.test(raw))throw new Error('現貨商品庫存不是數字：'+(code||name));
 const qty=qi==null||clean(values[qi])===''?1:Number(values[qi]);if(!Number.isInteger(qty)||qty<1)throw new Error('現貨數量無效');
 const current=changes.has(item.row)?changes.get(item.row):Number(raw),next=current+(restore?qty:-qty);if(next<0)throw new Error('現貨庫存不足：'+(code||name));changes.set(item.row,next);marks.push(row);
 });
 changes.forEach((value,row)=>stock.getRange(row,si+1).setValue(value));marks.forEach(row=>sheet.getRange(row,flag+1).insertCheckboxes().setValue(!restore));SpreadsheetApp.flush();
 }finally{if(owned)lock.releaseLock();}
}

function clearOnlineOrderRows_(sheet,rows){
  if(!rows.length)return;
  syncOnlineStock_(sheet,rows,true);
  const removed=new Set(rows),merged=new Map();
  rows.forEach(row=>sheet.getRange(row,1,1,sheet.getLastColumn()).getMergedRanges().forEach(range=>merged.set(range.getA1Notation(),range)));
  merged.forEach(range=>{
    const value=range.getCell(1,1).getValue(),first=range.getRow(),count=range.getNumRows(),column=range.getColumn();
    range.breakApart();range.clearContent();
    let start=null;
    for(let row=first;row<=first+count;row++){
      if(row<first+count&&!removed.has(row)){if(start===null)start=row;}
      else if(start!==null){const keep=sheet.getRange(start,column,row-start,range.getNumColumns());keep.getCell(1,1).setValue(value);if(row-start>1)keep.mergeVertically();start=null;}
    }
  });
  rows.slice().sort((a,b)=>b-a).forEach(row=>sheet.deleteRow(row));
}
function deleteOnlineOrder(p){
  const rows=[...new Set(JSON.parse(p.rows||'[]').map(Number))];
  if(!rows.length||rows.some(row=>!Number.isInteger(row)||row<2))throw new Error('訂單列號無效');
  const lock=LockService.getScriptLock();lock.waitLock(20000);
  try{const sheet=sh(ONLINE);if(rows.some(row=>row>sheet.getLastRow()))throw new Error('訂單資料已變更，請重新整理');clearOnlineOrderRows_(sheet,rows);clearOnlineCache();SpreadsheetApp.flush();return {ok:true,deleted:rows.length,online:buildOnlineData()};}finally{lock.releaseLock();}
}

// 先解除完整的合併範圍，保留編輯區外的資料及合併，避免部分選取的 Sheets 錯誤。
function unmergeOnlineEditRange_(sheet,range){
  const start=range.getRow(),end=start+range.getNumRows()-1;
  range.getMergedRanges().forEach(merged=>{
    const first=merged.getRow(),last=first+merged.getNumRows()-1,column=merged.getColumn(),width=merged.getNumColumns();
    const anchor=merged.getCell(1,1),value=anchor.getFormula()||anchor.getValue();
    merged.breakApart();
    for(const [from,to] of [[first,Math.min(last,start-1)],[Math.max(first,end+1),last]]){
      if(from>to)continue;
      const keep=sheet.getRange(from,column,to-from+1,width);
      keep.getCell(1,1).setValue(value);
      if(to>from)keep.mergeVertically();
    }
  });
}
function allocateOrderEditDeposit(items,originalDeposits,originalFirstRow){
const amount=value=>String(value??'').replace(/,/g,'').split(/\r?\n/).reduce((sum,line)=>sum+(Number(line.trim())||0),0);
const first=items.find(item=>Number(item.row)===Number(originalFirstRow));
if(items.length<2||!first||first.deposit==null||String(first.deposit).trim()===''||amount(first.deposit)===amount(originalDeposits[0]))return;
const originalTotal=originalDeposits.reduce((sum,value)=>sum+amount(value),0);
const remaining=Math.round((originalTotal-items.reduce((sum,item)=>sum+amount(item.deposit),0))*100)/100;
if(remaining<=0)return;
const empty=items.find(item=>item!==first&&item.deposit!=null&&String(item.deposit).trim()==='');
if(!empty)throw new Error('剩餘訂金 $'+remaining+' 需要一個訂金空白的商品列');
empty.deposit=String(remaining);
}
function editOnlineOrder(p){
  const requestedRows=[...new Set(JSON.parse(p.rows||'[]').map(Number).filter(row=>Number.isInteger(row)&&row>=2))].sort((a,b)=>a-b);
  let items=[];try{items=JSON.parse(p.items||'[]');}catch(_){}
  items=items.map(item=>({row:Number(item.row)||0,name:norm(item.name),price:num(item.price),shipping:item.shipping===''||item.shipping==null?'':num(item.shipping),deposit:item.deposit==null?undefined:String(item.deposit)}));
  if(!requestedRows.length||!items.length)throw new Error('缺少訂單商品');

  const lock=LockService.getScriptLock();
  lock.waitLock(20000);
  try{
    const d=values(ONLINE,true),sheet=d.sheet,headers=d.headers;
    const rows=requestedRows.filter(row=>row<=sheet.getLastRow());
    if(rows.length!==requestedRows.length)throw new Error('找不到完整的原訂單資料');
    const first=rows[0],last=rows[rows.length-1];
    if(last-first+1!==rows.length&&items.some(item=>!item.row))throw new Error('此訂單含已刪除商品，請使用新增訂單加入商品');
    const existing=items.filter(item=>item.row);
    const additions=items.filter(item=>!item.row);
    const existingRows=[...new Set(existing.map(item=>item.row))].sort((a,b)=>a-b);
    if(existingRows.length!==existing.length||existingRows.some(row=>!rows.includes(row)))throw new Error('訂單商品資料已變更，請重新整理後再試');
    if(items.some(item=>!item.name))throw new Error('每項商品都需要名稱');

    const namei=col(headers,['名稱','商品名稱','品名','商品']);
    const pricei=col(headers,['售價','價格']);
    const shippingi=col(headers,['運費']);
    if(namei<0||pricei<0||shippingi<0)throw new Error('線上銷售找不到商品名稱、售價或運費欄位');
    const template=d.rows[first-2]||[];
    const sourcei=col(headers,['來源','通路','平台']);
    const customeri=col(headers,['顧客名稱','客戶名稱','客人名稱','姓名']);
    const groupi=col(headers,['團名','團組','團']);
    const timei=col(headers,['購買時間','時間']);
    const cargoi=col(headers,['貨況','狀態']);
    const paymenti=col(headers,['付款方式','支付方式','付款','收款方式']);
    const last5i=col(headers,['後五碼','匯款後五碼']);
    const depositi=col(headers,['訂金']);
    const notei=col(headers,['備註','備註欄']);
    const reconcilei=col(headers,['對帳','已對帳']);
    if(depositi>=0)allocateOrderEditDeposit(items,rows.map(row=>(d.rows[row-2]||[])[depositi]),first);
    const originalNote=notei>=0?norm(template[notei]):'';
    const faceToFace=originalNote.split('｜').some(part=>norm(part)==='面交');
    const customNote=norm(p.note).split('｜').map(norm).filter(part=>part&&part!=='面交').join('｜');
    const nextNote=faceToFace?(customNote?customNote+'｜面交':'面交'):customNote;

    unmergeOnlineEditRange_(sheet,sheet.getRange(first,shippingi+1,last-first+1,1));
    if(depositi>=0&&items.some(item=>item.deposit!==undefined))unmergeOnlineEditRange_(sheet,sheet.getRange(first,depositi+1,last-first+1,1));
    existing.forEach(item=>{
      if(depositi>=0&&item.deposit!==undefined)sheet.getRange(item.row,depositi+1).setValue(item.deposit);
      sheet.getRange(item.row,namei+1).setValue(item.name);
      sheet.getRange(item.row,pricei+1).setValue(item.price);
      sheet.getRange(item.row,shippingi+1).setValue(item.shipping);
    });

    if(additions.length){
      sheet.insertRowsAfter(last,additions.length);
      const newRows=additions.map(item=>{
        const row=new Array(headers.length).fill('');
        [sourcei,customeri,groupi,timei,cargoi,paymenti].filter(index=>index>=0).forEach(index=>row[index]=template[index]);
        row[namei]=item.name;
        row[pricei]=item.price;
        row[shippingi]=item.shipping;
        if(depositi>=0&&item.deposit!==undefined)row[depositi]=item.deposit;
        return row;
      });
      sheet.getRange(last+1,1,newRows.length,headers.length).setValues(newRows);
      [last5i,depositi,reconcilei,notei].filter(index=>index>=0&&(index!==depositi||!items.some(item=>item.deposit!==undefined))).forEach(index=>{
        const range=sheet.getRange(first,index+1,rows.length+additions.length,1);
        const value=index===notei?nextNote:template[index];
        unmergeOnlineEditRange_(sheet,range);
        range.getCell(1,1).setValue(value==null?'':value);
        if(range.getNumRows()>1)range.mergeVertically();
      });
    }else if(notei>=0){
      sheet.getRange(first,notei+1).setValue(nextNote);
    }

    clearOnlineOrderRows_(sheet,rows.filter(row=>!existingRows.includes(row)));
    clearOnlineCache();
    SpreadsheetApp.flush();
    return {ok:true,updated:existing.length,added:additions.length,online:buildOnlineData()};
  }finally{lock.releaseLock();}
}

/* 顧客綁定集中保存在「顧客」分頁；既有欄位與資料不清除。 */
const CUSTOMER_CHAT_SHEET='顧客';
const CUSTOMER_CHAT_FIELDS=['顧客名稱','顧客LINE UID','官賴對話連結','更新時間','訂單姓名綁定'];
function customerLineChatKey_(customer){
  return 'JIWU_CUSTOMER_LINE_CHAT_'+Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,customer,Utilities.Charset.UTF_8)).replace(/=+$/,'');
}
function customerChatTable_(){
  const book=ss();let sheet=book.getSheetByName(CUSTOMER_CHAT_SHEET);
  if(!sheet){sheet=book.insertSheet(CUSTOMER_CHAT_SHEET);sheet.setFrozenRows(1);}
  let headers=sheet.getLastRow()?sheet.getRange(1,1,1,Math.max(1,sheet.getLastColumn())).getDisplayValues()[0].map(norm):[];
  const oldAccountColumn=headers.indexOf('官賴帳號UID');
  if(oldAccountColumn>=0){sheet.deleteColumn(oldAccountColumn+1);headers.splice(oldAccountColumn,1);}
  const aliases=[['顧客名稱','客戶名稱','客人名稱','姓名'],['顧客LINE UID'],['官賴對話連結'],['更新時間'],['訂單姓名綁定']];
  const indexes=aliases.map((names,i)=>{
    let index=col(headers,names);
    if(index<0){index=headers.length;headers.push(CUSTOMER_CHAT_FIELDS[i]);
      if(headers.length>sheet.getMaxColumns())sheet.insertColumnsAfter(sheet.getMaxColumns(),headers.length-sheet.getMaxColumns());
      sheet.getRange(1,index+1).setValue(CUSTOMER_CHAT_FIELDS[i]);
    }return index;
  });
  const rows=sheet.getLastRow()>1?sheet.getRange(2,1,sheet.getLastRow()-1,headers.length).getDisplayValues():[];
  return {sheet,headers,indexes,rows};
}
function customerChatRecord_(table,customer){
  const matches=[];table.rows.forEach((row,i)=>{if(norm(row[table.indexes[0]])===customer)matches.push(i);});
  if(matches.length>1)throw new Error('顧客分頁有重複姓名：'+customer+'，請先合併資料');
  const index=matches.length?matches[0]:-1;
  return {index,url:index<0?'':norm(table.rows[index][table.indexes[2]])};
}
function writeCustomerChat_(table,customer,url,existingIndex){
  const match=url.match(/^https:\/\/chat\.line\.biz\/(U[0-9a-f]{32})\/chat\/(U[0-9a-f]{32})\/?$/i);
  if(!match)throw new Error('官賴聊天網址格式不正確');
  const record=existingIndex===undefined?customerChatRecord_(table,customer):{index:existingIndex},rowNumber=record.index<0?table.sheet.getLastRow()+1:record.index+2;
  if(rowNumber>table.sheet.getMaxRows())table.sheet.insertRowsAfter(table.sheet.getMaxRows(),rowNumber-table.sheet.getMaxRows());
  const fields=[customer,match[2],url,new Date()];
  table.indexes.slice(0,fields.length).forEach((index,i)=>{
    const cell=table.sheet.getRange(rowNumber,index+1);
    if(i===3)cell.setValue(fields[i]).setNumberFormat('yyyy/MM/dd HH:mm:ss');
    else cell.setNumberFormat('@').setValues([[fields[i]]]);
  });
  const row=record.index<0?new Array(table.headers.length).fill(''):table.rows[record.index];
  table.indexes.slice(0,fields.length).forEach((index,i)=>row[index]=String(fields[i]));
  if(record.index<0)table.rows.push(row);
}
function migrateCustomerChat_(table,customer){
  const record=customerChatRecord_(table,customer);
  // 分頁已有這個姓名時，以分頁為準，包括手動清空的連結。
  if(record.index>=0)return record.url;
  const properties=PropertiesService.getScriptProperties(),key=customerLineChatKey_(customer),url=properties.getProperty(key)||'';
  if(url){writeCustomerChat_(table,customer,url);properties.deleteProperty(key);}
  return url;
}
function lineChatCustomers(){
  const names=new Set();
  [ONLINE,SHIP].forEach(name=>{
    const sheet=ss().getSheetByName(name);if(!sheet)return;
    const rows=sheet.getDataRange().getDisplayValues();
    const index=col(rows[0]||[],['顧客名稱','客戶名稱','客人名稱','姓名']);
    if(index>=0)rows.slice(1).forEach(row=>{const customer=norm(row[index]);if(customer&&customer!=='未填姓名')names.add(customer);});
  });
  const lock=LockService.getScriptLock();lock.waitLock(20000);
  try{
    const table=customerChatTable_();
    table.rows.forEach(row=>{const name=norm(row[table.indexes[0]]);if(name&&name!=='未填姓名')names.add(name);});
    names.forEach(customer=>migrateCustomerChat_(table,customer));
  }finally{lock.releaseLock();}
  return {ok:true,customers:[...names].sort((a,b)=>a.localeCompare(b,'zh-Hant'))};
}
function customerChatName_(name){return norm(name).normalize('NFKC').split(/[（(]/)[0].trim();}
function customerChatContacts_(table){
  return table.rows.map((row,index)=>{
    const customer=norm(row[table.indexes[0]]),account='U8891b4c65adb737be791244dc0629ad7',uid=norm(row[table.indexes[1]]);
    const url=norm(row[table.indexes[2]])||(/^U[0-9a-f]{32}$/i.test(account)&&/^U[0-9a-f]{32}$/i.test(uid)?'https://chat.line.biz/'+account+'/chat/'+uid:'');
    let aliases=[];try{aliases=JSON.parse(row[table.indexes[4]]||'[]');}catch(_){}
    return {customer,uid,url,index,aliases:Array.isArray(aliases)?aliases.filter(v=>typeof v==='string'):[]};
  }).filter(contact=>contact.customer&&/^https:\/\/chat\.line\.biz\/U[0-9a-f]{32}\/chat\/U[0-9a-f]{32}\/?$/i.test(contact.url));
}
function customerLineChatData(){
  const lock=LockService.getScriptLock();lock.waitLock(20000);
  try{return {ok:true,contacts:customerChatContacts_(customerChatTable_()).map(contact=>({customer:contact.customer,uid:contact.uid,url:contact.url,aliases:contact.aliases}))};}
  finally{lock.releaseLock();}
}
function customerChatSimilarity_(a,b){
  a=customerChatName_(a);b=customerChatName_(b);
  if(!a||!b)return 0;if(a===b)return 1;
  const prev=Array.from({length:b.length+1},(_,i)=>i);
  for(let i=1;i<=a.length;i++){let diagonal=prev[0];prev[0]=i;for(let j=1;j<=b.length;j++){const old=prev[j];prev[j]=Math.min(prev[j]+1,prev[j-1]+1,diagonal+(a[i-1]===b[j-1]?0:1));diagonal=old;}}
  return 1-prev[b.length]/Math.max(a.length,b.length);
}
function getCustomerLineChat(p){
  const customer=norm(p.customer);
  if(!customer||customer==='未填姓名')throw new Error('請先填寫顧客姓名');
  const lock=LockService.getScriptLock();lock.waitLock(20000);
  try{
    const table=customerChatTable_();
    // 舊屬性資料只在沒有同姓名列時移轉，避免重複姓名阻擋候選名單。
    if(!table.rows.some(row=>norm(row[table.indexes[0]])===customer))migrateCustomerChat_(table,customer);
    const contacts=customerChatContacts_(table),key=customerChatName_(customer);
    let matches=contacts.filter(contact=>contact.aliases.includes(customer));
    if(!matches.length)matches=contacts.filter(contact=>customerChatName_(contact.customer)===key);
    const urls=[...new Set(matches.map(contact=>contact.url.replace(/\/$/,'')))];
    if(urls.length===1)return {ok:true,url:urls[0]};
    const candidates=contacts.map(contact=>({customer:contact.customer,uid:contact.uid,url:contact.url,score:customerChatSimilarity_(customer,contact.customer)}))
      .sort((a,b)=>b.score-a.score||a.customer.localeCompare(b.customer,'zh-Hant'));
    return {ok:true,url:'',ambiguous:urls.length>1,candidates};
  }finally{lock.releaseLock();}
}
function saveLineChatContact(p){
  const customer=norm(p.customer),url=norm(p.url);
  if(!customer||customer.length>100)throw new Error('請確認官賴畫面顧客姓名');
  const match=url.match(/^https:\/\/chat\.line\.biz\/(U[0-9a-f]{32})\/chat\/(U[0-9a-f]{32})\/?$/i);
  if(!match)throw new Error('官賴聊天網址格式不正確');
  const lock=LockService.getScriptLock();lock.waitLock(20000);
  try{
    const table=customerChatTable_();
    const matches=table.rows.map((row,index)=>({row,index})).filter(item=>norm(item.row[table.indexes[1]])===match[2]);
    if(matches.length>1)throw new Error('顧客分頁有重複 UID，請先合併資料');
    const index=matches.length?matches[0].index:-1;
    if(index>=0&&norm(table.rows[index][table.indexes[0]])===customer&&norm(table.rows[index][table.indexes[2]]).replace(/\/$/,'')===url.replace(/\/$/,''))return {ok:true,unchanged:true};
    writeCustomerChat_(table,customer,url,index);
    return {ok:true,customer,uid:match[2],updated:index>=0};
  }finally{lock.releaseLock();}
}
function bindCustomerLineChat(p){
  const customer=norm(p.customer),url=norm(p.url);
  if(!customer||customer==='未填姓名'||customer.length>100)throw new Error('請確認訂單顧客姓名');
  const lock=LockService.getScriptLock();lock.waitLock(20000);
  try{
    const table=customerChatTable_(),contacts=customerChatContacts_(table);
    const target=contacts.find(contact=>contact.url.replace(/\/$/,'')===url.replace(/\/$/,''));
    if(!target)throw new Error('這位官賴顧客已變更，請重新讀取名單');
    for(const contact of contacts){
      const aliases=contact.aliases.filter(name=>name!==customer);
      if(contact.index===target.index)aliases.push(customer);
      if(JSON.stringify(aliases)!==JSON.stringify(contact.aliases)){
        table.sheet.getRange(contact.index+2,table.indexes[4]+1).setNumberFormat('@').setValue(JSON.stringify(aliases));
        table.sheet.getRange(contact.index+2,table.indexes[3]+1).setValue(new Date()).setNumberFormat('yyyy/MM/dd HH:mm:ss');
      }
    }
    return {ok:true,url:target.url};
  }finally{lock.releaseLock();}
}
function saveCustomerLineChat(p){
  const customer=norm(p.customer),url=norm(p.url);
  if(!customer||customer==='未填姓名')throw new Error('請先填寫顧客姓名');
  if(customer.length>100)throw new Error('顧客名稱不能超過 100 個字');
  const lock=LockService.getScriptLock();lock.waitLock(20000);
  try{
    const table=customerChatTable_();
    if(String(p.auto)==='true'){
      const existing=migrateCustomerChat_(table,customer);
      if(existing&&existing.replace(/\/$/,'')!==url.replace(/\/$/,''))throw new Error('這個姓名已綁定其他對話，請手動確認');
      const known=customerChatRecord_(table,customer).index>=0||[ONLINE,SHIP].some(name=>{
        const sheet=ss().getSheetByName(name);if(!sheet)return false;
        const rows=sheet.getDataRange().getDisplayValues(),index=col(rows[0]||[],['顧客名稱','客戶名稱','客人名稱','姓名']);
        return index>=0&&rows.slice(1).some(row=>norm(row[index])===customer);
      });
      if(!known)throw new Error('試算表找不到完全相同的顧客姓名');
      if(existing)return {ok:true,url:existing,unchanged:true};
    }
    writeCustomerChat_(table,customer,url);
    PropertiesService.getScriptProperties().deleteProperty(customerLineChatKey_(customer));
    return {ok:true,url};
  }finally{lock.releaseLock();}
}

/* 將顧客頁中的名稱更新到該顧客所選取的所有線上銷售列。 */
function renameOnlineCustomer(p){
  const rows=[...new Set(JSON.parse(p.rows||'[]').map(Number).filter(row=>Number.isInteger(row)&&row>=2))].sort((a,b)=>a-b);
  const oldName=norm(p.oldName),newName=norm(p.newName);
  if(!rows.length)throw new Error('找不到顧客訂單列');
  if(!newName)throw new Error('顧客名稱不可空白');
  if(newName.length>100)throw new Error('顧客名稱不能超過 100 個字');
  const lock=LockService.getScriptLock();lock.waitLock(20000);
  try{
    const d=values(ONLINE,true),sheet=d.sheet;
    const customeri=col(d.headers,['顧客名稱','客戶名稱','客人名稱','姓名']);
    if(customeri<0)throw new Error('線上銷售找不到顧客名稱欄');
    const lastRow=sheet.getLastRow(),validRows=rows.filter(row=>row<=lastRow);
    if(validRows.length!==rows.length)throw new Error('部分訂單列已不存在，請重新整理後再試');
    const mergedAnchor=new Map();
    if(lastRow>=2){
      sheet.getRange(2,customeri+1,lastRow-1,1).getMergedRanges().forEach(range=>{
        const first=range.getRow(),last=first+range.getNumRows()-1;
        for(let row=Math.max(2,first);row<=Math.min(last,lastRow);row++)mergedAnchor.set(row,first);
      });
    }
    const targets=[...new Set(validRows.map(row=>mergedAnchor.get(row)||row))];
    targets.forEach(row=>{
      const current=norm(sheet.getRange(row,customeri+1).getValue());
      const expectedBlank=oldName==='未填姓名'&&!current;
      if(current!==oldName&&!expectedBlank)throw new Error('顧客資料已變更，請重新整理後再試');
    });
    // 訂單改名與顧客 UID 資料分開處理，允許改成既有姓名來合併檢視。
    targets.forEach(row=>sheet.getRange(row,customeri+1).setValue(newName));
    clearOnlineCache();
    return {ok:true,count:validRows.length,newName};
  }finally{lock.releaseLock();}
}

/* 顧客訂單卡上的面交標籤，直接切換線上銷售的備註欄。 */
function setOnlineStar(p){
  const rows=[...new Set(JSON.parse(p.rows||'[]').map(Number))];
  if(!rows.length||rows.some(row=>!Number.isInteger(row)||row<2))throw new Error('訂單列格式錯誤');
  const lock=LockService.getScriptLock();lock.waitLock(20000);
  try{
    const sheet=sh(ONLINE);
    if(rows.some(row=>row>sheet.getLastRow()))throw new Error('找不到訂單列');
    const headers=sheet.getRange(1,1,1,sheet.getLastColumn()).getDisplayValues()[0].map(norm);
    let index=col(headers,['星號標記']);
    if(index<0){index=headers.length;if(index+1>sheet.getMaxColumns())sheet.insertColumnAfter(sheet.getMaxColumns());sheet.getRange(1,index+1).setValue('星號標記');}
    const enabled=String(p.enabled)==='true';
    rows.forEach(row=>sheet.getRange(row,index+1).setValue(enabled));
    clearOnlineCache();return {ok:true,enabled};
  }finally{lock.releaseLock();}
}

function setOnlineFaceToFace(p){
  const rows=[...new Set(JSON.parse(p.rows||'[]').map(Number).filter(row=>Number.isInteger(row)&&row>=2))];
  const enabled=String(p.enabled)==='true';
  const d=values(ONLINE,true);
  const notei=col(d.headers,['備註','備註欄']);

  if(!rows.length)throw new Error('缺少線上銷售列');
  if(notei<0)throw new Error('線上銷售找不到「備註」欄位');

  const lastRow=d.sheet.getLastRow();
  const validRows=rows.filter(row=>row<=lastRow);
  const mergedAnchor=new Map();
  if(d.rows.length){
    d.sheet.getRange(2,notei+1,d.rows.length,1).getMergedRanges().forEach(range=>{
      const first=range.getRow(),last=first+range.getNumRows()-1;
      for(let row=Math.max(2,first);row<=Math.min(last,d.rows.length+1);row++)mergedAnchor.set(row,first);
    });
  }
  const targets=[...new Set(validRows.map(row=>mergedAnchor.get(row)||row))];
  targets.forEach(row=>{
    const cell=d.sheet.getRange(row,notei+1);
    const current=norm(cell.getValue());
    if(enabled){
      cell.setValue(current.includes('面交')?current:(current?current+'｜面交':'面交'));
    }else if(current==='面交'){
      cell.clearContent();
    }else{
      cell.setValue(current.replace(/(^|｜)面交(?=｜|$)/,'').replace(/^｜|｜$/g,''));
    }
  });
  clearOnlineCache();
  return {ok:true,count:validRows.length,enabled};
}

/* 面交頁勾選商品後，將線上銷售的「已開單」核取方塊設為完成。 */
function setOnlineOpened(p){
  const rows=[...new Set(JSON.parse(p.rows||'[]').map(Number).filter(row=>Number.isInteger(row)&&row>=2))].sort((a,b)=>a-b);
  if(!rows.length)throw new Error('缺少線上銷售列');
  const lock=LockService.getScriptLock();
  lock.waitLock(20000);
  try{
    const d=values(ONLINE,true);
    const openedi=col(d.headers,['已開單','開單']);
    if(openedi<0)throw new Error('線上銷售找不到「已開單」核取方塊欄位');
    const lastRow=d.sheet.getLastRow();
    const validRows=rows.filter(row=>row<=lastRow);
    if(!validRows.length)throw new Error('找不到要標記的商品列');
    let start=validRows[0],previous=start;
    for(let i=1;i<=validRows.length;i++){
      const current=validRows[i];
      if(i<validRows.length&&current===previous+1){previous=current;continue;}
      d.sheet.getRange(start,openedi+1,previous-start+1,1)
        .setValues(Array(previous-start+1).fill(null).map(()=>[true]));
      if(i<validRows.length){start=current;previous=current;}
    }
    clearOnlineCache();
    return {ok:true,count:validRows.length,opened:true};
  }finally{lock.releaseLock();}
}

/* 線上商品標籤：同步更新狀態、購買核取方塊、貨況與已開單核取方塊。 */
function setOnlineItemBadge(p){
  const row=Number(p.row),type=norm(p.type),value=norm(p.value);
  if(!Number.isInteger(row)||row<2)throw new Error('商品列號無效');
  const lock=LockService.getScriptLock();lock.waitLock(20000);
  try{
    const d=values(ONLINE,true);if(row>d.sheet.getLastRow())throw new Error('找不到此商品');
    const statusi=col(d.headers,['狀態','訂購狀態']);
    const purchasei=col(d.headers,['購買','已訂購','訂購']);
    const openi=col(d.headers,['已開單','開單']);
    if(type==='opened'){
      if(statusi<0)throw new Error('找不到「狀態」欄');
      if(openi<0)throw new Error('找不到「已開單」欄');
      d.sheet.getRange(row,statusi+1).setValue('已開單');
      d.sheet.getRange(row,openi+1).setValue(true);
    }else if(type==='ordered'){
      if(statusi<0)throw new Error('找不到「狀態」欄');
      if(purchasei<0)throw new Error('找不到「購買」核取方塊欄');
      if(!['未訂購','已訂購'].includes(value))throw new Error('訂購狀態無效');
      d.sheet.getRange(row,statusi+1).setValue(value);
      d.sheet.getRange(row,purchasei+1).setValue(value==='已訂購');
      if(openi>=0)d.sheet.getRange(row,openi+1).setValue(false);
    }else if(type==='cargo'){
      if(!['現貨','補登'].includes(value)&&!/^(?:補登\d*|\d{1,2}月)$/.test(value))throw new Error('貨況標籤格式無效');
      const i=col(d.headers,['貨況']);if(i<0)throw new Error('找不到「貨況」欄');
      d.sheet.getRange(row,i+1).setValue(value);
      if(statusi>=0)d.sheet.getRange(row,statusi+1).clearContent();
      if(purchasei>=0)d.sheet.getRange(row,purchasei+1).setValue(false);
      if(openi>=0)d.sheet.getRange(row,openi+1).setValue(false);
    }else throw new Error('標籤類型無效');
    clearOnlineCache();return {ok:true,row,type,value};
  }finally{lock.releaseLock();}
}

/* 將線上訂單的「對帳」核取方塊設為完成。 */
function setOnlineReconciled(p){
  const rows=[...new Set(JSON.parse(p.rows||'[]').map(Number).filter(row=>Number.isInteger(row)&&row>=2))].sort((a,b)=>a-b);
  const enabled=String(p.enabled)!=='false';
  if(!rows.length)throw new Error('缺少線上銷售列');
  const lock=LockService.getScriptLock();
  lock.waitLock(20000);
  try{
    const d=values(ONLINE,true);
    const checki=col(d.headers,['對帳','已對帳']);
    if(checki<0)throw new Error('線上銷售找不到「對帳」核取方塊欄位');
    const lastRow=d.sheet.getLastRow();
    const validRows=rows.filter(row=>row<=lastRow);
    if(!validRows.length)throw new Error('找不到要對帳的訂單列');
    const mergedAnchor=new Map();
    d.sheet.getRange(2,checki+1,Math.max(1,lastRow-1),1).getMergedRanges().forEach(range=>{
      const first=range.getRow(),last=first+range.getNumRows()-1;
      for(let row=Math.max(2,first);row<=Math.min(last,lastRow);row++)mergedAnchor.set(row,first);
    });
    [...new Set(validRows.map(row=>mergedAnchor.get(row)||row))].forEach(row=>{
      d.sheet.getRange(row,checki+1).setValue(enabled);
    });
    clearOnlineCache();
    return {ok:true,count:validRows.length,completed:enabled};
  }finally{lock.releaseLock();}
}

/* 分段快取：每段最多 20,000 UTF-16 字元，低於 100 KB。 */
function getOnline(force=false){
  const cache=CacheService.getScriptCache();
  if(!force){
    try{
      const raw=cache.get(CACHE_KEY);
      if(raw){
        const manifest=JSON.parse(raw);
        if(Array.isArray(manifest.keys)&&manifest.keys.length){
          const chunks=cache.getAll(manifest.keys);
          if(manifest.keys.every(key=>typeof chunks[key]==='string')){
            return JSON.parse(manifest.keys.map(key=>chunks[key]).join(''));
          }
        }
      }
    }catch(err){ console.warn('線上快取讀取失敗：'+err); }
  }
  const result=buildOnlineData();
  try{
    const json=JSON.stringify(result);
    const prefix=CACHE_KEY+'_'+Utilities.getUuid()+'_';
    const chunks={};
    const keys=[];
    for(let i=0;i<json.length;i+=20000){
      const key=prefix+keys.length;
      keys.push(key);
      chunks[key]=json.slice(i,i+20000);
    }
    // 每次使用不同版本的分段，避免同時載入時混合不同資料。
    cache.putAll(chunks,CACHE_SEC);
    cache.put(CACHE_KEY,JSON.stringify({keys}),CACHE_SEC);
  }catch(err){ console.warn('線上快取寫入失敗：'+err); }
  return result;
}

function onlineResponse(p){
  const d=getOnline(String(p.fresh)==='1');
  // 團務同步需要讀取開團分頁；限時執行，避免每次開啟線上頁面都掃一次。
  const cache=CacheService.getScriptCache();
  if(!cache.get(ONLINE_GROUP_SYNC_CACHE_KEY)){
    try{
      syncOnlineGroupsShipping_(d);
      cache.put(ONLINE_GROUP_SYNC_CACHE_KEY,'1',CACHE_SEC);
    }catch(err){console.warn('團務表自動登記失敗：'+err);}
  }
  if(String(p.compact)!=='1')return d;
  // 欄名只傳一次；保留原始列號與所有欄位，前端還原原有格式。
  return {
    ok:true,
    format:'online-matrix-v1',
    headers:d.headers,
    rows:d.rows.map(item=>[item.row,...d.headers.map(h=>item.data[h])]),
    mergeKeys:d.rows.map(item=>item.orderMergeKey||item.depositMergeKey||'')
  };
}

function getOnlineCustomer(p){
  const keyword=norm(p.name).toLowerCase();

  if(!keyword)return getOnline();

  const d=getOnline();

  const ci=col(
    d.headers,
    ['顧客名稱','客戶名稱','客人名稱','姓名']
  );

  if(ci<0){
    throw new Error('線上銷售找不到「顧客名稱」欄位');
  }

  const rows=d.rows.filter(x=>
    norm(
      x.data[d.headers[ci]]
    ).toLowerCase().includes(keyword)
  );

  return {
    ok:true,
    headers:d.headers,
    rows
  };
}

function getOnlineCargo(p){
  const cargo=norm(p.cargo);
  const d=getOnline();

  const cargoi=col(d.headers,['貨況','狀態']);
  const orderi=col(d.headers,['已訂購','購買','訂購']);
  const openi=col(d.headers,['已開單','開單']);

  if(cargoi<0){
    throw new Error('線上銷售找不到「貨況」欄位');
  }

  const rows=d.rows.filter(x=>{
    const rawCargo=norm(
      x.data[d.headers[cargoi]]
    );

    const ordered=orderi>=0
      ?truthy(x.data[d.headers[orderi]])
      :false;

    const opened=openi>=0
      ?truthy(x.data[d.headers[openi]])
      :false;

    if(cargo==='現貨'){
      return rawCargo==='現貨'&&!opened;
    }

    if(cargo==='已訂購'){
      return ordered;
    }

    if(cargo==='已開單'){
      return opened;
    }

    if(cargo==='補貨登記'){
      return [
        '補貨登記',
        'SOLD OUT',
        'S☹LD OUT',
        '補登'
      ].includes(rawCargo);
    }

    if(cargo==='受注'){
      return /^\d{1,2}月$/.test(rawCargo);
    }

    return false;
  });

  return {
    ok:true,
    headers:d.headers,
    rows
  };
}

function getGroup(p){
  const group=norm(p.group);
  const d=getOnline();

  const gi=col(
    d.headers,
    ['團名','開團名稱','團']
  );

  if(gi<0){
    throw new Error('線上銷售找不到「團名」欄位');
  }

  const rows=d.rows.filter(x=>
    norm(x.data[d.headers[gi]])===group
  );

  const ci=col(
    d.headers,
    ['顧客名稱','客戶名稱','客人名稱','姓名']
  );

  const customers={};

  rows.forEach(x=>{
    const name=ci>=0
      ?norm(x.data[d.headers[ci]])
      :'未填姓名';

    if(!customers[name]){
      customers[name]=[];
    }

    customers[name].push(x.data);
  });

  return {
    ok:true,
    group,
    customers:Object.keys(customers).map(name=>({
      name,
      items:customers[name]
    }))
  };
}

/* =========================================================
   店面
========================================================= */

// 保留舊 API 參數相容性；所有店面操作都使用同一份購物車。
function validSalesperson(){return 'shared';}

function productNameWithRole(name,role){
  name=norm(name);
  role=norm(role);

  if(
    !role||
    [
      '綜合角色',
      '三小隻',
      '全角色',
      '其他角色'
    ].includes(role)
  ){
    return name;
  }

  return name+' '+role;
}

function buildStockMap(d){
  const codeCols=[
    '條碼',
    '貨號',
    '商品貨號',
    'SN'
  ];

  const targetCols=[];

  codeCols.forEach(name=>{
    const idx=d.headers.indexOf(name);
    if(idx>=0)targetCols.push(idx);
  });

  const map=new Map();

  const add=(value,record)=>{
    stockCodeKeys(value).forEach(key=>{
      if(key&&!map.has(key))map.set(key,record);
    });
  };

  d.rows.forEach((r,i)=>{
    for(const ci of targetCols){
      const record={index:i,row:i+2,data:r};
      /* 顯示值可保留試算表內的前導 0；原始值則支援數字欄位。 */
      add(r[ci],record);
      if(d.displays&&d.displays[i])add(d.displays[i][ci],record);
    }
  });

  return map;
}

function stockCodeKeys(value){
  let code=norm(value).normalize('NFKC').replace(/\s+/g,'');
  if(!code)return [];
  /* 常見掃描器 GS1 Code 128 前綴。 */
  code=code.replace(/^\]C1/,'');
  const keys=[code];
  if(/^\d+$/.test(code)){
    keys.push(code.replace(/^0+(?=\d)/,''));
  }
  return [...new Set(keys)];
}

function findStockProduct(d,code){
  const map=buildStockMap(d);
  for(const key of stockCodeKeys(code)){
    if(map.has(key))return map.get(key);
  }
  return null;
}

function quantityOffer(item){
const price=Math.round(Number(item.price||0)*100),qty=Math.max(0,Math.floor(Number(item.qty)||0));
const size=Number(item.offerQty),offer=Math.round(Number(item.offerTotal)*100);
const enabled=!item.manual&&Number.isInteger(size)&&size>=2&&item.offerTotal!==''&&item.offerTotal!=null&&Number.isFinite(offer)&&offer>=0&&offer<price*size;
// Missing offerTotal must never enter arithmetic (0 * NaN is still NaN).
if(!enabled)return {total:qty*price/100,groups:0,size:0,offer:0,saving:0};
const groups=Math.floor(qty/size),remainder=qty-groups*size;
return {total:(groups*offer+remainder*price)/100,groups,size:enabled?size:0,offer:offer/100,saving:(qty*price-groups*offer-remainder*price)/100};
}
function inventoryOffer_(headers,row){
  const ni=col(headers,['備註','備註欄','說明']);
  const note=ni<0?'':norm(row[ni]).normalize('NFKC');
  const marker=/(?:^|[\s，,；;｜|])(?:數量)?優惠\s*[:：]/;
  if(!marker.test(note))return {offerQty:'',offerTotal:''};
  const match=note.match(/(?:^|[\s，,；;｜|])(?:數量)?優惠\s*[:：]\s*(\d+)\s*(?:包|件|個|入|組)\s*(?:[$=：:]\s*)?(\d+(?:\.\d{1,2})?)\s*(?:元)?(?=$|[\s，,；;｜|])/);
  if(!match||Number(match[1])<2)throw new Error('備註數量優惠格式請填「優惠：3包150」，數量須為 2 以上整數');
  const pi=col(headers,['售價','價格','銷售價']),price=pi<0?0:num(row[pi]);
  if(Number(match[2])>=price*Number(match[1]))throw new Error('優惠總價須低於原售價乘以優惠數量');
  return {offerQty:Number(match[1]),offerTotal:Number(match[2])};
}
function refreshCartOffers_(items){
if(!items.some(item=>!item.manual))return items;
const d=values(STOCK,true),map=buildStockMap(d),pi=col(d.headers,['售價','價格']);
return items.map(item=>{if(item.manual)return item;const record=stockCodeKeys(item.code).map(key=>map.get(key)).find(Boolean);if(!record)return item;return Object.assign({},item,{price:pi>=0?num(record.data[pi]):item.price},inventoryOffer_(d.headers,record.data));});
}
function offerUnitPrice_(item,index){
const offer=quantityOffer(item);
if(index>=offer.groups*offer.size)return Number(item.price);
const cents=Math.round(offer.offer*100),base=Math.floor(cents/offer.size),extra=cents%offer.size;
return (base+(index%offer.size<extra?1:0))/100;
}

function getStoreProduct(p){
  const code=norm(p.code||p.barcode);

  if(!code){
    throw new Error('沒有貨號');
  }

  const d=values(STOCK);

  const ni=col(d.headers,['名稱','商品名稱']);
  const ri=col(d.headers,['角色']);
  const pi=col(d.headers,['售價','價格']);
  const si=col(d.headers,['庫存']);
  const sti=col(d.headers,['店面']);

  const found=findStockProduct(d,code);

  if(!found){
    return {
      ok:false,
      error:'找不到商品：'+code
    };
  }

  const r=found.data;
  const role=ri>=0?norm(r[ri]):'';
  const salesperson=validSalesperson(
    p.salesperson||p.user
  );

  return {
    ok:true,
    row:found.row,
    salesperson,
    product:{
      code,
      name:productNameWithRole(
        ni>=0?r[ni]:'',
        role
      ),
      role,
      ...inventoryOffer_(d.headers,r),
      price:pi>=0?num(r[pi]):0,
      stock:si>=0?num(r[si]):0,
      store:sti>=0?num(r[sti]):0
    }
  };
}

/* 庫存頁使用完整顯示值與公式，保留試算表中的圖片網址/IMAGE公式。 */
const INVENTORY_CACHE_MANIFEST='JIWU_INVENTORY_PAGE_V2';
function readInventoryCache_(){
  const cache=CacheService.getScriptCache();
  try{
    const raw=cache.get(INVENTORY_CACHE_MANIFEST);
    if(!raw)return null;
    const manifest=JSON.parse(raw);
    if(!Array.isArray(manifest.keys)||!manifest.keys.length)return null;
    const parts=cache.getAll(manifest.keys);
    if(!manifest.keys.every(key=>typeof parts[key]==='string'))return null;
    return JSON.parse(manifest.keys.map(key=>parts[key]).join(''));
  }catch(_){return null;}
}
function writeInventoryCache_(data){
  const cache=CacheService.getScriptCache();
  try{
    const json=JSON.stringify(data),prefix=INVENTORY_CACHE_MANIFEST+'_'+Utilities.getUuid()+'_',parts={},keys=[];
    for(let i=0;i<json.length;i+=20000){const key=prefix+keys.length;keys.push(key);parts[key]=json.slice(i,i+20000);}
    cache.putAll(parts,300);
    cache.put(INVENTORY_CACHE_MANIFEST,JSON.stringify({keys}),300);
  }catch(err){console.warn('庫存快取寫入失敗：'+err);}
}
function clearInventoryCache_(){
  const cache=CacheService.getScriptCache();
  try{const raw=cache.get(INVENTORY_CACHE_MANIFEST);if(raw){const keys=JSON.parse(raw).keys||[];if(keys.length)cache.removeAll(keys);}}catch(_){}
  cache.remove(INVENTORY_CACHE_MANIFEST);
  cache.remove('JIWU_INVENTORY_PAGE_V1');
}
function isInventoryZero_(value){
  const text=norm(value).replace(/,/g,'');
  return text!==''&&Number.isFinite(Number(text))&&Number(text)===0;
}
function inventoryNoteHasUrl_(value){
  return /(?:https?:\/\/|www\.)\S+/i.test(norm(value));
}
function clearInventoryStatusIfPositive_(sheet,headers,row,stockValue){
  const stockText=norm(stockValue).replace(/,/g,'');
  const statusIndex=headers.findIndex(header=>norm(header)==='狀態');
  if(statusIndex<0||!/^\d+(?:\.\d+)?$/.test(stockText)||Number(stockText)<=0)return false;
  const cell=sheet.getRange(row,statusIndex+1);
  if(norm(cell.getValue())==='')return false;
  cell.clearContent();
  return true;
}
function clearPositiveInventoryStatuses_(){
  const sheet=sh(STOCK),range=sheet.getDataRange(),rows=range.getValues();
  if(!rows.length)return false;
  const headers=rows[0].map(norm),stockIndex=col(headers,['庫存','總庫存','數量','庫存量','商品庫存']);
  if(stockIndex<0||!headers.includes('狀態'))return false;
  let changed=false;
  rows.slice(1).forEach((row,index)=>{
    if(clearInventoryStatusIfPositive_(sheet,headers,index+2,row[stockIndex]))changed=true;
  });
  if(changed)clearInventoryCache_();
  return changed;
}
function getInventory(){
  const cached=readInventoryCache_();
  // 手機重進頁面時先直接使用快取，避免每次都掃完整庫存表。
  if(cached)return cached;
  clearPositiveInventoryStatuses_();
  const sheet=sh(STOCK);
  const range=sheet.getDataRange();
  const raw=range.getValues();
  if(!raw.length)return {ok:true,headers:[],rows:[]};
  const headers=raw[0].map(x=>String(x).trim());
  const rows=raw.slice(1);
  const stockCol=col(headers,['庫存','總庫存','數量','庫存量','商品庫存']);
  const statusCol=col(headers,['官網貨況','官網狀態','商品網址貨況','網址貨況','網站貨況','官網狀態檢查','在庫狀態','狀態','貨況']);
  const noteCol=col(headers,['備註','備註欄','說明']);
  const autoX=[];
  if(stockCol>=0&&statusCol>=0){
    rows.forEach((row,i)=>{
      const stock=norm(row[stockCol]);
      const status=norm(row[statusCol]);
      const noteHasUrl=noteCol>=0&&inventoryNoteHasUrl_(row[noteCol]);
      if(isInventoryZero_(stock)&&status.includes('❌')&&!noteHasUrl){row[stockCol]='x';autoX.push(i+2);}
    });
    if(autoX.length){
      const cells=autoX.map(row=>sheet.getRange(row,stockCol+1).getA1Notation());
      sheet.getRangeList(cells).setValue('x');
    }
  }
  const displays=range.getDisplayValues().slice(1);
  autoX.forEach(row=>{if(displays[row-2])displays[row-2][stockCol]='x';});
  const imageCol=col(headers,['圖片','商品圖片','圖片網址','圖片連結','商品圖','照片','photo','image','img']);
  const nameCol=col(headers,['名稱','商品名稱','品名','商品']);
  const imageFormulas=imageCol>=0&&range.getNumRows()>1?sheet.getRange(2,imageCol+1,range.getNumRows()-1,1).getFormulas():[];
  const byRow={};
  const result={
    ok:true,
    headers,
    rows:[]
  };
  rows.forEach((row,i)=>{
    if(nameCol>=0&&!norm(row[nameCol]))return;
    const formulas=[];
    if(imageCol>=0&&imageFormulas[i]&&imageFormulas[i][0])formulas[imageCol]=imageFormulas[i][0];
    const item={row:i+2,values:row,display:displays[i]||row,formulas,image:''};
    result.rows.push(item);byRow[item.row]=item;
  });
  try{
    sheet.getImages().forEach(image=>{
      const row=image.getAnchorCell().getRow();
      const url=image.getUrl();
      const item=byRow[row];
      if(item&&url)item.image=url;
    });
  }catch(_){}
  writeInventoryCache_(result);
  return result;
}

function inventoryResponse(p){
  const data=getInventory();
  if(String((p&&p.compact)||'')!=='1')return data;
  return {
    ok:true,
    format:'inventory-matrix-v1',
    headers:data.headers,
    rows:data.rows.map(item=>[item.row,item.values,item.display,item.formulas,item.image||''])
  };
}

function setInventoryPrice(p){
  const row=Number(p.row);
  if(!Number.isInteger(row)||row<2)throw new Error('商品列號無效');
  const priceText=norm(p.price).replace(/[，,]/g,'');
  if(!priceText||!/^\d+(?:\.\d+)?$/.test(priceText))throw new Error('售價必須是有效數字');
  const sheet=sh(STOCK);
  const headers=sheet.getRange(1,1,1,sheet.getLastColumn()).getDisplayValues()[0].map(x=>String(x).trim());
  const priceCol=col(headers,['售價','價格','銷售價']);
  if(priceCol<0)throw new Error('商品庫存分頁找不到售價欄');
  const value=Number(priceText);
  sheet.getRange(row,priceCol+1).setValue(value);
  clearInventoryCache_();
  return {ok:true,row,price:value};
}

function deleteInventoryProduct(p){
 const row=Number(p.row);if(!Number.isInteger(row)||row<2)throw new Error('商品列號無效');
 const lock=LockService.getScriptLock();lock.waitLock(20000);
 try{
  const sheet=sh(STOCK);if(row>sheet.getLastRow())throw new Error('找不到商品');
  // Preserve row numbers and shared category cells used by other products.
  const range=sheet.getRange(row,1,1,sheet.getLastColumn());
  const merges=range.getMergedRanges();
  merges.forEach(merged=>{const value=merged.getCell(1,1).getValue(),first=merged.getRow(),last=first+merged.getNumRows()-1,column=merged.getColumn(),width=merged.getNumColumns();merged.breakApart();merged.clearContent();for(const [start,end] of [[first,row-1],[row+1,last]])if(start<=end){const keep=sheet.getRange(start,column,end-start+1,width);keep.getCell(1,1).setValue(value);if(end>start)keep.mergeVertically();}});
  range.clearContent();clearInventoryCache_();return {ok:true,row};
 }finally{lock.releaseLock();}
}

function updateInventoryProduct(p){
  const row=Number(p.row);
  if(!Number.isInteger(row)||row<2)throw new Error('商品列號無效');
  const sheet=sh(STOCK);if(row>sheet.getLastRow())throw new Error('找不到此商品');
  const headers=sheet.getRange(1,1,1,sheet.getLastColumn()).getDisplayValues()[0].map(norm);
  const fields=[
    {key:'ip',names:['IP','IP分類','IP類別'],label:'IP',kind:'text'},
    {key:'role',names:['角色'],label:'角色',kind:'text'},
    {key:'kind',names:['種類','類型','商品種類','品項'],label:'種類',kind:'text'},
    {key:'name',names:['名稱','商品名稱','品名','商品'],label:'名稱',kind:'text',required:true},
    {key:'code',names:['貨號','商品貨號','條碼','SN'],label:'貨號',kind:'text'},
    {key:'original',names:['原價','定價','原售價','牌價'],label:'原價',kind:'money'},
    {key:'price',names:['售價','價格','銷售價'],label:'售價',kind:'money'},
    {key:'stock',names:['庫存','總庫存','數量','庫存量','商品庫存'],label:'庫存',kind:'stock'},
    {key:'store',names:['店面','店面庫存','店鋪庫存','店面數量'],label:'店面數量',kind:'integer'},
    {key:'url',names:['商品網址','官網網址','商品連結','官網連結','網址','URL','連結','來源網址'],label:'商品網址',kind:'url'},
    {key:'note',names:['備註','備註欄','說明'],label:'備註',kind:'text'}
  ];
  inventoryOffer_(['備註','售價'],[p.note,p.price]);
  const updates=[];
  fields.forEach(field=>{
    const index=col(headers,field.names);
    if(index<0)throw new Error('商品庫存分頁找不到「'+field.label+'」欄位');
    const raw=p[field.key]==null?'':String(p[field.key]);
    const value=norm(raw);
    if(field.required&&!value)throw new Error(field.label+'不可空白');
    if(field.kind==='money'&&value!==''&&!/^\d+(?:\.\d+)?$/.test(value.replace(/[，,]/g,'')))throw new Error(field.label+'必須是有效數字');
    if(field.kind==='stock'&&!/^(?:x|\?|\d+)?$/i.test(value))throw new Error('庫存請輸入整數、x 或 ?');
    if(field.kind==='integer'&&value!==''&&!/^\d+$/.test(value))throw new Error(field.label+'必須是非負整數');
    if(field.kind==='url'&&value!==''&&!/^https?:\/\//i.test(value))throw new Error('商品網址必須以 http:// 或 https:// 開頭');
    let output=value;
    if(field.kind==='money'||field.kind==='integer')output=value===''?'':Number(value.replace(/[，,]/g,''));
    updates.push({index,value:output,field});
  });
  updates.forEach(item=>sheet.getRange(row,item.index+1).setValue(item.value));
  const stock=updates.find(item=>item.field.key==='stock');
  if(stock&&typeof stock.value==='number')clearInventoryStatusIfPositive_(sheet,headers,row,stock.value);
  clearInventoryCache_();
  return {ok:true,row};
}

function setInventoryStock(p){
  const row=Number(p.row);
  if(!Number.isInteger(row)||row<2)throw new Error('商品列號無效');
  const text=norm(p.stock).toLowerCase();
  if(!/^(?:x|\?|\d+)$/.test(text))throw new Error('庫存必須是整數、x 或 ?');
  const sheet=sh(STOCK);
  const headers=sheet.getRange(1,1,1,sheet.getLastColumn()).getDisplayValues()[0].map(norm);
  const index=col(headers,['庫存','總庫存','數量','庫存量','商品庫存']);
  if(index<0)throw new Error('商品庫存分頁找不到庫存欄');
  const value=text==='x'||text==='?'?text:Number(text);
  sheet.getRange(row,index+1).setValue(value);
  clearInventoryStatusIfPositive_(sheet,headers,row,value);
  clearInventoryCache_();
  return {ok:true,row,stock:value};
}

function setInventoryStore(p){
  const row=Number(p.row),text=norm(p.stock);
  if(!Number.isInteger(row)||row<2)throw new Error('商品列號無效');
  if(!/^\d+$/.test(text))throw new Error('店面數量必須是非負整數');
  const sheet=sh(STOCK);if(row>sheet.getLastRow())throw new Error('找不到此商品');
  const headers=sheet.getRange(1,1,1,sheet.getLastColumn()).getDisplayValues()[0].map(norm);
  const index=col(headers,['店面','店面庫存','店鋪庫存','店面數量']);
  if(index<0)throw new Error('商品庫存分頁找不到店面數量欄');
  const value=Number(text);sheet.getRange(row,index+1).setValue(value);clearInventoryCache_();
  return {ok:true,row,store:value};
}

/* 圖片區塊點擊後可直接回寫圖片網址；無圖片欄時自動建立「圖片網址」欄。 */
function setInventoryImage(p){
  const row=Number(p.row),url=norm(p.url);
  if(!Number.isInteger(row)||row<2)throw new Error('商品列號無效');
  if(!/^https?:\/\//i.test(url))throw new Error('請輸入有效的 http/https 圖片網址');
  const sheet=sh(STOCK);
  if(row>sheet.getLastRow())throw new Error('找不到此商品');
  const headers=sheet.getRange(1,1,1,sheet.getLastColumn()).getDisplayValues()[0].map(norm);
  let imageCol=col(headers,['圖片','商品圖片','圖片網址','圖片連結','商品圖','照片','photo','image','img']);
  if(imageCol<0){
    imageCol=headers.length;
    sheet.getRange(1,imageCol+1).setValue('圖片網址');
    headers.push('圖片網址');
  }
  sheet.getRange(row,imageCol+1).setValue(url);
  SpreadsheetApp.flush();
  clearInventoryCache_();
  return {ok:true,row,url,imageCol,imageHeader:headers[imageCol]||'圖片網址'};
}

function reorderInventory(p){
  if(p.moves){
    const moves=norm(p.moves).split(',').filter(Boolean).map(value=>{
      if(!/^[0-9a-z]+_[0-9a-z]+_[ab]$/i.test(value))throw new Error('拖曳排序資料格式錯誤');
      const parts=value.split('_');
      const source=parseInt(parts[0],36),target=parseInt(parts[1],36),side=parts[2].toLowerCase();
      if(!Number.isInteger(source)||source<2||!Number.isInteger(target)||target<2)throw new Error('拖曳排序列號無效');
      return [source,target,side];
    });
    if(!moves.length)throw new Error('沒有需要儲存的排序');
    const sheet=sh(STOCK),lastRow=sheet.getLastRow(),lastCol=sheet.getLastColumn();
    const headers=sheet.getRange(1,1,1,lastCol).getDisplayValues()[0].map(norm);
    const nameCol=col(headers,['名稱','商品名稱','品名','商品']);
    if(nameCol<0)throw new Error('商品庫存分頁找不到名稱欄');
    const names=lastRow>1?sheet.getRange(2,nameCol+1,lastRow-1,1).getDisplayValues():[];
    const order=[];names.forEach((value,index)=>{if(norm(value[0]))order.push(index+2);});
    moves.forEach(([source,target,side])=>{
      const from=order.indexOf(source);
      if(from<0)throw new Error('商品位置已變動，請重新整理後再排序');
      const moved=order.splice(from,1)[0];
      const targetIndex=order.indexOf(target);
      if(targetIndex<0)throw new Error('商品位置已變動，請重新整理後再排序');
      order.splice(targetIndex+(side==='a'?1:0),0,moved);
    });
    p.order=JSON.stringify(order);
  }
  if(p.order){
    let order=[];
    try{order=JSON.parse(p.order||'[]').map(Number);}catch(_){}
    if(!order.length||order.some(row=>!Number.isInteger(row)||row<2))throw new Error('排序資料格式錯誤');
    if(new Set(order).size!==order.length)throw new Error('排序資料包含重複商品');
    const lock=LockService.getScriptLock();lock.waitLock(30000);
    try{
      const sheet=sh(STOCK),lastRow=sheet.getLastRow(),lastCol=sheet.getLastColumn();
      if(order.some(row=>row>lastRow))throw new Error('商品資料位置已變動，請重新整理後再排序');
      const targetRows=[...order].sort((a,b)=>a-b);
      const first=targetRows[0],last=targetRows[targetRows.length-1];
      const range=sheet.getRange(first,1,last-first+1,lastCol);
      const values=range.getValues(),formulas=range.getFormulas();
      const sourceByRow=new Map();
      order.forEach(row=>{
        const index=row-first;
        sourceByRow.set(row,values[index].map((value,colIndex)=>formulas[index][colIndex]||value));
      });
      const output=values.map((row,rowIndex)=>row.map((value,colIndex)=>formulas[rowIndex][colIndex]||value));
      targetRows.forEach((target,index)=>{output[target-first]=sourceByRow.get(order[index]);});
      range.setValues(output);
      clearInventoryCache_();
    }finally{lock.releaseLock();}
    return {ok:true,count:order.length};
  }
  const fromRow=Number(p.fromRow),toRow=Number(p.toRow);
  const sheet=sh(STOCK);
  if(!Number.isInteger(fromRow)||!Number.isInteger(toRow)||fromRow<2||toRow<2||fromRow>sheet.getLastRow()||toRow>sheet.getLastRow())throw new Error('排序列號無效');
  if(fromRow!==toRow){
    const destination=fromRow<toRow?toRow+1:toRow;
    sheet.moveRows(sheet.getRange(fromRow,1),destination);
    SpreadsheetApp.flush();
  }
  clearInventoryCache_();
  return {ok:true,fromRow,toRow};
}

function importClosedInventory_(p){
 const ip=norm(p.ip);if(!ip)throw new Error('請選擇匯入目標 IP');
 const found=launchFind_(p.id);
 if(!found||found.g.status!=='已收單')throw new Error('找不到已結單團，請重新讀取');
 const ids=typeof p.itemIds==='string'?JSON.parse(p.itemIds):p.itemIds;
 if(!Array.isArray(ids)||!ids.length)throw new Error('請至少選一樣商品');
 const selected=[...new Set(ids)].map(id=>found.g.items.find(item=>String(item.id)===String(id)));
 if(selected.some(item=>!item))throw new Error('商品資料已變動，請重新讀取');
 const sheet=sh(STOCK),headers=sheet.getRange(1,1,1,sheet.getLastColumn()).getDisplayValues()[0].map(norm);
 if(col(headers,['IP','IP分類','IP類別','分類','類別'])<0)throw new Error('商品庫存找不到 IP 欄位');
 const rows=selected.map(item=>{
 const row=new Array(headers.length).fill(''),put=(names,value)=>{const i=col(headers,names);if(i>=0)row[i]=value==null?'':value;};
 put(['角色'],item.role);put(['名稱','商品名稱','品名','商品'],item.name);
 put(['商品網址','官網網址','商品連結','官網連結','網址','URL','連結','來源網址'],item.url);
 put(['貨號','商品貨號','條碼','SN'],item.code);put(['圖片','商品圖片','圖片網址','圖片連結','商品圖','照片'],(item.images||[]).join('\n'));
 put(['尺寸','大小','Size'],item.size);put(['原價','定價','原售價','牌價'],item.original);
 const price=num(item.price)>0?Math.ceil(num(item.price)):!/r/i.test(String(item.original||'').normalize('NFKC'))&&num(item.original)>0?Math.ceil(num(item.original)*.3):'';
 put(['售價','價格','銷售價'],price);put(['IP','IP分類','IP類別','分類','類別'],ip);put(['庫存','總庫存','數量','庫存量','商品庫存'],0);put(['店面','店面數量','店面庫存','店鋪庫存'],0);
 return row;
 });
 sheet.getRange(sheet.getLastRow()+1,1,rows.length,headers.length).setValues(rows);SpreadsheetApp.flush();clearInventoryCache_();return {ok:true,count:rows.length};
}

function addInventoryProduct(p){
  const role=norm(p.role),name=norm(p.name),url=norm(p.url),ip=norm(p.ip);
  if(!ip)throw new Error('請選擇上架目標 IP');
  if(!name)throw new Error('請輸入商品名稱');
  if(!/^https?:\/\//i.test(url))throw new Error('請輸入有效網址');
  let html='';
  try{html=UrlFetchApp.fetch(url,{followRedirects:true,muteHttpExceptions:true,headers:{'User-Agent':'Mozilla/5.0','Accept-Language':'zh-TW,zh;q=0.9,ja;q=0.8'}}).getContentText().slice(0,1800000);}catch(err){throw new Error('讀取商品網址失敗：'+err.message);}
  const meta=key=>{const escaped=key.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');const patterns=[new RegExp('<meta[^>]+(?:property|name)=["\\\']'+escaped+'["\\\'][^>]+content=["\\\']([^"\\\']+)','i'),new RegExp('<meta[^>]+content=["\\\']([^"\\\']+)["\\\'][^>]+(?:property|name)=["\\\']'+escaped+'["\\\']','i')];for(const re of patterns){const m=html.match(re);if(m)return m[1].replace(/&amp;/g,'&');}return '';};
  const text=html.replace(/<script[\s\S]*?<\/script>/gi,' ').replace(/<style[\s\S]*?<\/style>/gi,' ').replace(/<[^>]+>/g,' ').replace(/&nbsp;/g,' ').replace(/\s+/g,' ');
  const code=(text.match(/(?:貨號|品番|商品番号|SKU|型號)\s*[:：#]?\s*([A-Za-z0-9._-]{3,})/i)||[])[1]||'';
  const size=(text.match(/(?:尺寸|サイズ|Size)\s*[:：]?\s*([^｜|,，。]{1,50})/i)||[])[1]||'';
  const priceText=meta('product:price:amount')||(text.match(/(?:原價|定価|価格)\s*[:：]?\s*[¥￥$]?\s*([\d,]+)/i)||[])[1]||'';
  const image=meta('og:image')||meta('twitter:image');
  const sheet=sh(STOCK),headers=sheet.getRange(1,1,1,sheet.getLastColumn()).getDisplayValues()[0].map(norm);
  if(col(headers,['IP','IP分類','IP類別','分類','類別'])<0)throw new Error('商品庫存找不到 IP 欄位');
  const row=new Array(headers.length).fill('');
  const put=(names,value)=>{const i=col(headers,names);if(i>=0&&value!=='')row[i]=value;};
  put(['IP','IP分類','IP類別','分類','類別'],ip);put(['角色'],role);put(['名稱','商品名稱','品名','商品'],name);put(['商品網址','官網網址','商品連結','官網連結','網址','URL','連結','來源網址'],url);put(['貨號','商品貨號','條碼','SN'],code);put(['圖片','商品圖片','圖片網址','圖片連結','商品圖','照片'],image);put(['尺寸','大小','Size'],size);put(['原價','定價','原售價','牌價'],priceText.replace(/,/g,''));
  sheet.appendRow(row);SpreadsheetApp.flush();clearInventoryCache_();
  return {ok:true,row:sheet.getLastRow(),detected:{code,image,size,originalPrice:priceText}};
}

function checkInventoryAvailability(p){
  const row=Number(p.row);
  if(!Number.isInteger(row)||row<2)throw new Error('商品列號無效');
  const sheet=sh(STOCK);
  const lastCol=sheet.getLastColumn();
  const headers=sheet.getRange(1,1,1,lastCol).getDisplayValues()[0].map(x=>String(x).trim());
  let urlCol=col(headers,['商品網址','官網網址','商品連結','官網連結','網址','URL','url','連結','商品頁面','商品URL','購買網址','官方連結','產品連結','產品網址','官網','商品官網','來源網址']);
  if(urlCol<0)urlCol=headers.findIndex(header=>/(商品|產品|官方|官網|購買).*(網址|url|連結|link|頁面)/i.test(String(header))&&!/(圖片|照片|image|photo)/i.test(String(header)));
  if(urlCol<0)throw new Error('商品庫存分頁找不到商品網址欄');
  const urlCell=sheet.getRange(row,urlCol+1);
  let url=norm(urlCell.getValue())||norm(urlCell.getDisplayValue());
  if(!/^https?:\/\//i.test(url)){
    const formula=urlCell.getFormula();
    const match=formula.match(/HYPERLINK\s*\(\s*["'](https?:\/\/[^"']+)/i);
    if(match)url=match[1];
  }
  if(!/^https?:\/\//i.test(url)){
    try{url=norm(urlCell.getRichTextValue().getLinkUrl())||url;}catch(_){}
  }
  if(!/^https?:\/\//i.test(url))throw new Error('這筆商品沒有有效的 http/https 商品網址');

  let availability=null,detail='';
  try{
    const response=UrlFetchApp.fetch(url,{
      method:'get',followRedirects:true,muteHttpExceptions:true,timeoutSeconds:20,
      headers:{'User-Agent':'Mozilla/5.0 (compatible; JIWUStockCheck/1.0)','Accept-Language':'zh-TW,zh;q=0.9,ja;q=0.8,en;q=0.7'}
    });
    const code=response.getResponseCode();
    const html=response.getContentText().slice(0,1500000);
    if(code===404||code===410){availability=false;detail='商品頁不存在';}
    else if(code>=200&&code<400){availability=detectInventoryAvailability(html);if(availability==null)detail='網站有回應，但頁面沒有可辨識的貨況文字';}
    else detail='網站回傳 HTTP '+code;
  }catch(err){detail=String(err.message||err);}

  const status=availability===true?'⭕️':availability===false?'❌':'⚠️';
  const statusCol=findOrCreateInventoryAvailabilityColumn(sheet,headers);
  sheet.getRange(row,statusCol+1).setValue(status);
  let updatedStock='';
  const stockCol=col(headers,['庫存','總庫存','數量','庫存量','商品庫存']);
  const noteCol=col(headers,['備註','備註欄','說明']);
  if(availability===false&&stockCol>=0){
    const current=norm(sheet.getRange(row,stockCol+1).getValue());
    const note=noteCol>=0?sheet.getRange(row,noteCol+1).getDisplayValue():'';
    if(isInventoryZero_(current)&&!inventoryNoteHasUrl_(note)){updatedStock='x';sheet.getRange(row,stockCol+1).setValue('x');}
  }
  clearInventoryCache_();
  return {ok:true,row,status,stock:updatedStock,available:availability,url,detail,statusCol,statusHeader:headers[statusCol]||'官網貨況'};
}

/*
 * 僅供部署者在 Apps Script 編輯器手動執行一次，用來觸發
 * UrlFetchApp 的「連線至外部服務」授權。授權完成後不必重複執行。
 */
function authorizeInventoryUrlFetch(){
  const response=UrlFetchApp.fetch('https://www.google.com/generate_204',{
    method:'get',
    muteHttpExceptions:true
  });
  return response.getResponseCode();
}

function detectInventoryAvailability(html){
  const text=String(html||'');
  // Shopify 商品頁常以商品／變體 JSON 的 available:true 表示可直接加入購物車，
  // 不一定會把「カートに入れる」按鈕文字放在伺服器回傳的 HTML。
  if(/(?:["']available["']|data-available)\s*(?:=|:)\s*["']?true\b/i.test(text))return true;
  // ちいかわマーケット同時會在所有頁面放入「売り切れ」的共用模板；
  // 實際商品表單的可用送出按鈕優先於那些非目前商品的共用文字。
  const cartForms=[...text.matchAll(/<form\b[^>]*\baction=["']\/cart\/add["'][^>]*>[\s\S]{0,12000}?<\/form>/ig)];
  if(cartForms.some(match=>{
    const addButtons=match[0].match(/<button\b[^>]*\bname=["']add["'][^>]*>/ig)||[];
    return addButtons.some(button=>!/\bdisabled(?:\s|=|>)/i.test(button));
  }))return true;
  const ld=text.match(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/ig)||[];
  for(const script of ld){
    const body=script.replace(/^.*?>/,'').replace(/<\/script>.*$/i,'');
    const matches=body.match(/(?:availability|stockStatus)["']?\s*:\s*["']([^"']+)/ig)||[];
    for(const match of matches){
      if(/OutOfStock|SoldOut|Discontinued|InaccessibleForPurchase/i.test(match))return false;
      if(/InStock|LimitedAvailability|PreOrder|BackOrder/i.test(match))return true;
    }
  }
  const normalized=text.replace(/<[^>]+>/g,' ').replace(/&nbsp;|&#160;/gi,' ').replace(/\s+/g,' ').toLowerCase();
  if(/缺貨|无库存|無庫存|售罄|已售完|賣完|売り切れ|在庫なし|out\s+of\s+stock|sold\s*out|soldout|currently\s+unavailable|商品已下架/.test(normalized))return false;
  if(/有庫存|有货|有貨|現貨|在庫あり|在庫有り|カートに入れる|カートへ入れる|カートに追加|購入する|今すぐ購入|注文する|ご注文|in\s+stock|instock|加入購物車|立即購買|add\s+to\s+cart|buy\s+now/.test(normalized))return true;
  return null;
}

function findOrCreateInventoryAvailabilityColumn(sheet,headers){
  let index=col(headers,['官網貨況','官網狀態','商品網址貨況','網址貨況','網站貨況','官網狀態檢查','在庫狀態']);
  if(index>=0)return index;
  index=headers.findIndex(h=>h==='官網在庫');
  if(index>=0)return index;
  index=headers.findIndex(h=>h==='狀態'||h==='貨況');
  if(index>=0)return index;
  index=headers.length;
  sheet.getRange(1,index+1).setValue('官網貨況');
  headers[index]='官網貨況';
  return index;
}
/* =========================================================
   店面暫存購物車
   手機捷徑 / 手機網頁 / 電腦網頁共用
========================================================= */

const STORE_CART_PREFIX='JIWU_STORE_CART_';


function storeCartKey(){return STORE_CART_PREFIX+'SHARED_V1';}
function getStoreActiveSalesperson(){return {ok:true,salesperson:'shared'};}

/*
 * 使用 ScriptProperties。
 * 手機與電腦都可以讀到同一份購物車。
 */
function readStoreTempCart(){
  const props=PropertiesService.getScriptProperties();
  const raw=props.getProperty(storeCartKey());
  if(raw!==null){
    try{const items=JSON.parse(raw);return Array.isArray(items)?items:[];}catch(_){return [];}
  }
  // 第一次使用共用購物車時帶入既有兩份暫存，避免移除人員區分後遺失待結帳商品。
  const merged=new Map();
  ['花花','小法師'].forEach(user=>{
    let items=[];
    try{items=JSON.parse(props.getProperty(STORE_CART_PREFIX+user)||'[]');}catch(_){}
    if(!Array.isArray(items))return;
    items.forEach(item=>{
      const key=JSON.stringify([!!item.manual,norm(item.code),norm(item.name),num(item.price)]);
      const qty=Math.max(1,parseInt(item.qty||1,10)||1);
      if(merged.has(key))merged.get(key).qty+=qty;
      else merged.set(key,Object.assign({},item,{qty}));
    });
  });
  return [...merged.values()];
}

function writeStoreTempCart(salesperson,items){
  const key=storeCartKey(salesperson);

  PropertiesService
    .getScriptProperties()
    .setProperty(
      key,
      JSON.stringify(items||[])
    );
}


/*
 * 捷徑掃描商品
 *
 * 只：
 * 1. 查商品庫存
 * 2. 加入暫存購物車
 *
 * 不寫店面銷售
 * 不扣庫存
 */
function storeScan(p){
  const code=norm(
    p.barcode||
    p.code||
    p.id
  );

  const salesperson=validSalesperson(
    p.salesperson||
    p.user
  );

  if(!code){
    throw new Error('沒有貨號');
  }

  if(!salesperson){
    throw new Error('請指定銷售員（花花／小法師）');
  }

  PropertiesService.getScriptProperties().setProperty(
    STORE_ACTIVE_SALESPERSON_KEY,
    salesperson
  );

  const lock=LockService.getScriptLock();
  lock.waitLock(20000);

  try{
    const result=getStoreProduct({
      code:code,
      salesperson:salesperson
    });

    if(!result||result.ok===false){
      throw new Error(
        result&&result.error
          ?result.error
          :'找不到商品：'+code
      );
    }

    const product=result.product;

    const cart=readStoreTempCart(
      salesperson
    );

    const old=cart.find(x=>
      !x.manual&&
      norm(x.code)===norm(product.code)
    );

    if(old){
      Object.assign(old,{price:product.price,offerQty:product.offerQty,offerTotal:product.offerTotal});
      old.qty=
        Math.max(
          1,
          parseInt(old.qty||1,10)
        )+1;

    }else{
      cart.push({
        code:product.code,
        name:product.name,
        price:num(product.price),
        offerQty:product.offerQty,offerTotal:product.offerTotal,
        stock:num(product.stock),
        store:num(product.store),
        qty:1,
        manual:false
      });
    }

    writeStoreTempCart(
      salesperson,
      cart
    );

    return {
      ok:true,
      message:product.name+' $'+num(product.price),
      salesperson,
      product,
      cart
    };

  }finally{
    lock.releaseLock();
  }
}


/*
 * 前端取得暫存購物車
 */
function getStoreTempCart(p){
  const salesperson=validSalesperson(
    p.salesperson||
    p.user
  );

  if(!salesperson){
    return {
      ok:true,
      salesperson:'',
      cart:[]
    };
  }

  return {
    ok:true,
    salesperson,
    cart:refreshCartOffers_(readStoreTempCart(salesperson))
  };
}


/*
 * 前端修改整份購物車
 *
 * 包含：
 * - 數量 + -
 * - 刪除
 * - 手動商品
 */
function setStoreTempCart(p){
  const salesperson=validSalesperson(
    p.salesperson||
    p.user
  );

  if(!salesperson){
    throw new Error('請先選擇銷售員');
  }

  let items=[];

  try{
    items=JSON.parse(
      p.items||'[]'
    );
  }catch(_){
    throw new Error('商品清單格式錯誤');
  }

  if(!Array.isArray(items)){
    throw new Error('商品清單格式錯誤');
  }

  let clean=items
    .map(x=>({
      code:norm(x.code),
      name:norm(x.name),
      price:num(x.price),
      qty:Math.max(
        1,
        parseInt(x.qty||1,10)
      ),
      manual:!!x.manual,
      note:norm(x.note)
    }))
    .filter(x=>
      x.manual
        ?x.name!==''
        :x.code!==''
    );

  clean=refreshCartOffers_(clean);
  writeStoreTempCart(
    salesperson,
    clean
  );

  return {
    ok:true,
    salesperson,
    cart:clean
  };
}


/*
 * 清空暫存購物車
 */
function clearStoreTempCart(p){
  const salesperson=validSalesperson(
    p.salesperson||
    p.user
  );

  if(!salesperson){
    throw new Error('請指定銷售員');
  }

  PropertiesService
    .getScriptProperties()
    .setProperty(
      storeCartKey(), '[]'
    );

  return {
    ok:true,
    salesperson,
    cart:[]
  };
}
function makeStoreSaleRow(
  headers,
  product,
  salesperson,
  payment,
  note,
  received,
  change,
  firstRow,
  saleTime
){
  const row=new Array(headers.length).fill('');

  const set=(names,value)=>{
    const i=col(headers,names);
    if(i>=0)row[i]=value;
  };

  set(['時間','購買時間'],saleTime||new Date());
  set(['來源'],'店面');
  set(['IP','團名'],product.group||'');
  set(['名稱','商品名稱'],product.name||'');
  set(['售價','價格','金額'],num(product.price));
  set(['貨號','商品貨號','SN'],product.code||'');
  set(['銷售員','業務','人員'],'');
  set(['付款方式','支付方式'],payment==='現金'?'💰':(payment||''));
  set(['備註','備註欄'],[note,norm(product.note)].filter(Boolean).join('｜'));

  if(firstRow){
    set(
      ['收到金額'],
      received===''?'':num(received)
    );

    set(
      ['找零'],
      change===''?'':num(change)
    );
  }

  set(['扣庫存'],false);

  return row;
}

function writeColumnRuns(sheet,column,entries){
  if(column<1||!entries.length)return;
  entries.sort((a,b)=>a[0]-b[0]);
  let start=0;
  while(start<entries.length){
    let end=start+1;
    while(end<entries.length&&entries[end][0]===entries[end-1][0]+1)end++;
    sheet.getRange(entries[start][0],column,end-start,1)
      .setValues(entries.slice(start,end).map(entry=>[entry[1]]));
    start=end;
  }
}

function storeCheckout(p){
  const lock=LockService.getScriptLock();
  lock.waitLock(20000);

  try{
    const items=JSON.parse(p.items||'[]');

    if(!items.length){
      throw new Error('沒有商品');
    }

    const salesperson=validSalesperson(
      p.salesperson||p.user
    );

    const saleSheet=ss().getSheetByName(STORE);

    const saleHeaders=saleSheet
      ?saleSheet
        .getRange(
          1,
          1,
          1,
          Math.max(1,saleSheet.getLastColumn())
        )
        .getValues()[0]
        .map(norm)
      :[];

    const stockData=values(STOCK,true);
    const stockMap=buildStockMap(stockData);

    const normalItems=[];
    const manualItems=[];

    const ni=col(
      stockData.headers,
      ['名稱','商品名稱']
    );

    const ri=col(
      stockData.headers,
      ['角色']
    );

    const pi=col(
      stockData.headers,
      ['售價','價格']
    );

    items.forEach(item=>{
      const qty=Math.max(
        1,
        parseInt(item.qty||1,10)
      );

      if(item.manual){
        manualItems.push({
          code:'',
          name:norm(item.name),
          price:num(item.price),
          qty,
          note:norm(item.note)
        });
        return;
      }

      const code=norm(item.code);

      if(!code){
        throw new Error('商品缺少貨號');
      }

      const found=stockMap.get(code);

      if(!found){
        throw new Error('找不到商品：'+code);
      }

      const role=ri>=0
        ?norm(found.data[ri])
        :'';

      const existing=normalItems.find(entry=>entry.row===found.row);
      if(existing){existing.qty+=qty;existing.note=[...new Set([existing.note,norm(item.note)].filter(Boolean))].join('｜');return;}
      normalItems.push({
        ...inventoryOffer_(stockData.headers,found.data),
        code,
        name:productNameWithRole(
          ni>=0?found.data[ni]:'',
          role
        ),
        price:pi>=0
          ?num(found.data[pi])
          :num(item.price),
        qty,
        row:found.row,
        index:found.index,
        note:norm(item.note)
      });
    });

    const checkoutTotal=[...normalItems,...manualItems].reduce((sum,item)=>sum+Math.round(quantityOffer(item).total*100),0)/100;
    if(p.total!=null&&Math.round(num(p.total)*100)!==Math.round(checkoutTotal*100))throw new Error('商品價格或數量優惠已更新，請重新整理購物車後再結帳');
    const checkoutChange=p.received===''||p.received==null?'':Math.round((num(p.received)-checkoutTotal)*100)/100;
    const deduction={};

    normalItems.forEach(item=>{
      deduction[item.code]=
        (deduction[item.code]||0)+item.qty;
    });

    const si=col(
      stockData.headers,
      ['庫存']
    );

    const sti=col(
      stockData.headers,
      ['店面']
    );

    const inventoryWrites=[];
    const storeWrites=[];
    Object.keys(deduction).forEach(code=>{
      const found=stockMap.get(code);
      if(!found)return;

      const qty=deduction[code];
      const r=found.data;

      if(si>=0&&norm(r[si])!=='')inventoryWrites.push([found.row,num(r[si])-qty]);
      if(sti>=0&&norm(r[sti])!=='')storeWrites.push([found.row,num(r[sti])-qty]);
    });
    writeColumnRuns(stockData.sheet,si+1,si>=0?inventoryWrites:[]);
    writeColumnRuns(stockData.sheet,sti+1,sti>=0?storeWrites:[]);
    const statusHeaders=stockData.headers.map(norm);
    inventoryWrites.forEach(([row,remaining])=>clearInventoryStatusIfPositive_(stockData.sheet,statusHeaders,row,remaining));

    let salesDelta=null;
    if(saleSheet){
      const rows=[];
      const checkoutTime=new Date();
      let first=true;

      const payment=norm(p.payment);
      const note=norm(p.note);

      const received=
        p.received===''||
        p.received==null
          ?''
          :num(p.received);

      const change=checkoutChange;

      normalItems.forEach(item=>{
        for(let i=0;i<item.qty;i++){
          rows.push(
            makeStoreSaleRow(
              saleHeaders,
              Object.assign({},item,{price:offerUnitPrice_(item,i)}),
              salesperson,
              payment,
              note,
              received,
              change,
              first,
              checkoutTime
            )
          );

          first=false;
        }
      });

      manualItems.forEach(item=>{
        for(let i=0;i<item.qty;i++){
          rows.push(
            makeStoreSaleRow(
              saleHeaders,
              item,
              salesperson,
              payment,
              note,
              received,
              change,
              first,
              checkoutTime
            )
          );

          first=false;
        }
      });

      if(rows.length){
        const startRow=saleSheet.getLastRow()+1;
        const timei=col(saleHeaders,['時間','購買時間']);
        const namei=col(saleHeaders,['名稱','商品名稱']);
        const codei=col(saleHeaders,['貨號','商品貨號','SN']);
        const amounti=col(saleHeaders,['售價','價格','金額']);
        const notei=col(saleHeaders,['備註','備註欄']);
        const payi=col(saleHeaders,['付款方式','支付方式']);
        const deltaItems=rows.map((row,index)=>{
          const rawTime=timei>=0?row[timei]:new Date();
          const date=rawTime instanceof Date
            ?Utilities.formatDate(rawTime,'Asia/Taipei','yyyy-MM-dd')
            :Utilities.formatDate(new Date(),'Asia/Taipei','yyyy-MM-dd');
          const time=rawTime instanceof Date
            ?Utilities.formatDate(rawTime,'Asia/Taipei','HH:mm')
            :'';
          return {row:startRow+index,orderId:'checkout-'+startRow,time,
            name:namei>=0?norm(row[namei]):'',code:codei>=0?norm(row[codei]):'',
            amount:amounti>=0?num(row[amounti]):0,
            payment:payi>=0?norm(row[payi]):norm(p.payment),note:notei>=0?norm(row[notei]):'',date};
        });
        salesDelta={date:deltaItems[0].date,items:deltaItems};

        saleSheet
          .getRange(
            startRow,
            1,
            rows.length,
            saleHeaders.length
          )
          .setValues(rows);

        const checkCol=col(
          saleHeaders,
          ['扣庫存']
        );

        if(checkCol>=0){
          const targetRange=saleSheet.getRange(
            startRow,
            checkCol+1,
            rows.length,
            1
          );

          targetRange.insertCheckboxes();
          const codeColumn=col(saleHeaders,['貨號','商品貨號','SN']);
          targetRange.setValues(rows.map(row=>[
            codeColumn>=0&&norm(row[codeColumn])!==''
          ]));
        }
        mergeNewStoreSalePayment(saleSheet,saleHeaders,startRow,rows.length);
      }
    }

    const total=checkoutTotal;
/*
 * 正式結帳完成後，
 * 才清除手機 / 電腦共用暫存購物車。
 */
if(salesperson){
  PropertiesService
    .getScriptProperties()
    .setProperty(
      storeCartKey(), '[]'
    );
}
    return {
      ok:true,
      message:'結帳完成',
      total,
      received:
        p.received===''||
        p.received==null
          ?''
          :num(p.received),
      change:checkoutChange,
      payment:norm(p.payment),
      salesperson,
      salesDelta,
      count:
        normalItems.reduce(
          (s,x)=>s+x.qty,
          0
        )+
        manualItems.reduce(
          (s,x)=>s+x.qty,
          0
        )
    };
  }finally{
    lock.releaseLock();
  }
}

/* =========================================================
   舊版單筆掃碼
========================================================= */

function handleStoreSale(d){
  const barcode=norm(
    d.barcode||d.code
  );

  const salesperson=validSalesperson(
    d.salesperson||d.user
  );

  if(!barcode){
    return '錯誤：沒有條碼';
  }

  if(!salesperson){
    return '錯誤：請指定銷售員（花花／小法師）';
  }

  const lock=LockService.getScriptLock();
  lock.waitLock(20000);

  try{
    const stock=values(STOCK);
    const found=findStockProduct(
      stock,
      barcode
    );

    if(!found){
      return '錯誤：找不到商品 '+barcode;
    }

    const ni=col(
      stock.headers,
      ['名稱','商品名稱']
    );

    const ri=col(
      stock.headers,
      ['角色']
    );

    const pi=col(
      stock.headers,
      ['售價','價格']
    );

    const si=col(
      stock.headers,
      ['庫存']
    );

    const sti=col(
      stock.headers,
      ['店面']
    );

    const role=ri>=0
      ?norm(found.data[ri])
      :'';

    const product={
      code:barcode,
      name:productNameWithRole(
        ni>=0?found.data[ni]:'',
        role
      ),
      price:pi>=0
        ?num(found.data[pi])
        :0
    };

    const sale=sh(STORE);

    const headers=sale
      .getRange(
        1,
        1,
        1,
        Math.max(1,sale.getLastColumn())
      )
      .getValues()[0]
      .map(norm);

    const row=makeStoreSaleRow(
      headers,
      product,
      salesperson,
      '',
      '',
      '',
      '',
      true
    );

    sale.appendRow(row);

    if(si>=0&&norm(found.data[si])!==''){
      stock.sheet
        .getRange(found.row,si+1)
        .setValue(
          num(found.data[si])-1
        );
    }

    if(sti>=0&&norm(found.data[sti])!==''){
      stock.sheet
        .getRange(found.row,sti+1)
        .setValue(
          num(found.data[sti])-1
        );
    }

    return (
      product.name+
      '\n$'+
      product.price
    );
  }finally{
    lock.releaseLock();
  }
}

/* =========================================================
   出貨
========================================================= */

function getShip(){
  const s=ss().getSheetByName(SHIP);

  if(!s){
    return {
      ok:true,
      headers:[],
      rows:[]
    };
  }

  const d=values(SHIP,true);
  const freighti=col(d.headers,['運費']);
  const needsFreight=freighti<0||d.rows.some(r=>r[freighti]==='');
  const online=needsFreight?getOnline():{headers:[],rows:[]};
  const onlineCustomeri=col(online.headers,['顧客名稱','客戶名稱','客人名稱','姓名']);
  const onlineNamei=col(online.headers,['名稱','商品名稱']);
  const onlineTimei=col(online.headers,['購買時間','時間']);
  const onlineShippingi=col(online.headers,['運費']);
  const shippingByOrder={};

  online.rows.forEach(x=>{
    const key=[
      norm(x.data[online.headers[onlineCustomeri]]),
      formatOnlineTimeBatch(x.data[online.headers[onlineTimei]],''),
      norm(x.data[online.headers[onlineNamei]])
    ].join('|');
    shippingByOrder[key]=onlineShippingi>=0
      ?num(x.data[online.headers[onlineShippingi]])
      :0;
  });

  const headers=d.headers.slice();
  if(col(headers,['運費'])<0)headers.push('運費');
  const shipCustomeri=col(d.headers,['客戶名稱','顧客名稱','客人名稱','姓名']);
  const shipNamei=col(d.headers,['名稱','商品名稱']);
  const shipTimei=col(d.headers,['時間']);

  return {
    ok:true,
    headers,
    rows:d.rows.map((r,i)=>{
      const data=rowObj(d.headers,r);
      const key=[
        norm(r[shipCustomeri]),
        formatOnlineTimeBatch(r[shipTimei],''),
        norm(r[shipNamei])
      ].join('|');
      data['運費']=freighti>=0&&r[freighti]!==''?num(r[freighti]):(shippingByOrder[key]||0);
      return {row:i+2,data};
    })
  };
}

function ensureShipSheet(){
  let s=ss().getSheetByName(SHIP);

  if(!s){
    s=ss().insertSheet(SHIP);

    s.appendRow([
      '時間',
      '客戶名稱',
      '貨號',
      '名稱',
      '售價',
      '訂金',
      '尾款'
    ]);
  }

  return s;
}

function createShip(p){
  const lock=LockService.getScriptLock();lock.waitLock(20000);
  try{return createShipLocked_(p);}finally{lock.releaseLock();}
}
function createShipLocked_(p){
  const rows=JSON.parse(p.rows||'[]');

  if(!rows.length){
    throw new Error('沒有選擇要出貨的商品');
  }

  const od=getOnline(true);
  const liveRowMap=new Map(od.rows.map(row=>[Number(row.row),row]));
  const rowMap=new Map(liveRowMap),statusRows=new Map(),usedLiveRows=new Set();
  const selected=[...new Set(rows.map(Number))];
  if(selected.some(row=>!Number.isInteger(row)||row<2))throw new Error('勾選商品列號無效');
  if(p.expected!==undefined){
    const expected=JSON.parse(p.expected||'[]');
    const expectedMap=new Map(expected.map(item=>[Number(item.row),item.data]));
    if(expectedMap.size!==selected.length)throw new Error('勾選商品資料不完整');
    const fields=[['顧客名稱','客戶名稱','客人名稱','姓名'],['名稱','商品名稱'],['貨號','商品貨號','SN'],['購買時間','時間']];
    selected.forEach(row=>{
      const original=expectedMap.get(row);
      if(!original||typeof original!=='object')throw new Error('缺少勾選商品內容');
      // 出貨內容以畫面勾選快照為準；實際列號只用來回寫已開單。
      rowMap.set(row,{row,data:original});
      const matches=item=>item&&!usedLiveRows.has(Number(item.row))&&fields.every(names=>{
        const i=col(od.headers,names);return i<0||String(original[od.headers[i]]??'')===String(item.data[od.headers[i]]??'');
      });
      let target=liveRowMap.get(row);
      if(!matches(target)){
        const candidates=od.rows.filter(matches);
        target=candidates.length===1?candidates[0]:null;
      }
      if(target){statusRows.set(row,Number(target.row));usedLiveRows.add(Number(target.row));}
    });
  }else{
    selected.forEach(row=>{if(!rowMap.has(row))throw new Error('缺少勾選商品內容');statusRows.set(row,row);});
  }
  const s=ensureShipSheet();

  const hi=od.headers;

  const ci=col(
    hi,
    ['顧客名稱','客戶名稱','客人名稱','姓名']
  );

  const codei=col(
    hi,
    ['貨號','商品貨號','SN']
  );

  const namei=col(
    hi,
    ['名稱','商品名稱']
  );

  const pricei=col(
    hi,
    ['售價','價格']
  );

  const shippingi=col(
    hi,
    ['運費']
  );

  const depositi=col(
    hi,
    ['訂金']
  );

  const timei=col(
    hi,
    ['購買時間','時間']
  );

  const shippedCol=col(
    hi,
    ['出貨','已出貨','出貨狀態']
  );

  const openedCol=col(
    hi,
    ['已開單','開單']
  );

  const statusCol=col(hi,['狀態','訂購狀態']);
  const createdRows=[];
  const selectedRows=selected;

  const appendData=[];

  const shipHeaders=s
    .getRange(
      1,
      1,
      1,
      Math.max(1,s.getLastColumn())
    )
    .getValues()[0]
    .map(norm);

  if(!shipHeaders.includes('運費')){
    shipHeaders.push('運費');
    if(shipHeaders.length>s.getMaxColumns())s.insertColumnAfter(s.getMaxColumns());
    s.getRange(1,shipHeaders.length).setValue('運費');
  }
  selectedRows.forEach(sheetRow=>{
    const r=rowMap.get(sheetRow);

    if(!r)return;

    const customer=
      ci>=0
        ?norm(r.data[hi[ci]])
        :'';

    const code=
      codei>=0
        ?norm(r.data[hi[codei]])
        :'';

    const name=
      namei>=0
        ?norm(r.data[hi[namei]])
        :'';

    const price=
      pricei>=0
        ?num(r.data[hi[pricei]])
        :0;

    const shipping=
      shippingi>=0
        ?num(r.data[hi[shippingi]])
        :0;

    const deposit=
      depositi>=0
        ?num(r.data[hi[depositi]])
        :0;

    const balance=Math.max(0,price+shipping-deposit);

    const rawTime=
      timei>=0
        ?r.data[hi[timei]]
        :'';

    const time=formatOnlineTimeBatch(
      rawTime,
      ''
    );

    const outRow=
      new Array(shipHeaders.length).fill('');

    const set=(names,value)=>{
      const i=col(shipHeaders,names);

      if(i>=0){
        outRow[i]=value;
      }
    };

    set(['時間'],time);
    set(['客戶名稱','顧客名稱','客人名稱','姓名'],customer);
    set(['貨號','商品貨號','SN'],code);
    set(['名稱','商品名稱'],name);
    set(['售價','價格'],price);
    set(['訂金'],deposit);
    set(['尾款'],balance);
    set(['運費'],shipping);

    appendData.push(outRow);

    createdRows.push(sheetRow);
  });

  if(appendData.length){
    s.getRange(
      s.getLastRow()+1,
      1,
      appendData.length,
      shipHeaders.length
    ).setValues(appendData);
  }

  // 出貨資料寫入成功後，才同步標記原線上訂單。
  const onlineSheet=ss().getSheetByName(ONLINE);
  createdRows.forEach(selectedRow=>{
    const sheetRow=statusRows.get(selectedRow);
    if(!sheetRow)return;
    if(shippedCol>=0)odWriteOnlineShipmentStatus(sheetRow,shippedCol,od);
    if(openedCol>=0)onlineSheet.getRange(sheetRow,openedCol+1).setValue(true);
    if(statusCol>=0)onlineSheet.getRange(sheetRow,statusCol+1).setValue('已開單');
  });
  clearOnlineCache();

  return {
    ok:true,
    count:appendData.length,
    rows:createdRows,
    statusRows:[...statusRows.values()]
  };
}

function odWriteOnlineShipmentStatus(
  row,
  shippedCol,
  od
){
  const onlineSheet=ss().getSheetByName(ONLINE);

  if(!onlineSheet)return;

  onlineSheet
    .getRange(
      row,
      shippedCol+1
    )
    .setValue('已產出出貨單');
}

function setShip(p){
  const row=parseInt(p.row,10);
  const status=norm(p.status)||'已出貨';

  if(!row){
    throw new Error('缺少出貨列');
  }

  const s=ensureShipSheet();

  const h=s
    .getRange(
      1,
      1,
      1,
      Math.max(1,s.getLastColumn())
    )
    .getValues()[0]
    .map(norm);

  const ci=col(
    h,
    ['出貨狀態']
  );

  /*
   * 新版出貨記錄沒有出貨狀態欄。
   * 如果舊表有此欄位則照舊更新。
   */
  if(ci>=0){
    s.getRange(
      row,
      ci+1
    ).setValue(status);
  }

  return {
    ok:true
  };
}

/* 刪除出貨卡對應的出貨記錄，倒序刪列避免列號位移。 */
function deleteShipOrder(p){
  const rows=JSON.parse(p.rows||'[]');
  if(!Array.isArray(rows)||!rows.length||rows.some(r=>!Number.isInteger(r)||r<2))throw new Error('出貨列格式錯誤');
  const lock=LockService.getScriptLock();lock.waitLock(20000);
  try{
    const sheet=ss().getSheetByName(SHIP);
    if(!sheet||rows.some(r=>r>sheet.getLastRow()))throw new Error('找不到出貨列，請重新整理');
    const ids=[...new Set(rows)].sort((a,b)=>b-a);
    ids.forEach(row=>sheet.deleteRow(row));
    return {ok:true,count:ids.length};
  }finally{lock.releaseLock();}
}

/* 包貨完成獨立記錄，避免與真正的出貨狀態混淆。 */
function setShipPacked(p){
  const rows=JSON.parse(p.rows||'[]');
  if(!Array.isArray(rows)||!rows.length||rows.some(r=>!Number.isInteger(r)||r<2)){
    throw new Error('出貨列格式錯誤');
  }
  const packed=String(p.packed)==='true';
  const lock=LockService.getScriptLock();
  lock.waitLock(20000);
  try{
    const sheet=ensureShipSheet();
    if(rows.some(r=>r>sheet.getLastRow()))throw new Error('找不到出貨列，請重新整理');
    const headers=sheet.getRange(1,1,1,Math.max(1,sheet.getLastColumn())).getValues()[0].map(norm);
    let ci=col(headers,['已包貨']);
    if(ci<0){
      ci=headers.length;
      if(ci+1>sheet.getMaxColumns())sheet.insertColumnAfter(sheet.getMaxColumns());
      sheet.getRange(1,ci+1).setValue('已包貨');
    }
    let timei=col(headers,['包貨完成時間']);
    if(timei<0){
      timei=sheet.getLastColumn();
      if(timei+1>sheet.getMaxColumns())sheet.insertColumnAfter(sheet.getMaxColumns());
      sheet.getRange(1,timei+1).setValue('包貨完成時間');
    }
    const ids=[...new Set(rows)];
    const completedAt=packed?new Date().toISOString():'';
    sheet.getRangeList(ids.map(row=>sheet.getRange(row,timei+1).getA1Notation())).setValue(completedAt);
    sheet.getRangeList(ids.map(row=>sheet.getRange(row,ci+1).getA1Notation())).setValue(packed);
    return {ok:true,packed,completedAt,count:ids.length};
  }finally{lock.releaseLock();}
}

/* 結帳只合併這次新增的同一筆店面銷售資料。 */
function mergeNewStoreSalePayment(sheet,headers,startRow,rowCount){
  const paymenti=col(headers,['付款方式','支付方式']);
  const timei=col(headers,['時間','購買時間']);
  if(!sheet||paymenti<0||timei<0||rowCount<2)return false;
  const times=sheet.getRange(startRow,timei+1,rowCount,1).getValues().map(row=>row[0]);
  const payments=sheet.getRange(startRow,paymenti+1,rowCount,1).getValues().map(row=>norm(row[0]));
  const sameTime=times.every(value=>value instanceof Date&&times[0] instanceof Date
    ?value.getTime()===times[0].getTime():norm(value)===norm(times[0]));
  const samePayment=payments.every(value=>value===payments[0]);
  if(!sameTime||!samePayment)return false;
  const range=sheet.getRange(startRow,paymenti+1,rowCount,1);
  if(range.isPartOfMerge())return false;
  range.getCell(1,1).setValue(payments[0]);
  range.offset(1,0,rowCount-1,1).clearContent();
  range.mergeVertically();
  return true;
}

function getStoreSales(){
  const d=values(STORE,true);
  const ti=col(d.headers,['時間','購買時間']);
  const ni=col(d.headers,['名稱','商品名稱']);
  const pi=col(d.headers,['售價','價格','金額']);
  const payi=col(d.headers,['付款方式','支付方式']);
  const codei=col(d.headers,['貨號','商品貨號','SN']);
  const notei=col(d.headers,['備註','備註欄']);
  const hiddenColumns=d.headers.map((header,index)=>({header,index,hidden:d.sheet.isColumnHiddenByUser(index+1)})).filter(item=>item.hidden&&item.header&&!['備註','備註欄'].includes(norm(item.header)));
  if(ti<0||pi<0)throw new Error('店面銷售缺少時間或售價欄位');
  const today=Utilities.formatDate(new Date(),'Asia/Taipei','yyyy-MM-dd');
  // 只讀付款欄的合併範圍，以實際合併界線判斷同一筆購買。
  const mergedPayments=new Map();
  if(payi>=0&&d.rows.length){
    const ranges=d.sheet.getRange(2,payi+1,d.rows.length,1).getMergedRanges();
    ranges.forEach(range=>{
      const first=range.getRow();
      const last=first+range.getNumRows()-1;
      const payment=first>=2&&d.rows[first-2]?norm(d.rows[first-2][payi]):'';
      for(let row=Math.max(2,first);row<=Math.min(last,d.rows.length+1);row++){
        mergedPayments.set(row,{payment,orderId:'merged-'+first});
      }
    });
  }
  // 舊版結帳資料可能沒有合併付款儲存格；同一次結帳會寫入完全相同的時間，
  // 並以連續列寫入店面商品。以「連續列＋精確時間＋付款方式」補回單據分組。
  const legacyCheckoutOrders=new Map();
  const sourcei=col(d.headers,['來源']);
  if(ti>=0&&payi>=0&&sourcei>=0){
    let index=0;
    while(index<d.rows.length){
      const rowNumber=index+2;
      if(mergedPayments.has(rowNumber)){index++;continue;}
      const row=d.rows[index],timeValue=row[ti],source=norm(row[sourcei]),payment=norm(row[payi]);
      if(source!=='店面'||!(timeValue instanceof Date)||!payment){index++;continue;}
      const timestamp=timeValue.getTime();let end=index+1;
      while(end<d.rows.length){
        const nextRowNumber=end+2,next=d.rows[end],nextTime=next[ti];
        if(mergedPayments.has(nextRowNumber)||norm(next[sourcei])!=='店面'||!(nextTime instanceof Date)||nextTime.getTime()!==timestamp||norm(next[payi])!==payment)break;
        end++;
      }
      if(end-index>1){
        const orderId='legacy-checkout-'+rowNumber;
        for(let cursor=index;cursor<end;cursor++)legacyCheckoutOrders.set(cursor+2,orderId);
      }
      index=end;
    }
  }
  const groups={};
  let undated=0;
  d.rows.forEach((r,index)=>{
    if(r.every(v=>v===''||v==null))return;
    let date='',time='';
    const raw=r[ti];
    if(Object.prototype.toString.call(raw)==='[object Date]'&&!isNaN(raw.getTime())){
      date=Utilities.formatDate(raw,'Asia/Taipei','yyyy-MM-dd');
      time=Utilities.formatDate(raw,'Asia/Taipei','HH:mm');
    }else{
      const match=norm(raw).match(/^(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})(?:[ T](\d{1,2}):(\d{2}))?/);
      if(match){date=match[1]+'-'+match[2].padStart(2,'0')+'-'+match[3].padStart(2,'0');time=match[4]?match[4].padStart(2,'0')+':'+match[5]:'';}
    }
    if(!date){undated++;return;}
    const merged=mergedPayments.get(index+2);
    const payment=merged?merged.payment:(payi>=0?norm(r[payi]):'');
    const amount=num(r[pi]);
    const pickup=['面交','自取'].includes(ni>=0?norm(r[ni]):'');
    const cash=pickup||payment==='💰'||payment==='現金';
    const transfer=/^(中信|LB|LP|IPASS|轉帳|匯款)/i.test(payment);
    const day=groups[date]||(groups[date]={date,total:0,cash:0,transfer:0,other:0,items:[]});
    if(!pickup)day.total+=amount;
    if(cash)day.cash+=amount;else if(transfer)day.transfer+=amount;else day.other+=amount;
    const hidden={};hiddenColumns.forEach(item=>{const value=r[item.index];if(value!==''&&value!=null)hidden[item.header]=value instanceof Date?Utilities.formatDate(value,'Asia/Taipei','yyyy-MM-dd HH:mm'):value;});
    day.items.push({row:index+2,orderId:merged?merged.orderId:(legacyCheckoutOrders.get(index+2)||'row-'+(index+2)),time,name:ni>=0?norm(r[ni]):'',code:codei>=0?norm(r[codei]):'',note:notei>=0?norm(r[notei]):'',amount,payment,hidden});
  });
  return {ok:true,schema:'store-sales-v2',today,undated,days:Object.keys(groups).sort().map(date=>{
    const day=groups[date];day.items.sort((a,b)=>a.time.localeCompare(b.time)||a.row-b.row);return day;
  })};
}

function updateStoreSaleNote(p){
  const sheet=sh(STORE),row=Number(p.row);
  if(!Number.isInteger(row)||row<2||row>sheet.getLastRow())throw new Error('銷售商品列無效');
  const headers=sheet.getRange(1,1,1,sheet.getLastColumn()).getDisplayValues()[0].map(norm);
  const index=col(headers,['備註','備註欄']);if(index<0)throw new Error('店面銷售找不到備註欄');
  const cell=sheet.getRange(row,index+1);
  // 將既有合併備註保留到每項商品，再編輯指定商品。
  cell.getMergedRanges().forEach(range=>{const value=range.getCell(1,1).getValue();range.breakApart();range.setValue(value);});
  cell.setValue(String(p.note||'').trim());
  return {ok:true,row,note:String(p.note||'').trim()};
}

function updateStoreSalePayment(p){
  let rawRows=p.rows;
  if(typeof rawRows==='string'){try{rawRows=JSON.parse(rawRows);}catch(_){rawRows=rawRows.split(',');}}
  const rows=[...new Set((Array.isArray(rawRows)?rawRows:[rawRows]).map(Number).filter(row=>Number.isInteger(row)&&row>=2))];
  if(!rows.length)throw new Error('找不到銷售商品列');
  const method=norm(p.method),code=method==='LP'?String(p.last5||'').trim():String(p.last5||'').replace(/\D/g,'').slice(0,5);
  if(!['現金','中信','LB','LP','ipass'].includes(method))throw new Error('付款方式無效');
  if(['中信','LB'].includes(method)&&code&&!/^\d{5}$/.test(code))throw new Error('請輸入 5 碼後五碼');
  const value=method==='現金'?'💰':(['中信','LB','LP'].includes(method)&&code?(method==='中信'?'中信'+code:method+' '+code):method);
  const sheet=sh(STORE),headers=sheet.getRange(1,1,1,sheet.getLastColumn()).getDisplayValues()[0].map(norm);
  const paymentCol=col(headers,['付款方式','支付方式']);if(paymentCol<0)throw new Error('店面銷售找不到付款方式欄');
  const cells=new Set();
  rows.forEach(row=>{const cell=sheet.getRange(row,paymentCol+1);if(cell.isPartOfMerge()){const ranges=cell.getMergedRanges();cells.add(sheet.getRange(ranges[0].getRow(),paymentCol+1).getA1Notation());}else cells.add(cell.getA1Notation());});
  cells.forEach(a1=>sheet.getRange(a1).setValue(value));
  SpreadsheetApp.flush();
  return {ok:true,rows,method,value};
}

function addStoreSale(p){
  const name=norm(p.name),amountText=norm(p.amount).replace(/[，,]/g,''),note=norm(p.note);
  if(!name)throw new Error('請輸入名稱');
  if(!/^-?\d+(?:\.\d+)?$/.test(amountText))throw new Error('金額必須是有效數字');
  const sheet=sh(STORE),headers=sheet.getRange(1,1,1,sheet.getLastColumn()).getDisplayValues()[0].map(norm),row=new Array(headers.length).fill('');
  const put=(names,value)=>{const i=col(headers,names);if(i>=0)row[i]=value;};
  put(['時間','購買時間'],new Date());put(['名稱','商品名稱'],name);put(['售價','價格','金額'],Number(amountText));put(['備註','備註欄'],note);put(['付款方式','支付方式'],'現金');
  sheet.appendRow(row);SpreadsheetApp.flush();
  return {ok:true,row:sheet.getLastRow()};
}

/* 補貨登記買到後直接更新原始列，不新增訂單。 */
function purchaseRestock(p){
  const row=Number(p.row);
  if(!Number.isInteger(row)||row<2)throw new Error('補貨列格式錯誤');
  const lock=LockService.getScriptLock();lock.waitLock(20000);
  try{
    const d=values(ONLINE,true);
    if(row>d.rows.length+1)throw new Error('資料位置已變動，請重新整理');
    const r=d.rows[row-2];
    const ci=col(d.headers,['顧客名稱','客戶名稱','客人名稱','姓名']);
    const ni=col(d.headers,['名稱','商品名稱']);
    const gi=col(d.headers,['團名','團組','團','開團名稱']);
    const cargo=col(d.headers,['貨況','狀態']);
    const time=col(d.headers,['購買時間','時間']);
    const ordered=col(d.headers,['已訂購','購買','訂購']);
    const status=col(d.headers,['狀態','訂購狀態']);
    if(status<0)throw new Error('缺少狀態欄位');
    if(ci<0||ni<0||cargo<0||time<0)throw new Error('缺少顧客、商品、貨況或時間欄位');
    if(norm(r[ci])!==norm(p.customer)||norm(r[ni])!==norm(p.name)||(gi>=0&&norm(r[gi])!==norm(p.group))){
      throw new Error('資料位置已變動，請重新整理後再勾選');
    }
    const changes={};
    if(normalizeCargo(r[cargo])!=='補貨登記'){
      if(norm(r[status])!=='已訂購'&&norm(r[cargo])!=='已訂購')throw new Error('商品已不是補貨登記，請重新整理');
      if(norm(r[cargo])==='已訂購')d.sheet.getRange(row,cargo+1).setValue('預訂');
      d.sheet.getRange(row,status+1).setValue('已訂購');
      clearOnlineCache();
      changes[d.headers[cargo]]='預訂';changes[d.headers[status]]='已訂購';
      changes[d.headers[time]]=formatOnlineTimeBatch(r[time],'');
      if(ordered>=0)changes[d.headers[ordered]]=r[ordered];
      return {ok:true,row,changes};
    }
    const now=new Date();
    d.sheet.getRange(row,time+1).setValue(now);
    if(ordered>=0)d.sheet.getRange(row,ordered+1).setValue(true);
    d.sheet.getRange(row,cargo+1).setValue('預訂');
    d.sheet.getRange(row,status+1).setValue('已訂購');
    SpreadsheetApp.flush();
    clearOnlineCache();
    changes[d.headers[cargo]]='預訂';
    changes[d.headers[status]]='已訂購';
    changes[d.headers[time]]=Utilities.formatDate(now,'Asia/Taipei','MM/dd');
    if(ordered>=0)changes[d.headers[ordered]]=true;
    return {ok:true,row,changes};
  }finally{lock.releaseLock();}
}

/* 商品解析：取自使用者提供的抓取 GAS，獨立命名避免與 LINE 專案衝突。 */
function launchScrape_lifeTunesDecode(s){
  return(s||'')
  .replace(/&nbsp;|&#160;/gi,' ')
  .replace(/&amp;/gi,'&')
  .replace(/&quot;/gi,'"')
  .replace(/&#39;|&apos;/gi,"'")
  .replace(/&times;|&#215;/gi,'×')
  .replace(/&lt;/gi,'<')
  .replace(/&gt;/gi,'>')
  .replace(/&#x([0-9a-f]+);/gi,(_,x)=>String.fromCharCode(parseInt(x,16)))
  .replace(/&#(\d+);/g,(_,x)=>String.fromCharCode(Number(x)));
}

function launchScrape_lifeTunesText(h){
  return launchScrape_lifeTunesDecode((h||'')
  .replace(/<script\b[\s\S]*?<\/script>/gi,' ')
  .replace(/<style\b[\s\S]*?<\/style>/gi,' ')
  .replace(/<br\s*\/?>/gi,'\n')
  .replace(/<\/(?:p|div|li|tr|td|th|section|article|h[1-6])>/gi,'\n')
  .replace(/<[^>]+>/g,' '))
  .replace(/[ \t]+/g,' ')
  .replace(/\n[ \t]+/g,'\n')
  .replace(/\n{2,}/g,'\n')
  .trim();
}

function launchScrape_lifeTunesAbs(u){
  u=launchScrape_lifeTunesDecode((u||'').replace(/\\\//g,'/')).trim();
  u=u.replace(/^['"]|['"]$/g,'');
  if(!u||/^data:|^javascript:/i.test(u))return'';
  if(/^https?:\/\//i.test(u))return u;
  if(/^\/\//.test(u))return'https:'+u;
  if(/^\//.test(u))return'https://lifetunes-mall.jp'+u;
  return'https://lifetunes-mall.jp/'+u.replace(/^\.\//,'');
}

function launchScrape_parseLifeTunesData(h,id){
  if(!h)return{price:'',size:'',image:''};

  const text=launchScrape_lifeTunesText(h);
  let price='',size='',image='';

  const codePos=text.indexOf('商品コード');

  if(codePos>0){
    const before=text.slice(Math.max(0,codePos-3000),codePos);
    const prices=[...before.matchAll(/(?:¥|￥)?\s*([1-9][0-9,]*)\s*円/g)];
    if(prices.length)price=prices[prices.length-1][1].replace(/,/g,'');
  }

  if(!price){
    const p=
      h.match(/(?:product:price:amount|itemprop=["']price["'])[^>]*content=["']([0-9,]+)/i)||
      h.match(/content=["']([0-9,]+)["'][^>]*(?:product:price:amount|itemprop=["']price["'])/i)||
      h.match(/"price"\s*:\s*"?([1-9][0-9,]*)"?/i)||
      text.match(/(?:販売価格|税込価格|価格)\s*[：:]?\s*(?:¥|￥)?\s*([1-9][0-9,]*)\s*円/i);

    if(p)price=p[1].replace(/,/g,'');
  }

  if(!price){
    const prices=[...text.matchAll(/(?:¥|￥)?\s*([1-9][0-9,]*)\s*円/g)];
    if(prices.length)price=prices.find(x=>Number(x[1].replace(/,/g,''))>=100)?.[1]?.replace(/,/g,'')||'';
  }

  let sm=
    text.match(/本体サイズ\s*[：:]\s*([^\n]{1,160})/i)||
    text.match(/(?:^|\n)\s*サイズ\s*[：:]\s*([^\n]{1,160})/im);

  if(sm){
    const raw=sm[1].trim();
    const d=raw.match(/([WＷHＨDＤ]?\s*\d+(?:\.\d+)?\s*[×xX]\s*[WＷHＨDＤ]?\s*\d+(?:\.\d+)?(?:\s*[×xX]\s*[WＷHＨDＤ]?\s*\d+(?:\.\d+)?)?\s*(?:mm|ｍｍ|cm|ｃｍ)?)/i);
    size=(d?d[1]:raw).replace(/^[（(]|[）)]$/g,'').trim();
  }

  if(!size){
    const d=text.match(/(?:本体サイズ|サイズ)[\s\S]{0,100}?([WＷHＨDＤ]?\s*\d+(?:\.\d+)?\s*[×xX]\s*[WＷHＨDＤ]?\s*\d+(?:\.\d+)?(?:\s*[×xX]\s*[WＷHＨDＤ]?\s*\d+(?:\.\d+)?)?\s*(?:mm|ｍｍ|cm|ｃｍ)?)/i);
    if(d)size=d[1].trim();
  }

  const urls=[],add=u=>{
    u=launchScrape_lifeTunesAbs(u);
    if(u&&!urls.includes(u))urls.push(u);
  };

  const regs=[
    /<meta[^>]+(?:property|name)=["'](?:og:image(?::secure_url)?|twitter:image)["'][^>]+content=["']([^"']+)/gi,
    /<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["'](?:og:image(?::secure_url)?|twitter:image)["']/gi,
    /<(?:img|source)[^>]+(?:src|data-src|data-original|data-lazy|data-lazy-src|data-zoom-image|data-large-image)=["']([^"']+)/gi,
    /<a[^>]+href=["']([^"']+\.(?:jpg|jpeg|png|webp)(?:\?[^"']*)?)["']/gi,
    /!\[[^\]]*\]\((https?:\/\/[^)\s]+)\)/gi,
    /"(?:image|imageUrl|image_url|largeImage|mainImage)"\s*:\s*"([^"]+)"/gi,
    /(https?:\/\/[^"'()<>\s]+\.(?:jpg|jpeg|png|webp)(?:\?[^"'()<>\s]*)?)/gi
  ];

  regs.forEach(re=>{
    let x;
    while((x=re.exec(h)))add(x[1]);
  });

  let x,sr=/(?:srcset|data-srcset)=["']([^"']+)["']/gi;
  while((x=sr.exec(h)))x[1].split(',').forEach(v=>add(v.trim().split(/\s+/)[0]));

  const sku=String(id||'').toLowerCase();

  function score(u){
    const q=u.toLowerCase();
    let n=0;

    if(sku&&q.includes(sku))n+=1000;
    if(/\/img\/goods\//.test(q))n+=500;
    if(/\/goods\//.test(q))n+=350;
    if(/\/product|\/item|goods_|product_|item_/.test(q))n+=150;
    if(/_l\.|_ll\.|large|main|detail/.test(q))n+=40;
    if(/\.(jpg|jpeg|png|webp)(\?|$)/.test(q))n+=20;

    if(/logo|favicon|banner|header|footer|common|loading|noimage|spacer|sns|arrow|button|btn|detail_icon|icon\//.test(q))n-=1500;
    if(/\.gif(\?|$)/.test(q))n-=1000;

    return n;
  }

  urls.sort((a,b)=>score(b)-score(a));
  if(urls.length&&score(urls[0])>0)image=urls[0];

  Logger.log(`LifeTunes解析 ID=${id} 原價=${price||'無'} 尺寸=${size||'無'} 圖片=${image||'無'}`);
  return{price,size,image};
}

function launchScrape_fetchLifeTunesHtml(url){
  const clean=url.split(/[?#]/)[0],id=launchScrape_extractSkuFromUrl(clean),htmls=[];

  const fetchOne=(u,headers)=>{
    try{
      const r=UrlFetchApp.fetch(u,{
        method:'get',
        muteHttpExceptions:true,
        followRedirects:true,
        headers
      });

      const code=r.getResponseCode(),h=r.getContentText('UTF-8');
      Logger.log(`LifeTunes FETCH ${code} 長度=${h.length} ${u}`);

      if(code>=200&&code<400&&h.length>200)htmls.push(h);
    }catch(e){
      Logger.log('LifeTunes FETCH ERROR '+e);
    }
  };

  fetchOne(clean,{
    'User-Agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36',
    'Accept':'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'Accept-Language':'ja-JP,ja;q=0.9,en;q=0.8',
    'Cache-Control':'no-cache',
    'Pragma':'no-cache',
    'Referer':'https://lifetunes-mall.jp/'
  });

  let d=launchScrape_parseLifeTunesData(htmls.join('\n'),id);

  if(!d.price||!d.size||!d.image){
    Utilities.sleep(300);

    fetchOne(clean+'?__refresh='+Date.now(),{
      'User-Agent':'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1',
      'Accept':'text/html,application/xhtml+xml,*/*',
      'Accept-Language':'ja-JP,ja;q=0.9',
      'Referer':'https://lifetunes-mall.jp/'
    });

    d=launchScrape_parseLifeTunesData(htmls.join('\n'),id);
  }

  if(!d.price||!d.size||!d.image){
    Utilities.sleep(300);

    fetchOne('https://r.jina.ai/'+clean,{
      'User-Agent':'Mozilla/5.0',
      'Accept':'text/plain',
      'Accept-Language':'ja-JP,ja;q=0.9'
    });
  }

  const h=htmls.join('\n<!-- LIFETUNES SOURCE -->\n');
  d=launchScrape_parseLifeTunesData(h,id);

  Logger.log(`LifeTunes最終 ID=${id} 原價=${d.price||'無'} 尺寸=${d.size||'無'} 圖片=${d.image||'無'}`);
  return h;
}

function launchScrape_normalizeChiikawaCollectionUrl(sheet,row,val,m,id){
  if(!id)return val;

  const clean=val.split(/[?#]/)[0];
  if(!/\/collections\//.test(clean))return val;

  const shortUrl=`https://chiikawamarket.jp/products/${id}`;

  if(clean===shortUrl)return val;

  const uc=m['商品網址']||m['網址'];
  if(uc)sheet.getRange(row,uc).setValue(shortUrl);

  return shortUrl;
}

function launchScrape_fetchAndFillProductDetails(sheet,row,val,m){
  const t=launchScrape_checkSupportedDomain(val),id=t.isValid?launchScrape_extractSkuFromUrl(val):'',type=t.type;

  if(type.isChiikawa&&id)
    val=launchScrape_normalizeChiikawaCollectionUrl(sheet,row,val,m,id);

  const fill=(h,v,force=false)=>{
    if(v===undefined||v===null||v===''||!m[h])return false;

    const c=sheet.getRange(row,m[h]);

    if(!force&&c.getValue().toString().trim()!=='')return false;

    const nv=h==='尺寸'?launchScrape_formatSize(v):v;

    if(c.getValue().toString()===nv.toString())return true;

    c.setValue(nv);
    return true;
  };

  let wrote=false;

  if(id)wrote=fill('貨號',id)||wrote;
  if(!t.isValid)return wrote;

  const builders=[
    [type.isChiikawa,`https://chiikawamarket.jp/products/${id}`],
    [type.isNagano,`https://nagano-market.jp/products/${id}`],
    [type.isPokemon,`https://www.pokemoncenter-online.com/${id}.html`],
    [type.isDisney,`https://store.disney.co.jp/goods/${id}.html`],
    [type.isChiikawamogumogu,`https://chiikawamogumogu.shop/products/${id}`],
    [type.isLilaLaMode,`https://lilalamode-store.jp/products/${id}`],
    [type.isMindwave,`https://www.mindwave-store.com/c/all/${id}`],
    [type.isEeo,`https://eeo.today/store/101/products/detail/${id}`],
    [type.isSanseido,`https://ssdonline.books-sanseido.co.jp/view/item/${id}`],
    [type.isLineFriends,`https://linefriendssquare.jp/products/${id}`],
    [type.isStoreGk,`https://www.store-gk.com/shopdetail/${id}/`],
    [type.isPricafe,`https://www.pricafe.shop/view/item/${id}`],
    [type.isAnimate,`https://www.animate-onlineshop.jp/pn/pd/${id}/`],
    [type.isTheChara,`https://www.the-chara.com/view/item/${id}`],
    [type.isFujiTv,`https://eshop.fujitv.co.jp/c/${id}`],
    [type.isLifeTunes,`https://lifetunes-mall.jp/shop/g/g${id}/`],
    [type.isSanrioAnimeStore,`https://sanrio-animestore-a3.jp/products/detail/${id}`],
    [type.isAmnibus,`https://amnibus.com/products/detail/${id}`]
  ];

  let url=val;

  if(id){
    const b=builders.find(x=>x[0]);
    if(b)url=b[1];
  }

  if(type.isChiikawa){
    try{
      const original=val.split(/[?#]/)[0],canonical=`https://chiikawamarket.jp/products/${id}`;

      for(const u of[original,canonical]){
        try{
          const r=UrlFetchApp.fetch(u.replace(/\/+$/,'')+'.js',{
            muteHttpExceptions:true,
            headers:{'User-Agent':'Mozilla/5.0'}
          });

          if(r.getResponseCode()!==200)continue;

          const p=JSON.parse(r.getContentText()),im=p.featured_image||p.images?.[0];

          if(im)wrote=fill('圖片',(im.startsWith('http')?im:'https:'+im).replace(/&amp;/g,'&'))||wrote;
          if(p.price)wrote=fill('原價',Math.round(p.price/100))||wrote;
          if(p.description)wrote=fill('尺寸',launchScrape_extractSizeRawText(p.description))||wrote;
        }catch(e){}
      }

      const html=launchScrape_fetchHtmlWithRetry(original)||launchScrape_fetchHtmlWithRetry(canonical);

      if(html){
        const im=
          html.match(new RegExp(`<img[^>]+(?:src|data-src)=["']([^"']*${id}[^"']*\\.(?:jpg|jpeg|png|webp)[^"']*)["']`,'i'))||
          html.match(/<meta[^>]+property=["']og:image(?::secure_url)?["'][^>]+content=["']([^"']+)/i);

        const pr=
          html.match(/<meta[^>]+property=["'](?:product|og):price:amount["'][^>]+content=["']([0-9,]+)/i)||
          html.match(/(?:¥|￥)\s*([0-9,]+)\s*(?:円|\(税込\)|（税込）)/i);

        if(im){
          let u=im[1].replace(/&amp;/g,'&');
          if(u.startsWith('//'))u='https:'+u;
          wrote=fill('圖片',u)||wrote;
        }

        if(pr)wrote=fill('原價',pr[1].replace(/,/g,''))||wrote;
        wrote=fill('尺寸',launchScrape_extractSizeRawText(html))||wrote;
      }

      return wrote;
    }catch(e){
      Logger.log('Chiikawa抓取失敗：'+e);
    }
  }

  if(type.isNagano||type.isLilaLaMode){
    try{
      const r=UrlFetchApp.fetch(url.split(/[?#]/)[0].replace(/\/+$/,'')+'.js',{
        muteHttpExceptions:true,
        headers:{'User-Agent':'Mozilla/5.0'}
      });

      if(r.getResponseCode()===200){
        const p=JSON.parse(r.getContentText()),im=p.featured_image||p.images?.[0];

        if(im)wrote=fill('圖片',im.startsWith('http')?im:'https:'+im)||wrote;
        if(p.price)wrote=fill('原價',Math.round(p.price/100))||wrote;
        if(p.description)wrote=fill('尺寸',launchScrape_extractSizeRawText(p.description))||wrote;

        return wrote;
      }
    }catch(e){
      Logger.log(e);
    }
  }

  if(type.isLifeTunes){
    const h=launchScrape_fetchLifeTunesHtml(url);
    if(!h)return wrote;

    const d=launchScrape_parseLifeTunesData(h,id);

    if(d.price)wrote=fill('原價',d.price,true)||wrote;
    if(d.size)wrote=fill('尺寸',d.size,true)||wrote;
    if(d.image)wrote=fill('圖片',d.image,true)||wrote;

    SpreadsheetApp.flush();
    return wrote;
  }

  try{
    const html=launchScrape_fetchHtmlWithRetry(url);
    if(!html)return wrote;

    if(type.isAmnibus){
      const im=html.match(/<img[^>]+src=["'](https?:\/\/cdn\.amnibus\.com\/upload\/save_image\/[^"']+)/i);
      const text=html.replace(/<br\s*\/?>/gi,' ').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ');
      const sz=text.match(/本体サイズ\s*[：:]\s*(?:[（(][^）)]*[）)])?\s*([0-9.]+)\s*[×xX]\s*([0-9.]+)\s*(?:mm|ｍｍ)/i);

      if(im)wrote=fill('圖片',im[1].replace(/&amp;/g,'&'))||wrote;
      if(sz)wrote=fill('尺寸',sz[1]+'x'+sz[2])||wrote;

      return wrote;
    }

    if(type.isAnimaru){
      const im=
        html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)/i)||
        html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image/i);

      const pr=html.match(/class=["'][^"']*text--price[^"']*["'][^>]*>[\s\S]*?<strong[^>]*>\s*(?:&yen;|¥|￥)\s*([0-9,]+)\s*<\/strong>/i);
      const dia=html.match(/(?:本体)?サイズ(?:（約）|\(約\))?\s*[：:]?\s*直径\s*([\d.]+)\s*(?:mm|ｍｍ)/i);
      const sz=html.match(/(?:本体)?サイズ(?:（約）|\(約\))?\s*[：:／/]?\s*([HWDＨＷＤ]?\s*[\d.]+)(?:\s*[（(][^）)]*[）)])?\s*[×xX]\s*([HWDＨＷＤ]?\s*[\d.]+)(?:\s*[（(][^）)]*[）)])?(?:\s*[×xX]\s*([HWDＨＷＤ]?\s*[\d.]+))?\s*(mm|ｍｍ|cm|ｃｍ)/i);

      if(im){
        let u=im[1].replace(/&amp;/g,'&');
        if(u.startsWith('//'))u='https:'+u;
        else if(u.startsWith('/'))u='https://animaru.jp'+u;
        wrote=fill('圖片',u)||wrote;
      }

      if(pr)wrote=fill('原價',pr[1].replace(/,/g,''))||wrote;
      if(dia)wrote=fill('尺寸','ø'+dia[1])||wrote;
      else if(sz){
        const unit=/cm|ｃｍ/i.test(sz[4])?10:1;
        const nums=[sz[1],sz[2],sz[3]]
          .filter(Boolean)
          .map(v=>Math.round(parseFloat(v.replace(/[HWDＨＷＤ\s]/gi,''))*unit));

        wrote=fill('尺寸',nums.join('x'))||wrote;
      }

      return wrote;
    }

    if(type.isPokemon){
      const im=
        html.match(/<div[^>]*class="item"[^>]*>\s*<img[^>]+src="(https:\/\/[^"]+)/i)||
        html.match(/<img[^>]+src="(https:\/\/www\.pokemoncenter-online\.com\/a\/img\/item\/[^"]+)/i);

      if(im)wrote=fill('圖片',im[1].replace(/&amp;/g,'&'))||wrote;

      const p=html.match(/price\s*[:=]\s*([0-9]+)/i);
      if(p)wrote=fill('原價',p[1])||wrote;

      const x=html.match(/<p[^>]+class="ttl"[^>]*>サイズ<\/p>\s*<p[^>]+class="txt"[^>]*>([\s\S]*?)<\/p>/i);
      if(x)wrote=fill('尺寸',x[1].replace(/<[^>]+>/g,'').replace(/&times;|×/gi,'x').trim())||wrote;

      return wrote;
    }

    if(type.isChiikawamogumogu){
      const im=
        html.match(/<meta\s+property="og:image:secure_url"\s+content="([^"]+)/i)||
        html.match(/<meta\s+property="og:image"\s+content="([^"]+)/i);

      if(im)wrote=fill('圖片',im[1].replace(/&amp;/g,'&'))||wrote;

      const p=html.match(/<meta\s+property="og:price:amount"\s+content="([0-9,]+)/i);
      if(p)wrote=fill('原價',p[1].replace(/,/g,''))||wrote;

      const s=html.match(/<meta\s+name="twitter:description"\s+content="([^"]+)/i);

      if(s){
        const x=
          s[1].match(/(?:商品)?サイズ\s*[:：]?\s*約?\s*([0-9×xX.\-HWDhwd()（）]+(?:mm|cm)?)/i)||
          s[1].match(/(?:外装|本体)?\s*[:：]?\s*約?\s*([0-9×xX.\-HWDhwd()（）]+(?:mm|cm)?)/i);

        if(x)wrote=fill('尺寸',x[1])||wrote;
      }

      return wrote;
    }

    const im=
      html.match(/<meta\s+property="og:image:secure_url"\s+content="([^"]+)/i)||
      html.match(/<meta\s+property="og:image"\s+content="([^"]+)/i);

    if(im)
      wrote=fill('圖片',(im[1].startsWith('http')?im[1]:'https:'+im[1]).replace(/&amp;/g,'&'))||wrote;

    const p=html.match(/<meta\s+property="(?:og|product):price:amount"\s+content="([0-9,]+)/i);
    if(p)wrote=fill('原價',p[1].replace(/,/g,''))||wrote;

    wrote=fill('尺寸',launchScrape_extractSizeRawText(html))||wrote;
  }catch(e){
    Logger.log(e);
  }

  return wrote;
}


function launchScrape_extractSkuFromUrl(v){
  if(!v)return'';

  const rules=[
    [/chiikawamarket\.jp/,/products\/([^/?#]+)/],
    [/nagano-market\.jp/,/products\/([^/?#]+)/],
    [/pokemoncenter-online\.com/,/\/([0-9]+)(?:\.html|\/)?/],
    [/store\.disney\.co\.jp/,/\/([0-9]+)\.html/],
    [/chiikawamogumogu\.shop/,/products\/([^/?#]+)/],
    [/lilalamode-store\.jp/,/products\/([^/?#]+)/],
    [/mindwave-store\.com/,/\/c\/all\/([0-9]+)/],
    [/eeo\.today/,/products\/detail\/([0-9]+)/],
    [/ssdonline\.books-sanseido\.co\.jp/,/view\/item\/([0-9]+)/],
    [/linefriendssquare\.jp/,/products\/([0-9]+)/],
    [/store-gk\.com/,/shopdetail\/([0-9]+)/],
    [/pricafe\.shop/,/view\/item\/([0-9]+)/],
    [/animate-onlineshop\.jp/,/\/pd\/([0-9]+)/],
    [/the-chara\.com/,/view\/item\/([0-9]+)/],
    [/eshop\.fuji-?tv\.co\.jp/,/\/c\/[^\/]+\/([0-9]+\/[0-9]+)/],
    [/animaru\.jp/,/\/product\/([^/?#]+)/],
    [/lifetunes-mall\.jp/,/\/shop\/g\/g([^/?#]+)/],
    [/sanrio-animestore-a3\.jp/,/products\/detail\/([0-9]+)/],
    [/amnibus\.com/,/products\/detail\/([0-9]+)/]
  ];

  for(const[d,p]of rules){
    if(d.test(v)){
      const x=v.match(p);
      if(x)return x[1].trim();
    }
  }

  return'';
}

function launchScrape_checkSupportedDomain(url){
  const has=s=>url.includes(s);

  const type={
    isChiikawa:has('chiikawamarket.jp'),
    isNagano:has('nagano-market.jp'),
    isPokemon:has('pokemoncenter-online.com'),
    isDisney:has('store.disney.co.jp'),
    isChiikawamogumogu:has('chiikawamogumogu.shop'),
    isLilaLaMode:has('lilalamode-store.jp'),
    isToho:has('tohoentertainmentonline.com'),
    isUSJ:has('onlinestore.usj.co.jp'),
    isMindwave:has('mindwave-store.com'),
    isEeo:has('eeo.today'),
    isSanseido:has('ssdonline.books-sanseido.co.jp'),
    isLineFriends:has('linefriendssquare.jp'),
    isStoreGk:has('store-gk.com'),
    isAniCyu:has('ani-cyu.jp'),
    isMenegi:has('store.menegi.jp'),
    isPricafe:has('pricafe.shop'),
    isAnimate:has('animate-onlineshop.jp'),
    isTheChara:has('the-chara.com'),
    isFujiTv:has('eshop.fuji-tv.co.jp')||has('eshop.fujitv.co.jp'),
    isAnimaru:has('animaru.jp'),
    isLifeTunes:has('lifetunes-mall.jp'),
    isSanrioAnimeStore:has('sanrio-animestore-a3.jp'),
    isAmnibus:has('amnibus.com')
  };

  return{
    isValid:Object.values(type).some(Boolean),
    isShopify:
      type.isChiikawa||
      type.isNagano||
      type.isChiikawamogumogu||
      type.isLilaLaMode||
      type.isMenegi||
      type.isToho,
    type
  };
}

function jiwuClothingSize(value) {
  const text = String(value || '').normalize('NFKC');
  // Convert each measurement separately so slash-separated sizes keep their pairing.
  return text.replace(/(?:着丈|身幅|身巾|肩幅|袖丈)\s*[:：]?\s*\d+(?:\.\d+)?(?:\s*(?:cm|公分))?(?:\s*[×xX、,]\s*(?:着丈|身幅|身巾|肩幅|袖丈)\s*[:：]?\s*\d+(?:\.\d+)?(?:\s*(?:cm|公分))?)*/gi, block => block.replace(/着丈/g,'長').replace(/身幅|身巾/g,'寬').replace(/肩幅/g,'肩').replace(/袖丈/g,'袖').replace(/cm|公分|[×xX、,:：\s]/gi,''));
}
function jiwuExtractClothingSize(value) {
  const text = String(value || '').normalize('NFKC');
  const rows = [...text.matchAll(/(?:^|[\s【\[(])((?:XX|X)?[SML]|\dXL)(?:サイズ)?[\s】\]):：]*(着丈\s*[:：]?\s*\d+(?:\.\d+)?(?:\s*(?:cm))?(?:\s*[×xX、,]?\s*(?:身幅|身巾|肩幅|袖丈)\s*[:：]?\s*\d+(?:\.\d+)?(?:\s*cm)?)+)/g)];
  return rows.length ? rows.map(r=>r[1]).join('/')+'/'+rows.map(r=>jiwuClothingSize(r[2]).replace(/\s+/g,'')).join('/') : '';
}

function launchScrape_extractSizeRawText(text){
  if(!text)return'';
  const clothing = jiwuExtractClothingSize(String(text).replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').replace(/<[^>]+>/g,' '));
  if(clothing)return clothing;

  const safe=text
    .replace(/<title>[\s\S]*?<\/title>/i,'')
    .replace(/<br\s*\/?>/gi,' ');

  const core='(?:^|[^ァ-ヶー一-龠a-zA-Z0-9])[◆■\\[【]?\\s*(?:商品|本体|外装)?サイズ\\s*(?:[（(]\\s*(?:約|约)\\s*[)）])?\\s*(?:[】\\]■]|[:：])\\s*(?:約|约)?\\s*';

  let raw='';

  const tm=safe.match(
    new RegExp(
      '<th>\\s*(?:商品|本体|外装)?サイズ(?:[（(]\\s*(?:約|约)\\s*[)）])?\\s*<\\/th>\\s*<td>([\\s\\S]*?)<\\/td>',
      'i'
    )
  );

  if(tm)
    raw=tm[1].replace(/<br\s*\/?>/gi,' ').replace(/<[^>]+>/g,'').trim();

  if(!raw){
    const x=safe.match(new RegExp(core+'([^<\\n]+)','i'));
    if(x)raw=x[1].trim();
  }

  if(!raw)return'';

  raw=raw.split(/[、。※]/)[0].trim();

  const d=raw.match(
    /([HWDhwd]?\s*[0-9０-９]+(?:\.[0-9０-９]+)?)\s*[×xX]\s*([HWDhwd]?\s*[0-9０-９]+(?:\.[0-9０-９]+)?)(?:\s*[×xX]\s*((?:マチ|奥行|厚み|[HWDhwd])?\s*[0-9０-９]+(?:\.[0-9０-９]+)?))?/
  );

  return d?d[0].trim():raw;
}

function launchScrape_formatSize(input){
  if(!input)return'';
  if(/着丈|身幅|身巾|肩幅|袖丈|長\d/.test(String(input))) return jiwuExtractClothingSize(input) || jiwuClothingSize(input);

  const str=input.toString();

  const processed=str
    .replace(/着丈/g,'長')
    .replace(/身幅|身巾/g,'寬')
    .replace(/肩幅/g,'肩')
    .replace(/袖丈/g,'袖')
    .replace(/cm|公分/g,'')
    .replace(/×/g,'x')
    .replace(/\s+/g,'');

  const ms=processed.match(/(長|寬|肩|袖)(\d+)/g);

  if(ms)return ms.join('');
  if(/公分/.test(str))return str;

  const hasNei=str.includes('内')||str.includes('內');

  const formatted=str
    .replace('内','')
    .replace('內','')
    .replace(/[:：]/g,'')
    .replace(/×/g,'x')
    .replace(/\s+/g,'');

  const gong=/公尺$/i.test(formatted),
        mei=/枚$/i.test(formatted),
        ml=/ml$|毫升$/i.test(formatted),
        cm=/cm$/i.test(formatted),
        separator=formatted.includes('X')?'X':'x',
        parts=formatted.split(/[xX]/);

  const out=parts.map(p=>{
    const hm=p.match(/[HWDhwd]/),h=hm?hm[0]:'';

    const num=p
      .replace(/マチ|奥行|厚み|直径/g,'')
      .replace(/[HWDhwd]/g,'')
      .replace(/mm|cm|ml|公尺|枚|毫升|厚|\(mm\)|\(cm\)/gi,'');

    const n=parseFloat(num);

    if(isNaN(n))return p;

    return parts.length>1?
      (cm?Math.round(n*10):n):
      h+(cm?Math.round(n*10):n);
  });

  let z=out.join(separator);

  if(gong)z+='公尺';
  else if(mei)z+='枚';
  else if(ml)z+=/毫升$/i.test(formatted)?'毫升':'ml';

  return z+(hasNei?'內':'');
}


function launchScrape_fetchHtmlWithRetry(url){
  const headersList=[
    {
      'User-Agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
      'Accept':'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
      'Accept-Language':'ja-JP,ja;q=0.9,en;q=0.8',
      'Cache-Control':'no-cache',
      'Referer':'https://lifetunes-mall.jp/'
    },
    {
      'User-Agent':'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1',
      'Accept':'text/html,application/xhtml+xml,*/*',
      'Accept-Language':'ja-JP,ja;q=0.9'
    }
  ];

  for(let i=0;i<headersList.length;i++){
    try{
      const r=UrlFetchApp.fetch(url,{
        method:'get',
        muteHttpExceptions:true,
        followRedirects:true,
        headers:headersList[i]
      });

      const code=r.getResponseCode(),html=r.getContentText('UTF-8');

      Logger.log('FETCH '+code+' '+url+' 長度='+html.length);

      if(code>=200&&code<400&&html.length>1000)
        return html;

    }catch(e){
      Logger.log('FETCH ERROR '+e);
    }

    Utilities.sleep(500);
  }

  return'';
}


/* 團務表直接使用開團分頁的欄位。 */
const GROUP_WORK_STATUSES_=['尚未結單','未出貨','集運中','路上','點貨中','出貨中','下班！'];
function groupWorkStatus_(value){
  const status=norm(value);
  if(status==='下班ㄌ')return '下班！';
  return GROUP_WORK_STATUSES_.includes(status)?status:'尚未結單';
}
function groupWorkArrival_(name){
  const match=norm(name).match(/^(\d{2})(\d{2})/);if(!match)return '';
  const month=(Number(match[1])%12)+1,day=Number(match[2]);
  return String(month)+'月'+(day<=10?'':day<=20?'中':'下');
}
function groupWorkDate_(name){
  const match=norm(name).match(/^(\d{2})(\d{2})(⛔️?)/),plain=norm(name).match(/^(\d{2})(\d{2})/);
  const parts=match||plain;if(!parts)return null;
  const month=Number(parts[1]),day=Number(parts[2]),now=new Date(),date=new Date(now.getFullYear(),month-1,day);
  if(month<1||month>12||day<1||date.getMonth()!==month-1)return null;
  date.setHours(0,0,0,0);return {date,isClose:!!match};
}
function groupWorkRunDateRules_(){
  const lock=LockService.getScriptLock();if(!lock.tryLock(1000))return;
  try{
    const today=new Date();today.setHours(0,0,0,0);
    const d=launchRead_('最新開團',false,false),statusIndex=d.headers.indexOf('運送狀態');
    launchGroups_(d,'最新開團',false).forEach(group=>{
      const schedule=groupWorkDate_(group.name);
      const row=group.indices[0],current=statusIndex<0?'':norm(d.rows[row-2]?.[statusIndex]);
      if(group.joined&&statusIndex>=0){
        let next=current||'尚未結單';
        if(schedule&&today>=schedule.date&&next==='尚未結單')next='未出貨';
        if(next!==current)d.sheet.getRange(row,statusIndex+1).setValue(next);
      }
      if(schedule?.isClose&&today>=new Date(schedule.date.getTime()+86400000)){
        const found=launchFind_(group.id);
        if(found&&found.g.status==='最新開團'){found.g.status='已收單';launchSave_(found.g);}
      }
    });
  }finally{lock.releaseLock();}
}
function groupWorkData_(){
  groupWorkRunDateRules_();
  const entries=[];
  ['最新開團','已收單'].forEach(status=>{
    const d=launchRead_(status,false,false);
    launchGroups_(d,status,false).forEach(group=>{
      // 團務表只顯示試算表「跟團」欄已標記 v 的團。
      if(!group.joined)return;
      const first=d.rows[(group.indices[0]||2)-2]||[],data=rowObj(d.headers,first);
      let config={};try{config=JSON.parse(data['開團設定']||'{}');}catch(_){}
      const firstPanel=Array.isArray(config.panels)&&config.panels[0]?config.panels[0]:{};
      entries.push({id:group.id,launchStatus:status,name:group.name,image:String(group.images?.[0]||data['首圖']||''),imageScale:Math.max(1,Math.min(3,Number(firstPanel.imageScale)||1)),imageX:Math.max(0,Math.min(100,Number.isFinite(Number(firstPanel.imageX))?Number(firstPanel.imageX):50)),imageY:Math.max(0,Math.min(100,Number.isFinite(Number(firstPanel.imageY))?Number(firstPanel.imageY):50)),status:groupWorkStatus_(data['運送狀態']),arrival:norm(data['抵台日期']),category:norm(data['IP']),note:norm(data['運送備註']),workOrder:Number.isFinite(Number(config.workOrder))?Number(config.workOrder):null});
    });
  });
  return {ok:true,entries,categories:[...new Set(entries.map(entry=>entry.category).filter(Boolean))]};
}
function publicGroupWork_(){
  const cache=CacheService.getScriptCache(),cached=cache.get(PUBLIC_GROUP_WORK_CACHE_KEY);
  if(cached!==null){try{return JSON.parse(cached);}catch(_){}}
  const source=groupWorkData_();
  const result={
    ok:true,
    categories:source.categories,
    entries:source.entries.map(entry=>({
      id:entry.id,
      name:entry.name,
      image:entry.image,
      imageScale:entry.imageScale,
      imageX:entry.imageX,
      imageY:entry.imageY,
      status:entry.status,
      arrival:entry.arrival,
      category:entry.category,
      workOrder:entry.workOrder
    }))
  };
  const text=JSON.stringify(result);if(text.length<90000)cache.put(PUBLIC_GROUP_WORK_CACHE_KEY,text,60);
  return result;
}
function clearPublicGroupWorkCache_(){
  CacheService.getScriptCache().remove(PUBLIC_GROUP_WORK_CACHE_KEY);
}
function syncOnlineGroupsShipping_(online){
  const groupHeader=col(online.headers,['團名','團組','團']);if(groupHeader<0)return;
  const imageHeader=col(online.headers,['圖片','商品圖片','首圖','圖片網址']);
  const wanted=new Map();
  (online.rows||[]).forEach(item=>{
    const data=item.data||{},name=norm(data[online.headers[groupHeader]]);
    if(!name||['ちいかわ','ナガノ','ちいかわ樂園','人魚島'].includes(name)||wanted.has(name))return;
    wanted.set(name,imageHeader>=0?norm(data[online.headers[imageHeader]]):'');
  });
  if(!wanted.size)return;
  // 團務資料直接存在開團分頁。線上訂單只補上已存在團的抵台日期，避免另建重複團名。
  ['最新開團','已收單'].forEach(status=>{
    const d=launchRead_(status,false,false),arrivalIndex=d.headers.indexOf('抵台日期');if(arrivalIndex<0)return;
    launchGroups_(d,status,false).forEach(group=>{if(!wanted.has(group.name))return;const row=group.indices[0],current=norm(d.rows[row-2]?.[arrivalIndex]);if(!current)d.sheet.getRange(row,arrivalIndex+1).setValue(groupWorkArrival_(group.name));});
  });
}
function groupWorkSave_(p){
  const id=norm(p.id),status=norm(p.status),category=norm(p.category),arrival=norm(p.arrival),note=norm(p.note);
  if(!id)throw new Error('缺少團務資料');if(!GROUP_WORK_STATUSES_.includes(status))throw new Error('運送狀態無效');
  const found=launchFind_(id);if(!found||!['最新開團','已收單'].includes(found.g.status))throw new Error('找不到團務資料');
  const headers=found.d.headers,row=found.g.indices[0],put=(header,value)=>{const index=headers.indexOf(header);if(index>=0)found.d.sheet.getRange(row,index+1).setValue(value);};
  put('運送狀態',status);put('IP',category);put('抵台日期',arrival);put('運送備註',note);
  const configIndex=headers.indexOf('開團設定');if(configIndex>=0){let config={};try{config=JSON.parse(found.d.rows[row-2]?.[configIndex]||'{}');}catch(_){}if(!Array.isArray(config.panels)||!config.panels.length)config.panels=[{image:found.g.images?.[0]||'',mainColor:found.g.mainColor||'#617AA6'}];config.panels[0].imageScale=Math.max(1,Math.min(3,Number(p.imageScale)||1));config.panels[0].imageX=Math.max(0,Math.min(100,Number.isFinite(Number(p.imageX))?Number(p.imageX):50));config.panels[0].imageY=Math.max(0,Math.min(100,Number.isFinite(Number(p.imageY))?Number(p.imageY):50));found.d.sheet.getRange(row,configIndex+1).setValue(JSON.stringify(config));}
  clearPublicGroupWorkCache_();return groupWorkData_();
}
function groupWorkReorder_(p){
  const order=typeof p.order==='string'?JSON.parse(p.order):p.order;
  if(!Array.isArray(order)||!order.length||new Set(order).size!==order.length)throw new Error('團務表排序資料無效');
  order.forEach((id,index)=>{
    const found=launchFind_(norm(id));
    if(!found||!['最新開團','已收單'].includes(found.g.status)||!found.g.joined)throw new Error('團務表資料已變動，請重新整理');
    const configIndex=found.d.headers.indexOf('開團設定');if(configIndex<0)throw new Error('找不到開團設定欄');
    const row=found.g.indices[0],value=found.d.rows[row-2]?.[configIndex];let config={};try{config=JSON.parse(value||'{}');}catch(_){}
    config.workOrder=index+1;found.d.sheet.getRange(row,configIndex+1).setValue(JSON.stringify(config));
  });
  clearPublicGroupWorkCache_();return groupWorkData_();
}
function groupWorkBatchSave_(p){
  const entries=typeof p.entries==='string'?JSON.parse(p.entries):p.entries;
  if(!Array.isArray(entries)||!entries.length||entries.length>500)throw new Error('團務表儲存資料無效');
  if(new Set(entries.map(entry=>norm(entry.id))).size!==entries.length)throw new Error('團務表資料重複');
  // 一次建立兩個開團分頁的索引，避免每張卡都重讀試算表而佔住寫入鎖。
  const sources=new Map();
  ['最新開團','已收單'].forEach(status=>{
    const d=launchRead_(status,false,false);
    launchGroups_(d,status,false).forEach(group=>sources.set(group.id,{d,group}));
  });
  entries.forEach((entry,index)=>{
    const status=groupWorkStatus_(entry.status);
    const found=sources.get(norm(entry.id));
    if(!found||!found.group.joined)throw new Error('團務表資料已變動，請重新整理');
    const headers=found.d.headers,row=found.group.indices[0],put=(header,value)=>{const column=headers.indexOf(header);if(column>=0)found.d.sheet.getRange(row,column+1).setValue(value);};
    put('運送狀態',status);put('IP',norm(entry.category));put('抵台日期',norm(entry.arrival));put('運送備註',norm(entry.note));
    const configIndex=headers.indexOf('開團設定');if(configIndex<0)throw new Error('找不到開團設定欄');let config={};try{config=JSON.parse(found.d.rows[row-2]?.[configIndex]||'{}');}catch(_){}if(!Array.isArray(config.panels)||!config.panels.length)config.panels=[{image:found.group.images?.[0]||'',mainColor:found.group.mainColor||'#617AA6'}];config.panels[0].imageScale=Math.max(1,Math.min(3,Number(entry.imageScale)||1));config.panels[0].imageX=Math.max(0,Math.min(100,Number.isFinite(Number(entry.imageX))?Number(entry.imageX):50));config.panels[0].imageY=Math.max(0,Math.min(100,Number.isFinite(Number(entry.imageY))?Number(entry.imageY):50));
    config.workOrder=index+1;found.d.sheet.getRange(row,configIndex+1).setValue(JSON.stringify(config));
  });
  clearPublicGroupWorkCache_();return groupWorkData_();
}
function groupWorkAdd_(p){
  const name=norm(p.name),image=norm(p.image),status=norm(p.status)||'尚未結單',category=norm(p.category),arrival=norm(p.arrival),note=norm(p.note);
  if(!name)throw new Error('請輸入團名');if(!GROUP_WORK_STATUSES_.includes(status))throw new Error('運送狀態無效');if(image)launchURL_(image);
  const d=launchRead_('已收單'),id='manual-'+Utilities.getUuid(),row=new Array(d.headers.length).fill(''),put=(header,value)=>{const index=d.headers.indexOf(header);if(index>=0)row[index]=value;};
  put('團名',name);put('首圖',image);put('跟團','v');put('運送狀態',status);put('IP',category);put('抵台日期',arrival);put('運送備註',note);put('開團ID',id);put('開團設定',JSON.stringify({images:image?[image]:[],mainColor:'#617AA6',panels:[{image,mainColor:'#617AA6'}]}));
  const at=d.sheet.getLastRow()+1;if(at>d.sheet.getMaxRows())d.sheet.insertRowsAfter(d.sheet.getMaxRows(),at-d.sheet.getMaxRows());d.sheet.getRange(at,1,1,d.headers.length).setValues([row]);clearPublicGroupWorkCache_();return groupWorkData_();
}

/* 開團管理：所有入口沿用後台驗證；寫入以鎖與版本檢查保護。 */
const LAUNCH_STATES_=['最新開團','尚未上架','已收單'];
const LAUNCH_HEADERS_=['團名','名稱','角色','商品網址','圖片','貨號','原價','售價','尺寸','首圖','主色系','備註','運送狀態','IP','抵台日期','運送備註','開團ID','商品ID','開團設定'];
function launchSheet_(name){
  if(!LAUNCH_STATES_.includes(name))throw new Error('開團狀態無效');
  let sheet=ss().getSheetByName(name);if(!sheet)sheet=ss().insertSheet(name);
  let headers=sheet.getLastRow()?sheet.getRange(1,1,1,sheet.getLastColumn()).getDisplayValues()[0].map(norm):[];
  LAUNCH_HEADERS_.forEach(h=>{if(!headers.includes(h))headers.push(h);});
  if(name==='最新開團'&&!headers.includes('上架'))headers.push('上架');
  if(headers.length>sheet.getMaxColumns())sheet.insertColumnsAfter(sheet.getMaxColumns(),headers.length-sheet.getMaxColumns());
  sheet.getRange(1,1,1,headers.length).setValues([headers]);
  return sheet;
}
function launchRead_(status,includeFormulas=true,repairIds=true){
  const sheet=launchSheet_(status),headers=sheet.getRange(1,1,1,sheet.getLastColumn()).getDisplayValues()[0].map(norm);
  const rows=sheet.getLastRow()>1?sheet.getRange(2,1,sheet.getLastRow()-1,headers.length).getValues():[];
  const formulas=includeFormulas&&rows.length?sheet.getRange(2,1,rows.length,headers.length).getFormulas():[];
  const gi=headers.indexOf('開團ID'),pi=headers.indexOf('商品ID'),ni=headers.indexOf('團名');
  // 團名只寫在每團第一個商品；後續空白列沿用直到下一個團名。
  // 開團 ID 仍寫在每列，讓排序與跨分頁搬移有穩定識別。
  let activeId='',activeName='';
  rows.forEach((r,i)=>{
    const named=norm(r[ni]);
    if(named){activeName=named;activeId=String(r[gi]||('legacy-'+status+'-'+(i+2)));}
    else if(r[gi]){activeId=String(r[gi]);}
    if(!activeId||!activeName)return;
    if(!r[gi]){r[gi]=activeId;if(repairIds)sheet.getRange(i+2,gi+1).setValue(activeId);}
    if(!r[pi]&&(r[headers.indexOf('名稱')]||r[headers.indexOf('商品網址')])){r[pi]='legacy-item-'+status+'-'+(i+2);if(repairIds)sheet.getRange(i+2,pi+1).setValue(r[pi]);}
  });
  return {sheet,headers,rows,formulas};
}
function launchGroups_(d,status,includeRevision=true){
  const groups=new Map();
  let activeName='';
  d.rows.forEach((r,i)=>{
    const o=rowObj(d.headers,r),named=norm(o['團名']);if(named)activeName=named;
    const id=String(o['開團ID']||'');if(!id||!activeName)return;
    if(!groups.has(id)){
      let config={};try{config=JSON.parse(o['開團設定']||'{}');}catch(_){}
      const sheetImage=norm(o['首圖']),configuredImages=Array.isArray(config.images)?config.images.slice():[];
      if(sheetImage){if(configuredImages.length)configuredImages[0]=sheetImage;else configuredImages.push(sheetImage);}
      groups.set(id,{id,status,name:activeName,ip:String(o['IP']||''),canvasTitle:String(config.canvasTitle||''),images:configuredImages,mainColor:String(o['主色系']||config.mainColor||'#617AA6'),shipDate:config.shipDate||'',domesticShipping:config.domesticShipping||'',noFreeShipping:config.noFreeShipping===true,footer:String(config.footer!==undefined?config.footer:(o['備註']||'')),tags:String(config.tags||''),shortUrl:String(config.shortUrl||''),cardColumns:Math.max(4,Math.min(8,Number(config.cardColumns)||8)),ads:Array.isArray(config.ads)?config.ads:[],panels:[],joined:false,items:[],records:[],indices:[]});
    }
    const g=groups.get(id);if(/^v$/i.test(String(o['跟團']||'').trim()))g.joined=true;if(includeRevision)g.records.push(r.map((v,c)=>(d.formulas[i]||[])[c]||v));g.indices.push(i+2);
    if(o['商品ID']){let config={};try{config=JSON.parse(o['開團設定']||'{}');}catch(_){}
      const directImage=norm(o['首圖']),directColor=norm(o['主色系']);
      let panel=Number.isInteger(Number(config.panel))?Number(config.panel):-1;
      if(panel<0)panel=directImage?g.panels.length:Math.max(0,g.panels.length-1);
      while(g.panels.length<=panel){const preset=(config.panels||[])[g.panels.length]||{};g.panels.push({image:String(preset.image||''),mainColor:String(preset.mainColor||g.mainColor||'#617AA6'),cardColumns:Math.max(4,Math.min(8,Number(preset.cardColumns)||Number(g.cardColumns)||8)),imageScale:Math.max(1,Math.min(3,Number(preset.imageScale)||1)),imageX:Math.max(0,Math.min(100,Number.isFinite(Number(preset.imageX))?Number(preset.imageX):50)),imageY:Math.max(0,Math.min(100,Number.isFinite(Number(preset.imageY))?Number(preset.imageY):50))});}
      if(directImage)g.panels[panel].image=directImage;
      if(directColor)g.panels[panel].mainColor=directColor;
      g.items.push({id:String(o['商品ID']),name:String(o['名稱']||''),role:String(o['角色']||''),url:String(o['商品網址']||''),images:String(o['圖片']||'').split(/\r?\n/).filter(Boolean),code:String(o['貨號']||''),original:String(o['原價']??''),price:String(o['售價']??''),size:String(o['尺寸']||''),panel,visible:status==='尚未上架'&&norm(o['庫存']).toLowerCase()==='x'?false:(Number(config.visibilityVersion)>=2?config.visible!==false:g.items.length<31),showCost:config.showCost!==false,scale:Number(config.scale)||1});}
  });
  return [...groups.values()].map(g=>{if(!g.panels.length)g.panels=[{image:g.images[0]||'',mainColor:g.mainColor,cardColumns:g.cardColumns}];g.panels.forEach(panel=>{if(!panel.image)panel.image=g.images[g.panels.indexOf(panel)]||'';if(!panel.mainColor)panel.mainColor=g.mainColor;panel.cardColumns=Math.max(4,Math.min(8,Number(panel.cardColumns)||Number(g.cardColumns)||8));});g.images=g.panels.map(panel=>panel.image).filter(Boolean);if(includeRevision)g.revision=Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,JSON.stringify(g.records)));return g;});
}
function launchPublic_(g){const {records,indices,...out}=g;return out;}
// 首頁只需要畫縮圖，不傳整團商品網址、原價等完整資料；編輯時再用 launchGet 取得。
// 這可顯著降低商品很多的團在首次開啟「開團」頁時的回應大小。
function launchListPublic_(g){
  // 清單預覽只需要 Banner 與團名；商品卡與其他資料在點入團後才載入。
  return {id:g.id,status:g.status,name:g.name,ip:g.ip||'',images:(g.images||[]).slice(0,1),mainColor:g.mainColor,joined:!!g.joined,revision:g.revision,summary:true,itemCount:g.items.length,items:[]};
}
function launchFind_(id){for(const status of LAUNCH_STATES_){const d=launchRead_(status),g=launchGroups_(d,status).find(g=>g.id===id);if(g)return {d,g};}return null;}
function launchURL_(v){if(v&&!/^https?:\/\/[^\s]+$/i.test(v))throw new Error('圖片與商品網址必須是 http/https 網址');return v;}
function launchInventoryStates_(group,d){
  const stockIndex=col(d.headers,['庫存','總庫存','數量','庫存量','商品庫存']),itemIndex=d.headers.indexOf('商品ID');
  if(stockIndex<0||itemIndex<0)return group;
  const stockByItem=new Map();
  group.indices.forEach(row=>{const values=d.rows[row-2]||[];stockByItem.set(String(values[itemIndex]||''),norm(values[stockIndex]));});
  (group.items||[]).forEach(item=>item.stockOut=stockByItem.get(String(item.id))==='-');
  return group;
}
function launchSetProductHidden_(p){
 const found=launchFind_(norm(p.groupId));if(!found||found.g.status!=='尚未上架')throw new Error('僅尚未上架商品可設定隱藏');
 const headers=found.d.headers,stocki=col(headers,['庫存']),idi=col(headers,['商品ID']),configi=col(headers,['開團設定']);
 if(stocki<0||configi<0)throw new Error('尚未上架分頁找不到庫存或開團設定欄');
 const row=found.g.indices.find(row=>String(found.d.rows[row-2]?.[idi]||'')===norm(p.itemId));if(!row)throw new Error('找不到商品');
 const hidden=String(p.hidden)==='true';let config={};try{config=JSON.parse(found.d.rows[row-2][configi]||'{}');}catch(_){}
 config.visibilityVersion=2;config.visible=!hidden;
 found.d.sheet.getRange(row,configi+1).setValue(JSON.stringify(config));
 const stock=found.d.sheet.getRange(row,stocki+1);if(hidden)stock.setValue('x');else if(norm(found.d.rows[row-2][stocki]).toLowerCase()==='x')stock.setValue('');
 SpreadsheetApp.flush();return {ok:true,hidden,revision:launchFind_(norm(p.groupId)).g.revision};
}
function launchSetInventoryAvailability_(p){
  const groupId=norm(p.groupId),itemId=norm(p.itemId),out=String(p.out)==='true';
  if(!groupId||!itemId)throw new Error('缺少開團商品資料');
  const found=launchFind_(groupId);if(!found)throw new Error('找不到開團資料');
  const stockIndex=col(found.d.headers,['庫存','總庫存','數量','庫存量','商品庫存']),itemIndex=found.d.headers.indexOf('商品ID');
  if(stockIndex<0)throw new Error(found.g.status+' 分頁找不到「庫存」欄');
  const row=found.g.indices.find(row=>String(found.d.rows[row-2]?.[itemIndex]||'')===itemId);
  if(!row)throw new Error('開團內找不到對應商品');
  found.d.sheet.getRange(row,stockIndex+1).setValue(out?'-':'');
  return {ok:true,out};
}
function launchCheckAvailability_(p){
  const found=launchFind_(norm(p.id));
  if(!found)throw new Error('找不到此團');
  const item=found.g.items.find(entry=>String(entry.id)===norm(p.itemId));
  if(!item)throw new Error('找不到商品');
  const url=norm(item.url);
  if(!/^https?:\/\//i.test(url))return {ok:true,itemId:item.id,available:null,detail:'沒有有效商品網址'};
  let available=null,detail='';
  try{
    const response=UrlFetchApp.fetch(url,{method:'get',followRedirects:true,muteHttpExceptions:true,headers:{'User-Agent':'Mozilla/5.0 (compatible; JIWUStockCheck/1.0)','Accept-Language':'zh-TW,zh;q=0.9,ja;q=0.8,en;q=0.7'}});
    const status=response.getResponseCode(),html=response.getContentText().slice(0,1500000);
    if(status===404||status===410){available=false;detail='商品頁不存在';}
    else if(status>=200&&status<400){
      // chiikawa market 的共用頁面常含「売り切れ」樣板；讀 Shopify 商品 JSON 的變體狀態為準。
      const shopifyResult=launchChiikawaProductAvailability_(url);
      if(shopifyResult!==null){available=shopifyResult;detail='已用 Shopify 商品狀態確認';}
      else {available=detectInventoryAvailability(html);if(available==null)detail='網站未提供可辨識的貨況';}
    }
    else detail='網站回傳 HTTP '+status;
  }catch(error){detail=String(error.message||error);}
  return {ok:true,itemId:item.id,available,detail};
}
function launchFillFromInventory_(p){
  const items=typeof p.items==='string'?JSON.parse(p.items):p.items;
  if(!Array.isArray(items))throw new Error('商品資料格式錯誤');
  const data=values(STOCK,true),map=buildStockMap(data);
  const priceIndex=col(data.headers,['售價','價格','銷售價']);
  const sizeIndex=col(data.headers,['尺寸','商品尺寸','規格']);
  const matches=[];
  items.forEach(item=>{
    const code=String(item?.code||'').trim();
    const record=stockCodeKeys(code).map(key=>map.get(key)).find(Boolean);
    if(!record)return;
    const row=record.data;
    const price=priceIndex>=0&&row[priceIndex]!==''&&row[priceIndex]!=null?String(row[priceIndex]):'';
    const size=sizeIndex>=0&&row[sizeIndex]!==''&&row[sizeIndex]!=null?String(row[sizeIndex]):'';
    if(price||size)matches.push({id:String(item.id||''),code,price,size});
  });
  return {ok:true,matches};
}
function launchChiikawaProductAvailability_(url){
  const productUrl=String(url||'').replace(/[?#].*$/,'');
  if(!/^https:\/\/chiikawamarket\.jp\/products\/[^/]+$/i.test(productUrl))return null;
  try{
    const response=UrlFetchApp.fetch(productUrl+'.js',{method:'get',followRedirects:true,muteHttpExceptions:true,headers:{'User-Agent':'Mozilla/5.0 (compatible; JIWUStockCheck/1.0)','Accept':'application/json'}});
    const status=response.getResponseCode();
    if(status===404||status===410)return false;
    if(status<200||status>=300)return null;
    const product=JSON.parse(response.getContentText());
    if(!Array.isArray(product.variants))return null;
    return product.variants.some(variant=>variant&&variant.available===true);
  }catch(_){ }
  return null;
}
function launchNormalizeURL(value){
 const text=String(value||'').trim();
 if(!text)return '';
 if(text.startsWith('//'))return 'https:'+text;
 if(/^(?:[a-z0-9-]+\.)+[a-z]{2,}(?::\d+)?(?:[/?#][^\s]*)?$/i.test(text))return 'https://'+text;
 return text;
}
function launchNormalizeGroupURLs(group){
 group.shortUrl=launchNormalizeURL(group.shortUrl);
 const misplaced=launchNormalizeURL(group.tags);
 if(!group.shortUrl&&/^https?:\/\/[^\s]+$/i.test(misplaced)){group.shortUrl=misplaced;group.tags='';}
 group.images=(group.images||[]).map(launchNormalizeURL);
 (group.panels||[]).forEach(p=>p.image=launchNormalizeURL(p.image));
 (group.ads||[]).forEach(p=>p.image=launchNormalizeURL(p.image));
 (group.items||[]).forEach(p=>{p.url=launchNormalizeURL(p.url);p.images=(p.images||[]).map(launchNormalizeURL);});
 return group;
}
function launchValidate_(g,existing){
  if(!g||!LAUNCH_STATES_.includes(g.status)||!g.id||!Array.isArray(g.items)||!Array.isArray(g.images))throw new Error('開團資料格式錯誤');
  if(g.items.length>200||g.images.length>20)throw new Error('每團最多 200 項商品、20 張主圖');
  if(!String(g.name||'').trim())throw new Error('請輸入團名');
  if(new Set(g.items.map(x=>x.id)).size!==g.items.length)throw new Error('商品 ID 重複');
  const validateURL=(value,previous)=>{if(existing&&String(value||'')===String(previous||''))return;launchURL_(value);};
  g.images.forEach((v,i)=>validateURL(v,existing?.images?.[i]));try{validateURL(String(g.shortUrl||''),existing?.shortUrl);}catch(_){throw new Error('短網址格式不正確，請填 http/https 網址');}if(g.panels!==undefined&&!Array.isArray(g.panels))throw new Error('畫布資料格式錯誤');(g.panels||[]).forEach((panel,i)=>{if(!panel||typeof panel!=='object')throw new Error('畫布資料格式錯誤');validateURL(String(panel.image||''),existing?.panels?.[i]?.image);});if(g.ads!==undefined&&!Array.isArray(g.ads))throw new Error('廣告資料格式錯誤');(g.ads||[]).forEach((ad,i)=>{if(!ad||typeof ad!=='object')throw new Error('廣告資料格式錯誤');validateURL(String(ad.image||''),existing?.ads?.[i]?.image);});g.items.forEach((x,index)=>{const prior=(existing?.items||[]).find(item=>item.id===x.id);if(!x.id)throw new Error('第 '+(index+1)+' 項商品缺少 ID');if(!String(x.name||'').trim()&&!(prior&&!String(prior.name||'').trim()))throw new Error('請填第 '+(index+1)+' 項商品名稱');try{validateURL(x.url,prior?.url);}catch(_){throw new Error('第 '+(index+1)+' 項「'+(x.name||'未命名')+'」商品網址格式不正確');}if(!Array.isArray(x.images))throw new Error('圖片格式錯誤');x.images.forEach((v,i)=>validateURL(v,prior?.images?.[i]));if(!Number.isFinite(Number(x.scale))||x.scale<0.5||x.scale>2)throw new Error('商品卡比例須為 50% 至 200%');});
}
function launchStorefrontNote_(g){
  const rawDate=String(g.shipDate||'').trim(),iso=rawDate.match(/^\d{4}-(\d{2})-(\d{2})$/);
  const date=iso?`${Number(iso[1])}月${Number(iso[2])}日`:rawDate;
  const shipping=String(g.domesticShipping||'').trim().replace(/^境內運\s*/,'').replace(/[（(]滿額免[）)]/g,'').replace(/同車平分/g,'').replace(/^[$＄¥￥]\s*/,'').trim();
  if(!date&&!shipping)return String(g.footer||'').replace(/官方\s*LINE\s*@jiwusales\s*[｜|]?\s*/ig,'').trim();
  const parts=[];
  if(date)parts.push(date.replace(/(?:出荷|出貨)$/,'')+'出荷');
  if(shipping)parts.push(/^0+(?:\.0+)?$/.test(shipping)?'免境內運、免二補包手.ᐟ.ᐟ':'境內運'+shipping+'同車平分'+(g.noFreeShipping?'':'(滿額免)'));
  return parts.join('｜');
}
function launchSave_(g){
  if(g)launchNormalizeGroupURLs(g);
  const found=g&&g.id?launchFind_(g.id):null;launchValidate_(g,found&&found.g);
  if(found&&found.g.revision!==g.revision)throw new Error('試算表資料已變動，請重新載入後再編輯');
  if(!found&&g.revision)throw new Error('此團已刪除，請重新載入');
  if(!found&&g.status!=='尚未上架')throw new Error('新團須先存到尚未上架');
  const target=launchRead_(g.status),source=found&&found.d;
  // 搬移時補齊來源欄位，包含外部接單程式需要的額外資料。
  if(source){source.headers.forEach(h=>{if(h&&!target.headers.includes(h))target.headers.push(h);});
    if(target.headers.length>target.sheet.getMaxColumns())target.sheet.insertColumnsAfter(target.sheet.getMaxColumns(),target.headers.length-target.sheet.getMaxColumns());
    target.sheet.getRange(1,1,1,target.headers.length).setValues([target.headers]);}
  const old=new Map(),oldValues=new Map();if(found)found.g.indices.forEach((r,i)=>{const id=String(source.rows[r-2][source.headers.indexOf('商品ID')]||'');old.set(id,rowObj(source.headers,found.g.records[i]));oldValues.set(id,rowObj(source.headers,source.rows[r-2]));});
  const panels=Array.isArray(g.panels)&&g.panels.length?g.panels:[{image:g.images?.[0]||'',mainColor:g.mainColor||'#617AA6'}];
  const items=g.items.length?g.items:[{id:'',images:[],scale:1,panel:0}];
  const firstInPanel=new Set();
  const output=items.map((x,index)=>{
    const panel=Math.max(0,Math.min(panels.length-1,Number(x.panel)||0)),panelData=panels[panel]||panels[0],isPanelStart=!firstInPanel.has(panel);firstInPanel.add(panel);
    const o=Object.assign({},old.get(x.id)||{}),fields={'團名':index===0?g.name:'','名稱':x.name||'','角色':x.role||'','商品網址':x.url||'','圖片':x.images.join('\n'),'貨號':x.code||'','原價':x.original??'','售價':x.price??'','尺寸':x.size||'','首圖':index===0?(g.images[0]||''):'','主色系':index===0?(g.mainColor||'#617AA6'):'','備註':index===0?launchStorefrontNote_(g):'','開團ID':g.id,'商品ID':x.id,'開團設定':JSON.stringify({images:g.images,mainColor:g.mainColor||'#617AA6',canvasTitle:String(g.canvasTitle||''),footer:String(g.footer||''),shipDate:g.shipDate||'',domesticShipping:g.domesticShipping||'',noFreeShipping:g.noFreeShipping===true,tags:String(g.tags||''),shortUrl:String(g.shortUrl||''),cardColumns:Math.max(4,Math.min(8,Number(g.cardColumns)||8)),ads:g.ads||[],visibilityVersion:2,visible:x.visible!==false,showCost:x.showCost!==false,scale:x.scale})};
    fields['首圖']=isPanelStart?(panelData.image||''):'';fields['主色系']=isPanelStart?(panelData.mainColor||g.mainColor||'#617AA6'):'';
    fields['開團設定']=JSON.stringify({images:panels.map(panel=>panel.image).filter(Boolean),panels,mainColor:g.mainColor||'#617AA6',canvasTitle:String(g.canvasTitle||''),footer:String(g.footer||''),shipDate:g.shipDate||'',domesticShipping:g.domesticShipping||'',noFreeShipping:g.noFreeShipping===true,tags:String(g.tags||''),shortUrl:String(g.shortUrl||''),cardColumns:Math.max(4,Math.min(8,Number(g.cardColumns)||8)),ads:g.ads||[],panel,visibilityVersion:2,visible:x.visible!==false,showCost:x.showCost!==false,scale:x.scale});
    Object.keys(fields).forEach(k=>{const value=fields[k];if(typeof o[k]==='string'&&o[k].startsWith('=')&&String((oldValues.get(x.id)||{})[k]??'')===String(value))return;o[k]=typeof value==='string'&&value.startsWith('=')?"'"+value:value;});return target.headers.map(h=>o[h]??'');
  });
  const start=target.sheet.getLastRow()+1;
  if(start+output.length-1>target.sheet.getMaxRows())target.sheet.insertRowsAfter(target.sheet.getMaxRows(),start+output.length-1-target.sheet.getMaxRows());
  target.sheet.getRange(start,1,output.length,target.headers.length).setValues(output);SpreadsheetApp.flush();
  if(found){found.g.indices.slice().reverse().forEach(row=>source.sheet.deleteRow(row));}
  // 原分頁儲存保留位置；尚未上架的新團上架時排在最新開團最前面。
  if(found&&(found.g.status===g.status||(found.g.status==='尚未上架'&&g.status==='最新開團'))){
    const fresh=launchRead_(g.status),saved=launchGroups_(fresh,g.status).find(x=>x.id===g.id);
    const destination=found.g.status===g.status?found.g.indices[0]:2;
    if(saved.indices[0]>destination)fresh.sheet.moveRows(fresh.sheet.getRange(saved.indices[0],1,saved.indices.length),destination);
  }
  SpreadsheetApp.flush();return launchPublic_(launchFind_(g.id).g);
}
// 短網址與標籤只更新開團設定，避免備份整份分頁與重建商品列。
function launchSaveMetadataOnly_(input){
  if(!input||!input.id||!input.revision||!LAUNCH_STATES_.includes(input.status))return null;
  const d=launchRead_(input.status,true,false),existing=launchGroups_(d,input.status).find(g=>g.id===input.id);
  if(!existing)return null;
  if(existing.revision!==input.revision)throw new Error('試算表資料已變動，請重新載入後再編輯');
  const canonical=g=>{
    const copy=JSON.parse(JSON.stringify(launchPublic_(g)));launchNormalizeGroupURLs(copy);
    delete copy.revision;delete copy.tags;delete copy.shortUrl;
    (copy.items||[]).forEach(item=>delete item.stockOut);
    const stable=value=>Array.isArray(value)?value.map(stable):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,stable(value[key])])):value;
    return JSON.stringify(stable(copy));
  };
  if(canonical(existing)!==canonical(input))return null;
  const shortUrl=launchNormalizeURL(input.shortUrl),tags=String(input.tags||'');
  launchURL_(shortUrl);
  const column=d.headers.indexOf('開團設定'),first=existing.indices[0],last=existing.indices[existing.indices.length-1];
  if(column<0)throw new Error('找不到開團設定欄');
  const selected=new Set(existing.indices),values=d.rows.slice(first-2,last-1).map((row,index)=>{
    const sheetRow=first+index;
    if(!selected.has(sheetRow))return [(d.formulas[sheetRow-2]||[])[column]||row[column]||''];
    let config;try{config=JSON.parse(row[column]||'{}');}catch(_){throw new Error('第 '+sheetRow+' 列開團設定格式錯誤');}
    config.tags=tags;config.shortUrl=shortUrl;return [JSON.stringify(config)];
  });
  d.sheet.getRange(first,column+1,values.length,1).setValues(values);
  values.forEach((row,index)=>{d.rows[first-2+index][column]=row[0];if(d.formulas[first-2+index])d.formulas[first-2+index][column]='';});
  const saved=launchGroups_(d,input.status).find(g=>g.id===input.id);
  return {ok:true,group:launchPublic_(launchInventoryStates_(saved,d))};
}
function launchDispatch_(action,p){
  // 大型圖片走 POST，讀取與一般操作均可沿用 JSONP。
  if(action==='launchUpload')return launchUpload_(p);
  // 首頁清單只做唯讀快照，不與儲存、抓資料、上傳共用鎖；畫面可立即顯示快取並在背景更新。
  if(['launchList','launchAuxSheet','launchCheckAvailability'].includes(action))return launchOperation_(action,p);
  const lock=LockService.getScriptLock();lock.waitLock(20000);
  const backups=[];let committed=false;
  try{
    if(action==='launchSave'){const group=typeof p.group==='string'?JSON.parse(p.group):p.group;const fast=launchSaveMetadataOnly_(group);if(fast){committed=true;return fast;}}
    if(['launchSave','launchDelete','launchReorder','launchScrape'].includes(action)){
      const book=ss();LAUNCH_STATES_.forEach(launchSheet_);LAUNCH_STATES_.forEach(name=>{const sheet=book.getSheetByName(name);if(sheet){const copy=sheet.copyTo(book);copy.setName('_開團備份_'+Utilities.getUuid().slice(0,8));copy.hideSheet();backups.push({sheet,copy});}});
    }
    const result=launchOperation_(action,p);committed=true;return result;
  }catch(err){
    if(backups.length){try{backups.forEach(({sheet,copy})=>{const range=copy.getDataRange();if(range.getNumRows()>sheet.getMaxRows())sheet.insertRowsAfter(sheet.getMaxRows(),range.getNumRows()-sheet.getMaxRows());if(range.getNumColumns()>sheet.getMaxColumns())sheet.insertColumnsAfter(sheet.getMaxColumns(),range.getNumColumns()-sheet.getMaxColumns());sheet.getDataRange().breakApart();sheet.clearContents();range.copyTo(sheet.getRange(1,1));});}catch(restore){throw new Error('儲存中斷，請從隱藏的「_開團備份_」分頁還原後再操作：'+err.message);}}
    throw err;
  }finally{
    // 失敗時保留備份，成功才清除暫存備份。
    if(committed)backups.forEach(({copy})=>{try{ss().deleteSheet(copy);}catch(_){}});
    lock.releaseLock();
  }
}
function launchOperation_(action,p){
    if(action==='launchImportInventory')return importClosedInventory_(p);
    if(action==='launchList'){const status=p.status||'最新開團';return {ok:true,groups:launchGroups_(launchRead_(status,false,false),status,false).map(launchListPublic_)};}
    if(action==='launchAuxSheet'){
      if(p.kind==='group-work')return groupWorkData_();
      throw new Error('未知頁面');
    }
    if(action==='launchGroupWork')return groupWorkSave_(p);
    if(action==='launchGroupWorkAdd')return groupWorkAdd_(p);
    if(action==='launchGroupWorkReorder')return groupWorkReorder_(p);
    if(action==='launchGroupWorkBatchSave')return groupWorkBatchSave_(p);
    if(action==='launchSetProductHidden')return launchSetProductHidden_(p);
    if(action==='launchSetInventoryAvailability')return launchSetInventoryAvailability_(p);
    if(action==='launchCheckAvailability')return launchCheckAvailability_(p);
    if(action==='launchFillFromInventory')return launchFillFromInventory_(p);
    if(action==='launchSave'){const g=typeof p.group==='string'?JSON.parse(p.group):p.group;return {ok:true,group:launchSave_(g)};}
    if(action==='launchGet'){const f=launchFind_(p.id);if(!f)throw new Error('找不到此團');return {ok:true,group:launchPublic_(launchInventoryStates_(f.g,f.d))};}
    if(action==='launchDelete'){const f=launchFind_(p.id);if(!f)return {ok:true};if(f.g.revision!==p.revision)throw new Error('資料已變動，請重新載入');f.g.indices.slice().reverse().forEach(r=>f.d.sheet.deleteRow(r));return {ok:true};}
    if(action==='launchReorder'){
      const order=typeof p.order==='string'?JSON.parse(p.order):p.order;let d=launchRead_(p.status),groups=launchGroups_(d,p.status);
      if(!Array.isArray(order)||order.length!==groups.length||new Set(order).size!==groups.length||order.some(id=>!groups.some(g=>g.id===id)))throw new Error('團清單已變動，請重新整理');
      let dest=2;order.forEach(id=>{d=launchRead_(p.status);const g=launchGroups_(d,p.status).find(x=>x.id===id);g.indices.forEach(row=>{if(row!==dest)d.sheet.moveRows(d.sheet.getRange(row,1),dest);dest++;});});return {ok:true};
    }
    if(action==='launchScrape'){
      const f=launchFind_(p.id);if(!f)throw new Error('找不到此團');if(f.g.revision!==p.revision)throw new Error('資料已變動，請重新載入');
      const i=f.g.items.findIndex(x=>x.id===p.itemId);if(i<0)throw new Error('商品已移除');const item=f.g.items[i];
      if(!launchScrape_checkSupportedDomain(item.url).isValid)return {ok:true,group:launchPublic_(f.g),message:'此網站尚未支援，請手動填寫'};
      // 以記憶體儲存格執行原解析器，再按版本儲存，避免抓取途中污染實際列。
      const keys=['商品網址','圖片','貨號','原價','尺寸'],vals=[item.url,item.images.join('\n'),item.code,item.original,item.size],map={};keys.forEach((k,i)=>map[k]=i+1);
      const empty=v=>v==null||String(v).trim()==='';
      const missingKeys=['貨號','原價','圖片','尺寸'];
      if(!missingKeys.some(k=>empty(vals[keys.indexOf(k)])))return {ok:true,group:launchPublic_(f.g),message:'資料已完整，略過抓取'};
      // 即使原解析器會強制更新特定網站，也只允許補上抓取前為空白的欄位。
      const writable=vals.map(empty);
      const adapter={getRange:(r,c)=>({getValue:()=>vals[c-1],setValue:v=>{if(writable[c-1])vals[c-1]=v;}})};
      const before=JSON.stringify(vals);launchScrape_fetchAndFillProductDetails(adapter,1,item.url,map);
      item.url=vals[0];item.images=String(vals[1]).split(/\r?\n/).filter(Boolean);item.code=String(vals[2]);item.original=String(vals[3]);item.size=String(vals[4]);
      const changed=before!==JSON.stringify(vals);
      const group=changed?launchSave_(launchPublic_(f.g)):launchPublic_(f.g);const missing=missingKeys.filter(k=>empty(vals[keys.indexOf(k)]));
      return {ok:true,group,message:missing.length?'仍缺少：'+missing.join('、'):before===JSON.stringify(vals)?'資料已完整':'已更新'};
    }
    if(action==='launchImageProxy')return launchImageProxy_(p.url);
    throw new Error('未知開團操作');
}
function launchImageProxy_(url){
  url=launchURL_(String(url||''));if(!url)throw new Error('圖片網址無效');
  let response;try{response=UrlFetchApp.fetch(url,{muteHttpExceptions:true,followRedirects:true,headers:{'User-Agent':'Mozilla/5.0 (compatible; JIWUImageExport/1.0)'}});}catch(_){throw new Error('圖床圖片無法讀取');}
  const status=response.getResponseCode(),headers=response.getHeaders(),type=String(headers['Content-Type']||headers['content-type']||'').split(';')[0].toLowerCase(),bytes=response.getContent();
  if(status<200||status>=300||!/^image\/(png|jpe?g|webp)$/i.test(type))throw new Error('圖片網址未回傳 PNG、JPEG 或 WebP');
  if(bytes.length>3*1024*1024)throw new Error('圖片超過 3 MB，無法輸出');
  return {ok:true,dataUrl:'data:'+type+';base64,'+Utilities.base64Encode(bytes)};
}
function launchUpload_(p){
  const properties=PropertiesService.getScriptProperties();
  const endpoint=String(properties.getProperty('JIWU_IMAGE_UPLOAD_URL')||'').trim();
  const key=properties.getProperty('JIWU_IMAGE_UPLOAD_KEY');
  if(!endpoint||!key)throw new Error('請在後台 GAS 指令碼屬性設定 JIWU_IMAGE_UPLOAD_URL 和 JIWU_IMAGE_UPLOAD_KEY');
  if(!/^https:\/\/[^\s/?#@]+(?:\/[^\s#]*)?$/.test(endpoint)||/^https:\/\/dash\.cloudflare\.com(?:\/|$)/i.test(endpoint))throw new Error('請填 Worker 的公開 HTTPS 上傳網址，不是 Cloudflare 管理頁');
  const image=String(p.image||'');
  const m=image.match(/^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/);
  if(!m||m[2].length>4000000)throw new Error('圖片須為 PNG、JPEG 或 WebP，且小於 3 MB');
  const bytes=Utilities.base64Decode(m[2]);if(bytes.length<12)throw new Error('圖片內容無效');
  // 上傳密碼只由 GAS 送到 Worker，不回傳瀏覽器，也不跟隨轉址。
  let response;
  try{response=UrlFetchApp.fetch(endpoint,{
    method:'post',contentType:'application/json',headers:{'X-Upload-Key':key},
    payload:JSON.stringify({dataUrl:image,fileName:'group_'+Utilities.getUuid()}),
    muteHttpExceptions:true,followRedirects:false
  });}catch(_){throw new Error('無法連線圖床 Worker，請確認公開網址');}
  const status=response.getResponseCode();
  if(status===401||status===403)throw new Error('圖床拒絕上傳，請確認 GAS 的 JIWU_IMAGE_UPLOAD_KEY 與 Cloudflare 的 UPLOAD_KEY 相同');
  if(status<200||status>=300)throw new Error('圖床上傳失敗（HTTP '+status+'），請確認 Worker 設定及 Cloudflare 的 GITHUB_TOKEN');
  let result;try{result=JSON.parse(response.getContentText());}catch(_){throw new Error('圖床回應格式錯誤，請確認上傳 API 網址');}
  if(result.error||typeof result.url!=='string'||!/^https:\/\/raw\.githubusercontent\.com\/jiwusales\/imgh\/main\/[^\s]+$/.test(result.url))throw new Error('圖床未回傳有效的 imgh 圖片網址');
  return {ok:true,url:result.url};
}


// 採購訂單：保存每筆原始品項，不變更庫存。
function purchaseOrderURLValid_(value){
 const url=String(value||'');if(/[\s#]/.test(url))return false;
 return /^https:\/\/(?:chiikawamarket\.jp|nagano-market\.jp|chiikawamogumogu\.shop)\/account\/orders\/[A-Za-z0-9]+\/?(?:\?[^#\s]*)?$/.test(url)||/^https:\/\/account\.lilalamode-store\.jp\/orders\/\d+\/?(?:\?[^#\s]*)?$/.test(url)||/^https:\/\/chiikawa-pocket-goods-store\.com\/account\/orders\/detail\/?\?(?:[^#\s]*&)?orderId=\d+(?:&[^#\s]*)?$/.test(url);
}
const PURCHASE_HEADERS_=['訂單編號','日期','貨號','名稱','日文名','數量','原價','總計','資料來源','團名','角色','商品網址','圖片','狀態','出貨單號','重量','運費','訂單網址','通路','內容物','原訂單編號','登記ID'];
// 對外資料維持一致欄位模型；試算表實際位置一律以標題解析。
function purchaseColumns_(sheet,ensure=false){
 const aliases={'訂單編號':['單號'],'日期':['訂購日期'],'名稱':['對應名稱'],'訂單網址':['官網訂單網址'],'日文名':['原商品名'],'原價':['日幣單價'],'總計':['日幣小計'],'出貨單號':[]};
 const headers=(sheet.getLastColumn()?sheet.getRange(1,1,1,sheet.getLastColumn()).getDisplayValues()[0]:[]).map(x=>String(x).trim()),columns={};
 PURCHASE_HEADERS_.forEach(name=>{
  const accepted=[name,...(aliases[name]||[])],found=[];headers.forEach((h,i)=>{if(accepted.includes(h))found.push(i+1);});
  if(found.length>1)throw new Error('訂購記錄欄位標題重複：'+name);
  if(found.length){columns[name]=found[0];if(ensure&&headers[found[0]-1]!==name){sheet.getRange(1,found[0]).setValue(name);headers[found[0]-1]=name;}}
 });
 if(ensure)PURCHASE_HEADERS_.forEach(name=>{if(!columns[name]){const column=headers.length+1;sheet.getRange(1,column).setValue(name);headers.push(name);columns[name]=column;}});
 else if(!columns['訂單編號'])throw new Error('訂購記錄缺少欄位標題：訂單編號');
 return {columns,width:headers.length};
}
function purchaseReadRows_(sheet){
 const {columns}=purchaseColumns_(sheet);
 return sheet.getDataRange().getDisplayValues().slice(1).map(row=>PURCHASE_HEADERS_.map(name=>columns[name]?row[columns[name]-1]||'':''));
}
function purchaseWriteCell_(sheet,row,name,value,schema){
 const {columns}=schema||purchaseColumns_(sheet,true);sheet.getRange(row,columns[name]).setNumberFormat('@').setValue(value);
}
function purchaseOrders_(){
  const sheet=ss().getSheetByName('訂購記錄');if(!sheet)return {orders:[]};
  const rows=purchaseReadRows_(sheet),map=new Map();
  rows.forEach(r=>{if(!r[0])return;if(!map.has(r[0]))map.set(r[0],{number:r[0],date:r[1],status:r[13]||'未出貨',tracking:r[14]||'',weight:r[15]||'',shipping:r[16]||'',orderURL:r[17]||'',channel:r[18]||'',contents:r[19]||'',items:[]});map.get(r[0]).items.push({code:r[2],name:r[3],originalName:r[4],quantity:Number(r[5]),price:Number(r[6]),total:Number(r[7]),source:r[8],group:r[9],role:r[10],url:r[11],image:r[12]||'',status:r[13]||'未出貨',tracking:r[14]||'',weight:r[15]||'',shipping:r[16]||''});});
  return {orders:[...map.values()].reverse()};
}
function purchaseImageFor_(candidates,item){
  for(const source of ['最新開團',STOCK,'已收單']){
    let rows=(candidates||[]).filter(c=>c.source===source&&/^https?:\/\//i.test(c.image||''));
    if(!rows.length)continue;
    // 同貨號多個圖片時，優先使用已選定團名或商品網址。
    const exact=rows.filter(c=>(item.url&&c.url===item.url)||(item.group&&c.group===item.group&&c.role===(item.role||'')));
    if(exact.length)rows=exact;
    const images=[...new Set(rows.map(c=>c.image.trim()))];
    if(images.length===1)return images[0];
  }
  return '';
}
function purchaseMatch_(p){
  const requested=JSON.parse(p.codes||'[]');if(!Array.isArray(requested)||requested.length>300)throw new Error('一次最多比對 300 項');
  const result={},cache=CacheService.getScriptCache(),codes=[];requested.forEach(value=>{const c=String(value);result[c]=[];if(!c)return;const key='purchase_match_v2_'+c;let saved=null;try{saved=cache.get(key);}catch(_){}if(saved!==null){try{result[c]=JSON.parse(saved);return;}catch(_){}}codes.push(c);});if(!codes.length)return {matches:result};
  [STOCK,'最新開團','尚未上架','已收單'].forEach(source=>{
    const sheet=ss().getSheetByName(source);if(!sheet)return;
    const rows=sheet.getDataRange().getDisplayValues(),headers=(rows.shift()||[]).map(x=>x.trim());
    const ci=['貨號','商品貨號','條碼','SN'].map(x=>headers.indexOf(x)).filter(x=>x>=0);let group='';
    const get=(r,names)=>{const i=col(headers,names);return i>=0?r[i]:'';};
    rows.forEach(r=>{group=get(r,['團名'])||group;codes.forEach(code=>{
      const keys=stockCodeKeys(code);if(!ci.some(i=>stockCodeKeys(r[i]).some(k=>keys.includes(k))))return;
      const item={name:get(r,['名稱','商品名稱','品名','商品']),source,group:source===STOCK?'':group,role:get(r,['角色']),url:get(r,['商品網址','網址','URL']),image:(get(r,['圖片','商品圖片','圖片網址','圖片連結','商品圖','照片'])||'').split(/\r?\n/).find(v=>/^https?:\/\//i.test(v.trim()))||''};
      if(item.name&&!result[code].some(x=>JSON.stringify(x)===JSON.stringify(item)))result[code].push(item);
    });});
  });codes.forEach(c=>{try{const payload=JSON.stringify(result[c]);if(payload.length<20000)cache.put('purchase_match_v2_'+c,payload,300);}catch(_){}});return {matches:result};
}
function purchaseSave_(p){
  const number=String(p.number||'').trim()||((p.manual===true||p.manual==='true')?'MANUAL-'+Utilities.getUuid():''),date=String(p.date||''),items=JSON.parse(p.items||'[]');
  if(String(p.shipping??'').trim()!==''&&(!Number.isFinite(Number(p.shipping))||Number(p.shipping)<0))throw new Error('運費無效');
  const initialStatus=String(p.status||'未出貨');if(!['未出貨','已出貨'].includes(initialStatus))throw new Error('訂單狀態無效');
  const orderURL=String(p.orderURL||'').trim();if(orderURL&&!purchaseOrderURLValid_(orderURL))throw new Error('官網訂單網址無效');
  if(!number||number.length>120||!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Array.isArray(items)||!items.length||items.length>300)throw new Error('請確認訂單編號、日期與商品');
  const parsed=new Date(date+'T00:00:00Z');if(!isFinite(parsed.getTime())||parsed.toISOString().slice(0,10)!==date)throw new Error('訂購日期無效');
  items.forEach(x=>{if((!x.code&&!(p.manual===true||p.manual==='true'))||!Number.isInteger(Number(x.quantity))||Number(x.quantity)<=0||!Number.isFinite(Number(x.price))||Number(x.price)<0||!Number.isFinite(Number(x.total))||Number(x.total)<0)throw new Error('商品數量或金額無效');});
  const orderAmountMode=(p.manual===true||p.manual==='true')&&String(p.orderAmount??'').trim()!=='';
  if(orderAmountMode){const amount=Number(p.orderAmount);if(!Number.isFinite(amount)||amount<0)throw new Error('訂單總金額無效');items.forEach((x,i)=>{x.price=0;x.total=i===0?amount:0;});}
  else if(p.manual===true||p.manual==='true')items.forEach(x=>{x.total=Number(x.quantity)*Number(x.price);if(!Number.isFinite(x.total))throw new Error('商品總額無效');});
  const lock=LockService.getScriptLock();lock.waitLock(30000);
  try{
    let sheet=ss().getSheetByName('訂購記錄');
    if(sheet&&sheet.getLastRow()>1){const prior=purchaseReadRows_(sheet);if(prior.some(r=>(p.registrationId&&r[21]===String(p.registrationId))||r[0]===number||r[20]===number))return {ok:true,existing:true,merged:!!String(p.tracking||'').trim()};}
    if(!sheet){sheet=ss().insertSheet('訂購記錄');sheet.getRange(1,1,1,PURCHASE_HEADERS_.length).setValues([PURCHASE_HEADERS_]);sheet.setFrozenRows(1);}
    const schema=purchaseColumns_(sheet,true);
    const safe=v=>{const t=String(v||'');return /^[=+@-]/.test(t)?"'"+t:t;};
    const rows=items.map((x,i)=>[safe(number),date,safe(x.code),safe(x.name),safe(x.originalName),Number(x.quantity),Number(x.price),Number(x.total),safe(x.source),safe(x.group),safe(x.role),safe(x.url),safe(x.image),initialStatus,safe(p.tracking),'',i===0?String(p.shipping??''):'',orderURL,safe(p.channel),i===0&&!/^[淘拼微紅]/.test(String(p.channel||'').trim())?safe(p.contents):'',safe(number),safe(p.registrationId||number)]);
    const start=sheet.getLastRow()+1;const output=rows.map(row=>{const out=Array(schema.width).fill('');PURCHASE_HEADERS_.forEach((name,i)=>out[schema.columns[name]-1]=row[i]);return out;});PURCHASE_HEADERS_.filter(name=>!['數量','原價','總計'].includes(name)).forEach(name=>sheet.getRange(start,schema.columns[name],rows.length,1).setNumberFormat('@'));sheet.getRange(start,1,rows.length,schema.width).setValues(output);const merged=purchaseMergeTracking_(sheet,p.tracking);if(initialStatus==='已出貨')purchaseAdvanceGroups_();SpreadsheetApp.flush();return {ok:true,merged};
  }finally{lock.releaseLock();}
}

function purchaseMergeTracking_(sheet,tracking){
 tracking=String(tracking||'').trim();if(!tracking)return false;
 const rows=purchaseReadRows_(sheet),numbers=new Set(rows.filter(r=>String(r[14]||'').trim()===tracking).map(r=>r[0]));if(numbers.size<2)return false;
 const matching=rows.map((r,i)=>({r,row:i+2})).filter(x=>numbers.has(x.r[0])),canonical=matching[0].r[0],schema=purchaseColumns_(sheet,true),counts=new Map(),free=[];
 matching.forEach(({r})=>String(r[19]||'').split(/[、,，;；\n]+/).map(v=>v.trim()).filter(Boolean).forEach(part=>{const m=part.match(/^(.*?)\s*[x×*]\s*(\d+)$/i)||part.match(/^(.*?\D)\s*(\d+)$/);if(m){const type=m[1].trim();counts.set(type,(counts.get(type)||0)+Number(m[2]));}else free.push(part);}));
 const contents=[...[...counts].map(([type,count])=>type+'x'+count),...free].join('、');
 const stages=['未出貨','已出貨','集運中','已打包','已到貨'];const status=stages[Math.max(1,...matching.map(x=>Math.max(0,stages.indexOf(x.r[13]))))];
 purchaseWriteCell_(sheet,matching[0].row,'狀態',status,schema);
 if(!matching[0].r[15]){const weight=matching.find(x=>String(x.r[15]||'').trim()!=='');if(weight)purchaseWriteCell_(sheet,matching[0].row,'重量',weight.r[15],schema);}
 matching.forEach(({r,row},i)=>{if(!r[20])purchaseWriteCell_(sheet,row,'原訂單編號',r[0],schema);if(r[0]!==canonical)purchaseWriteCell_(sheet,row,'訂單編號',canonical,schema);purchaseWriteCell_(sheet,row,'出貨單號',tracking,schema);purchaseWriteCell_(sheet,row,'內容物',i===0?contents:'',schema);});
 return true;
}

function purchaseImage_(p){
 const image=String(p.image||'').trim();if(!/^https?:\/\/[^\s]+$/i.test(image))throw new Error('圖片網址無效');
 const refs=JSON.parse(p.refs||'[]');if(!Array.isArray(refs)||!refs.length||refs.length>300)throw new Error('商品資料無效');
 const lock=LockService.getScriptLock();lock.waitLock(30000);
 try{
  const sheet=sh('訂購記錄'),rows=purchaseReadRows_(sheet),schema=purchaseColumns_(sheet,true),targets=[];
  refs.forEach(ref=>{if(!Number.isInteger(ref.index)||ref.index<0)throw new Error('商品資料無效');const matching=[];rows.forEach((row,i)=>{if(row[0]===String(ref.number))matching.push(i+2);});if(!matching[ref.index])throw new Error('找不到商品，請重新載入訂單');targets.push(matching[ref.index]);});
  [...new Set(targets)].forEach(row=>purchaseWriteCell_(sheet,row,'圖片',image,schema));SpreadsheetApp.flush();return {ok:true};
 }finally{lock.releaseLock();}
}

function purchaseEdit_(p){
 const autoShip=(p.autoShipTracking===true||p.autoShipTracking==='true')&&String(p.tracking||'').trim()!=='';
 const autoTransit=(p.autoTransitWeight===true||p.autoTransitWeight==='true')&&String(p.weight??'').trim()!=='';
 const number=String(p.number||''),status=autoTransit?'集運中':autoShip?'已出貨':String(p.status||'未出貨');
 if(!number||!['未出貨','已出貨','集運中','已打包','已到貨'].includes(status))throw new Error('訂單資料無效');
 ['weight','shipping'].forEach(k=>{if(String(p[k]||'').trim()!==''&&(!isFinite(Number(p[k]))||Number(p[k])<0))throw new Error('重量或運費無效');});
 const orderURL=String(p.orderURL||'').trim();if(orderURL&&!purchaseOrderURLValid_(orderURL))throw new Error('官網訂單網址無效');
 if(p.date!==undefined){const date=String(p.date),parsed=new Date(date+'T00:00:00Z');if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(parsed.getTime())||parsed.toISOString().slice(0,10)!==date)throw new Error('訂購日期無效');}
 const lock=LockService.getScriptLock();lock.waitLock(30000);
 try{
  const sheet=sh('訂購記錄'),rows=purchaseReadRows_(sheet),matches=[];rows.forEach((r,i)=>{if(r[0]===number)matches.push(i);});
  if(!matches.length)throw new Error('找不到訂單，請重新載入');
  const safe=v=>{const t=String(v||'');return /^[=+@-]/.test(t)?"'"+t:t;};
  const schema=purchaseColumns_(sheet,true);
  if(p.date!==undefined)matches.forEach(row=>{if(rows[row][1]!==String(p.date))purchaseWriteCell_(sheet,row+2,'日期',String(p.date),schema);});
  // 整筆訂單的共同欄位只保存於第一筆明細，商品資料保持原值。
  matches.forEach((row,i)=>{const fields=i===0?[status,safe(p.tracking),String(p.weight||''),String(p.shipping||'')]:['','','',''];['狀態','出貨單號','重量','運費'].forEach((name,j)=>{if(String(rows[row][13+j]||'')!==String(fields[j]))purchaseWriteCell_(sheet,row+2,name,fields[j],schema);});});
  if(!/^[淘拼微紅]/.test(String(p.channel??rows[matches[0]][18]??'').trim())&&p.contents!==undefined&&String(rows[matches[0]][19]||'')!==String(p.contents))purchaseWriteCell_(sheet,matches[0]+2,'內容物',safe(p.contents),schema);
  if(p.channel!==undefined&&rows[matches[0]][18]!==String(p.channel))purchaseWriteCell_(sheet,matches[0]+2,'通路',safe(p.channel),schema);
  if(p.orderURL!==undefined&&rows[matches[0]][17]!==orderURL)purchaseWriteCell_(sheet,matches[0]+2,'訂單網址',orderURL,schema);
  const merged=purchaseMergeTracking_(sheet,p.tracking);if(status!==(rows[matches[0]][13]||'未出貨')&&status!=='未出貨')purchaseAdvanceGroups_();SpreadsheetApp.flush();return {ok:true,merged};
 }finally{lock.releaseLock();}
}

function purchaseAdvanceGroups_(){
 const sheet=ss().getSheetByName('訂購記錄');if(!sheet)return [];
 const rows=purchaseReadRows_(sheet),orders=new Map(),groups=new Map();
 rows.forEach(r=>{if(!r[0])return;if(!orders.has(r[0]))orders.set(r[0],r[13]||'未出貨');const name=norm(r[9]);if(name){if(!groups.has(name))groups.set(name,new Set());groups.get(name).add(r[0]);}});
 const stages={'未出貨':0,'已出貨':1,'集運中':1,'已打包':2,'已到貨':3},targets=new Map();
 groups.forEach((numbers,name)=>{const stage=Math.min(...[...numbers].map(n=>stages[orders.get(n)]||0));if(stage)targets.set(name,['','集運中','路上','點貨中'][stage]);});
 if(!targets.size)return [];
 const changed=[];
 ['最新開團','已收單'].forEach(source=>{if(!ss().getSheetByName(source))return;const d=launchRead_(source,false,false),ci=d.headers.indexOf('運送狀態');if(ci<0)return;launchGroups_(d,source,false).forEach(g=>{const row=g.indices[0],status=groupWorkStatus_(d.rows[row-2][ci]);const target=targets.get(g.name),rank=['尚未結單','未出貨','集運中','路上','點貨中','出貨中','下班！'];if(g.joined&&target&&rank.indexOf(status)<rank.indexOf(target)){d.sheet.getRange(row,ci+1).setValue(target);changed.push(g.name);}});});
 if(changed.length)clearPublicGroupWorkCache_();return changed;
}
function purchaseSync_(p){
 const number=String(p.number||''),url=String(p.url||''),state=String(p.state||'');if(!['未発送','発送済'].includes(state))throw new Error('配送狀態無效');
 const lock=LockService.getScriptLock();lock.waitLock(30000);
 try{
  const sheet=sh('訂購記錄'),rows=purchaseReadRows_(sheet),i=rows.findIndex(r=>r[0]===number);if(i<0||rows[i][17]!==url)throw new Error('訂單網址不符');
  const previous=rows[i][13]||'未出貨',next=state==='発送済'?'已出貨':'未出貨';
  if(['未出貨','已出貨'].includes(previous)&&previous!==next)purchaseWriteCell_(sheet,i+2,'狀態',next);
  if(p.tracking&&String(p.tracking)!==rows[i][14])purchaseWriteCell_(sheet,i+2,'出貨單號',String(p.tracking).replace(/[^0-9A-Za-z-]/g,''));
  const groups=purchaseAdvanceGroups_();SpreadsheetApp.flush();return {ok:true,groups};
 }finally{lock.releaseLock();}
}

function purchaseChannels_(){
 const sheet=ss().getSheetByName('訂購記錄');if(!sheet)return {channels:[]};
 return {channels:[...new Set(purchaseReadRows_(sheet).map(r=>String(r[18]||'').trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'zh-Hant'))};
}
