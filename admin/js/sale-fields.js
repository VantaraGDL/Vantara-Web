export function mountSaleFields(form, product={}) {
 const toggle=form.elements.on_sale,input=form.elements.discount_percent,box=form.querySelector('[data-sale-fields]');
 toggle.checked=product.on_sale===true;input.value=product.discount_percent??'';
 const sync=()=>{box.hidden=!toggle.checked;input.disabled=!toggle.checked;input.required=toggle.checked;};
 toggle.addEventListener('change',sync);sync();
 return ()=>{
  const percent=toggle.checked?Number(input.value):null;
  if(toggle.checked && (!input.value.trim() || !Number.isInteger(percent) || percent<=0 || percent>=100))throw new Error('Descuento: usa un porcentaje entero entre 1 y 99.');
  return {on_sale:toggle.checked,discount_percent:percent};
 };
}
