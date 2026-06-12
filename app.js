/* ============================================================
 * slimmate — 運動記録 × ゆるキャラ × スタンプカード PWA
 * すべて端末内 (localStorage) で完結。ログイン不要。
 * ============================================================ */

/* ---------- 運動種別と METs (運動強度) ---------- */
const EXERCISES = [
  { id: "walk", name: "ウォーキング", emoji: "🚶", mets: 3.5 },
  { id: "run", name: "ランニング", emoji: "🏃", mets: 8.0 },
  { id: "bike", name: "自転車", emoji: "🚲", mets: 6.0 },
  { id: "jumprope", name: "縄跳び", emoji: "🪢", mets: 10.0 },
  { id: "strength", name: "筋トレ", emoji: "💪", mets: 5.0 },
  { id: "yoga", name: "ヨガ/ストレッチ", emoji: "🧘", mets: 2.8 },
  { id: "swim", name: "水泳", emoji: "🏊", mets: 7.0 },
  { id: "dance", name: "ダンス", emoji: "💃", mets: 5.0 },
];
const exById = (id) => EXERCISES.find((e) => e.id === id);

/* ---------- 状態管理 (localStorage) ---------- */
const STORE_KEY = "slimmate.v1";
const DEFAULT_STATE = {
  profile: {
    weightKg: null,
    dailyGoalKcal: 150,
    nudge: { enabled: false, startHour: 10, endHour: 18, intervalMin: 10 },
    // 🔔 あるるんアラーム設定
    alarm: { startHour: 12, startMin: 0, intervalMin: 10, onSnackEat: true },
    // 🔊 あるるんの声（高さ・速さを好みで調整）
    voice: { pitch: 2.0, rate: 1.1 },
    onboarded: false,
  },
  logs: [], // { id, date:"YYYY-MM-DD", typeId, minutes, kcal, memo, ts }
  snacks: [], // { date, action:"resisted"|"ate", ts }
  foods: [], // { id, date, name, kcal, memo, photo, ts }
  alarmRun: { active: false, nextFireTs: 0 }, // あるるんアラームの稼働状態
};

let state = loadState();

// 読み込んだデータにDEFAULTを補完して正規化（保存データ・復元データ共通）
function normalizeState(parsed) {
  const pp = parsed.profile || {};
  return {
    ...structuredClone(DEFAULT_STATE),
    ...parsed,
    profile: { ...DEFAULT_STATE.profile, ...pp,
      nudge: { ...DEFAULT_STATE.profile.nudge, ...(pp.nudge || {}) },
      alarm: { ...DEFAULT_STATE.profile.alarm, ...(pp.alarm || {}) },
      voice: { ...DEFAULT_STATE.profile.voice, ...(pp.voice || {}) } },
    alarmRun: { ...DEFAULT_STATE.alarmRun, ...(parsed.alarmRun || {}) },
  };
}
function loadState() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return structuredClone(DEFAULT_STATE);
    return normalizeState(JSON.parse(raw));
  } catch {
    return structuredClone(DEFAULT_STATE);
  }
}
function save() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); return true; }
  catch { return false; } // 容量オーバー（写真の入れすぎ等）
}

/* ---------- 日付ユーティリティ ---------- */
function ymd(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function addDays(dateStr, n) {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() + n);
  return ymd(d);
}

/* ---------- 計算ロジック ---------- */
// 消費カロリー = METs × 体重(kg) × 時間(h) × 1.05
function calcKcal(mets, weightKg, minutes) {
  if (!weightKg || !minutes) return 0;
  return Math.round(mets * weightKg * (minutes / 60) * 1.05);
}
function kcalOn(dateStr) {
  return state.logs.filter((l) => l.date === dateStr).reduce((s, l) => s + l.kcal, 0);
}
function minutesOn(dateStr) {
  return state.logs.filter((l) => l.date === dateStr).reduce((s, l) => s + l.minutes, 0);
}
function isAchieved(dateStr) {
  return kcalOn(dateStr) >= state.profile.dailyGoalKcal;
}
function achievedDates() {
  const set = new Set();
  const byDate = {};
  state.logs.forEach((l) => { byDate[l.date] = (byDate[l.date] || 0) + l.kcal; });
  Object.keys(byDate).forEach((d) => { if (byDate[d] >= state.profile.dailyGoalKcal) set.add(d); });
  return set;
}
// 連続達成日数。今日未達なら昨日からカウント（その日のうちは途切れない）
function currentStreak() {
  const done = achievedDates();
  const today = ymd();
  let cursor = done.has(today) ? today : addDays(today, -1);
  let streak = 0;
  while (done.has(cursor)) { streak++; cursor = addDays(cursor, -1); }
  return streak;
}
function bestStreak() {
  const done = [...achievedDates()].sort();
  let best = 0, run = 0, prev = null;
  for (const d of done) {
    if (prev && addDays(prev, 1) === d) run++; else run = 1;
    best = Math.max(best, run);
    prev = d;
  }
  return best;
}

/* ---------- ゆるキャラ「あるるん」SVG ---------- */
// mood: sleepy / cheer / happy / proud / worried
function mascotSVG(mood) {
  const face = {
    sleepy: `<path d="M44 60 q6 4 12 0" stroke="#2d3142" stroke-width="3" fill="none" stroke-linecap="round"/>
             <path d="M64 60 q6 4 12 0" stroke="#2d3142" stroke-width="3" fill="none" stroke-linecap="round"/>
             <ellipse cx="60" cy="74" rx="5" ry="4" fill="#2d3142"/>
             <text x="86" y="40" font-size="13" fill="#9aa">z</text><text x="94" y="30" font-size="16" fill="#9aa">Z</text>`,
    cheer: `<circle cx="50" cy="58" r="4.5" fill="#2d3142"/><circle cx="70" cy="58" r="4.5" fill="#2d3142"/>
            <path d="M52 72 q8 7 16 0" stroke="#2d3142" stroke-width="3" fill="none" stroke-linecap="round"/>
            <circle cx="40" cy="68" r="5" fill="#ffb3b3" opacity="0.7"/><circle cx="80" cy="68" r="5" fill="#ffb3b3" opacity="0.7"/>`,
    happy: `<path d="M44 56 q6 -6 12 0" stroke="#2d3142" stroke-width="3" fill="none" stroke-linecap="round"/>
            <path d="M64 56 q6 -6 12 0" stroke="#2d3142" stroke-width="3" fill="none" stroke-linecap="round"/>
            <path d="M48 70 q12 14 24 0 q-12 6 -24 0" fill="#2d3142"/>
            <circle cx="38" cy="66" r="5.5" fill="#ffb3b3" opacity="0.8"/><circle cx="82" cy="66" r="5.5" fill="#ffb3b3" opacity="0.8"/>`,
    proud: `<circle cx="50" cy="58" r="4.5" fill="#2d3142"/><circle cx="70" cy="58" r="4.5" fill="#2d3142"/>
            <path d="M50 70 q10 10 20 0" stroke="#2d3142" stroke-width="3.5" fill="none" stroke-linecap="round"/>
            <circle cx="38" cy="66" r="5.5" fill="#ffb3b3" opacity="0.8"/><circle cx="82" cy="66" r="5.5" fill="#ffb3b3" opacity="0.8"/>
            <text x="84" y="34" font-size="18">✨</text><text x="20" y="40" font-size="14">✨</text>`,
    worried: `<circle cx="50" cy="60" r="4.5" fill="#2d3142"/><circle cx="70" cy="60" r="4.5" fill="#2d3142"/>
              <path d="M42 52 q6 -3 12 1" stroke="#2d3142" stroke-width="2.5" fill="none" stroke-linecap="round"/>
              <path d="M66 53 q6 -4 12 -1" stroke="#2d3142" stroke-width="2.5" fill="none" stroke-linecap="round"/>
              <path d="M52 74 q8 -5 16 0" stroke="#2d3142" stroke-width="3" fill="none" stroke-linecap="round"/>
              <ellipse cx="84" cy="64" rx="4" ry="6" fill="#9ad7f2" opacity="0.6"/>`,
  }[mood] || "";
  return `<svg class="mascot" viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="ゆるキャラ あるるん">
    <ellipse cx="60" cy="108" rx="30" ry="6" fill="#000" opacity="0.06"/>
    <path d="M30 30 q6 -16 14 -2" stroke="#7bd3cb" stroke-width="5" fill="none" stroke-linecap="round"/>
    <circle cx="44" cy="22" r="6" fill="#8fdcd4"/>
    <ellipse cx="60" cy="64" rx="40" ry="38" fill="#a8e6df"/>
    <ellipse cx="60" cy="66" rx="34" ry="32" fill="#c9f2ed"/>
    ${face}
  </svg>`;
}

/* ---------- 進捗リング ---------- */
function ringSVG(pct) {
  const r = 54, c = 2 * Math.PI * r;
  const off = c * (1 - Math.min(pct, 1));
  return `<svg width="124" height="124" viewBox="0 0 124 124">
    <circle cx="62" cy="62" r="${r}" fill="none" stroke="#eef3f1" stroke-width="11"/>
    <circle cx="62" cy="62" r="${r}" fill="none" stroke="${pct >= 1 ? "#4ecdc4" : "#7bd3cb"}"
      stroke-width="11" stroke-linecap="round" stroke-dasharray="${c}" stroke-dashoffset="${off}"
      style="transition:stroke-dashoffset .6s ease"/>
  </svg>`;
}

/* ---------- 画面ルーティング ---------- */
let currentTab = "home";
let formDraft = { typeId: "run", minutes: 20, memo: "" };
let calMonth = null; // {y, m}

const view = document.getElementById("view");

function render() {
  if (!state.profile.onboarded) return renderOnboarding();
  document.querySelectorAll(".tab").forEach((t) =>
    t.classList.toggle("active", t.dataset.tab === currentTab)
  );
  const streak = currentStreak();
  const chip = document.getElementById("streakChip");
  chip.hidden = streak < 1;
  document.getElementById("streakChipNum").textContent = streak;

  if (currentTab === "home") renderHome();
  else if (currentTab === "log") renderLog();
  else if (currentTab === "food") renderFood();
  else if (currentTab === "stamps") renderStamps();
  else if (currentTab === "settings") renderSettings();
}

/* ===== Onboarding ===== */
function renderOnboarding() {
  document.getElementById("tabbar").style.visibility = "hidden";
  view.innerHTML = `
    <div class="onb">
      ${mascotSVG("cheer")}
      <h2>はじめまして、あるるんだよ🌱</h2>
      <p>キミの「スリムの相棒」になるよ。<br>まずは消費カロリー計算のために、<br>体重と1日の目標だけ教えてね。</p>
      <div class="card" style="text-align:left">
        <div class="field">
          <label>体重 (kg)</label>
          <input type="number" id="onbWeight" inputmode="decimal" placeholder="例: 60" />
          <div class="hint">消費カロリーの計算に使うよ。あとで変えられる！</div>
        </div>
        <div class="field">
          <label>1日の目標</label>
          <select id="onbGoal">
            <option value="100">ゆるめ（100 kcal ≒ 軽く20分）</option>
            <option value="150" selected>ふつう（150 kcal ≒ 30分）</option>
            <option value="250">しっかり（250 kcal ≒ ランニング30分）</option>
            <option value="400">ストイック（400 kcal）</option>
          </select>
        </div>
        <button class="btn btn-primary" id="onbStart">はじめる！</button>
      </div>
    </div>`;
  document.getElementById("onbStart").onclick = () => {
    const w = parseFloat(document.getElementById("onbWeight").value);
    if (!w || w < 20 || w > 300) { toast("体重を正しく入れてね🙏", "coral"); return; }
    state.profile.weightKg = w;
    state.profile.dailyGoalKcal = parseInt(document.getElementById("onbGoal").value, 10);
    state.profile.onboarded = true;
    save();
    document.getElementById("tabbar").style.visibility = "visible";
    currentTab = "home";
    render();
    setTimeout(() => bounceMascot(), 100);
  };
}

/* ===== Home ===== */
function moodForPct(pct) {
  if (pct >= 1) return "proud";
  if (pct >= 0.5) return "happy";
  if (pct > 0) return "cheer";
  return "sleepy";
}
function speechFor(pct, kcal, goal) {
  if (pct >= 1) return "目標達成！えらすぎ〜！🎉";
  if (pct >= 0.5) return `いい調子！あと${goal - kcal}kcal！`;
  if (pct > 0) return "その調子その調子〜♪";
  return "今日もちょっと動いてみる？";
}
function renderHome() {
  const goal = state.profile.dailyGoalKcal;
  const kcal = kcalOn(ymd());
  const mins = minutesOn(ymd());
  const pct = goal ? kcal / goal : 0;
  const todayLogs = state.logs.filter((l) => l.date === ymd());

  view.innerHTML = `
    <div class="hero">
      <div class="mascot-stage" id="mascotStage">${mascotSVG(moodForPct(pct))}</div>
      <div class="speech">${speechFor(pct, kcal, goal)}</div>
      <div class="mascot-name">あるるん</div>
    </div>

    <div class="card">
      <div class="ring-wrap">
        <div class="ring">
          ${ringSVG(pct)}
          <div class="ring-center">
            <div class="ring-kcal">${kcal}<small> kcal</small></div>
            <div class="ring-goal">/ ${goal} kcal</div>
          </div>
        </div>
        <div class="ring-stats">
          <div class="row"><div class="big">${mins}<span style="font-size:13px"> 分</span></div><div class="lbl">今日の運動時間</div></div>
          <div class="row"><div class="big">${todayLogs.length}<span style="font-size:13px"> 回</span></div><div class="lbl">今日の記録</div></div>
          <div class="row"><div class="big" style="color:${pct>=1?'#4ecdc4':'#ff6b6b'}">${Math.round(pct*100)}<span style="font-size:13px"> %</span></div><div class="lbl">目標達成率</div></div>
        </div>
      </div>
    </div>

    <div class="card">
      <h3 class="card-title">⚡ クイック記録</h3>
      <div class="quick-grid">
        ${EXERCISES.map((e) => `
          <button class="quick-chip" data-quick="${e.id}">
            <span class="e">${e.emoji}</span><span class="n">${e.name}</span>
          </button>`).join("")}
      </div>
      <div class="hint" style="font-size:11px;color:var(--ink-soft);margin-top:10px;font-weight:600">
        タップ → 時間を選ぶだけでサッと記録できるよ
      </div>
    </div>`;

  view.querySelectorAll("[data-quick]").forEach((b) => {
    b.onclick = () => { formDraft = { typeId: b.dataset.quick, minutes: 20, memo: "" }; currentTab = "log"; render(); };
  });
}

/* ===== Log (記録) ===== */
function renderLog() {
  const w = state.profile.weightKg;
  const ex = exById(formDraft.typeId);
  const kcal = calcKcal(ex.mets, w, formDraft.minutes);
  const todayLogs = state.logs.filter((l) => l.date === ymd()).slice().reverse();
  const minPresets = [10, 20, 30, 45, 60];

  view.innerHTML = `
    <div class="card">
      <h3 class="card-title">✏️ 運動を記録</h3>
      <div class="field">
        <label>運動の種類</label>
        <div class="type-grid">
          ${EXERCISES.map((e) => `
            <button class="type-opt ${e.id === formDraft.typeId ? "active" : ""}" data-type="${e.id}">
              <span class="e">${e.emoji}</span><span class="n">${e.name}</span>
            </button>`).join("")}
        </div>
      </div>
      <div class="field">
        <label>運動した時間</label>
        <div class="minutes-row">
          ${minPresets.map((m) => `<button class="min-chip ${m===formDraft.minutes?"active":""}" data-min="${m}">${m}分</button>`).join("")}
        </div>
        <input type="number" id="minInput" inputmode="numeric" value="${formDraft.minutes}" min="1" max="600" />
      </div>
      <div class="field">
        <label>メモ（任意）</label>
        <input type="text" id="memoInput" value="${escapeHtml(formDraft.memo)}" placeholder="例: 自転車で2時間走った / 距離5km / 坂道きつかった" />
        <div class="hint">距離・コース・体調など、自由に残せるよ📝</div>
      </div>
      <div class="kcal-preview">
        <span class="num">${kcal}</span><span class="unit"> kcal</span>
        <div class="sub">${ex.emoji} ${ex.name} ${formDraft.minutes}分の消費カロリー目安</div>
      </div>
      <button class="btn btn-primary" id="saveLog">この運動を記録する 💪</button>
    </div>

    <div class="card">
      <h3 class="card-title">📋 今日の記録</h3>
      ${todayLogs.length === 0
        ? `<div class="empty"><span class="big">🌱</span>まだ記録がないよ。<br>軽い運動からはじめよう！</div>`
        : todayLogs.map((l) => {
            const e = exById(l.typeId);
            return `<div class="log-item">
              <div class="log-emoji">${e ? e.emoji : "🏃"}</div>
              <div class="log-main">
                <div class="t">${e ? e.name : "運動"}</div>
                <div class="s">${l.minutes}分${l.memo ? ` ・ 📝 ${escapeHtml(l.memo)}` : ""}</div>
              </div>
              <div class="log-kcal">${l.kcal} kcal</div>
              <button class="log-del" data-del="${l.id}" aria-label="削除">✕</button>
            </div>`;
          }).join("")}
    </div>`;

  view.querySelectorAll("[data-type]").forEach((b) => {
    b.onclick = () => { formDraft.typeId = b.dataset.type; render(); };
  });
  view.querySelectorAll("[data-min]").forEach((b) => {
    b.onclick = () => { formDraft.minutes = parseInt(b.dataset.min, 10); render(); };
  });
  const minInput = document.getElementById("minInput");
  minInput.oninput = () => {
    const v = parseInt(minInput.value, 10);
    formDraft.minutes = isNaN(v) ? 0 : v;
    // カロリープレビューだけ更新（フォーカスを失わないよう全再描画しない）
    const ex2 = exById(formDraft.typeId);
    view.querySelector(".kcal-preview .num").textContent = calcKcal(ex2.mets, w, formDraft.minutes);
    view.querySelector(".kcal-preview .sub").textContent = `${ex2.emoji} ${ex2.name} ${formDraft.minutes}分の消費カロリー目安`;
    view.querySelectorAll(".min-chip").forEach((c) => c.classList.toggle("active", parseInt(c.dataset.min,10) === formDraft.minutes));
  };
  const memoInput = document.getElementById("memoInput");
  if (memoInput) memoInput.oninput = () => { formDraft.memo = memoInput.value; };
  document.getElementById("saveLog").onclick = saveLog;
  view.querySelectorAll("[data-del]").forEach((b) => {
    b.onclick = () => { state.logs = state.logs.filter((l) => l.id !== b.dataset.del); save(); render(); };
  });
}

function saveLog() {
  const ex = exById(formDraft.typeId);
  const mins = formDraft.minutes;
  if (!mins || mins < 1) { toast("運動時間を入れてね⏱️", "coral"); return; }
  const wasAchieved = isAchieved(ymd());
  const kcal = calcKcal(ex.mets, state.profile.weightKg, mins);
  state.logs.push({ id: uid(), date: ymd(), typeId: ex.id, minutes: mins, kcal, memo: (formDraft.memo || "").trim(), ts: Date.now() });
  formDraft.memo = "";
  save();
  const nowAchieved = isAchieved(ymd());
  if (!wasAchieved && nowAchieved) {
    currentTab = "home"; render();
    setTimeout(() => celebrate(), 120);
  } else {
    toast(`${ex.emoji} ${kcal}kcal 記録したよ！`, "mint");
    currentTab = "home"; render();
    setTimeout(bounceMascot, 100);
  }
}

/* ===== Stamps (スタンプカード) ===== */
// 🏆 紙吹雪が散った華やかなトロフィーのイラスト
function trophyStampSVG() {
  return `<svg class="trophy-stamp" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <rect x="3" y="7" width="4.5" height="4.5" rx="1.2" fill="#ff6b6b" transform="rotate(22 5 9)"/>
    <rect x="39" y="6" width="4.5" height="4.5" rx="1.2" fill="#4ecdc4" transform="rotate(-18 41 8)"/>
    <circle cx="6" cy="24" r="2.2" fill="#ffd166"/>
    <circle cx="42" cy="22" r="2.2" fill="#a78bfa"/>
    <rect x="5" y="37" width="4" height="4" rx="1.2" fill="#4ecdc4" transform="rotate(32 7 39)"/>
    <rect x="39" y="38" width="4" height="4" rx="1.2" fill="#ff6b6b" transform="rotate(-28 41 40)"/>
    <circle cx="13" cy="4" r="1.8" fill="#ff8fab"/>
    <circle cx="35" cy="44" r="1.8" fill="#ffd166"/>
    <path d="M23 2 l1 2.1 2.3.3-1.7 1.6.4 2.3-2-1.1-2 1.1.4-2.3L19.7 4.4 22 4.1z" fill="#ffd166"/>
    <path d="M16 9 h16 v6.5 a8 8 0 0 1 -16 0 z" fill="#f4c13a"/>
    <path d="M16 9 h16 v3 a8 8 0 0 1 -16 0 z" fill="#ffe79a"/>
    <path d="M16 11 h-3.4 a3.2 3.2 0 0 0 3.4 4.2 z" fill="#f4c13a"/>
    <path d="M32 11 h3.4 a3.2 3.2 0 0 1 -3.4 4.2 z" fill="#f4c13a"/>
    <ellipse cx="21" cy="13" rx="1.8" ry="3" fill="#fff6d6" opacity="0.7"/>
    <rect x="22" y="21.5" width="4" height="5" fill="#e0a92e"/>
    <rect x="18" y="26" width="12" height="3" rx="1.2" fill="#d99e2b"/>
    <rect x="15.5" y="29" width="17" height="4" rx="1.6" fill="#caa12a"/>
  </svg>`;
}

let trendMode = "week"; // "week" | "month"

function renderStamps() {
  const streak = currentStreak();
  const best = bestStreak();
  const done = achievedDates();
  const now = new Date();
  if (!calMonth) calMonth = { y: now.getFullYear(), m: now.getMonth() };
  const { y, m } = calMonth;

  // パンチカード（直近10日ぶんの達成スタンプ）
  const punches = [];
  for (let i = 9; i >= 0; i--) {
    const d = addDays(ymd(), -i);
    punches.push({ d, filled: done.has(d) });
  }

  // 📊 振り返り（週間/月間カロリーグラフ）
  const trendDays = trendMode === "week" ? 7 : 30;
  const trend = [];
  for (let i = trendDays - 1; i >= 0; i--) {
    const d = addDays(ymd(), -i);
    trend.push({ date: d, burned: kcalOn(d), intake: intakeOn(d) });
  }
  const maxVal = Math.max(1, ...trend.map((t) => Math.max(t.burned, t.intake)));
  const sumBurned = trend.reduce((s, t) => s + t.burned, 0);
  const sumIntake = trend.reduce((s, t) => s + t.intake, 0);
  const doneCount = trend.filter((t) => done.has(t.date)).length;
  const avgBurned = Math.round(sumBurned / trendDays);
  const bars = trend.map((t) => {
    const dd = new Date(t.date + "T00:00:00");
    const bh = Math.round((t.burned / maxVal) * 100);
    const ih = Math.round((t.intake / maxVal) * 100);
    const label = trendMode === "week"
      ? ["日", "月", "火", "水", "木", "金", "土"][dd.getDay()]
      : (t.date === ymd() || dd.getDate() % 5 === 0 ? `${dd.getDate()}` : "");
    const isToday = t.date === ymd();
    return `<div class="bar-col${isToday ? " now" : ""}">
      <div class="bars">
        <div class="bar burned" style="height:${bh}%" title="運動 ${t.burned}kcal"></div>
        <div class="bar intake" style="height:${ih}%" title="食事 ${t.intake}kcal"></div>
      </div>
      <div class="bar-lbl">${label}</div>
    </div>`;
  }).join("");
  const span = trendMode === "week" ? "この1週間" : "この30日";
  const summary = doneCount === 0
    ? `🌱 ${span}はまだ達成ゼロ。今日から1個トロフィー集めよう！`
    : `🎉 ${span}で <b>${doneCount}日</b> 目標達成！${trendMode === "week" && doneCount >= 5 ? " 絶好調だね！" : ""}`;

  // カレンダー
  const first = new Date(y, m, 1);
  const startDow = first.getDay();
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  const dows = ["日", "月", "火", "水", "木", "金", "土"];
  let cells = "";
  for (let i = 0; i < startDow; i++) cells += `<div class="cal-cell pad"></div>`;
  for (let d = 1; d <= daysInMonth; d++) {
    const ds = `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    const isDone = done.has(ds);
    const isToday = ds === ymd();
    cells += `<div class="cal-cell ${isDone ? "done" : ""} ${isToday ? "today" : ""}">
      ${isDone ? `<span class="stamp">${trophyStampSVG()}</span>` : d}
    </div>`;
  }
  const monthAchieved = [...done].filter((d) => d.startsWith(`${y}-${String(m+1).padStart(2,"0")}`)).length;

  view.innerHTML = `
    <div class="card streak-hero">
      <div class="num">${streak}<span class="unit">日</span></div>
      <div class="lbl">🔥 連続達成中！</div>
      ${best > 0 ? `<div class="streak-best">自己ベスト ${best}日連続</div>` : ""}
    </div>

    <div class="card">
      <div class="cal-head">
        <h3 class="card-title" style="margin:0">📊 振り返り</h3>
        <div class="seg">
          <button class="seg-btn ${trendMode === "week" ? "active" : ""}" data-trend="week">週間</button>
          <button class="seg-btn ${trendMode === "month" ? "active" : ""}" data-trend="month">月間</button>
        </div>
      </div>
      <div class="legend">
        <span><span class="dot burned"></span>運動(消費)</span>
        <span><span class="dot intake"></span>食事(摂取)</span>
      </div>
      <div class="chart">${bars}</div>
      <div class="balance" style="margin-top:14px">
        <div><div class="v" style="color:var(--mint-dark)">${sumBurned}</div><div class="l">消費合計</div></div>
        <div><div class="v" style="color:var(--coral)">${sumIntake}</div><div class="l">摂取合計</div></div>
        <div><div class="v">${avgBurned}</div><div class="l">1日平均消費</div></div>
        <div><div class="v">${doneCount}<span style="font-size:12px">日</span></div><div class="l">達成日数</div></div>
      </div>
      <div class="trend-summary">${summary}</div>
    </div>

    <div class="card">
      <h3 class="card-title">🎟️ ポイントカード（直近10日）</h3>
      <div class="punch-card">
        ${punches.map((p) => `<div class="punch ${p.filled ? "filled" : ""}">${p.filled ? trophyStampSVG() : ""}</div>`).join("")}
      </div>
      <div class="hint" style="font-size:11px;color:var(--ink-soft);margin-top:12px;font-weight:600;text-align:center">
        目標を達成した日にスタンプがたまるよ✨
      </div>
    </div>

    <div class="card">
      <div class="cal-head">
        <button class="cal-nav" id="calPrev">‹</button>
        <div class="m">${y}年 ${m + 1}月（${monthAchieved}個）</div>
        <button class="cal-nav" id="calNext">›</button>
      </div>
      <div class="cal-grid">
        ${dows.map((d) => `<div class="cal-dow">${d}</div>`).join("")}
        ${cells}
      </div>
    </div>`;

  document.getElementById("calPrev").onclick = () => {
    calMonth = m === 0 ? { y: y - 1, m: 11 } : { y, m: m - 1 }; render();
  };
  document.getElementById("calNext").onclick = () => {
    calMonth = m === 11 ? { y: y + 1, m: 0 } : { y, m: m + 1 }; render();
  };
  view.querySelectorAll("[data-trend]").forEach((b) => {
    b.onclick = () => { trendMode = b.dataset.trend; render(); };
  });
}

/* ===== Food (食事記録) ===== */
const FOODS_PRESET = [
  { name: "おにぎり", kcal: 180, emoji: "🍙" },
  { name: "菓子パン", kcal: 300, emoji: "🥐" },
  { name: "サンドイッチ", kcal: 300, emoji: "🥪" },
  { name: "ラーメン", kcal: 500, emoji: "🍜" },
  { name: "カレー", kcal: 700, emoji: "🍛" },
  { name: "定食", kcal: 650, emoji: "🍱" },
  { name: "パスタ", kcal: 600, emoji: "🍝" },
  { name: "サラダ", kcal: 100, emoji: "🥗" },
  { name: "ポテチ1袋", kcal: 340, emoji: "🥔" },
  { name: "チョコ", kcal: 150, emoji: "🍫" },
  { name: "クッキー", kcal: 60, emoji: "🍪" },
  { name: "アイス", kcal: 200, emoji: "🍦" },
  { name: "ケーキ", kcal: 340, emoji: "🍰" },
  { name: "唐揚げ", kcal: 290, emoji: "🍗" },
  { name: "ジュース", kcal: 150, emoji: "🥤" },
  { name: "ビール", kcal: 140, emoji: "🍺" },
];
let foodDraft = { name: "", kcal: "", memo: "", photo: null };

function downscaleImage(file, maxDim = 640, quality = 0.72) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      let w = img.width, h = img.height;
      if (w > h && w > maxDim) { h = Math.round((h * maxDim) / w); w = maxDim; }
      else if (h >= w && h > maxDim) { w = Math.round((w * maxDim) / h); h = maxDim; }
      const c = document.createElement("canvas");
      c.width = w; c.height = h;
      c.getContext("2d").drawImage(img, 0, 0, w, h);
      try { resolve(c.toDataURL("image/jpeg", quality)); } catch (e) { reject(e); }
    };
    img.onerror = reject;
    img.src = url;
  });
}

function foodsOn(dateStr) { return state.foods.filter((f) => f.date === dateStr); }
function intakeOn(dateStr) { return foodsOn(dateStr).reduce((s, f) => s + (f.kcal || 0), 0); }

function renderFood() {
  const todayFoods = foodsOn(ymd()).slice().reverse();
  const intake = intakeOn(ymd());
  const burned = kcalOn(ymd());

  view.innerHTML = `
    <div class="card">
      <h3 class="card-title">📷 写真でかんたん記録</h3>
      <input type="file" id="foodPhoto" accept="image/*" capture="environment" hidden />
      ${foodDraft.photo
        ? `<div class="photo-preview"><img src="${foodDraft.photo}" alt="食事の写真"/><button class="photo-remove" id="photoRemove" aria-label="写真を消す">✕</button></div>`
        : `<button class="photo-btn" id="photoBtn"><span class="cam">📷</span>写真を撮る / 選ぶ</button>`}
      <div class="note" style="margin-top:10px">
        写真は記録用に残せます。カロリーは下の食べ物ボタンを選ぶと<b>自動で入力</b>されます（目安）。
      </div>
    </div>

    <div class="card">
      <h3 class="card-title">🍽️ 何を食べた？</h3>
      <div class="food-quick">
        ${FOODS_PRESET.map((f, i) => `
          <button class="food-chip" data-food="${i}">
            <span class="e">${f.emoji}</span><span class="n">${f.name}</span><span class="k">${f.kcal}kcal</span>
          </button>`).join("")}
      </div>
      <div class="divider"></div>
      <div class="field">
        <label>食べたもの</label>
        <input type="text" id="foodName" value="${escapeHtml(foodDraft.name)}" placeholder="例: 手作りお弁当" />
      </div>
      <div class="row-2">
        <div class="field" style="margin:0">
          <label>カロリー目安 (kcal)</label>
          <input type="number" id="foodKcal" inputmode="numeric" value="${foodDraft.kcal}" placeholder="例: 300" />
        </div>
        <div class="field" style="margin:0">
          <label>メモ（任意）</label>
          <input type="text" id="foodMemo" value="${escapeHtml(foodDraft.memo)}" placeholder="間食 / 夜食 など" />
        </div>
      </div>
      <button class="btn btn-primary" id="saveFood" style="margin-top:6px">この食事を記録する 🍽️</button>
    </div>

    <div class="card">
      <h3 class="card-title">⚖️ 今日のバランス</h3>
      <div class="balance">
        <div><div class="v" style="color:var(--coral)">${intake}</div><div class="l">摂取 kcal</div></div>
        <div><div class="v" style="color:var(--mint-dark)">${burned}</div><div class="l">運動 kcal</div></div>
        <div><div class="v">${intake - burned >= 0 ? "+" : ""}${intake - burned}</div><div class="l">差し引き</div></div>
      </div>
    </div>

    <div class="card">
      <h3 class="card-title">📋 今日の食事</h3>
      ${todayFoods.length === 0
        ? `<div class="empty"><span class="big">🍽️</span>まだ記録がないよ。<br>写真やボタンでサクッと記録！</div>`
        : todayFoods.map((f) => `
          <div class="log-item">
            ${f.photo ? `<img class="food-thumb" src="${f.photo}" alt=""/>` : `<div class="log-emoji">🍽️</div>`}
            <div class="log-main">
              <div class="t">${escapeHtml(f.name)}</div>
              <div class="s">${f.memo ? `📝 ${escapeHtml(f.memo)}` : "&nbsp;"}</div>
            </div>
            <div class="log-kcal" style="color:var(--coral)">${f.kcal || 0} kcal</div>
            <button class="log-del" data-delfood="${f.id}" aria-label="削除">✕</button>
          </div>`).join("")}
    </div>`;

  const photoBtn = document.getElementById("photoBtn");
  const photoInput = document.getElementById("foodPhoto");
  if (photoBtn) photoBtn.onclick = () => photoInput.click();
  if (photoInput) photoInput.onchange = async () => {
    const file = photoInput.files && photoInput.files[0];
    if (!file) return;
    try {
      foodDraft.photo = await downscaleImage(file);
      render();
    } catch { toast("写真を読み込めなかったよ🙏", "coral"); }
  };
  const photoRemove = document.getElementById("photoRemove");
  if (photoRemove) photoRemove.onclick = () => { foodDraft.photo = null; render(); };

  view.querySelectorAll("[data-food]").forEach((b) => {
    b.onclick = () => {
      const f = FOODS_PRESET[parseInt(b.dataset.food, 10)];
      foodDraft.name = f.name; foodDraft.kcal = f.kcal; render();
    };
  });
  const fName = document.getElementById("foodName");
  if (fName) fName.oninput = () => { foodDraft.name = fName.value; };
  const fKcal = document.getElementById("foodKcal");
  if (fKcal) fKcal.oninput = () => { foodDraft.kcal = fKcal.value; };
  const fMemo = document.getElementById("foodMemo");
  if (fMemo) fMemo.oninput = () => { foodDraft.memo = fMemo.value; };
  document.getElementById("saveFood").onclick = saveFood;
  view.querySelectorAll("[data-delfood]").forEach((b) => {
    b.onclick = () => { state.foods = state.foods.filter((f) => f.id !== b.dataset.delfood); save(); render(); };
  });
}

function saveFood() {
  const name = (foodDraft.name || "").trim();
  const kcal = parseInt(foodDraft.kcal, 10);
  if (!name && !foodDraft.photo) { toast("食べたものを入力するか写真を選んでね🙏", "coral"); return; }
  const entry = {
    id: uid(), date: ymd(), name: name || "食事",
    kcal: isNaN(kcal) ? 0 : kcal, memo: (foodDraft.memo || "").trim(),
    photo: foodDraft.photo || null, ts: Date.now(),
  };
  state.foods.push(entry);
  if (!save() && entry.photo) {
    entry.photo = null; save(); // 容量オーバー → 写真を諦めて記録だけ残す
    toast("写真が大きすぎて保存できず、記録だけ残したよ🙏", "coral");
  } else {
    toast(`🍽️ ${entry.name}${entry.kcal ? ` ${entry.kcal}kcal` : ""} 記録したよ`, "mint");
  }
  foodDraft = { name: "", kcal: "", memo: "", photo: null };
  render();
}

/* ===== Settings ===== */
function renderSettings() {
  const p = state.profile;
  view.innerHTML = `
    <div class="card">
      <h3 class="card-title">👤 プロフィール</h3>
      <div class="field">
        <label>体重 (kg)</label>
        <input type="number" id="setWeight" inputmode="decimal" value="${p.weightKg ?? ""}" />
        <div class="hint">消費カロリー計算に使用</div>
      </div>
      <div class="field">
        <label>1日の目標カロリー (kcal)</label>
        <input type="number" id="setGoal" inputmode="numeric" value="${p.dailyGoalKcal}" />
        <div class="hint">この値を超えるとスタンプGET🏆</div>
      </div>
      <button class="btn btn-primary btn-sm" id="setSave" style="width:100%">保存する</button>
    </div>

    <div class="card">
      <h3 class="card-title">🍪 お菓子ナッジ</h3>
      <div class="toggle-row">
        <div><div class="lbl">無意識の間食ストッパー</div><div class="sub">時間帯に「メッ」って声かけするよ</div></div>
        <label class="switch"><input type="checkbox" id="nudgeOn" ${p.nudge.enabled ? "checked" : ""}/><span class="slider"></span></label>
      </div>
      <div id="nudgeOpts" ${p.nudge.enabled ? "" : 'style="display:none"'}>
        <div class="divider"></div>
        <div class="row-2">
          <div class="field" style="margin:0">
            <label>開始時刻</label>
            <select id="nStart">${hourOpts(p.nudge.startHour)}</select>
          </div>
          <div class="field" style="margin:0">
            <label>終了時刻</label>
            <select id="nEnd">${hourOpts(p.nudge.endHour)}</select>
          </div>
        </div>
        <div class="field" style="margin-top:14px;margin-bottom:0">
          <label>声かけ間隔</label>
          <select id="nInterval">
            ${[10,15,30,60,90,120].map((v)=>`<option value="${v}" ${p.nudge.intervalMin===v?"selected":""}>${v}分ごと</option>`).join("")}
          </select>
        </div>
        <div class="note" style="margin-top:12px">
          ※ アプリ（タブ）を開いている間に声かけします。通知をオンにすると、画面を見ていない時もお知らせできます。
        </div>
        <button class="btn btn-ghost btn-sm" id="testNudge" style="width:100%;margin-top:12px">今ためしに声かけしてもらう</button>
      </div>
    </div>

    <div class="card">
      <h3 class="card-title">🔔 あるるんアラーム</h3>
      <div class="note" style="margin-bottom:14px">
        設定した時刻になると、一定の間隔で「みてるよ」と鳴り続けます。<b>停止ボタンを押すまで止まりません。</b>
      </div>
      <div class="row-2">
        <div class="field" style="margin:0">
          <label>開始時刻</label>
          <input type="time" id="alStart" value="${hhmm(p.alarm.startHour, p.alarm.startMin)}" />
        </div>
        <div class="field" style="margin:0">
          <label>鳴らす間隔（分おき）</label>
          <input type="number" id="alInterval" inputmode="numeric" min="1" max="180" value="${p.alarm.intervalMin}" />
        </div>
      </div>
      <div class="toggle-row" style="margin-top:14px">
        <div><div class="lbl">「食べちゃった」で自動スタート</div><div class="sub">お菓子を食べた瞬間にすぐ鳴らし始める</div></div>
        <label class="switch"><input type="checkbox" id="alOnEat" ${p.alarm.onSnackEat ? "checked" : ""}/><span class="slider"></span></label>
      </div>
      <div class="divider"></div>
      <div class="field" style="margin:0">
        <label>🔊 声の高さ（高いほどかわいい） <b id="vPitchVal">${Number(p.voice.pitch).toFixed(1)}</b></label>
        <input type="range" id="vPitch" min="1" max="2" step="0.1" value="${p.voice.pitch}" />
      </div>
      <div class="field" style="margin:14px 0 0">
        <label>🐢 声の速さ <b id="vRateVal">${Number(p.voice.rate).toFixed(1)}</b></label>
        <input type="range" id="vRate" min="0.7" max="1.4" step="0.1" value="${p.voice.rate}" />
      </div>
      <button class="btn btn-ghost btn-sm" id="vTest" style="width:100%;margin-top:12px">🔊 声をためす（みてるよ）</button>
      <div class="divider"></div>
      ${state.alarmRun.active
        ? `<button class="btn btn-sm" id="alStopBtn" style="width:100%;background:var(--coral);color:#fff">■ あるるんを停止する</button>`
        : `<button class="btn btn-primary btn-sm" id="alStartBtn" style="width:100%">▶ あるるんをスタート</button>`}
      <button class="btn btn-ghost btn-sm" id="alEatBtn" style="width:100%;margin-top:8px">🍪 お菓子食べちゃった（もーーーーーーーーーー）</button>
    </div>

    <div class="card">
      <h3 class="card-title">🍪 今日の間食メモ</h3>
      <div class="balance" style="margin-bottom:14px">
        <div><div class="v" style="color:var(--mint-dark)">${snackCount("resisted")}</div><div class="l">がまんできた</div></div>
        <div><div class="v" style="color:var(--coral)">${snackCount("ate")}</div><div class="l">食べちゃった</div></div>
      </div>
      <div class="row-2">
        <button class="btn btn-ghost btn-sm" id="snackResist" style="width:100%">✊ がまんした</button>
        <button class="btn btn-sm" id="snackAte" style="width:100%;background:var(--coral-soft);color:var(--coral)">🍪 食べちゃった</button>
      </div>
      <div class="hint" style="font-size:11px;color:var(--ink-soft);margin-top:10px;font-weight:600;text-align:center">
        ボタンを押すだけでカウント。「食べちゃった」はあるるんも鳴らせるよ🔔
      </div>
    </div>

    <div class="card">
      <h3 class="card-title">🗂️ データ</h3>
      <div class="note">記録はすべてこの端末の中だけに保存されています。サーバーには送信されません。</div>
      <div class="divider"></div>
      <button class="btn btn-ghost btn-sm" id="exportText" style="width:100%;margin-bottom:8px">📄 記録を見やすく書き出す（テキスト）</button>
      <button class="btn btn-ghost btn-sm" id="exportData" style="width:100%;margin-bottom:8px">💾 バックアップを保存（復元用 .json）</button>
      <input type="file" id="importFile" accept="application/json,.json" hidden />
      <button class="btn btn-ghost btn-sm" id="importBtn" style="width:100%;margin-bottom:8px">📥 バックアップから復元する</button>
      <div class="note" style="margin-bottom:12px">
        ・<b>テキスト</b>は読んで確認する用（復元はできません）<br>
        ・<b>バックアップ(.json)</b>は機種変更や復元用。中身は記録データで、コードではありません
      </div>
      <button class="btn btn-sm" id="resetData" style="width:100%;background:var(--coral-soft);color:var(--coral)">すべてのデータを消す</button>
    </div>

    <div class="note" style="text-align:center;padding-bottom:8px">slimmate v1 · made with 🌿</div>`;

  document.getElementById("setSave").onclick = () => {
    const w = parseFloat(document.getElementById("setWeight").value);
    const g = parseInt(document.getElementById("setGoal").value, 10);
    if (!w || w < 20 || w > 300) { toast("体重を正しく入れてね🙏", "coral"); return; }
    if (!g || g < 10) { toast("目標カロリーを入れてね🙏", "coral"); return; }
    p.weightKg = w; p.dailyGoalKcal = g; save();
    toast("保存したよ！✅", "mint");
  };

  const nudgeOn = document.getElementById("nudgeOn");
  nudgeOn.onchange = async () => {
    if (nudgeOn.checked) {
      p.nudge.enabled = true;
      if ("Notification" in window && Notification.permission === "default") {
        await Notification.requestPermission();
      }
    } else { p.nudge.enabled = false; }
    save(); restartNudgeScheduler(); render();
  };
  const bindNudge = (id, key, parse) => {
    const el = document.getElementById(id);
    if (el) el.onchange = () => { p.nudge[key] = parse(el.value); save(); restartNudgeScheduler(); };
  };
  bindNudge("nStart", "startHour", (v) => parseInt(v, 10));
  bindNudge("nEnd", "endHour", (v) => parseInt(v, 10));
  bindNudge("nInterval", "intervalMin", (v) => parseInt(v, 10));
  const testBtn = document.getElementById("testNudge");
  if (testBtn) testBtn.onclick = () => fireNudge(true);

  // 🔔 あるるんアラーム
  const persistAlarmInputs = () => {
    const t = document.getElementById("alStart");
    if (t && t.value) {
      const [h, m] = t.value.split(":").map((x) => parseInt(x, 10));
      if (!isNaN(h)) p.alarm.startHour = h;
      if (!isNaN(m)) p.alarm.startMin = m;
    }
    const iv = parseInt((document.getElementById("alInterval") || {}).value, 10);
    if (!isNaN(iv) && iv >= 1) p.alarm.intervalMin = Math.min(iv, 180);
    save();
  };
  const alStartEl = document.getElementById("alStart");
  if (alStartEl) alStartEl.onchange = persistAlarmInputs;
  const alIntervalEl = document.getElementById("alInterval");
  if (alIntervalEl) alIntervalEl.onchange = persistAlarmInputs;
  const alOnEat = document.getElementById("alOnEat");
  if (alOnEat) alOnEat.onchange = () => { p.alarm.onSnackEat = alOnEat.checked; save(); };
  const alStartBtn = document.getElementById("alStartBtn");
  if (alStartBtn) alStartBtn.onclick = () => {
    persistAlarmInputs();
    startArun(false);
    const a = state.profile.alarm;
    const d = new Date(); d.setHours(a.startHour, a.startMin, 0, 0);
    toast(d.getTime() > Date.now() ? `${hhmm(a.startHour, a.startMin)} から ${a.intervalMin}分おきに鳴らすね🔔` : `あるるん スタート！${a.intervalMin}分おきに鳴るよ🔔`, "coral");
  };
  const alStopBtn = document.getElementById("alStopBtn");
  if (alStopBtn) alStopBtn.onclick = stopArun;
  // 🔊 声の調整
  const vPitch = document.getElementById("vPitch");
  if (vPitch) vPitch.oninput = () => {
    p.voice.pitch = parseFloat(vPitch.value); save();
    document.getElementById("vPitchVal").textContent = p.voice.pitch.toFixed(1);
  };
  const vRate = document.getElementById("vRate");
  if (vRate) vRate.oninput = () => {
    p.voice.rate = parseFloat(vRate.value); save();
    document.getElementById("vRateVal").textContent = p.voice.rate.toFixed(1);
  };
  const vTest = document.getElementById("vTest");
  if (vTest) vTest.onclick = () => { ensureAudio(); playArunSound(); };
  const alEatBtn = document.getElementById("alEatBtn");
  if (alEatBtn) alEatBtn.onclick = () => { persistAlarmInputs(); onAteSnack(); render(); };

  // 🍪 間食メモ ワンタップ登録
  const snackResist = document.getElementById("snackResist");
  if (snackResist) snackResist.onclick = () => {
    state.snacks.push({ date: ymd(), action: "resisted", ts: Date.now() });
    save(); praiseResisted(); toast("えらい！がまんできたね✊🎉", "mint"); render();
  };
  const snackAte = document.getElementById("snackAte");
  if (snackAte) snackAte.onclick = () => { onAteSnack(); render(); };

  document.getElementById("exportText").onclick = exportReadable;
  document.getElementById("exportData").onclick = exportData;
  const importFile = document.getElementById("importFile");
  document.getElementById("importBtn").onclick = () => importFile.click();
  importFile.onchange = () => { if (importFile.files && importFile.files[0]) importData(importFile.files[0]); };
  document.getElementById("resetData").onclick = () => {
    if (confirm("本当に全データを消しますか？元に戻せません。")) {
      state = structuredClone(DEFAULT_STATE); save(); currentTab = "home"; render();
    }
  };
}
function hourOpts(sel) {
  let s = "";
  for (let h = 0; h < 24; h++) s += `<option value="${h}" ${h === sel ? "selected" : ""}>${String(h).padStart(2,"0")}:00</option>`;
  return s;
}
function snackCount(action) {
  return state.snacks.filter((s) => s.date === ymd() && s.action === action).length;
}

/* ---------- お菓子ナッジ スケジューラ ---------- */
let nudgeTimer = null;
let lastNudgeTs = 0;
function restartNudgeScheduler() {
  if (nudgeTimer) clearInterval(nudgeTimer);
  if (!state.profile.nudge.enabled) return;
  nudgeTimer = setInterval(checkNudge, 60 * 1000); // 1分ごとにチェック
  checkNudge();
}

function checkNudge() {
  const n = state.profile.nudge;
  if (!n.enabled) return;
  const now = new Date();
  const h = now.getHours();
  const inWindow = n.startHour <= n.endHour
    ? h >= n.startHour && h < n.endHour
    : h >= n.startHour || h < n.endHour;
  if (!inWindow) return;
  if (Date.now() - lastNudgeTs < n.intervalMin * 60 * 1000) return;
  fireNudge(false);
}

const NUDGE_MESSAGES = [
  "メッ！いま無意識にお菓子つまもうとしてない？🍪",
  "ちょっと待って！本当に食べたい？それとも手持ち無沙汰？🤔",
  "深呼吸〜。お水を一杯飲んでからでも遅くないよ💧",
  "そのお菓子、未来のキミは食べてほしくないかも…？",
  "小腹すいた？まず3分だけ歩いてみようか🚶",
];
function fireNudge(isTest) {
  lastNudgeTs = Date.now();
  const msg = NUDGE_MESSAGES[Math.floor((Date.now() / 1000) % NUDGE_MESSAGES.length)];
  // 通知（バックグラウンドでも）
  if (!isTest && "Notification" in window && Notification.permission === "granted") {
    try { new Notification("slimmate 🍪", { body: msg, icon: "icon.svg" }); } catch {}
  }
  showNudgeCard(msg);
}
function showNudgeCard(msg) {
  const host = document.getElementById("toastHost");
  const el = document.createElement("div");
  el.className = "nudge-card";
  el.innerHTML = `
    <div class="head"><span style="font-size:24px">${'🐹'}</span> あるるんからのストップ！</div>
    <div class="msg">${msg}</div>
    <div class="btns">
      <button class="btn btn-ghost btn-sm" data-snack="resisted">がまんした✊</button>
      <button class="btn btn-sm" data-snack="ate" style="background:var(--coral-soft);color:var(--coral)">食べちゃった…</button>
    </div>`;
  host.appendChild(el);
  el.querySelectorAll("[data-snack]").forEach((b) => {
    b.onclick = () => {
      const ok = b.dataset.snack === "resisted";
      el.remove();
      if (ok) {
        state.snacks.push({ date: ymd(), action: "resisted", ts: Date.now() });
        save();
        praiseResisted(); // 「えらいぞー」
        toast("えらい！その調子！🎉", "mint");
      } else {
        onAteSnack(); // 「もーーーーーーーーーー」
      }
      if (currentTab === "settings") render();
    };
  });
  setTimeout(() => { if (el.isConnected) { el.classList.add("out"); setTimeout(() => el.remove(), 250); } }, 15000);
}

/* ============================================================
 * 🔔 あるるんアラーム
 *   開始時刻から一定間隔で「あるるん！」と鳴り続ける。
 *   停止ボタンを押すまで止まらない。
 * ============================================================ */
let audioCtx = null;

// 🔊 かわいいアニメ風の声を探す（高めの日本語ボイスを優先）
let cuteVoice = null;
function pickCuteVoice() {
  if (!("speechSynthesis" in window)) return null;
  const voices = speechSynthesis.getVoices();
  if (!voices.length) return null;
  const ja = voices.filter((v) => /ja|JP/i.test(v.lang));
  const prefer = ["kyoko", "o-ren", "sayaka", "nanami", "haruka", "mizuki", "ayumi", "google 日本語", "google ja"];
  for (const name of prefer) {
    const hit = ja.find((v) => v.name.toLowerCase().includes(name));
    if (hit) return hit;
  }
  return ja[0] || null;
}
if ("speechSynthesis" in window) {
  cuteVoice = pickCuteVoice();
  try { speechSynthesis.onvoiceschanged = () => { cuteVoice = pickCuteVoice(); }; } catch {}
}

function ensureAudio() {
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === "suspended") audioCtx.resume();
  } catch {}
}
// オルゴール風の1音（やわらかい三角波＋オクターブ上のキラッ）
function note(freq, start, dur, gain = 0.3) {
  if (!audioCtx) return;
  const g = audioCtx.createGain();
  g.gain.setValueAtTime(0.0001, start);
  g.gain.exponentialRampToValueAtTime(gain, start + 0.015);
  g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  g.connect(audioCtx.destination);
  const o1 = audioCtx.createOscillator();
  o1.type = "triangle"; o1.frequency.value = freq;
  o1.connect(g);
  const o2 = audioCtx.createOscillator();
  o2.type = "sine"; o2.frequency.value = freq * 2;
  const g2 = audioCtx.createGain(); g2.gain.value = 0.4;
  o2.connect(g2).connect(g);
  o1.start(start); o1.stop(start + dur + 0.03);
  o2.start(start); o2.stop(start + dur + 0.03);
}

// 🎵 かわいい「るんるん♪」オルゴールメロディ
function playCuteJingle() {
  ensureAudio();
  if (!audioCtx) return;
  const t = audioCtx.currentTime + 0.02;
  // ソ→ド「るん」、ソ→ミ「るん」、最後にキラッと高いド
  const seq = [
    [784, 0.0, 0.14], [1047, 0.13, 0.2],
    [784, 0.34, 0.14], [1319, 0.47, 0.24],
    [1568, 0.74, 0.32],
  ];
  seq.forEach(([f, off, dur]) => note(f, t + off, dur));
}
// あるるんのかわいい声で読み上げ（高さ・速さは設定に従う）
function speakCute(text) {
  if (!("speechSynthesis" in window)) return;
  try {
    const v = (state.profile.voice) || { pitch: 2.0, rate: 1.1 };
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "ja-JP";
    u.pitch = v.pitch;  // 高さ（最大2.0で一番かわいい）
    u.rate = v.rate;    // 速さ
    if (cuteVoice) u.voice = cuteVoice;
    speechSynthesis.cancel();
    speechSynthesis.speak(u);
  } catch {}
}
// 🎉 ほめる時のキラキラ上昇メロディ
function playPraiseJingle() {
  ensureAudio();
  if (!audioCtx) return;
  const t = audioCtx.currentTime + 0.02;
  [[1047, 0, 0.12], [1319, 0.12, 0.12], [1568, 0.24, 0.12], [2093, 0.36, 0.3]]
    .forEach(([f, off, dur]) => note(f, t + off, dur));
}
function playArunSound() {
  playCuteJingle(); // オルゴール「るんるん♪」
  if (navigator.vibrate) { try { navigator.vibrate([90, 70, 90, 70, 160]); } catch {} }
  speakCute("みてるよ"); // 読み上げ「るんるん」（対応端末のみ）
}
// ✊ がまんできた時にほめる
function praiseResisted() {
  playPraiseJingle();
  speakCute("えらいぞー");
}
// 🍫 食べちゃった時にやさしく叱る（下降メロディ）
function playScoldJingle() {
  ensureAudio();
  if (!audioCtx) return;
  const t = audioCtx.currentTime + 0.02;
  [[740, 0, 0.16], [587, 0.16, 0.16], [494, 0.32, 0.3]].forEach(([f, off, dur]) => note(f, t + off, dur));
}
function scoldAte() {
  playScoldJingle();
  speakCute("もーーーーーーーーーー"); // えらいぞーと同じ声
}
// 食べちゃった共通処理：記録 →「もーーーーーーーーーー」→（設定ON時）あるるんが見張る
function onAteSnack() {
  state.snacks.push({ date: ymd(), action: "ate", ts: Date.now() });
  save();
  scoldAte();
  if (state.profile.alarm.onSnackEat) {
    // 「こらこら」と重ならないよう、最初のるんるんは間隔ぶん後から
    state.alarmRun = { active: true, nextFireTs: Date.now() + Math.max(1, state.profile.alarm.intervalMin) * 60000 };
    save();
    updateAlarmBanner();
    toast("もーーーーーーーーーー！あるるんが見張るよ🔔", "coral");
  } else {
    toast("もーーーーーーーーーー！記録しといたよ🌱", "coral");
  }
}

function pad2(n) { return String(n).padStart(2, "0"); }
function hhmm(h, m) { return `${pad2(h)}:${pad2(m)}`; }
function fmtMMSS(ms) {
  const s = Math.ceil(ms / 1000);
  return `${pad2(Math.floor(s / 60))}:${pad2(s % 60)}`;
}

function startArun(immediate) {
  ensureAudio(); // ユーザー操作中に音声権限を取得
  const a = state.profile.alarm;
  let next;
  if (immediate) {
    next = Date.now(); // 今すぐ1回目
  } else {
    const d = new Date();
    d.setHours(a.startHour, a.startMin, 0, 0);
    next = d.getTime();
    if (next <= Date.now()) next = Date.now(); // 開始時刻を過ぎていたら今すぐ
  }
  state.alarmRun = { active: true, nextFireTs: next };
  save();
  updateAlarmBanner();
  if (currentTab === "settings") render();
}
function stopArun() {
  state.alarmRun = { active: false, nextFireTs: 0 };
  save();
  if ("speechSynthesis" in window) { try { speechSynthesis.cancel(); } catch {} }
  if (navigator.vibrate) { try { navigator.vibrate(0); } catch {} }
  updateAlarmBanner();
  toast("あるるんを停止したよ🔕", "mint");
  if (currentTab === "settings") render();
}
function tickAlarm() {
  const r = state.alarmRun;
  if (!r.active) return;
  if (Date.now() >= r.nextFireTs) {
    playArunSound();
    const el = document.getElementById("alarmBanner");
    if (el) { el.classList.remove("flash"); void el.offsetWidth; el.classList.add("flash"); }
    const iv = Math.max(1, state.profile.alarm.intervalMin) * 60000;
    r.nextFireTs += iv;
    if (r.nextFireTs <= Date.now()) r.nextFireTs = Date.now() + iv;
    save();
  }
  refreshAlarmSub();
}
function updateAlarmBanner() {
  let el = document.getElementById("alarmBanner");
  if (!state.alarmRun.active) { if (el) el.remove(); return; }
  if (!el) {
    el = document.createElement("div");
    el.id = "alarmBanner";
    el.className = "alarm-banner";
    el.innerHTML = `
      <span class="ab-bell">🔔</span>
      <div class="ab-main">
        <div class="ab-title">あるるん 作動中</div>
        <div class="ab-sub" id="alarmSub"></div>
      </div>
      <button class="ab-stop" id="alarmStopBtn">停止</button>`;
    document.body.appendChild(el);
    document.getElementById("alarmStopBtn").onclick = stopArun;
  }
  refreshAlarmSub();
}
function refreshAlarmSub() {
  const sub = document.getElementById("alarmSub");
  if (!sub) return;
  const r = state.alarmRun;
  const remain = r.nextFireTs - Date.now();
  sub.textContent = remain > 1000 ? `次の あるるん まで ${fmtMMSS(remain)}` : "みてるよ 🔔";
}

/* ---------- 演出 ---------- */
function bounceMascot() {
  const stage = document.getElementById("mascotStage");
  if (!stage) return;
  const m = stage.querySelector(".mascot");
  if (m) { m.classList.remove("bounce"); void m.offsetWidth; m.classList.add("bounce"); }
}
function celebrate() {
  bounceMascot();
  confettiBurst();
  toast("🎉 今日の目標たっせい！スタンプGET🏆", "mint");
}
function confettiBurst() {
  const colors = ["#4ecdc4", "#ff6b6b", "#ffd166", "#a8e6df", "#ffb3b3"];
  for (let i = 0; i < 36; i++) {
    const c = document.createElement("div");
    const x = 50 + (Math.sin(i) * 0); // spread via animation
    c.style.cssText = `position:fixed;top:30%;left:${10 + Math.floor((i / 36) * 80)}%;
      width:9px;height:9px;background:${colors[i % colors.length]};
      border-radius:${i % 2 ? "50%" : "2px"};z-index:80;pointer-events:none;opacity:1;`;
    document.body.appendChild(c);
    const dx = (Math.floor((i % 7)) - 3) * 30;
    const dy = 220 + (i % 5) * 50;
    const rot = (i % 2 ? 1 : -1) * 360;
    c.animate(
      [
        { transform: "translate(0,0) rotate(0)", opacity: 1 },
        { transform: `translate(${dx}px,${dy}px) rotate(${rot}deg)`, opacity: 0 },
      ],
      { duration: 1100 + (i % 5) * 200, easing: "cubic-bezier(.2,.6,.4,1)" }
    ).onfinish = () => c.remove();
  }
}

/* ---------- Toast ---------- */
function toast(msg, kind = "") {
  const host = document.getElementById("toastHost");
  const el = document.createElement("div");
  el.className = `toast ${kind}`;
  el.innerHTML = `<span>${msg}</span>`;
  host.appendChild(el);
  setTimeout(() => { el.classList.add("out"); setTimeout(() => el.remove(), 250); }, 2600);
}

/* ---------- Utils ---------- */
function uid() { return Date.now().toString(36) + Math.floor(performance.now() * 1000).toString(36); }
function escapeHtml(s) {
  return String(s || "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function downloadFile(filename, text, type) {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

// 💾 復元用バックアップ（JSON）
function exportData() {
  downloadFile(`slimmate-backup-${ymd()}.json`, JSON.stringify(state, null, 2), "application/json");
  toast("復元用バックアップを保存したよ💾", "mint");
}

// 📄 見やすいテキストレポート
function groupByDate(arr) {
  const g = {};
  arr.forEach((x) => { (g[x.date] = g[x.date] || []).push(x); });
  Object.values(g).forEach((list) => list.sort((a, b) => (a.ts || 0) - (b.ts || 0)));
  return g;
}
function exportReadable() {
  const p = state.profile;
  const line = "━".repeat(20);
  const out = [];
  out.push("🌿 slimmate 記録の書き出し");
  out.push(`書き出し日: ${ymd()}`);
  out.push("");
  out.push(line);
  out.push("👤 プロフィール");
  out.push(`　体重　　　: ${p.weightKg ?? "未設定"} kg`);
  out.push(`　1日の目標 : ${p.dailyGoalKcal} kcal`);
  out.push("");

  out.push(line);
  out.push("🏃 運動の記録（新しい順）");
  const lg = groupByDate(state.logs);
  const ld = Object.keys(lg).sort().reverse();
  if (!ld.length) out.push("　（まだ記録がありません）");
  ld.forEach((d) => {
    const total = lg[d].reduce((s, l) => s + l.kcal, 0);
    out.push(`【${d}】 合計 ${total} kcal`);
    lg[d].forEach((l) => {
      const ex = exById(l.typeId);
      out.push(`　・${ex ? ex.name : "運動"} ${l.minutes}分 — ${l.kcal} kcal${l.memo ? `（メモ: ${l.memo}）` : ""}`);
    });
  });
  out.push("");

  out.push(line);
  out.push("🍽️ 食事の記録（新しい順）");
  const fg = groupByDate(state.foods);
  const fd = Object.keys(fg).sort().reverse();
  if (!fd.length) out.push("　（まだ記録がありません）");
  fd.forEach((d) => {
    const total = fg[d].reduce((s, f) => s + (f.kcal || 0), 0);
    out.push(`【${d}】 合計 ${total} kcal`);
    fg[d].forEach((f) => {
      out.push(`　・${f.name} ${f.kcal || 0} kcal${f.memo ? `（メモ: ${f.memo}）` : ""}${f.photo ? "（📷写真あり）" : ""}`);
    });
  });
  out.push("");

  out.push(line);
  out.push("🏆 達成スタンプ");
  const done = [...achievedDates()].sort().reverse();
  out.push(`　達成日数: ${done.length}日`);
  if (done.length) out.push(`　達成した日: ${done.join("、")}`);
  out.push("");

  out.push(line);
  out.push("🍪 間食メモ");
  const resisted = state.snacks.filter((s) => s.action === "resisted").length;
  const ate = state.snacks.filter((s) => s.action === "ate").length;
  out.push(`　がまんできた: ${resisted}回 ／ 食べちゃった: ${ate}回`);
  out.push("");

  downloadFile(`slimmate-記録-${ymd()}.txt`, out.join("\r\n"), "text/plain;charset=utf-8");
  toast("見やすい記録を書き出したよ📄", "mint");
}

// 📥 バックアップから復元
function importData(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result);
      if (!data || typeof data !== "object" || !data.profile || !Array.isArray(data.logs)) {
        throw new Error("not a slimmate backup");
      }
      if (!confirm("いまのデータを、選んだバックアップで置きかえます。\nよろしいですか？")) return;
      state = normalizeState(data);
      state.alarmRun = { active: false, nextFireTs: 0 }; // 復元直後に鳴り出さないように
      save();
      updateAlarmBanner();
      restartNudgeScheduler();
      currentTab = "settings";
      render();
      toast("バックアップから復元したよ📥✅", "mint");
    } catch {
      toast("このファイルは復元できないみたい🙏 slimmateのバックアップ(.json)を選んでね", "coral");
    }
  };
  reader.onerror = () => toast("ファイルを読めなかったよ🙏", "coral");
  reader.readAsText(file);
}

/* ---------- イベント ---------- */
document.querySelectorAll(".tab").forEach((t) => {
  t.onclick = () => { currentTab = t.dataset.tab; render(); };
});

/* ---------- 起動 ---------- */
render();
restartNudgeScheduler();
setInterval(tickAlarm, 1000); // あるるんアラームの監視（1秒ごと）
updateAlarmBanner(); // リロード時に稼働中なら停止バナーを復元

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  });
}
