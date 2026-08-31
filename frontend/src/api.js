// Thin API client for the Taskie backend (proxied at /api by Vite).
const JSON_HEADERS = { 'Content-Type': 'application/json' };

async function handle(res) {
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = await res.json();
      detail = body.detail || JSON.stringify(body);
    } catch { /* ignore */ }
    throw new Error(`${res.status}: ${detail}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

export const api = {
  health: () => fetch('/api/health').then(handle),

  listProjects: () => fetch('/api/projects').then(handle),
  createProject: (data) => fetch('/api/projects', { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify(data) }).then(handle),
  deleteProject: (id) => fetch(`/api/projects/${id}`, { method: 'DELETE' }).then(handle),

  listTasks: (params = {}) => {
    const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== '' && v != null)).toString();
    return fetch(`/api/tasks${qs ? `?${qs}` : ''}`).then(handle);
  },
  createTask: (data) => fetch('/api/tasks', { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify(data) }).then(handle),
  updateTask: (id, data) => fetch(`/api/tasks/${id}`, { method: 'PUT', headers: JSON_HEADERS, body: JSON.stringify(data) }).then(handle),
  completeTask: (id) => fetch(`/api/tasks/${id}/complete`, { method: 'POST' }).then(handle),
  deleteTask: (id) => fetch(`/api/tasks/${id}`, { method: 'DELETE' }).then(handle),

  deleteFile: (id) => fetch(`/api/files/${id}`, { method: 'DELETE' }).then(handle),
  previewFile: (id) => fetch(`/api/files/${id}/preview`).then(handle),

  // file upload with progress (XHR exposes upload progress, fetch does not)
  uploadFile(taskId, file, onProgress) {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      const form = new FormData();
      form.append('file', file);
      xhr.open('POST', `/api/tasks/${taskId}/files`);
      xhr.upload.onprogress = (e) => e.lengthComputable && onProgress?.(e.loaded / e.total);
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) resolve(JSON.parse(xhr.responseText));
        else reject(new Error(`Upload failed (${xhr.status})`));
      };
      xhr.onerror = () => reject(new Error('Upload failed (network)'));
      xhr.send(form);
    });
  },

  agentChat: (message) => fetch('/api/agent/chat', { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify({ message }) }).then(handle),
  agentRecommendations: (apply = false) => fetch(`/api/agent/recommendations${apply ? '?apply=true' : ''}`).then(handle),
  agentPlan: (horizon = 7, capacity) => fetch(`/api/agent/plan?horizon=${horizon}${capacity ? `&capacity_minutes=${capacity}` : ''}`).then(handle),
  agentEvaluation: () => fetch('/api/agent/evaluation').then(handle),
  agentActions: () => fetch('/api/agent/actions').then(handle),
  agentStatus: () => fetch('/api/agent/status').then(handle),
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
