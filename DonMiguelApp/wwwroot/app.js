const PLAYLISTS = Object.freeze({
  'All': 'PLrIIvPdks_sFn2nPjFm_nCTdAYuC7Z2SJ',
  'Bachata': 'PLrIIvPdks_sHnjrKxo9AyXzQThQFQb4fg',
  'Merengue': 'PLrIIvPdks_sHfOHEPyeO85eLAnro2g_Wv',
  'Salsa': 'PLrIIvPdks_sGtYNQcxPbsCxeyO9KuNWHy',
  'Reggaetón': 'PLrIIvPdks_sFLTemRJ-MHS-k-2egExpwv',
  'Ballads': 'PLrIIvPdks_sET8awM4mOlB2o9jHtAIvxP',
  'Mixtape': 'PLrIIvPdks_sEDekjQX9uG8TGbPbDF4mTe'
});

const state={
  videos:[],
  filtered:[],
  playlistCache:new Map(),
  selectedId:null,
  genre:'All',
  query:'',
  player:null,
  playerReady:false,
  playing:false,
  shuffle:false,
  repeat:false,
  comments:[],
  latestVideo:null,
  loadingGenre:false,
  pendingPlay:false,
  pendingVideoId:null
};

const $=s=>document.querySelector(s);
const els={
  preloader:$('#appPreloader'),preloaderText:$('#preloaderText'),shell:$('.app-shell'),
  hero:$('#hero'),heroInfo:$('#heroInfo'),status:$('#statusBox'),list:$('#trackList'),count:$('#trackCount'),
  genres:$('#genreBar'),search:$('#searchInput'),mini:$('#miniPlayer'),
  miniPlay:$('#playPauseButton'),dialogPlay:$('#dialogPlayPauseButton'),
  nowDialog:$('#nowPlayingDialog'),nowTitle:$('#nowTitle'),nowMeta:$('#nowMeta'),comments:$('#comments'),
  commentCount:$('#commentCount'),menu:$('#menuDialog')
};

const linkGroups={
  music:[
    ['Spotify','https://open.spotify.com/artist/1ZumwPc08JV7exhNFM63EX','spotify.svg'],
    ['Apple Music','https://music.apple.com/de/artist/don-miguel-de-cabarete/1819273199','applemusic.svg'],
    ['Amazon Music','https://music.amazon.com/artists/B0FBLTZGWF/don-miguel-de-cabarete','amazonmusic.svg'],
    ['YouTube Music','https://music.youtube.com/search?q=Don%20Miguel%20de%20Cabarete','youtubemusic.svg'],
    ['laut.fm','https://laut.fm/don-miguel','laut.svg'],
    ['YouTube','https://www.youtube.com/@migflow','youtube.svg']
  ],
  official:[
    ['Homepage','https://donmiguel.nicepage.io/','Official website','homepage.svg'],
    ['UnitedMasters','https://unitedmasters.com/migflow','Official profile','unitedmasters.svg']
  ],
  social:[
    ['WhatsApp','https://whatsapp.com/channel/0029VbD5cCuGU3BDfJk12M35','whatsapp.svg'],
    ['Instagram','https://www.instagram.com/don_miguel_de_cabarete/','instagram.svg'],
    ['TikTok','https://www.tiktok.com/@loopweb', 'tiktok.svg'],
    ['Facebook','https://www.facebook.com/donmiguel.music/','facebook.svg'],
    ['X / Twitter','https://x.com/loopweb', 'x.svg'],
    ['Onplug','https://onplug.net/pages/migflow', 'onplug.svg']
  ]
};

const genres=Object.keys(PLAYLISTS);
const preloaderStartedAt=Date.now();
let preloaderClosed=false;

function wakeServer(){
  fetch('/health', {
    method:'GET',
    cache:'no-store',
    credentials:'same-origin'
  }).catch(()=>{});
}

function setPreloaderText(text){if(els.preloaderText)els.preloaderText.textContent=text;}
function closePreloader(){
  if(preloaderClosed)return;
  preloaderClosed=true;
  const delay=Math.max(0,650-(Date.now()-preloaderStartedAt));
  window.setTimeout(()=>{
    document.body.classList.remove('is-loading');
    els.shell?.removeAttribute('aria-hidden');
    els.preloader?.classList.add('is-hidden');
    window.setTimeout(()=>els.preloader?.remove(),400);
  },delay);
}
window.setTimeout(closePreloader,8000);


function esc(v=''){return String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function unique(videos){const seen=new Set();return videos.filter(v=>{const key=(v.id||'').trim();if(!key||seen.has(key))return false;seen.add(key);return true;});}
function views(n=0){return new Intl.NumberFormat('en-US',{notation:n>=10000?'compact':'standard',maximumFractionDigits:1}).format(n);}
function relativeDate(value){const d=new Date(value),days=Math.max(0,Math.floor((Date.now()-d.getTime())/86400000));if(days===0)return'today';if(days===1)return'1 day ago';if(days<7)return`${days} days ago`;if(days<31){const w=Math.floor(days/7);return`${w} week${w===1?'':'s'} ago`;}if(days<365){const m=Math.floor(days/30);return`${m} month${m===1?'':'s'} ago`;}const y=Math.floor(days/365);return`${y} year${y===1?'':'s'} ago`; }
function check(r){if(!r.ok)throw new Error('Could not load content from YouTube.');return r.json();}

async function fetchPlaylist(genre){
  if(state.playlistCache.has(genre))return state.playlistCache.get(genre);
  const playlistId=PLAYLISTS[genre];
  if(!playlistId)throw new Error(`No playlist configured for ${genre}.`);
  const videos=unique(await fetch(`/api/youtube/playlists/${encodeURIComponent(playlistId)}/videos`).then(check));
  state.playlistCache.set(genre,videos);
  return videos;
}

async function load(){
  setPreloaderText('Loading');
  try{
    const status=await fetch('/api/status').then(check);
    if(!status.configured)throw new Error('YouTube API key is not configured.');
    const [allTracks, channelUploads]=await Promise.all([
      fetchPlaylist('All'),
      fetch('/api/youtube/latest').then(check)
    ]);
    state.videos=allTracks;
    state.latestVideo=channelUploads||state.videos[0]||null;
    state.selectedId=state.latestVideo?.id||state.videos[0]?.id||null;
    renderHero();
    renderGenres();
    applyFilters();
    els.status.hidden=true;
    if(state.selectedId)selectTrack(state.selectedId,false,false);
  }catch(e){
    els.status.textContent=e.message;
    els.status.hidden=false;
    els.hero.classList.remove('skeleton');
    els.hero.innerHTML='<div class="hero-copy"><span class="hero-kicker">DON MIGUEL APP</span><h1>Content unavailable</h1><p>Please check the API configuration and playlist IDs.</p></div>';
  }finally{
    closePreloader();
  }
}

function displayTitle(title){
  return String(title||'')
    .replace(/\s*[–—-]\s*Don Miguel de Cabarete(?:\s*[|–—-]\s*.*)?$/i,'')
    .trim();
}

function renderHero(){
  const v=state.latestVideo;
  if(!v)return;
  els.hero.classList.remove('skeleton');
  els.hero.style.backgroundImage=`url("${v.thumbnail}")`;
  els.hero.innerHTML='';
  els.heroInfo.classList.remove('hidden');
  els.heroInfo.innerHTML=`<div class="hero-actions hero-actions-single"><button id="listenNowButton" class="hero-play-new-release" aria-label="Play new release"><span class="hero-play-icon">▶</span><span>Play new Release</span></button></div>`;
  $('#listenNowButton').onclick=e=>{e.stopPropagation();selectTrack(v.id,false);};
}

function renderGenres(){
  els.genres.innerHTML=genres.map(g=>`<button class="genre-chip ${g===state.genre?'active':''}" data-genre="${esc(g)}">${esc(g)}</button>`).join('');
  els.genres.querySelectorAll('[data-genre]').forEach(b=>b.onclick=()=>changeGenre(b.dataset.genre));
}

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
  }catch(e){
    state.videos=[];
    applyFilters();
    els.status.textContent=e.message;
    return;
  }finally{
    state.loadingGenre=false;
  }
  els.status.hidden=true;
}

function applyFilters(){
  const q=state.query.trim().toLocaleLowerCase('en');
  state.filtered=state.videos.filter(v=>!q||`${v.title} ${v.description}`.toLocaleLowerCase('en').includes(q));
  renderList();
}

function renderList(){
  els.count.textContent=`${state.filtered.length} Tracks`;
  els.list.innerHTML=state.filtered.map(v=>`<button class="track-row ${v.id===state.selectedId?'active':''}" data-id="${esc(v.id)}"><img src="${esc(v.thumbnail)}" alt=""><span class="track-copy"><strong>${esc(displayTitle(v.title))}</strong></span><span class="track-duration">${esc(v.duration||'')}</span><span class="track-play">▶</span></button>`).join('')||'<div class="status-box">No matching tracks found.</div>';
  els.list.querySelectorAll('[data-id]').forEach(b=>b.onclick=()=>selectTrack(b.dataset.id,false));
}

function findVideo(id){
  if(state.latestVideo?.id===id)return state.latestVideo;
  const current=state.videos.find(x=>x.id===id);
  if(current)return current;
  for(const list of state.playlistCache.values()){
    const found=list.find(x=>x.id===id);
    if(found)return found;
  }
  return null;
}

function selectTrack(id,open,shouldPlay=true){
  const v=findVideo(id);
  if(!v)return;
  state.selectedId=id;
  state.pendingVideoId=id;
  state.pendingPlay=!!shouldPlay;
  els.mini.classList.remove('hidden');
  els.nowTitle.textContent=v.title;
  els.nowMeta.textContent=`◉ ${views(v.viewCount)} Views · ${relativeDate(v.publishedAt)}`;
  renderList();
  if(state.playerReady){
    if(shouldPlay)state.player.loadVideoById(id);
    else state.player.cueVideoById(id);
  }
  if(open)openFullPlayer();
}

function indexInActive(){
  const list=state.filtered.length?state.filtered:state.videos;
  return{list,index:Math.max(0,list.findIndex(v=>v.id===state.selectedId))};
}
function step(direction){const{list,index}=indexInActive();if(!list.length)return;const next=state.shuffle?Math.floor(Math.random()*list.length):(index+direction+list.length)%list.length;selectTrack(list[next].id,false);}
function togglePlay(){if(!state.playerReady){state.pendingPlay=true;state.pendingVideoId=state.selectedId;return;}if(state.playing){state.pendingPlay=false;state.player.pauseVideo();}else{state.pendingPlay=true;state.pendingVideoId=state.selectedId;state.player.playVideo();}}
function syncPlayIcons(){const icon=state.playing?'Ⅱ':'▶';els.miniPlay.textContent=icon;els.dialogPlay.textContent=icon;}

async function loadComments(id){
  els.comments.innerHTML='<p class="muted">Loading comments …</p>';
  try{
    const data=await fetch(`/api/youtube/comments/${encodeURIComponent(id)}`).then(check);
    state.comments=data;
    els.commentCount.textContent=data.length||'';
    els.comments.innerHTML=data.length?data.map(c=>`<article class="comment"><img src="${esc(c.authorImage)}" alt=""><div><strong>${esc(c.author)}</strong><time>${relativeDate(c.publishedAt)}</time><p>${esc(c.text)}</p></div><span class="likes">♡ ${c.likeCount||0}</span></article>`).join(''):'<p class="muted">No comments are available for this video.</p>';
  }catch{els.comments.innerHTML='<p class="muted">Comments could not be loaded.</p>';}
}

window.onYouTubeIframeAPIReady=()=>{
  // Keep the iframe alive even while the large player is minimized. iOS can
  // suspend media inside a closed <dialog>, which made playback intermittent.
  if(!els.nowDialog.open)els.nowDialog.show();
  els.nowDialog.classList.add('player-minimized');
  state.player=new YT.Player('youtubePlayer',{
    height:'100%',width:'100%',videoId:state.selectedId||'',
    playerVars:{playsinline:1,rel:0,autoplay:0,controls:0,disablekb:1,fs:0,iv_load_policy:3,cc_load_policy:0},
    events:{
      onReady:()=>{
        state.playerReady=true;
        const id=state.pendingVideoId||state.selectedId;
        if(id){
          if(state.pendingPlay)state.player.loadVideoById(id);
          else state.player.cueVideoById(id);
        }
      },
      onStateChange:e=>{
        state.playing=e.data===YT.PlayerState.PLAYING;
        if(state.playing){state.pendingPlay=false;state.pendingVideoId=null;}
        syncPlayIcons();
        if(e.data===YT.PlayerState.ENDED){if(state.repeat)state.player.playVideo();else step(1);}
      },
      onError:()=>{state.playing=false;state.pendingPlay=false;syncPlayIcons();}
    }
  });
};

els.search.oninput=e=>{state.query=e.target.value;applyFilters();};
$('#menuButton').onclick=()=>els.menu.showModal();
$('#playerMenuButton').onclick=()=>els.menu.showModal();
$('#closeMenu').onclick=()=>els.menu.close();
function openFullPlayer(){
  // The YouTube iframe stays alive while minimized, but the visible player
  // must be reopened as a real modal so iOS/Safari renders it correctly.
  if(els.nowDialog.open)els.nowDialog.close();
  els.nowDialog.classList.remove('player-minimized');
  els.nowDialog.showModal();
  if(state.selectedId)loadComments(state.selectedId);
}
function minimizeFullPlayer(){
  // Switch from modal to a tiny non-modal dialog instead of destroying
  // the iframe. This preserves reliable playback on iOS.
  if(els.nowDialog.open)els.nowDialog.close();
  els.nowDialog.show();
  els.nowDialog.classList.add('player-minimized');
}
$('#openNowPlaying').onclick=openFullPlayer;
$('#queueButton').onclick=()=>{els.list.scrollIntoView({behavior:'smooth',block:'start'});};
$('#closeNowPlaying').onclick=minimizeFullPlayer;
$('#previousButton').onclick=$('#dialogPreviousButton').onclick=()=>step(-1);
$('#nextButton').onclick=$('#dialogNextButton').onclick=()=>step(1);
els.miniPlay.onclick=els.dialogPlay.onclick=togglePlay;
$('#shuffleButton').onclick=e=>{state.shuffle=!state.shuffle;e.currentTarget.classList.toggle('active',state.shuffle);};
$('#repeatButton').onclick=e=>{state.repeat=!state.repeat;e.currentTarget.classList.toggle('active',state.repeat);};

function openCurrentVideoOnYouTube(showComments=false){
  if(!state.selectedId)return;
  const suffix=showComments?'#comments':'';
  const url=`https://www.youtube.com/watch?v=${encodeURIComponent(state.selectedId)}${suffix}`;
  window.open(url,'_blank','noopener');
}
$('#youtubeLikeButton').onclick=()=>openCurrentVideoOnYouTube(false);
$('#youtubeCommentButton').onclick=()=>openCurrentVideoOnYouTube(true);

$('#musicLinks').innerHTML=linkGroups.music.map(([name,url,icon])=>`<a class="service-tile" href="${url}" target="_blank" rel="noopener"><span class="brand-icon-shell"><img class="service-logo" src="/assets/icons/${icon}" alt="${esc(name)}"></span><strong>${esc(name)}</strong></a>`).join('');
$('#officialLinks').innerHTML=linkGroups.official.map(([name,url,sub,icon])=>`<a class="official-row" href="${url}" target="_blank" rel="noopener"><img class="official-logo" src="/assets/icons/${icon}" alt=""><span><strong>${esc(name)}</strong><small>${esc(sub)}</small></span><b>›</b></a>`).join('');
$('#socialLinks').innerHTML=linkGroups.social.map(([name,url,icon])=>`<a class="social-tile compact-social-tile" href="${url}" target="_blank" rel="noopener"><img class="compact-social-logo" src="/assets/icons/${icon}" alt="${esc(name)}"><span>${esc(name)}</span></a>`).join('');
syncDesktopLinks();


function syncDesktopLinks(){
  const dm=$('#desktopMusicLinks');
  const dof=$('#desktopOfficialLinks');
  const ds=$('#desktopSocialLinks');
  if(dm)dm.innerHTML=$('#musicLinks')?.innerHTML||'';
  if(dof)dof.innerHTML=$('#officialLinks')?.innerHTML||'';
  if(ds)ds.innerHTML=$('#socialLinks')?.innerHTML||'';
}

if('serviceWorker'in navigator)window.addEventListener('load',()=>navigator.serviceWorker.register('/sw.js'));
load();


wakeServer();

document.addEventListener('visibilitychange',()=>{
  if(document.visibilityState==='visible') wakeServer();
});
