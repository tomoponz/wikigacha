/* WikiGacha sample — original implementation
   - GitHub Pages ready (no build)
   - Stores progress in localStorage
   - Uses Wikipedia REST API (ja) for random summaries

   NOTE:
   This is NOT a pixel-perfect clone of any existing site.
   It is a from-scratch implementation of similar *ideas* (packs, missions, collection, simple battle).
*/

const STORAGE_KEY = "wg_state_v1";

const MAX_PACKS_PER_DAY = 10;
const GOLD_EVERY = 10; // gold pack every 10 pulls

const MISSIONS = [
  { id:"pull_5", name:"ガチャを5回引く", type:"pulls", goal:5 },
  { id:"sr_1", name:"SR以上を1枚引く", type:"rarity_atleast", goal:1, min:"SR" },
  { id:"open_wiki_1", name:"Wikipediaを1回開く", type:"open_wiki", goal:1 },
  { id:"share_1", name:"結果をシェアする", type:"share", goal:1 },
  { id:"support_1", name:"広告を閲覧する", type:"support", goal:1 },
];
const MISSION_REWARD_PACKS = 2;

const RARITY_ORDER = ["N","R","SR","SSR"];
const RARITY_WEIGHTS_NORMAL = { N: 70, R: 20, SR: 9, SSR: 1 };
const RARITY_WEIGHTS_GOLD   = { N: 55, R: 20, SR: 20, SSR: 5 };

const el = (sel) => document.querySelector(sel);
const els = (sel) => Array.from(document.querySelectorAll(sel));

const ui = {
  tabs: els(".tab"),
  pages: els(".page"),

  packsText: el("#packsText"),
  packsHint: el("#packsHint"),
  packsFill: el("#packsFill"),
  toGoldText: el("#toGoldText"),

  packBtn: el("#packBtn"),
  lastCardHost: el("#lastCardHost"),
  lastCardEmpty: el("#lastCardEmpty"),
  missions: el("#missions"),

  shareBtn: el("#shareBtn"),
  supportBtn: el("#supportBtn"),

  searchInput: el("#searchInput"),
  rarityFilter: el("#rarityFilter"),
  zukanGrid: el("#zukanGrid"),
  zukanEmpty: el("#zukanEmpty"),

  deck: el("#deck"),
  autoPickBtn: el("#autoPickBtn"),
  battleBtn: el("#battleBtn"),
  battleLog: el("#battleLog"),

  modal: el("#modal"),
  modalClose: el("#modalClose"),
  modalX: el("#modalX"),
  modalTitle: el("#modalTitle"),
  modalBody: el("#modalBody"),
  openWikiBtn: el("#openWikiBtn"),
  okBtn: el("#okBtn"),

  toast: el("#toast"),
};

function tokyoDateString(d = new Date()){
  // returns YYYY-MM-DD in Asia/Tokyo
  const fmt = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Tokyo", year:"numeric", month:"2-digit", day:"2-digit" });
  return fmt.format(d); // sv-SE yields YYYY-MM-DD
}

function clamp(n, a, b){ return Math.min(b, Math.max(a, n)); }
function randInt(a,b){ return Math.floor(Math.random()*(b-a+1))+a; }

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

function rarityGE(a, b){ // a >= b ?
  return RARITY_ORDER.indexOf(a) >= RARITY_ORDER.indexOf(b);
}

function toast(msg){
  ui.toast.textContent = msg;
  ui.toast.classList.add("is-show");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => ui.toast.classList.remove("is-show"), 1600);
}

function defaultState(){
  const today = tokyoDateString();
  return {
    version: 1,
    today,
    packs: MAX_PACKS_PER_DAY,
    pullsSinceGold: 0,
    missions: {
      date: today,
      progress: Object.fromEntries(MISSIONS.map(m => [m.id, 0])),
      claimed: Object.fromEntries(MISSIONS.map(m => [m.id, false])),
    },
    lastCard: null,
    collection: {}, // key: pageid or title fallback -> { card, count }
  };
}

function loadState(){
  try{
    const raw = localStorage.getItem(STORAGE_KEY);
    if(!raw) return defaultState();
    const st = JSON.parse(raw);
    if(!st || st.version !== 1) return defaultState();
    return st;
  }catch{
    return defaultState();
  }
}

function saveState(){
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

let state = loadState();

function dailyResetIfNeeded(){
  const today = tokyoDateString();
  if(state.today !== today){
    state.today = today;
    state.packs = MAX_PACKS_PER_DAY;
    state.pullsSinceGold = 0;
    state.missions = {
      date: today,
      progress: Object.fromEntries(MISSIONS.map(m => [m.id, 0])),
      claimed: Object.fromEntries(MISSIONS.map(m => [m.id, false])),
    };
    toast("日付が変わったのでデイリーを更新しました");
    saveState();
  }
}

function routeTo(route){
  ui.tabs.forEach(t => t.classList.toggle("is-active", t.dataset.route === route));
  ui.pages.forEach(p => p.hidden = p.dataset.page !== route);
  render();
}

function setupRouting(){
  ui.tabs.forEach(btn => {
    btn.addEventListener("click", () => routeTo(btn.dataset.route));
  });
}

function packsUI(){
  const max = MAX_PACKS_PER_DAY;
  ui.packsText.textContent = `${state.packs} / ${max}`;
  ui.packsFill.style.width = `${clamp((state.packs/max)*100, 0, 100)}%`;
  ui.packsHint.textContent = state.packs === max ? "パック満タン" : "毎日0:00（日本時間）に回復";
  const untilGold = GOLD_EVERY - (state.pullsSinceGold % GOLD_EVERY);
  ui.toGoldText.textContent = String(untilGold);
}

function missionCompleted(m){
  const v = state.missions.progress[m.id] ?? 0;
  return v >= m.goal;
}
function missionClaimable(m){
  return missionCompleted(m) && !state.missions.claimed[m.id];
}

function renderMissions(){
  ui.missions.innerHTML = "";
  for(const m of MISSIONS){
    const li = document.createElement("li");
    li.className = "mission";

    const left = document.createElement("div");
    left.className = "mission__name";
    left.textContent = m.name;

    const meta = document.createElement("div");
    meta.className = "mission__meta";
    const prog = state.missions.progress[m.id] ?? 0;
    const badge = document.createElement("span");
    badge.className = "badge";
    badge.textContent = `${prog}/${m.goal}`;
    if(missionCompleted(m)) badge.classList.add("is-done");
    if(missionClaimable(m)) badge.classList.add("is-claimable");
    meta.appendChild(badge);

    if(missionClaimable(m)){
      const claim = document.createElement("button");
      claim.className = "claimBtn";
      claim.textContent = `受取 +${MISSION_REWARD_PACKS}`;
      claim.addEventListener("click", () => claimMission(m.id));
      meta.appendChild(claim);
    }else{
      const status = document.createElement("span");
      status.className = "small muted";
      status.textContent = state.missions.claimed[m.id] ? "受取済" : (missionCompleted(m) ? "受取可能" : "");
      meta.appendChild(status);
    }

    li.appendChild(left);
    li.appendChild(meta);
    ui.missions.appendChild(li);
  }
}

function claimMission(id){
  const m = MISSIONS.find(x => x.id === id);
  if(!m) return;
  if(!missionClaimable(m)) return;
  state.missions.claimed[id] = true;
  state.packs = clamp(state.packs + MISSION_REWARD_PACKS, 0, 9999);
  saveState();
  toast(`ミッション報酬 +${MISSION_REWARD_PACKS} パック`);
  render();
}

function updateMission(id, delta){
  if(state.missions.date !== tokyoDateString()){
    // safety: reset if someone leaves the tab open over midnight
    dailyResetIfNeeded();
  }
  const cur = state.missions.progress[id] ?? 0;
  const m = MISSIONS.find(x => x.id === id);
  if(!m) return;
  state.missions.progress[id] = clamp(cur + delta, 0, m.goal);
}

async function fetchRandomWikiSummary(){
  const url = "https://ja.wikipedia.org/api/rest_v1/page/random/summary";
  const res = await fetch(url, { headers: { "accept": "application/json" } });
  if(!res.ok) throw new Error("Wikipedia API error");
  return await res.json();
}

function buildCardFromWiki(summary, rarity){
  // some random stats per rarity
  const base = { N: 10, R: 18, SR: 28, SSR: 42 }[rarity] ?? 10;
  const card = {
    id: summary.pageid ?? summary.title ?? String(Date.now()),
    title: summary.title ?? "不明な記事",
    extract: summary.extract ?? "要約を取得できませんでした。",
    url: summary?.content_urls?.desktop?.page ?? "https://ja.wikipedia.org/",
    thumb: summary?.thumbnail?.source ?? null,
    rarity,
    stats: {
      hp: base + randInt(0, base),
      atk: Math.floor(base*0.8) + randInt(0, base),
      def: Math.floor(base*0.6) + randInt(0, base),
    },
    ts: Date.now(),
  };
  return card;
}

function addToCollection(card){
  const key = String(card.id);
  if(!state.collection[key]){
    state.collection[key] = { card, count: 1 };
  }else{
    state.collection[key].count += 1;
    // keep best version? For simplicity, we keep the first card data.
  }
}

function rarityWeights(){
  const isGold = (state.pullsSinceGold % GOLD_EVERY) === (GOLD_EVERY - 1); // next pull makes gold? actually after 9 pulls
  // We’ll interpret: every 10th pull is gold (10,20,30...), i.e., when pullsSinceGold % 10 == 9 before increment.
  return isGold ? RARITY_WEIGHTS_GOLD : RARITY_WEIGHTS_NORMAL;
}

function isGoldPull(){
  return (state.pullsSinceGold % GOLD_EVERY) === (GOLD_EVERY - 1);
}

async function openPack(){
  if(state.packs <= 0){
    toast("本日のパックがありません（デイリー報酬/支援デモで増やせます）");
    return;
  }
  state.packs -= 1;
  const gold = isGoldPull();
  state.pullsSinceGold += 1;

  updateMission("pull_5", 1);

  let summary;
  try{
    summary = await fetchRandomWikiSummary();
  }catch(e){
    summary = {
      title: "オフライン記事",
      extract: "Wikipedia API へ接続できませんでした。ネットワークを確認してください。",
      content_urls: { desktop: { page: "https://ja.wikipedia.org/" } },
      thumbnail: null,
      pageid: "offline-" + Date.now(),
    };
  }

  const rarity = weightedPick(gold ? RARITY_WEIGHTS_GOLD : RARITY_WEIGHTS_NORMAL);
  const card = buildCardFromWiki(summary, rarity);

  if(rarityGE(rarity, "SR")) updateMission("sr_1", 1);

  addToCollection(card);
  state.lastCard = card;

  saveState();
  render();

  showCardModal(card, gold);
}

function renderLastCard(){
  if(!state.lastCard){
    ui.lastCardEmpty.hidden = false;
    ui.lastCardHost.innerHTML = "";
    ui.shareBtn.disabled = true;
    return;
  }
  ui.lastCardEmpty.hidden = true;
  ui.lastCardHost.innerHTML = "";
  ui.lastCardHost.appendChild(renderBigCard(state.lastCard));
  ui.shareBtn.disabled = false;
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
    const node = renderMiniCard(e.card, e.count);
    node.addEventListener("click", () => showCardModal(e.card, false));
    ui.zukanGrid.appendChild(node);
  }
}

function renderDeck(){
  const slots = [0,1,2].map(i => state.deck?.[i] ?? null);
  ui.deck.innerHTML = "";
  slots.forEach((cid, i) => {
    const slot = document.createElement("div");
    slot.className = "slot";
    if(cid) slot.classList.add("is-filled");

    const title = document.createElement("div");
    title.className = "slot__title";
    title.textContent = cid ? "選択済み" : `空スロット ${i+1}`;
    slot.appendChild(title);

    const meta = document.createElement("div");
    meta.className = "slot__meta";

    if(cid && state.collection[cid]){
      const c = state.collection[cid].card;
      meta.innerHTML = `<span class="rarity r-${c.rarity}">${c.rarity}</span> / ${escapeHtml(c.title)}<br>HP ${c.stats.hp} / ATK ${c.stats.atk} / DEF ${c.stats.def}`;
      const remove = document.createElement("button");
      remove.className = "btn";
      remove.style.marginTop = "10px";
      remove.textContent = "外す";
      remove.addEventListener("click", () => {
        state.deck[i] = null;
        saveState();
        render();
      });
      slot.appendChild(meta);
      slot.appendChild(remove);
    }else{
      meta.textContent = "図鑑からカードをクリックしてデッキに入れられます。";
      slot.appendChild(meta);
    }

    ui.deck.appendChild(slot);
  });
}

function ensureDeck(){
  if(!state.deck) state.deck = [null,null,null];
}

function autoPickDeck(){
  ensureDeck();
  const keys = Object.keys(state.collection);
  if(keys.length === 0){
    toast("図鑑が空です。先にガチャを引いてください");
    return;
  }
  // pick 3 by rarity priority and then random
  const sorted = keys
    .map(k => ({k, r: state.collection[k].card.rarity}))
    .sort((a,b) => RARITY_ORDER.indexOf(b.r) - RARITY_ORDER.indexOf(a.r));
  const top = sorted.slice(0, Math.min(sorted.length, 12)).map(x => x.k);
  const picks = [];
  while(picks.length < 3 && top.length){
    const idx = randInt(0, top.length-1);
    picks.push(top.splice(idx,1)[0]);
  }
  while(picks.length < 3){
    picks.push(keys[randInt(0, keys.length-1)]);
  }
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

function battle(){
  ensureDeck();
  const ids = state.deck.filter(Boolean);
  if(ids.length < 1){
    toast("デッキが空です（最低1枚）");
    return;
  }
  const team = ids.map(id => state.collection[id]?.card).filter(Boolean);
  if(team.length < 1){
    toast("デッキ情報が不正です。デッキを選び直してください");
    return;
  }

  // enemy based on team strength
  const avgAtk = Math.round(team.reduce((s,c)=>s+c.stats.atk,0)/team.length);
  const avgDef = Math.round(team.reduce((s,c)=>s+c.stats.def,0)/team.length);
  const avgHp  = Math.round(team.reduce((s,c)=>s+c.stats.hp,0)/team.length);
  const enemy = {
    name: "UNKNOWN ENTITY",
    hp: avgHp * 2 + randInt(0, avgHp),
    atk: avgAtk + randInt(0, avgAtk),
    def: Math.floor(avgDef*0.8) + randInt(0, avgDef),
  };

  writeLog("==== BATTLE START ====", "warn");
  writeLog(`敵: ${enemy.name} / HP ${enemy.hp} / ATK ${enemy.atk} / DEF ${enemy.def}`);

  let eHp = enemy.hp;
  let tHp = team.reduce((s,c)=>s+c.stats.hp,0);

  for(let turn=1; turn<=12; turn++){
    if(eHp <= 0 || tHp <= 0) break;

    // team attacks
    const hitter = team[randInt(0, team.length-1)];
    const dmg = Math.max(1, hitter.stats.atk - Math.floor(enemy.def/2) + randInt(-3, 6));
    eHp -= dmg;
    writeLog(`T${turn}: 味方(${shortTitle(hitter.title)})の攻撃 → ${dmg} dmg / 敵HP ${Math.max(0,eHp)}`, "good");

    if(eHp <= 0) break;

    // enemy attacks
    const target = team[randInt(0, team.length-1)];
    const edmg = Math.max(1, enemy.atk - Math.floor(target.stats.def/2) + randInt(-3, 6));
    tHp -= edmg;
    writeLog(`T${turn}: 敵の攻撃 → ${edmg} dmg / 味方HP ${Math.max(0,tHp)}`, "bad");
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

function shortTitle(t){
  const s = (t || "").trim();
  return s.length > 14 ? s.slice(0, 14) + "…" : s;
}

function escapeHtml(str){
  return String(str).replace(/[&<>"']/g, (c) => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
  }[c]));
}

function renderMiniCard(card, count){
  const root = document.createElement("div");
  root.className = "cardMini";

  const thumb = document.createElement("div");
  thumb.className = "cardMini__thumb";
  if(card.thumb){
    thumb.style.backgroundImage = `url("${card.thumb}")`;
    thumb.style.backgroundSize = "cover";
    thumb.style.backgroundPosition = "center";
  }

  const body = document.createElement("div");
  body.className = "cardMini__body";

  const title = document.createElement("div");
  title.className = "cardMini__title";
  title.textContent = card.title;

  const meta = document.createElement("div");
  meta.className = "cardMini__meta";
  meta.innerHTML = `<span class="rarity r-${card.rarity}">${card.rarity}</span><span class="count">x${count}</span>`;

  body.appendChild(title);
  body.appendChild(meta);
  root.appendChild(thumb);
  root.appendChild(body);

  // allow adding to deck from zukan view:
  root.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    addToDeck(card.id);
  });

  return root;
}

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
  info.className = "bigCard__info";

  const top = document.createElement("div");
  top.className = "bigCard__top";

  const name = document.createElement("div");
  name.className = "bigCard__name";
  name.textContent = card.title;

  const rar = document.createElement("div");
  rar.className = `bigCard__rar rarity r-${card.rarity}`;
  rar.textContent = card.rarity;

  top.appendChild(name);
  top.appendChild(rar);

  const desc = document.createElement("div");
  desc.className = "bigCard__desc";
  desc.textContent = card.extract;

  const stats = document.createElement("div");
  stats.className = "stats";
  stats.innerHTML = `
    <div class="stat">HP ${card.stats.hp}</div>
    <div class="stat">ATK ${card.stats.atk}</div>
    <div class="stat">DEF ${card.stats.def}</div>
  `;

  const link = document.createElement("div");
  link.className = "small muted";
  link.style.marginTop = "10px";
  link.innerHTML = `リンク: <a href="${card.url}" target="_blank" rel="noopener noreferrer">${escapeHtml(card.url)}</a>`;

  info.appendChild(top);
  info.appendChild(desc);
  info.appendChild(stats);
  info.appendChild(link);

  wrap.appendChild(thumb);
  wrap.appendChild(info);

  return wrap;
}

function showCardModal(card, gold){
  ui.modalTitle.textContent = gold ? "金パック！" : "カード獲得";
  ui.modalBody.innerHTML = "";
  ui.modalBody.appendChild(renderBigCard(card));

  ui.openWikiBtn.onclick = () => openWikipedia(card);
  ui.okBtn.onclick = closeModal;
  ui.modalClose.onclick = closeModal;
  ui.modalX.onclick = closeModal;

  ui.modal.hidden = false;

  // If user taps outside panel, close
  ui.modal.addEventListener("click", (e) => {
    if(e.target === ui.modalClose) closeModal();
  }, { once:true });
}

function closeModal(){
  ui.modal.hidden = true;
}

function openWikipedia(card){
  if(!card?.url) return;
  window.open(card.url, "_blank", "noopener,noreferrer");
  updateMission("open_wiki_1", 1);
  saveState();
  render();
  toast("Wikipediaを開きました");
}

async function shareLast(){
  const c = state.lastCard;
  if(!c){ return; }
  const text = `【${c.rarity}】${c.title}\n${c.url}\n#WikiGacha`;
  let ok = false;
  try{
    if(navigator.share){
      await navigator.share({ text, title: "WikiGacha", url: c.url });
      ok = true;
    }
  }catch{/* ignore */}
  if(!ok){
    try{
      await navigator.clipboard.writeText(text);
      ok = true;
      toast("クリップボードにコピーしました");
    }catch{
      // fallback prompt
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

function supportDemo(){
  // "Ad view" demo: wait 7 seconds then grant mission progress +1
  ui.supportBtn.disabled = true;
  toast("支援デモ: 7秒カウント中…");
  let left = 7;
  const original = ui.supportBtn.textContent;
  ui.supportBtn.textContent = `待機… ${left}s`;

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

function addToDeck(cardId){
  ensureDeck();
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
  toast(`デッキに追加: ${shortTitle(state.collection[key].card.title)}`);
}

function attachZukanDeckUX(){
  // click a card in zukan to open modal; right-click to add to deck already handled
  // but for mobile, long-press isn't reliable; provide "デッキへ" in modal body via keyboard shortcut "d"
  window.addEventListener("keydown", (e) => {
    if(e.key.toLowerCase() === "d" && !ui.modal.hidden && state.lastCard){
      addToDeck(state.lastCard.id);
    }
  });
}

function render(){
  packsUI();
  renderMissions();
  renderLastCard();
  renderZukan();
  ensureDeck();
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

  // add-to-deck helper: clicking zukan cards -> modal already; context menu adds to deck
  ui.zukanGrid.addEventListener("click", (e) => {
    const cardEl = e.target.closest(".cardMini");
    if(!cardEl) return;
    // no-op: handled per card
  });

  // Clicking last card in gacha adds to deck quickly
  ui.lastCardHost.addEventListener("dblclick", () => {
    if(state.lastCard) addToDeck(state.lastCard.id);
  });
}

dailyResetIfNeeded();
setupRouting();
setupUI();
attachZukanDeckUX();
render();
