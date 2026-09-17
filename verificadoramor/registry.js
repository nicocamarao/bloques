/* Local format validation and atomic duplicate protection across same-origin tabs. */
(function(root){
'use strict';
const KEY='amor_verifier_read_v1';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function parse(payload){
 if(typeof payload!=='string')return null;
 const match=/^PREMIO:AMOR:([0-9a-f-]+)$/i.exec(payload.trim());
 return match&&UUID.test(match[1])?match[1].toLowerCase():null;
}
function read(){
 const raw=localStorage.getItem(KEY);
 if(raw===null)return {};
 const records=JSON.parse(raw);
 if(!records||Array.isArray(records)||typeof records!=='object'||Object.entries(records).some(([id,date])=>!UUID.test(id)||!Number.isFinite(Date.parse(date))))throw Error('El historial guardado no es válido.');
 return records;
}
async function verify(payload){
 const id=parse(payload);
 if(!id)return {status:'invalid'};
 if(!navigator.locks?.request)throw Error('Este navegador no permite registrar lecturas de forma segura entre pestañas. Usá una versión reciente de Chrome o Safari.');
 return navigator.locks.request(KEY,()=>{
  const records=read();
  if(Object.hasOwn(records,id))return {status:'duplicate',id,firstRead:records[id]};
  const date=new Date().toISOString();records[id]=date;
  localStorage.setItem(KEY,JSON.stringify(records));
  if(read()[id]!==date)throw Error('No se pudo guardar la lectura.');
  return {status:'ok',id,firstRead:date};
 });
}
root.AmorVerifier={parse,read,verify,key:KEY};
})(globalThis);
