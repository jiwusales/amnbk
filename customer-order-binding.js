/* Existing-customer binding inside the single-order rename dialog. */
let jiwuOrderBindingCustomers=[],jiwuOrderBindingLoadedAt=0,jiwuOrderBindingAuth='',jiwuOrderBindingLoading=null;
function jiwuOrderBindingCaption(rows){
 const ids=[...new Set((rows||[]).map(row=>String(getOnlineData(row,['顧客編號'])||'')).filter(Boolean))];
 if(ids.length!==1)return '';
 const id=ids[0],known=jiwuOrderBindingCustomers.find(c=>c.id===id)||(typeof customerChatSnapshot!=='undefined'?customerChatSnapshot?.find(c=>c.customerId===id):null);
 return `<span class="jiwuOrderBoundCaption" title="已綁定 ${esc(id)}">官LINE：${esc(known?.name||known?.customer||id)}</span>`;
}
async function jiwuLoadOrderBindingCustomers(){
 if(jiwuOrderBindingAuth!==authToken){jiwuOrderBindingCustomers=[];jiwuOrderBindingLoadedAt=0;jiwuOrderBindingAuth=authToken;}
 if(Date.now()-jiwuOrderBindingLoadedAt<60000)return jiwuOrderBindingCustomers;
 if(jiwuOrderBindingLoading)return jiwuOrderBindingLoading;
 const token=authToken;
 jiwuOrderBindingLoading=api('customerBindingList').then(result=>{if(token!==authToken)throw Error('登入狀態已變更，請重新開啟');jiwuOrderBindingCustomers=result.customers||[];jiwuOrderBindingLoadedAt=Date.now();return jiwuOrderBindingCustomers;}).finally(()=>{jiwuOrderBindingLoading=null;});
 return jiwuOrderBindingLoading;
}
function jiwuEnhanceOrderBindingDialog(){
 const form=document.querySelector('#appDialog form[data-order-rows]');if(!form||form.querySelector('.jiwuOrderBinding'))return;
 let snapshots;try{snapshots=JSON.parse(form.dataset.orderRows);}catch{return;}if(!snapshots?.length)return;
 const section=document.createElement('section');section.className='jiwuOrderBinding';
 section.innerHTML='<label class="jiwuOrderBindingLabel" for="jiwuOrderBindingSearch">綁定既有客戶（選填）</label><p class="jiwuOrderBindingHint">選擇官 LINE 客戶；上方姓名不改，就保留原訂單姓名。</p><input id="jiwuOrderBindingSearch" type="search" placeholder="搜尋客戶名字或 JIWU 編號" autocomplete="off" aria-label="搜尋既有客戶"><div class="jiwuOrderBindingSelected" aria-live="polite"></div><div class="jiwuOrderBindingResults" role="group" aria-label="符合的客戶"></div><p class="jiwuOrderBindingStatus" role="status">載入客戶清單…</p>';
 form.insertBefore(section,form.querySelector('.dialogActions'));const search=section.querySelector('input'),results=section.querySelector('.jiwuOrderBindingResults'),selected=section.querySelector('.jiwuOrderBindingSelected'),status=section.querySelector('.jiwuOrderBindingStatus');
 let customers=[],choice=null;
 const showSelection=()=>{selected.replaceChildren();if(!choice)return;const text=document.createElement('span');text.textContent=choice.name+' · '+choice.id;const clear=document.createElement('button');clear.type='button';clear.className='btn light';clear.textContent='取消選取';clear.onclick=()=>{choice=null;showSelection();render();};selected.append(text,clear);};
 const render=()=>{results.replaceChildren();const q=search.value.trim().toLocaleLowerCase(),matches=customers.filter(c=>!q||c.name.toLocaleLowerCase().includes(q)||c.id.toLocaleLowerCase().includes(q));for(const c of matches.slice(0,8)){const button=document.createElement('button');button.type='button';button.className='jiwuOrderBindingChoice';button.setAttribute('aria-pressed',String(choice?.id===c.id));const name=document.createElement('strong'),id=document.createElement('span');name.textContent=c.name;id.textContent=c.id+(c.hasLine?' · 已連結 LINE':'');button.append(name,id);button.onclick=()=>{choice=c;showSelection();render();};results.append(button);}status.textContent=customers.length?(matches.length?'找到 '+matches.length+' 位'+(matches.length>8?'，可輸入更多文字縮小範圍':''):'找不到符合的客戶'):'目前沒有已建立的客戶，請先用官 LINE 外掛或 Discord 建立。';};
 search.oninput=()=>{choice=null;showSelection();render();};
 form.addEventListener('submit',async event=>{
  if(!choice)return;
  event.preventDefault();event.stopImmediatePropagation();
  const newName=String(document.getElementById('onlineOrderNameInput')?.value||'').trim();if(!newName)return;
  const button=form.querySelector('[type=submit]');if(button.disabled)return;button.disabled=true;
  const customerId=choice.id;onlineMutationRevision++;
  try{
   const result=await apiBackground('bindOnlineOrderCustomer',{customerId,newName,orderRows:snapshots});
   const bound=new Map((result.boundRows||[]).map(row=>[String(row.id),row]));
   if(bound.size!==snapshots.length)throw Error('綁定回應不完整，請重新整理確認');
   const nameHeader=findHeader(onlineHeaders,['顧客名稱','客戶名稱','客人名稱','姓名']),numberHeader=findHeader(onlineHeaders,['顧客編號']);
   for(const list of [onlineRows,onlineEditBase||[]])for(const row of list){const saved=bound.get(String(row.itemId));if(saved){if(nameHeader)row.data[nameHeader]=saved.customer;if(numberHeader)row.data[numberHeader]=saved.customerId;}}
   onlineMutationRevision++;onlineLoadedAt=Date.now();saveOnlineSessionCache();
   if(document.body.dataset.page==='online')refreshCargoViewKeepingScroll();
   launchCompletionToast('已綁定 '+result.customer+' · '+result.customerId);
  }catch(error){button.disabled=false;console.error('綁定客戶失敗：'+error.message);}
 },true);
 jiwuLoadOrderBindingCustomers().then(list=>{if(!section.isConnected)return;customers=list;const currentIds=[...new Set(snapshots.map(ref=>onlineRows.find(row=>String(row.itemId)===String(ref.id))).filter(Boolean).map(row=>String(getOnlineData(row,['顧客編號'])||'')))];if(currentIds.length===1)choice=list.find(c=>c.id===currentIds[0])||null;showSelection();render();}).catch(error=>{status.textContent='無法載入客戶清單：'+error.message;});
}
function jiwuStartOrderBindingUI(){
 const style=document.createElement('style');style.textContent='.jiwuOrderBinding{margin-top:20px;padding-top:16px;border-top:1px solid #eee}.jiwuOrderBindingLabel{font-weight:700;display:block;margin-bottom:8px}.jiwuOrderBindingHint,.jiwuOrderBindingStatus{font-size:12px;color:#888;line-height:1.6;margin:8px 0}.jiwuOrderBinding input{box-sizing:border-box;width:100%;min-height:42px;margin:4px 0 12px}.jiwuOrderBindingResults{display:grid;gap:8px;max-height:220px;overflow:auto;overscroll-behavior:contain}.jiwuOrderBindingChoice{display:flex;flex-direction:column;align-items:flex-start;gap:5px;text-align:left;padding:12px;border:1px solid #e6ded5;border-radius:9px;background:white;color:#514639;cursor:pointer;font:inherit}.jiwuOrderBindingChoice[aria-pressed=true]{border-color:#a48b71;background:#f8f3ee}.jiwuOrderBindingChoice span{font-size:12px;color:#888}.jiwuOrderBindingSelected{display:flex;flex-wrap:wrap;align-items:center;gap:10px;margin-bottom:10px;font-size:13px}.jiwuOrderBindingSelected:empty{display:none}.jiwuOrderBoundCaption{display:inline-block;margin-left:8px;font-size:11px;font-weight:400;color:#8b7763}#appDialog:has(.jiwuOrderBinding) .dialogCard{max-height:calc(100dvh - 32px);overflow:auto}#appDialog:has(.jiwuOrderBinding) .dialogActions{margin-top:18px}';document.head.append(style);
 const observer=new MutationObserver(records=>{if(records.some(record=>[...record.addedNodes].some(node=>node.nodeType===1&&(node.id==='appDialog'||node.querySelector?.('#onlineOrderNameTitle')))))jiwuEnhanceOrderBindingDialog();});observer.observe(document.body,{childList:true,subtree:true});jiwuEnhanceOrderBindingDialog();
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',jiwuStartOrderBindingUI,{once:true});else jiwuStartOrderBindingUI();
