import { validateImage } from './media-data.js?v=packages-1';
export const PACKAGE_BUCKET = 'package-images';

export async function packageRpc(client, name, args) {
  const result = await client.rpc(name, args);
  if (result.error?.code === '23505') throw new Error('El slug ya existe o hay un producto repetido. Revisa los datos antes de guardar.');
  if (result.error) throw new Error(result.error.message || 'No se pudo confirmar la operación.');
  return result.data;
}
export const imageAction = (client, id, action, path = null, extension = null) =>
  packageRpc(client, 'manage_package_image', { p_package_id: id, p_action: action, p_path: path, p_extension: extension });

export async function completePackageUpload(client, id, path) {
  let asset;
  try { asset = await imageAction(client, id, 'complete', path); }
  catch (error) {
    throw new Error(`No se confirmó la recuperación de ${path}. ${error.message} La imagen no se ha seleccionado ni asignado. Si el archivo no llegó a Storage, selecciona el archivo de nuevo y guarda; recuperar no vuelve a subirlo.`);
  }
  if (asset?.path !== path || Number(asset.package_id) !== Number(id) || asset.state !== 'ready') {
    throw new Error(`No se confirmó el estado listo de ${path}. La imagen no se ha seleccionado ni asignado.`);
  }
  return asset;
}

export async function uploadPackageImage(client, id, file) {
  const extension = await validateImage(file);
  if (typeof createImageBitmap === 'function') {
    let bitmap;
    try { bitmap = await createImageBitmap(file); }
    catch { throw new Error('La imagen está dañada. Selecciona otra.'); }
    bitmap.close();
  }
  const asset = await imageAction(client, id, 'reserve', null, extension);
  const result = await client.storage.from(PACKAGE_BUCKET).upload(asset.path, file, { contentType: file.type, upsert: false });
  if (result.error) throw new Error(`No se confirmó la subida de ${asset.path}: ${result.error.message || 'Storage rechazó la operación.'} La reserva permanece pendiente; recuperar solo funciona si el archivo llegó a Storage.`);
  await completePackageUpload(client, id, asset.path);
  return asset.path;
}

export async function packageAssets(client, id = null) {
  const rows = [];
  for (let start = 0; ; start += 500) {
    let query = client.from('package_assets').select('path,package_id,state').order('path').range(start, start + 499);
    if (id !== null) query = query.eq('package_id', id);
    const result = await query;
    if (result.error) throw new Error('No se pudieron consultar las imágenes pendientes.');
    rows.push(...result.data);
    if (result.data.length < 500) return rows;
  }
}

// Compare against the saved path, never the unsaved image selected in the form.
// Keep ready records: package_images references their primary key.
export async function reconcileAssignedPackageImages(client, id = null) {
  const assets = await packageAssets(client, id);
  for (const asset of assets.filter(a => a.state === 'uploading' && a.package_id !== null)) {
    const result = await client.from('package_images').select('storage_path').eq('package_id', asset.package_id).eq('storage_path', asset.path).maybeSingle();
    if (result.error) throw new Error('No se pudo comprobar la imagen asignada al paquete.');
    if (result.data?.storage_path === asset.path) {
      await packageRpc(client, 'reconcile_package_image', { p_path: asset.path, p_finish: false });
    }
  }
}

// Automatic post-save cleanup only processes retired files. The explicit retry
// also reconciles historical upload reservations without discarding ready images.
export async function cleanupPackageImages(client, id = null, reconcileUploads = false) {
  const assets = (await packageAssets(client, id)).filter(a => a.state === 'deleting' || (reconcileUploads && a.state === 'uploading'));
  const failures = [];
  const summary = { resolved: 0, recovered: 0, waiting: 0 };
  const reconcile = (path, finish = false) => packageRpc(client, 'reconcile_package_image', { p_path: path, p_finish: finish });
  for (const asset of assets) {
    try {
      if (!/^packages\/\d+\/[0-9a-f-]{36}\.(jpg|png|webp)$/.test(asset.path)) throw new Error('Ruta inválida');
      let result = await reconcile(asset.path);
      if (result.status === 'delete') {
        const removal = await client.storage.from(PACKAGE_BUCKET).remove([asset.path]);
        // A missing object is success only after the server confirms its absence.
        // This also covers a second admin completing cleanup concurrently.
        try { result = await reconcile(asset.path, true); }
        catch (error) { throw new Error(removal.error?.message || error.message); }
      }
      if (result.status === 'resolved') summary.resolved++;
      else if (result.status === 'recovered') summary.recovered++;
      else if (result.status === 'waiting') summary.waiting++;
    } catch (error) { failures.push(`${asset.path}: ${error.message || 'No se pudo confirmar la limpieza.'}`); }
  }
  if (failures.length) throw new Error(`Hay operaciones sin resolver. ${failures.join(' · ')}`);
  return summary;
}
