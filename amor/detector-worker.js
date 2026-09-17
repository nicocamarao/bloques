'use strict';
importScripts('vendor/jsfeat.min.js','cv-core.js?v=amor-1');
let db;
fetch('targets/compiled.json?v=amor-1').then(r=>{if(!r.ok)throw Error('No se pudieron cargar los envases.');return r.json();}).then(data=>{db=data;db.targets.forEach(t=>t.desc=Int32Array.from(t.desc));postMessage({type:'ready'});}).catch(e=>postMessage({type:'error',message:e.message}));
onmessage=e=>{const m=e.data;if(m.type!=='frame'||!db)return;try{const started=performance.now(),result=LogoCV.detect(new Uint8ClampedArray(m.buffer),m.w,m.h,db.targets);postMessage({type:'result',result,w:m.w,h:m.h,epoch:m.epoch,ms:Math.round(performance.now()-started)});}catch{postMessage({type:'error',message:'Se interrumpió el reconocimiento. Recargá la página para seguir explorando.'});}};
