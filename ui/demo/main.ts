import { AppBridge, PostMessageTransport } from '@modelcontextprotocol/ext-apps/app-bridge';
import './styles.css';

// ---------- API contract (docs/demo-for-judges.md) ----------

type Kind = 'shop' | 'bakery' | 'blank';

interface Sandbox {
  expiresAt: string;
  businesses: Array<{ kind: Kind; name: string; token: string }>;
}

interface ToolCall { tool: string; arguments: unknown; isError: boolean; result?: string }

interface TurnUi {
  resourceUri: string;
  toolName: string;
  toolInput: Record<string, unknown>;
  toolResult: unknown;
}

interface TurnResponse {
  reply: string;
  business: { name: string; status: 'active' | 'blank' };
  calls: ToolCall[];
  ui?: TurnUi;
}

// ---------- Page state ----------

interface Entry {
  role: 'user' | 'assistant' | 'system';
  text: string;
  calls?: ToolCall[];
  uiTool?: string;
}

interface Thread {
  entries: Entry[];
  status: 'active' | 'blank';
  name?: string;
  lastUi?: TurnUi;
}

const KINDS: Kind[] = ['shop', 'bakery', 'blank'];
const DEFAULT_LABEL: Record<Kind, string> = {
  shop: 'Oak Street Auto',
  bakery: 'Sweet Crumb Bakery',
  blank: 'New business — set it up by voice'
};
const SUBLABEL: Record<Kind, string> = { shop: 'Auto repair shop', bakery: 'Bakery', blank: 'Blank, nothing set up yet' };

const PHRASES: Record<Kind, string[]> = {
  shop: [
    "How's the shop looking today?",
    "What's waiting on parts?",
    'Add front brake pads to the blue sedan.',
    'Move the blue sedan into the bay.',
    'Close out the silver crossover, they paid by card.',
    'How did last week go?'
  ],
  bakery: [
    'What cakes are due Saturday?',
    'Cake order for Ana Ruiz, chocolate, 8-inch, Saturday.',
    'Are we low on anything?'
  ],
  blank: [
    'I run a flower shop. We take orders for bouquets and centerpieces, then we arrange them, and they\'re ready for pickup or delivered.',
    'What did you come up with?',
    'Yes, go ahead and turn it on.'
  ]
};
const PHRASES_AFTER_ACTIVATION = ['Take an order for Maria Lopez, a dozen roses for Friday.'];

const GREETING: Record<Kind, [string, string]> = {
  shop: ['Ask about the shop.', 'Tap the mic and talk, type below, or pick a phrase.'],
  bakery: ['Ask about the bakery.', 'Tap the mic and talk, type below, or pick a phrase.'],
  blank: ['Describe your business and Counterpart sets it up.', 'Start with the first phrase below, then follow the steps.']
};

const MAX_TEXT = 300;
const HISTORY_SIZE = 12;
const MAX_CALLS_PER_ENTRY = 5;
const STORE_KEY = 'counterpart-demo';
const MUTE_KEY = 'counterpart-demo-muted';

let sandbox: Sandbox | null = null;
let threads: Record<Kind, Thread> = freshThreads();
let current: Kind = 'shop';
let busy = false;
let muted = readMuted();

function freshThreads(): Record<Kind, Thread> {
  return { shop: { entries: [], status: 'active' }, bakery: { entries: [], status: 'active' }, blank: { entries: [], status: 'blank' } };
}

// ---------- Storage (all access guarded: private windows can throw) ----------

function save(): void {
  try { sessionStorage.setItem(STORE_KEY, JSON.stringify({ sandbox, threads, current })); } catch { /* not persisted */ }
}

function load(): void {
  try {
    const raw = sessionStorage.getItem(STORE_KEY);
    if (!raw) return;
    const saved = JSON.parse(raw) as { sandbox?: Sandbox; threads?: Record<Kind, Thread>; current?: Kind };
    if (!saved.sandbox || Date.parse(saved.sandbox.expiresAt) <= Date.now()) {
      sessionStorage.removeItem(STORE_KEY);
      return;
    }
    sandbox = saved.sandbox;
    if (saved.threads) threads = { ...freshThreads(), ...saved.threads };
    if (saved.current && KINDS.includes(saved.current)) current = saved.current;
  } catch { /* start fresh */ }
}

function forget(): void {
  try { sessionStorage.removeItem(STORE_KEY); } catch { /* nothing */ }
}

function readMuted(): boolean {
  try { return localStorage.getItem(MUTE_KEY) === '1'; } catch { return false; }
}

function writeMuted(value: boolean): void {
  try { localStorage.setItem(MUTE_KEY, value ? '1' : '0'); } catch { /* nothing */ }
}

// ---------- Elements ----------

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const els = {
  tabs: $('tabs'),
  screen: $('screen'),
  screenBusiness: $('screen-business'),
  clock: $('clock'),
  appArea: $('app-area'),
  heard: $('heard'),
  reply: $('reply'),
  overlay: $('overlay'),
  overlaySpinner: $('overlay-spinner'),
  overlayText: $('overlay-text'),
  overlayAction: $<HTMLButtonElement>('overlay-action'),
  composer: $<HTMLFormElement>('composer'),
  mic: $<HTMLButtonElement>('mic'),
  text: $<HTMLInputElement>('text'),
  send: $<HTMLButtonElement>('send'),
  mute: $<HTMLButtonElement>('mute'),
  hint: $('hint'),
  chips: $('chips'),
  log: $('log'),
  traffic: $('traffic'),
  mcpUrl: $('mcp-url'),
  expires: $('expires'),
  tokens: $('tokens')
};

// ---------- Helpers ----------

function el<K extends keyof HTMLElementTagNameMap>(tag: K, props: Partial<HTMLElementTagNameMap[K]> = {}, ...children: Array<Node | string>): HTMLElementTagNameMap[K] {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children);
  return node;
}

function business(kind: Kind) {
  return sandbox?.businesses.find(b => b.kind === kind);
}

function label(kind: Kind): string {
  const thread = threads[kind];
  if (kind === 'blank') return thread.status === 'active' && thread.name ? thread.name : DEFAULT_LABEL.blank;
  return business(kind)?.name ?? DEFAULT_LABEL[kind];
}

function phrases(kind: Kind): string[] {
  return kind === 'blank' && threads.blank.status === 'active' ? PHRASES_AFTER_ACTIVATION : PHRASES[kind];
}

function clip(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function compact(value: unknown): string {
  if (value === undefined || value === null) return '{}';
  let text: string;
  try { text = JSON.stringify(value); } catch { text = String(value); }
  return text.length > 220 ? `${text.slice(0, 217)}…` : text;
}

function setState(state: 'idle' | 'listening' | 'thinking' | 'speaking'): void {
  els.screen.dataset.state = state;
}

function hint(text: string, error = false): void {
  els.hint.textContent = text;
  els.hint.classList.toggle('error', error);
}

function overlay(text: string | null, opts: { spinner?: boolean; action?: { label: string; run: () => void } } = {}): void {
  if (text === null) { els.overlay.hidden = true; return; }
  els.overlay.hidden = false;
  els.overlayText.textContent = text;
  els.overlaySpinner.hidden = !opts.spinner;
  if (opts.action) {
    const { label: actionLabel, run } = opts.action;
    els.overlayAction.hidden = false;
    els.overlayAction.textContent = actionLabel;
    els.overlayAction.onclick = run;
    els.overlayAction.focus();
  } else {
    els.overlayAction.hidden = true;
    els.overlayAction.onclick = null;
  }
}

function setBusy(value: boolean): void {
  busy = value;
  const disabled = value || !sandbox;
  els.send.disabled = disabled;
  els.text.disabled = disabled;
  els.mic.disabled = disabled || !Recognition;
  for (const chip of els.chips.querySelectorAll('button')) chip.disabled = disabled;
}

// ---------- Rendering ----------

function renderTabs(): void {
  els.tabs.replaceChildren(...KINDS.map(kind => {
    const tab = el('button', { type: 'button', className: 'tab', id: `tab-${kind}` },
      label(kind), el('small', {}, kind === 'blank' && threads.blank.status === 'active' ? 'Set up by voice' : SUBLABEL[kind]));
    tab.setAttribute('role', 'tab');
    tab.setAttribute('aria-selected', String(kind === current));
    tab.tabIndex = kind === current ? 0 : -1;
    tab.addEventListener('click', () => switchTo(kind));
    tab.addEventListener('keydown', e => {
      const i = KINDS.indexOf(kind);
      const next = e.key === 'ArrowRight' ? KINDS[(i + 1) % KINDS.length] : e.key === 'ArrowLeft' ? KINDS[(i + KINDS.length - 1) % KINDS.length] : undefined;
      if (next) { e.preventDefault(); switchTo(next); document.getElementById(`tab-${next}`)?.focus(); }
    });
    return tab;
  }));
}

function renderChips(): void {
  els.chips.replaceChildren(...phrases(current).map(text => {
    const chip = el('button', { type: 'button', className: 'chip', disabled: busy || !sandbox }, text);
    chip.setAttribute('aria-label', `Say: ${text}`);
    chip.addEventListener('click', () => void send(text));
    return chip;
  }));
}

function renderScreen(): void {
  els.screenBusiness.textContent = label(current);
  const entries = threads[current].entries;
  const lastAssistant = [...entries].reverse().find(e => e.role !== 'user');
  const lastUser = [...entries].reverse().find(e => e.role === 'user');
  if (!lastAssistant) {
    const [title, sub] = GREETING[current];
    els.heard.textContent = '';
    els.reply.replaceChildren(title, el('span', { className: 'greeting-sub' }, sub));
    return;
  }
  els.heard.textContent = lastUser ? `“${lastUser.text}”` : '';
  els.reply.textContent = lastAssistant.text;
}

function renderLog(): void {
  const entries = threads[current].entries;
  if (entries.length === 0) {
    els.log.replaceChildren(el('li', { className: 'empty-note' }, 'Nothing said yet.'));
    return;
  }
  els.log.replaceChildren(...entries.map(e =>
    el('li', { className: e.role }, el('span', { className: 'who' }, e.role === 'user' ? 'You' : e.role === 'assistant' ? 'Alexa' : 'Note'), e.text)));
  els.log.scrollTop = els.log.scrollHeight;
}

function renderTraffic(): void {
  const entries = threads[current].entries;
  const turns: Array<{ said: string; calls: ToolCall[]; uiTool?: string }> = [];
  entries.forEach((e, i) => {
    if (e.role !== 'assistant' || !e.calls) return;
    const said = entries[i - 1]?.role === 'user' ? entries[i - 1]!.text : '';
    turns.push({ said, calls: e.calls, uiTool: e.uiTool });
  });
  if (turns.length === 0) {
    els.traffic.replaceChildren(el('li', { className: 'empty-note' }, 'No tool calls yet.'));
    return;
  }
  els.traffic.replaceChildren(...turns.reverse().map(turn => {
    const list = turn.calls.length === 0
      ? el('p', { className: 'empty-note' }, 'No tool calls this turn.')
      : el('ul', {}, ...turn.calls.map(call => {
          const row = el('li', { className: 'call' }, el('span', { className: 'tool' }, call.tool));
          if (call.isError) row.append(el('span', { className: 'badge' }, 'error'));
          else if (call.tool === turn.uiTool) row.append(el('span', { className: 'badge ui' }, 'shows an app'));
          row.append(el('span', { className: 'args' }, compact(call.arguments)));
          if (call.result) row.append(el('span', { className: 'result' }, clip(call.result, 160)));
          return row;
        }));
    return el('li', { className: 'turn-calls' }, el('h3', {}, turn.said ? `“${turn.said}”` : 'Turn'), list);
  }));
}

function renderInspector(): void {
  els.mcpUrl.textContent = `${location.origin}/mcp`;
  if (!sandbox) { els.expires.textContent = '—'; els.tokens.replaceChildren(); return; }
  const expires = new Date(sandbox.expiresAt);
  els.expires.textContent = isNaN(expires.getTime()) ? sandbox.expiresAt : expires.toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });
  els.tokens.replaceChildren(...KINDS.map(kind => {
    const b = business(kind);
    if (!b) return el('li', {}, `${DEFAULT_LABEL[kind]}: no token`);
    const copy = el('button', { type: 'button', className: 'btn' }, 'Copy');
    copy.setAttribute('aria-label', `Copy the token for ${label(kind)}`);
    copy.addEventListener('click', () => {
      void navigator.clipboard?.writeText(b.token).then(() => { copy.textContent = 'Copied'; setTimeout(() => { copy.textContent = 'Copy'; }, 1500); },
        () => { copy.textContent = 'Select it'; });
    });
    return el('li', {}, el('span', { className: 'row' }, el('strong', {}, label(kind)), copy), el('code', {}, b.token));
  }));
}

function renderAll(): void {
  renderTabs();
  renderChips();
  renderScreen();
  renderLog();
  renderTraffic();
  renderInspector();
}

function switchTo(kind: Kind): void {
  if (kind === current) return;
  current = kind;
  speechSynthesis?.cancel();
  save();
  renderAll();
  const ui = threads[kind].lastUi;
  if (ui) void showApp(kind, ui); else hideApp();
}

// ---------- Sandbox ----------

async function createSandbox(): Promise<void> {
  sandbox = null;
  threads = freshThreads();
  forget();
  hideApp();
  renderAll();
  setBusy(true);
  overlay('Setting up your own copy of the businesses… this can take about 10 seconds.', { spinner: true });
  try {
    const res = await fetch('/demo/api/sandbox', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
    if (res.status === 429) {
      const body = await res.json().catch(() => ({})) as { message?: string };
      overlay(body.message ?? 'The demo is busy right now. Try again in a few minutes.', { action: { label: 'Try again', run: () => void createSandbox() } });
      return;
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    sandbox = await res.json() as Sandbox;
    save();
    overlay(null);
    renderAll();
  } catch {
    overlay('Could not set up the demo. Check your connection and try again.', { action: { label: 'Try again', run: () => void createSandbox() } });
  } finally {
    setBusy(false);
  }
}

function sandboxExpired(): void {
  overlay('Your sandbox expired. Start a new one to keep going; it comes with fresh copies of the businesses.', {
    action: { label: 'Start a new sandbox', run: () => void createSandbox() }
  });
}

// ---------- Turns ----------

async function send(raw: string): Promise<void> {
  const text = raw.trim().slice(0, MAX_TEXT);
  if (!text || busy) return;
  if (!sandbox || Date.parse(sandbox.expiresAt) <= Date.now()) { sandboxExpired(); return; }
  const kind = current;
  const b = business(kind);
  if (!b) return;
  const thread = threads[kind];

  const history = thread.entries
    .filter((e): e is Entry & { role: 'user' | 'assistant' } => e.role !== 'system')
    .slice(-HISTORY_SIZE)
    // Assistant entries carry that turn's tool calls, so the model keeps calling tools instead of imitating old answers.
    .map(e => e.role === 'assistant'
      ? { role: e.role, text: e.text, calls: (e.calls ?? []).slice(0, MAX_CALLS_PER_ENTRY) }
      : { role: e.role, text: e.text });

  speechSynthesis?.cancel();
  thread.entries.push({ role: 'user', text });
  els.text.value = '';
  hint('');
  setBusy(true);
  setState('thinking');
  if (kind === current) {
    renderScreen();
    els.heard.textContent = `“${text}”`;
    els.reply.textContent = 'Thinking…';
    renderLog();
  }

  try {
    const res = await fetch('/demo/api/turn', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token: b.token, text, history })
    });
    if (res.status === 401) {
      thread.entries.pop();
      sandboxExpired();
      return;
    }
    if (res.status === 429) {
      const body = await res.json().catch(() => ({})) as { message?: string };
      thread.entries.push({ role: 'system', text: body.message ?? 'The demo has reached its limit for now. Try again later.' });
      return;
    }
    if (!res.ok) {
      thread.entries.push({ role: 'system', text: res.status === 400 ? 'That message could not be sent. Keep it under 300 characters.' : `The server answered with an error (${res.status}). Try again.` });
      return;
    }
    const turn = await res.json() as TurnResponse;
    thread.entries.push({ role: 'assistant', text: turn.reply, calls: turn.calls ?? [], uiTool: turn.ui?.toolName });

    const wasBlank = kind === 'blank' && thread.status !== 'active';
    thread.status = turn.business?.status ?? thread.status;
    if (turn.business?.name) thread.name = turn.business.name;
    if (wasBlank && thread.status === 'active') {
      renderTabs();
      if (kind === current) renderChips();
      renderInspector();
    }

    // A turn without an app clears the screen back to the spoken reply, as the device would.
    thread.lastUi = turn.ui;
    if (kind === current) {
      if (turn.ui) void showApp(kind, turn.ui); else hideApp();
      speak(turn.reply);
    }
  } catch {
    thread.entries.push({ role: 'system', text: 'Could not reach the server. Check your connection and try again.' });
  } finally {
    save();
    setBusy(false);
    if (els.screen.dataset.state === 'thinking') setState('idle');
    if (kind === current) { renderScreen(); renderLog(); renderTraffic(); renderChips(); }
  }
}

// ---------- Speech out ----------

let voice: SpeechSynthesisVoice | undefined;
function pickVoice(): void {
  const voices = window.speechSynthesis?.getVoices() ?? [];
  voice = voices.find(v => v.lang === 'en-US' && /natural|google|samantha|aria|jenny/i.test(v.name))
    ?? voices.find(v => v.lang === 'en-US') ?? voices.find(v => v.lang.startsWith('en'));
}
if ('speechSynthesis' in window) {
  pickVoice();
  speechSynthesis.addEventListener?.('voiceschanged', pickVoice);
}

function speak(text: string): void {
  if (muted || !('speechSynthesis' in window)) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'en-US';
  if (voice) u.voice = voice;
  u.onstart = () => setState('speaking');
  u.onend = u.onerror = () => { if (els.screen.dataset.state === 'speaking') setState('idle'); };
  speechSynthesis.speak(u);
}

function renderMute(): void {
  els.mute.setAttribute('aria-pressed', String(muted));
  const text = muted ? 'Unmute spoken replies' : 'Mute spoken replies';
  els.mute.setAttribute('aria-label', text);
  els.mute.title = text;
}

els.mute.addEventListener('click', () => {
  muted = !muted;
  writeMuted(muted);
  if (muted && 'speechSynthesis' in window) { speechSynthesis.cancel(); setState('idle'); }
  renderMute();
});

// ---------- Speech in (push to talk) ----------

interface RecognitionResultEvent { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }
interface Recognizer {
  lang: string; interimResults: boolean; continuous: boolean; maxAlternatives: number;
  start(): void; stop(): void; abort(): void;
  onresult: ((e: RecognitionResultEvent) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
}
type RecognizerCtor = new () => Recognizer;
const Recognition = ((window as unknown as { SpeechRecognition?: RecognizerCtor }).SpeechRecognition
  ?? (window as unknown as { webkitSpeechRecognition?: RecognizerCtor }).webkitSpeechRecognition);

let recognizer: Recognizer | null = null;
let listening = false;
let heardText = '';
let pressStart = 0;

function startListening(): void {
  if (!Recognition || listening || busy) return;
  speechSynthesis?.cancel();
  heardText = '';
  const r = new Recognition();
  r.lang = 'en-US';
  r.interimResults = true;
  r.continuous = false;
  r.maxAlternatives = 1;
  r.onresult = e => {
    let text = '';
    for (let i = 0; i < e.results.length; i++) text += e.results[i]![0].transcript;
    heardText = text;
    els.text.value = text.slice(0, MAX_TEXT);
  };
  r.onerror = e => {
    if (e.error === 'not-allowed' || e.error === 'service-not-allowed') hint('Microphone access is blocked. Allow it in the browser, or type instead.', true);
    else if (e.error === 'no-speech') hint('Didn\'t catch that. Tap the mic and try again.');
    else if (e.error !== 'aborted') hint('Speech recognition stopped. You can type instead.', true);
  };
  r.onend = () => {
    listening = false;
    recognizer = null;
    els.mic.setAttribute('aria-pressed', 'false');
    if (els.screen.dataset.state === 'listening') setState('idle');
    if (heardText.trim()) void send(heardText);
  };
  recognizer = r;
  listening = true;
  els.mic.setAttribute('aria-pressed', 'true');
  setState('listening');
  hint('Listening… speak now.');
  try { r.start(); } catch { listening = false; els.mic.setAttribute('aria-pressed', 'false'); setState('idle'); }
}

function stopListening(): void {
  recognizer?.stop();
}

if (!Recognition) {
  els.mic.disabled = true;
  els.mic.setAttribute('aria-label', 'Voice input is not available in this browser');
  els.mic.title = 'Voice input needs Chrome or Edge. You can type instead.';
}

// Tap toggles; holding longer than half a second stops on release (push to talk).
els.mic.addEventListener('pointerdown', e => {
  if (els.mic.disabled) return;
  e.preventDefault();
  pressStart = Date.now();
  if (listening) { stopListening(); pressStart = 0; } else startListening();
});
els.mic.addEventListener('pointerup', () => {
  if (pressStart && listening && Date.now() - pressStart > 500) stopListening();
  pressStart = 0;
});
els.mic.addEventListener('keydown', e => {
  if (e.key !== 'Enter' && e.key !== ' ') return;
  e.preventDefault();
  if (listening) stopListening(); else startListening();
});

els.composer.addEventListener('submit', e => {
  e.preventDefault();
  void send(els.text.value);
});

// ---------- MCP App host ----------

let bridge: AppBridge | null = null;
let frame: HTMLIFrameElement | null = null;
let resizeObserver: ResizeObserver | null = null;
let mountId = 0;

function hideApp(): void {
  mountId++;
  const old = bridge;
  bridge = null;
  if (old) void old.teardownResource({}).catch(() => {}).finally(() => void old.close().catch(() => {}));
  resizeObserver?.disconnect();
  resizeObserver = null;
  frame?.remove();
  frame = null;
  els.appArea.hidden = true;
  els.screen.classList.remove('has-app');
}

async function showApp(kind: Kind, ui: TurnUi): Promise<void> {
  hideApp();
  const id = mountId;
  const b = business(kind);
  if (!b) return;
  const stale = () => id !== mountId || kind !== current;

  try {
    const res = await fetch(`/demo/api/ui?token=${encodeURIComponent(b.token)}&uri=${encodeURIComponent(ui.resourceUri)}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const html = await res.text();
    if (stale()) return;

    const iframe = el('iframe', { title: `${ui.toolName} app` });
    iframe.setAttribute('sandbox', 'allow-scripts');
    els.appArea.replaceChildren(iframe);
    els.appArea.hidden = false;
    els.screen.classList.add('has-app');
    frame = iframe;

    const width = Math.round(els.appArea.clientWidth) || 600;
    const hostContext = {
      theme: 'dark' as const,
      platform: 'web' as const,
      locale: 'en-US',
      displayMode: 'inline' as const,
      availableDisplayModes: ['inline' as const],
      containerDimensions: { width, maxHeight: 720 }
    };
    const appBridge = new AppBridge(null, { name: 'Counterpart demo host', version: '1.0.0' }, { openLinks: {} }, { hostContext });
    bridge = appBridge;

    const initialized = new Promise<void>((resolve, reject) => {
      appBridge.oninitialized = () => resolve();
      setTimeout(() => reject(new Error('The app did not start')), 10_000);
    });
    appBridge.onsizechange = ({ height }) => {
      // On wide screens the iframe fills the device screen; on phones it grows with its content.
      if (height !== undefined && window.innerWidth < 700) iframe.style.height = `${Math.min(Math.max(height, 220), 720)}px`;
    };
    appBridge.onopenlink = async ({ url }) => {
      if (/^https?:/i.test(url)) window.open(url, '_blank', 'noopener,noreferrer');
      return {};
    };
    appBridge.onrequestdisplaymode = async () => ({ mode: 'inline' });
    appBridge.onmessage = async () => ({});
    appBridge.onloggingmessage = () => {};

    // The transport only accepts messages whose source is this iframe's window.
    await appBridge.connect(new PostMessageTransport(iframe.contentWindow!, iframe.contentWindow!));
    iframe.srcdoc = html;

    await initialized;
    if (stale() || bridge !== appBridge) return;

    // Keep the view informed of the width it has (window resize, phone rotation).
    resizeObserver = new ResizeObserver(([entry]) => {
      const w = Math.round(entry?.contentRect.width ?? 0);
      if (w > 0 && bridge === appBridge) appBridge.setHostContext({ ...hostContext, containerDimensions: { width: w, maxHeight: 720 } });
    });
    resizeObserver.observe(els.appArea);
    await appBridge.sendToolInput({ arguments: ui.toolInput ?? {} });
    await appBridge.sendToolResult(ui.toolResult as Parameters<AppBridge['sendToolResult']>[0]);
  } catch (err) {
    console.warn('[demo] MCP App could not be shown:', err);
    if (id === mountId) hideApp();
  }
}

// ---------- Clock and start ----------

function tick(): void {
  els.clock.textContent = new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}
tick();
setInterval(tick, 15_000);

renderMute();
load();
renderAll();
if (sandbox) {
  setBusy(false);
  const ui = threads[current].lastUi;
  if (ui) void showApp(current, ui);
} else {
  void createSandbox();
}
hint(Recognition ? 'Tap the mic and speak, or hold it while you talk.' : 'Voice input needs Chrome or Edge. Type what you\'d say instead.');
