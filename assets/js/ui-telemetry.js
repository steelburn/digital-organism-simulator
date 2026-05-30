import { runtime, telemetryHistory, MAX_DATA_POINTS } from './state.js';
import { GlobalRegistry, Microorganism, triggerToast } from './simulation-core.js';
import { WebGPUTerrainRenderer } from './webgpu-renderer.js';

/* ── WebGPU terrain accelerator (initialised asynchronously) ─────────────── */
const gpuRenderer = new WebGPUTerrainRenderer();
let   gpuReady    = false;
gpuRenderer.init().then(ok => {
    gpuReady = ok;
    if (ok) triggerToast('WebGPU terrain accelerator active', 'info');
});

const telemetryCanvas = document.getElementById('telemetryCanvas');
const telemetryCtx = telemetryCanvas ? telemetryCanvas.getContext('2d') : null;

function resizeTelemetryCanvas() {
    if (!telemetryCanvas) return;
    telemetryCanvas.width = telemetryCanvas.parentElement.clientWidth;
    telemetryCanvas.height = telemetryCanvas.parentElement.clientHeight;
}

if (telemetryCanvas) {
    window.addEventListener('resize', resizeTelemetryCanvas);
    resizeTelemetryCanvas();
}

function drawTelemetryChart() {
    if (!telemetryCanvas || !telemetryCtx) return;
    const ctx = telemetryCtx;
    const w = telemetryCanvas.width;
    const h = telemetryCanvas.height;
    ctx.clearRect(0, 0, w, h);

    if (telemetryHistory.animals.length === 0) return;

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.03)';
    ctx.lineWidth = 1;
    for (let y = 0; y < h; y += 25) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
    }

    let maxVal = 10;
    for (const k in telemetryHistory) {
        const colMax = Math.max(...telemetryHistory[k], 10);
        if (colMax > maxVal) maxVal = colMax;
    }

    const stepX = w / MAX_DATA_POINTS;
    const drawMetricLine = (data, color) => {
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        for (let i = 0; i < data.length; i++) {
            const x = i * stepX;
            const y = h - (data[i] / maxVal) * (h - 10) - 5;
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        }
        ctx.stroke();
    };

    drawMetricLine(telemetryHistory.animals, '#22d3ee');
    drawMetricLine(telemetryHistory.plants, '#34d399');
    drawMetricLine(telemetryHistory.spores, '#38bdf8');
    drawMetricLine(telemetryHistory.carcasses, '#f59e0b');
    drawMetricLine(telemetryHistory.lineages, '#e879f9');
}

const brainCanvas = document.getElementById('brainCanvas');
const brainCtx = brainCanvas ? brainCanvas.getContext('2d') : null;

function drawSelectedBrainNet() {
    if (!brainCanvas || !brainCtx) return;
    const ctx = brainCtx;
    const w = (brainCanvas.width = brainCanvas.parentElement.clientWidth);
    const h = (brainCanvas.height = brainCanvas.parentElement.clientHeight);
    ctx.clearRect(0, 0, w, h);

    if (!runtime.selectedEntity || !(runtime.selectedEntity instanceof Microorganism)) {
        ctx.fillStyle = '#64748b';
        ctx.font = '10px "Inter", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('Select a microorganism to view ANN synapses', w / 2, h / 2);
        return;
    }

    const brain = runtime.selectedEntity.brain;
    const inputNodes = ['FoodProx', 'ThreatProx', 'TurnCue', 'NutrStress', 'Phero+Wind'];
    const hiddenNodes = ['H0', 'H1', 'H2', 'H3'];
    const outputNodes = ['Steer', 'Thrust', 'Signal', 'Bite'];

    const colIn = w * 0.15;
    const colMid = w * 0.5;
    const colOut = w * 0.85;

    const inCoords = inputNodes.map((lbl, idx) => ({ x: colIn, y: h * 0.15 + (idx / 4) * h * 0.7, name: lbl }));
    const midCoords = hiddenNodes.map((lbl, idx) => ({ x: colMid, y: h * 0.2 + (idx / 3) * h * 0.6, name: lbl }));
    const outCoords = outputNodes.map((lbl, idx) => ({ x: colOut, y: h * 0.2 + (idx / 3) * h * 0.6, name: lbl }));

    for (let hNode = 0; hNode < 4; hNode++) {
        for (let iNode = 0; iNode < 5; iNode++) {
            const weight = brain.weights[hNode * 5 + iNode];
            ctx.lineWidth = Math.min(2.5, Math.abs(weight) * 1.5);
            ctx.strokeStyle = weight > 0 ? 'rgba(6, 182, 212, 0.4)' : 'rgba(239, 68, 68, 0.4)';
            ctx.beginPath();
            ctx.moveTo(inCoords[iNode].x, inCoords[iNode].y);
            ctx.lineTo(midCoords[hNode].x, midCoords[hNode].y);
            ctx.stroke();
        }
    }

    for (let oNode = 0; oNode < 4; oNode++) {
        for (let hNode = 0; hNode < 4; hNode++) {
            const weight = brain.weights[24 + oNode * 4 + hNode];
            ctx.lineWidth = Math.min(2.5, Math.abs(weight) * 1.5);
            ctx.strokeStyle = weight > 0 ? 'rgba(6, 182, 212, 0.4)' : 'rgba(239, 68, 68, 0.4)';
            ctx.beginPath();
            ctx.moveTo(midCoords[hNode].x, midCoords[hNode].y);
            ctx.lineTo(outCoords[oNode].x, outCoords[oNode].y);
            ctx.stroke();
        }
    }

    const drawLayer = (coords, color, size = 4) => {
        coords.forEach(pt => {
            ctx.fillStyle = color;
            ctx.shadowBlur = 6;
            ctx.shadowColor = color;
            ctx.beginPath();
            ctx.arc(pt.x, pt.y, size, 0, Math.PI * 2);
            ctx.fill();

            ctx.fillStyle = '#94a3b8';
            ctx.shadowBlur = 0;
            ctx.font = '7.5px "Fira Code", monospace';
            ctx.textAlign = pt.x > colMid ? 'left' : pt.x < colMid ? 'right' : 'center';
            const xOffset = pt.x > colMid ? 6 : pt.x < colMid ? -6 : 0;
            const yOffset = pt.x === colMid ? -6 : 2.5;
            ctx.fillText(pt.name, pt.x + xOffset, pt.y + yOffset);
        });
    };

    drawLayer(inCoords, '#38bdf8');
    drawLayer(midCoords, '#e879f9');
    drawLayer(outCoords, '#2dd4bf');
}

const phylogenyCanvas = document.getElementById('phylogenyCanvas');
const phylogenyCtx = phylogenyCanvas ? phylogenyCanvas.getContext('2d') : null;

function resizePhylogenyCanvas() {
    if (!phylogenyCanvas) return;
    phylogenyCanvas.width = phylogenyCanvas.parentElement.clientWidth;
    phylogenyCanvas.height = phylogenyCanvas.parentElement.clientHeight;
}

if (phylogenyCanvas) {
    window.addEventListener('resize', resizePhylogenyCanvas);
    resizePhylogenyCanvas();
}

function formatDnaSequenceToHex(dnaSequence) {
    if (!dnaSequence) return '[]';
    const genes = dnaSequence
        .split(',')
        .map(part => Number(part.trim()))
        .filter(num => Number.isFinite(num));
    if (genes.length === 0) return '[]';
    return `[${genes.map(gene => `0x${gene.toString(16).toUpperCase().padStart(2, '0')}`).join(', ')}]`;
}

function drawPhylogenyTree() {
    if (!phylogenyCanvas || !phylogenyCtx) return;
    const ctx = phylogenyCtx;
    const w = phylogenyCanvas.width;
    const h = phylogenyCanvas.height;
    ctx.clearRect(0, 0, w, h);

    const nodes = Array.from(GlobalRegistry.registry.values());
    if (nodes.length === 0) return;

    const maxGen = Math.max(...nodes.map(n => n.generationIndex), 1);
    const generationGroups = {};

    nodes.forEach(node => {
        if (!generationGroups[node.generationIndex]) {
            generationGroups[node.generationIndex] = [];
        }
        generationGroups[node.generationIndex].push(node);
    });

    const nodeCoords = new Map();
    const marginX = 25;
    const marginY = 15;
    const usableW = w - marginX * 2;
    const usableH = h - marginY * 2;

    Object.keys(generationGroups).forEach(genStr => {
        const gen = parseInt(genStr, 10);
        const list = generationGroups[gen];
        const count = list.length;
        const x = marginX + (gen / maxGen) * usableW;

        list.forEach((node, i) => {
            const y = marginY + ((i + 0.5) / count) * usableH;
            nodeCoords.set(node.uniqueId, { x, y });
        });
    });

    ctx.lineWidth = 1.5;
    nodes.forEach(node => {
        if (node.parentId && nodeCoords.has(node.parentId)) {
            const parent = nodeCoords.get(node.parentId);
            const child = nodeCoords.get(node.uniqueId);

            ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
            ctx.beginPath();
            ctx.moveTo(parent.x, parent.y);
            ctx.bezierCurveTo(
                (parent.x + child.x) / 2,
                parent.y,
                (parent.x + child.x) / 2,
                child.y,
                child.x,
                child.y
            );
            ctx.stroke();
        }
    });

    nodes.forEach(node => {
        if (nodeCoords.has(node.uniqueId)) {
            const { x, y } = nodeCoords.get(node.uniqueId);
            const size = 3 + Math.min(10, node.livingPopulationSize);

            ctx.shadowBlur = node.livingPopulationSize > 0 ? 8 : 0;
            ctx.shadowColor = node.color;

            ctx.fillStyle = node.livingPopulationSize > 0 ? node.color : 'rgba(100,116,139,0.2)';
            ctx.beginPath();
            ctx.arc(x, y, size, 0, Math.PI * 2);
            ctx.fill();

            if (node.livingPopulationSize > 0) {
                ctx.strokeStyle = '#ffffff';
                ctx.lineWidth = 0.8;
                ctx.stroke();
            }
        }
    });
    ctx.shadowBlur = 0;
}

export {
    drawPhylogenyTree,
    drawSelectedBrainNet,
    drawTelemetryChart,
    formatDnaSequenceToHex,
    gpuReady,
    gpuRenderer
};
