/* Manual Discord backup. No credentials and no network requests. */
(()=>{
if(window.JiwuManualBackup)return;
const CHANNEL='https://discord.com/channels/1535638748002394164/1564210932618362890';
function clean(kind,p){
 const fields=kind==='store'?['requestId','checkoutAt','items','total','received','change','payment','note','salesperson']:['requestId','source','lineName','igAccount','cartItems','deliveryMethod','note'];
 const params={};for(const k of fields)if(p[k]!==undefined)params[k]=structuredClone(p[k]);
 return {format:'jiwu-manual-backup-v1',kind,createdAt:new Date().toISOString(),params};
}
function file(record){return new File([JSON.stringify(record,null,2)],'jiwu-backup-'+record.params.requestId+'.json',{type:'application/json'});}
function summary(record){const p=record.params,items=record.kind==='store'?(typeof p.items==='string'?JSON.parse(p.items):p.items):p.cartItems;return [record.kind==='store'?'店面結帳備援':'線上訂單備援','編號：'+p.requestId,record.kind==='store'?'時間：'+new Date(p.checkoutAt).toLocaleString('zh-TW',{timeZone:'Asia/Taipei'})+'\n店員：'+p.salesperson+'\n付款：'+p.payment+'\n總額：$'+p.total:'客人：'+p.lineName+'\n取貨：'+(p.deliveryMethod||''),...items.map((x,i)=>(i+1)+'. '+x.name+' '+[x.role,x.selectedSize,x.selectedColor].filter(Boolean).join(' / ')+' ×'+(x.qty||1)+'　$'+x.price),p.note?'備註：'+p.note:''].filter(Boolean).join('\n');}
function download(record){const url=URL.createObjectURL(file(record)),a=document.createElement('a');a.href=url;a.download=file(record).name;a.click();setTimeout(()=>URL.revokeObjectURL(url),60000);}
function open(record,{confirm=false}={}){return new Promise((resolve,reject)=>{
 const overlay=document.createElement('div');overlay.setAttribute('role','dialog');overlay.setAttribute('aria-modal','true');overlay.setAttribute('aria-label','Discord 備援明細');overlay.style.cssText='position:fixed;inset:0;z-index:100000;background:#0006;display:flex;align-items:center;justify-content:center;padding:16px;box-sizing:border-box';
 const card=document.createElement('section');card.style.cssText='width:100%;max-width:500px;max-height:90dvh;overflow:auto;background:white;color:#555;border-radius:18px;padding:22px;box-sizing:border-box;font:15px/1.6 -apple-system,sans-serif;display:grid;gap:14px';
 const title=document.createElement('strong');title.textContent='分享到 Discord，等待本機補登';title.style.fontSize='19px';
 const hint=document.createElement('div');hint.textContent='先分享備援檔，在 Discord 選擇目前的訂單頻道並按傳送。產生檔案或開啟分享選單，都還不代表 Discord 已收到。';
 const preview=document.createElement('pre');preview.textContent=summary(record);preview.style.cssText='white-space:pre-wrap;overflow-wrap:anywhere;font:inherit;margin:0;padding:14px;background:#f5f4f2;border-radius:12px;max-height:30dvh;overflow:auto';
 const status=document.createElement('div');status.setAttribute('role','status');status.textContent='備援編號會保留；重分享同一筆不會新增交易編號。';
 function button(label,fn){const b=document.createElement('button');b.type='button';b.textContent=label;b.style.cssText='min-height:46px;padding:11px 14px;border:0;border-radius:11px;background:#eee;color:#555;font:inherit;cursor:pointer';b.onclick=fn;return b;}
 const share=button('分享備援檔案到 Discord',async()=>{try{const f=file(record);if(!navigator.canShare?.({files:[f]})||!navigator.share){download(record);status.textContent='已交給瀏覽器下載，請從「檔案」分享此 JSON 檔到 Discord。';return;}await navigator.share({files:[f],title:'吉物備援明細'});status.textContent='請確認 Discord 頻道內已出現這份備援檔。';}catch(e){status.textContent=e.name==='AbortError'?'分享已取消，資料仍保留。':'無法分享，請改用下載備援檔。';}});share.style.background='#A68C73';share.style.color='white';
 const dl=button('下載備援檔',()=>download(record));
 const link=document.createElement('a');link.href=CHANNEL;link.target='_blank';link.rel='noopener';link.textContent='開啟 Discord 訂單頻道';link.style.cssText='text-align:center;padding:10px;color:#85705d';
 const close=()=>overlay.remove();
 card.append(title,hint,preview,share,dl,link,status);
 if(confirm)card.append(button('我已在 Discord 按傳送，保留待補登',()=>{close();resolve({ok:true,manualBackup:true,storeQueued:true});}));
 card.append(button(confirm?'返回，保留購物車':'關閉',()=>{close();if(confirm)reject(Error('備援尚未確認傳送，購物車已保留'));else resolve();}));overlay.append(card);document.body.append(overlay);share.focus();
 });}
window.JiwuManualBackup={clean,file,summary,open};
})();

/* Phone-local manual Discord backup; no cloud checkout queue. */
(()=>{
const endpoint='https://jiwu-mac-relay.jiwusales.workers.dev/functions/v1/jiwu-admin-test',KEY='jiwu-store-cloud-v1',CART='jiwu-store-offline-carts-v1',PRODUCTS='jiwu-store-scan-cache-v1';
let warming=null,polling=false;
const memory=new Map(),localSaved=new Map();let databasePromise=null;
function database(){if(databasePromise)return databasePromise;databasePromise=new Promise(resolve=>{try{if(typeof indexedDB==='undefined')return resolve(null);const req=indexedDB.open('jiwu-store-durable-v1',1);req.onupgradeneeded=()=>{if(!req.result.objectStoreNames.contains('values'))req.result.createObjectStore('values')};req.onsuccess=()=>resolve(req.result);req.onerror=()=>resolve(null);req.onblocked=()=>resolve(null);}catch{resolve(null)}});return databasePromise;}
async function dbWrite(key,value){try{const db=await database();if(!db)return false;return await new Promise(resolve=>{const tx=db.transaction('values','readwrite');tx.objectStore('values').put(value,key);tx.oncomplete=()=>resolve(true);tx.onerror=()=>resolve(false);tx.onabort=()=>resolve(false)})}catch{return false}}
const read=(key,fallback)=>{if(memory.has(key))return structuredClone(memory.get(key));try{return JSON.parse(localStorage.getItem(key)||'null')||fallback}catch{return fallback}};
function save(key,value){value=structuredClone(value);if(key===KEY&&Array.isArray(value.receipts)){const done=value.receipts.filter(r=>r.state==='done').slice(-10).map(r=>({state:'done',params:{requestId:r.params.requestId,checkoutAt:r.params.checkoutAt,total:r.params.total,salesperson:r.params.salesperson}}));value.receipts=[...value.receipts.filter(r=>r.state!=='done'),...done];}memory.set(key,value);let stored=false;try{localStorage.setItem(key,JSON.stringify(value));stored=true}catch{}localSaved.set(key,stored);void dbWrite(key,value);return stored;}
async function persist(key,value){const local=save(key,value);return (await dbWrite(key,memory.get(key)))||local;}
const storageReady=(async()=>{const db=await database();if(!db)return;for(const key of [KEY,CART,PRODUCTS]){try{const value=await new Promise(resolve=>{const req=db.transaction('values').objectStore('values').get(key);req.onsuccess=()=>resolve(req.result);req.onerror=()=>resolve(null)});if(value&&!memory.has(key))memory.set(key,value)}catch{}}})();
const state=()=>read(KEY,{ticket:'',token:'',expiresAt:0,receipts:[]});

const connectionError=e=>/連線|伺服器|fetch|network|abort|load failed|Mac connection|暫時失敗|逾時|timeout/i.test(String(e?.message||e));
function authorizedLocal(){const s=state();return !!(s.token&&s.expiresAt>Date.now());}
async function warm(){await storageReady;if(authToken){const s=state();s.token=authToken;s.expiresAt=Number(authToken.split('.')[0]);await persist(KEY,s);}paint();}
function paint(){if(document.body.dataset.page!=='store')return;let box=document.getElementById('storeCloudStatus');if(!box){const target=document.querySelector('.top');if(!target)return;box=document.createElement('button');box.type='button';box.id='storeCloudStatus';target.append(box)}const pending=state().receipts.filter(r=>r.state!=='done');box.textContent='↗';box.classList.toggle('ready',authorizedLocal());const status='Discord 手動備援'+(pending.length?' · 保留 '+pending.length+' 筆':'');box.title=status;box.setAttribute('aria-label',status);box.onclick=()=>showReceipts();}
function showReceipts(){const list=state().receipts.filter(r=>r.state!=='done');if(!list.length){alert('尚無待補登備援。斷線時結帳會產生檔案，請手動分享到 Discord。');return;}const panel=document.createElement('div');panel.style.cssText='position:fixed;inset:0;z-index:99999;background:#0006;display:grid;place-items:center;padding:18px';const box=document.createElement('div');box.style.cssText='background:white;border-radius:16px;padding:20px;display:grid;gap:12px;max-height:85dvh;overflow:auto;width:min(100%,440px)';const title=document.createElement('strong');title.textContent='保留的備援明細（完成狀態請看 Discord）';box.append(title);for(const r of list){const b=document.createElement('button');b.textContent=new Date(r.params.checkoutAt).toLocaleString('zh-TW')+'　$'+r.params.total+'　'+(r.state==='manual'?'已確認手動傳送':'尚未確認傳送');b.style.cssText='padding:12px;border:0;border-radius:10px;text-align:left';b.onclick=()=>window.JiwuManualBackup.open(window.JiwuManualBackup.clean('store',r.params));box.append(b);const done=document.createElement('button');done.textContent='已在 Discord 確認補登，移出待處理';done.style.cssText='padding:10px;border:0;border-radius:10px;color:#777';done.onclick=()=>{if(!confirm('請先確認 Discord 已顯示這個編號補登完成。確定移出待處理？'))return;const next=state(),found=next.receipts.find(x=>x.params.requestId===r.params.requestId);if(found)found.state='done';save(KEY,next);panel.remove();paint();};box.append(done);}const close=document.createElement('button');close.textContent='關閉';close.onclick=()=>panel.remove();close.style.padding='12px';box.append(close);panel.append(box);document.body.append(panel);}
window.jiwuStoreOfflineMode=false;
window.jiwuRestoreStoreOffline=async function(){await storageReady;const s=state();if(!authorizedLocal())return false;authToken=s.token;sessionStorage.setItem(AUTH_TOKEN_KEY,authToken);sessionStorage.setItem('jiwu_supabase_test_current_tab','store');window.jiwuStoreOfflineMode=true;startApp();paint();return true;};
const originalTab=tab;tab=function(name,el){if(window.jiwuStoreOfflineMode&&name!=='store'){launchCompletionToast('主機離線，目前僅能使用店面結帳與手動備援',true);return;}return originalTab(name,el);};
const originalRequest=apiRequest;
apiRequest=async function(action,params={}){
 await storageReady;
 if(window.jiwuStoreOfflineMode&&!['authCheck','storeCheckout','storeCart','storeCartSet','storeCartClear','storeScan'].includes(action))throw Error('主機離線，目前僅能使用店面結帳與手動備援');
 if(action==='authCheck'){try{const result=await originalRequest(action,params);window.jiwuStoreOfflineMode=false;await warm();return result;}catch(e){if(!connectionError(e))throw e;if(await window.jiwuRestoreStoreOffline())return {ok:true,offlineStore:true};throw e;}}
 if(action==='storeCheckout'){
  const initial=state(),signature=JSON.stringify([params.items,params.total,params.payment,params.note,params.salesperson,params.received,params.change]);
  let record=initial.receipts.find(r=>r.state==='unknown'&&r.signature===signature);
  if(!record){record={signature,state:'unknown',params:{...params,requestId:params.requestId||crypto.randomUUID(),checkoutAt:new Date().toISOString()}};initial.receipts.push(record);if(!await persist(KEY,initial))throw Error('裝置無法儲存備援編號，購物車已保留，請勿關閉此頁');}
  if(!window.jiwuStoreOfflineMode)try{const direct=await originalRequest('storeCheckout',record.params);const next=state(),found=next.receipts.find(r=>r.params.requestId===record.params.requestId);if(found)found.state='done';save(KEY,next);const carts=read(CART,{});delete carts[params.salesperson];save(CART,carts);await warm();return direct;}catch(e){if(!connectionError(e)){const next=state();next.receipts=next.receipts.filter(r=>r.params.requestId!==record.params.requestId);save(KEY,next);throw e;}}
  if(!authorizedLocal()&&!authToken)throw Error('請先在本機連線時登入此裝置');
  const result=await window.JiwuManualBackup.open(window.JiwuManualBackup.clean('store',record.params),{confirm:true});
  const next=state(),found=next.receipts.find(r=>r.params.requestId===record.params.requestId);if(found)found.state='manual';if(!await persist(KEY,next))throw Error('備援狀態無法儲存，請保留 Discord 原檔');
  const carts=read(CART,{});delete carts[params.salesperson];save(CART,carts);paint();launchCompletionToast('已保留備援明細，補登結果請看 Discord');return {...result,storeQueued:true};
 }
 const carts=read(CART,{}),user=params.salesperson||salesperson;
 const unsettled=state().receipts.some(r=>r.params.salesperson===user&&r.state!=='done');
 if(action==='storeCart'&&(carts[user]||unsettled))return {ok:true,cart:carts[user]||structuredClone(storeCart),localOnly:true};
 try{if((unsettled||window.jiwuStoreOfflineMode)&&['storeCartSet','storeCartClear','storeScan'].includes(action))throw Error('Mac connection pending receipt');const result=await originalRequest(action,params);
  if(action==='storeCartSet'){delete carts[user];save(CART,carts)}
  if(action==='storeScan'){const product=(result.cart||[]).find(x=>x.code===params.barcode);if(product){const cache=read(PRODUCTS,{});cache[params.barcode]=product;save(PRODUCTS,cache)}}
  return result;
 }catch(e){if(!connectionError(e)||!['storeCartSet','storeCartClear','storeScan'].includes(action))throw e;
  if(!authorizedLocal())throw Error('此裝置的登入已到期，購物車保留，請在本機連線後登入');let cart;
  if(action==='storeCartSet')cart=JSON.parse(params.items);
  else if(action==='storeCartClear')cart=[];
  else{const item=read(PRODUCTS,{})[params.barcode];if(!item)throw Error('主機離線，這個貨號沒有裝置商品快取，請改用手動商品');cart=structuredClone(storeCart);const existing=cart.find(x=>x.code===item.code);if(existing)existing.qty++;else cart.push({...item,qty:1})}
  carts[user]=cart;if(!await persist(CART,carts))throw Error('裝置儲存空間不足，請勿關閉此頁');paint();return {ok:true,cart,localOnly:true};
 }
};
const render=renderStore;renderStore=function(...args){const result=render(...args);paint();void warm();return result;};
window.addEventListener('online',()=>{if(window.jiwuStoreOfflineMode)void originalRequest('authCheck').then(()=>{window.jiwuStoreOfflineMode=false;void warm()}).catch(()=>{});});
if(document.body.dataset.page==='store'){paint();void warm()}
if(!authToken&&!appStarted)void window.jiwuRestoreStoreOffline();
})();
