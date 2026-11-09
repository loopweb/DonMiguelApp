self.addEventListener('message',event=>{
  if(event.data?.type==='SKIP_WAITING')self.skipWaiting();
});
const CACHE='donmiguel-v2.0.0';
const ASSETS=['/','/index.html','/styles.css?v=2.0.0','/app.js?v=2.0.0','/manifest.webmanifest','/assets/icons/spotify.svg','/assets/icons/applemusic.svg','/assets/icons/amazonmusic.svg','/assets/icons/youtubemusic.svg','/assets/icons/youtube.svg','/assets/icons/laut.svg','/assets/icons/homepage.svg','/assets/icons/unitedmasters.svg','/assets/icons/whatsapp.svg','/assets/icons/instagram.svg','/assets/icons/tiktok.svg','/assets/icons/facebook.svg','/assets/icons/x.svg'];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS)).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim())));

// Network first, cache as offline fallback.
// Only the app's own files are cached. API responses (which carry a new
// cache-busting timestamp on every request), the push worker and third-party
// content (YouTube, thumbnails, OneSignal) are left alone, so the cache can
// no longer grow without limit.
self.addEventListener('fetch',event=>{
  const request=event.request;
  if(request.method!=='GET')return;
  const url=new URL(request.url);
  if(url.origin!==self.location.origin)return;
  if(url.pathname.startsWith('/api/')||url.pathname.startsWith('/push/'))return;

  // All page loads (including "/?updated=…&t=…") share one cache entry.
  const cacheKey=request.mode==='navigate'?'/index.html':request;

  event.respondWith(
    fetch(request).then(response=>{
      if(response.ok&&response.type==='basic'){
        const copy=response.clone();
        caches.open(CACHE).then(cache=>cache.put(cacheKey,copy));
      }
      return response;
    }).catch(()=>caches.match(cacheKey).then(cached=>cached||Response.error()))
  );
});
