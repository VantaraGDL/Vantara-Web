import { getPublicVariants } from './catalog-logic.js?v=collection-cart-2';

export function initialPackageSelection(pack) {
  const selection = new Map();
  for (const item of pack.items) {
    if (!item.product) continue;
    const variants = getPublicVariants(item.product);
    // Same automatic selection as the product page: only a single Unitalla.
    if (variants.length === 1 && variants[0].size === 'Única' && variants[0].stock > 0) {
      selection.set(item.productId, variants[0].id);
    }
  }
  return selection;
}

export function validatePackageSelection(pack, selection) {
  const unavailable = [], missing = [], lines = [];
  for (const item of pack.items) {
    const variants = item.product ? getPublicVariants(item.product) : [];
    if (!variants.some(v => v.stock > 0)) { unavailable.push(item.productId); continue; }
    const variant = variants.find(v => v.id === selection.get(item.productId) && v.stock > 0);
    if (!variant) { missing.push(item.productId); continue; }
    lines.push({ product_id: item.productId, variant_id: variant.id, size: variant.size, quantity: 1 });
  }
  return { valid: pack.items.length >= 2 && pack.pricing.complete && !unavailable.length && !missing.length,
    unavailable, missing, lines, completePrice: pack.pricing.complete };
}
