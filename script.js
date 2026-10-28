"use strict";

(() => {
  const ui = {
    intro: document.querySelector("#intro"), pause: document.querySelector("#pause"),
    play: document.querySelector("#playBtn"), resume: document.querySelector("#resumeBtn"),
    load: document.querySelector("#loadState"), speed: document.querySelector("#speed"),
    money: document.querySelector("#money"), wanted: document.querySelector("#wanted"),
    healthBar: document.querySelector("#healthBar"), healthText: document.querySelector("#healthText"),
    missionText: document.querySelector("#missionText"), missionDistance: document.querySelector("#missionDistance"),
    clock: document.querySelector("#clock"), sound: document.querySelector("#soundBtn")
  };

  if (!window.THREE) {
    ui.load.textContent = "No se pudo cargar el motor 3D. Recarga la página.";
    ui.load.classList.add("error");
    ui.play.disabled = true;
    return;
  }

  const THREE = window.THREE;
  const canvas = document.querySelector("#game");
  const mapCanvas = document.querySelector("#minimap");
  const map = mapCanvas.getContext("2d");
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x8db0c8);
  scene.fog = new THREE.FogExp2(0x8db0c8, 0.00125);

  const camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.1, 2600);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.65));
  renderer.setSize(innerWidth, innerHeight, false);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  const CITY = 1800;
  const BLOCK = 180;
  const ROAD = 58;
  const LANE_A = 18;
  const LANE_B = 40;
  const keys = new Set();
  const solids = [];
  const traffic = [];
  const police = [];
  const sparks = [];
  const colors = [0xdc4747, 0x3a9ed1, 0xf0bd37, 0xf0f0e8, 0x7b54cf, 0x24a66b, 0xe47c33];
  let running = false;
  let paused = false;
  let dead = false;
  let last = performance.now();
  let elapsed = 0;
  let rainOn = false;
  let weatherTimer = 42;
  let damageWait = 0;
  let missionNumber = 0;
  let audio = null;
  let muted = false;

  const player = {
    position: new THREE.Vector3(270, 0, 29), angle: 0, speed: 0,
    health: 100, money: 2500, wanted: 0, heat: 0, mesh: null
  };
  const mission = { position: new THREE.Vector3(), reward: 500, mesh: null };

  function rng(seed = 928371) {
    let value = seed >>> 0;
    return () => {
      value += 0x6D2B79F5;
      let n = value;
      n = Math.imul(n ^ n >>> 15, n | 1);
      n ^= n + Math.imul(n ^ n >>> 7, n | 61);
      return ((n ^ n >>> 14) >>> 0) / 4294967296;
    };
  }
  const random = rng();
  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
  const dist2D = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

  function material(color, roughness = .75, metalness = .05) {
    return new THREE.MeshStandardMaterial({ color, roughness, metalness });
  }

  function box(w, h, d, color, cast = true) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material(color));
    mesh.castShadow = cast;
    mesh.receiveShadow = true;
    return mesh;
  }

  function makeCar(color, isPolice = false) {
    const car = new THREE.Group();
    const body = box(14, 3.2, 7.2, isPolice ? 0xe9edf2 : color);
    body.position.y = 2.7;
    car.add(body);
    const cabin = box(6.3, 2.8, 6.3, isPolice ? 0x17202c : 0x203443);
    cabin.position.set(-.6, 5.2, 0);
    car.add(cabin);
    const glassMat = material(0x7bb2ca, .24, .15);
    const glass = new THREE.Mesh(new THREE.BoxGeometry(4.4, 2.15, 6.45), glassMat);
    glass.position.set(.3, 5.35, 0);
    glass.castShadow = true;
    car.add(glass);
    const wheelMat = material(0x111216, 1, 0);
    for (const x of [-4.5, 4.5]) for (const z of [-4, 4]) {
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(1.25, 1.25, .85, 12), wheelMat);
      wheel.rotation.x = Math.PI / 2;
      wheel.position.set(x, 1.45, z > 0 ? 3.6 : -3.6);
      car.add(wheel);
    }
    const lampMat = new THREE.MeshStandardMaterial({ color: 0xfff2b0, emissive: 0xffd46a, emissiveIntensity: 1.8 });
    for (const z of [-2.35, 2.35]) {
      const lamp = box(.35, .7, 1.2, 0xffffff, false);
      lamp.material = lampMat;
      lamp.position.set(7.15, 2.7, z);
      car.add(lamp);
    }
    if (isPolice) {
      const red = new THREE.MeshStandardMaterial({ color: 0xff2448, emissive: 0xff002a, emissiveIntensity: 2.2 });
      const blue = new THREE.MeshStandardMaterial({ color: 0x258bff, emissive: 0x006aff, emissiveIntensity: 2.2 });
      const barR = box(1.7, .45, 1.2, 0xff2448); barR.material = red; barR.position.set(-.5, 7, -1);
      const barB = box(1.7, .45, 1.2, 0x258bff); barB.material = blue; barB.position.set(-.5, 7, 1);
      car.add(barR, barB);
      car.userData.lights = [barR, barB];
    }
    return car;
  }

  function addGround() {
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(CITY + 300, CITY + 300), material(0x3a5b3b, 1));
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(CITY / 2, -.14, CITY / 2);
    ground.receiveShadow = true;
    scene.add(ground);

    const asphalt = material(0x292d31, .96);
    for (let p = 0; p < CITY; p += BLOCK) {
      const vertical = new THREE.Mesh(new THREE.PlaneGeometry(ROAD, CITY), asphalt);
      vertical.rotation.x = -Math.PI / 2;
      vertical.position.set(p + ROAD / 2, .02, CITY / 2);
      vertical.receiveShadow = true;
      scene.add(vertical);
      const horizontal = new THREE.Mesh(new THREE.PlaneGeometry(CITY, ROAD), asphalt);
      horizontal.rotation.x = -Math.PI / 2;
      horizontal.position.set(CITY / 2, .025, p + ROAD / 2);
      horizontal.receiveShadow = true;
      scene.add(horizontal);
    }

    const laneMat = new THREE.MeshBasicMaterial({ color: 0xb7b6a6, transparent: true, opacity: .55 });
    for (let p = 0; p < CITY; p += BLOCK) {
      for (let n = 0; n < CITY; n += 18) {
        const v = new THREE.Mesh(new THREE.PlaneGeometry(.7, 9), laneMat);
        v.rotation.x = -Math.PI / 2; v.position.set(p + ROAD / 2, .04, n + 4.5); scene.add(v);
        const h = new THREE.Mesh(new THREE.PlaneGeometry(9, .7), laneMat);
        h.rotation.x = -Math.PI / 2; h.position.set(n + 4.5, .041, p + ROAD / 2); scene.add(h);
      }
    }
  }

  function addBuildings() {
    for (let gx = 0; gx < CITY; gx += BLOCK) {
      for (let gz = 0; gz < CITY; gz += BLOCK) {
        const margin = 8 + random() * 8;
        const w = BLOCK - ROAD - margin * 2;
        const d = BLOCK - ROAD - margin * 2;
        const h = 24 + random() * 105;
        const hue = 0.12 + random() * .1;
        const color = new THREE.Color().setHSL(hue, .1, .29 + random() * .14);
        const building = box(w, h, d, color);
        building.position.set(gx + ROAD + margin + w / 2, h / 2, gz + ROAD + margin + d / 2);
        building.castShadow = true;
        scene.add(building);
        solids.push({ minX: building.position.x - w / 2 - 5, maxX: building.position.x + w / 2 + 5, minZ: building.position.z - d / 2 - 5, maxZ: building.position.z + d / 2 + 5 });

        const roof = box(w * .28, 2.3, d * .3, 0x3b3e40);
        roof.position.set(building.position.x, h + 1.15, building.position.z);
        scene.add(roof);

        const windowMat = new THREE.MeshStandardMaterial({ color: 0x7fa9b2, emissive: 0x466d79, emissiveIntensity: .35 });
        const rows = Math.min(7, Math.floor(h / 12));
        for (let r = 0; r < rows; r++) {
          const windows = new THREE.Mesh(new THREE.BoxGeometry(w * .72, 2.4, .3), windowMat);
          windows.position.set(building.position.x, 8 + r * 11, building.position.z - d / 2 - .18);
          scene.add(windows);
        }
      }
    }
  }

  function roadPoint(far = false) {
    let point;
    do {
      const vertical = random() > .5;
      const line = Math.floor(random() * (CITY / BLOCK));
      point = vertical
        ? new THREE.Vector3(line * BLOCK + ROAD / 2, 0, 50 + random() * (CITY - 100))
        : new THREE.Vector3(50 + random() * (CITY - 100), 0, line * BLOCK + ROAD / 2);
    } while (far && dist2D(point, player.position) < 520);
    return point;
  }

  function blocked(x, z) {
    if (x < 6 || z < 6 || x > CITY - 6 || z > CITY - 6) return true;
    return solids.some(b => x > b.minX && x < b.maxX && z > b.minZ && z < b.maxZ);
  }

  function addTraffic(count = 24) {
    for (let i = 0; i < count; i++) {
      const vertical = i % 2 === 0;
      const line = Math.floor(random() * (CITY / BLOCK));
      const dir = random() > .5 ? 1 : -1;
      const mesh = makeCar(colors[i % colors.length]);
      const item = {
        mesh, axis: vertical ? "z" : "x", dir, speed: 25 + random() * 27,
        x: vertical ? line * BLOCK + (dir > 0 ? LANE_A : LANE_B) : random() * CITY,
        z: vertical ? random() * CITY : line * BLOCK + (dir > 0 ? LANE_B : LANE_A), hit: false
      };
      mesh.rotation.y = vertical ? (dir > 0 ? -Math.PI / 2 : Math.PI / 2) : (dir > 0 ? 0 : Math.PI);
      mesh.position.set(item.x, 0, item.z);
      scene.add(mesh);
      traffic.push(item);
    }
  }

  function addLights() {
    const hemi = new THREE.HemisphereLight(0xc7e7ff, 0x385a38, 2.15);
    scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xfff1d2, 3.2);
    sun.position.set(420, 650, 260);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1536, 1536);
    sun.shadow.camera.left = -230; sun.shadow.camera.right = 230;
    sun.shadow.camera.top = 230; sun.shadow.camera.bottom = -230;
    sun.shadow.camera.far = 1200;
    scene.add(sun);
    scene.userData.sun = sun;
  }

  function addRain() {
    const count = 900;
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      positions[i * 3] = (random() - .5) * 280;
      positions[i * 3 + 1] = random() * 150;
      positions[i * 3 + 2] = (random() - .5) * 280;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    const rain = new THREE.Points(geometry, new THREE.PointsMaterial({ color: 0xa8d9ff, size: .85, transparent: true, opacity: .58 }));
    rain.visible = false;
    scene.add(rain);
    scene.userData.rain = rain;
  }

  function chooseMission() {
    mission.position.copy(roadPoint(true));
    mission.reward = 500 + missionNumber * 125;
    if (mission.mesh) mission.mesh.position.set(mission.position.x, 8, mission.position.z);
  }

  function addMission() {
    const group = new THREE.Group();
    const ringMat = new THREE.MeshStandardMaterial({ color: 0x5ce1e6, emissive: 0x1ba7bd, emissiveIntensity: 2, transparent: true, opacity: .8 });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(8, .8, 12, 32), ringMat);
    ring.rotation.x = Math.PI / 2;
    group.add(ring);
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(3.5, 7, 22, 24, 1, true), new THREE.MeshBasicMaterial({ color: 0x5ce1e6, transparent: true, opacity: .14, side: THREE.DoubleSide }));
    beam.position.y = 11;
    group.add(beam);
    scene.add(group);
    mission.mesh = group;
    chooseMission();
  }

  function addWanted(value) {
    player.wanted = clamp(player.wanted + value, 0, 5);
    player.heat = 15;
  }

  function hurt(value) {
    if (damageWait > 0) return;
    player.health = Math.max(0, player.health - value);
    damageWait = .9;
    camera.userData.shake = Math.min(1, value / 12);
    if (player.health <= 0) endGame();
  }

  function spawnPolice() {
    const point = roadPoint();
    if (dist2D(point, player.position) < 180) point.add(new THREE.Vector3(260, 0, 260));
    point.x = clamp(point.x, 20, CITY - 20); point.z = clamp(point.z, 20, CITY - 20);
    const mesh = makeCar(0xffffff, true);
    mesh.position.copy(point);
    scene.add(mesh);
    police.push({ mesh, position: point.clone(), angle: 0, speed: 42, flash: 0, hit: false });
  }

  function updatePlayer(dt) {
    const gas = keys.has("w") || keys.has("arrowup");
    const brake = keys.has("s") || keys.has("arrowdown");
    const left = keys.has("a") || keys.has("arrowleft");
    const right = keys.has("d") || keys.has("arrowright");
    const handbrake = keys.has(" ");
    const nitro = keys.has("shift") && gas && player.speed > 18;

    if (gas) player.speed += (nitro ? 72 : 48) * dt;
    if (brake) player.speed -= 58 * dt;
    if (!gas && !brake) player.speed *= Math.pow(.12, dt);
    if (handbrake) player.speed *= Math.pow(.012, dt);
    player.speed = clamp(player.speed, -30, nitro ? 112 : 82);

    const turn = (right ? 1 : 0) - (left ? 1 : 0);
    const grip = clamp(Math.abs(player.speed) / 22, .08, 1);
    player.angle += turn * 1.8 * grip * Math.sign(player.speed || 1) * dt * (handbrake ? 1.45 : 1);
    const nx = player.position.x + Math.cos(player.angle) * player.speed * dt;
    const nz = player.position.z + Math.sin(player.angle) * player.speed * dt;
    if (!blocked(nx, nz)) {
      player.position.x = nx; player.position.z = nz;
    } else {
      hurt(Math.min(18, Math.abs(player.speed) * .18));
      player.speed *= -.2;
    }
    if (nitro && Math.random() > .45) createSpark();
    player.mesh.position.copy(player.position);
    player.mesh.rotation.y = -player.angle;
  }

  function createSpark() {
    const spark = new THREE.Mesh(new THREE.SphereGeometry(.45, 5, 5), new THREE.MeshBasicMaterial({ color: Math.random() > .5 ? 0x45c9ff : 0xff8a35 }));
    spark.position.copy(player.position).add(new THREE.Vector3(-Math.cos(player.angle) * 8, 1.6, -Math.sin(player.angle) * 8));
    spark.userData.life = .35;
    scene.add(spark);
    sparks.push(spark);
  }

  function updateTraffic(dt) {
    for (const car of traffic) {
      car[car.axis] += car.dir * car.speed * dt;
      if (car[car.axis] > CITY + 20) car[car.axis] = -20;
      if (car[car.axis] < -20) car[car.axis] = CITY + 20;
      car.mesh.position.set(car.x, 0, car.z);
      const d = dist2D(car.mesh.position, player.position);
      if (d < 11 && !car.hit) {
        car.hit = true; hurt(8); addWanted(.65); player.speed *= -.28;
      }
      if (d > 18) car.hit = false;
    }
  }

  function updatePolice(dt) {
    const needed = Math.ceil(player.wanted);
    while (police.length < needed) spawnPolice();
    while (police.length > needed) scene.remove(police.pop().mesh);
    for (const car of police) {
      const target = Math.atan2(player.position.z - car.position.z, player.position.x - car.position.x);
      let delta = (target - car.angle + Math.PI) % (Math.PI * 2) - Math.PI;
      if (delta < -Math.PI) delta += Math.PI * 2;
      car.angle += clamp(delta, -1.35 * dt, 1.35 * dt);
      car.speed += (55 + player.wanted * 5 - car.speed) * dt;
      const nx = car.position.x + Math.cos(car.angle) * car.speed * dt;
      const nz = car.position.z + Math.sin(car.angle) * car.speed * dt;
      if (!blocked(nx, nz)) { car.position.x = nx; car.position.z = nz; }
      else car.angle += (random() > .5 ? 1 : -1) * 1.1;
      car.mesh.position.copy(car.position); car.mesh.rotation.y = -car.angle;
      car.flash += dt * 12;
      if (car.mesh.userData.lights) {
        car.mesh.userData.lights[0].visible = Math.sin(car.flash) > 0;
        car.mesh.userData.lights[1].visible = !car.mesh.userData.lights[0].visible;
      }
      const d = dist2D(car.position, player.position);
      if (d < 12 && !car.hit) { car.hit = true; hurt(10 + player.wanted); player.speed *= .45; }
      if (d > 20) car.hit = false;
    }
    player.heat -= dt;
    if (player.heat <= 0 && player.wanted > 0 && police.every(p => dist2D(p.position, player.position) > 190)) player.wanted = Math.max(0, player.wanted - dt * .11);
  }

  function updateMission() {
    mission.mesh.rotation.y += .8 / 60;
    mission.mesh.children[0].scale.setScalar(1 + Math.sin(elapsed * 4) * .1);
    if (dist2D(player.position, mission.position) < 14) {
      missionNumber++; player.money += mission.reward; player.health = Math.min(100, player.health + 18);
      player.wanted = Math.max(0, player.wanted - 1); chooseMission();
    }
  }

  function updateWeather(dt) {
    weatherTimer -= dt;
    if (weatherTimer <= 0) { rainOn = !rainOn; weatherTimer = 42 + random() * 48; }
    const rain = scene.userData.rain;
    rain.visible = rainOn;
    rain.position.set(player.position.x, 0, player.position.z);
    if (rainOn) {
      const arr = rain.geometry.attributes.position.array;
      for (let i = 1; i < arr.length; i += 3) { arr[i] -= 100 * dt; if (arr[i] < 0) arr[i] = 150; }
      rain.geometry.attributes.position.needsUpdate = true;
    }
    const phase = (elapsed / 210 + .72) % 1;
    const light = clamp(Math.sin(phase * Math.PI), .18, 1);
    scene.userData.sun.intensity = 2.6 * light;
    scene.background.setHSL(.57, .33, .16 + .46 * light);
    scene.fog.color.copy(scene.background);
  }

  function updateSparks(dt) {
    for (let i = sparks.length - 1; i >= 0; i--) {
      sparks[i].userData.life -= dt;
      sparks[i].position.y += dt * 2;
      if (sparks[i].userData.life <= 0) { scene.remove(sparks[i]); sparks.splice(i, 1); }
    }
  }

  function updateCamera(dt) {
    const forward = new THREE.Vector3(Math.cos(player.angle), 0, Math.sin(player.angle));
    const desired = player.position.clone().addScaledVector(forward, -30).add(new THREE.Vector3(0, 18, 0));
    camera.position.lerp(desired, 1 - Math.pow(.002, dt));
    const shake = camera.userData.shake || 0;
    if (shake > .01) {
      camera.position.x += (Math.random() - .5) * shake;
      camera.position.y += (Math.random() - .5) * shake;
      camera.userData.shake *= Math.pow(.04, dt);
    }
    camera.lookAt(player.position.clone().addScaledVector(forward, 16).add(new THREE.Vector3(0, 3, 0)));
  }

  function updateHud() {
    ui.speed.textContent = String(Math.round(Math.abs(player.speed) * 2.25));
    ui.money.textContent = `€ ${Math.round(player.money).toLocaleString("es-ES")}`;
    ui.healthBar.style.width = `${player.health}%`;
    ui.healthBar.style.background = player.health < 30 ? "#ff3b55" : "linear-gradient(90deg,#4cd964,#d7ff38)";
    ui.healthText.textContent = String(Math.round(player.health));
    const stars = Math.ceil(player.wanted);
    ui.wanted.textContent = `${"★ ".repeat(stars)}${"☆ ".repeat(5 - stars)}`.trim();
    ui.wanted.classList.toggle("hot", stars > 0);
    ui.missionText.textContent = missionNumber ? "Entrega el siguiente paquete" : "Ve al punto azul";
    ui.missionDistance.textContent = `${Math.round(dist2D(player.position, mission.position) / 2)} m · € ${mission.reward}`;
    const minutes = Math.floor((18 * 60 + elapsed * 2.2) % 1440);
    ui.clock.textContent = `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")} · ${rainOn ? "LLUVIA" : "DESPEJADO"}`;
  }

  function drawMap() {
    const w = mapCanvas.width, h = mapCanvas.height, range = 520, scale = w / range;
    map.clearRect(0, 0, w, h); map.fillStyle = "#101820"; map.fillRect(0, 0, w, h);
    map.strokeStyle = "#ffffff30"; map.lineWidth = ROAD * scale;
    for (let p = 0; p <= CITY; p += BLOCK) {
      const x = w / 2 + (p + ROAD / 2 - player.position.x) * scale;
      map.beginPath(); map.moveTo(x, 0); map.lineTo(x, h); map.stroke();
      const y = h / 2 + (p + ROAD / 2 - player.position.z) * scale;
      map.beginPath(); map.moveTo(0, y); map.lineTo(w, y); map.stroke();
    }
    map.fillStyle = "#5ce1e6";
    map.beginPath(); map.arc(w / 2 + (mission.position.x - player.position.x) * scale, h / 2 + (mission.position.z - player.position.z) * scale, 5, 0, Math.PI * 2); map.fill();
    map.fillStyle = "#ff3b55";
    police.forEach(p => map.fillRect(w / 2 + (p.position.x - player.position.x) * scale - 2, h / 2 + (p.position.z - player.position.z) * scale - 2, 4, 4));
    map.save(); map.translate(w / 2, h / 2); map.rotate(player.angle + Math.PI / 2); map.fillStyle = "#d7ff38";
    map.beginPath(); map.moveTo(0, -9); map.lineTo(6, 7); map.lineTo(0, 4); map.lineTo(-6, 7); map.closePath(); map.fill(); map.restore();
  }

  function update(dt) {
    elapsed += dt; damageWait = Math.max(0, damageWait - dt);
    updatePlayer(dt); updateTraffic(dt); updatePolice(dt); updateMission(); updateWeather(dt); updateSparks(dt); updateCamera(dt); updateAudio();
  }

  function frame(now) {
    const dt = Math.min(.033, (now - last) / 1000 || 0); last = now;
    if (running && !paused && !dead) update(dt);
    renderer.render(scene, camera); drawMap(); updateHud(); requestAnimationFrame(frame);
  }

  function initAudio() {
    if (audio || muted) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const context = new AC(), oscillator = context.createOscillator(), gain = context.createGain(), filter = context.createBiquadFilter();
    oscillator.type = "sawtooth"; oscillator.frequency.value = 45; gain.gain.value = .018; filter.type = "lowpass"; filter.frequency.value = 180;
    oscillator.connect(filter).connect(gain).connect(context.destination); oscillator.start();
    audio = { context, oscillator, gain, filter };
  }

  function updateAudio() {
    if (!audio) return;
    const now = audio.context.currentTime;
    audio.oscillator.frequency.setTargetAtTime(42 + Math.abs(player.speed) * 1.4, now, .05);
    audio.filter.frequency.setTargetAtTime(150 + Math.abs(player.speed) * 9, now, .08);
    audio.gain.gain.setTargetAtTime(muted ? 0 : .015 + Math.abs(player.speed) * .00012, now, .08);
  }

  function start() {
    running = true; paused = false; ui.intro.hidden = true; ui.pause.hidden = true; initAudio();
  }

  function togglePause() {
    if (!running || dead) return;
    paused = !paused; ui.pause.hidden = !paused;
  }

  function endGame() {
    dead = true; paused = true; ui.pause.hidden = false;
    ui.pause.querySelector("p").textContent = "VEHÍCULO DESTRUIDO";
    ui.resume.textContent = "VOLVER A EMPEZAR";
  }

  function reset() {
    player.position.set(270, 0, 29); player.angle = 0; player.speed = 0; player.health = 100; player.money = 2500; player.wanted = 0; player.heat = 0;
    police.forEach(p => scene.remove(p.mesh)); police.length = 0; missionNumber = 0; dead = false;
    ui.pause.querySelector("p").textContent = "JUEGO EN PAUSA"; ui.resume.textContent = "SEGUIR"; chooseMission(); start();
  }

  addGround(); addBuildings(); addLights(); addRain();
  player.mesh = makeCar(0xd7ff38); player.mesh.position.copy(player.position); scene.add(player.mesh);
  addTraffic(); addMission(); updateCamera(.1);

  ui.play.addEventListener("click", start);
  ui.resume.addEventListener("click", () => dead ? reset() : togglePause());
  ui.sound.addEventListener("click", () => { muted = !muted; ui.sound.textContent = `SONIDO: ${muted ? "NO" : "SÍ"}`; if (!muted) initAudio(); });

  addEventListener("keydown", e => {
    const key = e.key.toLowerCase();
    if (["arrowup", "arrowdown", "arrowleft", "arrowright", " "].includes(key)) e.preventDefault();
    if (key === "escape" && !e.repeat) togglePause();
    keys.add(key);
  });
  addEventListener("keyup", e => keys.delete(e.key.toLowerCase()));
  addEventListener("blur", () => keys.clear());
  addEventListener("resize", () => {
    camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight, false); renderer.setPixelRatio(Math.min(devicePixelRatio, 1.65));
  });

  for (const button of document.querySelectorAll("[data-key]")) {
    const key = button.dataset.key;
    const down = e => { e.preventDefault(); keys.add(key); button.classList.add("active"); };
    const up = e => { e.preventDefault(); keys.delete(key); button.classList.remove("active"); };
    button.addEventListener("pointerdown", down); button.addEventListener("pointerup", up);
    button.addEventListener("pointercancel", up); button.addEventListener("pointerleave", up);
  }

  requestAnimationFrame(frame);
})();
