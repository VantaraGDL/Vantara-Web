export function escapeHTML(value) {
    return String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
export function productSizes(item) { return item.sizes || []; }
export function variantStock(item,size) {
    if (!item.variants?.length) return 0;
    const variant=item.requiresSize ? item.variants.find(v=>v.size===size) : item.variants[0];
    return variant ? variant.stock : 0;
}
export function sizeUnavailable(item,size) {return variantStock(item,size)===0;}
export function quantityLimit(item,size) {
    const max=Math.min(5,item.maxQuantity ?? 5);
    if(item.requiresSize && !size)return item.variants?.length ? max : 0;
    const stock=variantStock(item,size);
    return stock===null ? max : Math.min(max,stock);
}
export function getTotalStock(item) {
    const stocks=(item.variants || []).map(v=>v.stock);
    const known=stocks.reduce((sum,stock)=>sum+(stock ?? 0),0);
    return known>0 ? known : stocks.some(stock=>stock===null) ? null : 0;
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
