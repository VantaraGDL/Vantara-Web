import {requireAdmin} from './auth.js';
import {numberOrNull} from './products-data.js?v=admin-3';
export const slugify=value=>value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
export function mountTaxonomyCreation(client,productForm,controls) {
    const panel=document.createElement('section');panel.hidden=true;
    panel.innerHTML=`<form><fieldset><legend id="taxonomy-title"></legend><p>Esta entrada se guardará al crearla, aunque después no guardes el producto.</p><label for="taxonomy-name">Nombre</label><input id="taxonomy-name" required maxlength="120"><label for="taxonomy-slug">Slug</label><input id="taxonomy-slug" required maxlength="80" pattern="[a-z0-9]+(-[a-z0-9]+)*"><p>Minúsculas, números y guiones. No puede repetirse.</p><div id="taxonomy-discount" hidden><label class="check"><input id="taxonomy-enabled" type="checkbox" checked> Activar descuento</label><label for="taxonomy-amount">Descuento MXN</label><input id="taxonomy-amount" type="number" min="0" max="9999999999.99" step="0.01" value="150"><label for="taxonomy-minimum">Mínimo de piezas</label><input id="taxonomy-minimum" type="number" min="2" max="2147483647" step="1" value="2"></div><p role="status" aria-live="polite" id="taxonomy-message"></p><button type="submit">Crear y seleccionar</button><button type="button" id="taxonomy-cancel">Cancelar</button></fieldset></form>`;
    productForm.before(panel);
    const form=panel.querySelector('form'),name=panel.querySelector('#taxonomy-name'),slug=panel.querySelector('#taxonomy-slug'),status=panel.querySelector('#taxonomy-message');
    let target,kind,editedSlug=false;
    const close=()=>{panel.hidden=true;target?.focus();};
    name.addEventListener('input',()=>{if(!editedSlug)slug.value=slugify(name.value);});
    slug.addEventListener('input',()=>editedSlug=true);
    for(const [key,table,label] of [['brand_id','brands','marca'],['category_id','categories','categoría'],['collection_id','collections','colección']]) {
        const select=productForm.elements[key];select.add(new Option(`+ Crear nueva ${label}`,'__create__'));
        let previous=select.value;
        select.addEventListener('change',()=>{
            if(select.value!=='__create__'){previous=select.value;return;}
            select.value=previous;target=select;kind=table;form.reset();editedSlug=false;status.textContent='';
            panel.querySelector('#taxonomy-title').textContent=`Crear nueva ${label}`;
            panel.querySelector('#taxonomy-discount').hidden=table!=='collections';panel.hidden=false;name.focus();
        });
    }
    panel.querySelector('#taxonomy-cancel').addEventListener('click',close);
    form.addEventListener('submit',async event=>{
        event.preventDefault();if(controls.busy())return;
        try {
            if(!name.value.trim()||!slugify(name.value))throw new Error('Escribe un nombre válido.');
            const options={};
            if(kind==='collections'){
                const amount=numberOrNull(panel.querySelector('#taxonomy-amount').value);
                const minimum=numberOrNull(panel.querySelector('#taxonomy-minimum').value,true);
                if(amount===null||minimum===null||minimum<2)throw new Error('Indica descuento y mínimo de al menos dos piezas.');
                Object.assign(options,{discount_enabled:panel.querySelector('#taxonomy-enabled').checked,discount_amount:amount,minimum_pieces:minimum});
            }
            controls.lock(true);form.querySelector('fieldset').disabled=true;status.textContent='Creando…';
            if(!await requireAdmin(client))throw new Error('Sesión vencida. Inicia sesión para continuar.');
            const {data,error}=await client.rpc('create_catalog_taxonomy',{p_kind:kind,p_name:name.value.trim(),p_slug:slug.value,p_options:options});
            if(error)throw new Error(error.code==='23505'?'Ya existe una entrada con ese nombre o slug. Selecciónala en la lista.':error.message);
            if(!data?.id)throw new Error('No se recibió confirmación. Revisa el selector antes de reintentar.');
            const option=new Option(data.name,data.id);target.add(option,target.options[target.options.length-1]);target.value=data.id;
            target.dispatchEvent(new Event('change',{bubbles:true}));controls.changed();close();controls.say('Entrada creada y seleccionada. Aún debes guardar el producto.');
        }catch(error){status.textContent=error.message||'No se confirmó la creación. Recarga para comprobar si se guardó antes de reintentar.';}
        finally{controls.lock(false);form.querySelector('fieldset').disabled=false;}
    });
}
