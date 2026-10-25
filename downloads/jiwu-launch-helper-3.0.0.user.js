// ==UserScript==
// @name         吉物開團小幫手
// @namespace    jiwu
// @version      3.0.0
// @description  與 Chrome 開團小幫手共用介面、商品抓取與登記流程
// @match        *://*/*
// @grant        GM_xmlhttpRequest
// @grant        GM.xmlHttpRequest
// @grant        GM_getValue
// @grant        GM.getValue
// @grant        GM_setValue
// @grant        GM.setValue
// @connect      jiwu-mac-relay.jiwusales.workers.dev
// @run-at       document-idle
// ==/UserScript==

(()=>{
  'use strict';
  if(window.top!==window.self||globalThis.__jiwuLaunchUserscriptLoaded)return;
  globalThis.__jiwuLaunchUserscriptLoaded=true;
  const API_URL='https://jiwu-mac-relay.jiwusales.workers.dev/functions/v1/jiwu-launch-register';
  const TOKEN_KEY='jiwuLaunchTokenV3';
  const getToken=async()=>typeof GM_getValue==='function'?GM_getValue(TOKEN_KEY,''):typeof GM!=='undefined'&&GM.getValue?await GM.getValue(TOKEN_KEY,''):'';
  const setToken=async value=>{if(typeof GM_setValue==='function')GM_setValue(TOKEN_KEY,value);else if(typeof GM!=='undefined'&&GM.setValue)await GM.setValue(TOKEN_KEY,value);};
  function checkConnection(){if(typeof GM_xmlhttpRequest!=='function'&&!(typeof GM!=='undefined'&&typeof GM.xmlHttpRequest==='function'))throw Error('請使用支援 GM 跨站請求的腳本管理器，並允許連線至 jiwu-mac-relay.jiwusales.workers.dev');}
  function helperApi(payload){
    checkConnection();return new Promise((resolve,reject)=>{
      let settled=false;const finish=(error,value)=>{if(settled)return;settled=true;error?reject(error):resolve(value);};
      const onload=response=>{try{const data=JSON.parse(response.responseText);if(response.status<200||response.status>=300||!data.ok)throw Error(data.error||'後台連線失敗 HTTP '+response.status);finish(null,data);}catch(error){finish(error);}};
      const request=typeof GM_xmlhttpRequest==='function'?GM_xmlhttpRequest:GM.xmlHttpRequest.bind(GM);
      try{const pending=request({method:'POST',url:API_URL,headers:{'Content-Type':'application/json'},data:JSON.stringify(payload),timeout:90000,onload,onerror:()=>finish(Error('網路連線失敗；請保留內容，以相同內容重試')),ontimeout:()=>finish(Error('後台回應逾時；請保留內容，以相同內容重試')),onabort:()=>finish(Error('傳送已中止；請保留內容，以相同內容重試'))});if(pending&&typeof pending.then==='function')pending.then(r=>{if(r)onload(r);},error=>finish(error));}catch(error){finish(error);}
    });
  }
  async function sendHelperMessage(message){
    if(!['jiwuHelperAppend','jiwuHelperGroups'].includes(message?.type))return {ok:false,error:'不支援的操作'};
    try{
      let token=await getToken();
      if(message.password){const login=await helperApi({action:'authLogin',password:message.password,trusted:true});token=login.token;await setToken(token);}
      if(!token)return {ok:false,needsLogin:true};
      try{return {ok:true,data:await helperApi({...message.payload,action:message.type,token})};}
      catch(error){if(/登入/.test(error.message)){await setToken('');return {ok:false,needsLogin:true,error:error.message};}throw error;}
    }catch(error){return {ok:false,error:error.message};}
  }
  const PINK='#F777AC';
  const clean=value=>String(value||'').replace(/\s+/g,' ').trim();
  const absolute=value=>{try{return new URL(value,location.href).href;}catch(_){return'';}};
function jiwuSizeUnits(value) {
  let text=String(value||'').normalize('NFKC');
  text=text.replace(/(?:以內|以内)/g,'內');
  // Sock ranges retain their familiar centimetre values.
  text=text.replace(/(\d+(?:\.\d+)?\s*[~〜～–-]\s*\d+(?:\.\d+)?)\s*cm\b/gi,'$1公分');
  // A trailing unit applies to every dimension in its multiplication chain.
  const converted=text.replace(/(?:[HWD]|着丈|身幅|身巾|肩幅|袖丈|長|寬|肩|袖)?\s*\d+(?:\.\d+)?(?:\s*[×xX]\s*(?:[HWD]|着丈|身幅|身巾|肩幅|袖丈|長|寬|肩|袖)?\s*\d+(?:\.\d+)?)*\s*(?:cm|mm)\b/gi, block=>{
    const cm=/cm$/i.test(block);
    return block.replace(/(?:cm|mm)$/i,'').replace(/\d+(?:\.\d+)?/g,n=>cm?String(Math.round(Number(n)*10000)/1000):n).trim();
  });
  return converted.replace(/(?:直径|直徑|φ|Φ)\s*(?:約\s*)?(\d+(?:\.\d+)?)/gi,'ø$1');
}
function jiwuClothingSize(value) {
  const text = jiwuSizeUnits(value);
  // Convert each measurement separately so slash-separated sizes keep their pairing.
  return text.replace(/(?:着丈|身幅|身巾|肩幅|袖丈)\s*[:：]?\s*\d+(?:\.\d+)?(?:\s*(?:cm|公分))?(?:\s*[×xX、,]\s*(?:着丈|身幅|身巾|肩幅|袖丈)\s*[:：]?\s*\d+(?:\.\d+)?(?:\s*(?:cm|公分))?)*/gi, block => block.replace(/着丈/g,'長').replace(/身幅|身巾/g,'寬').replace(/肩幅/g,'肩').replace(/袖丈/g,'袖').replace(/cm|公分|[×xX、,:：\s]/gi,''));
}
function jiwuExtractClothingSize(value) {
  const text = jiwuSizeUnits(value);
  const rows = [...text.matchAll(/(?:^|[\s【\[(])((?:XX|X)?[SML]|\dXL)(?:サイズ)?[\s】\]):：]*(着丈\s*[:：]?\s*\d+(?:\.\d+)?(?:\s*(?:cm))?(?:\s*[×xX、,]?\s*(?:身幅|身巾|肩幅|袖丈)\s*[:：]?\s*\d+(?:\.\d+)?(?:\s*cm)?)+)/g)];
  return rows.length ? rows.map(r=>r[1]).join('/')+'/'+rows.map(r=>jiwuClothingSize(r[2]).replace(/\s+/g,'')).join('/') : '';
}

function jiwuBodySize(value){
 const text=String(value||'').normalize('NFKC'),body=text.match(/(?:本体|本體)\s*[:：]\s*([\s\S]*?)(?=台座|臺座|パッケージ|包装|包裝|素材|材質|$)/)?.[1];
 if(!body)return '';
 const diameter=body.match(/(?:直径|直徑|φ|Φ|ø)\s*(?:約\s*)?(\d+(?:\.\d+)?)\s*(mm|cm)?/i);if(diameter)return 'ø'+String(Number((Number(diameter[1])*(diameter[2]?.toLowerCase()==='cm'?10:1)).toFixed(3)));
 const dimensions=body.match(/(?:[HWD]\s*)?\d+(?:\.\d+)?\s*(?:mm|cm)?(?:\s*[×xX]\s*(?:[HWD]\s*)?\d+(?:\.\d+)?\s*(?:mm|cm)?)+/i);
 if(!dimensions)return '';
 const parts=dimensions[0].split(/[×xX]/),unit=dimensions[0].match(/(mm|cm)\s*$/i)?.[1]||'mm';
 return parts.map(part=>{const n=Number(part.match(/\d+(?:\.\d+)?/)[0]),u=part.match(/mm|cm/i)?.[0]||unit;return String(Number((n*(u.toLowerCase()==='cm'?10:1)).toFixed(3)));}).join('x');
}
    function compactSize(value) {
        const bodySize=jiwuBodySize(value);if(bodySize)return bodySize;
        const text = jiwuClothingSize(value).replace(/[【】]\s*$/g,'').trim();
        const normalized = text.normalize('NFKC');
        // 只縮短完整的 mm 尺寸；cm、單一尺寸或其他說明保留原文。
        const match = normalized.match(/^(?:約\s*)?[HWD]?\s*(\d+(?:\.\d+)?)\s*[×xX]\s*[HWD]?\s*(\d+(?:\.\d+)?)\s*(?:[×xX]\s*[HWD]?\s*(\d+(?:\.\d+)?)\s*)?(?:mm)?$/i);
        return match ? match.slice(1).filter(v => v !== undefined).join('x') : text;
    }

    function detailSize(doc) {
        const body = doc.body?.cloneNode ? doc.body.cloneNode(true) : doc.body;
        if (body?.querySelectorAll) {
            body.querySelectorAll('script,style,noscript').forEach(el => el.remove());
            body.querySelectorAll('br').forEach(el => el.replaceWith('\n'));
            body.querySelectorAll('p,div,li,tr,section').forEach(el => el.append('\n'));
        }
        const text = body?.textContent || '';
        const clothing = jiwuExtractClothingSize(text);
        if (clothing) return clothing;
        const candidates = [];
        doc.querySelectorAll('tr').forEach(row => {
            const cells = row.querySelectorAll('th,td');
            if (cells.length > 1 && /^(?:商品|本体)?サイズ/.test(clean(cells[0].textContent))) candidates.push(cells[1].textContent);
        });
        const match = text.match(/(?:商品|本体|外装)?サイズ\s*(?:[（(]\s*[約约]\s*[）)])?\s*[:：]\s*([^\n\r]{1,180})/);
        if (match) candidates.push(match[1]);
        const movicSize=text.match(/【サイズ(?:[（(]約[）)])?】\s*([^\n\r]+(?:\n[^\n\r]+)?)/);
        if(movicSize)candidates.push(movicSize[1]);
        for (const raw of candidates) {
            // 保留原始單位與標示，避免把 mm 誤乘十或丟失衣服尺寸說明。
            const value = clean(raw).split(/【|素材|材質|製造国|原産国/)[0].replace(/[】\s]+$/g,'').trim();
            if (/[0-9０-９]/.test(value)) return compactSize(value);
        }
        return '';
    }


  const productUrl=value=>{try{const u=new URL(value,location.href),m=u.pathname.match(/\/(?:products|item|items)\/([^/?#]+)/i)||(/(^|\.)movic\.jp$/i.test(u.hostname)&&u.pathname.match(/^\/shop\/g\/g([^/]+)\/?$/i));if(!m)return'';u.hash='';return u.href;}catch(_){return'';}};
  const codeFrom=(doc,url)=>{const movic=new URL(url).pathname.match(/^\/shop\/g\/g([^/]+)\/?$/i);if(movic)return movic[1];const text=doc.body?.innerText||doc.body?.textContent||'';const m=text.match(/(?:メーカー品番|商品番号|品番|商品コード|JAN(?:コード)?|SKU)\s*[:：]?\s*([A-Za-z0-9_-]+)/i);if(m)return m[1];const path=new URL(url).pathname.match(/\/products\/([0-9]{8,})/i);return path?path[1]:'';};
  const priceFrom=doc=>{const meta=doc.querySelector('meta[property="product:price:amount"],meta[itemprop="price"]')?.content;if(meta&&/^\d+(?:\.\d+)?$/.test(meta))return meta;const m=(doc.body?.innerText||doc.body?.textContent||'').match(/(?:¥|￥)\s*([\d,]+)|([\d,]+)\s*円/);return(m?.[1]||m?.[2]||'').replace(/,/g,'');};
  const imagesFrom=doc=>{const out=[],seen=new Set(),add=value=>{const url=absolute(value);if(!url||seen.has(url)||/logo|icon|banner|button|cart/i.test(url))return;seen.add(url);out.push(url);};doc.querySelectorAll('meta[property="og:image"],meta[property="og:image:secure_url"],meta[name="twitter:image"]').forEach(el=>add(el.content));[...doc.images].filter(img=>{const r=img.getBoundingClientRect();return(img.naturalWidth||r.width)>120&&(img.naturalHeight||r.height)>120;}).forEach(img=>add(img.currentSrc||img.src));return out;};
  function japaneseNameFrom(doc){
    const heading=doc.querySelector('.product__title h1,h1.product__title,h1.product-title,h1[itemprop="name"],h1');
    return clean(heading?.textContent||doc.querySelector('meta[property="og:title"]')?.content||'');
  }
  function scrapeDetail(doc=document,url=location.href){const body=doc.body?.innerText||doc.body?.textContent||'';return{japaneseName:japaneseNameFrom(doc),url:productUrl(url)||url,code:codeFrom(doc,url),originalPrice:priceFrom(doc),size:detailSize(doc),images:imagesFrom(doc)};}
  async function loadVariants(data){try{const url=new URL(data.url,location.href),match=url.pathname.match(/\/products\/([^/?#]+)/i);if(!match)return data;const response=await fetch(url.origin+'/products/'+encodeURIComponent(match[1])+'.js',{credentials:'same-origin'});if(!response.ok)return data;const product=await response.json();data.japaneseName=clean(product.title)||data.japaneseName;const variants=(product.variants||[]).map(v=>({id:String(v.id||''),label:clean(v.title||v.option1||''),price:String(v.price??'').replace(/\.0+$/,''),available:v.available!==false})).filter(v=>v.id&&v.label&&/^\d+(?:\.\d+)?$/.test(v.price));if(variants.length>1){data.variants=variants;data.selectedVariantId=variants[0].id;data.originalPrice=variants[0].price;}}catch(_){}return data;}
  // 是否收錄商品只看商品連結與圖片；價格空白不阻擋登記。
  function cardPrice(box){
    const text=clean(box.innerText||box.textContent||'');
    if(/TWD|USD|NT\$|US\$|台幣/i.test(text))return '';
    const match=text.match(/(?:JPY|[¥￥])\s*([\d,]+(?:\.\d+)?)/i)||text.match(/([\d,]+(?:\.\d+)?)\s*(?:円|JPY)/i);
    return match?match[1].replace(/,/g,''):'';
  }
  function displayedElement(node){
    if(!node || !node.getClientRects().length)return false;
    for(let current=node;current&&current!==document.body;current=current.parentElement){
      const style=getComputedStyle(current);
      if(style.display==='none'||style.visibility==='hidden'||Number(style.opacity)===0)return false;
    }
    return true;
  }
  function displayedProductImage(box){
    return [...box.querySelectorAll('img')].filter(displayedElement)
      .filter(img=>{const r=img.getBoundingClientRect();return r.width>=60&&r.height>=60;})
      .sort((a,b)=>{const x=a.getBoundingClientRect(),y=b.getBoundingClientRect();return y.width*y.height-x.width*x.height;})[0];
  }
  function imageSource(img){
    // The displayed source may differ from the lazy/hover image attribute.
    const candidates=[img.currentSrc,img.getAttribute('src'),...['data-src','data-original','data-lazy-src'].map(key=>img.getAttribute(key))];
    return candidates.filter(Boolean).map(value=>new URL(value,location.href).href)
      .find(value=>/^https?:/.test(value)&&!/placeholder|spacer|loading|transparent|\/blank[.]/i.test(value))||'';
  }
  function sanrioListItems(){
    if(location.hostname!=='shop.sanrio.co.jp')return null;
    const list=document.querySelector('.js-itemGoodsList, .l-item__goods-list');
    if(!list)return null;
    return [...list.querySelectorAll('.c-goods-item')].map(card=>{
      const link=card.querySelector('a[data-ga_ec_goods_link][href]');
      const slides=[...card.querySelectorAll('.c-goods-item__image > .swiper-slide')];
      const slide=slides.find(node=>node.classList.contains('swiper-slide-active'))
        ||slides.find(node=>!node.classList.contains('swiper-slide-duplicate'));
      const img=slide?.querySelector('img');
      const image=img&&imageSource(img);
      if(!link||!image)return null;
      return {url:new URL(link.getAttribute('href'),location.href).href,image,
        code:card.getAttribute('data-ga_ec_goods_id')||'',size:'',
        originalPrice:cleanSanrioPrice(card.querySelector('.c-goods-item__price')?.textContent),
        name:card.querySelector('.c-goods-item__name')?.textContent?.trim()||''};
    }).filter(Boolean);
  }
  function cleanSanrioPrice(text){return String(text||'').match(/([\d,]+)\s*円/)?.[1].replace(/,/g,'')||'';}
  function scrapeList(){
    const sanrio=sanrioListItems();if(sanrio!==null)return sanrio;
    const seen=new Set(),items=[];
    document.querySelectorAll('a[href]').forEach(link=>{
      const url=productUrl(link.href);
      if(!url||seen.has(url)||!displayedElement(link)||link.closest('header,nav,footer,[class*="recommend"],[id*="recommend"]'))return;
      let box=link;
      for(let i=0;i<5;i++){
        const parent=box.parentElement;
        if(!parent||parent===document.body)break;
        const links=new Set([...parent.querySelectorAll('a[href]')].map(x=>productUrl(x.href)).filter(Boolean));
        if(links.size>1)break;
        box=parent;
      }
      const img=displayedProductImage(link)||displayedProductImage(box);
      const image=img&&imageSource(img);
      if(!image)return;
      seen.add(url);items.push({url,image,code:'',size:'',originalPrice:cardPrice(box),name:clean(box.querySelector('h1,h2,h3,[class*="title"],[class*="name"]')?.textContent||'')});
    });return items;
  }
  async function details(item){
    for(let attempt=0;attempt<3;attempt++){
      try{
        const response=await fetch(item.url,{credentials:'same-origin'});
        if(!response.ok)throw new Error('商品頁 HTTP '+response.status);
        const doc=new DOMParser().parseFromString(await response.text(),'text/html');
        const d=scrapeDetail(doc,item.url);
        return {...item,japaneseName:d.japaneseName||item.japaneseName,code:d.code||item.code,size:d.size||item.size,originalPrice:d.originalPrice||item.originalPrice};
      }catch(error){
        if(attempt===2)throw new Error((item.name||item.role||'商品')+'：'+error.message+'\n'+item.url+'\n已保留填寫內容，請稍後再按登記。');
        await new Promise(resolve=>setTimeout(resolve,1000*(attempt+1)));
      }
    }
  }
  async function loadItemDetails(items,button){
    const result=[];
    for(let i=0;i<items.length;i++){
      button.textContent='讀取商品 '+(i+1)+'/'+items.length+'…';
      result.push(await details(items[i]));
      if(i<items.length-1)await new Promise(resolve=>setTimeout(resolve,300));
    }
    return result;
  }

  async function open(){
    document.getElementById('jiwu-helper-modal')?.remove();
    const direct=productUrl(location.href),list=!direct?scrapeList():[];
    const data=direct?await loadVariants(scrapeDetail()):{listMode:true,items:list,images:list.map(item=>item.image),url:'',code:'',size:'',originalPrice:''};
    if(!data.images.length){alert('抓不到商品圖片');return;}
    const selected=data.listMode?[]:[data.images[0]],roles=new Map(),names=new Map();
    const modal=document.createElement('div');modal.id='jiwu-helper-modal';modal.style.cssText='position:fixed;inset:0;z-index:2147483647;background:#0009;padding:14px;box-sizing:border-box;display:grid;place-items:center;font-family:-apple-system,BlinkMacSystemFont,"Noto Sans TC",sans-serif';
    modal.innerHTML=`<section style="width:min(680px,100%);max-height:calc(100dvh - 28px);overflow:auto;background:#fff;border-radius:18px;padding:16px;box-sizing:border-box"><label style="display:block;margin-top:12px">團名<select id="jiwu-existing-group" style="display:block;width:100%;box-sizing:border-box;margin:8px 0;padding:10px;font-size:16px;border:1px solid #ccc;border-radius:9px"><option value="">輸入新團名</option></select><input id="jiwu-group" placeholder="輸入新團名（選填）" style="display:block;width:100%;box-sizing:border-box;margin-top:5px;padding:9px 12px;font-size:16px;border:1px solid #ccc;border-radius:9px"></label><div style="display:flex;justify-content:space-between;gap:10px;margin:12px 0;padding:10px 12px;background:#f7f7f7;border-radius:9px"><span><b>原價：</b><span id="jiwu-price">${data.listMode?'依商品卡':(data.originalPrice||'抓不到')}</span></span><span><b>尺寸：</b>${data.size||'抓不到'}</span></div>${data.variants?.length?'<div id="jiwu-variants" style="display:flex;gap:8px;flex-wrap:wrap;margin:-4px 0 12px"></div>':''}<div style="font-weight:700;margin:8px 0">點擊選擇圖片（共 ${data.images.length} 張） <span id="jiwu-count" style="color:${PINK}"></span></div><div id="jiwu-grid" style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;max-height:52dvh;overflow:auto;padding:8px;background:#f6f6f6;border-radius:9px"></div><div style="display:flex;gap:10px;margin-top:18px"><button id="jiwu-cancel" style="flex:1;padding:12px;border:0;border-radius:10px;font-size:15px">取消</button><button id="jiwu-send" style="flex:1;padding:12px;border:0;border-radius:10px;background:${PINK};color:white;font-weight:700;font-size:15px">登記</button></div></section>`;
    const inputStyle=document.createElement('style');
    inputStyle.textContent='#jiwu-helper-modal input,#jiwu-helper-modal input:focus,#jiwu-helper-modal input:focus-visible,#jiwu-helper-modal select:focus,#jiwu-helper-modal select:focus-visible{outline:none!important;box-shadow:none!important;}';
    modal.prepend(inputStyle);
    document.body.append(modal);
    const groupSelect=modal.querySelector('#jiwu-existing-group'),groupInput=modal.querySelector('#jiwu-group');
    let availableGroups=[];
    groupSelect.onchange=()=>{const group=availableGroups[Number(groupSelect.value)];groupInput.hidden=groupSelect.value!=='';groupInput.style.display=groupSelect.value!==''?'none':'block';};
    const loadGroups=async()=>{
      try{
        groupSelect.disabled=true;groupSelect.options[0].textContent='讀取既有團名中…';
        let response=await sendHelperMessage({type:'jiwuHelperGroups'});
        if(response?.needsLogin){const password=prompt('請輸入吉物後台密碼，載入既有團名');if(!password)throw Error('尚未登入');response=await sendHelperMessage({type:'jiwuHelperGroups',password});}
        if(!response?.ok)throw Error(response?.error||'無法讀取團名');
        availableGroups=response.data?.groups||[];
        groupSelect.options[0].textContent='輸入新團名';
        for(const status of ['尚未上架','最新開團']){
          const section=document.createElement('optgroup');section.label=status;
          availableGroups.forEach((group,index)=>{if(group.status!==status)return;const option=document.createElement('option');option.value=String(index);option.textContent=group.name;section.append(option);});
          if(section.children.length)groupSelect.append(section);
        }
      }catch(error){groupSelect.options[0].textContent='輸入新團名（既有團載入失敗）';const retry=document.createElement('button');retry.textContent='重新載入團名';retry.style.cssText='margin:8px 0;padding:8px 12px';retry.onclick=()=>{retry.remove();loadGroups();};groupSelect.after(retry);}
      finally{groupSelect.disabled=false;}
    };
    loadGroups();
    const variants=modal.querySelector('#jiwu-variants');if(variants){const renderVariants=()=>{const selected=data.variants.find(v=>v.id===data.selectedVariantId)||data.variants[0];data.selectedVariantId=selected.id;data.originalPrice=selected.price;modal.querySelector('#jiwu-price').textContent=selected.price;variants.innerHTML='';data.variants.forEach(variant=>{const button=document.createElement('button'),active=variant.id===selected.id;button.type='button';button.textContent=variant.label+(variant.available?'':'（缺貨）');button.style.cssText=`padding:7px 12px;border:1px solid ${active?PINK:'#d4d4d4'};border-radius:8px;background:${active?PINK:'#f4f4f4'};color:${active?'#fff':'#444'};font-weight:${active?'700':'400'};cursor:pointer`;button.onclick=()=>{data.selectedVariantId=variant.id;renderVariants();};variants.append(button);});};renderVariants();}
    const grid=modal.querySelector('#jiwu-grid'),count=modal.querySelector('#jiwu-count');
    const render=()=>{count.textContent=`已選 ${selected.length} 張`;grid.innerHTML='';data.images.forEach(image=>{const index=selected.indexOf(image),item=data.items?.find(entry=>entry.image===image);const card=document.createElement('label');card.style.cssText=`border:${index>=0?'3px solid '+PINK:'1px solid #ddd'};border-radius:8px;overflow:hidden;background:#fff;cursor:pointer`;card.innerHTML=`<img src="${image}" style="display:block;width:100%;height:104px;object-fit:contain;background:#fff"><input type="text" placeholder="角色（選填）" value="${roles.get(image)||''}" style="width:100%;box-sizing:border-box;padding:7px;border:0;border-top:1px solid #ddd;font-size:14px"><input class="jiwu-product-name" type="text" placeholder="商品名稱" style="width:100%;box-sizing:border-box;padding:7px;border:0;border-top:1px solid #ddd;font-size:16px">${item?`<a href="${item.url}" target="_blank" style="display:block;padding:5px;font-size:12px">商品頁 · ${item.originalPrice?'¥'+item.originalPrice:'日幣價格未抓到'}</a>`:''}`;const img=card.querySelector('img');img.loading='eager';img.style.setProperty('opacity','1','important');img.style.setProperty('visibility','visible','important');const role=card.querySelector('input');img.onclick=event=>{event.preventDefault();const at=selected.indexOf(image);if(at>=0)selected.splice(at,1);else selected.push(image);render();};role.oninput=()=>roles.set(image,role.value);const name=card.querySelector('.jiwu-product-name');name.value=names.get(image)||'';name.oninput=()=>{names.set(image,name.value);if(clean(name.value)&&!selected.includes(image)){selected.push(image);card.style.border='3px solid '+PINK;count.textContent=`已選 ${selected.length} 張`;}};grid.append(card);});};render();
    modal.querySelector('#jiwu-cancel').onclick=()=>modal.remove();
    modal.querySelector('#jiwu-send').onclick=async()=>{if(!selected.length)return alert('請至少選擇一張圖片');const button=modal.querySelector('#jiwu-send');button.disabled=true;try{checkConnection();let items=selected.map(image=>{const item=data.items?.find(entry=>entry.image===image)||{};return{image,japaneseName:item.japaneseName||data.japaneseName||'',name:clean(names.get(image)),role:clean(roles.get(image)),url:item.url||data.url,code:item.code||data.code,size:item.size||data.size,originalPrice:item.originalPrice||data.originalPrice};});if(data.listMode){items=await loadItemDetails(items,button);}button.textContent='登記中…';const payload={action:'jiwuHelperAppend',requestId:'',name:'',groupName:groupSelect.value===''?clean(groupInput.value):'',targetGroup:groupSelect.value===''?undefined:availableGroups[Number(groupSelect.value)],images:selected,items,url:data.url,code:data.code,size:data.size,originalPrice:data.originalPrice};const fingerprint=JSON.stringify(payload);modal._requestIds??=new Map();if(!modal._requestIds.has(fingerprint))modal._requestIds.set(fingerprint,crypto.randomUUID());payload.requestId=modal._requestIds.get(fingerprint);let response=await sendHelperMessage({type:'jiwuHelperAppend',payload});if(response?.needsLogin){const password=prompt('請輸入吉物後台密碼，登入新資料庫');if(!password)throw Error('尚未登入，資料未送出');response=await sendHelperMessage({type:'jiwuHelperAppend',payload,password});}if(!response?.ok)throw new Error(response?.error||'寫入失敗');alert(response.data?.message||'登記成功');modal.remove();}catch(error){alert('登記失敗：'+error.message);button.disabled=false;button.textContent='登記';}};
  }
  // Userscripts use a page button in place of the Chrome toolbar icon.
  function installLauncher(){
    if(document.getElementById('jiwu-userscript-launcher'))return;
    const button=document.createElement('button');button.id='jiwu-userscript-launcher';button.type='button';button.textContent='開團';button.setAttribute('aria-label','開啟吉物開團小幫手');
    button.style.cssText='position:fixed;right:16px;bottom:24px;z-index:2147483646;padding:12px 18px;border:0;border-radius:999px;background:#F777AC;color:#fff;font:700 15px/1.4 -apple-system,BlinkMacSystemFont,sans-serif;box-shadow:0 3px 12px #0003;cursor:pointer;touch-action:manipulation';
    button.onclick=async()=>{if(button.disabled)return;button.disabled=true;try{await open();}catch(error){alert('讀取失敗：'+error.message);}finally{button.disabled=false;}};
    document.body.append(button);
  }
  if(document.body)installLauncher();else document.addEventListener('DOMContentLoaded',installLauncher,{once:true});
})();
