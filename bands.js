"use strict";
// Independent band renderer. Only the four margins are clipped for painting.
const BAND_TEXTURE_SOURCES = {"satin": "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"256\" height=\"256\" viewBox=\"0 0 256 256\"><defs><linearGradient id=\"silk\" x1=\"0\" y1=\"0\" x2=\"1\" y2=\"0\"><stop stop-color=\"#fff\" stop-opacity=\".05\"/><stop offset=\".2\" stop-color=\"#fff\" stop-opacity=\".6\"/><stop offset=\".43\" stop-color=\"#fff\" stop-opacity=\".03\"/><stop offset=\".7\" stop-color=\"#fff\" stop-opacity=\".42\"/><stop offset=\"1\" stop-color=\"#fff\" stop-opacity=\".05\"/></linearGradient></defs><rect width=\"256\" height=\"256\" fill=\"url(#silk)\"/><g fill=\"none\" stroke=\"#fff\" stroke-opacity=\".25\"><path d=\"M-80 256 Q36 200 120 64 T320-40\" stroke-width=\"35\"/><path d=\"M-50 310 Q60 240 150 128 T340 0\" stroke-width=\"12\"/></g></svg>", "pearl": "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"256\" height=\"256\" viewBox=\"0 0 256 256\"><defs><radialGradient id=\"pearl\"><stop stop-color=\"#fff\" stop-opacity=\".8\"/><stop offset=\"1\" stop-color=\"#fff\" stop-opacity=\"0\"/></radialGradient><radialGradient id=\"sheen\"><stop stop-color=\"#fff\" stop-opacity=\".5\"/><stop offset=\"1\" stop-color=\"#fff\" stop-opacity=\"0\"/></radialGradient></defs><circle cx=\"32\" cy=\"48\" r=\"120\" fill=\"url(#pearl)\"/><circle cx=\"200\" cy=\"208\" r=\"130\" fill=\"url(#sheen)\"/><g fill=\"#fff\" opacity=\".25\"><circle cx=\"150\" cy=\"45\" r=\"1\"/><circle cx=\"95\" cy=\"130\" r=\"1.3\"/><circle cx=\"208\" cy=\"85\" r=\"1\"/><circle cx=\"60\" cy=\"210\" r=\".8\"/></g></svg>", "paper": "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"256\" height=\"256\" viewBox=\"0 0 256 256\"><defs><pattern id=\"weave\" width=\"8\" height=\"8\" patternUnits=\"userSpaceOnUse\"><path d=\"M0 1H8 M1 0V8\" stroke=\"#fff\" stroke-width=\".8\" opacity=\".32\"/><path d=\"M0 5H8 M5 0V8\" stroke=\"#142a44\" stroke-width=\".5\" opacity=\".1\"/><circle cx=\"3\" cy=\"3\" r=\".45\" fill=\"#fff\" opacity=\".6\"/></pattern></defs><rect width=\"256\" height=\"256\" fill=\"url(#weave)\"/></svg>", "bright-geometry": "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"256\" height=\"256\" viewBox=\"0 0 256 256\"><g fill=\"#fff\" stroke=\"#fff\" stroke-width=\"1.5\"><path d=\"M-30 20L100-30 70 100Z\" fill-opacity=\".22\" stroke-opacity=\".45\"/><path d=\"M160 50L280 0 230 140Z\" fill-opacity=\".12\" stroke-opacity=\".4\"/><path d=\"M40 210L130 120 155 256Z\" fill-opacity=\".2\" stroke-opacity=\".5\"/><path d=\"M190 210L260 160 300 270Z\" fill-opacity=\".16\" stroke-opacity=\".3\"/></g></svg>", "simple": "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"256\" height=\"256\" viewBox=\"0 0 256 256\"><defs><linearGradient id=\"soft\" x1=\"0\" y1=\"0\" x2=\"1\" y2=\"1\"><stop stop-color=\"#fff\" stop-opacity=\".32\"/><stop offset=\".5\" stop-color=\"#fff\" stop-opacity=\"0\"/><stop offset=\"1\" stop-color=\"#fff\" stop-opacity=\".24\"/></linearGradient></defs><rect width=\"256\" height=\"256\" fill=\"url(#soft)\"/></svg>"};
const BAND_TEXTURE_IMAGES = new Map();
const BAND_TEXTURE_READY = Promise.all(Object.entries(BAND_TEXTURE_SOURCES).map(([id,svg]) => new Promise(resolve => {
  const image = new Image();
  image.onload = () => { BAND_TEXTURE_IMAGES.set(id,image); resolve(); };
  image.onerror = () => resolve();
  image.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
})));

const BAND_DESIGNS = [
  { id: 'satin', label: '光沢・サテン', texture: true },
  { id: 'pearl', label: 'パール', texture: true },
  { id: 'paper', label: '紙・布', texture: true },
  { id: 'bright-geometry', label: '明るい幾何学', texture: true },
  { id: 'simple', label: 'シンプル', texture: true },
  { id: 'solid', label: '単色' }, { id: 'gradient', label: 'グラデーション' },
  { id: 'blur', label: '画像ぼかし' }, { id: 'stripes', label: 'ストライプ' },
  { id: 'dots', label: 'ドット' }, { id: 'geometry', label: '幾何学' },
];
function containedRect(image, width, height) {
  const scale = Math.min(width / image.naturalWidth, height / image.naturalHeight);
  const w = image.naturalWidth * scale, h = image.naturalHeight * scale;
  return { x: (width-w)/2, y: (height-h)/2, w, h };
}
function bandMargins(rect, width, height) {
  return [
    {x:0,y:0,w:width,h:rect.y,edge:'top'},
    {x:0,y:rect.y+rect.h,w:width,h:Math.max(0,height-rect.y-rect.h),edge:'bottom'},
    {x:0,y:rect.y,w:rect.x,h:rect.h,edge:'left'},
    {x:rect.x+rect.w,y:rect.y,w:Math.max(0,width-rect.x-rect.w),h:rect.h,edge:'right'},
  ].filter(r=>r.w>0.001 && r.h>0.001);
}
function bandRgb(hex) { return [1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)); }
function bandHex(rgb) { return '#'+rgb.map(v=>Math.round(Math.min(255,Math.max(0,v))).toString(16).padStart(2,'0')).join(''); }
function bandMix(hex, target, fraction) { return bandHex(bandRgb(hex).map((v,i)=>v*(1-fraction)+target[i]*fraction)); }
function extractBandPalette(image) {
  const canvas=document.createElement('canvas');canvas.width=96;canvas.height=96;
  const ctx=canvas.getContext('2d',{willReadFrequently:true});
  const fallback={color:'#5598df',secondary:'#79c9bd',saturation:0.55,source:'既定色'};
  if(!ctx)return fallback;
  try {
    ctx.drawImage(image,0,0,96,96);
    const pixels=ctx.getImageData(0,0,96,96).data;
    function candidates(edgeOnly) {
      const buckets=new Map();
      for(let y=0;y<96;y++)for(let x=0;x<96;x++) {
        if(edgeOnly && x>10 && x<85 && y>10 && y<85)continue;
        const i=(y*96+x)*4,[r,g,b,a]=pixels.slice(i,i+4);
        if(a<160)continue;
        const hi=Math.max(r,g,b),lo=Math.min(r,g,b),sat=(hi-lo)/Math.max(1,hi);
        if(hi<45 || lo>228 || sat<0.2)continue;
        const key=[r,g,b].map(v=>Math.floor(v/32)).join(',');
        const group=buckets.get(key)||{n:0,r:0,g:0,b:0};
        group.n++;group.r+=r;group.g+=g;group.b+=b;buckets.set(key,group);
      }
      return [...buckets.values()].filter(g=>g.n>=12).map(g=>{
        const rgb=[g.r,g.g,g.b].map(v=>v/g.n);
        const max=Math.max(...rgb),min=Math.min(...rgb),sat=(max-min)/Math.max(1,max);
        // Saturated, visible colors outrank small dark/brown edge details.
        const score=Math.sqrt(g.n)*(0.3+sat)*Math.max(0.3,max/255);
        return {rgb,sat,score};
      }).sort((a,b)=>b.score-a.score);
    }
    let pool=candidates(true),source='外周';
    if(!pool.length){pool=candidates(false);source='画像全体';}
    if(!pool.length)return fallback;
    const first=pool[0];
    function difference(a,b) {
      const am=Math.max(...a),bm=Math.max(...b);
      return Math.sqrt(a.reduce((sum,v,i)=>sum+(v/am-b[i]/bm)**2,0));
    }
    const second=pool.slice(1).find(c=>difference(c.rgb,first.rgb)>0.5)
      ||candidates(false).find(c=>difference(c.rgb,first.rgb)>0.5);
    const color=bandHex(first.rgb);
    return {color,secondary:second?bandHex(second.rgb):bandMix(color,[255,255,255],0.35),saturation:first.sat,source};
  } catch {return fallback;}
}
function bandTone(color,tone) {
  if(tone==='bright')return bandMix(color,[255,255,255],0.46);
  if(tone==='calm')return bandMix(color,[45,58,78],0.32);
  return bandMix(color,[255,255,255],0.16);
}
function automaticBandDesign(rect,width,height,palette) {
  const area=1-rect.w*rect.h/(width*height);
  if(area<0.12)return 'simple';
  if(palette.saturation<0.3)return 'pearl';
  if(area>0.55)return 'satin';
  return rect.x>0?'bright-geometry':'satin';
}
function resolveBandSettings(item,image,width,height) {
  const rect=containedRect(image,width,height);
  const palette=item.bandPalette || (item.bandPalette=extractBandPalette(image));
  let design=item.bandOverride || state.band.design;
  if(!item.bandOverride && state.band.rotation!=='common') {
    const pool=state.band.candidates;
    const index=state.items.indexOf(item);
    const pick=state.band.rotation==='sequence' ? Math.max(0,index)%pool.length : Math.floor(item.bandRandom*pool.length);
    design=pool[pick] || 'gradient';
  }
  if(design==='auto')design=automaticBandDesign(rect,width,height,palette);
  const manual=state.band.colorMode==='manual';
  const rawColor=manual?state.band.color:palette.color;
  const rawSecondary=manual?state.band.secondary:palette.secondary;
  const tone=state.band.tone||'bright';
  // Manual picker values are used literally; automatic colors follow the brightness selection.
  const color=manual?rawColor:bandTone(rawColor,tone);
  const secondary=manual?rawSecondary:bandTone(rawSecondary,tone);
  return {design,color,secondary,rect,palette,tone,frame:state.band.frame};
}
function paintBlurMargin(ctx,image,margin,color) {
  // Use a narrow edge strip, never a copy of the full artwork over its foreground.
  const iw=image.naturalWidth,ih=image.naturalHeight;
  let sx=0,sy=0,sw=iw,sh=ih;
  if(margin.edge==='top'||margin.edge==='bottom') { sh=Math.max(1,ih*0.12);sy=margin.edge==='bottom'?ih-sh:0; }
  else { sw=Math.max(1,iw*0.12);sx=margin.edge==='right'?iw-sw:0; }
  const bg=document.createElement('canvas');bg.width=256;bg.height=256;
  const b=bg.getContext('2d');b.fillStyle=color;b.fillRect(0,0,256,256);
  b.filter='blur(14px)';b.drawImage(image,sx,sy,sw,sh,-30,-30,316,316);b.filter='none';
  ctx.drawImage(bg,margin.x,margin.y,margin.w,margin.h);
  ctx.fillStyle=color;ctx.globalAlpha=0.3;ctx.fillRect(margin.x,margin.y,margin.w,margin.h);ctx.globalAlpha=1;
}
function drawDesignBands(ctx,image,width,height,settings) {
  const margins=bandMargins(settings.rect,width,height);
  if(!margins.length)return;
  ctx.save();ctx.beginPath();margins.forEach(r=>ctx.rect(r.x,r.y,r.w,r.h));ctx.clip();
  ctx.fillStyle=settings.color;ctx.fillRect(0,0,width,height);
  const unit=Math.max(1,Math.min(width,height)/1080);
  if(BAND_TEXTURE_SOURCES[settings.design]) {
    drawTextureBand(ctx,width,height,settings,unit);
  } else if(settings.design==='gradient') {
    const grad=ctx.createLinearGradient(0,0,width,height);grad.addColorStop(0,settings.color);grad.addColorStop(0.5,settings.secondary);grad.addColorStop(1,settings.color);
    ctx.fillStyle=grad;ctx.fillRect(0,0,width,height);
  } else if(settings.design==='blur') {
    margins.forEach(r=>paintBlurMargin(ctx,image,r,settings.color));
  } else {
    ctx.strokeStyle=settings.secondary;ctx.fillStyle=settings.secondary;ctx.lineWidth=2*unit;
    if(settings.design==='stripes') {
      ctx.globalAlpha=0.3;ctx.lineWidth=12*unit;
      for(let x=-height;x<width+height;x+=65*unit){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x+height,height);ctx.stroke();}
    } else if(settings.design==='dots') {
      ctx.globalAlpha=0.45;
      for(let y=24*unit;y<height;y+=44*unit)for(let x=24*unit;x<width;x+=44*unit){ctx.beginPath();ctx.arc(x,y,2.5*unit,0,Math.PI*2);ctx.fill();}
    } else if(settings.design==='geometry') {
      ctx.globalAlpha=0.4;
      for(let y=-100*unit;y<height+100*unit;y+=190*unit)for(let x=-100*unit;x<width+100*unit;x+=190*unit){ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+95*unit,y+60*unit);ctx.lineTo(x+70*unit,y+135*unit);ctx.closePath();ctx.stroke();}
    }
  }
  if(settings.frame)drawBandEdge(ctx,margins,settings,unit);
  ctx.restore();
}

function drawTextureBand(ctx,width,height,settings,unit) {
  const gradient=ctx.createLinearGradient(0,0,width,height);
  gradient.addColorStop(0,settings.color);gradient.addColorStop(0.52,settings.secondary);gradient.addColorStop(1,settings.color);
  ctx.fillStyle=gradient;ctx.fillRect(0,0,width,height);
  // Broad light is drawn once per output, with no repeating satin seams.
  if(settings.design==='satin'||settings.design==='pearl') {
    const glow=ctx.createRadialGradient(width*.2,height*.15,0,width*.2,height*.15,Math.max(width,height)*.8);
    glow.addColorStop(0,'rgba(255,255,255,.42)');glow.addColorStop(1,'rgba(255,255,255,0)');
    ctx.fillStyle=glow;ctx.fillRect(0,0,width,height);
  }
  const texture=BAND_TEXTURE_IMAGES.get(settings.design);
  if(!texture)return; // Graceful gradient fallback if an asset cannot decode.
  ctx.save();
  if(settings.design==='paper'||settings.design==='bright-geometry') {
    const pattern=ctx.createPattern(texture,'repeat');
    if(pattern) {pattern.setTransform(new DOMMatrix().scale(settings.design==='paper'?unit:unit*1.65));ctx.fillStyle=pattern;ctx.fillRect(0,0,width,height);}
  } else { ctx.drawImage(texture,0,0,width,height); }
  ctx.restore();
}
function drawBandEdge(ctx,margins,settings,unit) {
  // Lines stay strictly outside the artwork. Never stroke its inside boundary.
  const thickness=3*unit;
  margins.forEach(m=>{
    ctx.fillStyle='rgba(255,255,255,.78)';
    if(m.edge==='top')ctx.fillRect(m.x,m.y+Math.max(0,m.h-thickness),m.w,Math.min(m.h,thickness));
    if(m.edge==='bottom')ctx.fillRect(m.x,m.y,m.w,Math.min(m.h,thickness));
    if(m.edge==='left')ctx.fillRect(m.x+Math.max(0,m.w-thickness),m.y,Math.min(m.w,thickness),m.h);
    if(m.edge==='right')ctx.fillRect(m.x,m.y,Math.min(m.w,thickness),m.h);
  });
}
