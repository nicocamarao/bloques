/* Local OCR fallback: identify distinctive words, never the shared Amor logo. */
(function(root){
'use strict';
const aliases={thin:['ULTRA','ULTRAFINO','ULTRAFINA','FINO','FINA','THIN'],rose:['ROSE','LISO'],dreams:['CORRUG','CORRUGADO','CORRUGADOS','WILD','DREAMS'],longlove:['LONG','LOVE'],fruit:['FRUIT','FRUT','FRUTAL','AROMA','COLOR'],strong:['STRONG','FUERTE','FUERT'],xxl:['XXL','GRANDE']};
function identify(words){const hits=[];for(const word of words||[]){if(word.confidence<30)continue;const token=word.text.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/[^A-Z]/g,'');for(const [id,list] of Object.entries(aliases))if(list.includes(token))hits.push({id,word});}const ids=new Set(hits.map(h=>h.id));if(ids.size!==1)return null;return hits.sort((a,b)=>b.word.confidence-a.word.confidence)[0];}
let workerPromise,busy=false,lastStart=-Infinity,current=null,sequence=0;
function init(){if(!workerPromise)workerPromise=Tesseract.createWorker('eng',1,{workerPath:'vendor/ocr/worker.min.js',corePath:'vendor/ocr',langPath:'vendor/ocr',workerBlobURL:false}).then(async worker=>{await worker.setParameters({tessedit_pageseg_mode:'11',user_defined_dpi:'150'});return worker;});return workerPromise;}
async function scan(canvas,epoch){if(busy||performance.now()-lastStart<550)return;busy=true;lastStart=performance.now();const began=lastStart,w=canvas.width,h=canvas.height;const image=canvas.toDataURL('image/png');try{const worker=await init();const {data}=await worker.recognize(image);const hit=identify(data.words);if(hit&&performance.now()-began<4000){const b=hit.word.bbox;current={epoch,time:performance.now(),w,h,result:{id:hit.id,source:'text',sequence:++sequence,score:hit.word.confidence/100,quad:[{x:b.x0,y:b.y0},{x:b.x1,y:b.y0},{x:b.x1,y:b.y1},{x:b.x0,y:b.y1}]}};}else current=null;}catch{current=null;}finally{busy=false;}}
function latest(epoch,w,h){if(!current||current.epoch!==epoch||current.w!==w||current.h!==h||performance.now()-current.time>1800)return null;return current.result;}
root.AmorText={identify,init,scan,latest};
if(typeof module!=='undefined')module.exports={identify};
})(globalThis);
