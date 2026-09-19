import {projectUrl, publishableKey} from './config.js';
import {requireAdmin} from './auth.js';

const $ = id => document.getElementById(id);
const statuses = {pending:'Pendiente',confirmed:'Confirmado',cancelled:'Cancelado'};
const sources = {product:'Producto / conjunto',package:'Paquete',cart:'Carrito'};
const money = value => new Intl.NumberFormat('es-MX',{style:'currency',currency:'MXN',maximumFractionDigits:2}).format(Number(value))+' MXN';
const date = value => new Intl.DateTimeFormat('es-MX',{dateStyle:'medium',timeStyle:'short'}).format(new Date(value));
const node = (tag,text,className) => {const el=document.createElement(tag);if(text!==undefined)el.textContent=text;if(className)el.className=className;return el;};
const message = text => {$('message').textContent=text;};
const detail = Boolean($('order-detail'));
let client,busy=false,page=0,hasNext=false,currentOrder=null;
let filters={status:'',search:''};
function buttons() {
 document.querySelectorAll('button').forEach(button=>{button.disabled=busy;});
 if(!detail){$('previous').disabled=busy||page===0;$('next').disabled=busy||!hasNext;}
 else {$('confirm-order').disabled=busy||currentOrder?.status!=='pending';$('cancel-order').disabled=busy||currentOrder?.status!=='pending';}
}
async function run(action) {
 if(busy)return;busy=true;buttons();
 try {
  if(!await requireAdmin(client)){location.replace('./login.html');return;}
  await action();
 } catch(error) {message(error.message||'No se pudo completar la operación. Actualiza e intenta de nuevo.');}
 finally {busy=false;buttons();}
}
function status(value){return node('span',statuses[value]||value,'order-status '+value);}
function totalLine(list,label,value,emphasis=false){const row=node('div',undefined,emphasis?'order-total':'');row.append(node('dt',label),node('dd',money(value)));list.append(row);}
async function loadList() {
 message('Cargando pedidos…');
 let query=client.from('orders').select('id,public_code,status,source,created_at,total,total_units').order('created_at',{ascending:false}).order('id',{ascending:false}).range(page*50,page*50+50);
 if(filters.status)query=query.eq('status',filters.status);
 if(filters.search)query=query.ilike('public_code','%'+filters.search+'%');
 const {data,error}=await query;
 if(error)throw new Error('No se pudieron cargar los pedidos. Revisa tu acceso y conexión.');
 hasNext=data.length>50;
 const list=$('order-list');list.replaceChildren();
 for(const order of data.slice(0,50)) {
  const card=node('article',undefined,'card');
  card.append(node('h2',order.public_code),status(order.status),node('p',`${date(order.created_at)} · ${sources[order.source]} · ${order.total_units} artículo(s)`),node('strong',money(order.total)));
  const actions=node('div',undefined,'order-actions');const link=node('a','Ver detalle');link.href='./pedido.html?id='+encodeURIComponent(order.id);actions.append(link);card.append(actions);list.append(card);
 }
 if(!data.length)list.append(node('p','No hay pedidos con estos filtros.'));
 $('page').textContent='Página '+(page+1);message('Pedidos actualizados.');
}
function renderItem(item) {
 const row=node('article',undefined,'order-item');
 row.append(node('h3',item.product_name_snapshot),node('p',`${item.brand_snapshot||'Sin marca'} · Talla ${item.size_snapshot} · Cantidad ${item.quantity}`));
 const prices=node('dl',undefined,'order-totals');
 totalLine(prices,'Precio original unitario',item.unit_original_price);
 if(item.discount_percent_snapshot)row.append(node('p',`Oferta individual: ${item.discount_percent_snapshot}%`));
 totalLine(prices,item.line_type==='package_item'?'Precio asignado dentro del paquete':'Precio efectivo unitario',item.unit_effective_price);
 totalLine(prices,'Importe',item.line_total);row.append(prices);return row;
}
async function loadDetail() {
 currentOrder=null;$('pending-actions').hidden=true;buttons();
 const id=new URLSearchParams(location.search).get('id');
 if(!id||!/^\d+$/.test(id)||!Number.isSafeInteger(Number(id))||Number(id)<=0)throw new Error('El enlace del pedido no es válido. Vuelve al listado.');
 const {data:order,error}=await client.from('orders').select('*,order_items(*)').eq('id',id).maybeSingle();
 if(error)throw new Error('No se pudo cargar el pedido. Revisa tu conexión y acceso.');
 if(!order)throw new Error('Pedido no encontrado.');
 currentOrder=order;
 const card=node('section',undefined,'card');card.append(node('h2',order.public_code),status(order.status),node('p',`Creado: ${date(order.created_at)} · Origen: ${sources[order.source]} · ${order.total_units} artículo(s)`));
 if(order.customer_name)card.append(node('p','Cliente: '+order.customer_name));
 if(order.customer_phone)card.append(node('p','Teléfono: '+order.customer_phone));
 if(order.confirmed_at)card.append(node('p','Confirmado: '+date(order.confirmed_at)+' · Administrador: '+order.confirmed_by));
 if(order.cancelled_at)card.append(node('p','Cancelado: '+date(order.cancelled_at)+' · Administrador: '+order.cancelled_by));
 const totals=node('dl',undefined,'order-totals');totalLine(totals,'Subtotal original',order.subtotal);totalLine(totals,'Descuentos',-order.discount_total);totalLine(totals,'Total',order.total,true);card.append(totals);
 if(Number(order.collection_discount_total)>0)card.append(node('p','Descuento de colección incluido: '+money(order.collection_discount_total)));
 $('order-detail').replaceChildren(card);
 const list=$('order-items');list.replaceChildren();const groups=new Map();
 for(const item of [...order.order_items].sort((a,b)=>a.position-b.position)) {
  if(item.line_type==='package_item') {
   if(!groups.has(item.package_group)) {
    const group=node('section',undefined,'card order-package');group.append(node('h2','Paquete: '+item.package_name_snapshot),node('p',`Descuento del paquete: ${item.package_discount_percent_snapshot}%`));groups.set(item.package_group,group);list.append(group);
   }
   groups.get(item.package_group).append(renderItem(item));
  } else {const group=node('section',undefined,'card');group.append(renderItem(item));list.append(group);}
 }
 $('pending-actions').hidden=order.status!=='pending';
}
async function transition(action) {
 if(currentOrder?.status!=='pending')return;
 const confirming=action==='confirm';
 if(!confirm(confirming?'Al confirmar se descontará stock. Esta acción no puede repetirse ni revertirse desde este panel. ¿Confirmar pedido?':'¿Cancelar este pedido pendiente? No se modificará el stock.'))return;
 message(confirming?'Confirmando pedido…':'Cancelando pedido…');
 const orderId=currentOrder.id;
 const publicCode=currentOrder.public_code;
 const {data,error}=await client.rpc(confirming?'confirm_catalog_order':'cancel_catalog_order',{p_order_id:orderId});
 // A response may be lost after commit: refresh before permitting another action.
 currentOrder=null;$('pending-actions').hidden=true;
 if(error) {
  // SQL errors used to be hidden behind the same message as network failures.
  // Log only the server error fields, never session tokens or customer data.
  console.error('Operación de pedido rechazada',{code:error.code,message:error.message});
  await loadDetail().catch(()=>{});
  if(error.code==='22023'||error.code==='42501')throw new Error(error.message);
  if(/^[0-9A-Z]{5}$/.test(error.code||''))throw new Error(`La operación fue rechazada (${error.code}): ${error.message}`);
  throw new Error('No se pudo confirmar el resultado de la operación. Actualiza el pedido antes de reintentar.');
 }
 if(confirming && (!data || String(data.order_id)!==String(orderId) || data.public_code!==publicCode || data.status!=='confirmed')) {
  await loadDetail().catch(()=>{});
  throw new Error('La respuesta de confirmación no coincide con el pedido. Actualiza para comprobar su estado antes de reintentar.');
 }
 try {await loadDetail();message(confirming?'Pedido confirmado. Stock actualizado.':'Pedido cancelado. El stock no cambió.');}
 catch {throw new Error('La operación se completó, pero no pudimos actualizar la vista. Pulsa Actualizar.');}
}
async function init() {
 try {
  const {createClient}=await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.57.4/+esm');
  client=createClient(projectUrl,publishableKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:false,storageKey:'vantara-admin-session'}});
  const user=await requireAdmin(client);if(!user){location.replace('./login.html');return;}
  $('email').textContent=user.email;$('orders-content').hidden=false;
  client.auth.onAuthStateChange(event=>{if(event==='SIGNED_OUT'){$('orders-content').hidden=true;location.replace('./login.html');}});
  $('logout').addEventListener('click',()=>run(async()=>{const {error}=await client.auth.signOut({scope:'local'});if(error)throw error;location.replace('./login.html');}));
  if(detail) {
   $('refresh').addEventListener('click',()=>run(async()=>{await loadDetail();message('Pedido actualizado.');}));
   $('confirm-order').addEventListener('click',()=>run(()=>transition('confirm')));
   $('cancel-order').addEventListener('click',()=>run(()=>transition('cancel')));
   await run(async()=>{await loadDetail();message('Los importes y artículos corresponden al pedido registrado.');});
  } else {
   $('filters').addEventListener('submit',event=>{event.preventDefault();if(busy)return;filters={status:$('status').value,search:$('search').value.trim().replace(/[^a-z0-9-]/gi,'')};page=0;run(loadList);});
   $('previous').addEventListener('click',()=>{if(!busy&&page>0){page--;run(loadList);}});
   $('next').addEventListener('click',()=>{if(!busy&&hasNext){page++;run(loadList);}});
   await run(loadList);
  }
 } catch(error){message(error.message||'No se pudo iniciar el administrador. Recarga para reintentar.');}
}
init();
