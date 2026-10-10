// Thin fetch wrapper over the real VetCura backend. No mocks.
const API_URL = (import.meta.env.VITE_API_URL || 'http://localhost:3001').replace(/\/$/, '');

function token() {
  return localStorage.getItem('vetcura_token') || '';
}

export function setToken(t) {
  if (t) localStorage.setItem('vetcura_token', t);
  else localStorage.removeItem('vetcura_token');
}

// Chilean pesos without decimals, as in the mockups ($3.485.000).
export function clp(cents) {
  return new Intl.NumberFormat('es-CL', {
    style: 'currency',
    currency: 'CLP',
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

export async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token() ? { Authorization: `Bearer ${token()}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try {
    json = await res.json();
  } catch {
    json = null;
  }
  if (!res.ok) {
    const err = new Error(json?.error?.message || `HTTP ${res.status}`);
    err.code = json?.error?.code || 'http_error';
    err.status = res.status;
    throw err;
  }
  return json;
}
