import './styles.css';
import { api, setToken, currentUser } from './api.js';
import { DashboardView } from './views/dashboard.js';
import { AgendaView } from './views/agenda.js';
import { PatientsView, PatientDetailView } from './views/patients.js';
import { ConsultView } from './views/consult.js';
import { BillingView } from './views/billing.js';
import { PharmacyView } from './views/pharmacy.js';
import { OwnersView } from './views/owners.js';

const app = document.getElementById('app');

// Minimal original stroke icons (no emoji): sidebar + actions.
export const ICONS = {
  dashboard:
    '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/></svg>',
  consult:
    '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 7h16v10H4z"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M12 11v6M9 14h6"/></svg>',
  agenda:
    '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>',
  paw: '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><circle cx="7" cy="9" r="2"/><circle cx="12" cy="6.5" r="2"/><circle cx="17" cy="9" r="2"/><path d="M12 11c-3 0-5.5 2.4-5.5 5 0 1.7 1.2 3 2.9 3 1 0 1.7-.5 2.6-.5s1.6.5 2.6.5c1.7 0 2.9-1.3 2.9-3 0-2.6-2.5-5-5.5-5z"/></svg>',
  pharmacy:
    '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 3h6v4l4 12a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2L9 7V3z"/><path d="M7.5 14h9"/></svg>',
  user:
    '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.5-6.5 8-6.5s8 2.5 8 6.5"/></svg>',
  billing:
    '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 2h12v20l-3-2-3 2-3-2-3 2z"/><path d="M9 7h6M9 11h6"/></svg>',
  logout:
    '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/></svg>',
  search:
    '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>',
  download:
    '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3v12m0 0l-4-4m4 4l4-4M4 21h16"/></svg>',
  plus:
    '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>',
};

let meCache = null;

function LoginView(root) {
  // Mirrors Mockups/Login.svg. The mockup's anonymous "ID de Mascota"
  // button would expose clinical data without auth, so the second access
  // is the real clinic email login; the deviation is documented.
  root.innerHTML = `
    <div class="login-page"><div class="login-card">
      <div class="portal"><i></i>Portal Clientes VetCura</div><br/>
      <img class="hero" src="/img/pet-7.jpg" alt="Mascota VetCura" />
      <div><span class="pill24">ATENCIÓN 24/7</span></div>
      <div class="wordmark">Vet<span>Cura</span></div>
      <h2 class="headline">Cuidamos la salud de quienes más amas</h2>
      <p class="sub">Historial médico, citas prioritarias y control veterinario integral en la palma de tu mano.</p>
      <div class="trust"><span>Red Certificada</span>·<span>Datos Protegidos</span></div>
      <div class="divider">O CON TU CLÍNICA</div>
      <form id="login">
        <input name="email" type="email" placeholder="correo@clinica.local" required />
        <input name="password" type="password" placeholder="Contraseña" required />
        <button>Acceder</button>
      </form>
      <div id="msg"></div>
      <p class="terms">Acceso del personal y propietarios con cuenta de la clínica.</p>
    </div></div>`;
  root.querySelector('#login').onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    try {
      const r = await api('/auth/login', {
        method: 'POST',
        body: { email: fd.get('email'), password: fd.get('password') },
      });
      setToken(r.token, r.refreshToken);
      meCache = null;
      location.hash = '#/dashboard';
    } catch (err) {
      root.querySelector('#msg').innerHTML = `<div class="alert error">${err.message}</div>`;
    }
  };
}

const ROUTES = {
  '#/dashboard': { title: 'Panel', view: DashboardView, nav: 'dashboard', label: 'Dashboard de Eficiencia', icon: 'dashboard' },
  '#/consulta': { title: 'Consulta', view: ConsultView, nav: 'consult', label: 'Módulo de Consulta', icon: 'consult' },
  '#/agenda': { title: 'Agenda', view: AgendaView, nav: 'agenda', label: 'Agenda Semanal', icon: 'agenda' },
  '#/pacientes': { title: 'Pacientes', view: PatientsView, nav: 'patients', label: 'Pacientes e Historial', icon: 'paw' },
  '#/propietarios': { title: 'Propietarios', view: OwnersView, nav: 'owners', label: 'Propietarios', icon: 'user' },
  '#/farmacia': { title: 'Farmacia', view: PharmacyView, nav: 'pharmacy', label: 'Farmacia e Insumos', icon: 'pharmacy' },
  '#/facturacion': { title: 'Facturación', view: BillingView, nav: 'billing', label: 'Facturación', icon: 'billing' },
};

const NAV_ORDER = ['dashboard', 'consult', 'agenda', 'patients', 'owners', 'pharmacy', 'billing'];

async function router() {
  const hash = location.hash || '#/dashboard';
  if (!localStorage.getItem('vetcura_token')) {
    LoginView(app);
    return;
  }
  if (hash.startsWith('#/pacientes/')) {
    const id = hash.split('/')[2];
    await shell('patients');
    await PatientDetailView(app.querySelector('#view'), id);
    return;
  }
  const key = Object.keys(ROUTES).find((k) => hash.startsWith(k)) || '#/dashboard';
  const route = ROUTES[key];
  await shell(route.nav);
  // Patient search from the topbar lands here with a query.
  const q = new URLSearchParams(location.hash.split('?')[1] || '').get('q') || '';
  await route.view(app.querySelector('#view'), q);
}

async function shell(activeNav) {
  if (!meCache) {
    try {
      meCache = (await currentUser()).user;
    } catch {
      meCache = { display_name: 'Personal', role: 'staff' };
    }
  }
  const me = meCache;
  const initials = me.display_name.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase();
  const today = new Date().toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long' });
  const hash = location.hash || '#/dashboard';
  const links = NAV_ORDER.map((nav) => {
    const entry = Object.values(ROUTES).find((r) => r.nav === nav);
    const routeKey = Object.keys(ROUTES).find((k) => ROUTES[k].nav === nav);
    const on = activeNav === nav || (nav === 'patients' && hash.startsWith('#/pacientes/'));
    return `<a href="${routeKey}" class="${on ? 'active' : ''}">${ICONS[entry.icon]}${entry.label}</a>`;
  }).join('');
  app.innerHTML = `
    <div class="layout">
      <nav class="sidebar">
        <div class="brand">Vet<span>Cura</span><small>CLINICAL EHR</small></div>
        <div class="section">OPERACIONES</div>
        ${links}
        <div class="status-card"><span class="dot" id="api-dot"></span><span id="api-text">Servicio Urgencias · verificando…</span></div>
        <button class="logout" id="logout">${ICONS.logout}Cerrar sesión</button>
      </nav>
      <div class="main">
        <div class="topbar">
          <div class="search">${ICONS.search}<input id="top-search" placeholder="Buscar paciente por nombre…" /></div>
          <span class="date-pill">${today}</span>
          <div class="user-chip"><div class="avatar">${initials}</div><div>${me.display_name}<small>${me.role}</small></div></div>
        </div>
        <main class="content" id="view"></main>
      </div>
    </div>`;
  app.querySelector('#logout').onclick = () => {
    setToken(null);
    meCache = null;
    location.hash = '#/dashboard';
    router();
  };
  const search = app.querySelector('#top-search');
  search.onkeydown = (e) => {
    if (e.key === 'Enter' && search.value.trim()) {
      location.hash = `#/pacientes?q=${encodeURIComponent(search.value.trim())}`;
    }
  };
  // Honest connectivity indicator: the dot reflects the real /health.
  try {
    await api('/health');
    app.querySelector('#api-text').textContent = 'Servicio Urgencias · En línea 24/7';
  } catch {
    const dot = app.querySelector('#api-dot');
    if (dot) dot.classList.add('off');
    const txt = app.querySelector('#api-text');
    if (txt) txt.textContent = 'API no alcanzable';
  }
}

window.addEventListener('hashchange', router);
window.addEventListener('vetcura:logout', () => {
  meCache = null;
  location.hash = '#/dashboard';
  router();
});
router();
