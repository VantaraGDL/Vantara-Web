import {cartUnits} from './cart.js?v=production-fixes-1';
function update(){const count=cartUnits();document.querySelectorAll('[data-cart-link]').forEach(a=>{a.setAttribute('aria-label','Carrito, '+count+' unidades');a.querySelector('[data-cart-count]').textContent=count;});}
window.addEventListener('vantara-cart-change',update);window.addEventListener('storage',update);window.addEventListener('pageshow',update);update();
