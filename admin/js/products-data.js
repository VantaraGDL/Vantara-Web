export const pending = p => !p.product_variants.length || p.product_variants.some(v => v.stock === null);
export function filterProducts(rows, {search='',brand='',category='',status='',stock=false}) {
  const norm = s => s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  return rows.filter(p => norm(`${p.name} ${p.model || ''}`).includes(norm(search.trim())) &&
    (!brand || p.brand_id === brand) && (!category || p.category_id === category) &&
    (!status || p.published === (status === 'published')) && (!stock || pending(p)));
}
export function numberOrNull(value, integer=false) {
  if (!value.trim()) return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || (integer ? !Number.isInteger(n) || n > 2147483647 : n > 9999999999.99 || Math.abs(n*100-Math.round(n*100))>0.0001)) throw new Error(integer ? 'Stock: usa un entero positivo, cero o deja vacío.' : 'Precio: usa un importe positivo o cero, con máximo dos decimales, o deja vacío.');
  return n;
}
export async function allRows(client, table, columns) {
  const rows=[];
  for(let i=0;;i+=500){const r=await client.from(table).select(columns).order('id').range(i,i+499);if(r.error)throw new Error('No se pudo leer '+table+'. Revisa tu conexión y acceso.');rows.push(...r.data);if(r.data.length<500)return rows;}
}
// Guardar solo diferencias. Cada respuesta debe confirmar la fila afectada por RLS.
export async function saveChanges(client, original, patch, variants) {
  const changes=Object.fromEntries(Object.entries(patch).filter(([k,v])=>original[k]!==v));
  const tasks=[];
  if(Object.keys(changes).length)tasks.push(async()=>{const r=await client.from('products').update(changes).eq('id',original.id).select('id').single();if(r.error)throw r.error;Object.assign(original,changes);});
  for(const v of variants){const old=original.product_variants.find(x=>x.id===v.id);if(old.stock!==v.stock)tasks.push(async()=>{const r=await client.from('product_variants').update({stock:v.stock}).eq('id',v.id).eq('product_id',original.id).select('id').single();if(r.error)throw r.error;old.stock=v.stock;});}
  let saved=0;
  try{for(const task of tasks){await task();saved++;}}
  catch{throw new Error(`No se completó el guardado (${saved} de ${tasks.length} cambios confirmados). Tus valores siguen en el formulario. Comprueba la conexión y vuelve a guardar; no recargues si quieres conservarlos.`);}
  return tasks.length;
}
