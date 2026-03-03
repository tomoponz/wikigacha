/* WikiGacha v3 — original implementation (GitHub Pages ready)
   Viewer overlay + favorites + sorting + SFX settings + share image
*/
const STORAGE_KEY = "wg_state_v3";
const PACK_CAP = 10;
const PACK_REGEN_SEC = 60;
const CARDS_PER_PACK = 5;
const GOLD_EVERY_PACK = 10;
const MISSION_REWARD_PACKS = 2;

const RARITIES = ["C","UC","R","SR","SSR","UR","LR"];
const RARITY_ORDER = ["C","UC","R","SR","SSR","UR","LR"];
const RARITY_WEIGHTS_NORMAL = { C: 62, UC: 20, R: 11, SR: 5.5, SSR: 1.3, UR: 0.18, LR: 0.02 };
const RARITY_WEIGHTS_GOLD   = { C: 45, UC: 20, R: 18, SR: 12,  SSR: 4.2, UR: 0.7,  LR: 0.1  };

const MISSIONS = [
  { id:"pull_5",      name:"ガチャ（パック）を5回開ける", goal:5 },
  { id:"sr_1",        name:"SR以上を1枚引く",             goal:1 },
  { id:"open_wiki_1", name:"Wikipediaを1回開く",          goal:1 },
  { id:"share_1",     name:"結果をシェアする",            goal:1 },
  { id:"support_1",   name:"広告を閲覧する",              goal:1 },
];

const SFX_SRC = {
  open: "assets/sfx/open_pack.wav",
  flip: "assets/sfx/card_flip.wav",
  claim: "assets/sfx/claim.wav",
  star: "assets/sfx/star.wav",
  click: "assets/sfx/ui_click.wav",
};

const el = (sel) => document.querySelector(sel);
const els = (sel) => Array.from(document.querySelectorAll(sel));
const clamp = (n,a,b) => Math.min(b, Math.max(a,n));
const nowMs = () => Date.now();

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
  sortSelect: el("#sortSelect"),
  favOnly: el("#favOnly"),
  rarityFilter: el("#rarityFilter"),
  zukanGrid: el("#zukanGrid"),
  zukanEmpty: el("#zukanEmpty"),
  deck: el("#deck"),
  autoPickBtn: el("#autoPickBtn"),
  battleBtn: el("#battleBtn"),
  battleLog: el("#battleLog"),
  battleHint: el("#battleHint"),
  resetBattleBtn: el("#resetBattleBtn"),
  cmdPanel: el("#cmdPanel"),
  cmdAttack: el("#cmdAttack"),
  cmdGuard: el("#cmdGuard"),
  cmdBurst: el("#cmdBurst"),
  cmdForfeit: el("#cmdForfeit"),
  allyHpFill: el("#allyHpFill"),
  enemyHpFill: el("#enemyHpFill"),
  allyHpNow: el("#allyHpNow"),
  allyHpMax: el("#allyHpMax"),
  enemyHpNow: el("#enemyHpNow"),
  enemyHpMax: el("#enemyHpMax"),
  langBtn: el("#langBtn"),
  trophyBtn: el("#trophyBtn"),
  soundBtn: el("#soundBtn"),
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
  viewer: el("#viewer"),
  viewerStage: el("#viewerStage"),
  tcgCard: el("#tcgCard"),
  prevCardBtn: el("#prevCardBtn"),
  nextCardBtn: el("#nextCardBtn"),
  viewerIndex: el("#viewerIndex"),
  viewerTotal: el("#viewerTotal"),
  copyOneBtn: el("#copyOneBtn"),
  viewerSoundBtn: el("#viewerSoundBtn"),
  closeViewerBtn: el("#closeViewerBtn"),
  copyResultBtn: el("#copyResultBtn"),
  shareResultBtn: el("#shareResultBtn"),
  shareImageBtn: el("#shareImageBtn"),
  // RPG
  rpgMapGrid: el("#rpgMapGrid"),
  rpgStartBtn: el("#rpgStartBtn"),
  rpgCampBtn: el("#rpgCampBtn"),
  rpgResetBtn: el("#rpgResetBtn"),
  rpgText: el("#rpgText"),
  rpgCmd: el("#rpgCmd"),
  rpgCmd1: el("#rpgCmd1"),
  rpgCmd2: el("#rpgCmd2"),
  rpgCmd3: el("#rpgCmd3"),
  rpgLog: el("#rpgLog"),
  plLv: el("#plLv"),
  plExp: el("#plExp"),
  plExpNext: el("#plExpNext"),
  plChapter: el("#plChapter"),
  plShard: el("#plShard"),
  plHp: el("#plHp"),
  plHpMax: el("#plHpMax"),
  plMp: el("#plMp"),
  plMpMax: el("#plMpMax"),
  plGold: el("#plGold"),
  plLoc: el("#plLoc"),
  rpgPartyList: el("#rpgPartyList"),
  // DQ battle overlay
  dqBattle: el("#dqBattle"),
  dqEnemies: el("#dqEnemies"),
  dqMsg: el("#dqMsg"),
  dqMenu: el("#dqMenu"),
  dqStatus: el("#dqStatus"),
};

function tokyoDateString(d=new Date()){
  const fmt = new Intl.DateTimeFormat("sv-SE",{timeZone:"Asia/Tokyo",year:"numeric",month:"2-digit",day:"2-digit"});
  return fmt.format(d);
}
function weightedPick(weights){
  const entries = Object.entries(weights);
  const sum = entries.reduce((s,[,w])=>s+w,0);
  let r = Math.random()*sum;
  for(const [k,w] of entries){ r -= w; if(r<=0) return k; }
  return entries[entries.length-1][0];
}
function rarityGE(a,b){ return RARITY_ORDER.indexOf(a) >= RARITY_ORDER.indexOf(b); }
function rarityBorder(r){
  const map={C:"rgba(255,255,255,.18)",UC:"rgba(207,207,207,.18)",R:"rgba(52,211,153,.25)",SR:"rgba(96,165,250,.28)",SSR:"rgba(251,113,133,.30)",UR:"rgba(245,158,11,.35)",LR:"rgba(250,204,21,.40)"};
  return map[r]||"rgba(255,255,255,.18)";
}
function toast(msg){
  ui.toast.textContent=msg;
  ui.toast.classList.add("is-show");
  clearTimeout(toast._t);
  toast._t=setTimeout(()=>ui.toast.classList.remove("is-show"),1600);
}
function escapeHtml(str){
  return String(str).replace(/[&<>"']/g,(c)=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
}

/* State */
function defaultState(){
  const today = tokyoDateString();
  return {
    version:3, today,
    packs:PACK_CAP, regenAnchor: nowMs(), packOpens:0,
    missions:{date:today, progress:Object.fromEntries(MISSIONS.map(m=>[m.id,0])), claimed:Object.fromEntries(MISSIONS.map(m=>[m.id,false]))},
    lastPack:null, collection:{}, favorites:{}, deck:[null,null,null],
    settings:{ sfxEnabled:true, sfxVolume:0.55, sortKey:"rarity", favOnly:false },
    rpg:{}
  };
}
function loadState(){
  try{
    const raw = localStorage.getItem(STORAGE_KEY);
    if(!raw) return defaultState();
    const st = JSON.parse(raw);
    if(!st || st.version!==3) return defaultState();
    st.settings ||= defaultState().settings;
    st.favorites ||= {};
    if(!Array.isArray(st.deck)) st.deck=[null,null,null];
    st.rpg ||= {};
    return st;
  }catch{
    return defaultState();
  }
}
let state = loadState();
function saveState(){ localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }

/* SFX */
const audioPool = new Map();
function playSfx(key){
  if(!state.settings?.sfxEnabled) return;
  const src = SFX_SRC[key]; if(!src) return;
  try{
    let base = audioPool.get(key);
    if(!base){ base = new Audio(src); base.preload="auto"; audioPool.set(key, base); }
    const a = base.cloneNode(true);
    a.volume = clamp(state.settings.sfxVolume ?? 0.55, 0, 1);
    a.play().catch(()=>{});
  }catch{}
}
function syncSoundButtons(){
  const off = !state.settings.sfxEnabled;
  ui.soundBtn?.classList.toggle("is-off", off);
  ui.viewerSoundBtn?.classList.toggle("is-off", off);
  const icon = off ? "🔇" : "🔊";
  if(ui.soundBtn) ui.soundBtn.textContent = icon;
  if(ui.viewerSoundBtn) ui.viewerSoundBtn.textContent = icon;
}

/* Regen + missions */
function dailyResetMissionsIfNeeded(){
  const today = tokyoDateString();
  if(state.today !== today){
    state.today = today;
    state.missions = {date:today, progress:Object.fromEntries(MISSIONS.map(m=>[m.id,0])), claimed:Object.fromEntries(MISSIONS.map(m=>[m.id,false]))};
    saveState();
  }
}
function applyPackRegen(){
  if(state.packs >= PACK_CAP){ state.regenAnchor = nowMs(); return; }
  const interval = PACK_REGEN_SEC*1000;
  const elapsed = nowMs() - (state.regenAnchor ?? nowMs());
  if(elapsed < interval) return;
  const add = Math.floor(elapsed/interval);
  const before = state.packs;
  state.packs = clamp(state.packs + add, 0, PACK_CAP);
  const used = Math.min(add, PACK_CAP-before);
  state.regenAnchor += used*interval;
  if(state.packs >= PACK_CAP) state.regenAnchor = nowMs();
  saveState();
}
function packHintText(){
  if(state.packs >= PACK_CAP) return "パック満タン";
  const interval = PACK_REGEN_SEC*1000;
  const elapsed = nowMs() - (state.regenAnchor ?? nowMs());
  const remain = clamp(interval - (elapsed % interval), 0, interval);
  return `次の回復まで ${Math.ceil(remain/1000)}s（1分で1回復）`;
}
function goldIn(){ return GOLD_EVERY_PACK - (state.packOpens % GOLD_EVERY_PACK); }
function isGoldNextOpen(){ return (state.packOpens % GOLD_EVERY_PACK) === (GOLD_EVERY_PACK-1); }

function updateMission(id, delta){
  dailyResetMissionsIfNeeded();
  const cur = state.missions.progress[id] ?? 0;
  const goal = MISSIONS.find(m=>m.id===id)?.goal ?? 1;
  state.missions.progress[id] = clamp(cur + delta, 0, goal);
}
function missionClaimable(id){
  const m = MISSIONS.find(x=>x.id===id);
  return m && (state.missions.progress[id]??0) >= m.goal && !state.missions.claimed[id];
}
function claimMission(id){
  if(!missionClaimable(id)) return;
  state.missions.claimed[id]=true;
  state.packs = clamp(state.packs + MISSION_REWARD_PACKS, 0, 9999);
  saveState();
  playSfx("claim");
  toast(`ミッション報酬 +${MISSION_REWARD_PACKS} パック`);
  render();
}
function renderMissions(){
  ui.missions.innerHTML="";
  for(const m of MISSIONS){
    const li=document.createElement("li");
    li.className="missionItem";
    const name=document.createElement("span"); name.textContent=m.name;
    const meta=document.createElement("div"); meta.className="missionMeta";
    meta.appendChild(document.createTextNode(`${state.missions.progress[m.id]??0}/${m.goal}`));
    if(missionClaimable(m.id)){
      const b=document.createElement("button");
      b.className="claimBtn"; b.textContent=`受取 +${MISSION_REWARD_PACKS}`;
      b.addEventListener("click", ()=>{ playSfx("click"); claimMission(m.id); });
      meta.appendChild(b);
    }else if(state.missions.claimed[m.id]){
      const s=document.createElement("span"); s.textContent="受取済"; meta.appendChild(s);
    }
    li.appendChild(name); li.appendChild(meta);
    ui.missions.appendChild(li);
  }
}

/* Wikipedia */
async function fetchRandomWikiSummary(){
  const url="https://ja.wikipedia.org/api/rest_v1/page/random/summary";
  const res=await fetch(url,{headers:{"accept":"application/json"}});
  if(!res.ok) throw new Error("wiki api");
  return await res.json();
}
function computeStats(summary, rarity){
  const title = summary?.title ?? "";
  const extract = summary?.extract ?? "";
  const n = extract.length + title.length*10;
  const mult = {C:0.7,UC:0.9,R:1.15,SR:1.45,SSR:1.9,UR:2.4,LR:3.2}[rarity] ?? 1.0;
  const base = clamp(Math.round((n*2.5+900)*mult), 800, 14000);
  const atk = clamp(Math.round(base*(0.48+Math.random()*0.32)), 200, 16000);
  const def = clamp(Math.round(base*(0.48+Math.random()*0.32)), 200, 16000);
  const hp  = clamp(Math.round((atk+def)*(0.35+Math.random()*0.20)), 400, 24000);
  return {hp,atk,def};
}
function buildCard(summary, rarity){
  const id = summary.pageid ?? summary.title ?? ("x-"+nowMs()+"-"+Math.random());
  const url = summary?.content_urls?.desktop?.page ?? "https://ja.wikipedia.org/";
  const thumb = summary?.thumbnail?.source ?? null;
  let flavor=null;
  if(rarityGE(rarity,"SSR")){
    const s=(summary?.extract??"").trim();
    if(s) flavor = s.split(/[。\.]/)[0]?.slice(0,70) ?? null;
  }
  return {id:String(id), title:summary.title??"不明な記事", extract:summary.extract??"要約を取得できませんでした。", url, thumb, rarity, stats:computeStats(summary,rarity), flavor, ts:nowMs()};
}
function addToCollection(card){
  const key=String(card.id);
  if(!state.collection[key]) state.collection[key]={card, count:1};
  else state.collection[key].count += 1;
}

/* Favorites */
function isFavorite(id){ return !!state.favorites[String(id)]; }
function setFavorite(id,on){
  const key=String(id);
  if(on) state.favorites[key]=true;
  else delete state.favorites[key];
  saveState();
}

/* Viewer */
let viewerCards=[], viewerIdx=0;
function openViewer(cards, start=0){
  viewerCards = Array.isArray(cards)?cards:[];
  viewerIdx = clamp(start,0,Math.max(0,viewerCards.length-1));
  ui.viewerTotal.textContent=String(viewerCards.length||0);
  ui.viewer.hidden=false;
  renderViewer();
  syncSoundButtons();
}
function closeViewer(){ ui.viewer.hidden=true; }
function nextCard(){ if(!viewerCards.length) return; viewerIdx=(viewerIdx+1)%viewerCards.length; playSfx("flip"); renderViewer(); }
function prevCard(){ if(!viewerCards.length) return; viewerIdx=(viewerIdx-1+viewerCards.length)%viewerCards.length; playSfx("flip"); renderViewer(); }

function renderTcgCard(card){
  const root=document.createElement("div");
  root.className="tcgCard";
  root.dataset.rarity=card.rarity;

  const media=document.createElement("div"); media.className="tcgMedia";
  if(card.thumb){
    const img=document.createElement("img"); img.src=card.thumb; img.alt=""; img.loading="lazy";
    media.appendChild(img);
  }
  root.appendChild(media);

  const water=document.createElement("div"); water.className="tcgWater"; water.textContent="W"; root.appendChild(water);

  const top=document.createElement("div"); top.className="tcgTop";
  const mini=document.createElement("div"); mini.className="tcgMini";
  mini.innerHTML=`<span class="rarity r-${card.rarity}">${card.rarity}</span><span class="tcgMiniTitle">${escapeHtml(card.title)}</span>`;
  top.appendChild(mini);

  const star=document.createElement("button"); star.className="tcgStar";
  const fav=isFavorite(card.id);
  star.classList.toggle("is-on", fav);
  star.textContent=fav?"★":"☆";
  star.addEventListener("click",(e)=>{
    e.stopPropagation();
    const now=!isFavorite(card.id);
    setFavorite(card.id, now);
    star.classList.toggle("is-on", now);
    star.textContent=now?"★":"☆";
    playSfx("star");
    renderZukan();
  });
  top.appendChild(star);
  root.appendChild(top);

  const title=document.createElement("div"); title.className="tcgTitle"; title.textContent=card.title; root.appendChild(title);

  const info=document.createElement("button"); info.className="tcgInfo"; info.textContent="i";
  info.addEventListener("click",(e)=>{ e.stopPropagation(); playSfx("click"); showCardModal(card); });
  root.appendChild(info);

  const text=document.createElement("div"); text.className="tcgText"; text.textContent=card.extract; root.appendChild(text);

  const stats=document.createElement("div"); stats.className="tcgStats";
  stats.innerHTML=`<div class="tcgStat atk"><div class="label">ATK</div><div class="value">${card.stats.atk}</div></div><div class="tcgStat def"><div class="label">DEF</div><div class="value">${card.stats.def}</div></div>`;
  root.appendChild(stats);

  return root;
}
function renderViewer(){
  if(!viewerCards.length){ ui.tcgCard.innerHTML=""; ui.viewerIndex.textContent="0"; return; }
  ui.viewerIndex.textContent=String(viewerIdx+1);
  ui.tcgCard.innerHTML="";
  ui.tcgCard.appendChild(renderTcgCard(viewerCards[viewerIdx]));
}

/* Share/copy */
function emojiForRarity(r){
  if(r==="C") return "⬜";
  if(r==="UC") return "⬛";
  if(r==="R") return "🟩";
  if(r==="SR") return "🟦";
  if(r==="SSR") return "🟥";
  if(r==="UR") return "🟨";
  if(r==="LR") return "🟧";
  return "⬜";
}
function formatCardLine(card, includeUrl=false){
  const head = `${emojiForRarity(card.rarity)}[${card.rarity}] ${card.title}`;
  const stats = `ATK ${card.stats.atk} / DEF ${card.stats.def}`;
  return includeUrl ? `${head}\n${stats}\n${card.url}` : `${head} ${stats}`;
}
function formatResultText(cards){
  const lines=(cards||[]).map(c=>formatCardLine(c,false));
  return `WikiGacha\n${lines.join("\n")}\n#WikiGacha`;
}
async function copyText(text){
  try{ await navigator.clipboard.writeText(text); toast("コピーしました"); }
  catch{ window.prompt("コピーして使ってください", text); }
}
async function shareText(text){
  try{
    if(navigator.share){
      await navigator.share({title:"WikiGacha", text});
      updateMission("share_1",1); saveState(); renderMissions();
      toast("共有しました");
      return;
    }
  }catch{}
  await copyText(text);
}

function roundRect(ctx,x,y,w,h,r){
  const rr=Math.min(r,w/2,h/2);
  ctx.beginPath();
  ctx.moveTo(x+rr,y);
  ctx.arcTo(x+w,y,x+w,y+h,rr);
  ctx.arcTo(x+w,y+h,x,y+h,rr);
  ctx.arcTo(x,y+h,x,y,rr);
  ctx.arcTo(x,y,x+w,y,rr);
  ctx.closePath();
}
function trimText(ctx,text,maxW){
  const s=String(text);
  if(ctx.measureText(s).width<=maxW) return s;
  let t=s;
  while(t.length>0 && ctx.measureText(t+"…").width>maxW) t=t.slice(0,-1);
  return t+"…";
}
function drawResultImage(cards){
  const W=1080, pad=72, lineH=64, titleH=110;
  const rows=Math.max(5,(cards?.length||0)+1);
  const H=pad*2+titleH+rows*lineH+80;
  const c=document.createElement("canvas"); c.width=W; c.height=H;
  const g=c.getContext("2d");
  const grd=g.createLinearGradient(0,0,0,H); grd.addColorStop(0,"#0b0b0b"); grd.addColorStop(1,"#1a1a1a");
  g.fillStyle=grd; g.fillRect(0,0,W,H);
  g.fillStyle="rgba(234,179,8,0.14)"; g.beginPath(); g.ellipse(W*0.35,H*0.20,420,280,0,0,Math.PI*2); g.fill();
  g.fillStyle="rgba(147,197,253,0.10)"; g.beginPath(); g.ellipse(W*0.62,H*0.28,520,320,0,0,Math.PI*2); g.fill();

  g.fillStyle="rgba(0,0,0,0.65)"; roundRect(g,pad,pad,W-pad*2,86,44); g.fill();
  g.strokeStyle="rgba(234,179,8,0.85)"; g.lineWidth=3; g.stroke();

  g.fillStyle="#eab308"; g.font="700 38px ui-monospace, Menlo, Consolas, monospace";
  g.fillText("WikiGacha RESULT", pad+34, pad+56);

  let y=pad+titleH;
  g.font="600 30px system-ui, -apple-system, Segoe UI, Roboto, sans-serif";
  g.fillStyle="rgba(255,255,255,0.90)";
  (cards||[]).slice(0,5).forEach((card,i)=>{
    const icon=emojiForRarity(card.rarity);
    g.fillText(`${icon} [${card.rarity}] ${trimText(g, card.title, W-pad*2-20)}`, pad, y+i*lineH);
  });

  g.fillStyle="rgba(255,255,255,0.45)";
  g.font="500 24px ui-monospace, Menlo, Consolas, monospace";
  g.fillText("#WikiGacha", pad, H-pad);
  return c;
}
async function shareResultImage(cards){
  const canvas=drawResultImage(cards);
  const blob=await new Promise(res=>canvas.toBlob(res,"image/png"));
  if(!blob){ toast("画像生成に失敗しました"); return; }
  const file=new File([blob],"wikigacha_result.png",{type:"image/png"});
  try{
    if(navigator.canShare && navigator.canShare({files:[file]}) && navigator.share){
      await navigator.share({title:"WikiGacha", files:[file], text:"#WikiGacha"});
      updateMission("share_1",1); saveState(); renderMissions();
      toast("画像で共有しました");
      return;
    }
  }catch{}
  const url=URL.createObjectURL(blob);
  window.open(url,"_blank","noopener,noreferrer");
  toast("画像を開きました（保存して共有できます）");
}

/* Modal */
function openModal({title, bodyNode, showWikiButton=false, wikiUrl=null}){
  ui.modalTitle.textContent=title;
  ui.modalBody.innerHTML="";
  if(bodyNode) ui.modalBody.appendChild(bodyNode);
  ui.openWikiBtn.style.display = showWikiButton ? "" : "none";
  ui.openWikiBtn.onclick=()=>{
    if(wikiUrl) window.open(wikiUrl,"_blank","noopener,noreferrer");
    updateMission("open_wiki_1",1); saveState(); renderMissions();
    toast("Wikipediaを開きました");
  };
  ui.okBtn.onclick=closeModal;
  ui.modalClose.onclick=closeModal;
  ui.modalX.onclick=closeModal;
  ui.modal.hidden=false;
}
function closeModal(){ ui.modal.hidden=true; }
function renderBigCard(card){
  const wrap=document.createElement("div"); wrap.className="bigCard";
  const thumb=document.createElement("div"); thumb.className="bigCard__thumb";
  if(card.thumb){ const img=document.createElement("img"); img.src=card.thumb; img.alt=""; img.loading="lazy"; thumb.appendChild(img); }
  const info=document.createElement("div");
  const name=document.createElement("div"); name.className="bigCard__name";
  name.innerHTML=`<span class="rarity r-${card.rarity}">${card.rarity}</span> ${escapeHtml(card.title)}`;
  const desc=document.createElement("div"); desc.className="bigCard__desc"; desc.textContent=card.extract;
  const stats=document.createElement("div"); stats.className="stats";
  stats.innerHTML=`<div class="stat">ATK ${card.stats.atk}</div><div class="stat">DEF ${card.stats.def}</div><div class="stat">HP ${card.stats.hp}</div>`;
  const fav=document.createElement("div"); fav.className="bigCard__link";
  fav.innerHTML=`お気に入り: <b>${isFavorite(card.id)?"★":"☆"}</b>（カード画面の★で切替）`;
  const link=document.createElement("div"); link.className="bigCard__link";
  link.innerHTML=`リンク: <a href="${card.url}" target="_blank" rel="noopener noreferrer">${escapeHtml(card.url)}</a>`;
  info.appendChild(name); info.appendChild(desc); info.appendChild(stats); info.appendChild(fav);
  if(card.flavor){ const fl=document.createElement("div"); fl.className="bigCard__link"; fl.textContent=`FLAVOR: ${card.flavor}`; info.appendChild(fl); }
  info.appendChild(link);
  wrap.appendChild(thumb); wrap.appendChild(info);
  return wrap;
}
function showCardModal(card){
  playSfx("flip");
  openModal({title:"カード詳細", bodyNode: renderBigCard(card), showWikiButton:true, wikiUrl: card.url});
}

/* Gacha open */
async function openPack(){
  applyPackRegen();
  if(state.packs<=0){ toast("パックがありません（1分で回復 / ミッション報酬あり）"); return; }
  playSfx("open");
  state.packs -= 1;
  const gold = isGoldNextOpen();
  state.packOpens += 1;
  updateMission("pull_5",1);
  const weights = gold ? RARITY_WEIGHTS_GOLD : RARITY_WEIGHTS_NORMAL;

  const tasks = Array.from({length: CARDS_PER_PACK}, async ()=>{
    try{
      const s=await fetchRandomWikiSummary();
      const rar=weightedPick(weights);
      return buildCard(s, rar);
    }catch{
      const fallback={title:"オフライン記事",extract:"Wikipedia APIへ接続できませんでした。",content_urls:{desktop:{page:"https://ja.wikipedia.org/"}}};
      const rar=weightedPick(weights);
      return buildCard(fallback, rar);
    }
  });
  const cards = await Promise.all(tasks);

  if(cards.some(c=>rarityGE(c.rarity,"SR"))) updateMission("sr_1",1);
  cards.forEach(addToCollection);
  state.lastPack = cards;
  saveState();
  render();
  openViewer(cards, 0);
}

/* Gacha last pack grid */
function renderRevealCard(card){
  const root=document.createElement("div");
  root.className="rCard";
  root.style.borderColor=rarityBorder(card.rarity);
  const thumb=document.createElement("div"); thumb.className="rCard__thumb";
  if(card.thumb){
    const img=document.createElement("img"); img.className="thumbImg"; img.src=card.thumb; img.alt=""; img.loading="lazy";
    thumb.appendChild(img);
  }
  const body=document.createElement("div"); body.className="rCard__body";
  const title=document.createElement("div"); title.className="rCard__title"; title.textContent=card.title;
  const meta=document.createElement("div"); meta.className="rCard__meta";
  meta.innerHTML=`<span class="rarity r-${card.rarity}">${card.rarity}</span><span>ATK ${card.stats.atk}</span>`;
  const stats=document.createElement("div"); stats.className="rCard__stats";
  stats.textContent=`DEF ${card.stats.def} / HP ${card.stats.hp}`;
  body.appendChild(title); body.appendChild(meta); body.appendChild(stats);
  root.appendChild(thumb); root.appendChild(body);
  root.addEventListener("click", ()=>{
    playSfx("flip");
    openViewer(Array.isArray(state.lastPack)?state.lastPack:[], indexOfCardInLast(card.id));
  });
  return root;
}
function indexOfCardInLast(id){
  const cards = Array.isArray(state.lastPack)?state.lastPack:[];
  const idx = cards.findIndex(c=>String(c.id)===String(id));
  return idx>=0?idx:0;
}
function renderLastPack(){
  const pack=state.lastPack;
  if(!Array.isArray(pack)||pack.length===0){
    ui.lastCardEmpty.hidden=false;
    ui.lastCardHost.innerHTML="";
    ui.shareBtn.disabled=true;
    return;
  }
  ui.lastCardEmpty.hidden=true;
  ui.shareBtn.disabled=false;
  ui.lastCardHost.innerHTML="";
  const wrap=document.createElement("div"); wrap.className="revealGrid";
  pack.forEach(c=>wrap.appendChild(renderRevealCard(c)));
  ui.lastCardHost.appendChild(wrap);
}

/* Zukan */
function renderZukanMini(card, count){
  const root=document.createElement("div");
  root.className="zMini";
  root.style.borderColor=rarityBorder(card.rarity);
  const thumb=document.createElement("div"); thumb.className="zMini__thumb";
  if(card.thumb){
    const img=document.createElement("img"); img.className="thumbImg"; img.src=card.thumb; img.alt=""; img.loading="lazy";
    thumb.appendChild(img);
  }
  const body=document.createElement("div"); body.className="zMini__body";
  const title=document.createElement("div"); title.className="zMini__title"; title.textContent=card.title;
  const meta=document.createElement("div"); meta.className="zMini__meta";
  meta.innerHTML=`<span class="rarity r-${card.rarity}">${card.rarity}</span><span>x${count}</span>`;
  body.appendChild(title); body.appendChild(meta);
  root.appendChild(thumb); root.appendChild(body);
  root.addEventListener("click", ()=>showCardModal(card));
  root.addEventListener("contextmenu",(ev)=>{ev.preventDefault(); addToDeck(card.id);});
  return root;
}
function compareBySort(a,b,key){
  const ac=a.card, bc=b.card;
  if(key==="new") return bc.ts-ac.ts;
  if(key==="atk") return (bc.stats.atk-ac.stats.atk)||(bc.ts-ac.ts);
  if(key==="def") return (bc.stats.def-ac.stats.def)||(bc.ts-ac.ts);
  if(key==="count") return (b.count-a.count)||(bc.ts-ac.ts);
  if(key==="title") return String(ac.title).localeCompare(String(bc.title),"ja");
  return (RARITY_ORDER.indexOf(bc.rarity)-RARITY_ORDER.indexOf(ac.rarity))||(bc.ts-ac.ts);
}
function renderZukan(){
  const entries=Object.values(state.collection);
  if(entries.length===0){ ui.zukanEmpty.hidden=false; ui.zukanGrid.innerHTML=""; return; }
  ui.zukanEmpty.hidden=true;
  const q=(ui.searchInput.value||"").trim().toLowerCase();
  const rf=ui.rarityFilter.value||"";
  const favOnly=!!ui.favOnly.checked;
  const sortKey=ui.sortSelect.value||"rarity";

  const filtered=entries
    .filter(e=>!rf||e.card.rarity===rf)
    .filter(e=>!q||(e.card.title||"").toLowerCase().includes(q))
    .filter(e=>!favOnly||isFavorite(e.card.id))
    .sort((a,b)=>compareBySort(a,b,sortKey));

  ui.zukanGrid.innerHTML="";
  filtered.forEach(e=>ui.zukanGrid.appendChild(renderZukanMini(e.card,e.count)));
}

/* Deck + battle (kept) */
function addToDeck(cardId){
  const key=String(cardId);
  if(!state.collection[key]){ toast("図鑑に存在しないカードです"); return; }
  const idx=state.deck.findIndex(x=>!x);
  if(idx===-1){ toast("デッキが満員です（外してから追加）"); return; }
  state.deck[idx]=key;
  saveState();
  renderDeck();
  toast("デッキに追加しました");
  playSfx("click");
}
function renderDeck(){
  ui.deck.innerHTML="";
  state.deck = Array.isArray(state.deck)?state.deck:[null,null,null];
  state.deck.forEach((cid,i)=>{
    const slot=document.createElement("div"); slot.className="slot"; if(cid) slot.classList.add("is-filled");
    const title=document.createElement("div"); title.className="slot__title"; title.textContent=cid?`スロット ${i+1}`:`空スロット ${i+1}`;
    slot.appendChild(title);
    const meta=document.createElement("div"); meta.className="slot__meta";
    if(cid && state.collection[cid]){
      const c=state.collection[cid].card;
      meta.innerHTML=`<span class="rarity r-${c.rarity}">${c.rarity}</span> ${escapeHtml(c.title)}<br>ATK ${c.stats.atk} / DEF ${c.stats.def} / HP ${c.stats.hp}`;
      slot.style.borderColor=rarityBorder(c.rarity);
      const rm=document.createElement("button"); rm.className="btn"; rm.style.marginTop="10px"; rm.textContent="外す";
      rm.addEventListener("click", ()=>{ playSfx("click"); state.deck[i]=null; saveState(); renderDeck(); });
      slot.appendChild(meta); slot.appendChild(rm);
    }else{
      meta.textContent="図鑑のカードを右クリック（長押し）で追加。";
      slot.appendChild(meta);
    }
    ui.deck.appendChild(slot);
  });
}
function autoPickDeck(){
  const keys=Object.keys(state.collection);
  if(keys.length===0){ toast("図鑑が空です。先にガチャを引いてください"); return; }
  const pool=keys.map(k=>({k,r:state.collection[k].card.rarity}))
    .sort((a,b)=>RARITY_ORDER.indexOf(b.r)-RARITY_ORDER.indexOf(a.r))
    .slice(0,Math.min(keys.length,18)).map(x=>x.k);
  const picks=[];
  while(picks.length<3 && pool.length){ const idx=Math.floor(Math.random()*pool.length); picks.push(pool.splice(idx,1)[0]); }
  while(picks.length<3) picks.push(keys[Math.floor(Math.random()*keys.length)]);
  state.deck=picks; saveState(); renderDeck(); toast("デッキを自動選択しました"); playSfx("click");
}
function writeLog(line, cls=""){
  const div=document.createElement("div"); div.className="line"; if(cls) div.classList.add(cls);
  div.textContent=line; ui.battleLog.prepend(div);
}
function shortTitle(t){ const s=(t||"").trim(); return s.length>14?s.slice(0,14)+"…":s; }

/** === Battle v3.1 (interactive commands) === */
let battleState = null;

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function setCmdEnabled(on){
  const btns = [ui.cmdAttack, ui.cmdGuard, ui.cmdBurst, ui.cmdForfeit];
  btns.forEach(b => { if(b) b.disabled = !on; });
}

function updateHpUI(){
  if(!battleState) return;
  const { allyHp, allyHpMax, enemyHp, enemyHpMax } = battleState;
  ui.allyHpNow.textContent = String(Math.max(0, Math.round(allyHp)));
  ui.allyHpMax.textContent = String(Math.round(allyHpMax));
  ui.enemyHpNow.textContent = String(Math.max(0, Math.round(enemyHp)));
  ui.enemyHpMax.textContent = String(Math.round(enemyHpMax));

  const aPct = allyHpMax > 0 ? (allyHp / allyHpMax) * 100 : 0;
  const ePct = enemyHpMax > 0 ? (enemyHp / enemyHpMax) * 100 : 0;
  ui.allyHpFill.style.width = `${Math.max(0, Math.min(100, aPct))}%`;
  ui.enemyHpFill.style.width = `${Math.max(0, Math.min(100, ePct))}%`;
}

function updateBurstBtn(){
  if(!ui.cmdBurst) return;
  if(!battleState){
    ui.cmdBurst.textContent = "必殺";
    ui.cmdBurst.disabled = true;
    return;
  }
  const cd = battleState.burstCd;
  if(cd > 0){
    ui.cmdBurst.textContent = `必殺 (CD ${cd})`;
    ui.cmdBurst.disabled = true;
  }else{
    ui.cmdBurst.textContent = "必殺";
    ui.cmdBurst.disabled = false;
  }
}

function battleReset(){
  battleState = null;
  if(ui.cmdPanel) ui.cmdPanel.hidden = true;
  if(ui.battleHint) ui.battleHint.textContent = "「バトル開始」でコマンドが表示されます。攻撃/防御/必殺を選んで進行。";
  ui.allyHpNow.textContent = "-"; ui.allyHpMax.textContent = "-";
  ui.enemyHpNow.textContent = "-"; ui.enemyHpMax.textContent = "-";
  ui.allyHpFill.style.width = "0%";
  ui.enemyHpFill.style.width = "0%";
  setCmdEnabled(false);
  updateBurstBtn();
}

function battleStart(){
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
    hp: Math.round(sumHp * 0.95 + Math.random()*sumHp*0.45),
    atk: Math.round(sumAtk * 0.55 + Math.random()*sumAtk*0.35),
    def: Math.round(sumDef * 0.45 + Math.random()*sumDef*0.35),
  };

  battleState = {
    team,
    enemy,
    allyHpMax: sumHp,
    allyHp: sumHp,
    enemyHpMax: enemy.hp,
    enemyHp: enemy.hp,
    guard: false,
    burstCd: 0,
    turn: 1,
    busy: false,
  };

  if(ui.battleHint) ui.battleHint.textContent = "コマンドを選んで進行。必殺はクールダウンあり。";
  ui.cmdPanel.hidden = false;
  setCmdEnabled(true);
  updateHpUI();
  updateBurstBtn();

  writeLog("==== BATTLE START ====", "warn");
  writeLog(`敵: ${enemy.name} / HP ${enemy.hp} / ATK ${enemy.atk} / DEF ${enemy.def}`);
}

function pickTeamCard(){
  const t = battleState.team;
  return t[Math.floor(Math.random()*t.length)];
}

async function doEnemyTurn(){
  if(!battleState) return;
  const { enemy } = battleState;
  await sleep(450);

  const target = pickTeamCard();
  const guardMult = battleState.guard ? 0.55 : 1.0;
  battleState.guard = false;

  const edmg = Math.max(1, Math.round((enemy.atk*0.78 - target.stats.def*0.35) * guardMult + (Math.random()*18 - 6)));
  battleState.allyHp -= edmg;

  writeLog(`敵 → ${edmg} dmg / 味方HP ${Math.max(0, Math.round(battleState.allyHp))}`, "bad");
  updateHpUI();
}

function endBattle(result){
  if(!battleState) return;
  ui.cmdPanel.hidden = true;
  setCmdEnabled(false);

  if(result === "win"){
    writeLog("勝利！ +1 パック（デモ報酬）", "good");
    state.packs += 1;
    saveState();
    packsUI();
  }else if(result === "lose"){
    writeLog("敗北…（報酬なし）", "bad");
  }else{
    writeLog("撤退しました", "warn");
  }

  battleState = null;
  updateBurstBtn();
}

async function playerAction(type){
  if(!battleState || battleState.busy) return;
  battleState.busy = true;

  setCmdEnabled(false);

  if(battleState.burstCd > 0) battleState.burstCd -= 1;
  updateBurstBtn();

  const hitter = pickTeamCard();
  const enemy = battleState.enemy;

  if(type === "attack"){
    const dmg = Math.max(1, Math.round(hitter.stats.atk*0.72 - enemy.def*0.30 + (Math.random()*22 - 8)));
    battleState.enemyHp -= dmg;
    writeLog(`T${battleState.turn}: 味方(${shortTitle(hitter.title)}) → ${dmg} dmg / 敵HP ${Math.max(0, Math.round(battleState.enemyHp))}`, "good");
    updateHpUI();
  }

  if(type === "guard"){
    battleState.guard = true;
    writeLog(`T${battleState.turn}: 味方は防御態勢（次の被ダメ軽減）`, "warn");
  }

  if(type === "burst"){
    if(battleState.burstCd > 0){
      toast("必殺はクールダウン中");
    }else{
      const dmg = Math.max(1, Math.round(hitter.stats.atk*1.35 - enemy.def*0.15 + (Math.random()*40 - 10)));
      battleState.enemyHp -= dmg;
      battleState.burstCd = 3;
      writeLog(`T${battleState.turn}: 必殺！(${shortTitle(hitter.title)}) → ${dmg} dmg / 敵HP ${Math.max(0, Math.round(battleState.enemyHp))}`, "good");
      updateHpUI();
      updateBurstBtn();
    }
  }

  if(type === "forfeit"){
    endBattle("forfeit");
    return;
  }

  if(battleState.enemyHp <= 0){
    endBattle("win");
    return;
  }

  await doEnemyTurn();

  if(!battleState) return;

  if(battleState.allyHp <= 0){
    endBattle("lose");
    return;
  }

  battleState.turn += 1;
  updateBurstBtn();
  setCmdEnabled(true);
  battleState.busy = false;
}


/* Info + trophies + settings */
function showInfo(){
  const box=document.createElement("div"); box.className="empty";
  const sfxEnabled=!!state.settings.sfxEnabled;
  const vol=clamp(state.settings.sfxVolume ?? 0.55,0,1);
  box.innerHTML=`
    <b>WikiGacha（オリジナル実装）</b><br>
    ・パック回復: 1分で1回復（最大${PACK_CAP}）<br>
    ・1回のパックで ${CARDS_PER_PACK}枚 排出<br>
    ・金パック: ${GOLD_EVERY_PACK}回ごとに排出率UP<br>
    ・データ保存: このブラウザ内（localStorage）<br>
    <hr style="border:0;border-top:1px solid rgba(255,255,255,.10); margin:12px 0">
    <b>設定</b><br>
    <label style="display:flex; gap:10px; align-items:center; margin-top:10px">
      <input type="checkbox" id="setSfx" ${sfxEnabled?"checked":""} />
      効果音を有効化
    </label>
    <label style="display:block; margin-top:10px">
      音量: <span id="volVal">${Math.round(vol*100)}</span>%
      <input type="range" id="setVol" min="0" max="100" value="${Math.round(vol*100)}" style="width:100%; margin-top:6px">
    </label>
  `;
  openModal({title:"ゲーム情報", bodyNode:box, showWikiButton:false});
  el("#setSfx")?.addEventListener("change",(e)=>{
    state.settings.sfxEnabled = e.target.checked;
    saveState(); syncSoundButtons();
    toast(state.settings.sfxEnabled?"効果音ON":"効果音OFF");
    playSfx("click");
  });
  el("#setVol")?.addEventListener("input",(e)=>{
    const v=clamp(Number(e.target.value)/100,0,1);
    state.settings.sfxVolume=v;
    el("#volVal").textContent=String(Math.round(v*100));
    saveState();
  });
  el("#setVol")?.addEventListener("change",()=>playSfx("click"));
}
function showTrophies(){
  const total=state.packOpens??0;
  const uniq=Object.keys(state.collection).length;
  const gotRars=new Set(Object.values(state.collection).map(e=>e.card.rarity));
  const rainbow=RARITIES.every(r=>gotRars.has(r));
  const box=document.createElement("div"); box.className="empty";
  box.innerHTML=`<b>実績（簡易）</b><br>・開封回数: ${total}<br>・図鑑ユニーク: ${uniq}<br>・虹（全レア1枚以上）: ${rainbow?"達成":"未達成"}<br>`;
  openModal({title:"🏆 実績", bodyNode:box, showWikiButton:false});
}

/* Support demo */
function supportDemo(){
  ui.supportBtn.disabled=true;
  const original=ui.supportBtn.textContent;
  let left=7;
  ui.supportBtn.textContent=`待機… ${left}s`;
  toast("支援デモ: 7秒カウント中…");
  playSfx("click");
  const t=setInterval(()=>{
    left-=1; ui.supportBtn.textContent=`待機… ${left}s`;
    if(left<=0){
      clearInterval(t);
      ui.supportBtn.disabled=false;
      ui.supportBtn.textContent=original;
      updateMission("support_1",1);
      saveState();
      renderMissions();
      toast("支援デモ完了（ミッション進行）");
      playSfx("claim");
    }
  },1000);
}

/* UI + viewer controls */
function attachViewerControls(){
  ui.prevCardBtn.addEventListener("click",()=>{ playSfx("click"); prevCard(); });
  ui.nextCardBtn.addEventListener("click",()=>{ playSfx("click"); nextCard(); });
  ui.closeViewerBtn.addEventListener("click",()=>{ playSfx("click"); closeViewer(); });

  ui.viewerSoundBtn.addEventListener("click",()=>{
    state.settings.sfxEnabled=!state.settings.sfxEnabled;
    saveState(); syncSoundButtons();
    toast(state.settings.sfxEnabled?"効果音ON":"効果音OFF");
    playSfx("click");
  });

  ui.copyOneBtn.addEventListener("click",()=>{ playSfx("click"); copyText(formatCardLine(viewerCards[viewerIdx], true)); });
  ui.copyResultBtn.addEventListener("click",()=>{ playSfx("click"); copyText(formatResultText(viewerCards)); });
  ui.shareResultBtn.addEventListener("click",()=>{ playSfx("click"); shareText(formatResultText(viewerCards)); });
  ui.shareImageBtn.addEventListener("click",()=>{ playSfx("click"); shareResultImage(viewerCards); });

  window.addEventListener("keydown",(e)=>{
    if(ui.viewer.hidden) return;
    if(e.key==="ArrowLeft") prevCard();
    if(e.key==="ArrowRight") nextCard();
    if(e.key==="Escape") closeViewer();
  });

  let sx=0, sy=0, active=false;
  ui.viewerStage.addEventListener("pointerdown",(e)=>{ if(ui.viewer.hidden) return; active=true; sx=e.clientX; sy=e.clientY; });
  ui.viewerStage.addEventListener("pointerup",(e)=>{
    if(!active) return; active=false;
    const dx=e.clientX-sx, dy=e.clientY-sy;
    if(Math.abs(dx)>50 && Math.abs(dx)>Math.abs(dy)){
      if(dx<0) nextCard(); else prevCard();
    }
  });
}

/* Rendering */
function packsUI(){
  applyPackRegen();
  ui.packsNow.textContent=String(state.packs);
  ui.packsMax.textContent=String(PACK_CAP);
  ui.packsHint.textContent=packHintText();
  ui.toGoldText.textContent=String(goldIn());
}

function render(){
  packsUI();
  syncSoundButtons();
  renderMissions();
  renderLastPack();
  renderZukan();
  renderDeck();
}

function setupRouting(){
  ui.tabs.forEach(btn=>btn.addEventListener("click",()=>{ playSfx("click"); routeTo(btn.dataset.route); }));
}
function routeTo(route){
  ui.tabs.forEach(t=>{
    const active=t.dataset.route===route;
    t.classList.toggle("is-active",active);
    t.setAttribute("aria-selected",active?"true":"false");
  });
  ui.pages.forEach(p=>p.hidden=p.dataset.page!==route);
  render();
}

function setupUI(){
  ui.packBtn.addEventListener("click", openPack);

  ui.shareBtn.addEventListener("click",()=>{ playSfx("click"); shareText(formatResultText(Array.isArray(state.lastPack)?state.lastPack:[])); });
  ui.supportBtn.addEventListener("click", supportDemo);

  ui.searchInput.addEventListener("input", renderZukan);
  ui.rarityFilter.addEventListener("change",()=>{ playSfx("click"); renderZukan(); });

  ui.sortSelect.addEventListener("change",()=>{
    state.settings.sortKey=ui.sortSelect.value;
    saveState();
    playSfx("click");
    renderZukan();
  });
  ui.favOnly.addEventListener("change",()=>{
    state.settings.favOnly=ui.favOnly.checked;
    saveState();
    playSfx("click");
    renderZukan();
  });

  ui.autoPickBtn.addEventListener("click", autoPickDeck);
  ui.battleBtn.addEventListener("click",()=>{ playSfx("click"); if(!battleState) battleStart(); else toast("進行中：コマンドで操作してください"); });

  ui.resetBattleBtn.addEventListener("click", ()=>{ playSfx("click"); battleReset(); toast("リセットしました"); });
  ui.cmdAttack.addEventListener("click", ()=>{ playSfx("click"); playerAction("attack"); });
  ui.cmdGuard.addEventListener("click", ()=>{ playSfx("click"); playerAction("guard"); });
  ui.cmdBurst.addEventListener("click", ()=>{ playSfx("click"); playerAction("burst"); });
  ui.cmdForfeit.addEventListener("click", ()=>{ playSfx("click"); playerAction("forfeit"); });

  ui.langBtn.addEventListener("click",()=>toast("言語切替はデモ（未実装）"));
  ui.infoBtn.addEventListener("click",()=>{ playSfx("click"); showInfo(); });
  ui.trophyBtn.addEventListener("click",()=>{ playSfx("click"); showTrophies(); });

  ui.soundBtn.addEventListener("click",()=>{
    state.settings.sfxEnabled=!state.settings.sfxEnabled;
    saveState(); syncSoundButtons();
    toast(state.settings.sfxEnabled?"効果音ON":"効果音OFF");
    playSfx("click");
  });

  ui.modal.addEventListener("click",(e)=>{ if(e.target===ui.modalClose) closeModal(); });

  attachViewerControls();
}

function hydrateControls(){
  if(ui.sortSelect && state.settings?.sortKey) ui.sortSelect.value=state.settings.sortKey;
  if(ui.favOnly) ui.favOnly.checked=!!state.settings?.favOnly;
}

function startTimers(){
  setInterval(()=>{
    applyPackRegen();
    ui.packsHint.textContent=packHintText();
    ui.packsNow.textContent=String(state.packs);
  },1000);
}

dailyResetMissionsIfNeeded();
setupRouting();
setupUI();
rpgInit();
hydrateControls();
startTimers();
render();


/* === RPG MODE v5 (Adventure Mode) ===
   「メッセージ性」よりも「ストーリーとして面白い」テンポを優先。
   - マップ移動（章で解放）
   - ランダムイベント（ギャグ/不条理/戦闘）
   - コマンド式戦闘（攻撃/防御/必殺＝MP消費）
   - ボス撃破で章が進む（第1章〜第3章の土台）
*/
let rpgBusy = false;
let rpgBattle = null;
const rpgWait = (ms) => new Promise(r => setTimeout(r, ms));

/* --- DQ BATTLE v6 (command input + enemy display) --- */
const dq = {
  open(enemies, onFinish){
    ui.dqBattle.hidden = false;
    this.onFinish = onFinish;
    this.enemies = enemies;
    this.phase = "cmd";
    this.cmd = null;
    this.lock = false;
    this.renderEnemies();
    this.setMsg(`${this.enemyNameLine()} が あらわれた！`);
    this.renderStatus();
    this.renderCmdMenu();
  },
  close(){
    ui.dqBattle.hidden = true;
    ui.dqMenu.innerHTML = "";
    this.onFinish = null;
    this.enemies = null;
    this.phase = "cmd";
    this.cmd = null;
    this.lock = false;
  },
  enemyNameLine(){
    const alive = this.enemies.filter(e=>e.hp>0);
    if(alive.length===1) return alive[0].name;
    // DQ-ish plural
    return `${alive[0].name}たち`;
  },
  renderEnemies(){
    ui.dqEnemies.innerHTML = "";
    this.enemies.forEach((e, idx)=>{
      const s = document.createElement("div");
      s.className = "slime" + (e.hp<=0 ? " is-dead" : "");
      s.dataset.idx = String(idx);

      const elEyeL = document.createElement("div"); elEyeL.className = "eye l";
      const elEyeR = document.createElement("div"); elEyeR.className = "eye r";
      const mouth = document.createElement("div"); mouth.className = "mouth";
      s.appendChild(elEyeL); s.appendChild(elEyeR); s.appendChild(mouth);

      if(e.hp>0){
        s.addEventListener("click", ()=>{
          if(this.phase!=="target" || this.lock) return;
          this.chooseTarget(idx);
        });
      }
      ui.dqEnemies.appendChild(s);
    });
  },
  renderStatus(){
    const r = getRpg();
    const party = partyPower();
    const alive = this.enemies.filter(e=>e.hp>0).length;
    ui.dqStatus.innerHTML =
      `Lv ${r.lv}  HP ${Math.max(0,Math.round(r.hp))}/${Math.round(r.hpMax)}  MP ${Math.max(0,Math.round(r.mp))}/${Math.round(r.mpMax)}\n` +
      `PT: ${party.n}枚  ATK ${Math.round(party.atk)}  DEF ${Math.round(party.def)}\n` +
      `敵: ${alive}体`;
  },
  setMsg(text){
    ui.dqMsg.textContent = text;
  },
  setMenu(btns){
    ui.dqMenu.innerHTML = "";
    btns.forEach(b=>{
      const btn = document.createElement("button");
      btn.className = "dqBtn";
      btn.textContent = b.label;
      btn.disabled = !!b.disabled;
      btn.addEventListener("click", b.on);
      ui.dqMenu.appendChild(btn);
    });
  },
  renderCmdMenu(){
    this.phase = "cmd";
    this.cmd = null;
    this.setMenu([
      { label:"たたかう", on: ()=>this.chooseCmd("attack") },
      { label:"ぼうぎょ", on: ()=>this.chooseCmd("guard") },
      { label:"ひっさつ (MP10)", disabled: getRpg().mp < 10, on: ()=>this.chooseCmd("burst") },
      { label:"にげる", on: ()=>this.chooseCmd("run") },
    ]);
  },
  renderTargetMenu(){
    this.phase = "target";
    const targets = this.enemies.map((e,i)=>({
      label: e.hp>0 ? `${e.name} ${Math.max(0,Math.round(e.hp))}HP` : `${e.name} (×)`,
      disabled: e.hp<=0,
      on: ()=>this.chooseTarget(i),
    })).slice(0,4);
    // If less than 4, pad with blanks to keep grid stable
    while(targets.length<4) targets.push({label:"—", disabled:true, on:()=>{}});
    this.setMenu(targets);
    this.setMsg("だれを こうげき？（敵をタップでもOK）");
  },
  chooseCmd(cmd){
    if(this.lock) return;
    this.cmd = cmd;

    if(cmd==="attack" || cmd==="burst"){
      this.renderTargetMenu();
      return;
    }

    if(cmd==="guard"){
      this.playerTurn({type:"guard", target:null});
      return;
    }

    if(cmd==="run"){
      this.playerTurn({type:"run", target:null});
      return;
    }
  },
  chooseTarget(i){
    if(this.lock) return;
    const target = this.enemies[i];
    if(!target || target.hp<=0) return;
    this.playerTurn({type:this.cmd, targetIndex:i});
  },
  async playerTurn(action){
    if(this.lock) return;
    this.lock = true;

    const r = getRpg();
    const party = partyPower();
    const enemies = this.enemies;

    // Guard
    if(action.type==="guard"){
      rpgBattle.guard = true;
      playSfx("click");
      this.setMsg("みかたは みをまもっている！");
      rpgLog("RPG: 防御態勢（DQ）", "warn");
      saveState(); rpgSyncUI();
      await rpgWait(520);
      await this.enemyTurn();
      this.lock = false;
      this.renderStatus();
      this.renderCmdMenu();
      return;
    }

    // Run
    if(action.type==="run"){
      const ok = Math.random() < 0.55;
      this.setMsg(ok ? "うまく にげきれた！" : "まわりこまれて しまった！");
      rpgLog(ok ? "RPG: 逃走成功" : "RPG: 逃走失敗", ok?"good":"bad");
      await rpgWait(700);
      if(ok){
        this.lock = false;
        this.close();
        this.onFinish?.({ result:"run" });
        return;
      }
      await this.enemyTurn();
      this.lock = false;
      this.renderStatus();
      this.renderCmdMenu();
      return;
    }

    // Attack / Burst
    const t = enemies[action.targetIndex];
    if(!t || t.hp<=0){
      this.lock = false;
      this.renderCmdMenu();
      return;
    }

    let dmg = 0;

    if(action.type==="burst"){
      if(r.mp < 10){
        toast("MPが足りない");
        this.lock = false;
        this.renderCmdMenu();
        return;
      }
      r.mp -= 10;
      dmg = Math.max(1, Math.round(party.atk*0.10 - t.def*0.04 + (Math.random()*50 - 10)));
      playSfx("open");
      this.setMsg(`ひっさつ！ ${t.name} に ${dmg} のダメージ！`);
    }else{
      dmg = Math.max(1, Math.round(party.atk*0.08 - t.def*0.04 + (Math.random()*22 - 7)));
      playSfx("flip");
      this.setMsg(`${t.name} に こうげき！ ${dmg} のダメージ！`);
    }

    t.hp -= dmg;
    if(t.hp <= 0){
      t.hp = 0;
      await rpgWait(620);
      this.setMsg(`${t.name} を たおした！`);
      playSfx("claim");
    }

    saveState();
    rpgSyncUI();
    this.renderEnemies();
    this.renderStatus();

    // Victory?
    if(enemies.every(e=>e.hp<=0)){
      await rpgWait(680);
      this.lock = false;
      this.close();
      this.onFinish?.({ result:"win" });
      return;
    }

    await rpgWait(620);
    await this.enemyTurn();

    // Defeat?
    if(getRpg().hp <= 0){
      await rpgWait(650);
      this.lock = false;
      this.close();
      this.onFinish?.({ result:"lose" });
      return;
    }

    this.lock = false;
    this.renderStatus();
    this.renderCmdMenu();
  },
  async enemyTurn(){
    const r = getRpg();
    const party = partyPower();
    const guardMult = rpgBattle.guard ? 0.55 : 1.0;
    rpgBattle.guard = false;

    const alive = this.enemies.filter(e=>e.hp>0);
    if(alive.length===0) return;

    // one random enemy attacks (DQ-ish simple)
    const attacker = alive[Math.floor(Math.random()*alive.length)];
    const edmg = Math.max(1, Math.round((attacker.atk*0.32 - party.def*0.03) * guardMult + (Math.random()*18 - 6)));
    r.hp -= edmg;
    playSfx("flip");
    this.setMsg(`${attacker.name} の こうげき！ ${edmg} のダメージ！`);
    rpgLog(`RPG: 敵攻撃 ${attacker.name} → ${edmg}`, "bad");

    saveState();
    rpgSyncUI();
    this.renderStatus();
    await rpgWait(720);
  }
};

const RPG_SHARD_MAX = 7;

/** Map nodes (chapter gates) */
const RPG_NODES = [
  // Chapter 1: Foil Cult
  { id:"TOWN",       chapter:1, name:"アーカイブ港",       desc:"出航の街。屋台がうまい。", kind:"safe" },
  { id:"ALLEY",      chapter:1, name:"リンク路地",         desc:"裏道。だいたい変な奴がいる。", kind:"enc"  },
  { id:"FOIL_HALL",  chapter:1, name:"白紙礼拝堂",         desc:"アルミホイル帽が光る。嫌な予感。", kind:"boss" },

  // Chapter 2: Dream Parade
  { id:"DREAM_GATE", chapter:2, name:"夢迷宮ゲート",       desc:"入口からもう色がやばい。", kind:"enc"  },
  { id:"PARADE",     chapter:2, name:"情報パレード通り",   desc:"巨大カエルが哲学してる。", kind:"enc"  },
  { id:"POPUP_SKY",  chapter:2, name:"ポップアップ空域",   desc:"広告が物理で落ちてくる。", kind:"enc"  },
  { id:"BUG_QUEEN",  chapter:2, name:"集合的無意識のバグ", desc:"意味が溶ける。ボス。", kind:"boss" },

  // Chapter 3: Index Tower
  { id:"TOWER_F",    chapter:3, name:"索引塔・下層",       desc:"目次が迷路になっている。", kind:"enc"  },
  { id:"SYSOP",      chapter:3, name:"管理者アリーナ",     desc:"保護/凍結/差し戻しの嵐。", kind:"boss" },
];

function getRpg(){
  state.rpg ||= {};
  const r = state.rpg;

  r.lv ??= 1;
  r.exp ??= 0;
  r.expNext ??= 100;

  r.hpMax ??= 100;
  r.hp ??= r.hpMax;

  r.mpMax ??= 30;
  r.mp ??= r.mpMax;

  r.gold ??= 0;

  r.chapter ??= 1;
  r.shard ??= 0;

  r.here ??= "TOWN";
  r.loc ??= "街：アーカイブ港";

  r.flags ??= {};
  r.stats ??= { wins:0, losses:0, boss:0 };

  r.unlocked ??= {};
  return r;
}

function rpgAvailableNodes(){
  const r = getRpg();
  const list = RPG_NODES.filter(n => n.chapter <= r.chapter);

  for(const n of list){
    if(!(n.id in r.unlocked)) r.unlocked[n.id] = true;
  }

  // Boss locks until story says so
  if(!r.flags.c1_ready) r.unlocked.FOIL_HALL = false;
  if(!r.flags.c2_ready) r.unlocked.BUG_QUEEN = false;
  if(!r.flags.c3_ready) r.unlocked.SYSOP = false;

  return list;
}

function rpgSyncUI(){
  const r = getRpg();
  ui.plLv.textContent = String(r.lv);
  ui.plExp.textContent = String(r.exp);
  ui.plExpNext.textContent = String(r.expNext);
  ui.plChapter.textContent = String(r.chapter);
  ui.plShard.textContent = String(r.shard);

  ui.plHp.textContent = String(Math.max(0, Math.round(r.hp)));
  ui.plHpMax.textContent = String(Math.round(r.hpMax));
  ui.plMp.textContent = String(Math.max(0, Math.round(r.mp)));
  ui.plMpMax.textContent = String(Math.round(r.mpMax));

  ui.plGold.textContent = String(r.gold);
  ui.plLoc.textContent = r.loc;

  const ids = (state.deck || []).filter(Boolean);
  if(ids.length === 0){
    ui.rpgPartyList.textContent = "未選択（図鑑から右クリック/長押しでデッキに追加）";
  }else{
    const names = ids.map(id => state.collection[id]?.card?.title || "???");
    ui.rpgPartyList.textContent = names.join(" / ");
  }
}

function rpgLog(line, cls=""){
  const div = document.createElement("div");
  div.className = "line";
  if(cls) div.classList.add(cls);
  div.textContent = line;
  ui.rpgLog.prepend(div);
}

function rpgSetText(text, choices=null){
  ui.rpgText.textContent = text;
  if(!choices){
    ui.rpgCmd.hidden = true;
    return;
  }
  ui.rpgCmd.hidden = false;
  const [c1,c2,c3] = choices;
  ui.rpgCmd1.textContent = c1?.label || "—";
  ui.rpgCmd2.textContent = c2?.label || "—";
  ui.rpgCmd3.textContent = c3?.label || "—";
  ui.rpgCmd1.onclick = c1?.on || null;
  ui.rpgCmd2.onclick = c2?.on || null;
  ui.rpgCmd3.onclick = c3?.on || null;
}

function rpgRenderMap(){
  const r = getRpg();
  const nodes = rpgAvailableNodes();
  ui.rpgMapGrid.innerHTML = "";

  for(const n of nodes){
    const unlocked = !!r.unlocked[n.id];
    const div = document.createElement("div");
    div.className = "mapNode" + (n.id===r.here ? " is-here" : "") + (!unlocked ? " is-locked" : "") + (n.kind==="boss" ? " is-boss" : "");
    div.innerHTML = `<div class="n">${n.name}</div><div class="d">${n.desc}</div>`;
    if(unlocked){
      div.addEventListener("click", ()=> rpgMove(n.id));
    }
    ui.rpgMapGrid.appendChild(div);
  }
}

function rpgMove(id){
  const r = getRpg();
  if(rpgBusy) return;

  r.here = id;
  const node = RPG_NODES.find(x => x.id===id);
  r.loc = node ? (node.kind==="safe" ? `街：${node.name}` : `フィールド：${node.name}`) : r.loc;
  saveState();
  rpgSyncUI();
  rpgRenderMap();
  playSfx("click");

  const arrive = [
    `${node.name} に到着。${node.desc}`,
    `${node.name}：${node.desc}（戻るなら今のうち）`,
    `${node.name} に足を踏み入れた。空気が…変。`,
  ];
  rpgSetText(arrive[Math.floor(Math.random()*arrive.length)]);
  rpgLog(`到着: ${node.name}`, node.kind==="safe" ? "good" : (node.kind==="boss" ? "bad" : "warn"));

  rpgCheckBossGates();
}

function partyPower(){
  const ids = (state.deck || []).filter(Boolean);
  const cards = ids.map(id => state.collection[id]?.card).filter(Boolean);
  const atk = cards.reduce((s,c)=>s+c.stats.atk,0);
  const def = cards.reduce((s,c)=>s+c.stats.def,0);
  const hp  = cards.reduce((s,c)=>s+c.stats.hp,0);
  const rarityScore = cards.reduce((s,c)=> s + (RARITY_ORDER.indexOf(c.rarity)+1), 0);
  return { atk, def, hp, rarityScore, n: cards.length, cards };
}

function rpgGain(exp, gold, shard=0){
  const r = getRpg();
  r.exp += exp;
  r.gold += gold;
  if(shard){
    r.shard = Math.min(RPG_SHARD_MAX, (r.shard||0) + shard);
  }

  while(r.exp >= r.expNext){
    r.exp -= r.expNext;
    r.lv += 1;
    r.expNext = Math.round(r.expNext * 1.22 + 30);
    r.hpMax += 18;
    r.mpMax += 6;
    r.hp = r.hpMax;
    r.mp = r.mpMax;
    rpgLog(`レベルアップ！ Lv${r.lv}（全回復）`, "good");
    playSfx("claim");
  }

  saveState();
  rpgSyncUI();
  rpgCheckBossGates();
}

function rpgCheckBossGates(){
  const r = getRpg();
  const w = r.stats?.wins || 0;

  if(r.chapter===1 && !r.flags.c1_ready && w >= 3){
    r.flags.c1_ready = true;
    r.unlocked.FOIL_HALL = true;
    rpgLog("白紙礼拝堂への道が開いた…（ボス解放）", "warn");
    saveState();
    rpgRenderMap();
  }
  if(r.chapter===2 && !r.flags.c2_ready && w >= 8){
    r.flags.c2_ready = true;
    r.unlocked.BUG_QUEEN = true;
    rpgLog("“意味の奥”へ降りる穴が現れた…（ボス解放）", "warn");
    saveState();
    rpgRenderMap();
  }
  if(r.chapter===3 && !r.flags.c3_ready && w >= 14){
    r.flags.c3_ready = true;
    r.unlocked.SYSOP = true;
    rpgLog("管理者アリーナが起動した…（ボス解放）", "warn");
    saveState();
    rpgRenderMap();
  }
}

function rpgCamp(){
  const r = getRpg();
  if(rpgBusy) return;
  r.hp = r.hpMax;
  r.mp = r.mpMax;
  saveState();
  rpgSyncUI();
  rpgLog("キャンプ：HP/MP回復（焚き火…というか冷却ファン）", "good");
  toast("回復しました");
  playSfx("claim");
}

/** Skill check */
function rpgSkillCheck(tag, stat, diff, onWin, onLose){
  const r = getRpg();
  const power = Math.sqrt(Math.max(1, stat)) * 25;
  const roll = power + (Math.random()*220 - 80) + r.lv*22;
  const ok = roll >= diff;

  rpgLog(`[判定:${tag}] roll=${Math.round(roll)} / diff=${diff} → ${ok?"成功":"失敗"}`, ok?"good":"bad");
  if(ok) onWin?.(); else onLose?.();

  saveState();
  rpgSyncUI();
  rpgCheckBossGates();
  rpgBusy = false;
}

function makeEnemyPack(kind, chapter, party, count){
  const c = Math.max(1, Math.min(3, count||1));
  const enemies = [];
  for(let i=0;i<c;i++){
    const e = makeEnemy(kind, chapter, party);
    e.name = (c>1) ? `${e.name}${i+1}` : e.name;
    enemies.push(e);
  }
  return enemies;
}

function makeEnemy(kind, chapter, party){
  const base = 0.85 + chapter*0.18 + (party.rarityScore/18)*0.08;
  const hp = Math.round((party.hp*0.11 + 320) * base);
  const atk = Math.round((party.atk*0.10 + 140) * base);
  const def = Math.round((party.def*0.08 + 110) * base);
  const nameMap = { FOIL_FAN:"ホイル信徒", FROG:"哲学カエル", INDEX_EEL:"索引ウナギ" };
  return { kind, name: nameMap[kind] || "欠損の影", hp, atk, def };
}

/** Events */
function rpgEventFor(nodeId){
  const r = getRpg();
  const party = partyPower();
  const ch = r.chapter;

  const poolCommon = [
    {
      w: 16,
      title:"箱：なぜかある宝箱",
      text:"木箱を開けた。中身は…紙？いや、カードの『切れ端』だ。",
      choices: [
        { label:"拾う", run: ()=> rpgGain(8 + ch*2, 12 + ch*4, Math.random()<0.15?1:0) },
        { label:"罠かも", run: ()=> { r.hp = Math.max(1, r.hp - (6+ch*2)); rpgLog("少しダメージを受けた…（疑いすぎ）","bad"); saveState(); rpgSyncUI(); rpgBusy=false; } },
        { label:"ポーズを決めて去る", run: ()=> { rpgGain(3, 0, 0); rpgBusy=false; } },
      ],
    },
  ];

  const c1 = [
    {
      w: 22,
      title:"白紙教団の勧誘",
      text:"アルミホイル帽の集団が手を振ってくる。「空白は救い。君も軽くなろう」",
      choices: [
        { label:"話を聞く", run: ()=> rpgSkillCheck("TALK", party.def, 420, ()=>{ rpgLog("詭弁の穴を突いた。相手は黙った。","good"); rpgGain(14, 18, Math.random()<0.20?1:0); }, ()=>{ rpgLog("危うく帽子を被せられた！","bad"); r.hp=Math.max(1,r.hp-12); saveState(); rpgSyncUI(); }) },
        { label:"戦う", run: ()=> rpgStartCombat(makeEnemyPack("FOIL_FAN", ch, party, 3), {winExp:16, winGold:22, shardChance:0.18}) },
        { label:"全力で走る", run: ()=> { rpgLog("全力で走った。なぜか勝った気分。","warn"); rpgGain(6, 6, 0); rpgBusy=false; } },
      ],
    },
    {
      w: 16,
      title:"Null参照の穴",
      text:"景色の一部が突然ノイズ化して“そこ”が認識できない。足を踏み外すとヤバい。",
      choices: [
        { label:"慎重に迂回", run: ()=> { rpgLog("慎重に迂回した。偉い。","good"); rpgGain(10, 10, 0); rpgBusy=false; } },
        { label:"ジャンプ（ATKで）", run: ()=> rpgSkillCheck("JUMP", party.atk, 520, ()=>{ rpgLog("跳べた。概念が勝った。","good"); rpgGain(14, 14, Math.random()<0.12?1:0); }, ()=>{ rpgLog("落ちた。世界が一瞬バグった。","bad"); r.hp=Math.max(1,r.hp-18); saveState(); rpgSyncUI(); }) },
        { label:"石を投げて確認", run: ()=> { rpgLog("石が消えた。嫌な情報だけ得た。","warn"); rpgGain(6, 0, 0); rpgBusy=false; } },
      ],
    },
  ];

  const c2 = [
    {
      w: 20,
      title:"哲学カエルの行進",
      text:"巨大カエルが行進しながら叫ぶ。「我思う、故に…広告！」いや違う。",
      choices: [
        { label:"一緒に行進", run: ()=> { rpgLog("行進した。なぜかEXPが入った。","good"); rpgGain(18, 10, Math.random()<0.15?1:0); rpgBusy=false; } },
        { label:"論破する", run: ()=> rpgSkillCheck("DEBATE", party.def, 620, ()=>{ rpgLog("カエルは満足して去った。","good"); rpgGain(20, 18, 0); }, ()=>{ rpgLog("カエルの声が脳に刺さる。","bad"); r.mp=Math.max(0,r.mp-8); saveState(); rpgSyncUI(); }) },
        { label:"戦う", run: ()=> rpgStartCombat(makeEnemyPack("FROG", ch, party, 2), {winExp:22, winGold:24, shardChance:0.20}) },
      ],
    },
    {
      w: 22,
      title:"広告の雨",
      text:"空から“閉じるボタン”付きの広告が降ってくる。閉じた数だけ進めるらしい。",
      choices: [
        { label:"閉じまくる（DEF）", run: ()=> rpgSkillCheck("CLOSE", party.def, 700, ()=>{ rpgLog("閉じた。世界が静かになった。","good"); rpgGain(24, 26, Math.random()<0.18?1:0); }, ()=>{ rpgLog("閉じる前にクリックしてしまった…","bad"); r.hp=Math.max(1,r.hp-16); saveState(); rpgSyncUI(); }) },
        { label:"突っ切る", run: ()=> { rpgLog("突っ切った。広告に殴られた。","bad"); r.hp=Math.max(1,r.hp-20); saveState(); rpgSyncUI(); rpgGain(12, 10, 0); rpgBusy=false; } },
        { label:"必殺で焼く（MP10）", run: ()=> { if(r.mp<10){ toast("MPが足りない"); rpgBusy=false; return; } r.mp-=10; saveState(); rpgSyncUI(); rpgLog("焼いた。広告が蒸発した。","good"); rpgGain(18, 18, 0); rpgBusy=false; } },
      ],
    },
  ];

  const c3 = [
    {
      w: 20,
      title:"目次迷路",
      text:"目次が無限に分岐している。『戻る』が『戻らない』に改竄されている。",
      choices: [
        { label:"索引で突破（DEF）", run: ()=> rpgSkillCheck("INDEX", party.def, 820, ()=>{ rpgLog("索引が刺さった。出口が出た。","good"); rpgGain(28, 30, Math.random()<0.18?1:0); }, ()=>{ rpgLog("迷った。迷いすぎた。","bad"); r.mp=Math.max(0,r.mp-10); saveState(); rpgSyncUI(); }) },
        { label:"力で突破（ATK）", run: ()=> rpgSkillCheck("SMASH", party.atk, 860, ()=>{ rpgLog("壁が…目次だった。壊した。","good"); rpgGain(26, 24, 0); rpgBusy=false; }, ()=>{ rpgLog("目次に跳ね返された。","bad"); r.hp=Math.max(1,r.hp-18); saveState(); rpgSyncUI(); }) },
        { label:"戦う", run: ()=> rpgStartCombat(makeEnemyPack("INDEX_EEL", ch, party, 2), {winExp:30, winGold:32, shardChance:0.22}) },
      ],
    },
  ];

  let pool = [...poolCommon];
  if(ch===1) pool = pool.concat(c1);
  if(ch===2) pool = pool.concat(c2);
  if(ch>=3) pool = pool.concat(c3);

  const sum = pool.reduce((s,e)=>s+(e.w||1),0);
  let rr = Math.random()*sum;
  for(const e of pool){ rr -= (e.w||1); if(rr<=0) return e; }
  return pool[pool.length-1];
}

/** Combat */

function rpgStartCombat(enemyOrEnemies, reward){
  const r = getRpg();
  const party = partyPower();

  const list = Array.isArray(enemyOrEnemies) ? enemyOrEnemies : [enemyOrEnemies];

  // normalize + name (DQ style)
  const enemies = list.map((e, i)=>({
    name: e.name || `スライム${i+1}`,
    hp: Math.max(1, Math.round(e.hp || 80)),
    atk: Math.max(1, Math.round(e.atk || 60)),
    def: Math.max(1, Math.round(e.def || 40)),
  }));

  rpgBattle = { enemies, party, guard:false, turn:1, reward };
  rpgBusy = true;

  dq.open(enemies, async ({result})=>{
    if(result==="run"){
      rpgBusy = false;
      rpgBattle = null;
      rpgSetText("うまく逃げた。…今のうちに装備（デッキ）見直す？");
      return;
    }
    if(result==="win"){
      // rewards
      const rew = reward || {winExp:18, winGold:14, shardChance:0.12};
      const shard = (Math.random() < (rew.shardChance||0)) ? 1 : 0;

      rpgLog(`勝利！（DQ）`, "good");
      rpgGain(rew.winExp||18, rew.winGold||14, shard);

      r.stats.wins = (r.stats.wins||0) + 1;
      saveState();

      const hereNode = RPG_NODES.find(n=>n.id===r.here);
      if(hereNode?.kind==="boss"){
        r.stats.boss = (r.stats.boss||0)+1;
        await rpgBossClear(r.here);
      }

      rpgBusy = false;
      rpgBattle = null;
      rpgSetText(shard ? "勝利！ 欠片を拾った（+1）" : "勝利！ もう一戦いく？");
      return;
    }

    if(result==="lose"){
      r.stats.losses = (r.stats.losses||0)+1;
      rpgLog("敗北… 港へ搬送された（財布は無事）", "bad");
      r.hp = r.hpMax;
      r.mp = r.mpMax;
      r.here = "TOWN";
      r.loc = "街：アーカイブ港";

      saveState();
      rpgSyncUI();
      rpgRenderMap();

      rpgBusy = false;
      rpgBattle = null;
      rpgSetText("目が覚めた。港だ。…屋台の匂いで復活した。");
    }
  });
}

async function rpgCombatTurn(cmd){
  // v6: combat is handled by dq overlay
  return;
}
(){
  const r = getRpg();
  const e = rpgBattle.enemy;
  const reward = rpgBattle.reward || {winExp:18, winGold:14, shardChance:0.12};

  rpgLog(`勝利！ ${e.name} を撃破`, "good");

  const shard = (Math.random() < (reward.shardChance||0)) ? 1 : 0;
  rpgGain(reward.winExp||18, reward.winGold||14, shard);

  r.stats.wins = (r.stats.wins||0) + 1;
  saveState();

  const hereNode = RPG_NODES.find(n=>n.id===r.here);
  if(hereNode?.kind==="boss"){
    r.stats.boss = (r.stats.boss||0)+1;
    await rpgBossClear(r.here);
  }

  rpgBattle = null;
  rpgBusy = false;
  rpgSetText(shard ? `勝利！ 欠片を拾った（+1）` : `勝利！`);
}

function rpgCombatLose(){
  const r = getRpg();
  r.stats.losses = (r.stats.losses||0)+1;

  rpgLog("敗北… 港へ搬送された（財布は無事）", "bad");
  r.hp = r.hpMax;
  r.mp = r.mpMax;
  r.here = "TOWN";
  r.loc = "街：アーカイブ港";

  saveState();
  rpgSyncUI();
  rpgRenderMap();

  rpgBattle = null;
  rpgBusy = false;
  rpgSetText("目が覚めた。港だ。…なぜか屋台の匂いがして安心する。");
}

async function rpgBossClear(bossId){
  const r = getRpg();

  if(bossId==="FOIL_HALL"){
    rpgSetText("礼拝堂が静かになった。床に“署名の欠片”が転がっている。…誰の？");
    r.flags.c1_clear = true;
    r.shard = Math.min(RPG_SHARD_MAX, (r.shard||0) + 1);

    r.chapter = Math.max(r.chapter, 2);
    r.unlocked.DREAM_GATE = true;
    r.unlocked.PARADE = true;
    r.unlocked.POPUP_SKY = true;
    r.flags.c2_ready = false;

    rpgLog("第2章：夢迷宮が解放された！", "warn");
    playSfx("claim");
  }

  if(bossId==="BUG_QUEEN"){
    rpgSetText("意味の渦がほどけた。空に“索引塔”のシルエットが浮かぶ。");
    r.flags.c2_clear = true;
    r.shard = Math.min(RPG_SHARD_MAX, (r.shard||0) + 1);

    r.chapter = Math.max(r.chapter, 3);
    r.unlocked.TOWER_F = true;
    r.flags.c3_ready = false;

    rpgLog("第3章：索引塔が解放された！", "warn");
    playSfx("claim");
  }

  if(bossId==="SYSOP"){
    rpgSetText("管理者は倒れた…と思った瞬間、世界が巻き戻りそうになる。続きは次の実装で。");
    r.flags.c3_clear = true;
    r.shard = Math.min(RPG_SHARD_MAX, (r.shard||0) + 1);
    playSfx("claim");
  }

  saveState();
  rpgSyncUI();
  rpgRenderMap();
}

/** Quest entry point */
function rpgQuest(){
  const r = getRpg();
  if(rpgBusy) return;
  rpgBusy = true;

  const party = partyPower();
  if(party.n === 0){
    rpgSetText("パーティが空だ。図鑑からデッキに3枚入れてから出発しよう。");
    toast("パーティ（デッキ）が空です");
    rpgBusy = false;
    return;
  }

  const node = RPG_NODES.find(n=>n.id===r.here) || RPG_NODES[0];

  if(node.kind==="safe"){
    rpgSetText("港の屋台が今日もうまい。何をする？", [
      { label:"情報屋に話す", on: ()=>{ rpgLog("情報屋『礼拝堂？あそこは“空白の気配”が濃い』","warn"); r.flags.c1_ready = true; r.unlocked.FOIL_HALL = true; saveState(); rpgRenderMap(); rpgBusy=false; rpgSetText("礼拝堂の場所を聞いた（ボス解放）"); } },
      { label:"休む（無料）", on: ()=>{ rpgCamp(); rpgBusy=false; rpgSetText("休んだ。…無料って怖い。"); } },
      { label:"出発の準備", on: ()=>{ rpgBusy=false; rpgSetText("よし、行こう。マップから目的地を選べ。"); } },
    ]);
    playSfx("click");
    return;
  }

  if(node.kind==="boss"){
    const p = partyPower();
    if(r.here==="FOIL_HALL"){
      rpgLog("ボス：アルミホイルの教祖（概念：空白）", "bad");
      rpgStartCombat({name:"アルミホイル教祖", hp: Math.round((p.hp*0.16+620)*(1.08+r.lv*0.05)), atk: Math.round((p.atk*0.12+220)*(1.08+r.lv*0.05)), def: Math.round((p.def*0.10+180)*(1.08+r.lv*0.05))}, {winExp:42, winGold:50, shardChance:1.0});
      return;
    }
    if(r.here==="BUG_QUEEN"){
      rpgLog("ボス：集合的無意識のバグ（概念：不条理）", "bad");
      rpgStartCombat({name:"不条理バグ女王", hp: Math.round((p.hp*0.18+840)*(1.12+r.lv*0.05)), atk: Math.round((p.atk*0.13+260)*(1.12+r.lv*0.05)), def: Math.round((p.def*0.11+210)*(1.12+r.lv*0.05))}, {winExp:55, winGold:62, shardChance:1.0});
      return;
    }
    if(r.here==="SYSOP"){
      rpgLog("ボス：管理者（概念：保護/差し戻し）", "bad");
      rpgStartCombat({name:"管理者（Sysop）", hp: Math.round((p.hp*0.20+980)*(1.16+r.lv*0.05)), atk: Math.round((p.atk*0.14+300)*(1.16+r.lv*0.05)), def: Math.round((p.def*0.12+240)*(1.16+r.lv*0.05))}, {winExp:70, winGold:80, shardChance:1.0});
      return;
    }
  }

  const ev = rpgEventFor(r.here);
  rpgLog(`イベント: ${ev.title}`, "warn");
  rpgSetText(ev.text, ev.choices.map(c => ({
    label: c.label,
    on: ()=>{
      playSfx("click");
      c.run?.();
      if(!rpgBattle && rpgBusy) rpgBusy = false;
    }
  })));
}

/** Reset */
function rpgReset(){
  state.rpg = null;
  saveState();
  rpgLog("RPGデータを初期化しました", "warn");
  rpgInit();
  toast("RPGデータ初期化");
}

/** Init */
function rpgInit(){
  if(!ui.rpgMapGrid) return;
  const r = getRpg();

  // first-time intro (fun)
  if(!r.flags.intro){
    r.flags.intro = true;
    rpgSetText("港の掲示板に「自分の名前が黒塗りで読めない」って書いてある。いや、書いたの俺だ。…誰だよ俺。とりあえず外へ出よう。");
    rpgLog("冒険開始：まずは“自分”を取り戻せ", "good");
    saveState();
  }

  rpgSyncUI();
  rpgRenderMap();
  rpgCheckBossGates();

  ui.rpgStartBtn.onclick = ()=>{ playSfx("click"); rpgQuest(); };
  ui.rpgCampBtn.onclick  = ()=>{ playSfx("click"); rpgCamp(); };
  ui.rpgResetBtn.onclick = ()=>{ playSfx("click"); rpgReset(); };
}
