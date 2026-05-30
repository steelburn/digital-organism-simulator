import { CONFIG, runtime, telemetryHistory, MAX_DATA_POINTS } from './state.js';
import {
    EngineInstance,
    GlobalRegistry,
    Microorganism,
    Plant,
    getToroidalDistance,
    triggerToast
} from './simulation-core.js';
import {
    drawPhylogenyTree,
    drawSelectedBrainNet,
    drawTelemetryChart,
    formatDnaSequenceToHex,
    gpuReady,
    gpuRenderer
} from './ui-telemetry.js';

const simCanvas = document.getElementById('simCanvas');
const btnArmInjectorEl = document.getElementById('btn-arm-injector');
const viewportCamera = {
    zoom: 1,
    minZoom: 0.6,
    maxZoom: 3.2,
    offsetX: 0,
    offsetY: 0,
    isPanning: false,
    panStartX: 0,
    panStartY: 0,
    panOffsetStartX: 0,
    panOffsetStartY: 0
};

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

function setViewportZoom(nextZoom, screenX, screenY) {
    const clamped = clamp(nextZoom, viewportCamera.minZoom, viewportCamera.maxZoom);
    const worldXBefore = (screenX - viewportCamera.offsetX) / viewportCamera.zoom;
    const worldYBefore = (screenY - viewportCamera.offsetY) / viewportCamera.zoom;

    viewportCamera.zoom = clamped;
    viewportCamera.offsetX = screenX - worldXBefore * clamped;
    viewportCamera.offsetY = screenY - worldYBefore * clamped;
}

function eventToWorldCoords(e) {
    const rect = simCanvas.getBoundingClientRect();
    const screenX = ((e.clientX - rect.left) / rect.width) * CONFIG.W;
    const screenY = ((e.clientY - rect.top) / rect.height) * CONFIG.H;
    const worldX = (screenX - viewportCamera.offsetX) / viewportCamera.zoom;
    const worldY = (screenY - viewportCamera.offsetY) / viewportCamera.zoom;

    return {
        x: ((worldX % CONFIG.W) + CONFIG.W) % CONFIG.W,
        y: ((worldY % CONFIG.H) + CONFIG.H) % CONFIG.H,
        screenX,
        screenY
    };
}

function syncSimulationCanvasToWorld() {
    if (!simCanvas) return;
    simCanvas.width = CONFIG.W;
    simCanvas.height = CONFIG.H;
}

const initialSeed = Number.parseInt(CONFIG.MAP_SEED, 10);
CONFIG.MAP_SEED = Number.isFinite(initialSeed) ? (initialSeed >>> 0) : 0;
syncSimulationCanvasToWorld();

function setInjectorButtonIdleState() {
    if (!btnArmInjectorEl) return;
    btnArmInjectorEl.className = 'w-full py-2 rounded-lg bg-cyan-600/20 border border-cyan-500/30 hover:bg-cyan-600/40 text-xs font-bold text-cyan-400 tracking-wider flex items-center justify-center gap-2 transition-all';
    btnArmInjectorEl.innerHTML = '<i class="fa-solid fa-syringe"></i> ARM LAB INJECTOR (TAP MAP TO SEED)';
}

simCanvas.addEventListener('click', e => {
    const { x: clickX, y: clickY } = eventToWorldCoords(e);

    if (runtime.isArmed && runtime.armedLabCreature) {
        if (runtime.armedLabCreature.type === 'animal') {
            EngineInstance.microorganisms.push(new Microorganism(clickX, clickY, runtime.armedLabCreature.dna));
            triggerToast('Engineered Animal Agent seeded successfully.', 'success');
        } else {
            EngineInstance.plants.push(new Plant(clickX, clickY, runtime.armedLabCreature.dna));
            triggerToast('Engineered Spore Flora injected successfully.', 'success');
        }
        runtime.isArmed = false;
        setInjectorButtonIdleState();
    }
});

simCanvas.addEventListener('dblclick', e => {
    const { x: clickX, y: clickY } = eventToWorldCoords(e);

    let closest = null;
    let minDist = 15;

    [...EngineInstance.plants, ...EngineInstance.microorganisms].forEach(ent => {
        const dist = getToroidalDistance({ x: clickX, y: clickY }, ent);
        if (dist < minDist) {
            minDist = dist;
            closest = ent;
        }
    });

    if (closest) {
        runtime.selectedEntity = closest;
        switchTab('inspector');
        updateInspector();
        triggerToast(`Locked telemetry focus onto Lineage #${closest.lineageId}`);
    } else {
        runtime.selectedEntity = null;
        updateInspector();
    }
});

simCanvas.addEventListener('wheel', e => {
    e.preventDefault();
    const rect = simCanvas.getBoundingClientRect();
    const screenX = ((e.clientX - rect.left) / rect.width) * CONFIG.W;
    const screenY = ((e.clientY - rect.top) / rect.height) * CONFIG.H;
    const zoomFactor = e.deltaY < 0 ? 1.12 : 0.89;
    setViewportZoom(viewportCamera.zoom * zoomFactor, screenX, screenY);
}, { passive: false });

simCanvas.addEventListener('mousedown', e => {
    if (e.button !== 1) return;
    e.preventDefault();
    viewportCamera.isPanning = true;
    viewportCamera.panStartX = e.clientX;
    viewportCamera.panStartY = e.clientY;
    viewportCamera.panOffsetStartX = viewportCamera.offsetX;
    viewportCamera.panOffsetStartY = viewportCamera.offsetY;
});

window.addEventListener('mousemove', e => {
    if (!viewportCamera.isPanning) return;
    const rect = simCanvas.getBoundingClientRect();
    const dx = ((e.clientX - viewportCamera.panStartX) / rect.width) * CONFIG.W;
    const dy = ((e.clientY - viewportCamera.panStartY) / rect.height) * CONFIG.H;
    viewportCamera.offsetX = viewportCamera.panOffsetStartX + dx;
    viewportCamera.offsetY = viewportCamera.panOffsetStartY + dy;
});

window.addEventListener('mouseup', e => {
    if (e.button === 1) {
        viewportCamera.isPanning = false;
    }
});

window.addEventListener('keydown', e => {
    if (e.key === '0') {
        viewportCamera.zoom = 1;
        viewportCamera.offsetX = 0;
        viewportCamera.offsetY = 0;
        triggerToast('Viewport zoom reset (1x)', 'info');
    }
});

const tabBtnTree = document.getElementById('tab-btn-tree');
const tabBtnInspector = document.getElementById('tab-btn-inspector');
const tabContentTree = document.getElementById('tab-content-tree');
const tabContentInspector = document.getElementById('tab-content-inspector');

function switchTab(activeTab) {
    if (!tabBtnTree || !tabBtnInspector || !tabContentTree || !tabContentInspector) return;
    if (activeTab === 'tree') {
        tabBtnTree.className = 'flex-1 text-center pb-2 border-b-2 border-emerald-500 text-xs font-tech font-bold text-slate-100';
        tabBtnInspector.className = 'flex-1 text-center pb-2 text-xs font-tech font-bold text-slate-400 hover:text-slate-200';
        tabContentTree.classList.remove('hidden');
        tabContentInspector.classList.add('hidden');
    } else {
        tabBtnInspector.className = 'flex-1 text-center pb-2 border-b-2 border-cyan-500 text-xs font-tech font-bold text-slate-100';
        tabBtnTree.className = 'flex-1 text-center pb-2 text-xs font-tech font-bold text-slate-400 hover:text-slate-200';
        tabContentInspector.classList.remove('hidden');
        tabContentTree.classList.add('hidden');
    }
}

if (tabBtnTree && tabBtnInspector) {
    tabBtnTree.addEventListener('click', () => switchTab('tree'));
    tabBtnInspector.addEventListener('click', () => switchTab('inspector'));
}

const inspectorRenderCache = {
    selectedEntity: null,
    name: '',
    badgeText: '',
    badgeClass: '',
    lineage: '',
    energy: '',
    health: '',
    speed: '',
    sensor: '',
    virus: '',
    energySave: '',
    dnaKey: '',
    brainVisible: null
};

function updateInspector() {
    const placeholder = document.getElementById('inspector-placeholder');
    const content = document.getElementById('inspector-data');

    if (!placeholder || !content) return;

    if (!runtime.selectedEntity || runtime.selectedEntity.isDead) {
        placeholder.classList.remove('hidden');
        content.classList.add('hidden');
        inspectorRenderCache.selectedEntity = null;
        inspectorRenderCache.dnaKey = '';
        inspectorRenderCache.brainVisible = null;
        return;
    }

    placeholder.classList.add('hidden');
    content.classList.remove('hidden');

    const isAnimal = runtime.selectedEntity instanceof Microorganism;

    const inspectName = document.getElementById('inspect-name');
    const badge = document.getElementById('inspect-type-badge');
    const inspectLineage = document.getElementById('inspect-lineage-val');
    const inspectEnergy = document.getElementById('inspect-energy-val');
    const inspectHealth = document.getElementById('inspect-health-val');
    const inspectSpeed = document.getElementById('inspect-speed-val');
    const inspectSensor = document.getElementById('inspect-sensor-val');
    const inspectVirus = document.getElementById('inspect-virus-val');
    const inspectEnergySave = document.getElementById('inspect-energy-save-val');

    if (!inspectName || !badge || !inspectLineage || !inspectEnergy || !inspectHealth || !inspectSpeed || !inspectSensor || !inspectVirus || !inspectEnergySave) return;

    const nextName = isAnimal ? `Microorganism #${runtime.selectedEntity.lineageId}` : `Spore Plant #${runtime.selectedEntity.lineageId}`;
    const nextBadgeText = isAnimal ? 'Animal' : 'Flora';
    const nextBadgeClass = isAnimal
        ? 'px-2 py-0.5 rounded text-[10px] font-bold bg-cyan-950 text-cyan-400 border border-cyan-800'
        : 'px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-950 text-emerald-400 border border-emerald-800';

    const nextLineage = `#${runtime.selectedEntity.lineageId}`;
    const nextEnergy = `${Math.floor(runtime.selectedEntity.energy)} nrg`;
    const nextHealth = isAnimal ? `${Math.floor(runtime.selectedEntity.health)} hp` : 'N/A';
    const nextSpeed = isAnimal ? `${runtime.selectedEntity.speed.toFixed(1)} px/f` : 'Stationary';
    const nextSensor = isAnimal ? `${runtime.selectedEntity.sensorRange} px` : 'N/A';
    const nextVirus = isAnimal ? (runtime.selectedEntity.infected ? 'INFECTED (VIRAL)' : 'Healthy') : 'N/A';
    const nextEnergySave = isAnimal ? `${Math.round((runtime.selectedEntity.energyConservation || 0) * 100)}%` : 'N/A';

    if (inspectorRenderCache.name !== nextName) {
        inspectorRenderCache.name = nextName;
        inspectName.innerText = nextName;
    }
    if (inspectorRenderCache.badgeText !== nextBadgeText) {
        inspectorRenderCache.badgeText = nextBadgeText;
        badge.innerText = nextBadgeText;
    }
    if (inspectorRenderCache.badgeClass !== nextBadgeClass) {
        inspectorRenderCache.badgeClass = nextBadgeClass;
        badge.className = nextBadgeClass;
    }
    if (inspectorRenderCache.lineage !== nextLineage) {
        inspectorRenderCache.lineage = nextLineage;
        inspectLineage.innerText = nextLineage;
    }
    if (inspectorRenderCache.energy !== nextEnergy) {
        inspectorRenderCache.energy = nextEnergy;
        inspectEnergy.innerText = nextEnergy;
    }
    if (inspectorRenderCache.health !== nextHealth) {
        inspectorRenderCache.health = nextHealth;
        inspectHealth.innerText = nextHealth;
    }
    if (inspectorRenderCache.speed !== nextSpeed) {
        inspectorRenderCache.speed = nextSpeed;
        inspectSpeed.innerText = nextSpeed;
    }
    if (inspectorRenderCache.sensor !== nextSensor) {
        inspectorRenderCache.sensor = nextSensor;
        inspectSensor.innerText = nextSensor;
    }
    if (inspectorRenderCache.virus !== nextVirus) {
        inspectorRenderCache.virus = nextVirus;
        inspectVirus.innerText = nextVirus;
    }
    if (inspectorRenderCache.energySave !== nextEnergySave) {
        inspectorRenderCache.energySave = nextEnergySave;
        inspectEnergySave.innerText = nextEnergySave;
    }

    const brainWrap = document.getElementById('neural-view-wrapper');
    const showBrain = Boolean(brainWrap && isAnimal);
    if (brainWrap && showBrain !== inspectorRenderCache.brainVisible) {
        inspectorRenderCache.brainVisible = showBrain;
        if (showBrain) {
            brainWrap.classList.remove('hidden');
        } else {
            brainWrap.classList.add('hidden');
        }
    }

    if (showBrain) {
        drawSelectedBrainNet();
    }

    const chips = document.getElementById('inspect-dna-chips');
    if (!chips) return;

    const nextDnaKey = runtime.selectedEntity.dna.join(',');
    if (inspectorRenderCache.selectedEntity !== runtime.selectedEntity || inspectorRenderCache.dnaKey !== nextDnaKey) {
        inspectorRenderCache.selectedEntity = runtime.selectedEntity;
        inspectorRenderCache.dnaKey = nextDnaKey;
        chips.innerHTML = '';
        runtime.selectedEntity.dna.forEach(gene => {
            const span = document.createElement('span');
            span.className = 'px-1.5 py-0.5 rounded font-code text-[10px] bg-slate-900 border border-slate-800 text-slate-300';
            span.innerText = `0x${gene.toString(16).toUpperCase().padStart(2, '0')}`;
            chips.appendChild(span);
        });
    }
}

const viewCanvas = document.getElementById('simCanvas');
const viewCtx = viewCanvas.getContext('2d');
let loopStarted = false;
let lastUiRefreshTick = 0;
let lastTreeDrawTick = 0;
let simulationStepDebt = 0;
const UI_REFRESH_INTERVAL_MS = 180;
const PHYLOGENY_REFRESH_INTERVAL_MS = 220;
const SIM_STEP_TIME_BUDGET_MS = 8;
const MAX_SIM_STEPS_PER_FRAME = 4;
const lineageRowCache = new Map();
let lineageOrderSignature = '';

function startCoreLoop() {
    if (loopStarted) return;
    loopStarted = true;
    requestAnimationFrame(coreLoop);
}

function updateUIStats() {
    document.getElementById('stat-animals-count').innerText = EngineInstance.microorganisms.length;
    document.getElementById('stat-plants-count').innerText = EngineInstance.plants.length;
    document.getElementById('stat-spores-count').innerText = EngineInstance.spores.length;
    document.getElementById('stat-carcasses-count').innerText = EngineInstance.carcasses.length;
    document.getElementById('stat-lineages-count').innerText = GlobalRegistry.registry.size;
    document.getElementById('stat-ticks-count').innerText = EngineInstance.tickCount;

    const modeEl = document.getElementById('stat-repro-mode');
    if (modeEl) modeEl.innerText = String(CONFIG.REPRODUCIBILITY_MODE || 'unknown').toUpperCase();

    const dtEl = document.getElementById('stat-fixed-dt');
    if (dtEl) dtEl.innerText = `${CONFIG.RNG_FIXED_DT}`;

    const tBody = document.getElementById('lineage-table-body');
    if (!tBody) return;

    const activeNodes = Array.from(GlobalRegistry.registry.values())
        .filter(n => n.livingPopulationSize > 0)
        .sort((a, b) => b.livingPopulationSize - a.livingPopulationSize);

    const nextOrderIds = [];
    const seenIds = new Set();

    activeNodes.forEach(node => {
        const id = node.uniqueId;
        seenIds.add(id);
        nextOrderIds.push(id);

        let cached = lineageRowCache.get(id);
        if (!cached) {
            const tr = document.createElement('tr');
            tr.className = 'hover:bg-slate-900 cursor-pointer';

            const lineageCell = document.createElement('td');
            lineageCell.className = 'p-1.5 flex items-center gap-1.5 font-bold';
            const colorDot = document.createElement('span');
            colorDot.className = 'w-2.5 h-2.5 rounded-full';
            const lineageLabel = document.createElement('span');

            lineageCell.appendChild(colorDot);
            lineageCell.appendChild(lineageLabel);

            const generationCell = document.createElement('td');
            generationCell.className = 'p-1.5 text-slate-400';

            const populationCell = document.createElement('td');
            populationCell.className = 'p-1.5 text-emerald-400 font-bold';

            const dnaCell = document.createElement('td');
            dnaCell.className = 'p-1.5 text-slate-300 font-code text-[9px]';

            tr.appendChild(lineageCell);
            tr.appendChild(generationCell);
            tr.appendChild(populationCell);
            tr.appendChild(dnaCell);

            tr.addEventListener('click', () => {
                const matches = [...EngineInstance.microorganisms, ...EngineInstance.plants].filter(e => e.lineageId === id);
                if (matches.length > 0) {
                    runtime.selectedEntity = matches[0];
                    switchTab('inspector');
                    updateInspector();
                    triggerToast(`Camera telemetry bound onto Lineage #${id}`);
                }
            });

            cached = {
                tr,
                colorDot,
                lineageLabel,
                generationCell,
                populationCell,
                dnaCell,
                color: '',
                generation: -1,
                population: -1,
                dnaHex: ''
            };
            lineageRowCache.set(id, cached);
        }

        if (cached.color !== node.color) {
            cached.color = node.color;
            cached.colorDot.style.backgroundColor = node.color;
        }

        const lineageLabel = `#${id}`;
        if (cached.lineageLabel.textContent !== lineageLabel) {
            cached.lineageLabel.textContent = lineageLabel;
        }

        if (cached.generation !== node.generationIndex) {
            cached.generation = node.generationIndex;
            cached.generationCell.textContent = `G${node.generationIndex}`;
        }

        if (cached.population !== node.livingPopulationSize) {
            cached.population = node.livingPopulationSize;
            cached.populationCell.textContent = String(node.livingPopulationSize);
        }

        const dnaHex = formatDnaSequenceToHex(node.dnaSequence);
        if (cached.dnaHex !== dnaHex) {
            cached.dnaHex = dnaHex;
            cached.dnaCell.textContent = dnaHex;
        }
    });

    for (const [id, cached] of lineageRowCache.entries()) {
        if (!seenIds.has(id)) {
            cached.tr.remove();
            lineageRowCache.delete(id);
        }
    }

    const nextSignature = nextOrderIds.join(',');
    if (lineageOrderSignature !== nextSignature) {
        lineageOrderSignature = nextSignature;
        const fragment = document.createDocumentFragment();
        nextOrderIds.forEach(id => {
            const cached = lineageRowCache.get(id);
            if (cached) fragment.appendChild(cached.tr);
        });
        tBody.appendChild(fragment);
    }
}

function coreLoop() {
    const now = performance.now();

    if (!runtime.isPaused) {
        simulationStepDebt += Math.max(1, runtime.speedMultiplier);
        if (simulationStepDebt > 64) simulationStepDebt = 64;

        const updateStart = now;
        let stepsProcessed = 0;
        while (simulationStepDebt >= 1 && stepsProcessed < MAX_SIM_STEPS_PER_FRAME) {
            EngineInstance.update();
            simulationStepDebt -= 1;
            stepsProcessed++;

            if (performance.now() - updateStart >= SIM_STEP_TIME_BUDGET_MS) {
                break;
            }
        }

        if (now - runtime.lastHistoryTick > 800) {
            runtime.lastHistoryTick = now;
            telemetryHistory.animals.push(EngineInstance.microorganisms.length);
            telemetryHistory.plants.push(EngineInstance.plants.length);
            telemetryHistory.spores.push(EngineInstance.spores.length);
            telemetryHistory.carcasses.push(EngineInstance.carcasses.length);
            telemetryHistory.lineages.push(GlobalRegistry.registry.size);

            if (telemetryHistory.animals.length > MAX_DATA_POINTS) {
                for (const key in telemetryHistory) {
                    telemetryHistory[key].shift();
                }
            }
            drawTelemetryChart();
        }

        if (now - lastUiRefreshTick > UI_REFRESH_INTERVAL_MS) {
            lastUiRefreshTick = now;
            updateUIStats();
            updateInspector();
        }
    } else {
        simulationStepDebt = 0;
    }

    viewCtx.setTransform(1, 0, 0, 1, 0, 0);
    viewCtx.clearRect(0, 0, CONFIG.W, CONFIG.H);
    viewCtx.setTransform(
        viewportCamera.zoom,
        0,
        0,
        viewportCamera.zoom,
        viewportCamera.offsetX,
        viewportCamera.offsetY
    );

    if (gpuReady) {
        gpuRenderer.render(EngineInstance.soilGrid, runtime.activeFilter);
        EngineInstance.draw(viewCtx, gpuRenderer.getCanvas(), true);
    } else {
        EngineInstance.draw(viewCtx, null, true);
    }

    viewCtx.setTransform(1, 0, 0, 1, 0, 0);
    const isTreeTabVisible = tabContentTree && !tabContentTree.classList.contains('hidden');
    if (isTreeTabVisible && now - lastTreeDrawTick > PHYLOGENY_REFRESH_INTERVAL_MS) {
        lastTreeDrawTick = now;
        drawPhylogenyTree();
    }

    requestAnimationFrame(coreLoop);
}

export {
    coreLoop,
    startCoreLoop,
    switchTab,
    syncSimulationCanvasToWorld,
    updateInspector,
    updateUIStats
};

