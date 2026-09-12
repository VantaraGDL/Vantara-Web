import {SIZES,sizeLabel} from './sizes.js?v=admin-4';
import {mountTaxonomyCreation} from './taxonomy-create.js?v=admin-3';
import {projectUrl,publishableKey} from './config.js';
import {requireAdmin} from './auth.js';
import {allRows,numberOrNull} from './products-data.js?v=admin-4';
const form=document.querySelector('#creator'),content=document.querySelector('#content'),message=document.querySelector('#message');
let dirty=false,busy=false;
window.addEventListener('beforeunload',e=>{if(dirty||busy){e.preventDefault();e.returnValue='';}});
const say=t=>message.textContent=t;
function options(key,rows,empty){const select=form.elements[key];select.replaceChildren();if(empty){const o=new Option(empty,'');select.add(o);}for(const row of rows)select.add(new Option(row.name,row.id));}
async function boot(){try{
 const {createClient}=await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.57.4/+esm');
 const client=createClient(projectUrl,publishableKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:false,storageKey:'vantara-admin-session'}});
 async function guard(){content.hidden=true;if(!await requireAdmin(client)){location.replace('./login.html');return false;}content.hidden=false;return true;}
 if(!await guard())return;
 client.auth.onAuthStateChange(e=>{if(e==='SIGNED_OUT'){content.hidden=true;say('Sesión cerrada. Inicia sesión para continuar.');}});
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)guard().catch(e=>say(e.message));});
 window.addEventListener('pageshow',e=>{if(e.persisted)guard().catch(e=>say(e.message));});
 const [brands,categories,collections]=await Promise.all(['brands','categories','collections'].map(t=>allRows(client,t,'id,name')));
 options('brand_id',brands,'Selecciona marca');options('category_id',categories,'Selecciona categoría');options('collection_id',collections,'Sin colección');
 form.elements.brand_id.required=true;form.elements.category_id.required=true;
 mountTaxonomyCreation(client,form,{busy:()=>busy,lock:value=>{busy=value;form.querySelector('fieldset').disabled=value;},changed:()=>dirty=true,say});
 const values=new Map(),chosen=new Set();
 function variants(){const box=document.querySelector('#variants');box.replaceChildren();
  const sizes=SIZES.map(([size])=>size);
  for(const size of sizes){const label=document.createElement('label');label.className='check';const check=document.createElement('input');check.type='checkbox';check.checked=chosen.has(size);check.dataset.size=size;label.append(check,document.createTextNode(sizeLabel(size)));const input=document.createElement('input');input.type='number';input.min='0';input.max='2147483647';input.step='1';input.placeholder='Pendiente';input.value=values.get(size)??'';input.setAttribute('aria-label','Stock '+size);input.disabled=!check.checked;check.addEventListener('change',()=>{input.disabled=!check.checked;if(check.checked)chosen.add(size);else chosen.delete(size);variants();[...box.querySelectorAll('[data-size]')].find(c=>c.dataset.size===size)?.focus();});input.addEventListener('input',()=>values.set(size,input.value));input.dataset.stock=size;box.append(label,input);}
 }

 form.addEventListener('input',()=>dirty=true);variants();form.hidden=false;say('');
 form.addEventListener('submit',async e=>{e.preventDefault();if(busy)return;
  try{const product={};for(const key of ['name','model','color','brand_id','category_id','material','description','collection_id'])product[key]=form.elements[key].value.trim()||null;
   if(!product.name||!product.brand_id||!product.category_id)throw new Error('Completa nombre, marca y categoría.');product.price=numberOrNull(form.elements.price.value);product.featured=form.elements.featured.checked;product.new_release=form.elements.new_release.checked;
   const variants=[...form.querySelectorAll('[data-size]:checked')].map(c=>({size:c.dataset.size,stock:numberOrNull([...form.querySelectorAll('[data-stock]')].find(i=>i.dataset.stock===c.dataset.size).value,true)}));
   if(!variants.length)throw new Error('Selecciona al menos una talla.');
   busy=true;form.querySelector('fieldset').disabled=true;form.setAttribute('aria-busy','true');say('Creando producto…');
   if(!await requireAdmin(client))throw new Error('Sesión vencida. Inicia sesión para continuar.');
   const {data,error}=await client.rpc('create_catalog_product',{p_product:product,p_variants:variants});
   if(error)throw new Error('No se pudo confirmar la creación. Conservamos el formulario. Revisa el listado antes de reintentar si hubo un fallo de conexión.');
   if(!data)throw new Error('No se recibió el identificador. Revisa el listado antes de reintentar.');
   dirty=false;say('Producto creado como oculto. Abriendo edición…');
   setTimeout(()=>{busy=false;location.replace('./producto-editar.html?id='+encodeURIComponent(data));},900);
  }catch(e){say(e.message||'Error de conexión. Conservamos tus datos. Revisa el listado antes de reintentar.');busy=false;form.querySelector('fieldset').disabled=false;form.removeAttribute('aria-busy');}
 });
}catch(e){content.hidden=true;say(e.message||'No se pudo cargar. Recarga para reintentar.');}}
boot();
