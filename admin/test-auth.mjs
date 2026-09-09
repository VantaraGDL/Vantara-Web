import assert from 'node:assert/strict';
import { requireAdmin, loadStats } from './js/auth.js';
let signedOut = false;
function mock(user, member, error = null) {
  return { auth: { getUser: async () => ({ data: { user }, error: null }),
    signOut: async () => { signedOut = true; return {}; } },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: member, error }) }) }) }) };
}
assert.equal(await requireAdmin(mock(null, null)), null);
await assert.rejects(requireAdmin(mock({id:'other'}, null)), /no tiene acceso/);
assert.equal(signedOut, true);
assert.equal((await requireAdmin(mock({id:'admin'}, {user_id:'admin'}))).id, 'admin');
assert.equal((await requireAdmin(mock({id:'admin'}, {user_id:'admin'}))).id, 'admin');
await assert.rejects(requireAdmin(mock({id:'admin'}, null, {message:'offline'})), /verificar/);
const data = [{ published:false, product_variants:[{stock:null}] },{ published:true, product_variants:[{stock:0}] },{published:false,product_variants:[]}];
const statsClient = {from:()=>({select:()=>({order:()=>({range:async()=>({data,error:null})})})})};
assert.deepEqual(await loadStats(statsClient), {total:3,published:1,hidden:2,pending:2});
console.log('PASS: sin sesión, no admin y cierre, admin, comprobación repetida, error de red, conteo NULL distinto de cero.');
