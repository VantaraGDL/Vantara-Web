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
    const originalSubtotal=selected.reduce((sum,p)=>sum+(getOriginalPrice(p)??0)*selection.get(p.id).quantity,0);
    const subtotal=selected.reduce((sum,p)=>sum+(prices.get(p.id)??0)*selection.get(p.id).quantity,0);
    const groups=new Map();
    for(const p of selected) {
        if(!p.collection)continue;
        const group=groups.get(p.collection)||{pieces:0,rule:p.collectionDiscount};
        group.pieces+=selection.get(p.id).quantity;groups.set(p.collection,group);
    }
    const discount=completePrice ? Math.min(subtotal,[...groups.values()].reduce((sum,{pieces,rule})=>
        sum+(rule?.enabled && pieces>=rule.minimumPieces ? rule.amount : 0),0)) : 0;
    return {completePrice,subtotal,discount,total:subtotal-discount,originalSubtotal,individualDiscountTotal:originalSubtotal-subtotal,effectiveSubtotal:subtotal,collectionDiscountTotal:discount,finalTotal:subtotal-discount};
}

export function getOriginalPrice(p) {return knownPrice(p)?Number(p.price):null;}
export function isProductOnSale(p) {return p.onSale===true && Number.isInteger(p.discountPercent) && p.discountPercent>0 && p.discountPercent<100;}
export function getProductPrice(p) {
 const original=getOriginalPrice(p);
 return original===null?null:isProductOnSale(p)?Math.round(original*(100-p.discountPercent)/100):original;
}
export const getDiscountedPrice=getProductPrice;
// Individual offers remain applied before the separate collection discount.
export function getOrderPricing(selected,selection) {
 return new Map(selected.map(p=>{
  const originalPrice=getOriginalPrice(p);
  const individualSaleApplied=originalPrice!==null && isProductOnSale(p);
  return [p.id,{price:getProductPrice(p),originalPrice,
   discountPercent:individualSaleApplied?p.discountPercent:null,individualSaleApplied}];
 }));
}

export function getOrderPrices(selected,selection) {
 return new Map([...getOrderPricing(selected,selection)].map(([id,pricing])=>[id,pricing.price]));
}

export function orderSummaryLines(calculation,money) {
 const c=calculation;
 return [`${c.completePrice?'Subtotal original':'Subtotal original conocido'}: ${money(c.originalSubtotal)}`,
 ...(c.individualDiscountTotal ? ['Descuento en productos: −'+money(c.individualDiscountTotal)] : []),
 `Subtotal después de ofertas: ${money(c.effectiveSubtotal)}`,
 ...(c.collectionDiscountTotal ? ['Descuento de colección: −'+money(c.collectionDiscountTotal)] : []),
 'Total final: '+(c.completePrice?money(c.finalTotal):'Por confirmar')];
}
