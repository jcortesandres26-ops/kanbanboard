"use strict";

(() => {
  const q = s => document.querySelector(s);
  const ui = { intro:q("#intro"), pause:q("#pause"), play:q("#playBtn"), resume:q("#resumeBtn"), load:q("#loadState"), speed:q("#speed"), money:q("#money"), wanted:q("#wanted"), healthBar:q("#healthBar"), healthText:q("#healthText"), missionText:q("#missionText"), missionDistance:q("#missionDistance"), clock:q("#clock"), sound:q("#soundBtn") };
  if (!window.THREE) return showError("No se pudo abrir el motor 3D.");
  try { boot(); } catch (error) { console.error(error); showError("El juego no pudo iniciarse. Recarga la página."); }

  function showError(text) {
    ui.load.textContent = text; ui.load.classList.add("error"); ui.play.disabled = true;
  }

  function boot() {
    const T = window.THREE, canvas = q("#game"), mini = q("#minimap"), map = mini.getContext("2d");
    const scene = new T.Scene(); scene.background = new T.Color(0x8db0c8); scene.fog = new T.FogExp2(0x8db0c8,.00125);
    const camera = new T.PerspectiveCamera(62,innerWidth/innerHeight,.1,2600);
    let renderer;
    try { renderer = new T.WebGLRenderer({canvas,antialias:true,powerPreference:"high-performance"}); }
    catch (error) { return showError("Este navegador no permite juegos 3D."); }
    renderer.setPixelRatio(Math.min(devicePixelRatio,innerWidth<760?1:1.35)); renderer.setSize(innerWidth,innerHeight,false);
    renderer.shadowMap.enabled=true; renderer.shadowMap.type=T.PCFSoftShadowMap; renderer.outputColorSpace=T.SRGBColorSpace;
    renderer.toneMapping=T.ACESFilmicToneMapping; renderer.toneMappingExposure=1.05;

    const CITY=1800,BLOCK=180,ROAD=58,keys=new Set(),solids=[],traffic=[],police=[],sparks=[];
    const colors=[0xdc4747,0x3a9ed1,0xf0bd37,0xf0f0e8,0x7b54cf,0x24a66b,0xe47c33];
    let running=false,paused=false,dead=false,last=performance.now(),elapsed=0,raining=false,weather=42,damageWait=0,missionNo=0,cameraView=0,cameraYaw=0,audio=null,muted=false;
    const p={pos:new T.Vector3(270,0,29),carPos:new T.Vector3(270,0,29),angle:0,speed:0,health:100,money:2500,wanted:0,heat:0,inCar:true,vy:0,car:null,person:null};
    const mission={pos:new T.Vector3(),reward:500,mesh:null};
    let seed=928371;
    const random=()=>{seed+=0x6D2B79F5;let n=seed;n=Math.imul(n^n>>>15,n|1);n^=n+Math.imul(n^n>>>7,n|61);return((n^n>>>14)>>>0)/4294967296};
    const clamp=(n,a,b)=>Math.max(a,Math.min(b,n)),dist=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
    const mat=(color,rough=.75,metal=.05)=>new T.MeshStandardMaterial({color,roughness:rough,metalness:metal});
    function box(w,h,d,color,shadow=true){const m=new T.Mesh(new T.BoxGeometry(w,h,d),mat(color));m.castShadow=shadow;m.receiveShadow=true;return m}

    function carMesh(color,cop=false){
      const g=new T.Group(),body=box(14,3.2,7.2,cop?0xe9edf2:color);body.position.y=2.7;g.add(body);
      const cabin=box(6.3,2.8,6.3,cop?0x17202c:0x203443);cabin.position.set(-.6,5.2,0);g.add(cabin);
      const glass=box(4.5,2.1,6.42,0x6f9dae);glass.position.set(.3,5.35,0);g.add(glass);
      for(const x of[-4.5,4.5])for(const z of[-3.65,3.65]){const w=new T.Mesh(new T.CylinderGeometry(1.25,1.25,.85,12),mat(0x111216,1));w.rotation.x=Math.PI/2;w.position.set(x,1.35,z);g.add(w)}
      if(cop){const r=box(1.7,.45,1.1,0xff2448),b=box(1.7,.45,1.1,0x258bff);r.position.set(-.5,7,-1);b.position.set(-.5,7,1);g.add(r,b);g.userData.lights=[r,b]}
      return g;
    }

    function personMesh(){
      const g=new T.Group(),body=box(2.2,4.3,1.5,0x2968b2),head=new T.Mesh(new T.SphereGeometry(1.05,12,9),mat(0xc99168));
      body.position.y=3.3;head.position.y=6.4;g.add(body,head);
      for(const x of[-.65,.65]){const leg=box(.62,2.7,.72,0x20242c);leg.position.set(x,1.35,0);g.add(leg)}
      return g;
    }

    function city(){
      const ground=new T.Mesh(new T.PlaneGeometry(CITY+300,CITY+300),mat(0x3a5b3b,1));ground.rotation.x=-Math.PI/2;ground.position.set(CITY/2,-.14,CITY/2);ground.receiveShadow=true;scene.add(ground);
      const asphalt=mat(0x292d31,.96),lineMat=new T.MeshBasicMaterial({color:0xb7b6a6,transparent:true,opacity:.42});
      for(let n=0;n<CITY;n+=BLOCK){
        const v=new T.Mesh(new T.PlaneGeometry(ROAD,CITY),asphalt);v.rotation.x=-Math.PI/2;v.position.set(n+ROAD/2,.02,CITY/2);scene.add(v);
        const h=new T.Mesh(new T.PlaneGeometry(CITY,ROAD),asphalt);h.rotation.x=-Math.PI/2;h.position.set(CITY/2,.025,n+ROAD/2);scene.add(h);
        const vl=new T.Mesh(new T.PlaneGeometry(.55,CITY),lineMat);vl.rotation.x=-Math.PI/2;vl.position.set(n+ROAD/2,.04,CITY/2);scene.add(vl);
        const hl=new T.Mesh(new T.PlaneGeometry(CITY,.55),lineMat);hl.rotation.x=-Math.PI/2;hl.position.set(CITY/2,.041,n+ROAD/2);scene.add(hl);
      }
      for(let gx=0;gx<CITY;gx+=BLOCK)for(let gz=0;gz<CITY;gz+=BLOCK){
        const m=9+random()*7,w=BLOCK-ROAD-m*2,d=w,h=24+random()*100,c=new T.Color().setHSL(.12+random()*.1,.1,.3+random()*.13);
        const b=box(w,h,d,c);b.position.set(gx+ROAD+m+w/2,h/2,gz+ROAD+m+d/2);scene.add(b);
        solids.push({minX:b.position.x-w/2-5,maxX:b.position.x+w/2+5,minZ:b.position.z-d/2-5,maxZ:b.position.z+d/2+5});
        const roof=box(w*.28,2.3,d*.3,0x3b3e40);roof.position.set(b.position.x,h+1.15,b.position.z);scene.add(roof);
        const windows=new T.Mesh(new T.PlaneGeometry(w*.7,Math.min(h*.6,52)),new T.MeshStandardMaterial({color:0x7fa9b2,emissive:0x466d79,emissiveIntensity:.25}));windows.position.set(b.position.x,Math.min(h*.5,38),b.position.z-d/2-.18);scene.add(windows);
      }
    }

    function lights(){
      scene.add(new T.HemisphereLight(0xc7e7ff,0x385a38,2.15));
      const sun=new T.DirectionalLight(0xfff1d2,3.2);sun.position.set(420,650,260);sun.castShadow=true;sun.shadow.mapSize.set(1024,1024);
      Object.assign(sun.shadow.camera,{left:-230,right:230,top:230,bottom:-230,far:1200});scene.add(sun);scene.userData.sun=sun;
    }

    function rain(){
      const a=new Float32Array(1800);for(let i=0;i<a.length;i+=3){a[i]=(random()-.5)*280;a[i+1]=random()*150;a[i+2]=(random()-.5)*280}
      const geo=new T.BufferGeometry();geo.setAttribute("position",new T.BufferAttribute(a,3));
      const r=new T.Points(geo,new T.PointsMaterial({color:0xa8d9ff,size:.85,transparent:true,opacity:.58}));r.visible=false;scene.add(r);scene.userData.rain=r;
    }

    function roadPoint(far=false){let v;do{const vertical=random()>.5,line=Math.floor(random()*(CITY/BLOCK));v=vertical?new T.Vector3(line*BLOCK+ROAD/2,0,50+random()*(CITY-100)):new T.Vector3(50+random()*(CITY-100),0,line*BLOCK+ROAD/2)}while(far&&dist(v,p.pos)<520);return v}
    function blocked(x,z){return x<6||z<6||x>CITY-6||z>CITY-6||solids.some(b=>x>b.minX&&x<b.maxX&&z>b.minZ&&z<b.maxZ)}

    function makeTraffic(count=16){
      for(let i=0;i<count;i++){const vertical=i%2===0,line=Math.floor(random()*(CITY/BLOCK)),dir=random()>.5?1:-1,m=carMesh(colors[i%colors.length]);
        const c={mesh:m,axis:vertical?"z":"x",dir,speed:25+random()*27,x:vertical?line*BLOCK+(dir>0?18:40):random()*CITY,z:vertical?random()*CITY:line*BLOCK+(dir>0?40:18),hit:false};
        m.rotation.y=vertical?(dir>0?-Math.PI/2:Math.PI/2):(dir>0?0:Math.PI);m.position.set(c.x,0,c.z);scene.add(m);traffic.push(c)}
    }

    function marker(){
      const g=new T.Group(),glow=new T.MeshStandardMaterial({color:0x5ce1e6,emissive:0x1ba7bd,emissiveIntensity:2,transparent:true,opacity:.8});
      const ring=new T.Mesh(new T.TorusGeometry(8,.8,12,32),glow);ring.rotation.x=Math.PI/2;g.add(ring);
      const beam=new T.Mesh(new T.CylinderGeometry(3.5,7,22,24,1,true),new T.MeshBasicMaterial({color:0x5ce1e6,transparent:true,opacity:.14,side:T.DoubleSide}));beam.position.y=11;g.add(beam);scene.add(g);mission.mesh=g;nextMission();
    }
    function nextMission(){mission.pos.copy(roadPoint(true));mission.reward=500+missionNo*125;mission.mesh?.position.set(mission.pos.x,8,mission.pos.z)}

    function addWanted(n){p.wanted=clamp(p.wanted+n,0,5);p.heat=15}
    function hurt(n){if(damageWait>0)return;p.health=Math.max(0,p.health-n);damageWait=.9;camera.userData.shake=Math.min(1,n/12);if(p.health<=0)endGame()}

    function drive(dt){
      const gas=keys.has("w")||keys.has("arrowup"),brake=keys.has("s")||keys.has("arrowdown"),left=keys.has("a")||keys.has("arrowleft"),right=keys.has("d")||keys.has("arrowright"),hand=keys.has(" "),nitro=keys.has("shift")&&gas&&p.speed>18;
      if(gas)p.speed+=(nitro?72:48)*dt;if(brake)p.speed-=58*dt;if(!gas&&!brake)p.speed*=Math.pow(.12,dt);if(hand)p.speed*=Math.pow(.012,dt);p.speed=clamp(p.speed,-30,nitro?112:82);
      p.angle+=((right?1:0)-(left?1:0))*1.8*clamp(Math.abs(p.speed)/22,.08,1)*Math.sign(p.speed||1)*dt*(hand?1.45:1);
      const nx=p.carPos.x+Math.cos(p.angle)*p.speed*dt,nz=p.carPos.z+Math.sin(p.angle)*p.speed*dt;
      if(!blocked(nx,nz)){p.carPos.x=nx;p.carPos.z=nz}else{hurt(Math.min(18,Math.abs(p.speed)*.18));p.speed*=-.2}
      p.pos.copy(p.carPos);p.car.position.copy(p.carPos);p.car.rotation.y=-p.angle;if(nitro&&Math.random()>.45)spark();
    }

    function walk(dt){
      let f=(keys.has("w")||keys.has("arrowup")?1:0)-(keys.has("s")||keys.has("arrowdown")?1:0),r=(keys.has("d")||keys.has("arrowright")?1:0)-(keys.has("a")||keys.has("arrowleft")?1:0);
      const len=Math.hypot(f,r)||1;f/=len;r/=len;const fx=Math.cos(cameraYaw),fz=Math.sin(cameraYaw),rx=-fz,rz=fx,speed=keys.has("shift")?20:11;
      const dx=(fx*f+rx*r)*speed*dt,dz=(fz*f+rz*r)*speed*dt,nx=p.pos.x+dx,nz=p.pos.z+dz;
      if(!blocked(nx,nz)){p.pos.x=nx;p.pos.z=nz}if((f||r)&&Math.hypot(dx,dz)>0)p.person.rotation.y=-Math.atan2(dz,dx);
      if(keys.has(" ")&&p.pos.y<=.01)p.vy=10.5;p.vy-=25*dt;p.pos.y=Math.max(0,p.pos.y+p.vy*dt);if(p.pos.y===0)p.vy=0;
      p.person.position.copy(p.pos);p.speed=0;
    }

    function enterExit(){
      if(!running||dead)return;
      if(p.inCar){p.inCar=false;p.speed=0;p.pos.copy(p.carPos).add(new T.Vector3(-Math.sin(p.angle)*10,0,Math.cos(p.angle)*10));if(blocked(p.pos.x,p.pos.z))p.pos.copy(p.carPos).add(new T.Vector3(Math.sin(p.angle)*10,0,-Math.cos(p.angle)*10));p.person.visible=true;p.person.position.copy(p.pos);cameraYaw=p.angle}
      else if(dist(p.pos,p.carPos)<16){p.inCar=true;p.pos.copy(p.carPos);p.person.visible=false}
    }

    function spark(){const s=new T.Mesh(new T.SphereGeometry(.45,5,5),new T.MeshBasicMaterial({color:Math.random()>.5?0x45c9ff:0xff8a35}));s.position.copy(p.carPos).add(new T.Vector3(-Math.cos(p.angle)*8,1.6,-Math.sin(p.angle)*8));s.userData.life=.35;scene.add(s);sparks.push(s)}

    function updateTraffic(dt){for(const c of traffic){c[c.axis]+=c.dir*c.speed*dt;if(c[c.axis]>CITY+20)c[c.axis]=-20;if(c[c.axis]<-20)c[c.axis]=CITY+20;c.mesh.position.set(c.x,0,c.z);const d=dist(c.mesh.position,p.pos);if(d<(p.inCar?11:7)&&!c.hit){c.hit=true;hurt(p.inCar?8:28);addWanted(p.inCar?.65:.25);if(p.inCar)p.speed*=-.28}if(d>18)c.hit=false}}

    function spawnPolice(){const pos=roadPoint();if(dist(pos,p.pos)<180)pos.add(new T.Vector3(260,0,260));pos.x=clamp(pos.x,20,CITY-20);pos.z=clamp(pos.z,20,CITY-20);const mesh=carMesh(0xffffff,true);mesh.position.copy(pos);scene.add(mesh);police.push({mesh,pos:pos.clone(),angle:0,speed:42,flash:0,hit:false})}
    function updatePolice(dt){
      const count=Math.ceil(p.wanted);while(police.length<count)spawnPolice();while(police.length>count)scene.remove(police.pop().mesh);
      for(const c of police){const target=Math.atan2(p.pos.z-c.pos.z,p.pos.x-c.pos.x);let d=(target-c.angle+Math.PI)%(Math.PI*2)-Math.PI;if(d<-Math.PI)d+=Math.PI*2;c.angle+=clamp(d,-1.35*dt,1.35*dt);c.speed+=(55+p.wanted*5-c.speed)*dt;
        const nx=c.pos.x+Math.cos(c.angle)*c.speed*dt,nz=c.pos.z+Math.sin(c.angle)*c.speed*dt;if(!blocked(nx,nz)){c.pos.x=nx;c.pos.z=nz}else c.angle+=(random()>.5?1:-1)*1.1;
        c.mesh.position.copy(c.pos);c.mesh.rotation.y=-c.angle;c.flash+=dt*12;if(c.mesh.userData.lights){c.mesh.userData.lights[0].visible=Math.sin(c.flash)>0;c.mesh.userData.lights[1].visible=!c.mesh.userData.lights[0].visible}
        const gap=dist(c.pos,p.pos);if(gap<(p.inCar?12:7)&&!c.hit){c.hit=true;hurt(p.inCar?10+p.wanted:20)}if(gap>20)c.hit=false}
      p.heat-=dt;if(p.heat<=0&&p.wanted>0&&police.every(c=>dist(c.pos,p.pos)>190))p.wanted=Math.max(0,p.wanted-dt*.11);
    }

    function updateMission(){mission.mesh.rotation.y+=.012;mission.mesh.children[0].scale.setScalar(1+Math.sin(elapsed*4)*.1);if(dist(p.pos,mission.pos)<14){missionNo++;p.money+=mission.reward;p.health=Math.min(100,p.health+18);p.wanted=Math.max(0,p.wanted-1);nextMission()}}
    function updateWeather(dt){weather-=dt;if(weather<=0){raining=!raining;weather=42+random()*48}const r=scene.userData.rain;r.visible=raining;r.position.set(p.pos.x,0,p.pos.z);if(raining){const a=r.geometry.attributes.position.array;for(let i=1;i<a.length;i+=3){a[i]-=100*dt;if(a[i]<0)a[i]=150}r.geometry.attributes.position.needsUpdate=true}const phase=(elapsed/210+.72)%1,light=clamp(Math.sin(phase*Math.PI),.18,1);scene.userData.sun.intensity=2.6*light;scene.background.setHSL(.57,.33,.16+.46*light);scene.fog.color.copy(scene.background)}
    function updateSparks(dt){for(let i=sparks.length-1;i>=0;i--){const s=sparks[i];s.userData.life-=dt;s.position.y+=dt*2;if(s.userData.life<=0){scene.remove(s);sparks.splice(i,1)}}}

    function updateCamera(dt){
      let forward,distance,height,look;
      if(p.inCar){cameraYaw+=(p.angle-cameraYaw)*clamp(dt*4,0,1);forward=new T.Vector3(Math.cos(p.angle),0,Math.sin(p.angle));distance=cameraView===0?30:cameraView===1?18:2;height=cameraView===2?55:cameraView===1?9:18;look=p.carPos.clone().addScaledVector(forward,cameraView===2?0:16).add(new T.Vector3(0,3,0))}
      else{forward=new T.Vector3(Math.cos(cameraYaw),0,Math.sin(cameraYaw));distance=cameraView===2?2:14;height=cameraView===2?45:8;look=p.pos.clone().add(new T.Vector3(0,4,0))}
      const desired=p.pos.clone().addScaledVector(forward,-distance).add(new T.Vector3(0,height,0));camera.position.lerp(desired,1-Math.pow(.002,dt));const shake=camera.userData.shake||0;if(shake>.01){camera.position.x+=(Math.random()-.5)*shake;camera.position.y+=(Math.random()-.5)*shake;camera.userData.shake*=Math.pow(.04,dt)}camera.lookAt(look);
    }

    function hud(){const stars=Math.ceil(p.wanted);ui.speed.textContent=String(p.inCar?Math.round(Math.abs(p.speed)*2.25):0);ui.money.textContent=`€ ${Math.round(p.money).toLocaleString("es-ES")}`;ui.healthBar.style.width=`${p.health}%`;ui.healthBar.style.background=p.health<30?"#ff3b55":"linear-gradient(90deg,#4cd964,#d7ff38)";ui.healthText.textContent=String(Math.round(p.health));ui.wanted.textContent=`${"★ ".repeat(stars)}${"☆ ".repeat(5-stars)}`.trim();ui.wanted.classList.toggle("hot",stars>0);ui.missionText.textContent=p.inCar?"Ve al punto azul":"Pulsa F cerca del coche";ui.missionDistance.textContent=`${Math.round(dist(p.pos,mission.pos)/2)} m · € ${mission.reward}`;const m=Math.floor((1080+elapsed*2.2)%1440);ui.clock.textContent=`${String(Math.floor(m/60)).padStart(2,"0")}:${String(m%60).padStart(2,"0")} · ${raining?"LLUVIA":p.inCar?"EN COCHE":"A PIE"}`}

    function drawMap(){const w=mini.width,h=mini.height,scale=w/520;map.clearRect(0,0,w,h);map.fillStyle="#101820";map.fillRect(0,0,w,h);map.strokeStyle="#ffffff30";map.lineWidth=ROAD*scale;for(let n=0;n<=CITY;n+=BLOCK){const x=w/2+(n+ROAD/2-p.pos.x)*scale;map.beginPath();map.moveTo(x,0);map.lineTo(x,h);map.stroke();const y=h/2+(n+ROAD/2-p.pos.z)*scale;map.beginPath();map.moveTo(0,y);map.lineTo(w,y);map.stroke()}map.fillStyle="#5ce1e6";map.beginPath();map.arc(w/2+(mission.pos.x-p.pos.x)*scale,h/2+(mission.pos.z-p.pos.z)*scale,5,0,Math.PI*2);map.fill();map.fillStyle="#ff3b55";police.forEach(c=>map.fillRect(w/2+(c.pos.x-p.pos.x)*scale-2,h/2+(c.pos.z-p.pos.z)*scale-2,4,4));map.save();map.translate(w/2,h/2);map.rotate((p.inCar?p.angle:cameraYaw)+Math.PI/2);map.fillStyle="#d7ff38";map.beginPath();map.moveTo(0,-9);map.lineTo(6,7);map.lineTo(0,4);map.lineTo(-6,7);map.closePath();map.fill();map.restore()}

    function updateAudio(){if(!audio)return;const now=audio.ctx.currentTime;audio.osc.frequency.setTargetAtTime(42+(p.inCar?Math.abs(p.speed)*1.4:0),now,.05);audio.filter.frequency.setTargetAtTime(150+(p.inCar?Math.abs(p.speed)*9:0),now,.08);audio.gain.gain.setTargetAtTime(muted?0:p.inCar?.015+Math.abs(p.speed)*.00012:.004,now,.08)}
    function initAudio(){if(audio||muted)return;const AC=window.AudioContext||window.webkitAudioContext;if(!AC)return;const ctx=new AC(),osc=ctx.createOscillator(),gain=ctx.createGain(),filter=ctx.createBiquadFilter();osc.type="sawtooth";gain.gain.value=.018;filter.type="lowpass";filter.frequency.value=180;osc.connect(filter).connect(gain).connect(ctx.destination);osc.start();audio={ctx,osc,gain,filter}}
    function horn(){if(!running||muted)return;initAudio();if(!audio)return;const o=audio.ctx.createOscillator(),g=audio.ctx.createGain();o.frequency.value=330;g.gain.value=.05;o.connect(g).connect(audio.ctx.destination);o.start();g.gain.exponentialRampToValueAtTime(.001,audio.ctx.currentTime+.25);o.stop(audio.ctx.currentTime+.26)}

    function update(dt){elapsed+=dt;damageWait=Math.max(0,damageWait-dt);p.inCar?drive(dt):walk(dt);updateTraffic(dt);updatePolice(dt);updateMission();updateWeather(dt);updateSparks(dt);updateCamera(dt);updateAudio()}
    function frame(now){const dt=Math.min(.033,(now-last)/1000||0);last=now;if(running&&!paused&&!dead)update(dt);renderer.render(scene,camera);drawMap();hud();requestAnimationFrame(frame)}
    function start(){running=true;paused=false;ui.intro.hidden=true;ui.pause.hidden=true;initAudio()}
    function togglePause(){if(!running||dead)return;paused=!paused;ui.pause.hidden=!paused}
    function endGame(){dead=true;paused=true;ui.pause.hidden=false;ui.pause.querySelector("p").textContent="MISIÓN FALLIDA";ui.resume.textContent="VOLVER A EMPEZAR"}
    function reset(){p.pos.set(270,0,29);p.carPos.copy(p.pos);p.angle=0;p.speed=0;p.health=100;p.money=2500;p.wanted=0;p.heat=0;p.inCar=true;p.vy=0;p.car.position.copy(p.carPos);p.person.visible=false;police.forEach(c=>scene.remove(c.mesh));police.length=0;missionNo=0;dead=false;ui.pause.querySelector("p").textContent="JUEGO EN PAUSA";ui.resume.textContent="SEGUIR";nextMission();start()}

    city();lights();rain();p.car=carMesh(0xd7ff38);p.car.position.copy(p.carPos);scene.add(p.car);p.person=personMesh();p.person.visible=false;scene.add(p.person);makeTraffic();marker();updateCamera(.1);
    ui.play.disabled=false;ui.load.textContent="Motor 3D listo.";ui.play.addEventListener("click",start);ui.resume.addEventListener("click",()=>dead?reset():togglePause());ui.sound.addEventListener("click",()=>{muted=!muted;ui.sound.textContent=`SONIDO: ${muted?"NO":"SÍ"}`;if(!muted)initAudio()});
    addEventListener("keydown",e=>{const k=e.key.toLowerCase();if(["arrowup","arrowdown","arrowleft","arrowright"," "].includes(k))e.preventDefault();if(!e.repeat){if(k==="escape")togglePause();if(k==="f"||k==="enter")enterExit();if(k==="v")cameraView=(cameraView+1)%3;if(k==="h")horn()}keys.add(k)});
    addEventListener("keyup",e=>keys.delete(e.key.toLowerCase()));addEventListener("blur",()=>keys.clear());
    addEventListener("mousemove",e=>{if(!p.inCar&&document.pointerLockElement===canvas)cameraYaw+=e.movementX*.0025});canvas.addEventListener("click",()=>{if(running&&!p.inCar)canvas.requestPointerLock?.()});
    addEventListener("resize",()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight,false);renderer.setPixelRatio(Math.min(devicePixelRatio,innerWidth<760?1:1.35))});
    for(const b of document.querySelectorAll("[data-key]")){const k=b.dataset.key,down=e=>{e.preventDefault();keys.add(k);b.classList.add("active")},up=e=>{e.preventDefault();keys.delete(k);b.classList.remove("active")};b.addEventListener("pointerdown",down);b.addEventListener("pointerup",up);b.addEventListener("pointercancel",up);b.addEventListener("pointerleave",up)}
    for(const b of document.querySelectorAll("[data-action]"))b.addEventListener("pointerdown",e=>{e.preventDefault();if(b.dataset.action==="vehicle")enterExit();else cameraView=(cameraView+1)%3});
    requestAnimationFrame(frame);
  }
})();
