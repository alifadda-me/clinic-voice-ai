/**
 * Manual production test console — mirrors docs/TEST_SCENARIOS.md
 */

const STORAGE_KEY = 'clinic-voice-ai-test-console';

const DEFAULT_BASE =
  'https://clinic-voice-ai-production-3202.up.railway.app';

const LEVELS = [
  { id: 0, label: 'Level 0 — Smoke' },
  { id: 1, label: 'Level 1 — Discovery' },
  { id: 2, label: 'Level 2 — Auth' },
  { id: 3, label: 'Level 3 — Preferences' },
  { id: 4, label: 'Level 4 — Booking' },
  { id: 5, label: 'Level 5 — Cancel / reschedule' },
  { id: 6, label: 'Level 6 — Security' },
];

const SCENARIOS = [
  {
    level: 0,
    id: 'S0.1',
    title: 'Liveness',
    hint: 'GET /health → status ok',
    kind: 'request',
    method: 'GET',
    path: '/health',
  },
  {
    level: 0,
    id: 'S0.2',
    title: 'Readiness',
    hint: 'GET /ready → postgres + redis',
    kind: 'request',
    method: 'GET',
    path: '/ready',
  },
  {
    level: 1,
    id: 'S1.1',
    title: 'New conversation',
    hint: 'POST /v1/conversations',
    kind: 'newConversation',
  },
  {
    level: 1,
    id: 'S1.2',
    title: 'Arabic doctor search',
    hint: 'Anonymous — cardiologist',
    kind: 'chat',
    message: 'عايز دكتور قلب',
    withJwt: false,
    expect: 'authenticated false, search_doctors',
  },
  {
    level: 1,
    id: 'S1.3',
    title: 'English dermatology search',
    kind: 'chat',
    message: 'What dermatology doctors do you have?',
    withJwt: false,
  },
  {
    level: 1,
    id: 'S1.4',
    title: 'List specialties (Arabic)',
    kind: 'chat',
    message: 'إيه التخصصات المتاحة؟',
    withJwt: false,
  },
  {
    level: 1,
    id: 'S1.5',
    title: 'Availability (Arabic)',
    hint: 'Needs Google Calendar on server',
    kind: 'chat',
    message: 'مواعيد دكتور القلب بكرة الصبح إيه؟',
    withJwt: false,
  },
  {
    level: 1,
    id: 'S1.6a',
    title: 'Chat without conversation id',
    hint: 'Expect 400 CONVERSATION_REQUIRED',
    kind: 'chatNoConv',
    message: 'hi',
  },
  {
    level: 2,
    id: 'S2.1',
    title: 'Enroll without token',
    hint: 'Expect 401 AUTH_REQUIRED',
    kind: 'enroll',
    noJwt: true,
  },
  {
    level: 2,
    id: 'S2.2',
    title: 'Enroll new patient',
    hint: 'Fresh phone + JWT → 201 linked',
    kind: 'enroll',
    freshPhone: true,
  },
  {
    level: 2,
    id: 'S2.4',
    title: 'Profile (Arabic)',
    kind: 'chat',
    message: 'وريني بروفايلي',
    withJwt: true,
  },
  {
    level: 2,
    id: 'S2.5',
    title: 'Same conv, no JWT',
    hint: 'Profile must stay blocked',
    kind: 'chat',
    message: 'وريني بروفايلي',
    withJwt: false,
  },
  {
    level: 2,
    id: 'S2.6',
    title: 'Bad JWT',
    hint: 'Expect 401',
    kind: 'chatBadJwt',
    message: 'مرحبا',
  },
  {
    level: 2,
    id: 'S2.7',
    title: 'Link existing patient',
    hint: 'Uses Patient ID field',
    kind: 'link',
  },
  {
    level: 2,
    id: 'S2.8',
    title: 'Register via chat ≠ login',
    kind: 'chat',
    message: 'سجّلني برقم 01012345678 اسمي أحمد',
    withJwt: false,
  },
  {
    level: 3,
    id: 'S3.1',
    title: 'Morning preference',
    kind: 'chat',
    message: 'خلّي مواعيدي المفضلة الصبح',
    withJwt: true,
  },
  {
    level: 3,
    id: 'S3.2',
    title: 'Specialty preference',
    kind: 'chat',
    message: 'فضّل تخصص جلدية',
    withJwt: true,
  },
  {
    level: 3,
    id: 'S3.3',
    title: 'Context + upcoming',
    kind: 'chat',
    message: 'إيه مواعيدي الجاية وتفضيلاتي؟',
    withJwt: true,
  },
  {
    level: 4,
    id: 'S4.1a',
    title: 'Booking turn 1',
    kind: 'chat',
    message: 'عايز أحجز كشف قلب بكرة الصبح',
    withJwt: true,
  },
  {
    level: 4,
    id: 'S4.1b',
    title: 'Booking turn 2',
    kind: 'chat',
    message: 'تمام، الدكتور الأول',
    withJwt: true,
  },
  {
    level: 4,
    id: 'S4.1c',
    title: 'Booking turn 3',
    kind: 'chat',
    message: 'احجز أول موعد الصبح',
    withJwt: true,
  },
  {
    level: 4,
    id: 'S4.2',
    title: 'English booking',
    kind: 'chat',
    message: 'Book me with the first available cardiologist tomorrow morning.',
    withJwt: true,
  },
  {
    level: 5,
    id: 'S5.1',
    title: 'Cancel last booking',
    kind: 'chat',
    message: 'ألغي آخر حجز عملته',
    withJwt: true,
  },
  {
    level: 5,
    id: 'S5.2',
    title: 'Reschedule',
    kind: 'chat',
    message: 'انقل معادى ليوم الخميس الساعة ١١ الصبح',
    withJwt: true,
  },
  {
    level: 6,
    id: 'S6.1',
    title: 'Anonymous booking',
    kind: 'chat',
    message: 'احجزلي مع دكتور القلب بكرة 10',
    withJwt: false,
  },
  {
    level: 6,
    id: 'S6.5',
    title: 'Demo header spoof',
    hint: 'x-demo-subject ignored in production',
    kind: 'chatDemoHeader',
    message: 'hi',
  },
  {
    level: 6,
    id: 'S6.6',
    title: 'Medical advice boundary',
    kind: 'chat',
    message: 'إيه الدوا المناسب للصداع النصفي وهل محتاج عملية؟',
    withJwt: false,
  },
  {
    level: 1,
    id: 'S7.2',
    title: 'Semantic search (Arabic)',
    kind: 'chat',
    message: 'محتاج دكتور يعالج حساسية الجلد',
    withJwt: false,
  },
];

const state = loadState();
/** @type {Array<{role: string, text: string, meta?: string, tools?: string[], authenticated?: boolean}>} */
const chatHistory = [];

const el = {
  baseUrl: /** @type {HTMLInputElement} */ (document.getElementById('baseUrl')),
  jwt: /** @type {HTMLTextAreaElement} */ (document.getElementById('jwt')),
  conversationId: /** @type {HTMLInputElement} */ (
    document.getElementById('conversationId')
  ),
  patientId: /** @type {HTMLInputElement} */ (document.getElementById('patientId')),
  testPhone: /** @type {HTMLInputElement} */ (document.getElementById('testPhone')),
  fullName: /** @type {HTMLInputElement} */ (document.getElementById('fullName')),
  useSameOrigin: /** @type {HTMLInputElement} */ (
    document.getElementById('useSameOrigin')
  ),
  sendWithJwt: /** @type {HTMLInputElement} */ (document.getElementById('sendWithJwt')),
  chatInput: /** @type {HTMLTextAreaElement} */ (document.getElementById('chatInput')),
  chatThread: document.getElementById('chatThread'),
  scenarioList: document.getElementById('scenarioList'),
  levelNav: document.getElementById('levelNav'),
  levelLabel: document.getElementById('levelLabel'),
  requestLog: document.getElementById('requestLog'),
  jwtPreview: document.getElementById('jwtPreview'),
  connStatus: document.getElementById('connStatus'),
};

let activeLevel = 0;

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { ...defaults(), ...JSON.parse(raw) };
  } catch {
    /* ignore */
  }
  return defaults();
}

function defaults() {
  return {
    baseUrl: DEFAULT_BASE,
    jwt: '',
    conversationId: '',
    patientId: '',
    testPhone: '',
    fullName: 'محمود تست',
    useSameOrigin: true,
  };
}

function saveState() {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      baseUrl: el.baseUrl.value.trim(),
      jwt: el.jwt.value.trim(),
      conversationId: el.conversationId.value.trim(),
      patientId: el.patientId.value.trim(),
      testPhone: el.testPhone.value.trim(),
      fullName: el.fullName.value.trim(),
      useSameOrigin: el.useSameOrigin.checked,
    }),
  );
}

function resolveBase() {
  if (el.useSameOrigin.checked) {
    return window.location.origin.replace(/\/$/, '');
  }
  return el.baseUrl.value.trim().replace(/\/$/, '');
}

function freshTestPhone() {
  const suffix = String(Date.now()).slice(-8);
  return `+2010${suffix}`;
}

function isRtl(text) {
  return /[\u0600-\u06FF]/.test(text);
}

function decodeJwtPayload(token) {
  try {
    const part = token.split('.')[1];
    if (!part) return null;
    const json = atob(part.replace(/-/g, '+').replace(/_/g, '/'));
    return JSON.parse(json);
  } catch {
    return null;
  }
}

function updateJwtPreview() {
  const token = el.jwt.value.trim();
  if (!token) {
    el.jwtPreview.textContent = 'Paste an Auth0 access token (aud = clinic-voice-ai).';
    return;
  }
  const payload = decodeJwtPayload(token);
  if (!payload) {
    el.jwtPreview.textContent = 'Could not decode JWT payload.';
    return;
  }
  const exp =
    typeof payload.exp === 'number'
      ? new Date(payload.exp * 1000).toISOString()
      : '—';
  el.jwtPreview.textContent = [
    `sub: ${payload.sub ?? '—'}`,
    `aud: ${JSON.stringify(payload.aud)}`,
    `iss: ${payload.iss ?? '—'}`,
    `exp: ${exp}`,
  ].join('\n');
}

function appendLog(entry) {
  const empty = el.requestLog.querySelector('.empty');
  if (empty) empty.remove();
  const div = document.createElement('div');
  div.className = 'log-entry';
  const codeClass =
    entry.status >= 200 && entry.status < 300 ? 'code-2' : 'code-4';
  div.innerHTML = `<div><span class="req">${entry.method} ${entry.path}</span> <span class="${codeClass}">${entry.status}</span> <span>${entry.ms}ms</span></div>`;
  if (entry.body !== undefined) {
    const pre = document.createElement('pre');
    pre.textContent =
      typeof entry.body === 'string'
        ? entry.body
        : JSON.stringify(entry.body, null, 2);
    div.appendChild(pre);
  }
  el.requestLog.prepend(div);
}

async function apiRequest(options) {
  const base = resolveBase();
  const url = `${base}${options.path}`;
  const headers = { ...(options.headers ?? {}) };
  const init = {
    method: options.method,
    headers,
  };
  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(options.body);
  }

  const started = performance.now();
  let status = 0;
  let data;
  let text = '';

  try {
    const res = await fetch(url, init);
    status = res.status;
    text = await res.text();
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = text;
    }
    return { ok: res.ok, status, data, text };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    appendLog({
      method: options.method,
      path: options.path,
      status: 0,
      ms: Math.round(performance.now() - started),
      body: message,
    });
    throw error;
  } finally {
    if (status !== 0) {
      appendLog({
        method: options.method,
        path: options.path,
        status,
        ms: Math.round(performance.now() - started),
        body: data ?? text,
      });
    }
  }
}

function renderChat() {
  if (chatHistory.length === 0) {
    el.chatThread.innerHTML = '<p class="empty">Run a scenario or send a message.</p>';
    return;
  }
  el.chatThread.innerHTML = '';
  for (const item of chatHistory) {
    const wrap = document.createElement('div');
    wrap.className = `bubble ${item.role}`;
    if (isRtl(item.text)) wrap.setAttribute('dir', 'rtl');
    wrap.textContent = item.text;

    if (item.meta || item.tools?.length) {
      const meta = document.createElement('div');
      meta.className = 'bubble-meta';
      meta.textContent = item.meta ?? '';
      if (item.tools?.length) {
        const tools = document.createElement('div');
        tools.className = 'tools';
        for (const t of item.tools) {
          const tag = document.createElement('span');
          tag.className = 'tag ok';
          tag.textContent = t;
          tools.appendChild(tag);
        }
        meta.appendChild(tools);
      }
      wrap.appendChild(meta);
    }
    el.chatThread.appendChild(wrap);
  }
  el.chatThread.scrollTop = el.chatThread.scrollHeight;
}

function pushChat(role, text, extra = {}) {
  chatHistory.push({ role, text, ...extra });
  renderChat();
}

async function sendChat(message, options = {}) {
  const conv = el.conversationId.value.trim();
  if (!options.omitConversationHeader && !options.skipConvCheck && !conv) {
    pushChat('assistant', 'Create a conversation first (S1.1).');
    return null;
  }

  pushChat('user', message);

  /** @type {Record<string, string>} */
  const headers = {};
  if (!options.omitConversationHeader && conv) {
    headers['x-conversation-id'] = conv;
  }

  const useJwt =
    options.withJwt === true ||
    (options.withJwt !== false && el.sendWithJwt.checked);
  if (options.badJwt) {
    headers.Authorization = 'Bearer not-a-real-jwt';
  } else if (useJwt && el.jwt.value.trim()) {
    headers.Authorization = `Bearer ${el.jwt.value.trim()}`;
  }
  if (options.demoHeader) {
    headers['x-demo-subject'] = 'attacker';
  }

  const result = await apiRequest({
    method: 'POST',
    path: '/v1/chat',
    headers,
    body: { message },
  });

  if (result.status === 401) {
    const err =
      typeof result.data === 'object' && result.data?.message
        ? result.data.message
        : 'Unauthorized';
    pushChat('assistant', `HTTP 401 — ${err}`);
    return result;
  }

  if (!result.ok) {
    const msg =
      typeof result.data === 'object' && result.data?.message
        ? result.data.message
        : result.text;
    pushChat('assistant', `Error ${result.status}: ${msg}`);
    return result;
  }

  const reply = result.data?.reply ?? JSON.stringify(result.data);
  const tools = result.data?.toolsInvoked ?? [];
  const auth = result.data?.authenticated;
  pushChat('assistant', reply, {
    meta: `authenticated: ${auth}`,
    tools,
  });
  return result;
}

async function newConversation() {
  const result = await apiRequest({
    method: 'POST',
    path: '/v1/conversations',
  });
  if (result.ok && result.data?.conversationId) {
    el.conversationId.value = result.data.conversationId;
    saveState();
    pushChat(
      'assistant',
      `Conversation created: ${result.data.conversationId}`,
    );
  }
  return result;
}

async function enroll(options = {}) {
  const phone =
    options.freshPhone || !el.testPhone.value.trim()
      ? freshTestPhone()
      : el.testPhone.value.trim();
  el.testPhone.value = phone;
  saveState();

  /** @type {Record<string, string>} */
  const headers = {};
  if (!options.noJwt && el.jwt.value.trim()) {
    headers.Authorization = `Bearer ${el.jwt.value.trim()}`;
  }

  const result = await apiRequest({
    method: 'POST',
    path: '/v1/enroll',
    headers,
    body: {
      phoneNumber: phone,
      ...(el.fullName.value.trim()
        ? { fullName: el.fullName.value.trim() }
        : {}),
    },
  });

  if (result.ok && result.data?.patientId) {
    el.patientId.value = result.data.patientId;
    saveState();
    pushChat(
      'assistant',
      `Enroll OK — patientId: ${result.data.patientId}\ncreated: ${result.data.created}, linked: ${result.data.linked}`,
    );
  } else {
    const msg =
      typeof result.data === 'object' && result.data?.message
        ? result.data.message
        : result.text;
    pushChat('assistant', `Enroll ${result.status}: ${msg}`);
  }
  return result;
}

async function linkPatient() {
  const patientId = el.patientId.value.trim();
  if (!patientId) {
    pushChat('assistant', 'Set Patient ID first (from enroll response).');
    return null;
  }
  const jwt = el.jwt.value.trim();
  if (!jwt) {
    pushChat('assistant', 'JWT required for link.');
    return null;
  }

  const result = await apiRequest({
    method: 'POST',
    path: '/v1/identity/link',
    headers: { Authorization: `Bearer ${jwt}` },
    body: { patientId },
  });

  if (result.status === 204) {
    pushChat('assistant', 'Link OK (204). Chat should now be authenticated.');
  } else {
    const msg =
      typeof result.data === 'object' && result.data?.message
        ? result.data.message
        : result.text;
    pushChat('assistant', `Link ${result.status}: ${msg}`);
  }
  return result;
}

async function runScenario(scenario) {
  switch (scenario.kind) {
    case 'request':
      await apiRequest({ method: scenario.method, path: scenario.path });
      break;
    case 'newConversation':
      await newConversation();
      break;
    case 'chat':
      el.chatInput.value = scenario.message;
      await sendChat(scenario.message, { withJwt: scenario.withJwt });
      break;
    case 'chatNoConv':
      await sendChat(scenario.message, { omitConversationHeader: true });
      break;
    case 'chatBadJwt':
      await sendChat(scenario.message, { badJwt: true });
      break;
    case 'chatDemoHeader':
      await sendChat(scenario.message, {
        withJwt: false,
        demoHeader: true,
      });
      break;
    case 'enroll':
      await enroll({
        noJwt: scenario.noJwt,
        freshPhone: scenario.freshPhone,
      });
      break;
    case 'link':
      await linkPatient();
      break;
    default:
      break;
  }
}

function renderLevelNav() {
  el.levelNav.innerHTML = '';
  for (const level of LEVELS) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = level.label;
    btn.classList.toggle('active', level.id === activeLevel);
    btn.addEventListener('click', () => {
      activeLevel = level.id;
      el.levelLabel.textContent = level.label;
      renderLevelNav();
      renderScenarios();
    });
    el.levelNav.appendChild(btn);
  }
}

function renderScenarios() {
  el.scenarioList.innerHTML = '';
  const items = SCENARIOS.filter((s) => s.level === activeLevel);
  if (items.length === 0) {
    el.scenarioList.innerHTML =
      '<p class="empty">No automated scenarios for this level.</p>';
    return;
  }
  for (const scenario of items) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'scenario-btn';
    btn.innerHTML = `<span class="id">${scenario.id}</span><span class="title">${scenario.title}</span>${scenario.hint ? `<span class="hint">${scenario.hint}</span>` : ''}`;
    btn.addEventListener('click', () => void runScenario(scenario));
    el.scenarioList.appendChild(btn);
  }
}

function bindEvents() {
  for (const input of [
    el.baseUrl,
    el.jwt,
    el.conversationId,
    el.patientId,
    el.testPhone,
    el.fullName,
  ]) {
    input.addEventListener('change', () => {
      saveState();
      if (input === el.jwt) updateJwtPreview();
    });
    input.addEventListener('input', () => {
      if (input === el.jwt) updateJwtPreview();
    });
  }
  el.useSameOrigin.addEventListener('change', saveState);

  document.getElementById('btnSave').addEventListener('click', saveState);
  document.getElementById('btnClearLog').addEventListener('click', () => {
    el.requestLog.innerHTML = '';
  });
  document.getElementById('btnClearChat').addEventListener('click', () => {
    chatHistory.length = 0;
    renderChat();
  });
  document.getElementById('btnFreshPhone').addEventListener('click', () => {
    el.testPhone.value = freshTestPhone();
    saveState();
  });
  document.getElementById('btnNewConv').addEventListener('click', () => {
    void newConversation();
  });
  document.getElementById('btnEnroll').addEventListener('click', () => {
    void enroll({ freshPhone: true });
  });
  document.getElementById('btnLink').addEventListener('click', () => {
    void linkPatient();
  });
  document.getElementById('btnSendChat').addEventListener('click', () => {
    const msg = el.chatInput.value.trim();
    if (!msg) return;
    void sendChat(msg);
  });
  document.getElementById('btnHealth').addEventListener('click', () => {
    void apiRequest({ method: 'GET', path: '/health' });
  });
  document.getElementById('btnReady').addEventListener('click', () => {
    void apiRequest({ method: 'GET', path: '/ready' });
  });

  el.chatInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      document.getElementById('btnSendChat').click();
    }
  });
}

function initForm() {
  el.baseUrl.value = state.baseUrl || DEFAULT_BASE;
  el.jwt.value = state.jwt || '';
  el.conversationId.value = state.conversationId || '';
  el.patientId.value = state.patientId || '';
  el.testPhone.value = state.testPhone || '';
  el.fullName.value = state.fullName || 'محمود تست';
  el.useSameOrigin.checked = state.useSameOrigin !== false;
  updateJwtPreview();
  renderChat();
}

function init() {
  bindEvents();
  el.levelLabel.textContent = LEVELS[0].label;
  renderLevelNav();
  renderScenarios();
  initForm();

  if (window.location.pathname.startsWith('/test-console')) {
    el.connStatus.textContent = 'Same-origin API (recommended)';
    el.connStatus.className = 'status-pill ok';
  }
}

init();
