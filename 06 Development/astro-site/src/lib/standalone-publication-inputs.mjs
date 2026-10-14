import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
const files=['../components/UaeServices.astro','../components/AppDock.astro','../components/UiIcon.astro','./destination-worlds.ts'];
function collectBundled() {
  try {return import.meta.glob(['../components/UaeServices.astro','../components/AppDock.astro','../components/UiIcon.astro','./destination-worlds.ts'],{query:'?raw',import:'default',eager:true});}
  catch(error){if(typeof import.meta.glob!=='function')return null;throw error;}
}
const bundled=collectBundled();
const sourceHashes=Object.fromEntries(files.map(file=>{
  const source=bundled?bundled[file]:readFileSync(new URL(file,import.meta.url),'utf8');
  assert.equal(typeof source,'string','Standalone public source missing');
  return [file,createHash('sha256').update(source).digest('hex')];
}));
export function standaloneUaeInputs(locale) {
  assert.ok(locale==='ru'||locale==='en','Unknown standalone public locale');
  const en=locale==='en';
  return {route:en?'/en/uae/':'/uae/',locale,title:en?'United Arab Emirates':'ОАЭ',
    description:en?'Your UAE travel space.':'Ваше пространство для поездки в ОАЭ.',
    heading:en?'United Arab Emirates':'ОАЭ',backLabel:en?'All destinations':'Все направления',
    eyebrow:en?'DESTINATION SERVICES':'СЕРВИСЫ НАПРАВЛЕНИЯ',
    servicesHeading:en?'Your UAE services':'Ваши сервисы в ОАЭ',sourceHashes:{...sourceHashes}};
}
