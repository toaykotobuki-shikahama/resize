"use strict";
// Independent band renderer. Only the four margins are clipped for painting.
const BAND_DESIGNS = [
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
  const fallback={color:'#34465d',secondary:'#53667e',saturation:0.28,source:'既定色'};
  if(!ctx) return fallback;
  try {
    ctx.drawImage(image,0,0,96,96);
    const pixels=ctx.getImageData(0,0,96,96).data;
    function pick(edgeOnly) {
      const buckets=new Map();
      for(let y=0;y<96;y++)for(let x=0;x<96;x++) {
        if(edgeOnly && x>10 && x<85 && y>10 && y<85)continue;
        const i=(y*96+x)*4,[r,g,b,a]=pixels.slice(i,i+4);
        if(a<160)continue;
        const hi=Math.max(r,g,b),lo=Math.min(r,g,b);
        if(hi<35 || lo>228 || hi-lo<24)continue;
        const key=[r,g,b].map(v=>Math.floor(v/32)).join(',');
        const group=buckets.get(key)||{n:0,r:0,g:0,b:0};
        group.n++;group.r+=r;group.g+=g;group.b+=b;buckets.set(key,group);
      }
      return [...buckets.values()].sort((a,b)=>b.n-a.n)[0];
    }
    let group=pick(true),source='外周';
    if(!group || group.n<12){group=pick(false);source='画像全体';}
    if(!group || group.n<12)return fallback;
    const raw=[group.r,group.g,group.b].map(v=>v/group.n);
    const max=Math.max(...raw),min=Math.min(...raw),saturation=(max-min)/Math.max(1,max);
    const gray=raw[0]*0.2126+raw[1]*0.7152+raw[2]*0.0722;
    // Reduce saturation and keep medium-dark luminance for unobtrusive framing.
    const adjusted=raw.map(v=>v*0.65+gray*0.35);
    const luminance=adjusted[0]*0.2126+adjusted[1]*0.7152+adjusted[2]*0.0722;
    const factor= Math.min(1.6,Math.max(0.45,95/Math.max(1,luminance)));
    const color=bandHex(adjusted.map(v=>v*factor));
    return {color,secondary:bandMix(color,[220,228,240],0.24),saturation,source};
  } catch {return fallback;}
}
function automaticBandDesign(rect,width,height,palette) {
  const area=1-rect.w*rect.h/(width*height);
  if(area<0.12)return 'solid';
  if(area>0.55)return 'blur';
  if(palette.saturation<0.2)return 'geometry';
  return rect.x>0 ? 'gradient' : 'stripes';
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
  const color=state.band.colorMode==='manual'?state.band.color:palette.color;
  return {design,color,secondary:bandMix(color,[220,228,240],0.24),rect,palette};
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
  if(settings.design==='gradient') {
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
  ctx.restore();
}
