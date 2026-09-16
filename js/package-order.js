import { validatePackageSelection } from './package-selection.js?v=packages-public-1';

export function samePackageComposition(saved, pack) {
  const ids = list => list.map(i => Number(i.product_id ?? i.productId)).sort((a,b) => a-b).join(',');
  return ids(saved.items) === ids(pack.items);
}

export function packageOrderItem(pack, selection) {
  if (!pack) throw new Error('Este paquete no está disponible.');
  const state = validatePackageSelection(pack, selection);
  const problem = [...state.unavailable, ...state.missing][0];
  if (!state.valid) {
    const name = pack.items.find(i => i.productId === problem)?.product?.name || 'Un producto del paquete';
    throw new Error(problem ? `${name}: revisa la talla seleccionada.` : 'No se pudo confirmar el precio del paquete. Reintenta.');
  }
  if (pack.items.some(i => !i.product?.published)) throw new Error('Una prenda del paquete no está disponible.');
  return {
    type: 'package', package_id: pack.id, package_name: pack.name, quantity: 1,
    discount_percent: pack.discountPercent, image_path: pack.imagePath || null,
    original_subtotal: pack.pricing.originalSubtotal, final_price: pack.pricing.finalTotal,
    items: state.lines.map(line => {
      const p = pack.items.find(i => i.productId === line.product_id).product;
      return { ...line, product_name: p.name || p.model, brand: p.brand, original_price: p.price };
    })
  };
}

// Used by both the cart block and the shared confirmation/WhatsApp presentation.
export function packagePriceLines(item, money) {
  return [
    `Subtotal original: ${money(item.original_subtotal)}`,
    `Descuento del paquete (${item.discount_percent}%): −${money(item.original_subtotal-item.final_price)}`,
    `Total paquete: ${money(item.final_price)}`
  ];
}
