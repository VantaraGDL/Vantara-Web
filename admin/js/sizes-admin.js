import {projectUrl,publishableKey} from './config.js';
import {requireAdmin} from './auth.js';
import {loadSizes} from './sizes.js?v=admin-5';
const $=id=>document.getElementById(id),form=$('size-form');
let editing=null,busy=false,dirty=false;
const say=text=>$('message').textContent=text;
window.addEventListener('beforeunload',e=>{if(dirty||busy){e.preventDefault();e.returnValue='';}});
function reset(){editing=null;form.reset();$('code').readOnly=false;$('form-title').textContent='Crear talla';dirty=false;}
async function boot(){try{
 const {createClient}=await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.57.4/+esm');
 const client=createClient(projectUrl,publishableKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:false,storageKey:'vantara-admin-session'}});
 async function guard(){if(!await requireAdmin(client)){$('content').hidden=true;location.replace('./login.html');return false;}return true;}
 if(!await guard())return;
 client.auth.onAuthStateChange(e=>{if(e==='SIGNED_OUT'){$('content').hidden=true;say('Sesión cerrada. Vuelve a iniciar sesión.');}});
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)guard().catch(e=>{$('content').hidden=true;say(e.message);});});
 window.addEventListener('pageshow',e=>{if(e.persisted)guard().catch(e=>{$('content').hidden=true;say(e.message);});});
 async function render(){
   const sizes=await loadSizes(client);$('sizes-list').replaceChildren();
   for(const row of sizes.sortSizes(sizes.catalog.map(v=>({...v,size:v.code})))){
     const card=document.createElement('article');card.className='card';
     const title=document.createElement('h3');title.textContent=sizes.sizeLabel(row.code);
     const info=document.createElement('p');info.textContent='Orden '+row.sort_order+' · '+(row.active?'Activa':'Inactiva');
     const edit=document.createElement('button');edit.type='button';edit.textContent='Editar / activar o desactivar';
     edit.addEventListener('click',()=>{if(busy)return;if(dirty&&!confirm('¿Descartar los cambios del formulario?'))return;editing=row.id;$('code').value=row.code;$('code').readOnly=true;$('label').value=row.label;$('sort').value=row.sort_order;$('active').checked=row.active;$('form-title').textContent='Editar talla';dirty=false;$('label').focus();});
     card.append(title,info,edit);$('sizes-list').append(card);
   }
 }
 form.addEventListener('input',()=>dirty=true);
 $('cancel').addEventListener('click',()=>{if(!busy&&(!dirty||confirm('¿Descartar los cambios del formulario?')))reset();});
 form.addEventListener('submit',async event=>{event.preventDefault();if(busy)return;
   try{
     const code=$('code').value.trim().replace(/\s+/g,' '),label=$('label').value.trim(),order=Number($('sort').value);
     if(!code||!label||!$('sort').value.trim()||!Number.isInteger(order)||order<0||order>2147483647)throw new Error('Completa código, nombre y un orden entero no negativo.');
     busy=true;form.querySelector('fieldset').disabled=true;say('Guardando talla…');
     if(!await guard())return;
     const {error}=await client.rpc('save_catalog_size',{p_id:editing,p_code:code,p_label:label,p_sort_order:order,p_active:$('active').checked});
     if(error)throw new Error(error.code==='23505'?'Ya existe una talla con ese código.':error.message);
     reset();
     try{await render();say('Talla guardada.');}catch{say('Talla guardada, pero no se pudo actualizar la lista. Recarga para verla.');}
   }catch(e){say(e.message||'No se confirmó el guardado. Conservamos el formulario; comprueba la lista antes de reintentar.');}
   finally{busy=false;form.querySelector('fieldset').disabled=false;}
 });
 await render();$('content').hidden=false;say('');
}catch(e){$('content').hidden=true;say(e.message||'No se pudo cargar el catálogo de tallas.');}}
boot();
