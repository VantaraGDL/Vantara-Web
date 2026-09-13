export function escapeHTML(value) {
    return String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
export function getPublicVariants(item) {
    return (item.variants || []).filter(v => Number.isInteger(v.stock) && v.stock >= 0);
}
export function productSizes(item) { return getPublicVariants(item).map(v => v.size); }
export function variantStock(item,size) {
    const variant=getPublicVariants(item).find(v=>v.size===size);
    return variant ? variant.stock : 0;
}
export function sizeUnavailable(item,size) {return variantStock(item,size)===0;}
export function quantityLimit(item,size) {
    const max=Math.min(5,item.maxQuantity ?? 5);
    if(!size)return getPublicVariants(item).some(v=>v.stock>0) ? max : 0;
    return Math.min(max,variantStock(item,size));
}
export function getKnownStockTotal(item) {
    return getPublicVariants(item).reduce((sum,v)=>sum+v.stock,0);
}
export function getTotalStock(item) {
    const total=getKnownStockTotal(item);
    return total>0 ? total : (item.variants || []).some(v=>v.stock==null) ? null : 0;
}
export function getProductBadges(item) {
    const variants=item.variants || [];
    if(variants.length && variants.every(v=>v.stock===0))return [{kind:'sold-out',label:'AGOTADO'}];
    const badges=[];
    if(item.newRelease)badges.push({kind:'new',label:'NUEVO'});
    if(isProductOnSale(item))badges.push({kind:'sale',label:`OFERTA -${item.discountPercent}%`});
    const total=getKnownStockTotal(item);
    if(total>=1 && total<5)badges.push({kind:'low-stock',label:'ÚLTIMAS PIEZAS'});
    return badges.slice(0,2);
}
export function knownPrice(item) {return item.price!==null && item.price!==undefined && Number.isFinite(Number(item.price));}
export function calculateOrder(selected,selection) {
    const completePrice=selected.every(knownPrice);
    const prices=getOrderPrices(selected,selection);
    const subtotal=selected.reduce((sum,p)=>sum+(prices.get(p.id)??0)*selection.get(p.id).quantity,0);
    const groups=new Map();
    for(const p of selected) {
        if(!p.collection)continue;
        const group=groups.get(p.collection)||{pieces:0,rule:p.collectionDiscount};
        group.pieces+=selection.get(p.id).quantity;groups.set(p.collection,group);
    }
    const discount=completePrice ? Math.min(subtotal,[...groups.values()].reduce((sum,{pieces,rule})=>
        sum+(rule?.enabled && pieces>=rule.minimumPieces ? rule.amount : 0),0)) : 0;
    return {completePrice,subtotal,discount,total:subtotal-discount};
}

export function getOriginalPrice(p) {return knownPrice(p)?Number(p.price):null;}
export function isProductOnSale(p) {return p.onSale===true && Number.isInteger(p.discountPercent) && p.discountPercent>0 && p.discountPercent<100;}
export function getProductPrice(p) {
 const original=getOriginalPrice(p);
 return original===null?null:isProductOnSale(p)?Math.round(original*(100-p.discountPercent)/100):original;
}
export const getDiscountedPrice=getProductPrice;
// Qualifying collections retain their original-price calculation; offers never stack.
export function getOrderPricing(selected,selection) {
 const groups=new Map();
 for(const p of selected)if(p.collection)groups.set(p.collection,(groups.get(p.collection)||0)+selection.get(p.id).quantity);
 const complete=selected.every(knownPrice);
 return new Map(selected.map(p=>{
  const collectionApplied=complete && p.collectionDiscount?.enabled && groups.get(p.collection)>=p.collectionDiscount.minimumPieces;
  const originalPrice=getOriginalPrice(p);
  const individualSaleApplied=!collectionApplied && originalPrice!==null && isProductOnSale(p);
  return [p.id,{price:collectionApplied?originalPrice:getProductPrice(p),originalPrice,
   discountPercent:individualSaleApplied?p.discountPercent:null,individualSaleApplied}];
 }));
}

export function getOrderPrices(selected,selection) {
 return new Map([...getOrderPricing(selected,selection)].map(([id,pricing])=>[id,pricing.price]));
}
