import { CONFIG, runtime } from './state.js';
import { GlobalRegistry, getToroidalDistance, randomFloat, setSimulationSeed, triggerToast } from './simulation-core-utils.js';
import { SoilGrid, Plant } from './simulation-core-biomes.js';
import { Microorganism } from './simulation-core-organisms.js';
import { SpatialHash } from './simulation-core-spatial-hash.js';

export class EcosystemSimulation {
    constructor() {
        this.soilGrid = new SoilGrid();
        this.spatialHash = new SpatialHash(32);
        this.plants = [];
        this.microorganisms = [];
        this.carcasses = [];
        this.spores = [];
        this.zoochores = [];
        this.pathogens = [];
        this.indicators = [];

        this.pendingStarterFaunaCount = 0;
        this.faunaIntroTicksRemaining = 0;
        this.starterFaunaIntroduced = false;
        this.tickCount = 0;
        this.plantUpdateCursor = 0;
        this.sporeUpdateCursor = 0;

        this.windFrame = 0;
        this.globalWind = { x: 0, y: 0 };
        this.windStreaks = [];
        this.rebuildWindStreaks();

        this.reset();
    }

    rebuildWindStreaks() {
        this.windStreaks = [];
        for (let i = 0; i < 15; i++) {
            this.windStreaks.push({
                x: randomFloat() * CONFIG.W,
                y: randomFloat() * CONFIG.H,
                len: 20 + randomFloat() * 30,
                speed: 1.0 + randomFloat() * 1.5
            });
        }
    }

    getClimateForcing() {
        const longCycleTicks = Math.max(1, CONFIG.LONG_TERM_WEATHER_CYCLE_TICKS);
        const monsoonTicks = Math.max(1, CONFIG.LONG_TERM_MONSOON_CYCLE_TICKS);
        const longPhase = this.tickCount / longCycleTicks;
        const monsoonPhase = this.tickCount / monsoonTicks;

        const precipitation = Math.max(
            0,
            Math.min(
                1,
                0.5
                    + Math.sin(longPhase * Math.PI * 2) * 0.2
                    + Math.sin(monsoonPhase * Math.PI * 2 + 1.2) * 0.15
            )
        );

        const storminess = Math.max(
            0,
            Math.min(1, 0.2 + precipitation * 0.45 + Math.max(0, Math.sin(this.windFrame * 0.004)) * 0.3)
        );

        const evaporation = Math.max(0, Math.min(1, 0.62 - precipitation * 0.4 + Math.max(0, Math.sin(this.windFrame * 0.0025 + 0.4)) * 0.16));
        const droughtBias = Math.max(0, Math.min(1, (1 - precipitation) * 0.75 + evaporation * 0.25));

        return { precipitation, storminess, evaporation, droughtBias };
    }

    getWorldArea() {
        return CONFIG.W * CONFIG.H;
    }

    getStarterPlantCount() {
        const worldArea = this.getWorldArea();
        return Math.max(
            0,
            Math.max(
                CONFIG.MIN_STARTER_PLANTS,
                Math.floor((worldArea / 10000) * CONFIG.STARTER_PLANT_DENSITY_PER_10K)
            )
        );
    }

    getStarterFaunaCount() {
        const worldArea = this.getWorldArea();
        return Math.max(
            0,
            Math.max(
                CONFIG.MIN_STARTER_FAUNA,
                Math.floor((worldArea / 10000) * CONFIG.STARTER_FAUNA_DENSITY_PER_10K)
            )
        );
    }

    getRandomStarterPlantDna() {
        const plantGenePool = [0x10, 0x20, 0x30, 0x40, 0x60, 0x6A, 0x7F, 0x8B, 0x9C, 0x9D];
        const geneCount = 2 + Math.floor(randomFloat() * 4); // 2-5 genes
        const dna = [];

        for (let i = 0; i < geneCount; i++) {
            dna.push(plantGenePool[Math.floor(randomFloat() * plantGenePool.length)]);
        }

        return dna;
    }

    spawnStarterFauna(count) {
        for (let i = 0; i < count; i++) {
            const rx = randomFloat() * CONFIG.W;
            const ry = randomFloat() * CONFIG.H;
            const dna = randomFloat() < CONFIG.STARTER_PREDATOR_RATIO
                ? [...CONFIG.STARTER_PREDATOR_DNA]
                : [...CONFIG.STARTER_FORAGER_DNA];
            this.microorganisms.push(new Microorganism(rx, ry, dna));
        }
    }

    reset() {
        setSimulationSeed(CONFIG.MAP_SEED);

        runtime.replayMetadata = {
            generatedAtIso: new Date().toISOString(),
            seed: CONFIG.MAP_SEED,
            reproducibilityMode: CONFIG.REPRODUCIBILITY_MODE,
            fixedDt: CONFIG.RNG_FIXED_DT,
            world: {
                w: CONFIG.W,
                h: CONFIG.H
            },
            speedMultiplier: runtime.speedMultiplier
        };

        // Rebuild terrain chemistry and grid dimensions from current world size.
        this.soilGrid = new SoilGrid();
        this.rebuildWindStreaks();

        this.plants = [];
        this.microorganisms = [];
        this.carcasses = [];
        this.spores = [];
        this.zoochores = [];
        this.pathogens = [];
        this.indicators = [];

        GlobalRegistry.registry.clear();
        GlobalRegistry.nextId = 1;

        const initialPlantCount = this.getStarterPlantCount();
        this.pendingStarterFaunaCount = this.getStarterFaunaCount();
        this.faunaIntroTicksRemaining = Math.max(0, Math.floor(CONFIG.PLANT_HEADSTART_TICKS));
        this.starterFaunaIntroduced = false;
        this.tickCount = 0;
        this.plantUpdateCursor = 0;
        this.sporeUpdateCursor = 0;

        for (let i = 0; i < initialPlantCount; i++) {
            const rx = randomFloat() * CONFIG.W;
            const ry = randomFloat() * CONFIG.H;
            this.plants.push(new Plant(rx, ry, this.getRandomStarterPlantDna()));
        }

        if (this.faunaIntroTicksRemaining === 0) {
            this.spawnStarterFauna(this.pendingStarterFaunaCount);
            this.pendingStarterFaunaCount = 0;
            this.starterFaunaIntroduced = true;
        } else {
            triggerToast(`Plant-only headstart active: ${this.faunaIntroTicksRemaining} ticks before fauna introduction.`, 'info');
        }

        triggerToast(`Ecosystem sandbox initialised (${CONFIG.REPRODUCIBILITY_MODE} mode, dt=${CONFIG.RNG_FIXED_DT}).`, 'success');
    }

    update() {
        this.tickCount++;

        if (!this.starterFaunaIntroduced) {
            if (this.faunaIntroTicksRemaining > 0) {
                this.faunaIntroTicksRemaining--;
            }

            if (this.faunaIntroTicksRemaining <= 0) {
                this.spawnStarterFauna(this.pendingStarterFaunaCount);
                this.pendingStarterFaunaCount = 0;
                this.starterFaunaIntroduced = true;
                triggerToast('Starter fauna introduced after plant-only headstart.', 'info');
            }
        }

        this.windFrame++;
        const longWindPhase = this.tickCount / Math.max(1, CONFIG.LONG_TERM_WEATHER_CYCLE_TICKS);
        const monsoonWindPhase = this.tickCount / Math.max(1, CONFIG.LONG_TERM_MONSOON_CYCLE_TICKS);
        const thermalConvectionOffset = Math.sin(this.windFrame * 0.005) * 0.15;
        const jetStream = Math.sin(longWindPhase * Math.PI * 2) * 0.12;
        const monsoonShear = Math.cos(monsoonWindPhase * Math.PI * 2 + 0.65) * 0.1;
        this.globalWind = {
            x: Math.sin(this.windFrame * 0.008) * 0.25 + thermalConvectionOffset + jetStream,
            y: Math.cos(this.windFrame * 0.006) * 0.25 + monsoonShear
        };

        const climateForcing = this.getClimateForcing();
        this.soilGrid.update(this.plants, climateForcing, this.globalWind);

        const allEntities = [
            ...this.plants,
            ...this.microorganisms,
            ...this.carcasses,
            ...this.spores,
            ...this.zoochores,
            ...this.pathogens
        ];

        // Build spatial hash once per tick — cuts O(N²) entity scans to O(N).
        this.spatialHash.clear();
        for (let i = 0; i < allEntities.length; i++) this.spatialHash.insert(allEntities[i]);

        const sporeCount = this.spores.length;
        if (sporeCount > 0) {
            const denseSpores = sporeCount > CONFIG.DENSE_SPORE_UPDATE_BUDGET;
            const sporeUpdateBudget = denseSpores ? CONFIG.DENSE_SPORE_UPDATE_BUDGET : sporeCount;
            const sporeUpdatesToRun = Math.min(sporeCount, sporeUpdateBudget);
            for (let i = 0; i < sporeUpdatesToRun; i++) {
                const idx = (this.sporeUpdateCursor + i) % sporeCount;
                this.spores[idx].update(this.soilGrid, this.plants, this.indicators, this.globalWind);
            }
            this.sporeUpdateCursor = (this.sporeUpdateCursor + sporeUpdatesToRun) % sporeCount;
        }

        if (this.spores.length > CONFIG.MAX_ACTIVE_SPORES) {
            this.spores.length = CONFIG.MAX_ACTIVE_SPORES;
        }

        this.pathogens.forEach(path => path.update(this.globalWind));

        // Update zoochore seeds — dormancy countdown and conditional germination.
        const indicatorsOverloaded = this.indicators.length > 400;
        this.zoochores.forEach(zoochore => {
            zoochore.update(this.soilGrid, this.plants, this.indicators, !indicatorsOverloaded);
        });

        const plantCount = this.plants.length;
        const densePlantMode = plantCount > CONFIG.DENSE_VEGETATION_THRESHOLD;
        const plantUpdateBudget = densePlantMode ? CONFIG.DENSE_PLANT_UPDATE_BUDGET : plantCount;

        if (plantCount > 0) {
            const updatesToRun = Math.min(plantCount, plantUpdateBudget);
            for (let i = 0; i < updatesToRun; i++) {
                const index = (this.plantUpdateCursor + i) % plantCount;
                const plant = this.plants[index];
                const allowIndicators = !indicatorsOverloaded && i < CONFIG.DENSE_PLANT_INDICATOR_BUDGET;
                plant.update(this.soilGrid, this.plants, this.spores, this.zoochores, this.indicators, allowIndicators);
            }
            this.plantUpdateCursor = (this.plantUpdateCursor + updatesToRun) % plantCount;
        }

        this.carcasses.forEach(carcass => carcass.decompose(this.soilGrid));

        this.microorganisms.forEach(organism => {
            organism.update(this.soilGrid, allEntities, this.microorganisms, this.spores, this.indicators, this.globalWind, this.spatialHash);
        });

        for (let i = 0; i < this.microorganisms.length; i++) {
            const agent = this.microorganisms[i];
            if (agent.isDead) continue;

            const nearby = this.spatialHash.queryRadius(agent.x, agent.y, 12);
            for (let j = 0; j < nearby.length; j++) {
                const entity = nearby[j];
                if (agent === entity || entity.isDead) continue;
                const dist = getToroidalDistance(agent, entity);
                if (dist < 12) {
                    agent.handleCollision(entity, this.carcasses, this.spores, this.indicators);
                }
            }
        }

        this.plants = this.plants.filter(p => !p.isDead);
        this.microorganisms = this.microorganisms.filter(m => !m.isDead);
        this.carcasses = this.carcasses.filter(c => !c.isDead);
        this.spores = this.spores.filter(s => !s.isDead);
        this.zoochores = this.zoochores.filter(z => !z.isDead);
        this.pathogens = this.pathogens.filter(p => !p.isDead);

        this.indicators.forEach(ind => ind.update());
        this.indicators = this.indicators.filter(ind => ind.opacity > 0);

        if (randomFloat() < 0.005) {
            GlobalRegistry.pruneRegistry();
        }
    }

    draw(ctx, gpuTerrainCanvas = null, skipClear = false) {
        if (!skipClear) {
            ctx.clearRect(0, 0, CONFIG.W, CONFIG.H);
        }

        if (gpuTerrainCanvas) {
            // WebGPU rendered the terrain in a single pass — composite it here.
            ctx.drawImage(gpuTerrainCanvas, 0, 0);
        } else {
            // Canvas 2D fallback: one fillRect per soil cell.
            const cellW = CONFIG.GRID_SIZE;
            const cellH = CONFIG.GRID_SIZE;
            for (let x = 0; x < this.soilGrid.cols; x++) {
                for (let y = 0; y < this.soilGrid.rows; y++) {
                    const cell = this.soilGrid.cells[x][y];
                    ctx.fillStyle = this.getCellFillColor(cell);
                    ctx.fillRect(cell.worldX, cell.worldY, cellW, cellH);
                }
            }
        }

        ctx.save();
        ctx.strokeStyle = 'rgba(56, 189, 248, 0.05)';
        ctx.lineWidth = 1;
        this.windStreaks.forEach(streak => {
            streak.x += this.globalWind.x * streak.speed + 0.3;
            streak.y += this.globalWind.y * streak.speed;

            if (streak.x > CONFIG.W) streak.x = 0;
            if (streak.x < 0) streak.x = CONFIG.W;
            if (streak.y > CONFIG.H) streak.y = 0;
            if (streak.y < 0) streak.y = CONFIG.H;

            ctx.beginPath();
            ctx.moveTo(streak.x, streak.y);
            ctx.lineTo(streak.x - this.globalWind.x * streak.len, streak.y - this.globalWind.y * streak.len);
            ctx.stroke();
        });
        ctx.restore();

        this.carcasses.forEach(carcass => carcass.draw(ctx));
        this.spores.forEach(spore => spore.draw(ctx));
        this.zoochores.forEach(zoochore => zoochore.draw(ctx));
        this.pathogens.forEach(path => path.draw(ctx));

        const densePlantRenderMode = this.plants.length > CONFIG.DENSE_VEGETATION_THRESHOLD;
        if (densePlantRenderMode) {
            ctx.save();
            for (let i = 0; i < this.plants.length; i++) {
                const plant = this.plants[i];
                const size = plant.isSeedling ? 2 : 3;
                ctx.globalAlpha = plant.isSeedling ? 0.45 : 0.9;
                ctx.fillStyle = plant.color;
                ctx.fillRect(plant.x - size * 0.5, plant.y - size * 0.5, size, size);
            }
            ctx.restore();
        } else {
            this.plants.forEach(plant => plant.draw(ctx, false));
        }

        this.microorganisms.forEach(organism => {
            const isSelected = runtime.selectedEntity === organism;
            organism.draw(ctx, isSelected);
        });

        const maxIndicatorsToDraw = this.plants.length > CONFIG.DENSE_VEGETATION_THRESHOLD
            ? CONFIG.DENSE_INDICATOR_DRAW_LIMIT
            : CONFIG.NORMAL_INDICATOR_DRAW_LIMIT;
        const indicatorStart = Math.max(0, this.indicators.length - maxIndicatorsToDraw);
        for (let i = indicatorStart; i < this.indicators.length; i++) {
            this.indicators[i].draw(ctx);
        }
    }

    getCellFillColor(cell) {
        if (runtime.activeFilter === 'elevation') {
            const shade = Math.floor(cell.elevation * 180);
            return `rgb(${shade}, ${shade * 0.7}, ${shade * 0.4})`;
        }
        if (runtime.activeFilter === 'nutrients') {
            const intensity = Math.min(1.0, cell.nutrients / 100);
            return `rgba(245, 158, 11, ${intensity * 0.7})`;
        }
        if (runtime.activeFilter === 'moisture') {
            const intensity = Math.min(1.0, cell.moisture / 100);
            return `rgba(6, 182, 212, ${0.1 + intensity * 0.75})`;
        }

        if (cell.type === 'Clay/Silt') {
            return 'rgba(16, 185, 129, 0.08)';
        }
        if (cell.type === 'Rocky/Shale') {
            return 'rgba(239, 68, 68, 0.05)';
        }
        return 'rgba(51, 65, 85, 0.03)';
    }
}

export const EngineInstance = new EcosystemSimulation();
