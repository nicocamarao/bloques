// Rebuild with: NODE_PATH=<directory containing sharp> node tools/compile-targets.cjs
const sharp = require('sharp');
const fs = require('node:fs');
const path = require('node:path');
const CV = require('../cv-core.js');
const dir = path.join(__dirname, '../targets');
(async () => {
  const targets = [];
  for (const id of ['mcdonalds', 'kfc', 'subway', 'dominos']) {
    const svg = fs.readFileSync(path.join(dir, id + '.svg'), 'utf8').replace(/fill="#([^"]+)"/g, (all,c)=>/^f{3,6}$/i.test(c)?all:'fill="#000000"');
    const {data, info} = await sharp(Buffer.from(svg), {density: 300}).resize(480).trim().png().toBuffer({resolveWithObject:true});
    const crops = [{name:'full', left:0, top:0, width:info.width, height:info.height}];
    if (id === 'subway') {
      crops.push({name:'sub', left:0, top:0, width:Math.round(info.width*.448), height:info.height});
      crops.push({name:'way', left:Math.round(info.width*.453), top:0, width:info.width-Math.round(info.width*.453), height:info.height});
    }
    if (id === 'kfc') {
      crops.push({name:'kf', left:0, top:0, width:Math.round(info.width*.68), height:info.height});
      crops.push({name:'fc', left:Math.round(info.width*.4), top:0, width:info.width-Math.round(info.width*.4), height:info.height});
    }
    if (id === 'mcdonalds') crops.push({name:'upper-arches',left:0,top:0,width:info.width,height:Math.round(info.height*.76)});
    for (const {name,...crop} of crops) {
      const {data: rgba, info: size} = await sharp(data).extract(crop).flatten({background:'#fff'}).ensureAlpha().raw().toBuffer({resolveWithObject:true});
      const target = CV.train(rgba,size.width,size.height,id,name);
      target.partial=name!=='full';
      // Both polarities allow white-on-dark and dark-on-light packaging.
      const inverted=Buffer.from(rgba);
      for(let i=0;i<inverted.length;i+=4) for(let c=0;c<3;c++) inverted[i+c]=255-inverted[i+c];
      const inverse=CV.train(inverted,size.width,size.height,id,name);
      target.points.push(...inverse.points);target.desc.push(...inverse.desc);
      const limit=target.partial?280:500;
      if(target.points.length>limit){
        const points=[],desc=[];
        for(let i=0;i<limit;i++){const j=Math.floor(i*target.points.length/limit);points.push(target.points[j]);desc.push(...target.desc.slice(j*8,j*8+8));}
        target.points=points;target.desc=desc;
      }
      targets.push(target);
      // Template fallback covers modest rotation when a simple logo has too few corners.
      for(const degrees of (id==='dominos'?[-24,-12,12,24]:[-15,15])) {
        const rotated=await sharp(rgba,{raw:{width:size.width,height:size.height,channels:4}}).rotate(degrees,{background:'#fff'}).raw().toBuffer({resolveWithObject:true});
        const r=CV.train(rotated.data,rotated.info.width,rotated.info.height,id,name+'-rotation-'+degrees);
        r.points=[];r.desc=[];r.partial=target.partial;targets.push(r);
      }
    }
  }
  fs.writeFileSync(path.join(dir,'compiled.json'),JSON.stringify({version:4,targets}));
  console.log(targets.map(t=>`${t.id}/${t.variant}: ${t.points.length} features`).join('\n'));
})();
