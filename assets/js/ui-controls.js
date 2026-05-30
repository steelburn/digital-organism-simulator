import { CONFIG, runtime, telemetryHistory, MAX_DATA_POINTS, resetTelemetryHistory } from './state.js';
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
import {
    syncSimulationCanvasToWorld,
    switchTab,
    updateInspector,
    updateUIStats
} from './ui-dashboard.js';

const btnPause = document.getElementById('btn-pause');
const btnStep = document.getElementById('btn-step');
const btnReset = document.getElementById('btn-reset');
const lblPlayState = document.getElementById('lbl-play-state');
const iconPlayState = document.getElementById('icon-play-state');

btnPause.addEventListener('click', () => {
    runtime.isPaused = !runtime.isPaused;
    lblPlayState.innerText = runtime.isPaused ? 'PLAY' : 'PAUSE';
    iconPlayState.className = runtime.isPaused ? 'fa-solid fa-play text-emerald-400' : 'fa-solid fa-pause text-cyan-400';
    triggerToast(runtime.isPaused ? 'Simulation paused.' : 'Simulation resumed.');
});

btnStep.addEventListener('click', () => {
    if (runtime.isPaused) {
        EngineInstance.update();
        updateUIStats();
        triggerToast('Advanced 1 Frame.');
    }
});

btnReset.addEventListener('click', () => {
    syncSimulationCanvasToWorld();
    EngineInstance.reset();
    resetTelemetryHistory();
    runtime.selectedEntity = null;
    if (gpuReady) gpuRenderer.invalidateStatic(); // new map seed → re-upload terrain
    updateInspector();
});

const sliderSpeed = document.getElementById('slider-speed');
const valSpeedMult = document.getElementById('val-speed-mult');
sliderSpeed.addEventListener('input', e => {
    runtime.speedMultiplier = parseInt(e.target.value, 10);
    valSpeedMult.innerText = `${runtime.speedMultiplier}x`;
});

const sliderFloraMutation = document.getElementById('slider-flora-mutation-rate');
const valFloraMutation = document.getElementById('val-flora-mutation-rate');
const sliderFaunaMutation = document.getElementById('slider-fauna-mutation-rate');
const valFaunaMutation = document.getElementById('val-fauna-mutation-rate');
const toggleLinkMutationRates = document.getElementById('toggle-link-mutation-rates');

function applyFloraMutationRate(rawValue, mirrorLink = true) {
    const percentage = Math.max(0, Math.min(100, parseInt(rawValue, 10) || 0));
    CONFIG.FLORA_MUTATION_CHANCE = percentage / 100;
    sliderFloraMutation.value = `${percentage}`;
    valFloraMutation.innerText = `${percentage}%`;

    if (mirrorLink && toggleLinkMutationRates.checked) {
        applyFaunaMutationRate(percentage, false);
    }
}

function applyFaunaMutationRate(rawValue, mirrorLink = true) {
    const percentage = Math.max(0, Math.min(100, parseInt(rawValue, 10) || 0));
    CONFIG.FAUNA_MUTATION_CHANCE = percentage / 100;
    sliderFaunaMutation.value = `${percentage}`;
    valFaunaMutation.innerText = `${percentage}%`;

    if (mirrorLink && toggleLinkMutationRates.checked) {
        applyFloraMutationRate(percentage, false);
    }
}

sliderFloraMutation.addEventListener('input', e => {
    applyFloraMutationRate(e.target.value, true);
});

sliderFaunaMutation.addEventListener('input', e => {
    applyFaunaMutationRate(e.target.value, true);
});

toggleLinkMutationRates.addEventListener('change', e => {
    if (e.target.checked) {
        applyFaunaMutationRate(sliderFloraMutation.value, false);
    }
});

applyFloraMutationRate(Math.round(CONFIG.FLORA_MUTATION_CHANCE * 100), false);
applyFaunaMutationRate(Math.round(CONFIG.FAUNA_MUTATION_CHANCE * 100), false);

const sliderSpeciation = document.getElementById('slider-speciation-delta');
const valSpeciation = document.getElementById('val-speciation-delta');
sliderSpeciation.addEventListener('input', e => {
    CONFIG.SPEC_MAX_DELTA = parseInt(e.target.value, 10);
    valSpeciation.innerText = `${e.target.value} ${e.target.value > 1 ? 'Genes' : 'Gene'}`;
});

const sliderPlantGrowth = document.getElementById('slider-plant-growth');
const valPlantGrowth = document.getElementById('val-plant-growth');
sliderPlantGrowth.addEventListener('input', e => {
    CONFIG.BASE_PLANT_GROWTH = parseInt(e.target.value, 10) / 100;
    valPlantGrowth.innerText = CONFIG.BASE_PLANT_GROWTH.toFixed(2);
});

const sliderErosion = document.getElementById('slider-erosion');
const valErosion = document.getElementById('val-erosion-factor');
sliderErosion.addEventListener('input', e => {
    CONFIG.EROSION_SPEED = parseInt(e.target.value, 10) / 100;
    valErosion.innerText = CONFIG.EROSION_SPEED.toFixed(2);
});

const sliderWorldWidth = document.getElementById('slider-world-width');
const valWorldWidth = document.getElementById('val-world-width');
sliderWorldWidth.addEventListener('input', e => {
    CONFIG.W = parseInt(e.target.value, 10);
    valWorldWidth.innerText = `${CONFIG.W}`;
});

const sliderWorldHeight = document.getElementById('slider-world-height');
const valWorldHeight = document.getElementById('val-world-height');
sliderWorldHeight.addEventListener('input', e => {
    CONFIG.H = parseInt(e.target.value, 10);
    valWorldHeight.innerText = `${CONFIG.H}`;
});

const inputMapSeed = document.getElementById('input-map-seed');
const valMapSeed = document.getElementById('val-map-seed');
const btnRandomizeSeed = document.getElementById('btn-randomize-seed');

function applyMapSeed(rawSeed) {
    const parsed = Number.parseInt(rawSeed, 10);
    const normalized = Number.isFinite(parsed) ? (parsed >>> 0) : 0;
    CONFIG.MAP_SEED = normalized;
    inputMapSeed.value = `${normalized}`;
    valMapSeed.innerText = `${normalized}`;
}

inputMapSeed.addEventListener('change', e => {
    applyMapSeed(e.target.value);
});

btnRandomizeSeed.addEventListener('click', () => {
    const randomSeed = Math.floor(Math.random() * 0x100000000) >>> 0;
    applyMapSeed(randomSeed);
    triggerToast(`Map seed randomized to ${randomSeed}. Press RESET to regenerate terrain.`, 'info');
});

const sliderPlantDensity = document.getElementById('slider-plant-density');
const valPlantDensity = document.getElementById('val-plant-density');
sliderPlantDensity.addEventListener('input', e => {
    CONFIG.STARTER_PLANT_DENSITY_PER_10K = parseInt(e.target.value, 10) / 1000;
    valPlantDensity.innerText = CONFIG.STARTER_PLANT_DENSITY_PER_10K.toFixed(3);
});

const sliderPlantMin = document.getElementById('slider-plant-min');
const valPlantMin = document.getElementById('val-plant-min');
sliderPlantMin.addEventListener('input', e => {
    CONFIG.MIN_STARTER_PLANTS = parseInt(e.target.value, 10);
    valPlantMin.innerText = `${CONFIG.MIN_STARTER_PLANTS}`;
});

const sliderPlantHeadstart = document.getElementById('slider-plant-headstart');
const valPlantHeadstart = document.getElementById('val-plant-headstart');
sliderPlantHeadstart.addEventListener('input', e => {
    CONFIG.PLANT_HEADSTART_TICKS = parseInt(e.target.value, 10);
    valPlantHeadstart.innerText = `${CONFIG.PLANT_HEADSTART_TICKS}`;
});

const sliderFaunaDensity = document.getElementById('slider-fauna-density');
const valFaunaDensity = document.getElementById('val-fauna-density');
sliderFaunaDensity.addEventListener('input', e => {
    CONFIG.STARTER_FAUNA_DENSITY_PER_10K = parseInt(e.target.value, 10) / 1000;
    valFaunaDensity.innerText = CONFIG.STARTER_FAUNA_DENSITY_PER_10K.toFixed(3);
});

const sliderFaunaMin = document.getElementById('slider-fauna-min');
const valFaunaMin = document.getElementById('val-fauna-min');
sliderFaunaMin.addEventListener('input', e => {
    CONFIG.MIN_STARTER_FAUNA = parseInt(e.target.value, 10);
    valFaunaMin.innerText = `${CONFIG.MIN_STARTER_FAUNA}`;
});

const sliderFaunaPredatorRatio = document.getElementById('slider-fauna-predator-ratio');
const valFaunaPredatorRatio = document.getElementById('val-fauna-predator-ratio');
sliderFaunaPredatorRatio.addEventListener('input', e => {
    CONFIG.STARTER_PREDATOR_RATIO = parseInt(e.target.value, 10) / 100;
    valFaunaPredatorRatio.innerText = `${e.target.value}%`;
});

const filterClassic = document.getElementById('filter-classic');
const filterElevation = document.getElementById('filter-elevation');
const filterNutrients = document.getElementById('filter-nutrients');
const filterMoisture = document.getElementById('filter-moisture');

const updateFiltersUI = activeBtn => {
    [filterClassic, filterElevation, filterNutrients, filterMoisture].forEach(btn => {
        btn.className = 'px-2 py-1 rounded text-slate-400 hover:text-slate-200';
    });
    activeBtn.className = 'px-2 py-1 rounded bg-slate-800 text-slate-100 font-semibold';
};

filterClassic.addEventListener('click', () => {
    runtime.activeFilter = 'classic';
    updateFiltersUI(filterClassic);
});
filterElevation.addEventListener('click', () => {
    runtime.activeFilter = 'elevation';
    updateFiltersUI(filterElevation);
});
filterNutrients.addEventListener('click', () => {
    runtime.activeFilter = 'nutrients';
    updateFiltersUI(filterNutrients);
});
filterMoisture.addEventListener('click', () => {
    runtime.activeFilter = 'moisture';
    updateFiltersUI(filterMoisture);
});

const tabLabAnimal = document.getElementById('tab-lab-animal');
const tabLabPlant = document.getElementById('tab-lab-plant');
const listAnimalGenes = document.getElementById('genome-animal-list');
const listPlantGenes = document.getElementById('genome-plant-list');
const txtGeneratedDna = document.getElementById('txt-generated-dna');
const sequenceEditorList = document.getElementById('sequence-editor-list');
const btnSeqClear = document.getElementById('btn-seq-clear');
const btnSeqPop = document.getElementById('btn-seq-pop');
const inputSeqText = document.getElementById('input-seq-text');
const btnSeqApplyText = document.getElementById('btn-seq-apply-text');
const btnArmInjector = document.getElementById('btn-arm-injector');

let activeLabTab = 'animal';
const labDnaByType = {
    animal: [0x01, 0x02, 0x03, 0x0E],
    plant: [0x10, 0x30]
};

function formatGeneHex(gene) {
    return `0x${gene.toString(16).toUpperCase().padStart(2, '0')}`;
}

function toByte(rawGene) {
    const gene = Number(rawGene);
    if (!Number.isFinite(gene)) return null;
    const byte = Math.trunc(gene);
    if (byte < 0 || byte > 255) return null;
    return byte;
}

function parseSequenceText(rawSequence) {
    const normalized = (rawSequence || '').replace(/[\[\]]/g, ' ').trim();
    if (!normalized) return [];

    const tokens = normalized.split(/[\s,;]+/).filter(Boolean);
    const parsed = [];
    for (let i = 0; i < tokens.length; i++) {
        const token = tokens[i];
        const parsedToken = /^0x/i.test(token)
            ? Number.parseInt(token, 16)
            : Number.parseInt(token, 10);
        const byte = toByte(parsedToken);
        if (byte === null) {
            return null;
        }
        parsed.push(byte);
    }
    return parsed;
}

function renderSequenceEditor() {
    if (!sequenceEditorList) return;

    const dna = labDnaByType[activeLabTab] || [];
    sequenceEditorList.innerHTML = '';

    if (dna.length === 0) {
        const empty = document.createElement('span');
        empty.className = 'text-[11px] text-slate-500 font-code';
        empty.innerText = 'Sequence empty. Add genes from the palette or paste an array.';
        sequenceEditorList.appendChild(empty);
        return;
    }

    dna.forEach((gene, index) => {
        const chip = document.createElement('div');
        chip.className = 'inline-flex items-center gap-1 rounded border border-cyan-800/40 bg-cyan-950/40 px-1.5 py-1';

        const label = document.createElement('span');
        label.className = 'font-code text-[10px] text-cyan-300';
        label.innerText = `${index + 1}:${formatGeneHex(gene)}`;
        chip.appendChild(label);

        const btnUp = document.createElement('button');
        btnUp.className = 'px-1 rounded bg-slate-900 text-slate-300 hover:bg-slate-800 text-[10px]';
        btnUp.type = 'button';
        btnUp.setAttribute('data-action', 'up');
        btnUp.setAttribute('data-index', `${index}`);
        btnUp.innerText = '^';
        chip.appendChild(btnUp);

        const btnDown = document.createElement('button');
        btnDown.className = 'px-1 rounded bg-slate-900 text-slate-300 hover:bg-slate-800 text-[10px]';
        btnDown.type = 'button';
        btnDown.setAttribute('data-action', 'down');
        btnDown.setAttribute('data-index', `${index}`);
        btnDown.innerText = 'v';
        chip.appendChild(btnDown);

        const btnDelete = document.createElement('button');
        btnDelete.className = 'px-1 rounded bg-rose-950/40 text-rose-300 hover:bg-rose-900/50 text-[10px]';
        btnDelete.type = 'button';
        btnDelete.setAttribute('data-action', 'delete');
        btnDelete.setAttribute('data-index', `${index}`);
        btnDelete.innerText = 'x';
        chip.appendChild(btnDelete);

        sequenceEditorList.appendChild(chip);
    });
}

function syncSequenceInputWithCurrentDna() {
    if (!inputSeqText) return;
    const dna = labDnaByType[activeLabTab] || [];
    inputSeqText.value = `[${dna.map(g => formatGeneHex(g)).join(', ')}]`;
}

function updateLabTab(tab) {
    activeLabTab = tab;
    if (tab === 'animal') {
        tabLabAnimal.className = 'flex-1 text-center py-1 rounded bg-slate-800 text-slate-100 font-semibold';
        tabLabPlant.className = 'flex-1 text-center py-1 rounded text-slate-400 hover:text-slate-200';
        listAnimalGenes.classList.remove('hidden');
        listPlantGenes.classList.add('hidden');
    } else {
        tabLabPlant.className = 'flex-1 text-center py-1 rounded bg-slate-800 text-slate-100 font-semibold';
        tabLabAnimal.className = 'flex-1 text-center py-1 rounded text-slate-400 hover:text-slate-200';
        listPlantGenes.classList.remove('hidden');
        listAnimalGenes.classList.add('hidden');
    }
    rebuildLabBlueprint();
}

tabLabAnimal.addEventListener('click', () => updateLabTab('animal'));
tabLabPlant.addEventListener('click', () => updateLabTab('plant'));

function rebuildLabBlueprint() {
    const dna = [...(labDnaByType[activeLabTab] || [])];

    runtime.armedLabCreature = {
        type: activeLabTab,
        dna
    };

    txtGeneratedDna.innerText = dna.length > 0 ? `[${dna.map(g => formatGeneHex(g)).join(', ')}]` : '[]';
    renderSequenceEditor();
    syncSequenceInputWithCurrentDna();
}

function appendGeneToSequence(rawGene) {
    const gene = toByte(rawGene);
    if (gene === null) return;
    labDnaByType[activeLabTab].push(gene);
    rebuildLabBlueprint();
}

[listAnimalGenes, listPlantGenes].forEach(list => {
    if (!list) return;
    list.querySelectorAll('.lab-gene-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            appendGeneToSequence(Number(btn.getAttribute('data-gene')));
        });
    });
});

if (sequenceEditorList) {
    sequenceEditorList.addEventListener('click', e => {
        const target = e.target;
        if (!(target instanceof HTMLElement)) return;

        const action = target.getAttribute('data-action');
        const index = Number.parseInt(target.getAttribute('data-index') || '', 10);
        if (!action || !Number.isFinite(index)) return;

        const dna = labDnaByType[activeLabTab];
        if (index < 0 || index >= dna.length) return;

        if (action === 'delete') {
            dna.splice(index, 1);
        } else if (action === 'up' && index > 0) {
            [dna[index - 1], dna[index]] = [dna[index], dna[index - 1]];
        } else if (action === 'down' && index < dna.length - 1) {
            [dna[index + 1], dna[index]] = [dna[index], dna[index + 1]];
        }

        rebuildLabBlueprint();
    });
}

if (btnSeqClear) {
    btnSeqClear.addEventListener('click', () => {
        labDnaByType[activeLabTab] = [];
        rebuildLabBlueprint();
    });
}

if (btnSeqPop) {
    btnSeqPop.addEventListener('click', () => {
        const dna = labDnaByType[activeLabTab];
        if (dna.length === 0) return;
        dna.pop();
        rebuildLabBlueprint();
    });
}

if (btnSeqApplyText) {
    btnSeqApplyText.addEventListener('click', () => {
        const parsed = parseSequenceText(inputSeqText ? inputSeqText.value : '');
        if (parsed === null) {
            triggerToast('Invalid DNA sequence format. Use bytes in hex or decimal.', 'danger');
            return;
        }
        labDnaByType[activeLabTab] = parsed;
        rebuildLabBlueprint();
        triggerToast('DNA sequence applied to injector profile.', 'success');
    });
}

if (inputSeqText) {
    inputSeqText.addEventListener('keydown', e => {
        if (e.key === 'Enter') {
            e.preventDefault();
            btnSeqApplyText?.click();
        }
    });
}

rebuildLabBlueprint();

btnArmInjector.addEventListener('click', () => {
    if (!runtime.isArmed && (!runtime.armedLabCreature || runtime.armedLabCreature.dna.length === 0)) {
        triggerToast('DNA sequence is empty. Add at least one gene before arming.', 'danger');
        return;
    }

    runtime.isArmed = !runtime.isArmed;
    if (runtime.isArmed) {
        btnArmInjector.className = 'w-full py-2 rounded-lg bg-emerald-600/30 border border-emerald-500 text-emerald-400 text-xs font-bold tracking-wider flex items-center justify-center gap-2 transition-all';
        btnArmInjector.innerHTML = '<i class="fa-solid fa-crosshairs animate-spin"></i> INJECTOR ARMED (TAP ON MAP)';
    } else {
        btnArmInjector.className = 'w-full py-2 rounded-lg bg-cyan-600/20 border border-cyan-500/30 hover:bg-cyan-600/40 text-xs font-bold text-cyan-400 tracking-wider flex items-center justify-center gap-2 transition-all';
        btnArmInjector.innerHTML = '<i class="fa-solid fa-syringe"></i> ARM LAB INJECTOR (TAP MAP TO SEED)';
    }
});

export {
    btnArmInjector,
    listAnimalGenes,
    listPlantGenes,
    rebuildLabBlueprint,
    updateLabTab
};
