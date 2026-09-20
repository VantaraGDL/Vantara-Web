import {setDetailMetadata,resetDetailMetadata} from './public-seo.js?v=domain-seo-1';
import {addCartPackage,cartTotals} from './cart.js?v=production-fixes-1';
import {packageOrderItem,samePackageComposition} from './package-order.js?v=packages-polish-1';
import {createOrderConfirmation} from './order-confirmation.js?v=production-fixes-1';
import {invalidateOrderAttempt} from './orders-api.js?v=production-fixes-1';
import {createPackageGallery} from './package-gallery.js?v=packages-polish-1';
import { getPublishedPackages, getPackageById, disposePackageMedia, packageLoadError } from './packages-api.js?v=production-fixes-1';
import { initialPackageSelection, validatePackageSelection } from './package-selection.js?v=packages-public-1';
import { getPublicVariants } from './catalog-logic.js?v=collection-cart-2';

const root = document.querySelector('#packages-content');
const notice = document.querySelector('#packages-notice');
const retry = document.querySelector('#packages-retry');
const detail = document.body.classList.contains('package-detail-page');
const placeholder = 'assets/img/producto-pendiente.svg';
const money = value => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(value) + ' MXN';
const el = (tag, text, className) => {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
};
function image(src, name, eager = false) {
  const img = el('img'); img.src = src || placeholder; img.alt = name;
  img.loading = eager ? 'eager' : 'lazy'; img.decoding = 'async';
  img.addEventListener('error', () => { img.src = placeholder; }, { once: true });
  return img;
}
function priceBlock(pack) {
  const block = el('div', undefined, 'package-prices');
  if (!pack.pricing.complete) { block.append(el('p', 'Precio no disponible')); return block; }
  const original = el('del', money(pack.pricing.originalSubtotal), 'price-original');
  original.setAttribute('aria-label', 'Precio original: ' + money(pack.pricing.originalSubtotal));
  const final = el('strong', money(pack.pricing.finalTotal), 'price-final');
  final.setAttribute('aria-label', 'Precio del paquete: ' + money(pack.pricing.finalTotal));
  block.append(original, final); return block;
}
function stateText(state) {
  if (state.unavailable.length) return 'Una prenda del paquete no está disponible.';
  if (!state.completePrice) return 'Precio pendiente de confirmar.';
  if (state.missing.length) return 'Selecciona una talla para cada producto.';
  return 'Tu paquete está listo.';
}
function list(packages) {
  root.className = 'packages-grid';
  for (const pack of packages) {
    const card = el('article', undefined, 'package-card');
    card.append(image(pack.image, pack.name), el('h2', pack.name),
      el('p', `${pack.discountPercent}% de descuento`, 'package-discount'), priceBlock(pack));
    const state = validatePackageSelection(pack, new Map());
    if (state.unavailable.length || !state.completePrice) card.append(el('p', 'No disponible por el momento', 'package-muted'));
    if (pack.loadError) card.append(el('p', pack.loadError, 'package-muted'));
    const link = el('a', 'Ver paquete', 'button package-link'); link.href = `paquete.html?id=${pack.id}`;
    card.append(link); root.append(card);
  }
}
let directReview = null;
const openPackageModal = detail ? createOrderConfirmation(money, {
  source: 'package',
  beforeConfirm: async () => {
    const current = await getPackageById(directReview.item.package_id, {fullGallery:false,media:false}).catch(error => { throw new Error(packageLoadError(error)); });
    if (!current || !samePackageComposition(directReview.item,current)) throw new Error('Este paquete cambió o no está disponible. Vuelve a seleccionarlo.');
    const latest = packageOrderItem(current,new Map(directReview.item.items.map(i=>[i.product_id,i.variant_id])));
    if (JSON.stringify(latest)!==JSON.stringify(directReview.item)) throw new Error('El paquete cambió. Cierra esta ventana y vuelve a pedirlo.');
  }
}) : null;
function renderDetail(pack) {
  setDetailMetadata('package',pack,pack.image);
  const selection = initialPackageSelection(pack);
  const intro = el('section', undefined, 'package-intro');
  const { element: gallery, dispose } = createPackageGallery(pack); disposeGallery = dispose;
  const data = el('div', undefined, 'package-data');
  const heading = el('h1', pack.name); heading.id = 'package-title';
  const description = el('p', pack.description, 'package-description');
  data.append(el('p', 'PAQUETES VANT’ARA', 'package-eyebrow'), heading, description,
    el('p', `${pack.discountPercent}% de descuento`, 'package-discount'), priceBlock(pack));
  intro.append(gallery, data); root.append(intro);
  const contents = el('section', undefined, 'package-included');
  const title = el('h2', 'Productos incluidos'); title.id = 'package-included-title';
  contents.setAttribute('aria-labelledby', title.id);
  contents.append(title, el('p', 'Una pieza de cada producto. Elige su talla de forma independiente.', 'package-muted'));
  const products = el('div', undefined, 'package-items'); contents.append(products); root.append(contents);
  const status = el('p', undefined, 'package-selection-status');
  status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
  const add = el('button','Agregar al carrito','button'); add.type='button';
  const direct = el('button','Pedir paquete','button package-direct-order'); direct.type='button';
  const feedback = el('p'); feedback.setAttribute('role','status'); feedback.setAttribute('aria-live','polite');
  let actionBusy=false, blocked=false;
  const update = () => {
    const state=validatePackageSelection(pack,selection);
    const problem=[...state.unavailable,...state.missing][0];
    const name=pack.items.find(i=>i.productId===problem)?.product?.name;
    status.textContent=stateText(state)+(name?' Revisa: '+name+'.':'');
    add.disabled=direct.disabled=actionBusy||blocked||!state.valid;
  };
  for (const [index, item] of pack.items.entries()) {
    const card = el('article', undefined, 'package-item');
    products.append(card);
    const product = item.product;
    if (!product) {
      card.append(image(placeholder, 'Producto no disponible'), el('h3', 'Producto no disponible'),
        el('p', 'Esta prenda no está disponible.', 'package-muted'));
      continue;
    }
    card.append(image(product.images[0], product.name));
    const info = el('div', undefined, 'package-item-info'); card.append(info);
    info.append(el('p', product.brand, 'product-brand'), el('h3', product.name),
      el('p', product.price === null ? 'Precio no disponible' : money(product.price), 'package-item-price'));
    const variants = getPublicVariants(product);
    const group = el('fieldset');
    group.append(el('legend', `Talla · ${product.name}`));
    const buttons = el('div', undefined, 'size-list'); group.append(buttons);
    const stock = el('p', undefined, 'low-stock-note'); stock.id = `package-stock-${index}`;
    stock.setAttribute('aria-live', 'polite'); group.setAttribute('aria-describedby', stock.id);
    const selectedText = el('p', undefined, 'stock-status');
    const sync = () => {
      const current = variants.find(v => v.id === selection.get(item.productId) && v.stock > 0);
      for (const button of buttons.children) {
        const active = Boolean(current && String(current.id) === button.dataset.variant);
        button.classList.toggle('selected', active); button.setAttribute('aria-pressed', String(active));
      }
      selectedText.textContent = !variants.some(v => v.stock > 0) ? 'Sin tallas disponibles.' :
        current ? `Talla seleccionada: ${current.size === 'Única' ? 'Unitalla' : current.size}` : 'Selecciona una talla.';
      stock.textContent = current && current.stock < 5 ? current.stock === 1 ? 'Última pieza' : `Últimas ${current.stock} piezas` : '';
      update();
    };
    for (const variant of variants) {
      const button = el('button', variant.size === 'Única' ? 'Unitalla' : variant.size, 'size-button');
      button.type = 'button'; button.dataset.variant = String(variant.id); button.disabled = variant.stock === 0;
      button.setAttribute('aria-label', `Talla ${variant.size}${button.disabled ? ', agotada' : ''}`);
      button.addEventListener('click', () => {
        if (variant.stock <= 0) return;
        if(selection.get(item.productId)!==variant.id)invalidateOrderAttempt('package');
        selection.set(item.productId, variant.id); sync();
      });
      buttons.append(button);
    }
    info.append(group, selectedText, stock); sync();
  }
  const summary = el('section', undefined, 'package-summary');
  summary.append(el('h2', 'Resumen del paquete'));
  if (pack.pricing.complete) {
    const amounts = el('dl');
    for (const [label, value] of [
      ['Subtotal original', money(pack.pricing.originalSubtotal)],
      [`Descuento del paquete (${pack.discountPercent}%)`, '−' + money(pack.pricing.originalSubtotal - pack.pricing.finalTotal)],
      ['Total final', money(pack.pricing.finalTotal)]
    ]) { const row = el('div'); row.append(el('dt', label), el('dd', value)); amounts.append(row); }
    summary.append(amounts);
  } else summary.append(el('p', 'Precio pendiente de confirmar.'));
  const actions=el('div',undefined,'package-order-actions');actions.append(add,direct);
  summary.append(status,actions,feedback); root.append(summary); update();
  const act=async mode=>{
    if(actionBusy||blocked)return;
    actionBusy=true;update();feedback.textContent='Revisando tu paquete…';
    try{
      const current=await getPackageById(pack.id,{fullGallery:false,media:false});
      if(!current){blocked=true;throw new Error('Este paquete ya no está disponible.');}
      if(!samePackageComposition({items:pack.items},current)){blocked=true;throw new Error('Este paquete cambió. Recarga y elige tus tallas.');}
      const item=packageOrderItem(current,selection);
      // Refresh price presentation only; do not rebuild the gallery or size UI.
      data.querySelector('.package-prices').replaceWith(priceBlock(current));
      data.querySelector('.package-discount').textContent=current.discountPercent+'% de descuento';
      const amounts=summary.querySelector('dl');
      if(amounts){
        const values=[money(item.original_subtotal),'−'+money(item.original_subtotal-item.final_price),money(item.final_price)];
        amounts.querySelectorAll('dd').forEach((node,index)=>{node.textContent=values[index];});
        amounts.querySelectorAll('dt')[1].textContent='Descuento del paquete ('+item.discount_percent+'%)';
      }
      if(mode==='cart'){
        const result=addCartPackage(current,selection);
        feedback.textContent=result.duplicate?'Este paquete ya está en el carrito':result.replaced?'Paquete actualizado en el carrito':'Paquete agregado al carrito';
      }else{
        const totals=cartTotals([{item,available:true}]);directReview={item};
        openPackageModal(totals.rows,totals.calculation,direct);feedback.textContent='';
      }
    }catch(error){feedback.textContent=error.status||error.name==='AbortError'||error instanceof TypeError?packageLoadError(error):error.message||'No pudimos revisar tu paquete. Intenta de nuevo.';}
    finally{actionBusy=false;update();}
  };
  add.addEventListener('click',()=>act('cart'));
  direct.addEventListener('click',()=>act('direct'));
}

let loading = false, disposeGallery = () => {};
async function load() {
  if (loading) return;
  if(detail)resetDetailMetadata('package');
  loading = true; disposeGallery(); disposeGallery = () => {}; retry.hidden = true; root.replaceChildren(); disposePackageMedia();
  root.setAttribute('aria-busy', 'true'); notice.textContent = 'Cargando paquetes…';
  try {
    if (detail) {
      const pack = await getPackageById(new URLSearchParams(location.search).get('id'));
      if (!pack) {
        resetDetailMetadata('package',true);
        const panel=el('section',undefined,'package-empty');
        panel.append(el('h1','Paquete no disponible'));
        const back=el('a','Ver paquetes','button package-link');back.href='paquetes.html';panel.append(back);
        root.append(panel);notice.textContent='';return;
      }
      renderDetail(pack); notice.textContent = pack.loadError || ''; retry.hidden = !pack.loadError;
    } else {
      const packs = await getPublishedPackages(); list(packs);
      const partial = packs.some(pack => pack.loadError);
      notice.textContent = partial ? 'No pudimos cargar todos los detalles. Intenta de nuevo.' : '';
      if(!packs.length){const panel=el('section',undefined,'package-empty');panel.setAttribute('role','status');panel.append(el('p','No hay paquetes disponibles por el momento.'));const back=el('a','Explorar catálogo','button package-link');back.href='catalogo.html';panel.append(back);root.append(panel);}
      retry.hidden = !partial;
    }
  } catch (error) {
    if(detail)resetDetailMetadata('package',true);
    root.replaceChildren(); notice.textContent = packageLoadError(error); retry.hidden = false;
  } finally { loading = false; root.setAttribute('aria-busy', 'false'); }
}
retry.addEventListener('click', load);
load();
