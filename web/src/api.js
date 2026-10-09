// Thin fetch wrapper over the real VetCura backend. No mocks.
const API_URL = (import.meta.env.VITE_API_URL || 'http://localhost:3001').replace(/\/$/, '');

function token() {
  return localStorage.getItem('vetcura_token') || '';
}

export function setToken(t) {
  if (t) localStorage.setItem('vetcura_token', t);
  else localStorage.removeItem('vetcura_token');
}

export function euros(cents) {
  return `${(cents / 100).toFixed(2)} €`;
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
