import {getPublicVariants,getOriginalPrice,getProductPrice,calculateOrder,getOrderPricing} from './catalog-logic.js?v=collection-cart-2';
import {packageOrderItem,samePackageComposition} from './package-order.js?v=packages-polish-1';
import {invalidateOrderAttempt} from './orders-api.js?v=production-fixes-1';
const KEY='vantara_cart_v1';
const isPackage=i=>i.type==='package';
const positiveId=n=>Number.isSafeInteger(n)&&n>0;
export const cartKey=item=>isPackage(item)
 ? 'package:'+item.package_id+':'+[...item.items].sort((a,b)=>a.product_id-b.product_id).map(i=>i.product_id+':'+i.variant_id).join('|')
 : String(item.product_id)+':'+String(item.variant_id);
export function readCart(){
 try{
  const value=JSON.parse(localStorage.getItem(KEY)||'[]');if(!Array.isArray(value))return [];
  const seen=new Set();return value.filter(i=>{
   if(!i)return false;
   if(isPackage(i)){
    if(!positiveId(i.package_id)||i.quantity!==1||!Array.isArray(i.items)||i.items.length<2||
      i.items.some(p=>!p||!positiveId(p.product_id)||!positiveId(p.variant_id)||p.quantity!==1)||new Set(i.items.map(p=>p.product_id)).size!==i.items.length)return false;
   }else if((i.type!==undefined&&i.type!=='product')||!positiveId(i.product_id)||!positiveId(i.variant_id)||!Number.isSafeInteger(i.quantity)||i.quantity<1||i.quantity>5)return false;
   const key=cartKey(i);if(seen.has(key))return false;seen.add(key);return true;
  });
 }catch{return [];}
}
function saveCart(items,userChange=true){const changed=userChange&&cartFingerprint(readCart())!==cartFingerprint(items);try{localStorage.setItem(KEY,JSON.stringify(items));}catch{throw new Error('No se pudo guardar el carrito. Revisa el espacio o los permisos de almacenamiento del navegador.');}if(changed)invalidateOrderAttempt('cart');window.dispatchEvent(new Event('vantara-cart-change'));return items;}
export const cartUnits=()=>readCart().reduce((n,i)=>n+(isPackage(i)?1:i.quantity),0);
export function clearCart(){try{localStorage.removeItem(KEY);}catch{throw new Error('No se pudo vaciar el carrito.');}invalidateOrderAttempt('cart');window.dispatchEvent(new Event('vantara-cart-change'));}
// Compare purchase identities, not refreshed prices, images or availability.
export const cartFingerprint=items=>JSON.stringify(items.map(i=>[cartKey(i),i.quantity]).sort((a,b)=>a[0].localeCompare(b[0])));
export function removeSubmittedCartItems(submitted){
 const current=readCart(),sent=new Map(submitted.map(i=>[cartKey(i),isPackage(i)?1:i.quantity]));
 const remaining=current.flatMap(item=>{
  const quantity=item.quantity-(sent.get(cartKey(item))||0);
  return quantity>0?[{...item,quantity}]:[];
 });
 if(!remaining.length)clearCart();else saveCart(remaining,false);
 return remaining;
}
export function removeCartItem(key){return saveCart(readCart().filter(i=>cartKey(i)!==key));}
function snapshot(p,v,quantity){return {type:'product',product_id:p.id,variant_id:v.id,product_name:p.name||p.model,brand:p.brand,size:v.size,quantity,original_price:getOriginalPrice(p),effective_price:getProductPrice(p),discount_percent:p.onSale?p.discountPercent:null,image:p.imageRecords?.[0]?.path||p.images?.[0]||null,collection:p.collection};}
const cap=p=>Math.min(5,p.maxQuantity??5);
const components=i=>isPackage(i)?i.items:[i];
function demand(items,pid,vid){return items.reduce((n,i)=>n+components(i).filter(x=>x.product_id===pid&&x.variant_id===vid).reduce((a,x)=>a+x.quantity,0),0);}
function normalUnits(items,id){return items.filter(i=>!isPackage(i)&&i.product_id===id).reduce((n,i)=>n+i.quantity,0);}
export function addCartItems(entries){
 if(!entries.length)throw new Error('Selecciona al menos un producto.');
 let items=readCart();
 for(const {product:p,size,quantity} of entries){
  const fail=text=>{const error=new Error((p.name||p.model)+': '+text);error.productId=p.id;throw error;};
  const v=getPublicVariants(p).find(v=>v.size===size&&v.stock>0);
  if(!p.published||!v)fail('Selecciona una talla disponible antes de agregar.');
  if(!Number.isSafeInteger(quantity)||quantity<1)fail('Usa una cantidad entera válida.');
  const key=cartKey({product_id:p.id,variant_id:v.id}),old=items.find(i=>cartKey(i)===key),sum=(old?.quantity||0)+quantity;
  if(demand(items,p.id,v.id)+quantity>v.stock)fail('La cantidad acumulada en el carrito, incluidos paquetes, supera el stock de esta talla.');
  if(normalUnits(items,p.id)+quantity>cap(p))fail('El máximo es de '+cap(p)+' piezas por producto entre todas sus tallas.');
  const next=snapshot(p,v,sum);items=old?items.map(i=>cartKey(i)===key?next:i):[...items,next];
 }
 return saveCart(items);
}
export function addCartItem(product,size,quantity){return addCartItems([{product,size,quantity}]);}
export function addCartPackage(pack,selection){
 const item=packageOrderItem(pack,selection),before=readCart();
 // Stored product IDs are the composition signature, independent of sizes.
 // Compare only after the current package and every selection are valid.
 const items=before.filter(i=>!isPackage(i)||i.package_id!==item.package_id||samePackageComposition(i,pack));
 const replaced=items.length!==before.length;
 if(items.some(i=>cartKey(i)===cartKey(item))){
  if(replaced)saveCart(items);
  return {duplicate:true,replaced};
 }
 for(const part of item.items){
  const p=pack.items.find(i=>i.productId===part.product_id).product;
  const v=getPublicVariants(p).find(v=>v.id===part.variant_id);
  if(demand(items,p.id,v.id)+1>v.stock)throw new Error(part.product_name+' — '+part.size+': el carrito ya usa la existencia disponible de esta talla.');
 }
 // Retire obsolete configurations and add the new one in a single write.
 // Failed validation above leaves the original cart untouched.
 saveCart([...items,item]);return {duplicate:false,replaced};
}
export function cartQuantityLimit(key,products){
 const items=readCart(),item=items.find(i=>cartKey(i)===key);
 if(!item||isPackage(item))return 0;
 const p=products.find(p=>p.id===item.product_id&&p.published),v=p&&getPublicVariants(p).find(v=>v.id===item.variant_id&&v.stock>0);
 if(!v)return 0;
 const others=items.filter(i=>cartKey(i)!==key);
 return Math.max(0,Math.min(v.stock-demand(others,p.id,v.id),cap(p)-normalUnits(others,p.id)));
}
export function updateCartQuantity(key,quantity,products){
 const items=readCart(),item=items.find(i=>cartKey(i)===key);
 if(!item||isPackage(item))throw new Error('Cada paquete tiene una sola unidad.');
 const p=products.find(p=>p.id===item.product_id),v=p&&getPublicVariants(p).find(v=>v.id===item.variant_id);
 if(!Number.isSafeInteger(quantity)||quantity<1||quantity>cartQuantityLimit(key,products))throw new Error('Cantidad inválida: respeta el stock y el máximo por producto.');
 return saveCart(items.map(i=>cartKey(i)===key?snapshot(p,v,quantity):i));
}
export function reconcileCart(products,packages=new Map()){
 const before=readCart(),used=new Map(),stockUsed=new Map(),lines=[];
 const variantKey=x=>x.product_id+':'+x.variant_id;
 const items=before.map(item=>{
  if(isPackage(item)){
   const pack=packages.get(item.package_id);
   const unavailable=reason=>{lines.push({item,package:pack?.items?pack:null,available:false,reason});return item;};
   if(pack?.error)return unavailable('No pudimos revisar este paquete. Intenta de nuevo.');
   if(!pack)return unavailable('Paquete no disponible.');
   if(!samePackageComposition(item,pack))return unavailable('Este paquete cambió. Vuelve a seleccionarlo.');
   let next;
   try{next=packageOrderItem(pack,new Map(item.items.map(i=>[i.product_id,i.variant_id])));}catch(e){return unavailable(e.message);}
   for(const part of next.items){
    const p=pack.items.find(i=>i.productId===part.product_id).product,v=getPublicVariants(p).find(v=>v.id===part.variant_id);
    if((stockUsed.get(variantKey(part))||0)+1>v.stock)return unavailable(part.product_name+' — '+part.size+': no hay suficientes piezas para tu pedido.');
   }
   for(const part of next.items)stockUsed.set(variantKey(part),(stockUsed.get(variantKey(part))||0)+1);
   lines.push({item:next,package:pack,available:true});return next;
  }
  const p=products.find(p=>p.id===item.product_id&&p.published),v=p&&getPublicVariants(p).find(v=>v.id===item.variant_id&&v.stock>0);
  const remaining=p?cap(p)-(used.get(p.id)||0):0,remainingStock=v?v.stock-(stockUsed.get(variantKey(item))||0):0;
  if(!v||remaining<1||remainingStock<1){lines.push({item,available:false});return item;}
  const next=snapshot(p,v,Math.min(item.quantity,remainingStock,remaining));used.set(p.id,(used.get(p.id)||0)+next.quantity);
  stockUsed.set(variantKey(next),(stockUsed.get(variantKey(next))||0)+next.quantity);
  lines.push({item:next,product:p,variant:v,available:true});return next;
 });
 const changed=JSON.stringify(before)!==JSON.stringify(items);if(changed)saveCart(items,false);
 return {lines,changed};
}
export function cartTotals(lines){
 const valid=lines.filter(l=>l.available),normal=valid.filter(l=>!isPackage(l.item)),packages=valid.filter(l=>isPackage(l.item));
 const selected=normal.map(l=>({...l.product,id:cartKey(l.item)}));
 const selection=new Map(normal.map(l=>[cartKey(l.item),{quantity:l.item.quantity,size:l.item.size}]));
 const base=calculateOrder(selected,selection),pricing=getOrderPricing(selected,selection);
 // Package prices are the rounded, authoritative RPC result. Internal products
 // never enter calculateOrder's individual-offer or collection grouping.
 const packageOriginal=packages.reduce((n,l)=>n+l.item.original_subtotal,0),packageFinal=packages.reduce((n,l)=>n+l.item.final_price,0);
 const calculation={...base,originalSubtotal:base.originalSubtotal+packageOriginal,
  effectiveSubtotal:base.effectiveSubtotal+packageFinal,subtotal:base.subtotal+packageFinal,
  packageDiscountTotal:packageOriginal-packageFinal,finalTotal:base.finalTotal+packageFinal,total:base.total+packageFinal};
 const rows=valid.map(l=>{
  if(isPackage(l.item))return {...l.item,name:l.item.package_name};
  const price=pricing.get(cartKey(l.item));return {type:'product',product_id:l.item.product_id,variant_id:l.item.variant_id,name:l.item.product_name,size:l.item.size,quantity:l.item.quantity,...price,lineSubtotal:price.price===null?null:price.price*l.item.quantity};
 });
 return {calculation,rows,pricing,units:valid.reduce((n,l)=>n+(isPackage(l.item)?1:l.item.quantity),0)};
}
