'use strict';

const APP_VERSION='2.7.0';

// The main playlists, always shown first and in this order. All other public
// playlists of the channel are added behind them automatically (newest first).
const PLAYLISTS = {
  'All': 'PLrIIvPdks_sFn2nPjFm_nCTdAYuC7Z2SJ',
  'Bachata': 'PLrIIvPdks_sHnjrKxo9AyXzQThQFQb4fg',
  'Merengue': 'PLrIIvPdks_sHfOHEPyeO85eLAnro2g_Wv',
  'Salsa': 'PLrIIvPdks_sGtYNQcxPbsCxeyO9KuNWHy',
  'Reggaetón': 'PLrIIvPdks_sFLTemRJ-MHS-k-2egExpwv',
  'Ballads': 'PLrIIvPdks_sET8awM4mOlB2o9jHtAIvxP',
  'Mixtape': 'PLrIIvPdks_sEDekjQX9uG8TGbPbDF4mTe'
};

const linkGroups={
  music:[
    // Main platform: shown first as a full-width tile.
    ['YouTube','https://www.youtube.com/@migflow','youtube.svg'],
    ['Spotify','https://open.spotify.com/artist/1ZumwPc08JV7exhNFM63EX','spotify.svg'],
    ['Apple Music','https://music.apple.com/de/artist/don-miguel-de-cabarete/1819273199','applemusic.svg'],
    ['Amazon Music','https://music.amazon.com/artists/B0FBLTZGWF/don-miguel-de-cabarete','amazonmusic.svg'],
    ['YouTube Music','https://music.youtube.com/@migflow','youtubemusic.svg'],
    ['laut.fm','https://laut.fm/don-miguel','laut.svg'],
    ['SoundCloud','https://soundcloud.com/loopweb']
  ],
  official:[
    ['Homepage','https://donmiguel.nicepage.io/','Official website','homepage.svg'],
    ['UnitedMasters','https://unitedmasters.com/migflow','Official profile','unitedmasters.svg']
  ],
  social:[
    ['WhatsApp','https://whatsapp.com/channel/0029VbD5cCuGU3BDfJk12M35','whatsapp.svg'],
    ['Instagram','https://www.instagram.com/don_miguel_de_cabarete/','instagram.svg'],
    ['TikTok','https://www.tiktok.com/@loopweb','tiktok.svg'],
    ['Facebook','https://www.facebook.com/donmiguel.music/','facebook.svg'],
    ['X / Twitter','https://x.com/loopweb','x.svg'],
    ['Onplug','https://onplug.net/pages/migflow','onplug.svg'],
    ['Telegram','https://t.me/CabareteVibes'],
    ['Email','mailto:donmiguel@vodafonemail.de']
  ]
};

const genres=Object.keys(PLAYLISTS);
// Shown under "Genres" in the playlist overview; everything else (Mixtape
// first, then the other public playlists) goes under "More playlists".
const GENRE_LABELS=['Bachata','Merengue','Salsa','Reggaetón','Ballads'];
const playlistMeta=new Map(); // playlist id -> {thumbnail,itemCount}

// Button name from the YouTube playlist title, without a leading artist name.
function playlistLabel(title){
  const raw=String(title||'').trim();
  const short=raw.replace(/^don\s+miguel(\s+de\s+cabarete)?\s*[-–—|:·]*\s*/i,'').trim();
  return short||raw;
}

// Adds the channel's other public playlists to the overview and keeps the
// pictures and track counts of all of them.
async function loadMorePlaylists(){
  try{
    const lists=await fetch('/api/youtube/playlists').then(check);
    for(const p of Array.isArray(lists)?lists:[])if(p?.id)playlistMeta.set(p.id,{thumbnail:p.thumbnail||'',itemCount:Number(p.itemCount)||0});
    const known=new Set(Object.values(PLAYLISTS));
    const extra=(Array.isArray(lists)?lists:[])
      .filter(p=>p?.id&&!known.has(p.id)&&Number(p.itemCount)>0)
      .sort((a,b)=>new Date(b.publishedAt||0)-new Date(a.publishedAt||0));
    for(const p of extra){
      let label=playlistLabel(p.title);
      for(let n=2;PLAYLISTS[label];n++)label=`${playlistLabel(p.title)} (${n})`;
      PLAYLISTS[label]=p.id;
      genres.push(label);
    }
    renderGenres();
  }catch{
    // Not critical: the main playlists keep working.
  }
}

// All uploads of the channel, used by the search. Loaded once, on first search.
let uploadsPromise=null;
function loadUploads(){
  if(!uploadsPromise){
    uploadsPromise=fetch('/api/youtube/videos').then(check).then(list=>{
      state.uploads=unique(Array.isArray(list)?list:[]);
      if(state.query.trim())applyFilters();
    }).catch(()=>{uploadsPromise=null;});
  }
  return uploadsPromise;
}

const state={
  videos:[],
  filtered:[],
  playlistCache:new Map(),
  uploads:[],
  selectedId:null,
  genre:'All',
  query:'',
  player:null,
  playerReady:false,
  playerInitStarted:false,
  playing:false,
  shuffle:false,
  repeat:false,
  latestVideo:null,
  loadingGenre:false,
  pendingPlay:false,
  pendingVideoId:null,
  subscriberCount:0,
  view:'home',
  commentsFor:null,
  seeking:false
};

const $=s=>document.querySelector(s);
const els={
  preloader:$('#appPreloader'),preloaderText:$('#preloaderText'),app:$('#app'),content:$('#content'),
  videoFrame:$('#videoFrame'),
  seek:$('#seekBar'),timeCurrent:$('#timeCurrent'),timeTotal:$('#timeTotal'),
  nowTitle:$('#nowTitle'),
  play:$('#playPauseButton'),prev:$('#previousButton'),next:$('#nextButton'),
  shuffle:$('#shuffleButton'),repeat:$('#repeatButton'),
  commentsButton:$('#commentsButton'),commentBadge:$('#commentBadge'),
  sheet:$('#commentsSheet'),sheetHead:$('#commentsSheetHead'),comments:$('#comments'),
  commentCount:$('#commentCount'),closeComments:$('#closeComments'),
  poster:$('#heroPoster'),posterImage:$('#heroImage'),
  infoTitle:$('#infoTitle'),infoMeta:$('#infoMeta'),infoSubscriberCount:$('#infoSubscriberCount'),descriptionText:$('#descriptionText'),
  newsStatus:$('#newsStatus'),newsGrid:$('#newsGrid'),
  postSheet:$('#postSheet'),postSheetHead:$('#postSheetHead'),postDate:$('#postDate'),
  postImage:$('#postImage'),postText:$('#postText'),closePost:$('#closePost'),
  search:$('#searchInput'),libraryTools:$('#libraryTools'),searchToggle:$('#searchToggle'),filterToggle:$('#filterToggle'),playlistGrid:$('#playlistGrid'),libraryView:$('#view-library'),clearGenre:$('#clearGenre'),libraryHeading:$('#libraryHeading'),
  count:$('#trackCount'),status:$('#statusBox'),list:$('#trackList'),
  tabs:[...document.querySelectorAll('.tab[data-view]')],
  views:{
    home:$('#view-home'),
    library:$('#view-library'),
    info:$('#view-info'),
    more:$('#view-more')
  }
};

/* ---------- Small helpers ---------- */

function esc(v=''){return String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function unique(videos){const seen=new Set();return videos.filter(v=>{const key=(v.id||'').trim();if(!key||seen.has(key))return false;seen.add(key);return true;});}
function compact(n=0){return new Intl.NumberFormat('en-US',{notation:n>=10000?'compact':'standard',maximumFractionDigits:1}).format(n);}
function relativeDate(value){const d=new Date(value),days=Math.max(0,Math.floor((Date.now()-d.getTime())/86400000));if(days===0)return'today';if(days===1)return'1 day ago';if(days<7)return`${days} days ago`;if(days<31){const w=Math.floor(days/7);return`${w} week${w===1?'':'s'} ago`;}if(days<365){const m=Math.floor(days/30);return`${m} month${m===1?'':'s'} ago`;}const y=Math.floor(days/365);return`${y} year${y===1?'':'s'} ago`;}
function check(r){if(!r.ok)throw new Error('Could not load content from YouTube.');return r.json();}
function formatTime(seconds){
  const s=Math.max(0,Math.floor(Number(seconds)||0));
  const h=Math.floor(s/3600),m=Math.floor((s%3600)/60),sec=s%60;
  const ss=String(sec).padStart(2,'0');
  return h?`${h}:${String(m).padStart(2,'0')}:${ss}`:`${m}:${ss}`;
}
function displayTitle(title){
  return String(title||'')
    .replace(/\s*[–—-]\s*Don Miguel de Cabarete(?:\s*[|–—-]\s*.*)?$/i,'')
    .trim();
}
function formatSubscribers(value){
  const n=Number(value)||0;
  if(n>=1000000)return `${(n/1000000).toFixed(n>=10000000?0:1).replace('.0','')}M`;
  if(n>=1000)return `${(n/1000).toFixed(n>=100000?0:1).replace('.0','')}K`;
  return String(n);
}

/* ---------- Preloader: the logo fills with the real loading progress ----------
   Each finished loading step raises the water. While a step is still running
   (e.g. the server waking up) the water keeps creeping up slowly, so it never
   looks frozen. It never fills faster than ~2.6 s, so it always looks calm. */

const PRELOADER_STAGES={server:.3,data:.65,ready:.85,done:1};
const preloader={level:0,creep:0,shown:0,done:false};
const preloaderWater=document.querySelector('.preloader-water');
let preloaderClosed=false;
let preloaderLastFrame=performance.now();
function setPreloaderText(text){if(els.preloaderText)els.preloaderText.textContent=text;}
function markStage(name){
  const value=PRELOADER_STAGES[name]||0;
  if(value>preloader.level)preloader.level=value;
  if(preloader.creep<preloader.level)preloader.creep=preloader.level;
  if(name==='done')preloader.done=true;
}
function preloaderFrame(now){
  if(preloaderClosed)return;
  const dt=Math.min(.1,Math.max(0,(now-preloaderLastFrame)/1000));
  preloaderLastFrame=now;
  if(!preloader.done){
    const cap=Math.min(preloader.level+.17,.95);
    preloader.creep+=(cap-preloader.creep)*(1-Math.exp(-dt/5));
  }
  const target=preloader.done?1:Math.max(preloader.level,preloader.creep);
  preloader.shown=Math.min(target,preloader.shown+dt*.38);
  preloaderWater?.style.setProperty('--level',preloader.shown.toFixed(4));
  if(preloader.done&&preloader.shown>=1){
    window.setTimeout(closePreloader,250);
    return;
  }
  requestAnimationFrame(preloaderFrame);
}
requestAnimationFrame(preloaderFrame);
function closePreloader(){
  if(preloaderClosed)return;
  preloaderClosed=true;
  document.body.classList.remove('is-loading');
  els.app?.removeAttribute('aria-hidden');
  els.preloader?.classList.add('is-hidden');
  window.setTimeout(()=>els.preloader?.remove(),400);
}
// Never keep people waiting longer than this; the app shows its own loading states.
window.setTimeout(()=>markStage('done'),15000);
// If the page is in the background, animation frames pause: close right away instead.
document.addEventListener('visibilitychange',()=>{if(document.hidden&&preloader.done)closePreloader();});

let resolvePlayerReady;
const playerReadyPromise=new Promise(resolve=>{resolvePlayerReady=resolve;});
function imageLoaded(img){
  return new Promise(resolve=>{
    if(!img||img.hidden||!img.getAttribute('src')||img.complete)return resolve();
    img.addEventListener('load',resolve,{once:true});
    img.addEventListener('error',resolve,{once:true});
  });
}
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));

function wakeServer(){
  fetch('/health',{method:'GET',cache:'no-store',credentials:'same-origin'}).catch(()=>{});
}

/* ---------- Data ---------- */

async function fetchPlaylist(genre,force=false){
  if(!force&&state.playlistCache.has(genre))return state.playlistCache.get(genre);
  const playlistId=PLAYLISTS[genre];
  if(!playlistId)throw new Error(`No playlist configured for ${genre}.`);
  const suffix=force?`?_=${Date.now()}`:'';
  const videos=unique(await fetch(`/api/youtube/playlists/${encodeURIComponent(playlistId)}/videos${suffix}`,force?{cache:'no-store'}:undefined).then(check));
  state.playlistCache.set(genre,videos);
  return videos;
}

async function load(){
  setPreloaderText('Loading');
  loadNews();
  try{
    const status=await fetch('/api/status').then(check);
    markStage('server');
    if(!status.configured)throw new Error('YouTube API key is not configured.');
    const [allTracks,latest,channelInfo]=await Promise.all([
      fetchPlaylist('All'),
      fetch(`/api/youtube/latest?_=${Date.now()}`,{cache:'no-store'}).then(check),
      fetch(`/api/youtube/channel?_=${Date.now()}`,{cache:'no-store'}).then(check)
    ]);
    markStage('data');
    state.subscriberCount=Number(channelInfo?.subscriberCount)||0;
    state.videos=allTracks;
    state.latestVideo=latest||state.videos[0]||null;
    renderRelease();
    renderGenres();
    loadMorePlaylists();
    applyFilters();
    els.status.hidden=true;
    const first=state.latestVideo?.id||state.videos[0]?.id;
    if(first)selectTrack(first,false);
    // Last step: the release picture and the YouTube player are ready.
    const posterReady=imageLoaded(els.posterImage).then(()=>markStage('ready'));
    const playerReady=playerReadyPromise.then(()=>markStage('ready'));
    await Promise.race([Promise.all([posterReady,playerReady]),sleep(5000)]);
  }catch(e){
    els.status.textContent=e.message;
    els.status.hidden=false;
    els.poster.classList.remove('is-loading-card');
    els.nowTitle.textContent='Content unavailable';
  }finally{
    markStage('done');
  }
}

function findVideo(id){
  if(state.latestVideo?.id===id)return state.latestVideo;
  const current=state.videos.find(x=>x.id===id);
  if(current)return current;
  for(const list of state.playlistCache.values()){
    const found=list.find(x=>x.id===id);
    if(found)return found;
  }
  return state.uploads.find(x=>x.id===id)||null;
}

/* ---------- Views & tabs ---------- */

function setView(name){
  if(!els.views[name])return;
  state.view=name;
  for(const [key,section] of Object.entries(els.views))section.hidden=key!==name;
  els.tabs.forEach(tab=>{
    if(tab.dataset.view===name)tab.setAttribute('aria-current','page');
    else tab.removeAttribute('aria-current');
  });
  closeComments();
  closePost();
  els.content.scrollTop=0;
}
els.tabs.forEach(tab=>tab.addEventListener('click',()=>{
  if(tab.dataset.view===state.view){els.content.scrollTo({top:0,behavior:'smooth'});return;}
  setView(tab.dataset.view);
}));

/* ---------- Release poster on the stage ----------
   On start the stage shows the newest release as a large poster. As soon as
   anything starts playing the poster is removed for the rest of the session,
   so the YouTube player itself is never covered while it plays. */

let posterDismissed=false;

function renderRelease(){
  const v=state.latestVideo;
  if(!v||posterDismissed)return;
  // Image only: covers usually carry their own lettering.
  els.poster.classList.remove('is-loading-card');
  if(v.thumbnail){els.posterImage.src=v.thumbnail;els.posterImage.hidden=false;}
  els.poster.disabled=false;
  els.poster.setAttribute('aria-label',`Play new release: ${displayTitle(v.title)}`);
}

function dismissPoster(){
  if(posterDismissed)return;
  posterDismissed=true;
  els.poster.remove();
}

els.poster.addEventListener('click',()=>{
  if(!state.latestVideo)return;
  dismissPoster();
  selectTrack(state.latestVideo.id,true);
});

async function refreshLatestRelease(){
  try{
    const latest=await fetch(`/api/youtube/latest?_=${Date.now()}`,{cache:'no-store'}).then(check);
    if(!latest?.id||state.latestVideo?.id===latest.id)return;
    state.latestVideo=latest;
    renderRelease();
  }catch{/* keep what is shown */}
}

/* ---------- Info: the current track — title, release date, views, description ---------- */

function formatReleaseDate(value){
  const date=new Date(value);
  if(Number.isNaN(date.getTime()))return'';
  return date.toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'});
}

function renderInfo(video){
  els.infoTitle.textContent=displayTitle(video?.title)||'Don Miguel de Cabarete';
  const parts=[];
  const released=formatReleaseDate(video?.publishedAt);
  if(released)parts.push(`Released ${released}`);
  if(video?.viewCount)parts.push(`${compact(video.viewCount)} views`);
  if(video?.duration)parts.push(video.duration);
  els.infoMeta.textContent=parts.join(' · ');
  els.infoSubscriberCount.textContent=state.subscriberCount?formatSubscribers(state.subscriberCount):'';

  const text=String(video?.description||'').trim();
  if(text){
    renderLinkedText(els.descriptionText,text);
    els.descriptionText.classList.remove('muted');
  }else{
    els.descriptionText.textContent='No description for this track.';
    els.descriptionText.classList.add('muted');
  }
}

/* ---------- Library ---------- */

function playlistTile(label){
  const meta=playlistMeta.get(PLAYLISTS[label])||{};
  const count=meta.itemCount?`${meta.itemCount} ${meta.itemCount===1?'track':'tracks'}`:'';
  return `<li><button class="track playlist-tile${label===state.genre?' is-current':''}" type="button" data-genre="${esc(label)}"><span class="track-thumb">${meta.thumbnail?`<img src="${esc(meta.thumbnail)}" alt="" loading="lazy">`:''}</span><span class="track-copy"><strong>${esc(label)}</strong><small>${esc(count)}</small></span></button></li>`;
}
function renderGenres(){
  const genreTiles=GENRE_LABELS.filter(g=>PLAYLISTS[g]);
  const moreTiles=genres.filter(g=>g!=='All'&&!GENRE_LABELS.includes(g));
  els.playlistGrid.innerHTML=
    `<li class="grid-head">Genres</li>${genreTiles.map(playlistTile).join('')}`+
    (moreTiles.length?`<li class="grid-head">More playlists</li>${moreTiles.map(playlistTile).join('')}`:'');
  els.playlistGrid.querySelectorAll('[data-genre]').forEach(b=>b.onclick=()=>{setOverview(false);changeGenre(b.dataset.genre);});
  updateHeading();
}

// The filter swaps the track list for the playlist overview (and back).
function setOverview(open){
  els.libraryView.classList.toggle('is-overview',open);
  els.filterToggle.setAttribute('aria-expanded',open?'true':'false');
  els.filterToggle.setAttribute('aria-label',open?'Close playlists':'Show playlists');
  if(open){setSearchOpen(false);renderGenres();}
  // Start at the top of the overview or of the chosen playlist.
  const content=document.getElementById('content');
  if(content&&content.scrollTop>0)content.scrollTop=0;
}
els.clearGenre.addEventListener('click',()=>changeGenre('All'));

async function changeGenre(nextGenre){
  if(state.loadingGenre||nextGenre===state.genre)return;
  state.loadingGenre=true;
  state.genre=nextGenre;
  renderGenres();
  els.status.hidden=false;
  els.status.textContent=`Loading ${nextGenre} …`;
  try{
    state.videos=await fetchPlaylist(nextGenre);
    applyFilters();
    els.status.hidden=true;
  }catch(e){
    state.videos=[];
    applyFilters();
    els.status.textContent=e.message;
  }finally{
    state.loadingGenre=false;
  }
}

// While searching, the results come from the whole channel, not the chosen genre.
function updateHeading(){
  const searching=!!state.query.trim();
  els.libraryHeading.textContent=searching?'Search results':(state.genre==='All'?'All tracks':state.genre);
  // The ✕ next to a chosen playlist leads back to all tracks.
  els.clearGenre.hidden=searching||state.genre==='All';
}

function applyFilters(){
  updateHeading();
  const q=state.query.trim().toLocaleLowerCase('en');
  // Searching looks through everything: all uploads of the channel plus every
  // playlist loaded so far, not only the list that is shown.
  const pool=q?unique([...state.videos,...state.uploads,...[...state.playlistCache.values()].flat()]):state.videos;
  state.filtered=pool.filter(v=>!q||`${v.title} ${v.description}`.toLocaleLowerCase('en').includes(q));
  renderList();
}

function renderList(){
  els.count.textContent=`${state.filtered.length} ${state.filtered.length===1?'track':'tracks'}`;
  if(!state.filtered.length){
    const searching=state.query.trim()&&uploadsPromise&&!state.uploads.length;
    els.list.innerHTML=state.videos.length?`<li class="status-box">${searching?'Searching …':'No matching tracks found.'}</li>`:'';
    return;
  }
  // Two covers per row, like the news tiles. The title is always written
  // below the cover, because not every thumbnail carries the song name.
  els.list.innerHTML=state.filtered.map(v=>`<li><button class="track${v.id===state.selectedId?' is-current':''}" type="button" data-id="${esc(v.id)}"><span class="track-thumb"><img src="${esc(v.thumbnail)}" alt="" loading="lazy">${v.duration?`<span class="track-duration">${esc(v.duration)}</span>`:''}</span><span class="track-copy"><strong>${esc(displayTitle(v.title))}</strong><small><span class="eq" aria-hidden="true"><i></i><i></i><i></i></span>${esc(relativeDate(v.publishedAt))}</small></span></button></li>`).join('');
  els.list.querySelectorAll('[data-id]').forEach(b=>b.onclick=()=>selectTrack(b.dataset.id,true));
}

function markCurrentTrack(){
  els.list.querySelectorAll('.track').forEach(b=>{
    const current=b.dataset.id===state.selectedId;
    b.classList.toggle('is-current',current);
    if(current)b.setAttribute('aria-current','true');else b.removeAttribute('aria-current');
  });
}

els.search.addEventListener('input',e=>{state.query=e.target.value;loadUploads();applyFilters();});

// The magnifier opens the search field with the keyboard. Closing it clears
// the search text; the chosen playlist stays.
function setSearchOpen(open){
  els.libraryTools.hidden=!open;
  els.searchToggle.setAttribute('aria-expanded',open?'true':'false');
  if(open){
    setOverview(false);
    els.search.focus();
    loadUploads();
  }else{
    els.search.blur();
    if(state.query){els.search.value='';state.query='';applyFilters();}
  }
}
els.searchToggle.addEventListener('click',()=>setSearchOpen(els.libraryTools.hidden));
els.filterToggle.addEventListener('click',()=>setOverview(!els.libraryView.classList.contains('is-overview')));
els.search.addEventListener('keydown',e=>{if(e.key==='Escape'){setSearchOpen(false);els.searchToggle.focus();}});

/* ---------- External links (More tab) ---------- */

// Compact text tiles, no logos, two per row. A featured link gets a full-width
// tile at the top; if the rest is an odd number, the last tile is full width
// too, so every group closes evenly.
function renderLinkGroup(selector,items,featured){
  const ordered=featured?[...items.filter(([name])=>name===featured),...items.filter(([name])=>name!==featured)]:items;
  const hasFeatured=!!featured&&ordered.length>0&&ordered[0][0]===featured;
  const rest=ordered.length-(hasFeatured?1:0);
  $(selector).innerHTML=ordered.map(([name,url],index)=>{
    const wide=(hasFeatured&&index===0)||(rest%2===1&&index===ordered.length-1);
    // A mail link opens the mail app directly, not a new browser tab.
    const target=url.startsWith('mailto:')?'':' target="_blank" rel="noopener"';
    return `<a class="link-tile${wide?' is-wide':''}" href="${esc(url)}"${target}><span>${esc(name)}</span><b aria-hidden="true">↗</b></a>`;
  }).join('');
}
renderLinkGroup('#musicLinks',linkGroups.music,'YouTube');
renderLinkGroup('#officialLinks',linkGroups.official);
renderLinkGroup('#socialLinks',linkGroups.social);

/* ---------- Player ---------- */

function selectTrack(id,shouldPlay=true){
  const v=findVideo(id);
  if(!v)return;
  state.selectedId=id;
  state.pendingVideoId=id;
  state.pendingPlay=!!shouldPlay;
  if(shouldPlay)dismissPoster();
  els.nowTitle.textContent=displayTitle(v.title);
  updateCommentBadge(v);
  renderInfo(v);
  resetProgress(v.duration);
  markCurrentTrack();
  if(!els.sheet.hidden)loadComments(id);
  if(state.playerReady){
    if(shouldPlay)state.player.loadVideoById(id);
    else state.player.cueVideoById(id);
  }
}

function indexInActive(){
  const list=state.filtered.length?state.filtered:state.videos;
  return{list,index:Math.max(0,list.findIndex(v=>v.id===state.selectedId))};
}
function step(direction){
  const{list,index}=indexInActive();
  if(!list.length)return;
  let next;
  if(state.shuffle&&list.length>1){
    next=Math.floor(Math.random()*(list.length-1));
    if(next>=index)next++;
  }else{
    next=(index+direction+list.length)%list.length;
  }
  selectTrack(list[next].id,true);
}

function togglePlay(){
  if(!state.playerReady){
    state.pendingPlay=true;
    state.pendingVideoId=state.selectedId;
    return;
  }
  if(state.playing){
    state.pendingPlay=false;
    state.player.pauseVideo();
  }else{
    dismissPoster();
    state.pendingPlay=true;
    state.pendingVideoId=state.selectedId;
    state.player.playVideo();
  }
}

function syncPlayIcons(){
  if(state.playing)dismissPoster();
  els.play.classList.toggle('is-playing',state.playing);
  els.play.setAttribute('aria-label',state.playing?'Pause':'Play');
  els.app.classList.toggle('is-playing',state.playing);
  if(!state.playing&&pwaUpdateReloadPending){
    pwaUpdateReloadPending=false;
    safeReloadForUpdate();
  }
}

function setToggle(button,on){button.setAttribute('aria-pressed',on?'true':'false');}

els.play.addEventListener('click',togglePlay);
els.prev.addEventListener('click',()=>{
  // Like most players: a tap after the first seconds restarts the track.
  if(state.playerReady&&state.player.getCurrentTime?.()>4){state.player.seekTo(0,true);return;}
  step(-1);
});
els.next.addEventListener('click',()=>step(1));
els.shuffle.addEventListener('click',()=>{state.shuffle=!state.shuffle;setToggle(els.shuffle,state.shuffle);});
els.repeat.addEventListener('click',()=>{
  state.repeat=!state.repeat;
  setToggle(els.repeat,state.repeat);
  els.repeat.setAttribute('aria-label',state.repeat?'Repeat this track: on':'Repeat');
});

/* Progress bar */
function setSeekVisual(fraction){
  const pct=Math.max(0,Math.min(1,fraction))*100;
  els.seek.style.setProperty('--pct',`${pct}%`);
}
function resetProgress(duration){
  els.seek.value=0;
  setSeekVisual(0);
  els.timeCurrent.textContent='0:00';
  els.timeTotal.textContent=duration||'0:00';
}
function tickProgress(){
  if(!state.playerReady||state.seeking||!state.player.getDuration)return;
  const d=state.player.getDuration()||0;
  const t=state.player.getCurrentTime()||0;
  if(d>0){
    els.seek.value=Math.round(t/d*1000);
    setSeekVisual(t/d);
    els.timeTotal.textContent=formatTime(d);
  }
  els.timeCurrent.textContent=formatTime(t);
}
setInterval(tickProgress,500);

els.seek.addEventListener('input',()=>{
  state.seeking=true;
  const fraction=els.seek.value/1000;
  setSeekVisual(fraction);
  const d=state.playerReady?state.player.getDuration?.()||0:0;
  if(d)els.timeCurrent.textContent=formatTime(fraction*d);
});
els.seek.addEventListener('change',()=>{
  const d=state.playerReady?state.player.getDuration?.()||0:0;
  if(d)state.player.seekTo(els.seek.value/1000*d,true);
  state.seeking=false;
});

/* YouTube IFrame player — created once inside the always-visible stage. */
function initYouTubeIframePlayer(){
  if(state.player||state.playerInitStarted)return;
  if(!(window.YT&&YT.Player))return;
  state.playerInitStarted=true;

  state.player=new YT.Player('youtubePlayer',{
    height:'100%',
    width:'100%',
    videoId:state.selectedId||'',
    playerVars:{
      playsinline:1,
      rel:0,
      autoplay:0,
      controls:0,
      disablekb:1,
      fs:0,
      iv_load_policy:3,
      cc_load_policy:0,
      origin:window.location.origin
    },
    events:{
      onReady:()=>{
        state.playerReady=true;
        resolvePlayerReady();
        const id=state.pendingVideoId||state.selectedId;
        if(id){
          if(state.pendingPlay)state.player.loadVideoById(id);
          else state.player.cueVideoById(id);
        }
      },
      onStateChange:e=>{
        state.playing=e.data===YT.PlayerState.PLAYING;
        if(state.playing){
          state.pendingPlay=false;
          state.pendingVideoId=null;
        }
        syncPlayIcons();
        if(e.data===YT.PlayerState.ENDED){
          if(state.repeat){
            state.player.seekTo(0,true);
            state.player.playVideo();
          }else{
            step(1);
          }
        }
      },
      onError:e=>{
        console.warn('YouTube player error',e?.data);
        state.playing=false;
        state.pendingPlay=false;
        syncPlayIcons();
      }
    }
  });
}
window.onYouTubeIframeAPIReady=initYouTubeIframePlayer;

function loadYouTubeIframeApi(){
  if(window.YT&&YT.Player){initYouTubeIframePlayer();return;}
  if(document.querySelector('script[data-dmc-youtube-api]'))return;
  const tag=document.createElement('script');
  tag.src='https://www.youtube.com/iframe_api';
  tag.async=true;
  tag.dataset.dmcYoutubeApi='1';
  tag.onerror=()=>console.error('YouTube IFrame API could not be loaded.');
  document.head.appendChild(tag);
}
loadYouTubeIframeApi();

/* ---------- Full screen ----------
   No button: turning the phone sideways makes the video fill the screen
   (see the landscape rule in styles.css). */

document.addEventListener('keydown',e=>{
  if(e.key!=='Escape')return;
  if(!els.postSheet.hidden)closePost();
  else if(!els.sheet.hidden)closeComments();
});

/* ---------- Comments sheet ---------- */

function updateCommentBadge(video){
  const n=Number(video?.commentCount)||0;
  els.commentBadge.textContent=n>0?compact(n):'';
}

function openComments(){
  if(!state.selectedId)return;
  closePost();
  els.sheet.hidden=false;
  els.commentsButton.setAttribute('aria-expanded','true');
  loadComments(state.selectedId);
  els.closeComments.focus({preventScroll:true});
}
function closeComments(){
  if(els.sheet.hidden)return;
  els.sheet.hidden=true;
  els.commentsButton.setAttribute('aria-expanded','false');
}
els.commentsButton.addEventListener('click',()=>{
  if(els.sheet.hidden)openComments();else closeComments();
});
els.closeComments.addEventListener('click',()=>{closeComments();els.commentsButton.focus();});

// Swipe down on a sheet header to close it.
function setupSheetSwipe(head,close){
  let startY=null;
  head.addEventListener('touchstart',e=>{if(e.touches.length===1)startY=e.touches[0].clientY;},{passive:true});
  head.addEventListener('touchend',e=>{
    if(startY===null)return;
    const dy=(e.changedTouches[0]?.clientY??startY)-startY;
    startY=null;
    if(dy>50)close();
  },{passive:true});
}
setupSheetSwipe(els.sheetHead,closeComments);

async function loadComments(id){
  state.commentsFor=id;
  els.commentCount.textContent='';
  els.comments.innerHTML='<p class="muted">Loading comments …</p>';
  try{
    const data=await fetch(`/api/youtube/comments/${encodeURIComponent(id)}`).then(check);
    if(state.commentsFor!==id)return; // track changed meanwhile
    const total=Number(findVideo(id)?.commentCount)||data.length;
    els.commentCount.textContent=total?`(${compact(total)})`:'';
    els.comments.innerHTML=data.length
      ?data.map(c=>`<article class="comment"><img src="${esc(c.authorImage)}" alt="" loading="lazy" referrerpolicy="no-referrer"><div><div class="comment-meta"><strong>${esc(c.author)}</strong><time datetime="${esc(c.publishedAt)}">${esc(relativeDate(c.publishedAt))}</time></div><p>${esc(c.text)}</p>${c.likeCount?`<div class="comment-likes">${esc(compact(c.likeCount))} ${c.likeCount===1?'like':'likes'}</div>`:''}</div></article>`).join('')
      :'<p class="muted">No comments yet.</p>';
  }catch{
    if(state.commentsFor===id)els.comments.innerHTML='<p class="muted">Comments could not be loaded.</p>';
  }
}

/* ---------- Pull to refresh (on the content area, below the stage) ---------- */

let pullRefreshBusy=false;

async function refreshVisibleContent(){
  if(pullRefreshBusy)return false;
  pullRefreshBusy=true;
  try{
    const activeGenre=state.genre||'All';
    const [freshTracks,freshLatest]=await Promise.all([
      fetchPlaylist(activeGenre,true),
      fetch(`/api/youtube/latest?_=${Date.now()}`,{cache:'no-store'}).then(check)
    ]);
    state.videos=freshTracks;
    if(freshLatest?.id)state.latestVideo=freshLatest;
    renderRelease();
    renderGenres();
    applyFilters();
    els.status.hidden=true;
    loadNews();
    return true;
  }catch(e){
    els.status.textContent=e.message||'Refresh failed.';
    els.status.hidden=false;
    return false;
  }finally{
    pullRefreshBusy=false;
  }
}

function setupPullToRefresh(){
  // The indicator is a dot in the top right corner of the header: faint while
  // pulling, solid once the pull is far enough, blinking while content loads.
  const dot=$('#pullRefreshIndicator');
  const scroller=els.content;
  if(!dot||!scroller)return;
  const threshold=74;
  let startY=0,distance=0,tracking=false;

  function hideDot(){dot.classList.remove('visible','ready','refreshing');}

  scroller.addEventListener('touchstart',e=>{
    if(pullRefreshBusy||scroller.scrollTop>0||e.touches.length!==1||!els.sheet.hidden||!els.postSheet.hidden)return;
    startY=e.touches[0].clientY;
    distance=0;
    tracking=true;
  },{passive:true});

  scroller.addEventListener('touchmove',e=>{
    if(!tracking||e.touches.length!==1)return;
    const delta=e.touches[0].clientY-startY;
    if(delta<=0||scroller.scrollTop>0){
      distance=0;
      hideDot();
      return;
    }
    distance=Math.min(110,delta*.55);
    if(distance<8)return;
    e.preventDefault();
    dot.classList.add('visible');
    dot.classList.toggle('ready',distance>=threshold);
  },{passive:false});

  scroller.addEventListener('touchend',async()=>{
    if(!tracking)return;
    tracking=false;
    if(distance<threshold){hideDot();return;}
    distance=0;
    dot.classList.remove('ready');
    dot.classList.add('visible','refreshing');
    // Blink at least briefly, so a fast refresh is still noticed.
    await Promise.all([refreshVisibleContent(),new Promise(resolve=>setTimeout(resolve,900))]);
    hideDot();
  },{passive:true});

  scroller.addEventListener('touchcancel',()=>{tracking=false;distance=0;hideDot();},{passive:true});
}

/* ---------- Home: community news, the latest posts as tiles ---------- */

// Safely turn visible URLs in YouTube post text into clickable links.
// Everything else remains a text node (no untrusted HTML injection).
function renderLinkedText(element,value){
  element.replaceChildren();
  const raw=String(value||'');
  const urlPattern=/(https?:\/\/[^\s<>"'“”]+|www\.[^\s<>"'“”]+)/gi;
  let last=0;
  for(const match of raw.matchAll(urlPattern)){
    const start=match.index;
    if(start>last)element.append(document.createTextNode(raw.slice(last,start)));
    const candidate=match[0];
    const trimmed=candidate.replace(/[.,!?;:)}\]»]+$/g,'');
    const suffix=candidate.slice(trimmed.length);
    try{
      if(/(?:\.\.\.|…)(?:[.,!?;:)}\]»]*)$/.test(candidate))throw new Error('Truncated YouTube URL');
      const url=new URL(trimmed.startsWith('www.')?'https://'+trimmed:trimmed);
      if(url.protocol!=='https:'&&url.protocol!=='http:')throw new Error('Unsupported URL scheme');
      const anchor=document.createElement('a');
      anchor.href=url.href;
      anchor.target='_blank';
      anchor.rel='noopener noreferrer';
      anchor.textContent=trimmed;
      element.append(anchor);
    }catch{element.append(document.createTextNode(trimmed));}
    if(suffix)element.append(document.createTextNode(suffix));
    last=start+candidate.length;
  }
  if(last<raw.length)element.append(document.createTextNode(raw.slice(last)));
}

// Preserve YouTube's real target URLs, even when the visible text is shortened.
function renderPostText(element,post){
  const runs=post.runs;
  if(!Array.isArray(runs)||!runs.length){
    renderLinkedText(element,post.text);
    return;
  }
  element.replaceChildren();
  for(const run of runs){
    const label=String(run.text||'');
    let target;
    try{
      if(run.url){
        target=new URL(run.url);
        if(target.protocol!=='https:'&&target.protocol!=='http:')target=null;
      }
    }catch{target=null;}
    if(!target){
      const span=document.createElement('span');
      renderLinkedText(span,label);
      element.append(span);
      continue;
    }
    const anchor=document.createElement('a');
    anchor.href=target.href;
    anchor.target='_blank';
    anchor.rel='noopener noreferrer';
    anchor.textContent=/^(https?:\/\/|www\.)/i.test(label.trim())?target.href:label;
    element.append(anchor);
  }
}

// The backend refreshes the posts at most every six hours.
// If nothing comes back (e.g. the server was just waking up), try again a
// couple of times and whenever the app is opened again.
let newsPosts=[];
let newsLoaded=false;
let newsRetries=0;
let newsRetryTimer=null;
function scheduleNewsRetry(){
  if(newsLoaded||newsRetries>=3||newsRetryTimer)return;
  newsRetries++;
  newsRetryTimer=setTimeout(()=>{newsRetryTimer=null;loadNews();},20000*newsRetries);
}

// Shown in the tile of every post without a picture; the text is in the opened post.
const NEWS_FALLBACK_IMAGE='/assets/news-fallback.jpg';

function renderNewsGrid(){
  els.newsGrid.innerHTML=newsPosts.map((post,index)=>{
    const text=String(post.text||'').trim();
    const media=`<img src="${esc(post.imageUrl||NEWS_FALLBACK_IMAGE)}" alt="" loading="lazy">`;
    const label=text?text.replace(/\s+/g,' ').slice(0,80):'Community post';
    return `<button class="news-tile" type="button" data-post="${index}" aria-label="Open post: ${esc(label)}"><span class="news-tile-media">${media}</span>${post.published?`<span class="news-tile-date">${esc(post.published)}</span>`:''}</button>`;
  }).join('');
  els.newsGrid.querySelectorAll('[data-post]').forEach(tile=>tile.addEventListener('click',()=>openPost(Number(tile.dataset.post))));
}

async function loadNews(){
  try{
    const response=await fetch('/api/youtube/community/posts',{cache:'no-store'});
    if(!response.ok)throw new Error('Posts unavailable');
    const posts=await response.json();
    if(!Array.isArray(posts)||!posts.length)throw new Error('No public posts');
    newsPosts=posts.slice(0,6);
    newsLoaded=true;
    renderNewsGrid();
    els.newsStatus.hidden=true;
  }catch{
    scheduleNewsRetry();
    if(!newsPosts.length){
      els.newsStatus.textContent='No news right now – check back soon.';
      els.newsStatus.hidden=false;
    }
  }
}

function openPost(index){
  const post=newsPosts[index];
  if(!post)return;
  closeComments();
  els.postDate.textContent=post.published||'';
  if(post.imageUrl){els.postImage.src=post.imageUrl;els.postImage.hidden=false;}
  else{els.postImage.removeAttribute('src');els.postImage.hidden=true;}
  if(String(post.text||'').trim()){renderPostText(els.postText,post);els.postText.hidden=false;}
  else els.postText.hidden=true;
  els.postSheet.hidden=false;
  els.postSheet.querySelector('.sheet-body').scrollTop=0;
  els.closePost.focus({preventScroll:true});
}
function closePost(){
  if(els.postSheet.hidden)return;
  els.postSheet.hidden=true;
}
els.closePost.addEventListener('click',closePost);
setupSheetSwipe(els.postSheetHead,closePost);

/* ---------- Appearance: dark (default) or light ---------- */

const THEME_KEY='dmc-theme';
function savedTheme(){
  try{return localStorage.getItem(THEME_KEY)==='light'?'light':'dark';}
  catch{return'dark';}
}
function applyTheme(mode){
  const light=mode==='light';
  document.documentElement.dataset.theme=light?'light':'dark';
  const meta=$('#themeColorMeta');
  if(meta)meta.content=light?'#ffffff':'#050505';
  document.querySelectorAll('[data-theme-choice]').forEach(button=>{
    button.setAttribute('aria-pressed',button.dataset.themeChoice===mode?'true':'false');
  });
}
document.querySelectorAll('[data-theme-choice]').forEach(button=>button.addEventListener('click',()=>{
  const mode=button.dataset.themeChoice==='light'?'light':'dark';
  try{localStorage.setItem(THEME_KEY,mode);}catch{}
  applyTheme(mode);
}));
applyTheme(savedTheme());

/* ---------- PWA updates ---------- */

let pwaUpdateReloadPending=false;

function safeReloadForUpdate(){
  if(state.playing){
    pwaUpdateReloadPending=true;
    return;
  }
  const key=`dmc-update-reload-${APP_VERSION}`;
  if(sessionStorage.getItem(key)==='1')return;
  sessionStorage.setItem(key,'1');
  window.location.replace(`/?updated=${encodeURIComponent(APP_VERSION)}&t=${Date.now()}`);
}

async function checkPwaUpdate(registration){
  try{
    const response=await fetch(`/api/app-version?t=${Date.now()}`,{cache:'no-store'});
    if(response.ok){
      const data=await response.json();
      if(data?.version&&data.version!==APP_VERSION)await registration.update();
    }
  }catch{}
  try{
    await registration.update();
    if(registration.waiting)registration.waiting.postMessage({type:'SKIP_WAITING'});
  }catch{}
}

async function setupPwaUpdater(){
  if(!('serviceWorker' in navigator))return;
  try{
    const registration=await navigator.serviceWorker.register(
      `/sw.js?v=${encodeURIComponent(APP_VERSION)}`,
      {updateViaCache:'none'}
    );
    const handleWaiting=()=>{
      if(registration.waiting)registration.waiting.postMessage({type:'SKIP_WAITING'});
    };
    registration.addEventListener('updatefound',()=>{
      const worker=registration.installing;
      if(!worker)return;
      worker.addEventListener('statechange',()=>{
        if(worker.state==='installed'&&navigator.serviceWorker.controller)handleWaiting();
      });
    });
    navigator.serviceWorker.addEventListener('controllerchange',safeReloadForUpdate);
    await checkPwaUpdate(registration);
    window.addEventListener('pageshow',()=>checkPwaUpdate(registration));
    window.addEventListener('focus',()=>checkPwaUpdate(registration));
    document.addEventListener('visibilitychange',()=>{
      if(document.visibilityState==='visible')checkPwaUpdate(registration);
    });
    setInterval(()=>{
      if(document.visibilityState==='visible')checkPwaUpdate(registration);
    },5*60*1000);
  }catch(e){
    console.warn('PWA updater unavailable',e);
  }
}

/* ---------- Push notifications (OneSignal) ---------- */

let oneSignalUiReady=false;
let oneSignalInstance=null;

function isStandaloneApp(){
  return window.matchMedia('(display-mode: standalone)').matches||window.navigator.standalone===true;
}
function isIOSDevice(){
  return /iPad|iPhone|iPod/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
}

function setPushToggleUi(on,status){
  const button=$('#pushNotificationToggle');
  const label=$('#pushNotificationStatus');
  if(!button)return;
  button.classList.toggle('is-on',!!on);
  button.setAttribute('aria-pressed',on?'true':'false');
  if(label)label.textContent=status;
}

function refreshPushToggleUi(){
  if(!oneSignalInstance){setPushToggleUi(false,'Push unavailable');return;}
  if(!oneSignalInstance.Notifications.isPushSupported()){setPushToggleUi(false,'Not supported on this device');return;}
  if(isIOSDevice()&&!isStandaloneApp()){setPushToggleUi(false,'Install the app to enable');return;}
  const permission=oneSignalInstance.Notifications.permission;
  const optedIn=oneSignalInstance.User.PushSubscription.optedIn===true;
  if(permission&&optedIn)setPushToggleUi(true,'Enabled');
  else if(permission&&!optedIn)setPushToggleUi(false,'Disabled');
  else setPushToggleUi(false,'Tap to enable');
}

async function togglePushNotifications(){
  if(!oneSignalUiReady||!oneSignalInstance){setPushToggleUi(false,'Tap to enable');return;}
  const OneSignal=oneSignalInstance;
  if(!OneSignal.Notifications.isPushSupported()){setPushToggleUi(false,'Not supported on this device');return;}
  if(isIOSDevice()&&!isStandaloneApp()){
    setPushToggleUi(false,'Add app to Home Screen first');
    alert('On iPhone, push notifications work only from the installed Don Miguel App. Add it to the Home Screen and open it from there.');
    return;
  }
  try{
    if(OneSignal.User.PushSubscription.optedIn===true){
      OneSignal.User.PushSubscription.optOut();
      setTimeout(refreshPushToggleUi,150);
      return;
    }
    if(!OneSignal.Notifications.permission)await OneSignal.Notifications.requestPermission();
    if(OneSignal.Notifications.permission)OneSignal.User.PushSubscription.optIn();
    setTimeout(refreshPushToggleUi,250);
  }catch(e){
    console.warn('Push toggle failed',e);
    setPushToggleUi(false,'Could not enable');
  }
}

function setupPushNotificationControls(){
  $('#pushNotificationToggle')?.addEventListener('click',togglePushNotifications);
  const connect=OneSignal=>{
    if(!OneSignal)return;
    oneSignalInstance=OneSignal;
    oneSignalUiReady=true;
    refreshPushToggleUi();
    try{
      OneSignal.User.PushSubscription.addEventListener('change',refreshPushToggleUi);
      OneSignal.Notifications.addEventListener('permissionChange',refreshPushToggleUi);
    }catch(e){console.warn('OneSignal listeners unavailable',e);}
  };
  if(window.__DMC_ONE_SIGNAL__)connect(window.__DMC_ONE_SIGNAL__);
  window.addEventListener('dmc-onesignal-ready',()=>connect(window.__DMC_ONE_SIGNAL__),{once:true});
  window.addEventListener('dmc-onesignal-error',e=>{
    oneSignalUiReady=false;
    setPushToggleUi(false,'Could not connect');
    console.warn('OneSignal setup error',e.detail);
  },{once:true});
  setTimeout(()=>{if(!oneSignalUiReady)setPushToggleUi(false,'Tap to enable');},8000);
}

/* ---------- Legal dialogs ---------- */

function setupLegalDialogs(){
  const imprint=$('#imprintDialog');
  const privacy=$('#privacyDialog');
  function openLegal(which,e){
    if(e)e.preventDefault();
    const dialog=which==='imprint'?imprint:privacy;
    if(!dialog)return;
    [imprint,privacy].forEach(d=>{if(d&&d!==dialog&&d.open)d.close();});
    if(!dialog.open)dialog.showModal();
    const scroller=dialog.querySelector('.links-content');
    if(scroller)scroller.scrollTop=0;
  }
  document.querySelectorAll('[data-open-legal="imprint"]').forEach(a=>a.addEventListener('click',e=>openLegal('imprint',e)));
  document.querySelectorAll('[data-open-legal="privacy"]').forEach(a=>a.addEventListener('click',e=>openLegal('privacy',e)));
  $('#closeImprint')?.addEventListener('click',()=>imprint?.close());
  $('#closePrivacy')?.addEventListener('click',()=>privacy?.close());
  [imprint,privacy].forEach(dialog=>dialog?.addEventListener('click',e=>{if(e.target===dialog)dialog.close();}));
}

/* ---------- Start ---------- */

setupLegalDialogs();
setupPullToRefresh();
window.addEventListener('load',setupPwaUpdater);
window.addEventListener('load',setupPushNotificationControls);
load();
wakeServer();

document.addEventListener('visibilitychange',()=>{
  if(document.visibilityState!=='visible')return;
  wakeServer();
  if(!newsLoaded){newsRetries=0;loadNews();}
  setTimeout(refreshLatestRelease,250);
});
window.addEventListener('pageshow',()=>setTimeout(refreshLatestRelease,250));
window.addEventListener('focus',()=>setTimeout(refreshLatestRelease,250));
