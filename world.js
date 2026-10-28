"use strict";

window.CityWorld = (() => {
  function mat(T,color,rough=.75,metal=.04,extra={}) { return new T.MeshStandardMaterial({color,roughness:rough,metalness:metal,...extra}); }
  function box(T,w,h,d,color,shadow=true) { const m=new T.Mesh(new T.BoxGeometry(w,h,d),mat(T,color));m.castShadow=shadow;m.receiveShadow=true;return m; }

  function facadeTexture(T,seed) {
    const c=document.createElement("canvas");c.width=128;c.height=256;const g=c.getContext("2d");
    g.fillStyle=["#4f5557","#5b5650","#555c61","#4c514e"][seed%4];g.fillRect(0,0,128,256);
    g.fillStyle="rgba(0,0,0,.12)";for(let y=0;y<256;y+=32)g.fillRect(0,y,128,2);
    for(let y=13;y<245;y+=28)for(let x=10;x<120;x+=24){const on=(x*y+seed*17)%7>2;g.fillStyle=on?"#d7c792":"#263843";g.fillRect(x,y,13,14);g.fillStyle="rgba(255,255,255,.15)";g.fillRect(x,y,13,2)}
    const t=new T.CanvasTexture(c);t.colorSpace=T.SRGBColorSpace;t.wrapS=t.wrapT=T.RepeatWrapping;t.anisotropy=4;return t;
  }

  function makeCar(T,color,cop=false) {
    const g=new T.Group(),paint=mat(T,cop?0xe9edf2:color,.3,.45);
    const body=new T.Mesh(new T.BoxGeometry(14,3.1,7.4),paint);body.position.y=2.7;body.castShadow=true;g.add(body);
    const hood=new T.Mesh(new T.BoxGeometry(4.2,1.1,7),paint);hood.position.set(5.2,4,0);hood.castShadow=true;g.add(hood);
    const cabin=box(T,6.2,2.8,6.25,cop?0x202934:0x233744);cabin.position.set(-1,5.15,0);g.add(cabin);
    const glass=mat(T,0x75a8bd,.1,.25,{transparent:true,opacity:.78});
    for(const x of[1.95,-4.05]){const pane=new T.Mesh(new T.BoxGeometry(.16,2,5.4),glass);pane.position.set(x,5.25,0);g.add(pane)}
    const rubber=mat(T,0x101114,1),rim=mat(T,0x9ca2a6,.35,.7);
    for(const x of[-4.5,4.5])for(const z of[-3.75,3.75]){const w=new T.Mesh(new T.CylinderGeometry(1.25,1.25,.8,14),rubber);w.rotation.x=Math.PI/2;w.position.set(x,1.3,z);w.castShadow=true;g.add(w);const r=new T.Mesh(new T.CylinderGeometry(.58,.58,.84,12),rim);r.rotation.x=Math.PI/2;r.position.copy(w.position);g.add(r)}
    const lamp=mat(T,0xfff2b0,.25,.1,{emissive:0xffd46a,emissiveIntensity:1.5});
    for(const z of[-2.25,2.25]){const l=new T.Mesh(new T.BoxGeometry(.25,.8,1.35),lamp);l.position.set(7.08,2.8,z);g.add(l)}
    const rear=mat(T,0xff233f,.3,.1,{emissive:0x8f0015,emissiveIntensity:1});for(const z of[-2.3,2.3]){const l=new T.Mesh(new T.BoxGeometry(.25,.7,1.1),rear);l.position.set(-7.08,2.75,z);g.add(l)}
    const bumper=box(T,.45,.7,7.65,0x252a2c);bumper.position.set(7.25,1.75,0);g.add(bumper);const back=bumper.clone();back.position.x=-7.25;g.add(back);
    if(cop){const red=mat(T,0xff2448,.2,.1,{emissive:0xff002a,emissiveIntensity:2}),blue=mat(T,0x258bff,.2,.1,{emissive:0x006aff,emissiveIntensity:2});const r=box(T,1.7,.45,1.1,0xff2448),b=box(T,1.7,.45,1.1,0x258bff);r.material=red;b.material=blue;r.position.set(-1,7,-1);b.position.set(-1,7,1);g.add(r,b);g.userData.lights=[r,b]}
    return g;
  }

  function makePerson(T,color=0x2968b2) {
    const g=new T.Group(),skin=mat(T,0xc99168),cloth=mat(T,color),dark=mat(T,0x20242c),shoe=mat(T,0x111215);
    const torso=new T.Mesh(new T.BoxGeometry(2.25,3.4,1.45),cloth);torso.position.y=4.2;torso.castShadow=true;g.add(torso);
    const head=new T.Mesh(new T.SphereGeometry(1.05,14,10),skin);head.position.y=6.8;head.castShadow=true;g.add(head);
    const hair=new T.Mesh(new T.SphereGeometry(1.08,14,7,0,Math.PI*2,0,Math.PI*.52),mat(T,0x29231f));hair.position.y=7.15;g.add(hair);
    const arms=[],legs=[];
    for(const side of[-1,1]){const arm=new T.Group(),upper=new T.Mesh(new T.BoxGeometry(.62,2.8,.65),skin);upper.position.y=-1.15;arm.add(upper);arm.position.set(side*1.48,5.5,0);g.add(arm);arms.push(arm);
      const leg=new T.Group(),limb=new T.Mesh(new T.BoxGeometry(.78,2.9,.85),dark);limb.position.y=-1.25;leg.add(limb);const foot=new T.Mesh(new T.BoxGeometry(.88,.55,1.5),shoe);foot.position.set(0,-2.55,.28);leg.add(foot);leg.position.set(side*.65,2.8,0);g.add(leg);legs.push(leg)}
    g.userData={arms,legs,walk:0};return g;
  }

  function create(T,scene,random,{CITY,BLOCK,ROAD}) {
    const solids=[],textures=[0,1,2,3].map(i=>facadeTexture(T,i));
    const ground=new T.Mesh(new T.PlaneGeometry(CITY+300,CITY+300),mat(T,0x375a38,1));ground.rotation.x=-Math.PI/2;ground.position.set(CITY/2,-.16,CITY/2);ground.receiveShadow=true;scene.add(ground);
    const asphalt=mat(T,0x282c30,.98),sidewalk=mat(T,0x7b7d78,.95);
    for(let n=0;n<CITY;n+=BLOCK){const v=new T.Mesh(new T.PlaneGeometry(ROAD,CITY),asphalt);v.rotation.x=-Math.PI/2;v.position.set(n+ROAD/2,.01,CITY/2);v.receiveShadow=true;scene.add(v);const h=new T.Mesh(new T.PlaneGeometry(CITY,ROAD),asphalt);h.rotation.x=-Math.PI/2;h.position.set(CITY/2,.015,n+ROAD/2);h.receiveShadow=true;scene.add(h)}
    const dashGeo=new T.BoxGeometry(.62,.035,8),dashMat=new T.MeshBasicMaterial({color:0xc9c7ac}),count=Math.ceil(CITY/18)*(CITY/BLOCK)*2,dashes=new T.InstancedMesh(dashGeo,dashMat,count),dummy=new T.Object3D();let di=0;
    for(let n=0;n<CITY;n+=BLOCK)for(let p=8;p<CITY;p+=18){dummy.position.set(n+ROAD/2,.055,p);dummy.rotation.set(0,0,0);dummy.updateMatrix();dashes.setMatrixAt(di++,dummy.matrix);dummy.position.set(p,.056,n+ROAD/2);dummy.rotation.y=Math.PI/2;dummy.updateMatrix();dashes.setMatrixAt(di++,dummy.matrix)}scene.add(dashes);
    const poleMat=mat(T,0x252b30,.75,.65),lampMat=mat(T,0xffe0a0,.2,.05,{emissive:0xffb94a,emissiveIntensity:2.4});
    for(let n=0;n<CITY;n+=BLOCK*2){for(const side of[ROAD+8,BLOCK-8]){const pole=new T.Mesh(new T.CylinderGeometry(.35,.5,12,8),poleMat);pole.position.set(n+side,6,n+ROAD+8);pole.castShadow=true;scene.add(pole);const lamp=new T.Mesh(new T.SphereGeometry(1.1,10,8),lampMat);lamp.position.set(pole.position.x,12.4,pole.position.z);scene.add(lamp)}}
    for(let gx=0;gx<CITY;gx+=BLOCK)for(let gz=0;gz<CITY;gz+=BLOCK){
      const slab=new T.Mesh(new T.PlaneGeometry(BLOCK-ROAD-4,BLOCK-ROAD-4),sidewalk);slab.rotation.x=-Math.PI/2;slab.position.set(gx+(ROAD+BLOCK)/2,.035,gz+(ROAD+BLOCK)/2);slab.receiveShadow=true;scene.add(slab);
      const m=12+random()*6,w=BLOCK-ROAD-m*2,d=w,h=26+random()*105,tex=textures[(gx/BLOCK+gz/BLOCK)%4|0].clone();tex.needsUpdate=true;tex.repeat.set(2,Math.max(1,Math.round(h/34)));
      const wall=mat(T,0xffffff,.82,.03,{map:tex}),roofMat=mat(T,0x3b3e40,.95);const b=new T.Mesh(new T.BoxGeometry(w,h,d),[wall,wall,roofMat,roofMat,wall,wall]);b.position.set(gx+ROAD+m+w/2,h/2,gz+ROAD+m+d/2);b.castShadow=true;b.receiveShadow=true;scene.add(b);
      solids.push({minX:b.position.x-w/2-5,maxX:b.position.x+w/2+5,minZ:b.position.z-d/2-5,maxZ:b.position.z+d/2+5});
      const roof=box(T,w*.25,2.4,d*.28,0x404548);roof.position.set(b.position.x,h+1.2,b.position.z);scene.add(roof);
      if((gx+gz)/BLOCK%2===0){const trunk=new T.Mesh(new T.CylinderGeometry(.75,.95,6,8),mat(T,0x6b4930));trunk.position.set(gx+ROAD+6,3,gz+ROAD+6);trunk.castShadow=true;scene.add(trunk);const crown=new T.Mesh(new T.IcosahedronGeometry(3.8,1),mat(T,0x2f7a42));crown.position.set(trunk.position.x,8,trunk.position.z);crown.castShadow=true;scene.add(crown)}
    }
    scene.add(new T.HemisphereLight(0xc7e7ff,0x385a38,2.05));const sun=new T.DirectionalLight(0xfff1d2,3.15);sun.position.set(420,650,260);sun.castShadow=true;sun.shadow.mapSize.set(1024,1024);sun.shadow.camera.left=-240;sun.shadow.camera.right=240;sun.shadow.camera.top=240;sun.shadow.camera.bottom=-240;sun.shadow.camera.far=1200;sun.shadow.camera.updateProjectionMatrix();scene.add(sun);
    const arr=new Float32Array(1800);for(let i=0;i<arr.length;i+=3){arr[i]=(random()-.5)*280;arr[i+1]=random()*150;arr[i+2]=(random()-.5)*280}const rg=new T.BufferGeometry();rg.setAttribute("position",new T.BufferAttribute(arr,3));const rain=new T.Points(rg,new T.PointsMaterial({color:0xa8d9ff,size:.85,transparent:true,opacity:.58}));rain.visible=false;scene.add(rain);
    return {solids,sun,rain};
  }
  return {create,makeCar,makePerson};
})();
