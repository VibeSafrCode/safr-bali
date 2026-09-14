import bali from '../../../react-app/public/assets/heroes/bali-country-hero-approved.jpg';
import thailand from '../../../react-app/public/assets/heroes/thailand-country-hero-approved.jpg';
import russia from '../../../react-app/public/assets/heroes/russia-country-hero-approved.jpg';
import nepal from '../../../react-app/public/assets/heroes/nepal-country-hero-approved.jpg';
import uae from '../assets/worlds/uae-burj-khalifa.png';
import type {ImageMetadata} from 'astro';
export const worldImages: Record<string,ImageMetadata> = {bali,thailand,russia,nepal,uae};
export const worldRoute = (id:string, locale:string) => `${locale === 'en' ? '/en' : ''}${id === 'uae' ? '/uae/' : `/${id}/`}`;
