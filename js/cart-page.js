import {catalogApi} from './catalog-api.js?v=sales-1';
import {escapeHTML} from './catalog-logic.js?v=collection-cart-2';
import {readCart,cartKey,clearCart,removeCartItem,updateCartQuantity,reconcileCart,cartTotals} from './cart.js?v=collection-cart-2';
import {createOrderConfirmation} from './order-confirmation.js?v=summary-1';
const list=document.querySelector('#cart-items'),summary=document.querySelector('#cart-summary'),empty=document.querySelector('#cart-empty'),status=document.querySelector('#cart-status'),confirm=document.querySelector('#cart-confirm');
const money=v=>new Intl.NumberFormat('es-MX',{style:'currency',currency:'MXN',minimumFractionDigits:0,maximumFractionDigits:2}).format(v)+' MXN';
let products=[],state={lines:[]},busy=false,ready=false,mutating=false,review='';
const say=t=>status.textContent=t;
function signature(){return JSON.stringify({items:readCart(),totals:cartTotals(state.lines),unavailable:state.lines.filter(l=>!l.available).map(l=>cartKey(l.item))});}
function render(){
 const totals=cartTotals(state.lines);empty.hidden=state.lines.length>0;summary.hidden=!state.lines.length;list.replaceChildren();
 for(const l of state.lines){const i=l.item,key=cartKey(i),price=totals.pricing.get(key),article=document.createElement('article');article.className='cart-item';article.dataset.cartKey=key;
 article.innerHTML=`<img src="${escapeHTML(l.product?.images?.[0]||'assets/img/producto-pendiente.svg')}" alt=""><div><p>${escapeHTML(i.brand)}</p><h2>${escapeHTML(i.product_name)}</h2><p>Talla: ${escapeHTML(i.size)}</p>${!l.available?'<p>No disponible</p>':`<p>${price.individualSaleApplied?`<del class="price-original">${money(price.originalPrice)}</del> · Descuento: ${price.discountPercent}%<br>`:''}Precio unitario: ${price.price===null?'Por confirmar':money(price.price)}</p><p>Subtotal: ${price.price===null?'Por confirmar':money(price.price*i.quantity)}</p>`}<div class="cart-controls"><button type="button" data-step="-1" aria-label="Disminuir cantidad">−</button><label>Cantidad <input type="number" min="1" step="1" value="${i.quantity}" aria-label="Cantidad de ${escapeHTML(i.product_name)}, talla ${escapeHTML(i.size)}"></label><button type="button" data-step="1" aria-label="Aumentar cantidad">+</button><button type="button" data-remove>Eliminar</button></div></div>`;
 const input=article.querySelector('input');
 const others=state.lines.filter(x=>x.available&&x.item.product_id===i.product_id&&cartKey(x.item)!==key).reduce((n,x)=>n+x.item.quantity,0);
 // Stock caps this line; the product cap spans all its sizes.
 const limit=l.available?Math.min(l.variant.stock,Math.min(5,l.product.maxQuantity??5)-others):0;
 input.max=Math.max(0,limit);input.disabled=!l.available||busy;
 article.querySelector('[data-step="-1"]').disabled=!l.available||busy||i.quantity<=1;
 article.querySelector('[data-step="1"]').disabled=!l.available||busy||i.quantity>=limit;
 const change=value=>{try{mutating=true;updateCartQuantity(key,value,products);state=reconcileCart(products);render();[...list.children].find(el=>el.dataset.cartKey===key)?.querySelector('input')?.focus();say('Cantidad actualizada.');}catch(e){input.value=i.quantity;say(e.message);}finally{mutating=false;}};
 input.addEventListener('change',()=>change(input.valueAsNumber));
 article.querySelectorAll('[data-step]').forEach(b=>b.addEventListener('click',()=>change(i.quantity+Number(b.dataset.step))));
 const remove=article.querySelector('[data-remove]');remove.disabled=busy;remove.setAttribute('aria-label','Eliminar '+i.product_name+', talla '+i.size);remove.addEventListener('click',()=>{try{mutating=true;removeCartItem(key);state=reconcileCart(products);render();(list.querySelector('[data-remove]')||document.querySelector('#cart-empty a'))?.focus();say('Producto eliminado del carrito.');}catch(e){say(e.message);}finally{mutating=false;}});
 list.append(article);
 }
 const box=document.querySelector('#cart-totals');box.replaceChildren();
 const pieces=document.createElement('p');pieces.className='cart-summary-pieces';pieces.textContent=totals.units+' '+(totals.units===1?'pieza':'piezas');box.append(pieces);
 const c=totals.calculation;
 const lines=[[(totals.rows.length===1?'Subtotal':'Subtotal del conjunto')+(c.completePrice?'':' conocido'),money(c.effectiveSubtotal)],
 ...(c.collectionDiscountTotal>0?[['Descuento de colección','−'+money(c.collectionDiscountTotal)]]:[]),
 ['Total final',c.completePrice?money(c.finalTotal):'Por confirmar']];
 lines.forEach(([label,value],index)=>{const row=document.createElement('p');row.className='cart-summary-line'+(index===lines.length-1?' cart-summary-total':'');const title=document.createElement('span'),amount=document.createElement(index===lines.length-1?'strong':'span');title.textContent=label+':';amount.textContent=value;row.append(title,amount);box.append(row);});
 confirm.disabled=busy||!ready||!totals.rows.length;
 document.querySelector('#cart-clear').disabled=busy;
}
async function refresh(){
 products=await catalogApi.loadProducts();mutating=true;
 try{state=reconcileCart(products);}finally{mutating=false;}
 ready=true;return state.changed||state.lines.some(l=>!l.available);
}
const openModal=createOrderConfirmation(money,{
 beforeConfirm:async()=>{await refresh();render();if(signature()!==review){say('El carrito cambió. Cierra el modal y revisa el resumen actualizado.');throw new Error('Cambió el carrito o la disponibilidad. Cierra este modal y vuelve a confirmar.');}},
 onWhatsAppOpened:()=>{mutating=true;try{clearCart();state={lines:[]};render();say('Se abrió el enlace de WhatsApp y se vació el carrito.');}finally{mutating=false;}}
});
confirm.addEventListener('click',async()=>{if(busy)return;busy=true;render();say('Actualizando disponibilidad y precios…');try{const changed=await refresh();render();const totals=cartTotals(state.lines);if(!totals.rows.length){say('No hay productos disponibles para pedir.');return;}review=signature();say(changed?'Actualizamos el carrito con la información vigente. Revisa el modal antes de continuar.':'');openModal(totals.rows,totals.calculation,confirm);}catch(e){say(e.message||'No se pudo consultar el catálogo. Reintenta.');}finally{busy=false;render();}});
 document.querySelector('#cart-clear').addEventListener('click',()=>{if(!window.confirm('¿Vaciar el carrito?'))return;try{mutating=true;clearCart();state={lines:[]};render();say('Carrito vacío.');}catch(e){say(e.message);}finally{mutating=false;}});
function externalChange(){if(mutating||!ready)return;try{mutating=true;state=reconcileCart(products);render();}catch(e){say(e.message);}finally{mutating=false;}}
window.addEventListener('storage',externalChange);window.addEventListener('vantara-cart-change',externalChange);
window.addEventListener('pageshow',e=>{if(e.persisted)load();});
async function load(){busy=true;ready=false;confirm.disabled=true;say('Cargando carrito…');try{const changed=await refresh();say(changed?'Actualizamos precios/cantidades. Los artículos no disponibles no se incluyen en el total.':'');}catch(e){say('No se pudo validar el carrito. '+(e.message||'Recarga para reintentar.'));}finally{busy=false;render();}}
load();
