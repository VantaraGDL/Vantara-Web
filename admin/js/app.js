import { projectUrl, publishableKey } from './config.js';
import { requireAdmin, loadStats } from './auth.js';

const message = document.querySelector('#message');
const form = document.querySelector('form');
const dashboard = document.querySelector('#dashboard');
const say = text => { message.textContent = text; };
const goLogin = () => location.replace('./login.html');
let client;
let checking = false;

async function check() {
  if (checking) return;
  checking = true;
  if (dashboard) dashboard.hidden = true;
  try {
    const user = await requireAdmin(client);
    if (!user) { if (dashboard) goLogin(); return; }
    if (form) { location.replace('./index.html'); return; }
    const stats = await loadStats(client);
    document.querySelector('#email').textContent = user.email;
    for (const [key, value] of Object.entries(stats)) document.querySelector('#' + key).textContent = value;
    dashboard.hidden = false;
    say('');
  } catch (error) { say(error.message); }
  finally { checking = false; }
}

async function boot() {
  if (!publishableKey.startsWith('sb_publishable_')) {
    say('Falta configurar la clave pública de Supabase para habilitar el acceso.'); return;
  }
  try {
    const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.57.4/+esm');
    client = createClient(projectUrl, publishableKey, { auth: {
      persistSession: true, autoRefreshToken: true, detectSessionInUrl: false,
      storageKey: 'vantara-admin-session'
    }});
    client.auth.onAuthStateChange(event => {
      if (event === 'SIGNED_OUT' && dashboard) { dashboard.hidden = true; goLogin(); }
    });
    if (form) {
      const button = form.querySelector('button');
      button.disabled = false;
      form.addEventListener('submit', async event => {
        event.preventDefault(); button.disabled = true; form.setAttribute('aria-busy', 'true'); say('Iniciando sesión…');
        try {
          const { error } = await client.auth.signInWithPassword({
            email: form.elements.email.value.trim(), password: form.elements.password.value
          });
          form.elements.password.value = '';
          if (error) { say('No se pudo iniciar sesión. Revisa tus credenciales y tu conexión e intenta de nuevo.'); return; }
          const user = await requireAdmin(client);
          if (!user) { say('La sesión no es válida. Vuelve a iniciar sesión.'); return; }
          location.replace('./index.html');
        } catch (error) { say(error.message || 'No se pudo conectar. Intenta de nuevo.'); }
        finally { button.disabled = false; form.removeAttribute('aria-busy'); }
      });
    }
    document.querySelector('#logout')?.addEventListener('click', async event => {
      event.target.disabled = true;
      const { error } = await client.auth.signOut({ scope: 'local' });
      if (error) { say('No se pudo cerrar sesión. Intenta de nuevo.'); event.target.disabled = false; }
      else goLogin();
    });
    document.querySelector('#retry')?.addEventListener('click', check);
    window.addEventListener('pageshow', event => { if (event.persisted) check(); });
    document.addEventListener('visibilitychange', () => { if (!document.hidden) check(); });
    say(''); await check();
  } catch { say('No se pudo conectar con Supabase. Comprueba tu conexión y recarga la página.'); }
}
boot();
