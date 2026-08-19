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
    ['YouTube Music','https://music.youtube.com/@migflow','youtubemusic.svg'],
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


function resetInstalledAppScrollPosition(){
  const standalone =
    window.matchMedia('(display-mode: standalone)').matches ||
    window.navigator.standalone === true;
  if(!standalone || window.innerWidth < 900)return;
  if('scrollRestoration' in history)history.scrollRestoration='manual';
  requestAnimationFrame(()=>window.scrollTo({top:0,left:0,behavior:'instant'}));
  setTimeout(()=>window.scrollTo(0,0),80);
}
window.addEventListener('pageshow',resetInstalledAppScrollPosition);
document.addEventListener('visibilitychange',()=>{
  if(document.visibilityState==='visible')resetInstalledAppScrollPosition();
});

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
  try{
    const status=await fetch('/api/status').then(check);
    if(!status.configured)throw new Error('YouTube API key is not configured.');
    const [allTracks, channelUploads, channelInfo]=await Promise.all([
      fetchPlaylist('All'),
      fetch(`/api/youtube/latest?_=${Date.now()}`,{cache:'no-store'}).then(check),
      fetch(`/api/youtube/channel?_=${Date.now()}`,{cache:'no-store'}).then(check)
    ]);
    state.subscriberCount=Number(channelInfo?.subscriberCount)||0;
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

function formatSubscribers(value){
  const n=Number(value)||0;
  if(n>=1000000)return `${(n/1000000).toFixed(n>=10000000?0:1).replace('.0','')}M`;
  if(n>=1000)return `${(n/1000).toFixed(n>=100000?0:1).replace('.0','')}K`;
  return String(n);
}



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

    renderHero();
    renderGenres();
    applyFilters();
    els.status.hidden=true;
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
  const indicator=$('#pullRefreshIndicator');
  if(!indicator)return;

  const arrow=indicator.querySelector('.pull-refresh-arrow');
  const threshold=74;
  let startY=0;
  let distance=0;
  let tracking=false;

  const isMobile=()=>window.innerWidth<900;
  const dialogsOpen=()=>els.menu?.open || (els.nowDialog?.open && !els.nowDialog.classList.contains('player-minimized'));

  function resetIndicator(delay=0){
    setTimeout(()=>{
      indicator.classList.remove('visible','ready','refreshing');
      indicator.style.setProperty('--pull-distance','0px');
      indicator.setAttribute('aria-hidden','true');
      arrow.textContent='↓';
    },delay);
  }

  document.addEventListener('touchstart',e=>{
    if(!isMobile()||pullRefreshBusy||dialogsOpen()||window.scrollY>0||e.touches.length!==1)return;
    startY=e.touches[0].clientY;
    distance=0;
    tracking=true;
  },{passive:true});

  document.addEventListener('touchmove',e=>{
    if(!tracking||e.touches.length!==1)return;
    const delta=e.touches[0].clientY-startY;
    if(delta<=0){
      distance=0;
      resetIndicator();
      return;
    }

    // Resistance keeps the gesture controlled and prevents a huge displacement.
    distance=Math.min(110,delta*.55);
    if(distance<8)return;

    e.preventDefault();
    indicator.classList.add('visible');
    indicator.setAttribute('aria-hidden','false');
    indicator.style.setProperty('--pull-distance',`${distance}px`);

    if(distance>=threshold){
      indicator.classList.add('ready');
      arrow.textContent='↻';
    }else{
      indicator.classList.remove('ready');
      arrow.textContent='↓';
    }
  },{passive:false});

  document.addEventListener('touchend',async()=>{
    if(!tracking)return;
    tracking=false;

    if(distance<threshold){
      resetIndicator();
      return;
    }

    indicator.classList.remove('ready');
    indicator.classList.add('visible','refreshing');
    indicator.style.setProperty('--pull-distance','54px');
    arrow.textContent='↻';

    const ok=await refreshVisibleContent();
    arrow.textContent=ok?'✓':'!';
    resetIndicator(650);
    distance=0;
  },{passive:true});

  document.addEventListener('touchcancel',()=>{
    tracking=false;
    distance=0;
    resetIndicator();
  },{passive:true});
}

async function refreshLatestRelease(){
  try{
    const latest=await fetch(`/api/youtube/latest?_=${Date.now()}`,{cache:'no-store'}).then(check);
    if(!latest?.id)return;
    if(state.latestVideo?.id===latest.id)return;
    state.latestVideo=latest;
    renderHero();
  }catch{
    // Keep the currently displayed hero if the refresh cannot reach the server.
  }
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
  els.nowTitle.textContent=displayTitle(v.title);
  els.nowMeta.textContent=
    `${state.subscriberCount ? `${formatSubscribers(state.subscriberCount)} subscribers · ` : ''}` +
    `◉ ${views(v.viewCount)} Views · ${relativeDate(v.publishedAt)}`;
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
function syncPlayIcons(){
  const icon=state.playing?'Ⅱ':'▶';
  els.miniPlay.textContent=icon;
  els.dialogPlay.textContent=icon;
  if(!state.playing&&pwaUpdateReloadPending){
    pwaUpdateReloadPending=false;
    safeReloadForUpdate();
  }
}

async function loadComments(id){
  els.comments.innerHTML='<p class="muted">Loading comments …</p>';
  try{
    const data=await fetch(`/api/youtube/comments/${encodeURIComponent(id)}`).then(check);
    state.comments=data;
    els.commentCount.textContent=data.length||'';
    els.comments.innerHTML=data.length?data.map(c=>`<article class="comment"><img src="${esc(c.authorImage)}" alt=""><div><strong>${esc(c.author)}</strong><time>${relativeDate(c.publishedAt)}</time><p>${esc(c.text)}</p></div><span class="likes">♡ ${c.likeCount||0}</span></article>`).join(''):'<p class="muted">No comments are available for this video.</p>';
  }catch{els.comments.innerHTML='<p class="muted">Comments could not be loaded.</p>';}
}

function initYouTubeIframePlayer(){
  if(state.player || state.playerInitStarted)return;
  if(!(window.YT && YT.Player))return;

  state.playerInitStarted=true;

  // Keep the iframe alive even while the full player is minimized.
  // The minimized container remains off-screen but now keeps a valid
  // YouTube player viewport instead of shrinking the iframe to 2×2 px.
  if(!els.nowDialog.open)els.nowDialog.show();
  els.nowDialog.classList.add('player-minimized');

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
          if(state.repeat)state.player.playVideo();
          else step(1);
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
  // If the API is already present (for example after a browser/PWA restore),
  // initialize immediately.
  if(window.YT && YT.Player){
    initYouTubeIframePlayer();
    return;
  }

  // Never inject the API twice.
  if(document.querySelector('script[data-dmc-youtube-api]'))return;

  const tag=document.createElement('script');
  tag.src='https://www.youtube.com/iframe_api';
  tag.async=true;
  tag.dataset.dmcYoutubeApi='1';
  tag.onerror=()=>{
    console.error('YouTube IFrame API could not be loaded.');
  };
  document.head.appendChild(tag);
}

loadYouTubeIframeApi();

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
$('#queueButton').onclick=()=>{
  const target=document.getElementById('searchInput');
  if(!target)return;
  const header=document.querySelector('.topbar');
  const headerHeight=header ? header.getBoundingClientRect().height : 0;
  const top=target.getBoundingClientRect().top + window.scrollY - headerHeight - 16;
  window.scrollTo({top:Math.max(0,top),behavior:'smooth'});
};
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
$('#youtubeSubscribeButton').onclick=()=>window.open('https://www.youtube.com/channel/UCCujh8Bdc8hhaMI9CjhF-6w?sub_confirmation=1','_blank','noopener');

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

const APP_VERSION='1.2.1';
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
      if(data?.version && data.version!==APP_VERSION){
        await registration.update();
      }
    }
  }catch{}

  try{
    await registration.update();
    if(registration.waiting){
      registration.waiting.postMessage({type:'SKIP_WAITING'});
    }
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
      if(registration.waiting){
        registration.waiting.postMessage({type:'SKIP_WAITING'});
      }
    };

    registration.addEventListener('updatefound',()=>{
      const worker=registration.installing;
      if(!worker)return;
      worker.addEventListener('statechange',()=>{
        if(worker.state==='installed' && navigator.serviceWorker.controller){
          handleWaiting();
        }
      });
    });

    navigator.serviceWorker.addEventListener('controllerchange',()=>{
      safeReloadForUpdate();
    });

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

window.addEventListener('load',setupPwaUpdater);


let oneSignalUiReady=false;
let oneSignalInstance=null;

function isStandaloneApp(){
  return window.matchMedia('(display-mode: standalone)').matches ||
         window.navigator.standalone === true;
}

function isIOSDevice(){
  return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
         (navigator.platform==='MacIntel' && navigator.maxTouchPoints>1);
}

function setPushToggleUi(on,status){
  const rows=[
    ['#pushNotificationToggle','#pushNotificationStatus'],
    ['#desktopPushNotificationToggle','#desktopPushNotificationStatus']
  ];
  rows.forEach(([buttonSelector,statusSelector])=>{
    const button=$(buttonSelector);
    const label=$(statusSelector);
    if(!button)return;
    button.classList.toggle('is-on',!!on);
    button.setAttribute('aria-pressed',on?'true':'false');
    if(label)label.textContent=status;
  });
}

function refreshPushToggleUi(){
  if(!oneSignalInstance){
    setPushToggleUi(false,'Push unavailable');
    return;
  }

  const supported=oneSignalInstance.Notifications.isPushSupported();
  if(!supported){
    setPushToggleUi(false,'Not supported on this device');
    return;
  }

  if(isIOSDevice() && !isStandaloneApp()){
    setPushToggleUi(false,'Install app to enable');
    return;
  }

  const permission=oneSignalInstance.Notifications.permission;
  const optedIn=oneSignalInstance.User.PushSubscription.optedIn === true;

  if(permission && optedIn){
    setPushToggleUi(true,'Enabled');
  }else if(permission && !optedIn){
    setPushToggleUi(false,'Disabled');
  }else{
    setPushToggleUi(false,'Tap to enable');
  }
}

async function togglePushNotifications(){
  if(!oneSignalUiReady || !oneSignalInstance){setPushToggleUi(false,'Tap to enable');return;}

  const OneSignal=oneSignalInstance;
  if(!OneSignal.Notifications.isPushSupported()){
    setPushToggleUi(false,'Not supported on this device');
    return;
  }

  if(isIOSDevice() && !isStandaloneApp()){
    setPushToggleUi(false,'Add app to Home Screen first');
    alert('On iPhone, push notifications work only from the installed Don Miguel App. Add it to the Home Screen and open it from there.');
    return;
  }

  try{
    const currentlyOptedIn=OneSignal.User.PushSubscription.optedIn === true;

    if(currentlyOptedIn){
      OneSignal.User.PushSubscription.optOut();
      setTimeout(refreshPushToggleUi,150);
      return;
    }

    if(!OneSignal.Notifications.permission){
      await OneSignal.Notifications.requestPermission();
    }

    if(OneSignal.Notifications.permission){
      OneSignal.User.PushSubscription.optIn();
    }

    setTimeout(refreshPushToggleUi,250);
  }catch(e){
    console.warn('Push toggle failed',e);
    setPushToggleUi(false,'Could not enable');
  }
}



function setupPushNotificationControls(){
  const mobile=$('#pushNotificationToggle');
  const desktop=$('#desktopPushNotificationToggle');
  if(mobile)mobile.addEventListener('click',togglePushNotifications);
  if(desktop)desktop.addEventListener('click',togglePushNotifications);

  const connect=(OneSignal)=>{
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

  setTimeout(()=>{
    if(!oneSignalUiReady)setPushToggleUi(false,'Tap to enable');
  },8000);
}

window.addEventListener('load',setupPushNotificationControls);
load();
setupPullToRefresh();


wakeServer();

document.addEventListener('visibilitychange',()=>{
  if(document.visibilityState==='visible') wakeServer();
});


window.addEventListener('pageshow',()=>{
  setTimeout(refreshLatestRelease,250);
});
window.addEventListener('focus',()=>{
  setTimeout(refreshLatestRelease,250);
});
document.addEventListener('visibilitychange',()=>{
  if(document.visibilityState==='visible')setTimeout(refreshLatestRelease,250);
});


function setupLegalDialogs(){
  const menu=$('#menuDialog');
  const imprint=$('#imprintDialog');
  const privacy=$('#privacyDialog');
  const closeImprint=$('#closeImprint');
  const closePrivacy=$('#closePrivacy');

  function openLegal(which,e){
    if(e)e.preventDefault();
    const dialog=which==='imprint'?imprint:privacy;
    if(!dialog)return;
    if(menu?.open)menu.close();
    dialog.showModal();
    const scroller=dialog.querySelector('.links-content');
    if(scroller)scroller.scrollTop=0;
  }

  document.querySelectorAll('[data-open-legal="imprint"]').forEach(a=>{
    a.addEventListener('click',e=>openLegal('imprint',e));
  });
  document.querySelectorAll('[data-open-legal="privacy"]').forEach(a=>{
    a.addEventListener('click',e=>openLegal('privacy',e));
  });

  closeImprint?.addEventListener('click',()=>imprint?.close());
  closePrivacy?.addEventListener('click',()=>privacy?.close());

  [imprint,privacy].forEach(dialog=>{
    dialog?.addEventListener('click',e=>{
      if(e.target===dialog)dialog.close();
    });
  });
}
window.addEventListener('load',setupLegalDialogs);
