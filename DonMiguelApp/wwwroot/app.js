'use strict';

const APP_VERSION='2.0.7';

const PLAYLISTS = Object.freeze({
  'All': 'PLrIIvPdks_sFn2nPjFm_nCTdAYuC7Z2SJ',
  'Bachata': 'PLrIIvPdks_sHnjrKxo9AyXzQThQFQb4fg',
  'Merengue': 'PLrIIvPdks_sHfOHEPyeO85eLAnro2g_Wv',
  'Salsa': 'PLrIIvPdks_sGtYNQcxPbsCxeyO9KuNWHy',
  'Reggaetón': 'PLrIIvPdks_sFLTemRJ-MHS-k-2egExpwv',
  'Ballads': 'PLrIIvPdks_sET8awM4mOlB2o9jHtAIvxP',
  'Mixtape': 'PLrIIvPdks_sEDekjQX9uG8TGbPbDF4mTe'
});

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
    ['TikTok','https://www.tiktok.com/@loopweb','tiktok.svg'],
    ['Facebook','https://www.facebook.com/donmiguel.music/','facebook.svg'],
    ['X / Twitter','https://x.com/loopweb','x.svg'],
    ['Onplug','https://onplug.net/pages/migflow','onplug.svg']
  ]
};

const genres=Object.keys(PLAYLISTS);

const state={
  videos:[],
  filtered:[],
  playlistCache:new Map(),
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
  videoFrame:$('#videoFrame'),exitCinema:$('#exitCinemaButton'),fullscreen:$('#fullscreenButton'),
  seek:$('#seekBar'),timeCurrent:$('#timeCurrent'),timeTotal:$('#timeTotal'),
  nowTitle:$('#nowTitle'),nowMeta:$('#nowMeta'),
  play:$('#playPauseButton'),prev:$('#previousButton'),next:$('#nextButton'),
  shuffle:$('#shuffleButton'),repeat:$('#repeatButton'),
  commentsButton:$('#commentsButton'),commentBadge:$('#commentBadge'),
  sheet:$('#commentsSheet'),sheetHead:$('#commentsSheetHead'),comments:$('#comments'),
  commentCount:$('#commentCount'),closeComments:$('#closeComments'),
  poster:$('#heroPoster'),posterImage:$('#heroImage'),
  search:$('#searchInput'),genres:$('#genreBar'),libraryHeading:$('#libraryHeading'),
  count:$('#trackCount'),status:$('#statusBox'),list:$('#trackList'),
  tabs:[...document.querySelectorAll('.tab[data-view]')],
  views:{
    home:$('#view-home'),
    library:$('#view-library'),
    links:$('#view-links'),
    settings:$('#view-settings')
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

/* ---------- Preloader ---------- */

const preloaderStartedAt=Date.now();
let preloaderClosed=false;
function setPreloaderText(text){if(els.preloaderText)els.preloaderText.textContent=text;}
function closePreloader(){
  if(preloaderClosed)return;
  preloaderClosed=true;
  const delay=Math.max(0,650-(Date.now()-preloaderStartedAt));
  window.setTimeout(()=>{
    document.body.classList.remove('is-loading');
    els.app?.removeAttribute('aria-hidden');
    els.preloader?.classList.add('is-hidden');
    window.setTimeout(()=>els.preloader?.remove(),400);
  },delay);
}
window.setTimeout(closePreloader,8000);

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
  try{
    const status=await fetch('/api/status').then(check);
    if(!status.configured)throw new Error('YouTube API key is not configured.');
    const [allTracks,latest,channelInfo]=await Promise.all([
      fetchPlaylist('All'),
      fetch(`/api/youtube/latest?_=${Date.now()}`,{cache:'no-store'}).then(check),
      fetch(`/api/youtube/channel?_=${Date.now()}`,{cache:'no-store'}).then(check)
    ]);
    state.subscriberCount=Number(channelInfo?.subscriberCount)||0;
    state.videos=allTracks;
    state.latestVideo=latest||state.videos[0]||null;
    renderRelease();
    renderGenres();
    applyFilters();
    els.status.hidden=true;
    const first=state.latestVideo?.id||state.videos[0]?.id;
    if(first)selectTrack(first,false);
  }catch(e){
    els.status.textContent=e.message;
    els.status.hidden=false;
    els.poster.classList.remove('is-loading-card');
    els.nowTitle.textContent='Content unavailable';
  }finally{
    closePreloader();
  }
  loadCommunityNews();
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

/* ---------- Library ---------- */

function renderGenres(){
  els.genres.innerHTML=genres.map(g=>`<button class="chip" type="button" data-genre="${esc(g)}" aria-pressed="${g===state.genre}">${esc(g==='All'?'All tracks':g)}</button>`).join('');
  els.genres.querySelectorAll('[data-genre]').forEach(b=>b.onclick=()=>changeGenre(b.dataset.genre));
  els.libraryHeading.textContent=state.genre==='All'?'All tracks':state.genre;
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
    els.status.hidden=true;
  }catch(e){
    state.videos=[];
    applyFilters();
    els.status.textContent=e.message;
  }finally{
    state.loadingGenre=false;
  }
}

function applyFilters(){
  const q=state.query.trim().toLocaleLowerCase('en');
  state.filtered=state.videos.filter(v=>!q||`${v.title} ${v.description}`.toLocaleLowerCase('en').includes(q));
  renderList();
}

function renderList(){
  els.count.textContent=`${state.filtered.length} ${state.filtered.length===1?'track':'tracks'}`;
  if(!state.filtered.length){
    els.list.innerHTML=state.videos.length?'<li class="status-box">No matching tracks found.</li>':'';
    return;
  }
  els.list.innerHTML=state.filtered.map(v=>`<li><button class="track${v.id===state.selectedId?' is-current':''}" type="button" data-id="${esc(v.id)}"><img src="${esc(v.thumbnail)}" alt="" loading="lazy"><span class="track-copy"><strong>${esc(displayTitle(v.title))}</strong><small>${esc(relativeDate(v.publishedAt))}</small></span><span class="track-side"><span class="eq" aria-hidden="true"><i></i><i></i><i></i></span>${esc(v.duration||'')}</span></button></li>`).join('');
  els.list.querySelectorAll('[data-id]').forEach(b=>b.onclick=()=>selectTrack(b.dataset.id,true));
}

function markCurrentTrack(){
  els.list.querySelectorAll('.track').forEach(b=>{
    const current=b.dataset.id===state.selectedId;
    b.classList.toggle('is-current',current);
    if(current)b.setAttribute('aria-current','true');else b.removeAttribute('aria-current');
  });
}

els.search.addEventListener('input',e=>{state.query=e.target.value;applyFilters();});

/* ---------- Links ---------- */

// Compact text tiles, no logos.
function textLinkRow(name,url){
  return `<a class="link-tile" href="${esc(url)}" target="_blank" rel="noopener"><span>${esc(name)}</span><b aria-hidden="true">↗</b></a>`;
}
$('#musicLinks').innerHTML=linkGroups.music.map(([name,url])=>textLinkRow(name,url)).join('');
$('#officialLinks').innerHTML=linkGroups.official.map(([name,url])=>textLinkRow(name,url)).join('');
$('#socialLinks').innerHTML=linkGroups.social.map(([name,url])=>textLinkRow(name,url)).join('');

/* ---------- Player ---------- */

function selectTrack(id,shouldPlay=true){
  const v=findVideo(id);
  if(!v)return;
  state.selectedId=id;
  state.pendingVideoId=id;
  state.pendingPlay=!!shouldPlay;
  if(shouldPlay)dismissPoster();
  els.nowTitle.textContent=displayTitle(v.title);
  const meta=['Don Miguel de Cabarete'];
  if(v.viewCount)meta.push(`${compact(v.viewCount)} views`);
  els.nowMeta.textContent=meta.join(' · ');
  updateCommentBadge(v);
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

/* ---------- Full screen ---------- */

function fullscreenElement(){return document.fullscreenElement||document.webkitFullscreenElement||null;}
// Phone held upright in full screen: turn the picture 90° so the video
// fills the screen sideways. iPhone browsers never allow apps to rotate the
// screen and some Android browsers refuse it, so this covers both.
const portraitQuery=window.matchMedia('(orientation: portrait)');
function isFullscreenActive(){return !!fullscreenElement()||document.body.classList.contains('cinema');}
function updateRotation(){
  els.videoFrame.classList.toggle('rotate',isFullscreenActive()&&portraitQuery.matches);
}
if(portraitQuery.addEventListener)portraitQuery.addEventListener('change',updateRotation);
else if(portraitQuery.addListener)portraitQuery.addListener(updateRotation);

function enterCinema(){
  document.body.classList.add('cinema');
  els.exitCinema.hidden=false;
  updateRotation();
}
function leaveFullscreen(){
  if(fullscreenElement()){
    const exit=document.exitFullscreen||document.webkitExitFullscreen;
    try{exit?.call(document);}catch{}
  }
  document.body.classList.remove('cinema');
  els.exitCinema.hidden=true;
  updateRotation();
}
function enterFullscreen(){
  const frame=els.videoFrame;
  const request=frame.requestFullscreen||frame.webkitRequestFullscreen;
  if(!request){enterCinema();return;}
  try{
    const result=request.call(frame);
    if(result&&typeof result.catch==='function')result.catch(enterCinema);
  }catch{
    enterCinema();
  }
}
async function onFullscreenChange(){
  els.exitCinema.hidden=!isFullscreenActive();
  if(fullscreenElement()){
    // Ask for landscape first (works on many Android phones) ...
    try{await screen.orientation?.lock?.('landscape');}catch{}
  }else{
    try{screen.orientation?.unlock?.();}catch{}
  }
  // ... and rotate the picture ourselves if the phone is still upright.
  updateRotation();
}
els.fullscreen.addEventListener('click',enterFullscreen);
els.exitCinema.addEventListener('click',leaveFullscreen);
document.addEventListener('fullscreenchange',onFullscreenChange);
document.addEventListener('webkitfullscreenchange',onFullscreenChange);
document.addEventListener('keydown',e=>{
  if(e.key!=='Escape')return;
  if(document.body.classList.contains('cinema'))leaveFullscreen();
  else if(!els.sheet.hidden)closeComments();
});

/* ---------- Comments sheet ---------- */

function updateCommentBadge(video){
  const n=Number(video?.commentCount)||0;
  els.commentBadge.hidden=n<=0;
  els.commentBadge.textContent=n>99?'99+':String(n);
  els.commentsButton.setAttribute('aria-label',n>0?`Show comments (${n})`:'Show comments');
}

function openComments(){
  if(!state.selectedId)return;
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

// Swipe down on the sheet header to close it.
(function setupSheetSwipe(){
  let startY=null;
  els.sheetHead.addEventListener('touchstart',e=>{if(e.touches.length===1)startY=e.touches[0].clientY;},{passive:true});
  els.sheetHead.addEventListener('touchend',e=>{
    if(startY===null)return;
    const dy=(e.changedTouches[0]?.clientY??startY)-startY;
    startY=null;
    if(dy>50)closeComments();
  },{passive:true});
})();

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
    loadCommunityNews();
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
  const scroller=els.content;
  if(!indicator||!scroller)return;
  const arrow=indicator.querySelector('.pull-refresh-arrow');
  const threshold=74;
  let startY=0,distance=0,tracking=false;

  function resetIndicator(delay=0){
    setTimeout(()=>{
      indicator.classList.remove('visible','ready','refreshing');
      indicator.style.setProperty('--pull-distance','0px');
      arrow.textContent='↓';
    },delay);
  }

  scroller.addEventListener('touchstart',e=>{
    if(pullRefreshBusy||scroller.scrollTop>0||e.touches.length!==1||!els.sheet.hidden)return;
    startY=e.touches[0].clientY;
    distance=0;
    tracking=true;
  },{passive:true});

  scroller.addEventListener('touchmove',e=>{
    if(!tracking||e.touches.length!==1)return;
    const delta=e.touches[0].clientY-startY;
    if(delta<=0||scroller.scrollTop>0){
      distance=0;
      resetIndicator();
      return;
    }
    distance=Math.min(110,delta*.55);
    if(distance<8)return;
    e.preventDefault();
    indicator.classList.add('visible');
    indicator.style.setProperty('--pull-distance',`${distance}px`);
    const ready=distance>=threshold;
    indicator.classList.toggle('ready',ready);
    arrow.textContent=ready?'↻':'↓';
  },{passive:false});

  scroller.addEventListener('touchend',async()=>{
    if(!tracking)return;
    tracking=false;
    if(distance<threshold){resetIndicator();return;}
    indicator.classList.remove('ready');
    indicator.classList.add('visible','refreshing');
    indicator.style.setProperty('--pull-distance','54px');
    arrow.textContent='↻';
    const ok=await refreshVisibleContent();
    arrow.textContent=ok?'✓':'!';
    resetIndicator(650);
    distance=0;
  },{passive:true});

  scroller.addEventListener('touchcancel',()=>{tracking=false;distance=0;resetIndicator();},{passive:true});
}

/* ---------- Community news (inline on Home) ---------- */

// Safely turn visible URLs in YouTube post text into clickable links.
// Everything else remains a text node (no untrusted HTML injection).
function renderCommunityNewsText(element,value){
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
function renderCommunityNewsRuns(element,post){
  const runs=post.runs;
  if(!Array.isArray(runs)||!runs.length){
    renderCommunityNewsText(element,post.text);
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
      renderCommunityNewsText(span,label);
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

// The backend refreshes the post at most every six hours.
// If nothing comes back (e.g. the server was just waking up), try again a
// couple of times and whenever the app is opened again.
let newsLoaded=false;
let newsRetries=0;
let newsRetryTimer=null;
function scheduleNewsRetry(){
  if(newsLoaded||newsRetries>=3||newsRetryTimer)return;
  newsRetries++;
  newsRetryTimer=setTimeout(()=>{newsRetryTimer=null;loadCommunityNews();},20000*newsRetries);
}
async function loadCommunityNews(){
  const status=$('#communityNewsStatus');
  const content=$('#newsContent');
  const imageButton=$('#newsImageButton');
  const image=$('#communityNewsImage');
  const text=$('#communityNewsText');
  try{
    const response=await fetch('/api/youtube/community/latest',{cache:'no-store'});
    if(!response.ok||response.status===204)throw new Error('No current public post available');
    const post=await response.json();
    if(!post?.text&&!post?.imageUrl)throw new Error('Post unavailable');
    if(post.text){renderCommunityNewsRuns(text,post);text.hidden=false;}
    else text.hidden=true;
    if(post.imageUrl){image.src=post.imageUrl;imageButton.hidden=false;}
    else imageButton.hidden=true;
    // Image left, text right — only when there is both.
    content.classList.toggle('has-image',!!post.imageUrl&&!!post.text);
    status.hidden=true;
    newsLoaded=true;
  }catch{
    scheduleNewsRetry();
    if(text.hidden&&imageButton.hidden){
      status.textContent='No news right now – check back soon.';
      status.hidden=false;
    }
  }
}

// Tap the news image to see it full size.
(function setupNewsImageDialog(){
  const dialog=$('#imageDialog');
  const big=$('#imageDialogImage');
  $('#newsImageButton')?.addEventListener('click',()=>{
    const src=$('#communityNewsImage')?.src;
    if(!src||!dialog)return;
    big.src=src;
    dialog.showModal();
  });
  $('#closeImageDialog')?.addEventListener('click',()=>dialog.close());
  dialog?.addEventListener('click',e=>{if(e.target===dialog||e.target===big)dialog.close();});
})();

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
  if(!newsLoaded){newsRetries=0;loadCommunityNews();}
  setTimeout(refreshLatestRelease,250);
});
window.addEventListener('pageshow',()=>setTimeout(refreshLatestRelease,250));
window.addEventListener('focus',()=>setTimeout(refreshLatestRelease,250));
