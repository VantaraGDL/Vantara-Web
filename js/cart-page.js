import {getPackageById,loadPackagePrimaryImage} from './packages-api.js?v=production-fixes-1';
import {packagePriceLines} from './package-order.js?v=packages-polish-1';
import {catalogApi} from './catalog-api.js?v=production-fixes-1';
import {escapeHTML} from './catalog-logic.js?v=collection-cart-2';
import {readCart,cartKey,clearCart,removeSubmittedCartItems,cartFingerprint,removeCartItem,updateCartQuantity,reconcileCart,cartTotals,cartQuantityLimit} from './cart.js?v=production-fixes-1';
import {createOrderConfirmation} from './order-confirmation.js?v=production-fixes-1';
import {invalidateOrderAttempt} from './orders-api.js?v=production-fixes-1';
const list=document.querySelector('#cart-items'),summary=document.querySelector('#cart-summary'),empty=document.querySelector('#cart-empty'),status=document.querySelector('#cart-status'),confirm=document.querySelector('#cart-confirm');
const money=v=>new Intl.NumberFormat('es-MX',{style:'currency',currency:'MXN',minimumFractionDigits:0,maximumFractionDigits:2}).format(v)+' MXN';
let products=[],packages=new Map(),state={lines:[]},busy=false,ready=false,mutating=false,review='',reviewSelection='';
const say=t=>status.textContent=t;
function signature(){return JSON.stringify({items:readCart(),totals:cartTotals(state.lines),unavailable:state.lines.filter(l=>!l.available).map(l=>cartKey(l.item))});}
function render(){
 const totals=cartTotals(state.lines);empty.hidden=state.lines.length>0;summary.hidden=!state.lines.length;list.replaceChildren();
 for(const l of state.lines){if(l.item.type==='package'){renderPackage(l);continue;}const i=l.item,key=cartKey(i),price=totals.pricing.get(key),article=document.createElement('article');article.className='cart-item';article.dataset.cartKey=key;
 article.innerHTML=`<img src="${escapeHTML(l.product?.images?.[0]||'assets/img/producto-pendiente.svg')}" alt=""><div><p>${escapeHTML(i.brand)}</p><h2>${escapeHTML(i.product_name)}</h2><p>Talla: ${escapeHTML(i.size)}</p>${!l.available?'<p>No disponible</p>':`<p>${price.individualSaleApplied?`<del class="price-original">${money(price.originalPrice)}</del> · Descuento: ${price.discountPercent}%<br>`:''}Precio unitario: ${price.price===null?'Por confirmar':money(price.price)}</p><p>Subtotal: ${price.price===null?'Por confirmar':money(price.price*i.quantity)}</p>`}<div class="cart-controls"><button type="button" data-step="-1" aria-label="Disminuir cantidad">−</button><label>Cantidad <input type="number" min="1" step="1" value="${i.quantity}" aria-label="Cantidad de ${escapeHTML(i.product_name)}, talla ${escapeHTML(i.size)}"></label><button type="button" data-step="1" aria-label="Aumentar cantidad">+</button><button type="button" data-remove>Eliminar</button></div></div>`;
 const input=article.querySelector('input');
 const limit=l.available?cartQuantityLimit(key,products):0;
 input.max=Math.max(0,limit);input.disabled=!l.available||busy;
 article.querySelector('[data-step="-1"]').disabled=!l.available||busy||i.quantity<=1;
 article.querySelector('[data-step="1"]').disabled=!l.available||busy||i.quantity>=limit;
 const change=value=>{try{mutating=true;updateCartQuantity(key,value,products);state=reconcileCart(products,packages);render();[...list.children].find(el=>el.dataset.cartKey===key)?.querySelector('input')?.focus();say('Cantidad actualizada.');}catch(e){input.value=i.quantity;say(e.message);}finally{mutating=false;}};
 input.addEventListener('change',()=>change(input.valueAsNumber));
 article.querySelectorAll('[data-step]').forEach(b=>b.addEventListener('click',()=>change(i.quantity+Number(b.dataset.step))));
 const remove=article.querySelector('[data-remove]');remove.disabled=busy;remove.setAttribute('aria-label','Eliminar '+i.product_name+', talla '+i.size);remove.addEventListener('click',()=>{try{mutating=true;removeCartItem(key);state=reconcileCart(products,packages);render();(list.querySelector('[data-remove]')||document.querySelector('#cart-empty a'))?.focus();say('Producto eliminado del carrito.');}catch(e){say(e.message);}finally{mutating=false;}});
 list.append(article);
 }
 const box=document.querySelector('#cart-totals');box.replaceChildren();
 const pieces=document.createElement('p');pieces.className='cart-summary-pieces';pieces.textContent=totals.units+' '+(totals.units===1?'elemento':'elementos');box.append(pieces);
 const c=totals.calculation;
 const lines=[[(totals.rows.some(r=>r.type==='package')?'Subtotal efectivo':totals.rows.length===1?'Subtotal':'Subtotal del conjunto')+(c.completePrice?'':' conocido'),money(c.effectiveSubtotal)],
 ...(c.collectionDiscountTotal>0?[['Descuento de colección','−'+money(c.collectionDiscountTotal)]]:[]),
 ['Total final',c.completePrice?money(c.finalTotal):'Por confirmar']];
 lines.forEach(([label,value],index)=>{const row=document.createElement('p');row.className='cart-summary-line'+(index===lines.length-1?' cart-summary-total':'');const title=document.createElement('span'),amount=document.createElement(index===lines.length-1?'strong':'span');title.textContent=label+':';amount.textContent=value;row.append(title,amount);box.append(row);});
 confirm.disabled=busy||!ready||!totals.rows.length;
 document.querySelector('#cart-clear').disabled=busy;
 // The previous DOM has been replaced; only current product media remains in use.
 catalogApi.releaseUnusedImages(state.lines.filter(l=>l.product).map(l=>l.product));
}
function renderPackage(line){
 const item=line.item,key=cartKey(item),article=document.createElement('article');
 article.className='cart-item cart-package'+(line.available?'':' is-unavailable');article.dataset.cartKey=key;
 article.innerHTML='<img alt=""><div><p>Paquete · 1 unidad</p><h2></h2><ul class="cart-package-products"></ul><div class="cart-package-prices"></div><p class="cart-package-status"></p><div class="cart-controls"><a>Volver a seleccionar</a><button type="button">Eliminar paquete</button></div></div>';
 const image=article.querySelector('img');image.src=line.package?.image||'assets/img/producto-pendiente.svg';
 image.addEventListener('error',()=>{image.src='assets/img/producto-pendiente.svg';},{once:true});
 article.querySelector('h2').textContent=item.package_name;
 for(const part of item.items){const row=document.createElement('li');row.textContent=part.product_name+' — Talla '+part.size;article.querySelector('ul').append(row);}
 if(line.available)for(const text of packagePriceLines(item,money)){const row=document.createElement('p');row.textContent=text;article.querySelector('.cart-package-prices').append(row);}
 article.querySelector('.cart-package-status').textContent=line.available?'':line.reason||'No disponible';
 article.querySelector('a').href='paquete.html?id='+item.package_id;
 const remove=article.querySelector('button');remove.disabled=busy;remove.setAttribute('aria-label','Eliminar paquete '+item.package_name);
 remove.addEventListener('click',()=>{try{mutating=true;removeCartItem(key);state=reconcileCart(products,packages);render();(list.querySelector('[data-remove],.cart-package button')||document.querySelector('#cart-empty a'))?.focus();say('Paquete eliminado del carrito.');}catch(e){say(e.message);}finally{mutating=false;}});
 list.append(article);
}
async function refresh(){
 ready=false;
 products=await catalogApi.loadProductsData();
 const ids=[...new Set(readCart().filter(i=>i.type==='package').map(i=>i.package_id))];
 packages=new Map(await Promise.all(ids.map(async id=>{
  try{return [id,await getPackageById(id,{fullGallery:false,products,media:false})];}
  catch{return [id,{error:true}];}
 })));
 mutating=true;
 try{state=reconcileCart(products,packages);}finally{mutating=false;}
 ready=![...packages.values()].some(p=>p?.error||p?.loadError);
 // Media is optional presentation work: never delay stock/order validation.
 void loadVisibleImages(products,packages).catch(()=>{});
 return state.changed||state.lines.some(l=>!l.available);
}
async function loadVisibleImages(currentProducts,currentPackages){
 const ids=new Set(readCart().filter(i=>i.type!=='package').map(i=>i.product_id));
 const visible=currentProducts.filter(p=>ids.has(p.id));
 await Promise.all([catalogApi.loadProductImages(visible,{primaryOnly:true}),
  ...[...currentPackages.values()].filter(p=>p?.items).map(async p=>{p.image=await loadPackagePrimaryImage(p);})]);
 if(products!==currentProducts||packages!==currentPackages)return;
 // Update images only; do not rebuild focused quantity controls asynchronously.
 for(const line of state.lines){
  const node=[...list.children].find(el=>el.dataset.cartKey===cartKey(line.item))?.querySelector('img');
  if(node)node.src=line.item.type==='package'?line.package?.image||'assets/img/producto-pendiente.svg':line.product?.images?.[0]||'assets/img/producto-pendiente.svg';
 }
 catalogApi.releaseUnusedImages(visible);
}
const openModal=createOrderConfirmation(money,{
 source: 'cart',
 checkSelection:()=>{if(cartFingerprint(readCart())!==reviewSelection)throw new Error('El carrito cambió. Cierra este modal y revisa tu pedido.');},
 beforeConfirm:async()=>{await refresh();render();if(!ready)throw new Error('No pudimos revisar un paquete. Cierra esta ventana y recarga el carrito.');if(signature()!==review){say('El carrito cambió. Cierra el modal y revisa el resumen actualizado.');throw new Error('Cambió el carrito o la disponibilidad. Cierra este modal y vuelve a confirmar.');}},
 onWhatsAppOpened:sent=>{
  mutating=true;
  try{
   const remaining=removeSubmittedCartItems(sent);
   state={lines:remaining.map(item=>{
    const previous=state.lines.find(l=>cartKey(l.item)===cartKey(item));
    return {...(previous||{available:false,reason:'Actualizando disponibilidad…'}),item};
   })};
   render();say(remaining.length?'Se abrió WhatsApp. Conservamos los artículos que no se enviaron.':'Se abrió el enlace de WhatsApp y se vació el carrito.');
   if(remaining.length)void load();
  }finally{mutating=false;}
 }
});
confirm.addEventListener('click',async()=>{if(busy)return;busy=true;render();say('Actualizando disponibilidad y precios…');try{const changed=await refresh();render();if(!ready)throw new Error('No se pudieron validar todos los paquetes. Recarga para reintentar.');const totals=cartTotals(state.lines);if(!totals.rows.length){say('No hay artículos disponibles para pedir.');return;}review=signature();reviewSelection=cartFingerprint(readCart());say(changed?'Actualizamos el carrito con la información vigente. Revisa el modal antes de continuar.':'');openModal(totals.rows,totals.calculation,confirm);}catch(e){say(e.message||'No se pudo consultar el catálogo. Reintenta.');}finally{busy=false;render();}});
 document.querySelector('#cart-clear').addEventListener('click',()=>{if(!window.confirm('¿Vaciar el carrito?'))return;try{mutating=true;clearCart();state={lines:[]};render();say('Carrito vacío.');}catch(e){say(e.message);}finally{mutating=false;}});
function externalChange(event){
 if(event.type==='storage'&&event.key!==null&&event.key!=='vantara_cart_v1')return;
 if(event.type==='storage'&&reviewSelection&&cartFingerprint(readCart())!==reviewSelection)invalidateOrderAttempt('cart');
 if(mutating||busy)return;load();
}
window.addEventListener('storage',externalChange);window.addEventListener('vantara-cart-change',externalChange);
window.addEventListener('pageshow',e=>{if(e.persisted)load();});
async function load(){busy=true;ready=false;confirm.disabled=true;say('Cargando carrito…');try{const changed=await refresh();say(!ready?'No se pudieron validar todos los paquetes. Recarga para reintentar.':changed?'Actualizamos precios/cantidades. Los artículos no disponibles no se incluyen en el total.':'');}catch(e){say('No se pudo validar el carrito. '+(e.message||'Recarga para reintentar.'));}finally{busy=false;render();}}
load();
