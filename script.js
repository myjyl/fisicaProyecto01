let charts = {};
let animationId;

function alternarCampos() {
    const tipo = document.getElementById('tipoMov').value;
    document.getElementById('groupAcc').style.display = (tipo === "MRUV") ? "block" : "none";
    document.getElementById('groupAng').style.display = (tipo === "PARABOLICO") ? "block" : "none";
}

function iniciarSimulacion() {
    if (animationId) cancelAnimationFrame(animationId);
    const tipo = document.getElementById('tipoMov').value;
    const v0 = parseFloat(document.getElementById('v0').value);
    const tMax = parseFloat(document.getElementById('tMax').value);
    const g = 9.8;

    let datos = { tiempo: [], x: [], y: [], v: [] };
    let a = (tipo === "CAIDA") ? g : (tipo === "MRUV" ? parseFloat(document.getElementById('acc').value) : 0);
    let ang = parseFloat(document.getElementById('grado').value) * (Math.PI / 180);

    // 1. Cálculos de Trayectoria
    for (let t = 0; t <= tMax; t += tMax / 50) {
        datos.tiempo.push(t.toFixed(2));
        if (tipo === "PARABOLICO") {
            datos.x.push((v0 * Math.cos(ang) * t).toFixed(2));
            datos.y.push((v0 * Math.sin(ang) * t - 0.5 * g * t**2).toFixed(2));
            datos.v.push(Math.sqrt(Math.pow(v0 * Math.cos(ang), 2) + Math.pow(v0 * Math.sin(ang) - g * t, 2)).toFixed(2));
        } else {
            datos.x.push((v0 * t + 0.5 * a * t**2).toFixed(2));
            datos.v.push((v0 + a * t).toFixed(2));
            datos.y.push(0);
        }
    }

    // Actualizar Interfaz
    document.getElementById('resTipo').innerText = tipo;
    document.getElementById('resVar').innerText = `Distancia: ${datos.x[datos.x.length-1]}m | V. Final: ${datos.v[datos.v.length-1]}m/s`;

    actualizarGraficas(datos, tipo);
    animar(tipo, v0, a, ang, tMax);
}

function actualizarGraficas(d, tipo) {
    const labels = ["Posición", "Velocidad"];
    const ids = ["chartX", "chartV"];
    const dataSets = [tipo === "PARABOLICO" ? d.y : d.x, d.v];
    const colors = ["#004a99", "#dc3545"];

    ids.forEach((id, i) => {
        if (charts[id]) charts[id].destroy();
        charts[id] = new Chart(document.getElementById(id), {
            type: 'line',
            data: { labels: d.tiempo, datasets: [{ label: labels[i], data: dataSets[i], borderColor: colors[i], borderWidth: 2, pointRadius: 0, fill: false }] },
            options: { maintainAspectRatio: false, plugins: { legend: { labels: { boxWidth: 10, font: { size: 10 } } } }, scales: { y: { ticks: { font: { size: 8 } } }, x: { ticks: { font: { size: 8 } } } } }
        });
    });
}

function animar(tipo, v0, a, ang, tMax) {
    const cvs = document.getElementById('animacionCanvas');
    const ctx = cvs.getContext('2d');
    const start = performance.now();
    const g = 9.8;

    // Calcular escala para que NADA se salga
    let xMax = (tipo === "PARABOLICO") ? (v0 * Math.cos(ang) * tMax) : (v0 * tMax + 0.5 * a * tMax**2);
    let yMax = (tipo === "PARABOLICO") ? Math.pow(v0 * Math.sin(ang), 2) / (2 * g) : 100;
    let escalaX = (cvs.width - 100) / (xMax || 1);
    let escalaY = (cvs.height - 100) / (yMax || 1);

    function frame(now) {
        let t = Math.min((now - start) / 1000, tMax);
        ctx.clearRect(0, 0, cvs.width, cvs.height);
        document.getElementById('statsOverlay').innerText = `Tiempo: ${t.toFixed(2)}s`;

        let px, py;
        if (tipo === "PARABOLICO") {
            px = (v0 * Math.cos(ang) * t) * escalaX + 50;
            py = (cvs.height - 50) - (v0 * Math.sin(ang) * t - 0.5 * g * t**2) * escalaY;
        } else if (tipo === "CAIDA") {
            px = cvs.width / 2;
            py = 40 + (0.5 * g * t**2) * (cvs.height - 80) / (0.5 * g * tMax**2);
        } else {
            px = 50 + (v0 * t + 0.5 * a * t**2) * escalaX;
            py = cvs.height / 2;
        }

        ctx.fillStyle = "#ffcc00";
        ctx.shadowBlur = 10; ctx.shadowColor = "yellow";
        ctx.beginPath(); ctx.arc(px, py, 12, 0, Math.PI * 2); ctx.fill();

        if (t < tMax) animationId = requestAnimationFrame(frame);
    }
    animationId = requestAnimationFrame(frame);
}

// ==========================================================================
// MÓDULO DE CÁMARA Y RASTREO FÍSICO (Webcam Motion Tracking)
// ==========================================================================

let webcamStream = null;
let isCamaraActiva = false;
let isGrabando = false;
let colorObjetivo = null; // {r, g, b}
let datosCapturados = []; // [{t, x, y, px, py}]
let camaraAnimationId = null;
let trackingTol = 40; // Tolerancia de color RGB
let tiempoInicioGrabacion = 0;
let smoothX = 0;
let smoothY = 0;
let trailPuntos = []; // Historial visual reciente de píxeles

// Inicializar el escuchador de clics en el canvas de la cámara
document.addEventListener("DOMContentLoaded", () => {
    const canvasCam = document.getElementById('webcamCanvas');
    if (canvasCam) {
        canvasCam.addEventListener('mousedown', (e) => {
            if (!isCamaraActiva) return;
            
            const rect = canvasCam.getBoundingClientRect();
            // Calcular posición relativa al tamaño del canvas de respaldo (600x350)
            const x = Math.floor((e.clientX - rect.left) * (canvasCam.width / rect.width));
            const y = Math.floor((e.clientY - rect.top) * (canvasCam.height / rect.height));
            
            const ctx = canvasCam.getContext('2d');
            const pixel = ctx.getImageData(x, y, 1, 1).data;
            
            colorObjetivo = { r: pixel[0], g: pixel[1], b: pixel[2] };
            
            // Actualizar UI
            const indicator = document.getElementById('trackedColorIndicator');
            if (indicator) indicator.style.backgroundColor = `rgb(${colorObjetivo.r}, ${colorObjetivo.g}, ${colorObjetivo.b})`;
            
            const colorVal = document.getElementById('trackedColorValue');
            if (colorVal) colorVal.innerText = `RGB(${colorObjetivo.r}, ${colorObjetivo.g}, ${colorObjetivo.b})`;
            
            const status = document.getElementById('trackStatus');
            if (status) {
                status.innerText = "Rastreando";
                status.className = "status-badge status-on";
            }
            
            // Habilitar botón de grabación
            const btnRecord = document.getElementById('btnCamRecord');
            if (btnRecord) btnRecord.disabled = false;
            
            // Resetear suavizado para evitar saltos bruscos
            smoothX = x;
            smoothY = y;
        });
    }
});

async function toggleCamara() {
    const video = document.getElementById('webcamVideo');
    const canvas = document.getElementById('webcamCanvas');
    const btnToggle = document.getElementById('btnCamToggle');
    const statusText = document.getElementById('camOverlayStatus');
    const statusBadge = document.getElementById('trackStatus');
    const btnRecord = document.getElementById('btnCamRecord');

    if (!isCamaraActiva) {
        try {
            // Solicitar acceso a la webcam
            webcamStream = await navigator.mediaDevices.getUserMedia({
                video: { width: 600, height: 350, facingMode: "user" }
            });
            video.srcObject = webcamStream;
            video.play();
            
            isCamaraActiva = true;
            btnToggle.innerText = "Apagar Cámara";
            btnToggle.className = "btn-cam-control btn-active-state";
            if (statusText) statusText.style.display = "none";
            if (statusBadge) {
                statusBadge.innerText = "Activo";
                statusBadge.className = "status-badge status-on";
            }
            
            // Iniciar bucle de procesamiento
            procesarFotogramaCamara();
        } catch (err) {
            console.error("Error al acceder a la cámara:", err);
            alert("No se pudo acceder a la webcam. Por favor, asegúrate de dar permisos de cámara en tu navegador.");
        }
    } else {
        // Apagar cámara
        if (webcamStream) {
            webcamStream.getTracks().forEach(track => track.stop());
            webcamStream = null;
        }
        
        isCamaraActiva = false;
        if (isGrabando) toggleGrabacion(); // Detener si estaba grabando
        
        if (camaraAnimationId) cancelAnimationFrame(camaraAnimationId);
        
        btnToggle.innerText = "Activar Cámara";
        btnToggle.className = "btn-cam-control btn-inactive";
        if (statusText) {
            statusText.style.display = "block";
            statusText.innerText = "CÁMARA APAGADA";
        }
        if (statusBadge) {
            statusBadge.innerText = "Desconectado";
            statusBadge.className = "status-badge status-off";
        }
        if (btnRecord) {
            btnRecord.disabled = true;
        }
        
        // Limpiar lienzo
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        colorObjetivo = null;
        const colorIndicator = document.getElementById('trackedColorIndicator');
        if (colorIndicator) colorIndicator.style.backgroundColor = "transparent";
        const colorVal = document.getElementById('trackedColorValue');
        if (colorVal) colorVal.innerText = "Ninguno (Haz clic en el video)";
    }
}

function procesarFotogramaCamara() {
    if (!isCamaraActiva) return;

    const video = document.getElementById('webcamVideo');
    const canvas = document.getElementById('webcamCanvas');
    const ctx = canvas.getContext('2d');

    // 1. Dibujar el fotograma de la cámara (espejado para que sea intuitivo)
    ctx.save();
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    ctx.restore();

    // 2. Realizar rastreo si hay un color seleccionado
    if (colorObjetivo) {
        const frameData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const pixels = frameData.data;
        
        let sumX = 0;
        let sumY = 0;
        let count = 0;
        
        // Escanear submuestreando (cada 3 píxeles) para alto rendimiento
        for (let y = 0; y < canvas.height; y += 3) {
            for (let x = 0; x < canvas.width; x += 3) {
                const index = (y * canvas.width + x) * 4;
                const r = pixels[index];
                const g = pixels[index + 1];
                const b = pixels[index + 2];
                
                const rDiff = r - colorObjetivo.r;
                const gDiff = g - colorObjetivo.g;
                const bDiff = b - colorObjetivo.b;
                
                const dist = Math.sqrt(rDiff*rDiff + gDiff*gDiff + bDiff*bDiff);
                
                if (dist < trackingTol) {
                    sumX += x;
                    sumY += y;
                    count++;
                }
            }
        }

        const statusBadge = document.getElementById('trackStatus');
        
        if (count > 25) {
            // Calcular centroide del objeto rastreado
            const cx = sumX / count;
            const cy = sumY / count;
            
            // Suavizado exponencial (EMA) para evitar vibración de cámara
            smoothX = smoothX * 0.65 + cx * 0.35;
            smoothY = smoothY * 0.65 + cy * 0.35;
            
            // Dibujar mira holográfica de rastreo
            ctx.strokeStyle = "#00ff00";
            ctx.lineWidth = 2;
            
            // Círculo exterior
            ctx.beginPath();
            ctx.arc(smoothX, smoothY, 18, 0, Math.PI * 2);
            ctx.stroke();
            
            // Retícula de mira
            ctx.beginPath();
            ctx.moveTo(smoothX - 25, smoothY);
            ctx.lineTo(smoothX + 25, smoothY);
            ctx.moveTo(smoothX, smoothY - 25);
            ctx.lineTo(smoothX, smoothY + 25);
            ctx.stroke();
            
            // Punto central brillante
            ctx.fillStyle = "#ff0055";
            ctx.beginPath();
            ctx.arc(smoothX, smoothY, 4, 0, Math.PI * 2);
            ctx.fill();

            // Calcular variables físicas reales
            const D = parseFloat(document.getElementById('camDistancia').value) || 1.5;
            
            // Suponemos FOV de 60 grados. Ancho físico W = 2 * D * tan(30) = 1.154 * D
            const anchoFisico = 1.154 * D;
            const altoFisico = anchoFisico * (canvas.height / canvas.width);
            
            // Coordenadas reales (origen físico abajo izquierda)
            const rx = (smoothX / canvas.width) * anchoFisico;
            const ry = (1 - (smoothY / canvas.height)) * altoFisico; // Invertir Y para física

            // Actualizar interfaz
            document.getElementById('trackX').innerText = `${rx.toFixed(2)} m`;
            document.getElementById('trackY').innerText = `${ry.toFixed(2)} m`;
            if (statusBadge) {
                if (isGrabando) {
                    statusBadge.innerText = "GRABANDO";
                    statusBadge.className = "status-badge status-rec";
                } else {
                    statusBadge.innerText = "RASTREANDO";
                    statusBadge.className = "status-badge status-on";
                }
            }

            // Si está grabando, guardar el punto con marca de tiempo
            if (isGrabando) {
                const t = (performance.now() - tiempoInicioGrabacion) / 1000;
                
                // Evitar guardar duplicados en la misma marca de tiempo
                if (datosCapturados.length === 0 || t > datosCapturados[datosCapturados.length - 1].t) {
                    datosCapturados.push({ t, x: rx, y: ry, px: smoothX, py: smoothY });
                }
            }
            
            // Guardar en el trail visual reciente para la pantalla
            trailPuntos.push({ px: smoothX, py: smoothY });
            if (trailPuntos.length > 40) trailPuntos.shift();

        } else {
            // Objeto perdido
            if (statusBadge) {
                statusBadge.innerText = "Buscando Objeto...";
                statusBadge.className = "status-badge status-off";
            }
            
            // Dibujar mira roja de "perdido"
            ctx.strokeStyle = "#ff0000";
            ctx.lineWidth = 1;
            ctx.setLineDash([4, 4]);
            ctx.beginPath();
            ctx.arc(smoothX, smoothY, 20, 0, Math.PI * 2);
            ctx.stroke();
            ctx.setLineDash([]);
        }
        
        // 3. Dibujar rastro visual en el canvas (Trail de movimiento)
        const trailToDraw = isGrabando ? datosCapturados : trailPuntos;
        if (trailToDraw.length > 1) {
            ctx.strokeStyle = isGrabando ? "#ff0055" : "#00ffcc";
            ctx.lineWidth = 3;
            ctx.lineCap = "round";
            ctx.shadowBlur = 10;
            ctx.shadowColor = isGrabando ? "red" : "cyan";
            
            ctx.beginPath();
            ctx.moveTo(trailToDraw[0].px, trailToDraw[0].py);
            for (let i = 1; i < trailToDraw.length; i++) {
                ctx.lineTo(trailToDraw[i].px, trailToDraw[i].py);
            }
            ctx.stroke();
            
            // Restablecer estilos de sombra
            ctx.shadowBlur = 0;
        }
    }

    camaraAnimationId = requestAnimationFrame(procesarFotogramaCamara);
}

function toggleGrabacion() {
    const btnRecord = document.getElementById('btnCamRecord');
    const statusBadge = document.getElementById('trackStatus');

    if (!isGrabando) {
        // Iniciar grabación
        datosCapturados = [];
        trailPuntos = [];
        isGrabando = true;
        tiempoInicioGrabacion = performance.now();
        
        btnRecord.innerText = "Detener y Analizar";
        btnRecord.className = "btn-cam-control btn-record recording";
        
        if (statusBadge) {
            statusBadge.innerText = "GRABANDO";
            statusBadge.className = "status-badge status-rec";
        }
    } else {
        // Detener grabación
        isGrabando = false;
        
        btnRecord.innerText = "Iniciar Grabación";
        btnRecord.className = "btn-cam-control btn-record";
        
        if (statusBadge) {
            statusBadge.innerText = "RASTREANDO";
            statusBadge.className = "status-badge status-on";
        }
        
        // Analizar físicamente los datos capturados
        analizarDatosFisicos();
    }
}

function resetCamaraData() {
    datosCapturados = [];
    trailPuntos = [];
    document.getElementById('trackX').innerText = "0.00 m";
    document.getElementById('trackY').innerText = "0.00 m";
    document.getElementById('trackV').innerText = "0.00 m/s";
    document.getElementById('trackMovDetectado').innerText = "Esperando datos...";
    document.getElementById('trackMovDetectado').className = "mov-badge";
    
    // Limpiar gráficos a su estado simulado por defecto
    iniciarSimulacion();
}

function analizarDatosFisicos() {
    if (datosCapturados.length < 5) {
        alert("Se capturaron muy pocos datos de movimiento. Intenta mover el objeto más lentamente o por más tiempo en frente de la cámara.");
        return;
    }

    // 1. Suavizar coordenadas (Filtro de media móvil de 3 puntos para eliminar ruido de cámara)
    let datosSuaves = [];
    for (let i = 0; i < datosCapturados.length; i++) {
        if (i > 0 && i < datosCapturados.length - 1) {
            const sx = (datosCapturados[i-1].x + datosCapturados[i].x + datosCapturados[i+1].x) / 3;
            const sy = (datosCapturados[i-1].y + datosCapturados[i].y + datosCapturados[i+1].y) / 3;
            datosSuaves.push({ t: datosCapturados[i].t, x: sx, y: sy });
        } else {
            datosSuaves.push({ t: datosCapturados[i].t, x: datosCapturados[i].x, y: datosCapturados[i].y });
        }
    }

    // 2. Calcular velocidades instantáneas y magnitud
    // v_x = dx/dt, v_y = dy/dt
    for (let i = 0; i < datosSuaves.length; i++) {
        if (i === 0) {
            const dt = datosSuaves[1].t - datosSuaves[0].t || 0.03;
            datosSuaves[0].vx = (datosSuaves[1].x - datosSuaves[0].x) / dt;
            datosSuaves[0].vy = (datosSuaves[1].y - datosSuaves[0].y) / dt;
        } else if (i === datosSuaves.length - 1) {
            const dt = datosSuaves[i].t - datosSuaves[i-1].t || 0.03;
            datosSuaves[i].vx = (datosSuaves[i].x - datosSuaves[i-1].x) / dt;
            datosSuaves[i].vy = (datosSuaves[i].y - datosSuaves[i-1].y) / dt;
        } else {
            const dt = datosSuaves[i+1].t - datosSuaves[i-1].t || 0.06;
            datosSuaves[i].vx = (datosSuaves[i+1].x - datosSuaves[i-1].x) / dt;
            datosSuaves[i].vy = (datosSuaves[i+1].y - datosSuaves[i-1].y) / dt;
        }
        datosSuaves[i].v = Math.sqrt(datosSuaves[i].vx * datosSuaves[i].vx + datosSuaves[i].vy * datosSuaves[i].vy);
    }

    // Calcular aceleraciones para clasificación
    let axTotal = 0, ayTotal = 0;
    let counts = 0;
    for (let i = 1; i < datosSuaves.length; i++) {
        const dt = datosSuaves[i].t - datosSuaves[i-1].t || 0.03;
        const ax = (datosSuaves[i].vx - datosSuaves[i-1].vx) / dt;
        const ay = (datosSuaves[i].vy - datosSuaves[i-1].vy) / dt;
        datosSuaves[i].ax = ax;
        datosSuaves[i].ay = ay;
        
        // Ignorar valores de borde extremos
        if (i > 1 && i < datosSuaves.length - 1) {
            axTotal += ax;
            ayTotal += ay;
            counts++;
        }
    }
    
    const axProm = counts > 0 ? axTotal / counts : 0;
    const ayProm = counts > 0 ? ayTotal / counts : 0;

    // 3. Clasificación heurística inteligente del Movimiento
    const xCoords = datosSuaves.map(pt => pt.x);
    const yCoords = datosSuaves.map(pt => pt.y);
    
    const xMin = Math.min(...xCoords), xMax = Math.max(...xCoords);
    const yMin = Math.min(...yCoords), yMax = Math.max(...yCoords);
    const dX = xMax - xMin;
    const dY = yMax - yMin;

    let tipoMov = "MRU";
    let scoreExplicativo = "";
    
    // Determinar varianza de velocidades
    const vxProm = datosSuaves.reduce((sum, pt) => sum + pt.vx, 0) / datosSuaves.length;
    const vxVar = datosSuaves.reduce((sum, pt) => sum + Math.pow(pt.vx - vxProm, 2), 0) / datosSuaves.length;
    const vxStd = Math.sqrt(vxVar);

    const yIni = datosSuaves[0].y;

    // Heurísticas físicas robustas
    if (dX < 0.18 && dY > 0.3) {
        // Desplazamiento mayormente vertical -> Caída Libre
        tipoMov = "CAIDA";
        scoreExplicativo = "Caída Libre";
    } else if (dX >= 0.18 && dY >= 0.18) {
        // Ambos ejes cambian significativamente -> Tiro Parabólico
        let subioYbajo = false;
        const mitad = Math.floor(datosSuaves.length / 2);
        const yMitad = datosSuaves[mitad].y;
        const yFin = datosSuaves[datosSuaves.length - 1].y;
        
        if (yMitad > yIni + 0.05 && yFin < yMitad - 0.05) {
            subioYbajo = true;
        }

        if (subioYbajo || ayProm < -1.5) {
            tipoMov = "PARABOLICO";
            scoreExplicativo = "Tiro Parabólico";
        } else {
            tipoMov = "MRUV";
            scoreExplicativo = "MRUV (Trayectoria Curva)";
        }
    } else {
        // Desplazamiento mayormente horizontal
        const vRatio = vxStd / (Math.abs(vxProm) || 1);
        if (vRatio < 0.25 && Math.abs(axProm) < 1.0) {
            tipoMov = "MRU";
            scoreExplicativo = "MRU";
        } else {
            tipoMov = "MRUV";
            scoreExplicativo = "MRUV";
        }
    }

    // 4. Actualizar Métricas en Panel Lateral
    const vFinal = datosSuaves[datosSuaves.length - 1].v;
    document.getElementById('trackV').innerText = `${vFinal.toFixed(2)} m/s`;
    
    const badge = document.getElementById('trackMovDetectado');
    badge.innerText = scoreExplicativo;
    badge.className = "mov-badge";
    
    // 5. Actualizar Interfaz General del Simulador con Resultados Experimentales
    document.getElementById('resTipo').innerText = `${tipoMov} (EXPERIMENTAL)`;
    
    let varsText = `Duración: ${(datosSuaves[datosSuaves.length-1].t).toFixed(2)}s | `;
    if (tipoMov === "PARABOLICO") {
        varsText += `Alcance Horiz.: ${dX.toFixed(2)}m | Altura Máx: ${(yMax - yIni).toFixed(2)}m | `;
        varsText += `g Exp.: ${Math.abs(ayProm).toFixed(1)} m/s²`;
    } else if (tipoMov === "CAIDA") {
        varsText += `Altura Caída: ${dY.toFixed(2)}m | g Exp.: ${Math.abs(ayProm).toFixed(1)} m/s²`;
    } else {
        varsText += `Desplazamiento: ${dX.toFixed(2)}m | Acel. Prom: ${axProm.toFixed(2)}m/s²`;
    }
    document.getElementById('resVar').innerText = varsText;

    // 6. Actualizar las gráficas de Chart.js con la curva real medida
    actualizarGraficasConDatosCamara(datosSuaves, tipoMov);
}

function actualizarGraficasConDatosCamara(datos, tipo) {
    const ids = ["chartX", "chartV"];
    const labels = [
        tipo === "PARABOLICO" || tipo === "CAIDA" ? "Altura Experimental Y (m)" : "Posición Experimental X (m)",
        "Velocidad Experimental V (m/s)"
    ];
    
    const tiempos = datos.map(pt => pt.t.toFixed(2));
    const posiciones = datos.map(pt => (tipo === "CAIDA" || tipo === "PARABOLICO" ? pt.y : pt.x).toFixed(2));
    const velocidades = datos.map(pt => pt.v.toFixed(2));
    
    const dataSets = [posiciones, velocidades];
    const colors = ["#2b6cb0", "#e53e3e"];

    ids.forEach((id, i) => {
        if (charts[id]) charts[id].destroy();
        charts[id] = new Chart(document.getElementById(id), {
            type: 'line',
            data: { 
                labels: tiempos, 
                datasets: [{ 
                    label: labels[i], 
                    data: dataSets[i], 
                    borderColor: colors[i], 
                    borderWidth: 2, 
                    pointRadius: 2, 
                    backgroundColor: colors[i] + "22",
                    fill: true 
                }] 
            },
            options: { 
                maintainAspectRatio: false, 
                plugins: { 
                    legend: { labels: { boxWidth: 10, font: { size: 10 } } } 
                }, 
                scales: { 
                    y: { 
                        title: { display: true, text: i === 0 ? "Metros" : "m/s", font: { size: 9, weight: 'bold' } }, 
                        ticks: { font: { size: 8 } } 
                    }, 
                    x: { 
                        title: { display: true, text: "Segundos", font: { size: 9, weight: 'bold' } }, 
                        ticks: { font: { size: 8 } } 
                    } 
                } 
            }
        });
    });
}