// Thin fetch wrapper over the real VetCura backend. No mocks.
const API_URL = (import.meta.env.VITE_API_URL || 'http://localhost:3001').replace(/\/$/, '');
export { API_URL };

export function token() {
  return localStorage.getItem('vetcura_token') || '';
}

function refreshToken() {
  return localStorage.getItem('vetcura_refresh') || '';
}

export function setToken(t, r) {
  if (t) localStorage.setItem('vetcura_token', t);
  else localStorage.removeItem('vetcura_token');
  if (r) localStorage.setItem('vetcura_refresh', r);
  else if (!t) localStorage.removeItem('vetcura_refresh');
}

function forceLogin() {
  localStorage.removeItem('vetcura_token');
  localStorage.removeItem('vetcura_refresh');
  window.dispatchEvent(new Event('vetcura:logout'));
}

// User-facing messages: never expose technical backend text.
function friendlyMessage(status, code) {
  if (status === 401) return 'Tu sesión venció. Volvé a entrar.';
  if (status === 403) return 'No tenés permiso para esa acción.';
  if (status === 404) return 'No se encontró lo solicitado.';
  if (code === 'invalid_credentials') return 'Correo o contraseña incorrectos.';
  if (code === 'validation_error') return 'Revisá los datos ingresados.';
  if (code === 'conflict') return 'Ese registro ya existe.';
  if (code === 'invalid_transition') return 'Ese cambio de estado no está permitido.';
  if (code === 'rate_limited') return 'Demasiados intentos. Esperá un momento.';
  return 'Ocurrió un problema. Intentá de nuevo.';
}

// Colombian pesos without decimals ($ 6.545). Amounts are stored as
// integer minor units and displayed rounded to whole pesos.
export function cop(cents) {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  }).format(Math.round(cents / 100));
}

// Deterministic decorative avatar from the extracted mockup photos.
// Only pet-only shots are used (pet-1/-7/-8/-11); staff portraits from
// the mockups are never shown as patients. Cats get the siamese shot.
const PET_PHOTOS = [1, 7, 11];
export function petPhoto(id, species) {
  if ((species || '').toLowerCase().startsWith('cat')) return '/img/pet-8.jpg';
  return `/img/pet-${PET_PHOTOS[Number(id) % PET_PHOTOS.length]}.jpg`;
}

export async function currentUser() {
  return api('/auth/me');
}

export async function api(path, { method = 'GET', body, _retried } = {}) {
  // FormData (photo uploads) must travel as multipart: the browser sets
  // the boundary itself, so no Content-Type and no JSON encoding here.
  const isForm = typeof FormData !== 'undefined' && body instanceof FormData;
  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers: {
      ...(isForm ? {} : { 'Content-Type': 'application/json' }),
      ...(token() ? { Authorization: `Bearer ${token()}` } : {}),
    },
    body: !body ? undefined : isForm ? body : JSON.stringify(body),
  });
  // Silent renewal: one retry with a rotated pair before giving up.
  // Auth endpoints never retry (they mint the tokens themselves).
  if (res.status === 401 && !_retried && !path.startsWith('/auth/') && refreshToken()) {
    try {
      const rr = await fetch(`${API_URL}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: refreshToken() }),
      });
      if (rr.ok) {
        const pair = await rr.json();
        setToken(pair.token, pair.refreshToken);
        return api(path, { method, body, _retried: true });
      }
    } catch {
      // fall through to logout below
    }
    forceLogin();
  }
  let json = null;
  try {
    json = await res.json();
  } catch {
    json = null;
  }
  if (!res.ok) {
    if (res.status === 401 && !_retried && !path.startsWith('/auth/')) forceLogin();
    const code = json?.error?.code || 'http_error';
    if (json?.error) console.error(`API ${res.status} [${code}]`, json.error.message);
    throw new Error(friendlyMessage(res.status, code));
  }
  return json;
}
