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
// プリセット + カスタム運動の合算
function allExercises() {
  const customs = (state && state.customExercises) ? state.customExercises : [];
  return EXERCISES.concat(customs);
}
const exById = (id) => allExercises().find((e) => e.id === id);
// お気に入りを先頭に並び替え
function sortedExercises() {
  const favs = (state && state.favoriteExercises) ? state.favoriteExercises : [];
  const all = allExercises();
  const pinned = favs.map((id) => all.find((e) => e.id === id)).filter(Boolean);
  const rest = all.filter((e) => !favs.includes(e.id));
  return pinned.concat(rest);
}

/* ---------- 状態管理 (localStorage) ---------- */
const STORE_KEY = "slimmate.v1";
const DEFAULT_STATE = {
  profile: {
    weightKg: null,
    dailyGoalKcal: 150,
    waterGoal: 8, // コップ数（1杯=約250mL）
    nudge: { enabled: false, startHour: 10, endHour: 18, intervalMin: 10 },
    // 🔔 あるるんアラーム設定
    alarm: { startHour: 12, startMin: 0, intervalMin: 10, onSnackEat: true },
    // 🔊 あるるんの声（高さ・速さを好みで調整）
    voice: { pitch: 2.0, rate: 1.1 },
    // 🌙 表示テーマ "auto" | "light" | "dark"
    theme: "auto",
    // 🎀 マスコットの着せ替え（"default"|"bow"|"cap"|"crown"|"santa"）
    mascotSkin: "default",
    // ⏰ 朝・夜の声かけ
    morningCall: { enabled: false, hour: 8, min: 0 },
    nightCall: { enabled: false, hour: 22, min: 0 },
    // 🏠 iOSホーム画面追加ガイドを閉じたか
    iosBannerDismissed: false,
    onboarded: false,
  },
  logs: [], // { id, date:"YYYY-MM-DD", typeId, minutes, kcal, memo, ts }
  snacks: [], // { date, action:"resisted"|"ate", ts }
  foods: [], // { id, date, name, kcal, memo, photo, ts }
  alarmRun: { active: false, nextFireTs: 0 }, // あるるんアラームの稼働状態
  feedback: [], // { id, ts, category, rating, text, contact, status:"sent_email"|"copied" }
  // ⭐ お気に入り（運動IDの配列 / 食事の name の配列）
  favoriteExercises: [],
  favoriteFoods: [],
  // ✨ ユーザー追加カスタム種目
  customExercises: [], // { id, name, emoji, mets }
  customFoods: [],     // { id, name, emoji, kcal }
  // 💧 水分（{ date, count }）
  waters: [],
  // ⚖️ 体重ログ（{ id, date, kg, memo, ts }）
  weights: [],
  // 🔮 今日のおみくじキャッシュ
  omikuji: { date: "", typeId: "", minutes: 0, message: "" },
  // ⏰ 朝・夜コールの最終発火日
  callRun: { lastMorningYmd: "", lastNightYmd: "" },
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
      voice: { ...DEFAULT_STATE.profile.voice, ...(pp.voice || {}) },
      morningCall: { ...DEFAULT_STATE.profile.morningCall, ...(pp.morningCall || {}) },
      nightCall: { ...DEFAULT_STATE.profile.nightCall, ...(pp.nightCall || {}) },
    },
    alarmRun: { ...DEFAULT_STATE.alarmRun, ...(parsed.alarmRun || {}) },
    feedback: Array.isArray(parsed.feedback) ? parsed.feedback : [],
    favoriteExercises: Array.isArray(parsed.favoriteExercises) ? parsed.favoriteExercises : [],
    favoriteFoods: Array.isArray(parsed.favoriteFoods) ? parsed.favoriteFoods : [],
    customExercises: Array.isArray(parsed.customExercises) ? parsed.customExercises : [],
    customFoods: Array.isArray(parsed.customFoods) ? parsed.customFoods : [],
    waters: Array.isArray(parsed.waters) ? parsed.waters : [],
    weights: Array.isArray(parsed.weights) ? parsed.weights : [],
    omikuji: { ...DEFAULT_STATE.omikuji, ...(parsed.omikuji || {}) },
    callRun: { ...DEFAULT_STATE.callRun, ...(parsed.callRun || {}) },
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

/* ---------- テーマ適用（auto / light / dark） ---------- */
function applyTheme() {
  const t = (state.profile && state.profile.theme) || "auto";
  document.documentElement.setAttribute("data-theme", t);
  // theme-color メタタグも追従
  const isDark = t === "dark"
    || (t === "auto" && window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", isDark ? "#131722" : "#4ECDC4");
}
// システムテーマ変更を auto モード時だけ反映
if (window.matchMedia) {
  try { window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
    if ((state.profile && state.profile.theme) === "auto") applyTheme();
  }); } catch {}
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

/* ---------- 🏅 称号・レベル ---------- */
const LEVELS = [
  { id: "egg",      name: "たまご",         emoji: "🥚", color: "#a8a29e", min: 0,   next: 1 },
  { id: "rookie",   name: "ルーキー",       emoji: "🌱", color: "#10b981", min: 1,   next: 7 },
  { id: "bronze",   name: "ブロンズ",       emoji: "🥉", color: "#d97706", min: 7,   next: 14 },
  { id: "silver",   name: "シルバー",       emoji: "🥈", color: "#94a3b8", min: 14,  next: 30 },
  { id: "gold",     name: "ゴールド",       emoji: "🥇", color: "#f4c13a", min: 30,  next: 100 },
  { id: "platinum", name: "プラチナ",       emoji: "🏆", color: "#7dd3fc", min: 100, next: 365 },
  { id: "diamond",  name: "ダイヤモンド",   emoji: "💎", color: "#a78bfa", min: 365, next: null },
];
function levelFor(achievedCount) {
  let lv = LEVELS[0];
  for (const l of LEVELS) if (achievedCount >= l.min) lv = l;
  return lv;
}
function unlockedSkins() {
  const c = achievedDates().size;
  const out = ["default"];
  if (c >= 1) out.push("bow");
  if (c >= 7) out.push("cap");
  if (c >= 30) out.push("crown");
  if (c >= 60) out.push("santa");
  return out;
}

/* ---------- 💧 水分 ---------- */
function waterCountOn(dateStr) {
  const w = state.waters.find((x) => x.date === dateStr);
  return w ? w.count : 0;
}
function addWater(delta) {
  const today = ymd();
  let w = state.waters.find((x) => x.date === today);
  if (!w) { w = { date: today, count: 0 }; state.waters.push(w); }
  w.count = Math.max(0, w.count + delta);
  save();
}

/* ---------- ⚖️ 体重 ---------- */
function latestWeight() {
  if (!state.weights.length) return null;
  return state.weights.slice().sort((a, b) => (a.ts || 0) - (b.ts || 0))[state.weights.length - 1];
}
function weightTrendData(days) {
  // 直近daysに該当する重量データを返す（日付昇順）
  const cutoff = Date.now() - days * 86400000;
  return state.weights
    .filter((w) => (w.ts || 0) >= cutoff)
    .slice()
    .sort((a, b) => (a.ts || 0) - (b.ts || 0));
}

/* ---------- 🔮 おみくじ ---------- */
function todaysOmikuji() {
  const today = ymd();
  if (state.omikuji && state.omikuji.date === today && state.omikuji.typeId) return state.omikuji;
  const all = allExercises();
  if (!all.length) return null;
  const pick = all[Math.floor(Math.random() * all.length)];
  const mins = [10, 15, 20, 30, 45][Math.floor(Math.random() * 5)];
  const messages = [
    "今日はこれをやってみよう！",
    "気分転換にどう？",
    "サクッとやって達成感ゲット！",
    "ちょっと汗かいてみよう✨",
    "あるるんからの提案だよ🍀",
    "5分だけでも体は喜ぶよ！",
  ];
  state.omikuji = {
    date: today,
    typeId: pick.id,
    minutes: mins,
    message: messages[Math.floor(Math.random() * messages.length)],
  };
  save();
  return state.omikuji;
}
function rerollOmikuji() { state.omikuji = { date: "", typeId: "", minutes: 0, message: "" }; save(); }

/* ---------- 📱 iOS Safari 判定 ---------- */
function isStandalone() {
  return (("standalone" in window.navigator) && window.navigator.standalone)
    || (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches);
}
function isIosSafari() {
  const ua = navigator.userAgent || "";
  return /iPhone|iPad|iPod/i.test(ua)
    && /Safari/i.test(ua)
    && !/CriOS|FxiOS|EdgiOS/i.test(ua);
}

/* ---------- ゆるキャラ「あるるん」SVG ---------- */
const SKINS = [
  { id: "default", name: "ノーマル", emoji: "🌱", needMin: 0,  desc: "あるるんのいつもの姿" },
  { id: "bow",     name: "リボン",   emoji: "🎀", needMin: 1,  desc: "達成1日でアンロック" },
  { id: "cap",     name: "キャップ", emoji: "🧢", needMin: 7,  desc: "達成7日でアンロック" },
  { id: "crown",   name: "おうかん", emoji: "👑", needMin: 30, desc: "達成30日でアンロック" },
  { id: "santa",   name: "サンタ",   emoji: "🎅", needMin: 60, desc: "達成60日でアンロック" },
];
function mascotSkinSVG(skin) {
  switch (skin) {
    case "bow":
      return `<g class="skin-bow">
        <path d="M50 22 q-12 -8 -2 -14 q8 -4 14 8 q-6 12 -12 6 z" fill="#ff8fab" stroke="#ff6b6b" stroke-width="1.5"/>
        <path d="M70 22 q12 -8 2 -14 q-8 -4 -14 8 q6 12 12 6 z" fill="#ff8fab" stroke="#ff6b6b" stroke-width="1.5"/>
        <circle cx="60" cy="22" r="4.5" fill="#ff6b6b"/>
      </g>`;
    case "cap":
      return `<g class="skin-cap">
        <path d="M26 30 q14 -22 36 -16 q14 4 24 14 q-2 6 -10 4 q-22 -10 -50 -2 z" fill="#4ecdc4" stroke="#38b2a8" stroke-width="1.2"/>
        <path d="M76 28 q14 0 18 8 q-4 2 -14 -2 z" fill="#38b2a8"/>
        <circle cx="60" cy="22" r="3" fill="#fff"/>
      </g>`;
    case "crown":
      return `<g class="skin-crown">
        <path d="M36 26 l4 -16 l8 10 l12 -14 l12 14 l8 -10 l4 16 z" fill="#ffd166" stroke="#caa12a" stroke-width="1.5" stroke-linejoin="round"/>
        <rect x="36" y="24" width="48" height="6" rx="2" fill="#f4c13a"/>
        <circle cx="44" cy="14" r="2" fill="#ff6b6b"/>
        <circle cx="60" cy="8"  r="2.5" fill="#4ecdc4"/>
        <circle cx="76" cy="14" r="2" fill="#a78bfa"/>
      </g>`;
    case "santa":
      return `<g class="skin-santa">
        <path d="M30 30 q16 -24 38 -16 q14 4 22 14 q-32 -8 -60 2 z" fill="#ff6b6b" stroke="#c43838" stroke-width="1.2"/>
        <ellipse cx="60" cy="32" rx="26" ry="3.5" fill="#fff"/>
        <circle cx="86" cy="14" r="5" fill="#fff"/>
      </g>`;
    default:
      return "";
  }
}
// mood: sleepy / cheer / happy / proud / worried
function mascotSVG(mood, opts) {
  opts = opts || {};
  const skin = opts.skin || (state.profile && state.profile.mascotSkin) || "default";
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
    ${mascotSkinSVG(skin)}
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
let previousTab = "home"; // ヘルプから戻るとき用
let formDraft = { typeId: "run", minutes: 20, memo: "" };
let calMonth = null; // {y, m}
let selectedDate = ymd(); // 運動・食事タブの表示・記録対象日
let editingLogId = null;
let editingLogDraft = null;
let editingFoodId = null;
let editingFoodDraft = null;
let showGallery = false;

/* ---------- 日付セレクタUI（運動/食事タブで共有） ---------- */
function dateLabel(d) {
  if (d === ymd()) return "今日";
  if (d === addDays(ymd(), -1)) return "昨日";
  if (d === addDays(ymd(), -2)) return "一昨日";
  const dd = new Date(d + "T00:00:00");
  const dow = ["日","月","火","水","木","金","土"][dd.getDay()];
  return `${dd.getMonth()+1}/${dd.getDate()}（${dow}）`;
}
function renderDateBar() {
  const today = ymd();
  const canNext = selectedDate < today;
  return `
    <div class="date-bar card">
      <button class="date-nav" data-dnav="-1" aria-label="前の日">‹</button>
      <div class="date-mid">
        <input type="date" id="dateInput" value="${selectedDate}" max="${today}" />
        <div class="date-lbl">${dateLabel(selectedDate)}</div>
      </div>
      <button class="date-nav" data-dnav="1" aria-label="次の日"${canNext ? "" : " disabled"}>›</button>
      ${selectedDate !== today ? `<button class="date-today" id="dateToday">今日へ</button>` : ""}
    </div>
  `;
}
function bindDateBar() {
  const inp = document.getElementById("dateInput");
  if (inp) inp.onchange = () => {
    const v = inp.value;
    if (v && v <= ymd()) { selectedDate = v; render(); }
  };
  view.querySelectorAll("[data-dnav]").forEach((b) => {
    b.onclick = () => {
      const d = parseInt(b.dataset.dnav, 10);
      const next = addDays(selectedDate, d);
      if (next <= ymd()) { selectedDate = next; render(); }
    };
  });
  const today = document.getElementById("dateToday");
  if (today) today.onclick = () => { selectedDate = ymd(); render(); };
}

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
  const helpBtn = document.getElementById("helpBtn");
  if (helpBtn) helpBtn.hidden = false;

  if (currentTab === "home") renderHome();
  else if (currentTab === "log") renderLog();
  else if (currentTab === "food") renderFood();
  else if (currentTab === "stamps") renderStamps();
  else if (currentTab === "settings") renderSettings();
  else if (currentTab === "help") renderHelp();
}

/* ===== Onboarding ===== */
function renderOnboarding() {
  document.getElementById("tabbar").style.visibility = "hidden";
  const helpBtn = document.getElementById("helpBtn");
  if (helpBtn) helpBtn.hidden = true;
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
  const ach = achievedDates();
  const lv = levelFor(ach.size);
  const nextNeeded = lv.next ? lv.next - ach.size : 0;
  const waterCount = waterCountOn(ymd());
  const waterGoal = state.profile.waterGoal || 8;
  const omikuji = todaysOmikuji();
  const ex = omikuji ? exById(omikuji.typeId) : null;
  const showIosBanner = isIosSafari() && !isStandalone() && !state.profile.iosBannerDismissed;
  const wt = latestWeight();

  view.innerHTML = `
    ${showIosBanner ? `
    <div class="card ios-banner">
      <div class="ib-head"><span>📱</span> ホーム画面に追加すると便利！</div>
      <div class="ib-body">
        Safari下の <b>共有ボタン <span class="ib-icon">⬆️</span></b> → <b>「ホーム画面に追加」</b> でアプリのように使えます。
      </div>
      <button class="btn btn-ghost btn-sm" id="iosDismiss">わかった</button>
    </div>` : ""}

    <div class="hero">
      <div class="level-badge" style="background:${lv.color}22;color:${lv.color}">
        ${lv.emoji} ${lv.name}${nextNeeded > 0 ? ` <span class="lv-next">あと${nextNeeded}日で次へ</span>` : ""}
      </div>
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
          <div class="row"><div class="big" style="color:${pct>=1?'var(--mint)':'var(--coral)'}">${Math.round(pct*100)}<span style="font-size:13px"> %</span></div><div class="lbl">目標達成率</div></div>
        </div>
      </div>
    </div>

    ${ex ? `
    <div class="card omikuji-card">
      <h3 class="card-title">🔮 今日のあるるんおみくじ</h3>
      <div class="omk-main">
        <div class="omk-emoji">${ex.emoji}</div>
        <div class="omk-body">
          <div class="omk-name">${escapeHtml(ex.name)} ${omikuji.minutes}分</div>
          <div class="omk-msg">${escapeHtml(omikuji.message)}</div>
        </div>
      </div>
      <div class="row-2" style="margin-top:12px">
        <button class="btn btn-primary btn-sm" id="omkGo">これをやる！</button>
        <button class="btn btn-ghost btn-sm" id="omkReroll">🎲 引き直す</button>
      </div>
    </div>` : ""}

    <div class="card">
      <h3 class="card-title">💧 水分（今日 ${waterCount}/${waterGoal}杯）</h3>
      <div class="water-row">
        ${Array.from({length: Math.max(waterGoal, waterCount)}, (_, i) => `
          <button class="water-cup ${i < waterCount ? "filled" : ""}" data-wateri="${i}" aria-label="${i+1}杯目">${i < waterCount ? "💧" : "🥛"}</button>
        `).join("")}
      </div>
      <div class="row-2" style="margin-top:10px">
        <button class="btn btn-ghost btn-sm" id="waterPlus">＋1杯</button>
        <button class="btn btn-ghost btn-sm" id="waterMinus" ${waterCount === 0 ? "disabled" : ""}>−1杯</button>
      </div>
      ${waterCount >= waterGoal ? `<div class="trend-summary" style="margin-top:10px">🎉 今日の水分目標たっせい！</div>` : ""}
    </div>

    <div class="card weight-quick">
      <h3 class="card-title">⚖️ 体重チェック</h3>
      ${wt ? `
        <div class="balance">
          <div><div class="v">${wt.kg}<span style="font-size:12px"> kg</span></div><div class="l">最新（${wt.date}）</div></div>
          <div><div class="v">${state.weights.length}<span style="font-size:12px"> 回</span></div><div class="l">記録回数</div></div>
        </div>` : `<div class="empty" style="padding:6px 0">まだ体重が登録されていません。下から記録できます。</div>`}
      <div class="row-2" style="margin-top:10px">
        <input type="number" id="hWkg" inputmode="decimal" placeholder="今日の体重 kg" step="0.1" />
        <button class="btn btn-primary btn-sm" id="hWadd">記録する</button>
      </div>
      <button class="btn btn-ghost btn-sm" id="hWmore" style="margin-top:8px">📈 体重の推移を見る</button>
    </div>

    <div class="card">
      <h3 class="card-title">⚡ クイック記録</h3>
      <div class="quick-grid">
        ${sortedExercises().slice(0, 8).map((e) => `
          <button class="quick-chip" data-quick="${e.id}">
            <span class="e">${e.emoji}</span><span class="n">${escapeHtml(e.name)}</span>
          </button>`).join("")}
      </div>
      <div class="hint" style="font-size:11px;color:var(--ink-soft);margin-top:10px;font-weight:600">
        タップ → 時間を選ぶだけでサッと記録できるよ
      </div>
    </div>

    <div class="card help-cta-card" id="helpCta">
      <div class="help-cta-row">
        <div class="help-cta-emoji">📖</div>
        <div class="help-cta-text">
          <div class="help-cta-title">使い方・ヘルプ・ご意見</div>
          <div class="help-cta-sub">操作がわからない時／要望を送りたい時はここから</div>
        </div>
        <div class="help-cta-arrow">›</div>
      </div>
    </div>`;

  view.querySelectorAll("[data-quick]").forEach((b) => {
    b.onclick = () => { formDraft = { typeId: b.dataset.quick, minutes: 20, memo: "" }; selectedDate = ymd(); currentTab = "log"; render(); };
  });
  view.querySelectorAll("[data-wateri]").forEach((b) => {
    b.onclick = () => {
      const i = parseInt(b.dataset.wateri, 10);
      // 押した位置までを満たす（同じ位置押せば1個減る）
      const cur = waterCountOn(ymd());
      const target = i + 1 === cur ? i : i + 1;
      addWater(target - cur);
      render();
      if (target >= waterGoal && cur < waterGoal) {
        toast("💧 水分目標たっせい！", "mint");
        playPraiseJingle();
      }
    };
  });
  const wp = document.getElementById("waterPlus");
  if (wp) wp.onclick = () => { addWater(1); render(); };
  const wm = document.getElementById("waterMinus");
  if (wm) wm.onclick = () => { addWater(-1); render(); };
  const hWadd = document.getElementById("hWadd");
  if (hWadd) hWadd.onclick = () => {
    const kg = parseFloat(document.getElementById("hWkg").value);
    if (!kg || kg < 20 || kg > 300) { toast("体重を正しく入れてね🙏", "coral"); return; }
    state.weights.push({ id: uid(), date: ymd(), kg: Math.round(kg * 10) / 10, memo: "", ts: Date.now() });
    state.profile.weightKg = kg; // 消費カロリー計算用も追従
    save(); render();
    toast(`⚖️ ${kg}kg 記録したよ`, "mint");
  };
  const hWmore = document.getElementById("hWmore");
  if (hWmore) hWmore.onclick = () => { currentTab = "settings"; render(); setTimeout(() => { const el = document.getElementById("weightChartCard"); if (el) el.scrollIntoView({ behavior: "smooth", block: "center" }); }, 50); };
  const omkGo = document.getElementById("omkGo");
  if (omkGo && ex) omkGo.onclick = () => { formDraft = { typeId: ex.id, minutes: omikuji.minutes, memo: "" }; selectedDate = ymd(); currentTab = "log"; render(); };
  const omkReroll = document.getElementById("omkReroll");
  if (omkReroll) omkReroll.onclick = () => { rerollOmikuji(); render(); };
  const iosDismiss = document.getElementById("iosDismiss");
  if (iosDismiss) iosDismiss.onclick = () => { state.profile.iosBannerDismissed = true; save(); render(); };
  const helpCta = document.getElementById("helpCta");
  if (helpCta) helpCta.onclick = openHelp;
}

/* ===== Log (記録) ===== */
function renderLog() {
  const w = state.profile.weightKg;
  const ex = exById(formDraft.typeId);
  const exes = sortedExercises();
  const fav = state.favoriteExercises;
  const kcal = calcKcal(ex ? ex.mets : 5, w, formDraft.minutes);
  const dayLogs = state.logs.filter((l) => l.date === selectedDate).slice().reverse();
  const minPresets = [10, 20, 30, 45, 60];
  const isToday = selectedDate === ymd();

  view.innerHTML = `
    ${renderDateBar()}
    <div class="card">
      <h3 class="card-title">✏️ ${isToday ? "今日" : dateLabel(selectedDate)}の運動を記録</h3>
      <div class="field">
        <label>運動の種類 <span class="hint-inline">★でお気に入りに</span></label>
        <div class="type-grid">
          ${exes.map((e) => `
            <button class="type-opt ${e.id === formDraft.typeId ? "active" : ""}" data-type="${e.id}">
              <span class="fav-star ${fav.includes(e.id) ? "on" : ""}" data-favex="${e.id}" role="button" aria-label="お気に入り">${fav.includes(e.id) ? "★" : "☆"}</span>
              <span class="e">${e.emoji}</span><span class="n">${escapeHtml(e.name)}</span>
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
        <div class="sub">${ex ? ex.emoji : "🏃"} ${ex ? ex.name : ""} ${formDraft.minutes}分の消費カロリー目安</div>
      </div>
      <button class="btn btn-primary" id="saveLog">この運動を記録する 💪</button>
    </div>

    <div class="card">
      <h3 class="card-title">📋 ${isToday ? "今日" : dateLabel(selectedDate)}の記録</h3>
      ${dayLogs.length === 0
        ? `<div class="empty"><span class="big">🌱</span>まだ記録がないよ。<br>軽い運動からはじめよう！</div>`
        : dayLogs.map((l) => {
            const e = exById(l.typeId);
            if (editingLogId === l.id && editingLogDraft) {
              return `<div class="log-item editing">
                <div class="log-emoji">${e ? e.emoji : "🏃"}</div>
                <div class="log-edit-body">
                  <label class="mini-lbl">時間（分）</label>
                  <input type="number" id="elMin" value="${editingLogDraft.minutes}" inputmode="numeric" min="1" max="600" />
                  <label class="mini-lbl">メモ</label>
                  <input type="text" id="elMemo" value="${escapeHtml(editingLogDraft.memo)}" placeholder="メモ" />
                  <div class="log-edit-actions">
                    <button class="btn btn-primary btn-sm" data-elsave="${l.id}">保存</button>
                    <button class="btn btn-ghost btn-sm" data-elcancel="${l.id}">キャンセル</button>
                  </div>
                </div>
              </div>`;
            }
            return `<div class="log-item">
              <div class="log-emoji">${e ? e.emoji : "🏃"}</div>
              <div class="log-main">
                <div class="t">${e ? escapeHtml(e.name) : "運動"}</div>
                <div class="s">${l.minutes}分${l.memo ? ` ・ 📝 ${escapeHtml(l.memo)}` : ""}</div>
              </div>
              <div class="log-kcal">${l.kcal} kcal</div>
              <button class="log-edit" data-edit="${l.id}" aria-label="編集">✏️</button>
              <button class="log-del" data-del="${l.id}" aria-label="削除">✕</button>
            </div>`;
          }).join("")}
    </div>`;

  bindDateBar();
  view.querySelectorAll("[data-type]").forEach((b) => {
    b.onclick = (ev) => {
      if (ev.target && ev.target.dataset && ev.target.dataset.favex) return;
      formDraft.typeId = b.dataset.type; render();
    };
  });
  view.querySelectorAll("[data-favex]").forEach((b) => {
    b.onclick = (ev) => {
      ev.stopPropagation();
      toggleFavExercise(b.dataset.favex);
      render();
    };
  });
  view.querySelectorAll("[data-min]").forEach((b) => {
    b.onclick = () => { formDraft.minutes = parseInt(b.dataset.min, 10); render(); };
  });
  const minInput = document.getElementById("minInput");
  if (minInput) minInput.oninput = () => {
    const v = parseInt(minInput.value, 10);
    formDraft.minutes = isNaN(v) ? 0 : v;
    const ex2 = exById(formDraft.typeId);
    view.querySelector(".kcal-preview .num").textContent = calcKcal(ex2 ? ex2.mets : 5, w, formDraft.minutes);
    view.querySelector(".kcal-preview .sub").textContent = `${ex2 ? ex2.emoji : "🏃"} ${ex2 ? ex2.name : ""} ${formDraft.minutes}分の消費カロリー目安`;
    view.querySelectorAll(".min-chip").forEach((c) => c.classList.toggle("active", parseInt(c.dataset.min,10) === formDraft.minutes));
  };
  const memoInput = document.getElementById("memoInput");
  if (memoInput) memoInput.oninput = () => { formDraft.memo = memoInput.value; };
  document.getElementById("saveLog").onclick = saveLog;
  view.querySelectorAll("[data-del]").forEach((b) => {
    b.onclick = () => { state.logs = state.logs.filter((l) => l.id !== b.dataset.del); save(); render(); };
  });
  view.querySelectorAll("[data-edit]").forEach((b) => {
    b.onclick = () => {
      const l = state.logs.find((x) => x.id === b.dataset.edit);
      if (!l) return;
      editingLogId = l.id;
      editingLogDraft = { minutes: l.minutes, memo: l.memo || "" };
      render();
    };
  });
  view.querySelectorAll("[data-elsave]").forEach((b) => {
    b.onclick = () => {
      const l = state.logs.find((x) => x.id === b.dataset.elsave);
      if (!l) return;
      const m = parseInt(document.getElementById("elMin").value, 10);
      if (!m || m < 1) { toast("時間を入れてね⏱️", "coral"); return; }
      const e = exById(l.typeId);
      l.minutes = m;
      l.kcal = calcKcal(e ? e.mets : 5, state.profile.weightKg, m);
      l.memo = (document.getElementById("elMemo").value || "").trim();
      editingLogId = null; editingLogDraft = null;
      save(); render();
      toast("更新したよ✏️", "mint");
    };
  });
  view.querySelectorAll("[data-elcancel]").forEach((b) => {
    b.onclick = () => { editingLogId = null; editingLogDraft = null; render(); };
  });
}

function toggleFavExercise(id) {
  const i = state.favoriteExercises.indexOf(id);
  if (i >= 0) state.favoriteExercises.splice(i, 1);
  else state.favoriteExercises.unshift(id);
  save();
}
function toggleFavFood(name) {
  const i = state.favoriteFoods.indexOf(name);
  if (i >= 0) state.favoriteFoods.splice(i, 1);
  else state.favoriteFoods.unshift(name);
  save();
}

function saveLog() {
  const ex = exById(formDraft.typeId);
  if (!ex) { toast("運動を選んでね🙏", "coral"); return; }
  const mins = formDraft.minutes;
  if (!mins || mins < 1) { toast("運動時間を入れてね⏱️", "coral"); return; }
  const targetDate = selectedDate;
  const wasAchieved = isAchieved(targetDate);
  const kcal = calcKcal(ex.mets, state.profile.weightKg, mins);
  state.logs.push({ id: uid(), date: targetDate, typeId: ex.id, minutes: mins, kcal, memo: (formDraft.memo || "").trim(), ts: Date.now() });
  formDraft.memo = "";
  save();
  const nowAchieved = isAchieved(targetDate);
  if (!wasAchieved && nowAchieved) {
    if (targetDate === ymd()) {
      currentTab = "home"; render();
      setTimeout(() => celebrate(), 120);
    } else {
      toast(`🏆 ${dateLabel(targetDate)} のスタンプGET！`, "mint");
      render();
    }
  } else {
    toast(`${ex.emoji} ${kcal}kcal 記録したよ！`, "mint");
    if (targetDate === ymd()) {
      currentTab = "home"; render();
      setTimeout(bounceMascot, 100);
    } else {
      render();
    }
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

  // 月次サマリー（表示中の月）
  const sum = monthlySummary(y, m);
  const topEx = sum.topType ? exById(sum.topType) : null;
  const lv = levelFor(done.size);

  view.innerHTML = `
    <div class="card streak-hero">
      <div class="num">${streak}<span class="unit">日</span></div>
      <div class="lbl">🔥 連続達成中！</div>
      ${best > 0 ? `<div class="streak-best">自己ベスト ${best}日連続</div>` : ""}
      <div class="level-badge" style="background:${lv.color}22;color:${lv.color};margin-top:12px">
        ${lv.emoji} ${lv.name}（累計 ${done.size}日）
      </div>
    </div>

    <div class="card celebrate-card">
      <h3 class="card-title">🎁 達成カードをシェア</h3>
      <div class="note" style="margin-bottom:12px">いまのがんばりを1枚絵にして友だちにシェアできるよ📸</div>
      <div class="row-2">
        <button class="btn btn-primary btn-sm" id="cardShare">📤 シェア / 保存</button>
        <button class="btn btn-ghost btn-sm" id="cardPreview">🖼️ プレビュー</button>
      </div>
      <div id="cardPreviewBox" hidden style="margin-top:12px"></div>
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
    </div>

    <div class="card">
      <h3 class="card-title">📜 ${y}年 ${m+1}月 の成績表</h3>
      <div class="balance" style="margin-bottom:10px">
        <div><div class="v">${sum.achievedInMonth}<span style="font-size:12px">日</span></div><div class="l">達成日数</div></div>
        <div><div class="v" style="color:var(--mint-dark)">${sum.burned}</div><div class="l">消費kcal</div></div>
        <div><div class="v" style="color:var(--coral)">${sum.intake}</div><div class="l">摂取kcal</div></div>
        <div><div class="v">${sum.intake - sum.burned >= 0 ? "+" : ""}${sum.intake - sum.burned}</div><div class="l">差し引き</div></div>
      </div>
      <div class="month-rows">
        <div class="mr"><span>🏃 総運動時間</span><b>${sum.exerciseMins} 分</b></div>
        ${topEx ? `<div class="mr"><span>🏅 一番やった運動</span><b>${topEx.emoji} ${escapeHtml(topEx.name)}（${sum.topMins}分）</b></div>` : ""}
        <div class="mr"><span>✊ がまんできた回数</span><b>${sum.resisted} 回</b></div>
        <div class="mr"><span>🍪 食べちゃった回数</span><b>${sum.ate} 回</b></div>
      </div>
      <div class="trend-summary" style="margin-top:12px">${sum.achievedInMonth === 0 ? `🌱 今月はこれから！1日でも達成すれば成績表に光るよ` : sum.achievedInMonth >= 20 ? `🌟 ${sum.achievedInMonth}日達成！MVP級のがんばり！` : `🎉 ${sum.achievedInMonth}日達成！すばらしい！`}</div>
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
  const cardShareBtn = document.getElementById("cardShare");
  if (cardShareBtn) cardShareBtn.onclick = shareCelebrationCard;
  const cardPreviewBtn = document.getElementById("cardPreview");
  if (cardPreviewBtn) cardPreviewBtn.onclick = async () => {
    const box = document.getElementById("cardPreviewBox");
    if (!box) return;
    box.innerHTML = `<div class="empty" style="padding:6px 0;font-size:12px">🎨 生成中...</div>`;
    box.hidden = false;
    try {
      const dataUrl = await generateCelebrationCard();
      box.innerHTML = `<img src="${dataUrl}" alt="達成カードのプレビュー" style="width:100%;border-radius:14px;display:block;box-shadow:var(--shadow-sm)"/>`;
    } catch {
      box.innerHTML = `<div class="empty" style="color:var(--coral)">カードを作れなかったよ🙏</div>`;
    }
  };
}

/* ---------- 📜 月別総まとめ ---------- */
function monthlySummary(y, m) {
  const prefix = `${y}-${String(m+1).padStart(2,"0")}-`;
  const logs = state.logs.filter((l) => l.date.startsWith(prefix));
  const foods = state.foods.filter((f) => f.date.startsWith(prefix));
  const snacks = state.snacks.filter((s) => s.date.startsWith(prefix));
  const burned = logs.reduce((s, l) => s + (l.kcal || 0), 0);
  const intake = foods.reduce((s, f) => s + (f.kcal || 0), 0);
  const exerciseMins = logs.reduce((s, l) => s + l.minutes, 0);
  const achievedInMonth = [...achievedDates()].filter((d) => d.startsWith(prefix)).length;
  const resisted = snacks.filter((s) => s.action === "resisted").length;
  const ate = snacks.filter((s) => s.action === "ate").length;
  const byType = {};
  logs.forEach((l) => { byType[l.typeId] = (byType[l.typeId] || 0) + l.minutes; });
  let topType = null, topMins = 0;
  Object.entries(byType).forEach(([k, v]) => { if (v > topMins) { topType = k; topMins = v; } });
  return { burned, intake, exerciseMins, achievedInMonth, resisted, ate, topType, topMins };
}

/* ---------- 🎁 お祝いカード生成 + シェア ---------- */
async function generateCelebrationCard() {
  const W = 1080, H = 1080;
  const cnv = document.createElement("canvas");
  cnv.width = W; cnv.height = H;
  const ctx = cnv.getContext("2d");
  // 背景グラデーション
  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, "#fff9f0");
  grad.addColorStop(0.65, "#e6faf7");
  grad.addColorStop(1, "#a8e6df");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);
  // 紙吹雪
  const dots = [
    { x: 80,  y: 120, c: "#ff6b6b" }, { x: 980, y: 110, c: "#4ecdc4" },
    { x: 140, y: 280, c: "#ffd166" }, { x: 920, y: 320, c: "#a78bfa" },
    { x: 70,  y: 540, c: "#4ecdc4" }, { x: 1000,y: 600, c: "#ff8fab" },
    { x: 60,  y: 880, c: "#ffd166" }, { x: 990, y: 900, c: "#a78bfa" },
  ];
  dots.forEach((d) => { ctx.fillStyle = d.c; ctx.beginPath(); ctx.arc(d.x, d.y, 14, 0, Math.PI*2); ctx.fill(); });
  // タイトル
  ctx.fillStyle = "#2d3142";
  ctx.font = "bold 80px 'Hiragino Sans', 'Noto Sans JP', sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("🌿 slimmate", W/2, 140);
  // ストリーク巨大表示
  const streak = currentStreak();
  const total = achievedDates().size;
  const lv = levelFor(total);
  ctx.fillStyle = "#ff6b6b";
  ctx.font = "bold 280px 'Hiragino Sans', 'Noto Sans JP', sans-serif";
  ctx.fillText(String(streak), W/2, 460);
  ctx.fillStyle = "#2d3142";
  ctx.font = "bold 64px 'Hiragino Sans', 'Noto Sans JP', sans-serif";
  ctx.fillText("日連続たっせい 🔥", W/2, 550);
  // レベル
  ctx.fillStyle = lv.color;
  ctx.font = "bold 48px 'Hiragino Sans', 'Noto Sans JP', sans-serif";
  ctx.fillText(`${lv.emoji} ${lv.name}  ・ 累計 ${total} スタンプ`, W/2, 640);
  // マスコット（SVG→Image）
  try {
    const mImg = await svgToImage(mascotSVG("proud"));
    const mw = 360, mh = 360;
    ctx.drawImage(mImg, W/2 - mw/2, 690, mw, mh);
  } catch {}
  // フッター
  ctx.fillStyle = "#6b7280";
  ctx.font = "32px 'Hiragino Sans', 'Noto Sans JP', sans-serif";
  ctx.fillText(`#slimmate ・ あるるんとがんばり中`, W/2, 1040);
  return cnv.toDataURL("image/png");
}
function svgToImage(svgStr) {
  return new Promise((resolve, reject) => {
    const blob = new Blob([svgStr], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => { resolve(img); /* URL は描画後でも GC されるまで残るので即 revoke しない */ setTimeout(() => URL.revokeObjectURL(url), 1000); };
    img.onerror = (e) => { URL.revokeObjectURL(url); reject(e); };
    img.src = url;
  });
}
async function shareCelebrationCard() {
  let dataUrl;
  try { dataUrl = await generateCelebrationCard(); }
  catch { toast("カードを作れなかったよ🙏", "coral"); return; }
  const filename = `slimmate-${ymd()}.png`;
  try {
    const blob = await (await fetch(dataUrl)).blob();
    const file = new File([blob], filename, { type: "image/png" });
    if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({
        files: [file],
        title: "slimmate",
        text: `${currentStreak()}日連続たっせい！ あるるんとがんばってます🌱 #slimmate`,
      });
      toast("シェアしたよ🎉", "mint");
      return;
    }
  } catch {}
  // フォールバック：ダウンロード
  const a = document.createElement("a");
  a.href = dataUrl; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  toast("カードを保存したよ📥 SNSにアップしてね！", "mint");
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
// プリセット+カスタム（共通形式に揃える）
function allFoods() {
  const customs = (state && state.customFoods) ? state.customFoods : [];
  return FOODS_PRESET.concat(customs);
}
// お気に入り優先で並び替え
function sortedFoods() {
  const favs = (state && state.favoriteFoods) ? state.favoriteFoods : [];
  const all = allFoods();
  const key = (f) => f.name;
  const pinned = favs.map((k) => all.find((f) => key(f) === k)).filter(Boolean);
  const rest = all.filter((f) => !favs.includes(key(f)));
  return pinned.concat(rest);
}
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
  if (showGallery) return renderFoodGallery();
  const dayFoods = foodsOn(selectedDate).slice().reverse();
  const intake = intakeOn(selectedDate);
  const burned = kcalOn(selectedDate);
  const foods = sortedFoods();
  const fav = state.favoriteFoods;
  const isToday = selectedDate === ymd();

  view.innerHTML = `
    ${renderDateBar()}
    <div class="card">
      <div class="cal-head">
        <h3 class="card-title" style="margin:0">📷 写真でかんたん記録</h3>
        <button class="btn btn-ghost btn-sm" id="openGalleryBtn">🖼️ ギャラリー</button>
      </div>
      <input type="file" id="foodPhoto" accept="image/*" capture="environment" hidden />
      ${foodDraft.photo
        ? `<div class="photo-preview"><img src="${foodDraft.photo}" alt="食事の写真"/><button class="photo-remove" id="photoRemove" aria-label="写真を消す">✕</button></div>`
        : `<button class="photo-btn" id="photoBtn"><span class="cam">📷</span>写真を撮る / 選ぶ</button>`}
      <div class="note" style="margin-top:10px">
        写真は記録用に残せます。カロリーは下の食べ物ボタンを選ぶと<b>自動で入力</b>されます（目安）。
      </div>
    </div>

    <div class="card">
      <h3 class="card-title">🍽️ 何を食べた？ <span class="hint-inline">★でお気に入りに</span></h3>
      <div class="food-quick">
        ${foods.map((f) => `
          <button class="food-chip" data-food="${escapeHtml(f.name)}">
            <span class="fav-star ${fav.includes(f.name) ? "on" : ""}" data-favfood="${escapeHtml(f.name)}" role="button" aria-label="お気に入り">${fav.includes(f.name) ? "★" : "☆"}</span>
            <span class="e">${f.emoji}</span><span class="n">${escapeHtml(f.name)}</span><span class="k">${f.kcal}kcal</span>
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
      <h3 class="card-title">⚖️ ${isToday ? "今日" : dateLabel(selectedDate)}のバランス</h3>
      <div class="balance">
        <div><div class="v" style="color:var(--coral)">${intake}</div><div class="l">摂取 kcal</div></div>
        <div><div class="v" style="color:var(--mint-dark)">${burned}</div><div class="l">運動 kcal</div></div>
        <div><div class="v">${intake - burned >= 0 ? "+" : ""}${intake - burned}</div><div class="l">差し引き</div></div>
      </div>
    </div>

    <div class="card">
      <h3 class="card-title">📋 ${isToday ? "今日" : dateLabel(selectedDate)}の食事</h3>
      ${dayFoods.length === 0
        ? `<div class="empty"><span class="big">🍽️</span>まだ記録がないよ。<br>写真やボタンでサクッと記録！</div>`
        : dayFoods.map((f) => {
          if (editingFoodId === f.id && editingFoodDraft) {
            return `<div class="log-item editing">
              ${f.photo ? `<img class="food-thumb" src="${f.photo}" alt=""/>` : `<div class="log-emoji">🍽️</div>`}
              <div class="log-edit-body">
                <label class="mini-lbl">食べたもの</label>
                <input type="text" id="efName" value="${escapeHtml(editingFoodDraft.name)}" />
                <label class="mini-lbl">カロリー</label>
                <input type="number" id="efKcal" value="${editingFoodDraft.kcal}" inputmode="numeric" />
                <label class="mini-lbl">メモ</label>
                <input type="text" id="efMemo" value="${escapeHtml(editingFoodDraft.memo)}" />
                <div class="log-edit-actions">
                  <button class="btn btn-primary btn-sm" data-efsave="${f.id}">保存</button>
                  <button class="btn btn-ghost btn-sm" data-efcancel="${f.id}">キャンセル</button>
                </div>
              </div>
            </div>`;
          }
          return `<div class="log-item">
            ${f.photo ? `<img class="food-thumb" src="${f.photo}" alt=""/>` : `<div class="log-emoji">🍽️</div>`}
            <div class="log-main">
              <div class="t">${escapeHtml(f.name)}</div>
              <div class="s">${f.memo ? `📝 ${escapeHtml(f.memo)}` : "&nbsp;"}</div>
            </div>
            <div class="log-kcal" style="color:var(--coral)">${f.kcal || 0} kcal</div>
            <button class="log-edit" data-editfood="${f.id}" aria-label="編集">✏️</button>
            <button class="log-del" data-delfood="${f.id}" aria-label="削除">✕</button>
          </div>`;
        }).join("")}
    </div>`;

  bindDateBar();
  const galBtn = document.getElementById("openGalleryBtn");
  if (galBtn) galBtn.onclick = () => { showGallery = true; render(); };

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
    b.onclick = (ev) => {
      if (ev.target && ev.target.dataset && ev.target.dataset.favfood) return;
      const name = b.dataset.food;
      const f = allFoods().find((x) => x.name === name);
      if (!f) return;
      foodDraft.name = f.name; foodDraft.kcal = f.kcal; render();
    };
  });
  view.querySelectorAll("[data-favfood]").forEach((b) => {
    b.onclick = (ev) => {
      ev.stopPropagation();
      toggleFavFood(b.dataset.favfood);
      render();
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
  view.querySelectorAll("[data-editfood]").forEach((b) => {
    b.onclick = () => {
      const f = state.foods.find((x) => x.id === b.dataset.editfood);
      if (!f) return;
      editingFoodId = f.id;
      editingFoodDraft = { name: f.name, kcal: f.kcal || 0, memo: f.memo || "" };
      render();
    };
  });
  view.querySelectorAll("[data-efsave]").forEach((b) => {
    b.onclick = () => {
      const f = state.foods.find((x) => x.id === b.dataset.efsave);
      if (!f) return;
      const name = (document.getElementById("efName").value || "").trim();
      const kcal = parseInt(document.getElementById("efKcal").value, 10);
      if (!name) { toast("食べたものを入れてね🙏", "coral"); return; }
      f.name = name;
      f.kcal = isNaN(kcal) ? 0 : kcal;
      f.memo = (document.getElementById("efMemo").value || "").trim();
      editingFoodId = null; editingFoodDraft = null;
      save(); render();
      toast("更新したよ✏️", "mint");
    };
  });
  view.querySelectorAll("[data-efcancel]").forEach((b) => {
    b.onclick = () => { editingFoodId = null; editingFoodDraft = null; render(); };
  });
}

/* ===== 食事写真ギャラリー ===== */
function renderFoodGallery() {
  const photos = state.foods.filter((f) => f.photo).slice().sort((a, b) => (b.ts || 0) - (a.ts || 0));
  view.innerHTML = `
    <div class="help-bar">
      <button class="help-back" id="galBack">← 食事へ戻る</button>
      <h2 class="help-title">🖼️ 食事ギャラリー</h2>
    </div>
    <div class="card">
      ${photos.length === 0
        ? `<div class="empty"><span class="big">📷</span>まだ写真がありません。<br>食事に写真をつけてみよう！</div>`
        : `<div class="gallery-grid">
            ${photos.map((f) => `
              <div class="gallery-cell" data-galf="${f.id}">
                <img src="${f.photo}" alt="${escapeHtml(f.name)}"/>
                <div class="cap">
                  <div class="cap-n">${escapeHtml(f.name)}</div>
                  <div class="cap-d">${f.date} ・ ${f.kcal || 0}kcal</div>
                </div>
              </div>`).join("")}
          </div>`}
    </div>
  `;
  document.getElementById("galBack").onclick = () => { showGallery = false; render(); };
}

function saveFood() {
  const name = (foodDraft.name || "").trim();
  const kcal = parseInt(foodDraft.kcal, 10);
  if (!name && !foodDraft.photo) { toast("食べたものを入力するか写真を選んでね🙏", "coral"); return; }
  const entry = {
    id: uid(), date: selectedDate, name: name || "食事",
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
    <div class="card help-cta-card" id="helpCtaS">
      <div class="help-cta-row">
        <div class="help-cta-emoji">📖</div>
        <div class="help-cta-text">
          <div class="help-cta-title">使い方・ヘルプ・ご意見</div>
          <div class="help-cta-sub">アプリの使い方やよくある質問、ご要望はこちらから</div>
        </div>
        <div class="help-cta-arrow">›</div>
      </div>
    </div>

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
      <button class="btn btn-ghost btn-sm" id="alEatBtn" style="width:100%;margin-top:8px">🍪 お菓子食べちゃった（のーーーーーーーーーー）</button>
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
      <h3 class="card-title">🎨 みためテーマ</h3>
      <div class="seg help-seg" style="margin-bottom:0">
        <button class="seg-btn ${p.theme==="auto"?"active":""}" data-theme="auto">🔄 自動</button>
        <button class="seg-btn ${p.theme==="light"?"active":""}" data-theme="light">☀️ ライト</button>
        <button class="seg-btn ${p.theme==="dark"?"active":""}" data-theme="dark">🌙 ダーク</button>
      </div>
      <div class="note" style="margin-top:10px">自動：端末の設定にあわせます。</div>
    </div>

    <div class="card">
      <h3 class="card-title">🎀 マスコットの着せ替え</h3>
      <div class="skin-grid">
        ${SKINS.map((s) => {
          const unlocked = unlockedSkins().includes(s.id);
          const active = p.mascotSkin === s.id;
          return `<button class="skin-opt ${active ? "active" : ""} ${unlocked ? "" : "locked"}" data-skin="${s.id}">
            <span class="e">${s.emoji}</span>
            <span class="n">${s.name}</span>
            <span class="d">${unlocked ? s.desc : "🔒 " + s.desc}</span>
          </button>`;
        }).join("")}
      </div>
    </div>

    <div class="card">
      <h3 class="card-title">⏰ あるるんの朝・夜のコール</h3>
      <div class="toggle-row">
        <div><div class="lbl">🌞 モーニングコール</div><div class="sub">朝、起きたタイミングで今日の目標を声かけ</div></div>
        <label class="switch"><input type="checkbox" id="mcOn" ${p.morningCall.enabled ? "checked" : ""}/><span class="slider"></span></label>
      </div>
      <div class="field" style="margin:8px 0 0" ${p.morningCall.enabled ? "" : 'hidden'}>
        <label>時刻</label>
        <input type="time" id="mcTime" value="${hhmm(p.morningCall.hour, p.morningCall.min)}" />
      </div>
      <div class="divider"></div>
      <div class="toggle-row">
        <div><div class="lbl">🌙 ナイトコール</div><div class="sub">夜、今日のがんばりを振り返って褒める</div></div>
        <label class="switch"><input type="checkbox" id="ncOn" ${p.nightCall.enabled ? "checked" : ""}/><span class="slider"></span></label>
      </div>
      <div class="field" style="margin:8px 0 0" ${p.nightCall.enabled ? "" : 'hidden'}>
        <label>時刻</label>
        <input type="time" id="ncTime" value="${hhmm(p.nightCall.hour, p.nightCall.min)}" />
      </div>
    </div>

    <div class="card">
      <h3 class="card-title">🏷️ カスタム運動・食事を追加</h3>
      <div class="note" style="margin-bottom:10px">よく使う運動や食べ物を自分で登録できます。</div>
      <details class="faq-item">
        <summary>🏃 オリジナル運動を追加</summary>
        <div class="a" style="padding-bottom:10px">
          <div class="row-2">
            <input type="text" id="cexName" placeholder="例: ピラティス" />
            <input type="text" id="cexEmoji" placeholder="🤸" maxlength="2" />
          </div>
          <div class="row-2" style="margin-top:8px">
            <input type="number" id="cexMets" step="0.5" min="1" max="20" placeholder="METs (例: 5.0)" />
            <button class="btn btn-primary btn-sm" id="cexAdd">＋ 追加</button>
          </div>
          <div class="hint" style="margin-top:6px">METsの目安：ウォーキング3.5 / ジョギング7 / 縄跳び10</div>
          ${state.customExercises.length ? `
            <div style="margin-top:10px">
              ${state.customExercises.map((e) => `
                <div class="custom-row">
                  <span>${e.emoji} ${escapeHtml(e.name)} <small style="color:var(--ink-soft)">METs ${e.mets}</small></span>
                  <button class="log-del" data-cexdel="${e.id}">✕</button>
                </div>`).join("")}
            </div>` : ""}
        </div>
      </details>
      <details class="faq-item">
        <summary>🍽️ オリジナル食べ物を追加</summary>
        <div class="a" style="padding-bottom:10px">
          <div class="row-2">
            <input type="text" id="cfName" placeholder="例: 母のオムライス" />
            <input type="text" id="cfEmoji" placeholder="🍳" maxlength="2" />
          </div>
          <div class="row-2" style="margin-top:8px">
            <input type="number" id="cfKcal" inputmode="numeric" placeholder="kcal" />
            <button class="btn btn-primary btn-sm" id="cfAdd">＋ 追加</button>
          </div>
          ${state.customFoods.length ? `
            <div style="margin-top:10px">
              ${state.customFoods.map((f) => `
                <div class="custom-row">
                  <span>${f.emoji} ${escapeHtml(f.name)} <small style="color:var(--ink-soft)">${f.kcal}kcal</small></span>
                  <button class="log-del" data-cfdel="${f.id}">✕</button>
                </div>`).join("")}
            </div>` : ""}
        </div>
      </details>
    </div>

    <div class="card" id="weightChartCard">
      <h3 class="card-title">📈 体重の推移</h3>
      ${renderWeightChart(90)}
      <div class="balance" style="margin-top:10px">
        ${(() => {
          const wt = latestWeight();
          const first = state.weights.length ? state.weights[0] : null;
          const diff = wt && first ? Math.round((wt.kg - first.kg) * 10) / 10 : null;
          return `
            <div><div class="v">${wt ? wt.kg : "—"}<span style="font-size:12px"> kg</span></div><div class="l">最新</div></div>
            <div><div class="v">${first ? first.kg : "—"}<span style="font-size:12px"> kg</span></div><div class="l">開始時</div></div>
            <div><div class="v" style="color:${diff===null?'var(--ink-soft)':(diff<=0?'var(--mint-dark)':'var(--coral)')}">${diff===null?"—":(diff>0?"+":"")+diff}<span style="font-size:12px"> kg</span></div><div class="l">変化</div></div>
          `;
        })()}
      </div>
      <div class="row-2" style="margin-top:12px">
        <input type="number" id="wkg" inputmode="decimal" step="0.1" placeholder="今の体重 kg" />
        <button class="btn btn-primary btn-sm" id="wAdd">記録する</button>
      </div>
      ${state.weights.length ? `
      <details class="faq-item" style="margin-top:10px">
        <summary>📜 履歴を見る（${state.weights.length}件）</summary>
        <div class="a" style="padding-bottom:10px">
          ${state.weights.slice().reverse().slice(0, 30).map((w) => `
            <div class="custom-row">
              <span>${w.date} — <b>${w.kg}kg</b>${w.memo ? ` ・ ${escapeHtml(w.memo)}` : ""}</span>
              <button class="log-del" data-wdel="${w.id}">✕</button>
            </div>`).join("")}
        </div>
      </details>` : ""}
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

  const helpCtaS = document.getElementById("helpCtaS");
  if (helpCtaS) helpCtaS.onclick = openHelp;

  // 🎨 テーマ切替
  view.querySelectorAll("[data-theme]").forEach((b) => {
    b.onclick = () => { p.theme = b.dataset.theme; save(); applyTheme(); render(); };
  });

  // 🎀 マスコットスキン
  view.querySelectorAll("[data-skin]").forEach((b) => {
    b.onclick = () => {
      const id = b.dataset.skin;
      if (!unlockedSkins().includes(id)) {
        const s = SKINS.find((x) => x.id === id);
        toast(`まだロック中🔒 ${s ? s.desc : ""}`, "coral");
        return;
      }
      p.mascotSkin = id; save(); render();
    };
  });

  // ⏰ 朝・夜コール
  const mcOn = document.getElementById("mcOn");
  if (mcOn) mcOn.onchange = async () => {
    p.morningCall.enabled = mcOn.checked;
    if (mcOn.checked && "Notification" in window && Notification.permission === "default") {
      await Notification.requestPermission();
    }
    save(); render();
  };
  const mcTime = document.getElementById("mcTime");
  if (mcTime) mcTime.onchange = () => {
    const [h, m] = mcTime.value.split(":").map((x) => parseInt(x, 10));
    if (!isNaN(h)) p.morningCall.hour = h;
    if (!isNaN(m)) p.morningCall.min = m;
    save();
  };
  const ncOn = document.getElementById("ncOn");
  if (ncOn) ncOn.onchange = async () => {
    p.nightCall.enabled = ncOn.checked;
    if (ncOn.checked && "Notification" in window && Notification.permission === "default") {
      await Notification.requestPermission();
    }
    save(); render();
  };
  const ncTime = document.getElementById("ncTime");
  if (ncTime) ncTime.onchange = () => {
    const [h, m] = ncTime.value.split(":").map((x) => parseInt(x, 10));
    if (!isNaN(h)) p.nightCall.hour = h;
    if (!isNaN(m)) p.nightCall.min = m;
    save();
  };

  // 🏷️ カスタム運動
  const cexAdd = document.getElementById("cexAdd");
  if (cexAdd) cexAdd.onclick = () => {
    const name = (document.getElementById("cexName").value || "").trim();
    const emoji = (document.getElementById("cexEmoji").value || "🏃").trim() || "🏃";
    const mets = parseFloat(document.getElementById("cexMets").value);
    if (!name) { toast("名前を入れてね🙏", "coral"); return; }
    if (!mets || mets < 1 || mets > 20) { toast("METsは1〜20で入れてね🙏", "coral"); return; }
    state.customExercises.push({ id: "cex_" + uid(), name, emoji, mets });
    save(); render();
    toast(`✅ ${emoji} ${name} を追加！`, "mint");
  };
  view.querySelectorAll("[data-cexdel]").forEach((b) => {
    b.onclick = () => {
      state.customExercises = state.customExercises.filter((e) => e.id !== b.dataset.cexdel);
      // お気に入りからも除去
      state.favoriteExercises = state.favoriteExercises.filter((id) => id !== b.dataset.cexdel);
      save(); render();
    };
  });

  // 🏷️ カスタム食事
  const cfAdd = document.getElementById("cfAdd");
  if (cfAdd) cfAdd.onclick = () => {
    const name = (document.getElementById("cfName").value || "").trim();
    const emoji = (document.getElementById("cfEmoji").value || "🍽️").trim() || "🍽️";
    const kcal = parseInt(document.getElementById("cfKcal").value, 10);
    if (!name) { toast("名前を入れてね🙏", "coral"); return; }
    if (isNaN(kcal) || kcal < 0) { toast("カロリーを入れてね🙏", "coral"); return; }
    state.customFoods.push({ id: "cf_" + uid(), name, emoji, kcal });
    save(); render();
    toast(`✅ ${emoji} ${name} を追加！`, "mint");
  };
  view.querySelectorAll("[data-cfdel]").forEach((b) => {
    b.onclick = () => {
      const target = state.customFoods.find((f) => f.id === b.dataset.cfdel);
      state.customFoods = state.customFoods.filter((f) => f.id !== b.dataset.cfdel);
      if (target) state.favoriteFoods = state.favoriteFoods.filter((n) => n !== target.name);
      save(); render();
    };
  });

  // ⚖️ 体重チャート 追加・削除
  const wAdd = document.getElementById("wAdd");
  if (wAdd) wAdd.onclick = () => {
    const kg = parseFloat(document.getElementById("wkg").value);
    if (!kg || kg < 20 || kg > 300) { toast("体重を正しく入れてね🙏", "coral"); return; }
    state.weights.push({ id: uid(), date: ymd(), kg: Math.round(kg * 10) / 10, memo: "", ts: Date.now() });
    p.weightKg = kg;
    save(); render();
    toast(`⚖️ ${kg}kg 記録したよ`, "mint");
  };
  view.querySelectorAll("[data-wdel]").forEach((b) => {
    b.onclick = () => {
      state.weights = state.weights.filter((w) => w.id !== b.dataset.wdel);
      save(); render();
    };
  });
}

/* ---------- 📈 体重折れ線グラフ ---------- */
function renderWeightChart(days) {
  const data = weightTrendData(days);
  if (data.length < 2) {
    return `<div class="empty" style="padding:14px 0;font-size:13px">📈 体重を <b>2回以上</b> 記録するとグラフが出るよ</div>`;
  }
  const w = 320, h = 160, pad = 26;
  const kgs = data.map((d) => d.kg);
  const minKg = Math.min(...kgs) - 0.4;
  const maxKg = Math.max(...kgs) + 0.4;
  const range = Math.max(0.5, maxKg - minKg);
  const tsMin = data[0].ts;
  const tsMax = data[data.length - 1].ts;
  const tsRange = Math.max(1, tsMax - tsMin);
  const pts = data.map((d) => {
    const x = pad + ((d.ts - tsMin) / tsRange) * (w - pad * 2);
    const y = pad + ((maxKg - d.kg) / range) * (h - pad * 2);
    return { x, y, kg: d.kg, date: d.date };
  });
  const linePath = pts.map((p, i) => `${i ? "L" : "M"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  const areaPath = linePath + ` L${pts[pts.length-1].x.toFixed(1)},${h-pad} L${pts[0].x.toFixed(1)},${h-pad} Z`;
  return `
    <svg class="weight-chart" viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="none" style="width:100%;height:160px">
      <line x1="${pad}" y1="${pad}" x2="${pad}" y2="${h - pad}" stroke="var(--line)" />
      <line x1="${pad}" y1="${h - pad}" x2="${w - pad}" y2="${h - pad}" stroke="var(--line)" />
      <path d="${areaPath}" fill="var(--mint)" opacity="0.18"/>
      <path d="${linePath}" fill="none" stroke="var(--mint-dark)" stroke-width="2.5" stroke-linejoin="round"/>
      ${pts.map((p) => `<circle cx="${p.x}" cy="${p.y}" r="3" fill="var(--mint-dark)"/>`).join("")}
      <text x="${w - pad}" y="${pad - 4}" font-size="10" fill="var(--ink-soft)" text-anchor="end">${maxKg.toFixed(1)}kg</text>
      <text x="${w - pad}" y="${h - pad + 13}" font-size="10" fill="var(--ink-soft)" text-anchor="end">${minKg.toFixed(1)}kg</text>
    </svg>
  `;
}
function hourOpts(sel) {
  let s = "";
  for (let h = 0; h < 24; h++) s += `<option value="${h}" ${h === sel ? "selected" : ""}>${String(h).padStart(2,"0")}:00</option>`;
  return s;
}
function snackCount(action) {
  return state.snacks.filter((s) => s.date === ymd() && s.action === action).length;
}

/* ============================================================
 * ❓ ヘルプ・使い方・ご意見
 * ============================================================ */
// Supabase 設定（publishable key はクライアントに埋め込み前提。RLS で保護）
const SUPABASE_URL = "https://fnboarzssteuzjehfdfx.supabase.co/rest/v1";
const SUPABASE_KEY = "sb_publishable_sc-9RW6nzBsRulX1tNA2Hw_rgBcQKkr";
const FEEDBACK_TABLE = "feedback";
const APP_VERSION = "v1";
const FEEDBACK_CATEGORIES = [
  { id: "good",    emoji: "💚", label: "良かった点・感想" },
  { id: "ux",      emoji: "🤔", label: "使いにくい・改善希望" },
  { id: "bug",     emoji: "🐛", label: "バグ・不具合" },
  { id: "feature", emoji: "💡", label: "新機能リクエスト" },
  { id: "other",   emoji: "📮", label: "その他" },
];
let helpSection = "usage"; // "usage" | "faq" | "feedback"
let feedbackDraft = { category: "good", rating: 0, text: "", contact: "" };

function openHelp() {
  if (currentTab !== "help") previousTab = currentTab;
  currentTab = "help";
  render();
  window.scrollTo({ top: 0, behavior: "smooth" });
}
function closeHelp() {
  currentTab = previousTab && previousTab !== "help" ? previousTab : "home";
  render();
}

function renderHelp() {
  view.innerHTML = `
    <div class="help-bar">
      <button class="help-back" id="helpBack">← もどる</button>
      <h2 class="help-title">❓ ヘルプ・ご意見</h2>
    </div>
    <div class="seg help-seg">
      <button class="seg-btn ${helpSection==="usage"?"active":""}" data-help="usage">📖 使い方</button>
      <button class="seg-btn ${helpSection==="faq"?"active":""}" data-help="faq">❓ FAQ</button>
      <button class="seg-btn ${helpSection==="feedback"?"active":""}" data-help="feedback">💌 ご意見</button>
    </div>
    ${helpSection === "usage" ? renderUsageSection()
      : helpSection === "faq" ? renderFAQSection()
      : renderFeedbackSection()}
  `;
  document.getElementById("helpBack").onclick = closeHelp;
  view.querySelectorAll("[data-help]").forEach((b) => {
    b.onclick = () => { helpSection = b.dataset.help; render(); };
  });
  if (helpSection === "feedback") bindFeedbackForm();
}

const USAGE_SECTIONS = [
  {
    h: "🌱 まずは基本",
    steps: [
      { t: "🏠 ホームで今日をチェック",
        d: "達成リング・運動時間・回数・達成率を一目で確認。今の<b>レベル（🥚→🥉→🥈…）</b>バッジも出ます。" },
      { t: "🏃 運動を記録（最短2タップ）",
        d: "ホームの<b>クイック記録</b>か運動タブで、種類と時間を選ぶだけ。<b>METs × 体重 × 時間</b>でカロリーを自動計算。" },
      { t: "🍽️ 食事を記録",
        d: "食事タブでカロリーボタンを押すか、写真を撮って記録。「⚖️今日のバランス」で摂取と消費の差し引きが出ます。" },
      { t: "🏆 達成スタンプ・ポイントカード",
        d: "目標カロリーを超えた日にトロフィーが押されます。スタンプタブで<b>カレンダー・直近10日のポイントカード・グラフ・連続日数</b>を確認。" },
      { t: "👤 プロフィール（体重・目標）",
        d: "設定タブの 👤 プロフィール で体重と1日の目標kcalをいつでも変更可。体重はカロリー計算の基準、目標を超えた日にスタンプGET。" },
    ],
  },
  {
    h: "🆕 今日のあるるんが提案",
    steps: [
      { t: "🔮 今日のおみくじ",
        d: "ホームに毎日「今日のおすすめ運動」が1つ出ます。気が向かなければ<b>🎲引き直し</b>。タップで運動タブに移動して即記録。" },
      { t: "📅 過去の日を記録",
        d: "運動・食事タブの上部にある<b>日付バー</b>で前の日を選べば、後から「昨日のラン30分」も追加できます。" },
      { t: "✏️ 記録を編集",
        d: "ログ行の<b>✏️</b>で時間・メモ・カロリーを修正、<b>✕</b>で削除。間違えても安心。" },
      { t: "⭐ お気に入りに登録",
        d: "運動・食事チップ右上の<b>☆</b>をタップすると、お気に入りが先頭に並びます。よく使う3〜5つだけピン留めすると爆速。" },
      { t: "🏷️ カスタム運動・食事",
        d: "設定 → 🏷️カスタム追加 から、独自の運動（METs指定）や食事（kcal指定）を登録できます。" },
    ],
  },
  {
    h: "💪 健康習慣を見える化",
    steps: [
      { t: "💧 水分",
        d: "ホームに💧コップ8個。タップで埋まる／＋−ボタンでも調整。目標達成で「るんるん♪」とジングル。" },
      { t: "⚖️ 体重トラッキング",
        d: "ホームの⚖️カードか、設定 → 📈体重の推移 から記録。<b>SVG折れ線</b>で変化量も自動表示。" },
      { t: "🍪 間食メモ",
        d: "設定 → 🍪今日の間食メモ で「がまんした✊（→えらいぞー）」「食べちゃった🍪（→のーーー）」をワンタップ。" },
      { t: "🍪 お菓子ナッジ（時間帯ストッパー）",
        d: "設定 → 🍪お菓子ナッジ をONにして時間帯と間隔を設定すると、その時間中ずっと「いま無意識につまもうとしてない？」とあるるんが声かけしてくれます。" },
    ],
  },
  {
    h: "🎁 ご褒美・モチベ",
    steps: [
      { t: "🏅 称号レベル",
        d: "累計達成日数で<b>たまご→ルーキー→ブロンズ→シルバー→ゴールド→プラチナ→ダイヤ</b>と昇格。ホームとスタンプタブにバッジ。" },
      { t: "🎀 マスコット着せ替え",
        d: "達成日数で<b>リボン・キャップ・おうかん・サンタ</b>がアンロック。設定 → 🎀から選択。" },
      { t: "🎁 達成カードをシェア",
        d: "スタンプタブ → 🎁達成カード。連続日数のお祝い画像を生成して、SNSに <b>📤シェア</b> or <b>ダウンロード</b>。" },
      { t: "📜 月別総まとめ",
        d: "スタンプタブの最下部に、今月の達成日数・総消費・一番やった運動などの<b>成績表</b>が出ます。" },
    ],
  },
  {
    h: "🔔 声・通知",
    steps: [
      { t: "🔔 あるるんアラーム",
        d: "設定 → 🔔あるるんアラーム → 時刻と間隔を決めて<b>▶スタート</b>。停止ボタンを押すまで「みてるよ」と鳴り続けます。" },
      { t: "⏰ モーニング/ナイトコール",
        d: "設定 → ⏰朝・夜のコール で、朝は「おはよう、いっしょにがんばろうね」、夜は今日の達成度に応じた一言を声＋通知でお届け。" },
      { t: "🔊 声の調整",
        d: "設定 → 🔔あるるんアラーム の下にある<b>声の高さ・速さスライダー</b>でお好みのキャラ声に。" },
    ],
  },
  {
    h: "🌙 見た目・写真",
    steps: [
      { t: "🌙 ダークモード",
        d: "設定 → 🎨みためテーマ で<b>自動／ライト／ダーク</b>を選択。夜に開く人は<b>自動</b>でOK。" },
      { t: "🖼️ 食事写真ギャラリー",
        d: "食事タブの右上🖼️ボタンで、これまでの食事写真をグリッド表示。食生活を振り返るのに便利。" },
    ],
  },
  {
    h: "💾 機種変・データ",
    steps: [
      { t: "📱 ホーム画面に追加",
        d: "iOS Safari: 共有 → <b>「ホーム画面に追加」</b>。Android Chrome: メニュー → <b>「ホーム画面に追加」</b>。アプリのように1タップで開けます。" },
      { t: "💾 バックアップ・機種変",
        d: "設定 → 🗂️データ → 💾バックアップ で .json を保存し、新しい端末で 📥復元すれば全データ移行できます。" },
    ],
  },
  {
    h: "💌 ご意見・改善要望",
    steps: [
      { t: "💌 開発者にひとこと",
        d: "ヘッダーの<b>❓使い方</b>ピル → <b>💌ご意見</b>タブから、カテゴリ・星評価・本文を入れて<b>送信</b>。あなたの一言が次の機能になります🌱" },
    ],
  },
];
function renderUsageSection() {
  return `
    ${USAGE_SECTIONS.map((sec) => {
      let n = 0;
      return `
      <div class="card">
        <h3 class="card-title">${sec.h}</h3>
        ${sec.steps.map((s) => {
          n++;
          return `<div class="usage-step">
            <div class="n">${n}</div>
            <div class="body"><div class="t">${s.t}</div><div class="d">${s.d}</div></div>
          </div>`;
        }).join("")}
      </div>`;
    }).join("")}
    <div class="card">
      <h3 class="card-title">💡 ちょっとしたコツ</h3>
      <div class="note" style="line-height:1.8">
        ・お気に入り（☆→★）を3〜5個登録すると、運動/食事の入力が最速になります<br>
        ・記録は<b>過去の日付</b>にも追加可。後から「昨日のラン」も足せます<br>
        ・写真は端末内に保存（容量超過時は記録だけ残します）<br>
        ・<b>アラームが鳴らない</b>時は最初に「🔊声をためす」で音声許可を取ると安定<br>
        ・ご意見・要望は <b>💌ご意見</b> から開発者に直接届きます
      </div>
    </div>
  `;
}

const FAQ_LIST = [
  { q: "データはどこに保存されますか？",
    a: "運動・食事・体重などの記録は、すべて<b>あなたの端末の中（ブラウザのlocalStorage）だけ</b>に保存されます。サーバーには送られません。例外は「💌ご意見」だけで、これは開発者に届くフォームです。" },
  { q: "💌ご意見の内容はどこに送られますか？",
    a: "「💌送信する」ボタンを押した時だけ、入力したカテゴリ・星評価・本文・端末情報が<b>開発者の管理サーバー（Supabase）</b>に送信され、改善の参考にされます。あなたの記録データは一切送信されません。連絡先（任意）を入れた場合のみ返信される可能性があります。" },
  { q: "機種変するとデータは消えますか？",
    a: "そのままだと消えます。<b>設定 → 🗂️データ → 💾バックアップ</b>で .json を保存し、新しい端末で <b>📥復元</b> から読み込めば元通りです。" },
  { q: "ブラウザを変えるとデータは引き継がれますか？",
    a: "引き継がれません（Safari と Chrome は別々の保存領域です）。<b>バックアップ.json</b> で移してください。" },
  { q: "過去の日にも記録できますか？",
    a: "できます。運動・食事タブの上部にある<b>日付バー</b>で日付を選んでから記録すれば、その日に登録されます。スタンプも遡って付きます。" },
  { q: "間違えた記録を直したい",
    a: "ログ行の <b>✏️</b> ボタンで時間・メモ・カロリーを編集できます。<b>✕</b> で削除も可能です。" },
  { q: "称号レベルはどうやって上がりますか？",
    a: "<b>累計達成日数</b>で自動的に昇格します: 1日→ルーキー🌱 / 7日→ブロンズ🥉 / 14日→シルバー🥈 / 30日→ゴールド🥇 / 100日→プラチナ🏆 / 365日→ダイヤ💎。" },
  { q: "あるるんの着せ替えはどう増やす？",
    a: "達成日数でアンロックされます: 1日→リボン🎀 / 7日→キャップ🧢 / 30日→おうかん👑 / 60日→サンタ🎅。設定 → 🎀マスコットの着せ替え で選択。<b>全部無料</b>です。" },
  { q: "🔮おみくじはなんで毎日同じ？",
    a: "1日の間は同じおすすめが固定されます。気分じゃない時は<b>🎲引き直す</b>でランダム再抽選できます。" },
  { q: "アラームが鳴らない／止まった",
    a: "スマホがスリープ・別アプリに切り替わると音が制限される場合があります。最初に <b>「🔊 声をためす」</b> を押してブラウザに音声許可をしておくと安定します。iOS は「ホーム画面に追加」してから使うとより確実です。" },
  { q: "朝・夜のコールが鳴らない",
    a: "<b>通知許可</b>と<b>音声許可</b>の両方が必要です。設定 → ⏰朝・夜のコール の ON 時にブラウザが通知を求めるので「許可」を選んでください。" },
  { q: "通知が来ない",
    a: "ブラウザの通知許可をオンにしてください。iOS の Safari は<b>「ホーム画面に追加」してから</b>通知許可すると届きやすくなります。" },
  { q: "写真が保存できない／重い",
    a: "端末容量がいっぱいの可能性があります。<b>🖼️ギャラリー</b>で古い写真を削除するか、写真なしで記録すれば残せます。写真は自動で約640pxに縮小して保存しています。" },
  { q: "ダークモードにできますか？",
    a: "<b>設定 → 🎨みためテーマ</b> で「ライト／ダーク／自動」を選べます。「自動」は端末のシステム設定に追従します。" },
  { q: "達成カードはどこにシェアされる？",
    a: "スタンプタブの🎁達成カードの<b>📤シェア</b>を押すと、対応端末では SNSアプリの選択画面が出ます。それ以外の端末ではPNG画像が保存されるので、お好きなSNSに手動アップしてください。" },
  { q: "カロリー計算は正確ですか？",
    a: "<b>消費</b>＝METs × 体重 × 時間 × 1.05 の目安値です。<b>摂取</b>は一般的な食品の参考値で、選択した食事のカロリーは±20%程度ぶれます。あくまで習慣化の「ものさし」としてご利用ください。" },
  { q: "「のーーー」って何？",
    a: "お菓子を食べちゃったときに、あるるんが <b>「のーーー（やめてー）」</b> と切なくつぶやく声です。罪悪感をユーモアに変えるための演出です🍪" },
  { q: "オリジナルの運動・食事を登録できる？",
    a: "<b>設定 → 🏷️カスタム運動・食事を追加</b> から登録できます。運動はMETs（強度）を、食事はkcalを入れてください。" },
  { q: "アンインストールしても大丈夫？",
    a: "ホーム画面のアイコンを消すだけならOKですが、ブラウザの履歴やデータを完全に消すと記録も消えます。<b>必ず事前に💾バックアップ</b>を取ってください。" },
  { q: "費用はかかりますか？",
    a: "完全に無料で、広告も課金もありません。" },
];
function renderFAQSection() {
  return `
    <div class="card">
      <h3 class="card-title">❓ よくある質問</h3>
      ${FAQ_LIST.map((f) => `
        <details class="faq-item">
          <summary>${escapeHtml(f.q)}</summary>
          <div class="a">${f.a}</div>
        </details>`).join("")}
    </div>
  `;
}

function renderFeedbackSection() {
  const d = feedbackDraft;
  const history = (state.feedback || []).slice().reverse().slice(0, 5);
  return `
    <div class="card">
      <h3 class="card-title">💌 ご意見・お客様の声を送る</h3>
      <div class="note" style="margin-bottom:14px;line-height:1.7">
        あなたの一言が「あるるん」を育てます🌱<br>
        どんな小さなことでもOK。気になった点・好きな機能・あったらいいなを教えてください。
      </div>

      <div class="field">
        <label>カテゴリ</label>
        <div class="cat-grid">
          ${FEEDBACK_CATEGORIES.map((c) => `
            <button class="cat-opt ${c.id === d.category ? "active" : ""}" data-cat="${c.id}">
              <span class="e">${c.emoji}</span><span>${c.label}</span>
            </button>`).join("")}
        </div>
      </div>

      <div class="field">
        <label>このアプリのおすすめ度（任意）</label>
        <div class="rating-row">
          ${[1,2,3,4,5].map((n) => `<button data-star="${n}" class="${n <= d.rating ? "on" : ""}" aria-label="${n}つ星">⭐</button>`).join("")}
        </div>
      </div>

      <div class="field">
        <label>ご意見・ご感想（自由記述）</label>
        <textarea id="fbText" placeholder="例: スタンプが集まると嬉しい。/ 食事の写真を後から見たい。/ アラーム音をもっと優しくしてほしい。">${escapeHtml(d.text)}</textarea>
      </div>

      <div class="field" style="margin-bottom:6px">
        <label>返信用の連絡先（任意・メール／X など）</label>
        <input type="text" id="fbContact" value="${escapeHtml(d.contact)}" placeholder="返事がほしい場合のみ" />
      </div>

      <div class="fb-actions">
        <button class="btn btn-primary btn-sm" id="fbSend">💌 送信する</button>
        <button class="btn btn-ghost btn-sm" id="fbCopy">📋 内容をコピー</button>
      </div>
      <div class="fb-dest">
        ご意見は<b>あるるんの開発者</b>にすぐ届きます🌱<br>
        送信にはインターネット接続が必要です。
      </div>
    </div>

    ${history.length ? `
    <div class="card">
      <h3 class="card-title">📨 送信済みのご意見（最新5件）</h3>
      ${history.map((f) => {
        const c = FEEDBACK_CATEGORIES.find((x) => x.id === f.category) || FEEDBACK_CATEGORIES[4];
        const dt = new Date(f.ts);
        const when = `${dt.getFullYear()}/${pad2(dt.getMonth()+1)}/${pad2(dt.getDate())} ${pad2(dt.getHours())}:${pad2(dt.getMinutes())}`;
        const badge = f.status === "copied"
          ? `<span class="fb-badge copied">コピー済</span>`
          : f.status === "sent_supabase"
            ? `<span class="fb-badge">送信済み</span>`
            : `<span class="fb-badge">メール送信</span>`;
        return `<div class="fb-hist-item">
          <span class="e">${c.emoji}</span>
          <div class="main">
            <div class="t">${escapeHtml(f.text || "(本文なし)")}</div>
            <div class="s">${escapeHtml(c.label)} ・ ${when}${f.rating ? ` ・ ${"⭐".repeat(f.rating)}` : ""}</div>
          </div>
          ${badge}
        </div>`;
      }).join("")}
    </div>` : ""}
  `;
}

function bindFeedbackForm() {
  view.querySelectorAll("[data-cat]").forEach((b) => {
    b.onclick = () => { feedbackDraft.category = b.dataset.cat; render(); };
  });
  view.querySelectorAll("[data-star]").forEach((b) => {
    b.onclick = () => {
      const n = parseInt(b.dataset.star, 10);
      feedbackDraft.rating = feedbackDraft.rating === n ? 0 : n;
      render();
    };
  });
  const ta = document.getElementById("fbText");
  if (ta) ta.oninput = () => { feedbackDraft.text = ta.value; };
  const ct = document.getElementById("fbContact");
  if (ct) ct.oninput = () => { feedbackDraft.contact = ct.value; };
  const send = document.getElementById("fbSend");
  if (send) send.onclick = sendFeedbackToSupabase;
  const copy = document.getElementById("fbCopy");
  if (copy) copy.onclick = copyFeedback;
}

function buildFeedbackBody(fb) {
  const cat = FEEDBACK_CATEGORIES.find((c) => c.id === fb.category) || FEEDBACK_CATEGORIES[4];
  const now = new Date();
  const when = `${now.getFullYear()}/${pad2(now.getMonth()+1)}/${pad2(now.getDate())} ${pad2(now.getHours())}:${pad2(now.getMinutes())}`;
  const lines = [
    "【slimmate ご意見・フィードバック】",
    "━━━━━━━━━━━━━━━━━",
    `日時　　: ${when}`,
    `カテゴリ: ${cat.emoji} ${cat.label}`,
  ];
  if (fb.rating) lines.push(`おすすめ度: ${"★".repeat(fb.rating)}${"☆".repeat(5 - fb.rating)}`);
  lines.push(`連絡先　: ${fb.contact ? fb.contact : "(なし)"}`);
  lines.push("", "【内容】", fb.text || "(本文なし)", "");
  lines.push("━━━━━━━━━━━━━━━━━");
  lines.push(`端末　　: ${navigator.userAgent.substring(0, 90)}`);
  lines.push("※ slimmate アプリから送信");
  return lines.join("\n");
}

function persistFeedback(status) {
  const entry = {
    id: uid(),
    ts: Date.now(),
    category: feedbackDraft.category,
    rating: feedbackDraft.rating,
    text: (feedbackDraft.text || "").trim(),
    contact: (feedbackDraft.contact || "").trim(),
    status,
  };
  state.feedback = state.feedback || [];
  state.feedback.push(entry);
  save();
}

function validateFeedback() {
  const t = (feedbackDraft.text || "").trim();
  if (!t) { toast("ご意見の内容を入力してね🙏", "coral"); return false; }
  if (t.length < 3) { toast("もう少し詳しく書いてもらえると嬉しい！", "coral"); return false; }
  return true;
}

async function sendFeedbackToSupabase() {
  if (!validateFeedback()) return;
  const sendBtn = document.getElementById("fbSend");
  if (sendBtn) { sendBtn.disabled = true; sendBtn.textContent = "送信中..."; }
  const payload = {
    category: feedbackDraft.category,
    rating: feedbackDraft.rating || null,
    message: (feedbackDraft.text || "").trim(), // テーブルのカラム名は message
    contact: (feedbackDraft.contact || "").trim() || null,
    user_agent: (navigator.userAgent || "").substring(0, 200),
    app_version: APP_VERSION,
  };
  try {
    const res = await fetch(`${SUPABASE_URL}/${FEEDBACK_TABLE}`, {
      method: "POST",
      headers: {
        "apikey": SUPABASE_KEY,
        "Authorization": `Bearer ${SUPABASE_KEY}`,
        "Content-Type": "application/json",
        "Prefer": "return=minimal",
      },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const errTxt = await res.text().catch(() => "");
      throw new Error(`HTTP ${res.status} ${errTxt}`);
    }
    clearFeedbackError();
    persistFeedback("sent_supabase");
    toast("ありがとう！ご意見を送信したよ💌✨", "mint");
    feedbackDraft = { category: "good", rating: 0, text: "", contact: "" };
    setTimeout(render, 400);
  } catch (e) {
    console.error("Supabase POST failed:", e);
    const msg = String(e && e.message || e);
    showFeedbackError(msg);
    if (/HTTP 4\d\d/.test(msg)) {
      toast("送信できなかったよ🙏 下のエラー欄を見て", "coral");
    } else {
      toast("送信できなかったよ🙏 オフラインかも。「コピー」して後で送ってね", "coral");
    }
    if (sendBtn) { sendBtn.disabled = false; sendBtn.textContent = "💌 送信する"; }
  }
}
function showFeedbackError(msg) {
  const host = document.querySelector(".fb-dest");
  if (!host) return;
  let box = document.getElementById("fbErrBox");
  if (!box) {
    box = document.createElement("div");
    box.id = "fbErrBox";
    box.style.cssText = "background:var(--coral-soft);color:var(--coral);padding:12px 14px;border-radius:12px;font-size:11px;font-weight:700;margin-top:10px;line-height:1.6;word-break:break-all;white-space:pre-wrap;";
    host.parentNode.insertBefore(box, host.nextSibling);
  }
  box.textContent = "⚠️ エラー全文:\n" + msg;
}
function clearFeedbackError() {
  const box = document.getElementById("fbErrBox");
  if (box) box.remove();
}

async function copyFeedback() {
  if (!validateFeedback()) return;
  const body = buildFeedbackBody(feedbackDraft);
  // クリップボードには本文だけ入れる（開発者の連絡先は表に出さない）
  const text = body;
  let ok = false;
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
      ok = true;
    } else {
      // フォールバック（古いブラウザ）
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed"; ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      ok = document.execCommand("copy");
      ta.remove();
    }
  } catch {}
  if (ok) {
    persistFeedback("copied");
    toast(`コピーしたよ📋 控え用にメモアプリ等にどうぞ`, "mint");
    feedbackDraft = { category: "good", rating: 0, text: "", contact: "" };
    setTimeout(render, 400);
  } else {
    toast("コピーできなかったよ🙏 メーラーボタンも試してみて！", "coral");
  }
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
        onAteSnack(); // 「のーーーーーーーーーー」
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
  speakCute("のーーーーーーーーーー"); // えらいぞーと同じ声
}
// 食べちゃった共通処理：記録 →「のーーーーーーーーーー」→（設定ON時）あるるんが見張る
function onAteSnack() {
  state.snacks.push({ date: ymd(), action: "ate", ts: Date.now() });
  save();
  scoldAte();
  if (state.profile.alarm.onSnackEat) {
    // 「こらこら」と重ならないよう、最初のるんるんは間隔ぶん後から
    state.alarmRun = { active: true, nextFireTs: Date.now() + Math.max(1, state.profile.alarm.intervalMin) * 60000 };
    save();
    updateAlarmBanner();
    toast("のーーーーーーーーーー！あるるんが見張るよ🔔", "coral");
  } else {
    toast("のーーーーーーーーーー！記録しといたよ🌱", "coral");
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
  checkCalls();
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

/* ---------- ⏰ モーニング/ナイトコール ---------- */
function checkCalls() {
  const now = new Date();
  const h = now.getHours();
  const m = now.getMinutes();
  const today = ymd();
  const mc = state.profile.morningCall;
  const nc = state.profile.nightCall;
  if (mc && mc.enabled
    && state.callRun.lastMorningYmd !== today
    && (h > mc.hour || (h === mc.hour && m >= mc.min))
    && h - mc.hour <= 3) { // 3時間以上過ぎていたらスキップ
    fireMorningCall();
    state.callRun.lastMorningYmd = today;
    save();
  }
  if (nc && nc.enabled
    && state.callRun.lastNightYmd !== today
    && (h > nc.hour || (h === nc.hour && m >= nc.min))) {
    fireNightCall();
    state.callRun.lastNightYmd = today;
    save();
  }
}
function fireMorningCall() {
  const goal = state.profile.dailyGoalKcal;
  const msg = `おはよ☀️ 今日も ${goal}kcal がんばろうね！`;
  if ("Notification" in window && Notification.permission === "granted") {
    try { new Notification("🌞 あるるん モーニングコール", { body: msg, icon: "icon.svg" }); } catch {}
  }
  ensureAudio();
  playPraiseJingle();
  speakCute("おはよう、いっしょにがんばろうね");
  toast(msg, "mint");
}
function fireNightCall() {
  const kcal = kcalOn(ymd());
  const ok = isAchieved(ymd());
  const msg = ok ? `🎉 今日は目標達成！えらいぞ！` : `🌙 今日は${kcal}kcal。明日もまた一緒にがんばろう！`;
  if ("Notification" in window && Notification.permission === "granted") {
    try { new Notification("🌙 あるるん ナイトコール", { body: msg, icon: "icon.svg" }); } catch {}
  }
  ensureAudio();
  if (ok) playPraiseJingle(); else playCuteJingle();
  speakCute(ok ? "今日もえらかったね、おやすみ" : "おつかれさま、明日もがんばろう");
  toast(msg, ok ? "mint" : "coral");
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
  t.onclick = () => {
    currentTab = t.dataset.tab;
    // 画面遷移時はサブ状態をリセット
    showGallery = false;
    editingLogId = null; editingLogDraft = null;
    editingFoodId = null; editingFoodDraft = null;
    render();
  };
});
const helpBtnEl = document.getElementById("helpBtn");
if (helpBtnEl) helpBtnEl.onclick = () => { currentTab === "help" ? closeHelp() : openHelp(); };

/* ---------- 起動 ---------- */
applyTheme();
render();
restartNudgeScheduler();
setInterval(tickAlarm, 1000); // あるるんアラームの監視（1秒ごと）
updateAlarmBanner(); // リロード時に稼働中なら停止バナーを復元

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  });
}
