const assert=require('node:assert/strict');
const sharp=require('sharp');
const fs=require('node:fs');
const path=require('node:path');
const CV=require('../cv-core.js');
const dir=path.join(__dirname,'../targets');
const db=JSON.parse(fs.readFileSync(path.join(dir,'compiled.json'))).targets;
db.forEach(t=>t.desc=Int32Array.from(t.desc));
async function fixture(id,{color='#333333',background='#ededdf',fraction=1,side='left',angle=0,blur=0,native=false,size=220}={}){
 const original=fs.readFileSync(path.join(dir,id+'.svg'),'utf8');
 const source=native?original:original.replace(/fill="#([^"]+)"/g,(all,c)=>/^f{3,6}$/i.test(c)?`fill="${background}"`:`fill="${color}"`).replace(/<path(?![^>]*fill=)/g,`<path fill="${color}"`);
 let {data,info}=await sharp(Buffer.from(source)).resize(size).trim().png().toBuffer({resolveWithObject:true});
 const width=Math.round(info.width*fraction);
 data=await sharp(data).extract({left:side==='left'?0:info.width-width,top:0,width,height:info.height}).rotate(angle,{background:'#00000000'}).png().toBuffer();
 let frame=sharp({create:{width:400,height:320,channels:4,background}}).composite([{input:data,left:87,top:72}]);
 let png=await frame.png().toBuffer();
 if(blur)png=await sharp(png).blur(blur).png().toBuffer();
 return sharp(png).ensureAlpha().raw().toBuffer();
}
(async()=>{
 for(const id of ['mcdonalds','kfc','subway','dominos']) for(const [name,options] of Object.entries({native:{native:true},small:{size:110},normal:{},white:{color:'#ffffff',background:'#282828'},blue:{color:'#2849c1',background:'#eed8ac'},rotated:{angle:12},soft:{blur:.6},partial:{fraction:id==='mcdonalds'?.85:id==='kfc'?.68:id==='subway'?.448:.85},right:id==='subway'?{fraction:.547,side:'right'}:{}})){
  const data=await fixture(id,options),start=performance.now(),r=CV.detect(data,400,320,db);
  console.log(id,name,r?.id,r?.variant,Math.round(performance.now()-start)+'ms');
  if(r?.id!==id) process.exitCode=1;
 }
 for(const text of ['M','W','COFFEE','SUNDAY','BURGER','KFC?'.replace('KFC','ABC')]){
  const svg=Buffer.from(`<svg width="400" height="320"><rect width="400" height="320" fill="white"/><text x="50" y="180" font-size="64" font-family="Arial" fill="black">${text}</text></svg>`);
  const rgba=await sharp(svg).ensureAlpha().raw().toBuffer();
  assert.equal(CV.detect(rgba,400,320,db),null,'negative '+text);
 }
 const blank=Buffer.alloc(400*320*4,255);assert.equal(CV.detect(blank,400,320,db),null,'blank');
 assert.ok(!process.exitCode,'All logo fixtures must be recognized');console.log('Detector regression checks passed');
})();
