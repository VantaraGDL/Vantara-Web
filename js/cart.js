import {getPublicVariants,getOriginalPrice,getProductPrice,calculateOrder,getOrderPricing} from './catalog-logic.js?v=collection-cart-2';
const KEY='vantara_cart_v1';
export const cartKey=item=>String(item.product_id)+':'+String(item.variant_id);
export function readCart(){
 try{const value=JSON.parse(localStorage.getItem(KEY)||'[]');if(!Array.isArray(value))return [];
 const seen=new Set();return value.filter(i=>{if(!i||!Number.isSafeInteger(i.product_id)||!Number.isSafeInteger(i.variant_id)||!Number.isSafeInteger(i.quantity)||i.quantity<1||i.quantity>5||seen.has(cartKey(i)))return false;seen.add(cartKey(i));return true;});
 }catch{return [];}
}
function saveCart(items){try{localStorage.setItem(KEY,JSON.stringify(items));}catch{throw new Error('No se pudo guardar el carrito. Revisa el espacio o los permisos de almacenamiento del navegador.');}window.dispatchEvent(new Event('vantara-cart-change'));return items;}
export const cartUnits=()=>readCart().reduce((n,i)=>n+i.quantity,0);
export function clearCart(){try{localStorage.removeItem(KEY);}catch{throw new Error('No se pudo vaciar el carrito.');}window.dispatchEvent(new Event('vantara-cart-change'));}
export function removeCartItem(key){return saveCart(readCart().filter(i=>cartKey(i)!==key));}
function snapshot(p,v,quantity){return {product_id:p.id,variant_id:v.id,product_name:p.name||p.model,brand:p.brand,size:v.size,quantity,original_price:getOriginalPrice(p),effective_price:getProductPrice(p),discount_percent:p.onSale?p.discountPercent:null,image:p.imageRecords?.[0]?.path||p.images?.[0]||null,collection:p.collection};}
const cap=p=>Math.min(5,p.maxQuantity??5);
export function addCartItems(entries){
 if(!entries.length)throw new Error('Selecciona al menos un producto.');
 let items=readCart();
 for(const {product:p,size,quantity} of entries){
 const fail=text=>{const error=new Error((p.name||p.model)+': '+text);error.productId=p.id;throw error;};
 const v=getPublicVariants(p).find(v=>v.size===size && v.stock>0);
 if(!p.published||!v)fail('Selecciona una talla disponible antes de agregar.');
 if(!Number.isSafeInteger(quantity)||quantity<1)fail('Usa una cantidad entera válida.');
 const key=cartKey({product_id:p.id,variant_id:v.id}),old=items.find(i=>cartKey(i)===key),sum=(old?.quantity||0)+quantity;
 if(sum>v.stock)fail('La cantidad acumulada en el carrito supera el stock de esta talla.');
 if(items.filter(i=>i.product_id===p.id).reduce((n,i)=>n+i.quantity,0)+quantity>cap(p))fail('El máximo es de '+cap(p)+' piezas por producto entre todas sus tallas.');
 const next=snapshot(p,v,sum);items=old?items.map(i=>cartKey(i)===key?next:i):[...items,next];
 }
 // One write only after every selected line and accumulated quantity is valid.
 return saveCart(items);
}
export function addCartItem(product,size,quantity){return addCartItems([{product,size,quantity}]);}
export function updateCartQuantity(key,quantity,products){
 const items=readCart(),item=items.find(i=>cartKey(i)===key),p=products.find(p=>p.id===item?.product_id),v=p&&getPublicVariants(p).find(v=>v.id===item.variant_id&&v.stock>0);
 if(!v||!p.published)throw new Error('Esta variante no está disponible.');
 const others=items.filter(i=>i.product_id===p.id&&cartKey(i)!==key).reduce((n,i)=>n+i.quantity,0);
 if(!Number.isSafeInteger(quantity)||quantity<1||quantity>Math.min(v.stock,cap(p)-others))throw new Error('Cantidad inválida: respeta el stock y el máximo por producto.');
 return saveCart(items.map(i=>cartKey(i)===key?snapshot(p,v,quantity):i));
}
export function reconcileCart(products){
 const before=readCart(),used=new Map(),lines=[];
 const items=before.map(item=>{
 const p=products.find(p=>p.id===item.product_id&&p.published),v=p&&getPublicVariants(p).find(v=>v.id===item.variant_id&&v.stock>0);
 const remaining=p?cap(p)-(used.get(p.id)||0):0;
 if(!v||remaining<1){lines.push({item,available:false});return item;}
 const next=snapshot(p,v,Math.min(item.quantity,v.stock,remaining));used.set(p.id,(used.get(p.id)||0)+next.quantity);
 lines.push({item:next,product:p,variant:v,available:true});return next;
 });
 const changed=JSON.stringify(before)!==JSON.stringify(items);
 if(changed)saveCart(items);
 return {lines,changed};
}
export function cartTotals(lines){
 const valid=lines.filter(l=>l.available);
 // Existing pricing helpers key selections by id: use the unique cart line key.
 const selected=valid.map(l=>({...l.product,id:cartKey(l.item)}));
 const selection=new Map(valid.map(l=>[cartKey(l.item),{quantity:l.item.quantity,size:l.item.size}]));
 const calculation=calculateOrder(selected,selection),pricing=getOrderPricing(selected,selection);
 const rows=valid.map(l=>{const price=pricing.get(cartKey(l.item));return {name:l.item.product_name,size:l.item.size,quantity:l.item.quantity,...price,lineSubtotal:price.price===null?null:price.price*l.item.quantity};});
 return {calculation,rows,pricing,units:valid.reduce((n,l)=>n+l.item.quantity,0)};
}
