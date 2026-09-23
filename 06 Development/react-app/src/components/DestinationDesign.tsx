import {useEffect,useState} from 'react';
import {activeDestinations,destinationById} from '../catalog';
import {countryTheme} from '../countryThemes';
import {SELECTED_COUNTRY_STORAGE_KEY} from '../homeCountries';
import {AppIcon} from './AppIcon';
export function storedWorld(){try{return localStorage.getItem(SELECTED_COUNTRY_STORAGE_KEY)||'bali';}catch{return 'bali';}}
export function selectWorld(id:string){try{localStorage.setItem(SELECTED_COUNTRY_STORAGE_KEY,id);}catch{}window.dispatchEvent(new CustomEvent('safr-world',{detail:id}));}
export function DestinationBackdrop(){
 const [id,setId]=useState(()=>{try{return localStorage.getItem(SELECTED_COUNTRY_STORAGE_KEY)||'bali';}catch{return 'bali';}});
 useEffect(()=>{const update=(e:Event)=>setId((e as CustomEvent<string>).detail);window.addEventListener('safr-world',update);return()=>window.removeEventListener('safr-world',update);},[]);
 return <div className="destination-backdrop" aria-hidden="true">{activeDestinations().map(d=><img key={d.id} src={countryTheme(d).hero?.src} alt="" data-active={id===d.id} loading={id===d.id?'eager':'lazy'}/>)}<span/></div>;
}
export const appStyle=(id:string,en=false)=>({
 insurance:['Страховки','Insurance','shield','cyan'],
 visas:['Визы','Visas','▣','blue'],housing:['Жильё','Stays','⌂','coral'],property:['Жильё','Property','⌂','coral'],bikes:['Байки','Bikes','bike','orange'],exchange:['Обмен','Exchange','↔','green'],assistant:['Ассистент','Assistant','✦','purple'],guides:['Гайды','Guides','▤','gold'],
}[id]??[id,id,'◎','blue']).filter(()=>true);
export function TravelVideos({en=false}:{en?:boolean}){return <section className="travel-videos"><header><span><AppIcon name="play"/> YOUTUBE</span><h2>{en?'Feel the place before you go.':'Почувствуйте место до поездки.'}</h2></header><a className="video-feature" href="https://www.youtube.com/channel/UCeCPrNH3V7E2YK4CtsgyQ_A/" target="_blank" rel="noreferrer"><AppIcon name="play"/><strong>{en?'Life, travel and a fresh perspective.':'Жизнь, путешествия и новый взгляд.'}</strong><span>{en?'Stories on the SAFRWAY channel.':'Истории на канале SAFRWAY.'}</span></a></section>}
