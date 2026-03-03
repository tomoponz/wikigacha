/* WikiGacha v2 — original implementation
   - GitHub Pages ready (no build)
   - Stores state in localStorage
   - Packs regenerate: 1 pack / minute, up to 10
   - Each pack yields 5 random Wikipedia cards (ja)
*/

const STORAGE_KEY = "wg_state_v2";

/** Gameplay knobs */
const PACK_CAP = 10;
const PACK_REGEN_SEC = 60;         // 1 min / pack
const CARDS_PER_PACK = 5;
const GOLD_EVERY_PACK = 10;        // every 10th pack is "gold" (rates up)
const MISSION_REWARD_PACKS = 2;

const RARITIES = ["C","UC","R","SR","SSR","UR","LR"];
const RARITY_ORDER = ["C","UC","R","SR","SSR","UR","LR"];
const RARITY_WEIGHTS_NORMAL = { C: 62, UC: 20, R: 11, SR: 5.5, SSR: 1.3, UR: 0.18, LR: 0.02 };
const RARITY_WEIGHTS_GOLD   = { C: 45, UC: 20, R: 18, SR: 12,  SSR: 4.2, UR: 0.7,  LR: 0.1  };

const MISSIONS = [
  { id:"pull_5",      name:"ガチャ（パック）を5回開ける", type:"packs", goal:5 },
  { id:"sr_1",        name:"SR以上を1枚引く",             type:"rarity_atleast", goal:1, min:"SR" },
  { id:"open_wiki_1", name:"Wikipediaを1回開く",          type:"open_wiki", goal:1 },
  { id:"share_1",     name:"結果をシェアする",            type:"share", goal:1 },
  { id:"support_1",   name:"広告を閲覧する",              type:"support", goal:1 },
];

const el = (sel) => document.querySelector(sel);
const els = (sel) => Array.from(document.querySelectorAll(sel));
const clamp = (n, a, b) => Math.min(b, Math.max(a, n));

const ui = {
  tabs: els(".navTab"),
  pages: els(".page"),

  packsNow: el("#packsNow"),
  packsMax: el("#packsMax"),
  packsHint: el("#packsHint"),
  toGoldText: el("#toGoldText"),

  packBtn: el("#packBtn"),
  missions: el("#missions"),

  shareBtn: el("#shareBtn"),
  supportBtn: el("#supportBtn"),
  lastCardHost: el("#lastCardHost"),
  lastCardEmpty: el("#lastCardEmpty"),

  searchInput: el("#searchInput"),
  rarityFilter: el("#rarityFilter"),
  zukanGrid: el("#zukanGrid"),
  zukanEmpty: el("#zukanEmpty"),

  deck: el("#deck"),
  autoPickBtn: el("#autoPickBtn"),
  battleBtn: el("#battleBtn"),
  battleLog: el("#battleLog"),

  langBtn: el("#langBtn"),
  trophyBtn: el("#trophyBtn"),
  infoBtn: el("#infoBtn"),

  modal: el("#modal"),
  modalClose: el("#modalClose"),
  modalX: el("#modalX"),
  modalTitle: el("#modalTitle"),
  modalBody: el("#modalBody"),
  modalFoot: el("#modalFoot"),
  openWikiBtn: el("#openWikiBtn"),
  okBtn: el("#okBtn"),

  toast: el("#toast"),
};

function nowMs(){ return Date.now(); }

function tokyoDateString(d = new Date()){
  const fmt = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Tokyo", year:"numeric", month:"2-digit", day:"2-digit" });
  return fmt.format(d);
}

function weightedPick(weights){
  const entries = Object.entries(weights);
  const sum = entries.reduce((s,[,w]) => s + w, 0);
  let r = Math.random() * sum;
  for(const [k,w] of entries){
    r -= w;
    if(r <= 0) return k;
  }
  return entries[entries.length-1][0];
}

function rarityGE(a, b){
  return RARITY_ORDER.indexOf(a) >= RARITY_ORDER.indexOf(b);
}

function toast(msg){
  ui.toast.textContent = msg;
  ui.toast.classList.add("is-show");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => ui.toast.classList.remove("is-show"), 1600);
}

function escapeHtml(str){
  return String(str).replace(/[&<>"']/g, (c) => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
  }[c]));
}

function defaultState(){
  const today = tokyoDateString();
  return {
    version: 2,
    today,
    packs: PACK_CAP,
    regenAnchor: nowMs(),
    packOpens: 0,
    missions: {
      date: today,
      progress: Object.fromEntries(MISSIONS.map(m => [m.id, 0])),
      claimed: Object.fromEntries(MISSIONS.map(m => [m.id, false])),
    },
    lastPack: null,
    collection: {},
    deck: [null,null,null],
  };
}

function loadState(){
  try{
    const raw = localStorage.getItem(STORAGE_KEY);
    if(!raw) return defaultState();
    const st = JSON.parse(raw);
    if(!st || st.version !== 2) return defaultState();
    if(!Array.isArray(st.deck)) st.deck = [null,null,null];
    return st;
  }catch{
    return defaultState();
  }
}

function saveState(){ localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
let state = loadState();

function dailyResetMissionsIfNeeded(){
  const today = tokyoDateString();
  if(state.today !== today){
    state.today = today;
    state.missions = {
      date: today,
      progress: Object.fromEntries(MISSIONS.map(m => [m.id, 0])),
      claimed: Object.fromEntries(MISSIONS.map(m => [m.id, false])),
    };
    saveState();
  }
}

function applyPackRegen(){
  if(state.packs >= PACK_CAP){
    state.regenAnchor = nowMs();
    return;
  }
  const interval = PACK_REGEN_SEC * 1000;
  const elapsed = nowMs() - (state.regenAnchor ?? nowMs());
  if(elapsed < interval) return;

  const add = Math.floor(elapsed / interval);
  const before = state.packs;
  state.packs = clamp(state.packs + add, 0, PACK_CAP);

  const used = Math.min(add, PACK_CAP - before);
  state.regenAnchor += used * interval;
  if(state.packs >= PACK_CAP) state.regenAnchor = nowMs();
  saveState();
}

function packHintText(){
  if(state.packs >= PACK_CAP) return "パック満タン";
  const interval = PACK_REGEN_SEC * 1000;
  const elapsed = nowMs() - (state.regenAnchor ?? nowMs());
  const remain = clamp(interval - (elapsed % interval), 0, interval);
  const sec = Math.ceil(remain / 1000);
  return `次の回復まで ${sec}s（1分で1回復）`;
}

function goldIn(){
  const mod = state.packOpens % GOLD_EVERY_PACK;
  return GOLD_EVERY_PACK - mod;
}
function isGoldNextOpen(){ return (state.packOpens % GOLD_EVERY_PACK) === (GOLD_EVERY_PACK - 1); }

function routeTo(route){
  ui.tabs.forEach(t => {
    const active = t.dataset.route === route;
    t.classList.toggle("is-active", active);
    t.setAttribute("aria-selected", active ? "true" : "false");
  });
  ui.pages.forEach(p => p.hidden = p.dataset.page !== route);
  render();
}
function setupRouting(){ ui.tabs.forEach(btn => btn.addEventListener("click", () => routeTo(btn.dataset.route))); }

/** Missions */
function missionCompleted(m){ return (state.missions.progress[m.id] ?? 0) >= m.goal; }
function missionClaimable(m){ return missionCompleted(m) && !state.missions.claimed[m.id]; }
function updateMission(id, delta){
  dailyResetMissionsIfNeeded();
  const m = MISSIONS.find(x => x.id === id);
  if(!m) return;
  const cur = state.missions.progress[id] ?? 0;
  state.missions.progress[id] = clamp(cur + delta, 0, m.goal);
}
function claimMission(id){
  const m = MISSIONS.find(x => x.id === id);
  if(!m || !missionClaimable(m)) return;
  state.missions.claimed[id] = true;
  state.packs = clamp(state.packs + MISSION_REWARD_PACKS, 0, 9999);
  saveState();
  toast(`ミッション報酬 +${MISSION_REWARD_PACKS} パック`);
  render();
}
function renderMissions(){
  ui.missions.innerHTML = "";
  for(const m of MISSIONS){
    const li = document.createElement("li");
    li.className = "missionItem";
    const name = document.createElement("span");
    name.textContent = m.name;

    const meta = document.createElement("div");
    meta.className = "missionMeta";
    const prog = state.missions.progress[m.id] ?? 0;
    meta.appendChild(document.createTextNode(`${prog}/${m.goal}`));

    if(missionClaimable(m)){
      const btn = document.createElement("button");
      btn.className = "claimBtn";
      btn.textContent = `受取 +${MISSION_REWARD_PACKS}`;
      btn.addEventListener("click", () => claimMission(m.id));
      meta.appendChild(btn);
    }else if(state.missions.claimed[m.id]){
      const done = document.createElement("span");
      done.textContent = "受取済";
      meta.appendChild(done);
    }

    li.appendChild(name);
    li.appendChild(meta);
    ui.missions.appendChild(li);
  }
}

/** Wikipedia */
async function fetchRandomWikiSummary(){
  const url = "https://ja.wikipedia.org/api/rest_v1/page/random/summary";
  const res = await fetch(url, { headers: { "accept": "application/json" } });
  if(!res.ok) throw new Error("Wikipedia API error");
  return await res.json();
}

function computeStats(summary, rarity){
  const title = summary?.title ?? "";
  const extract = summary?.extract ?? "";
  const n = extract.length + title.length * 10;

  const mult = { C:0.7, UC:0.9, R:1.15, SR:1.45, SSR:1.9, UR:2.4, LR:3.2 }[rarity] ?? 1.0;
  const base = clamp(Math.round((n * 2.5 + 900) * mult), 800, 14000);

  const atk = clamp(Math.round(base * (0.48 + Math.random()*0.32)), 200, 16000);
  const def = clamp(Math.round(base * (0.48 + Math.random()*0.32)), 200, 16000);
  const hp  = clamp(Math.round((atk+def) * (0.35 + Math.random()*0.20)), 400, 24000);
  return { hp, atk, def };
}

function buildCard(summary, rarity){
  const id = summary.pageid ?? summary.title ?? ("x-" + nowMs() + "-" + Math.random());
  const url = summary?.content_urls?.desktop?.page ?? "https://ja.wikipedia.org/";
  const thumb = summary?.thumbnail?.source ?? null;

  let flavor = null;
  if(rarityGE(rarity, "SSR")){
    const s = (summary?.extract ?? "").trim();
    if(s) flavor = s.split(/[。\.]/)[0]?.slice(0, 70) ?? null;
  }

  return {
    id: String(id),
    title: summary.title ?? "不明な記事",
    extract: summary.extract ?? "要約を取得できませんでした。",
    url,
    thumb,
    rarity,
    stats: computeStats(summary, rarity),
    flavor,
    ts: nowMs(),
  };
}

function addToCollection(card){
  const key = String(card.id);
  if(!state.collection[key]) state.collection[key] = { card, count: 1 };
  else state.collection[key].count += 1;
}

function rarityBorder(r){
  const map = {
    C: "rgba(255,255,255,.18)",
    UC:"rgba(207,207,207,.18)",
    R: "rgba(52,211,153,.25)",
    SR:"rgba(96,165,250,.28)",
    SSR:"rgba(251,113,133,.30)",
    UR:"rgba(245,158,11,.35)",
    LR:"rgba(250,204,21,.40)",
  };
  return map[r] ?? "rgba(255,255,255,.18)";
}

/** Render */
function packsUI(){
  applyPackRegen();
  ui.packsNow.textContent = String(state.packs);
  ui.packsMax.textContent = String(PACK_CAP);
  ui.packsHint.textContent = packHintText();
  ui.toGoldText.textContent = String(goldIn());
}

function renderRevealCard(card){
  const root = document.createElement("div");
  root.className = "rCard";
  root.style.borderColor = rarityBorder(card.rarity);

  const thumb = document.createElement("div");
  thumb.className = "rCard__thumb";
  if(card.thumb){
    thumb.style.backgroundImage = `url("${card.thumb}")`;
    thumb.style.backgroundSize = "cover";
    thumb.style.backgroundPosition = "center";
  }

  const body = document.createElement("div");
  body.className = "rCard__body";

  const title = document.createElement("div");
  title.className = "rCard__title";
  title.textContent = card.title;

  const meta = document.createElement("div");
  meta.className = "rCard__meta";
  meta.innerHTML = `<span class="rarity r-${card.rarity}">${card.rarity}</span><span>ATK ${card.stats.atk}</span>`;

  const stats = document.createElement("div");
  stats.className = "rCard__stats";
  stats.textContent = `DEF ${card.stats.def} / HP ${card.stats.hp}`;

  body.appendChild(title);
  body.appendChild(meta);
  body.appendChild(stats);

  root.appendChild(thumb);
  root.appendChild(body);
  return root;
}

function renderLastPack(){
  const pack = state.lastPack;
  if(!Array.isArray(pack) || pack.length === 0){
    ui.lastCardEmpty.hidden = false;
    ui.lastCardHost.innerHTML = "";
    ui.shareBtn.disabled = true;
    return;
  }
  ui.lastCardEmpty.hidden = true;
  ui.shareBtn.disabled = false;
  ui.lastCardHost.innerHTML = "";

  const wrap = document.createElement("div");
  wrap.className = "revealGrid";
  pack.forEach((c) => {
    const node = renderRevealCard(c);
    node.addEventListener("click", () => showCardModal(c));
    wrap.appendChild(node);
  });
  ui.lastCardHost.appendChild(wrap);
}

function renderZukan(){
  const entries = Object.values(state.collection);
  if(entries.length === 0){
    ui.zukanEmpty.hidden = false;
    ui.zukanGrid.innerHTML = "";
    return;
  }
  ui.zukanEmpty.hidden = true;

  const q = (ui.searchInput.value || "").trim().toLowerCase();
  const rf = ui.rarityFilter.value || "";

  const filtered = entries
    .filter(e => !rf || e.card.rarity === rf)
    .filter(e => !q || (e.card.title || "").toLowerCase().includes(q))
    .sort((a,b) => (RARITY_ORDER.indexOf(b.card.rarity) - RARITY_ORDER.indexOf(a.card.rarity)) || (b.count - a.count) || (b.card.ts - a.card.ts));

  ui.zukanGrid.innerHTML = "";
  for(const e of filtered){
    const node = renderZukanMini(e.card, e.count);
    node.addEventListener("click", () => showCardModal(e.card));
    node.addEventListener("contextmenu", (ev) => { ev.preventDefault(); addToDeck(e.card.id); });
    ui.zukanGrid.appendChild(node);
  }
}

function renderZukanMini(card, count){
  const root = document.createElement("div");
  root.className = "zMini";
  root.style.borderColor = rarityBorder(card.rarity);

  const thumb = document.createElement("div");
  thumb.className = "zMini__thumb";
  if(card.thumb){
    thumb.style.backgroundImage = `url("${card.thumb}")`;
    thumb.style.backgroundSize = "cover";
    thumb.style.backgroundPosition = "center";
  }

  const body = document.createElement("div");
  body.className = "zMini__body";

  const title = document.createElement("div");
  title.className = "zMini__title";
  title.textContent = card.title;

  const meta = document.createElement("div");
  meta.className = "zMini__meta";
  meta.innerHTML = `<span class="rarity r-${card.rarity}">${card.rarity}</span><span>x${count}</span>`;

  body.appendChild(title);
  body.appendChild(meta);

  root.appendChild(thumb);
  root.appendChild(body);
  return root;
}

/** Modal */
function openModal({title, bodyNode, showWikiButton=false, wikiUrl=null}){
  ui.modalTitle.textContent = title;
  ui.modalBody.innerHTML = "";
  if(bodyNode) ui.modalBody.appendChild(bodyNode);

  ui.openWikiBtn.style.display = showWikiButton ? "" : "none";
  ui.openWikiBtn.onclick = () => {
    if(wikiUrl) window.open(wikiUrl, "_blank", "noopener,noreferrer");
    updateMission("open_wiki_1", 1);
    saveState();
    render();
  };

  ui.okBtn.onclick = closeModal;
  ui.modalClose.onclick = closeModal;
  ui.modalX.onclick = closeModal;

  ui.modal.hidden = false;
}
function closeModal(){ ui.modal.hidden = true; }

function renderBigCard(card){
  const wrap = document.createElement("div");
  wrap.className = "bigCard";

  const thumb = document.createElement("div");
  thumb.className = "bigCard__thumb";
  if(card.thumb){
    const img = document.createElement("img");
    img.src = card.thumb;
    img.alt = "";
    img.loading = "lazy";
    thumb.appendChild(img);
  }

  const info = document.createElement("div");

  const name = document.createElement("div");
  name.className = "bigCard__name";
  name.innerHTML = `<span class="rarity r-${card.rarity}">${card.rarity}</span> ${escapeHtml(card.title)}`;

  const desc = document.createElement("div");
  desc.className = "bigCard__desc";
  desc.textContent = card.extract;

  const stats = document.createElement("div");
  stats.className = "stats";
  stats.innerHTML = `
    <div class="stat">ATK ${card.stats.atk}</div>
    <div class="stat">DEF ${card.stats.def}</div>
    <div class="stat">HP ${card.stats.hp}</div>
  `;

  const flavor = document.createElement("div");
  flavor.className = "bigCard__link";
  flavor.textContent = card.flavor ? `FLAVOR: ${card.flavor}` : "";

  const link = document.createElement("div");
  link.className = "bigCard__link";
  link.innerHTML = `リンク: <a href="${card.url}" target="_blank" rel="noopener noreferrer">${escapeHtml(card.url)}</a>`;

  info.appendChild(name);
  info.appendChild(desc);
  info.appendChild(stats);
  if(card.flavor) info.appendChild(flavor);
  info.appendChild(link);

  wrap.appendChild(thumb);
  wrap.appendChild(info);
  return wrap;
}

function showCardModal(card){
  openModal({
    title: "カード詳細",
    bodyNode: renderBigCard(card),
    showWikiButton: true,
    wikiUrl: card.url
  });
}

/** Pack opening */
async function openPack(){
  applyPackRegen();
  if(state.packs <= 0){
    toast("パックがありません（1分で回復 / ミッション報酬あり）");
    return;
  }

  state.packs -= 1;
  const gold = isGoldNextOpen();
  state.packOpens += 1;
  updateMission("pull_5", 1);

  const weights = gold ? RARITY_WEIGHTS_GOLD : RARITY_WEIGHTS_NORMAL;

  const tasks = Array.from({length: CARDS_PER_PACK}, async () => {
    try{
      const s = await fetchRandomWikiSummary();
      const rar = weightedPick(weights);
      return buildCard(s, rar);
    }catch{
      const fallback = { title:"オフライン記事", extract:"Wikipedia APIへ接続できませんでした。", content_urls:{desktop:{page:"https://ja.wikipedia.org/"}} };
      const rar = weightedPick(weights);
      return buildCard(fallback, rar);
    }
  });

  const cards = await Promise.all(tasks);

  if(cards.some(c => rarityGE(c.rarity, "SR"))) updateMission("sr_1", 1);

  cards.forEach(addToCollection);
  state.lastPack = cards;
  saveState();
  render();
  showPackRevealModal(cards, gold);
}

function showPackRevealModal(cards, gold){
  const root = document.createElement("div");
  root.className = "reveal";

  const left = document.createElement("div");
  left.className = "revealGrid";
  const right = document.createElement("div");
  right.className = "revealDetail";

  let selected = cards[0];
  right.appendChild(renderBigCard(selected));

  cards.forEach((c) => {
    const tile = renderRevealCard(c);
    tile.addEventListener("click", () => {
      selected = c;
      right.innerHTML = "";
      right.appendChild(renderBigCard(selected));
    });
    left.appendChild(tile);
  });

  root.appendChild(left);
  root.appendChild(right);

  openModal({
    title: gold ? "金パック！(排出率UP)" : "パック開封（5枚）",
    bodyNode: root,
    showWikiButton: true,
    wikiUrl: selected?.url ?? null
  });

  ui.openWikiBtn.onclick = () => {
    if(selected?.url) window.open(selected.url, "_blank", "noopener,noreferrer");
    updateMission("open_wiki_1", 1);
    saveState();
    render();
  };
}

/** Share last pack */
async function shareLast(){
  const pack = state.lastPack;
  if(!Array.isArray(pack) || pack.length === 0) return;

  const lines = pack.map(c => `【${c.rarity}】${c.title} ATK ${c.stats.atk} / DEF ${c.stats.def}`);
  const text = `WikiGacha\n${lines.join("\n")}\n#WikiGacha`;

  let ok = false;
  try{
    if(navigator.share){
      await navigator.share({ title:"WikiGacha", text });
      ok = true;
    }
  }catch{}

  if(!ok){
    try{
      await navigator.clipboard.writeText(text);
      toast("シェア文をコピーしました");
      ok = true;
    }catch{
      window.prompt("コピーしてシェアしてください", text);
      ok = true;
    }
  }

  if(ok){
    updateMission("share_1", 1);
    saveState();
    render();
  }
}

/** Support demo */
function supportDemo(){
  ui.supportBtn.disabled = true;
  const original = ui.supportBtn.textContent;
  let left = 7;
  ui.supportBtn.textContent = `待機… ${left}s`;
  toast("支援デモ: 7秒カウント中…");

  const t = setInterval(() => {
    left -= 1;
    ui.supportBtn.textContent = `待機… ${left}s`;
    if(left <= 0){
      clearInterval(t);
      ui.supportBtn.disabled = false;
      ui.supportBtn.textContent = original;
      updateMission("support_1", 1);
      saveState();
      render();
      toast("支援デモ完了（ミッション進行）");
    }
  }, 1000);
}

/** Deck & battle */
function addToDeck(cardId){
  const key = String(cardId);
  if(!state.collection[key]){
    toast("図鑑に存在しないカードです");
    return;
  }
  const idx = state.deck.findIndex(x => !x);
  if(idx === -1){
    toast("デッキが満員です（外してから追加）");
    return;
  }
  state.deck[idx] = key;
  saveState();
  render();
  toast("デッキに追加しました");
}

function renderDeck(){
  ui.deck.innerHTML = "";
  state.deck = Array.isArray(state.deck) ? state.deck : [null,null,null];

  state.deck.forEach((cid, i) => {
    const slot = document.createElement("div");
    slot.className = "slot";
    if(cid) slot.classList.add("is-filled");

    const title = document.createElement("div");
    title.className = "slot__title";
    title.textContent = cid ? `スロット ${i+1}` : `空スロット ${i+1}`;
    slot.appendChild(title);

    const meta = document.createElement("div");
    meta.className = "slot__meta";

    if(cid && state.collection[cid]){
      const c = state.collection[cid].card;
      meta.innerHTML = `<span class="rarity r-${c.rarity}">${c.rarity}</span> ${escapeHtml(c.title)}<br>ATK ${c.stats.atk} / DEF ${c.stats.def} / HP ${c.stats.hp}`;
      slot.style.borderColor = rarityBorder(c.rarity);

      const rm = document.createElement("button");
      rm.className = "btn";
      rm.style.marginTop = "10px";
      rm.textContent = "外す";
      rm.addEventListener("click", () => {
        state.deck[i] = null;
        saveState();
        render();
      });

      slot.appendChild(meta);
      slot.appendChild(rm);
    }else{
      meta.textContent = "図鑑のカードを右クリック（長押し）で追加。";
      slot.appendChild(meta);
    }

    ui.deck.appendChild(slot);
  });
}

function autoPickDeck(){
  const keys = Object.keys(state.collection);
  if(keys.length === 0){
    toast("図鑑が空です。先にガチャを引いてください");
    return;
  }
  const pool = keys
    .map(k => ({k, r: state.collection[k].card.rarity}))
    .sort((a,b) => RARITY_ORDER.indexOf(b.r) - RARITY_ORDER.indexOf(a.r))
    .slice(0, Math.min(keys.length, 18))
    .map(x => x.k);

  const picks = [];
  while(picks.length < 3 && pool.length){
    const idx = Math.floor(Math.random() * pool.length);
    picks.push(pool.splice(idx,1)[0]);
  }
  while(picks.length < 3) picks.push(keys[Math.floor(Math.random()*keys.length)]);
  state.deck = picks;
  saveState();
  render();
  toast("デッキを自動選択しました");
}

function writeLog(line, cls=""){
  const div = document.createElement("div");
  div.className = "line";
  if(cls) div.classList.add(cls);
  div.textContent = line;
  ui.battleLog.prepend(div);
}

function shortTitle(t){
  const s = (t || "").trim();
  return s.length > 14 ? s.slice(0, 14) + "…" : s;
}

function battle(){
  const ids = (state.deck || []).filter(Boolean);
  if(ids.length < 1){
    toast("デッキが空です（最低1枚）");
    return;
  }
  const team = ids.map(id => state.collection[id]?.card).filter(Boolean);
  if(team.length < 1){
    toast("デッキ情報が不正です。選び直してください");
    return;
  }

  const sumAtk = team.reduce((s,c)=>s+c.stats.atk,0);
  const sumDef = team.reduce((s,c)=>s+c.stats.def,0);
  const sumHp  = team.reduce((s,c)=>s+c.stats.hp,0);

  const enemy = {
    name: "UNKNOWN ENTITY",
    hp: Math.round(sumHp * 0.75 + Math.random()*sumHp*0.55),
    atk: Math.round(sumAtk * 0.45 + Math.random()*sumAtk*0.35),
    def: Math.round(sumDef * 0.40 + Math.random()*sumDef*0.35),
  };

  writeLog("==== BATTLE START ====", "warn");
  writeLog(`敵: ${enemy.name} / HP ${enemy.hp} / ATK ${enemy.atk} / DEF ${enemy.def}`);

  let eHp = enemy.hp;
  let tHp = sumHp;

  for(let turn=1; turn<=12; turn++){
    if(eHp <= 0 || tHp <= 0) break;

    const hitter = team[Math.floor(Math.random()*team.length)];
    const dmg = Math.max(1, Math.round(hitter.stats.atk - enemy.def*0.35 + (Math.random()*12 - 4)));
    eHp -= dmg;
    writeLog(`T${turn}: 味方(${shortTitle(hitter.title)}) → ${dmg} dmg / 敵HP ${Math.max(0,eHp)}`, "good");
    if(eHp <= 0) break;

    const target = team[Math.floor(Math.random()*team.length)];
    const edmg = Math.max(1, Math.round(enemy.atk - target.stats.def*0.35 + (Math.random()*12 - 4)));
    tHp -= edmg;
    writeLog(`T${turn}: 敵 → ${edmg} dmg / 味方HP ${Math.max(0,tHp)}`, "bad");
  }

  if(eHp <= 0){
    writeLog("勝利！ +1 パック（デモ報酬）", "good");
    state.packs += 1;
  }else if(tHp <= 0){
    writeLog("敗北…（報酬なし）", "bad");
  }else{
    writeLog("時間切れ… 引き分け（報酬なし）", "warn");
  }

  saveState();
  render();
}

function showInfo(){
  const box = document.createElement("div");
  box.className = "empty";
  box.innerHTML = `
    <b>WikiGacha（オリジナル実装）</b><br>
    ・パック回復: 1分で1回復（最大${PACK_CAP}）<br>
    ・1回のパックで ${CARDS_PER_PACK}枚 排出<br>
    ・金パック: ${GOLD_EVERY_PACK}回ごとに排出率UP<br>
    ・データ保存: このブラウザ内（localStorage）<br>
  `;
  openModal({ title:"ゲーム情報", bodyNode: box, showWikiButton:false });
}

function showTrophies(){
  const total = state.packOpens ?? 0;
  const uniq = Object.keys(state.collection).length;
  const gotRars = new Set(Object.values(state.collection).map(e => e.card.rarity));
  const rainbow = RARITIES.every(r => gotRars.has(r));

  const box = document.createElement("div");
  box.className = "empty";
  box.innerHTML = `
    <b>実績（簡易）</b><br>
    ・開封回数: ${total}<br>
    ・図鑑ユニーク: ${uniq}<br>
    ・虹（全レア1枚以上）: ${rainbow ? "達成" : "未達成"}<br>
  `;
  openModal({ title:"🏆 実績", bodyNode: box, showWikiButton:false });
}

function render(){
  packsUI();
  renderMissions();
  renderLastPack();
  renderZukan();
  renderDeck();
}

function setupUI(){
  ui.packBtn.addEventListener("click", openPack);
  ui.shareBtn.addEventListener("click", shareLast);
  ui.supportBtn.addEventListener("click", supportDemo);

  ui.searchInput.addEventListener("input", renderZukan);
  ui.rarityFilter.addEventListener("change", renderZukan);

  ui.autoPickBtn.addEventListener("click", autoPickDeck);
  ui.battleBtn.addEventListener("click", battle);

  ui.langBtn.addEventListener("click", () => toast("言語切替はデモ（未実装）"));
  ui.infoBtn.addEventListener("click", showInfo);
  ui.trophyBtn.addEventListener("click", showTrophies);

  ui.modal.addEventListener("click", (e) => { if(e.target === ui.modalClose) closeModal(); });
}

function startTimers(){
  setInterval(() => {
    applyPackRegen();
    ui.packsHint.textContent = packHintText();
    ui.packsNow.textContent = String(state.packs);
  }, 1000);
}

dailyResetMissionsIfNeeded();
setupRouting();
setupUI();
startTimers();
render();
