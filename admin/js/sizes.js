import {allRows} from './products-data.js?v=admin-4';
export async function loadSizes(client) {
 const catalog=await allRows(client,'catalog_sizes','id,code,label,sort_order,active');
 const lookup=new Map(catalog.map(v=>[v.code,v]));
 const compare=(a,b)=>{
   const x=lookup.get(a.size),y=lookup.get(b.size);
   if(!x||!y)return x?-1:y?1:0;
   return x.sort_order-y.sort_order || (x.code<y.code?-1:x.code>y.code?1:0);
 };
 const sortSizes=rows=>[...rows].sort(compare);
 const sizeLabel=code=>{const row=lookup.get(code);return row?code+' — '+row.label:code;};
 const options=sortSizes(catalog.filter(v=>v.active).map(v=>({...v,size:v.code}))).map(v=>[v.code,v.label]);
 return {catalog,options,sizeLabel,sortSizes,availableSizes:existing=>options.filter(([code])=>!existing.some(v=>v.size===code))};
}
