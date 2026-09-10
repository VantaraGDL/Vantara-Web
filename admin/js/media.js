import {requireAdmin} from './auth.js';
import {BUCKET,uploadImage,deleteImage,deleteProduct,mediaAction,objectPath} from './media-data.js';
export async function mountMedia(client,product,controls) {
  const root=document.querySelector('#media-panel'),list=document.querySelector('#media-list'),status=document.querySelector('#media-status');
  let images=[],ordered=false,urls=[];
  const node=(tag,text)=>{const n=document.createElement(tag);n.textContent=text;return n;};
  const say=text=>{status.textContent=text;};
  window.addEventListener('beforeunload',e=>{if(ordered){e.preventDefault();e.returnValue='';}});
  async function run(fn){if(controls.busy())return;controls.lock(true);root.setAttribute('aria-busy','true');try{if(!await requireAdmin(client))throw new Error('Sesión vencida. Vuelve a iniciar sesión.');await fn();}catch(e){say(e.message||'No se confirmó la operación. Recarga o reintenta.');}finally{controls.lock(false);root.removeAttribute('aria-busy');}}
  function button(text,fn){const b=node('button',text);b.type='button';b.addEventListener('click',fn);return b;}
  async function render(){
    urls.forEach(URL.revokeObjectURL);urls=[];list.replaceChildren();
    const main=images.find(i=>i.media_state==='ready')?.id;
    for(const [index,image] of images.entries()){
      const card=node('article','');card.className='card media-card';
      card.append(node('h3',image.id===main?'Principal':`Imagen ${index+1}`));
      const pic=document.createElement('img');pic.alt=image.alt||product.name;pic.loading='lazy';card.append(pic);
      if(image.bucket_id && image.media_state!=='deleting'){
        try{const path=objectPath(image,product.id);const r=await client.storage.from(BUCKET).download(path);if(!r.error){const url=URL.createObjectURL(r.data);urls.push(url);pic.src=url;}else pic.hidden=true;}catch{pic.hidden=true;}
      }else if(!image.bucket_id && /^assets\/img\/[a-zA-Z0-9_./-]+$/.test(image.path) && !image.path.includes('..'))pic.src='../'+image.path;
      else pic.hidden=true;
      card.append(node('p',image.media_state==='uploading'?'Subida pendiente':image.media_state==='deleting'?'Eliminación pendiente':image.bucket_id?'Imagen en Storage':'Imagen del repositorio (solo se elimina su referencia)'));
      const actions=node('div','');actions.className='media-actions';
      function move(to){run(async()=>{images.splice(index,1);images.splice(to,0,image);ordered=true;say('Orden modificado. Pulsa Guardar orden.');await render();});}
      const first=button('Hacer principal',()=>move(0));first.disabled=index===0||image.media_state!=='ready'||product.deletion_pending;actions.append(first);
      const up=button('↑ Subir',()=>move(index-1));up.disabled=index===0||product.deletion_pending;actions.append(up);
      const down=button('↓ Bajar',()=>move(index+1));down.disabled=index===images.length-1||product.deletion_pending;actions.append(down);
      if(image.media_state==='uploading')actions.append(button('Completar subida',()=>run(async()=>{if(ordered)throw new Error('Guarda el orden antes de completar una subida.');await mediaAction(client,product.id,'complete',{image_id:image.id});await refresh();say('Subida completada.');})));
      actions.append(button(image.media_state==='deleting'?'Reintentar eliminación':'Eliminar imagen',()=>{
        if(ordered){say('Guarda el orden antes de eliminar una imagen.');return;}
        if(!confirm('¿Eliminar esta imagen? No se puede deshacer. Los archivos del repositorio no se borran.'))return;
        run(async()=>{say('Eliminando imagen…');try{await deleteImage(client,product.id,image);}catch(error){try{await refresh();}catch{}throw error;}await refresh();say('Imagen eliminada.');});
      }));card.append(actions);list.append(card);
    }
    if(!images.length)list.append(node('p','Este producto no tiene imágenes.'));
  }
  async function refresh(){const r=await client.from('product_images').select('*').eq('product_id',product.id).order('position');if(r.error)throw new Error('No se pudieron cargar las imágenes.');images=r.data;ordered=false;await render();}
  document.querySelector('#upload-images').addEventListener('click',()=>run(async()=>{
    if(ordered)throw new Error('Guarda el orden antes de subir imágenes.');
    const input=document.querySelector('#image-files'),files=[...input.files];if(!files.length)throw new Error('Selecciona una o varias imágenes.');
    const results=document.querySelector('#upload-results');results.replaceChildren();let failed=false;
    for(const [i,file] of files.entries()){say(`Subiendo ${i+1} de ${files.length}…`);try{await uploadImage(client,product.id,file);results.append(node('li',`${file.name}: subida completada`));}catch(e){failed=true;results.append(node('li',`${file.name}: ${e.message}`));}}
    input.value='';await refresh();say(failed?'Algunas subidas no se completaron. Revisa el detalle y las operaciones pendientes.':'Todas las imágenes se subieron.');
  }));
  document.querySelector('#save-image-order').addEventListener('click',()=>run(async()=>{await mediaAction(client,product.id,'reorder',{ids:images.map(i=>i.id)});await refresh();say('Orden guardado.');}));
  function updateState(){document.querySelector('#publication-state').textContent=product.deletion_pending?'Eliminación en curso: producto oculto':product.published?'Publicado':'Oculto';document.querySelector('#toggle-publication').textContent=product.published?'Ocultar producto':'Publicar producto';document.querySelector('#delete-product').textContent=product.deletion_pending?'Reintentar eliminación definitiva':'Eliminar definitivamente';document.querySelector('#toggle-publication').disabled=product.deletion_pending;document.querySelector('#upload-images').disabled=product.deletion_pending;}
  document.querySelector('#toggle-publication').addEventListener('click',()=>{
    if(!confirm(product.published?'¿Ocultar este producto sin eliminar sus datos?':'¿Publicar este producto?'))return;
    run(async()=>{const next=!product.published;const r=await client.rpc('update_catalog_product',{p_product_id:product.id,p_changes:{published:next},p_variants:[]});if(r.error)throw new Error(r.error.message);product.published=next;updateState();say(next?'Producto publicado.':'Producto oculto.');});
  });
  document.querySelector('#delete-product').addEventListener('click',()=>{
    const confirmation=prompt(`Eliminar «${product.name}» (ID ${product.id}) borra sus variantes e imágenes. No se puede deshacer. Escribe ELIMINAR ${product.id} para confirmar.`);
    if(confirmation!==`ELIMINAR ${product.id}`){say('Eliminación cancelada.');return;}
    run(async()=>{say('Eliminando producto y archivos…');try{await deleteProduct(client,product.id,confirmation);ordered=false;controls.deleted();location.replace('./productos.html');}catch(e){const r=await client.from('products').select('deletion_pending,published').eq('id',product.id).maybeSingle();if(!r.error&&r.data)Object.assign(product,r.data);updateState();await refresh();throw e;}});
  });
  await refresh();updateState();root.hidden=false;
}
