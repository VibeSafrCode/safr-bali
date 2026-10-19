import {guard,sha256} from './client-catalog-integrity';

/** Fixed external pins only. Reject objects/getters, excess allocation and drift. */
export function decodeClientCatalogPinnedJson(input:unknown,pin:Readonly<{bytes:number;sha256:string}>) {
  guard(typeof input==='string'||input instanceof Uint8Array,'CLIENT_DERIVATIVE_INPUT_TYPE');
  guard(typeof input!=='string'||input.length<=pin.bytes,'CLIENT_DERIVATIVE_INPUT_BOUNDARY');
  guard(typeof input==='string'||input.byteLength===pin.bytes,'CLIENT_DERIVATIVE_INPUT_BOUNDARY');
  const bytes=typeof input==='string'?new TextEncoder().encode(input):new Uint8Array(input);
  guard(bytes.byteLength===pin.bytes,'CLIENT_DERIVATIVE_INPUT_BOUNDARY');
  guard(sha256(bytes)===pin.sha256,'CLIENT_DERIVATIVE_PIN_DRIFT');
  let wire:string;
  try{wire=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(bytes);}
  catch{throw new Error('CLIENT_DERIVATIVE_INVALID_UTF8');}
  const data=JSON.parse(wire);
  guard(wire===JSON.stringify(data,null,2)+'\n','CLIENT_DERIVATIVE_NONCANONICAL_BYTES');
  return data;
}
