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
export function getProductBadge(item) {
    const variants=item.variants || [];
    if(variants.length && variants.every(v=>v.stock===0))return {kind:'sold-out',label:'AGOTADO'};
    const total=getKnownStockTotal(item);
    if(total>=1 && total<5)return {kind:'low-stock',label:'ÚLTIMAS PIEZAS'};
    return item.newRelease ? {kind:'new',label:'NUEVO'} : null;
}
export function knownPrice(item) {return item.price!==null && item.price!==undefined && Number.isFinite(Number(item.price));}
export function calculateOrder(selected,selection) {
    const completePrice=selected.every(knownPrice);
    const subtotal=selected.reduce((sum,p)=>sum+(knownPrice(p)?Number(p.price)*selection.get(p.id).quantity:0),0);
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
