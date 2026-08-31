// jsdom mount test for the production bundle
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
  url: 'http://localhost:5173/',
  pretendToBeVisual: true,
});
const w = dom.window;
for (const k of ['window', 'document', 'navigator', 'localStorage', 'HTMLElement', 'Element', 'Node',
                 'Event', 'CustomEvent', 'MouseEvent', 'KeyboardEvent', 'getComputedStyle',
                 'requestAnimationFrame', 'cancelAnimationFrame', 'HTMLInputElement',
                 'HTMLFormElement', 'FormData', 'Blob', 'matchMedia', 'DOMParser', 'MutationObserver', 'NodeFilter', 'Text', 'SVGElement', 'CSS', 'Image']) {
  if (w[k] !== undefined) {
    try { globalThis[k] = w[k]; }
    catch { Object.defineProperty(globalThis, k, { value: w[k], configurable: true, writable: true }); }
  }
}
globalThis.requestAnimationFrame = globalThis.requestAnimationFrame || ((cb) => setTimeout(() => cb(Date.now()), 16));
w.localStorage.setItem('taskie_token', 'fake-token');

const errors = [];
console.error = (...a) => errors.push('console.error: ' + a.map(String).join(' ').slice(0, 160));
w.addEventListener('error', (e) => errors.push('window.error: ' + e.message));

const user = { id: 1, username: 'demo', full_name: 'Demo User', email: '', color: '#0a84ff',
               role: 'admin', created_at: '2026-08-30T00:00:00' };
const task = { id: 1, title: 'T', description: '', project_id: 1, assignee_id: 1, status: 'todo',
               priority: 'high', due_date: null, estimated_minutes: 60, progress: 0, tags: '',
               agent_score: 55, agent_note: '', created_at: '2026-08-30T00:00:00',
               updated_at: '2026-08-30T00:00:00', completed_at: null, assignee: user,
               project: { id: 1, name: 'P', description: '', color: '#0a84ff' }, files: [] };
const json = (obj, status = 200) => ({ ok: status < 400, status,
  json: async () => obj, text: async () => JSON.stringify(obj) });

globalThis.fetch = async (url) => {
  const u = String(url);
  if (u.includes('/api/auth/me')) return json(user);
  if (u.includes('/api/tasks')) return json([task]);
  if (u.includes('/api/projects')) return json([task.project]);
  if (u.includes('/api/users')) return json([user]);
  if (u.includes('/api/agent/recommendations')) return json({ recommendations: [] });
  if (u.includes('/api/agent/evaluation')) return json({
    grade: 'A', overall_score: 92,
    metrics: { total_tasks: 4, completed: 2, on_time_rate: 0.9, avg_cycle_hours: 5, open_tasks: 2 },
    throughput: Array.from({ length: 14 }, (_, i) => ({ date: `2026-08-${17 + i}`, completed: i % 3 })),
    strengths: [], watchouts: [] });
  return json({ detail: 'not stubbed: ' + u }, 404);
};

await import(process.env.BUNDLE_PATH);
await new Promise((r) => setTimeout(r, 900));

const html = w.document.getElementById('root').innerHTML;
console.log('--- RESULT ---');
console.log('root HTML length:', html.length);
console.log('auth form present:', html.includes('auth-card'));
console.log('app shell present:', html.includes('sidebar') || html.includes('topbar'));
console.log('crash screen present:', html.includes('Something went wrong'));
console.log('ios-switch:', html.includes('ios-switch'), '| analytics-nav:', html.includes('Analytics'),
            '| new-project-btn:', html.includes('new-project-btn'));
console.log('errors captured:', errors.length);
for (const e of errors.slice(0, 4)) console.log('  •', e);
