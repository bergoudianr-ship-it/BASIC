// @ts-nocheck
/* Motor do jogo (portado do arquivo único). Tipagem estrita fica na ponte
   (bridge.ts): os ~4.000 linhas internas seguem sem checagem de tipos. */
import * as THREE from 'three';
import type { Bridge, EngineAPI } from './bridge';
import { m4a1Parts, ruinasKit, kitByMaterial } from './sketchupMesh';
import { crackedGlass, shatteredGlass, wallDecals, decalQuad, cable, droopingCable, merge } from './ruins';
import { upgradeMaterials, skyEnvironmentCPU, hdriEnvironment, surfaceMaterial, createPost } from './graphics';

export function bootEngine(bridge: Bridge): EngineAPI {

/* =====================================================================
   OPERAÇÃO BLACKOUT — FPS em arquivo único
   Engine: Three.js r128 · Áudio: WebAudio sintetizado · Sem assets externos
   ===================================================================== */

/* ---------------------------------------------------------------
   0. Atalhos / utilidades
   --------------------------------------------------------------- */
const $  = id => document.getElementById(id);
const TAU = Math.PI * 2;
const clamp = (v,a,b) => v < a ? a : (v > b ? b : v);
const lerp  = (a,b,t) => a + (b-a) * t;
const rand  = (a,b) => a + Math.random() * (b-a);
const randInt = (a,b) => Math.floor(rand(a,b+1));
const pick  = arr => arr[Math.floor(Math.random()*arr.length)];

/* ---------------------------------------------------------------
   1. Estado global
   --------------------------------------------------------------- */
const STATE = { LOADING:0, MENU:1, PLAYING:2, PAUSED:3, DEAD:4 };
let gameState = STATE.LOADING;

const settings = {
  sens:    1.00,
  fov:     82,
  volume:  0.55,
  invertY: false,
  bob:     true,
  difficulty: 'veterano',
  map: 'ruinas',
  mode: 'sobrevivencia',   // sobrevivencia | tdm
  limit: 0,                // limite de abates no mata-mata (0 = sem limite)
  quality: 'alta'          // alta | media | baixa (pós-processamento)
};

/* Três níveis de dificuldade. Mexem em quanto o inimigo acerta, quanto dói,
   quanto ele aguenta, quantos vêm de uma vez e em quanto tempo ele reage. */
const DIFFICULTIES = [
  { id:'recruta',  name:'RECRUTA',  hit:0.58, dmg:0.70, hp:0.85, conc:-1, alert:[0.45,1.30], score:0.8,
    desc:'Reagem devagar e erram muito. Para aprender o mapa e as armas.' },
  { id:'veterano', name:'VETERANO', hit:1.00, dmg:1.00, hp:1.00, conc: 0, alert:[0.15,0.70], score:1.0,
    desc:'Equilibrado. Pressiona, mas dá espaço para revidar.' },
  { id:'elite',    name:'ELITE',    hit:1.45, dmg:1.32, hp:1.30, conc: 2, alert:[0.04,0.28], score:1.4,
    desc:'Reagem quase na hora, erram pouco e vêm em maior número.' }
];
const DIFF = () => DIFFICULTIES.find(d => d.id === settings.difficulty) || DIFFICULTIES[1];

const stats = {
  score:0, kills:0, headshots:0, shots:0, hits:0,
  wave:0, streak:0, bestStreak:0, credits:0, spent:0
};

/* ---------------------------------------------------------------
   2. Renderer / cena / câmera
   --------------------------------------------------------------- */
const canvas   = $('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias:true, powerPreference:'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
if (THREE.sRGBEncoding !== undefined) renderer.outputEncoding = THREE.sRGBEncoding;
renderer.toneMapping = THREE.ACESFilmicToneMapping;   // curva de filme: altas luzes quentes sem estourar
renderer.toneMappingExposure = 0.78;

const scene = new THREE.Scene();
// céu claro coerente com o sol quente da cena (antes era quase preto sob luz diurna)
const SKY = 0x9dafbd;
scene.background = new THREE.Color(SKY);
scene.fog = new THREE.Fog(SKY, 55, 165);

const camera = new THREE.PerspectiveCamera(settings.fov, innerWidth/innerHeight, 0.05, 500);

// Cena separada para o modelo da arma em primeira pessoa (nunca atravessa paredes)
const gunScene  = new THREE.Scene();
const gunCamera = new THREE.PerspectiveCamera(58, innerWidth/innerHeight, 0.01, 12);
gunScene.add(new THREE.AmbientLight(0xffffff, 0.3));   // o HDRI (IBL) completa a luz ambiente
const gunKey = new THREE.DirectionalLight(0xfff0d8, 0.75);
gunKey.position.set(-1.2, 2.4, 1.6);
gunScene.add(gunKey);
const gunRim = new THREE.DirectionalLight(0x8fb4ff, 0.35);
gunRim.position.set(2, 0.5, -2);
gunScene.add(gunRim);

/* --- Iluminação do mundo --- */
scene.add(new THREE.HemisphereLight(0x9fb4cc, 0x2a2a20, 0.72));
const sun = new THREE.DirectionalLight(0xffe7c0, 1.05);
sun.position.set(40, 62, 26);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.near = 1;
sun.shadow.camera.far  = 190;
sun.shadow.camera.left = -42; sun.shadow.camera.right = 42;
sun.shadow.camera.top  =  42; sun.shadow.camera.bottom = -42;
sun.shadow.normalBias = 0.04;
sun.shadow.bias = -0.0012;
scene.add(sun);
scene.add(sun.target);
const hemi = scene.children.find(o => o.isHemisphereLight);

/* --- Céu em gradiente com brilho do sol (fim de tarde, como em Black Ops 2) --- */
const skyUni = {
  zen:{ value:new THREE.Color(0x5d7fa6) }, hor:{ value:new THREE.Color(0xe8c49a) },
  sunC:{ value:new THREE.Color(0xffc585) }, sunD:{ value:new THREE.Vector3(0.6,0.3,-0.75).normalize() }
};
const skyDome = new THREE.Mesh(new THREE.SphereGeometry(420, 32, 16), new THREE.ShaderMaterial({
  uniforms: skyUni, side:THREE.BackSide, depthWrite:false, fog:false,
  vertexShader:'varying vec3 vD; void main(){ vD = normalize(position); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
  fragmentShader:[
    'uniform vec3 zen, hor, sunC, sunD; varying vec3 vD;',
    'void main(){',
    '  float h = vD.y;',
    '  vec3 c = mix(hor, zen, pow(clamp(h,0.0,1.0), 0.55));',
    '  c = mix(c, hor*0.78, clamp(-h*4.0,0.0,1.0));',              // abaixo do horizonte: névoa
    '  float s = max(dot(vD, sunD), 0.0);',
    '  c += sunC * (pow(s, 900.0)*3.0 + pow(s, 24.0)*0.45 + pow(s, 4.0)*0.12);',
    '  gl_FragColor = vec4(c, 1.0);',
    '}'].join('\n')
}));
skyDome.renderOrder = -1;
scene.add(skyDome);

/* Cada mapa tem uma hora do dia: dourado industrial, deserto enevoado, cidade clara. */
const ATMOS = {
  ferrovelho:{ zen:0x55789f, hor:0xe9c08e, sun:0xffbe78, dir:[0.62,0.26,-0.74], sunI:1.55,
               hemi:[0xbac6d6, 0x4a3a28, 0.62], fog:0xcdb08a, fogR:[40,175], mark:'torre-resfriamento', hdri:'sunset' },
  torre:     { zen:0x6f9ac6, hor:0xead6b0, sun:0xfff0d2, dir:[0.35,0.62,0.45], sunI:1.45,
               hemi:[0xc7d4e2, 0x6a5638, 0.66], fog:0xdcc9a3, fogR:[40,150], mark:'mesas', hdri:'sky' },
  saguao:    { zen:0x86a0bd, hor:0xdfe2e4, sun:0xfff3dc, dir:[-0.45,0.55,0.5], sunI:0.95,
               hemi:[0xc9d2dc, 0x4c4a44, 0.5], fog:0xc8ced4, fogR:[40,150], mark:'cidade', hdri:'city' },
  // manhã enfumaçada: sol quente atravessando a poeira, sombras leitosas, cor dessaturada (Aftermath)
  ruinas:    { zen:0x4d5b69, hor:0xa58d69, sun:0xffd29a, dir:[0.62,0.4,-0.42], sunI:1.35,
               hemi:[0xb3aa98, 0x453a2d, 0.5], fog:0x8f7f66, fogR:[35,210], mark:'ruinas', hdri:'city',
               grade:{ saturation:0.92, lift:[0.012,0.01,0.008], gain:[1.05,1.0,0.9], exposure:0.94 } }
};
const post = createPost(renderer, scene, camera, gunScene, gunCamera, () => gameState === STATE.PLAYING, 0.78);
function applyAtmos(id){
  const a = ATMOS[id] || ATMOS.ferrovelho;
  skyUni.zen.value.setHex(a.zen); skyUni.hor.value.setHex(a.hor); skyUni.sunC.value.setHex(a.sun);
  skyUni.sunD.value.set(a.dir[0], a.dir[1], a.dir[2]).normalize();
  sun.color.setHex(a.sun); sun.intensity = a.sunI;
  sun.position.copy(skyUni.sunD.value).multiplyScalar(90);
  hemi.color.setHex(a.hemi[0]); hemi.groundColor.setHex(a.hemi[1]); hemi.intensity = a.hemi[2];
  scene.background.setHex(a.fog);
  scene.fog.color.setHex(a.fog); scene.fog.near = a.fogR[0]; scene.fog.far = a.fogR[1];
  hemi.intensity = a.hemi[2] * 0.55;          // o IBL do céu já fornece parte da luz ambiente
  scene.environment = skyEnvironmentCPU(renderer, skyUni.zen.value, skyUni.hor.value, skyUni.sunC.value, skyUni.sunD.value);
  gunScene.environment = scene.environment;
  post.setGrade(a.grade || {});
  // HDRI fotográfico chega em seguida (decodificação assíncrona do EXR)
  const tok = (applyAtmos.tok = (applyAtmos.tok || 0) + 1);
  hdriEnvironment(renderer, a.hdri).then(t => { if (applyAtmos.tok === tok){ scene.environment = t; gunScene.environment = t; } })
    .catch(e => console.warn('HDRI indisponível, mantendo céu procedural', e));
}

/* ---------------------------------------------------------------
   3. Áudio sintetizado (WebAudio, zero assets)
   --------------------------------------------------------------- */
const Audio_ = {
  ctx:null, master:null, noise:null, ready:false,

  init(){
    if (this.ready) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = settings.volume;
    this.master.connect(this.ctx.destination);

    // buffer de ruído branco reutilizável
    const len = this.ctx.sampleRate * 1.0;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i=0;i<len;i++) d[i] = Math.random()*2 - 1;
    this.noise = buf;
    this.ready = true;
  },
  resume(){ if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); },
  setVolume(v){ if (this.master) this.master.gain.value = v; },

  // Rajada de ruído filtrado + corpo grave => tiro
  shot(cfg){
    if (!this.ready) return;
    const c = this.ctx, t = c.currentTime;
    const src = c.createBufferSource();
    src.buffer = this.noise;
    src.playbackRate.value = cfg.rate || 1;

    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(cfg.cut || 5200, t);
    lp.frequency.exponentialRampToValueAtTime(320, t + (cfg.dur||0.22));
    lp.Q.value = 1.1;

    const hp = c.createBiquadFilter();
    hp.type = 'highpass'; hp.frequency.value = 180;

    const g = c.createGain();
    g.gain.setValueAtTime(cfg.gain || 0.42, t);
    g.gain.exponentialRampToValueAtTime(0.0008, t + (cfg.dur||0.22));

    src.connect(lp); lp.connect(hp); hp.connect(g); g.connect(this.master);
    src.start(t); src.stop(t + (cfg.dur||0.22) + 0.02);

    // "thump" grave
    const o = c.createOscillator(), og = c.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(cfg.low || 155, t);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.13);
    og.gain.setValueAtTime((cfg.gain||0.42) * 0.85, t);
    og.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
    o.connect(og); og.connect(this.master);
    o.start(t); o.stop(t + 0.18);
  },

  // Bipe simples com envelope
  tone(freq, dur, gain, type, freq2){
    if (!this.ready) return;
    const c = this.ctx, t = c.currentTime;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type || 'square';
    o.frequency.setValueAtTime(freq, t);
    if (freq2) o.frequency.exponentialRampToValueAtTime(freq2, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + dur + 0.02);
  },

  // Estalo curto (mecanismo/recarga/passos)
  click(gain, cut, dur, rate){
    if (!this.ready) return;
    const c = this.ctx, t = c.currentTime;
    const src = c.createBufferSource();
    src.buffer = this.noise;
    src.playbackRate.value = rate || 1.6;
    const bp = c.createBiquadFilter();
    bp.type = 'bandpass'; bp.frequency.value = cut || 2100; bp.Q.value = 2.2;
    const g = c.createGain();
    g.gain.setValueAtTime(gain || 0.16, t);
    g.gain.exponentialRampToValueAtTime(0.0005, t + (dur || 0.06));
    src.connect(bp); bp.connect(g); g.connect(this.master);
    src.start(t); src.stop(t + (dur||0.06) + 0.02);
  },

  hitMarker(){ this.tone(1750, 0.05, 0.15, 'square'); },
  killSound(){ this.tone(880, 0.09, 0.16, 'square', 1500); },
  headshot(){ this.tone(1250, 0.12, 0.19, 'sawtooth', 2400); },
  hurt(){ this.tone(190, 0.16, 0.20, 'sawtooth', 78); },
  reloadOut(){ this.click(0.14, 1500, 0.07, 1.1); },
  reloadIn (){ this.click(0.17, 900,  0.09, 0.8); },
  switchW  (){ this.click(0.13, 1800, 0.05, 1.4); },
  empty    (){ this.click(0.13, 3400, 0.035, 2.4); },
  step     (){ this.click(0.045, 520, 0.055, 0.55); },
  explode  (){
    if(!this.ready) return;
    const c=this.ctx,t=c.currentTime;
    const src=c.createBufferSource(); src.buffer=this.noise; src.playbackRate.value=0.55;
    const lp=c.createBiquadFilter(); lp.type='lowpass';
    lp.frequency.setValueAtTime(1800,t); lp.frequency.exponentialRampToValueAtTime(90,t+0.9);
    const g=c.createGain(); g.gain.setValueAtTime(0.75,t); g.gain.exponentialRampToValueAtTime(0.001,t+1.0);
    src.connect(lp); lp.connect(g); g.connect(this.master);
    src.start(t); src.stop(t+1.05);
    const o=c.createOscillator(), og=c.createGain();
    o.type='sine'; o.frequency.setValueAtTime(90,t); o.frequency.exponentialRampToValueAtTime(24,t+0.5);
    og.gain.setValueAtTime(0.7,t); og.gain.exponentialRampToValueAtTime(0.001,t+0.6);
    o.connect(og); og.connect(this.master); o.start(t); o.stop(t+0.65);
  },
  waveStart(){ this.tone(330,0.5,0.14,'sawtooth',660); }
};

/* ---------------------------------------------------------------
   4. Materiais e geometrias compartilhados
   --------------------------------------------------------------- */
const MAT = {
  ground:   new THREE.MeshStandardMaterial({ color:0x3c4438 }),
  road:     new THREE.MeshStandardMaterial({ color:0x2b2f33 }),
  wall:     new THREE.MeshStandardMaterial({ color:0x6c6a60 }),
  wallDark: new THREE.MeshStandardMaterial({ color:0x4f4d46 }),
  crate:    new THREE.MeshStandardMaterial({ color:0x7a5c33 }),
  metal:    new THREE.MeshStandardMaterial({ color:0x555c60 }),
  barrel:   new THREE.MeshStandardMaterial({ color:0x8a3a2a }),
  sandbag:  new THREE.MeshStandardMaterial({ color:0x8d8259 }),
  concrete: new THREE.MeshStandardMaterial({ color:0x8b8b83 }),
  enemyBody:new THREE.MeshStandardMaterial({ color:0x4a5240 }),
  enemyHead:new THREE.MeshStandardMaterial({ color:0x9c7c58 }),
  enemyVest:new THREE.MeshStandardMaterial({ color:0x2c3126 }),
  gunDark:  new THREE.MeshStandardMaterial({ color:0x24262a }),
  gunMid:   new THREE.MeshStandardMaterial({ color:0x3a3d42 }),
  gunWood:  new THREE.MeshStandardMaterial({ color:0x5c3f24 }),
  hands:    new THREE.MeshStandardMaterial({ color:0x6b5138 }),
  sleeve:   new THREE.MeshStandardMaterial({ color:0x6f6a4e }),
  // materiais de armamento
  gBlack:   new THREE.MeshStandardMaterial({ color:0x1c1e22 }),
  gSteel:   new THREE.MeshStandardMaterial({ color:0x44484e }),
  gWood:    new THREE.MeshStandardMaterial({ color:0x6b4726 }),
  gWoodL:   new THREE.MeshStandardMaterial({ color:0x855c33 }),
  gPoly:    new THREE.MeshStandardMaterial({ color:0x2f322c }),   // polímero preto-oliva
  gScope:   new THREE.MeshStandardMaterial({ color:0x141619 }),
  gGlass:   new THREE.MeshStandardMaterial({ color:0x2f5a6b }),
  // superfícies e contêineres dos mapas
  contA:    new THREE.MeshStandardMaterial({ color:0x8a4a3a }),
  contB:    new THREE.MeshStandardMaterial({ color:0x3f6272 }),
  contC:    new THREE.MeshStandardMaterial({ color:0x6d7a4a }),
  groundDry:new THREE.MeshStandardMaterial({ color:0x8a7b5c }),
  roadDust: new THREE.MeshStandardMaterial({ color:0x9a8c6b }),
  floorTile:new THREE.MeshStandardMaterial({ color:0x585d63 }),
  floorHall:new THREE.MeshStandardMaterial({ color:0x71777e }),
  // Ruínas: poeira clara, asfalto rachado, concreto de fachada, lataria queimada e o kit do SketchUp
  dust:       new THREE.MeshStandardMaterial({ color:0x8a7f6a }),
  roadCracked:new THREE.MeshStandardMaterial({ color:0x5e5a53 }),
  ruin:       new THREE.MeshStandardMaterial({ color:0x7a7367 }),
  ruinDark:   new THREE.MeshStandardMaterial({ color:0x58524a }),
  burnt:      new THREE.MeshStandardMaterial({ color:0x3d342c }),
  tire:       new THREE.MeshStandardMaterial({ color:0x19191a }),
  pole:       new THREE.MeshStandardMaterial({ color:0x4f4032 }),
  kConcrete:  new THREE.MeshStandardMaterial({ color:0x857f73 }),
  kBreak:     new THREE.MeshStandardMaterial({ color:0x958e7f }),
  kRebar:     new THREE.MeshStandardMaterial({ color:0x6e4431 }),
  kRubble:    new THREE.MeshStandardMaterial({ color:0x80796c }),
  kJersey:    new THREE.MeshStandardMaterial({ color:0x9a9589 })
};
upgradeMaterials(MAT);                // PBR procedural (graphics.ts)
const BOX = new THREE.BoxGeometry(1,1,1);
const CYL = new THREE.CylinderGeometry(1,1,1,10);   // unitário no eixo Y

/* ---------------------------------------------------------------
   5. Mundo: colisores + geometria
   --------------------------------------------------------------- */
const colliders  = [];   // AABBs {minx,maxx,miny,maxy,minz,maxz}
const worldMeshes= [];   // alvos de raycast do cenário
const spawnPoints= [];

function addCollider(x,y,z,w,h,d){
  colliders.push({
    minx:x-w/2, maxx:x+w/2,
    miny:y,     maxy:y+h,
    minz:z-d/2, maxz:z+d/2
  });
}

/** Cria uma caixa sólida com colisão + sombra. */
function addBox(x,y,z,w,h,d, mat, opts){
  opts = opts || {};
  const m = new THREE.Mesh(BOX, mat);
  m.scale.set(w,h,d);
  m.position.set(x, y + h/2, z);
  if (opts.rotY) m.rotation.y = opts.rotY;
  m.castShadow = opts.noShadow !== true;
  m.receiveShadow = true;
  scene.add(m);
  worldMeshes.push(m);
  if (opts.noCollide !== true){
    if (opts.rotY){
      // AABB conservadora para caixas rotacionadas
      const c = Math.abs(Math.cos(opts.rotY)), s = Math.abs(Math.sin(opts.rotY));
      addCollider(x,y,z, w*c + d*s, h, w*s + d*c);
    } else {
      addCollider(x,y,z,w,h,d);
    }
  }
  return m;
}

/** Prédio oco: 4 paredes com uma abertura, teto opcional. */
function addBuilding(cx, cz, w, d, h, doorSide){
  const t = 0.55;                            // espessura da parede
  const gap = 3.2;                           // largura da porta
  const sides = [
    { s:'n', x:cx, z:cz-d/2, w:w, d:t, horiz:true  },
    { s:'s', x:cx, z:cz+d/2, w:w, d:t, horiz:true  },
    { s:'w', x:cx-w/2, z:cz, w:t, d:d, horiz:false },
    { s:'e', x:cx+w/2, z:cz, w:t, d:d, horiz:false }
  ];
  for (const sd of sides){
    if (sd.s === doorSide){
      // parede partida em dois trechos, deixando o vão da porta
      if (sd.horiz){
        const seg = (w - gap) / 2;
        if (seg > 0.2){
          addBox(cx - (gap/2 + seg/2), 0, sd.z, seg, h, t, MAT.wall);
          addBox(cx + (gap/2 + seg/2), 0, sd.z, seg, h, t, MAT.wall);
        }
        addBox(cx, 2.4, sd.z, gap, h-2.4, t, MAT.wallDark); // verga
      } else {
        const seg = (d - gap) / 2;
        if (seg > 0.2){
          addBox(sd.x, 0, cz - (gap/2 + seg/2), t, h, seg, MAT.wall);
          addBox(sd.x, 0, cz + (gap/2 + seg/2), t, h, seg, MAT.wall);
        }
        addBox(sd.x, 2.4, cz, t, h-2.4, gap, MAT.wallDark);
      }
    } else {
      addBox(sd.x, 0, sd.z, sd.w, h, sd.d, MAT.wall);
    }
  }
  // laje / telhado
  addBox(cx, h, cz, w+t, 0.4, d+t, MAT.wallDark);
}

/** Torre de engradados escalável (funciona como escada). */
function addCrateStack(x, z, levels){
  for (let i=0;i<levels;i++){
    const s = 1.25;
    addBox(x + i*1.05, i*s, z, s, s, s, MAT.crate);
  }
}

/* --- utilitários de construção ------------------------------------------ */

/** Escada de degraus baixos (sobe andando, graças ao STEP_UP). */
function addStairs(x, z, largura, alvo, dir, mat){
  const passo = 0.62;
  const n = Math.max(1, Math.round(alvo / 0.42));
  const h = alvo / n;
  for (let i = 0; i < n; i++){
    const alt = (i + 1) * h, off = (i + 0.5) * passo;
    if      (dir === 'n') addBox(x, 0, z - off, largura, alt, passo, mat);
    else if (dir === 's') addBox(x, 0, z + off, largura, alt, passo, mat);
    else if (dir === 'e') addBox(x + off, 0, z, passo, alt, largura, mat);
    else                  addBox(x - off, 0, z, passo, alt, largura, mat);
  }
}

/** Contêiner marítimo (6,0 × 2,6 × 2,44), alinhado em X ou Z. */
function addContainer(x, z, eixo, mat, y){
  const m = mat || pick([MAT.contA, MAT.contB, MAT.contC]);
  if (eixo === 'z') addBox(x, y||0, z, 2.44, 2.6, 6.0, m);
  else              addBox(x, y||0, z, 6.0, 2.6, 2.44, m);
}

/** Plataforma elevada com guarda-corpo nos lados pedidos ('nsew'). */
function addPlatform(cx, cz, w, d, y, lados, mat){
  addBox(cx, y, cz, w, 0.3, d, mat || MAT.metal);
  const py = y + 0.3, hr = 0.95, t = 0.16, L = lados || '';
  if (L.includes('n')) addBox(cx, py, cz - d/2, w, hr, t, MAT.metal);
  if (L.includes('s')) addBox(cx, py, cz + d/2, w, hr, t, MAT.metal);
  if (L.includes('w')) addBox(cx - w/2, py, cz, t, hr, d, MAT.metal);
  if (L.includes('e')) addBox(cx + w/2, py, cz, t, hr, d, MAT.metal);
}

/** Sala fechada com vãos de porta nos lados listados. */
function addRoom(cx, cz, w, d, h, portas, mat, comTeto){
  const t = 0.5, vao = 3.6, M = mat || MAT.wall;
  const tem = c => (portas || '').includes(c);
  const parede = (lado, px, pz, pw, pd, horiz) => {
    if (!tem(lado)){ addBox(px, 0, pz, pw, h, pd, M); return; }
    const total = horiz ? pw : pd;
    const seg = (total - vao) / 2;
    if (horiz){
      if (seg > 0.3){
        addBox(px - (vao/2 + seg/2), 0, pz, seg, h, pd, M);
        addBox(px + (vao/2 + seg/2), 0, pz, seg, h, pd, M);
      }
      if (h > 2.7) addBox(px, 2.7, pz, vao, h - 2.7, pd, MAT.wallDark);
    } else {
      if (seg > 0.3){
        addBox(px, 0, pz - (vao/2 + seg/2), pw, h, seg, M);
        addBox(px, 0, pz + (vao/2 + seg/2), pw, h, seg, M);
      }
      if (h > 2.7) addBox(px, 2.7, pz, pw, h - 2.7, vao, MAT.wallDark);
    }
  };
  parede('n', cx, cz - d/2, w, t, true);
  parede('s', cx, cz + d/2, w, t, true);
  parede('w', cx - w/2, cz, t, d, false);
  parede('e', cx + w/2, cz, t, d, false);
  if (comTeto) addBox(cx, h, cz, w + t, 0.35, d + t, MAT.wallDark);
}

/** Parede longa com vãos de passagem em posições dadas. */
function addWallWithGaps(fixo, de, ate, h, eixo, vaos, mat, esp){
  const t = esp || 0.5, M = mat || MAT.wall, largVao = 3.8;
  const cortes = (vaos || []).slice().sort((a,b) => a-b);
  let cursor = de;
  const trechos = [];
  for (const v of cortes){
    if (v - largVao/2 > cursor) trechos.push([cursor, v - largVao/2]);
    cursor = v + largVao/2;
  }
  if (ate > cursor) trechos.push([cursor, ate]);
  for (const [a, b] of trechos){
    const meio = (a + b) / 2, comp = b - a;
    if (comp < 0.2) continue;
    if (eixo === 'x') addBox(meio, 0, fixo, comp, h, t, M);
    else              addBox(fixo, 0, meio, t, h, comp, M);
  }
  // vergas sobre os vãos, para a parede ler como parede
  for (const v of cortes){
    if (h <= 2.9) continue;
    if (eixo === 'x') addBox(v, 2.9, fixo, largVao, h - 2.9, t, MAT.wallDark);
    else              addBox(fixo, 2.9, v, t, h - 2.9, largVao, MAT.wallDark);
  }
}

function addGround(w, d, matChao){
  const g = new THREE.Mesh(new THREE.PlaneGeometry(w, d), matChao || MAT.ground);
  g.rotation.x = -Math.PI/2;
  g.receiveShadow = true;
  g.userData.ownGeo = true;
  scene.add(g); worldMeshes.push(g);
  return g;
}

function addPaved(w, d, x, z, mat){
  const p = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat || MAT.road);
  p.rotation.x = -Math.PI/2;
  p.position.set(x, 0.013, z);
  p.receiveShadow = true;
  p.userData.ownGeo = true;
  scene.add(p); worldMeshes.push(p);
  return p;
}

function addPerimeter(w, d, h, mat){
  const t = 1.4, M = mat || MAT.concrete;
  addBox(0, 0, -d/2, w, h, t, M);
  addBox(0, 0,  d/2, w, h, t, M);
  addBox(-w/2, 0, 0, t, h, d, M);
  addBox( w/2, 0, 0, t, h, d, M);
}

function addBarrels(x, z, n, raio){
  for (let k = 0; k < n; k++){
    const bx = x + rand(-raio, raio), bz = z + rand(-raio, raio);
    const b = new THREE.Mesh(CYL, MAT.barrel);
    b.scale.set(0.42, 1.15, 0.42);
    b.position.set(bx, 0.575, bz);
    b.castShadow = b.receiveShadow = true;
    scene.add(b); worldMeshes.push(b);
    addCollider(bx, 0, bz, 0.84, 1.15, 0.84);
  }
}

/** Muro de sacos de areia: cobertura baixa, dá para atirar por cima agachando. */
function addSandbags(x, z, comp, rotY){
  addBox(x, 0, z, comp, 1.15, 0.9, MAT.sandbag, { rotY: rotY || 0 });
}

/* --- MAPAS ---------------------------------------------------------------
   Layouts originais construídos com a gramática de mapa do Modern Warfare 2/3:
   três corredores paralelos ligados por travessas, uma posição de poder
   elevada que pode ser flanqueada, uma linha longa de tiro e muita cobertura
   baixa quebrando as linhas de visão.
   ------------------------------------------------------------------------ */

/* 1. FERRO-VELHO — pátio industrial, médio alcance, três faixas em Z. */
function mapaFerroVelho(){
  const S = 90;
  addGround(S, S, MAT.ground);
  addPaved(16, S, 0, 0);                       // faixa central pavimentada
  addPaved(S, 12, 0, 0);                       // travessa central
  addPerimeter(S, S, 9);

  // --- FAIXA CENTRAL: armazém, a posição de poder ---
  addRoom(0, 0, 24, 16, 5.4, 'nsew', MAT.wall, true);
  addPlatform(7, -2, 8, 10, 2.7, 'ws');        // mezanino interno
  addStairs(7, 7.3, 3, 3.0, 'n', MAT.metal);
  addSandbags(-6, -3, 4.5, 0.4);
  addSandbags(-5, 4, 4.0, -0.3);

  // fuselagem abandonada ao norte: marco visual e cobertura longa
  addBox(0, 0, -30, 4.6, 4.2, 20, MAT.metal);
  addBox(0, 1.2, -21, 15, 0.7, 3.2, MAT.metal, { rotY: 0.06 });
  addBox(0, 0, -41, 3.0, 2.4, 5.0, MAT.metal);

  // --- FAIXA OESTE: corredor de contêineres (a linha longa de tiro) ---
  const filaW = [-38, -30, -22, 4, 12, 20, 28, 36];
  filaW.forEach(z => { addContainer(-34, z, 'z'); addContainer(-23, z, 'z'); });
  addContainer(-28.5, -14, 'x');               // tampão parcial no meio
  addCrateStack(-23, -6, 2);
  addBarrels(-28, 16, 3, 1.5);
  addSandbags(-28, -6, 5, 1.55);

  // --- FAIXA LESTE: escritório e pilhas de sucata ---
  addRoom(27, -16, 14, 12, 4.6, 'ws', MAT.wall, true);
  addContainer(30, 8, 'x'); addContainer(30, 8, 'x', null, 2.6);
  addContainer(24, 14, 'z');
  addCrateStack(21, 2, 3);                     // rampa de engradados para subir
  addBox(33, 0, 22, 6, 2.5, 5, MAT.metal, { rotY: 0.5 });
  addBarrels(26, 30, 4, 2.0);
  addSandbags(22, -30, 5, 0.2);
  addContainer(34, -32, 'x');

  // --- travessas entre faixas ---
  addSandbags(-14, 20, 4, 0.9);
  addSandbags(14, -20, 4, -0.9);
  addCrateStack(-12, -20, 2);
  addBarrels(13, 22, 3, 1.6);
}

/* 2. TORRE — mapa pequeno e frenético, tudo gira em volta do centro. */
function mapaTorre(){
  const S = 56;
  addGround(S, S, MAT.groundDry);
  addPaved(S, S, 0, 0, MAT.roadDust);
  addPerimeter(S, S, 8, MAT.wallDark);

  // torre central: sobe por escada, domina o mapa, exposta por todos os lados
  addBox(0, 0, 0, 7, 3.4, 7, MAT.concrete);
  addBox(0, 3.7, -3.2, 7, 0.95, 0.3, MAT.metal);
  addBox(-2.4, 3.7, 3.2, 2.2, 0.95, 0.3, MAT.metal);   // vão no meio: chegada da escada
  addBox( 2.4, 3.7, 3.2, 2.2, 0.95, 0.3, MAT.metal);
  addBox(-3.2, 3.7, 0, 0.3, 0.95, 7, MAT.metal);
  addStairs(0, 8.5, 3, 3.4, 'n', MAT.metal);   // sobe rumo à face sul da torre
  addBox(0, 3.7, 0, 2.2, 7.0, 2.2, MAT.metal);      // mastro central
  addPlatform(0, 0, 4.4, 4.4, 7.4, 'nsew');         // ninho no topo do mastro
  addCrateStack(4.6, 1.5, 3);                       // segunda subida, pelo leste

  // quatro barracões nos cantos, portas voltadas para o centro
  addRoom(-15, -15, 6, 6, 3.0, 'se', MAT.wall, true);
  addRoom( 15, -15, 6, 6, 3.0, 'sw', MAT.wall, true);
  addRoom(-15,  15, 6, 6, 3.0, 'ne', MAT.wall, true);
  addRoom( 15,  15, 6, 6, 3.0, 'nw', MAT.wall, true);

  // muros de contêiner formando os flancos
  addContainer(-21, -4, 'z'); addContainer(-21, 4, 'z');
  addContainer( 21, -4, 'z'); addContainer( 21, 4, 'z');
  addContainer(-6, -21, 'x'); addContainer(6, -21, 'x');
  addContainer(-6,  21, 'x'); addContainer(6,  21, 'x');

  // cobertura baixa
  addBarrels(-9, -8, 4, 1.6); addBarrels(9, 8, 4, 1.6);
  addBarrels(10, -9, 3, 1.4); addBarrels(-10, 9, 3, 1.4);
  addSandbags(-8, 0, 4, 1.55); addSandbags(8, 0, 4, 1.55);
  addSandbags(0, -9, 4, 0);
  addSandbags(-7, 9, 4, 0); addSandbags(7, 9, 4, 0);   // livram a base da escada
  addCrateStack(-18, 8, 2); addCrateStack(18, -8, 2);
}

/* 3. SAGUÃO — terminal coberto: salão longo (linha de tiro), salas laterais
      (combate curto) e mezanino sobre o salão (posição de poder flanqueável). */
function mapaSaguao(){
  const W = 96, D = 72;
  addGround(W, D, MAT.floorTile);
  addPaved(80, 18, 0, 0, MAT.floorHall);
  addPerimeter(W, D, 10, MAT.wall);

  // paredes do salão, com portas para as salas laterais
  // uma porta por sala lateral (as divisórias ficam em -24, -8, 8 e 24)
  addWallWithGaps(-9, -40, 40, 5.4, 'x', [-32, -16, 0, 16, 32], MAT.wall);
  addWallWithGaps( 9, -40, 40, 5.4, 'x', [-32, -16, 0, 16, 32], MAT.wall);

  // pilares do salão: quebram a linha de tiro sem fechá-la
  [-30, -18, -6, 6, 18, 30].forEach(x => {
    addBox(x, 0, -5.4, 1.4, 5.4, 1.4, MAT.concrete);
    addBox(x, 0,  5.4, 1.4, 5.4, 1.4, MAT.concrete);
  });

  // balcões e bancos: cobertura baixa dentro do salão
  [-34, -20, -2, 16, 32].forEach((x, i) => {
    addBox(x, 0, i % 2 ? -1.6 : 1.6, 5.0, 1.15, 1.1, MAT.concrete);
  });
  addBox(0, 0, 0, 4.0, 1.3, 4.0, MAT.metal);

  // divisórias das salas laterais (norte e sul)
  [-24, -8, 8, 24].forEach(x => {
    addBox(x, 0, -17, 0.5, 4.4, 16, MAT.wall);
    addBox(x, 0,  17, 0.5, 4.4, 16, MAT.wall);
  });
  // paredes externas das salas, com saída para os corredores de flanco
  // e uma saída por sala para o corredor de flanco
  addWallWithGaps(-25, -40, 40, 4.4, 'x', [-32, -16, 0, 16, 32], MAT.wall);
  addWallWithGaps( 25, -40, 40, 4.4, 'x', [-32, -16, 0, 16, 32], MAT.wall);
  // tetos das salas laterais
  addBox(0, 4.4, -17, 80, 0.35, 16, MAT.wallDark);
  addBox(0, 4.4,  17, 80, 0.35, 16, MAT.wallDark);

  // mezanino sobre o salão, com escada nas duas pontas
  addPlatform(0, -6.4, 68, 5, 3.2, 's');
  addStairs(-39, -6.4, 3, 3.5, 'e', MAT.metal);   // param na borda, não sob a laje
  addStairs( 39, -6.4, 3, 3.5, 'w', MAT.metal);

  // mobília das salas laterais
  [-36, -20, -4, 12, 28].forEach(x => {
    addBox(x, 0, -20, 3.0, 1.2, 1.6, MAT.crate);
    addBox(x, 0,  20, 3.0, 1.2, 1.6, MAT.crate);
  });
  addBarrels(-36, -30, 3, 1.6); addBarrels(36, 30, 3, 1.6);
  addSandbags(-43, -5, 5, 0); addSandbags(-43, 5, 5, 0);
  addSandbags( 43, -5, 5, 0); addSandbags( 43, 5, 5, 0);
}

/* --- Kit de ruínas (Trimble SketchUp) e peças do mapa RUÍNAS -------------
   Lajes, colunas, entulho e barreiras vêm do SketchUp (ver sketchupMesh.ts);
   carros, postes e fachadas são montados aqui com primitivas mescladas. */
const worldExtras = [];   // peças só visuais (lotes mesclados, vidro, fios, decalques); saem no clearWorld
const glassMeshes = [];   // vitrines inteiras: a bala atravessa e trinca; não cortam a visão dos bots
const KIT_MAT = { rConcrete:'kConcrete', rBreak:'kBreak', rRebar:'kRebar', rRubble:'kRubble', rJersey:'kJersey' };
let seedR = 1;
const srand = () => { seedR = (seedR * 16807) % 2147483647; return (seedR - 1) / 2147483646; };
function addExtra(o){ scene.add(o); worldExtras.push(o); return o; }

/** Prop do kit: um mesh por material; entra no raycast (tiro e visão). A colisão é posta à parte. */
function addKit(asset, x, y, z, o){
  o = o || {};
  const g = new THREE.Group();
  g.position.set(x, y, z);
  g.rotation.set(o.rx || 0, o.ry || 0, o.rz || 0, 'YXZ');
  if (o.s) { if (Array.isArray(o.s)) g.scale.set(o.s[0], o.s[1], o.s[2]); else g.scale.setScalar(o.s); }
  kitByMaterial(asset).forEach(p => {
    const m = new THREE.Mesh(p.geometry, MAT[KIT_MAT[p.mat]]);
    m.castShadow = m.receiveShadow = true;
    g.add(m); worldMeshes.push(m);
  });
  addExtra(g);
  g.updateMatrixWorld(true);
  return g;
}

/** Laje caída: a ponta inteira fica em (x, yTop, z) e a quebrada (com vergalhões) desce
    na direção yaw (0 = +x, π/2 = −z, π = −x, −π/2 = +z) com inclinação `tilt`. */
function addFallenSlab(x, yTop, z, yaw, len, width, thick, tilt){
  return addKit('slab', x, yTop - thick, z, { ry:yaw, rz:-tilt, s:[len/2.438, thick/0.203, width/1.829] });
}

/** Colisão em rampa: degraus de até 0,3 m (sobe andando) de (x0,z0) na altura y0 até (x1,z1) na y1. */
function addRamp(x0, z0, y0, x1, z1, y1, width){
  const alongX = Math.abs(x1 - x0) > Math.abs(z1 - z0);
  const L = alongX ? Math.abs(x1 - x0) : Math.abs(z1 - z0);
  const n = Math.max(2, Math.ceil(Math.abs(y1 - y0) / 0.3));
  for (let i = 0; i < n; i++){
    const t = (i + 0.5) / n, cx = lerp(x0, x1, t), cz = lerp(z0, z1, t);
    const top = lerp(y0, y1, t), bottom = top - 0.6 < 1.9 ? 0 : top - 0.6, seg = L / n + 0.04;
    if (alongX) addCollider(cx, bottom, cz, seg, top - bottom, width);
    else        addCollider(cx, bottom, cz, width, top - bottom, seg);
  }
}

/** Colisão de caixa girada: fatiada ao longo do comprimento para não virar um quadrado enorme. */
function addRotCollider(x, y, z, w, h, d, yaw){
  const c = Math.cos(yaw), s = Math.sin(yaw);
  if (Math.abs(s) < 0.08 || Math.abs(c) < 0.08){
    const sw = Math.abs(c) > 0.5; addCollider(x, y, z, sw ? w : d, h, sw ? d : w); return;
  }
  const n = Math.max(1, Math.round(w / 1.0));
  for (let i = 0; i < n; i++){
    const f = (i + 0.5) / n - 0.5, px = x + c * f * w, pz = z - s * f * w, pw = w / n;
    addCollider(px, y, pz, Math.abs(c) * pw + Math.abs(s) * d, h, Math.abs(s) * pw + Math.abs(c) * d);
  }
}

/** Prop montado com primitivas (caixa/cilindro unitários) e mesclado: um mesh por material. */
const _pm = new THREE.Matrix4(), _pb = new THREE.Matrix4(), _pq = new THREE.Quaternion(), _pe = new THREE.Euler();
function addProp(pieces, x, y, z, yaw, tilt, ray){
  _pb.makeRotationY(yaw || 0);
  if (tilt) _pb.multiply(new THREE.Matrix4().makeRotationZ(tilt));
  _pb.setPosition(x, y, z);
  const byMat = new Map();
  for (const [mat, geo, px,py,pz, sx,sy,sz, rx,ry,rz] of pieces){
    _pe.set(rx || 0, ry || 0, rz || 0); _pq.setFromEuler(_pe);
    _pm.compose(new THREE.Vector3(px,py,pz), _pq, new THREE.Vector3(sx,sy,sz)).premultiply(_pb);
    const g = geo.clone().applyMatrix4(_pm);
    if (!byMat.has(mat)) byMat.set(mat, []);
    byMat.get(mat).push(g);
  }
  byMat.forEach((list, mat) => {
    const m = new THREE.Mesh(merge(list), mat);
    m.castShadow = m.receiveShadow = true;
    m.userData.ownGeo = true;
    scene.add(m);
    if (ray === false) worldExtras.push(m); else worldMeshes.push(m);
  });
}

/** Carcaça de carro queimado: lataria afundada, sem vidros, pneus derretidos. */
function addCarHulk(x, z, yaw, y){
  y = y || 0;
  const B = MAT.burnt, T = MAT.tire, P = [];
  P.push([B, BOX, 0, 0.66, 0, 4.4, 0.62, 1.78]);                      // caixa inferior
  P.push([B, BOX, 1.55, 1.02, 0, 1.25, 0.08, 1.7, 0, 0, -0.16]);      // capô estufado
  P.push([B, BOX, -1.78, 1.0, 0, 0.85, 0.08, 1.66, 0, 0, 0.07]);      // porta-malas
  P.push([B, BOX, -0.3, 1.43, 0, 1.95, 0.08, 1.5, 0.05, 0, 0.03]);    // teto amassado
  [[0.8, 0.72, -0.5], [0.8, -0.72, -0.5], [-1.2, 0.72, 0.35], [-1.2, -0.72, 0.35]].forEach(([px, pz, rz]) =>
    P.push([B, BOX, px, 1.2, pz, 0.08, 0.5, 0.08, 0, 0, rz]));        // colunas A e C
  P.push([T, BOX, -0.35, 1.08, 0, 1.9, 0.3, 1.4]);                    // bancos carbonizados
  [[1.35, 0.8], [1.35, -0.8], [-1.4, 0.8], [-1.4, -0.8]].forEach(([px, pz]) =>
    P.push([T, CYL, px, 0.32, pz, 0.34, 0.24, 0.34, Math.PI/2, 0, 0]));
  addProp(P, x, y, z, yaw);
  addRotCollider(x, y, z, 4.4, 1.46, 1.8, yaw);
}

/** Ônibus queimado: bloqueia a linha longa do bulevar. */
function addBusHulk(x, z, yaw){
  const B = MAT.burnt, T = MAT.tire, P = [];
  P.push([B, BOX, 0, 1.3, 0, 11, 1.7, 2.5]);
  P.push([T, BOX, 0, 2.5, 0, 10.4, 0.8, 2.52]);                       // faixa das janelas, vazada e preta
  P.push([B, BOX, 0.3, 3.0, 0, 10.6, 0.14, 2.4, 0.04, 0, 0.02]);      // teto cedendo
  for (let i = 0; i < 6; i++) P.push([B, BOX, -4.9 + i * 1.95, 2.5, 1.2, 0.14, 0.8, 0.1]);
  for (let i = 0; i < 6; i++) P.push([B, BOX, -4.9 + i * 1.95, 2.5, -1.2, 0.14, 0.8, 0.1]);
  [[3.8, 1.1], [3.8, -1.1], [-3.4, 1.1], [-3.4, -1.1]].forEach(([px, pz]) =>
    P.push([T, CYL, px, 0.45, pz, 0.48, 0.3, 0.48, Math.PI/2, 0, 0]));
  addProp(P, x, 0, z, yaw);
  addRotCollider(x, 0, z, 11, 3.1, 2.5, yaw);
}

/** Poste de madeira com cruzeta; devolve os pontos de fixação dos fios (mundo). */
function addPole(x, z, tilt){
  const P = [[MAT.pole, CYL, 0, 4, 0, 0.15, 8, 0.15],
             [MAT.pole, BOX, 0, 7.6, 0, 0.12, 0.14, 2.3],
             [MAT.metal, CYL, 0.3, 6.6, 0.2, 0.3, 0.9, 0.3]];
  [-1.05, 0, 1.05].forEach(pz => P.push([MAT.tire, CYL, 0, 7.75, pz, 0.05, 0.16, 0.05]));
  addProp(P, x, 0, z, 0, tilt || 0);
  addCollider(x, 0, z, 0.36, 8, 0.36);
  const m = new THREE.Matrix4().makeRotationZ(tilt || 0).setPosition(x, 0, z);
  return [-1.05, 0, 1.05].map(pz => new THREE.Vector3(0, 7.8, pz).applyMatrix4(m));
}

/** Poste de luz do viaduto (braço voltado para o bulevar, em −x). `quebrado` = braço caído. */
function addDeckLamp(x, y, z, quebrado){
  const P = [[MAT.metal, CYL, 0, 2.75, 0, 0.1, 5.5, 0.1]];
  if (quebrado) P.push([MAT.metal, BOX, -0.55, 4.95, 0, 1.4, 0.1, 0.1, 0, 0, 0.95], [MAT.metal, BOX, -1.0, 4.35, 0, 0.55, 0.16, 0.32, 0, 0, 0.95]);
  else          P.push([MAT.metal, BOX, -1.1, 5.4, 0, 2.3, 0.1, 0.1], [MAT.metal, BOX, -2.15, 5.3, 0, 0.6, 0.16, 0.32]);
  addProp(P, x, y, z, 0);
  addCollider(x, y, z, 0.25, 5.5, 0.25);
  return quebrado ? new THREE.Vector3(x - 1.2, y + 4.2, z) : new THREE.Vector3(x - 0.2, y + 5.4, z);
}

/** Barreiras de concreto (New Jersey) do kit, todas numa única InstancedMesh. [x, z, yaw, y] */
function addJerseys(list){
  const geo = kitByMaterial('jersey')[0].geometry;
  const im = new THREE.InstancedMesh(geo, MAT.kJersey, list.length);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), one = new THREE.Vector3(1, 1, 1);
  list.forEach(([x, z, yaw, y], i) => {
    q.setFromAxisAngle(up, yaw); m4.compose(new THREE.Vector3(x, y || 0, z), q, one); im.setMatrixAt(i, m4);
    addRotCollider(x, y || 0, z, 3.05, 0.81, 0.61, yaw);
  });
  im.castShadow = im.receiveShadow = true; im.frustumCulled = false;
  scene.add(im); worldMeshes.push(im);
}

/** Entulho do kit (3 formas) em instâncias. [x, z, escala, forma?]. Pedras de escala ≥ 1,6 ganham colisão. */
const RUBBLE_DIM = [[0.44, 0.155, 0.46], [0.82, 0.265, 0.74], [1.07, 0.333, 1.12]];
function addRubble(list, solid){
  const byType = [[], [], []];
  list.forEach(r => byType[r[3] !== undefined ? r[3] : Math.min(2, Math.floor(srand() * 3))].push(r));
  byType.forEach((arr, k) => {
    if (!arr.length) return;
    const im = new THREE.InstancedMesh(kitByMaterial('rubble' + k)[0].geometry, MAT.kRubble, arr.length);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
    arr.forEach(([x, z, s], i) => {
      e.set((srand() - 0.5) * 0.3, srand() * TAU, (srand() - 0.5) * 0.3); q.setFromEuler(e);
      const sy = s * (0.7 + srand() * 0.6);
      m4.compose(new THREE.Vector3(x, 0, z), q, new THREE.Vector3(s * (0.85 + srand() * 0.3), sy, s * (0.85 + srand() * 0.3)));
      im.setMatrixAt(i, m4);
      if (solid && s >= 1.6){ const [wx, h, wz] = RUBBLE_DIM[k], f = Math.min(wx, wz) * s * 0.7; addCollider(x, 0, z, f, h * sy * 0.85, f); }
    });
    im.castShadow = im.receiveShadow = true; im.frustumCulled = false;
    scene.add(im);
    if (solid) worldMeshes.push(im); else worldExtras.push(im);
  });
}
/** Monte de entulho em volta de um ponto. */
function rubbleMound(x, z, r, n, big){
  const out = [];
  for (let i = 0; i < n; i++){ const a = srand() * TAU, d = Math.sqrt(srand()) * r; out.push([x + Math.cos(a) * d, z + Math.sin(a) * d, (big || 1.8) * (0.5 + srand() * 0.8)]); }
  return out;
}

/** Parede arruinada: trechos de alturas diferentes, topo serrilhado, vãos de passagem. */
function addRuinWall(fixo, de, ate, h, eixo, vaos, mat, esp){
  const t = esp || 0.5, M = mat || MAT.ruin, largVao = 3.6;
  const cortes = (vaos || []).slice().sort((a,b) => a-b), trechos = [];
  let cursor = de;
  for (const v of cortes){ if (v - largVao/2 > cursor) trechos.push([cursor, v - largVao/2]); cursor = v + largVao/2; }
  if (ate > cursor) trechos.push([cursor, ate]);
  for (const [a, b] of trechos){
    let p = a;
    while (b - p > 0.05){
      const seg = Math.min(b - p, 1.4 + srand() * 2.4), mid = p + seg / 2;
      const hh = srand() < 0.18 ? Math.max(1.0, h * 0.3) : h * (0.55 + 0.45 * srand());
      if (eixo === 'x') addBox(mid, 0, fixo, seg, hh, t, M); else addBox(fixo, 0, mid, t, hh, seg, M);
      if (hh > 2 && srand() < 0.45){                              // dente de parede que ainda resiste
        const dw = seg * (0.25 + srand() * 0.3), off = (srand() - 0.5) * (seg - dw), dh = 0.4 + srand() * 1.2;
        if (eixo === 'x') addBox(mid + off, hh, fixo, dw, dh, t, M); else addBox(fixo, hh, mid + off, t, dh, dw, M);
      }
      p += seg;
    }
  }
}
function addRuinRoom(cx, cz, w, d, h, portas, mat){
  const tem = c => (portas || '').includes(c);
  addRuinWall(cz - d/2, cx - w/2, cx + w/2, h, 'x', tem('n') ? [cx] : [], mat);
  addRuinWall(cz + d/2, cx - w/2, cx + w/2, h, 'x', tem('s') ? [cx] : [], mat);
  addRuinWall(cx - w/2, cz - d/2 + 0.25, cz + d/2 - 0.25, h, 'z', tem('w') ? [cz] : [], mat);
  addRuinWall(cx + w/2, cz - d/2 + 0.25, cz + d/2 - 0.25, h, 'z', tem('e') ? [cz] : [], mat);
}

/* Vidro das vitrines (texturas por código, com semente: sai igual a cada partida). */
let glassMats = null;
function getGlassMats(){
  if (glassMats) return glassMats;
  const mk = t => new THREE.MeshStandardMaterial({ map:t.map, alphaMap:t.alphaMap, transparent:true, depthWrite:false,
    side:THREE.DoubleSide, roughness:0.08, metalness:0.2, envMapIntensity:1.1 });
  glassMats = { cracked:[crackedGlass(11), crackedGlass(23), crackedGlass(37)].map(mk), shattered:[shatteredGlass(5), shatteredGlass(9)].map(mk) };
  return glassMats;
}
/** Painel de vidro virado para ±x. Inteiro: colide e trinca com tiro. Estourado: só cacos na moldura. */
function addGlassPane(x, y, z, w, h, mat, inteiro){
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
  m.position.set(x, y + h/2, z); m.rotation.y = Math.PI/2;
  m.userData.ownGeo = true; m.renderOrder = 2;
  addExtra(m);
  if (inteiro){ glassMeshes.push(m); addCollider(x, y, z, 0.12, h, w); }
}

/* Decalques fixos (rajadas de tiro e fuligem) juntados num único mesh por mapa. */
let decalMat = null;
const decalBuf = [];
function wallDecal(cell, x, y, z, nx, ny, nz, size){
  decalBuf.push(decalQuad(cell, new THREE.Vector3(x, y, z), new THREE.Vector3(nx, ny, nz), size, srand() * TAU));
}
function flushDecals(){
  if (!decalBuf.length) return;
  decalMat = decalMat || new THREE.MeshStandardMaterial({ map:wallDecals(), transparent:true, depthWrite:false, roughness:1,
    polygonOffset:true, polygonOffsetFactor:-2, polygonOffsetUnits:-2, envMapIntensity:0.3 });
  const m = new THREE.Mesh(merge(decalBuf.splice(0)), decalMat);
  m.receiveShadow = true; m.userData.ownGeo = true; m.renderOrder = 1;
  addExtra(m);
}

/* Caixas só visuais (janelas escuras, detalhes): mescladas por material, sem colisão nem raycast. */
const visBuf = new Map();
function vbox(x, y, z, w, h, d, mat){
  const g = BOX.clone().applyMatrix4(new THREE.Matrix4().makeScale(w, h, d).setPosition(x, y + h/2, z));
  if (!visBuf.has(mat)) visBuf.set(mat, []);
  visBuf.get(mat).push(g);
}
function flushVisual(){
  visBuf.forEach((list, mat) => { const m = new THREE.Mesh(merge(list), mat); m.userData.ownGeo = true; addExtra(m); });
  visBuf.clear();
}

/** Fachadas em volta do mapa: prédios de alturas diferentes, topo quebrado e janelas vazias. */
function addRuinPerimeter(S){
  const t = 1.4, half = S/2, inner = half - t/2 - 0.03;
  const lado = (fixo, eixo, sinal) => {
    let p = -half;
    while (p < half - 0.05){
      const seg = Math.min(half - p, 5 + srand() * 8), mid = p + seg/2, hh = 7 + srand() * 9;
      if (eixo === 'x') addBox(mid, 0, fixo, seg, hh, t, MAT.ruin); else addBox(fixo, 0, mid, t, hh, seg, MAT.ruin);
      if (srand() < 0.6){
        const dw = seg * (0.2 + srand() * 0.35), off = (srand() - 0.5) * (seg - dw), dh = 1 + srand() * 3;
        if (eixo === 'x') addBox(mid + off, hh, fixo, dw, dh, t, MAT.ruinDark); else addBox(fixo, hh, mid + off, t, dh, dw, MAT.ruinDark);
      }
      // janelas vazias (pretas) na face voltada para dentro, andar por andar
      for (let yy = 3.2; yy + 1.7 < hh - 0.6; yy += 3.1){
        for (let a = p + 1.2; a < p + seg - 1.6; a += 2.6){
          if (srand() < 0.12) continue;
          const f = (inner - 0.05) * sinal;
          if (eixo === 'x') vbox(a + 0.6, yy, f, 1.3, 1.7, 0.1, MAT.tire); else vbox(f, yy, a + 0.6, 0.1, 1.7, 1.3, MAT.tire);
        }
      }
      p += seg;
    }
  };
  lado(-half, 'x', -1); lado(half, 'x', 1); lado(-half, 'z', -1); lado(half, 'z', 1);
}

/* 4. RUÍNAS — cidade devastada (referência de clima: Aftermath, Black Ops 2; layout original).
      Bulevar central com carros queimados e barreiras; viaduto a leste partido nas duas
      pontas (as lajes caídas viram rampas: posição de poder que os dois lados disputam);
      loja de vitrine a oeste com teto desabado; prédio desmoronado a leste com ninho alto. */
function mapaRuinas(){
  seedR = 20260924;
  const S = 90;
  addGround(S, S, MAT.dust);
  addPaved(14, S, 0, 0, MAT.roadCracked);                       // bulevar
  addBox(-9, 0, 0, 4, 0.15, S, MAT.kConcrete);                  // calçadas (sobe andando)
  addBox( 9, 0, 0, 4, 0.15, S, MAT.kConcrete);
  addRuinPerimeter(S);

  // --- LOJA (oeste): vitrine voltada para o bulevar, 7 vãos ---
  const FX = -11, Z0 = -22, Z1 = 10, bay = (Z1 - Z0) / 7, gm = getGlassMats();
  const estados = ['inteiro', 'estourado', 'inteiro', 'porta', 'estourado', 'inteiro', 'estourado'];
  for (let i = 0; i <= 7; i++) addBox(FX, 0, Z0 + i * bay, 0.7, 4.4, 0.7, MAT.ruinDark);   // pilares
  estados.forEach((st, i) => {
    const zc = Z0 + (i + 0.5) * bay, w = bay - 0.7;
    if (st !== 'porta') addBox(FX, 0, zc, 0.5, 0.45, w, MAT.ruinDark);                      // peitoril
    if (st === 'inteiro')   addGlassPane(FX, 0.45, zc, w, 3.1, gm.cracked[i % 3], true);
    if (st === 'estourado') addGlassPane(FX, 0.45, zc, w, 3.1, gm.shattered[i % 2], false);
    if (st !== 'inteiro') wallDecal(1, FX + 0.36, 4.1, zc, 1, 0, 0, 3.2);                   // fuligem sobre o vão
  });
  addBox(FX, 3.55, (Z0 + Z1) / 2, 0.7, 0.85, Z1 - Z0 + 0.7, MAT.ruin);                      // verga da vitrine
  // andar de cima: só a fachada resistiu (janelas vazadas, topo desmoronado)
  addBox(FX, 4.4, (Z0 + Z1) / 2, 0.5, 1.0, Z1 - Z0 + 0.7, MAT.ruin);
  const montante = [2.2, 0.9, 2.2, 2.2, 1.5, 2.2, 2.2, 2.2];
  montante.forEach((h, i) => addBox(FX, 5.4, Z0 + i * bay, 0.5, h, 1.3, MAT.ruin));
  addBox(FX, 7.6, Z0 + 2.5 * bay, 0.5, 1.2, bay + 1.3, MAT.ruin);
  addBox(FX, 7.6, Z0 + 6 * bay, 0.5, 1.2, 2 * bay + 1.3, MAT.ruin);
  addBox(FX, 8.8, Z0 + 5.6 * bay, 0.5, 0.9, 2.2, MAT.ruin); addBox(FX, 8.8, Z0 + 6.7 * bay, 0.5, 0.5, 1.4, MAT.ruin);
  // laterais, fundos e teto (com o buraco do desabamento entre z −9 e −1)
  addWallWithGaps(Z0, -25, FX, 4.4, 'x', [-17], MAT.ruin);
  addWallWithGaps(Z1, -25, FX, 4.4, 'x', [], MAT.ruin);
  addBox(-13.5, 4.4, Z0, 5, 2.6, 0.5, MAT.ruin); addBox(-13.5, 4.4, Z1, 5, 3.4, 0.5, MAT.ruin);
  addWallWithGaps(-25, Z0, Z1, 4.4, 'z', [-14, 4], MAT.ruin);
  addBox(-18, 4.4, -15.6, 14.5, 0.4, 13.3, MAT.ruinDark);
  addBox(-18, 4.4, 4.6, 14.5, 0.4, 11.3, MAT.ruinDark);
  addFallenSlab(-19.5, 4.8, -1.05, Math.PI/2, 6.2, 6, 0.4, 0.95);                           // laje do teto caída
  addCollider(-19.5, 0, -3.5, 6, 2.2, 2.0);
  addRubble(rubbleMound(-19.5, -5.2, 2.6, 9, 1.9), true);
  addKit('column', -23.3, 0, -7.5, { s:[1.8, 1.35, 1.8], ry:0.3 }); addCollider(-23.3, 0, -7.5, 0.85, 2.4, 0.85);
  addKit('column', -13.4, 0, -2.6, { s:[1.8, 1.2, 1.8], ry:1.1 });  addCollider(-13.4, 0, -2.6, 0.85, 2.1, 0.85);
  // balcão, prateleiras (uma tombada) e caixa
  addPaved(13.6, 31.5, -18, -6, MAT.floorTile);                                              // piso de loja, sujo
  addBox(-15.8, 0, -17, 1.0, 1.1, 5.5, MAT.ruinDark);
  addBox(-22.8, 0, -16.5, 0.7, 1.9, 6, MAT.metal);
  addBox(-22.8, 0, 5, 0.7, 1.9, 6, MAT.metal);
  addBox(-18.5, 0, 6.2, 4.5, 0.6, 1.1, MAT.metal, { rotY:0.5 });
  addBox(-14.8, 0, 3.5, 1.0, 1.1, 3.0, MAT.ruinDark);
  wallDecal(1, -18.5, 0.03, -5.5, 0, 1, 0, 5);

  // --- VIADUTO (leste do bulevar): tabuleiro a 4,2 m, partido nas duas pontas ---
  const DX = 12, DW = 7, DZ0 = -30, DZ1 = 6, DY = 4.2;
  addBox(DX, DY - 0.7, (DZ0 + DZ1) / 2, DW, 0.7, DZ1 - DZ0, MAT.kConcrete);
  addPaved(DW - 0.5, DZ1 - DZ0, DX, (DZ0 + DZ1) / 2, MAT.roadCracked).position.y = DY + 0.013;       // pista do viaduto
  [-24, -12, 0].forEach(z => {
    addBox(DX, 0, z, 1.3, DY - 1.2, 1.3, MAT.kConcrete);
    addBox(DX, DY - 1.3, z, 6.2, 0.6, 1.7, MAT.kConcrete);
    wallDecal(0, DX - 0.67, 1.6 + srand(), z + (srand() - 0.5) * 0.6, -1, 0, 0, 1.3);
  });
  const rampa = (zEdge, dir) => {               // dir +1: desce para o sul; −1: para o norte
    const yaw = dir > 0 ? -Math.PI/2 : Math.PI/2;
    addFallenSlab(DX - 1.78, DY, zEdge, yaw + 0.03 * dir, 12.2, 3.5, 0.55, 0.31);
    addFallenSlab(DX + 1.78, DY, zEdge, yaw - 0.05 * dir, 11.6, 3.5, 0.55, 0.335);
    addRamp(DX, zEdge + dir * 0.2, DY, DX, zEdge + dir * 12.4, 0.2, DW);
    addRubble(rubbleMound(DX, zEdge + dir * 12.4, 3.2, 10, 1.8), true);
  };
  rampa(DZ1, +1); rampa(DZ0, -1);
  addJerseys([
    // parapeito do viaduto (com falhas) e uma barreira arrastada para o meio
    [9.0, -28, Math.PI/2, DY], [9.0, -18, Math.PI/2, DY], [9.0, -8, Math.PI/2, DY], [9.0, 2, Math.PI/2, DY],
    [15.0, -24, Math.PI/2, DY], [15.0, -16, Math.PI/2, DY], [15.0, -3, Math.PI/2, DY], [15.0, 3.2, Math.PI/2, DY],
    [11.4, -21, 0.4, DY],
    // bulevar: posto de controle perto do spawn sul e cobertura escalonada até o norte
    [-5.3, 30, 0], [1.6, 30, 0.08], [5.2, 29.4, -0.3], [-3.2, 12, 0.25], [4.2, 8, -0.2],
    [3, -22, 0], [-2.5, -33, 0.35], [4.5, -38, 1.4], [-4.6, -5, 0.1],
    // oeste e leste
    [-34, -12, 0.2], [-38, -15.5, 1.3], [-14.5, -30, 1.2], [-15, 34, 0.2],
    [19.5, 8, 1.2], [36.5, 18, 0.1], [24, 38.5, 0]
  ]);
  addCarHulk(12.6, -11.5, Math.PI/2 + 0.35, DY);
  const lamp1 = addDeckLamp(8.85, DY, -23), lampQ = addDeckLamp(8.85, DY, -13, true), lamp3 = addDeckLamp(8.85, DY, -3);
  wallDecal(1, 12.4, DY + 0.02, -11.5, 0, 1, 0, 4);

  // --- BULEVAR: carros queimados, ônibus, postes e fios ---
  addBusHulk(-1.5, -13, Math.PI/2 + 0.12);
  wallDecal(1, -1.5, 0.03, -13, 0, 1, 0, 9);
  [[-3.2, 21, Math.PI/2 + 0.3], [3.8, -3, Math.PI/2 - 0.5], [-4.4, -26, Math.PI/2 + 2.6],
   [21.5, 25, 0.8], [21, -33, -0.3], [-35, 5, 1.4], [-18, 22, 0.3]].forEach(([x, z, yaw]) => {
    addCarHulk(x, z, yaw); wallDecal(1, x, 0.03, z, 0, 1, 0, 5.2);
  });
  const fios = [], polos = [];
  [-38, -24, -10, 4, 18, 32].forEach(z => polos.push(addPole(-9.6, z, z === 18 ? -0.2 : 0)));
  for (let i = 0; i < polos.length - 1; i++){
    if (i === 3) continue;                                         // vão arrebentado (poste torto em z 18)
    for (let k = 0; k < 3; k++) fios.push(cable(polos[i][k], polos[i + 1][k], 0.5 + k * 0.15));
  }
  // fios atravessando o bulevar até os postes do viaduto
  [[1, lamp1], [2, lampQ], [3, lamp3]].forEach(([i, l]) => {
    fios.push(cable(polos[i][0], l, 1.3)); fios.push(cable(polos[i][2], l.clone().add(new THREE.Vector3(0, -0.2, 0.4)), 1.5));
  });
  // fio arrebentado caído na pista: solta faísca
  fios.push(droopingCable(polos[4][0], new THREE.Vector3(-4, 0.03, 14.5)));
  fios.push(droopingCable(polos[3][2], new THREE.Vector3(-6.5, 0.03, 9.5)));
  ambientEmitters.push({ pos:new THREE.Vector3(-4, 0.06, 14.5), type:'sparks', acc:0.8, map:'ruinas', sound:true });
  ambientEmitters.push({ pos:new THREE.Vector3(-6.5, 0.06, 9.5), type:'sparks', acc:2.4, map:'ruinas', sound:true });
  ambientEmitters.push({ pos:lampQ.clone(), type:'sparks', acc:1.6, map:'ruinas', min:0.9, max:2.6 });
  const cabos = new THREE.Mesh(merge(fios), new THREE.MeshStandardMaterial({ color:0x151515, roughness:0.6 }));
  cabos.userData.ownGeo = true; addExtra(cabos);

  // --- OESTE: beco dos fundos, praças norte e sul, duas cascas de prédio ---
  addRuinRoom(-34, -36.5, 12, 9, 4.2, 'es');
  addRuinRoom(-34, 32.5, 12, 9, 3.8, 'en');
  addBox(-27.3, 0, -1.5, 1.2, 1.25, 1.9, MAT.contC); addBox(-27.3, 0, 13.5, 1.2, 1.25, 1.9, MAT.contC);   // caçambas
  addFallenSlab(-25.4, 3.6, -8, Math.PI, 4.6, 3.2, 0.35, 0.95);                                         // laje apoiada no muro
  addCollider(-26.8, 0, -8, 2.6, 1.4, 3.2);
  addKit('slab', -21, 0, -31, { ry:0.35, rz:0.12, s:[6/2.438, 0.45/0.203, 3.6/1.829] });               // laje caída na praça
  addRotCollider(-18.2, 0, -32, 6, 0.95, 3.4, 0.35);
  addRubble(rubbleMound(-15.3, -33.2, 1.6, 5, 1.6).concat(rubbleMound(-36, -2, 3, 8, 2.0), rubbleMound(-18, 16, 2.4, 6, 1.8),
            rubbleMound(-38, 18, 2.5, 6, 1.9)), true);

  // --- LESTE: prédio desmoronado (lajes empilhadas), cratera, duas cascas ---
  [[22, -21, 1.9], [38, -21, 1.55], [22, -4, 1.9], [38, -4, 1.55], [30, -21, 1.3]].forEach(([x, z, sy], i) => {
    addKit('column', x, 0, z, { s:[2.4, sy, 2.4], ry:i * 0.7 }); addCollider(x, 0, z, 1.1, 1.727 * sy, 1.1);
  });
  addKit('slab', 23.2, 0.55, -14.1, { rz:0.03, s:[10/2.438, 0.45/0.203, 4/1.829] });                  // 1º piso, caído inteiro
  addKit('slab', 23.0, 0.5, -10.0, { ry:0.04, rz:0.02, s:[9.4/2.438, 0.45/0.203, 4/1.829] });
  addCollider(28, 0, -12.1, 10, 1.0, 8.2);
  addCollider(22.3, 0, -12, 1.4, 0.5, 5);                                                              // degrau de entulho
  addKit('column', 38.6, 0, -12, { s:[2.4, 1.75, 2.4], ry:0.4 }); addCollider(38.6, 0, -12, 1.1, 3.0, 1.1);
  addFallenSlab(38.8, 4.2, -12, Math.PI, 11.8, 4.4, 0.45, 0.235);                                     // 2º piso inclinado: ninho alto
  addRamp(27.2, -12, 1.25, 38.8, -12, 4.2, 4.4);
  addRubble(rubbleMound(22, -12, 2.2, 8, 1.5).concat(rubbleMound(33, -7.5, 3, 7, 1.7), rubbleMound(33, -16.5, 3, 7, 1.7)), true);
  addRuinWall(-22.5, 19, 41, 6.5, 'x', [30]);                                                          // fachada que sobrou
  addRuinWall(-1.5, 19, 28, 3.0, 'x', []);
  wallDecal(1, 29, 0.03, 12, 0, 1, 0, 8);                                                              // cratera
  const anel = []; for (let i = 0; i < 11; i++){ const a = i / 11 * TAU; anel.push([29 + Math.cos(a) * 3.4, 12 + Math.sin(a) * 3.4, 1.1 + srand() * 0.8]); }
  addRubble(anel, true);
  addRuinRoom(33, -37.5, 12, 9, 4.6, 'sw');
  addRuinRoom(33, 33, 12, 9, 3.6, 'wn');

  // rajadas de tiro nas fachadas
  for (let i = 0; i <= 7; i++) if (srand() < 0.6) wallDecal(0, FX + 0.37, 1.0 + srand() * 2.2, Z0 + i * bay, 1, 0, 0, 0.62);
  for (let i = 0; i < 6; i++) wallDecal(0, FX + 0.37, 3.95, Z0 + 2 + srand() * (Z1 - Z0 - 4), 1, 0, 0, 0.8);
  for (let i = 0; i < 10; i++){ const sx = i % 2 ? 1 : -1; wallDecal(0, sx * 44.27, 1.5 + srand() * 3, -40 + srand() * 80, -sx, 0, 0, 1.4); }
  // entulho miúdo espalhado (só visual)
  const miudo = []; for (let i = 0; i < 140; i++) miudo.push([(srand() - 0.5) * 86, (srand() - 0.5) * 86, 0.35 + srand() * 0.7]);
  addRubble(miudo, false);

  flushVisual();
  flushDecals();
}

/* --- catálogo de mapas --------------------------------------------------- */
const MAPS = [
  {
    id:'ruinas', name:'RUÍNAS', build: mapaRuinas, extras: ruinasExtras,
    desc:'Cidade devastada. Viaduto partido no meio, vitrines estilhaçadas a oeste, prédio desabado a leste.',
    player:{ x:0, z:40, yaw:0 }, mm:46, minDist:20,
    sky:0x8f7f66, fog:[35,210],
    fires:[[29,12,0.2,1.8],[-3.2,21,1.0,1.5]],           // cratera e carro [x, z, y, tamanho]
    emitters:[
      { type:'dust', pos:[0,0.4,0], rate:0.5 }, { type:'dust', pos:[-20,0.4,-30], rate:0.4 }, { type:'dust', pos:[25,0.4,22], rate:0.4 },
      { type:'dust', pos:[30,0.4,-12], rate:0.4 }, { type:'dust', pos:[-32,0.4,18], rate:0.4 }, { type:'dust', pos:[12,0.4,-36], rate:0.4 },
      { type:'smoke', pos:[-19.5,1.0,-5.5], rate:2.5 }, { type:'smoke', pos:[31,2.6,-12], rate:1.8 }
    ],
    spawns:[[0,-42],[-7,-40],[-18,-40],[-34,-26],[-40,-8],[20,-40],[42,-26],[42,-2],[25,5],
            [-30,42],[30,42],[-42,24],[40,22]]
  },
  {
    id:'ferrovelho', name:'FERRO-VELHO', build: mapaFerroVelho,
    desc:'Pátio industrial. Corredor de contêineres a oeste, armazém no centro.',
    player:{ x:0, z:36, yaw:0 }, mm:46, minDist:20,
    sky:0x9dafbd, fog:[55,165],
    spawns:[[8,-42],[-20,-40],[20,-40],[-38,-34],[38,-34],[-38,-8],[38,-8],
            [-38,26],[38,26],[-12,-34],[12,-34],[28,34],[-28,34]]
  },
  {
    id:'torre', name:'TORRE', build: mapaTorre,
    desc:'Pequeno e frenético. A torre central domina, mas fica exposta.',
    player:{ x:0, z:20, yaw:0 }, mm:30, minDist:14,
    sky:0xc2b394, fog:[35,110],
    spawns:[[-22,-22],[22,-22],[-22,22],[22,22],[0,-24],[-24,0],[24,0],
            [-14,-24],[14,-24],[24,-14],[24,14]]
  },
  {
    id:'saguao', name:'SAGUÃO', build: mapaSaguao,
    desc:'Terminal coberto. Salão longo para tiro à distância, salas para o curto.',
    player:{ x:-41, z:0, yaw:-Math.PI/2 }, mm:44, minDist:18,
    sky:0x6f7681, fog:[40,130],
    spawns:[[41,0],[41,-17],[41,17],[30,-30],[30,30],[0,-30],[0,30],
            [-30,-30],[-30,30],[16,-20],[16,20],[41,-30],[41,30]]
  }
];
const MAPDEF = () => MAPS.find(m => m.id === settings.map) || MAPS[0];
let mapaCarregado = null;   // qual mapa está montado na cena agora

/** Remove o mapa atual da cena antes de montar outro. */
function clearWorld(){
  for (const m of worldMeshes){
    scene.remove(m);
    if (m.userData.ownGeo && m.geometry) m.geometry.dispose();
    if (m.isInstancedMesh) m.dispose();
  }
  worldMeshes.length = 0;
  for (const o of worldExtras){
    scene.remove(o);
    if (o.userData.ownGeo && o.geometry) o.geometry.dispose();
    if (o.isInstancedMesh) o.dispose();
  }
  worldExtras.length = 0; glassMeshes.length = 0;
  clearRuinsFX();
  // emissores do mapa anterior (e do próprio, ao remontar) saem; fumaça de granada fica
  for (let i = ambientEmitters.length-1; i>=0; i--) if (ambientEmitters[i].type !== 'smokeG') ambientEmitters.splice(i,1);
  colliders.length  = 0;
  spawnPoints.length = 0;
}

/** Junta as caixas estáticas do cenário num mesh por material (de centenas para poucas draw calls).
    As caixas originais saem da cena mas continuam em worldMeshes como alvos de raycast. */
function mergeStaticBoxes(){
  const grupos = new Map();
  for (const m of worldMeshes){
    if (!m.isMesh || m.geometry !== BOX || m.parent !== scene) continue;
    const k = m.material.uuid + (m.castShadow ? 's' : 'n');
    if (!grupos.has(k)) grupos.set(k, { mat:m.material, cast:m.castShadow, list:[] });
    grupos.get(k).list.push(m);
  }
  grupos.forEach(g => {
    if (g.list.length < 2) return;
    const geos = g.list.map(m => { m.updateMatrixWorld(true); return BOX.clone().applyMatrix4(m.matrixWorld); });
    const mesh = new THREE.Mesh(merge(geos), g.mat);
    mesh.castShadow = g.cast; mesh.receiveShadow = true; mesh.userData.ownGeo = true;
    scene.add(mesh); worldExtras.push(mesh);
    g.list.forEach(m => scene.remove(m));
  });
}

function loadMap(id){
  settings.map = MAPS.some(m => m.id === id) ? id : MAPS[0].id;
  const def = MAPDEF();
  clearWorld();
  def.build();
  mergeStaticBoxes();
  def.spawns.forEach(p => spawnPoints.push(new THREE.Vector3(p[0], 0, p[1])));
  MM_RANGE = def.mm;
  scene.background.setHex(def.sky);
  scene.fog.color.setHex(def.sky);
  scene.fog.near = def.fog[0];
  scene.fog.far  = def.fog[1];
  applyAtmos(def.id);
  buildLandmark(ATMOS[def.id].mark);
  setupAmbientFX(def);
  if (def.extras) def.extras();
  mapaCarregado = def.id;
}

/* ---------------------------------------------------------------
   6. Armas — modeladas a partir de armas reais
   --------------------------------------------------------------- */
const WEAPONS = [
  {
    id:'m4a1', name:'M4A1', cal:'5,56×45mm', mode:'AUTOMÁTICO', slot:'pri', chamber:true, sprintOut:0.22,
    damage:26, headMult:2.5, rpm:720, auto:true,
    mag:30, magMax:30, reserve:240, reserveMax:240,
    spread:0.0135, adsSpread:0.0035, moveSpreadMul:2.4,
    recoilV:0.0135, recoilH:0.0052, kick:0.036,
    reload:2.05, range:180, pellets:1, adsFov:56,
    sound:{ gain:0.40, cut:5200, low:160, dur:0.20, rate:1.0 },
    switchTime:0.45, realLen:0.84, vmLen:0.70, hip:[0.135,-0.168,-0.60], adsDot:0.21
  },
  {
    id:'mp7', name:'MP7A1', cal:'4,6×30mm', mode:'AUTOMÁTICO', slot:'pri', chamber:true, sprintOut:0.16,
    damage:18, headMult:2.5, rpm:1000, auto:true,
    mag:40, magMax:40, reserve:320, reserveMax:320,
    spread:0.021, adsSpread:0.0075, moveSpreadMul:2.0,
    recoilV:0.0092, recoilH:0.0060, kick:0.026,
    reload:1.75, range:120, pellets:1, adsFov:62,
    sound:{ gain:0.32, cut:6200, low:190, dur:0.15, rate:1.25 },
    switchTime:0.36, realLen:0.64, vmLen:0.500
  },
  {
    id:'m870', name:'REMINGTON 870', cal:'Cal. 12', mode:'BOMBA', slot:'pri', chamber:false, sprintOut:0.24,
    damage:17, headMult:1.8, rpm:78, auto:false,
    mag:7, magMax:7, reserve:56, reserveMax:56,
    spread:0.055, adsSpread:0.036, moveSpreadMul:1.25,
    recoilV:0.042, recoilH:0.012, kick:0.10,
    reload:2.9, range:42, pellets:9, adsFov:66,
    sound:{ gain:0.58, cut:4200, low:110, dur:0.34, rate:0.78 },
    switchTime:0.55, realLen:1.06, vmLen:0.618
  },
  {
    // Ferrolho: cadência baixa, pente pequeno, mas derruba tropa comum
    // com um tiro no tronco. Só é preciso de luneta e parado.
    id:'awm', name:'AWM', cal:'.338 Lapua', mode:'FERROLHO', slot:'pri', chamber:true, sprintOut:0.34,
    damage:120, headMult:2.5, rpm:48, auto:false,
    mag:5, magMax:5, reserve:40, reserveMax:40,
    spread:0.062, adsSpread:0.0004, moveSpreadMul:3.4,
    recoilV:0.072, recoilH:0.009, kick:0.155,
    reload:3.4, range:320, pellets:1, adsFov:11,
    sound:{ gain:0.66, cut:3600, low:92, dur:0.46, rate:0.66 },
    switchTime:0.72, realLen:1.18, vmLen:0.652,
    scope:true                      // usa a luneta em tela cheia
  },
  // --- secundárias: pistolas semiautomáticas, troca rápida ---
  {
    id:'m9', name:'M9', cal:'9×19mm', mode:'SEMIAUTOMÁTICA', slot:'sec', chamber:true, sprintOut:0.10,
    damage:30, headMult:2.2, rpm:420, auto:false,
    mag:15, magMax:15, reserve:60, reserveMax:60,
    spread:0.020, adsSpread:0.006, moveSpreadMul:1.6,
    recoilV:0.016, recoilH:0.006, kick:0.032,
    reload:1.45, range:60, pellets:1, adsFov:64,
    sound:{ gain:0.34, cut:5600, low:200, dur:0.14, rate:1.15 },
    switchTime:0.24, realLen:0.217, vmLen:0.30
  },
  {
    id:'deagle', name:'DESERT EAGLE', cal:'.50 AE', mode:'SEMIAUTOMÁTICA', slot:'sec', chamber:true, sprintOut:0.12,
    damage:58, headMult:2.3, rpm:170, auto:false,
    mag:7, magMax:7, reserve:35, reserveMax:35,
    spread:0.028, adsSpread:0.008, moveSpreadMul:1.9,
    recoilV:0.045, recoilH:0.012, kick:0.075,
    reload:1.9, range:80, pellets:1, adsFov:60,
    sound:{ gain:0.55, cut:3900, low:120, dur:0.30, rate:0.85 },
    switchTime:0.32, realLen:0.27, vmLen:0.34
  }
];
// cópia de trabalho (munição muda durante a partida)
let weapons = [];
let curW = 0, prevW = 1;

function resetWeapons(){
  const c = activeClass();
  weapons = [[c.pri, c.priAtt], [c.sec, c.secAtt]].filter(([id]) => WEAPONS.some(w => w.id === id))
    .map(([id, att]) => moddedWeapon(id, att, c.perks));
  player.speedMul = c.perks.includes('leveza') ? 1.12 : 1;
  curW = 0; prevW = 1;
  applyCosmetics();
}

/* --- Geometria das armas -----------------------------------------------
   Um único construtor serve tanto ao modelo em primeira pessoa quanto à arma
   que o inimigo carrega. As peças são montadas em metros aproximados (cano
   apontando para -Z) e depois normalizadas para o comprimento desejado.
   Silhuetas baseadas nas armas reais: carregador curvo na AKM, tubo de
   engatilhamento da MP5, tambor e bipé da RPK, coronha vazada da SVD.
   ---------------------------------------------------------------------- */
// boca do cano de cada arma (z, y em coordenadas cruas), para o supressor
const MUZZLE = { m4a1:[-0.838,0.0254], mp7:[-0.30,0.005], m870:[-0.55,0.018], awm:[-0.745,0.010], m9:[-0.185,0.030], deagle:[-0.22,0.030] };
// altura das mãos (punho, guarda-mão) quando difere do padrão
const HAND_Y = { m4a1:[-0.064, -0.02] };
// posição do pente estendido (z, y) por arma
const MAG_POS = { m4a1:[-0.42, -0.215] };
const HAND_Z = {           // onde ficam as mãos em cada arma (coordenadas cruas)
  m4a1:[-0.279,-0.533], mp7:[0.03,-0.16], m870:[0.10,-0.26], awm:[0.14,-0.30], m9:[0.02,0.03], deagle:[0.02,0.03]
};

/* Mira holográfica: base, laterais, capuz, vidro e ponto vermelho.
   O ponto recebe userData.dot para o ADS alinhar o olho a ele. */
const HOLO_GLASS = new THREE.MeshBasicMaterial({ color:0x9fc4d0, transparent:true, opacity:0.16, depthWrite:false });
const HOLO_DOT   = new THREE.MeshBasicMaterial({ color:0xff2a1a });
function holo(B, y, z){
  B(0.050,0.012,0.075, MAT.gBlack, 0, y,        z);
  B(0.006,0.052,0.070, MAT.gBlack, 0.024, y+0.032, z);
  B(0.006,0.052,0.070, MAT.gBlack,-0.024, y+0.032, z);
  B(0.054,0.008,0.070, MAT.gBlack, 0, y+0.060,  z);
  B(0.042,0.044,0.002, HOLO_GLASS, 0, y+0.034, z-0.02);
  const d = B(0.006,0.006,0.001, HOLO_DOT, 0, y+0.034, z-0.021);
  d.userData.dot = true;
}
function buildWeaponParts(id, g){
  // caixa
  const B = (w,h,d, mat, x,y,z, rx,rz) => {
    const m = new THREE.Mesh(BOX, mat);
    m.scale.set(w,h,d); m.position.set(x,y,z);
    if (rx) m.rotation.x = rx;
    if (rz) m.rotation.z = rz;
    g.add(m); return m;
  };
  // cilindro deitado no eixo Z (cano, luneta); rz=true deita no eixo X (tambor)
  const C = (r, len, mat, x,y,z, sideways) => {
    const m = new THREE.Mesh(CYL, mat);
    m.scale.set(r, len, r); m.position.set(x,y,z);
    if (sideways) m.rotation.z = Math.PI/2; else m.rotation.x = Math.PI/2;
    g.add(m); return m;
  };
  const M = MAT;

  switch (id){

    case 'm4a1': {                                  // carabina M4A1 — modelada no Trimble SketchUp
      for (const pt of m4a1Parts()){
        const mat = pt.mat === 'gGlass' ? HOLO_GLASS : (pt.mat === 'dot' ? HOLO_DOT : M[pt.mat]);
        const m = new THREE.Mesh(pt.geometry, mat);
        m.name = pt.name;
        if (pt.mat === 'dot') m.userData.dot = true;          // ponto da mira holográfica: o ADS alinha por ele
        g.add(m);
      }
      break;
    }

    case 'mp7':                                     // submetralhadora MP7A1
      B(0.050,0.070,0.24, M.gBlack, 0, 0.000,-0.04);
      C(0.014,0.10, M.gSteel, 0, 0.005,-0.21);            // cano
      C(0.011,0.04, M.gBlack, 0, 0.005,-0.28);
      B(0.030,0.018,0.22, M.gSteel, 0, 0.045,-0.06);      // trilho
      holo(B, 0.054, -0.04);                               // mira reflex
      B(0.042,0.100,0.050, M.gBlack, 0,-0.060, 0.02);     // punho (aloja o pente)
      B(0.028,0.130,0.045, M.gBlack, 0,-0.085, 0.02);
      B(0.030,0.090,0.030, M.gBlack, 0,-0.060,-0.16);     // punho vertical
      B(0.045,0.050,0.14, M.gBlack, 0, 0.010, 0.16);      // coronha
      break;

    case 'm9':                                      // pistola Beretta M9
    case 'deagle': {                                // Desert Eagle .50 AE
      const L = id === 'deagle' ? 1.2 : 1, sl = id === 'deagle' ? M.gSteel : M.gBlack;
      B(0.030*L,0.034*L,0.20*L, sl,      0, 0.030,-0.06);     // ferrolho
      B(0.028*L,0.020*L,0.17*L, M.gBlack, 0, 0.006,-0.05);    // armação
      C(0.008,0.03, M.gSteel, 0, 0.030,-0.17*L);             // boca do cano
      B(0.030*L,0.105*L,0.045*L, M.gPoly, 0,-0.050, 0.02, 0.22); // punho
      B(0.006,0.028,0.035, M.gBlack, 0,-0.012,-0.02);         // guarda-mato
      B(0.012,0.010,0.010, M.gBlack, 0, 0.052, 0.03);         // alça de mira
      const fs = B(0.005,0.010,0.006, HOLO_DOT, 0, 0.052,-0.15*L); // massa com ponto
      fs.userData.dot = true;
      break;
    }

    case 'm870':                                    // espingarda Remington 870
      B(0.050,0.075,0.20, M.gSteel, 0, 0.000,-0.02);      // caixa
      C(0.013,0.42, M.gBlack, 0, 0.018,-0.34);            // cano
      C(0.012,0.36, M.gSteel, 0,-0.018,-0.31);            // tubo do carregador
      B(0.055,0.055,0.14, M.gWood,  0,-0.018,-0.24);      // bomba
      B(0.010,0.012,0.012, M.gSteel, 0, 0.036,-0.54);     // ponto de mira
      B(0.045,0.070,0.12, M.gWood,  0,-0.045, 0.12, 0.25);// colo
      B(0.050,0.100,0.22, M.gWood,  0,-0.020, 0.24);      // coronha
      B(0.052,0.115,0.02, M.gBlack, 0,-0.030, 0.35);      // soleira
      break;

    case 'awm':                                     // fuzil de precisão AWM
      B(0.055,0.075,0.30, M.gSteel, 0, 0.000, 0.00);
      C(0.017,0.52, M.gBlack, 0, 0.010,-0.42);            // cano pesado
      C(0.024,0.07, M.gBlack, 0, 0.010,-0.71);            // freio de boca
      B(0.050,0.050,0.30, M.gPoly,  0,-0.020,-0.30);      // chassi
      C(0.022,0.30, M.gScope, 0, 0.086,-0.06);            // luneta
      C(0.030,0.07, M.gScope, 0, 0.086,-0.20);            // objetiva
      C(0.027,0.05, M.gScope, 0, 0.086, 0.08);            // ocular
      C(0.026,0.012, M.gGlass, 0, 0.086,-0.235);          // lente
      B(0.030,0.055,0.022, M.gBlack, 0, 0.058,-0.11);     // anéis
      B(0.030,0.055,0.022, M.gBlack, 0, 0.058, 0.02);
      B(0.055,0.014,0.014, M.gSteel, 0.045, 0.020, 0.06); // ferrolho
      B(0.030,0.090,0.070, M.gBlack, 0,-0.075,-0.04);     // carregador
      B(0.045,0.110,0.060, M.gPoly,  0,-0.075, 0.14, 0.20);// punho
      B(0.050,0.090,0.26, M.gPoly,  0,-0.010, 0.26);      // coronha
      B(0.045,0.030,0.14, M.gPoly,  0, 0.050, 0.22);      // apoio de face
      B(0.012,0.110,0.012, M.gBlack, -0.035,-0.075,-0.50, 0, 0.35); // bipé
      B(0.012,0.110,0.012, M.gBlack,  0.035,-0.075,-0.50, 0,-0.35);
      break;

    case 'akm':                                     // fuzil AKM (soldado)
      B(0.050,0.085,0.26, M.gSteel, 0, 0.000,-0.02);
      B(0.056,0.060,0.20, M.gWood,  0, 0.000,-0.25);      // guarda-mão de madeira
      B(0.030,0.030,0.20, M.gSteel, 0, 0.045,-0.25);      // tubo de gás
      C(0.012,0.20, M.gSteel, 0, 0.000,-0.44);
      C(0.019,0.06, M.gBlack, 0, 0.000,-0.56);            // quebra-chamas inclinado
      B(0.025,0.050,0.030, M.gSteel, 0, 0.045,-0.50);
      // carregador curvo: a assinatura do AK, feita com três seções giradas
      B(0.028,0.080,0.060, M.gWoodL, 0,-0.075,-0.060, 0.10);
      B(0.028,0.070,0.055, M.gWoodL, 0,-0.135,-0.085, 0.35);
      B(0.028,0.050,0.050, M.gWoodL, 0,-0.185,-0.130, 0.60);
      B(0.040,0.100,0.050, M.gWood,  0,-0.080, 0.06, 0.32);
      B(0.050,0.080,0.24, M.gWood,  0,-0.010, 0.22);
      break;

    case 'mp5':                                     // submetralhadora MP5A3 (batedor)
      B(0.048,0.070,0.26, M.gBlack, 0, 0.000,-0.04);
      B(0.050,0.055,0.16, M.gBlack, 0,-0.005,-0.25);      // guarda-mão
      C(0.012,0.10, M.gSteel, 0, 0.005,-0.36);
      C(0.013,0.22, M.gBlack, -0.028, 0.040,-0.22);       // tubo de engatilhamento
      C(0.022,0.05, M.gBlack, 0, 0.055, 0.05);            // alça tambor
      C(0.022,0.03, M.gBlack, 0, 0.050,-0.33);            // massa anelar
      B(0.026,0.160,0.045, M.gBlack, 0,-0.110,-0.10, 0.06);
      B(0.040,0.100,0.050, M.gBlack, 0,-0.070, 0.04, 0.30);
      B(0.012,0.012,0.18, M.gSteel, -0.022, 0.000, 0.16); // hastes da coronha
      B(0.012,0.012,0.18, M.gSteel,  0.022, 0.000, 0.16);
      B(0.045,0.055,0.04, M.gBlack, 0, 0.000, 0.26);
      break;

    case 'rpk':                                     // metralhadora RPK (blindado)
      B(0.055,0.090,0.28, M.gSteel, 0, 0.000,-0.02);
      C(0.014,0.42, M.gSteel, 0, 0.000,-0.50);            // cano longo e pesado
      B(0.060,0.065,0.22, M.gWood,  0, 0.000,-0.26);
      B(0.028,0.055,0.030, M.gSteel, 0, 0.050,-0.62);
      C(0.085,0.050, M.gBlack, 0,-0.115,-0.05, true);     // tambor
      B(0.014,0.150,0.014, M.gBlack, -0.030,-0.090,-0.55, 0, 0.40); // bipé
      B(0.014,0.150,0.014, M.gBlack,  0.030,-0.090,-0.55, 0,-0.40);
      B(0.042,0.100,0.050, M.gWood,  0,-0.080, 0.08, 0.32);
      B(0.052,0.090,0.26, M.gWood,  0,-0.010, 0.24);
      break;

    case 'svd':                                     // fuzil SVD Dragunov (atirador)
      B(0.050,0.080,0.30, M.gSteel, 0, 0.000, 0.00);
      C(0.012,0.52, M.gSteel, 0, 0.000,-0.46);            // cano muito longo
      C(0.018,0.06, M.gBlack, 0, 0.000,-0.75);
      B(0.055,0.060,0.26, M.gWood,  0, 0.000,-0.30);
      C(0.021,0.26, M.gScope, 0, 0.086,-0.04);            // luneta PSO-1
      C(0.028,0.06, M.gScope, 0, 0.086,-0.19);
      C(0.024,0.012, M.gGlass, 0, 0.086,-0.223);
      B(0.030,0.060,0.050, M.gBlack, -0.020, 0.050, 0.02);// suporte lateral
      B(0.026,0.110,0.060, M.gBlack, 0,-0.090,-0.06, 0.18);
      // coronha vazada (thumbhole)
      B(0.045,0.070,0.14, M.gWood, 0,-0.050, 0.16, 0.10);
      B(0.045,0.030,0.22, M.gWood, 0, 0.020, 0.24);
      B(0.045,0.030,0.16, M.gWood, 0,-0.080, 0.26);
      B(0.050,0.110,0.03, M.gWood, 0,-0.030, 0.36);
      B(0.040,0.025,0.12, M.gBlack, 0, 0.048, 0.26);      // apoio de face
      break;
  }
  return g;
}

/* Centraliza na origem e escala para o comprimento pedido (eixo Z). */
function normalizeGun(g, targetLen){
  g.updateMatrixWorld(true);
  const box  = new THREE.Box3().setFromObject(g);
  const cen  = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  g.children.forEach(m => m.position.sub(cen));
  g.userData.cen = cen.clone();
  g.scale.setScalar(targetLen / size.z);
  g.userData.len = targetLen;
  return g;
}

/* Modelo em primeira pessoa: arma + mãos, normalizado para caber na tela. */
function buildGunModel(w){
  const g = new THREE.Group();
  buildWeaponParts(w.id, g);

  const hz = HAND_Z[w.id] || [0.06,-0.26];
  const h1 = new THREE.Mesh(BOX, MAT.hands);      // mão do gatilho
  const hs = w.slot === 'sec' ? 0.62 : 1;           // pistola: mãos proporcionais ao tamanho da arma
  h1.scale.set(0.055*hs,0.075*hs,0.085*hs);
  const hy = HAND_Y[w.id];
  h1.position.set(0.005, hy ? hy[0] : -0.075, hz[0]);
  g.add(h1);
  const h2 = new THREE.Mesh(BOX, MAT.hands);      // mão de apoio
  h2.scale.set(0.055*hs,0.060*hs,0.095*hs);
  h2.position.set(0.0, w.slot === 'sec' ? -0.07 : (hy ? hy[1] : -0.048), hz[1]);
  g.add(h2);


  g.traverse(o => { if (o.isMesh){ o.castShadow = false; o.receiveShadow = false; } });
  const n = normalizeGun(g, w.vmLen);
  // manga do uniforme: entra depois da normalização para não mudar o tamanho da arma
  if (w.slot !== 'sec'){
    const sv = new THREE.Mesh(BOX, MAT.sleeve);
    sv.scale.set(0.058,0.066,0.17);
    sv.position.copy(h1.position).add(new THREE.Vector3(0.018,-0.05,0.11));
    sv.rotation.x = -0.55;                        // antebraço desce em direção ao corpo, fora da linha de visada
    n.add(sv);
  }
  // acessórios (Pick 10): criados já na escala crua, ligados/desligados por classe
  const mz = MUZZLE[w.id], c0 = n.userData.cen, pistol = w.slot === 'sec';
  n.userData.att = {};
  if (mz){
    const len = pistol ? 0.10 : 0.16, rad = pistol ? 0.016 : 0.021;
    const sup = new THREE.Mesh(CYL, MAT.gBlack);
    sup.scale.set(rad, len, rad); sup.rotation.x = Math.PI/2;
    sup.position.set(0, mz[1], mz[0] - len/2 + 0.01).sub(c0);
    n.add(sup); n.userData.att.supressor = sup;
    const las = new THREE.Group();
    const lb = new THREE.Mesh(BOX, MAT.gBlack); lb.scale.set(0.018,0.018,0.05); las.add(lb);
    const ld = new THREE.Mesh(BOX, HOLO_DOT); ld.scale.set(0.008,0.008,0.004); ld.position.z = -0.026; las.add(ld);
    las.position.set(0.030, mz[1] - 0.012, (pistol ? -0.12 : hz[1] - 0.06)).sub(c0);
    n.add(las); n.userData.att.laser = las;
    if (!pistol){
      const gr = new THREE.Mesh(BOX, MAT.gPoly); gr.scale.set(0.026,0.075,0.030);
      gr.position.set(0, hy ? hy[1] - 0.02 : -0.055, hz[1] - 0.02).sub(c0);
      n.add(gr); n.userData.att.empunhadura = gr;
      const mg = new THREE.Mesh(BOX, MAT.gBlack); mg.scale.set(0.026,0.07,0.05);
      const mp = MAG_POS[w.id] || [-0.02, -0.20];
      mg.position.set(0, mp[1], mp[0]).sub(c0);
      n.add(mg); n.userData.att.pente = mg;
    }
    Object.values(n.userData.att).forEach(o => o.visible = false);
  }
  const dot = n.children.find(o => o.userData.dot);
  if (w.hip) n.userData.hip = new THREE.Vector3(w.hip[0], w.hip[1], w.hip[2]);
  if (dot){
    // centro real do ponto: posição do objeto + centro da geometria (malhas do SketchUp guardam a posição nos vértices)
    dot.geometry.computeBoundingBox();
    const dc = dot.geometry.boundingBox.getCenter(new THREE.Vector3()).multiply(dot.scale).add(dot.position);
    // adsDot: distância olho→mira em metros (bochecha na coronha); sem ele, mantém o recuo antigo
    const az = w.adsDot ? -(w.adsDot + dc.z * n.scale.z) : (w.slot === 'sec' ? -0.82 : -0.68);
    n.userData.ads = new THREE.Vector3(-dc.x * n.scale.x, -dc.y * n.scale.y, az);
  }
  return n;
}

/* Arma que o inimigo carrega, em escala real de mundo. */
function buildEnemyWeapon(id, realLen){
  const g = new THREE.Group();
  buildWeaponParts(id, g);
  g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  return normalizeGun(g, realLen);
}

const gunModels = {};
const gunHolder = new THREE.Group();   // aplica recuo/ADS
const gunSway   = new THREE.Group();   // aplica sway/bob
gunSway.add(gunHolder);
gunScene.add(gunSway);

WEAPONS.forEach(w => {
  const m = buildGunModel(w);
  m.visible = false;
  gunModels[w.id] = m;
  gunHolder.add(m);
});

// Modelos já centrados na origem: o Z aqui é a distância até o CENTRO da arma,
// então a coronha fica a (|z| - VM_LEN/2) da câmera.
const HIP_POS = new THREE.Vector3(0.155, -0.135, -0.74);
// Em ADS a arma desce para o jogador mirar POR CIMA dela; o ponto central
// da mira continua visível como referência.
const ADS_POS = new THREE.Vector3(0.0,   -0.170, -0.72);

/* --- flash de boca --- */
const muzzleLight = new THREE.PointLight(0xffcc70, 0, 14, 2);
scene.add(muzzleLight);

const flashMat = new THREE.MeshBasicMaterial({
  color:0xffdd88, transparent:true, opacity:0, depthWrite:false, side:THREE.DoubleSide
});
const gunFlash = new THREE.Mesh(new THREE.PlaneGeometry(0.17,0.17), flashMat);
gunHolder.add(gunFlash);   // o Z é reposicionado por arma (comprimentos diferentes)

/* ---------------------------------------------------------------
   7. Jogador
   --------------------------------------------------------------- */
const player = {
  pos: new THREE.Vector3(0, 0, 40),   // borda sul: o inimigo entra pela frente e pelos lados
  vel: new THREE.Vector3(),
  yaw: 0,            // olhando para o centro do mapa (de onde vem o inimigo)
  pitch: 0,
  height: 1.78,
  targetHeight: 1.78,
  radius: 0.36,
  grounded: true,
  crouch: false,
  sprint: false,
  hp: 100, maxHp: 100,
  armor: 0, maxArmor: 100,
  lastDamage: -99,
  ads: false,
  adsAmount: 0,
  bobT: 0,
  stepT: 0,
  recoil: new THREE.Vector2(),        // recuo aplicado à câmera (rad)
  recoilTarget: new THREE.Vector2(),  // recuo acumulado que decai ao centro (rad)
  fireCd: 0,
  reloading: false,
  reloadT: 0, reloadDur: 0,
  switching: 0,
  grenades: 2,
  alive: true,
  kickZ: 0
};

const SPEED = { walk:5.4, sprint:8.4, crouch:2.7, air:0.85 };
const GRAVITY = 22.0, JUMP_V = 7.6;

/* ---------------------------------------------------------------
   8. Entrada (teclado / mouse / toque)
   --------------------------------------------------------------- */
const keys = Object.create(null);
let mouseDown = false, rightDown = false;
let pointerLocked = false;
const isTouch = ('ontouchstart' in window) && matchMedia('(pointer:coarse)').matches;

addEventListener('keydown', e => {
  const k = e.code;
  keys[k] = true;
  if (k === 'Escape'){
    if (gameState === STATE.PLAYING) pauseGame();
    else if (gameState === STATE.PAUSED) resumeGame();
    return;
  }
  if (gameState !== STATE.PLAYING) return;
  if (['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Tab'].includes(k)) e.preventDefault();

  if (k === 'KeyR') startReload();
  if (k === 'Digit1') switchWeapon(0);
  if (k === 'Digit2') switchWeapon(1);
  if (k === 'Digit3') switchWeapon(2);
  if (k === 'Digit4') switchWeapon(3);
  if (k === 'KeyQ')   switchWeapon(prevW);
  if (k === 'KeyG')   throwGrenade(false);
  if (k === 'KeyF')   throwGrenade(true);
  if (wave.inBreak && /^Digit[5-90]$/.test(k)) buy((+k.slice(5) + 5) % 10);
  if (k === 'Enter' && wave.inBreak) wave.breakT = Math.min(wave.breakT, 1.5);
});
addEventListener('keyup', e => { keys[e.code] = false; });

canvas.addEventListener('mousedown', e => {
  if (gameState !== STATE.PLAYING) return;
  if (e.button === 0) mouseDown = true;
  if (e.button === 2) rightDown = true;
});
addEventListener('mouseup', e => {
  if (e.button === 0) mouseDown = false;
  if (e.button === 2) rightDown = false;
});
addEventListener('contextmenu', e => e.preventDefault());

/* Com a luneta em 11° de campo de visão, a sensibilidade normal torna a mira
   incontrolável. Escala junto com o zoom, como em qualquer FPS. */
function zoomSens(){ return clamp(camera.fov / settings.fov, 0.18, 1); }

addEventListener('mousemove', e => {
  if (!pointerLocked || gameState !== STATE.PLAYING) return;
  const s = settings.sens * 0.0022 * zoomSens();
  player.yaw   -= e.movementX * s;
  player.pitch -= e.movementY * s * (settings.invertY ? -1 : 1);
  player.pitch = clamp(player.pitch, -Math.PI/2 + 0.03, Math.PI/2 - 0.03);
});

document.addEventListener('pointerlockchange', () => {
  pointerLocked = (document.pointerLockElement === canvas);
  if (!pointerLocked && gameState === STATE.PLAYING && !isTouch) pauseGame();
});

function requestLock(){
  if (isTouch) return;
  const p = canvas.requestPointerLock();
  if (p && p.catch) p.catch(()=>{});
}

/* --- controles de toque --- */
const touchMove = { x:0, y:0, active:false, id:-1 };
let lookTouchId = -1, lookLast = { x:0, y:0 };

function setupTouch(){
  $('touch').classList.remove('hidden');
  document.body.classList.add('touch');
  const stick = $('tstick'), knob = stick.querySelector('i');
  const setKnob = (dx,dy) => {
    knob.style.left = (64 - 28 + dx*40) + 'px';
    knob.style.top  = (64 - 28 + dy*40) + 'px';
  };
  setKnob(0,0);

  stick.addEventListener('touchstart', e => {
    e.preventDefault();
    const t = e.changedTouches[0];
    touchMove.active = true; touchMove.id = t.identifier;
  }, {passive:false});

  addEventListener('touchmove', e => {
    for (const t of e.changedTouches){
      if (t.identifier === touchMove.id && touchMove.active){
        const r = stick.getBoundingClientRect();
        let dx = (t.clientX - (r.left + r.width/2)) / (r.width/2);
        let dy = (t.clientY - (r.top + r.height/2)) / (r.height/2);
        const len = Math.hypot(dx,dy);
        if (len > 1){ dx/=len; dy/=len; }
        touchMove.x = dx; touchMove.y = dy;
        setKnob(dx,dy);
      } else if (t.identifier === lookTouchId){
        const s = settings.sens * 0.0038 * zoomSens();
        player.yaw   -= (t.clientX - lookLast.x) * s;
        player.pitch -= (t.clientY - lookLast.y) * s * (settings.invertY?-1:1);
        player.pitch = clamp(player.pitch, -Math.PI/2+0.03, Math.PI/2-0.03);
        lookLast.x = t.clientX; lookLast.y = t.clientY;
      }
    }
  }, {passive:false});

  addEventListener('touchend', e => {
    for (const t of e.changedTouches){
      if (t.identifier === touchMove.id){
        touchMove.active = false; touchMove.x = touchMove.y = 0; touchMove.id = -1; setKnob(0,0);
      }
      if (t.identifier === lookTouchId) lookTouchId = -1;
    }
  });

  canvas.addEventListener('touchstart', e => {
    if (gameState !== STATE.PLAYING) return;
    const t = e.changedTouches[0];
    if (lookTouchId === -1){ lookTouchId = t.identifier; lookLast.x = t.clientX; lookLast.y = t.clientY; }
  }, {passive:true});

  const hold = (el, on, off) => {
    el.addEventListener('touchstart', e => { e.preventDefault(); on(); }, {passive:false});
    el.addEventListener('touchend',   e => { e.preventDefault(); if(off) off(); }, {passive:false});
  };
  hold($('tfire'),  () => mouseDown = true, () => mouseDown = false);
  hold($('treload'),() => startReload());
  hold($('tjump'),  () => { keys.Space = true; setTimeout(()=>keys.Space=false, 130); });
}

/* ---------------------------------------------------------------
   9. Colisão do jogador contra o mundo
   --------------------------------------------------------------- */
/* Há espaço para o corpo caber em pé sobre `topo`? Só conta o que está ACIMA
   do novo piso — laje, teto, viga. Caixas na altura dos pés são o degrau
   seguinte, que se sobe na sequência; tratá-las como obstáculo travaria a
   subida inteira. */
function temEspacoAcima(p, radius, height, topo){
  for (const b of colliders){
    if (p.x - radius >= b.maxx || p.x + radius <= b.minx) continue;
    if (p.z - radius >= b.maxz || p.z + radius <= b.minz) continue;
    if (b.miny > topo + 0.06 && b.miny < topo + height) return false;
  }
  return true;
}

const STEP_UP = 0.58;   // altura máxima de degrau que se sobe andando

function resolveCollisions(p, radius, height, vel, canStep){
  let grounded = false;
  for (const b of colliders){
    const pminx = p.x - radius, pmaxx = p.x + radius;
    const pminz = p.z - radius, pmaxz = p.z + radius;
    const pminy = p.y,          pmaxy = p.y + height;

    if (pmaxx <= b.minx || pminx >= b.maxx) continue;
    if (pmaxz <= b.minz || pminz >= b.maxz) continue;
    if (pmaxy <= b.miny || pminy >= b.maxy) continue;

    // Degrau: se o topo do obstáculo está logo acima dos pés e há espaço livre
    // para o corpo, sobe em vez de barrar. É o que faz escada e mezanino
    // funcionarem sem precisar pular a cada passo.
    const subida = b.maxy - p.y;
    if (canStep && subida > 0.02 && subida <= STEP_UP && vel.y <= 0.2 &&
        temEspacoAcima(p, radius, height, b.maxy)){
      p.y = b.maxy;
      if (vel.y < 0) vel.y = 0;
      grounded = true;
      continue;
    }

    const dx = Math.min(pmaxx - b.minx, b.maxx - pminx);
    const dz = Math.min(pmaxz - b.minz, b.maxz - pminz);
    const dy = Math.min(pmaxy - b.miny, b.maxy - pminy);

    if (dy <= dx && dy <= dz){
      // resolve verticalmente (pisar em cima ou bater a cabeça)
      if (p.y + height*0.5 > (b.miny + b.maxy) * 0.5){
        p.y = b.maxy;
        if (vel.y < 0) vel.y = 0;
        grounded = true;
      } else {
        p.y = b.miny - height;
        if (vel.y > 0) vel.y = 0;
      }
    } else if (dx <= dz){
      p.x = (p.x > (b.minx + b.maxx) * 0.5) ? b.maxx + radius : b.minx - radius;
    } else {
      p.z = (p.z > (b.minz + b.maxz) * 0.5) ? b.maxz + radius : b.minz - radius;
    }
  }
  if (p.y <= 0){ p.y = 0; if (vel.y < 0) vel.y = 0; grounded = true; }
  return grounded;
}

/* ---------------------------------------------------------------
   10. Inimigos
   --------------------------------------------------------------- */
const enemies = [];
const enemyHitMeshes = [];   // alvos de raycast dos inimigos

// hitChance = probabilidade base de acerto por tiro (ajustada por distância/movimento)
// weapon/wLen = arma real que o inimigo carrega e seu comprimento em metros
const ENEMY_TYPES = {
  grunt:   { hp:100, speed:3.5, dmg:8,  fireRate:0.42, burst:3, hitChance:0.30, range:44,
             color:0x4a5240, scale:1.00, score:100, weapon:'akm', wLen:0.88, wName:'AKM',
             sound:{ gain:0.13, cut:3400, low:118, dur:0.18, rate:0.95 } },
  runner:  { hp:70,  speed:5.9, dmg:6,  fireRate:0.24, burst:5, hitChance:0.24, range:26,
             color:0x5c4a2e, scale:0.94, score:130, weapon:'mp5', wLen:0.68, wName:'MP5A3',
             sound:{ gain:0.10, cut:4600, low:160, dur:0.13, rate:1.30 } },
  heavy:   { hp:260, speed:2.3, dmg:14, fireRate:0.55, burst:2, hitChance:0.34, range:38,
             color:0x36402f, scale:1.16, score:250, weapon:'rpk', wLen:1.04, wName:'RPK',
             sound:{ gain:0.17, cut:2900, low:96,  dur:0.24, rate:0.80 } },
  sniper:  { hp:85,  speed:2.8, dmg:26, fireRate:1.55, burst:1, hitChance:0.55, range:85,
             color:0x2f3a44, scale:1.00, score:200, weapon:'svd', wLen:1.22, wName:'SVD',
             sound:{ gain:0.22, cut:2500, low:88,  dur:0.32, rate:0.70 } }
};

/* --- Soldado: figura articulada (quadril→joelho, ombro→cotovelo) com equipamento.
   Frente = +Z local (o yaw do bot aponta +Z para o alvo). Unidades em metros. --- */
const SOLDIER_GEO = {
  thigh: new THREE.CylinderGeometry(0.088, 0.072, 0.46, 10),
  shin:  new THREE.CylinderGeometry(0.07, 0.055, 0.42, 10),
  upper: new THREE.CylinderGeometry(0.062, 0.054, 0.30, 10),
  fore:  new THREE.CylinderGeometry(0.054, 0.044, 0.27, 10),
  torso: new THREE.CylinderGeometry(0.19, 0.165, 0.50, 14),
  neck:  new THREE.CylinderGeometry(0.055, 0.062, 0.10, 10),
  head:  new THREE.SphereGeometry(0.11, 18, 14),
  helm:  new THREE.SphereGeometry(0.135, 18, 10, 0, Math.PI * 2, 0, Math.PI * 0.56),
  hand:  new THREE.SphereGeometry(0.05, 10, 8),
};
MAT.boot  = new THREE.MeshStandardMaterial({ color:0x26231e, roughness:0.75, envMapIntensity:0.3 });
MAT.gear  = new THREE.MeshStandardMaterial({ color:0x1d1f1b, roughness:0.6, metalness:0.2, envMapIntensity:0.4 });
MAT.lens  = new THREE.MeshStandardMaterial({ color:0x0c0e10, roughness:0.15, metalness:0.6 });

function buildSoldier(o){
  // o: { uni, vest, helm, glove, skin, weapon:[id,len], ghost, ownMats }
  const g = new THREE.Group(), own = [];
  const fabric = c => { const m = surfaceMaterial(c, 'fabric', { scale:3, local:true, normal:'twill', nScale:4 }); own.push(m); return m; };
  const plain = (c, rough=0.8) => { const m = new THREE.MeshStandardMaterial({ color:c, roughness:rough, envMapIntensity:0.35 }); own.push(m); return m; };
  const bodyMat = fabric(o.uni);
  const vestMat = o.vest === undefined ? MAT.enemyVest : fabric(o.vest);
  const helmMat = plain(o.helm, 0.7);
  const gloveMat = o.glove === undefined ? MAT.boot : plain(o.glove, 0.85);
  const skinMat = o.skin === undefined ? MAT.enemyHead : plain(o.skin, 0.65);
  const hits = [];
  const add = (parent, geo, mat, x,y,z, part, sx=1,sy=1,sz=1) => {
    const m = new THREE.Mesh(geo, mat); m.position.set(x,y,z); m.scale.set(sx,sy,sz);
    m.castShadow = true; parent.add(m);
    if (part){ m.userData.part = part; hits.push(m); }
    return m;
  };
  const box = (parent, w,h,d, mat, x,y,z, part) => add(parent, BOX, mat, x,y,z, part, w,h,d);

  // pernas
  const legs = [-1, 1].map(side => {
    const hip = new THREE.Group(); hip.position.set(0.1 * side, 0.93, 0); g.add(hip);
    add(hip, SOLDIER_GEO.thigh, bodyMat, 0,-0.23,0, 'limb');
    box(hip, 0.06,0.12,0.05, MAT.gear, 0.09*side,-0.2,0.02);                 // bolso lateral
    const knee = new THREE.Group(); knee.position.set(0,-0.46,0); hip.add(knee);
    add(knee, SOLDIER_GEO.shin, bodyMat, 0,-0.21,0, 'limb');
    box(knee, 0.11,0.1,0.05, MAT.gear, 0,-0.02,0.07);                        // joelheira
    box(knee, 0.12,0.1,0.27, MAT.boot, 0,-0.44,0.04, 'limb');                // bota
    return { hip, knee };
  });
  // quadril, tronco e colete
  box(g, 0.34,0.18,0.22, bodyMat, 0,0.98,0, 'body');
  box(g, 0.36,0.05,0.24, MAT.gear, 0,1.06,0);                               // cinto
  const torso = add(g, SOLDIER_GEO.torso, bodyMat, 0,1.3,0, 'body', 1.2,1,0.78);
  const vest = box(g, 0.42,0.36,0.29, vestMat, 0,1.33,0, 'body');
  [-0.12, 0, 0.12].forEach(x => box(g, 0.1,0.13,0.06, vestMat, x,1.2,0.17)); // porta-carregadores
  box(g, 0.2,0.24,0.08, vestMat, 0,1.34,-0.18);                             // bolsa de hidratação
  box(g, 0.05,0.16,0.05, MAT.gear, 0.12,1.5,-0.17);                         // rádio
  // cabeça, capacete, óculos
  add(g, SOLDIER_GEO.neck, skinMat, 0,1.58,0);
  const head = add(g, SOLDIER_GEO.head, skinMat, 0,1.7,0.01, 'head', 0.95,1.1,1);
  if (o.ghost) box(g, 0.2,0.12,0.05, plain(0x131313), 0,1.66,0.085);        // balaclava
  const helm = add(g, SOLDIER_GEO.helm, helmMat, 0,1.715,0, 'head');
  box(g, 0.05,0.05,0.04, MAT.gear, 0,1.8,0.12);                             // suporte de visão noturna
  box(g, 0.17,0.045,0.03, MAT.lens, 0,1.715,0.105);                        // óculos
  // braços em posição de tiro (as duas mãos na arma)
  const arms = [-1, 1].map(side => {
    const sh = new THREE.Group(); sh.position.set(0.23 * side, 1.49, 0); g.add(sh);
    add(sh, SOLDIER_GEO.upper, bodyMat, 0,-0.15,0, 'limb');
    const el = new THREE.Group(); el.position.set(0,-0.3,0); sh.add(el);
    add(el, SOLDIER_GEO.fore, bodyMat, 0,-0.135,0, 'limb');
    add(el, SOLDIER_GEO.hand, gloveMat, 0,-0.29,0);
    return { sh, el, side };
  });
  // mão direita no punho, esquerda no guarda-mão
  arms[1].sh.rotation.set(-1.15, 0, -0.32);  arms[1].el.rotation.set(-0.95, 0, 0);
  arms[0].sh.rotation.set(-1.35, 0,  0.42);  arms[0].el.rotation.set(-0.35, 0, 0);
  // arma apontada para +Z, na altura do ombro
  const [wid, wlen] = o.weapon;
  const gun = buildEnemyWeapon(wid, wlen);
  gun.rotation.y = Math.PI;
  gun.position.set(0.1, 1.36, 0.2 + wlen * 0.22);
  g.add(gun);
  const muzzle = new THREE.Object3D();
  muzzle.position.set(0.1, 1.38, 0.2 + wlen * 0.22 + wlen / 2);
  g.add(muzzle);
  if (o.ownMats) o.ownMats.push(...own);
  return { group:g, bodyMat, own, hits, gun, muzzle,
    parts:{ legL:legs[0].hip, legR:legs[1].hip, kneeL:legs[0].knee, kneeR:legs[1].knee,
            armL:arms[0].sh, armR:arms[1].sh, torso, head, helm, vest } };
}

function buildEnemyModel(type, team){
  const t = ENEMY_TYPES[type];
  const ally = team === 'A';
  const op = ally ? (OPERATORS.find(o => o.id === profile.op) || OPERATORS[0]) : null;
  const aw = ally ? ALLY_WEAPON[type] : null;          // aliados usam o arsenal da OTAN
  const s = buildSoldier(ally
    ? { uni:op.uni, vest:op.vest, helm:op.helm, glove:op.glove, skin:op.skin, ghost:op.id === 'ghost', weapon:[aw[0], aw[1]] }
    : { uni:t.color, helm:0x3a4030, weapon:[t.weapon, t.wLen] });
  s.group.scale.setScalar(t.scale);
  return s;
}

/* barra de vida flutuante */
const hpBarGeo = new THREE.PlaneGeometry(1, 1);
function makeHealthBar(){
  const grp = new THREE.Group();
  const bg = new THREE.Mesh(hpBarGeo, new THREE.MeshBasicMaterial({
    color:0x000000, transparent:true, opacity:0.55, depthTest:false
  }));
  bg.scale.set(0.86, 0.10, 1);
  const fg = new THREE.Mesh(hpBarGeo, new THREE.MeshBasicMaterial({
    color:0xe03828, transparent:true, depthTest:false
  }));
  fg.scale.set(0.82, 0.07, 1);
  fg.position.z = 0.001;
  grp.add(bg); grp.add(fg);
  grp.renderOrder = 999;
  grp.visible = false;
  return { grp, fg };
}

function spawnEnemy(type, pos, team){
  team = team || 'B';
  const t = ENEMY_TYPES[type];
  const built = buildEnemyModel(type, team);
  const hb = makeHealthBar();

  const e = {
    type, cfg:t,
    group: built.group,
    parts: built.parts,
    gun: built.gun,
    muzzle: built.muzzle,
    bodyMat: built.bodyMat,
    hpBar: hb,
    pos: pos.clone(),
    vel: new THREE.Vector3(),
    hp: t.hp * (1 + (effWave() - 1) * 0.09) * (team === 'A' ? 1 : DIFF().hp),
    maxHp: t.hp * (1 + (effWave() - 1) * 0.09) * (team === 'A' ? 1 : DIFF().hp),
    radius: 0.42,
    height: 1.78 * t.scale,
    yaw: 0,
    grounded: true,
    state: 'seek',                 // seek | engage | reposition
    los: false,
    losTimer: rand(0, 0.25),
    fireCd: rand(0.6, 2.0),
    burstLeft: 0,
    burstCd: 0,
    strafeDir: Math.random() < 0.5 ? -1 : 1,
    strafeT: rand(1, 3),
    repositionT: 0,
    target: pos.clone(),
    dead: false,
    deathT: 0,
    walkT: rand(0, 6),
    damageFlash: 0,
    alertDelay: rand(DIFF().alert[0], DIFF().alert[1]),
    team, tgt:null, tgtT:0, known: player.pos.clone(), knowT: rand(0,2), stunT:0
  };

  e.group.position.copy(pos);
  scene.add(e.group);
  scene.add(hb.grp);

  // registra partes atingíveis
  e.ownMats = built.own;
  built.hits.forEach(m => {
    if (m.userData.part){
      m.userData.enemy = e;
      enemyHitMeshes.push(m);
    }
  });

  enemies.push(e);
  if (team === 'A') e.group.add(makeFriendTag());
  return e;
}

function removeEnemy(e){
  scene.remove(e.group);
  scene.remove(e.hpBar.grp);
  for (let i = enemyHitMeshes.length - 1; i >= 0; i--){
    if (enemyHitMeshes[i].userData.enemy === e) enemyHitMeshes.splice(i,1);
  }
  // libera os materiais criados por inimigo (o resto é compartilhado)
  (e.ownMats || [e.bodyMat]).forEach(m => m && m.dispose());
  e.hpBar.grp.children.forEach(c => c.material && c.material.dispose());
  const idx = enemies.indexOf(e);
  if (idx >= 0) enemies.splice(idx, 1);
}

/* ---------------------------------------------------------------
   11. Sistema de ondas
   --------------------------------------------------------------- */
const wave = { active:false, toSpawn:0, alive:0, spawnCd:0, breakT:0, inBreak:false };

/* --- Classes, operadores e camuflagens --------------------------------
   Loadout no estilo Black Ops: uma primária, uma secundária e 2 granadas
   letais. Operadores e camuflagens são só visuais e se desbloqueiam com
   abates acumulados na carreira (nunca por pagamento). */
const GREN_MAX = 2;
const LETHALS = {
  frag:   { name:'FRAG',   fuse:1.75, sticky:false, color:0x3f4a32, desc:'Quica e explode em 1,75 s. Dá para rolar atrás de cobertura.' },
  semtex: { name:'SEMTEX', fuse:2.0,  sticky:true,  color:0x6a6d70, desc:'Gruda no primeiro contato, inclusive no inimigo. Explode em 2 s.' },
  nenhuma:{ name:'NENHUMA', none:true, desc:'Sem letal: devolve 1 ponto.' }
};
Object.keys(LETHALS).forEach(k => LETHALS[k].kind = k);
/* Táticas (tecla F, 1 por vida/onda). */
const TACTICALS = {
  atordoante:{ name:'ATORDOANTE', kind:'stun',  fuse:1.4, color:0x5a6068, desc:'Atordoa por até 4 s quem estiver a 12 m: anda devagar, cambaleia e não atira. Cuidado: pega você se estiver perto e olhando.' },
  fumaca:    { name:'FUMAÇA',     kind:'smoke', fuse:1.0, color:0x6a7a5a, desc:'Parede de fumaça por 12 s. Bloqueia a visão dos dois lados: bot não atira no que não vê.' },
  nenhuma:   { name:'NENHUMA', none:true, desc:'Sem tática: devolve 1 ponto.' }
};
const TAC_MAX = () => TACTICALS[activeClass().tact].none ? 0 : 1;
/* Acessórios e vantagens: Pick 10 — cada item custa 1 ponto, 10 no total. */
const ALL_W = ['m4a1','mp7','m870','awm','m9','deagle'];
const ATTACH = {
  supressor:  { name:'SUPRESSOR',       for:['m4a1','mp7','awm','m9','deagle'], desc:'Tiro abafado: só denuncia sua posição a 10 m (sem: 70 m) e não acende no minimapa. Alcance −15%.' },
  empunhadura:{ name:'EMPUNHADURA',     for:['m4a1','mp7','m870'],              desc:'Recuo −30%.' },
  laser:      { name:'MIRA LASER',      for:ALL_W,                              desc:'Dispersão sem mirar −40%.' },
  pente:      { name:'PENTE ESTENDIDO', for:ALL_W,                              desc:'+50% de munição no pente; recarga 10% mais lenta.' },
  cano:       { name:'CANO LONGO',      for:['m4a1','mp7','m870','awm','deagle'], desc:'Alcance +40%.' },
  rapida:     { name:'MIRA RÁPIDA',     for:ALL_W,                              desc:'Entra na mira 40% mais rápido.' }
};
const PERKS = {
  maos:  { name:'MÃOS RÁPIDAS', desc:'Recarga 35% mais rápida.' },
  leveza:{ name:'LEVEZA',       desc:'Anda e corre 12% mais rápido.' },
  firme: { name:'MIRA FIRME',   desc:'Dispersão sem mirar −35%.' }
};
function classPoints(c){
  return 1 + (c.sec !== 'nenhuma' ? 1 : 0) + (LETHALS[c.leth] && !LETHALS[c.leth].none ? 1 : 0) +
         (TACTICALS[c.tact] && !TACTICALS[c.tact].none ? 1 : 0) + c.priAtt.length + c.secAtt.length + c.perks.length;
}
function moddedWeapon(id, att, perks){
  const w = Object.assign({}, WEAPONS.find(x => x.id === id));
  w.sound = Object.assign({}, w.sound);
  att = att || []; perks = perks || [];
  if (att.includes('supressor')){ w.suppressed = true; w.range *= 0.85; w.sound.gain *= 0.4; w.sound.cut *= 0.45; }
  if (att.includes('empunhadura')){ w.recoilV *= 0.7; w.recoilH *= 0.7; }
  if (att.includes('laser')) w.spread *= 0.6;
  if (att.includes('pente')){ w.magMax = Math.round(w.magMax * 1.5); w.mag = w.magMax; w.reload *= 1.1; }
  if (att.includes('cano')) w.range *= 1.4;
  if (att.includes('rapida')) w.adsMul = 1.4;
  if (perks.includes('maos')) w.reload *= 0.65;
  if (perks.includes('firme')) w.spread *= 0.65;
  return w;
}
const OPERATORS = [
  { id:'ranger', name:'RANGER',   desc:'Multicam, 75º Regimento.',        uni:0x6f6a4e, vest:0x4c4a36, helm:0x5a5840, glove:0x3a3428, skin:0xc49a74, kills:0 },
  { id:'seal',   name:'SEAL',     desc:'Uniforme preto, operações noturnas.', uni:0x26292c, vest:0x1b1d1f, helm:0x2e3236, glove:0x1d1f21, skin:0x8d6446, kills:0 },
  { id:'deserto',name:'DESERTO',  desc:'Coyote e areia.',                  uni:0xb49a6c, vest:0x8b7550, helm:0xa38a5f, glove:0x7a6446, skin:0xd2a47e, kills:50 },
  { id:'artico', name:'ÁRTICO',   desc:'Camuflagem de neve.',              uni:0xd9dde0, vest:0xaeb4b8, helm:0xe6e9eb, glove:0x9aa0a4, skin:0xe0b894, kills:150 },
  { id:'ghost',  name:'GHOST',    desc:'Balaclava com caveira. Lenda.',    uni:0x3b4136, vest:0x2a2f27, helm:0x2a2f27, glove:0x1f221c, skin:0xdedad0, kills:300 }
];
const CAMOS = [
  { id:'padrao',  name:'PADRÃO',   color:null,     kills:0 },
  { id:'deserto', name:'DESERTO',  color:0xb59a6a, kills:0 },
  { id:'floresta',name:'FLORESTA', color:0x4f5a38, kills:25 },
  { id:'artico',  name:'ÁRTICO',   color:0xd8dde0, kills:100 },
  { id:'ouro',    name:'OURO',     color:0xc9a23a, kills:250, gold:true }
];
const DEFAULT_CLASSES = [
  { name:'FUZILEIRO',  pri:'m4a1', sec:'m9',     leth:'frag',   tact:'atordoante', camo:'padrao', priAtt:['empunhadura','supressor'], secAtt:[], perks:['maos'] },
  { name:'ASSALTO',    pri:'mp7',  sec:'deagle', leth:'semtex', tact:'fumaca',     camo:'padrao', priAtt:['laser','pente'], secAtt:[], perks:['leveza','firme'] },
  { name:'ATIRADOR',   pri:'awm',  sec:'m9',     leth:'frag',   tact:'fumaca',     camo:'padrao', priAtt:['supressor','cano'], secAtt:['supressor'], perks:['maos'] }
];
const profile = (() => {
  let p = null;
  try { p = JSON.parse(localStorage.getItem('blackout_profile') || 'null'); } catch(e){}
  if (!p || !Array.isArray(p.classes)) p = {};
  const ids = new Set(WEAPONS.map(w => w.id));
  p.classes = DEFAULT_CLASSES.map((d,i) => {
    const c = Object.assign(JSON.parse(JSON.stringify(d)), (p.classes && p.classes[i]) || {});
    if (!ids.has(c.pri)) c.pri = d.pri; if (!ids.has(c.sec)) c.sec = d.sec;
    if (!LETHALS[c.leth]) c.leth = d.leth; if (!CAMOS.some(x => x.id === c.camo)) c.camo = 'padrao';
    if (c.sec !== 'nenhuma' && !ids.has(c.sec)) c.sec = d.sec;
    if (!TACTICALS[c.tact]) c.tact = d.tact;
    c.priAtt = (Array.isArray(c.priAtt) ? c.priAtt : d.priAtt).filter(a => ATTACH[a] && ATTACH[a].for.includes(c.pri)).slice(0,3);
    c.secAtt = (Array.isArray(c.secAtt) ? c.secAtt : d.secAtt).filter(a => ATTACH[a] && ATTACH[a].for.includes(c.sec)).slice(0,2);
    c.perks  = (Array.isArray(c.perks) ? c.perks : d.perks).filter(a => PERKS[a]).slice(0,3);
    if (classPoints(c) > 10) Object.assign(c, JSON.parse(JSON.stringify(d)));
    return c;
  });
  p.cls = clamp(p.cls|0, 0, 2);
  p.op = OPERATORS.some(o => o.id === p.op) ? p.op : 'ranger';
  p.kills = Math.max(0, p.kills|0);
  return p;
})();
function saveProfile(){ try { localStorage.setItem('blackout_profile', JSON.stringify(profile)); } catch(e){} }
function activeClass(){ return profile.classes[profile.cls]; }
function unlocked(item){ return profile.kills >= (item.kills || 0); }
function addCareerKill(){
  profile.kills++;
  [...OPERATORS.map(o => ['OPERADOR', o]), ...CAMOS.map(c => ['CAMUFLAGEM', c])].forEach(([k, it]) => {
    if (it.kills && profile.kills === it.kills) addKillfeed('DESBLOQUEADO: ' + k + ' ' + it.name, true);
  });
  if (profile.kills % 10 === 0) saveProfile();
  bridge.bump();
}

/* Aplica operador (luvas e manga) e camuflagem (na primária) ao modelo em 1ª pessoa. */
const camoMats = {};
function camoMat(c){
  if (!camoMats[c.id]) camoMats[c.id] = c.gold
    ? new THREE.MeshPhongMaterial({ color:c.color, specular:0xfff0b0, shininess:70, emissive:0x2a1c00 })
    : new THREE.MeshStandardMaterial({ color:c.color });
  return camoMats[c.id];
}
function applyCosmetics(){
  const op = OPERATORS.find(o => o.id === profile.op) || OPERATORS[0];
  MAT.hands.color.setHex(op.glove); MAT.sleeve.color.setHex(op.uni);
  const cl = activeClass();
  let camo = CAMOS.find(c => c.id === cl.camo) || CAMOS[0];
  if (!unlocked(camo)) camo = CAMOS[0];
  WEAPONS.forEach(w => {
    const att = gunModels[w.id].userData.att || {};
    const on = w.id === cl.pri ? cl.priAtt : (w.id === cl.sec ? cl.secAtt : []);
    Object.keys(att).forEach(k => att[k].visible = on.includes(k));
  });
  WEAPONS.forEach(w => gunModels[w.id].traverse(o => {
    if (!o.isMesh) return;
    if (o.userData.baseMat === undefined) o.userData.baseMat = o.material;
    const base = o.userData.baseMat;
    const paintable = base === MAT.gBlack || base === MAT.gPoly || base === MAT.gWood;
    o.material = (w.id === cl.pri && camo.color !== null && paintable) ? camoMat(camo) : base;
  }));
}

/* Respiração na luneta: a mira balança; SHIFT segura por até 4 s, depois o fôlego acaba. */
const breath = { t:0, ox:0, oy:0, hold:0, tired:0 };
function updateBreath(dt){
  const w = weapons[curW];
  const scoped = w && w.scope && player.adsAmount > 0.55;
  let amp = 0;
  if (scoped){
    breath.t += dt;
    const holding = keys.ShiftLeft && breath.tired <= 0 && breath.hold < 4;
    if (holding) breath.hold += dt; else { breath.hold = Math.max(0, breath.hold - dt*0.8); }
    if (breath.hold >= 4 && breath.tired <= 0) breath.tired = 2.5;
    if (breath.tired > 0) breath.tired -= dt;
    amp = holding ? 0.0003 : (breath.tired > 0 ? 0.009 : 0.0035);
    $('breath').textContent = breath.tired > 0 ? 'SEM FÔLEGO' : (holding ? 'RESPIRAÇÃO PRESA ' + Math.ceil(4 - breath.hold) : 'SHIFT · PRENDER A RESPIRAÇÃO');
  }
  const nx = Math.sin(breath.t * 1.1) * amp, ny = Math.sin(breath.t * 1.7 + 1) * amp * 0.7;
  player.yaw += nx - breath.ox; player.pitch += ny - breath.oy;
  breath.ox = nx; breath.oy = ny;
}

function wStat(w){
  return { dano: Math.min(1, w.damage * w.pellets / 150), cad: Math.min(1, w.rpm / 1000),
           alc: Math.min(1, w.range / 320), mob: clamp(1 - (w.switchTime - 0.2) / 0.6, 0.05, 1) };
}

/* Prévia 3D do operador na aba OPERADORES (renderizador próprio, só roda com a aba aberta). */
const opPrev = { on:false, r:null, scene:null, cam:null, model:null, canvas:null, loop:false };
function buildOperatorPreview(){
  if (!opPrev.canvas) return;
  if (!opPrev.r){
    opPrev.r = new THREE.WebGLRenderer({ canvas:opPrev.canvas, antialias:true, alpha:true });
    if (THREE.sRGBEncoding !== undefined) opPrev.r.outputEncoding = THREE.sRGBEncoding;
    opPrev.scene = new THREE.Scene();
    opPrev.scene.add(new THREE.HemisphereLight(0xdfe6ee, 0x3a3226, 0.8));
    const k = new THREE.DirectionalLight(0xffd9a8, 1.1); k.position.set(2,3,2); opPrev.scene.add(k);
    opPrev.cam = new THREE.PerspectiveCamera(30, 220/280, 0.1, 20);
    opPrev.cam.position.set(0, 1.2, 4.6); opPrev.cam.lookAt(0, 0.95, 0);
    if (!opPrev.loop){ opPrev.loop = true; (function spin(){ requestAnimationFrame(spin);
      if (!opPrev.on || !opPrev.model || !opPrev.r || gameState !== STATE.MENU) return;
      opPrev.model.rotation.y += 0.012; opPrev.r.render(opPrev.scene, opPrev.cam); })(); }
  }
  if (opPrev.model) opPrev.scene.remove(opPrev.model);
  const o = OPERATORS.find(x => x.id === profile.op) || OPERATORS[0];
  const pid = activeClass().pri, pw = WEAPONS.find(w => w.id === pid);
  const sol = buildSoldier({ uni:o.uni, vest:o.vest, helm:o.helm, glove:o.glove, skin:o.skin, ghost:o.id === 'ghost', weapon:[pid, pw ? pw.realLen : 0.84] });
  const g = sol.group;
  g.rotation.y = 0.5;
  opPrev.model = g; opPrev.scene.add(g);
  opPrev.r.render(opPrev.scene, opPrev.cam);
}

/* --- Mata-mata em equipe 6×6 com bots infinitos -----------------------
   Você + 5 aliados (equipe A) contra 6 inimigos (equipe B). Quem morre
   renasce em 4 s no lado da sua equipe, no ponto mais longe dos inimigos. */
const tdm = { a:0, b:0, queue:[], respawnT:0, over:false };
const ALLY_WEAPON = { grunt:['m4a1',0.84], runner:['mp7',0.64], heavy:['m4a1',0.84], sniper:['awm',1.18] };
const PLAYER_T = { isPlayer:true, team:'A', get pos(){ return player.pos; }, get height(){ return player.height; }, get dead(){ return !player.alive; } };
function effWave(){ return settings.mode === 'tdm' ? 4 : stats.wave; }
function pickTarget(e){
  const opp = e.team === 'B'
    ? [PLAYER_T].filter(t => player.alive).concat(enemies.filter(o => o.team === 'A' && !o.dead))
    : enemies.filter(o => o.team === 'B' && !o.dead);
  let best = null, bd = 1e9;
  for (const o of opp){ const d = o.pos.distanceTo(e.pos) * (o.isPlayer ? 0.9 : 1); if (d < bd){ bd = d; best = o; } }
  return best;
}
function botName(e){
  if (e.isPlayer) return 'VOCÊ';
  const n = { grunt:'SOLDADO', runner:'BATEDOR', heavy:'PESADO', sniper:'ATIRADOR' }[e.type] || 'BOT';
  return (e.team === 'A' ? 'ALIADO ' : '') + n;
}
function shotSound(e){
  const d = e.pos.distanceTo(player.pos);
  Audio_.shot(Object.assign({}, e.cfg.sound, { gain: e.cfg.sound.gain * clamp(1.15 - d / 70, 0.08, 1) }));
}
function botShootBot(e, T){
  _eyePos.copy(e.pos); _eyePos.y += e.height * 0.85;
  const to = T.pos.clone(); to.y += T.height * 0.55;
  const dist = _eyePos.distanceTo(to);
  const hit = Math.random() < clamp(e.cfg.hitChance * 0.9 * clamp(1 - dist / e.cfg.range * 0.55, 0.35, 1), 0.03, 0.8);
  const dir = to.clone().sub(_eyePos).normalize();
  if (!hit){ dir.x += rand(-0.08,0.08); dir.y += rand(-0.05,0.05); dir.z += rand(-0.08,0.08); dir.normalize(); }
  const from = e.muzzle ? e.muzzle.getWorldPosition(new THREE.Vector3()) : _eyePos.clone();
  addTracer(from, from.clone().addScaledVector(dir, dist), e.team === 'A' ? 0xffd070 : 0xff8844);
  e.firedT = clockT;
  shotSound(e);
  if (hit) damageEnemy(T, e.cfg.dmg * 1.6, Math.random() < 0.12, to, e);
}
function playerNoise(radius){
  for (const e of enemies){
    if (e.dead || e.team === 'A') continue;
    if (e.pos.distanceTo(player.pos) < radius){ e.known.copy(player.pos); e.knowT = 4; }
  }
}
function teamSpawns(team){
  const md = MAPDEF(), start = new THREE.Vector2(md.player.x, md.player.z);
  const pts = md.spawns.map(p => new THREE.Vector3(p[0], 0, p[1])).concat([new THREE.Vector3(md.player.x, 0, md.player.z)]);
  pts.sort((a, b) => a.distanceTo(new THREE.Vector3(start.x,0,start.y)) - b.distanceTo(new THREE.Vector3(start.x,0,start.y)));
  const half = Math.ceil(pts.length / 2);
  return team === 'A' ? pts.slice(0, half) : pts.slice(half);
}
function safeSpawn(team){
  const foes = team === 'A' ? enemies.filter(o => o.team === 'B' && !o.dead).map(o => o.pos)
                            : enemies.filter(o => o.team === 'A' && !o.dead).map(o => o.pos).concat(player.alive ? [player.pos] : []);
  let best = null, bs = -1;
  for (const p of teamSpawns(team)){
    const d = foes.length ? Math.min(...foes.map(f => f.distanceTo(p))) : 50;
    const sc = d + Math.random() * 6;
    if (sc > bs){ bs = sc; best = p; }
  }
  return best.clone().add(new THREE.Vector3(rand(-2,2), 0, rand(-2,2)));
}
function tdmType(){ const r = Math.random(); return r < 0.5 ? 'grunt' : r < 0.75 ? 'runner' : r < 0.87 ? 'sniper' : 'heavy'; }
function startTDM(){
  stats.wave = 0;
  for (let i = 0; i < 5; i++) spawnEnemy(tdmType(), safeSpawn('A'), 'A');
  for (let i = 0; i < 6; i++) spawnEnemy(tdmType(), safeSpawn('B'), 'B');
  showWaveBanner('MATA-MATA 6×6', settings.limit ? 'PRIMEIRO A ' + settings.limit + ' ABATES' : 'SEM LIMITE · BOTS INFINITOS');
  Audio_.waveStart();
}
function tdmOnBotDeath(e, killer){
  if (e.team === 'B') tdm.a++; else tdm.b++;
  tdm.queue.push({ team:e.team, t:4 });            // renasce em 4 s
  checkTdmEnd();
}
function updateTDM(dt){
  if (tdm.over) return;
  for (let i = tdm.queue.length-1; i>=0; i--){
    const q = tdm.queue[i]; q.t -= dt;
    if (q.t <= 0){ spawnEnemy(tdmType(), safeSpawn(q.team), q.team); tdm.queue.splice(i,1); }
  }
}
function checkTdmEnd(){
  if (!settings.limit || tdm.over) return;
  if (tdm.a < settings.limit && tdm.b < settings.limit) return;
  tdm.over = true;
  const win = tdm.a >= settings.limit;
  player.alive = false; gameState = STATE.DEAD; mouseDown = false;
  if (document.pointerLockElement) document.exitPointerLock();
  saveProfile();
  bridge.set({ gameover: goView(win ? 'VITÓRIA' : 'DERROTA', 'PLACAR FINAL ' + tdm.a + ' – ' + tdm.b, '—', Math.max(readBest(), stats.score)) });
  setTimeout(() => { $('hud').classList.add('hidden'); $('touch').classList.add('hidden'); bridge.set({ screen:'gameover' }); }, 900);
}
function respawnPlayer(){
  const p = safeSpawn('A');
  player.pos.copy(p); player.vel.set(0,0,0);
  const c = new THREE.Vector3(0,0,0).sub(p);
  player.yaw = Math.atan2(-c.x, -c.z); player.pitch = 0;
  player.hp = player.maxHp; player.armor = 25; player.alive = true;
  player.reloading = false; player.switching = 0;
  resetWeapons();
  player.grenades = LETHALS[activeClass().leth].none ? 0 : GREN_MAX;
  player.tacticals = TAC_MAX();
  camera.rotation.set(0,0,0);
  $('vignette').style.opacity = '0';
  gameState = STATE.PLAYING;
  if (!document.pointerLockElement) requestLock();
  updateHUD(); showWeaponList();
}
function makeFriendTag(){
  const c = document.createElement('canvas'); c.width = c.height = 32;
  const x = c.getContext('2d'); x.fillStyle = '#5fb4ff';
  x.beginPath(); x.moveTo(4,6); x.lineTo(28,6); x.lineTo(16,26); x.closePath(); x.fill();
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map:new THREE.CanvasTexture(c), depthTest:false, transparent:true }));
  sp.scale.set(0.35,0.35,1); sp.position.y = 2.25; sp.renderOrder = 998;
  return sp;
}

/* --- Granadas táticas --- */
const smokes = [];
function detonate(g){
  const pos = g.mesh.position.clone();
  if (g.kind === 'stun') stunBlast(pos);
  else if (g.kind === 'smoke') startSmoke(pos);
  else explode(pos);
}
function stunBlast(pos){
  Audio_.explode();
  addParticles(pos, 0xffffff, 26, 10, 3, 1.1);
  const light = new THREE.PointLight(0xdfe8ff, 40, 26, 2); light.position.copy(pos); scene.add(light);
  fx.explosions.push({ light, t:0, life:0.3 });
  for (const e of enemies){
    if (e.dead || e.team === 'A') continue;
    const d = e.pos.distanceTo(pos);
    if (d < 12){ e.stunT = Math.max(e.stunT, 4 * (1 - d / 14)); e.burstLeft = 0; e.alertDelay = 0; }
  }
  // quem lança perto demais e olhando para a explosão também é atordoado
  const eye = camera.position, dp = eye.distanceTo(pos);
  const facing = getAimDir().dot(pos.clone().sub(eye).normalize());
  if (dp < 9 && facing > 0.2){
    const f = $('flash'); f.style.transition = 'none'; f.style.opacity = String(clamp((1 - dp/9) * facing * 1.3, 0.2, 0.95));
    requestAnimationFrame(() => { f.style.transition = 'opacity 2.2s ease-out'; f.style.opacity = '0'; });
  }
}
function startSmoke(pos){
  pos.y = 0.3;
  Audio_.click(0.2, 500, 0.3, 0.6);
  smokes.push({ pos, t:0, life:12, r:5 });
  ambientEmitters.push({ pos, type:'smokeG', acc:6, rate:12, map:mapaCarregado, ttl:10.5 });
}
function updateSmokes(dt){ for (let i = smokes.length-1; i>=0; i--){ smokes[i].t += dt; if (smokes[i].t > smokes[i].life) smokes.splice(i,1); } }
function smokeBlocks(a, b){
  for (const s of smokes){
    if (s.t < 1.0) continue;                                   // precisa de 1 s para encorpar
    const ab = b.clone().sub(a), len = ab.length(); ab.divideScalar(len);
    const t = clamp(s.pos.clone().sub(a).dot(ab), 0, len);
    const cl = a.clone().addScaledVector(ab, t);
    const dx = cl.x - s.pos.x, dz = cl.z - s.pos.z;
    if (Math.hypot(dx, dz) < s.r && cl.y < 4.5) return true;
  }
  return false;
}
function clearSmokes(){ smokes.length = 0; for (let i = ambientEmitters.length-1; i>=0; i--) if (ambientEmitters[i].type === 'smokeG') ambientEmitters.splice(i,1); }

/* --- Marcos distantes e fumaça (leitura de espaço e história do lugar) ---
   Um marco fora do mapa orienta sem depender do minimapa; colunas de fumaça
   e fogo contam que o lugar está em combate há horas. */
function addWorld(o){ o.userData.ownGeo = true; scene.add(o); worldMeshes.push(o); return o; }
function buildLandmark(kind){
  const haze = new THREE.MeshStandardMaterial({ color:0x6a7078 });
  if (kind === 'torre-resfriamento'){
    const pts = []; for (let i=0;i<=12;i++){ const t=i/12; pts.push(new THREE.Vector2(16 - 7*Math.sin(t*Math.PI*0.9), t*48)); }
    [[-92,-118],[-60,-132]].forEach(([x,z],i) => {
      const m = addWorld(new THREE.Mesh(new THREE.LatheGeometry(pts, 28), haze));
      m.position.set(x, 0, z); m.scale.setScalar(i ? 0.8 : 1);
      ambientEmitters.push({ pos:new THREE.Vector3(x, 46*(i?0.8:1), z), type:'vapor', acc:0, rate:0.35 });
    });
  } else if (kind === 'mesas'){
    [[-85,-90,34,30],[70,-100,28,40],[110,20,40,24],[-110,40,30,34]].forEach(([x,z,r,h]) => {
      const m = addWorld(new THREE.Mesh(new THREE.CylinderGeometry(r*0.7, r, h, 9), new THREE.MeshStandardMaterial({ color:0xa5835a })));
      m.position.set(x, h/2, z);
    });
  } else if (kind === 'ruinas'){
    // horizonte de arranha-céus partidos na névoa (um único mesh) e colunas de fumaça
    let sd = 7;
    const r = () => { sd = (sd * 16807) % 2147483647; return (sd - 1) / 2147483646; };
    const geos = [], o = new THREE.Object3D();
    const bloco = (w, h, d, x, y, z, ry, rz) => { o.position.set(x, y, z); o.rotation.set(0, ry, rz); o.updateMatrix(); geos.push(new THREE.BoxGeometry(w, h, d).applyMatrix4(o.matrix)); };
    for (let i = 0; i < 26; i++){
      const a = i / 26 * TAU + r() * 0.1, d = 100 + r() * 45, w = 12 + r() * 14, h = 30 + r() * 70, ry = (r() - 0.5) * 0.1;   // alinhados: a grade de janelas é triplanar
      const x = Math.cos(a) * d, z = Math.sin(a) * d, rz = r() < 0.3 ? (r() - 0.5) * 0.12 : 0;   // alguns adernados
      bloco(w, h, w * (0.7 + r() * 0.5), x, h/2, z, ry, rz);
      if (r() < 0.7) bloco(w * 0.5, h * 0.18, w * 0.45, x + (r() - 0.5) * w * 0.4, h * 1.08, z + (r() - 0.5) * w * 0.4, ry, (r() - 0.5) * 0.4);
    }
    addWorld(new THREE.Mesh(merge(geos), surfaceMaterial(0x55575b, 'facade', { scale:1/24, bump:0 })));
    [[-70,-95],[60,-110],[105,-30]].forEach(([x,z]) => ambientEmitters.push({ pos:new THREE.Vector3(x, 14, z), type:'plume', acc:0, rate:0.6 }));
  } else {
    for (let i=0;i<22;i++){
      const a = i/22*TAU, d = 95 + (i%3)*14, h = 18 + ((i*37)%5)*9;
      const m = addWorld(new THREE.Mesh(new THREE.BoxGeometry(14, h, 14), haze));
      m.position.set(Math.cos(a)*d, h/2, Math.sin(a)*d);
    }
  }
}

const ambientEmitters = [];
const puffTex = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const x = c.getContext('2d'), g = x.createRadialGradient(32,32,2,32,32,31);
  g.addColorStop(0,'rgba(255,255,255,1)'); g.addColorStop(0.5,'rgba(255,255,255,.45)'); g.addColorStop(1,'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0,0,64,64);
  return new THREE.CanvasTexture(c);
})();
const puffs = [];
const fireLights = [0,1].map(() => { const l = new THREE.PointLight(0xff8a3a, 0, 16, 2); scene.add(l); return l; });
function setupAmbientFX(def){
  // o array de marcos já foi preenchido por buildLandmark; limpa só os do mapa anterior
  for (let i = ambientEmitters.length-1; i>=0; i--) if (ambientEmitters[i].map && ambientEmitters[i].map !== def.id) ambientEmitters.splice(i,1);
  puffs.forEach(p => { scene.remove(p.s); p.s.material.dispose(); }); puffs.length = 0;
  fireLights.forEach(l => l.intensity = 0);
  // destroços em chamas perto de dois pontos de entrada inimigos: marcam as rotas de chegada
  const sp = def.spawns, picks = def.fires || [sp[1], sp[Math.floor(sp.length/2)]].map(q => [q[0]*0.8, q[1]*0.8]);
  picks.forEach((q,i) => {
    const pos = new THREE.Vector3(q[0], q[2] !== undefined ? q[2] : 0.2, q[1]), size = q[3] || 1;
    ambientEmitters.push({ pos, type:'fire', acc:0, rate:22 * size, map:def.id, light:fireLights[i], size:Math.sqrt(size), spread:size });
    ambientEmitters.push({ pos:pos.clone().setY(pos.y + 1.0 * size), type:'smoke', acc:0, rate:5, map:def.id, size:Math.sqrt(size) });
  });
  (def.emitters || []).forEach(e => ambientEmitters.push({ ...e, pos:new THREE.Vector3(...e.pos), acc:0, map:def.id }));
  ambientEmitters.forEach(e => { if (!e.map) e.map = def.id; });
}
const FIRE_A = new THREE.Color(3.2, 2.1, 0.7), FIRE_B = new THREE.Color(1.5, 0.35, 0.06);   // base amarela → ponta vermelha
/* Língua de fogo: gota alongada com borda irregular (o sprite é esticado na vertical). */
const flameTex = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(32, 42, 2, 32, 38, 30);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.35, 'rgba(255,255,255,0.8)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g;
  x.beginPath(); x.moveTo(32, 2);
  x.bezierCurveTo(46, 20, 58, 40, 46, 58); x.bezierCurveTo(40, 64, 24, 64, 18, 58); x.bezierCurveTo(6, 40, 18, 20, 32, 2);
  x.fill();
  return new THREE.CanvasTexture(c);
})();
const PUFF_COL = { fire:0xff9a40, vapor:0xe8e4dc, smokeG:0xb9bab2, smoke:0x3a3632, dust:0xcdbfa2, plume:0x57514a };
/** Um sprite de fumaça/fogo/poeira. `em` precisa só de pos e type. */
function spawnPuff(em){
  const t = em.type, fire = t === 'fire', vapor = t === 'vapor', sg = t === 'smokeG';
  // fogo em cor HDR com mistura normal: aparece contra o céu claro de dia e ainda passa do limiar do bloom
  const mat = new THREE.SpriteMaterial({ map: fire ? flameTex : puffTex, depthWrite:false, fog:!fire, opacity:0,
    color: fire ? FIRE_A : (PUFF_COL[t] || PUFF_COL.smoke) });
  if (fire) mat.rotation = rand(-0.25, 0.25);
  const s = new THREE.Sprite(mat);
  const spread = (vapor ? 10 : (sg ? 7 : (t === 'dust' ? 7 : (t === 'plume' ? 4 : 1)))) * (em.spread || 1);
  s.position.copy(em.pos).add(new THREE.Vector3(rand(-0.6,0.6), sg ? rand(0,2.4) : 0, rand(-0.6,0.6)).multiplyScalar(spread));
  scene.add(s);
  let p;
  if (sg)               p = { life:rand(4,6), vy:rand(0.1,0.4), size:rand(3.2,4.4), grow:0.5, peak:0.92, drift:0.15 };
  else if (t === 'dust')  p = { life:rand(7,11), vy:rand(0.05,0.2), size:rand(5,8), grow:0.8, peak:0.2, drift:1.5 };   // lençol de poeira ao vento
  else if (t === 'plume') p = { life:rand(11,15), vy:rand(3,4.2), size:rand(9,12), grow:2.6, peak:0.5, drift:2.2 };   // coluna de fumaça distante
  else p = { life: fire ? rand(0.5,0.9) : (vapor ? rand(9,13) : rand(6,9)),
             vy: fire ? rand(1.6,2.6) : (vapor ? rand(3,4.5) : rand(1.8,2.6)),
             size: fire ? rand(0.9,1.5) : (vapor ? 14 : rand(1.6,2.4)), grow: fire ? -0.6 : (vapor ? 2.2 : 1.3),
             peak: fire ? 0.9 : (vapor ? 0.55 : 0.62), drift: vapor ? 2.5 : 0.9 };
  if (em.size){ p.size *= em.size; if (fire) p.vy *= Math.sqrt(em.size); }     // fogo grande: chamas mais altas
  p.s = s; p.t = 0; p.fire = fire;
  puffs.push(p);
}
function updateAmbientFX(dt){
  for (let i = ambientEmitters.length-1; i>=0; i--){
    const em = ambientEmitters[i];
    if (em.ttl !== undefined){ em.ttl -= dt; if (em.ttl <= 0){ ambientEmitters.splice(i,1); continue; } }
    if (em.map !== mapaCarregado) continue;
    if (em.type === 'sparks'){                                 // fio rompido: rajadas de faísca em intervalos irregulares
      em.acc -= dt;
      if (em.acc <= 0){
        em.acc = rand(em.min || 1.2, em.max || 3.6);
        emitSparks(em.pos, randInt(10, 22), 3.2, 1.2);
        if (em.sound && camera.position.distanceTo(em.pos) < 20) Audio_.click(0.06, 3800, 0.14, 2.2);
      }
      continue;
    }
    em.acc += dt * em.rate;
    while (em.acc >= 1 && puffs.length < 340){ em.acc -= 1; spawnPuff(em); }
    if (em.light) em.light.position.copy(em.pos).setY(em.pos.y + 1.2), em.light.intensity = 2.2 + Math.random()*1.2;
  }
  for (let i = puffs.length-1; i>=0; i--){
    const p = puffs[i]; p.t += dt;
    const k = p.t / p.life;
    if (k >= 1){ scene.remove(p.s); p.s.material.dispose(); puffs.splice(i,1); continue; }
    p.s.position.y += p.vy * dt; p.s.position.x += p.drift * dt;   // vento leve para +x
    const sc = Math.max(0.2, p.size * (1 + p.grow * k));
    if (p.fire){ p.s.scale.set(sc * 0.62, sc * 1.2, 1); p.s.material.color.copy(FIRE_A).lerp(FIRE_B, k); }
    else p.s.scale.setScalar(sc);
    p.s.material.opacity = p.peak * Math.min(1, k*5) * (1 - k);
  }
  updateSparks(dt);
  updateMotes(dt);
  updateDrones(dt);
}

/* --- Faíscas: segmentos de linha com cor HDR (acima do limiar do bloom), uma única draw call.
       Saem de fios rompidos, de tiros em metal e de drones atingidos. --- */
const SPARK_MAX = 280;
const sparkGeo = new THREE.BufferGeometry();
sparkGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(SPARK_MAX * 6), 3));
sparkGeo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(SPARK_MAX * 6), 3));
sparkGeo.setDrawRange(0, 0);
const sparkLines = new THREE.LineSegments(sparkGeo, new THREE.LineBasicMaterial({ vertexColors:true, transparent:true,
  blending:THREE.AdditiveBlending, depthWrite:false, fog:false }));
sparkLines.frustumCulled = false;
scene.add(sparkLines);
const sparks = [];
function emitSparks(pos, n, speed, up, normal){
  for (let i = 0; i < n && sparks.length < SPARK_MAX; i++){
    const v = new THREE.Vector3(rand(-1,1), rand(-0.3,1), rand(-1,1)).normalize().multiplyScalar(speed * rand(0.4, 1.2));
    if (normal) v.addScaledVector(normal, speed * 0.7);
    v.y += up || 0;
    sparks.push({ p:pos.clone(), v, t:0, life:rand(0.3, 0.9) });
  }
}
function updateSparks(dt){
  const P = sparkGeo.attributes.position.array, C = sparkGeo.attributes.color.array;
  let n = 0;
  for (let i = sparks.length-1; i>=0; i--){
    const s = sparks[i]; s.t += dt;
    if (s.t >= s.life){ sparks.splice(i,1); continue; }
    s.v.y -= 11 * dt; s.p.addScaledVector(s.v, dt);
    if (s.p.y < 0.02){ s.p.y = 0.02; s.v.y *= -0.35; s.v.x *= 0.6; s.v.z *= 0.6; }   // quica no chão
    const k = 1 - s.t / s.life, j = n * 6;
    P[j] = s.p.x; P[j+1] = s.p.y; P[j+2] = s.p.z;
    P[j+3] = s.p.x - s.v.x * 0.035; P[j+4] = s.p.y - s.v.y * 0.035; P[j+5] = s.p.z - s.v.z * 0.035;
    C[j] = 4.5 * k; C[j+1] = 1.9 * k; C[j+2] = 0.4 * k; C[j+3] = 1.2 * k; C[j+4] = 0.3 * k; C[j+5] = 0.04 * k;
    n++;
  }
  sparkGeo.setDrawRange(0, n * 2);
  sparkGeo.attributes.position.needsUpdate = true; sparkGeo.attributes.color.needsUpdate = true;
}

/* --- Poeira em suspensão: partículas finas que brilham contra o sol, sempre em volta da câmera. --- */
const ruinsFX = { drones:[], motes:null };
function buildMotes(){
  const N = 520, pos = new Float32Array(N * 3);
  for (let i = 0; i < N; i++){ pos[i*3] = rand(-18,18); pos[i*3+1] = rand(0.3, 9); pos[i*3+2] = rand(-18,18); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const m = new THREE.PointsMaterial({ size:0.032, map:puffTex, color:0xfff0d4, transparent:true, opacity:0.5,
    depthWrite:false, blending:THREE.AdditiveBlending, sizeAttenuation:true });
  const p = new THREE.Points(g, m); p.frustumCulled = false;
  scene.add(p);
  return p;
}
function updateMotes(dt){
  const p = ruinsFX.motes; if (!p) return;
  const a = p.geometry.attributes.position.array, c = camera.position, t = performance.now() / 1000;
  for (let i = 0; i < a.length; i += 3){
    a[i]   += (0.35 + Math.sin(t * 0.7 + i) * 0.15) * dt;          // vento leve para +x
    a[i+1] += Math.sin(t * 0.9 + i * 0.37) * 0.08 * dt;
    a[i+2] += Math.cos(t * 0.5 + i * 0.21) * 0.1 * dt;
    if (a[i] - c.x > 18) a[i] -= 36; else if (a[i] - c.x < -18) a[i] += 36;
    if (a[i+2] - c.z > 18) a[i+2] -= 36; else if (a[i+2] - c.z < -18) a[i+2] += 36;
    if (a[i+1] > 9) a[i+1] = 0.3; else if (a[i+1] < 0.3) a[i+1] = 9;
  }
  p.geometry.attributes.position.needsUpdate = true;
}

/* --- Drones de vigilância (quadricóptero modelado no SketchUp): patrulham o céu, piscam luz
       vermelha e caem em chamas quando levam tiros. Não atiram: são ambiente e alvo de habilidade. --- */
const droneHitMeshes = [];
let droneMats = null;
const rotorCache = new Map();
function buildDrone(){
  droneMats = droneMats || {
    dBody: new THREE.MeshStandardMaterial({ color:0x2e3236, roughness:0.45, metalness:0.35, envMapIntensity:0.5 }),
    dRotor: new THREE.MeshStandardMaterial({ color:0x121416, roughness:0.6, transparent:true, opacity:0.5, depthWrite:false }),
    dLens: new THREE.MeshStandardMaterial({ color:0x05070a, roughness:0.08, metalness:0.9, envMapIntensity:1 })
  };
  const g = new THREE.Group(), rotors = [];
  kitByMaterial('drone', n => n.startsWith('rotor') || n.startsWith('light')).forEach(p => {
    const m = new THREE.Mesh(p.geometry, droneMats[p.mat]); m.castShadow = true; g.add(m);
  });
  const lightMat = new THREE.MeshStandardMaterial({ color:0x200000, emissive:0xff2a14, emissiveIntensity:6 });
  ruinasKit().drone.forEach(p => {
    if (p.name.startsWith('light')) g.add(new THREE.Mesh(p.geometry, lightMat));
    if (p.name.startsWith('rotor')){
      // cada hélice gira no próprio eixo: geometria recentrada, mesh no centro do motor
      let c = rotorCache.get(p.name);
      if (!c){
        const geo = p.geometry.clone(); geo.computeBoundingBox();
        const ctr = geo.boundingBox.getCenter(new THREE.Vector3()); geo.translate(-ctr.x, -ctr.y, -ctr.z);
        c = { geo, ctr }; rotorCache.set(p.name, c);
      }
      const m = new THREE.Mesh(c.geo, droneMats.dRotor); m.position.copy(c.ctr); g.add(m); rotors.push(m);
    }
  });
  g.scale.setScalar(1.3);
  return { g, rotors, lightMat };
}
function spawnDrones(paths){
  paths.forEach((path, i) => {
    const d = Object.assign(buildDrone(), { path, hp:60, state:'fly', respawn:0, vel:new THREE.Vector3(), phase:i * 2.1, yaw:0 });
    d.g.traverse(o => { if (o.isMesh){ o.userData.drone = d; droneHitMeshes.push(o); } });
    dronePathPos(d, performance.now() / 1000, d.g.position);
    scene.add(d.g); ruinsFX.drones.push(d);
  });
}
function dronePathPos(d, t, out){
  const p = d.path;
  if (p.kind === 'orbit') return out.set(p.x + Math.cos(t * p.w + d.phase) * p.r, p.y + Math.sin(t * 1.3 + d.phase) * 0.4, p.z + Math.sin(t * p.w + d.phase) * p.r);
  if (p.kind === 'line')  return out.set(p.x + Math.sin(t * 0.37) * 2, p.y + Math.sin(t * 1.1) * 0.5, p.z + Math.sin(t * p.w + d.phase) * p.r);
  return out.set(p.x + Math.sin(t * p.w) * p.r, p.y + Math.sin(t * 1.7) * 0.3, p.z + Math.sin(t * p.w * 2) * p.r * 0.5);   // oito
}
const _dp = new THREE.Vector3();
function updateDrones(dt){
  if (!ruinsFX.drones.length) return;
  const t = performance.now() / 1000;
  for (const d of ruinsFX.drones){
    if (d.state === 'dead'){
      d.respawn -= dt;
      if (d.respawn <= 0){ d.state = 'fly'; d.hp = 60; d.g.visible = true; dronePathPos(d, t, d.g.position); }
      continue;
    }
    d.rotors.forEach((r, i) => { r.rotation.y += dt * (i % 2 ? 62 : -62); });
    if (d.state === 'fall'){
      d.vel.y -= 9.8 * dt;
      d.g.position.addScaledVector(d.vel, dt);
      d.g.rotation.y += dt * 9; d.g.rotation.z += dt * 2.2;
      if (Math.random() < dt * 25) spawnPuff({ pos:d.g.position, type:'smoke' });
      if (d.g.position.y <= 0.3) crashDrone(d);
      continue;
    }
    d.lightMat.emissiveIntensity = Math.sin(t * 5 + d.phase) > 0.55 ? 9 : 0.6;
    dronePathPos(d, t, _dp);
    d.vel.subVectors(_dp, d.g.position).divideScalar(Math.max(dt, 1e-3));
    d.g.position.copy(_dp);
    // o nariz (câmera em +x) aponta para onde vai; inclina para a frente com a velocidade
    const sp = Math.hypot(d.vel.x, d.vel.z);
    if (sp > 0.2){ let dy = Math.atan2(-d.vel.z, d.vel.x) - d.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); d.yaw += dy * clamp(dt * 2, 0, 1); }
    d.g.rotation.set(0, d.yaw, -clamp(sp * 0.05, 0, 0.25), 'YXZ');
  }
}
function hitDrone(d, dmg, point){
  if (d.state !== 'fly') return;
  emitSparks(point, randInt(6, 10), 4, 1);
  d.hp -= dmg;
  showHitmarker(d.hp <= 0, false);
  if (d.hp <= 0){
    d.state = 'fall';
    d.vel.set(d.vel.x * 0.3 + rand(-2, 2), 1.5, d.vel.z * 0.3 + rand(-2, 2));
    d.lightMat.emissiveIntensity = 0;
    emitSparks(point, 24, 6, 2);
    addKillfeed('DRONE ABATIDO', true);
  }
}
function crashDrone(d){
  const p = d.g.position.clone(); p.y = 0.4;
  Audio_.explode();
  addParticles(p, 0xffb040, 18, 8, 6, 1.3);
  addParticles(p, 0x3a3834, 12, 5, 4, 1.8);
  emitSparks(p, 40, 7, 3);
  const light = new THREE.PointLight(0xffa030, 14, 14, 2); light.position.copy(p).setY(1.2); scene.add(light);
  fx.explosions.push({ light, t:0, life:0.35 });
  if (camera.position.distanceTo(p) < 12) shake(0.25, 0.3);
  d.state = 'dead'; d.g.visible = false; d.respawn = 25;
}
const activeDroneMeshes = () => droneHitMeshes.filter(m => m.userData.drone.state === 'fly');
function clearRuinsFX(){
  ruinsFX.drones.forEach(d => scene.remove(d.g));
  ruinsFX.drones.length = 0; droneHitMeshes.length = 0;
  if (ruinsFX.motes){ scene.remove(ruinsFX.motes); ruinsFX.motes.geometry.dispose(); ruinsFX.motes.material.dispose(); ruinsFX.motes = null; }
  sparks.length = 0;
}
/** Extras do mapa Ruínas criados depois da montagem: drones e poeira no ar. */
function ruinasExtras(){
  spawnDrones([
    { kind:'orbit', x:0, y:12, z:-8, r:16, w:0.16 },
    { kind:'line',  x:-2, y:11, z:-3, r:32, w:0.09 },
    { kind:'eight', x:30, y:9.5, z:-12, r:6, w:0.35 }
  ]);
  ruinsFX.motes = buildMotes();
}

/* Impacto de bala por material: metal solta faísca, o resto levanta pó da cor da superfície. */
let METAL_SET = null;
const _white = new THREE.Color(0xffffff);
function impactFX(h, n){
  METAL_SET = METAL_SET || new Set([MAT.metal, MAT.burnt, MAT.kRebar, MAT.barrel, MAT.contA, MAT.contB, MAT.contC, MAT.gSteel]);
  const m = h.object.material;
  if (METAL_SET.has(m)){ emitSparks(h.point, randInt(4, 8), 4, 0.6, n); addParticles(h.point, 0x55524c, 2, 2.5, 8, 0.35); return; }
  const c = m && m.color ? m.color.clone().lerp(_white, 0.3).getHex() : 0xbbbbaa;
  addParticles(h.point, c, 3, 3.2, 8, 0.45);
}
const _im = new THREE.Matrix4();
function hitNormal(h, dir){
  if (!h.face) return dir.clone().negate();
  const n = h.face.normal.clone();
  if (h.instanceId !== undefined && h.object.isInstancedMesh){ h.object.getMatrixAt(h.instanceId, _im); n.transformDirection(_im); }
  return n.transformDirection(h.object.matrixWorld);
}
/* Vidro: a bala atravessa e deixa a estrela de trinca; cacos brilhantes caem. */
const glassRay = new THREE.Raycaster();
const glassHoleTex = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const x = c.getContext('2d');
  x.strokeStyle = 'rgba(245,250,255,0.9)'; x.lineWidth = 1.2;
  for (let i = 0; i < 11; i++){ const a = i / 11 * TAU + Math.random() * 0.3, r = 14 + Math.random() * 16; x.beginPath(); x.moveTo(32, 32); x.lineTo(32 + Math.cos(a) * r, 32 + Math.sin(a) * r); x.stroke(); }
  x.beginPath(); x.arc(32, 32, 9, 0, TAU); x.stroke();
  x.fillStyle = 'rgba(230,238,242,0.95)'; x.beginPath(); x.arc(32, 32, 4.5, 0, TAU); x.fill();
  x.fillStyle = 'rgba(10,12,14,1)'; x.beginPath(); x.arc(32, 32, 2.2, 0, TAU); x.fill();
  return new THREE.CanvasTexture(c);
})();
function glassCross(origin, dir, far){
  if (!glassMeshes.length) return;
  glassRay.set(origin, dir); glassRay.far = far;
  const g = glassRay.intersectObjects(glassMeshes, false);
  if (!g.length) return;
  const n = hitNormal(g[0], dir); if (n.dot(dir) > 0) n.negate();
  addDecal(g[0].point, n, glassHoleTex);
  addParticles(g[0].point, 0xd6e6ec, 5, 2.6, 9, 0.3);
  Audio_.click(0.07, 5600, 0.05, 2.8);
}

/* --- Sequências (scorestreaks): UAV por abates, helicóptero pela loja --- */
const streaks = { uavT:0, heli:null, heliQueued:false };
function callUAV(){
  streaks.uavT = 25;
  addKillfeed('UAV ONLINE', true);
  Audio_.waveStart();
}
function buildHeli(){
  const g = new THREE.Group();
  const body = new THREE.MeshStandardMaterial({ color:0x4b5140 }), dark = new THREE.MeshStandardMaterial({ color:0x22251f });
  const glass = new THREE.MeshStandardMaterial({ color:0x6d8aa0, emissive:0x1a2530 });
  const add = (geo, mat, x,y,z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x,y,z); m.castShadow = true; g.add(m); return m; };
  add(new THREE.BoxGeometry(1.5,1.5,4.4), body, 0,0,0);
  add(new THREE.BoxGeometry(1.2,0.9,1.4), glass, 0,0.15,-2.6);
  const boom = add(new THREE.CylinderGeometry(0.22,0.38,5,8), body, 0,0.25,4.3); boom.rotation.x = Math.PI/2;
  add(new THREE.BoxGeometry(0.12,1.4,0.9), body, 0,0.9,6.6);
  add(new THREE.BoxGeometry(3.2,0.12,0.7), dark, 0,-0.25,0.2);                   // asas curtas
  add(new THREE.CylinderGeometry(0.2,0.2,1.3,8), dark, 1.5,-0.45,0.2).rotation.x = Math.PI/2;
  add(new THREE.CylinderGeometry(0.2,0.2,1.3,8), dark,-1.5,-0.45,0.2).rotation.x = Math.PI/2;
  add(new THREE.CylinderGeometry(0.08,0.08,0.8,6), dark, 0,-0.95,-2.1);          // canhão
  add(new THREE.CylinderGeometry(0.1,0.1,0.6,6), dark, 0,1.05,0);
  const rotor = new THREE.Group(); rotor.position.set(0,1.4,0); g.add(rotor);
  [0, Math.PI/2].forEach(a => { const b = new THREE.Mesh(new THREE.BoxGeometry(11,0.05,0.35), dark); b.rotation.y = a; rotor.add(b); });
  const tail = new THREE.Group(); tail.position.set(0.12,0.9,6.7); g.add(tail);
  const tb = new THREE.Mesh(new THREE.BoxGeometry(0.04,1.8,0.18), dark); tail.add(tb);
  return { g, rotor, tail };
}
function launchHeli(){
  if (streaks.heli) { streaks.heli.t = Math.max(streaks.heli.t, 45); return; }
  const h = buildHeli();
  scene.add(h.g);
  streaks.heli = Object.assign(h, { t:45, ang:Math.random()*TAU, fireCd:2.5, burst:0 });
  addKillfeed('HELICÓPTERO DE ATAQUE A CAMINHO', true);
}
function removeHeli(){
  const h = streaks.heli; if (!h) return;
  scene.remove(h.g); h.g.traverse(o => { if (o.isMesh){ o.geometry.dispose(); } });
  streaks.heli = null;
}
function updateStreaks(dt){
  if (streaks.uavT > 0) streaks.uavT -= dt;
  const h = streaks.heli; if (!h) return;
  h.t -= dt;
  const R = MAPDEF().mm * 0.55, alt = 19;
  // chega e sai por fora do mapa; no meio circula o centro
  const inK = clamp((45 - h.t) / 4, 0, 1), outK = clamp(h.t / 4, 0, 1), k = Math.min(inK, outK);
  h.ang += dt * 0.28;
  const x = Math.cos(h.ang) * R * (1 + (1-k)*2.5), z = Math.sin(h.ang) * R * (1 + (1-k)*2.5);
  h.g.position.set(x, alt + Math.sin(clockT*0.9)*0.6, z);
  h.g.rotation.y = -h.ang + Math.PI;                  // nariz na direção do voo
  h.g.rotation.z = 0.16;                              // inclinado para dentro da curva
  h.rotor.rotation.y += dt * 38; h.tail.rotation.x += dt * 45;
  if (h.t <= 0){ removeHeli(); addKillfeed('HELICÓPTERO SAIU', false); return; }
  if (k < 1) return;
  h.fireCd -= dt;
  if (h.fireCd > 0) return;
  // alvo: inimigo vivo mais próximo do ponto sob o helicóptero
  let best = null, bd = 60;
  for (const e of enemies){ if (e.dead || e.team === 'A') continue; const d = Math.hypot(e.pos.x - x, e.pos.z - z); if (d < bd){ bd = d; best = e; } }
  if (!best){ h.fireCd = 0.5; return; }
  h.burst = (h.burst + 1) % 4;
  h.fireCd = h.burst === 0 ? 1.4 : 0.14;
  const from = h.g.position.clone().add(new THREE.Vector3(0,-1.2,0));
  const to = best.pos.clone().add(new THREE.Vector3(rand(-0.6,0.6), 1.1, rand(-0.6,0.6)));
  addTracer(from, to, 0xffb060);
  addParticles(to, 0xbbbbaa, 3, 3, 8, 0.45);
  Audio_.shot({ gain:0.22, cut:2600, low:90, dur:0.28, rate:0.7 });
  damageEnemy(best, 34 * DIFF().hp, false, to);
}

/* --- Economia: créditos (CR) ------------------------------------------
   Pontos medem desempenho e nunca são gastos; créditos são a moeda.
   Fontes: abates (metade dos pontos) e bônus de onda.
   Drenos: loja entre ondas. Valores [PLACEHOLDER] até playtest,
   justificativa em economy-spec.md. */
const ECO = {
  killRate:0.5, waveBase:150, waveStep:40, breakT:12,
  freeMags:1.5, freeArmor:20,
  upCost:[600, 1200, 2400]
};
const SHOP = [
  { k:'ammo',  name:'Munição completa',   cost:()=>300, ok:()=>weapons.some(w=>w.reserve<w.reserveMax),
    go:()=>weapons.forEach(w=>w.reserve=w.reserveMax) },
  { k:'armor', name:'Placa de colete +50', cost:()=>400, ok:()=>player.armor<player.maxArmor,
    go:()=>player.armor=Math.min(player.maxArmor, player.armor+50) },
  { k:'gren',  name:()=>LETHALS[activeClass().leth].name + ' +1', cost:()=>250, ok:()=>!LETHALS[activeClass().leth].none && player.grenades<GREN_MAX,
    go:()=>player.grenades++ },
  { k:'med',   name:'Kit médico',          cost:()=>350, ok:()=>player.hp<player.maxHp,
    go:()=>player.hp=player.maxHp },
  { k:'up',    name:()=>'Aprimorar ' + weapons[curW].name + ' (dano +12%)',
    cost:()=>ECO.upCost[weapons[curW].lvl||0], ok:()=>(weapons[curW].lvl||0) < ECO.upCost.length,
    go:()=>weapons[curW].lvl=(weapons[curW].lvl||0)+1 },
  { k:'heli',  name:'Helicóptero de ataque (45 s)', cost:()=>2500, ok:()=>!streaks.heliQueued && !streaks.heli,
    go:()=>{ streaks.heliQueued = true; } }
];
function earn(n){ stats.credits += n; }
function buy(i){
  const it = SHOP[i]; if (!it || !wave.inBreak) return;
  const c = it.cost();
  if (!it.ok() || c === undefined || stats.credits < c){ Audio_.empty && Audio_.empty(); return; }
  stats.credits -= c; stats.spent += c; it.go();
  addKillfeed((typeof it.name==='function'?it.name():it.name).toUpperCase() + '  −' + c + ' CR', false);
  renderShop(); updateHUD();
}
function renderShop(){
  bridge.set({ shop: SHOP.map((it,i)=>{
    const c = it.cost(), can = it.ok() && c !== undefined && stats.credits >= c;
    const nm = typeof it.name==='function' ? it.name() : it.name;
    const price = !it.ok() ? (it.k==='up' ? 'MÁX' : (it.k==='heli' ? 'EM USO' : 'CHEIO')) : c + ' CR';
    return { key:String((i+5)%10), name:nm, price, can };
  }) });
}
function openShop(){ renderShop(); bridge.set({ shopOpen:true, shopT:Math.ceil(wave.breakT) }); }

function startWave(n){
  stats.wave = n;
  wave.toSpawn = 4 + Math.floor(n * 2.2);
  wave.alive   = wave.toSpawn;
  wave.spawnCd = 0.6;
  wave.active  = true;
  wave.inBreak = false;

  // reabastece parcialmente a cada onda
  weapons.forEach(w => { w.reserve = Math.min(w.reserveMax, w.reserve + Math.ceil(w.magMax * ECO.freeMags)); });
  if (!LETHALS[activeClass().leth].none) player.grenades = Math.min(GREN_MAX, player.grenades + 1);
  player.tacticals = TAC_MAX();
  player.armor = Math.min(player.maxArmor, player.armor + ECO.freeArmor);   // colete básico por onda; o resto vem da loja

  bridge.set({ shopOpen:false });
  if (streaks.heliQueued){ streaks.heliQueued = false; launchHeli(); }
  showWaveBanner('ONDA ' + n, n === 1 ? 'PREPARE-SE' : 'INIMIGOS SE APROXIMANDO');
  Audio_.waveStart();
  updateHUD();
}

function waveComposition(n){
  // sorteia o tipo conforme a dificuldade da onda
  const r = Math.random();
  if (n >= 8 && r < 0.14) return 'heavy';
  if (n >= 5 && r < 0.22) return 'heavy';
  if (n >= 4 && r < 0.38) return 'sniper';
  if (n >= 2 && r < 0.58) return 'runner';
  return 'grunt';
}

function pickSpawn(){
  // Longe o bastante para o jogador reagir, perto o bastante para o combate
  // começar rápido: escolhe entre os pontos válidos MAIS PRÓXIMOS.
  const cands = spawnPoints
    .map(p => ({ p, d: p.distanceTo(player.pos) }))
    .filter(o => o.d >= MAPDEF().minDist)
    .sort((a,b) => a.d - b.d)
    .slice(0, 5);
  const chosen = cands.length ? pick(cands).p : pick(spawnPoints);
  return chosen.clone().add(new THREE.Vector3(rand(-2.5,2.5), 0, rand(-2.5,2.5)));
}

function updateWave(dt){
  if (!wave.active) return;

  if (wave.inBreak){
    wave.breakT -= dt;
    bridge.set({ shopT: Math.ceil(Math.max(0, wave.breakT)) });
    if (wave.breakT <= 0) startWave(stats.wave + 1);
    return;
  }

  if (wave.toSpawn > 0){
    wave.spawnCd -= dt;
    const concurrent = clamp(3 + Math.floor(stats.wave * 0.7) + DIFF().conc, 2, 12);
    if (wave.spawnCd <= 0 && enemies.filter(e=>!e.dead).length < concurrent){
      spawnEnemy(waveComposition(stats.wave), pickSpawn());
      wave.toSpawn--;
      wave.spawnCd = Math.max(0.32, 1.5 - stats.wave * 0.06);
    }
  }

  if (wave.toSpawn <= 0 && enemies.filter(e => !e.dead).length === 0){
    // onda concluída
    const bonus = 250 + stats.wave * 120;
    stats.score += bonus;
    addKillfeed('ONDA ' + stats.wave + ' CONCLUÍDA  +' + bonus, false);
    showWaveBanner('ONDA LIMPA', '+' + bonus + ' PONTOS');
    player.hp = Math.min(player.maxHp, player.hp + 45);
    earn(ECO.waveBase + stats.wave * ECO.waveStep);
    wave.inBreak = true;
    wave.breakT = ECO.breakT;
    openShop();
    updateHUD();
  }
}

/* ---------------------------------------------------------------
   12. Efeitos: tracers, decalques, sangue, granadas
   --------------------------------------------------------------- */
const fx = { tracers:[], decals:[], particles:[], grenades:[], explosions:[] };

const tracerMat = new THREE.LineBasicMaterial({ color:0xffe6a0, transparent:true, opacity:0.9 });
function addTracer(from, to, color){
  const geo = new THREE.BufferGeometry().setFromPoints([from.clone(), to.clone()]);
  const mat = tracerMat.clone();
  if (color) mat.color.setHex(color);
  const line = new THREE.Line(geo, mat);
  scene.add(line);
  fx.tracers.push({ line, t:0, life:0.075 });
}

/* textura de furo de bala (canvas) */
const holeTex = (() => {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(32,32,2, 32,32,30);
  g.addColorStop(0,   'rgba(8,8,8,0.95)');
  g.addColorStop(0.45,'rgba(24,20,16,0.65)');
  g.addColorStop(1,   'rgba(40,35,30,0)');
  x.fillStyle = g;
  x.beginPath(); x.arc(32,32,30,0,TAU); x.fill();
  return new THREE.CanvasTexture(c);
})();
const decalGeo = new THREE.PlaneGeometry(0.22, 0.22);

function addDecal(point, normal, tex){
  if (fx.decals.length > 90){
    const old = fx.decals.shift();
    scene.remove(old.mesh); old.mesh.material.dispose();
  }
  const mat = new THREE.MeshBasicMaterial({
    map:tex || holeTex, transparent:true, opacity:0.95, depthWrite:false
  });
  const m = new THREE.Mesh(decalGeo, mat);
  m.position.copy(point).addScaledVector(normal, 0.012);
  m.lookAt(point.clone().add(normal));
  m.rotateZ(Math.random()*TAU);
  m.scale.setScalar(rand(0.75,1.3));
  scene.add(m);
  fx.decals.push({ mesh:m, t:0, life:14 });
}

const partGeo = new THREE.BoxGeometry(0.07,0.07,0.07);
function addParticles(point, color, count, spd, grav, size){
  for (let i=0;i<count;i++){
    const mat = new THREE.MeshBasicMaterial({ color, transparent:true, opacity:1 });
    const m = new THREE.Mesh(partGeo, mat);
    m.position.copy(point);
    m.scale.setScalar(size || rand(0.5,1.3));
    scene.add(m);
    fx.particles.push({
      mesh:m,
      vel:new THREE.Vector3(rand(-1,1), rand(-0.2,1.1), rand(-1,1)).normalize().multiplyScalar(spd*rand(0.4,1.2)),
      t:0, life:rand(0.35,0.85), grav: grav === undefined ? 9 : grav
    });
  }
}

function throwGrenade(tac){
  if (gameState !== STATE.PLAYING) return;
  const L = tac ? TACTICALS[activeClass().tact] : LETHALS[activeClass().leth];
  if (!L || L.none) return;
  if (tac){ if ((player.tacticals|0) <= 0) return; player.tacticals--; }
  else { if (player.grenades <= 0) return; player.grenades--; }

  const m = new THREE.Mesh(L.sticky ? new THREE.BoxGeometry(0.16,0.07,0.12) : new THREE.SphereGeometry(0.11, 10, 8),
                           new THREE.MeshStandardMaterial({ color:L.color }));
  m.castShadow = true;
  const dir = new THREE.Vector3();
  camera.getWorldDirection(dir);
  m.position.copy(camera.position).addScaledVector(dir, 0.55);
  scene.add(m);

  fx.grenades.push({
    mesh:m,
    vel: dir.clone().multiplyScalar(20).add(new THREE.Vector3(0, 3.4, 0)),
    t:0, fuse:L.fuse, sticky:!!L.sticky, stuck:false, kind:L.kind
  });
  Audio_.click(0.12, 800, 0.08, 0.9);
  updateHUD();
}

function explode(pos){
  Audio_.explode();
  addParticles(pos, 0xffb040, 34, 13, 6, 1.7);
  addParticles(pos, 0x4a4a44, 22, 8, 4, 2.4);

  const light = new THREE.PointLight(0xffa030, 26, 22, 2);
  light.position.copy(pos);
  scene.add(light);
  fx.explosions.push({ light, t:0, life:0.42 });

  // dano em área nos inimigos
  const R = 7.5;
  for (const e of enemies){
    if (e.dead || e.team === 'A') continue;
    const d = e.pos.distanceTo(pos);
    if (d < R){
      const dmg = 190 * (1 - d/R);
      damageEnemy(e, dmg, false, pos);
    }
  }
  // dano no jogador (fogo amigo)
  const pc = player.pos.clone(); pc.y += 0.9;
  const dp = pc.distanceTo(pos);
  if (dp < R) damagePlayer(70 * (1 - dp/R), pos);

  // tremida de câmera
  shake(0.55, 0.5);
}

/* ---------------------------------------------------------------
   13. Tiro
   --------------------------------------------------------------- */
const raycaster = new THREE.Raycaster();
const _dir = new THREE.Vector3();
const _tmp = new THREE.Vector3();

function currentSpread(w){
  let s = player.ads ? lerp(w.spread, w.adsSpread, player.adsAmount) : w.spread;
  const speed = Math.hypot(player.vel.x, player.vel.z);
  const moveFactor = clamp(speed / SPEED.walk, 0, 1.4);
  s *= 1 + (w.moveSpreadMul - 1) * moveFactor * 0.6;
  if (!player.grounded) s *= 1.9;
  if (player.crouch)    s *= 0.62;
  return s;
}

function tryShoot(){
  const w = weapons[curW];
  if (player.reloading || player.switching > 0) return;
  if (player.sprint || player.sprintOutT > 0) return;   // arma ainda subindo depois da corrida

  if (w.mag <= 0){
    if (!shotLatch){
      Audio_.empty();
      shotLatch = true;
      flashReloadHint();
    }
    return;
  }
  if (!w.auto && shotLatch) return;

  // Consome o "crédito" de tempo acumulado: a cadência não depende do FPS.
  const interval = 60 / w.rpm;
  let fired = 0;
  while (player.fireCd <= 0 && w.mag > 0 && fired < 4){
    shotLatch = true;
    w.mag--;
    stats.shots++;
    fireBullet(w);

    // recuo: soma radianos ao alvo, que depois decai de volta ao centro
    const adsK = player.ads ? 0.62 : 1, crK = player.crouch ? 0.82 : 1;
    player.recoilTarget.y += w.recoilV * adsK * crK;
    player.recoilTarget.x += rand(-w.recoilH, w.recoilH) * adsK;
    player.kickZ = Math.min(player.kickZ + w.kick, w.kick * 2.2);

    player.fireCd += interval;
    fired++;
    if (!w.auto) break;
  }

  if (fired > 0){
    muzzleLight.position.copy(camera.position).addScaledVector(_dir.copy(getAimDir()), 0.7);
    muzzleLight.intensity = 3.4;
    flashMat.opacity = 0.95;
    gunFlash.rotation.z = Math.random() * TAU;
    gunFlash.scale.setScalar(rand(0.8, 1.35));
    Audio_.shot(w.sound);
    if (w.mag === 0) flashReloadHint();
    updateAmmoHUD();
  }
}

function getAimDir(){
  const d = new THREE.Vector3();
  camera.getWorldDirection(d);
  return d;
}

function fireBullet(w){
  playerNoise(w.suppressed ? 10 : 70);
  const origin = camera.position.clone();
  const baseDir = getAimDir();
  const spread = currentSpread(w);

  // base ortonormal para dispersar
  const up = new THREE.Vector3(0,1,0);
  const right = new THREE.Vector3().crossVectors(baseDir, up).normalize();
  const realUp = new THREE.Vector3().crossVectors(right, baseDir).normalize();

  const targets = worldMeshes.concat(enemyHitMeshes, activeDroneMeshes());
  // Acumula o dano por inimigo para que uma cartuchada vire UM número, não nove.
  const hitMap = new Map();
  let anyHit = false;

  for (let p = 0; p < w.pellets; p++){
    const ang = Math.random() * TAU;
    const rad = Math.sqrt(Math.random()) * spread;
    const dir = baseDir.clone()
      .addScaledVector(right,  Math.cos(ang) * rad)
      .addScaledVector(realUp, Math.sin(ang) * rad)
      .normalize();

    raycaster.set(origin, dir);
    raycaster.far = w.range;
    const hits = raycaster.intersectObjects(targets, false);

    let end = origin.clone().addScaledVector(dir, w.range);

    if (hits.length){
      const h = hits[0];
      end = h.point.clone();
      const e = h.object.userData.enemy;

      if (h.object.userData.drone){ hitDrone(h.object.userData.drone, w.damage, h.point); }
      else if (e && e.team === 'A'){ /* aliado: a bala para nele, sem dano */ }
      else if (e && !e.dead){
        const part = h.object.userData.part;
        const isHead = part === 'head';
        let dmg = w.damage * (1 + 0.12 * (w.lvl || 0)) * (isHead ? w.headMult : (part === 'limb' ? 0.82 : 1));

        // queda de dano com a distância
        const dist = h.distance;
        if (w.id === 'm870') dmg *= clamp(1 - dist/38, 0.28, 1);
        else if (dist > 45)     dmg *= clamp(1 - (dist-45)/220, 0.55, 1);

        let acc = hitMap.get(e);
        if (!acc){ acc = { dmg:0, head:false, point:h.point.clone() }; hitMap.set(e, acc); }
        acc.dmg += dmg;
        if (isHead){ acc.head = true; acc.point.copy(h.point); }

        addParticles(h.point, 0xaa1414, 3, 4, 7, 0.6);
        anyHit = true;
      } else {
        // impacto no cenário
        const n = hitNormal(h, dir);
        addDecal(h.point, n);
        impactFX(h, n);
      }
    }
    glassCross(origin, dir, hits.length ? hits[0].distance : w.range);

    // tracer só em alguns projéteis, para não poluir
    if (w.pellets === 1 || p % 3 === 0){
      const muzzle = origin.clone()
        .addScaledVector(baseDir, 0.6)
        .addScaledVector(right, 0.12)
        .addScaledVector(realUp, -0.10);
      addTracer(muzzle, end);
    }
  }

  // aplica o dano acumulado (um evento por inimigo atingido)
  let anyKill = false, anyHead = false;
  hitMap.forEach((acc, e) => {
    damageEnemy(e, acc.dmg, acc.head, acc.point);
    if (acc.head) anyHead = true;
    if (e.dead) anyKill = true;
  });

  if (anyHit){
    stats.hits++;
    showHitmarker(anyKill, anyHead);
  }
}

function damageEnemy(e, dmg, isHead, point, killer){
  if (e.dead) return;
  e.hp -= dmg;
  e.damageFlash = 0.12;
  e.hpBar.grp.visible = true;
  e.hpBarTimer = 3.0;
  e.alertDelay = 0;          // levou tiro: reage na hora


  if (e.hp <= 0){
    e.dead = true;
    e.deathT = 0;
    wave.alive = Math.max(0, wave.alive - 1);
    if (settings.mode === 'tdm') tdmOnBotDeath(e, killer);
    for (let i = enemyHitMeshes.length-1; i>=0; i--) if (enemyHitMeshes[i].userData.enemy === e) enemyHitMeshes.splice(i,1);
    e.hpBar.grp.visible = false;
    if (killer){ addKillfeed(botName(killer) + '  ▸  ' + botName(e), false); return; }   // bot matou bot

    stats.kills++;
    addCareerKill();
    stats.streak++;
    if (stats.streak > stats.bestStreak) stats.bestStreak = stats.streak;
    if (isHead) stats.headshots++;

    const base = e.cfg.score * DIFF().score;      // dificuldade maior paga mais
    const pts  = Math.round(isHead ? base * 1.5 : base);
    stats.score += pts;
    earn(Math.round(pts * ECO.killRate));

    addKillfeed((isHead ? 'HEADSHOT ' : '') + enemyLabel(e.type) + '  +' + pts, isHead);
    if (isHead) Audio_.headshot(); else Audio_.killSound();

    addParticles(e.pos.clone().add(new THREE.Vector3(0,1.1,0)), 0x8a1010, 12, 5, 8, 0.9);

    // recompensa a sequência
    if (stats.streak === 3) callUAV();
    if (settings.mode === 'tdm' && stats.streak === 7) launchHeli();   // no mata-mata o helicóptero é sequência
    if (stats.streak > 0 && stats.streak % 5 === 0){
      const bonus = stats.streak * 40;
      stats.score += bonus;
      addKillfeed('SEQUÊNCIA ×' + stats.streak + '  +' + bonus, true);
      player.hp = Math.min(player.maxHp, player.hp + 15);
      weapons.forEach(w => { w.reserve = Math.min(w.reserveMax, w.reserve + w.magMax); });
    }

    // desativa hitboxes
    for (let i = enemyHitMeshes.length-1; i>=0; i--){
      if (enemyHitMeshes[i].userData.enemy === e) enemyHitMeshes.splice(i,1);
    }
    e.hpBar.grp.visible = false;
    updateHUD();
  }
}

/* --- recarga / troca --- */
let shotLatch = false;
let pendingSwitch = -1, pendingReload = false;

function startReload(){
  if (gameState !== STATE.PLAYING) return;
  const w = weapons[curW];
  if (player.reloading) return;
  if (player.switching > 0){ pendingReload = true; return; }   // enfileira
  // bala na câmara: com o pente ainda com munição cabe magMax + 1
  const tactical = w.mag > 0;
  const cap = w.magMax + (tactical && w.chamber ? 1 : 0);
  if (w.mag >= cap || w.reserve <= 0) return;

  player.reloading = true;
  player.reloadT = 0;
  player.reloadTac = tactical;
  // tática: só troca o pente; vazia: troca e ainda puxa o ferrolho (mais lenta)
  player.reloadDur = w.reload * (tactical ? 0.82 : 1);
  Audio_.reloadOut();
  setTimeout(() => { if (player.reloading) Audio_.reloadIn(); }, w.reload * 520);
  $('reload-hint').classList.remove('on');
}

function finishReload(){
  const w = weapons[curW];
  const need = w.magMax + (player.reloadTac && w.chamber ? 1 : 0) - w.mag;
  const take = Math.min(need, w.reserve);
  w.mag += take;
  w.reserve -= take;
  player.reloading = false;
  Audio_.click(0.15, 1200, 0.06, 1.0);
  updateHUD();
}

function switchWeapon(i){
  if (i < 0 || i >= weapons.length) return;
  // Durante a animação de troca o comando é enfileirado, não descartado:
  // tocar 2 e 3 rapidamente tem que terminar na arma 3.
  if (player.switching > 0){ pendingSwitch = (i === curW) ? -1 : i; return; }
  if (i === curW) return;
  prevW = curW;
  curW = i;
  player.reloading = false;
  player.switching = weapons[i].switchTime;
  Audio_.switchW();
  updateHUD();
  showWeaponList();
}

/* A lista de armas não fica na tela: aparece ao trocar e some em 2 s. */
let wlTimer = null;
function showWeaponList(){
  const wl = $('weapons');
  wl.classList.add('show');
  clearTimeout(wlTimer);
  wlTimer = setTimeout(() => wl.classList.remove('show'), 2000);
}

/* ---------------------------------------------------------------
   14. Dano ao jogador
   --------------------------------------------------------------- */
let shakeAmt = 0, shakeT = 0, shakeDur = 0;
function shake(amount, dur){
  shakeAmt = Math.max(shakeAmt, amount);
  shakeDur = Math.max(shakeDur, dur);
  shakeT = shakeDur;
}

function damagePlayer(dmg, fromPos){
  if (!player.alive || gameState !== STATE.PLAYING) return;

  if (player.armor > 0){
    const absorbed = Math.min(player.armor, dmg * 0.6);
    player.armor -= absorbed;
    dmg -= absorbed;
  }
  player.hp -= dmg;
  player.lastDamage = clockT;
  stats.streak = 0;

  Audio_.hurt();
  showDamageDir(fromPos);

  const v = $('vignette');
  v.style.opacity = String(clamp(0.35 + (1 - player.hp/player.maxHp) * 0.65, 0, 1));
  setTimeout(() => {
    if (player.hp > 0) v.style.opacity = String(clamp((1 - player.hp/player.maxHp) * 0.55, 0, 0.75));
  }, 180);

  if (player.hp <= 0){
    player.hp = 0;
    playerDeath();
  }
  updateHUD();
}

function playerDeath(){
  player.alive = false;
  gameState = STATE.DEAD;
  mouseDown = false;
  $('scope').style.opacity = '0';   // updateViewmodel para de rodar ao morrer
  if (settings.mode === 'tdm' && !tdm.over){
    // mata-mata: ponto para o inimigo e renascimento em 4 s, sem sair do jogo
    tdm.b++; stats.streak = 0; tdm.respawnT = 4;
    addKillfeed('VOCÊ FOI ABATIDO', false);
    showWaveBanner('ABATIDO', 'REAPARECENDO…');
    checkTdmEnd(); updateHUD();
    return;
  }
  if (document.pointerLockElement) document.exitPointerLock();

  saveProfile();
  const best = Math.max(readBest(), stats.score);
  try { localStorage.setItem('blackout_best', String(best)); } catch(e){}
  bridge.set({ gameover: goView('MISSÃO FALHOU', 'VOCÊ FOI ABATIDO', String(stats.wave), best) });


  setTimeout(() => {
    $('hud').classList.add('hidden');
    $('touch').classList.add('hidden');
    bridge.set({ screen:'gameover' });
  }, 900);
}

/* ---------------------------------------------------------------
   15. HUD
   --------------------------------------------------------------- */
/* Atualização barata, chamada a cada disparo. */
function updateAmmoHUD(){
  const w = weapons[curW];
  if (!w) return;
  const magEl = document.querySelector('#ammo .mag');
  magEl.textContent = w.mag;
  magEl.classList.toggle('low', w.mag <= Math.ceil(w.magMax * 0.25));
  document.querySelector('#ammo .res').textContent = ' / ' + w.reserve;
  renderMagPips(w);
}

/* Pente em tracinhos. Até 10 balas, um tracinho por bala; acima, cada um vale 10%. */
function renderMagPips(w){
  const n = w.magMax <= 10 ? w.magMax : 10;
  const cheios = w.magMax <= 10 ? w.mag : Math.ceil(w.mag / w.magMax * 10);
  let html = '';
  for (let i = 0; i < n; i++) html += (i < n - cheios) ? '<i></i>' : '<i class="on"></i>';
  $('mag-pips').innerHTML = html;
}

/* Atualização completa (reconstrói a lista de armas) — não chamar por disparo. */
function updateHUD(){
  const w = weapons[curW];
  if (!w) return;

  const hpPct = clamp(player.hp / player.maxHp, 0, 1) * 100;
  const fill = $('health-fill');
  fill.style.width = hpPct + '%';
  fill.classList.toggle('low', hpPct <= 35);
  $('health-num').textContent = Math.ceil(player.hp);
  $('armor-fill').style.width = clamp(player.armor / player.maxArmor, 0, 1) * 100 + '%';

  const magEl = document.querySelector('#ammo .mag');
  magEl.textContent = w.mag;
  magEl.classList.toggle('low', w.mag <= Math.ceil(w.magMax * 0.25));
  document.querySelector('#ammo .res').textContent = ' / ' + w.reserve;
  $('weapon-name').textContent = w.name;
  $('fire-mode').textContent = w.mode;
  renderMagPips(w);
  $('gren-num').textContent = player.grenades;
  $('tac-num').textContent = player.tacticals || 0;
  $('stance').textContent = player.crouch ? 'AGACHADO' : (player.sprint ? 'CORRENDO' : '');

  // lista de armas (fica escondida; aparece ao trocar)
  const wl = $('weapons');
  let html = '';
  weapons.forEach((ww, i) => {
    html += '<div class="wslot' + (i === curW ? ' active' : '') + '"><b>' + (i+1) + '</b>' +
            ww.name + '<span class="wa">' + ww.mag + '/' + ww.reserve + '</span></div>';
  });
  wl.innerHTML = html;

  $('map-name').textContent = MAPDEF().name;
  $('map-diff').textContent = DIFF().name;
  $('wave-txt').textContent = 'ONDA ' + String(stats.wave).padStart(2, '0');
  const left = enemies.filter(e => !e.dead).length + wave.toSpawn;
  $('enemies-left').textContent = String(left).padStart(2, '0');
  $('score-val').textContent = stats.score.toLocaleString('pt-BR');
  $('credits-val').textContent = stats.credits.toLocaleString('pt-BR');
  $('streak').textContent = stats.streak >= 2 ? ('SEQUÊNCIA ×' + stats.streak) : '';
  document.body.classList.toggle('mode-tdm', settings.mode === 'tdm');
  if (settings.mode === 'tdm'){
    $('wave-txt').textContent = 'MATA-MATA 6×6' + (settings.limit ? ' · ATÉ ' + settings.limit : '');
    $('enemies-left').textContent = tdm.a + ' – ' + tdm.b;
    document.querySelector('.left-l').textContent = 'ALIADOS · INIMIGOS';
  } else document.querySelector('.left-l').textContent = 'RESTANTES';
}

function flashReloadHint(){ $('reload-hint').classList.add('on'); }

let hmTimer = null;
function showHitmarker(kill, head){
  const hm = $('hitmarker');
  hm.classList.toggle('kill', !!kill);
  hm.style.opacity = '1';
  Audio_.hitMarker();
  clearTimeout(hmTimer);
  // curto e seco; o abate fica um pouco mais para ser notado
  hmTimer = setTimeout(() => { hm.style.opacity = '0'; }, kill ? 240 : 120);
}

function addKillfeed(text, highlight){
  const kf = $('killfeed');
  const d = document.createElement('div');
  if (highlight) d.className = 'hs';
  d.textContent = text;
  kf.insertBefore(d, kf.firstChild);
  while (kf.children.length > 5) kf.removeChild(kf.lastChild);
  setTimeout(() => {
    d.style.transition = 'opacity .5s';
    d.style.opacity = '0';
    setTimeout(() => d.remove(), 520);
  }, 3600);
}

function showWaveBanner(big, sub){
  const b = $('wave-banner');
  b.querySelector('.big').textContent = big;
  b.querySelector('.sub').textContent = sub;
  b.style.transition = 'none';
  b.style.opacity = '1';
  b.style.transform = 'translate(-50%,-50%) scale(1.06)';
  requestAnimationFrame(() => {
    b.style.transition = 'opacity 1.6s ease-in 1.1s, transform 1.5s ease-out';
    b.style.opacity = '0';
    b.style.transform = 'translate(-50%,-50%) scale(1)';
  });
}

function showDamageDir(fromPos){
  if (!fromPos) return;
  const dx = fromPos.x - player.pos.x, dz = fromPos.z - player.pos.z;
  const angToSrc = Math.atan2(dx, dz);
  const rel = angToSrc - (player.yaw + Math.PI);
  const deg = -rel * 180 / Math.PI;

  const arc = document.createElement('div');
  arc.className = 'dmg-arc';
  arc.style.transform = 'rotate(' + deg + 'deg)';
  $('dmg-dirs').appendChild(arc);
  requestAnimationFrame(() => {
    arc.style.transition = 'opacity 90ms';
    arc.style.opacity = '1';
    setTimeout(() => {
      arc.style.transition = 'opacity 400ms';
      arc.style.opacity = '0';
      setTimeout(() => arc.remove(), 600);
    }, 380);
  });
}

/* --- bússola ---------------------------------------------------------
   Norte é -z, leste é +x. A faixa cobre três voltas para a janela nunca
   sair dela. Só marca inimigo que tem linha de visão (foi avistado). */
const COMPASS_W = 520, PX_DEG = 4.4;     // ~118° visíveis
const CARDEAIS = { 0:'N', 45:'NE', 90:'L', 135:'SE', 180:'S', 225:'SO', 270:'O', 315:'NO' };
function buildCompass(){
  let html = '';
  for (let d = -360; d <= 720; d += 15){
    const deg = ((d % 360) + 360) % 360;
    const x = ((d + 360) * PX_DEG).toFixed(1);
    html += '<i class="tick' + (deg % 45 === 0 ? ' major' : '') + '" style="left:' + x + 'px"></i>';
    if (CARDEAIS[deg] !== undefined)
      html += '<b class="cd' + (deg % 90 === 0 ? ' main' : '') + '" style="left:' + x + 'px">' + CARDEAIS[deg] + '</b>';
  }
  $('compass-strip').innerHTML = html;
  $('compass-strip').style.width = (1080 * PX_DEG) + 'px';
  let pips = '';
  for (let i = 0; i < 12; i++) pips += '<i class="pip"></i>';
  $('compass-pips').innerHTML = pips;
}
function headingDeg(){ return (((-player.yaw * 180 / Math.PI) % 360) + 360) % 360; }
function updateCompass(){
  const h = headingDeg();
  $('compass-strip').style.transform = 'translateX(' + (-((h + 360) * PX_DEG - COMPASS_W / 2)).toFixed(1) + 'px)';
  $('compass-deg').textContent = String(Math.round(h) % 360).padStart(3, '0');
  const pips = $('compass-pips').children;
  let k = 0;
  for (const e of enemies){
    if (e.dead || e.team === 'A' || !e.los || e.tgt !== PLAYER_T || k >= pips.length) continue;
    const dx = e.pos.x - player.pos.x, dz = e.pos.z - player.pos.z;
    const brg = (Math.atan2(dx, -dz) * 180 / Math.PI + 360) % 360;
    let rel = brg - h;
    if (rel > 180) rel -= 360;
    if (rel < -180) rel += 360;
    if (Math.abs(rel) > 58) continue;
    const p = pips[k++];
    p.style.display = 'block';
    p.style.left = (COMPASS_W / 2 + rel * PX_DEG).toFixed(1) + 'px';
  }
  for (; k < pips.length; k++) pips[k].style.display = 'none';
}

/* --- mira dinâmica --- */
const chT = $('ch-t'), chB = $('ch-b'), chL = $('ch-l'), chR = $('ch-r');
function updateCrosshair(){
  const w = weapons[curW];
  if (!w) return;
  const s = currentSpread(w);
  const gap = clamp(4 + s * 720, 3, 60);
  chT.style.top    = (-gap - 9) + 'px';
  chB.style.top    = ( gap) + 'px';
  chL.style.left   = (-gap - 9) + 'px';
  chR.style.left   = ( gap) + 'px';
  // com luneta a mira da tela some por completo (a retícula fica na óptica)
  const scoped = !!w.scope && player.adsAmount > 0.55;
  const hide = scoped || (player.adsAmount > 0.7 && w.id !== 'm870');
  [chT,chB,chL,chR].forEach(e => e.style.opacity = hide ? '0' : '1');
  $('ch-dot').style.opacity = scoped ? '0' : '1';
}

/* --- minimapa --- */
const mm = $('minimap'), mmx = mm.getContext('2d');
let MM_RANGE = 46;   // definido por loadMap(), varia com o tamanho do mapa
function drawMinimap(){
  const W = mm.width, H = mm.height, cx = W/2, cy = H/2;
  const sc = (W/2) / MM_RANGE;

  mmx.clearRect(0,0,W,H);
  mmx.fillStyle = 'rgba(10,14,10,0.55)';
  mmx.fillRect(0,0,W,H);

  mmx.save();
  mmx.translate(cx, cy);
  mmx.rotate(player.yaw);            // mapa gira com o jogador
  mmx.translate(-player.pos.x*sc, -player.pos.z*sc);

  // colisores próximos
  mmx.fillStyle = 'rgba(150,160,140,0.42)';
  for (const b of colliders){
    const bx = (b.minx + b.maxx)/2, bz = (b.minz + b.maxz)/2;
    if (Math.abs(bx - player.pos.x) > MM_RANGE + 12) continue;
    if (Math.abs(bz - player.pos.z) > MM_RANGE + 12) continue;
    mmx.fillRect(b.minx*sc, b.minz*sc, (b.maxx-b.minx)*sc, (b.maxz-b.minz)*sc);
  }

  // inimigos
  for (const e of enemies){
    if (e.dead) continue;
    const d = e.pos.distanceTo(player.pos);
    if (d > MM_RANGE) continue;
    // como em Black Ops: só aparece com UAV, à vista, ou logo após disparar sem supressor
    const ally = e.team === 'A';
    if (!ally && !(streaks.uavT > 0 || (e.los && e.tgt === PLAYER_T) || clockT - (e.firedT || -9) < 1.2)) continue;
    mmx.fillStyle = ally ? '#5fb4ff' : (e.type === 'heavy' ? '#ff8020' : '#ff3524');
    mmx.beginPath();
    mmx.arc(e.pos.x*sc, e.pos.z*sc, e.type === 'heavy' ? 7 : 5.5, 0, TAU);
    mmx.fill();
  }
  mmx.restore();

  // jogador (seta fixa no centro)
  mmx.save();
  mmx.translate(cx, cy);
  mmx.fillStyle = '#8ef0a0';
  mmx.beginPath();
  mmx.moveTo(0,-11); mmx.lineTo(8,9); mmx.lineTo(0,4); mmx.lineTo(-8,9);
  mmx.closePath(); mmx.fill();
  mmx.restore();

  // UAV: varredura e aviso
  if (streaks.uavT > 0){
    const a = (clockT * 2.2) % TAU;
    mmx.strokeStyle = 'rgba(255,90,70,0.5)'; mmx.lineWidth = 2;
    mmx.beginPath(); mmx.moveTo(cx,cy); mmx.lineTo(cx + Math.cos(a)*W, cy + Math.sin(a)*W); mmx.stroke();
    mmx.fillStyle = '#ffd6cf'; mmx.font = '600 20px "Barlow Condensed", sans-serif';
    mmx.fillText('UAV ' + Math.ceil(streaks.uavT) + 's', 10, H - 10);
  }
  if (streaks.heli){
    const h = streaks.heli, sc2 = (W/2)/MM_RANGE;
    mmx.save(); mmx.translate(cx,cy); mmx.rotate(player.yaw);
    mmx.fillStyle = '#9fd8ff';
    mmx.beginPath(); mmx.arc((h.g.position.x-player.pos.x)*sc2, (h.g.position.z-player.pos.z)*sc2, 7, 0, TAU); mmx.fill();
    mmx.restore();
  }

  // cone de visão
  mmx.strokeStyle = 'rgba(142,240,160,0.28)';
  mmx.beginPath();
  mmx.moveTo(cx,cy);
  mmx.arc(cx, cy, 52, -Math.PI/2 - 0.62, -Math.PI/2 + 0.62);
  mmx.closePath();
  mmx.stroke();
}

/* ---------------------------------------------------------------
   16. IA dos inimigos
   --------------------------------------------------------------- */
const _toPlayer = new THREE.Vector3();
const _eyePos   = new THREE.Vector3();
const _steer    = new THREE.Vector3();
const losRay    = new THREE.Raycaster();

function enemyHasLOS(e){
  const T = e.tgt || PLAYER_T;
  _eyePos.copy(e.pos); _eyePos.y += e.height * 0.85;
  const target = T.pos.clone(); target.y += T.height * 0.6;
  if (smokeBlocks(_eyePos, target)) return false;          // fumaça corta a visão
  _toPlayer.copy(target).sub(_eyePos);
  const dist = _toPlayer.length();
  if (dist > e.cfg.range + 12) return false;
  _toPlayer.normalize();

  losRay.set(_eyePos, _toPlayer);
  losRay.far = dist;
  const hits = losRay.intersectObjects(worldMeshes, false);
  return hits.length === 0 || hits[0].distance >= dist - 0.4;
}

function enemyShoot(e){
  if (e.tgt && !e.tgt.isPlayer) return botShootBot(e, e.tgt);
  _eyePos.copy(e.pos); _eyePos.y += e.height * 0.85;
  const target = player.pos.clone();
  target.y += player.height * 0.55;
  const dist = _eyePos.distanceTo(target);
  const toP = target.clone().sub(_eyePos).normalize();

  // Chance de acerto explícita — muito mais fácil de balancear do que ruído angular.
  let chance = e.cfg.hitChance;
  chance *= clamp(1 - (dist / e.cfg.range) * 0.55, 0.35, 1);      // longe erra mais
  const pSpeed = Math.hypot(player.vel.x, player.vel.z);
  chance *= lerp(1, 0.68, clamp(pSpeed / SPEED.sprint, 0, 1));    // mover-se protege
  if (player.crouch) chance *= 0.9;
  if (!player.grounded) chance *= 0.85;
  // Rampa de dificuldade: as primeiras ondas ensinam, as últimas punem.
  chance *= 0.45 + Math.min(effWave(), 10) * 0.055;
  chance *= DIFF().hit;                                           // nível de dificuldade
  const willHit = Math.random() < clamp(chance, 0.03, 0.9);

  // traçante: mira certeira no acerto, desviada no erro
  const dir = toP.clone();
  if (!willHit){
    const miss = 0.05 + Math.random() * 0.06;
    dir.x += rand(-miss, miss); dir.y += rand(-miss, miss); dir.z += rand(-miss, miss);
    dir.normalize();
  }

  // sai da boca do cano da arma que ele carrega, não do meio do peito
  const from = e.muzzle ? e.muzzle.getWorldPosition(new THREE.Vector3()) : _eyePos.clone();
  addTracer(from, from.clone().addScaledVector(dir, dist), 0xff8844);
  e.firedT = clockT;                                              // aparece no minimapa ao disparar
  addParticles(from, 0xffcc70, 2, 3.5, 2, 0.5);                   // clarão do disparo
  shotSound(e);                                                   // cada arma soa diferente, mais baixo à distância

  if (willHit){
    const falloff = clamp(1 - Math.max(0, dist - e.cfg.range*0.6) / e.cfg.range, 0.45, 1);
    damagePlayer(e.cfg.dmg * falloff * (1 + (effWave()-1)*0.035) * DIFF().dmg, e.pos);
  } else {
    addParticles(from.clone().addScaledVector(dir, dist + 1.5), 0xbbbbaa, 2, 2.5, 8, 0.4);
  }
}

function updateEnemy(e, dt){
  if (e.dead){
    // animação de morte: tomba e afunda
    e.deathT += dt;
    const t = e.deathT;
    e.group.rotation.x = lerp(e.group.rotation.x, -Math.PI/2 * 0.92, clamp(t*3.2, 0, 1));
    e.group.position.y = e.pos.y - clamp((t-1.6) * 0.6, 0, 2);
    if (t > 3.4) removeEnemy(e);
    return;
  }

  // ----- alvo: o oponente mais próximo (jogador ou bot da outra equipe) -----
  e.tgtT -= dt;
  if (e.tgtT <= 0 || !e.tgt || e.tgt.dead){ e.tgt = pickTarget(e); e.tgtT = 0.6 + Math.random()*0.4; }
  const T = e.tgt || PLAYER_T;
  const distToPlayer = e.pos.distanceTo(T.pos);
  if (e.stunT > 0) e.stunT -= dt;

  // ----- linha de visão (amostrada, não todo frame) -----
  e.losTimer -= dt;
  if (e.losTimer <= 0){
    e.losTimer = 0.14 + Math.random() * 0.1;
    e.los = enemyHasLOS(e);
  }

  if (e.alertDelay > 0){ e.alertDelay -= dt; }

  // ----- decisão de estado -----
  const idealDist = e.type === 'sniper' ? 30 : (e.type === 'runner' ? 6 : 13);
  if (e.los && distToPlayer < e.cfg.range) e.state = 'engage';
  else e.state = 'seek';

  // ----- movimento -----
  _steer.set(0,0,0);
  // sem visão, vai até a última posição conhecida (tiro sem supressor denuncia)
  e.knowT -= dt;
  if (e.los || !T.isPlayer){ e.known.copy(T.pos); }
  else if (e.knowT <= 0){ e.known.copy(T.pos); e.knowT = settings.mode === 'tdm' ? 7 : 3; }
  const toP = new THREE.Vector3().subVectors(e.los ? T.pos : e.known, e.pos);
  toP.y = 0;
  const dp = toP.length();
  if (dp > 0.01) toP.divideScalar(dp);

  if (e.state === 'engage'){
    // mantém distância ideal e faz strafe
    const delta = distToPlayer - idealDist;
    if (Math.abs(delta) > 2.2) _steer.addScaledVector(toP, delta > 0 ? 1 : -0.85);

    e.strafeT -= dt;
    if (e.strafeT <= 0){ e.strafeDir *= -1; e.strafeT = rand(1.1, 2.8); }
    const rightV = new THREE.Vector3(-toP.z, 0, toP.x);
    _steer.addScaledVector(rightV, e.strafeDir * 0.75);
  } else {
    // procura o jogador
    _steer.addScaledVector(toP, 1);
  }

  // desvio simples de outros inimigos (evita empilhamento)
  for (const o of enemies){
    if (o === e || o.dead) continue;
    const d = e.pos.distanceTo(o.pos);
    if (d < 1.5 && d > 0.001){
      _steer.add(new THREE.Vector3().subVectors(e.pos, o.pos).setY(0).normalize().multiplyScalar((1.5-d) * 1.2));
    }
  }

  if (_steer.lengthSq() > 0.0001) _steer.normalize();

  // evita paredes: testa 3 direções e escolhe a livre
  const spd = e.cfg.speed * (e.state === 'engage' ? 0.86 : 1.0) * (e.stunT > 0 ? 0.25 : 1);
  if (e.stunT > 0) _steer.applyAxisAngle(new THREE.Vector3(0,1,0), Math.sin(clockT*5 + e.walkT)*1.5);  // atordoado: cambaleia
  let moveDir = _steer.clone();
  if (isBlocked(e, moveDir)){
    const alts = [0.6, -0.6, 1.25, -1.25, 2.0, -2.0];
    for (const a of alts){
      const alt = _steer.clone().applyAxisAngle(new THREE.Vector3(0,1,0), a);
      if (!isBlocked(e, alt)){ moveDir = alt; break; }
    }
  }

  e.vel.x = moveDir.x * spd;
  e.vel.z = moveDir.z * spd;
  e.vel.y -= GRAVITY * dt;

  e.pos.x += e.vel.x * dt;
  e.pos.y += e.vel.y * dt;
  e.pos.z += e.vel.z * dt;

  e.grounded = resolveCollisions(e.pos, e.radius, e.height, e.vel, e.grounded);

  // mantém dentro do mapa
  e.pos.x = clamp(e.pos.x, -47.5, 47.5);
  e.pos.z = clamp(e.pos.z, -47.5, 47.5);

  // ----- orientação -----
  const wantYaw = Math.atan2(toP.x, toP.z);
  let diff = wantYaw - e.yaw;
  while (diff >  Math.PI) diff -= TAU;
  while (diff < -Math.PI) diff += TAU;
  e.yaw += diff * clamp(dt * 7, 0, 1);
  e.group.position.copy(e.pos);
  e.group.rotation.y = e.yaw;

  // ----- animação de caminhada -----
  const moving = Math.hypot(e.vel.x, e.vel.z) > 0.4;
  if (moving){
    // ciclo de passada: coxa balança, joelho dobra na fase de recuperação, arma quase parada
    e.walkT += dt * (spd * 1.9);
    const sw = Math.sin(e.walkT) * 0.55;
    e.parts.legL.rotation.x =  sw;
    e.parts.legR.rotation.x = -sw;
    e.parts.kneeL.rotation.x = 0.12 + Math.max(0, Math.sin(e.walkT - 1.2)) * 1.15;
    e.parts.kneeR.rotation.x = 0.12 + Math.max(0, Math.sin(e.walkT + Math.PI - 1.2)) * 1.15;
    e.parts.armL.rotation.x = -1.35 + Math.sin(e.walkT * 2) * 0.03;
    e.parts.armR.rotation.x = -1.15 + Math.sin(e.walkT * 2) * 0.03;
  } else {
    e.parts.legL.rotation.x *= 0.85;
    e.parts.legR.rotation.x *= 0.85;
    e.parts.kneeL.rotation.x = e.parts.kneeL.rotation.x * 0.85 + 0.02;
    e.parts.kneeR.rotation.x = e.parts.kneeR.rotation.x * 0.85 + 0.02;
  }

  // ----- flash ao levar dano -----
  if (e.damageFlash > 0){
    e.damageFlash -= dt;
    const on = e.damageFlash > 0;
    e.parts.torso.material.emissive && e.parts.torso.material.emissive.setHex(on ? 0x551010 : 0x000000);
  }

  // ----- barra de vida -----
  if (e.hpBarTimer > 0){
    e.hpBarTimer -= dt;
    const g = e.hpBar.grp;
    g.visible = true;
    g.position.copy(e.pos);
    g.position.y += e.height + 0.30;
    g.quaternion.copy(camera.quaternion);
    const pct = clamp(e.hp / e.maxHp, 0, 1);
    e.hpBar.fg.scale.x = 0.82 * pct;
    e.hpBar.fg.position.x = -(0.82 * (1 - pct)) / 2;
    e.hpBar.fg.material.color.setHex(pct > 0.5 ? 0xe0a028 : 0xe03828);
    if (e.hpBarTimer <= 0) g.visible = false;
  }

  // ----- disparo -----
  if (e.alertDelay <= 0 && e.stunT <= 0 && e.los && distToPlayer < e.cfg.range && !T.dead){
    if (e.burstLeft > 0){
      e.burstCd -= dt;
      if (e.burstCd <= 0){
        enemyShoot(e);
        e.burstLeft--;
        e.burstCd = e.cfg.fireRate * 0.28;
      }
    } else {
      e.fireCd -= dt;
      if (e.fireCd <= 0){
        e.burstLeft = e.cfg.burst;
        e.burstCd = 0;
        e.fireCd = e.cfg.fireRate * rand(2.8, 4.4) / (1 + effWave()*0.02);
      }
    }
  } else {
    e.burstLeft = 0;
  }
}

const _probe = new THREE.Vector3();
function isBlocked(e, dir){
  // testa se um passo curto naquela direção colide
  const step = 1.1;
  _probe.set(e.pos.x + dir.x*step, e.pos.y + 0.35, e.pos.z + dir.z*step);
  for (const b of colliders){
    if (_probe.x - e.radius >= b.maxx || _probe.x + e.radius <= b.minx) continue;
    if (_probe.z - e.radius >= b.maxz || _probe.z + e.radius <= b.minz) continue;
    if (_probe.y >= b.maxy || _probe.y + e.height <= b.miny) continue;
    return true;
  }
  return false;
}

/* ---------------------------------------------------------------
   17. Atualização do jogador
   --------------------------------------------------------------- */
function updatePlayer(dt){
  const w = weapons[curW];

  // ---- ADS ----
  player.ads = rightDown && !player.reloading && player.switching <= 0 && !player.sprint;
  player.adsAmount = lerp(player.adsAmount, player.ads ? 1 : 0, clamp(dt * 13 * (weapons[curW].adsMul || 1), 0, 1));

  // ---- agachar ----
  player.crouch = !!(keys.ControlLeft || keys.ControlRight || keys.KeyC);
  player.targetHeight = player.crouch ? 1.10 : 1.78;
  player.height = lerp(player.height, player.targetHeight, clamp(dt*12, 0, 1));

  // ---- entrada de movimento ----
  let ix = 0, iz = 0;
  if (keys.KeyW || keys.ArrowUp)    iz += 1;
  if (keys.KeyS || keys.ArrowDown)  iz -= 1;
  if (keys.KeyA || keys.ArrowLeft)  ix -= 1;
  if (keys.KeyD || keys.ArrowRight) ix += 1;
  if (isTouch && touchMove.active){ ix += touchMove.x; iz -= touchMove.y; }

  const inLen = Math.hypot(ix, iz);
  if (inLen > 1){ ix /= inLen; iz /= inLen; }

  player.sprint = !!keys.ShiftLeft && iz > 0.2 && !player.crouch && !player.ads;
  if (player.sprint) player.sprintOutT = weapons[curW].sprintOut || 0.2;
  else player.sprintOutT = Math.max(0, (player.sprintOutT || 0) - dt);
  updateBreath(dt);

  // direção no plano XZ a partir do yaw
  const fx_ = -Math.sin(player.yaw), fz_ = -Math.cos(player.yaw);
  const rx_ =  Math.cos(player.yaw), rz_ = -Math.sin(player.yaw);

  let speed = (player.crouch ? SPEED.crouch : (player.sprint ? SPEED.sprint : SPEED.walk)) * (player.speedMul || 1);
  if (player.ads) speed *= 0.55;
  if (player.reloading) speed *= 0.92;

  const wishX = (fx_*iz + rx_*ix) * speed;
  const wishZ = (fz_*iz + rz_*ix) * speed;

  // aceleração (mais responsivo no chão)
  const accel = player.grounded ? 15 : 4.2;
  player.vel.x = lerp(player.vel.x, wishX, clamp(dt*accel, 0, 1));
  player.vel.z = lerp(player.vel.z, wishZ, clamp(dt*accel, 0, 1));

  // pulo
  if ((keys.Space) && player.grounded){
    player.vel.y = JUMP_V;
    player.grounded = false;
    Audio_.click(0.06, 400, 0.05, 0.6);
  }
  player.vel.y -= GRAVITY * dt;

  player.pos.x += player.vel.x * dt;
  player.pos.y += player.vel.y * dt;
  player.pos.z += player.vel.z * dt;

  player.grounded = resolveCollisions(player.pos, player.radius, player.height, player.vel, player.grounded);
  player.pos.x = clamp(player.pos.x, -48.2, 48.2);
  player.pos.z = clamp(player.pos.z, -48.2, 48.2);

  // ---- passos ----
  const hspeed = Math.hypot(player.vel.x, player.vel.z);
  if (player.grounded && hspeed > 1.2){
    player.stepT += dt * hspeed;
    if (player.stepT > (player.sprint ? 3.4 : 4.2)){
      player.stepT = 0;
      Audio_.step();
    }
  }

  // ---- balanço de câmera ----
  if (settings.bob && player.grounded){
    player.bobT += dt * hspeed * 1.15;
  }

  // ---- regeneração ----
  if (clockT - player.lastDamage > 4.2 && player.hp < player.maxHp && player.alive){
    player.hp = Math.min(player.maxHp, player.hp + 15 * dt);
    $('vignette').style.opacity = String(clamp((1 - player.hp/player.maxHp) * 0.5, 0, 0.7));
    updateHUD();
  }

  // ---- troca de arma (com comandos enfileirados) ----
  if (player.switching > 0){
    player.switching -= dt;
    if (player.switching <= 0){
      player.switching = 0;
      if (pendingSwitch >= 0){
        const nx = pendingSwitch; pendingSwitch = -1;
        switchWeapon(nx);
      } else if (pendingReload){
        pendingReload = false;
        startReload();
      }
    }
  }

  // ---- recarga ----
  if (player.reloading){
    player.reloadT += dt;
    const bar = $('reload-bar');
    bar.style.opacity = '1';
    bar.firstElementChild.style.width = clamp(player.reloadT / player.reloadDur, 0, 1) * 100 + '%';
    if (player.reloadT >= player.reloadDur) finishReload();
  } else {
    $('reload-bar').style.opacity = '0';
  }

  // ---- disparo ----
  player.fireCd -= dt;
  if (!mouseDown) shotLatch = false;
  if (mouseDown && player.alive && !player.sprint) tryShoot();
  if (player.fireCd < 0) player.fireCd = 0;   // não acumula crédito entre frames

  // auto-recarga quando o pente acaba
  if (weapons[curW].mag === 0 && !player.reloading && weapons[curW].reserve > 0 && mouseDown){
    startReload();
  }

  // ---- recuo: a câmera persegue o alvo, e o alvo volta ao centro ----
  player.recoil.x = lerp(player.recoil.x, player.recoilTarget.x, 1 - Math.pow(0.0001, dt));
  player.recoil.y = lerp(player.recoil.y, player.recoilTarget.y, 1 - Math.pow(0.0001, dt));
  player.recoilTarget.multiplyScalar(Math.pow(0.08, dt));
  player.kickZ = lerp(player.kickZ, 0, clamp(dt*11, 0, 1));

  // ---- câmera ----
  const eyeY = player.pos.y + player.height - 0.16;
  camera.position.set(player.pos.x, eyeY, player.pos.z);

  if (settings.bob){
    const amp = (player.ads ? 0.25 : 1) * clamp(hspeed / SPEED.walk, 0, 1.3);
    camera.position.y += Math.sin(player.bobT * 2) * 0.032 * amp;
    camera.position.x += Math.cos(player.bobT) * 0.021 * amp * rx_;
    camera.position.z += Math.cos(player.bobT) * 0.021 * amp * rz_;
  }

  // tremida
  if (shakeT > 0){
    shakeT -= dt;
    const k = (shakeT / shakeDur) * shakeAmt;
    camera.position.x += rand(-k, k) * 0.5;
    camera.position.y += rand(-k, k) * 0.5;
  } else { shakeAmt = 0; }

  camera.rotation.order = 'YXZ';
  camera.rotation.y = player.yaw   + player.recoil.x;
  camera.rotation.x = player.pitch + player.recoil.y;
  camera.rotation.z = Math.sin(player.bobT) * 0.006 * (settings.bob ? 1 : 0);

  // FOV (ADS + sprint)
  const desired = lerp(settings.fov + (player.sprint ? 5 : 0), w.adsFov, player.adsAmount);
  camera.fov = lerp(camera.fov, desired, clamp(dt*13, 0, 1));
  camera.updateProjectionMatrix();

  // sol acompanha o jogador (sombras nítidas perto)
  sun.position.set(player.pos.x + 40, 62, player.pos.z + 26);
  sun.target.position.set(player.pos.x, 0, player.pos.z);

  updateViewmodel(dt, hspeed);
}

/* --- viewmodel: posição, sway, bob, recuo --- */
let swayX = 0, swayY = 0, lastYaw = 0, lastPitch = 0;
function updateViewmodel(dt, hspeed){
  const w = weapons[curW];

  // Com a luneta aberta o modelo da arma some e a sobreposição toma a tela.
  const scoped = !!w.scope && player.adsAmount > 0.55;
  WEAPONS.forEach(ww => { gunModels[ww.id].visible = (ww.id === w.id) && !scoped; });
  $('scope').style.opacity = scoped ? '1' : '0';

  // o clarão fica na boca do cano da arma atual (elas têm comprimentos diferentes)
  gunFlash.position.set(0, 0.01, -(gunModels[w.id].userData.len || 0.6) / 2 - 0.03);

  // sway pelo movimento do mouse
  const dYaw   = player.yaw - lastYaw;
  const dPitch = player.pitch - lastPitch;
  lastYaw = player.yaw; lastPitch = player.pitch;
  swayX = lerp(swayX, clamp(dYaw   * 2.4, -0.09, 0.09), clamp(dt*9, 0, 1));
  swayY = lerp(swayY, clamp(dPitch * 2.0, -0.07, 0.07), clamp(dt*9, 0, 1));

  const adsK = player.adsAmount;
  const base = (gunModels[w.id].userData.hip || HIP_POS).clone().lerp(gunModels[w.id].userData.ads || ADS_POS, adsK);

  // bob da arma
  let bx = 0, by = 0;
  if (settings.bob){
    const amp = clamp(hspeed / SPEED.walk, 0, 1.3) * (1 - adsK*0.82);
    bx = Math.cos(player.bobT) * 0.020 * amp;
    by = Math.abs(Math.sin(player.bobT)) * 0.017 * amp;
  }

  // deslocamento de sprint / recarga / troca
  let sprintTilt = 0, lowerY = 0, rollZ = 0;
  if (player.sprint){ sprintTilt = 0.42; lowerY = -0.08; rollZ = -0.30; }
  if (player.reloading){
    const t = player.reloadT / player.reloadDur;
    lowerY += -0.13 * Math.sin(Math.PI * clamp(t,0,1));
    rollZ  += -0.55 * Math.sin(Math.PI * clamp(t,0,1));
  }
  if (player.switching > 0){
    const t = 1 - (player.switching / w.switchTime);
    lowerY += -0.30 * (1 - Math.sin(Math.PI * clamp(t,0,1) * 0.5));
  }

  gunSway.position.set(
    base.x + swayX*(1-adsK*0.7) + bx,
    base.y + swayY*(1-adsK*0.7) + by + lowerY,
    base.z
  );
  gunSway.rotation.set(
    swayY * 1.4 + sprintTilt*0.25,
    -swayX * 1.6 + sprintTilt*0.5,
    rollZ + swayX * 1.1
  );

  // recuo do modelo
  gunHolder.position.z = lerp(gunHolder.position.z, player.kickZ * 2.6, clamp(dt*22, 0, 1));
  gunHolder.rotation.x = lerp(gunHolder.rotation.x, -player.kickZ * 3.4, clamp(dt*22, 0, 1));
  gunHolder.position.y = lerp(gunHolder.position.y, player.kickZ * 0.5, clamp(dt*22, 0, 1));

  // flash de boca
  if (flashMat.opacity > 0){
    flashMat.opacity = Math.max(0, flashMat.opacity - dt * 22);
    gunFlash.visible = true;
  } else gunFlash.visible = false;

  if (muzzleLight.intensity > 0){
    muzzleLight.intensity = Math.max(0, muzzleLight.intensity - dt * 34);
  }
}

/* ---------------------------------------------------------------
   18. Atualização dos efeitos
   --------------------------------------------------------------- */
function updateFX(dt){
  // tracers
  for (let i = fx.tracers.length-1; i>=0; i--){
    const t = fx.tracers[i];
    t.t += dt;
    t.line.material.opacity = 0.9 * (1 - t.t/t.life);
    if (t.t >= t.life){
      scene.remove(t.line);
      t.line.geometry.dispose(); t.line.material.dispose();
      fx.tracers.splice(i,1);
    }
  }
  // decalques
  for (let i = fx.decals.length-1; i>=0; i--){
    const d = fx.decals[i];
    d.t += dt;
    if (d.t > d.life - 2.5) d.mesh.material.opacity = Math.max(0, 0.95 * (d.life - d.t) / 2.5);
    if (d.t >= d.life){
      scene.remove(d.mesh); d.mesh.material.dispose();
      fx.decals.splice(i,1);
    }
  }
  // partículas
  for (let i = fx.particles.length-1; i>=0; i--){
    const p = fx.particles[i];
    p.t += dt;
    p.vel.y -= p.grav * dt;
    p.mesh.position.addScaledVector(p.vel, dt);
    if (p.mesh.position.y < 0.02){ p.mesh.position.y = 0.02; p.vel.set(0,0,0); }
    p.mesh.material.opacity = Math.max(0, 1 - p.t/p.life);
    p.mesh.rotation.x += dt*8; p.mesh.rotation.y += dt*6;
    if (p.t >= p.life){
      scene.remove(p.mesh); p.mesh.material.dispose();
      fx.particles.splice(i,1);
    }
  }
  // granadas
  for (let i = fx.grenades.length-1; i>=0; i--){
    const g = fx.grenades[i];
    g.t += dt;
    if (g.stuck){ if (g.t >= g.fuse){ detonate(g); scene.remove(g.mesh); g.mesh.geometry.dispose(); g.mesh.material.dispose(); fx.grenades.splice(i,1); } continue; }
    g.vel.y -= GRAVITY * dt;
    const next = g.mesh.position.clone().addScaledVector(g.vel, dt);
    // Semtex gruda no primeiro contato (chão, parede ou inimigo)
    if (g.sticky){
      let hit = next.y < 0.06 ? true : false;
      for (const b of colliders){ if (next.x > b.minx && next.x < b.maxx && next.z > b.minz && next.z < b.maxz && next.y > b.miny && next.y < b.maxy){ hit = true; break; } }
      for (const e of enemies){ if (!e.dead && Math.hypot(e.pos.x-next.x, e.pos.z-next.z) < 0.5 && next.y < 1.9){ hit = true; break; } }
      if (hit){ g.stuck = true; next.y = Math.max(next.y, 0.06); g.mesh.position.copy(next); Audio_.click(0.1, 1600, 0.05, 1.4); continue; }
    }

    // quica no chão e nas caixas
    if (next.y < 0.11){
      next.y = 0.11;
      g.vel.y = -g.vel.y * 0.42;
      g.vel.x *= 0.7; g.vel.z *= 0.7;
      if (Math.abs(g.vel.y) > 1.2) Audio_.click(0.07, 700, 0.05, 1.1);
    }
    for (const b of colliders){
      if (next.x > b.minx-0.11 && next.x < b.maxx+0.11 &&
          next.z > b.minz-0.11 && next.z < b.maxz+0.11 &&
          next.y > b.miny-0.11 && next.y < b.maxy+0.11){
        // resolve pelo eixo de menor penetração (aproximado)
        const cx = (b.minx+b.maxx)/2, cz = (b.minz+b.maxz)/2;
        const px = Math.min(next.x - (b.minx-0.11), (b.maxx+0.11) - next.x);
        const pz = Math.min(next.z - (b.minz-0.11), (b.maxz+0.11) - next.z);
        const py = Math.min(next.y - (b.miny-0.11), (b.maxy+0.11) - next.y);
        if (py <= px && py <= pz){
          next.y = next.y > (b.miny+b.maxy)/2 ? b.maxy+0.11 : b.miny-0.11;
          g.vel.y = -g.vel.y*0.4; g.vel.x *= 0.75; g.vel.z *= 0.75;
        } else if (px <= pz){
          next.x = next.x > cx ? b.maxx+0.11 : b.minx-0.11;
          g.vel.x = -g.vel.x*0.5;
        } else {
          next.z = next.z > cz ? b.maxz+0.11 : b.minz-0.11;
          g.vel.z = -g.vel.z*0.5;
        }
        break;
      }
    }
    g.mesh.position.copy(next);
    g.mesh.rotation.x += dt*7; g.mesh.rotation.z += dt*5;

    if (g.t >= g.fuse){
      detonate(g);
      scene.remove(g.mesh);
      g.mesh.geometry.dispose(); g.mesh.material.dispose();
      fx.grenades.splice(i,1);
    }
  }
  // luzes de explosão
  for (let i = fx.explosions.length-1; i>=0; i--){
    const x = fx.explosions[i];
    x.t += dt;
    x.light.intensity = 26 * (1 - x.t/x.life);
    if (x.t >= x.life){ scene.remove(x.light); fx.explosions.splice(i,1); }
  }
}

/* ---------------------------------------------------------------
   19. Laço principal
   --------------------------------------------------------------- */
let lastT = performance.now(), clockT = 0, hudAcc = 0, frameCount = 0;

/* Sonda somente-leitura para diagnóstico e testes automatizados. */
window.__blackout = {
  kill:()=>damagePlayer(99999, player.pos.clone().add(new THREE.Vector3(0,0,-3))),
  eco:{ get wave(){return wave;}, get stats(){return stats;}, get player(){return player;}, get weapons(){return weapons;}, get curW(){return curW;}, get enemies(){return enemies;}, renderShop:()=>renderShop(), get streaks(){return streaks;}, callUAV:()=>callUAV(), launchHeli:()=>{ launchHeli(); streaks.heli.t=40; }, get puffs(){return puffs.length;}, get emitters(){ return ambientEmitters.map(e => e.type + ':' + e.map + ':' + e.pos.toArray().map(v=>v.toFixed(1)).join(',')); }, loadMap:(id)=>loadMap(id), gunModels, get profile(){return profile;}, get fx(){return fx;}, get breath(){return breath;}, get tdm(){return tdm;}, get smokes(){return smokes;}, get ruins(){ return { drones: ruinsFX.drones.map(d => ({ state:d.state, hp:d.hp, pos:d.g.position.toArray() })), glass: glassMeshes.length, sparks: sparks.length, extras: worldExtras.length, world: worldMeshes.length, colliders: colliders.length, motes: !!ruinsFX.motes }; }, shootDrone:(i)=>{ const d = ruinsFX.drones[i]; hitDrone(d, 999, d.g.position.clone()); }, sparkBurst:(x,y,z)=>emitSparks(new THREE.Vector3(x,y,z), 30, 4, 1), settings, startSmoke:(x,z)=>startSmoke(new THREE.Vector3(x,0,z)), smokeBlocks:(a,b)=>smokeBlocks(new THREE.Vector3(...a), new THREE.Vector3(...b)) },
  get time(){ return clockT; },
  get frames(){ return frameCount; },
  get state(){ return gameState; },
  get enemies(){ return enemies.filter(e => !e.dead).length; },
  get fxCount(){ return fx.tracers.length + fx.decals.length + fx.particles.length; },
  get fov(){ return camera.fov; },
  get weapon(){ const w = weapons[curW]; return w && { id:w.id, name:w.name, mag:w.mag, scope:!!w.scope }; },
  get difficulty(){ return settings.difficulty; },
  get map(){ return settings.map; },
  get colliders(){ return colliders.length; },
  get aim(){ return { yaw:player.yaw, pitch:player.pitch,
                      x:player.pos.x, y:player.pos.y, z:player.pos.z }; },
  get enemyInfo(){
    return enemies.filter(e => !e.dead).map(e => ({
      type:e.type, dist:+e.pos.distanceTo(player.pos).toFixed(1),
      state:e.state, los:e.los, hp:Math.round(e.hp),
      x:+e.pos.x.toFixed(1), z:+e.pos.z.toFixed(1)
    }));
  },
  stats
};

function loop(now){
  requestAnimationFrame(loop);
  frameCount++;
  let dt = (now - lastT) / 1000;
  lastT = now;
  if (dt > 0.05) dt = 0.05;         // evita saltos após pausa
  if (dt < 0) dt = 0;               // o rAF pode trazer um instante anterior ao clique em JOGAR

  if (gameState === STATE.PLAYING || gameState === STATE.DEAD){
    clockT += dt;
    if (gameState === STATE.PLAYING){
      updatePlayer(dt);
      if (settings.mode === 'tdm') updateTDM(dt); else updateWave(dt);
    } else {
      if (settings.mode === 'tdm' && !tdm.over){ tdm.respawnT -= dt; updateTDM(dt); if (tdm.respawnT <= 0) respawnPlayer(); }
      // câmera cai ao morrer
      camera.position.y = lerp(camera.position.y, player.pos.y + 0.35, clamp(dt*3,0,1));
      camera.rotation.z = lerp(camera.rotation.z, 0.55, clamp(dt*2,0,1));
    }
    for (let i = enemies.length-1; i>=0; i--) updateEnemy(enemies[i], dt);
    updateFX(dt);
    updateStreaks(dt);
    updateSmokes(dt);
    updateCrosshair();
    updateCompass();
    drawMinimap();

    hudAcc += dt;
    if (hudAcc > 0.12){ hudAcc = 0; updateHUD(); }
  }

  skyDome.position.copy(camera.position);
  // sombra segue o jogador (câmera de sombra justa = sombras nítidas); passo de 4 m evita tremulação
  const sx = Math.round(camera.position.x / 4) * 4, sz = Math.round(camera.position.z / 4) * 4;
  sun.target.position.set(sx, 0, sz);
  sun.position.copy(skyUni.sunD.value).multiplyScalar(90).add(sun.target.position);
  updateAmbientFX(Math.min(dt, 0.05));
  post.render(dt);
}

/* ---------------------------------------------------------------
   20. Fluxo de telas
   --------------------------------------------------------------- */
function resetGame(){
  // limpa inimigos
  for (let i = enemies.length-1; i>=0; i--) removeEnemy(enemies[i]);
  enemies.length = 0;
  enemyHitMeshes.length = 0;

  // limpa efeitos
  fx.tracers.forEach(t => { scene.remove(t.line); t.line.geometry.dispose(); t.line.material.dispose(); });
  fx.decals.forEach(d  => { scene.remove(d.mesh); d.mesh.material.dispose(); });
  fx.particles.forEach(p => { scene.remove(p.mesh); p.mesh.material.dispose(); });
  fx.grenades.forEach(g => { scene.remove(g.mesh); g.mesh.geometry.dispose(); g.mesh.material.dispose(); });
  fx.explosions.forEach(x => scene.remove(x.light));
  fx.tracers.length = fx.decals.length = fx.particles.length = fx.grenades.length = fx.explosions.length = 0;

  $('killfeed').innerHTML = '';
  document.querySelectorAll('.float, .dmg-arc').forEach(e => e.remove());

  // o mapa pode ter mudado no menu
  if (settings.map !== mapaCarregado) loadMap(settings.map);

  // estado
  Object.assign(stats, { score:0, kills:0, headshots:0, shots:0, hits:0, wave:0, streak:0, bestStreak:0, credits:0, spent:0 });
  bridge.set({ shopOpen:false });
  removeHeli(); streaks.uavT = 0; streaks.heliQueued = false;
  clearSmokes(); Object.assign(tdm, { a:0, b:0, queue:[], respawnT:0, over:false });
  player.tacticals = TAC_MAX();
  resetWeapons();

  const md = MAPDEF();
  player.pos.set(md.player.x, 0, md.player.z);
  player.vel.set(0,0,0);
  player.yaw = md.player.yaw; player.pitch = 0;
  player.hp = player.maxHp; player.armor = 25;
  player.alive = true;
  player.reloading = false; player.switching = 0;
  pendingSwitch = -1; pendingReload = false;
  player.fireCd = 0; player.grenades = LETHALS[activeClass().leth].none ? 0 : GREN_MAX;
  player.recoil.set(0,0); player.recoilTarget.set(0,0);
  player.lastDamage = -99;
  player.adsAmount = 0; player.kickZ = 0;
  camera.rotation.set(0,0,0);
  camera.fov = settings.fov;
  camera.updateProjectionMatrix();

  Object.assign(wave, { active:false, toSpawn:0, alive:0, spawnCd:0, breakT:0, inBreak:false });
  $('vignette').style.opacity = '0';
  $('scope').style.opacity = '0';
  clockT = 0;
  mouseDown = rightDown = false; shotLatch = false;
}

function startGame(){
  Audio_.init();
  Audio_.resume();
  Audio_.setVolume(settings.volume);

  resetGame();
  bridge.set({ screen:'playing', shopOpen:false });
  $('hud').classList.remove('hidden');
  if (isTouch) $('touch').classList.remove('hidden');

  gameState = STATE.PLAYING;
  lastT = performance.now();
  requestLock();
  updateHUD();
  if (settings.mode === 'tdm') startTDM(); else startWave(1);
  showWeaponList();   // mostra o arsenal por 2 s ao entrar em campo
}

function pauseGame(){
  if (gameState !== STATE.PLAYING) return;
  gameState = STATE.PAUSED;
  mouseDown = rightDown = false;
  $('scope').style.opacity = '0';
  if (document.pointerLockElement) document.exitPointerLock();
  bridge.set({ screen:'paused' });
  $('touch').classList.add('hidden');
}

function resumeGame(){
  if (gameState !== STATE.PAUSED) return;
  bridge.set({ screen:'playing' });
  if (isTouch) $('touch').classList.remove('hidden');
  gameState = STATE.PLAYING;
  lastT = performance.now();
  Audio_.resume();
  requestLock();
}

function toMenu(){
  saveProfile();
  gameState = STATE.MENU;
  if (document.pointerLockElement) document.exitPointerLock();
  bridge.set({ screen:'playing', shopOpen:false });
  $('hud').classList.add('hidden');
  $('touch').classList.add('hidden');
  bridge.set({ screen:'menu' });
  resetGame();
  bridge.bump();
  // câmera panorâmica no menu
  camera.position.set(0, 12, 34);
  camera.rotation.set(-0.28, 0, 0);
}

canvas.addEventListener('click', () => {
  if (gameState === STATE.PLAYING && !pointerLocked && !isTouch) requestLock();
});

/* --- configurações --- */
function loadSettings(){
  try{
    const s = JSON.parse(localStorage.getItem('blackout_settings') || '{}');
    Object.assign(settings, s);
  }catch(e){ /* ignora config corrompida */ }
  if (!DIFFICULTIES.some(d => d.id === settings.difficulty)) settings.difficulty = 'veterano';
  if (!MAPS.some(m => m.id === settings.map)) settings.map = MAPS[0].id;
  if (settings.mode !== 'tdm') settings.mode = 'sobrevivencia';
  if (![0,50,100].includes(settings.limit)) settings.limit = 0;
  if (!['alta','media','baixa'].includes(settings.quality)) settings.quality = 'alta';
  post.setQuality(settings.quality);
}
function saveSettings(){
  try{ localStorage.setItem('blackout_settings', JSON.stringify(settings)); }catch(e){}
}
function readBest(){ try { return Number(localStorage.getItem('blackout_best') || 0); } catch(e){ return 0; } }
function goView(title, tag, waveTxt, best){
  return { title, tag, score: stats.score.toLocaleString('pt-BR'), wave: waveTxt, kills: stats.kills,
           headshots: stats.headshots, accuracy: (stats.shots ? Math.round(stats.hits / stats.shots * 100) : 0) + '%',
           bestStreak: stats.bestStreak, best: best.toLocaleString('pt-BR') };
}
function setSetting(key, value){
  settings[key] = value;
  if (key === 'map') loadMap(value);            // troca de cenário na hora, atrás do menu
  if (key === 'volume') Audio_.setVolume(value);
  if (key === 'fov'){ camera.fov = value; camera.updateProjectionMatrix(); }
  if (key === 'quality') post.setQuality(value);
  saveSettings();
  if (['map','difficulty','mode','limit'].includes(key)){ Audio_.init(); Audio_.switchW(); }
  bridge.bump();
}

/* --- redimensionamento --- */
addEventListener('resize', () => {
  const w = innerWidth, h = innerHeight;
  camera.aspect = w/h; camera.updateProjectionMatrix();
  gunCamera.aspect = w/h; gunCamera.updateProjectionMatrix();
  renderer.setSize(w,h);
  post.setSize(w,h);
});

/* --- pausa ao perder o foco da aba --- */
addEventListener('blur', () => { if (gameState === STATE.PLAYING) pauseGame(); });

function enemyLabel(t){
  const nome = { grunt:'SOLDADO', runner:'BATEDOR', heavy:'BLINDADO', sniper:'ATIRADOR' }[t] || 'INIMIGO';
  const arma = ENEMY_TYPES[t] && ENEMY_TYPES[t].wName;
  return arma ? nome + ' · ' + arma : nome;
}

/* ---------------------------------------------------------------
   21. Inicialização
   --------------------------------------------------------------- */
function init(){
  loadSettings();
  loadMap(settings.map);
  buildCompass();
  if (isTouch) setupTouch();
  resetWeapons();
  camera.fov = settings.fov;
  camera.updateProjectionMatrix();

  requestAnimationFrame(loop);

  setTimeout(() => {
    toMenu();
  }, 350);
}

init();

return {
  startGame, resumeGame, toMenu, buy, setSetting, saveProfile, applyCosmetics,
  attachPreview(c){
    if (opPrev.canvas !== c){ if (opPrev.r){ opPrev.r.dispose(); opPrev.r = null; opPrev.model = null; } opPrev.canvas = c; }
    if (c) buildOperatorPreview();
  },
  setPreviewActive(on){ opPrev.on = on; },
  refreshPreview(){ applyCosmetics(); buildOperatorPreview(); },
  activeClass, classPoints, moddedWeapon, wStat, unlocked,
  get settings(){ return settings; },
  get profile(){ return profile; },
  data: { MAPS, DIFFICULTIES, WEAPONS, LETHALS, TACTICALS, ATTACH, PERKS, OPERATORS, CAMOS }
};
}
