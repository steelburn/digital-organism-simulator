import { CONFIG, runtime } from './state.js';

export function triggerToast(message, type = 'success') {
    const toast = document.createElement('div');
    toast.className = 'p-3 rounded-lg text-xs font-code border shadow-xl flex items-center gap-2 transition-all duration-300 transform translate-y-2 opacity-0 pointer-events-auto max-w-sm ';
    if (type === 'success') {
        toast.className += 'bg-emerald-950/95 border-emerald-500/30 text-emerald-400 glowing-border-green';
    } else if (type === 'danger') {
        toast.className += 'bg-rose-950/95 border-rose-500/30 text-rose-400 glowing-border-red';
    } else {
        toast.className += 'bg-cyan-950/95 border-cyan-500/30 text-cyan-400 glowing-border-cyan';
    }
    toast.innerHTML = `<i class="fa-solid ${type === 'success' ? 'fa-circle-check' : type === 'danger' ? 'fa-triangle-exclamation' : 'fa-info-circle'}"></i> ${message}`;

    const container = document.getElementById('toast-container');
    if (!container) return;
    container.appendChild(toast);

    setTimeout(() => {
        toast.classList.remove('translate-y-2', 'opacity-0');
    }, 10);

    setTimeout(() => {
        toast.classList.add('opacity-0', 'translate-y-2');
        setTimeout(() => toast.remove(), 300);
    }, 4000);
}

export function wrapPosition(x, y) {
    return {
        x: ((x % CONFIG.W) + CONFIG.W) % CONFIG.W,
        y: ((y % CONFIG.H) + CONFIG.H) % CONFIG.H
    };
}

export function wrapCoordinate(value, max) {
    let wrapped = value % max;
    if (wrapped < 0) wrapped += max;
    return wrapped;
}

export function getToroidalDistance(A, B) {
    let dx = Math.abs(A.x - B.x);
    if (dx > CONFIG.W / 2) dx = CONFIG.W - dx;

    let dy = Math.abs(A.y - B.y);
    if (dy > CONFIG.H / 2) dy = CONFIG.H - dy;

    return Math.sqrt(dx * dx + dy * dy);
}

export function getToroidalOffset(from, to) {
    let dx = to.x - from.x;
    if (dx > CONFIG.W / 2) dx -= CONFIG.W;
    if (dx < -CONFIG.W / 2) dx += CONFIG.W;

    let dy = to.y - from.y;
    if (dy > CONFIG.H / 2) dy -= CONFIG.H;
    if (dy < -CONFIG.H / 2) dy += CONFIG.H;

    return { dx, dy };
}

export function getHammingDistance(dnaA, dnaB) {
    let distance = 0;
    const maxLen = Math.max(dnaA.length, dnaB.length);
    for (let i = 0; i < maxLen; i++) {
        if (dnaA[i] !== dnaB[i]) distance++;
    }
    return distance;
}

function clamp01(value) {
    return Math.max(0, Math.min(1, value));
}

function fract(value) {
    return value - Math.floor(value);
}

function smoothstep(t) {
    return t * t * (3 - 2 * t);
}

function lerp(a, b, t) {
    return a + (b - a) * t;
}

function stableSeed(seed) {
    if (!Number.isFinite(seed)) return 0;
    return Math.floor(seed) >>> 0;
}

let simulationRngState = 1;

export function setSimulationSeed(seed) {
    const normalized = stableSeed(seed ^ 0x9E3779B9);
    simulationRngState = normalized === 0 ? 1 : normalized;
}

export function randomFloat() {
    simulationRngState ^= simulationRngState << 13;
    simulationRngState ^= simulationRngState >>> 17;
    simulationRngState ^= simulationRngState << 5;
    simulationRngState >>>= 0;
    return simulationRngState / 4294967296;
}

export function mutateDnaSequence(dna, genePool, mutationChance = CONFIG.MUTATION_CHANCE) {
    const childDna = [...dna];
    if (randomFloat() >= mutationChance) {
        return { childDna, mutated: false };
    }

    const nextGene = genePool[Math.floor(randomFloat() * genePool.length)];

    if (childDna.length === 0) {
        childDna.push(nextGene);
        return { childDna, mutated: true };
    }

    const index = Math.floor(randomFloat() * childDna.length);
    childDna[index] = nextGene;
    return { childDna, mutated: true };
}

function hash2D(ix, iy, seed) {
    const x = ix >>> 0;
    const y = iy >>> 0;
    const s = stableSeed(seed);
    const mixed = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(s, 2246822519);
    return fract(Math.sin(mixed) * 43758.5453123);
}

function periodicValueNoise(nx, ny, frequency, seedOffset) {
    const freq = Math.max(1, Math.floor(frequency));
    const x = nx * freq;
    const y = ny * freq;

    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const x1 = x0 + 1;
    const y1 = y0 + 1;

    const wrap = (v, limit) => ((v % limit) + limit) % limit;

    const wx0 = wrap(x0, freq);
    const wy0 = wrap(y0, freq);
    const wx1 = wrap(x1, freq);
    const wy1 = wrap(y1, freq);

    const fx = smoothstep(x - x0);
    const fy = smoothstep(y - y0);

    const v00 = hash2D(wx0, wy0, CONFIG.MAP_SEED + seedOffset);
    const v10 = hash2D(wx1, wy0, CONFIG.MAP_SEED + seedOffset);
    const v01 = hash2D(wx0, wy1, CONFIG.MAP_SEED + seedOffset);
    const v11 = hash2D(wx1, wy1, CONFIG.MAP_SEED + seedOffset);

    const top = lerp(v00, v10, fx);
    const bottom = lerp(v01, v11, fx);
    return lerp(top, bottom, fy);
}

export function getElevation(x, y) {
    const wrapped = wrapPosition(x, y);
    const nx = wrapped.x / Math.max(1, CONFIG.W);
    const ny = wrapped.y / Math.max(1, CONFIG.H);

    const continental = periodicValueNoise(nx, ny, 3, 11);
    const regional = periodicValueNoise(nx, ny, 7, 97);
    const detail = periodicValueNoise(nx, ny, 16, 307);
    const ridgeSource = periodicValueNoise(nx, ny, 11, 911);
    const ridge = 1 - Math.abs(ridgeSource * 2 - 1);

    const elevation = continental * 0.58 + regional * 0.24 + detail * 0.10 + ridge * 0.08;
    return clamp01(elevation);
}

export function getDnaColor(dna, isPlant) {
    let hash = 0;
    dna.forEach(gene => {
        hash = (hash << 5) - hash + gene;
    });
    const hue = Math.abs(hash) % 360;
    if (isPlant) {
        return `hsl(${(hue % 80) + 110}, 85%, 45%)`;
    }

    const aggressionCount = dna.filter(g => g === 0x07).length;
    if (aggressionCount > 0) {
        return `hsl(${345 + (aggressionCount * 15) % 30}, 95%, 50%)`;
    }
    return `hsl(${(hue % 120) + 190}, 90%, 55%)`;
}

export class RibosomeParser {
    static translateMicroorganism(dna) {
        const count = gene => dna.filter(g => g === gene).length;
        const structural = count(0x01);
        const locomotion = count(0x02);
        const energySaver = count(0x08);
        const jitterMutation = count(0x06);
        const speedSpecialist = count(0x05);
        const herbivory = count(0x03);
        const sensing = count(0x04);
        const predation = count(0x07);
        const insulation = count(0x0A);

        return {
            health: 70 + structural * 30,
            baseMetabolism: Math.max(0.05, 0.12 + structural * 0.06 + locomotion * 0.05 + speedSpecialist * 0.035 + jitterMutation * 0.02 - energySaver * 0.028),
            speed: Math.max(0.55, 0.9 + locomotion * 1.15 + speedSpecialist * 0.8 - energySaver * 0.18),
            herbivoryEfficiency: 0.7 + herbivory * 0.55,
            sensorRange: 55 + sensing * 35,
            aggression: 8 + predation * 26,
            insulation,
            jitterInstability: Math.min(1.8, jitterMutation * 0.45),
            energyConservation: Math.min(0.75, energySaver * 0.24)
        };
    }

    static translatePlant(dna) {
        const count = gene => dna.filter(g => g === gene).length;
        const photo = count(0x10);
        const toxin = count(0x20);
        const dispersal = count(0x30);
        const succulence = count(0x40);
        const mulching = count(0x60) > 0;
        const floating = count(0x6A);
        const clonalGrowth = count(0x9C);
        const clonalAggression = count(0x9D);

        return {
            photosyntheticRate: 0.45 + photo * 0.2,
            toxicity: toxin * 12,
            dispersalRange: 1 + dispersal,
            maxEnergy: 70 + succulence * 45,
            sheddingEnabled: mulching,
            sporeFloatingCoefficient: 1 + floating * 0.7,
            clonalGrowth,
            clonalAggression
        };
    }
}

export class FloatIndicator {
    constructor(x, y, text, color = '#cbd5e1') {
        this.x = x;
        this.y = y;
        this.text = text;
        this.color = color;
        this.opacity = 1;
        this.life = 70;
    }

    update() {
        this.y -= 0.35;
        this.life--;
        this.opacity = Math.max(0, this.life / 70);
    }

    draw(ctx) {
        ctx.save();
        ctx.globalAlpha = this.opacity;
        ctx.fillStyle = this.color;
        ctx.font = '10px "Fira Code", monospace';
        ctx.textAlign = 'center';
        ctx.fillText(this.text, this.x, this.y);
        ctx.restore();
    }
}

export class Carcass {
    constructor(x, y, mass) {
        this.x = x;
        this.y = y;
        this.mass = Math.max(1, mass);
        this.isDead = false;
    }

    decompose(soilGrid) {
        const cell = soilGrid.getCellAt(this.x, this.y);
        if (cell) {
            const recycled = Math.min(this.mass, 0.55);
            this.mass -= recycled;
            cell.nutrients = Math.min(cell.maxNutrients * 2.5, cell.nutrients + recycled);
        }
        if (this.mass <= 0.25) {
            this.isDead = true;
        }
    }

    draw(ctx) {
        ctx.save();
        const radius = Math.max(1.5, Math.min(8, this.mass * 0.25));
        ctx.fillStyle = 'rgba(180, 83, 9, 0.55)';
        ctx.strokeStyle = 'rgba(217, 119, 6, 0.7)';
        ctx.beginPath();
        ctx.arc(this.x, this.y, radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.restore();
    }
}

export class OrganismBrain {
    constructor(dnaWeights = null) {
        if (dnaWeights && dnaWeights.length === 44) {
            this.weights = [...dnaWeights];
        } else {
            this.weights = [];
            for (let i = 0; i < 44; i++) {
                this.weights.push(randomFloat() * 2 - 1);
            }
        }
    }

    forward(inputs) {
        const hidden = [];
        for (let h = 0; h < 4; h++) {
            let val = 0;
            for (let i = 0; i < 5; i++) {
                val += inputs[i] * this.weights[h * 5 + i];
            }
            val += this.weights[20 + h];
            hidden.push(Math.tanh(val));
        }

        const outputs = [];
        for (let o = 0; o < 4; o++) {
            let val = 0;
            for (let h = 0; h < 4; h++) {
                val += hidden[h] * this.weights[24 + o * 4 + h];
            }
            val += this.weights[40 + o];
            outputs.push(Math.tanh(val));
        }
        return outputs;
    }

    mutate() {
        const mutatedWeights = this.weights.map(w => {
            if (randomFloat() < 0.15) {
                return Math.max(-1.5, Math.min(1.5, w + (randomFloat() * 0.4 - 0.2)));
            }
            return w;
        });
        return new OrganismBrain(mutatedWeights);
    }
}

export class EvolutionaryRegistry {
    constructor() {
        this.registry = new Map();
        this.nextId = 1;
    }

    registerEntity(parentLineageId, dnaSequence, annWeights = null) {
        const dnaString = dnaSequence.join(',');

        if (parentLineageId && this.registry.has(parentLineageId)) {
            const parentNode = this.registry.get(parentLineageId);
            const dist = getHammingDistance(parentNode.dnaSequence.split(',').map(Number), dnaSequence);

            if (dist <= CONFIG.SPEC_MAX_DELTA) {
                parentNode.livingPopulationSize++;
                return parentNode.uniqueId;
            }
        }

        const uniqueId = this.nextId++;
        const parentNode = this.registry.get(parentLineageId);
        const generationIndex = parentNode ? parentNode.generationIndex + 1 : 0;

        const newNode = {
            uniqueId,
            parentId: parentLineageId || null,
            generationIndex,
            dnaSequence: dnaString,
            annProfile: annWeights ? annWeights.map(w => Number(w).toFixed(2)).join(',') : null,
            livingPopulationSize: 1,
            color: getDnaColor(dnaSequence, dnaSequence.some(g => g >= 0x10)),
            timestamp: Date.now()
        };

        this.registry.set(uniqueId, newNode);
        triggerToast(`Speciation Clade Established: Lineage #${uniqueId} (Gen ${generationIndex})`, 'info');
        return uniqueId;
    }

    decrementPopulation(lineageId) {
        if (this.registry.has(lineageId)) {
            const node = this.registry.get(lineageId);
            node.livingPopulationSize = Math.max(0, node.livingPopulationSize - 1);
        }
    }

    pruneRegistry() {
        const activeAncestors = new Set();
        for (const node of this.registry.values()) {
            if (node.livingPopulationSize > 0) {
                let curr = node;
                while (curr) {
                    activeAncestors.add(curr.uniqueId);
                    curr = curr.parentId ? this.registry.get(curr.parentId) : null;
                }
            }
        }

        for (const id of this.registry.keys()) {
            if (!activeAncestors.has(id)) {
                this.registry.delete(id);
            }
        }
    }
}

export const GlobalRegistry = new EvolutionaryRegistry();

