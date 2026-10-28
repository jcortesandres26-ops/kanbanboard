"use strict";

const canvas = document.querySelector("#game");
const ctx = canvas.getContext("2d");
const mapCanvas = document.querySelector("#minimap");
const mapCtx = mapCanvas.getContext("2d");
const ui = {
  intro: document.querySelector("#intro"),
  pause: document.querySelector("#pause"),
  speed: document.querySelector("#speed"),
  money: document.querySelector("#money"),
  wanted: document.querySelector("#wanted"),
  healthBar: document.querySelector("#healthBar"),
  healthText: document.querySelector("#healthText"),
  missionText: document.querySelector("#missionText"),
  missionDistance: document.querySelector("#missionDistance"),
  clock: document.querySelector("#clock"),
  soundBtn: document.querySelector("#soundBtn")
};

const WORLD = 3780;
const GRID = 420;
const ROAD = 138;
const LANE = [42, 96];
const TAU = Math.PI * 2;
const keys = new Set();
const buildings = [];
const traffic = [];
const police = [];
const pedestrians = [];
const particles = [];
const roadColors = ["#e45252", "#4fb9db", "#f2c84b", "#f4f4ef", "#805ad5", "#31b57b", "#ec8a42"];
let width = innerWidth;
let height = innerHeight;
let running = false;
let paused = false;
let gameOver = false;
let last = 0;
let elapsed = 0;
let rain = false;
let weatherTimer = 38;
let audio = null;
let muted = false;
let shake = 0;
let damageCooldown = 0;
let missionPulse = 0;
let missionCount = 0;

const player = {
  x: 1160,
  y: 96,
  angle: 0,
  speed: 0,
  health: 100,
  money: 2500,
  wanted: 0,
  wantedHeat: 0,
  color: "#d7ff38"
};

const mission = { x: 0, y: 0, reward: 500, title: "Ve al punto marcado" };

function seeded(seed) {
  let n = seed >>> 0;
  return () => {
    n += 0x6D2B79F5;
    let t = n;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const random = seeded(91357);

function resize() {
  const dpr = Math.min(devicePixelRatio || 1, 2);
  width = innerWidth;
  height = innerHeight;
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
addEventListener("resize", resize);
resize();

function roadAt(x, y) {
  if (x < 0 || y < 0 || x > WORLD || y > WORLD) return false;
  return x % GRID < ROAD || y % GRID < ROAD;
}

function solidAt(x, y) {
  if (x < 10 || y < 10 || x > WORLD - 10 || y > WORLD - 10) return true;
  return buildings.some(b => x > b.x && x < b.x + b.w && y > b.y && y < b.y + b.h);
}

function carFits(x, y, angle) {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const points = [[21, 11], [21, -11], [-21, 11], [-21, -11]];
  return points.every(([px, py]) => !solidAt(x + px * c - py * s, y + px * s + py * c));
}

function buildCity() {
  for (let gx = 0; gx < WORLD; gx += GRID) {
    for (let gy = 0; gy < WORLD; gy += GRID) {
      const inset = 26 + random() * 15;
      const w = GRID - ROAD - inset * 2;
      const h = GRID - ROAD - inset * 2;
      buildings.push({
        x: gx + ROAD + inset,
        y: gy + ROAD + inset,
        w,
        h,
        floors: 2 + Math.floor(random() * 11),
        hue: 195 + Math.floor(random() * 45),
        roof: random() > .72
      });
    }
  }

  for (let i = 0; i < 34; i++) traffic.push(makeTraffic(i));
  for (let i = 0; i < 46; i++) pedestrians.push(makePedestrian());
  chooseMission();
}

function makeTraffic(i) {
  const vertical = i % 2 === 0;
  const line = Math.floor(random() * (WORLD / GRID));
  const dir = random() > .5 ? 1 : -1;
  return {
    x: vertical ? line * GRID + (dir > 0 ? LANE[0] : LANE[1]) : random() * WORLD,
    y: vertical ? random() * WORLD : line * GRID + (dir > 0 ? LANE[1] : LANE[0]),
    angle: vertical ? (dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (dir > 0 ? 0 : Math.PI),
    axis: vertical ? "y" : "x",
    dir,
    speed: 65 + random() * 75,
    color: roadColors[i % roadColors.length],
    near: false
  };
}

function makePedestrian() {
  const gx = Math.floor(random() * (WORLD / GRID)) * GRID;
  const gy = Math.floor(random() * (WORLD / GRID)) * GRID;
  const vertical = random() > .5;
  const side = random() > .5 ? ROAD + 12 : GRID - 12;
  return {
    x: vertical ? gx + side : gx + ROAD + 15 + random() * (GRID - ROAD - 30),
    y: vertical ? gy + ROAD + 15 + random() * (GRID - ROAD - 30) : gy + side,
    vertical,
    dir: random() > .5 ? 1 : -1,
    speed: 13 + random() * 17,
    color: `hsl(${Math.floor(random() * 360)} 48% 61%)`
  };
}

function roadPoint(far = false) {
  let point;
  do {
    const vertical = random() > .5;
    const line = Math.floor(random() * (WORLD / GRID));
    point = vertical
      ? { x: line * GRID + ROAD / 2, y: 100 + random() * (WORLD - 200) }
      : { x: 100 + random() * (WORLD - 200), y: line * GRID + ROAD / 2 };
  } while (far && distance(point, player) < 900);
  return point;
}

function chooseMission() {
  const p = roadPoint(true);
  mission.x = p.x;
  mission.y = p.y;
  mission.reward = 500 + missionCount * 125;
  mission.title = missionCount ? "Entrega el siguiente paquete" : "Ve al punto marcado";
}

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function shortestAngle(from, to) {
  let d = (to - from + Math.PI) % TAU - Math.PI;
  if (d < -Math.PI) d += TAU;
  return d;
}

function updatePlayer(dt) {
  const forward = keys.has("w") || keys.has("arrowup");
  const backward = keys.has("s") || keys.has("arrowdown");
  const left = keys.has("a") || keys.has("arrowleft");
  const right = keys.has("d") || keys.has("arrowright");
  const nitro = keys.has("shift") && forward && player.speed > 80;
  const handbrake = keys.has(" ");

  if (forward) player.speed += (nitro ? 360 : 255) * dt;
  if (backward) player.speed -= 310 * dt;
  if (!forward && !backward) player.speed *= Math.pow(.12, dt);
  if (handbrake) player.speed *= Math.pow(.015, dt);

  const maxForward = nitro ? 630 : 480;
  player.speed = clamp(player.speed, -170, maxForward);
  const steerGrip = clamp(Math.abs(player.speed) / 100, .08, 1);
  const steer = (right ? 1 : 0) - (left ? 1 : 0);
  player.angle += steer * 2.05 * steerGrip * Math.sign(player.speed || 1) * dt * (handbrake ? 1.45 : 1);

  const nx = player.x + Math.cos(player.angle) * player.speed * dt;
  const ny = player.y + Math.sin(player.angle) * player.speed * dt;
  if (carFits(nx, ny, player.angle)) {
    player.x = nx;
    player.y = ny;
  } else {
    if (Math.abs(player.speed) > 85) hurt(Math.min(18, Math.abs(player.speed) * .035), 0.8);
    player.speed *= -.22;
    shake = Math.min(14, shake + 7);
  }

  if (nitro && Math.random() > .45) {
    particles.push({
      x: player.x - Math.cos(player.angle) * 25,
      y: player.y - Math.sin(player.angle) * 25,
      vx: -Math.cos(player.angle) * 55 + (Math.random() - .5) * 30,
      vy: -Math.sin(player.angle) * 55 + (Math.random() - .5) * 30,
      life: .35,
      color: Math.random() > .5 ? "#4ecbff" : "#ff8a35"
    });
  }

  const offRoad = !roadAt(player.x, player.y);
  if (offRoad) player.speed *= Math.pow(.5, dt);
  damageCooldown = Math.max(0, damageCooldown - dt);
  shake *= Math.pow(.04, dt);
}

function updateTraffic(dt) {
  for (const car of traffic) {
    car[car.axis] += car.dir * car.speed * dt;
    if (car[car.axis] > WORLD + 50) car[car.axis] = -50;
    if (car[car.axis] < -50) car[car.axis] = WORLD + 50;

    const d = distance(car, player);
    if (d < 31 && !car.near) {
      car.near = true;
      const impact = Math.abs(player.speed) + car.speed;
      hurt(Math.min(15, impact * .025), 1.2);
      addWanted(.65);
      player.speed *= -.3;
      shake = 11;
    }
    if (d > 55) car.near = false;
  }
}

function updatePedestrians(dt) {
  for (const p of pedestrians) {
    if (p.vertical) p.y += p.dir * p.speed * dt;
    else p.x += p.dir * p.speed * dt;
    const gx = Math.floor(p.x / GRID) * GRID;
    const gy = Math.floor(p.y / GRID) * GRID;
    if (p.vertical && (p.y < gy + ROAD + 8 || p.y > gy + GRID - 8)) p.dir *= -1;
    if (!p.vertical && (p.x < gx + ROAD + 8 || p.x > gx + GRID - 8)) p.dir *= -1;
    if (distance(p, player) < 20 && Math.abs(player.speed) > 45) {
      addWanted(1.15);
      hurt(2, .5);
      p.x = roadPoint().x;
      p.y = roadPoint().y;
    }
  }
}

function addWanted(amount) {
  player.wanted = clamp(player.wanted + amount, 0, 5);
  player.wantedHeat = 18;
}

function spawnPolice() {
  const p = roadPoint();
  const angle = Math.atan2(player.y - p.y, player.x - p.x);
  police.push({ x: p.x, y: p.y, angle, speed: 180, flash: 0, hit: false });
}

function updatePolice(dt) {
  const desiredCount = Math.ceil(player.wanted);
  while (police.length < desiredCount) spawnPolice();
  while (police.length > desiredCount) police.pop();

  for (const car of police) {
    const target = Math.atan2(player.y - car.y, player.x - car.x);
    car.angle += clamp(shortestAngle(car.angle, target), -1.8 * dt, 1.8 * dt);
    car.speed += (230 + player.wanted * 28 - car.speed) * dt;
    const nx = car.x + Math.cos(car.angle) * car.speed * dt;
    const ny = car.y + Math.sin(car.angle) * car.speed * dt;
    if (carFits(nx, ny, car.angle)) {
      car.x = nx;
      car.y = ny;
    } else {
      car.angle += (Math.random() > .5 ? 1 : -1) * 1.15;
    }
    car.flash += dt * 11;
    const d = distance(car, player);
    if (d < 34 && !car.hit) {
      car.hit = true;
      hurt(8 + player.wanted * 1.5, 1.3);
      player.speed *= .45;
      shake = 13;
    }
    if (d > 60) car.hit = false;
  }

  if (player.wantedHeat > 0) player.wantedHeat -= dt;
  else if (player.wanted > 0 && police.every(p => distance(p, player) > 430)) {
    player.wanted = Math.max(0, player.wanted - dt * .16);
  }
}

function hurt(amount, cooldown) {
  if (damageCooldown > 0) return;
  player.health = Math.max(0, player.health - amount);
  damageCooldown = cooldown;
  if (player.health <= 0) endGame();
}

function updateMission() {
  if (distance(player, mission) < 58) {
    missionCount += 1;
    player.money += mission.reward;
    player.health = Math.min(100, player.health + 18);
    player.wanted = Math.max(0, player.wanted - 1);
    missionPulse = 1;
    chooseMission();
  }
}

function updateParticles(dt) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.life -= dt;
    if (p.life <= 0) particles.splice(i, 1);
  }
  missionPulse = Math.max(0, missionPulse - dt);
}

function updateWorld(dt) {
  elapsed += dt;
  weatherTimer -= dt;
  if (weatherTimer <= 0) {
    rain = !rain;
    weatherTimer = 34 + random() * 52;
  }
  updatePlayer(dt);
  updateTraffic(dt);
  updatePedestrians(dt);
  updatePolice(dt);
  updateMission();
  updateParticles(dt);
  updateAudio();
}

function camera() {
  return {
    x: clamp(player.x - width / 2, 0, Math.max(0, WORLD - width)),
    y: clamp(player.y - height / 2, 0, Math.max(0, WORLD - height))
  };
}

function drawRoads(cam) {
  ctx.fillStyle = "#253428";
  ctx.fillRect(0, 0, width, height);

  const xStart = Math.floor(cam.x / GRID) * GRID;
  const yStart = Math.floor(cam.y / GRID) * GRID;
  ctx.fillStyle = "#282c30";
  for (let x = xStart; x < cam.x + width + GRID; x += GRID) {
    ctx.fillRect(x - cam.x, -cam.y, ROAD, WORLD);
  }
  for (let y = yStart; y < cam.y + height + GRID; y += GRID) {
    ctx.fillRect(-cam.x, y - cam.y, WORLD, ROAD);
  }

  ctx.strokeStyle = "rgba(255,255,255,.17)";
  ctx.lineWidth = 2;
  ctx.setLineDash([18, 18]);
  for (let x = xStart; x < cam.x + width + GRID; x += GRID) {
    ctx.beginPath();
    ctx.moveTo(x + ROAD / 2 - cam.x, 0);
    ctx.lineTo(x + ROAD / 2 - cam.x, height);
    ctx.stroke();
  }
  for (let y = yStart; y < cam.y + height + GRID; y += GRID) {
    ctx.beginPath();
    ctx.moveTo(0, y + ROAD / 2 - cam.y);
    ctx.lineTo(width, y + ROAD / 2 - cam.y);
    ctx.stroke();
  }
  ctx.setLineDash([]);

  ctx.fillStyle = "rgba(210,218,204,.17)";
  for (let x = xStart; x < cam.x + width + GRID; x += GRID) {
    ctx.fillRect(x + ROAD - cam.x, 0, 10, height);
  }
  for (let y = yStart; y < cam.y + height + GRID; y += GRID) {
    ctx.fillRect(0, y + ROAD - cam.y, width, 10);
  }
}

function drawBuildings(cam) {
  for (const b of buildings) {
    const x = b.x - cam.x;
    const y = b.y - cam.y;
    if (x > width + 60 || y > height + 60 || x + b.w < -60 || y + b.h < -60) continue;
    const shade = Math.min(38, b.floors * 2.3);
    ctx.fillStyle = "rgba(0,0,0,.28)";
    ctx.fillRect(x + shade * .45, y + shade * .55, b.w, b.h);
    ctx.fillStyle = `hsl(${b.hue} 14% ${31 + b.floors}%)`;
    ctx.fillRect(x, y, b.w, b.h);
    ctx.strokeStyle = "rgba(255,255,255,.08)";
    ctx.strokeRect(x + .5, y + .5, b.w - 1, b.h - 1);

    ctx.fillStyle = "rgba(9,15,20,.33)";
    for (let wx = 18; wx < b.w - 12; wx += 31) {
      for (let wy = 18; wy < b.h - 12; wy += 33) {
        ctx.fillRect(x + wx, y + wy, 12, 8);
      }
    }
    if (b.roof) {
      ctx.fillStyle = "rgba(10,14,17,.42)";
      ctx.fillRect(x + b.w * .3, y + b.h * .3, b.w * .4, b.h * .28);
    }
  }
}

function drawCar(car, cam, policeCar = false, playerCar = false) {
  const x = car.x - cam.x;
  const y = car.y - cam.y;
  if (x < -60 || y < -60 || x > width + 60 || y > height + 60) return;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(car.angle);
  ctx.fillStyle = "rgba(0,0,0,.42)";
  ctx.fillRect(-23, -12 + 4, 48, 25);
  ctx.fillStyle = policeCar ? "#e9edf2" : car.color;
  ctx.beginPath();
  ctx.roundRect(-24, -12, 48, 24, 6);
  ctx.fill();
  ctx.fillStyle = policeCar ? "#19212b" : "#17242d";
  ctx.fillRect(-8, -10, 18, 20);
  ctx.fillStyle = "rgba(125,201,228,.62)";
  ctx.fillRect(-5, -9, 11, 18);
  ctx.fillStyle = "#fff5c4";
  ctx.fillRect(20, -8, 4, 5);
  ctx.fillRect(20, 3, 4, 5);
  ctx.fillStyle = "#ff334c";
  ctx.fillRect(-24, -8, 3, 5);
  ctx.fillRect(-24, 3, 3, 5);
  if (policeCar) {
    ctx.fillStyle = Math.sin(car.flash) > 0 ? "#ff2f4c" : "#258cff";
    ctx.fillRect(-2, -14, 8, 4);
  }
  if (playerCar) {
    ctx.strokeStyle = "rgba(215,255,56,.45)";
    ctx.lineWidth = 2;
    ctx.strokeRect(-26, -14, 52, 28);
  }
  ctx.restore();
}

function drawPeople(cam) {
  for (const p of pedestrians) {
    const x = p.x - cam.x;
    const y = p.y - cam.y;
    if (x < -20 || y < -20 || x > width + 20 || y > height + 20) continue;
    ctx.fillStyle = "rgba(0,0,0,.3)";
    ctx.beginPath();
    ctx.ellipse(x + 3, y + 5, 5, 8, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(x, y, 4, 0, TAU);
    ctx.fill();
    ctx.fillStyle = "#e7bc99";
    ctx.beginPath();
    ctx.arc(x, y - 5, 2.7, 0, TAU);
    ctx.fill();
  }
}

function drawMission(cam) {
  const x = mission.x - cam.x;
  const y = mission.y - cam.y;
  const pulse = 1 + Math.sin(elapsed * 4) * .12;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(pulse, pulse);
  ctx.strokeStyle = "rgba(92,225,230,.85)";
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(0, 0, 28, 0, TAU);
  ctx.stroke();
  ctx.fillStyle = "rgba(92,225,230,.2)";
  ctx.beginPath();
  ctx.arc(0, 0, 22, 0, TAU);
  ctx.fill();
  ctx.restore();
}

function drawParticles(cam) {
  for (const p of particles) {
    ctx.globalAlpha = Math.max(0, p.life * 2.8);
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x - cam.x, p.y - cam.y, 3, 0, TAU);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function drawRain() {
  if (!rain) return;
  ctx.strokeStyle = "rgba(145,205,255,.23)";
  ctx.lineWidth = 1;
  const shift = (elapsed * 720) % 90;
  for (let x = -height; x < width + height; x += 42) {
    for (let y = -90; y < height + 90; y += 90) {
      ctx.beginPath();
      ctx.moveTo(x + y * .28, y + shift);
      ctx.lineTo(x + y * .28 - 9, y + shift + 27);
      ctx.stroke();
    }
  }
}

function drawLighting() {
  const dayPhase = (elapsed / 180 + .72) % 1;
  const sun = Math.sin(dayPhase * Math.PI);
  const darkness = clamp(.6 - sun * .62, .03, .58);
  ctx.fillStyle = `rgba(7,13,29,${darkness})`;
  ctx.fillRect(0, 0, width, height);
  if (damageCooldown > 0) {
    ctx.fillStyle = `rgba(255,18,42,${damageCooldown * .09})`;
    ctx.fillRect(0, 0, width, height);
  }
}

function render() {
  const cam = camera();
  const sx = (Math.random() - .5) * shake;
  const sy = (Math.random() - .5) * shake;
  ctx.save();
  ctx.translate(sx, sy);
  drawRoads(cam);
  drawBuildings(cam);
  drawMission(cam);
  drawPeople(cam);
  traffic.forEach(car => drawCar(car, cam));
  police.forEach(car => drawCar(car, cam, true));
  drawCar(player, cam, false, true);
  drawParticles(cam);
  ctx.restore();
  drawLighting();
  drawRain();
  drawMinimap();
  updateHud();
}

function drawMinimap() {
  const w = mapCanvas.width;
  const h = mapCanvas.height;
  const range = 760;
  const scale = w / range;
  mapCtx.clearRect(0, 0, w, h);
  mapCtx.fillStyle = "#101820";
  mapCtx.fillRect(0, 0, w, h);
  mapCtx.strokeStyle = "rgba(255,255,255,.17)";
  mapCtx.lineWidth = ROAD * scale;
  for (let x = 0; x <= WORLD; x += GRID) {
    const mx = w / 2 + (x + ROAD / 2 - player.x) * scale;
    mapCtx.beginPath();
    mapCtx.moveTo(mx, 0);
    mapCtx.lineTo(mx, h);
    mapCtx.stroke();
  }
  for (let y = 0; y <= WORLD; y += GRID) {
    const my = h / 2 + (y + ROAD / 2 - player.y) * scale;
    mapCtx.beginPath();
    mapCtx.moveTo(0, my);
    mapCtx.lineTo(w, my);
    mapCtx.stroke();
  }
  const mx = w / 2 + (mission.x - player.x) * scale;
  const my = h / 2 + (mission.y - player.y) * scale;
  mapCtx.fillStyle = "#5ce1e6";
  mapCtx.beginPath();
  mapCtx.arc(mx, my, 5, 0, TAU);
  mapCtx.fill();
  mapCtx.fillStyle = "#ff3b55";
  police.forEach(p => {
    const px = w / 2 + (p.x - player.x) * scale;
    const py = h / 2 + (p.y - player.y) * scale;
    mapCtx.fillRect(px - 2, py - 2, 4, 4);
  });
  mapCtx.save();
  mapCtx.translate(w / 2, h / 2);
  mapCtx.rotate(player.angle + Math.PI / 2);
  mapCtx.fillStyle = "#d7ff38";
  mapCtx.beginPath();
  mapCtx.moveTo(0, -9);
  mapCtx.lineTo(6, 7);
  mapCtx.lineTo(0, 4);
  mapCtx.lineTo(-6, 7);
  mapCtx.closePath();
  mapCtx.fill();
  mapCtx.restore();
}

function updateHud() {
  const kmh = Math.round(Math.abs(player.speed) * .43);
  ui.speed.textContent = String(kmh);
  ui.money.textContent = `€ ${Math.round(player.money).toLocaleString("es-ES")}`;
  ui.healthBar.style.width = `${player.health}%`;
  ui.healthBar.style.background = player.health < 30 ? "#ff3b55" : "linear-gradient(90deg,#4cd964,#d7ff38)";
  ui.healthText.textContent = String(Math.round(player.health));
  const stars = Math.ceil(player.wanted);
  ui.wanted.textContent = `${"★ ".repeat(stars)}${"☆ ".repeat(5 - stars)}`.trim();
  ui.wanted.classList.toggle("hot", stars > 0);
  ui.missionText.textContent = mission.title;
  ui.missionDistance.textContent = `${Math.round(distance(player, mission) / 4)} m · € ${mission.reward}`;
  const minutes = Math.floor((18 * 60 + elapsed * 2.2) % 1440);
  const hh = String(Math.floor(minutes / 60)).padStart(2, "0");
  const mm = String(minutes % 60).padStart(2, "0");
  ui.clock.textContent = `${hh}:${mm} · ${rain ? "LLUVIA" : "DESPEJADO"}`;
}

function loop(now) {
  const dt = Math.min(.035, (now - last) / 1000 || 0);
  last = now;
  if (running && !paused && !gameOver) updateWorld(dt);
  render();
  requestAnimationFrame(loop);
}

function startGame() {
  running = true;
  paused = false;
  ui.intro.hidden = true;
  ui.pause.hidden = true;
  initAudio();
}

function togglePause() {
  if (!running || gameOver) return;
  paused = !paused;
  ui.pause.hidden = !paused;
}

function endGame() {
  gameOver = true;
  paused = true;
  ui.pause.hidden = false;
  ui.pause.querySelector("p").textContent = "VEHÍCULO DESTRUIDO";
  document.querySelector("#resumeBtn").textContent = "VOLVER A EMPEZAR";
}

function resetGame() {
  player.x = 1160;
  player.y = 96;
  player.angle = 0;
  player.speed = 0;
  player.health = 100;
  player.money = 2500;
  player.wanted = 0;
  player.wantedHeat = 0;
  police.length = 0;
  missionCount = 0;
  gameOver = false;
  document.querySelector("#resumeBtn").textContent = "SEGUIR";
  ui.pause.querySelector("p").textContent = "JUEGO EN PAUSA";
  chooseMission();
  startGame();
}

function initAudio() {
  if (audio || muted) return;
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext) return;
  const ac = new AudioContext();
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  const filter = ac.createBiquadFilter();
  osc.type = "sawtooth";
  osc.frequency.value = 48;
  gain.gain.value = .025;
  filter.type = "lowpass";
  filter.frequency.value = 190;
  osc.connect(filter).connect(gain).connect(ac.destination);
  osc.start();
  audio = { ac, osc, gain, filter };
}

function updateAudio() {
  if (!audio) return;
  const now = audio.ac.currentTime;
  audio.osc.frequency.setTargetAtTime(45 + Math.abs(player.speed) * .18, now, .05);
  audio.filter.frequency.setTargetAtTime(150 + Math.abs(player.speed) * .8, now, .08);
  audio.gain.gain.setTargetAtTime(muted ? 0 : .018 + Math.abs(player.speed) * .000035, now, .08);
}

document.querySelector("#playBtn").addEventListener("click", startGame);
document.querySelector("#resumeBtn").addEventListener("click", () => gameOver ? resetGame() : togglePause());
ui.soundBtn.addEventListener("click", () => {
  muted = !muted;
  ui.soundBtn.textContent = `SONIDO: ${muted ? "NO" : "SÍ"}`;
  if (!muted) initAudio();
});

addEventListener("keydown", event => {
  const key = event.key.toLowerCase();
  if (["arrowup", "arrowdown", "arrowleft", "arrowright", " "].includes(key)) event.preventDefault();
  if (key === "escape" && !event.repeat) togglePause();
  keys.add(key);
});
addEventListener("keyup", event => keys.delete(event.key.toLowerCase()));

for (const button of document.querySelectorAll("[data-key]")) {
  const key = button.dataset.key;
  const down = event => {
    event.preventDefault();
    keys.add(key);
    button.classList.add("active");
  };
  const up = event => {
    event.preventDefault();
    keys.delete(key);
    button.classList.remove("active");
  };
  button.addEventListener("pointerdown", down);
  button.addEventListener("pointerup", up);
  button.addEventListener("pointercancel", up);
  button.addEventListener("pointerleave", up);
}

buildCity();
requestAnimationFrame(loop);
