'use strict';
importScripts('vendor/jsfeat.min.js?v=3','cv-core.js');
let db;
fetch('targets/compiled.json').then(r=>{if(!r.ok)throw Error('No se pudieron cargar los logos.');return r.json()}).then(data=>{db=data;db.targets.forEach(t=>t.desc=Int32Array.from(t.desc));postMessage({type:'ready'})}).catch(e=>postMessage({type:'error',message:e.message}));
onmessage=e=>{let m=e.data;if(m.type!=='frame'||!db)return;try{let started=performance.now(),result=LogoCV.detect(new Uint8ClampedArray(m.buffer),m.w,m.h,db.targets,db.archMask);postMessage({type:'result',result,w:m.w,h:m.h,epoch:m.epoch,ms:Math.round(performance.now()-started)})}catch(error){postMessage({type:'error',message:'El reconocimiento se interrumpió. Volvé a abrir la cámara.'})}};
