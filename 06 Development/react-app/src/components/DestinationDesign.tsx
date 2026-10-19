import {YOGA_MINI_APP} from '../runtime/yoga-mini-app';
import {SELECTED_COUNTRY_STORAGE_KEY} from '../homeCountries';
import {AppIcon} from './AppIcon';
import {requireClientUiBindings,type ClientUiBindings} from '../i18n/client-ui-bindings';
import {clientJourneyText} from '../i18n/client-catalog-journey';
export function storedWorld(){try{return localStorage.getItem(SELECTED_COUNTRY_STORAGE_KEY)||'bali';}catch{return 'bali';}}
export function selectWorld(id:string){try{localStorage.setItem(SELECTED_COUNTRY_STORAGE_KEY,id);}catch{}window.dispatchEvent(new CustomEvent('safr-world',{detail:id}));}
export const appStyle=(id:string,en=false)=>({
 insurance:['Страховки','Insurance','shield','cyan'],
 visas:['Визы','Visas','▣','blue'],housing:['Жильё','Stays','⌂','coral'],property:['Жильё','Property','⌂','coral'],bikes:['Байки','Bikes','bike','orange'],exchange:['Обмен','Exchange','↔','green'],assistant:['Ассистент','Assistant','✦','purple'],guides:['Гайды','Guides','▤','gold'],
}[id]??[id,id,'◎','blue']).filter(()=>true);
export function TravelVideos({en=false,ui}:{en?:boolean;ui?:ClientUiBindings}){if(YOGA_MINI_APP)return null;const client=ui===undefined?undefined:requireClientUiBindings(ui);return <section className="travel-videos"><header><span><AppIcon name="play"/> YOUTUBE</span><h2>{client?clientJourneyText(client,'home.video.heading'):en?'Feel the place before you go.':'Почувствуйте место до поездки.'}</h2></header><a className="video-feature" href="https://www.youtube.com/channel/UCeCPrNH3V7E2YK4CtsgyQ_A/" target="_blank" rel="noreferrer"><AppIcon name="play"/><strong>{client?clientJourneyText(client,'home.video.title'):en?'Life, travel and a fresh perspective.':'Жизнь, путешествия и новый взгляд.'}</strong><span>{client?clientJourneyText(client,'home.video.description'):en?'Stories on the SAFRWAY channel.':'Истории на канале SAFRWAY.'}</span></a></section>}
