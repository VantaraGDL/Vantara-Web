// Generador local: no ejecuta SQL ni modifica el frontend.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'js/productos.js'), 'utf8');
const end = source.indexOf('\n];');
if (end < 0) throw new Error('No se encontró el final del catálogo');
const products = vm.runInNewContext(source.slice(0, end + 3) + '\nproducts', {}, {timeout: 1000});
const sql = value => value == null ? 'null' : typeof value === 'boolean' || typeof value === 'number' ? String(value) : "'" + String(value).replaceAll("'", "''") + "'";
const lines = ['-- Snapshot del catálogo actual. Ejecutar una sola vez después del esquema.', 'begin;'];
function insert(table, columns, rows) {
  lines.push(`insert into public.${table} (${columns.join(', ')}) values\n` + rows.map(r => '(' + r.map(sql).join(', ') + ')').join(',\n') + ';');
}
insert('brands', ['id','name','position'], ['Essentials','Van Cleef','Alo'].map((x,i)=>[x,x,i]));
insert('categories', ['id','name','position'], [['Hoodies','Hoodies'],['T-Shirts','Playeras'],['Pants','Pants'],['Shorts','Shorts'],['Sueter','Sueter'],['Accessories','Accesorios']].map((r,i)=>[...r,i]));
insert('collections', ['id','name'], [...new Set(products.map(p=>p.collection).filter(Boolean))].map(x=>[x,x.split('-').map(w=>w[0].toUpperCase()+w.slice(1)).join(' ')]));
insert('products', ['id','name','brand_id','category_id','collection_id','model','color','material','finish','description','price','featured','published','position','requires_size'], products.map((p,i)=>[p.id,p.name,p.brand,p.category,p.collection,p.model,p.color,p.material,p.finish,p.description,p.price,p.featured??false,false,i,(p.sizes ?? (p.category==='Accessories'?[]:['S','M','L','XL'])).length>0]));
const variants = [], images = [];
for (const p of products) {
  const sizes = p.sizes ?? (p.category==='Accessories'?[]:['S','M','L','XL']);
  if (typeof p.stock === 'number' && sizes.length) throw new Error('Stock global ambiguo para ropa: '+p.id);
  (sizes.length?sizes:['Única']).forEach((s,i)=>variants.push([p.id,s,typeof p.stock==='number' ? p.stock : p.stock && typeof p.stock==='object' ? (p.stock[s]??null):null,i]));
  (p.images ?? (p.image?[p.image]:[])).forEach((img,i)=>{
    if (!fs.existsSync(path.join(root,img))) throw new Error('Imagen ausente: '+img);
    images.push([p.id,img,p.name,i]);
  });
}
insert('product_variants',['product_id','size','stock','position'],variants);
insert('product_images',['product_id','path','alt','position'],images);
lines.push("select setval(pg_get_serial_sequence('public.products', 'id'), (select max(id) from public.products), true);", 'commit;', '');
fs.writeFileSync(path.join(__dirname,'migrations/20260908000200_catalog_seed.sql'),lines.join('\n'));
console.log({products:products.length,variants:variants.length,images:images.length,knownStock:variants.filter(v=>v[2]!==null).length});
