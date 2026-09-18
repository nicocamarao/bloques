/* Local ORB logo matching and robust planar registration. Uses JSFeat (MIT). */
(function(root){
'use strict';
const J=typeof jsfeat!=='undefined'?jsfeat:require('./vendor/jsfeat.min.js');
let cache={};
function gray(rgba,w,h){let m=new J.matrix_t(w,h,J.U8_t|J.C1_t);J.imgproc.grayscale(rgba,w,h,m);return m}
const umax=[15,15,15,15,14,14,14,13,13,12,11,10,9,8,6,3,0];
function angle(im,x,y){let p=y*im.cols+x,m01=0,m10=0,d=im.data,w=im.cols;for(let u=-15;u<=15;u++)m10+=u*d[p+u];for(let v=1;v<=15;v++){let vs=0;for(let u=-umax[v];u<=umax[v];u++){let a=d[p+u+v*w],b=d[p+u-v*w];vs+=a-b;m10+=u*(a+b)}m01+=v*vs}return Math.atan2(m01,m10)}
function features(im,max=550){let key=im.cols+'x'+im.rows;if(!cache[key])cache[key]={corners:Array.from({length:im.cols*im.rows},()=>new J.keypoint_t()),blur:new J.matrix_t(im.cols,im.rows,J.U8_t|J.C1_t)};let {corners,blur}=cache[key];J.imgproc.gaussian_blur(im,blur,5,1.1);J.yape06.laplacian_threshold=12;J.yape06.min_eigen_value_threshold=18;let n=J.yape06.detect(blur,corners,18);if(n>max){J.math.qsort(corners,0,n-1,(a,b)=>b.score<a.score);let cells={},selected=[];for(let i=0;i<n&&selected.length<max;i++){let p=corners[i],cell=((p.x/32)|0)+','+((p.y/32)|0);if((cells[cell]||0)>=12)continue;cells[cell]=(cells[cell]||0)+1;selected.push(new J.keypoint_t(p.x,p.y,p.score,p.level))}for(let i=0;i<selected.length;i++)corners[i]=selected[i];n=selected.length}for(let i=0;i<n;i++)corners[i].angle=angle(blur,corners[i].x,corners[i].y);let desc=new J.matrix_t(32,n,J.U8_t|J.C1_t);J.orb.describe(blur,corners,n,desc);return {points:corners.slice(0,n).map(p=>({x:p.x,y:p.y})),desc:new Int32Array(desc.buffer.i32.slice(0,n*8))}}
function train(rgba,w,h,id,variant){let original=gray(rgba,w,h),points=[],descriptors=[];for(let maxdim of [360,300,250,215,180,154,130,110,90]){let scale=maxdim/Math.max(w,h),ww=Math.round(w*scale),hh=Math.round(h*scale);if(Math.min(ww,hh)<40)continue;let dst=new J.matrix_t(ww,hh,J.U8_t|J.C1_t);J.imgproc.resample(original,dst,ww,hh);let f=features(dst,260);f.points.forEach((p,i)=>{points.push({x:p.x/scale,y:p.y/scale});for(let k=0;k<8;k++)descriptors.push(f.desc[i*8+k])})}let thumb=new J.matrix_t(64,64,J.U8_t|J.C1_t);J.imgproc.resample(original,thumb,64,64);return {id,variant,w,h,points,desc:descriptors,thumb:Array.from(thumb.data.slice(0,4096))}}
function pop(x){x-=x>>>1&0x55555555;x=(x&0x33333333)+(x>>>2&0x33333333);return ((x+(x>>>4)&0x0f0f0f0f)*0x01010101)>>>24}
function project(h,x,y){let d=h[6]*x+h[7]*y+h[8];return {x:(h[0]*x+h[1]*y+h[2])/d,y:(h[3]*x+h[4]*y+h[5])/d}}
function area(p){let a=0;for(let i=0;i<p.length;i++){let q=p[(i+1)%p.length];a+=p[i].x*q.y-q.x*p[i].y}return Math.abs(a)*.5}
function plausible(q,w,h){if(q.some(p=>!Number.isFinite(p.x)||!Number.isFinite(p.y)||p.x<-.2*w||p.x>1.2*w||p.y<-.2*h||p.y>1.2*h))return false;let edges=q.map((p,i)=>Math.hypot(p.x-q[(i+1)%4].x,p.y-q[(i+1)%4].y));if(Math.min(...edges)<22||Math.max(...edges)/Math.min(...edges)>8||area(q)<650||area(q)>w*h*1.25)return false;let signs=q.map((p,i)=>{let b=q[(i+1)%4],c=q[(i+2)%4];return Math.sign((b.x-p.x)*(c.y-b.y)-(b.y-p.y)*(c.x-b.x))});return signs.every(x=>x===signs[0])&&signs[0]!==0}
function match(f,t,w,h){let candidates=[];for(let i=0;i<t.points.length;i++){let d1=257,d2=257,best=-1;for(let j=0;j<f.points.length;j++){let d=0;for(let k=0;k<8;k++)d+=pop(t.desc[i*8+k]^f.desc[j*8+k]);if(d<d1){d2=d1;d1=d;best=j}else if(d<d2)d2=d}if(d1<66&&(d1<.90*d2||d1<30))candidates.push({i,j:best,d:d1})}candidates.sort((a,b)=>a.d-b.d);let unique=[],used=new Set();for(let m of candidates){let p=t.points[m.i];if(used.has(m.j)||unique.some(n=>Math.hypot(p.x-t.points[n.i].x,p.y-t.points[n.i].y)<5))continue;unique.push(m);used.add(m.j);if(unique.length===100)break}if(unique.length<6)return null;
let from=unique.map(m=>t.points[m.i]),to=unique.map(m=>f.points[m.j]),H=new J.matrix_t(3,3,J.F32_t|J.C1_t),mask=new J.matrix_t(unique.length,1,J.U8_t|J.C1_t),kernel=new J.motion_model.homography2d();let ok=J.motion_estimator.ransac(new J.ransac_params_t(4,5,.5,.995),kernel,from,to,unique.length,H,mask,350);if(!ok)return null;let goodFrom=[],goodTo=[];for(let i=0;i<unique.length;i++)if(mask.data[i]){goodFrom.push(from[i]);goodTo.push(to[i])}if(goodFrom.length<6||goodFrom.length/unique.length<.32)return null;kernel.run(goodFrom,goodTo,H,goodFrom.length);let quad=[[0,0],[t.w,0],[t.w,t.h],[0,t.h]].map(p=>project(H.data,...p));if(!plausible(quad,w,h))return null;let xs=goodFrom.map(p=>p.x),ys=goodFrom.map(p=>p.y);if((Math.max(...xs)-Math.min(...xs))*(Math.max(...ys)-Math.min(...ys))/(t.w*t.h)<.075)return null;// Check the actual projected artwork, not just a handful of accidental corners.
let actual=[], reference=[];
for(let yy=0;yy<20;yy++)for(let xx=0;xx<20;xx++){
 let p=project(H.data,(xx+.5)*t.w/20,(yy+.5)*t.h/20);
 if(p.x<0||p.y<0||p.x>=w-1||p.y>=h-1)continue;
 actual.push(sample(f.image.data,w,h,p.x,p.y));
 reference.push(sample(t.thumb,64,64,(xx+.5)*64/20,(yy+.5)*64/20));
}
if(actual.length<180)return null;
let aa=normal(actual),bb=normal(reference),similarity=Math.abs(aa.reduce((sum,v,i)=>sum+v*bb[i],0));
if((t.id==='strong'||t.id==='xxl')&&similarity<.73)return null;
if(similarity<(goodFrom.length>=25&&goodFrom.length/unique.length>.4?.55:.60)||goodFrom.length<8)return null;
return {id:t.id,quad,inliers:goodFrom.length,score:similarity,variant:t.variant}}
function sample(data,w,h,x,y){let xx=Math.max(0,Math.min(w-1.001,x)),yy=Math.max(0,Math.min(h-1.001,y)),ix=xx|0,iy=yy|0,fx=xx-ix,fy=yy-iy,p=iy*w+ix;return (data[p]*(1-fx)+data[p+1]*fx)*(1-fy)+(data[p+w]*(1-fx)+data[p+w+1]*fx)*fy}
function normal(values){let mean=values.reduce((a,b)=>a+b,0)/values.length;let a=values.map(x=>x-mean),norm=Math.sqrt(a.reduce((s,x)=>s+x*x,0));return norm>1?a.map(x=>x/norm):a.map(()=>0)}
function patch(im,x,y,bw,bh,n){let out=[];for(let j=0;j<n;j++)for(let i=0;i<n;i++)out.push(sample(im.data,im.cols,im.rows,x+(i+.5)*bw/n,y+(j+.5)*bh/n));return out}
function corr(im,x,y,bw,bh,n,t){let sum=0,sq=0,prod=0;for(let j=0,k=0;j<n;j++)for(let i=0;i<n;i++,k++){let v=sample(im.data,im.cols,im.rows,x+(i+.5)*bw/n,y+(j+.5)*bh/n);sum+=v;sq+=v*v;prod+=v*t[k]}let den=Math.sqrt(Math.max(0,sq-sum*sum/(n*n)));return den>n*5?prod/den:0}
function ncc(im,targets){let scale=Math.min(1,320/Math.max(im.cols,im.rows)),w=Math.round(im.cols*scale),h=Math.round(im.rows*scale),small=new J.matrix_t(w,h,J.U8_t|J.C1_t);J.imgproc.resample(im,small,w,h);let best=null,byId={};
for(let t of targets){if(!t.thumb||t.ncc===false)continue;let tmp={cols:64,rows:64,data:t.thumb};t.coarse=t.coarse||normal(patch(tmp,0,0,64,64,12));t.fine=t.fine||normal(patch(tmp,0,0,64,64,20));let candidates=[];
for(let bw=18;bw<Math.min(w*.98,320);bw*=1.12){let bh=bw*t.h/t.w;if(bh<8||bh>h*.98)continue;let step=Math.max(2,Math.round(Math.min(bw,bh)/10));for(let y=0;y<h-bh-1;y+=step)for(let x=0;x<w-bw-1;x+=step){let c=corr(small,x,y,bw,bh,12,t.coarse);if(Math.abs(c)>.60){candidates.push({x,y,bw,bh,c:Math.abs(c),step});if(candidates.length>60){candidates.sort((a,b)=>b.c-a.c);candidates.length=18}}}}
candidates.sort((a,b)=>b.c-a.c);for(let q of candidates.slice(0,24))for(let ds of [.94,.97,1,1.03,1.06])for(let dy of [-q.step/2,-q.step/4,0,q.step/4,q.step/2])for(let dx of [-q.step/2,-q.step/4,0,q.step/4,q.step/2]){let bw=q.bw*ds,bh=q.bh*ds,x=q.x+dx,y=q.y+dy;if(x<0||y<0||x+bw>=w||y+bh>=h)continue;let score=Math.abs(corr(small,x,y,bw,bh,20,t.fine));if(score>.70&&(!byId[t.id]||score>byId[t.id].score))byId[t.id]={id:t.id,variant:t.variant,score,inliers:0,quad:[{x:x/scale,y:y/scale},{x:(x+bw)/scale,y:y/scale},{x:(x+bw)/scale,y:(y+bh)/scale},{x:x/scale,y:(y+bh)/scale}]}}
}let ranked=Object.values(byId).sort((a,b)=>b.score-a.score);best=ranked[0];return best&&best.score>.84&&(!ranked[1]||best.score-ranked[1].score>.055)?best:null}
function detect(rgba,w,h,targets){
 const im=gray(rgba,w,h),f=features(im,850),byId={};f.image=im;
 for(let attempt=0;attempt<5;attempt++){
  for(const t of targets){const r=match(f,t,w,h);if(r&&(!byId[r.id]||r.score>byId[r.id].score))byId[r.id]=r;}
  const ranked=Object.values(byId).sort((a,b)=>b.score-a.score);
  if(ranked[0]&&(!ranked[1]||ranked[0].score-ranked[1].score>.08))return ranked[0];
 }
 return f.points.length<10?null:ncc(im,targets.filter(t=>!t.variant.includes('rotation')));
}
root.LogoCV={train,detect,ncc,features,gray,match,project,area,plausible};if(typeof module!=='undefined')module.exports=root.LogoCV;
})(typeof self!=='undefined'?self:globalThis);
