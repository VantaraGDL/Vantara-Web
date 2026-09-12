export const SIZES=[['XS','Extra chica'],['S','Chica'],['M','Mediana'],['L','Grande'],['XL','Extra grande'],['Única','Unitalla']];
export const sizeLabel=size=>{const entry=SIZES.find(([value])=>value===size);return entry?entry[0]+' — '+entry[1]:size;};
export const sortSizes=variants=>[...variants].sort((a,b)=>{
    const rank=size=>{const index=SIZES.findIndex(([value])=>value===size);return index<0?SIZES.length:index;};
    return rank(a.size)-rank(b.size);
});
export const availableSizes=existing=>SIZES.filter(([size])=>!existing.some(v=>v.size===size));
