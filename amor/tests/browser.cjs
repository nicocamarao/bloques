const {chromium}=require('playwright');
const http=require('node:http');
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
const server=http.createServer((req,res)=>{
 const file=path.join(root,decodeURIComponent(req.url.split('?')[0]).replace(/^\//,'')||'index.html');
 try{const mime={'.js':'text/javascript','.json':'application/json','.html':'text/html','.css':'text/css','.svg':'image/svg+xml','.webp':'image/webp'};res.setHeader('Content-Type',mime[path.extname(file)]||'application/octet-stream');res.end(fs.readFileSync(file));}catch{res.writeHead(404);res.end();}
});
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH});
 try{
 const page=await browser.newPage({viewport:{width:390,height:844}});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`http://127.0.0.1:${server.address().port}`);
 await page.waitForFunction(()=>!document.getElementById('start').disabled);
 const detections=await page.evaluate(async()=>{
  const worker=new Worker('detector-worker.js?v=amor-1');
  const message=()=>new Promise((resolve,reject)=>{const timeout=setTimeout(()=>reject(Error('Worker timeout')),15000);worker.onmessage=e=>{clearTimeout(timeout);resolve(e.data)};});
  await message();const detections=[];
  for(const id of ['rose','thin','dreams','longlove','fruit']){
   const image=new Image();image.src='targets/'+id+'.jpg';await image.decode();
   const canvas=document.createElement('canvas');canvas.width=420;canvas.height=430;const context=canvas.getContext('2d');context.fillStyle='white';context.fillRect(0,0,420,430);context.drawImage(image,60,20,300,373);
   const data=context.getImageData(0,0,420,430);const response=message();worker.postMessage({type:'frame',buffer:data.data.buffer,w:420,h:430,epoch:1},[data.data.buffer]);const reply=await response;detections.push({expected:id,actual:reply.result?.id});
  }worker.terminate();return detections;
 });
 assert.ok(detections.every(r=>r.expected===r.actual),JSON.stringify(detections));

 await page.screenshot({path:'/tmp/amor-mobile.png',fullPage:true});
 await page.setViewportSize({width:1440,height:1000});await page.screenshot({path:'/tmp/amor-desktop.png',fullPage:true});
 await page.setViewportSize({width:390,height:844});
 assert.equal(await page.locator('a[href="https://www.linkedin.com/in/rodrigo-pisurno-cremona-b57702a2/"]').count(),3);
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 await page.click('#demo');
 for(const id of ['rose','thin','dreams','longlove','fruit']){
  await page.selectOption('#demoSelect',id);if(id==='dreams')await page.screenshot({path:'/tmp/amor-demo.png'});assert.equal(await page.locator('#capture').isDisabled(),true);
  assert.equal(await page.evaluate(()=>gameState.mask),0);
 }
 await page.click('#stop');
 // Exercise the real UI state handler without requiring a physical camera.
 await page.evaluate(()=>{enter('camera');scan=()=>{};});
 const quad=[{x:80,y:100},{x:240,y:100},{x:240,y:240},{x:80,y:240}];
 for(const id of ['rose','thin','dreams','longlove','fruit']){
  const info=await page.evaluate(({id,quad})=>{
   receive({epoch,result:{id,quad},w:320,h:400,ms:150});
   return {active,disabled:document.getElementById('capture').disabled,hidden:document.getElementById('creature').hidden};
  },{id,quad});
  assert.equal(info.active,id);assert.equal(info.hidden,false);assert.equal(info.disabled,true);
  await page.evaluate(({id,quad})=>receive({epoch,result:{id,quad},w:320,h:400,ms:150}),{id,quad});
  assert.equal(await page.locator('#capture').isDisabled(),false);
  await page.click('#capture');
  await page.waitForFunction(()=>!captureBusy);
 }
 assert.equal(await page.evaluate(()=>gameState.mask),31);
 const reward=await page.evaluate(()=>gameState.reward.image);
 assert.match(await page.evaluate(()=>gameState.reward.payload),/^PREMIO:AMOR:/);
 assert.equal(await page.evaluate(()=>document.cookie.includes('kingjr_hunt_v1=')),false);
 await page.reload();await page.waitForFunction(()=>!document.getElementById('start').disabled);
 assert.equal(await page.evaluate(()=>gameState.reward.image),reward);
 assert.equal(await page.locator('#collectionCount').textContent(),'5/5');
 assert.deepEqual(errors,[]);
 console.log('Browser: worker startup, demo isolation, immediate matching creature, confirmation gate, brand switching, five captures, persistent reward passed');
 } finally {await browser.close();server.close();}
})().catch(e=>{console.error(e);server.close();process.exitCode=1});
