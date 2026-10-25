/* Durable cloud intake for authenticated store sales. No inventory is decremented in the browser. */
(()=>{
const endpoint='https://jiwu-mac-relay.jiwusales.workers.dev/functions/v1/jiwu-admin-test',KEY='jiwu-store-cloud-v1',CART='jiwu-store-offline-carts-v1',PRODUCTS='jiwu-store-scan-cache-v1';
let warming=null,polling=false;
const read=(key,fallback)=>{try{return JSON.parse(localStorage.getItem(key)||'null')||fallback}catch{return fallback}};
const save=(key,value)=>localStorage.setItem(key,JSON.stringify(value));
const state=()=>read(KEY,{ticket:'',token:'',expiresAt:0,receipts:[]});
const connectionError=e=>/連線|伺服器|fetch|network|abort|load failed|Mac connection|暫時失敗/i.test(String(e?.message||e));
async function cloud(mode,params){const abort=new AbortController(),timer=setTimeout(()=>abort.abort(),15000);try{const r=await fetch(endpoint+'?__store_queue='+mode,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(params),signal:abort.signal});const text=await r.text();let value;try{value=JSON.parse(text)}catch{throw Error('雲端暫存回應無法確認，商品保留，請重試');}if(!r.ok||value.ok!==true)throw Error(value.error||'雲端暫存失敗');return value;}finally{clearTimeout(timer)}}
async function warm(){if(!authToken)return null;const before=state();if(before.token===authToken&&before.ticket&&before.expiresAt>Date.now()+3600000)return before;if(warming)return warming;const token=authToken;warming=(async()=>{try{const result=await cloud('session',{token});if(authToken!==token)return null;const next=state();Object.assign(next,{ticket:result.ticket,token,expiresAt:result.expiresAt});save(KEY,next);paint();return next;}catch{paint();return state();}finally{warming=null}})();return warming;}
function credentials(){const s=state();if(!authToken||s.token!==authToken||!s.ticket||s.expiresAt<=Date.now())throw Error('店面雲端暫存尚未啟用或已到期，請在主機連線時開啟店面頁一次');return {token:authToken,storeQueueTicket:s.ticket};}
function paint(){if(document.body.dataset.page!=='store')return;let box=document.getElementById('storeCloudStatus');if(!box){box=document.createElement('div');box.id='storeCloudStatus';box.setAttribute('role','status');box.style.cssText='margin:8px 0;padding:10px 12px;border-radius:10px;background:#f4eee5;color:#6a5442;font-size:13px';const target=document.querySelector('.storePage');if(!target)return;target.prepend(box)}const s=state(),mine=s.receipts,pending=mine.filter(r=>!['done'].includes(r.state)),ready=s.token===authToken&&s.expiresAt>Date.now();box.textContent=(window.jiwuStoreOfflineMode?'離線店面模式 · ':'')+(ready?'店面雲端暫存已就緒':'店面雲端暫存尚未就緒')+(pending.length?' · 待確認 '+pending.length+' 筆':'');if(pending.length){const button=document.createElement('button');button.type='button';button.className='btn light';button.style.cssText='margin-left:8px;padding:5px 8px;font-size:12px';button.textContent='查看暫存';button.onclick=()=>{const messages=pending.map(r=>new Date(r.params.checkoutAt).toLocaleString('zh-TW')+'　$'+r.params.total+'　'+({pending:'雲端已收件，待主機補登',leased:'補登中',quarantine:'補登失敗，已保留待處理',unknown:'尚未確認雲端收件，請用原購物車重試'}[r.state]||r.state));alert(messages.join('\n'))};box.append(button)}if(Object.keys(read(CART,{})).length)box.append(document.createTextNode(' · 購物車有本機保留內容'));}
async function poll(){if(polling||!authToken)return;const s=state(),receipts=s.receipts.filter(r=>!['done','unknown'].includes(r.state));if(!receipts.length){paint();return;}polling=true;try{const result=await cloud('status',{...credentials(),ids:receipts.slice(-100).map(r=>r.params.requestId)}),next=state();let done=false;for(const row of result.receipts){const item=next.receipts.find(r=>r.params.requestId===row.requestId);if(item&&row.state!=='unknown'){done||=item.state!=='done'&&row.state==='done';item.state=row.state}}save(KEY,next);paint();if(done){launchCompletionToast('雲端暫存店面銷售已補登');if(document.body.dataset.page==='store')renderStoreSales();}}catch{paint()}finally{polling=false}}
window.jiwuStoreOfflineMode=false;
window.jiwuRestoreStoreOffline=async function(){
 const s=state();if(!s.token||!s.ticket||s.expiresAt<=Date.now())return false;
 try{await cloud('status',{token:s.token,storeQueueTicket:s.ticket,ids:[]});authToken=s.token;sessionStorage.setItem(AUTH_TOKEN_KEY,authToken);sessionStorage.setItem('jiwu_supabase_test_current_tab','store');window.jiwuStoreOfflineMode=true;startApp();paint();return true;}catch{return false;}
};
const originalTab=tab;tab=function(name,el){if(window.jiwuStoreOfflineMode&&name!=='store'){launchCompletionToast('主機離線，目前僅能使用店面結帳與雲端暫存',true);return;}return originalTab(name,el);};
const originalRequest=apiRequest;
apiRequest=async function(action,params={}){
 if(window.jiwuStoreOfflineMode&&!['authCheck','storeCheckout','storeCart','storeCartSet','storeCartClear','storeScan'].includes(action))throw Error('主機離線，目前僅能使用店面結帳與雲端暫存');
 if(action==='authCheck'){try{const result=await originalRequest(action,params);window.jiwuStoreOfflineMode=false;paint();return result;}catch(e){if(!connectionError(e))throw e;if(await window.jiwuRestoreStoreOffline())return {ok:true,offlineStore:true};throw e;}}
 if(action==='storeCheckout'){
  await warm();const auth=credentials(),initial=state(),signature=JSON.stringify([params.items,params.total,params.payment,params.note,params.salesperson,params.received,params.change]);
  let record=initial.receipts.find(r=>r.state==='unknown'&&r.signature===signature);
  if(!record){record={signature,state:'unknown',params:{...params,requestId:params.requestId||crypto.randomUUID(),checkoutAt:new Date().toISOString()}};initial.receipts.push(record);save(KEY,initial)}
  let result;try{result=await cloud('checkout',{action:'storeCheckout',...record.params,...auth})}catch(e){paint();throw e}
  const next=state(),found=next.receipts.find(r=>r.params.requestId===record.params.requestId);if(found)found.state=result.needsReview?'quarantine':result.queued?'pending':'done';save(KEY,next);
  const carts=read(CART,{});delete carts[params.salesperson];save(CART,carts);paint();setTimeout(poll,1500);
  launchCompletionToast(result.needsReview?'已保留雲端，補登需要確認':'店面結帳已暫存雲端，待主機登記');return {...result,storeQueued:true};
 }
 const carts=read(CART,{}),user=params.salesperson||salesperson;
 const unsettled=state().receipts.some(r=>r.params.salesperson===user&&!['done'].includes(r.state));
 if(action==='storeCart'&&(carts[user]||unsettled))return {ok:true,cart:carts[user]||structuredClone(storeCart),localOnly:true};
 try{if(unsettled&&['storeCartSet','storeCartClear','storeScan'].includes(action))throw Error('Mac connection pending receipt');const result=await originalRequest(action,params);
  if(action==='storeCartSet'){delete carts[user];save(CART,carts)}
  if(action==='storeScan'){const product=(result.cart||[]).find(x=>x.code===params.barcode);if(product){const cache=read(PRODUCTS,{});cache[params.barcode]=product;save(PRODUCTS,cache)}}
  return result;
 }catch(e){if(!connectionError(e)||!['storeCartSet','storeCartClear','storeScan'].includes(action))throw e;
  // Only an already-authorized device may retain a local cart during a Mac outage.
  credentials();let cart;
  if(action==='storeCartSet')cart=JSON.parse(params.items);
  else if(action==='storeCartClear')cart=[];
  else{const item=read(PRODUCTS,{})[params.barcode];if(!item)throw Error('主機離線，這個貨號沒有本機商品快取，暫時無法掃描');cart=structuredClone(storeCart);const existing=cart.find(x=>x.code===item.code);if(existing)existing.qty++;else cart.push({...item,qty:1})}
  carts[user]=cart;save(CART,carts);paint();return {ok:true,cart,localOnly:true};
 }
};
const render=renderStore;renderStore=function(...args){const result=render(...args);paint();void warm().then(poll);return result;};
// Keep both the settled sale and its stable ID even if the acknowledgement is lost.
window.addEventListener('online',()=>{void warm().then(poll)});
setInterval(()=>{if(document.body.dataset.page==='store'){if(window.jiwuStoreOfflineMode)void originalRequest('authCheck').then(()=>{window.jiwuStoreOfflineMode=false;paint()}).catch(()=>{});void warm().then(poll)}},30000);
if(document.body.dataset.page==='store'){paint();void warm().then(poll)}
if(!authToken&&!appStarted)void window.jiwuRestoreStoreOffline();
})();
