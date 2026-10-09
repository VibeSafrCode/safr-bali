/** Presentation only; shared service routes and IDs remain authoritative. */
export function serviceIconFor(href:string,icon?:string):string {
  const route=href.replace(/^\/en(?=\/)/,'');
  if(route.includes('#youtube'))return 'play';
  if(route.includes('/visas'))return 'visa';
  if(route.includes('/insurance'))return 'shield';
  if(route.includes('/exchange'))return 'exchange';
  if(route.includes('/assistant'))return 'headset';
  if(/\/(guides|knowledge|stories|guide)(\/|$)/.test(route))return 'book';
  if(/\/(housing|property)(\/|$)/.test(route))return 'home';
  if(/\/(bikes|bike)(\/|$)/.test(route))return 'bike';
  if(route.includes('/transfer'))return 'car';
  if(route.includes('/yachts'))return 'boat';
  if(/\/(kailash|everest|annapurna|ural|caucasus)(\/|$)/.test(route))return 'mountain';
  if(route.includes('/spb'))return 'city';
  if(icon==='shield')return 'shield';
  if(icon==='⌂')return 'home';
  if(icon==='↔')return 'exchange';
  return 'globe';
}
