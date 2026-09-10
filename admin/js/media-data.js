export const BUCKET='product-images';
export const MAX_BYTES=5*1024*1024;
export async function validateImage(file) {
  const extensions={'image/jpeg':'jpg','image/png':'png','image/webp':'webp'};
  if(!extensions[file.type])throw new Error('Usa JPEG, PNG o WebP.');
  if(!file.size || file.size>MAX_BYTES)throw new Error('Cada imagen debe pesar entre 1 byte y 5 MB.');
  const h=new Uint8Array(await file.slice(0,12).arrayBuffer());
  const valid=file.type==='image/jpeg'?h[0]===255&&h[1]===216&&h[2]===255:
    file.type==='image/png'?h.slice(0,8).join(',')==='137,80,78,71,13,10,26,10':
    String.fromCharCode(...h.slice(0,4))==='RIFF'&&String.fromCharCode(...h.slice(8,12))==='WEBP';
  if(!valid)throw new Error('El contenido no corresponde a una imagen válida.');
  return extensions[file.type];
}
export function objectPath(image,productId) {
  if(image.bucket_id!==BUCKET || !new RegExp(`^products/${Number(productId)}/[0-9a-f-]{36}\\.(jpg|png|webp)$`).test(image.path))throw new Error('Ruta de Storage ajena al producto o inválida.');
  return image.path;
}
export async function mediaAction(client,id,action,payload={}) {
  const r=await client.rpc('manage_catalog_media',{p_product_id:Number(id),p_action:action,p_payload:payload});
  if(r.error)throw new Error(r.error.message || 'La operación no se pudo confirmar.');
  return r.data;
}
export async function uploadImage(client,id,file) {
  const extension=await validateImage(file);
  // Verify decoding before reserving a database row.
  if(typeof createImageBitmap==='function'){try{const bitmap=await createImageBitmap(file);bitmap.close();}catch{throw new Error('La imagen está dañada o no puede abrirse. Selecciona otra imagen.');}}
  const image=await mediaAction(client,id,'reserve',{extension});
  const path=objectPath(image,id);
  const r=await client.storage.from(BUCKET).upload(path,file,{contentType:file.type,upsert:false});
  if(r.error)throw new Error('La subida no se confirmó. Quedó una operación pendiente: puedes completarla si el archivo llegó, o limpiarla y reintentar.');
  await mediaAction(client,id,'complete',{image_id:image.id});
  return image;
}
export async function deleteImage(client,id,image) {
  await mediaAction(client,id,'begin_image_delete',{image_id:image.id});
  if(image.bucket_id){const path=objectPath(image,id);const r=await client.storage.from(BUCKET).remove([path]);if(r.error)throw new Error('No se pudo eliminar el archivo. La operación queda pendiente y puedes reintentar.');}
  await mediaAction(client,id,'finish_image_delete',{image_id:image.id});
}
export async function deleteProduct(client,id,confirmation) {
  await mediaAction(client,id,'begin_product_delete',{confirmation});
  // Read exact registered paths; no broad prefix deletion from the browser.
  const r=await client.from('product_images').select('*').eq('product_id',id);
  if(r.error)throw new Error('No se pudo leer la lista de archivos; reintenta el borrado.');
  for(const image of r.data)await deleteImage(client,id,image);
  await mediaAction(client,id,'finish_product_delete',{confirmation});
}
