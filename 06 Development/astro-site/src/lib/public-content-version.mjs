import {createHash} from 'node:crypto';
const hash=value=>'sha256:'+createHash('sha256').update(JSON.stringify(value)).digest('hex');
const project=(value,fields)=>Object.fromEntries(fields.map(key=>[key,value[key]??null]));
export const registryPublicSourceFields=Object.freeze(['contentId','locale','dir','route','canonicalPath','sourceRevision','bodySha256','metadataSha256','sourceEnvelopeSha256','serviceId','pricingRef','title','seoTitle','description']);
export const legacyPublicSourceFields=Object.freeze(['route','title','description','eyebrow','kind','lead','body','download','breadcrumbs','cards','relatedRoutes','managerContext']);
export const publicRegistryContentVersion=entry=>hash(project(entry,registryPublicSourceFields));
export const publicLegacyContentVersion=page=>hash(project(page,legacyPublicSourceFields));
export const publicStandaloneContentVersion=page=>hash(project(page,['route','locale','title','description','heading','backLabel','eyebrow','servicesHeading','sourceHashes']));
