// Rectify catalog photographs for CV training. No generative edits to printed text.
const fs=require('node:fs'),path=require('node:path'),sharp=require('sharp');
const CV=require('../cv-core.js'),J=require('../vendor/jsfeat.min.js');
const dir=path.join(__dirname,'../targets');
const corners={rose:[[30,68],[197,30],[245,151],[74,196]],dreams:[[37,69],[191,35],[242,145],[83,188]],thin:[[43,73],[191,36],[240,148],[76,193]],longlove:[[40,76],[193,36],[245,148],[82,194]],fruit:[[46,74],[185,40],[233,135],[86,178]]};
function rectify(data,w,h,quad){
 const width=320,height=240,H=new J.matrix_t(3,3,J.F32_t|J.C1_t);
 new J.motion_model.homography2d().run([{x:0,y:0},{x:width,y:0},{x:width,y:height},{x:0,y:height}],quad.map(([x,y])=>({x,y})),H,4);
 const output=Buffer.alloc(width*height*4,255);
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  const p=CV.project(H.data,x,y),xx=Math.min(w-2,Math.max(0,p.x)),yy=Math.min(h-2,Math.max(0,p.y)),ix=Math.floor(xx),iy=Math.floor(yy),fx=xx-ix,fy=yy-iy;
  for(let c=0;c<3;c++){const at=(iy*w+ix)*4+c;output[(y*width+x)*4+c]=(data[at]*(1-fx)+data[at+4]*fx)*(1-fy)+(data[at+w*4]*(1-fx)+data[at+w*4+4]*fx)*fy;}
 }
 return {data:output,width,height,H:Array.from(H.data)};
}
(async()=>{
 const targets=[];
 for(const [id,quad] of Object.entries(corners)){
  const {data,info}=await sharp(path.join(dir,id+'.jpg')).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  const flat=rectify(data,info.width,info.height,quad);
  await sharp(flat.data,{raw:{width:flat.width,height:flat.height,channels:4}}).png().toFile(path.join(dir,id+'-front.png'));
  // Exclude the identical crown/AMOR wordmark. Keep variety name and descriptor.
  const crop={left:20,top:84,width:280,height:85};
  const band=await sharp(flat.data,{raw:{width:flat.width,height:flat.height,channels:4}}).extract(crop).raw().toBuffer({resolveWithObject:true});
  await sharp(band.data,{raw:{width:band.info.width,height:band.info.height,channels:4}}).png().toFile(path.join(dir,id+'-label.png'));
  const t=CV.train(band.data,band.info.width,band.info.height,id,'label');t.partial=true;
  const inverse=Buffer.from(band.data);for(let i=0;i<inverse.length;i+=4)for(let c=0;c<3;c++)inverse[i+c]=255-inverse[i+c];
  const ti=CV.train(inverse,band.info.width,band.info.height,id,'label');t.points.push(...ti.points);t.desc.push(...ti.desc);
  if(t.points.length>650){const pts=[],ds=[];for(let i=0;i<650;i++){const j=Math.floor(i*t.points.length/650);pts.push(t.points[j]);ds.push(...t.desc.slice(j*8,j*8+8));}t.points=pts;t.desc=ds;}
  targets.push(t);
  const polygon=[[crop.left,crop.top],[crop.left+crop.width,crop.top],[crop.left+crop.width,crop.top+crop.height],[crop.left,crop.top+crop.height]].map(([x,y])=>CV.project(flat.H,x,y));
  const bounds=quad.map(([x,y])=>({x,y}));
  const left=Math.floor(Math.min(...bounds.map(p=>p.x))),top=Math.floor(Math.min(...bounds.map(p=>p.y)));
  const width=Math.ceil(Math.max(...bounds.map(p=>p.x)))-left,height=Math.ceil(Math.max(...bounds.map(p=>p.y)))-top;
  const original=await sharp(data,{raw:{width:info.width,height:info.height,channels:4}}).extract({left,top,width,height}).raw().toBuffer();
  const ot=CV.train(original,width,height,id,'catalog-label');ot.partial=true;ot.ncc=false;
  // Exclude feature points outside the distinctive variety band, even in tilted photos.
  const pts=[],ds=[];
  for(let j=0;j<ot.points.length;j++){
   const p={x:ot.points[j].x+left,y:ot.points[j].y+top};
   const signs=polygon.map((a,k)=>{const b=polygon[(k+1)%4];return (b.x-a.x)*(p.y-a.y)-(b.y-a.y)*(p.x-a.x);});
   if(signs.every(v=>v>=0)||signs.every(v=>v<=0)){pts.push(ot.points[j]);ds.push(...ot.desc.slice(j*8,j*8+8));}
  }
  ot.points=pts;ot.desc=ds;targets.push(ot);

 }
 fs.writeFileSync(path.join(dir,'compiled.json'),JSON.stringify({version:1,targets}));console.log('Compiled',targets.length,'distinctive label templates');
})();
