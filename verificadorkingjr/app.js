'use strict';
const $=id=>document.getElementById(id);
const video=$('camera'),canvas=document.createElement('canvas'),ctx=canvas.getContext('2d',{willReadFrequently:true});
let stream=null,timer=0,paused=true,busy=false,starting=false,generation=0;
function count(){try{const n=Object.keys(KingVerifier.read()).length;$('count').textContent=n+' QR '+(n===1?'registrado':'registrados')+' en este navegador';}catch{$('count').textContent='No se puede leer el historial local.';}}
function result(status,title,detail){$('result').hidden=false;$('result').className='result '+status;$('resultTitle').textContent=title;$('resultDetail').textContent=detail;$('resultIcon').textContent=status==='ok'?'✓':status==='duplicate'?'↻':'!';}
async function verify(payload){
 if(busy)return;busy=true;paused=true;clearTimeout(timer);$('result').hidden=true;$('next').hidden=true;$('manual').querySelector('button').disabled=true;
 try{
  const record=await KingVerifier.verify(payload);
  if(record.status==='ok')result('ok','OK','Formato correcto. Primera lectura guardada en este navegador.');
  else if(record.status==='duplicate')result('duplicate','Este ya había sido leído','Primera lectura: '+new Date(record.firstRead).toLocaleString('es-UY')+'.');
  else result('invalid','QR no válido','No contiene un premio King Jr. con el formato esperado. No se registró.');
 }catch{result('error','No se pudo registrar','No se pudo leer o guardar el historial local. Habilitá el almacenamiento y usá un navegador actualizado. No se confirmó la lectura.');}
 finally{busy=false;$('manual').querySelector('button').disabled=false;$('next').hidden=!stream;count();}
}
function scan(){
 if(paused||!stream||busy)return;
 if(video.readyState>=2){
  const scale=Math.min(1,640/Math.max(video.videoWidth,video.videoHeight));canvas.width=Math.round(video.videoWidth*scale);canvas.height=Math.round(video.videoHeight*scale);
  ctx.drawImage(video,0,0,canvas.width,canvas.height);
  const frame=ctx.getImageData(0,0,canvas.width,canvas.height);
  const code=jsQR(frame.data,frame.width,frame.height,{inversionAttempts:'attemptBoth'});
  if(code){void verify(code.data);return;}
 }
 timer=setTimeout(scan,180);
}
function stop(){
 generation++;paused=true;clearTimeout(timer);stream?.getTracks().forEach(t=>t.stop());stream=null;video.pause();video.srcObject=null;video.hidden=true;$('cameraPlaceholder').hidden=false;$('guide').hidden=true;$('stop').hidden=true;$('next').hidden=true;$('start').hidden=false;$('start').disabled=false;starting=false;$('cameraStatus').textContent='Cámara apagada.';
}
$('start').onclick=async()=>{
 if(starting)return;starting=true;const token=++generation;$('start').disabled=true;
 try{
  if(!isSecureContext||!navigator.mediaDevices?.getUserMedia)throw Error('Abrí este sitio por HTTPS para activar la cámara.');
  if(typeof jsQR!=='function'||!ctx)throw Error('No se cargó el lector. Recargá la página.');
  const acquired=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'},width:{ideal:1280},height:{ideal:720}},audio:false});
  if(token!==generation){acquired.getTracks().forEach(t=>t.stop());return;}
  stream=acquired;video.srcObject=stream;await video.play();if(token!==generation)return;
  video.hidden=false;$('cameraPlaceholder').hidden=true;$('guide').hidden=false;$('stop').hidden=false;$('start').hidden=true;$('result').hidden=true;$('cameraStatus').textContent='Enfocá un QR. El escaneo se pausa después de cada lectura.';paused=false;scan();
 }catch(error){if(token!==generation)return;stop();$('cameraStatus').textContent=error.name==='NotAllowedError'?'Habilitá el permiso de cámara. También podés ingresar el contenido del QR.':error.name==='NotFoundError'?'No se encontró una cámara. Podés ingresar el contenido del QR.':error.message;}
 finally{if(token===generation){starting=false;$('start').disabled=false;}}
};
$('stop').onclick=stop;
$('next').onclick=()=>{if(busy||!stream)return;$('result').hidden=true;$('next').hidden=true;paused=false;scan();};
$('manual').onsubmit=e=>{e.preventDefault();void verify($('payload').value);};
window.addEventListener('storage',e=>{if(e.key===KingVerifier.key||e.key===null)count();});
document.addEventListener('visibilitychange',()=>{if(document.hidden)stop();});window.addEventListener('pagehide',stop);
count();
