/**
 * Persistent KPI history for the home-screen dashboard.
 *
 * Every finished session (AI or offline practice) appends a sanitized record
 * to localStorage so progress survives refreshes. Capped at the 20 most
 * recent sessions. All reads/writes are defensive: corrupt data yields an
 * empty list, never a crash.
 */

const STORAGE_KEY = 'ryanair-agent-simulator.session-history';
const MAX_SESSIONS = 20;

const clamp100 = (v) => Math.min(100, Math.max(0, v));

const asNumber = (v, fallback) => {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
};

const asInt = (v, fallback) => Math.max(0, Math.floor(asNumber(v, fallback)));

const sanitizeSession = (s) => ({
  at: asNumber(s.at, Date.now()),
  mode: s.mode === 'practice' ? 'practice' : 'ai',
  grade: typeof s.grade === 'string' && s.grade ? s.grade : '-',
  score: clamp100(asNumber(s.score, 0)),
  sop: clamp100(asNumber(s.sop, 0)),
  communication: clamp100(asNumber(s.communication, 0)),
  timeSla: clamp100(asNumber(s.timeSla, 0)),
  handlingTime: typeof s.handlingTime === 'string' ? s.handlingTime : '',
  violations: asInt(s.violations, 0),
  holds: asInt(s.holds, 0),
  wpm: asInt(s.wpm, 0),
  sentiment: typeof s.sentiment === 'string' && s.sentiment ? s.sentiment : 'Neutral',
  title: typeof s.title === 'string' && s.title ? s.title : 'Untitled case'
});

const loadSessionHistory = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.slice(0, MAX_SESSIONS).map(sanitizeSession);
  } catch {
    return [];
  }
};

const appendSession = (list, session) => [session, ...list].slice(0, MAX_SESSIONS);

const saveSessionHistory = (list) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list.slice(0, MAX_SESSIONS)));
  } catch {
    /* storage unavailable (private mode / quota) - history simply not saved */
  }
};

const clearSessionHistory = () => {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
};

export { STORAGE_KEY, MAX_SESSIONS, loadSessionHistory, appendSession, saveSessionHistory, clearSessionHistory, sanitizeSession };