function purchaseCurrencyChoices(index){const o=purchaseOrders[index],currency=o?.payCurrency||'CNY';return `<span class="purchaseCurrencyChoices" role="group" aria-label="付款幣別"><button type="button" class="btn ${currency==='CNY'?'':'light'}" style="font-size:12px;padding:3px 8px" aria-pressed="${currency==='CNY'}" title="人民幣付款" onclick="event.stopPropagation();purchaseSetCurrency(${index},'CNY')">R</button> <button type="button" class="btn ${currency==='TWD'?'':'light'}" style="font-size:12px;padding:3px 8px" aria-pressed="${currency==='TWD'}" title="台幣付款" onclick="event.stopPropagation();purchaseSetCurrency(${index},'TWD')">T</button></span>`;}
function purchaseSetCurrency(index,currency){const order=purchaseOrders[index];if(!order||purchaseOrderRegion(order)!=='cn'||!['CNY','TWD'].includes(currency))return;purchaseQueueEdit(order,{payCurrency:currency});}
// China packing batches retain source orders and item check signatures.
let purchaseBatchBusy=false;
function purchaseBatchMembers(id){return purchaseOrders.filter(o=>o.packId===id&&purchaseOrderRegion(o)==='cn');}
function purchaseBatchPayload(orders){return orders.map(o=>({number:o.number,expected:purchaseSplitSnapshot(o)}));}
function purchaseBatchBlocked(orders){return purchaseBatchBusy||orders.some(purchaseSplitBlocked);}
async function purchaseSaveBatch(payload,button){
 if(purchaseBatchBusy)return;purchaseBatchBusy=true;if(button)button.disabled=true;
 try{await api('purchaseBatch',payload);closeDialog();await purchaseLoad();purchaseEditToast('打包批次已儲存');}
 catch(error){purchaseEditToast(error.message,true);}
 finally{purchaseBatchBusy=false;if(button?.isConnected)button.disabled=false;}
}
purchaseConfirmPacking=async function(){
 const plan=purchasePackingCurrent;if(!plan?.included.length)return;
 const orders=plan.included.map(x=>purchaseOrders.find(o=>o.number===x.number));
 if(orders.some(o=>!o||o.status!=='集運中')||purchaseBatchBlocked(orders)){purchaseEditToast('訂單正在同步或狀態已變更，請稍後重新開啟打包明細');return;}
 if(purchaseRegion!=='cn'){
  if(!confirm(`確定將 ${orders.length} 筆訂單移至點貨區？`))return;
  orders.forEach(o=>purchaseQueueEdit(o,{status:'已到貨'},true));purchaseKeepPending();purchasePackingCurrent=null;closeDialog();renderPurchase();void purchaseDrainEdits();return;
 }
 if(!confirm(`確定將 ${orders.length} 筆訂單打包為一張點貨訂單？`))return;
 await purchaseSaveBatch({mode:'pack',orders:purchaseBatchPayload(orders)},document.querySelector('#purchasePackingBody .btn.green'));
};
function purchaseOldBatchDialog(){
 const candidates=purchaseOrders.filter(o=>purchaseOrderRegion(o)==='cn'&&!o.packId&&['已到貨','已完成'].includes(o.status));
 const local=new Date(Date.now()+8*3600000).toISOString().slice(0,16);
 closeDialog();document.body.insertAdjacentHTML('beforeend',`<div id="appDialog" class="dialogOverlay"><div class="dialogCard purchasePackingDialog"><form onsubmit="purchaseMergeOldBatch(event)"><h3>勾選舊訂單合併</h3><label>打包時間 <input name="packedAt" aria-label="打包時間" type="datetime-local" value="${local}" required></label><p>請填寫實際打包時間。合併後會保留每筆商品與已點貨紀錄。</p><div style="max-height:55vh;overflow:auto">${candidates.map(o=>`<label style="display:flex;align-items:center;gap:10px;padding:12px 0;border-bottom:1px solid #eee"><input type="checkbox" name="orders" value="${esc(o.number)}" ${purchaseSplitBlocked(o)?'disabled':''}><span>${esc(purchaseDateLabel(o.date))} · ${esc(o.channel||'')} · ${esc(o.tracking||o.number)}<br>${esc(o.items.map(purchaseProductName).join('、'))}<br>${o.items.every(i=>Number(i.checkedAt)>0)?'已點貨':'未全部點貨'} · ${esc(o.weight||'未填')} kg</span></label>`).join('')||'<p>沒有尚未合併的中國已到貨訂單</p>'}</div><div class="dialogActions"><button type="button" class="btn light" onclick="closeDialog()">取消</button><button class="btn" type="submit" ${candidates.length?'':'disabled'}>合併勾選訂單</button></div></form></div></div>`);
}
async function purchaseMergeOldBatch(event){
 event.preventDefault();const form=event.target,f=new FormData(form),numbers=f.getAll('orders'),orders=numbers.map(n=>purchaseOrders.find(o=>o.number===n));
 if(!orders.length){purchaseEditToast('請先勾選要合併的訂單');return;}
 if(purchaseBatchBlocked(orders)){purchaseEditToast('訂單正在同步，請稍後重試');return;}
 const date=new Date(String(f.get('packedAt'))+':00+08:00');if(!Number.isFinite(date.getTime()))return;
 await purchaseSaveBatch({mode:'merge',orders:purchaseBatchPayload(orders),packedAt:date.toISOString()},form.querySelector('[type=submit]'));
}
function purchaseBatchShippingDialog(id){
 const members=purchaseBatchMembers(id);if(!members.length)return;
 const fee=members[0].packShipping??'';closeDialog();document.body.insertAdjacentHTML('beforeend',`<div id="appDialog" class="dialogOverlay"><div class="dialogCard"><form onsubmit="purchaseSubmitBatchShipping(event)"><h3>打包運費</h3><input type="hidden" name="packId" value="${esc(id)}"><label>運費 <input name="shipping" aria-label="打包運費" inputmode="decimal" type="number" min="0" step="0.01" value="${esc(fee)}" required></label><label style="margin-left:12px">幣別 <select name="shippingCurrency" aria-label="運費幣別"><option value="CNY" ${members[0].packShippingCurrency==='CNY'?'selected':''}>R 人民幣</option><option value="TWD" ${members[0].packShippingCurrency!=='CNY'?'selected':''}>T 台幣</option></select></label><div class="dialogActions"><button type="button" class="btn light" onclick="closeDialog()">取消</button><button type="submit" class="btn">SAVE</button></div></form></div></div>`);
}
async function purchaseSubmitBatchShipping(event){event.preventDefault();const f=new FormData(event.target);if(purchaseBatchBlocked(purchaseBatchMembers(f.get('packId')))){purchaseEditToast('訂單正在同步，請稍後重試');return;}await purchaseSaveBatch({mode:'shipping',packId:f.get('packId'),shipping:f.get('shipping'),shippingCurrency:f.get('shippingCurrency')},event.target.querySelector('[type=submit]'));}
function purchaseCheckBatch(id){
 if(purchaseView!=='arrived')return;const members=purchaseBatchMembers(id).filter(o=>['已到貨','已完成'].includes(o.status));if(!members.length)return;
 const checked=!members.every(o=>o.items.every(i=>Number(i.checkedAt)>0));purchaseQueueCheck({type:'items',checked,orders:members.map(o=>({number:o.number,signature:purchaseCheckSignature(o),indexes:o.items.map((_,i)=>i)}))});
}
function purchaseBatchCard(id){
 const members=purchaseBatchMembers(id),first=members[0];if(!first)return '';
 const checkable=purchaseView==='arrived',done=members.every(o=>o.items.every(i=>Number(i.checkedAt)>0)),fee=first.packShipping;
 const at=new Date(first.packedAt),time=Number.isFinite(at.getTime())?new Intl.DateTimeFormat('zh-TW',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).format(at):first.packedAt;
 return `<article class="purchaseBatchCard ${done?'isChecked':''}"><header class="purchaseBatchHeading"><strong>打包時間：${esc(time)}</strong><span>重量：${Number(first.packWeight||0).toFixed(3)} kg</span><button type="button" class="btn light" data-pack-id="${esc(id)}" onclick="purchaseBatchShippingDialog(this.dataset.packId)">運費：${String(fee??'')===''?'點擊輸入':(first.packShippingCurrency==='CNY'?'R ':'NT$ ')+money(fee)}</button>${checkable?`<button type="button" class="btn ${done?'light':'green'}" data-pack-id="${esc(id)}" onclick="purchaseCheckBatch(this.dataset.packId)">${done?'取消整批點貨':'整批點貨'}</button>`:''}</header><div class="purchaseBatchItems">${members.map(o=>{const i=purchaseOrders.indexOf(o);return `<section><div class="purchaseBatchSource"><span>${esc(o.channel||'')} · ${esc(o.tracking||o.number)}</span><button class="btn light" onclick="purchaseEditDialog(${i})">編輯</button></div><div style="display:flex;align-items:center;gap:8px;padding:8px"><span>${o.payCurrency==='TWD'?'NT$':'R'}${money(o.items.reduce((n,item)=>n+(Number(item.total)||0),0))}</span>${purchaseCurrencyChoices(i)}</div>${purchaseDisplayItems(o).map(x=>{const checked=x.indexes.every(n=>Number(o.items[n].checkedAt)>0);return `<button type="button" class="purchaseBatchItem ${checked?'isChecked':''}" ${checkable?`onclick='purchaseCheckOrderItems(${i},${JSON.stringify(x.indexes)})'`:'disabled'}><span>${checked?'✓ ':''}${esc(purchaseProductName(x))}</span><b>× ${Number(x.quantity)||0}</b></button>`;}).join('')}</section>`;}).join('')}</div></article>`;
}
const purchaseOriginalOrderCards=purchaseOrderCards;
purchaseOrderCards=function(orders=purchaseVisibleOrders()){
 if(purchaseRegion!=='cn')return purchaseOriginalOrderCards(orders);
 const ids=[...new Set(orders.map(o=>o.packId).filter(Boolean))],normal=orders.filter(o=>!o.packId);
 return ids.map(purchaseBatchCard).join('')+(normal.length?purchaseOriginalOrderCards(normal):ids.length?'':purchaseOriginalOrderCards([]));
};
const purchaseOriginalFilteredOrders=purchaseFilteredOrders;
purchaseFilteredOrders=function(){
 const base=purchaseOriginalFilteredOrders();if(purchaseRegion!=='cn'||purchaseView!=='arrived')return base;
 const q=purchaseSearch.trim().normalize('NFKC').toLowerCase();return purchaseOrders.filter(o=>base.includes(o)||(o.packId&&purchaseOrderRegion(o)==='cn'&&['已到貨','已完成'].includes(o.status)&&(!q||[o.number,o.tracking,o.channel,...o.items.map(purchaseProductName)].join(' ').normalize('NFKC').toLowerCase().includes(q))));
};
const purchaseOriginalVisibleOrders=purchaseVisibleOrders;
purchaseVisibleOrders=function(){
 const visible=purchaseOriginalVisibleOrders();if(purchaseRegion!=='cn'||purchaseView!=='arrived')return visible;
 const ids=new Set(purchaseFilteredOrders().map(o=>o.packId).filter(Boolean));return purchaseOrders.filter(o=>visible.includes(o)||(ids.has(o.packId)&&['已到貨','已完成'].includes(o.status)));
};
