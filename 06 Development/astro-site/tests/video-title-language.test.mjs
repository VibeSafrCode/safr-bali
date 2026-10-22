import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import {videoTitleLanguage,applyNativeVideoTitle} from '../src/lib/video-title-language.mjs';

test('title language uses the finite explicit metadata whitelist, not UI locale',()=>{
 for (const language of ['ru','en','zh-Hans','ko','fr','de','ja','hi','es','ar'])
  assert.equal(videoTitleLanguage(language),language);
});

test('missing/unknown language stays und without string coercion or script heuristics',()=>{
 const forbidden={toString(){throw Error('must not coerce');}};
 for (const value of [undefined,null,'und','unknown','RU','ru-RU','zh-cn','id','Russian',
   'Русский','__proto__','constructor',0,false,{},[],new String('ru'),forbidden])
  assert.equal(videoTitleLanguage(value),'und');
});

test('known retained snapshot adds only explicit ru metadata to the exact ten original items',async()=>{
 const data=JSON.parse(await readFile(new URL('../src/data/travel-videos.json',import.meta.url),'utf8'));
 assert.equal(data.videos.length,10);
 const original={...data,videos:data.videos.map(({titleLanguage,...video})=>{
  assert.equal(titleLanguage,'ru');return video;
 })};
 const bytes=JSON.stringify(original,null,2)+'\n';
 assert.equal(createHash('sha256').update(bytes).digest('hex'),
  '74c6460b971f18b7dc0a2898ed7eea1ee05d1d7847941a8e3cff58ab146a55e8');
});

function nodeFixture(){
 const attributes=new Map();const changes=[];
 const node={set textContent(value){changes.push(['text',value]);},
  setAttribute(name,value){changes.push([name,value]);attributes.set(name,value);}};
 return {node,attributes,changes};
}

test('one synchronous caption commit updates the original text and its own language',()=>{
 const {node,attributes,changes}=nodeFixture();
 applyNativeVideoTitle(node,{title:'Original title — unchanged',titleLanguage:'en'});
 assert.deepEqual(changes,[['text','Original title — unchanged'],['lang','en']]);
 assert.equal(attributes.get('lang'),'en');
});

test('replacement with missing metadata clears prior ru to und even for Russian text or same ID',()=>{
 const {node,attributes,changes}=nodeFixture();
 applyNativeVideoTitle(node,{id:'Cf7nNu5gtiM',title:'Исходное название',titleLanguage:'ru'});
 applyNativeVideoTitle(node,{id:'Cf7nNu5gtiM',title:'Новое название'});
 assert.equal(attributes.get('lang'),'und');
 assert.deepEqual(changes.slice(-2),[['text','Новое название'],['lang','und']]);
});

test('invalid title refuses before any caption DOM mutation',()=>{
 const {node,changes}=nodeFixture();
 for (const video of [null,{}, {title:undefined},{title:1},{title:{toString(){throw Error('no coercion');}}}])
  assert.throws(()=>applyNativeVideoTitle(node,video),TypeError);
 assert.deepEqual(changes,[]);
});

test('initial accessible name separates localized control text from the native language span',async()=>{
 const source=await readFile(new URL('../src/components/TravelVideos.astro',import.meta.url),'utf8');
 assert.match(source,/data-title-language=\{videoTitleLanguage\(video.titleLanguage\)\}/);
 assert.match(source,/aria-labelledby="travel-video-watch-label travel-video-native-title"/);
 assert.match(source,/id="travel-video-watch-label">\{interactionText\('video.watch'\)\}/);
 assert.match(source,/aria-labelledby="travel-video-open-label travel-video-native-title"/);
 assert.match(source,/id="travel-video-open-label">\{interactionText\('video.openYouTube'\)\}/);
 assert.match(source,/id="travel-video-native-title" data-video-title-text lang=\{videoTitleLanguage\(first.titleLanguage\)\}/);
 assert.doesNotMatch(source,/aria-label=\{[^\n]*first.title/);
 assert.doesNotMatch(source,/<(?:a|section|div)[^>]*lang="ru"/);
});

test('dynamic caption uses the same title+lang commit and preserves localized name references',async()=>{
 const source=await readFile(new URL('../src/client/travel-videos.js',import.meta.url),'utf8');
 assert.match(source,/titleLanguage: videoTitleLanguage\(item.titleLanguage\)/);
 assert.match(source,/titleLanguage: videoTitleLanguage\(item.dataset.titleLanguage\)/);
 assert.match(source,/applyNativeVideoTitle\(nativeTitle,video\)/);
 assert.match(source,/frame.title = `YouTube · \$\{interactionText\('video.watch'\)\}`/);
 assert.match(source,/frame.setAttribute\('aria-labelledby','travel-video-watch-label travel-video-native-title'\)/);
 assert.doesNotMatch(source,/launch.setAttribute\('aria-label'/);
 assert.doesNotMatch(source,/title.setAttribute\('aria-label'/);
 assert.doesNotMatch(source,/title.textContent = video.title/);
});

test('video stage explicitly bounds aspect-ratio width when its minimum height applies',async()=>{
 const source=await readFile(new URL('../src/components/TravelVideos.astro',import.meta.url),'utf8');
 const stage=source.match(/\.playlist-stage\{([^}]+)\}/)?.[1];
 assert.ok(stage);
 const declarations=new Map(stage.split(';').filter(Boolean).map(value=>{
  const colon=value.indexOf(':');return [value.slice(0,colon),value.slice(colon+1)];
 }));
 assert.equal(declarations.get('width'),'100%');
 assert.equal(declarations.get('max-width'),'100%');
 assert.equal(declarations.get('min-width'),'0');
 assert.equal(declarations.get('min-height'),'160px');
 assert.equal(declarations.get('aspect-ratio'),'16/9');
});
