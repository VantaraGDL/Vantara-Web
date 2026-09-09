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
// Una RPC: el servidor confirma todos los cambios o revierte la operación.
export async function saveChanges(client, original, patch, variants) {
  const changes=Object.fromEntries(Object.entries(patch).filter(([k,v])=>original[k]!==v));
  const stocks=variants.filter(v=>original.product_variants.find(x=>x.id===v.id)?.stock!==v.stock);
  if(!Object.keys(changes).length && !stocks.length)return 0;
  let result;
  try { result=await client.rpc('update_catalog_product',{p_product_id:original.id,p_changes:changes,p_variants:stocks}); }
  catch { throw new Error('No se pudo confirmar el guardado. Tus cambios siguen en el formulario; comprueba la conexión y reintenta.'); }
  if(result.error)throw new Error('No se pudo guardar el producto y sus tallas. Revisa los valores y tu acceso. Tus cambios siguen en el formulario.');
  Object.assign(original,changes);
  for(const v of stocks)original.product_variants.find(x=>x.id===v.id).stock=v.stock;
  return 1;
}
