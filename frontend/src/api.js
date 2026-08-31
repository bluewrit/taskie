// Thin API client for the Taskie backend (proxied at /api by Vite).
// Session tokens live in localStorage; every request carries the bearer token.
const TOKEN_KEY = 'taskie_token';

let token = localStorage.getItem(TOKEN_KEY) || null;

export function setToken(t) {
  token = t;
  if (t) localStorage.setItem(TOKEN_KEY, t);
  else localStorage.removeItem(TOKEN_KEY);
}
export function getToken() { return token; }

/** Media/download URLs are loaded by <img>/<video>/<iframe>/<a>, which cannot
 *  set headers — those endpoints accept the session token as a query param. */
export function mediaUrl(url) {
  if (!url || !token) return url;
  return `${url}${url.includes('?') ? '&' : '?'}token=${encodeURIComponent(token)}`;
}

// Auth travels on THREE channels simultaneously because the sandbox preview
// is hostile to the standard ones: the proxy strips Authorization headers
// and cross-site iframes block cookie delivery. The ?token= query param
// always survives, so it is always appended when we hold a token.
function withToken(url) {
  if (!token) return url;
  return `${url}${url.includes('?') ? '&' : '?'}token=${encodeURIComponent(token)}`;
}

function authHeaders(extra) {
  return { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...extra };
}

async function handle(res) {
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = await res.json();
      detail = typeof body.detail === 'string' ? body.detail : JSON.stringify(body.detail ?? body);
    } catch { /* ignore */ }
    if (res.status === 401 && !res.url.includes('/api/auth/')) {
      setToken(null);
      window.dispatchEvent(new Event('taskie:unauthorized'));
    }
    throw new Error(detail);
  }
  if (res.status === 204) return null;
  return res.json();
}

const get = (url) => fetch(withToken(url), { headers: authHeaders(), credentials: 'same-origin' }).then(handle);
const send = (url, method, data) => fetch(withToken(url), {
  method,
  credentials: 'same-origin',
  headers: authHeaders({ 'Content-Type': 'application/json' }),
  body: data === undefined ? undefined : JSON.stringify(data),
}).then(handle);

export const api = {
  // ---- auth
  register: (data) => send('/api/auth/register', 'POST', data),
  login: (data) => send('/api/auth/login', 'POST', data),
  logout: () => send('/api/auth/logout', 'POST'),
  me: () => get('/api/auth/me'),

  // ---- team
  listUsers: () => get('/api/users'),
  createUser: (data) => send('/api/users', 'POST', data),
  deleteUser: (id) => send(`/api/users/${id}`, 'DELETE'),
  userStats: () => get('/api/users/stats'),

  // ---- workspace
  health: () => fetch('/api/health').then(handle),
  listProjects: () => get('/api/projects'),
  createProject: (data) => send('/api/projects', 'POST', data),
  deleteProject: (id) => send(`/api/projects/${id}`, 'DELETE'),

  // ---- project hub (shared files + chat)
  projectFiles: (id) => get(`/api/projects/${id}/files`),
  uploadProjectFile(projectId, file, onProgress) {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      const form = new FormData();
      form.append('file', file);
      xhr.open('POST', withToken(`/api/projects/${projectId}/files`));
      xhr.setRequestHeader('Authorization', `Bearer ${token}`);
      xhr.upload.onprogress = (e) => e.lengthComputable && onProgress?.(e.loaded / e.total);
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) resolve(JSON.parse(xhr.responseText));
        else reject(new Error(`Upload failed (${xhr.status})`));
      };
      xhr.onerror = () => reject(new Error('Upload failed (network)'));
      xhr.send(form);
    });
  },
  projectMessages: (id, after = 0) => get(`/api/projects/${id}/messages?after=${after}`),
  postProjectMessage: (id, body) => send(`/api/projects/${id}/messages`, 'POST', { body }),

  listTasks: (params = {}) => {
    const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== '' && v != null && v !== false)).toString();
    return get(`/api/tasks${qs ? `?${qs}` : ''}`);
  },
  createTask: (data) => send('/api/tasks', 'POST', data),
  updateTask: (id, data) => send(`/api/tasks/${id}`, 'PUT', data),
  completeTask: (id) => send(`/api/tasks/${id}/complete`, 'POST'),
  deleteTask: (id) => send(`/api/tasks/${id}`, 'DELETE'),

  deleteFile: (id) => send(`/api/files/${id}`, 'DELETE'),
  previewFile: (id) => get(`/api/files/${id}/preview`),

  // file upload with progress (XHR exposes upload progress, fetch does not)
  uploadFile(taskId, file, onProgress) {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      const form = new FormData();
      form.append('file', file);
      xhr.open('POST', withToken(`/api/tasks/${taskId}/files`));
      xhr.setRequestHeader('Authorization', `Bearer ${token}`);
      xhr.upload.onprogress = (e) => e.lengthComputable && onProgress?.(e.loaded / e.total);
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) resolve(JSON.parse(xhr.responseText));
        else if (xhr.status === 401) { setToken(null); window.dispatchEvent(new Event('taskie:unauthorized')); reject(new Error('Session expired')); }
        else reject(new Error(`Upload failed (${xhr.status})`));
      };
      xhr.onerror = () => reject(new Error('Upload failed (network)'));
      xhr.send(form);
    });
  },

  // ---- agent
  agentChat: (message) => send('/api/agent/chat', 'POST', { message }),
  agentRecommendations: (apply = false) => get(`/api/agent/recommendations${apply ? '?apply=true' : ''}`),
  agentPlan: (horizon = 7, capacity, scope = 'mine') => get(`/api/agent/plan?horizon=${horizon}&scope=${scope}${capacity ? `&capacity_minutes=${capacity}` : ''}`),
  agentEvaluation: (scope = 'mine') => get(`/api/agent/evaluation?scope=${scope}`),
  agentActions: () => get('/api/agent/actions'),
  agentStatus: () => get('/api/agent/status'),
};

export const STATUS_LABELS = {
  todo: 'To do',
  in_progress: 'In progress',
  blocked: 'Blocked',
  done: 'Done',
};

export const PRIORITY_ORDER = ['critical', 'high', 'medium', 'low'];

export function fmtBytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export function fmtDate(iso) {
  if (!iso) return '';
  return new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function initials(user) {
  const src = user?.full_name || user?.username || '?';
  return src.split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();
}
