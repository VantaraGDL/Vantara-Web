export async function requireAdmin(client) {
  const { data: { user }, error } = await client.auth.getUser();
  if (error || !user) return null;
  const membership = await client.from('catalog_admins').select('user_id').eq('user_id', user.id).maybeSingle();
  if (membership.error) throw new Error('No se pudo verificar tu acceso. Intenta de nuevo.');
  if (!membership.data) {
    await client.auth.signOut({ scope: 'local' });
    throw new Error('Tu cuenta no tiene acceso al catálogo administrador.');
  }
  return user;
}

export async function loadStats(client) {
  const rows = [];
  // Paginación para no depender del límite de respuesta de Supabase.
  for (let start = 0; ; start += 500) {
    const { data, error } = await client.from('products').select('id,published,product_variants(stock)').order('id').range(start, start + 499);
    if (error) throw new Error('No se pudo cargar el resumen. Intenta de nuevo.');
    rows.push(...data);
    if (data.length < 500) break;
  }
  return { total: rows.length, published: rows.filter(p => p.published).length,
    hidden: rows.filter(p => !p.published).length,
    pending: rows.filter(p => !p.product_variants.length || p.product_variants.some(v => v.stock === null)).length };
}
