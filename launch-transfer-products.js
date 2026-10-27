let launchTransferState = null;
async function launchOpenTransferProducts(){
 if(!launchCurrent||launchBusy)return;
 const items=launchCurrent.items.filter(item=>item.visible!==false);
 if(!items.length){launchCompletionToast('請先勾選要搬移的商品',true);return;}
 const state={sourceId:launchCurrent.id,itemIds:items.map(item=>item.id),groups:[],busy:false,request:null};
 launchTransferState=state;
 launchDialog(`<form style="display:grid;gap:12px;min-width:0" onsubmit="launchSubmitTransferProducts(event)"><h2>移到別團（${items.length} 件）</h2><p class="launchHelp">以下為目前勾選的商品：</p><div style="max-height:160px;overflow:auto;margin-bottom:12px">${items.map(item=>`<div>${esc(launchDisplayName(item))}</div>`).join('')}</div><label style="display:flex;flex-direction:column;gap:6px;min-width:0">移到<select style="width:100%;min-width:0" name="target" aria-label="搬移目標團" onchange="launchTransferTargetChanged(this)" disabled><option value="">讀取團名中…</option></select></label><label data-transfer-new hidden style="display:none;min-width:0">新團名稱<input style="display:block;width:100%;margin-top:6px;box-sizing:border-box" name="newName" aria-label="新團名稱" maxlength="200" placeholder="輸入新團名稱" disabled></label><p class="launchHelp" data-transfer-note>新增的團會放在「尚未上架」。搬移時會一併儲存目前的修改。</p><p data-transfer-error role="alert"></p><div class="launchTools"><button class="btn light" type="button" onclick="launchCloseTransferProducts()">取消</button><button class="btn" type="submit" disabled>確定搬移</button></div></form>`);
 const dialog=document.getElementById('launchDialog'),form=dialog.querySelector('form');
 // Keep the operation visible until its receipt is confirmed.
 dialog.addEventListener('cancel',event=>{event.preventDefault();if(!state.busy)launchCloseTransferProducts();});
 dialog.addEventListener('click',event=>{if(event.target!==dialog)return;const box=dialog.getBoundingClientRect();if(event.clientX<box.left||event.clientX>box.right||event.clientY<box.top||event.clientY>box.bottom){event.stopImmediatePropagation();if(!state.busy)launchCloseTransferProducts();}},true);
 try{
  const lists=await Promise.all(['最新開團','尚未上架'].map(status=>api('launchList',{status})));
  if(launchTransferState!==state||!form.isConnected)return;
  state.groups=lists.flatMap(list=>list.groups||[]).filter(group=>group.id!==state.sourceId&&['最新開團','尚未上架'].includes(group.status));
  form.elements.target.innerHTML='<option value="__new__">＋ 新增一個團</option><option value="" selected disabled>請選擇現有團</option>'+state.groups.map(group=>`<option value="${esc(group.id)}">${esc(group.name)}（${esc(group.status)}・${Number(group.itemCount)||0} 件）</option>`).join('');
  form.elements.target.disabled=false;form.querySelector('[type="submit"]').disabled=false;
 }catch(error){form.querySelector('[data-transfer-error]').textContent='團名讀取失敗：'+error.message+'，請取消後重試。';}
}
function launchTransferTargetChanged(select){
 const form=select.form,isNew=select.value==='__new__';
 form.querySelector('[data-transfer-new]').hidden=!isNew;form.querySelector('[data-transfer-new]').style.display=isNew?'block':'none';form.elements.newName.disabled=!isNew;form.elements.newName.required=isNew;
 if(launchTransferState)launchTransferState.request=null;
 if(isNew)form.elements.newName.focus();
}
function launchCloseTransferProducts(){if(launchTransferState?.busy)return;launchTransferState=null;document.getElementById('launchDialog')?.close();if(launchCurrent)launchAllProducts();}
async function launchSubmitTransferProducts(event){
 event.preventDefault();const form=event.target,state=launchTransferState;
 if(!state||state.busy||launchCurrent?.id!==state.sourceId)return;
 const targetId=form.elements.target.value,name=form.elements.newName.value.trim(),error=form.querySelector('[data-transfer-error]');
 if(!targetId){error.textContent='請選擇目標團或新增一個團';return;}
 if(targetId==='__new__'&&!name){error.textContent='請輸入新團名稱';return;}
 state.busy=true;error.textContent='正在搬移，請稍候…';form.querySelectorAll('input,select,button').forEach(control=>control.disabled=true);
 try{
  if(!state.request){
   await launchSaveTail;
   if(launchDirty||!launchCurrent.revision){await launchSaveClick();if(launchFailedSaves.has(state.sourceId)||launchHasUnsentChanges())throw Error('來源團尚未儲存成功，請先完成儲存');}
   if(launchCurrent?.id!==state.sourceId)throw Error('已切換團，請重新選擇商品');
   const target=state.groups.find(group=>group.id===targetId);
   const targetGroup=targetId==='__new__'?null:(await api('launchGet',{id:targetId,status:target?.status})).group;
   if(targetId!=='__new__'&&!['最新開團','尚未上架'].includes(targetGroup?.status))throw Error('目標團已收單，請重新選擇');
   if(targetId!=='__new__'&&!targetGroup?.revision)throw Error('目標團讀取失敗，請重新選擇');
   state.request={sourceId:state.sourceId,sourceRevision:launchCurrent.revision,itemIds:state.itemIds,requestId:launchId(),...(targetId==='__new__'?{newGroup:{id:launchId(),name}}:{targetId,targetRevision:targetGroup.revision})};
  }
  const result=await launchPost('launchTransferProducts',state.request);
  if(result.ok===false||!result.sourceGroup||!result.targetGroup)throw Error(result.error||'尚未確認搬移結果，請重試');
  for(const group of [result.sourceGroup,result.targetGroup]){saveBackendSnapshot('launchGroup_'+group.id,group);launchSavedRevisions.set(group.id,group.revision);}
  launchClearListCache();launchUndoStack=[];
  if(launchCurrent?.id===state.sourceId){launchCurrent=result.sourceGroup;launchDirty=false;launchFailedSaves.delete(state.sourceId);launchSubmittedSignatures.delete(state.sourceId);launchPanelIndex=Math.min(launchPanelIndex,Math.max(0,(launchCurrent.panels?.length||1)-1));}
  state.busy=false;launchTransferState=null;document.getElementById('launchDialog')?.close();launchRenderEditor();
  if(!launchListMode())launchAllProducts();
  launchCompletionToast(`已將 ${result.movedCount} 件商品移到「${result.targetGroup.name}」`);
 }catch(failure){
  error.textContent='搬移未完成：'+failure.message;state.busy=false;
  form.querySelectorAll('input,select,button').forEach(control=>control.disabled=false);
  form.elements.newName.disabled=form.elements.target.value!=='__new__';
 }
}
