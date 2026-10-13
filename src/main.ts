import './styles.css';
import { icon } from './ui/icons';
import { GYMS, mountGymPicker } from './ui/gym-picker';
import { advanceState, initializeState, loadState, londonDay, participants, recordSession, saveState, setPreferences, topUp } from './core/state';
import { finishSession, pauseSession, startSession, updateSession, verifyPosition } from './core/geolocation';
import { projectedPoolPence, rankParticipants } from './core/bots';
import { walletBalance } from './core/settlement';
import type { AppState, Gym, PositionFix, Preferences, Session } from './core/types';
const root = document.querySelector<HTMLDivElement>('#app')!;
let state: AppState | null = loadState();
let tab = 'home';
let onboarding = 0;
let draftName = '';
let draft: Preferences = { gym: { ...GYMS[0] }, target: 3, stakePence: 1000 };
let cleanupPicker: (() => void) | null = null;
let watch: number | null = null;
let geoPoll: ReturnType<typeof setInterval> | null = null;
let busy = false;
let locationMessage = '';
let toastTimer: ReturnType<typeof setTimeout> | null = null;
let ranking: 'progress' | 'streak' = 'progress';
let labOpen = false;
const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const money = (p: number) => new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', maximumFractionDigits: p % 100 ? 2 : 0 }).format(p / 100);
const date = (n: number, options: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' }) => new Intl.DateTimeFormat('en-GB', { ...options, timeZone: 'Europe/London' }).format(n);
const now = () => state?.simulationNow ?? Date.now();
const active = () => state?.sessions.find(s => s.endedAt === null) ?? null;
const duration = (ms: number) => `${String(Math.floor(ms / 60000)).padStart(2, '0')}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}`;
function persist() { if (state)
    try {
        saveState(state);
    }
    catch {
        toast('Storage is unavailable. Keep this tab open to retain this session.');
    } }
function toast(message: string) { document.querySelector('.toast')?.remove(); const el = document.createElement('div'); el.className = 'toast'; el.setAttribute('role', 'status'); el.textContent = message; document.body.append(el); if (toastTimer)
    clearTimeout(toastTimer); toastTimer = setTimeout(() => el.remove(), 5000); }
function brand() { return `<div class="brand-lockup"><img class="brand-mark" src="/icon.svg" alt=""><span class="wordmark">Gym<span>Stake</span></span></div>`; }
function miniMap() { return `<div class="mini-map" aria-hidden="true"><svg viewBox="0 0 360 130" preserveAspectRatio="xMidYMid slice"><defs><pattern id="streets" width="85" height="64" patternUnits="userSpaceOnUse" patternTransform="rotate(-23)"><rect width="85" height="64" fill="#252a26"/><rect x="6" y="7" width="64" height="41" rx="5" fill="#1d221f"/><path d="M0 56H85 M78 0V64" stroke="#40483c" stroke-width="5"/></pattern></defs><rect width="360" height="130" fill="url(#streets)"/><path d="M-20 95 Q120 110 175 38 T375 30" stroke="#384843" stroke-width="18" fill="none"/><circle cx="185" cy="66" r="48" fill="#d6fc70" fill-opacity=".07" stroke="#d6fc70" stroke-opacity=".3" stroke-dasharray="4 5"/><circle cx="185" cy="66" r="18" fill="#d6fc70"/><path d="M185 56a7 7 0 0 0-7 7c0 5 7 11 7 11s7-6 7-11a7 7 0 0 0-7-7zm0 4a3 3 0 1 1 0 6 3 3 0 0 1 0-6" fill="#263119"/></svg><span class="map-caption">150m check-in zone · illustrative map</span></div>`; }
function shell(content: string) {
    const s = state;
    return `<div class="app-shell"><aside class="desktop-intro">${brand()}<span class="eyebrow">A COMMITMENT TO YOURSELF</span><h1 class="desktop-title">A little stake.<br>A lot of<br><em>showing up.</em></h1><p>Turn “I should go” into “I’m going.”<br>Set your goal. Put something behind it.</p><div class="desktop-note">${icon('shield')} <span>Play money. Real commitment.</span></div><div class="intro-grid" aria-hidden="true"></div></aside><main class="phone-app"><header class="app-header">${brand()}<div class="header-actions"><span class="sim-badge">Play money</span>${s ? `<button class="avatar" data-tab="settings" aria-label="Open settings">${esc(s.profile.name.slice(0, 2).toUpperCase())}</button>` : ''}</div></header>${content}${s ? nav() : ''}</main><aside class="desktop-context"><div class="context-kicker">THE DEAL IS SIMPLE</div><div class="context-step"><span>01</span><h3>Make your promise.</h3><p>Pick a weekly gym target and a stake you’ll feel.</p></div><div class="context-step"><span>02</span><h3>Show up for yourself.</h3><p>Stay at your gym for 30 minutes. We’ll verify the visit.</p></div><div class="context-step"><span>03</span><h3>Keep your word. Get rewarded.</h3><p>Hit your goal and get your stake back, plus a share of the pool.</p></div><div class="context-foot">All balances are simulated.<br>No real funds or payment details.</div></aside></div>`;
}
function nav() { return `<nav class="bottom-nav" aria-label="Main navigation">${[['home', 'home', 'Today'], ['checkin', 'pin', 'Check in'], ['leaderboard', 'trophy', 'Leaderboard'], ['settings', 'settings', 'Settings']].map(([id, i, label]) => `<button class="nav-button ${tab === id ? 'active' : ''}" data-tab="${id}" ${tab === id ? 'aria-current="page"' : ''}><span class="nav-icon">${icon(i as Parameters<typeof icon>[0])}</span><span class="nav-label">${label}</span></button>`).join('')}</nav>`; }
function welcome() {
    if (!onboarding)
        return `<section class="page onboarding-page"><div class="welcome-hero"><div class="welcome-ring">${icon('dumbbell', 58)}<span class="orbit-dot"></span></div><p class="eyebrow">BET ON YOUR BETTER SELF</p><h1 class="display-title">Your word.<br><em>Worth something.</em></h1><p class="page-subtitle">A gym habit with a little skin in the game.<br>Set a goal. Stake on it. Show up.</p></div><div class="welcome-features"><div>${icon('target')}<span>A weekly goal you choose</span></div><div>${icon('pin')}<span>30-minute, location-verified visits</span></div><div>${icon('wallet')}<span>Your stake back when you hit it</span></div></div><div class="stack"><button class="button primary" data-action="onboard">Make my commitment ${icon('arrowRight')}</button><button class="button ghost" data-action="demo">Explore the demo ${icon('arrowUpRight')}</button></div><p class="onboarding-disclaimer">£100 play-money wallet to start.<br>No real money. No card. No sign-in.</p></section>`;
    return `<section class="page onboarding-page"><div class="onboarding-step"><button class="icon-button" data-action="back-onboard" aria-label="Go back">${icon('arrowLeft')}</button><span class="eyebrow">YOUR COMMITMENT · ${onboarding} OF 3</span><div class="step-dots">${[1, 2, 3].map(i => `<i class="${i <= onboarding ? 'active' : ''}"></i>`).join('')}</div></div>${onboarding === 1 ? `<div class="page-heading"><h1 class="page-title">Start with you.</h1><p class="page-subtitle">What should we call you?</p></div><label class="field"><span class="field-label">YOUR NAME</span><input id="name" maxlength="40" placeholder="First name" autocomplete="given-name" value="${esc(draftName)}"></label><div class="notice">${icon('wallet')}<span>Your wallet starts with <strong>£100 in play money</strong>. There are no payments in this prototype.</span></div><button class="button primary" data-action="next-onboard">Find my gym ${icon('arrowRight')}</button>` : onboarding === 2 ? `<div class="page-heading"><h1 class="page-title">Your home turf.</h1><p class="page-subtitle">Choose your gym, then check the pin. Your visits need to be within 150 metres.</p></div><div id="gym-picker"></div><button class="button primary" data-action="next-onboard">Set my goal ${icon('arrowRight')}</button>` : `<div class="page-heading"><h1 class="page-title">Make it mean<br><em>something.</em></h1><p class="page-subtitle">Choose a promise you can keep.</p></div>${preferenceFields()}<div class="card commitment-preview"><p class="eyebrow">YOUR FIRST COMMITMENT</p><h2>${draft.target} sessions. ${money(draft.stakePence)} on you.</h2><p class="card-description">${esc(draft.gym.name)} · until Sunday midnight, London time. One qualifying session per day.</p></div><div class="notice">${icon('info')}<span>This week is already underway. Choose a target you can complete by Sunday. Your stake is locked immediately.</span></div><button class="button primary" data-action="finish-onboard">I’m in. Let’s go. ${icon('arrowRight')}</button>`}</section>`;
}
function preferenceFields() { return `<label class="field"><span class="field-label">SESSIONS PER WEEK</span><div class="segmented target-picker">${[1, 2, 3, 4, 5, 6, 7].map(n => `<button class="${draft.target === n ? 'active' : ''}" type="button" data-target="${n}" aria-pressed="${draft.target === n}">${n}</button>`).join('')}</div></label><label class="field"><span class="field-label">WEEKLY STAKE · PLAY MONEY</span><div class="stake-input"><span>£</span><input id="stake" type="number" inputmode="decimal" min="1" max="100" step="0.01" value="${draft.stakePence / 100}" aria-label="Weekly stake in pounds"></div></label><div class="stake-presets">${[5, 10, 20, 50].map(n => `<button class="chip ${draft.stakePence === n * 100 ? 'lime' : 'muted'}" data-stake="${n * 100}">£${n}</button>`).join('')}</div>`; }
function home() {
    const s = state!, c = s.commitment, time = now(), left = Math.max(0, c.target - c.completed), pct = Math.min(1, c.completed / c.target), ps = participants(s, time), pool = projectedPoolPence(ps) + s.rolloverPence;
    const strip = ['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => { const day = s.week.startsAt + i * 86400000 + 12 * 3600000; const done = s.sessions.some(v => v.counted && v.commitmentId === c.id && londonDay(v.startedAt) === londonDay(day)); return `<div class="day-pill ${done ? 'done' : ''} ${londonDay(day) === londonDay(time) ? 'today' : ''}"><span>${d}</span><span class="day-dot">${done ? icon('check', 14) : date(day, { day: 'numeric' })}</span></div>`; }).join('');
    const sessions = s.sessions.filter(v => v.endedAt !== null).slice(-3).reverse();
    return `<section class="page"><div class="page-heading"><p class="greeting">Let’s keep that promise, ${esc(s.profile.name)}.</p><h1 class="page-title">Back yourself<span class="text-lime">.</span></h1></div><div class="card progress-card"><div class="card-header"><span class="eyebrow">THIS WEEK</span><span class="chip muted">${date(s.week.startsAt)} – ${date(s.week.endsAt - 1)}</span></div><div class="progress-ring" role="img" aria-label="${c.completed} of ${c.target} sessions completed"><svg viewBox="0 0 220 220"><circle class="ring-track" cx="110" cy="110" r="96"/><circle class="ring-value" cx="110" cy="110" r="96" stroke-dasharray="603.19" stroke-dashoffset="${603.19 * (1 - pct)}"/></svg><div class="ring-copy"><span class="ring-number">${c.completed}<span> / ${c.target}</span></span><span class="ring-label">sessions completed</span><span class="chip lime">${left ? `${left} more. You’ve got this.` : 'Promise kept. ✓'}</span></div></div><div class="week-strip">${strip}</div><div class="progress-footer"><span>${icon('clock', 13)} Settles Sunday midnight</span><span>London time</span></div></div><button class="button primary checkin-cta" data-tab="checkin">${icon('pin', 18)} ${active() ? 'View active session' : 'Check in at your gym'} ${icon('arrowRight', 18)}</button>${c.status === 'unfunded' ? '<div class="notice"><span>This week needs funding. Add play money in the Prototype lab to activate your commitment.</span></div>' : ''}<div class="stats-grid"><button class="stat-card" data-action="wallet"><span class="stat-label">${icon('wallet', 16)} Available wallet</span><strong class="stat-value">${money(walletBalance(s.ledger, s.profile.id))}</strong><span class="stat-foot">${money(c.status === 'active' ? c.stakePence : 0)} staked this week</span></button><div class="stat-card"><span class="stat-label">${icon('flame', 16)} Winning streak</span><strong class="stat-value">${s.profile.streak}<small> weeks</small></strong><span class="stat-foot">Keep showing up</span></div></div><div class="card pool-card"><div class="pool-copy"><span class="eyebrow">POTENTIAL WEEKLY POOL</span><strong class="pool-amount">${money(pool)}</strong><p>Keep your promise. Share the rewards.</p></div><div class="pool-orbit" aria-hidden="true">${icon('bolt', 30)}</div><div class="pool-footer"><span>${ps.length} members · ${s.bots.length} simulated</span><button class="section-link" data-tab="leaderboard">View league ${icon('arrowUpRight', 14)}</button></div></div><div class="section-header"><h2 class="section-title">Your home turf</h2><button class="section-link" data-tab="settings">Edit ${icon('chevronRight', 14)}</button></div><div class="card gym-card">${miniMap()}<div class="gym-details"><div class="row-copy"><strong class="row-title">${esc(c.gym.name)}</strong><p class="row-subtitle">${esc(c.gym.address)}</p></div><span class="gym-pin">${icon('pin', 19)}</span></div></div><div class="section-header"><h2 class="section-title">Recent activity</h2><span class="chip muted">${s.sessions.filter(v => v.counted).length} visits</span></div>${sessions.length ? `<div class="card activity-card">${sessions.map(sessionRow).join('')}</div>` : `<div class="empty-state">${icon('dumbbell', 26)}<p>Your first visit starts a new habit.</p></div>`}<p class="fine-print">Pool values are estimates until settlement. All funds are simulated.</p></section>`;
}
function sessionRow(v: Session) { return `<div class="activity-row"><span class="activity-icon ${v.counted ? 'success' : ''}">${icon(v.counted ? 'check' : 'clock', 16)}</span><div class="row-copy"><strong class="row-title">${v.counted ? 'Commitment kept' : v.endReason === 'daily_limit' ? 'Daily visit already counted' : 'Visit didn’t qualify'}</strong><p class="row-subtitle">${date(v.startedAt, { weekday: 'short', day: 'numeric', month: 'short' })} · ${Math.floor(v.verifiedMs / 60000)} min ${v.mode === 'demo' ? '· demo' : ''}</p></div><span class="chip ${v.counted ? 'lime' : 'muted'}">${v.counted ? '+1 session' : 'No count'}</span></div>`; }
function checkin() {
    const s = state!, v = active();
    return `<section class="page"><div class="page-heading"><p class="eyebrow">SHOWING UP IS THE WHOLE POINT</p><h1 class="page-title">${v ? 'You’re in.<br><em>Stay with it.</em>' : 'Ready to<br><em>show up?</em>'}</h1><p class="page-subtitle">${v ? 'Keep this app open while you train. Verified time counts towards your 30-minute visit.' : 'Get to your gym. We’ll take it from there.'}</p></div><div class="card gym-card">${miniMap()}<div class="gym-details"><div class="row-copy"><strong class="row-title">${esc(s.commitment.gym.name)}</strong><p class="row-subtitle">${esc(s.commitment.gym.address)}</p></div><span class="chip lime">150m zone</span></div></div>${v ? `<div class="card session-timer"><span class="chip ${v.evidencePaused ? 'orange' : 'lime'}">${icon(v.evidencePaused ? 'pause' : 'shield', 13)} ${v.evidencePaused ? 'Location paused' : 'Location verified'} ${v.mode === 'demo' ? '· demo' : ''}</span><strong class="timer-number" data-session-time>${duration(v.verifiedMs)}</strong><span class="timer-label">verified minutes on site</span><div class="session-progress"><span style="width:${Math.min(100, v.verifiedMs / 18000)}%"></span></div><p class="card-description" data-session-copy>${v.verifiedMs >= 1800000 ? '30 minutes verified. Your visit will count at checkout.' : '30 minutes makes it count. You can check out at any time.'}</p></div><button class="button primary" data-action="checkout" ${busy ? 'disabled' : ''}>${icon('check')} ${busy ? 'Verifying checkout…' : 'Finish my session'}</button><div class="notice">${icon('info')}<span>Leaving the gym ends your session at the last verified location. A hidden or closed app cannot verify your time.</span></div>` : `<div class="checkin-rules"><div>${icon('pin')}<p><strong>Be within 150 metres</strong><span>of your registered gym pin.</span></p></div><div>${icon('clock')}<p><strong>Stay for 30 minutes</strong><span>Keep the app open for location checks.</span></p></div><div>${icon('check')}<p><strong>One visit each day</strong><span>Build consistency, one session at a time.</span></p></div></div>${locationMessage ? `<div class="notice location-notice" role="alert">${icon('info')}<span>${esc(locationMessage)}</span></div>` : ''}<button class="button primary" data-action="start" ${busy || s.commitment.status !== 'active' ? 'disabled' : ''}>${icon('pin')} ${busy ? 'Finding your location…' : 'Verify location & check in'}</button><p class="fine-print">We ask for location only when you check in. Your session history is stored on this device.</p>`}</section>`;
}
function leaderboard() {
    const s = state!, rows = rankParticipants(participants(s, now()), ranking), winners = rows.filter(r => r.completed >= r.target), last = s.settlements.at(-1);
    return `<section class="page"><div class="page-heading"><p class="eyebrow">A LITTLE FRIENDLY ACCOUNTABILITY</p><h1 class="page-title">The keep-your-<br><em>word club.</em></h1><p class="page-subtitle">${s.bots.length} simulated members. One shared goal: show up.</p></div><div class="card league-summary"><div><span class="stat-label">Promises kept</span><strong class="summary-value">${winners.length}<small> / ${rows.length}</small></strong></div><div><span class="stat-label">Potential pool</span><strong class="summary-value">${money(projectedPoolPence(rows) + s.rolloverPence)}</strong></div></div><div class="segmented league-tabs"><button class="${ranking === 'progress' ? 'active' : ''}" data-rank="progress">This week</button><button class="${ranking === 'streak' ? 'active' : ''}" data-rank="streak">Winning streaks</button></div><div class="rank-list">${rows.map((r, i) => `<div class="rank-row ${r.isBot ? '' : 'is-you'}"><span class="rank-number">${i + 1}</span><span class="rank-avatar" style="--avatar-color:${r.color}">${esc(r.initials)}</span><div class="rank-copy"><strong>${esc(r.name)} ${r.isBot ? '' : '<span class="chip lime">You</span>'}</strong><span>${r.isBot ? 'Simulated member' : 'Your commitment'} · ${money(r.stakePence)} stake</span></div><div class="rank-value"><strong>${ranking === 'streak' ? `${r.streak} ${icon('flame', 12)}` : `${r.completed}<span>/${r.target}</span>`}</strong><span>${ranking === 'streak' ? 'weeks' : r.completed >= r.target ? 'Goal hit ✓' : 'sessions'}</span></div></div>`).join('')}</div>${last ? `<div class="section-header"><h2 class="section-title">Last week’s winners</h2><span class="chip lime">${money(last.poolPence)} shared</span></div><div class="card"><p class="card-description">${last.winnerIds.length} promises kept. ${last.loserIds.length} forfeited stakes. ${last.winnerIds.includes(s.profile.id) ? `You earned ${money(last.rewards[s.profile.id] ?? 0)} from the pool.` : 'A fresh week is a fresh start.'}</p></div>` : ''}<p class="fine-print">The league is simulated for this prototype. Rankings update as scheduled demo visits happen.</p></section>`;
}
function settings() {
    const s = state!;
    return `<section class="page"><div class="page-heading"><p class="eyebrow">MAKE IT WORK FOR YOU</p><h1 class="page-title">Your next<br><em>commitment.</em></h1><p class="page-subtitle">Changes apply next week, from ${date(s.week.endsAt, { weekday: 'long', day: 'numeric', month: 'short' })}. This week’s promise stays locked.</p></div>${s.profile.pendingPreferences ? '<div class="notice"><span>Your changes are queued for next week. Save again to update them.</span></div>' : ''}<div class="settings-section"><h2 class="section-title">Home gym</h2><div id="gym-picker"></div></div>${preferenceFields()}<button class="button primary" data-action="save-settings">Save for next week ${icon('check')}</button><div class="section-header"><h2 class="section-title">Your wallet</h2><span class="chip muted">Simulated GBP</span></div><button class="card wallet-summary" data-action="wallet"><div><span class="stat-label">Available balance</span><strong class="wallet-amount">${money(walletBalance(s.ledger, s.profile.id))}</strong></div>${icon('chevronRight')}</button><div class="section-header"><h2 class="section-title">Prototype</h2></div><div class="card settings-links"><button class="list-row" data-action="lab"><span>${icon('bolt')} Prototype lab</span>${icon('chevronRight')}</button><button class="list-row" data-action="install"><span>${icon('plus')} Add to home screen</span>${icon('chevronRight')}</button><button class="list-row" data-action="how"><span>${icon('info')} How the pool works</span>${icon('chevronRight')}</button><button class="list-row" data-action="reset"><span class="text-orange">${icon('refresh')} Reset this device’s prototype</span>${icon('chevronRight')}</button></div><p class="fine-print">GymStake · v0.1<br>Your data stays in this browser. All money is play money.</p></section>`;
}
function render() {
    cleanupPicker?.();
    cleanupPicker = null;
    root.innerHTML = shell(state ? tab === 'home' ? home() : tab === 'checkin' ? checkin() : tab === 'leaderboard' ? leaderboard() : settings() : welcome());
    const picker = document.querySelector<HTMLElement>('#gym-picker');
    if (picker)
        cleanupPicker = mountGymPicker(picker, draft.gym, gym => { draft.gym = gym; });
}
function openModal(title: string, content: string) {
    document.querySelector('.modal-backdrop')?.remove();
    const previous = document.activeElement as HTMLElement | null;
    const el = document.createElement('div');
    el.className = 'modal-backdrop';
    el.innerHTML = `<section class="modal" role="dialog" aria-modal="true" aria-label="${esc(title)}" tabindex="-1"><div class="modal-header"><h2>${title}</h2><button class="icon-button" data-action="close-modal" aria-label="Close dialog">${icon('close')}</button></div>${content}</section>`;
    const close = () => { el.remove(); labOpen = false; previous?.focus(); };
    el.addEventListener('click', e => { if (e.target === el)
        close(); });
    el.addEventListener('keydown', e => { if (e.key === 'Escape')
        close(); if (e.key === 'Tab') {
        const focusable = Array.from(el.querySelectorAll<HTMLElement>('button,a,input,[tabindex="0"]'));
        const first = focusable[0], last = focusable.at(-1);
        if (e.shiftKey && document.activeElement === first) {
            e.preventDefault();
            last?.focus();
        }
        else if (!e.shiftKey && document.activeElement === last) {
            e.preventDefault();
            first?.focus();
        }
    } });
    document.body.append(el);
    el.querySelector<HTMLElement>('button')?.focus();
}
function lab() { labOpen = true; openModal('Prototype lab', `<p class="card-description">Try the full loop with play money and explicitly simulated visits. These controls move this device’s demo clock.</p><div class="lab-actions stack"><button class="button secondary" data-action="demo-visit">${icon('dumbbell')} Add a 30-minute demo visit</button><button class="button secondary" data-action="demo-settle">${icon('calendar')} Settle this week & start the next</button><button class="button secondary" data-action="topup">${icon('plus')} Add £50 in play money</button></div><p class="fine-print">Demo visits are labeled in your history. Location check-ins use the real browser clock.</p>`); }
function captureDraft() { const stake = document.querySelector<HTMLInputElement>('#stake'); if (stake) {
    const amount = Number(stake.value);
    if (!stake.value || !Number.isFinite(amount) || amount < 1 || amount > 100 || Math.abs(amount * 100 - Math.round(amount * 100)) > 0.000001)
        throw new Error('Choose a stake from £1 to £100, with no more than two decimal places.');
    draft.stakePence = Math.round(amount * 100);
} }
function stopWatch() { if (watch !== null)
    navigator.geolocation?.clearWatch(watch); watch = null; if (geoPoll)
    clearInterval(geoPoll); geoPoll = null; }
function fix(position: GeolocationPosition): PositionFix { return { lat: position.coords.latitude, lng: position.coords.longitude, accuracy: position.coords.accuracy, timestamp: position.timestamp }; }
function getPosition(): Promise<PositionFix> { return new Promise((resolve, reject) => { if (!navigator.geolocation)
    return reject(new Error('Geolocation is unavailable in this browser.')); navigator.geolocation.getCurrentPosition(p => resolve(fix(p)), reject, { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }); }); }
function geoError(error: GeolocationPositionError | Error) { return 'code' in error && error.code === 1 ? 'Location permission is off. Enable location for this site in your browser settings, then try again.' : 'code' in error && error.code === 3 ? 'Location timed out. Move to an open area at your gym and try again.' : 'We couldn’t get a reliable location. Check your device location settings and try again.'; }
function onFix(p: PositionFix) { if (!state || !active() || document.visibilityState !== 'visible')
    return; const v = active()!; if (v.mode === 'demo')
    return; const next = updateSession(v, p, Date.now()); state = recordSession(state, next); persist(); if (next.endedAt !== null) {
    stopWatch();
    toast(next.counted ? 'You left the gym. Your session counted.' : 'You left before 30 verified minutes. This visit didn’t count.');
    render();
}
else if (v.evidencePaused !== next.evidencePaused && tab === 'checkin')
    render(); }
function monitor() { stopWatch(); if (!active() || active()!.mode === 'demo' || !navigator.geolocation)
    return; watch = navigator.geolocation.watchPosition(p => onFix(fix(p)), () => { if (state && active()) {
    state = recordSession(state, pauseSession(active()!));
    persist();
    if (tab === 'checkin')
        render();
} }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }); geoPoll = setInterval(() => { if (document.visibilityState === 'visible' && active())
    getPosition().then(onFix).catch(() => { if (state && active()) {
        state = recordSession(state, pauseSession(active()!));
        persist();
    } }); }, 20000); }
async function begin() { if (!state || busy)
    return; state = advanceState(state, now()); if (state.simulationNow !== null) {
    toast('Demo clock is active. Reset the prototype to use live location check-ins.');
    return;
} if (active()) {
    tab = 'checkin';
    render();
    return;
} if (state.sessions.some(s => s.counted && londonDay(s.startedAt) === londonDay(Date.now()))) {
    locationMessage = 'You’ve already counted a visit today. Come back tomorrow for your next session.';
    render();
    return;
} busy = true; locationMessage = ''; render(); try {
    const p = await getPosition();
    const verification = verifyPosition(state.commitment.gym, p, Date.now());
    if (!verification.ok) {
        locationMessage = verification.reason === 'outside' ? `You’re ${Math.round(verification.distanceMeters)}m from your gym. Move within 150m to check in.` : verification.reason === 'poor_accuracy' ? `Location accuracy is ±${Math.round(p.accuracy)}m. We need 100m or better. Try again near a window or outside.` : 'Your location is stale or unreliable. Try again for a fresh reading.';
    }
    else {
        state = recordSession(state, startSession({ userId: state.profile.id, commitmentId: state.commitment.id, gym: state.commitment.gym, position: p, now: Date.now() }));
        persist();
        monitor();
        toast('Location verified. Your session has started.');
    }
}
catch (e) {
    locationMessage = geoError(e as GeolocationPositionError);
}
finally {
    busy = false;
    render();
} }
async function checkout() { if (!state || busy || !active())
    return; busy = true; render(); const session = active()!; let p: PositionFix | null = null; try {
    p = await getPosition();
}
catch { } const t = Date.now(); if (!state || active()?.id !== session.id) {
    busy = false;
    return;
} const next = finishSession(active()!, p, Math.min(t, state.week.endsAt)); state = recordSession(state, next); stopWatch(); persist(); busy = false; toast(next.counted ? 'Promise kept. +1 qualifying session.' : 'Visit saved. 30 verified minutes are needed to count.'); render(); }
function demoVisit() { if (!state)
    return; if (state.commitment.status !== 'active')
    throw new Error('Add enough play money to fund this week before adding a visit.'); if (active())
    throw new Error('Finish your active session before adding a demo visit.'); let time = state.week.startsAt + 12 * 3600000; while (state.sessions.some(s => s.counted && londonDay(s.startedAt) === londonDay(time)))
    time += 86400000; if (time + 1800000 >= state.week.endsAt)
    throw new Error('Every day this week already has a qualifying visit.'); let v = startSession({ userId: state.profile.id, commitmentId: state.commitment.id, gym: state.commitment.gym, position: null, now: time, mode: 'demo' }); for (let i = 1; i <= 30; i++)
    v = updateSession(v, null, time + i * 60000); v = finishSession(v, null, time + 1800000); state = recordSession(state, v); state.simulationNow = Math.max(now(), time + 1800000); persist(); render(); toast('Demo visit added. +1 session.'); }
function demo() { state = initializeState({ name: 'Alex', preferences: { gym: { ...GYMS[0] }, target: 3, stakePence: 1000 } }, Date.now()); state.profile.streak = 4; demoVisit(); demoVisit(); state.simulationNow = null; persist(); tab = 'home'; render(); }
function wallet() { const s = state!; openModal('Your play-money wallet', `<strong class="wallet-amount">${money(walletBalance(s.ledger, s.profile.id))}</strong><p class="card-description">Available balance · ${money(s.commitment.status === 'active' ? s.commitment.stakePence : 0)} currently staked</p><div class="wallet-ledger">${s.ledger.slice().reverse().map(l => `<div class="list-row"><div class="row-copy"><strong class="row-title">${({ opening: 'Starting balance', stake_lock: 'Weekly stake locked', stake_return: 'Stake returned', pool_reward: 'Pool reward', top_up: 'Play-money top-up' })[l.kind]}</strong><span class="row-subtitle">${date(l.createdAt)} · simulated</span></div><strong class="${l.amountPence > 0 ? 'text-lime' : ''}">${l.amountPence > 0 ? '+' : ''}${money(l.amountPence)}</strong></div>`).join('')}</div>`); }
document.addEventListener('click', async (e) => {
    const target = (e.target as HTMLElement).closest<HTMLElement>('[data-tab],[data-action],[data-target],[data-stake],[data-rank]');
    if (!target)
        return;
    try {
        if (target.dataset.tab) {
            tab = target.dataset.tab;
            if (tab === 'settings' && state)
                draft = structuredClone(state.profile.pendingPreferences ?? state.profile.preferences);
            render();
            window.scrollTo({ top: 0, behavior: 'smooth' });
            return;
        }
        if (target.dataset.target) {
            captureDraft();
            draft.target = Number(target.dataset.target);
            render();
            return;
        }
        if (target.dataset.stake) {
            draft.stakePence = Number(target.dataset.stake);
            render();
            return;
        }
        if (target.dataset.rank) {
            ranking = target.dataset.rank as typeof ranking;
            render();
            return;
        }
        switch (target.dataset.action) {
            case 'onboard':
                onboarding = 1;
                render();
                document.querySelector<HTMLInputElement>('#name')?.focus();
                break;
            case 'back-onboard':
                onboarding = Math.max(0, onboarding - 1);
                render();
                break;
            case 'next-onboard':
                if (onboarding === 1) {
                    draftName = document.querySelector<HTMLInputElement>('#name')!.value.trim();
                    if (!draftName)
                        throw new Error('Enter your name to get started.');
                }
                onboarding++;
                render();
                window.scrollTo(0, 0);
                break;
            case 'finish-onboard':
                captureDraft();
                state = initializeState({ name: draftName, preferences: draft }, Date.now());
                persist();
                render();
                toast('Your commitment is set. Let’s show up.');
                break;
            case 'demo':
                demo();
                break;
            case 'start':
                await begin();
                break;
            case 'checkout':
                await checkout();
                break;
            case 'save-settings':
                captureDraft();
                state = setPreferences(state!, draft);
                persist();
                render();
                toast('Saved. Your new commitment starts next Monday.');
                break;
            case 'wallet':
                wallet();
                break;
            case 'lab':
                lab();
                break;
            case 'close-modal':
                document.querySelector('.modal-backdrop')?.remove();
                labOpen = false;
                break;
            case 'demo-visit':
                demoVisit();
                if (labOpen)
                    lab();
                break;
            case 'demo-settle': {
                const s = state!;
                state = advanceState(s, s.week.endsAt);
                state.simulationNow = state.week.startsAt + 12 * 3600000;
                persist();
                render();
                const settlement = state.settlements.at(-1)!;
                document.querySelector('.modal-backdrop')?.remove();
                labOpen = false;
                openModal(settlement.winnerIds.includes(state.profile.id) ? 'You kept your word.' : 'A fresh week. A fresh promise.', `<div class="settlement-icon">${icon(settlement.winnerIds.includes(state.profile.id) ? 'trophy' : 'target', 50)}</div><p class="card-description">${settlement.winnerIds.includes(state.profile.id) ? `Your ${money(s.commitment.stakePence)} stake came back, plus ${money(settlement.rewards[state.profile.id] ?? 0)} from the pool.` : s.commitment.status === 'unfunded' ? 'Your unfunded commitment was excluded from settlement.' : `Your ${money(s.commitment.stakePence)} stake joined the ${money(settlement.poolPence)} pool for ${settlement.winnerIds.length} winners.`}</p><p class="fine-print">Your next week has started. All amounts are simulated.</p><button class="button primary" data-action="close-modal">Let’s go ${icon('arrowRight')}</button>`);
                stopWatch();
                break;
            }
            case 'topup':
                state = topUp(state!, now());
                persist();
                render();
                toast('£50 in play money added.');
                break;
            case 'install':
                openModal('Take your commitment with you', `<p class="card-description">On Safari, tap Share → Add to Home Screen.<br><br>On Chrome, open the browser menu → Install app or Add to Home screen.<br><br>Your wallet and commitment stay on this device.</p>`);
                break;
            case 'how':
                openModal('Your promise. Our pool.', `<div class="stack"><p class="card-description">I set my target and stake before the week starts. My stake is locked.</p><p class="card-description">I check in at my gym and stay for 30 verified minutes. One visit can count per day.</p><p class="card-description">At Sunday midnight in London, hitting my target returns my stake. Missed stakes form a pool split equally between winners, down to the penny.</p><p class="card-description">If no one wins, the pool rolls into next week. This prototype settles missed weeks when I reopen it.</p></div>`);
                break;
            case 'reset':
                openModal('Start fresh on this device?', `<p class="card-description">This clears your local profile, wallet, sessions, and demo clock.</p><div class="button-row"><button class="button secondary" data-action="close-modal">Keep my progress</button><button class="button danger" data-action="confirm-reset">Reset prototype</button></div>`);
                break;
            case 'confirm-reset':
                stopWatch();
                localStorage.removeItem('gymstake:v1');
                state = null;
                onboarding = 0;
                labOpen = false;
                locationMessage = '';
                document.querySelector('.modal-backdrop')?.remove();
                render();
                break;
        }
    }
    catch (error) {
        toast(error instanceof Error ? error.message : 'Something went wrong. Try again.');
    }
});
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden' && state && active()) {
    state = recordSession(state, pauseSession(active()!));
    persist();
}
else if (document.visibilityState === 'visible' && state) {
    state = advanceState(state, now());
    persist();
    render();
    monitor();
} });
window.addEventListener('storage', e => { if (e.key === 'gymstake:v1') {
    state = loadState();
    if (state) {
        state = advanceState(state, now());
        if (active())
            state = recordSession(state, pauseSession(active()!));
    }
    stopWatch();
    render();
    monitor();
} });
setInterval(() => { if (!state)
    return; const next = advanceState(state, now()); if (next !== state) {
    state = next;
    persist();
    stopWatch();
    render();
} const v = active(); if (v) {
    const el = document.querySelector('[data-session-time]');
    if (el)
        el.textContent = duration(v.verifiedMs);
    const bar = document.querySelector<HTMLElement>('.session-progress span');
    if (bar)
        bar.style.width = `${Math.min(100, v.verifiedMs / 18000)}%`;
    const copy = document.querySelector('[data-session-copy]');
    if (copy && v.verifiedMs >= 1800000)
        copy.textContent = '30 minutes verified. Your visit will count at checkout.';
} }, 1000);
if (state) {
    state = advanceState(state, now());
    if (active())
        state = recordSession(state, pauseSession(active()!));
    persist();
}
render();
monitor();
if ('serviceWorker' in navigator && import.meta.env.PROD)
    navigator.serviceWorker.register('/sw.js').catch(() => { });
