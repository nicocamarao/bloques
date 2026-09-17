const sharp=require('sharp'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');const CV=require('../cv-core.js');const dir=path.join(__dirname,'../targets');const targets=JSON.parse(fs.readFileSync(path.join(dir,'compiled.json'))).targets;targets.forEach(t=>t.desc=Int32Array.from(t.desc));
(async()=>{let failures=0;
for(const id of ['rose','thin','dreams','longlove','fruit'])for(const kind of ['front','catalog','gray','rotated','label']){
 let pipeline=sharp(path.join(dir,id+(kind==='catalog'?'.jpg':kind==='label'?'-label.png':'-front.png'))).resize({width:260});if(kind==='gray')pipeline=pipeline.grayscale();if(kind==='rotated')pipeline=pipeline.rotate(10,{background:'#f5f0e9'});
 const image=await pipeline.png().toBuffer();const rgba=await sharp({create:{width:420,height:430,channels:4,background:'#f5f0e9'}}).composite([{input:image,left:75,top:35}]).ensureAlpha().raw().toBuffer();
 const start=performance.now(),r=CV.detect(rgba,420,430,targets);console.log(id,kind,r?.id,r?.inliers,r?.score,Math.round(performance.now()-start));if(r?.id!==id)failures++;
}
const logo=await sharp(path.join(__dirname,'../assets/amor-logo.png')).resize(200).png().toBuffer();
const logoOnly=await sharp({create:{width:420,height:430,channels:4,background:'white'}}).composite([{input:logo,left:100,top:100}]).raw().toBuffer();assert.equal(CV.detect(logoOnly,420,430,targets),null,'Shared Amor logo must not select a variety');
assert.equal(CV.detect(Buffer.alloc(420*430*4,255),420,430,targets),null,'Blank frame');
for(const id of ['rose','thin','dreams','longlove','fruit']){
 const front=await sharp(path.join(dir,id+'-front.png')).composite([{input:{create:{width:320,height:115,channels:4,background:'#888888'}},left:0,top:75}]).png().toBuffer();
 const rgba=await sharp({create:{width:420,height:430,channels:4,background:'white'}}).composite([{input:front,left:50,top:80}]).raw().toBuffer();
 assert.equal(CV.detect(rgba,420,430,targets),null,'Hidden variety label '+id);
}
assert.equal(failures,0,'Variant recognition fixtures');console.log('Amor detector checks passed');
})().catch(e=>{console.error(e);process.exitCode=1});
