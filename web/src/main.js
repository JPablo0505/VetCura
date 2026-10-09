import './styles.css';
import { api, setToken } from './api.js';
import { DashboardView } from './views/dashboard.js';
import { AgendaView } from './views/agenda.js';
import { PatientsView, PatientDetailView } from './views/patients.js';
import { BillingView } from './views/billing.js';

const app = document.getElementById('app');

function LoginView(root) {
  root.innerHTML = `
    <div class="login-wrap">
      <h1>VetCura <span style="color:var(--secondary)">·</span> Clínica</h1>
      <p style="color:var(--muted)">Acceso del personal con correo y contraseña.</p>
      <form id="login">
        <input name="email" type="email" placeholder="correo@clinica.local" required />
        <input name="password" type="password" placeholder="Contraseña" required />
        <button>Iniciar sesión</button>
      </form>
      <div id="msg"></div>
    </div>`;
  root.querySelector('#login').onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    try {
      const r = await api('/auth/login', {
        method: 'POST',
        body: { email: fd.get('email'), password: fd.get('password') },
      });
      setToken(r.token);
      location.hash = '#/dashboard';
    } catch (err) {
      root.querySelector('#msg').innerHTML = `<div class="alert error">${err.message}</div>`;
    }
  };
}

const ROUTES = {
  '#/dashboard': { title: 'Panel', view: DashboardView },
  '#/agenda': { title: 'Agenda', view: AgendaView },
  '#/pacientes': { title: 'Pacientes', view: PatientsView },
  '#/facturacion': { title: 'Facturación', view: BillingView },
};

async function router() {
  const hash = location.hash || '#/dashboard';
  if (!localStorage.getItem('vetcura_token')) {
    LoginView(app);
    return;
  }
  if (hash.startsWith('#/pacientes/')) {
    const id = hash.split('/')[2];
    app.innerHTML = `<div class="layout"><nav class="sidebar"></nav><main class="content" id="view"></main></div>`;
    paintSidebar();
    await PatientDetailView(app.querySelector('#view'), id);
    return;
  }
  const route = ROUTES[hash] || ROUTES['#/dashboard'];
  app.innerHTML = `<div class="layout"><nav class="sidebar"></nav><main class="content" id="view"></main></div>`;
  paintSidebar();
  await route.view(app.querySelector('#view'));
}

function paintSidebar() {
  const nav = app.querySelector('.sidebar');
  const hash = location.hash || '#/dashboard';
  nav.innerHTML = `
    <div class="brand">VetCura<span>·</span></div>
    <a href="#/dashboard" class="${hash.startsWith('#/dashboard') ? 'active' : ''}">Panel</a>
    <a href="#/agenda" class="${hash.startsWith('#/agenda') ? 'active' : ''}">Agenda</a>
    <a href="#/pacientes" class="${hash.startsWith('#/pacientes') ? 'active' : ''}">Pacientes</a>
    <a href="#/facturacion" class="${hash.startsWith('#/facturacion') ? 'active' : ''}">Facturación</a>
    <button class="logout" id="logout">Cerrar sesión</button>`;
  nav.querySelector('#logout').onclick = () => {
    setToken(null);
    location.hash = '#/dashboard';
    router();
  };
}

window.addEventListener('hashchange', router);
router();
