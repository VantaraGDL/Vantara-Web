import {availableSizes,sortSizes,sizeLabel} from './sizes.js?v=admin-4';

export function mountVariants(container,original,{busy,changed}) {
    let rows=[];
    const label=document.createElement('label');label.textContent='Añadir talla';label.htmlFor='add-size';
    const select=document.createElement('select');select.id='add-size';
    const add=document.createElement('button');add.type='button';add.textContent='Añadir talla';
    container.after(label,select,add);
    function render(focusSize,focusButton=false) {
        container.replaceChildren();
        for(const row of sortSizes(rows)) {
            const group=document.createElement('div');group.className='variant-row'+(row.removed?' variant-removed':'');
            const label=document.createElement('label');label.htmlFor='variant-stock-'+row.size;
            label.textContent=sizeLabel(row.size)+(row.removed?' — Pendiente de eliminar':row.id?'':' — Por guardar');
            const input=document.createElement('input');Object.assign(input,{id:label.htmlFor,type:'number',min:'0',max:'2147483647',step:'1',placeholder:'Pendiente',value:row.value,disabled:row.removed});
            input.addEventListener('input',()=>{row.value=input.value;changed();});
            const button=document.createElement('button');button.type='button';
            button.textContent=row.removed?'Deshacer eliminación':row.id?'Eliminar talla':'Quitar talla nueva';
            button.setAttribute('aria-label',button.textContent+' '+row.size);
            button.addEventListener('click',()=>{
                if(busy())return;
                if(row.removed)row.removed=false;
                else {
                    if(!window.confirm('¿Quitar la talla '+row.size+'? Los cambios se aplicarán únicamente al guardar.'))return;
                    if(row.id)row.removed=true;else rows=rows.filter(v=>v!==row);
                }
                changed();render(row.size,true);
                if(!rows.includes(row))add.focus();
            });
            group.append(label,input,button);container.append(group);
        }
        select.replaceChildren();
        // Reserved until saved: use Undo instead of adding the same size twice.
        for(const [size] of availableSizes(rows))select.add(new Option(sizeLabel(size),size));
        select.disabled=add.disabled=!select.options.length;
        if(focusSize){const input=document.getElementById('variant-stock-'+focusSize);(focusButton?input?.nextElementSibling:input)?.focus();}
    }
    add.addEventListener('click',()=>{if(busy()||!select.value)return;const size=select.value;rows.push({size,value:'',removed:false});changed();render(size);});
    function reset(){rows=original.product_variants.map(v=>({...v,value:v.stock??'',removed:false}));render();}
    reset();
    return {reset,values:()=>sortSizes(rows).map(v=>({...v}))};
}
