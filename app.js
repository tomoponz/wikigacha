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
    settings:{ sfxEnabled:true, sfxVolume:0.55, sortKey:"rarity", favOnly:false }
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
    return st;
  }catch{ return defaultState(); }
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
function battle(){
  const ids=(state.deck||[]).filter(Boolean);
  if(ids.length<1){ toast("デッキが空です（最低1枚）"); return; }
  const team=ids.map(id=>state.collection[id]?.card).filter(Boolean);
  if(team.length<1){ toast("デッキ情報が不正です。選び直してください"); return; }
  const sumAtk=team.reduce((s,c)=>s+c.stats.atk,0);
  const sumDef=team.reduce((s,c)=>s+c.stats.def,0);
  const sumHp=team.reduce((s,c)=>s+c.stats.hp,0);
  const enemy={name:"UNKNOWN ENTITY", hp:Math.round(sumHp*0.75+Math.random()*sumHp*0.55), atk:Math.round(sumAtk*0.45+Math.random()*sumAtk*0.35), def:Math.round(sumDef*0.40+Math.random()*sumDef*0.35)};
  writeLog("==== BATTLE START ====","warn");
  writeLog(`敵: ${enemy.name} / HP ${enemy.hp} / ATK ${enemy.atk} / DEF ${enemy.def}`);
  let eHp=enemy.hp, tHp=sumHp;
  for(let turn=1;turn<=12;turn++){
    if(eHp<=0||tHp<=0) break;
    const hitter=team[Math.floor(Math.random()*team.length)];
    const dmg=Math.max(1,Math.round(hitter.stats.atk-enemy.def*0.35+(Math.random()*12-4)));
    eHp-=dmg; writeLog(`T${turn}: 味方(${shortTitle(hitter.title)}) → ${dmg} dmg / 敵HP ${Math.max(0,eHp)}`,"good");
    if(eHp<=0) break;
    const target=team[Math.floor(Math.random()*team.length)];
    const edmg=Math.max(1,Math.round(enemy.atk-target.stats.def*0.35+(Math.random()*12-4)));
    tHp-=edmg; writeLog(`T${turn}: 敵 → ${edmg} dmg / 味方HP ${Math.max(0,tHp)}`,"bad");
  }
  if(eHp<=0){ writeLog("勝利！ +1 パック（デモ報酬）","good"); state.packs+=1; }
  else if(tHp<=0){ writeLog("敗北…（報酬なし）","bad"); }
  else { writeLog("時間切れ… 引き分け（報酬なし）","warn"); }
  saveState(); packsUI();
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
  ui.battleBtn.addEventListener("click",()=>{ playSfx("click"); battle(); });

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
hydrateControls();
startTimers();
render();
