const arenaPropSprites = new Map();
function propPolygon(ctx, points, fill, stroke = null) {
  ctx.beginPath(); points.forEach(([x,y],i)=>i ? ctx.lineTo(x,y) : ctx.moveTo(x,y)); ctx.closePath();
  ctx.fillStyle=fill; ctx.fill(); if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=1;ctx.stroke();}
}
function propEllipse(ctx,x,y,rx,ry,color){ctx.fillStyle=color;ctx.beginPath();ctx.ellipse(x,y,rx,ry,0,0,Math.PI*2);ctx.fill();}
function propLine(ctx,points,color,width=1){ctx.strokeStyle=color;ctx.lineWidth=width;ctx.beginPath();points.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.stroke();}

function paintRockFormation(ctx, o, random) {
  const x = o.rx, y = o.ry;
  const rightBank = o.x > 800;
  const peak = rightBank ? 0.12 : -0.28;
  const height = rightBank ? 44 : 34;
  const outline = [
    [-x * .96, -y * .04], [-x * .8, -y * .55 - height * .25],
    [x * peak, -y * .72 - height], [x * .45, -y * .56 - height * .72],
    [x * .83, -y * .24 - height * .28], [x * .98, y * .12],
    [x * .66, y * .63], [x * .08, y * .88], [-x * .62, y * .64],
  ];
  const ridge = [x * (peak + .12), -y * .12 - height * .4];
  const shoulder = [x * .5, y * .06];
  propEllipse(ctx, 3, y * .25, x * .94, y * .66, '#242a2880');
  propPolygon(ctx, outline, '#666d6c', '#343d3e');
  propPolygon(ctx, [outline[0], outline[1], outline[2], ridge, [-x * .54, y * .18]], '#a4aaa5');
  propPolygon(ctx, [outline[2], outline[3], outline[4], shoulder, ridge], '#858f8d');
  propPolygon(ctx, [outline[0], [-x * .54, y * .18], ridge, [x * .02, y * .83], outline[8]], '#727d7c');
  propPolygon(ctx, [ridge, shoulder, outline[6], outline[7], [x * .02, y * .83]], '#535f60');
  propPolygon(ctx, [shoulder, outline[4], outline[5], outline[6]], '#414e51');
  propLine(ctx, [outline[1], outline[2], outline[3]], '#c4c9bd', 2);
  propLine(ctx, [outline[2], ridge, [-x * .54, y * .18]], '#b0b7ad', 1.5);
  propLine(ctx, [[x * .31, -y * .55 - height * .6], [x * .16, -y * .23],
    [x * .24, y * .05], [x * .08, y * .32], [x * .14, y * .68]], '#303d40', 2);
  propLine(ctx, [[x * .24, y * .05], [x * .43, y * .12], [x * .52, y * .32]], '#374448', 1.2);
  ctx.save();
  ctx.beginPath();
  outline.forEach(([px, py], i) => i ? ctx.lineTo(px, py) : ctx.moveTo(px, py));
  ctx.closePath();
  ctx.clip();
  for (let i = 0; i < 85; i++) {
    const px = (random() * 2 - 1) * x;
    const py = -y - height + random() * (y * 2 + height);
    ctx.fillStyle = i % 3 ? '#26383b24' : '#edf0da40';
    ctx.fillRect(px, py, 1 + random() * 2, 1);
  }
  // Low stone shelves and moss anchor the silhouette to the collision footprint.
  propPolygon(ctx, [[-x * .85, y * .22], [-x * .48, y * .16], [-x * .26, y * .47],
    [-x * .4, y * .7], [-x * .72, y * .55]], '#8c9590', '#4e5d5c');
  propLine(ctx, [[-x * .82, y * .23], [-x * .49, y * .2], [-x * .29, y * .46]], '#bcc3b4', 1.5);
  for (let i = 0; i < 16; i++) {
    const px = (random() * 1.4 - .7) * x;
    const py = y * (.5 + random() * .27);
    propEllipse(ctx, px, py, 2 + random() * 5, 1 + random() * 2, i % 2 ? '#63715a88' : '#89927866');
  }
  ctx.restore();
}

export function paintArenaObstacle(ctx,o){
  ctx.save();ctx.lineJoin='round';ctx.lineCap='round';
  let seed=(Math.round(o.x*13+o.y*7)+17)>>>0;
  const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  for(let i=4;i>=0;i--)propEllipse(ctx,6+i,8+i*.6,o.rx*(.88+i*.055),o.ry*(.7+i*.065),`rgba(27,25,20,${.035+i*.008})`);
  if(o.type==='pillar'){
    propPolygon(ctx,[[-36,-6],[18,-17],[38,-5],[38,14],[-14,25],[-36,12]],'#5a5549','#47463c');
    propPolygon(ctx,[[-36,-6],[18,-17],[38,-5],[-14,8]],'#a29a83','#bbb197');
    propPolygon(ctx,[[-14,8],[38,-5],[38,14],[-14,25]],'#6f695a');
    propEllipse(ctx,0,-3,29,13,'#79725f');propEllipse(ctx,0,-9,29,12,'#bbb098');
    const stone=ctx.createLinearGradient(-24,0,25,0);stone.addColorStop(0,'#827963');stone.addColorStop(.27,'#c7bda4');stone.addColorStop(.55,'#b1a68d');stone.addColorStop(1,'#665f50');
    ctx.fillStyle=stone;ctx.fillRect(-24,-81,48,71);
    for(let x=-18;x<=18;x+=9){propLine(ctx,[[x,-79],[x,-14]],'#68635088',3);propLine(ctx,[[x+2,-78],[x+2,-15]],'#e0d4b388',1);}
    propEllipse(ctx,0,-12,26,9,'#b6aa8c');propEllipse(ctx,0,-16,25,8,'#91866e');
    propPolygon(ctx,[[-30,-88],[21,-94],[31,-83],[29,-73],[-29,-73]],'#867e69','#5d594c');
    propEllipse(ctx,0,-87,31,13,'#d0c5a9');propEllipse(ctx,0,-88,23,8,'#b4a98d');
    propLine(ctx,[[-27,-88],[-10,-83],[3,-84],[7,-89],[18,-91]],'#77715e',1.4);
    propLine(ctx,[[8,-73],[4,-57],[11,-49],[6,-34],[9,-24]],'#605b4d',1.2);
    propLine(ctx,[[4,-57],[-4,-52],[-8,-43]],'#827862',1);
    for(let i=0;i<55;i++){const x=-22+random()*44,y=-72+random()*52;ctx.fillStyle=i%3?'#625b4938':'#eee0ba50';ctx.fillRect(x,y,1+random()*1.5,1);}
    for(let i=0;i<20;i++)propEllipse(ctx,-24+random()*49,-9+random()*20,1.5+random()*3,1+random()*2,i%2?'#626b44':'#7c8257');
    propPolygon(ctx,[[-36,19],[-29,15],[-23,19],[-25,24],[-34,24]],'#afa489','#766e59');
  }else if(o.type==='rock'){
    paintRockFormation(ctx, o, random);
  }else if(o.type==='tree'){
    propEllipse(ctx,0,2,29,21,'#585c3d88');
    for(let i=0;i<7;i++){const a=i*.9;propLine(ctx,[[0,-9],[Math.cos(a)*17,Math.sin(a)*14],[Math.cos(a)*31,Math.sin(a)*24]],'#4a4030',5);propLine(ctx,[[0,-11],[Math.cos(a)*17,Math.sin(a)*14]],'#9a8250',1.5);}
    propPolygon(ctx,[[-10,8],[-7,-49],[1,-67],[9,-50],[10,9]],'#65513b','#403a2c');
    propLine(ctx,[[-4,3],[-2,-24],[-4,-48],[1,-62]],'#af9460',2);
    for(const points of [[[0,-36],[-18,-52],[-27,-70]],[[4,-40],[22,-59],[24,-77]],[[-1,-54],[-10,-76],[-8,-89]],[[5,-30],[27,-41],[37,-58]]]){propLine(ctx,points,'#504931',5);propLine(ctx,points,'#8c7b4f',1);}
    const clusters=[[-24,-64,19],[-5,-85,19],[20,-73,21],[33,-51,17],[-17,-43,19],[4,-55,24]];
    for(const [x,y,r] of clusters){propEllipse(ctx,x,y,r,r*.65,'#444d32');for(let i=0;i<20;i++){const a=random()*Math.PI*2,d=random()*r;propEllipse(ctx,x+Math.cos(a)*d,y+Math.sin(a)*d*.65,2+random()*4,1.5+random()*2,['#647047','#798056','#929565','#515d3d'][i%4]);}}
    for(let i=0;i<12;i++)propEllipse(ctx,-30+random()*60,4+random()*19,2,1,'#968650');
  }else{
    propPolygon(ctx,[[-26,8],[20,2],[28,10],[27,21],[-26,24]],'#655f4f','#4f4b40');
    propPolygon(ctx,[[-26,8],[20,2],[28,10],[-17,17]],'#a0977e');
    propPolygon(ctx,[[-20,9],[-20,-53],[-13,-65],[12,-65],[22,-55],[22,8]],'#9e947a','#595647');
    propPolygon(ctx,[[12,-65],[22,-55],[22,8],[16,12],[16,-54]],'#706b59');
    propLine(ctx,[[-15,4],[-15,-51],[-10,-58],[9,-58],[15,-51]],'#d1c4a1',1.4);
    ctx.strokeStyle='#68634f';ctx.lineWidth=1;ctx.strokeRect(-11,-43,22,36);
    propLine(ctx,[[0,-38],[0,-21]],'#5b5849',3);propLine(ctx,[[-6,-33],[6,-33]],'#5b5849',3);
    for(let i=0;i<3;i++)propLine(ctx,[[-7,-16+i*3],[6-i*2,-16+i*3]],'#625d4b',1);
    propLine(ctx,[[-19,-16],[-11,-21],[-13,-29],[-7,-36]],'#514e40',1.2);
    for(let i=0;i<32;i++){ctx.fillStyle=i%2?'#ddd0a930':'#4e513229';ctx.fillRect(-17+random()*33,-54+random()*60,1+random()*2,1);}
    for(let i=0;i<12;i++)propEllipse(ctx,-23+random()*45,10+random()*9,2+random()*2,1.5,'#707747');
  }
  ctx.restore();
}

function arenaPropSprite(o){
  const key=[o.type,o.rx,o.ry,o.x,o.y].join(':');if(arenaPropSprites.has(key))return arenaPropSprites.get(key);
  const width=Math.ceil(o.rx*2+50),height=Math.ceil(o.ry*2+150),anchorX=width/2,anchorY=height-o.ry-24;
  const canvas=document.createElement('canvas');canvas.width=width*2;canvas.height=height*2;
  const ctx=canvas.getContext('2d');ctx.scale(2,2);ctx.translate(anchorX,anchorY);paintArenaObstacle(ctx,o);
  const sprite={image:canvas,width,height,anchorX,anchorY,ready:Promise.resolve()};
  if(typeof Image==='function'){
    const image=new Image();sprite.ready=new Promise(resolve=>{image.onload=()=>{sprite.image=image;resolve();};image.onerror=()=>resolve();});image.src=canvas.toDataURL('image/png');
  }
  arenaPropSprites.set(key,sprite);return sprite;
}
export async function prepareArenaObstacles(obstacles){await Promise.all(obstacles.map(o=>arenaPropSprite(o).ready));}
export function drawArenaObstacle(ctx,o){
  if(typeof document==='undefined'){ctx.save();ctx.translate(o.x,o.y);paintArenaObstacle(ctx,o);ctx.restore();return;}
  const sprite=arenaPropSprite(o);ctx.drawImage(sprite.image,o.x-sprite.anchorX,o.y-sprite.anchorY,sprite.width,sprite.height);
}
