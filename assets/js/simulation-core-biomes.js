import { CONFIG } from './state.js';
import { GlobalRegistry, RibosomeParser, FloatIndicator, getDnaColor, getToroidalDistance, mutateDnaSequence, randomFloat, wrapPosition, wrapCoordinate, getElevation } from './simulation-core-utils.js';

export class SoilGrid {
    constructor() {
        this.cols = Math.ceil(CONFIG.W / CONFIG.GRID_SIZE);
        this.rows = Math.ceil(CONFIG.H / CONFIG.GRID_SIZE);
        this.cells = [];
        this.geoAgeTicks = 0;
        this.climateState = {
            precipitation: 0.45,
            storminess: 0.25,
            evaporation: 0.35,
            droughtBias: 0.2
        };
        this.initializeGrid();
    }

    getBiomeByElevation(elevation) {
        if (elevation < 0.35) {
            return { type: 'Clay/Silt', diffusionRate: 0.02, nutrientRetention: 160 };
        }
        if (elevation > 0.7) {
            return { type: 'Rocky/Shale', diffusionRate: 0.25, nutrientRetention: 45 };
        }
        return { type: 'Sandy/Loam', diffusionRate: 0.1, nutrientRetention: 95 };
    }

    initializeGrid() {
        for (let x = 0; x < this.cols; x++) {
            this.cells[x] = [];
            for (let y = 0; y < this.rows; y++) {
                const worldX = x * CONFIG.GRID_SIZE;
                const worldY = y * CONFIG.GRID_SIZE;
                const elevation = getElevation(worldX, worldY);

                const biome = this.getBiomeByElevation(elevation);

                this.cells[x][y] = {
                    type: biome.type,
                    elevation,
                    nutrients: biome.nutrientRetention,
                    baseMaxNutrients: biome.nutrientRetention,
                    maxNutrients: biome.nutrientRetention,
                    diffusionRate: biome.diffusionRate,
                    worldX,
                    worldY,
                    moisture: 30,
                    soilStabilization: 0,
                    soilDepth: 1.0,
                    suspendedSediment: 0
                };
            }
        }
    }

    getCellAt(worldX, worldY) {
        const wrappedX = wrapCoordinate(worldX, CONFIG.W);
        const wrappedY = wrapCoordinate(worldY, CONFIG.H);
        const col = Math.floor(wrappedX / CONFIG.GRID_SIZE);
        const row = Math.floor(wrappedY / CONFIG.GRID_SIZE);
        return this.cells[col]?.[row] || null;
    }

    update(plantList, climateForcing = null, globalWind = { x: 0, y: 0 }) {
        this.geoAgeTicks++;

        const longCycleTicks = Math.max(1, CONFIG.LONG_TERM_WEATHER_CYCLE_TICKS);
        const monsoonCycleTicks = Math.max(1, CONFIG.LONG_TERM_MONSOON_CYCLE_TICKS);
        const processScale = Math.max(0.05, CONFIG.LONG_TERM_PROCESS_SPEED);
        const weatherPhase = this.geoAgeTicks / longCycleTicks;
        const monsoonPhase = this.geoAgeTicks / monsoonCycleTicks;

        const seasonalPrecip = 0.5 + Math.sin(weatherPhase * Math.PI * 2) * 0.22;
        const monsoonPulse = Math.sin(monsoonPhase * Math.PI * 2 + 0.8) * 0.18;
        const forcingPrecip = climateForcing?.precipitation ?? 0.5;
        const forcingStorminess = climateForcing?.storminess ?? 0.3;
        const forcingEvaporation = climateForcing?.evaporation ?? 0.35;
        const forcingDrought = climateForcing?.droughtBias ?? 0.2;

        this.climateState.precipitation = Math.max(0, Math.min(1, seasonalPrecip + monsoonPulse + (forcingPrecip - 0.5) * 0.55));
        this.climateState.storminess = Math.max(0, Math.min(1, 0.2 + forcingStorminess * 0.7 + Math.max(0, monsoonPulse) * 0.4));
        this.climateState.evaporation = Math.max(0, Math.min(1, forcingEvaporation + (0.6 - this.climateState.precipitation) * 0.35));
        this.climateState.droughtBias = Math.max(0, Math.min(1, forcingDrought + (0.45 - this.climateState.precipitation) * 0.6));

        if (this.geoAgeTicks % Math.max(30, CONFIG.SOIL_RECLASSIFY_INTERVAL) === 0) {
            for (let x = 0; x < this.cols; x++) {
                for (let y = 0; y < this.rows; y++) {
                    const cell = this.cells[x][y];
                    const biome = this.getBiomeByElevation(cell.elevation);
                    cell.type = biome.type;
                    cell.diffusionRate += (biome.diffusionRate - cell.diffusionRate) * 0.22;
                    cell.baseMaxNutrients += (biome.nutrientRetention - cell.baseMaxNutrients) * 0.1;
                }
            }
        }

        for (let x = 0; x < this.cols; x++) {
            for (let y = 0; y < this.rows; y++) {
                this.cells[x][y].soilStabilization = 0;
            }
        }

        plantList.forEach(plant => {
            const cell = this.getCellAt(plant.x, plant.y);
            if (cell && !plant.isSeedling) {
                cell.soilStabilization = Math.min(0.9, cell.soilStabilization + 0.6);
            }
        });

        for (let x = 0; x < this.cols; x++) {
            for (let y = 0; y < this.rows; y++) {
                const cell = this.cells[x][y];

                const stormChance = (0.0008 + this.climateState.storminess * 0.006 + this.climateState.precipitation * 0.003) * processScale;
                if (cell.elevation > 0.65 && randomFloat() < stormChance) {
                    cell.moisture = Math.min(100, cell.moisture + 42 + this.climateState.precipitation * 18);
                }

                const ambientRain = (0.18 + this.climateState.precipitation * 0.62) * processScale;
                cell.moisture = Math.min(100, cell.moisture + ambientRain);

                let regenRate = 0.02;
                if (cell.type === 'Clay/Silt') regenRate = 0.05;
                if (cell.type === 'Rocky/Shale') regenRate = 0.005;
                const moistureFertility = 0.55 + Math.min(1.2, cell.moisture / 70);
                const soilDepthFertility = 0.45 + Math.min(1.4, cell.soilDepth * 0.9);
                cell.nutrients = Math.min(cell.maxNutrients, cell.nutrients + regenRate * moistureFertility * soilDepthFertility * processScale);

                if (cell.moisture > 5) {
                    const downY = (y + 1) % this.rows;
                    const lateralDir = randomFloat() < 0.5 ? -1 : 1;
                    const lateralX = (x + lateralDir + this.cols) % this.cols;
                    const downhillNeighbor = this.cells[x][downY];
                    const lateralNeighbor = this.cells[lateralX][y];
                    const neighbor = downhillNeighbor.elevation <= lateralNeighbor.elevation ? downhillNeighbor : lateralNeighbor;

                    if (neighbor.elevation < cell.elevation) {
                        const slope = Math.max(0.001, cell.elevation - neighbor.elevation);
                        const runoffRate = (CONFIG.HYDRO_RUNOFF_BASE + this.climateState.precipitation * 0.08 + this.climateState.storminess * 0.06) * processScale;
                        const lateralDiffusion = CONFIG.HYDRO_LATERAL_DIFFUSION * processScale;
                        const waterRunoff = cell.moisture * Math.min(0.42, runoffRate * (1 + slope * 2.2) + lateralDiffusion);
                        cell.moisture -= waterRunoff;
                        neighbor.moisture += waterRunoff;

                        const erosionSuppressedRate = 1.0 - cell.soilStabilization;
                        const waterErosion = cell.nutrients * CONFIG.EROSION_SPEED * 0.06 * erosionSuppressedRate * (1 + slope * 0.9) * processScale;
                        const topsoilEroded = cell.soilDepth * CONFIG.EROSION_SPEED * 0.004 * erosionSuppressedRate * (1 + slope * 1.2) * processScale;

                        const windMagnitude = Math.hypot(globalWind.x, globalWind.y);
                        const windDryness = Math.max(0, this.climateState.droughtBias + (30 - cell.moisture) / 45);
                        const windErosion = cell.nutrients * windMagnitude * CONFIG.WIND_SOIL_TRANSPORT * (1 - Math.min(0.95, cell.soilStabilization)) * windDryness * processScale;

                        const erodedNutrients = Math.min(cell.nutrients, waterErosion + windErosion);
                        cell.nutrients -= erodedNutrients;
                        neighbor.nutrients = Math.min(neighbor.maxNutrients * 2.2, neighbor.nutrients + erodedNutrients * 0.85);

                        const deposition = Math.min(topsoilEroded, cell.soilDepth * 0.35);
                        cell.soilDepth = Math.max(0.25, cell.soilDepth - deposition);
                        neighbor.soilDepth = Math.min(2.8, neighbor.soilDepth + deposition * 0.92);
                        cell.suspendedSediment = Math.min(2.0, cell.suspendedSediment + deposition * 0.6);
                        neighbor.suspendedSediment = Math.max(0, neighbor.suspendedSediment + deposition * 0.35);

                        const elevationDrift = deposition * CONFIG.LONG_TERM_ELEVATION_DRIFT * processScale;
                        cell.elevation = Math.max(0, cell.elevation - elevationDrift);
                        neighbor.elevation = Math.min(1, neighbor.elevation + elevationDrift * 0.85);
                    }
                }

                const evaporation = (0.018 + this.climateState.evaporation * 0.06 + this.climateState.droughtBias * 0.03) * processScale;
                cell.moisture = Math.max(6, cell.moisture - evaporation);

                const soilDepthFactor = 0.55 + Math.min(1.2, cell.soilDepth * 0.7);
                const sedimentBonus = Math.min(0.22, cell.suspendedSediment * 0.09);
                const capacityTarget = Math.max(25, cell.baseMaxNutrients * (soilDepthFactor + sedimentBonus));
                const capRate = CONFIG.SOIL_CAPACITY_ADJUST_RATE * processScale;
                cell.maxNutrients += (capacityTarget - cell.maxNutrients) * capRate;
                cell.maxNutrients = Math.max(25, Math.min(260, cell.maxNutrients));

                const suspendedDecay = 0.004 * (1 + this.climateState.precipitation * 0.6) * processScale;
                cell.suspendedSediment = Math.max(0, cell.suspendedSediment - suspendedDecay);
                cell.nutrients = Math.max(0, Math.min(cell.maxNutrients * 2.5, cell.nutrients));
            }
        }
    }
}

export class PathogenCloud {
    constructor(x, y, geneticPayload) {
        this.x = x;
        this.y = y;
        this.vx = randomFloat() * 0.4 - 0.2;
        this.vy = randomFloat() * 0.4 - 0.2;
        this.geneticPayload = [...geneticPayload];
        this.life = 250;
        this.isDead = false;
    }

    update(globalWind) {
        this.vx += globalWind.x * 0.05;
        this.vy += globalWind.y * 0.05;
        this.x += this.vx;
        this.y += this.vy;
        this.x = wrapCoordinate(this.x, CONFIG.W);
        this.y = wrapCoordinate(this.y, CONFIG.H);
        this.life--;
        if (this.life <= 0) this.isDead = true;
    }

    draw(ctx) {
        ctx.save();
        ctx.fillStyle = 'rgba(168, 85, 247, 0.15)';
        ctx.strokeStyle = 'rgba(168, 85, 247, 0.4)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(this.x, this.y, Math.max(1, 10 + Math.sin(this.life * 0.05) * 4), 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.restore();
    }
}

export class Spore {
    constructor(x, y, angle, speed, maxLife, dna, lineageId) {
        this.x = x;
        this.y = y;
        this.vx = Math.cos(angle) * speed;
        this.vy = Math.sin(angle) * speed;
        this.dna = [...dna];
        this.lineageId = lineageId;
        this.life = maxLife;
        this.maxLife = maxLife;
        this.color = getDnaColor(dna, true);
        this.isDead = false;
    }

    update(soilGrid, plantList, indicators, globalWind) {
        this.vx += globalWind.x * 0.08;
        this.vy += globalWind.y * 0.08;

        const cell = soilGrid.getCellAt(this.x, this.y);
        if (cell && cell.type === 'Rocky/Shale') {
            const step = CONFIG.GRID_SIZE;
            const hLeft = getElevation(this.x - step, this.y);
            const hRight = getElevation(this.x + step, this.y);
            const hUp = getElevation(this.x, this.y - step);
            const hDown = getElevation(this.x, this.y + step);

            const dx = hLeft - hRight;
            const dy = hUp - hDown;

            this.vx += dx * 0.22;
            this.vy += dy * 0.22;
        }

        this.vx *= 0.95;
        this.vy *= 0.95;
        this.x += this.vx;
        this.y += this.vy;

        this.x = wrapCoordinate(this.x, CONFIG.W);
        this.y = wrapCoordinate(this.y, CONFIG.H);

        this.life--;
        if (this.life <= 0) {
            this.germinate(soilGrid, plantList, indicators);
        }
    }

    germinate(soilGrid, plantList) {
        this.isDead = true;
        const cell = soilGrid.getCellAt(this.x, this.y);

        let germinationChance = CONFIG.GERMINATION_PROB_SANDY_LOAM;
        if (cell) {
            if (cell.type === 'Rocky/Shale') germinationChance = CONFIG.GERMINATION_PROB_ROCKY_SHALE;
            if (cell.type === 'Clay/Silt') germinationChance = CONFIG.GERMINATION_PROB_CLAY_SILT;
        }
        germinationChance = Math.max(0, Math.min(1, germinationChance));

        if (
            cell
            && randomFloat() < germinationChance
            && cell.moisture >= CONFIG.GERMINATION_MOISTURE_THRESHOLD
            && cell.nutrients >= CONFIG.GERMINATION_NUTRIENT_THRESHOLD
        ) {
            cell.nutrients -= CONFIG.GERMINATION_NUTRIENT_THRESHOLD;
            plantList.push(new Plant(this.x, this.y, this.dna, this.lineageId));
        } else if (cell) {
            cell.nutrients = Math.min(cell.maxNutrients * 2.5, cell.nutrients + CONFIG.GERMINATION_NUTRIENT_THRESHOLD * 0.6);
        }
    }

    draw(ctx) {
        ctx.save();
        ctx.fillStyle = this.color;
        ctx.shadowBlur = 8;
        ctx.shadowColor = this.color;
        ctx.beginPath();
        ctx.arc(this.x, this.y, 2.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }
}

export class ZoochoreSeed {
    constructor(x, y, dna, lineageId) {
        this.x = x;
        this.y = y;
        this.dna = [...dna];
        this.lineageId = lineageId;
        this.isDead = false;
        this.color = getDnaColor(dna, true);
        this.age = 0;
        const dormancyMin = Math.max(0, Math.floor(CONFIG.ZOOCHORE_DORMANCY_MIN_TICKS));
        const dormancyMax = Math.max(dormancyMin, Math.floor(CONFIG.ZOOCHORE_DORMANCY_MAX_TICKS));
        this.dormancyEnd = dormancyMin + Math.floor(randomFloat() * (dormancyMax - dormancyMin + 1));
    }

    update(soilGrid, plantList, indicators, indicatorBudgetAvailable = true) {
        this.age++;

        // Expire seeds that never found viable ground.
        if (this.age >= Math.max(1, Math.floor(CONFIG.ZOOCHORE_MAX_VIABILITY_TICKS))) {
            this.isDead = true;
            return;
        }

        // Remain dormant — seed sits quietly in soil, invisible.
        if (this.age < this.dormancyEnd) return;

        // After dormancy: check environment each tick for germination window.
        const cell = soilGrid.getCellAt(this.x, this.y);
        if (!cell) return;

        const moistureOk = cell.moisture >= CONFIG.GERMINATION_MOISTURE_THRESHOLD;
        const nutrientsOk = cell.nutrients >= CONFIG.GERMINATION_NUTRIENT_THRESHOLD;

        if (!moistureOk || !nutrientsOk) return;

        // Environment is viable — attempt germination.
        let germinationChance = CONFIG.GERMINATION_PROB_SANDY_LOAM;
        if (cell.type === 'Rocky/Shale') germinationChance = CONFIG.GERMINATION_PROB_ROCKY_SHALE;
        if (cell.type === 'Clay/Silt') germinationChance = CONFIG.GERMINATION_PROB_CLAY_SILT;
        germinationChance = Math.max(0, Math.min(1, germinationChance));

        if (randomFloat() < germinationChance) {
            cell.nutrients -= CONFIG.GERMINATION_NUTRIENT_THRESHOLD;
            const seedling = new Plant(this.x, this.y, this.dna, this.lineageId);
            plantList.push(seedling);
            if (indicatorBudgetAvailable) {
                indicators.push(new FloatIndicator(this.x, this.y - 12, 'ZOOCHORE SPROUTED', '#38bdf8'));
            }
        }

        // Regardless of germination success, seed is consumed after attempting.
        this.isDead = true;
    }

    draw(ctx) {
        ctx.save();
        ctx.fillStyle = this.color;
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(this.x, this.y, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(this.x - 4, this.y);
        ctx.quadraticCurveTo(this.x - 6, this.y - 4, this.x - 4, this.y - 4);
        ctx.moveTo(this.x + 4, this.y);
        ctx.quadraticCurveTo(this.x + 6, this.y + 4, this.x + 4, this.y + 4);
        ctx.stroke();

        // Dormant seeds render dimmer; awakened seeds glow brighter.
        if (this.age >= this.dormancyEnd) {
            ctx.strokeStyle = 'rgba(56, 189, 248, 0.7)';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.arc(this.x, this.y, 7, 0, Math.PI * 2);
            ctx.stroke();
        }

        ctx.restore();
    }
}

export class Plant {
    constructor(x, y, dna, lineageId = null) {
        this.x = x;
        this.y = y;
        this.dna = [...dna];
        this.lineageId = GlobalRegistry.registerEntity(lineageId, this.dna);

        const traits = RibosomeParser.translatePlant(this.dna);
        this.photosyntheticRate = traits.photosyntheticRate;
        this.toxicity = traits.toxicity;
        this.dispersalRange = traits.dispersalRange;
        this.maxEnergy = traits.maxEnergy;
        this.sheddingEnabled = traits.sheddingEnabled;
        this.sporeFloatingCoefficient = traits.sporeFloatingCoefficient;
        this.clonalGrowth = traits.clonalGrowth;
        this.clonalAggression = traits.clonalAggression;

        this.energy = 25;
        this.isDead = false;
        this.color = getDnaColor(this.dna, true);
        this.age = 0;
        this.isSeedling = this.dna.includes(0x8B);

        const succulenceCount = this.dna.filter(g => g === 0x40).length;
        this.maxAge = 1200 + succulenceCount * 500 + randomFloat() * 600;
    }

    update(soilGrid, plantList, sporeList, zoochores, indicators, indicatorBudgetAvailable = true) {
        this.age++;

        if (this.age > this.maxAge) {
            this.die(soilGrid, indicators, indicatorBudgetAvailable);
            return;
        }

        const cell = soilGrid.getCellAt(this.x, this.y);
        if (!cell) return;

        if (this.isSeedling) {
            if (this.energy < 40) {
                this.energy += 0.06;
            }
            if (this.energy >= 40) {
                this.isSeedling = false;
                if (indicatorBudgetAvailable) {
                    indicators.push(new FloatIndicator(this.x, this.y - 12, 'MATURED', '#10b981'));
                }
            }
            return;
        }

        if (this.age > this.maxAge * CONFIG.SENESCENCE_START_AGE_FRACTION) {
            this.photosyntheticRate *= CONFIG.SENESCENCE_EFFICIENCY_DECAY_PER_STEP;
            const recycledMass = Math.max(0.05, this.energy * CONFIG.SENESCENCE_RECYCLE_MASS_FRACTION);
            this.energy = Math.max(5, this.energy - recycledMass);
            cell.nutrients = Math.min(cell.maxNutrients * 2.2, cell.nutrients + recycledMass);
        }

        const moistureModifier = cell.moisture / 45;
        let growthBase = CONFIG.BASE_PLANT_GROWTH * (1.0 - cell.elevation * 0.4) * moistureModifier;
        if (cell.type === 'Clay/Silt') growthBase *= 1.4;

        if (cell.nutrients > 2 && this.energy < this.maxEnergy) {
            const rate = Math.min(cell.nutrients, this.photosyntheticRate * growthBase * 0.2);
            cell.nutrients -= rate;
            this.energy += rate;
        }

        if (this.sheddingEnabled && this.energy >= this.maxEnergy * 0.85) {
            this.energy -= 20;
            cell.nutrients = Math.min(cell.maxNutrients * 2.5, cell.nutrients + 18);
            if (indicatorBudgetAvailable) {
                indicators.push(new FloatIndicator(this.x, this.y - 8, 'MULCH', '#06b6d4'));
            }
        }

        if (this.energy >= this.maxEnergy) {
            this.replicate(soilGrid, plantList, sporeList, zoochores, indicators, indicatorBudgetAvailable);
        }
    }

    replicate(soilGrid, plantList, sporeList, zoochores, indicators, indicatorBudgetAvailable = true) {
        this.energy /= 2;

        const plantGenePool = [0x10, 0x20, 0x30, 0x40, 0x60, 0x6A, 0x7F, 0x8B, 0x9C, 0x9D];
        const mutationResult = mutateDnaSequence(this.dna, plantGenePool, CONFIG.FLORA_MUTATION_CHANCE);
        const childDna = mutationResult.childDna;
        if (mutationResult.mutated && indicatorBudgetAvailable) {
            indicators.push(new FloatIndicator(this.x, this.y - 10, 'FLORA MUTATION', '#a855f7'));
        }

        if (this.clonalGrowth > 0) {
            // Tune clonal spread pressure so dense patches naturally shift toward dispersal routes.
            const nearbyPlantCount = this.countPlantsInRadius(plantList, 22 + this.clonalGrowth * 4 + this.clonalAggression * 3);
            const localDensityPenalty = Math.min(0.45, nearbyPlantCount * 0.05);
            const useClonalGrowthChance = Math.max(0.12, Math.min(0.9, 0.26 + this.clonalGrowth * 0.10 + this.clonalAggression * 0.12 - localDensityPenalty));
            const useClonalGrowth = randomFloat() < useClonalGrowthChance;
            if (useClonalGrowth) {
                const targetBurst = 1 + this.clonalAggression;
                let burstSuccess = 0;
                for (let i = 0; i < targetBurst; i++) {
                    if (!this.tryClonalGrowthReplication(soilGrid, plantList, childDna)) {
                        break;
                    }
                    burstSuccess++;

                    // Mass clonal seedling production has a real metabolic cost.
                    this.energy = Math.max(5, this.energy - (3 + this.clonalAggression * 0.5));
                }

                if (burstSuccess > 0) {
                    if (indicatorBudgetAvailable) {
                        indicators.push(new FloatIndicator(this.x, this.y - 12, `RUNNER BURST x${burstSuccess}`, '#84cc16'));
                    }
                    return;
                }
            }
        }

        const dispersalLevel = this.dna.filter(g => g === 0x30).length;

        if (this.dna.includes(0x7F)) {
            const offsetAngle = randomFloat() * Math.PI * 2;
            const offsetDist = randomFloat() * 15;
            const zX = this.x + Math.cos(offsetAngle) * offsetDist;
            const zY = this.y + Math.sin(offsetAngle) * offsetDist;
            const wrapped = wrapPosition(zX, zY);
            zoochores.push(new ZoochoreSeed(wrapped.x, wrapped.y, childDna, this.lineageId));
            if (indicatorBudgetAvailable) {
                indicators.push(new FloatIndicator(this.x, this.y - 12, 'SEED DROPPED (ZOOCHORY)', '#38bdf8'));
            }
        } else {
            const floatingBoost = this.dna.includes(0x6A) ? this.sporeFloatingCoefficient : 1;
            const flotationLife = (35 + dispersalLevel * 35) * floatingBoost;
            const launchSpeed = 1.2 + dispersalLevel * 1.5;
            const sporeCount = 1 + Math.floor(dispersalLevel * 0.5);

            for (let i = 0; i < sporeCount; i++) {
                const angle = randomFloat() * Math.PI * 2 + i * Math.PI / 2;
                sporeList.push(new Spore(this.x, this.y, angle, launchSpeed, flotationLife, childDna, this.lineageId));
            }
            if (indicatorBudgetAvailable) {
                indicators.push(new FloatIndicator(this.x, this.y - 12, 'SPORES RELEASED', '#10b981'));
            }
        }
    }

    tryClonalGrowthReplication(soilGrid, plantList, childDna) {
        const dispersalLevel = this.dna.filter(g => g === 0x30).length;
        const spacingRadius = Math.max(7, 13 - Math.floor(this.clonalGrowth * 0.6) - Math.floor(this.clonalAggression * 0.6));
        const maxReach = 12 + dispersalLevel * 4 + this.clonalGrowth * 5 + this.clonalAggression * 3;
        const candidateCount = 6 + this.clonalGrowth * 2 + this.clonalAggression * 2;

        let bestCandidate = null;
        let bestScore = -Infinity;

        for (let i = 0; i < candidateCount; i++) {
            const angle = randomFloat() * Math.PI * 2;
            const dist = 6 + randomFloat() * maxReach;
            const nextPos = wrapPosition(this.x + Math.cos(angle) * dist, this.y + Math.sin(angle) * dist);
            const targetCell = soilGrid.getCellAt(nextPos.x, nextPos.y);

            if (!targetCell) continue;
            if (targetCell.nutrients < 8 || targetCell.moisture < 12) continue;

            const neighborCount = this.countPlantsNearPosition(plantList, nextPos, spacingRadius);
            if (neighborCount > 0) continue;

            const distancePenalty = dist * 0.08;
            const crowdPressure = this.countPlantsNearPosition(plantList, nextPos, spacingRadius * 2) * Math.max(0.8, 1.6 - this.clonalAggression * 0.2);
            const score = targetCell.moisture * 0.6 + targetCell.nutrients * 0.4 - distancePenalty - crowdPressure;

            if (score > bestScore) {
                bestScore = score;
                bestCandidate = { nextPos, targetCell };
            }
        }

        if (!bestCandidate) {
            return false;
        }

        bestCandidate.targetCell.nutrients -= 6;
        const child = new Plant(bestCandidate.nextPos.x, bestCandidate.nextPos.y, childDna, this.lineageId);
        child.isSeedling = true;
        child.energy = Math.min(child.maxEnergy * 0.35, 12 + this.clonalGrowth * 2 + this.clonalAggression * 2);
        plantList.push(child);
        return true;
    }

    countPlantsNearPosition(plantList, position, radius) {
        let count = 0;
        for (let i = 0; i < plantList.length; i++) {
            const neighbor = plantList[i];
            if (neighbor === this) continue;
            if (neighbor.isDead) continue;
            if (getToroidalDistance(position, neighbor) < radius) {
                count++;
            }
        }
        return count;
    }

    countPlantsInRadius(plantList, radius) {
        let count = 0;
        for (let i = 0; i < plantList.length; i++) {
            const neighbor = plantList[i];
            if (neighbor === this || neighbor.isDead) continue;
            if (getToroidalDistance(this, neighbor) < radius) {
                count++;
            }
        }
        return count;
    }

    die(soilGrid, indicators, indicatorBudgetAvailable = true) {
        this.isDead = true;
        GlobalRegistry.decrementPopulation(this.lineageId);

        const cell = soilGrid.getCellAt(this.x, this.y);
        if (cell) {
            cell.nutrients = Math.min(cell.maxNutrients * 2.0, cell.nutrients + Math.max(15, this.energy * 0.7));
        }
        if (indicatorBudgetAvailable) {
            indicators.push(new FloatIndicator(this.x, this.y, 'SENESCENCE', '#10b981'));
        }
    }

    draw(ctx, denseMode = false) {
        ctx.save();

        const maxRad = this.isSeedling ? 2.5 : 3.5;
        const r = Math.max(1, maxRad + (Math.max(0, this.energy) / this.maxEnergy) * 5);

        ctx.fillStyle = this.color;
        if (!denseMode) {
            ctx.shadowBlur = this.isSeedling ? 2 : 10;
            ctx.shadowColor = this.color;
        }

        if (this.isSeedling) {
            ctx.globalAlpha = 0.5;
        }

        ctx.beginPath();
        ctx.arc(this.x, this.y, r, 0, Math.PI * 2);
        ctx.fill();

        if (denseMode) {
            ctx.restore();
            return;
        }

        ctx.fillStyle = this.toxicity > 15 ? '#a855f7' : '#ffffff';
        ctx.beginPath();
        ctx.arc(this.x, this.y, Math.max(0.5, r * 0.4), 0, Math.PI * 2);
        ctx.fill();

        if (this.toxicity > 0 && !this.isSeedling) {
            ctx.strokeStyle = '#c084fc';
            ctx.lineWidth = 1;
            for (let a = 0; a < Math.PI * 2; a += Math.PI / 4) {
                ctx.beginPath();
                ctx.moveTo(this.x + Math.cos(a) * r, this.y + Math.sin(a) * r);
                ctx.lineTo(this.x + Math.cos(a) * (r + 4), this.y + Math.sin(a) * (r + 4));
                ctx.stroke();
            }
        }
        ctx.restore();
    }

    consume() {
        const foodVal = this.energy;
        this.energy = 0;
        this.isDead = true;
        GlobalRegistry.decrementPopulation(this.lineageId);
        return foodVal;
    }

    takeDamage(amount) {
        this.energy -= amount;
        if (this.energy <= 0) {
            this.isDead = true;
            GlobalRegistry.decrementPopulation(this.lineageId);
        }
    }
}

