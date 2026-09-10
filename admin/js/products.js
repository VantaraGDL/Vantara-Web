import {mountMedia} from './media.js';
import {projectUrl,publishableKey} from './config.js';
import {requireAdmin} from './auth.js';
import {pending,filterProducts,numberOrNull,allRows,saveChanges} from './products-data.js';
const $=s=>document.querySelector(s), content=$('#content'), message=$('#message');
let dirty=false, saving=false;
const say=t=>message.textContent=t;
window.addEventListener('beforeunload',e=>{if(dirty||saving){e.preventDefault();e.returnValue='';}});
function node(tag,text){const n=document.createElement(tag);n.textContent=text;return n;}
function options(select,rows,empty){select.replaceChildren();if(empty!==undefined){const o=node('option',empty);o.value='';select.append(o);}for(const r of rows){const o=node('option',r.name);o.value=r.id;select.append(o);}}
async function boot(){
 try{
  const {createClient}=await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.57.4/+esm');
  const client=createClient(projectUrl,publishableKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:false,storageKey:'vantara-admin-session'}});
  async function authorize(){content.hidden=true;const user=await requireAdmin(client);if(!user){location.replace('./login.html');return false;}content.hidden=false;return true;}
  if(!await authorize())return;
  client.auth.onAuthStateChange(e=>{if(e==='SIGNED_OUT'){content.hidden=true;say('Sesión cerrada. Vuelve a iniciar sesión.');}});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)authorize().catch(e=>say(e.message));});
  window.addEventListener('pageshow',e=>{if(e.persisted)authorize().catch(e=>say(e.message));});
  const [brands,categories,collections]=await Promise.all(['brands','categories','collections'].map(t=>allRows(client,t,'id,name')));
  if($('#list')){
   const rows=await allRows(client,'products','id,name,model,brand_id,category_id,price,published,featured,product_variants(id,size,stock)');
   options($('#brand'),brands,'Todas las marcas');options($('#category'),categories,'Todas las categorías');
   const money=new Intl.NumberFormat('es-MX',{style:'currency',currency:'MXN'});
   function render(){const filtered=filterProducts(rows,{search:$('#search').value,brand:$('#brand').value,category:$('#category').value,status:$('#status').value,stock:$('#pending').checked});$('#list').replaceChildren();$('#count').textContent=`${filtered.length} productos`;
    for(const p of filtered){const card=node('article','');card.className='card product-row';card.append(node('h2',p.name),node('p',`${brands.find(b=>b.id===p.brand_id)?.name || p.brand_id} · ${categories.find(c=>c.id===p.category_id)?.name || p.category_id}`),node('p',p.price===null?'Precio pendiente':money.format(p.price)),node('p',`${p.published?'Publicado':'Oculto'} · ${p.featured?'Destacado':'No destacado'}`),node('p',p.product_variants.length?p.product_variants.map(v=>`${v.size}: ${v.stock===null?'Pendiente':v.stock===0?'Agotado':v.stock}`).join(' · '):'Inventario pendiente'));const a=node('a','Editar');a.className='button-link';a.href=`./producto-editar.html?id=${encodeURIComponent(p.id)}`;card.append(a);$('#list').append(card);}
   }
   $('#filters').addEventListener('input',render);render();say('');
  }else{
   const id=new URLSearchParams(location.search).get('id');if(!/^\d+$/.test(id||''))throw new Error('Identificador de producto inválido.');
   const r=await client.from('products').select('*,product_variants(id,size,stock,position)').eq('id',id).single();if(r.error)throw new Error('Producto no encontrado o sin acceso.');const original=r.data, form=$('#editor');
   options(form.elements.brand_id,brands);options(form.elements.category_id,categories);options(form.elements.collection_id,collections,'Sin colección');
   const fields=['name','model','color','brand_id','category_id','price','material','description','collection_id'];
   for(const key of fields)form.elements[key].value=original[key]??'';
   for(const key of ['featured'])form.elements[key].checked=original[key];
   for(const v of original.product_variants.sort((a,b)=>a.position-b.position)){const label=node('label',v.size);label.htmlFor='stock-'+v.id;const input=document.createElement('input');Object.assign(input,{id:label.htmlFor,type:'number',min:'0',max:'2147483647',step:'1',value:v.stock??'',placeholder:'Pendiente'});input.dataset.variant=v.id;$('#variants').append(label,input);}
   form.addEventListener('input',()=>{dirty=true;});form.hidden=false;form.querySelector('fieldset').disabled=original.deletion_pending;
   form.addEventListener('submit',async e=>{e.preventDefault();if(saving)return;try{
    const patch={};for(const key of fields)patch[key]=form.elements[key].value.trim()||null;
    if(!patch.name)throw new Error('El nombre es obligatorio.');patch.price=numberOrNull(form.elements.price.value);
    patch.featured=form.elements.featured.checked;
    const variants=[...form.querySelectorAll('[data-variant]')].map(i=>({id:Number(i.dataset.variant),stock:numberOrNull(i.value,true)}));
    saving=true;form.querySelector('fieldset').disabled=true;form.setAttribute('aria-busy','true');say('Guardando…');
    if(!await requireAdmin(client))throw new Error('Sesión vencida. Inicia sesión antes de guardar.');
    await saveChanges(client,original,patch,variants);dirty=false;say('Cambios guardados correctamente.');
   }catch(e){say(e.message);}finally{saving=false;form.querySelector('fieldset').disabled=original.deletion_pending;form.removeAttribute('aria-busy');}});say('');
   await mountMedia(client,original,{busy:()=>saving,lock:value=>{saving=value;document.querySelectorAll('#content fieldset').forEach(f=>f.disabled=value);form.querySelector('fieldset').disabled=value||original.deletion_pending;},deleted:()=>{dirty=false;saving=false;}});
  }
 }catch(e){content.hidden=true;say(e.message || 'No se pudo cargar la página. Comprueba la conexión y recarga.');}
}
boot();
