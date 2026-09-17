/* Collection and the exact QR image are stored together in one scoped cookie. */
(function(root){
'use strict';
const NAME='amor_hunt_v1',IDS=['rose','thin','dreams','longlove','fruit'];
const scope=()=>location.pathname.replace(/[^/]*$/,'')||'/';
function read(){let raw=document.cookie.split(';').map(s=>s.trim()).find(s=>s.startsWith(NAME+'='));if(!raw)return {v:1,mask:0};let s;try{s=JSON.parse(decodeURIComponent(raw.slice(NAME.length+1)))}catch{throw Error('No se pudo leer la cookie de esta colección. No se generó otro código.')}if(s.v!==1||!Number.isInteger(s.mask)||s.mask<0||s.mask>31)throw Error('La cookie de la colección no es válida.');if(s.reward&&(s.mask!==31||!/^PREMIO:AMOR:[0-9a-f-]{36}$/.test(s.reward.payload)||!/^data:image\/gif;base64,[A-Za-z0-9+/]+=*$/.test(s.reward.image)))throw Error('El código guardado no es válido. No se generó otro.');return s}
function write(s){let data=encodeURIComponent(JSON.stringify(s));if(NAME.length+data.length>3800)throw Error('El código supera el espacio disponible en la cookie.');document.cookie=NAME+'='+data+'; Path='+scope()+'; Max-Age=31536000; SameSite=Lax'+(location.protocol==='https:'?'; Secure':'');let result=read();if(JSON.stringify(result)!==JSON.stringify(s))throw Error('Habilitá las cookies para guardar la colección y el código.');return result}
function uniqueId(){if(crypto.randomUUID)return crypto.randomUUID();let a=crypto.getRandomValues(new Uint8Array(16));a[6]=(a[6]&15)|64;a[8]=(a[8]&63)|128;let h=Array.from(a,b=>b.toString(16).padStart(2,'0')).join('');return h.slice(0,8)+'-'+h.slice(8,12)+'-'+h.slice(12,16)+'-'+h.slice(16,20)+'-'+h.slice(20)}
function ensureReward(s){if(s.mask!==31||s.reward)return s;const payload='PREMIO:AMOR:'+uniqueId();let qr=qrcode(0,'M');qr.addData(payload,'Byte');qr.make();s.reward={payload,image:qr.createDataURL(1,4)};return s}
async function locked(action){if(!navigator.locks?.request)throw Error('Abrí el juego en un navegador con Web Locks, como Chrome, para guardar un único código entre pestañas.');return navigator.locks.request(NAME,{mode:'exclusive'},action)}
async function capture(id){let index=IDS.indexOf(id);if(index<0)throw Error('Criatura desconocida.');return locked(()=>{let s=read();s.mask|=1<<index;return write(ensureReward(s))})}
async function restoreReward(){return locked(()=>{let s=read();if(s.mask===31&&!s.reward)return write(ensureReward(s));return s})}
function randomMonster(){let a=crypto.getRandomValues(new Uint32Array(1));return IDS[a[0]%IDS.length]}
function count(s){return IDS.filter((id,i)=>s.mask&(1<<i)).length}
root.AmorGame={read,write,capture,restoreReward,randomMonster,count,ids:IDS,cookieName:NAME};
})(globalThis);
