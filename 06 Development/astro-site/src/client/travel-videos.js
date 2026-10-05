// Preview rotation never controls media playback. Only a deliberate watch click
// mounts a player; removing that iframe on navigation also stops its audio.
export function createPreviewRotation({count, onSlide, onState = () => {}, reducedMotion = false, delay = 9000, schedule = setTimeout, cancel = clearTimeout}) {
 let index = 0, paused = reducedMotion, watching = false, timer = null, generation = 0;
 const blockers = new Set();
 const eligible = () => count > 1 && !paused && !watching && blockers.size === 0;
 const state = () => ({index, paused, watching, rotating: eligible()});
 function refresh() {
  if (timer !== null) cancel(timer);
  timer = null;
  const current = ++generation;
  if (eligible()) timer = schedule(() => {
   if (generation !== current || !eligible()) return;
   timer = null;
   index = (index + 1) % count;
   onSlide(index);
   refresh();
  }, delay);
  onState(state());
 }
 const api = {
  state,
  replace(nextCount, nextIndex = 0) {
   if (watching || !Number.isInteger(nextCount) || nextCount < 0) return false;
   count = nextCount;
   index = nextIndex >= 0 && nextIndex < count ? nextIndex : 0;
   refresh();
   return true;
  },
  move(direction) {
   if (count < 2) return;
   if (watching) { watching = false; paused = true; }
   index = (index + direction + count) % count;
   onSlide(index);
   refresh();
  },
  watch(shownIndex = index) {
   if (Number.isInteger(shownIndex) && shownIndex >= 0 && shownIndex < count) index = shownIndex;
   watching = true; paused = true; refresh();
  },
  pause() { paused = true; refresh(); },
  resume() { watching = false; paused = false; refresh(); },
  back() { watching = false; paused = true; refresh(); },
  block(reason, blocked) {
   if (blockers.has(reason) === blocked) return;
   if (blocked) blockers.add(reason); else blockers.delete(reason);
   refresh();
  },
  destroy() { if (timer !== null) cancel(timer); timer = null; generation++; }
 };
 refresh();
 return api;
}

export function youtubeEmbedUrl(id) {
 if (!/^[A-Za-z0-9_-]{11}$/.test(id)) throw new Error('Invalid video ID');
 // autoplay is requested only in response to the explicit Watch gesture.
 return `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&playsinline=1&rel=0`;
}

// The browser never contacts Data API or holds its key. Expired projections
// become a plain YouTube link; a short API outage keeps the last good cache.
export function parsePublicPlaylist(data, playlistId, now = Date.now()) {
 if (!data || data.version !== 1 || data.source !== 'youtube-data-api-v3' || data.playlistId !== playlistId
     || !Array.isArray(data.videos) || data.videos.length > 500) return null;
 const fetched = Date.parse(data.fetchedAt), expires = Date.parse(data.expiresAt);
 if (!Number.isFinite(fetched) || !Number.isFinite(expires) || fetched > now + 300000
     || expires <= fetched || expires - fetched > 86400000) return null;
 if (expires <= now) return {expired: true, videos: []};
 const videos = [], ids = new Set();
 for (const item of data.videos) {
  if (!item || !/^[A-Za-z0-9_-]{11}$/.test(item.id) || typeof item.title !== 'string'
      || !item.title.trim() || item.title.length > 300 || ids.has(item.id)) return null;
  ids.add(item.id);
  videos.push({id: item.id, title: item.title});
 }
 return {expired: false, videos};
}

export async function fetchPublicPlaylist(playlistId, {fetcher = fetch, signal} = {}) {
 try {
  const response = await fetcher('/api/public/youtube-playlist.json', {signal, credentials: 'omit', cache: 'no-cache'});
  if (!response.ok) return null;
  const raw = await response.text();
  if (raw.length > 250000) return null;
  return parsePublicPlaylist(JSON.parse(raw), playlistId);
 } catch { return null; }
}

// Decode first, then commit image + caption + watch target together. A fast
// arrow click or Watch invalidates older loads without ever publishing them.
export function createPosterSwap({prepare, commit, fallback}) {
 let generation = 0;
 return {
  async show(video, index) {
   const request = ++generation;
   let image;
   try { image = await prepare(video); }
   catch { if (request === generation) fallback(video, index); return; }
   if (request === generation) commit(image, video, index);
  },
  cancel() { generation++; }
 };
}

function decodePoster(video) {
 return new Promise((resolve, reject) => {
  const image = new Image(480, 360);
  image.alt = '';
  image.decoding = 'async';
  image.referrerPolicy = 'no-referrer';
  image.dataset.playlistPoster = '';
  let finished = false;
  const finish = (error) => {
   if (finished) return;
   finished = true;
   clearTimeout(timeout);
   image.onload = image.onerror = null;
   if (error) reject(error); else resolve(image);
  };
  const timeout = setTimeout(() => finish(new Error('Poster timed out')), 5000);
  image.onerror = () => finish(new Error('Poster unavailable'));
  image.onload = async () => {
   try { if (image.decode) await image.decode(); finish(); }
   catch { finish(new Error('Poster decode failed')); }
  };
  image.src = `https://i.ytimg.com/vi/${video.id}/hqdefault.jpg`;
 });
}

export function mountTravelVideos(player) {
 const source = player.querySelector('[data-video-items]');
 let videos = Array.from(source.content.querySelectorAll('[data-id]'))
  .map(item => ({id: item.dataset.id, title: item.dataset.title || ''}))
  .filter(item => /^[A-Za-z0-9_-]{11}$/.test(item.id));
 if (!videos.length) return;
 const launch = player.querySelector('[data-playlist-launch]');
 const poster = player.querySelector('[data-playlist-poster]');
 const slot = player.querySelector('[data-playlist-frame]');
 const close = player.querySelector('[data-playlist-close]');
 const previous = player.querySelector('[data-video-prev]');
 const next = player.querySelector('[data-video-next]');
 const automatic = player.querySelector('[data-video-auto]');
 const icon = player.querySelector('[data-auto-icon]');
 const title = player.querySelector('[data-video-title]');
 const controls = player.querySelector('[data-preview-controls]');
 const en = player.dataset.locale === 'en';
 const motion = matchMedia('(prefers-reduced-motion: reduce)');
 let current = 0, fadeTimer = null, interacted = false, disposed = false;
 const rememberInteraction = () => { interacted = true; };
 player.addEventListener('pointerdown', rememberInteraction, {capture: true});
 player.addEventListener('focusin', rememberInteraction);
 function clearPlayer() {
  slot.replaceChildren();
  slot.hidden = true;
  launch.hidden = false;
  close.hidden = true;
  controls.hidden = false;
  player.dataset.watching = 'false';
 }
 function commitCaption(video, index) {
  current = index;
  launch.href = title.href = `https://www.youtube.com/watch?v=${video.id}`;
  launch.setAttribute('aria-label', `${en ? 'Watch' : 'Смотреть'}: ${video.title}`);
  title.textContent = video.title;
  title.setAttribute('aria-label', `${en ? 'Open on YouTube' : 'Открыть на YouTube'}: ${video.title}`);
 }
 const swap = createPosterSwap({
  prepare: decodePoster,
  commit(image, video, index) {
   if (fadeTimer !== null) clearTimeout(fadeTimer);
   const layers = Array.from(launch.querySelectorAll('[data-playlist-poster]'));
   // Keep only the most recent old layer, fully visible under the incoming one.
   const old = layers.pop();
   layers.forEach(layer => layer.remove());
   if (old) delete old.dataset.crossfade;
   if (!motion.matches && old && !old.hidden) image.dataset.crossfade = 'true';
   launch.insertBefore(image, launch.querySelector('.playlist-play'));
   commitCaption(video, index);
   if (image.dataset.crossfade) {
    fadeTimer = setTimeout(() => { old?.remove(); delete image.dataset.crossfade; fadeTimer = null; }, 380);
   } else old?.remove();
  },
  fallback(video, index) {
   if (fadeTimer !== null) clearTimeout(fadeTimer);
   fadeTimer = null;
   launch.querySelectorAll('[data-playlist-poster]').forEach(image => image.remove());
   // A missing poster must not keep another video's image under this caption.
   commitCaption(video, index);
  }
 });
 function showSlide(index) {
  clearPlayer();
  void swap.show(videos[index], index);
 }
 const rotation = createPreviewRotation({
  count: videos.length,
  reducedMotion: motion.matches,
  onSlide: showSlide,
  onState(state) {
   const label = state.watching
    ? (en ? 'Return to preview rotation' : 'Продолжить подборку превью')
    : state.paused
     ? (en ? 'Resume preview rotation' : 'Продолжить смену превью')
     : (en ? 'Pause preview rotation' : 'Приостановить смену превью');
   automatic.setAttribute('aria-label', label);
   automatic.title = label;
   icon.textContent = state.watching ? '↻' : state.paused ? '▶' : 'Ⅱ';
  }
 });
 const refreshController = new AbortController();
 const refreshTimeout = setTimeout(() => refreshController.abort(), 3000);
 void fetchPublicPlaylist(player.dataset.playlistId, {signal: refreshController.signal}).then(data => {
  clearTimeout(refreshTimeout);
  // A slow metadata response must never interrupt watching, navigation or focus.
  if (disposed || interacted || rotation.state().watching) return;
  if (!data) {
   // The committed editorial fallback is useful for a brief cold start, not an
   // evergreen substitute for synchronizing removals/privacy changes on YouTube.
   const age = Date.now() - Date.parse(player.dataset.snapshotAt);
   if (Number.isFinite(age) && age >= 0 && age < 86400000) return;
   data = {videos: []};
  }
  swap.cancel();
  const shownId = videos[current].id;
  videos = data.videos;
  const retained = videos.findIndex(video => video.id === shownId);
  current = retained < 0 ? 0 : retained;
  rotation.replace(videos.length, current);
  if (!videos.length) {
   clearPlayer();
   launch.querySelectorAll('[data-playlist-poster]').forEach(image => image.remove());
   player.hidden = true;
   const fallback = player.parentElement.querySelector('[data-playlist-fallback]');
   if (fallback) fallback.hidden = false;
   return;
  }
  for (const element of [previous, next, automatic]) element.hidden = videos.length < 2;
  // Keep caption, image and watch ID aligned even before the next image decodes.
  if (retained < 0) launch.querySelectorAll('[data-playlist-poster]').forEach(image => image.remove());
  commitCaption(videos[current], current);
  if (retained < 0) showSlide(current);
  player.dataset.playlistSource = 'youtube-data-api-v3';
 });
 for (const element of [previous, next, automatic]) element.hidden = videos.length < 2;
 poster.addEventListener('error', () => { poster.hidden = true; });
 launch.addEventListener('click', event => {
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  event.preventDefault();
  if (slot.childElementCount) return;
  swap.cancel();
  rotation.watch(current);
  const frame = document.createElement('iframe');
  frame.src = youtubeEmbedUrl(videos[current].id);
  frame.title = `YouTube · ${videos[current].title}`;
  frame.allow = 'autoplay; encrypted-media; fullscreen; picture-in-picture';
  frame.allowFullscreen = true;
  frame.referrerPolicy = 'strict-origin-when-cross-origin';
  slot.append(frame);
  slot.hidden = false;
  launch.hidden = true;
  close.hidden = false;
  controls.hidden = true;
  player.dataset.watching = 'true';
  frame.focus({preventScroll: true});
 });
 close.addEventListener('click', () => {
  clearPlayer();
  rotation.back();
  launch.focus({preventScroll: true});
 });
 previous.addEventListener('click', () => rotation.move(-1));
 next.addEventListener('click', () => rotation.move(1));
 automatic.addEventListener('click', () => {
  const state = rotation.state();
  if (state.watching) { clearPlayer(); rotation.resume(); }
  else if (state.paused) rotation.resume();
  else rotation.pause();
 });
 // Hover is temporary; keyboard focus and an explicit pause remain latched.
 player.addEventListener('pointerenter', event => { if (event.pointerType === 'mouse') rotation.block('hover', true); });
 player.addEventListener('pointerleave', () => rotation.block('hover', false));
 player.addEventListener('focusin', event => { if (event.target !== automatic) rotation.pause(); });
 const visibility = () => rotation.block('hidden', document.hidden);
 document.addEventListener('visibilitychange', visibility);
 visibility();
 const reduced = () => { if (motion.matches) rotation.pause(); };
 motion.addEventListener('change', reduced);
 let observer;
 if ('IntersectionObserver' in window) {
  rotation.block('offscreen', true);
  observer = new IntersectionObserver(entries => rotation.block('offscreen', !entries[0].isIntersecting), {threshold: 0});
  observer.observe(player);
 }
 // Do not hijack a horizontal swipe inside the YouTube player itself.
 let touch;
 launch.addEventListener('pointerdown', event => { if (event.pointerType === 'touch') touch = {x: event.clientX, y: event.clientY}; });
 launch.addEventListener('pointercancel', () => { touch = undefined; });
 launch.addEventListener('pointerup', event => {
  if (!touch) return;
  const dx = event.clientX - touch.x, dy = event.clientY - touch.y;
  touch = undefined;
  if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5 && videos.length > 1) {
   // Prevent the synthesized click from starting video after a swipe.
   const suppress = e => { e.preventDefault(); e.stopImmediatePropagation(); };
   launch.addEventListener('click', suppress, {once: true, capture: true});
   setTimeout(() => launch.removeEventListener('click', suppress, true), 400);
   rotation.move(dx < 0 ? 1 : -1);
  }
 });
 window.addEventListener('pagehide', () => { swap.cancel(); rotation.block('pagehide', true); clearPlayer(); rotation.back(); });
 window.addEventListener('pageshow', () => { rotation.block('pagehide', false); visibility(); });
 return () => {
  disposed = true;
  refreshController.abort();
  clearTimeout(refreshTimeout);
  player.removeEventListener('pointerdown', rememberInteraction, true);
  player.removeEventListener('focusin', rememberInteraction);
  rotation.destroy();
  swap.cancel();
  if (fadeTimer !== null) clearTimeout(fadeTimer);
  observer?.disconnect();
  document.removeEventListener('visibilitychange', visibility);
  motion.removeEventListener('change', reduced);
  clearPlayer();
 };
}

if (typeof document !== 'undefined') {
 const player = document.querySelector('[data-playlist-player]');
 if (player instanceof HTMLElement) mountTravelVideos(player);
}
