import { projectUrl, publishableKey } from './config.js';
import { requireAdmin } from './auth.js';
import { allRows } from './products-data.js?v=admin-4';
import { validateImage } from './media-data.js?v=packages-1';
import { PACKAGE_BUCKET, packageRpc, imageAction, completePackageUpload, uploadPackageImage, packageAssets, cleanupPackageImages, reconcileAssignedPackageImages } from './packages-data.js?v=packages-images-4';

const $ = id => document.getElementById(id);
const form = $('package-form');
const message = text => { $('message').textContent = text; };
const normalize = text => String(text || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const slugify = text => normalize(text).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const node = (tag, text, className) => {
  const element = document.createElement(tag);
  if (text !== undefined) element.textContent = text;
  if (className) element.className = className;
  return element;
};
function button(text, action) {
  const element = node('button', text);
  element.type = 'button';
  element.addEventListener('click', action);
  return element;
}
function link(text, href) {
  const element = node('a', text); element.href = href; return element;
}

let client, busy = false, dirty = false, id = null, products = [], selected = [];
let imagePath = null, savedImagePath = null, file = null, slugEdited = false;
let previewUrl = null, previewSerial = 0;
const listUrls = [];
function markDirty() { dirty = true; message('Cambios pendientes de guardar.'); }
function setBusy(value) {
  busy = value;
  if (form) $('package-fields').disabled = value;
  // Outside-fieldset actions must not race with a save or deletion.
  document.querySelectorAll('#asset-panel button,#delete-panel button,#package-list button,#cleanup,#logout').forEach(b => { b.disabled = value; });
  if (form) $('package-published').disabled = value || !id;
}
async function operation(action) {
  if (busy) return;
  setBusy(true);
  try {
    if (!await requireAdmin(client)) { location.replace('./login.html'); return; }
    await action();
  } catch (error) {
    message(error.message || 'No se pudo completar la operación. Revisa la conexión.');
    if (form && id) await renderAssets().catch(() => {});
  }
  finally { setBusy(false); }
}
window.addEventListener('beforeunload', event => {
  if (dirty || busy) { event.preventDefault(); event.returnValue = ''; }
});

async function preview() {
  const serial = ++previewSerial;
  if (previewUrl) URL.revokeObjectURL(previewUrl);
  previewUrl = null;
  $('package-preview').hidden = true;
  $('preview-status').textContent = '';
  if (!file && !imagePath) return;
  try {
    let blob = file;
    if (!blob) {
      const result = await client.storage.from(PACKAGE_BUCKET).download(imagePath);
      if (result.error) throw result.error;
      blob = result.data;
    }
    if (serial !== previewSerial) return;
    previewUrl = URL.createObjectURL(blob);
    $('package-preview').src = previewUrl;
    $('package-preview').hidden = false;
  } catch { if (serial === previewSerial) $('preview-status').textContent = 'No se pudo cargar la vista previa. Reintenta al actualizar la página.'; }
}

function renderProducts() {
  const options = $('product-options'); options.replaceChildren();
  const term = normalize($('product-search').value.trim());
  const matches = products.filter(p => !p.deletion_pending && normalize(`${p.brandName} ${p.name}`).includes(term));
  for (const product of matches) {
    const row = node('div', undefined, 'package-choice');
    row.append(node('p', `${product.brandName} · ${product.name}`));
    const add = button(selected.includes(product.id) ? 'Incluido' : 'Añadir', () => {
      if (busy || selected.includes(product.id)) return;
      selected.push(product.id); markDirty(); renderProducts();
    });
    add.disabled = selected.includes(product.id);
    row.append(add); options.append(row);
  }
  if (!matches.length) options.append(node('p', 'Sin coincidencias.'));
  const included = $('selected-products'); included.replaceChildren();
  selected.forEach((productId, index) => {
    const product = products.find(p => p.id === productId);
    const name = product ? `${product.brandName} · ${product.name}` : `Producto no disponible (${productId})`;
    const row = node('li', undefined, 'package-selected'); row.append(node('p', name));
    if (product?.deletion_pending) row.append(node('p', 'Producto en eliminación: quítalo antes de guardar.'));
    const actions = node('div', undefined, 'package-actions');
    const move = step => {
      if (busy) return;
      [selected[index], selected[index + step]] = [selected[index + step], selected[index]];
      markDirty(); renderProducts();
      included.children[index + step]?.querySelector('button:not(:disabled)')?.focus();
    };
    const up = button('↑', () => move(-1)); up.disabled = index === 0; up.setAttribute('aria-label', `Subir ${name}`);
    const down = button('↓', () => move(1)); down.disabled = index === selected.length - 1; down.setAttribute('aria-label', `Bajar ${name}`);
    const remove = button('Quitar', () => { if (busy) return; selected.splice(index, 1); markDirty(); renderProducts(); });
    remove.setAttribute('aria-label', `Quitar ${name}`);
    actions.append(up, down, remove); row.append(actions); included.append(row);
  });
  if (!selected.length) included.append(node('li', 'Aún no hay productos incluidos.'));
}

async function renderAssets() {
  $('asset-panel').hidden = !id;
  if (!id) return;
  await reconcileAssignedPackageImages(client, id);
  const rows = await packageAssets(client, id);
  const panel = $('asset-list'); panel.replaceChildren();
  for (const asset of rows.filter(a => a.path !== savedImagePath)) {
    const row = node('div', undefined, 'package-selected');
    row.append(node('p', `${asset.path.split('/').pop()} — ${asset.state === 'uploading' ? 'Subida pendiente' : asset.state === 'deleting' ? 'Eliminación pendiente' : 'Disponible sin asignar'}`));
    const actions = node('div', undefined, 'package-actions');
    if (asset.state !== 'deleting') {
      actions.append(button(asset.state === 'uploading' ? 'Recuperar subida' : 'Usar imagen', () => operation(async () => {
        if (asset.state === 'uploading') await completePackageUpload(client, id, asset.path);
        imagePath = asset.path; file = null; $('package-file').value = ''; markDirty();
        await preview(); await renderAssets();
        message('Imagen lista y seleccionada. Pulsa Guardar para asignarla al paquete.');
      })));
      actions.append(button('Descartar archivo', () => operation(async () => {
        if (!confirm('¿Eliminar este archivo propio sin asignar?')) return;
        await imageAction(client, id, 'discard', asset.path);
        if (imagePath === asset.path) { imagePath = savedImagePath; await preview(); }
        await cleanupPackageImages(client, id); await renderAssets();
        message('Archivo descartado. Los datos del formulario no se guardaron.');
      })));
    }
    row.append(actions); panel.append(row);
  }
  if (!panel.children.length) panel.append(node('p', 'Sin imágenes pendientes.'));
}

function formData() {
  const discount = Number($('package-discount').value);
  if (!Number.isInteger(discount) || discount < 1 || discount > 99) throw new Error('El descuento debe ser un entero entre 1 y 99.');
  if (selected.length < 2 || new Set(selected).size !== selected.length) throw new Error('Selecciona al menos dos productos diferentes.');
  return {
    name: $('package-name').value.trim(), slug: $('package-slug').value.trim(),
    description: $('package-description').value.trim() || null,
    discount_percent: discount, published: id ? $('package-published').checked : false,
    featured: $('package-featured').checked, image_path: imagePath
  };
}
function editingMode() {
  $('package-published').disabled = !id;
  $('new-hidden-note').hidden = Boolean(id);
  $('delete-panel').hidden = !id;
  $('asset-panel').hidden = !id;
}

async function save() {
  const data = formData();
  if (file) await validateImage(file);
  message('Guardando…');
  // Persist an ID before uploading: later failures never create a second package.
  if (!id) {
    id = await packageRpc(client, 'create_catalog_package', { p_data: { ...data, image_path: null }, p_product_ids: selected });
    history.replaceState(null, '', `./paquete-editar.html?id=${encodeURIComponent(id)}`);
    document.querySelector('h1').textContent = 'Editar paquete';
    editingMode(); setBusy(true);
  }
  if (file) {
    try {
      imagePath = await uploadPackageImage(client, id, file);
      file = null; $('package-file').value = '';
    } catch (error) {
      await renderAssets().catch(() => {});
      throw new Error(`El paquete existe (ID ${id}); la imagen no se confirmó. ${error.message} Los cambios del formulario se conservan.`);
    }
  }
  await packageRpc(client, 'update_catalog_package', {
    p_package_id: id, p_data: { ...data, image_path: imagePath }, p_product_ids: selected
  });
  savedImagePath = imagePath; dirty = false;
  message('Paquete guardado.');
  try { await renderAssets(); await cleanupPackageImages(client, id); await renderAssets(); await preview(); }
  catch (error) { message(`Paquete guardado. ${error.message}`); }
}

async function deletePackage(packageId, name) {
  const confirmation = prompt(`Eliminar «${name}» y su imagen propia. Los productos se conservarán. Escribe ELIMINAR para confirmar.`);
  if (confirmation === null) return false;
  if (confirmation !== 'ELIMINAR') throw new Error('No se eliminó nada. Debes escribir ELIMINAR.');
  await packageRpc(client, 'delete_catalog_package', { p_package_id: packageId, p_confirmation: confirmation });
  // Deleted packages leave their retired assets in the ledger for safe retries.
  let note = 'Paquete eliminado. Los productos se conservaron.';
  try { await cleanupPackageImages(client); }
  catch (error) { note += ` ${error.message}`; }
  if (form) {
    dirty = false; busy = false;
    location.assign('./paquetes.html?deleted=1');
  } else { await loadList(); message(note); }
  return true;
}

async function pendingSummary() {
  await reconcileAssignedPackageImages(client);
  const assets = await packageAssets(client);
  const pending = assets.filter(a => a.state !== 'ready');
  const uploads = pending.filter(a => a.state === 'uploading').length;
  $('cleanup-status').textContent = `${pending.length} operación(es) pendiente(s): ${uploads} subida(s) y ${pending.length - uploads} eliminación(es). El reintento recupera subidas terminadas y limpia archivos retirados o reservas antiguas sin archivo.`;
  const links = $('pending-packages'); links.replaceChildren();
  for (const packageId of new Set(assets.filter(a => a.package_id !== null).map(a => a.package_id))) {
    // Ready assets may be unassigned; the editor distinguishes them from the active image.
    links.append(link(`Revisar imágenes del paquete ${packageId}`, `./paquete-editar.html?id=${packageId}`), node('br'));
  }
}
async function loadList() {
  listUrls.splice(0).forEach(url => URL.revokeObjectURL(url));
  const rows = await allRows(client, 'packages', 'id,name,discount_percent,published,image_path,package_items(id)');
  const list = $('package-list'); list.replaceChildren();
  for (const pack of rows) {
    const card = node('article', undefined, 'card');
    if (pack.image_path) {
      const img = node('img', undefined, 'package-thumb'); img.alt = pack.name; card.append(img);
      const result = await client.storage.from(PACKAGE_BUCKET).download(pack.image_path);
      if (result.error) { img.remove(); card.append(node('p', 'Vista previa no disponible.')); }
      else { const url = URL.createObjectURL(result.data); listUrls.push(url); img.src = url; }
    }
    card.append(node('h2', pack.name), node('p', `${pack.discount_percent}% de descuento · ${pack.published ? 'Publicado' : 'Oculto'} · ${pack.package_items.length} productos`));
    const actions = node('div', undefined, 'package-actions');
    actions.append(link('Editar', `./paquete-editar.html?id=${pack.id}`), button('Eliminar', () => operation(() => deletePackage(pack.id, pack.name))));
    card.append(actions); list.append(card);
  }
  if (!rows.length) list.append(node('p', 'Todavía no hay paquetes.'));
  await pendingSummary();
}

async function loadEditor() {
  const rawId = new URLSearchParams(location.search).get('id');
  if (location.pathname.endsWith('paquete-editar.html') && (!rawId || !/^\d+$/.test(rawId) || !Number.isSafeInteger(Number(rawId)) || Number(rawId) <= 0)) throw new Error('Falta un ID de paquete válido. Vuelve al listado de paquetes.');
  id = rawId ? Number(rawId) : null;
  const [rows, brands] = await Promise.all([
    allRows(client, 'products', 'id,name,brand_id,deletion_pending'), allRows(client, 'brands', 'id,name')
  ]);
  products = rows.map(p => ({ ...p, brandName: brands.find(b => b.id === p.brand_id)?.name || 'Sin marca' }));
  if (id) {
    const result = await client.from('packages').select('*,package_items(product_id,position)').eq('id', id).single();
    if (result.error) throw new Error('No se pudo cargar el paquete. Revisa el enlace y tu acceso.');
    const pack = result.data;
    $('package-name').value = pack.name; $('package-slug').value = pack.slug; slugEdited = true;
    $('package-description').value = pack.description || ''; $('package-discount').value = pack.discount_percent;
    $('package-published').checked = pack.published; $('package-featured').checked = pack.featured;
    selected = [...pack.package_items].sort((a, b) => a.position - b.position).map(item => item.product_id);
    imagePath = savedImagePath = pack.image_path;
  }
  editingMode(); renderProducts(); await preview(); await renderAssets();
  form.addEventListener('input', event => { if (event.target.id !== 'product-search') markDirty(); });
  form.addEventListener('change', event => { if (event.target.id !== 'product-search') markDirty(); });
  $('package-name').addEventListener('input', () => { if (!slugEdited) $('package-slug').value = slugify($('package-name').value); });
  $('package-slug').addEventListener('input', () => { slugEdited = true; });
  $('package-slug').addEventListener('blur', () => { $('package-slug').value = slugify($('package-slug').value); });
  $('product-search').addEventListener('input', renderProducts);
  $('package-file').addEventListener('change', () => {
    file = $('package-file').files[0] || null; preview();
  });
  $('remove-image').addEventListener('click', () => {
    file = null; imagePath = null; $('package-file').value = ''; markDirty(); preview();
  });
  form.addEventListener('submit', event => { event.preventDefault(); if (form.reportValidity()) operation(save); });
  $('refresh-assets').addEventListener('click', () => operation(async () => { await renderAssets(); message('Pendientes actualizados. Los cambios del formulario se conservan.'); }));
  $('delete-package').addEventListener('click', () => operation(() => deletePackage(id, $('package-name').value)));
}

async function guard() {
  const user = await requireAdmin(client);
  if (!user) { $('package-content').hidden = true; location.replace('./login.html'); return false; }
  $('email').textContent = user.email;
  return true;
}
async function init() {
  try {
    const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.57.4/+esm');
    client = createClient(projectUrl, publishableKey, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, storageKey: 'vantara-admin-session' } });
    if (!await guard()) return;
    client.auth.onAuthStateChange(event => {
      if (event === 'SIGNED_OUT') { $('package-content').hidden = true; dirty = false; busy = false; location.replace('./login.html'); }
    });
    $('logout').addEventListener('click', () => operation(async () => {
      if (dirty && !confirm('Hay cambios sin guardar. ¿Cerrar sesión?')) return;
      const result = await client.auth.signOut({ scope: 'local' });
      if (result.error) throw new Error('No se pudo cerrar sesión.');
      dirty = false;
    }));
    if (form) await loadEditor(); else await loadList();
    $('cleanup').addEventListener('click', () => operation(async () => {
      let summary, failure;
      try { summary = await cleanupPackageImages(client, form ? id : null, true); }
      catch (error) { failure = error; }
      // Refresh even after partial failure: completed operations must disappear.
      try { if (form) await renderAssets(); else await pendingSummary(); }
      catch (error) { throw new Error(`${failure ? failure.message + ' ' : ''}No se pudo actualizar la lista: ${error.message}`); }
      if (failure) throw failure;
      message(`${summary.resolved} operación(es) limpiada(s). ${summary.recovered} subida(s) recuperada(s); puedes asignarlas desde Editar. ${summary.waiting ? `${summary.waiting} subida(s) reciente(s) aún sin archivo; reintenta cuando tengan al menos 10 minutos.` : 'Sin operaciones adicionales procesadas.'}`);
    }));
    $('package-content').hidden = false;
    message(new URLSearchParams(location.search).has('deleted') ? 'Paquete eliminado. Revisa el estado de imágenes pendientes abajo.' : '');
    const recheck = () => {
      if (document.visibilityState === 'hidden' || busy) return;
      guard().catch(error => { $('package-content').hidden = true; message(error.message); });
    };
    document.addEventListener('visibilitychange', recheck);
    window.addEventListener('pageshow', recheck);
  } catch (error) {
    $('package-content').hidden = true;
    message(error.message || 'No se pudo cargar el administrador. Recarga para reintentar.');
  }
}
init();
