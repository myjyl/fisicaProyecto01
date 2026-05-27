// ==================== STATE ====================
let currentMotion = 'MRU';
let animId = null;
let simTime = 0;
let simRunning = false;
let simData = { t:[], x:[], v:[], a:[] };
let simStopped = false;
let stopTime = null;
let stopPos = null;
const DT = 0.033; // ~30fps step
const g = 9.8;

// Mode
let currentMode = 'sim'; // 'sim' or 'cam'

// Charts
let chartPos, chartVel, chartAcc;

// Canvas
const canvas = document.getElementById('simCanvas');
const ctx = canvas.getContext('2d');

// Themes Definition
const THEMES = {
    MRU: { primary: '#4f46e5', light: 'rgba(79,70,229,0.08)', label: 'MRU' },
    MRUV: { primary: '#10b981', light: 'rgba(16,185,129,0.08)', label: 'MRUV' },
    CAIDA: { primary: '#ef4444', light: 'rgba(239,68,68,0.08)', label: 'Caída Libre' },
    PARABOLICO: { primary: '#f59e0b', light: 'rgba(245,158,11,0.08)', label: 'Tiro Parabólico' }
};

// ==================== CAMERA STATE ====================
let webcamStream = null;
let isCamaraActiva = false;
let isGrabando = false;
let colorObjetivoHsv = null;
let datosCapturados = [];
let camaraAnimationId = null;
let tiempoInicioGrabacion = 0;
let smoothX = 0;
let smoothY = 0;
let trailPuntos = [];
let searchRect = null; // ROI Optimization
let hTol = 25;
let sTol = 35;

// ==================== INIT ====================
function init() {
  initCharts();
  setMotion('MRU');
  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);
  
  // Register click listener on canvas for HSV color picking (Camera Mode)
  canvas.addEventListener('mousedown', handleCanvasColorPick);
}

function resizeCanvas() {
  if (currentMode === 'cam') return; // Do not dynamically resize canvas in Camera Mode
  const w = canvas.parentElement.clientWidth;
  canvas.width = w;
  drawIdleCanvas();
}

// ==================== MODE SWITCH ====================
function setAppMode(mode) {
  currentMode = mode;
  
  const btnSim = document.getElementById('mode-btn-sim');
  const btnCam = document.getElementById('mode-btn-cam');
  const badge = document.getElementById('app-mode-badge');
  const camBadge = document.getElementById('camMovTypeDisplay');
  const title = document.getElementById('canvas-title');
  const subtitle = document.getElementById('canvas-subtitle');
  
  if (mode === 'sim') {
    btnSim.classList.add('active');
    btnCam.classList.remove('active');
    badge.textContent = 'Modo Simulador';
    badge.style.color = 'var(--accent)';
    badge.style.background = 'rgba(79,70,229,0.1)';
    badge.style.borderColor = 'rgba(79,70,229,0.2)';
    if (camBadge) camBadge.style.display = 'none';
    if (title) title.textContent = 'Movimiento Rectilíneo Uniforme';
    if (subtitle) subtitle.textContent = 'Animación en tiempo real';
    
    document.body.classList.remove('camera-active');
    
    // Deactivate webcam if active
    if (isCamaraActiva) {
      desactivarCamaraCompleta();
    }
    
    resizeCanvas();
    setMotion(currentMotion);
  } else {
    btnSim.classList.remove('active');
    btnCam.classList.add('active');
    badge.textContent = 'Modo Cámara';
    badge.style.color = '#0891b2';
    badge.style.background = 'rgba(6,182,212,0.1)';
    badge.style.borderColor = 'rgba(6,182,212,0.2)';
    if (camBadge) camBadge.style.display = 'inline-block';
    if (title) title.textContent = 'Laboratorio de Cámara Física';
    if (subtitle) subtitle.textContent = 'Detección cinemática en tiempo real';
    
    document.body.classList.add('camera-active');
    
    // Stop simulation if running
    if (simRunning) resetSim();
    
    // Set standard size to prevent deformation
    canvas.width = 600;
    canvas.height = 350;
    
    resetCamUI();
    aplicarTema('MRU');
    
    // Draw "camara apagada" status
    const tempCtx = canvas.getContext('2d');
    tempCtx.fillStyle = '#0f172a';
    tempCtx.fillRect(0, 0, canvas.width, canvas.height);
    tempCtx.fillStyle = '#ffffff';
    tempCtx.font = 'bold 20px Space Grotesk';
    tempCtx.textAlign = 'center';
    tempCtx.textBaseline = 'middle';
    tempCtx.fillText('CÁMARA APAGADA', canvas.width / 2, canvas.height / 2);
    tempCtx.font = '13px Space Grotesk';
    tempCtx.fillStyle = '#94a3b8';
    tempCtx.fillText('Haz clic en "Activar Cámara" en el panel lateral para iniciar.', canvas.width / 2, canvas.height / 2 + 30);
    tempCtx.textAlign = 'left';
    tempCtx.textBaseline = 'alphabetic';
  }
}

// ==================== MOTION SWITCH ====================
function setMotion(type) {
  currentMotion = type;
  resetSim();

  document.querySelectorAll('.motion-tab').forEach(t => t.classList.remove('active'));
  const tab = document.getElementById('tab-'+type);
  if (tab) tab.classList.add('active');

  ['MRU','MRUV','CAIDA','PARABOLICO'].forEach(m => {
    const el = document.getElementById('ctrl-'+m);
    if (el) el.style.display = m === type ? 'block' : 'none';
  });

  const titles = { MRU:'Movimiento Rectilíneo Uniforme', MRUV:'Movimiento Rectilíneo Uniformemente Variado', CAIDA:'Caída Libre', PARABOLICO:'Tiro Parabólico' };
  const badgeColors = { MRU:'rgba(96,165,250,0.15);border:1px solid rgba(96,165,250,0.3);color:var(--blue)', MRUV:'rgba(34,211,160,0.15);border:1px solid rgba(34,211,160,0.3);color:var(--green)', CAIDA:'rgba(248,113,113,0.15);border:1px solid rgba(248,113,113,0.3);color:var(--coral)', PARABOLICO:'rgba(245,158,11,0.15);border:1px solid rgba(245,158,11,0.3);color:var(--amber)' };
  
  if (currentMode === 'sim') {
    document.getElementById('canvas-title').textContent = titles[type];
  }
  
  document.getElementById('motion-badge').style.cssText = 'background:'+badgeColors[type];
  document.getElementById('motion-badge').textContent = type === 'PARABOLICO' ? 'PARABÓLICO' : type;

  updateEquations(type);
  drawIdleCanvas();
}

function updateParams() {
  const ids = {
    'v0-mru':'v0-mru-val','x0-mru':'x0-mru-val',
    'v0-mruv':'v0-mruv-val','a-mruv':'a-mruv-val','x0-mruv':'x0-mruv-val',
    'h0-caida':'h0-caida-val','v0-caida':'v0-caida-val',
    'v0-par':'v0-par-val','ang-par':'ang-par-val','y0-par':'y0-par-val'
  };
  const units = {
    'v0-mru':'m/s','x0-mru':'m',
    'v0-mruv':'m/s','a-mruv':'m/s²','x0-mruv':'m',
    'h0-caida':'m','v0-caida':'m/s',
    'v0-par':'m/s','ang-par':'°','y0-par':'m'
  };
  for (const [id, valId] of Object.entries(ids)) {
    const el = document.getElementById(id);
    if (el) document.getElementById(valId).textContent = el.value + ' ' + units[id];
  }
  if (simRunning) { resetSim(); }
  drawIdleCanvas();
}

// ==================== PARAMS GETTER ====================
function getParams() {
  const p = {};
  switch(currentMotion) {
    case 'MRU':
      p.v = parseFloat(document.getElementById('v0-mru').value);
      p.x0 = parseFloat(document.getElementById('x0-mru').value);
      p.a = 0;
      p.dur = parseFloat(document.getElementById('dur-mru').value);
      break;
    case 'MRUV':
      p.v0 = parseFloat(document.getElementById('v0-mruv').value);
      p.a = parseFloat(document.getElementById('a-mruv').value);
      p.x0 = parseFloat(document.getElementById('x0-mruv').value);
      p.dur = parseFloat(document.getElementById('dur-mruv').value);
      break;
    case 'CAIDA':
      p.y0 = parseFloat(document.getElementById('h0-caida').value);
      p.v0 = parseFloat(document.getElementById('v0-caida').value);
      p.a = g;
      p.dur = parseFloat(document.getElementById('dur-caida').value);
      break;
    case 'PARABOLICO':
      p.v0 = parseFloat(document.getElementById('v0-par').value);
      p.ang = parseFloat(document.getElementById('ang-par').value) * Math.PI / 180;
      p.y0 = parseFloat(document.getElementById('y0-par').value);
      p.dur = parseFloat(document.getElementById('dur-par').value);
      p.vx = p.v0 * Math.cos(p.ang);
      p.vy0 = p.v0 * Math.sin(p.ang);
      break;
  }
  return p;
}

// ==================== SIMULATION ====================
function startSim() {
  if (simRunning) return;
  simRunning = true;
  simTime = 0;
  simStopped = false;
  stopTime = null;
  stopPos = null;
  simData = { t:[], x:[], v:[], a:[], y:[], vx:[], vy:[] };
  document.getElementById('status-dot').style.background = 'var(--green)';
  document.getElementById('status-text').textContent = 'Simulando...';
  clearCharts();
  loop();
}

function resetSim() {
  if (animId) cancelAnimationFrame(animId);
  simRunning = false;
  simTime = 0;
  simStopped = false;
  stopTime = null;
  stopPos = null;
  simData = { t:[], x:[], v:[], a:[], y:[], vx:[], vy:[] };
  document.getElementById('status-dot').style.background = 'var(--text3)';
  document.getElementById('status-text').textContent = 'Listo para simular';
  document.getElementById('time-display').textContent = 't = 0.00 s';
  updateMetrics(0,0,0,0);
  clearCharts();
  document.getElementById('valid-tbody').innerHTML = '';
  drawIdleCanvas();
}

function loop() {
  if (!simRunning) return;
  simTime += DT;

  const p = getParams();
  let x, v, a, y = 0, vx = 0, vy = 0;

  switch(currentMotion) {
    case 'MRU':
      x = p.x0 + p.v * simTime;
      v = p.v;
      a = 0;
      if (simTime >= p.dur) { endSim(); return; }
      break;
    case 'MRUV':
      a = p.a;
      x = p.x0 + p.v0 * simTime + 0.5 * p.a * simTime * simTime;
      v = p.v0 + p.a * simTime;
      if (p.a < 0 && p.v0 > 0 && v <= 0 && !simStopped) {
        simStopped = true;
        stopTime = -p.v0 / p.a;
        stopPos = p.x0 + p.v0 * stopTime + 0.5 * p.a * stopTime * stopTime;
        document.getElementById('status-text').textContent =
          'v = 0 en t = ' + stopTime.toFixed(2) + ' s — objeto retrocediendo';
      }
      if (simTime >= p.dur) { endSim(); return; }
      break;
    case 'CAIDA':
      y = p.y0 - (p.v0 * simTime + 0.5 * g * simTime * simTime);
      v = p.v0 + g * simTime;
      a = g;
      x = simTime * 40; 
      if (simTime >= p.dur || y <= 0) { y = Math.max(y, 0); endSim(); return; }
      break;
    case 'PARABOLICO':
      vx = p.vx;
      vy = p.vy0 - g * simTime;
      x = p.vx * simTime;
      y = p.y0 + p.vy0 * simTime - 0.5 * g * simTime * simTime;
      v = Math.sqrt(vx*vx + vy*vy);
      a = g;
      if (simTime >= p.dur || (y < 0 && simTime > 0.2)) { y = Math.max(y, 0); endSim(); return; }
      break;
  }

  if (simData.t.length < 300) {
    simData.t.push(+simTime.toFixed(2));
    simData.x.push(+(currentMotion==='CAIDA' ? (p.y0 - (p.v0*simTime + 0.5*g*simTime*simTime)) : x).toFixed(2));
    simData.v.push(+v.toFixed(2));
    simData.a.push(+a.toFixed(2));
    if (currentMotion === 'PARABOLICO') {
      simData.y.push(+y.toFixed(2));
      simData.vx.push(+vx.toFixed(2));
      simData.vy.push(+vy.toFixed(2));
    }
    updateCharts();
  }

  document.getElementById('time-display').textContent = 't = ' + simTime.toFixed(2) + ' / ' + p.dur.toFixed(0) + ' s';
  updateMetrics(currentMotion === 'CAIDA' ? (p.y0 - (p.v0*simTime + 0.5*g*simTime*simTime)) : x, v, a, simTime);
  drawAnimation(x, y, v, a, vx, vy);
  buildValidation();

  animId = requestAnimationFrame(loop);
}

function endSim() {
  simRunning = false;
  document.getElementById('status-dot').style.background = 'var(--amber)';
  if (simStopped && stopTime !== null) {
    document.getElementById('status-text').textContent =
      'Completada — objeto detenido en t = ' + stopTime.toFixed(2) + ' s';
  } else {
    document.getElementById('status-text').textContent = 'Simulación completada';
  }
  buildValidation();
}

// ==================== DRAW ANIMATION (LIGHT THEME SUPPORT) ====================
function drawIdleCanvas() {
  const p = getParams();
  drawAnimation(currentMotion==='CAIDA'?0:p.x0||0, currentMotion==='CAIDA'?p.y0||80:0, 0, 0, 0, 0, true);
}

function drawAnimation(x, y, v, a, vx, vy, idle=false) {
  const W = canvas.width, H = canvas.height;
  ctx.clearRect(0, 0, W, H);

  // Light slate grids for beautiful contrast
  ctx.strokeStyle = 'rgba(15,23,42,0.03)';
  ctx.lineWidth = 1;
  for (let i = 0; i < W; i += 40) { ctx.beginPath(); ctx.moveTo(i,0); ctx.lineTo(i,H); ctx.stroke(); }
  for (let i = 0; i < H; i += 40) { ctx.beginPath(); ctx.moveTo(0,i); ctx.lineTo(W,i); ctx.stroke(); }

  switch(currentMotion) {
    case 'MRU': drawMRU(x, v, idle); break;
    case 'MRUV': drawMRUV(x, v, a, idle); break;
    case 'CAIDA': drawCaida(y, v, idle); break;
    case 'PARABOLICO': drawParabolico(x, y, v, vx, vy, idle); break;
  }
}

function drawMRU(x, v, idle) {
  const W = canvas.width, H = canvas.height;
  ctx.strokeStyle = 'rgba(15,23,42,0.08)';
  ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(0, H-40); ctx.lineTo(W, H-40); ctx.stroke();

  for (let i = 0; i < W; i += 60) {
    ctx.fillStyle = 'rgba(15,23,42,0.04)';
    ctx.fillRect(i, H-42, 30, 4);
  }

  const maxX = 500, px = (x / maxX) * (W - 80) + 40;
  if (!idle && simData.t.length > 1) {
    ctx.strokeStyle = 'rgba(79,70,229,0.3)';
    ctx.lineWidth = 2;
    ctx.setLineDash([4,4]);
    ctx.beginPath();
    simData.x.forEach((xi, i) => {
      const px2 = (xi / maxX) * (W - 80) + 40;
      i === 0 ? ctx.moveTo(px2, H-40) : ctx.lineTo(px2, H-40);
    });
    ctx.stroke();
    ctx.setLineDash([]);
  }

  const ox = Math.min(px, W - 50), oy = H - 40;
  drawCar(ox, oy, v);

  if (!idle && v > 0) {
    const arrowLen = Math.min(v * 3, 100);
    ctx.strokeStyle = '#4f46e5';
    ctx.fillStyle = '#4f46e5';
    ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(ox + 20, oy - 25); ctx.lineTo(ox + 20 + arrowLen, oy - 25); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(ox + 20 + arrowLen, oy - 25); ctx.lineTo(ox + 10 + arrowLen, oy - 30); ctx.lineTo(ox + 10 + arrowLen, oy - 20); ctx.fill();
    ctx.font = '12px JetBrains Mono';
    ctx.fillText('v = ' + v.toFixed(1) + ' m/s', ox + 20, oy - 35);
  }

  ctx.fillStyle = 'rgba(15,23,42,0.55)';
  ctx.font = '12px JetBrains Mono';
  ctx.fillText('x = ' + (idle?0:x).toFixed(1) + ' m', 12, 20);
}

function drawCar(cx, cy, v) {
  const spd = Math.abs(v);
  ctx.save();
  ctx.translate(cx, cy);
  if (v < -0.1) ctx.scale(-1, 1);

  const grad = ctx.createLinearGradient(0, -38, 0, -4);
  grad.addColorStop(0, '#4f46e5');
  grad.addColorStop(1, '#312e81');
  ctx.fillStyle = grad;
  ctx.beginPath(); ctx.roundRect(-24, -38, 48, 22, 4); ctx.fill();

  ctx.fillStyle = '#818cf8';
  ctx.beginPath(); ctx.roundRect(-14, -52, 28, 16, [4,4,0,0]); ctx.fill();

  ctx.fillStyle = 'rgba(14,165,233,0.3)';
  ctx.fillRect(-10, -50, 20, 12);

  [-16, 14].forEach(wx => {
    ctx.fillStyle = '#1e293b';
    ctx.beginPath(); ctx.arc(wx, -4, 8, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = '#64748b';
    ctx.beginPath(); ctx.arc(wx, -4, 5, 0, Math.PI*2); ctx.fill();
    if (spd > 0) {
      ctx.strokeStyle = 'rgba(255,255,255,0.6)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      const angle = simTime * spd * 3;
      ctx.moveTo(wx + Math.cos(angle)*4, -4 + Math.sin(angle)*4);
      ctx.lineTo(wx + Math.cos(angle+Math.PI)*4, -4 + Math.sin(angle+Math.PI)*4);
      ctx.stroke();
    }
  });
  ctx.restore();
}

function drawMRUV(x, v, a, idle) {
  const W = canvas.width, H = canvas.height;
  const p = getParams();

  ctx.strokeStyle = 'rgba(15,23,42,0.08)';
  ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(0, H-40); ctx.lineTo(W, H-40); ctx.stroke();

  let xLo, xHi;
  if (idle || simData.x.length === 0) {
    xLo = (p.x0 || 0) - 20;
    xHi = (p.x0 || 0) + 80;
  } else {
    let xMin = p.x0 || 0, xMax = p.x0 || 0;
    for (let i = 0; i < simData.x.length; i++) {
      if (simData.x[i] < xMin) xMin = simData.x[i];
      if (simData.x[i] > xMax) xMax = simData.x[i];
    }
    if (x < xMin) xMin = x;
    if (x > xMax) xMax = x;
    const range = Math.max(xMax - xMin, 50);
    xLo = xMin - range * 0.15;
    xHi = xMax + range * 0.15;
  }
  const toSX = xi => 40 + ((xi - xLo) / (xHi - xLo)) * (W - 80);
  const px = idle ? toSX(p.x0 || 0) : Math.max(20, Math.min(toSX(x), W - 20));

  const ox = toSX(0);
  if (ox >= 30 && ox <= W - 30) {
    ctx.strokeStyle = 'rgba(15,23,42,0.12)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(ox, H - 46); ctx.lineTo(ox, H - 34); ctx.stroke();
    ctx.fillStyle = 'rgba(15,23,42,0.45)';
    ctx.font = '10px JetBrains Mono';
    ctx.textAlign = 'center';
    ctx.fillText('0', ox, H - 22);
    ctx.textAlign = 'left';
  }

  if (!idle && simData.x.length > 1) {
    simData.x.forEach((xi, i) => {
      if (i === 0) return;
      const px1 = toSX(simData.x[i-1]);
      const px2 = toSX(xi);
      const frac = i / simData.x.length;
      ctx.strokeStyle = `rgba(16,185,129,${0.1 + frac * 0.5})`;
      ctx.lineWidth = 1.5 + frac * 2;
      ctx.beginPath(); ctx.moveTo(px1, H-40); ctx.lineTo(px2, H-40); ctx.stroke();
    });
  }

  if (!idle && Math.abs(a) > 0.1) {
    const aLen = Math.min(Math.abs(a) * 5, 80);
    const aDir = a > 0 ? 1 : -1;
    ctx.strokeStyle = '#f59e0b';
    ctx.fillStyle = '#f59e0b';
    ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(px + 20, H - 65); ctx.lineTo(px + 20 + aDir * aLen, H - 65); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(px + 20 + aDir * aLen, H - 65); ctx.lineTo(px + 20 + aDir * (aLen - 10), H - 70); ctx.lineTo(px + 20 + aDir * (aLen - 10), H - 60); ctx.fill();
    ctx.font = '11px JetBrains Mono';
    ctx.fillText('a = ' + a.toFixed(1) + ' m/s²', px + 20, H - 75);
  }

  if (!idle && Math.abs(v) > 0.1) {
    const vLen = Math.min(Math.abs(v) * 2.5, 90);
    const vDir = v >= 0 ? 1 : -1;
    ctx.strokeStyle = '#10b981';
    ctx.fillStyle = '#10b981';
    ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(px + 20, H - 90); ctx.lineTo(px + 20 + vDir * vLen, H - 90); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(px + 20 + vDir * vLen, H - 90); ctx.lineTo(px + 20 + vDir * (vLen-10), H - 95); ctx.lineTo(px + 20 + vDir * (vLen-10), H - 85); ctx.fill();
    ctx.font = '11px JetBrains Mono';
    ctx.fillText('v = ' + v.toFixed(1) + ' m/s', px + 20, H - 100);
  }

  drawCar(px, H-40, v);

  if (simStopped && stopPos !== null && !idle) {
    const spx = toSX(stopPos);
    if (spx >= 20 && spx <= W - 20) {
      ctx.strokeStyle = 'rgba(245,158,11,0.5)';
      ctx.lineWidth = 1;
      ctx.setLineDash([3,3]);
      ctx.beginPath(); ctx.moveTo(spx, H - 58); ctx.lineTo(spx, H - 30); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = '#f59e0b';
      ctx.font = '10px JetBrains Mono';
      ctx.textAlign = 'center';
      ctx.fillText('v=0', spx, H - 62);
      ctx.fillText('t=' + stopTime.toFixed(1) + 's', spx, H - 50);
      ctx.textAlign = 'left';
    }
  }

  if (!idle) {
    const progress = Math.min(simTime / p.dur, 1);
    ctx.fillStyle = 'rgba(15,23,42,0.04)';
    ctx.fillRect(0, H - 5, W, 5);
    ctx.fillStyle = simStopped ? '#f59e0b' : '#10b981';
    ctx.fillRect(0, H - 5, W * progress, 5);
  }

  ctx.fillStyle = 'rgba(15,23,42,0.55)';
  ctx.font = '12px JetBrains Mono';
  ctx.fillText('x = ' + (idle ? (p.x0 || 0) : x).toFixed(1) + ' m', 12, 20);
}

function drawCaida(y, v, idle) {
  const W = canvas.width, H = canvas.height;
  const p = getParams();
  const maxY = p.y0;
  const groundY = H - 30;
  const ballY = idle ? (groundY - (p.y0 / maxY) * (groundY - 40)) : (groundY - (Math.max(y, 0) / maxY) * (groundY - 40));
  const cx = W / 2;

  ctx.fillStyle = 'rgba(15,23,42,0.03)';
  ctx.fillRect(cx + 60, groundY - (p.y0 / maxY) * (groundY - 40), 30, (p.y0 / maxY) * (groundY - 40));
  ctx.fillStyle = 'rgba(15,23,42,0.06)';
  for (let i = 0; i < 6; i++) {
    ctx.fillRect(cx + 65, groundY - (p.y0 / maxY) * (groundY - 40) + i * 20 + 5, 8, 10);
    ctx.fillRect(cx + 77, groundY - (p.y0 / maxY) * (groundY - 40) + i * 20 + 5, 8, 10);
  }

  for (let h = 0; h <= maxY; h += 20) {
    const ypos = groundY - (h / maxY) * (groundY - 40);
    ctx.strokeStyle = 'rgba(15,23,42,0.06)';
    ctx.lineWidth = 1;
    ctx.setLineDash([3,5]);
    ctx.beginPath(); ctx.moveTo(20, ypos); ctx.lineTo(W - 20, ypos); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(15,23,42,0.4)';
    ctx.font = '10px JetBrains Mono';
    ctx.fillText(h + ' m', 4, ypos + 4);
  }

  ctx.fillStyle = 'rgba(16,185,129,0.1)';
  ctx.fillRect(0, groundY, W, H - groundY);
  ctx.strokeStyle = '#10b981';
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(0, groundY); ctx.lineTo(W, groundY); ctx.stroke();

  if (!idle && simData.x.length > 1) {
    ctx.strokeStyle = 'rgba(239,68,68,0.3)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([3,3]);
    ctx.beginPath();
    simData.t.forEach((ti, i) => {
      const yi_data = p.y0 - (p.v0 * ti + 0.5 * g * ti * ti);
      const py = groundY - (Math.max(yi_data, 0) / maxY) * (groundY - 40);
      i === 0 ? ctx.moveTo(cx, py) : ctx.lineTo(cx, py);
    });
    ctx.stroke();
    ctx.setLineDash([]);
  }

  if (!idle && v > 1) {
    const vLen = Math.min(v * 2, 60);
    ctx.strokeStyle = '#ef4444';
    ctx.fillStyle = '#ef4444';
    ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(cx + 20, ballY); ctx.lineTo(cx + 20, ballY + vLen); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx + 20, ballY + vLen); ctx.lineTo(cx + 15, ballY + vLen - 10); ctx.lineTo(cx + 25, ballY + vLen - 10); ctx.fill();
    ctx.font = '11px JetBrains Mono';
    ctx.fillText('v = ' + v.toFixed(1) + ' m/s', cx + 28, ballY + vLen/2);
    ctx.fillStyle = '#f59e0b';
    ctx.fillText('g = 9.8 m/s²', cx - 90, ballY + 16);
  }

  const speed = Math.min(v / 30, 1);
  ctx.shadowColor = `rgba(239,68,68,${0.3 + speed * 0.5})`;
  ctx.shadowBlur = 10 + speed * 20;
  const ballR = 16 - speed * 4;
  const ballGrad = ctx.createRadialGradient(cx - 4, ballY - 4, 2, cx, ballY, ballR);
  ballGrad.addColorStop(0, '#fca5a5');
  ballGrad.addColorStop(1, '#dc2626');
  ctx.fillStyle = ballGrad;
  ctx.beginPath(); ctx.arc(cx, ballY, ballR, 0, Math.PI * 2); ctx.fill();
  ctx.shadowBlur = 0;

  ctx.fillStyle = 'rgba(15,23,42,0.55)';
  ctx.font = '12px JetBrains Mono';
  ctx.fillText('y = ' + (idle?p.y0:Math.max(y,0)).toFixed(1) + ' m', 12, 20);
}

function drawParabolico(x, y, v, vx, vy, idle) {
  const W = canvas.width, H = canvas.height;
  const p = getParams();
  const groundY = H - 30;

  ctx.fillStyle = 'rgba(16,185,129,0.06)';
  ctx.fillRect(0, groundY, W, H - groundY);
  ctx.strokeStyle = 'rgba(16,185,129,0.3)';
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(0, groundY); ctx.lineTo(W, groundY); ctx.stroke();

  const T_flight = (2 * p.vy0) / g + (p.y0 > 0 ? Math.sqrt(2*p.y0/g)*2 : 0);
  const maxRange = p.vx * (2 * p.vy0 / g) * 1.1 || 100;
  const maxHeight = p.y0 + (p.vy0 * p.vy0) / (2 * g);
  const scaleX = (W - 80) / Math.max(maxRange, 10);
  const scaleY = (groundY - 40) / Math.max(maxHeight * 1.2, 10);

  const toScreenX = rx => 40 + rx * scaleX;
  const toScreenY = ry => groundY - ry * scaleY;

  ctx.strokeStyle = 'rgba(245,158,11,0.35)';
  ctx.lineWidth = 1.5;
  ctx.setLineDash([5, 5]);
  ctx.beginPath();
  for (let t = 0; t <= T_flight + 0.5; t += 0.05) {
    const rx = p.vx * t;
    const ry = p.y0 + p.vy0 * t - 0.5 * g * t * t;
    if (ry < 0) break;
    const sx = toScreenX(rx), sy = toScreenY(ry);
    t === 0 ? ctx.moveTo(sx, sy) : ctx.lineTo(sx, sy);
  }
  ctx.stroke();
  ctx.setLineDash([]);

  if (idle || simTime < 0.5) {
    const ang = p.ang;
    const angleLen = 60;
    const startX = toScreenX(0), startY = toScreenY(p.y0);
    ctx.strokeStyle = 'rgba(245,158,11,0.7)';
    ctx.fillStyle = 'rgba(245,158,11,0.7)';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(startX, startY); ctx.lineTo(startX + Math.cos(ang) * angleLen, startY - Math.sin(ang) * angleLen); ctx.stroke();

    ctx.strokeStyle = 'rgba(15,23,42,0.12)';
    ctx.lineWidth = 1;
    ctx.setLineDash([3,3]);
    ctx.beginPath(); ctx.moveTo(startX, startY); ctx.lineTo(startX + 70, startY); ctx.stroke();
    ctx.setLineDash([]);

    ctx.strokeStyle = 'rgba(245,158,11,0.5)';
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(startX, startY, 28, -ang, 0); ctx.stroke();

    ctx.font = 'bold 13px Space Grotesk';
    ctx.fillText('θ = ' + Math.round(p.ang * 180 / Math.PI) + '°', startX + 32, startY - 8);
  }

  if (!idle && simData.t.length > 1) {
    ctx.lineWidth = 2;
    for (let i = 1; i < simData.t.length; i++) {
      const t0 = simData.t[i-1], t1 = simData.t[i];
      const x0 = p.vx * t0, y0 = p.y0 + p.vy0 * t0 - 0.5 * g * t0 * t0;
      const x1 = p.vx * t1, y1 = p.y0 + p.vy0 * t1 - 0.5 * g * t1 * t1;
      const frac = i / simData.t.length;
      ctx.strokeStyle = `rgba(124,58,237,${0.2 + frac * 0.7})`;
      ctx.beginPath();
      ctx.moveTo(toScreenX(x0), toScreenY(Math.max(y0,0)));
      ctx.lineTo(toScreenX(x1), toScreenY(Math.max(y1,0)));
      ctx.stroke();
    }
  }

  const bx = idle ? toScreenX(0) : toScreenX(x);
  const by = idle ? toScreenY(p.y0) : toScreenY(Math.max(y, 0));

  if (!idle) {
    const vxLen = Math.min(Math.abs(vx) * 1.5, 70);
    ctx.strokeStyle = '#3b82f6';
    ctx.fillStyle = '#3b82f6';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(bx + vxLen, by); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(bx + vxLen, by); ctx.lineTo(bx + vxLen - 8, by - 5); ctx.lineTo(bx + vxLen - 8, by + 5); ctx.fill();
    ctx.font = '10px JetBrains Mono';
    ctx.fillText('vx=' + vx.toFixed(0), bx + vxLen/2 - 10, by - 6);

    const vyLen = Math.min(Math.abs(vy) * 1.5, 70);
    const vyDir = vy >= 0 ? -1 : 1;
    ctx.strokeStyle = '#10b981';
    ctx.fillStyle = '#10b981';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(bx, by + vyDir * vyLen); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(bx, by + vyDir * vyLen); ctx.lineTo(bx - 5, by + vyDir * (vyLen - 8)); ctx.lineTo(bx + 5, by + vyDir * (vyLen - 8)); ctx.fill();
    ctx.fillText('vy=' + vy.toFixed(0), bx + 6, by + vyDir * vyLen/2);
  }

  ctx.shadowColor = 'rgba(124,58,237,0.4)';
  ctx.shadowBlur = 15;
  const pGrad = ctx.createRadialGradient(bx - 4, by - 4, 2, bx, by, 14);
  pGrad.addColorStop(0, '#ddd6fe'); pGrad.addColorStop(1, '#6d28d9');
  ctx.fillStyle = pGrad;
  ctx.beginPath(); ctx.arc(bx, by, 14, 0, Math.PI * 2); ctx.fill();
  ctx.shadowBlur = 0;

  if (!idle) {
    const hmax = p.y0 + (p.vy0 * p.vy0) / (2 * g);
    const xmax = p.vx * p.vy0 / g;
    ctx.strokeStyle = 'rgba(245,158,11,0.4)';
    ctx.lineWidth = 1;
    ctx.setLineDash([3,3]);
    ctx.beginPath(); ctx.moveTo(toScreenX(xmax), toScreenY(hmax)); ctx.lineTo(toScreenX(xmax), groundY); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = '#f59e0b';
    ctx.font = '10px JetBrains Mono';
    ctx.fillText('H=' + hmax.toFixed(1)+'m', toScreenX(xmax) + 4, toScreenY(hmax) - 4);
  }

  if (!idle && y <= 0 && simTime > 0.5) {
    ctx.strokeStyle = 'rgba(16,185,129,0.5)';
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(40, groundY + 12); ctx.lineTo(bx, groundY + 12); ctx.stroke();
    ctx.fillStyle = '#10b981';
    ctx.font = '11px JetBrains Mono';
    ctx.fillText('R = ' + x.toFixed(1) + ' m', 40 + (bx-40)/2 - 30, groundY + 26);
  }
}

// ==================== METRICS ====================
function updateMetrics(x, v, a, t) {
  document.getElementById('metric-pos').innerHTML = x.toFixed(2) + '<span class="metric-unit">m</span>';
  document.getElementById('metric-vel').innerHTML = v.toFixed(2) + '<span class="metric-unit">m/s</span>';
  document.getElementById('metric-acc').innerHTML = a.toFixed(2) + '<span class="metric-unit">m/s²</span>';
  document.getElementById('metric-time').innerHTML = t.toFixed(2) + '<span class="metric-unit">s</span>';
}

// ==================== CHARTS (LIGHT SCHEME APPLIED) ====================
const chartOpts = (label, color) => ({
  type: 'line',
  data: { labels:[], datasets:[{ label, data:[], borderColor: color, borderWidth: 2, pointRadius: 0, tension: 0.3, fill: true, backgroundColor: color.replace(')', ',0.06)').replace('rgb','rgba') }] },
  options: {
    responsive: true, maintainAspectRatio: false, animation: false,
    plugins: { legend: { display: false } },
    scales: {
      x: { grid: { color: 'rgba(15,23,42,0.04)' }, ticks: { color: '#64748b', font: { size: 10 }, maxTicksLimit: 6 } },
      y: { grid: { color: 'rgba(15,23,42,0.04)' }, ticks: { color: '#64748b', font: { size: 10 }, maxTicksLimit: 5 } }
    }
  }
});

function initCharts() {
  chartPos = new Chart(document.getElementById('chartPos'), chartOpts('Posición', 'rgb(59,130,246)'));
  chartVel = new Chart(document.getElementById('chartVel'), chartOpts('Velocidad', 'rgb(16,185,129)'));
  chartAcc = new Chart(document.getElementById('chartAcc'), chartOpts('Aceleración', 'rgb(245,158,11)'));
}

function clearCharts() {
  [chartPos, chartVel, chartAcc].forEach(c => {
    c.data.labels = []; c.data.datasets[0].data = []; c.update('none');
  });
}

function updateCharts() {
  const labels = simData.t.map(t => t.toFixed(1));
  chartPos.data.labels = labels;
  chartPos.data.datasets[0].data = simData.x;
  chartVel.data.labels = labels;
  chartVel.data.datasets[0].data = simData.v;
  chartAcc.data.labels = labels;
  chartAcc.data.datasets[0].data = simData.a;
  chartPos.update('none'); chartVel.update('none'); chartAcc.update('none');
}

// ==================== EQUATIONS ====================
function updateEquations(type) {
  const eqMap = {
    MRU: [
      { f: 'x = x₀ + v·t', l: 'Posición' },
      { f: 'v = constante', l: 'Velocidad' },
      { f: 'a = 0', l: 'Aceleración' }
    ],
    MRUV: [
      { f: 'x = x₀ + v₀t + ½at²', l: 'Posición' },
      { f: 'v = v₀ + at', l: 'Velocidad' },
      { f: 'v² = v₀² + 2aΔx', l: 'Torricelli' },
      { f: 'a = constante', l: 'Aceleración' }
    ],
    CAIDA: [
      { f: 'y = y₀ - ½gt²', l: 'Posición (v₀=0)' },
      { f: 'v = gt', l: 'Velocidad' },
      { f: 'g = 9.8 m/s²', l: 'Gravedad' },
      { f: 't = √(2y₀/g)', l: 'Tiempo caída' }
    ],
    PARABOLICO: [
      { f: 'x = v₀cos(θ)·t', l: 'Posición X' },
      { f: 'y = y₀+v₀sin(θ)t-½gt²', l: 'Posición Y' },
      { f: 'vₓ = v₀cos(θ)', l: 'Velocidad X' },
      { f: 'vᵧ = v₀sin(θ)-gt', l: 'Velocidad Y' },
      { f: 'H = v₀²sin²(θ)/2g', l: 'Altura máxima' },
      { f: 'R = v₀²sin(2θ)/g', l: 'Alcance' }
    ]
  };
  const eqs = eqMap[type] || [];
  document.getElementById('eq-list').innerHTML = eqs.map(e => `<div class="eq"><span>${e.f}</span><small>${e.l}</small></div>`).join('');
}

// ==================== VALIDATION (HIDDEN BUT ALIVE) ====================
function buildValidation() {
  const p = getParams();
  const checkTimes = [0.5, 1.0, 1.5, 2.0, 3.0];
  let rows = '';
  checkTimes.forEach(t => {
    if (simData.t.length < 2) return;
    let xTheo, vTheo;
    switch(currentMotion) {
      case 'MRU': xTheo = p.x0 + p.v * t; vTheo = p.v; break;
      case 'MRUV': xTheo = p.x0 + p.v0 * t + 0.5 * p.a * t * t; vTheo = p.v0 + p.a * t; break;
      case 'CAIDA': xTheo = Math.max(0, p.y0 - (p.v0 * t + 0.5 * g * t * t)); vTheo = p.v0 + g * t; break;
      case 'PARABOLICO': xTheo = p.vx * t; vTheo = Math.sqrt(p.vx*p.vx + Math.pow(p.vy0 - g*t, 2)); break;
    }

    const idx = simData.t.findIndex(st => st >= t - 0.05);
    if (idx < 0) return;
    const xSim = simData.x[idx] !== undefined ? simData.x[idx] : null;
    const vSim = simData.v[idx] !== undefined ? simData.v[idx] : null;
    if (xSim === null) return;

    const errX = xTheo !== 0 ? Math.abs((xSim - xTheo) / xTheo * 100) : 0;
    const errClass = errX < 2 ? 'ok' : errX < 5 ? 'warn' : '';
    const errSymbol = errX < 2 ? '✓' : errX < 5 ? '⚠' : '✗';

    rows += `<tr>
      <td>${t.toFixed(1)} s</td>
      <td>${xTheo.toFixed(2)} m</td>
      <td>${xSim.toFixed(2)} m</td>
      <td class="${errClass}">${errX.toFixed(2)}%</td>
      <td>${vTheo.toFixed(2)} m/s</td>
      <td>${vSim.toFixed(2)} m/s</td>
      <td class="${errClass}">${errSymbol} ${errX < 2 ? 'Correcto' : errX < 5 ? 'Aceptable' : 'Error'}</td>
    </tr>`;
  });
  document.getElementById('valid-tbody').innerHTML = rows;
}

// ==================== AUTOMATED AUTO-TRACKING CAMERA FUNCTIONS ====================

// Sample target HSV color on canvas click (Camera Mode)
function handleCanvasColorPick(e) {
  if (currentMode !== 'cam' || !isCamaraActiva) return;
  
  const rect = canvas.getBoundingClientRect();
  const pxRealX = Math.floor((e.clientX - rect.left) * (canvas.width / rect.width));
  const pxRealY = Math.floor((e.clientY - rect.top) * (canvas.height / rect.height));
  
  const tempCtx = canvas.getContext('2d');
  
  // Read pixel color data
  const pixel = tempCtx.getImageData(pxRealX, pxRealY, 1, 1).data;
  
  colorObjetivoHsv = rgbToHsv(pixel[0], pixel[1], pixel[2]);
  
  // Draw lock animation
  dibujarEfectoLock(tempCtx, pxRealX, pxRealY);

  const indicator = document.getElementById('trackedColorIndicator');
  if (indicator) indicator.style.backgroundColor = `rgb(${pixel[0]}, ${pixel[1]}, ${pixel[2]})`;
  
  const colorVal = document.getElementById('trackedColorValue');
  if (colorVal) colorVal.innerText = `H:${colorObjetivoHsv.h.toFixed(0)}° S:${colorObjetivoHsv.s.toFixed(0)}%`;
  
  const status = document.getElementById('trackStatus');
  if (status) {
      status.innerText = "Conectado";
      status.className = "status-badge status-on";
  }
  
  const btnRecord = document.getElementById('btnCamRecord');
  if (btnRecord) {
      btnRecord.disabled = false;
      btnRecord.innerText = "Iniciar Grabación";
      btnRecord.className = "btn primary";
  }
  
  smoothX = pxRealX;
  smoothY = pxRealY;
  
  // Initialize Region of Interest (ROI) for performance optimization
  searchRect = {
      x: Math.max(0, smoothX - 80),
      y: Math.max(0, smoothY - 80),
      w: 160,
      h: 160
  };
  
  datosCapturados = [];
  trailPuntos = [];
}

// RGB to HSV Conversion helper
function rgbToHsv(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h, s, v = max;
    const d = max - min;
    s = max === 0 ? 0 : d / max;
    if (max === min) {
        h = 0;
    } else {
        switch (max) {
            case r: h = (g - b) / d + (g < b ? 6 : 0); break;
            case g: h = (b - r) / d + 2; break;
            case b: h = (r - g) / d + 4; break;
        }
        h /= 6;
    }
    return { h: h * 360, s: s * 100, v: v * 100 };
}

// Lock Effect drawing helper
function dibujarEfectoLock(ctx, x, y) {
    ctx.save();
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(x, y, 30, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
}

// Toggle Camera On/Off
async function toggleCamara() {
    const video = document.getElementById('camVideo');
    const btnToggle = document.getElementById('btnCamToggle');
    const statusBadge = document.getElementById('trackStatus');
    const btnRecord = document.getElementById('btnCamRecord');

    if (!isCamaraActiva) {
        try {
            webcamStream = await navigator.mediaDevices.getUserMedia({
                video: { width: 600, height: 350, facingMode: "user" }
            });
            video.srcObject = webcamStream;
            video.play();
            
            isCamaraActiva = true;
            btnToggle.innerText = "Apagar Cámara";
            btnToggle.className = "btn danger";
            
            if (statusBadge) {
                statusBadge.innerText = "Activo";
                statusBadge.className = "status-badge status-on";
            }
            
            procesarFotogramaCamara();
        } catch (err) {
            console.error("Camera error:", err);
            alert("No se pudo iniciar la cámara web o no se tienen los permisos.");
        }
    } else {
        desactivarCamaraCompleta();
    }
}

// Turn off webcam completely
function desactivarCamaraCompleta() {
    const btnToggle = document.getElementById('btnCamToggle');
    const statusBadge = document.getElementById('trackStatus');
    const btnRecord = document.getElementById('btnCamRecord');

    if (webcamStream) {
        webcamStream.getTracks().forEach(track => track.stop());
        webcamStream = null;
    }
    
    isCamaraActiva = false;
    if (isGrabando) toggleGrabacion();
    
    if (camaraAnimationId) cancelAnimationFrame(camaraAnimationId);
    
    btnToggle.innerText = "Activar Cámara";
    btnToggle.className = "btn primary";
    
    if (statusBadge) {
        statusBadge.innerText = "Desconectado";
        statusBadge.className = "status-badge status-off";
    }
    if (btnRecord) btnRecord.disabled = true;
    
    resetCamUI();
    
    // Draw "camara apagada" status again
    const tempCtx = canvas.getContext('2d');
    tempCtx.fillStyle = '#0f172a';
    tempCtx.fillRect(0, 0, canvas.width, canvas.height);
    tempCtx.fillStyle = '#ffffff';
    tempCtx.font = 'bold 20px Space Grotesk';
    tempCtx.textAlign = 'center';
    tempCtx.textBaseline = 'middle';
    tempCtx.fillText('CÁMARA APAGADA', canvas.width / 2, canvas.height / 2);
    tempCtx.font = '13px Space Grotesk';
    tempCtx.fillStyle = '#94a3b8';
    tempCtx.fillText('Haz clic en "Activar Cámara" en el panel lateral para iniciar.', canvas.width / 2, canvas.height / 2 + 30);
    tempCtx.textAlign = 'left';
    tempCtx.textBaseline = 'alphabetic';
}

// Live frame processing loop (automatic tracking)
function procesarFotogramaCamara() {
    if (!isCamaraActiva) return;

    const video = document.getElementById('camVideo');
    const ctxCam = canvas.getContext('2d');

    // Draw video feed mirrored
    ctxCam.save();
    ctxCam.translate(canvas.width, 0);
    ctxCam.scale(-1, 1);
    ctxCam.drawImage(video, 0, 0, canvas.width, canvas.height);
    ctxCam.restore();

    // LIVE indicator
    ctxCam.fillStyle = 'rgba(15,23,42,0.75)';
    ctxCam.fillRect(8, 8, 80, 22);
    ctxCam.fillStyle = '#ef4444';
    ctxCam.beginPath(); ctxCam.arc(20, 19, 5, 0, Math.PI * 2); ctxCam.fill();
    ctxCam.fillStyle = '#ffffff';
    ctxCam.font = 'bold 11px Space Grotesk';
    ctxCam.fillText('EN VIVO', 30, 22);

    if (colorObjetivoHsv) {
        const frameData = ctxCam.getImageData(0, 0, canvas.width, canvas.height);
        const pixels = frameData.data;
        
        let candidatos = [];
        let roughSumX = 0;
        let roughSumY = 0;
        
        // Optimización 1: Region of Interest (ROI)
        let startX = 0, startY = 0, endX = canvas.width, endY = canvas.height;
        if (searchRect) {
            startX = Math.max(0, Math.floor(searchRect.x));
            startY = Math.max(0, Math.floor(searchRect.y));
            endX = Math.min(canvas.width, Math.floor(searchRect.x + searchRect.w));
            endY = Math.min(canvas.height, Math.floor(searchRect.y + searchRect.h));
        }

        for (let y = startY; y < endY; y += 3) {
            for (let x = startX; x < endX; x += 3) {
                const idx = (y * canvas.width + x) * 4;
                const r = pixels[idx];
                const g = pixels[idx+1];
                const b = pixels[idx+2];
                
                const hsv = rgbToHsv(r, g, b);
                
                let hDiff = Math.abs(hsv.h - colorObjetivoHsv.h);
                if (hDiff > 180) hDiff = 360 - hDiff;
                
                let matches = false;
                if (colorObjetivoHsv.s > 20) {
                    matches = (hDiff < hTol) && (Math.abs(hsv.s - colorObjetivoHsv.s) < sTol) && (hsv.v > 15);
                } else {
                    matches = (Math.abs(hsv.s - colorObjetivoHsv.s) < 20) && (Math.abs(hsv.v - colorObjetivoHsv.v) < 25);
                }

                if (matches) {
                    candidatos.push({ x, y });
                    roughSumX += x;
                    roughSumY += y;
                }
            }
        }

        const statusBadge = document.getElementById('trackStatus');
        
        if (candidatos.length > 5) {
            const roughCx = roughSumX / candidatos.length;
            const roughCy = roughSumY / candidatos.length;
            
            let refinedSumX = 0;
            let refinedSumY = 0;
            let countRefined = 0;
            const radioFiltro = 60;

            for (let i = 0; i < candidatos.length; i++) {
                const pt = candidatos[i];
                const dist = Math.hypot(pt.x - roughCx, pt.y - roughCy);
                if (dist < radioFiltro) {
                    refinedSumX += pt.x;
                    refinedSumY += pt.y;
                    countRefined++;
                }
            }

            if (countRefined > 5) {
                const targetCx = refinedSumX / countRefined;
                const targetCy = refinedSumY / countRefined;

                smoothX = smoothX * 0.6 + targetCx * 0.4;
                smoothY = smoothY * 0.6 + targetCy * 0.4;

                // Center ROI on new position
                searchRect = {
                    x: Math.max(0, smoothX - 80),
                    y: Math.max(0, smoothY - 80),
                    w: 160,
                    h: 160
                };

                // Draw locks
                ctxCam.strokeStyle = "#10b981"; // emerald lock
                ctxCam.lineWidth = 2.5;

                ctxCam.beginPath();
                ctxCam.arc(smoothX, smoothY, 18, 0, Math.PI * 2);
                ctxCam.stroke();

                ctxCam.beginPath();
                ctxCam.moveTo(smoothX - 25, smoothY); ctxCam.lineTo(smoothX + 25, smoothY);
                ctxCam.moveTo(smoothX, smoothY - 25); ctxCam.lineTo(smoothX, smoothY + 25);
                ctxCam.stroke();

                ctxCam.fillStyle = "#ff2a6d";
                ctxCam.beginPath();
                ctxCam.arc(smoothX, smoothY, 4, 0, Math.PI * 2);
                ctxCam.fill();

                // Draw subtle ROI rectangle
                ctxCam.strokeStyle = "rgba(255, 255, 255, 0.25)";
                ctxCam.lineWidth = 1;
                ctxCam.strokeRect(searchRect.x, searchRect.y, searchRect.w, searchRect.h);

                // Compute Physical coordinates
                const D = parseFloat(document.getElementById('camDistancia').value) || 1.5;
                const anchoFisico = 1.1547 * D;
                const altoFisico = anchoFisico * (canvas.height / canvas.width);
                
                const rx = (smoothX / canvas.width) * anchoFisico;
                const ry = (1 - (smoothY / canvas.height)) * altoFisico;

                document.getElementById('trackX').innerText = `${rx.toFixed(2)} m`;
                document.getElementById('trackY').innerText = `${ry.toFixed(2)} m`;

                if (statusBadge) {
                    if (isGrabando) {
                        statusBadge.innerText = "Grabando";
                        statusBadge.className = "status-badge status-rec";
                    } else {
                        statusBadge.innerText = "Rastreando";
                        statusBadge.className = "status-badge status-on";
                    }
                }

                if (isGrabando) {
                    const t = (performance.now() - tiempoInicioGrabacion) / 1000;
                    if (datosCapturados.length === 0 || t > datosCapturados[datosCapturados.length-1].t) {
                        datosCapturados.push({ t, x: rx, y: ry, px: smoothX, py: smoothY });
                    }
                }

                trailPuntos.push({ px: smoothX, py: smoothY });
                if (trailPuntos.length > 50) trailPuntos.shift();

            } else {
                searchRect = null; // search full canvas on next frame
                marcarObjetoPerdido(ctxCam, statusBadge);
            }
        } else {
            searchRect = null;
            marcarObjetoPerdido(ctxCam, statusBadge);
        }

        const trailToDraw = isGrabando ? datosCapturados : trailPuntos;
        if (trailToDraw.length > 1) {
            ctxCam.save();
            ctxCam.strokeStyle = isGrabando ? "#ff2a6d" : "#00ffcc";
            ctxCam.lineWidth = 3;
            ctxCam.lineCap = "round";
            
            ctxCam.beginPath();
            ctxCam.moveTo(trailToDraw[0].px, trailToDraw[0].py);
            for (let i = 1; i < trailToDraw.length; i++) {
                ctxCam.lineTo(trailToDraw[i].px, trailToDraw[i].py);
            }
            ctxCam.stroke();
            ctxCam.restore();
        }
    } else {
        // Sample hint
        ctxCam.fillStyle = 'rgba(0,0,0,0.6)';
        ctxCam.fillRect(20, canvas.height - 40, canvas.width - 40, 30);
        ctxCam.fillStyle = '#ffffff';
        ctxCam.font = '12px Space Grotesk';
        ctxCam.textAlign = 'center';
        ctxCam.fillText('Haz clic sobre el objeto de color en el video para enganchar el rastreador.', canvas.width / 2, canvas.height - 21);
        ctxCam.textAlign = 'left';
    }

    camaraAnimationId = requestAnimationFrame(procesarFotogramaCamara);
}

function marcarObjetoPerdido(ctxCam, statusBadge) {
    if (statusBadge) {
        statusBadge.innerText = "Perdido";
        statusBadge.className = "status-badge status-off";
    }
    ctxCam.save();
    ctxCam.strokeStyle = "#ef4444";
    ctxCam.lineWidth = 1.5;
    ctxCam.setLineDash([4, 4]);
    ctxCam.beginPath();
    ctxCam.arc(smoothX, smoothY, 20, 0, Math.PI * 2);
    ctxCam.stroke();
    ctxCam.restore();
}

// Toggle Grabacion/Recording
function toggleGrabacion() {
    const btnRecord = document.getElementById('btnCamRecord');
    const statusBadge = document.getElementById('trackStatus');

    if (!isGrabando) {
        datosCapturados = [];
        trailPuntos = [];
        isGrabando = true;
        tiempoInicioGrabacion = performance.now();
        
        btnRecord.innerText = "Detener y Analizar";
        btnRecord.className = "btn danger btn-record recording";
        
        if (statusBadge) {
            statusBadge.innerText = "Grabando";
            statusBadge.className = "status-badge status-rec";
        }
    } else {
        isGrabando = false;
        btnRecord.innerText = "Iniciar Grabación";
        btnRecord.className = "btn primary";
        
        if (statusBadge) {
            statusBadge.innerText = "Rastreando";
            statusBadge.className = "status-badge status-on";
        }
        
        clasificarYAnalizarMovimientoCamara();
    }
}

// Dynamic Regression Calculation
function calcularRegresionLineal(xArr, yArr) {
    let n = xArr.length;
    let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;
    for (let i = 0; i < n; i++) {
        sumX += xArr[i];
        sumY += yArr[i];
        sumXY += xArr[i] * yArr[i];
        sumXX += xArr[i] * xArr[i];
    }
    let pendiente = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX) || 0;
    let interseccion = (sumY - pendiente * sumX) / n;
    
    let yMean = sumY / n;
    let ssTot = 0, ssRes = 0;
    for (let i = 0; i < n; i++) {
        let yPred = pendiente * xArr[i] + interseccion;
        ssTot += Math.pow(yArr[i] - yMean, 2);
        ssRes += Math.pow(yArr[i] - yPred, 2);
    }
    let r2 = ssTot === 0 ? 1 : 1 - (ssRes / ssTot);
    return { pendiente, interseccion, r2 };
}

// Statistical Kinetic Model and Dynamic Movement Classifications
function clasificarYAnalizarMovimientoCamara() {
    if (datosCapturados.length < 6) {
        alert("Pocos datos registrados para clasificar. Por favor haz un recorrido de captura más largo.");
        return;
    }

    let datosSuavizados = [];
    for (let i = 0; i < datosCapturados.length; i++) {
        if (i > 0 && i < datosCapturados.length - 1) {
            const sx = (datosCapturados[i-1].x + datosCapturados[i].x + datosCapturados[i+1].x) / 3;
            const sy = (datosCapturados[i-1].y + datosCapturados[i].y + datosCapturados[i+1].y) / 3;
            datosSuavizados.push({ t: datosCapturados[i].t, x: sx, y: sy });
        } else {
            datosSuavizados.push({ t: datosCapturados[i].t, x: datosCapturados[i].x, y: datosCapturados[i].y });
        }
    }

    let vxs = [], vys = [], vs = [];
    
    for (let i = 0; i < datosSuavizados.length; i++) {
        let dt;
        if (i === 0) {
            dt = datosSuavizados[1].t - datosSuavizados[0].t || 0.033;
            datosSuavizados[0].vx = (datosSuavizados[1].x - datosSuavizados[0].x) / dt;
            datosSuavizados[0].vy = (datosSuavizados[1].y - datosSuavizados[0].y) / dt;
        } else if (i === datosSuavizados.length - 1) {
            dt = datosSuavizados[i].t - datosSuavizados[i-1].t || 0.033;
            datosSuavizados[i].vx = (datosSuavizados[i].x - datosSuavizados[i-1].x) / dt;
            datosSuavizados[i].vy = (datosSuavizados[i].y - datosSuavizados[i-1].y) / dt;
        } else {
            dt = datosSuavizados[i+1].t - datosSuavizados[i-1].t || 0.066;
            datosSuavizados[i].vx = (datosSuavizados[i+1].x - datosSuavizados[i-1].x) / dt;
            datosSuavizados[i].vy = (datosSuavizados[i+1].y - datosSuavizados[i-1].y) / dt;
        }
        datosSuavizados[i].v = Math.hypot(datosSuavizados[i].vx, datosSuavizados[i].vy);
        vxs.push(datosSuavizados[i].vx);
        vys.push(datosSuavizados[i].vy);
        vs.push(datosSuavizados[i].v);
    }

    const ts = datosSuavizados.map(pt => pt.t);
    const xs = datosSuavizados.map(pt => pt.x);
    const ys = datosSuavizados.map(pt => pt.y);
    const dx = Math.max(...xs) - Math.min(...xs);
    const dy = Math.max(...ys) - Math.min(...ys);

    // Statistical Regressions
    const regX_T = calcularRegresionLineal(ts, xs);
    const regY_T = calcularRegresionLineal(ts, ys);
    const regVx_T = calcularRegresionLineal(ts, vxs);
    const regVy_T = calcularRegresionLineal(ts, vys);

    let tipoMov = 'MRU';

    if (dy > dx * 1.8 && dx < 0.3) {
        tipoMov = 'CAIDA';
    } else if (dy > 0.15 && dx >= 0.25) {
        let sube = false, baja = false;
        for(let i = 1; i < datosSuavizados.length; i++) {
            if (datosSuavizados[i].y > datosSuavizados[i-1].y + 0.005) sube = true;
            if (datosSuavizados[i].y < datosSuavizados[i-1].y - 0.005) baja = true;
        }
        
        if ((sube && baja) || Math.abs(regVy_T.pendiente) > 1.5) {
            tipoMov = 'PARABOLICO';
        } else {
            if (regX_T.r2 > 0.90 && regY_T.r2 > 0.90 && Math.abs(regVx_T.pendiente) < 0.8 && Math.abs(regVy_T.pendiente) < 0.8) {
                tipoMov = 'MRU';
            } else {
                tipoMov = 'MRUV';
            }
        }
    } else {
        if (regX_T.r2 > 0.92 && Math.abs(regVx_T.pendiente) < 0.8) {
            tipoMov = 'MRU';
        } else {
            tipoMov = 'MRUV';
        }
    }

    aplicarTema(tipoMov);

    const badge = document.getElementById('trackMovDetectado');
    if (badge) {
        badge.innerText = THEMES[tipoMov].label;
        badge.style.color = THEMES[tipoMov].primary;
    }

    const tExp = datosSuavizados[datosSuavizados.length-1].t;
    const vExpMax = Math.max(...vs);
    const distTotal = Math.max(dx, dy);

    document.getElementById('camMetricTime').innerHTML = `${tExp.toFixed(2)}<span class="metric-unit">s</span>`;
    document.getElementById('camMetricVmax').innerHTML = `${vExpMax.toFixed(2)}<span class="metric-unit">m/s</span>`;
    document.getElementById('camMetricDist').innerHTML = `${distTotal.toFixed(2)}<span class="metric-unit">m</span>`;

    document.getElementById('trackV').innerText = `${datosSuavizados[datosSuavizados.length-1].v.toFixed(2)} m/s`;
}

// Reset camera telemetry and captures
function resetCamaraData() {
    datosCapturados = [];
    trailPuntos = [];
    searchRect = null;
    
    document.getElementById('trackX').innerText = "0.00 m";
    document.getElementById('trackY').innerText = "0.00 m";
    document.getElementById('trackV').innerText = "0.00 m/s";

    const badge = document.getElementById('trackMovDetectado');
    if (badge) {
        badge.innerText = "Esperando...";
        badge.style.color = "var(--amber)";
    }
    
    document.getElementById('camMetricTime').innerHTML = `0.00<span class="metric-unit">s</span>`;
    document.getElementById('camMetricVmax').innerHTML = `0.00<span class="metric-unit">m/s</span>`;
    document.getElementById('camMetricDist').innerHTML = `0.00<span class="metric-unit">m</span>`;

    aplicarTema('MRU');
}

// Apply dynamic detected movement badge themes
function aplicarTema(tipo) {
  const theme = THEMES[tipo] || THEMES.MRU;
  
  const camBadge = document.getElementById("camMovTypeDisplay");
  if (camBadge) {
    camBadge.innerText = theme.label;
    camBadge.style.color = theme.primary;
    camBadge.style.backgroundColor = theme.light;
  }
}

// Reset Camera Mode variables and Telemetry widgets
function resetCamUI() {
  const status = document.getElementById('trackStatus');
  if (status) {
    status.innerText = "Desconectado";
    status.className = "status-badge status-off";
  }
  
  const indicator = document.getElementById('trackedColorIndicator');
  if (indicator) indicator.style.backgroundColor = "transparent";
  
  const colorVal = document.getElementById('trackedColorValue');
  if (colorVal) colorVal.innerText = "Ninguno";
  
  const trackX = document.getElementById('trackX');
  if (trackX) trackX.innerText = "0.00 m";
  
  const trackY = document.getElementById('trackY');
  if (trackY) trackY.innerText = "0.00 m";
  
  const trackV = document.getElementById('trackV');
  if (trackV) trackV.innerText = "0.00 m/s";
  
  const trackMov = document.getElementById('trackMovDetectado');
  if (trackMov) {
    trackMov.innerText = "Esperando...";
    trackMov.style.color = "var(--amber)";
  }
  
  const camMetricTime = document.getElementById('camMetricTime');
  if (camMetricTime) camMetricTime.innerHTML = `0.00<span class="metric-unit">s</span>`;
  
  const camMetricVmax = document.getElementById('camMetricVmax');
  if (camMetricVmax) camMetricVmax.innerHTML = `0.00<span class="metric-unit">m/s</span>`;
  
  const camMetricDist = document.getElementById('camMetricDist');
  if (camMetricDist) camMetricDist.innerHTML = `0.00<span class="metric-unit">m</span>`;
  
  const btnRecord = document.getElementById('btnCamRecord');
  if (btnRecord) {
    btnRecord.disabled = true;
    btnRecord.innerText = "Iniciar Grabación";
    btnRecord.className = "btn";
  }
  
  colorObjetivoHsv = null;
  searchRect = null;
  datosCapturados = [];
  trailPuntos = [];
}

// Launch initializer on load
init();
