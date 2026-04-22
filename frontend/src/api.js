/**
 * Tiny API wrapper around fetch().
 *
 * Responsibilities:
 *   1. Attach the JWT token from localStorage to every request
 *   2. Parse JSON responses automatically
 *   3. Throw a proper Error (with status + detail) on 4xx/5xx
 *   4. Let pages just write:   api.get('/reports'), api.post('/auth/login', body)
 *
 * The backend is proxied via Vite, so we use relative /api URLs —
 * no hardcoded localhost:8000 anywhere.
 */

const BASE = '/api/v1';

// ---------- Token helpers (localStorage) ----------

export const tokenStore = {
  get: () => localStorage.getItem('visiverify_token'),
  set: (t) => localStorage.setItem('visiverify_token', t),
  clear: () => localStorage.removeItem('visiverify_token'),
};

export const userStore = {
  get: () => {
    const raw = localStorage.getItem('visiverify_user');
    return raw ? JSON.parse(raw) : null;
  },
  set: (u) => localStorage.setItem('visiverify_user', JSON.stringify(u)),
  clear: () => localStorage.removeItem('visiverify_user'),
};


// ---------- Core request helper ----------

async function request(method, path, { body, isForm = false } = {}) {
  const headers = {};
  const token = tokenStore.get();
  if (token) headers['Authorization'] = `Bearer ${token}`;

  let payload;
  if (isForm) {
    // For file uploads — let the browser set multipart Content-Type itself
    payload = body;
  } else if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: payload,
  });

  // Attempt to parse JSON regardless of status so we can read error detail
  let data = null;
  const text = await res.text();
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }

  if (!res.ok) {
    const msg =
      (data && typeof data === 'object' && data.detail) ||
      (typeof data === 'string' && data) ||
      `Request failed: ${res.status} ${res.statusText}`;
    const err = new Error(msg);
    err.status = res.status;
    err.data = data;
    throw err;
  }

  return data;
}


// ---------- Public API ----------

export const api = {
  get:  (path)       => request('GET',   path),
  post: (path, body) => request('POST',  path, { body }),
  patch:(path, body) => request('PATCH', path, { body }),
  del:  (path)       => request('DELETE', path),

  // Separate helper for file uploads
  upload: (path, file) => {
    const form = new FormData();
    form.append('file', file);
    return request('POST', path, { body: form, isForm: true });
  },
};