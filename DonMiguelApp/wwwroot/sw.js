self.addEventListener('message',event=>{
  if(event.data?.type==='SKIP_WAITING')self.skipWaiting();
});
const CACHE='donmiguel-v2.7.5';
const ASSETS=['/','/index.html','/styles.css?v=2.7.5','/app.js?v=2.7.5','/manifest.webmanifest','/assets/dmc-mark.png','/assets/news-fallback.jpg','/assets/icons/icon-192.png'];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS)).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim())));

// Network first, cache as offline fallback.
// Only the app's own files are cached. API responses (which carry a new
// cache-busting timestamp on every request), the push worker and third-party
// content (YouTube, thumbnails, OneSignal) are left alone, so the cache can
// no longer grow without limit.
let lastSlowLoad=0;
self.addEventListener('fetch',event=>{
  const request=event.request;
  if(request.method!=='GET')return;
  const url=new URL(request.url);
  if(url.origin!==self.location.origin)return;
  if(url.pathname.startsWith('/api/')||url.pathname.startsWith('/push/'))return;

  // All page loads (including "/?updated=…&t=…") share one cache entry.
  const cacheKey=request.mode==='navigate'?'/index.html':request;

  // The free server sleeps when unused and needs a while to wake up. If it has
  // not answered within 2 seconds, the stored copy is used, so the app (and its
  // preloader) appears at once. The network answer still updates the store.
  const network=fetch(request).then(response=>{
    if(response.ok&&response.type==='basic'){
      const copy=response.clone();
      caches.open(CACHE).then(cache=>cache.put(cacheKey,copy));
    }
    return response;
  });
  event.respondWith(new Promise(resolve=>{
    let done=false;
    const finish=response=>{if(!done&&response){done=true;resolve(response);}};
    const fromCache=()=>caches.match(cacheKey).then(cached=>{
      if(cached)finish(cached);
      return cached;
    });
    // Once a page load had to fall back, the files it needs (styles, script)
    // come from the store at once instead of waiting another 2 seconds each.
    const slowServer=Date.now()-lastSlowLoad<60000;
    const timer=setTimeout(()=>{
      if(request.mode==='navigate')lastSlowLoad=Date.now();
      fromCache();
    },request.mode==='navigate'||!slowServer?2000:0);
    network.then(response=>{clearTimeout(timer);finish(response);})
      .catch(()=>{clearTimeout(timer);fromCache().then(cached=>{if(!cached)finish(Response.error());});});
  }));
  event.waitUntil(network.catch(()=>{}));
});
