import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import {createPreviewRotation, createPosterSwap, youtubeEmbedUrl, parsePublicPlaylist, fetchPublicPlaylist} from '../src/client/travel-videos.js';

function setup(reducedMotion = false, count = 3) {
 let sequence = 0;
 const scheduled = new Map(), slides = [];
 const rotation = createPreviewRotation({
  count, reducedMotion, onSlide: index => slides.push(index),
  schedule(fn, delay) { assert.equal(delay, 9000); const id = ++sequence; scheduled.set(id, fn); return id; },
  cancel(id) { scheduled.delete(id); }
 });
 const tick = () => { const [id, fn] = scheduled.entries().next().value ?? []; assert.ok(fn); scheduled.delete(id); fn(); };
 return {rotation, scheduled, slides, tick};
}

test('automatic previews wrap without invoking media playback', () => {
 const {rotation, tick, slides, scheduled} = setup();
 tick(); tick(); tick();
 assert.deepEqual(slides, [1, 2, 0]);
 assert.equal(scheduled.size, 1);
 assert.equal(rotation.state().watching, false);
 rotation.destroy();
 assert.equal(scheduled.size, 0);
});

test('watching/paused media never resumes rotation without explicit action', () => {
 const {rotation, scheduled, tick} = setup();
 rotation.watch();
 assert.equal(scheduled.size, 0);
 rotation.block('hover', true); rotation.block('hover', false);
 rotation.block('hidden', true); rotation.block('hidden', false);
 assert.equal(scheduled.size, 0);
 rotation.back();
 assert.equal(scheduled.size, 0);
 rotation.resume(); tick();
 assert.equal(rotation.state().index, 1);
});

test('manual pause survives temporary hover and viewport changes', () => {
 const {rotation, scheduled} = setup();
 rotation.block('hover', true); assert.equal(scheduled.size, 0);
 rotation.block('offscreen', true);
 rotation.block('hover', false); assert.equal(scheduled.size, 0);
 rotation.block('offscreen', false); assert.equal(scheduled.size, 1);
 rotation.pause(); rotation.block('hidden', true); rotation.block('hidden', false);
 assert.equal(scheduled.size, 0);
 rotation.resume(); assert.equal(scheduled.size, 1);
});

test('manual arrows invalidate an expired timer and stop an active player state', () => {
 const {rotation, scheduled, slides, tick} = setup();
 const oldTick = scheduled.values().next().value;
 rotation.move(-1);
 oldTick();
 assert.deepEqual(slides, [2]);
 tick(); assert.deepEqual(slides, [2, 0]);
 rotation.watch(); rotation.move(1);
 assert.equal(rotation.state().watching, false);
 assert.equal(rotation.state().paused, true);
 assert.equal(scheduled.size, 0);
});

test('reduced motion and a single video never start an automatic timer', () => {
 const reduced = setup(true);
 assert.equal(reduced.scheduled.size, 0);
 reduced.rotation.resume();
 assert.equal(reduced.scheduled.size, 1, 'explicit opt-in is permitted');
 reduced.rotation.destroy();
 const single = setup(false, 1);
 single.rotation.move(1); single.rotation.resume();
 assert.equal(single.scheduled.size, 0);
 assert.deepEqual(single.slides, []);
});

test('only validated IDs reach the privacy-enhanced embed', () => {
 assert.equal(new URL(youtubeEmbedUrl('Cf7nNu5gtiM')).hostname, 'www.youtube-nocookie.com');
 assert.equal(new URL(youtubeEmbedUrl('Cf7nNu5gtiM')).searchParams.get('autoplay'), '1');
 assert.throws(() => youtubeEmbedUrl('../malicious?key=secret'));
});

test('public snapshot contains real distinct IDs and no credential fields', async () => {
 const data = JSON.parse(await readFile(new URL('../src/data/travel-videos.json', import.meta.url), 'utf8'));
 assert.equal(data.playlistId, 'PLPOOzdEflpdk');
 assert.ok(data.videos.length > 1);
 assert.equal(new Set(data.videos.map(video => video.id)).size, data.videos.length);
 for (const video of data.videos) {
  assert.match(video.id, /^[A-Za-z0-9_-]{11}$/);
  assert.ok(video.title.trim());
  assert.deepEqual(Object.keys(video).sort(), ['id', 'title']);
 }
 assert.deepEqual(Object.keys(data).sort(), ['channelUrl', 'checkedAt', 'playlistId', 'source', 'videos']);
});

function pendingSwap() {
 const pending = [], published = [];
 const swap = createPosterSwap({
  prepare: video => new Promise((resolve, reject) => pending.push({video, resolve, reject})),
  commit: (_image, video, index) => published.push({id: video.id, index, failed: false}),
  fallback: (video, index) => published.push({id: video.id, index, failed: true})
 });
 return {swap, pending, published};
}

test('smooth cut commits caption/target only after decode, latest arrow wins', async () => {
 const {swap, pending, published} = pendingSwap();
 const first = swap.show({id: 'old'}, 1);
 const second = swap.show({id: 'new'}, 2);
 assert.deepEqual(published, []);
 pending[1].resolve({}); await second;
 pending[0].resolve({}); await first;
 assert.deepEqual(published, [{id: 'new', index: 2, failed: false}]);
});

test('Watch cancels pending poster swaps and navigation continues from visible ID', async () => {
 const {swap, pending, published} = pendingSwap();
 const request = swap.show({id: 'pending'}, 1);
 swap.cancel(); pending[0].resolve({}); await request;
 assert.deepEqual(published, []);
 const {rotation} = setup();
 rotation.move(1); // The next image is requested, not yet visible.
 rotation.watch(0); rotation.back(); rotation.move(1);
 assert.equal(rotation.state().index, 1);
 rotation.destroy();
});

test('a current poster failure uses fallback; obsolete failures do not replace the slide', async () => {
 const {swap, pending, published} = pendingSwap();
 const first = swap.show({id: 'obsolete'}, 1);
 const second = swap.show({id: 'current'}, 2);
 pending[0].reject(new Error('network')); await first;
 assert.deepEqual(published, []);
 pending[1].reject(new Error('network')); await second;
 assert.deepEqual(published, [{id: 'current', index: 2, failed: true}]);
});

const manifest = (videos = [{id: 'Cf7nNu5gtiM', title: 'Public title'}]) => ({
 version: 1, source: 'youtube-data-api-v3', playlistId: 'PLPOOzdEflpdk',
 fetchedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 86300000).toISOString(), videos
});

test('public projection validates playlist, IDs, duplicates, timestamps and expiry', () => {
 const data = manifest();
 assert.deepEqual(parsePublicPlaylist(data, data.playlistId).videos, data.videos);
 assert.equal(parsePublicPlaylist(data, 'other'), null);
 assert.equal(parsePublicPlaylist({...data, videos: [{id: '../unsafe', title: 'Bad'}]}, data.playlistId), null);
 assert.equal(parsePublicPlaylist({...data, videos: [data.videos[0], data.videos[0]]}, data.playlistId), null);
 assert.deepEqual(parsePublicPlaylist(data, data.playlistId, Date.now() + 86400000), {expired: true, videos: []});
 assert.equal(parsePublicPlaylist({...data, expiresAt: 'invalid'}, data.playlistId), null);
 assert.deepEqual(parsePublicPlaylist(manifest([]), data.playlistId), {expired: false, videos: []});
});

test('playlist metadata uses only same-origin public projection; outage is a fallback', async () => {
 const data = manifest();
 const result = await fetchPublicPlaylist(data.playlistId, {fetcher: async (url, options) => {
  assert.equal(url, '/api/public/youtube-playlist.json');
  assert.equal(options.credentials, 'omit');
  assert.equal(Object.hasOwn(options, 'headers'), false);
  return {ok: true, text: async () => JSON.stringify(data)};
 }});
 assert.deepEqual(result.videos, data.videos);
 assert.equal(await fetchPublicPlaylist(data.playlistId, {fetcher: async () => {throw Error('offline');}}), null);
});

test('metadata replacement invalidates old timers and never changes active playback', () => {
 const {rotation, scheduled, tick} = setup();
 const obsolete = scheduled.values().next().value;
 assert.equal(rotation.replace(2, 1), true);
 obsolete();
 assert.equal(rotation.state().index, 1);
 tick(); assert.equal(rotation.state().index, 0);
 rotation.watch();
 assert.equal(rotation.replace(7, 6), false);
 assert.equal(rotation.state().index, 0);
 assert.equal(rotation.state().watching, true);
 rotation.back(); rotation.replace(0);
 assert.equal(scheduled.size, 0);
 rotation.destroy();
});
