        // DEPRECATED ENTRYPOINT
        // This monolithic bundle is kept for historical reference only.
        // Active HTML pages should load ./assets/js/ui.js instead.
        if (!window.__DIGITAL_SIM_LEGACY_APP_WARNED__) {
            window.__DIGITAL_SIM_LEGACY_APP_WARNED__ = true;
            console.warn('[DEPRECATED] Loaded legacy assets/js/app.js. Use assets/js/ui.js as the page entrypoint.');
        }

        // ============================================================================
        // 1. ENGINE CONFIGURATION & GLOBALS
        // ============================================================================
        const CONFIG = {
            W: 800,               // Virtual Canvas Width
            H: 600,               // Virtual Canvas Height
            GRID_SIZE: 20,        // Cell size (40x30 matrix)
            MUTATION_CHANCE: 0.15, // Base animal/plant mutation rate
            BASE_PLANT_GROWTH: 0.5,
            EROSION_SPEED: 0.10,   // Downward soil erosion
            SPEC_MAX_DELTA: 1,    // Maximum Hamming Distance before declaring Speciation
            FRICTION_MODIFIER: 0.15
        };

        const apiKey = ""; // Platforms inject keys directly here at runtime

        // UI Globals
        let activeFilter = 'classic'; // 'classic', 'elevation', 'nutrients', 'moisture'
        let isPaused = false;
        let speedMultiplier = 1;
        let selectedEntity = null;
        let armedLabCreature = null; // Contains blueprint to inject on next tap
        let isArmed = false;

        // Telemetry tracking arrays
        const MAX_DATA_POINTS = 100;
        const telemetryHistory = {
            animals: [],
            plants: [],
            spores: [],
            carcasses: [],
            lineages: []
        };

        // Setup notification helper
        function triggerToast(message, type = 'success') {
            const toast = document.createElement('div');
            toast.className = `p-3 rounded-lg text-xs font-code border shadow-xl flex items-center gap-2 transition-all duration-300 transform translate-y-2 opacity-0 pointer-events-auto max-w-sm `;
            if (type === 'success') {
                toast.className += 'bg-emerald-950/95 border-emerald-500/30 text-emerald-400 glowing-border-green';
            } else if (type === 'danger') {
                toast.className += 'bg-rose-950/95 border-rose-500/30 text-rose-400 glowing-border-red';
            } else {
                toast.className += 'bg-cyan-950/95 border-cyan-500/30 text-cyan-400 glowing-border-cyan';
            }
            toast.innerHTML = `<i class="fa-solid ${type === 'success' ? 'fa-circle-check' : type === 'danger' ? 'fa-triangle-exclamation' : 'fa-info-circle'}"></i> ${message}`;
            
            const container = document.getElementById('toast-container');
            container.appendChild(toast);
            
            // Trigger animation
            setTimeout(() => {
                toast.classList.remove('translate-y-2', 'opacity-0');
            }, 10);

            // Dismiss
            setTimeout(() => {
                toast.classList.add('opacity-0', 'translate-y-2');
                setTimeout(() => toast.remove(), 300);
            }, 4000);
        }

        // ============================================================================
        // 2. MATHEMATICAL TOPOLOGY UTILS
        // ============================================================================
        function wrapPosition(x, y) {
            return {
                x: ((x % CONFIG.W) + CONFIG.W) % CONFIG.W,
                y: ((y % CONFIG.H) + CONFIG.H) % CONFIG.H
            };
        }

        function getToroidalDistance(A, B) {
            let dx = Math.abs(A.x - B.x);
            if (dx > CONFIG.W / 2) dx = CONFIG.W - dx;

            let dy = Math.abs(A.y - B.y);
            if (dy > CONFIG.H / 2) dy = CONFIG.H - dy;

            return Math.sqrt(dx * dx + dy * dy);
        }

        function getHammingDistance(dnaA, dnaB) {
            let distance = 0;
            const maxLen = Math.max(dnaA.length, dnaB.length);
            for (let i = 0; i < maxLen; i++) {
                if (dnaA[i] !== dnaB[i]) distance++;
            }
            return distance;
        }

        // Generates elevation wrapped over a torus
        function getElevation(x, y) {
            const nx = (x / CONFIG.W) * Math.PI * 2;
            const ny = (y / CONFIG.H) * Math.PI * 2;
            let noise = Math.sin(nx) * Math.cos(ny) + Math.sin(ny * 2) * 0.4 + Math.cos(nx * 3) * 0.15;
            return (noise + 1.55) / 3.1; // Normalize to beautiful range [0, 1]
        }

        // Color generation based on DNA sequence hash
        function getDnaColor(dna, isPlant) {
            let hash = 0;
            dna.forEach(gene => hash = (hash << 5) - hash + gene);
            let hue = Math.abs(hash) % 360;
            if (isPlant) {
                return `hsl(${(hue % 80) + 110}, 85%, 45%)`; // Green-turquoise range for flora
            } else {
                let aggressionCount = dna.filter(g => g === 0x07).length;
                if (aggressionCount > 0) {
                    return `hsl(${345 + (aggressionCount * 15) % 30}, 95%, 50%)`; // Red for predators
                }
                return `hsl(${(hue % 120) + 190}, 90%, 55%)`; // Blue/Cyan for passive herbivores
            }
        }

        // Blueprint translation singleton mapping genotype arrays to phenotype traits.
        class RibosomeParser {
            static translateMicroorganism(dna) {
                const count = (gene) => dna.filter(g => g === gene).length;
                const structural = count(0x01);
                const locomotion = count(0x02);
                const herbivory = count(0x03);
                const sensing = count(0x04);
                const predation = count(0x07);
                const insulation = count(0x0A);

                return {
                    health: 70 + structural * 30,
                    baseMetabolism: 0.12 + structural * 0.06 + locomotion * 0.05,
                    speed: 0.9 + locomotion * 1.15,
                    herbivoryEfficiency: 0.7 + herbivory * 0.55,
                    sensorRange: 55 + sensing * 35,
                    aggression: 8 + predation * 26,
                    insulation
                };
            }

            static translatePlant(dna) {
                const count = (gene) => dna.filter(g => g === gene).length;
                const photo = count(0x10);
                const toxin = count(0x20);
                const dispersal = count(0x30);
                const succulence = count(0x40);
                const mulching = count(0x60) > 0;
                const floating = count(0x6A);

                return {
                    photosyntheticRate: 0.45 + photo * 0.2,
                    toxicity: toxin * 12,
                    dispersalRange: 1 + dispersal,
                    maxEnergy: 70 + succulence * 45,
                    sheddingEnabled: mulching,
                    sporeFloatingCoefficient: 1 + floating * 0.7
                };
            }
        }

        class FloatIndicator {
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

        class Carcass {
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

        // ============================================================================
        // 3. ARTIFICIAL NEURAL NETWORK (ANN) BEHAVIORAL PROCESSING
        // ============================================================================
        class OrganismBrain {
            constructor(dnaWeights = null) {
                // Multi-layer Feedforward ANN Model
                // Inputs: [Dist nearest food, Dist nearest threat, Local nutrients, Wind direction, Neighbor pheromone] -> 5 inputs
                // Hidden Layer: 4 neurons
                // Output Layer: [Motor Output X, Motor Output Y, Pheromone signal, Attack Bite command] -> 4 outputs
                // Weight parameters layout:
                // Input -> Hidden weights: 5 * 4 = 20 weights + 4 biases = 24 parameters
                // Hidden -> Output weights: 4 * 4 = 16 weights + 4 biases = 20 parameters
                // Total DNA Brain weight size: 44 indices
                if (dnaWeights && dnaWeights.length === 44) {
                    this.weights = [...dnaWeights];
                } else {
                    this.weights = [];
                    for (let i = 0; i < 44; i++) {
                        this.weights.push(Math.random() * 2 - 1); // Synapses bounds [-1, 1]
                    }
                }
            }

            forward(inputs) {
                // inputs: array of 5
                // Input -> Hidden evaluation loop
                let hidden = [];
                for (let h = 0; h < 4; h++) {
                    let val = 0;
                    for (let i = 0; i < 5; i++) {
                        val += inputs[i] * this.weights[h * 5 + i];
                    }
                    val += this.weights[20 + h]; // Bias offset
                    hidden.push(Math.tanh(val)); // Tanh squash [-1, 1]
                }

                // Hidden -> Output evaluation loop
                let outputs = [];
                for (let o = 0; o < 4; o++) {
                    let val = 0;
                    for (let h = 0; h < 4; h++) {
                        val += hidden[h] * this.weights[24 + o * 4 + h];
                    }
                    val += this.weights[40 + o]; // Bias offset
                    outputs.push(Math.tanh(val)); // squashed output bounds
                }
                return outputs;
            }

            mutate() {
                // Clone weights & inject standard synaptic noise
                let mutatedWeights = this.weights.map(w => {
                    if (Math.random() < 0.15) {
                        return Math.max(-1.5, Math.min(1.5, w + (Math.random() * 0.4 - 0.2)));
                    }
                    return w;
                });
                return new OrganismBrain(mutatedWeights);
            }
        }

        // ============================================================================
        // 4. EVOLUTIONARY PHYLOGENY REGISTRY
        // ============================================================================
        class EvolutionaryRegistry {
            constructor() {
                this.registry = new Map();
                this.nextId = 1;
            }

            registerEntity(parentLineageId, dnaSequence, annWeights = null) {
                const dnaString = dnaSequence.join(',');

                if (parentLineageId && this.registry.has(parentLineageId)) {
                    const parentNode = this.registry.get(parentLineageId);
                    const dist = getHammingDistance(parentNode.dnaSequence.split(',').map(Number), dnaSequence);

                    // If modification is below max spec delta, append to existing lineage
                    if (dist <= CONFIG.SPEC_MAX_DELTA) {
                        parentNode.livingPopulationSize++;
                        return parentNode.uniqueId;
                    }
                }

                // Create a distinct lineages node branch
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
                // Keeps parent nodes of currently living clades
                const activeAncestors = new Set();
                for (let [id, node] of this.registry.entries()) {
                    if (node.livingPopulationSize > 0) {
                        let curr = node;
                        while (curr) {
                            activeAncestors.add(curr.uniqueId);
                            curr = curr.parentId ? this.registry.get(curr.parentId) : null;
                        }
                    }
                }
                for (let [id, node] of this.registry.entries()) {
                    if (!activeAncestors.has(id)) {
                        this.registry.delete(id);
                    }
                }
            }
        }

        const GlobalRegistry = new EvolutionaryRegistry();

        // ============================================================================
        // 5. ENVIRONMENT MODELING (SOIL MECHANICS, DYNAMICS & HYDROLOGY)
        // ============================================================================
        class SoilGrid {
            constructor() {
                this.cols = Math.ceil(CONFIG.W / CONFIG.GRID_SIZE);
                this.rows = Math.ceil(CONFIG.H / CONFIG.GRID_SIZE);
                this.cells = [];
                this.initializeGrid();
            }

            initializeGrid() {
                for (let x = 0; x < this.cols; x++) {
                    this.cells[x] = [];
                    for (let y = 0; y < this.rows; y++) {
                        const worldX = x * CONFIG.GRID_SIZE;
                        const worldY = y * CONFIG.GRID_SIZE;
                        const elevation = getElevation(worldX, worldY);

                        let type = 'Sandy/Loam'; // Default plains
                        let diffusionRate = 0.1;
                        let nutrientRetention = 50;

                        if (elevation < 0.35) {
                            type = 'Clay/Silt'; // Low Valleys
                            diffusionRate = 0.02;
                            nutrientRetention = 100;
                        } else if (elevation > 0.7) {
                            type = 'Rocky/Shale'; // Mountainous Slopes
                            diffusionRate = 0.25;
                            nutrientRetention = 20;
                        }

                        this.cells[x][y] = {
                            type,
                            elevation,
                            nutrients: nutrientRetention,
                            maxNutrients: nutrientRetention,
                            diffusionRate,
                            worldX,
                            worldY,
                            moisture: 30, // Local moisture trackers
                            soilStabilization: 0 // Plant roots anchoring rate
                        };
                    }
                }
            }

            getCellAt(worldX, worldY) {
                const wrapped = wrapPosition(worldX, worldY);
                const col = Math.floor(wrapped.x / CONFIG.GRID_SIZE);
                const row = Math.floor(wrapped.y / CONFIG.GRID_SIZE);
                return this.cells[col]?.[row] || null;
            }

            update(plantList) {
                // Evaluate plant canopy roots to prevent dynamic soil weathering (Section 2.4)
                for (let x = 0; x < this.cols; x++) {
                    for (let y = 0; y < this.rows; y++) {
                        this.cells[x][y].soilStabilization = 0;
                    }
                }
                plantList.forEach(plant => {
                    const cell = this.getCellAt(plant.x, plant.y);
                    if (cell && !plant.isSeedling) {
                        cell.soilStabilization = Math.min(0.9, cell.soilStabilization + 0.6); // root coverage
                    }
                });

                // Soil hydrology & nutrients downhill wash flow
                for (let x = 0; x < this.cols; x++) {
                    for (let y = 0; y < this.rows; y++) {
                        let cell = this.cells[x][y];

                        // Occasional high altitude convective rainfall
                        if (cell.elevation > 0.65 && Math.random() < 0.005) {
                            cell.moisture = Math.min(100, cell.moisture + 50);
                        }

                        // Passive soil nutrient recovery based on biomes
                        let regenRate = 0.02; 
                        if (cell.type === 'Clay/Silt') regenRate = 0.05;    // Valleys recover nutrients rapidly
                        if (cell.type === 'Rocky/Shale') regenRate = 0.005;  // Peaks recover nutrients slowly
                        cell.nutrients = Math.min(cell.maxNutrients, cell.nutrients + regenRate);

                        // Gradient descent flow: water runoffs to adjacent lower elevation coordinate cells
                        if (cell.moisture > 5) {
                            const downY = (y + 1) % this.rows;
                            const neighbor = this.cells[x][downY];
                            if (neighbor.elevation < cell.elevation) {
                                const waterRunoff = cell.moisture * 0.12;
                                cell.moisture -= waterRunoff;
                                neighbor.moisture += waterRunoff;

                                // Water strips nutrients downhill unless anchored by plants roots (Section 2.4)
                                const erosionSuppressedRate = (1.0 - cell.soilStabilization);
                                const erodedNutrients = cell.nutrients * CONFIG.EROSION_SPEED * 0.06 * erosionSuppressedRate;
                                cell.nutrients -= erodedNutrients;
                                neighbor.nutrients = Math.min(neighbor.maxNutrients * 2.2, neighbor.nutrients + erodedNutrients);
                            }
                        }
                        // Evaporation decay rate
                        cell.moisture = Math.max(10, cell.moisture - 0.04);
                    }
                }
            }
        }

        // ============================================================================
        // 6. ENTITY ARCHITECTURE PIPELINES
        // ============================================================================
        
        // Drifting Pathogen Viral Dust Cloud
        class PathogenCloud {
            constructor(x, y, geneticPayload) {
                this.x = x;
                this.y = y;
                this.vx = Math.random() * 0.4 - 0.2;
                this.vy = Math.random() * 0.4 - 0.2;
                this.geneticPayload = [...geneticPayload]; // Pathogen load carrying parent DNA
                this.life = 250;
                this.isDead = false;
            }
            update(globalWind) {
                this.vx += globalWind.x * 0.05;
                this.vy += globalWind.y * 0.05;
                this.x += this.vx;
                this.y += this.vy;
                const wrapped = wrapPosition(this.x, this.y);
                this.x = wrapped.x;
                this.y = wrapped.y;
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

        // Spore Drift Particle
        class Spore {
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

                // Slopes slope gravity downhill drift
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

                const wrapped = wrapPosition(this.x, this.y);
                this.x = wrapped.x;
                this.y = wrapped.y;

                this.life--;
                if (this.life <= 0) {
                    this.germinate(soilGrid, plantList, indicators);
                }
            }
            germinate(soilGrid, plantList, indicators) {
                this.isDead = true;
                const cell = soilGrid.getCellAt(this.x, this.y);
                
                let germinationChance = 0.8;
                if (cell) {
                    if (cell.type === 'Rocky/Shale') germinationChance = 0.25;
                    if (cell.type === 'Clay/Silt') germinationChance = 0.95;
                }

                if (cell && Math.random() < germinationChance && cell.nutrients >= 10) {
                    cell.nutrients -= 10;
                    plantList.push(new Plant(this.x, this.y, this.dna, this.lineageId));
                } else if (cell) {
                    cell.nutrients = Math.min(cell.maxNutrients * 2.5, cell.nutrients + 6);
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

        // Zoochory Transport Seed payload (Zoochory 0x7F)
        class ZoochoreSeed {
            constructor(x, y, dna, lineageId) {
                this.x = x;
                this.y = y;
                this.dna = [...dna];
                this.lineageId = lineageId;
                this.isDead = false;
                this.color = getDnaColor(dna, true);
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
                // Hooks visual representation
                ctx.beginPath();
                ctx.moveTo(this.x - 4, this.y);
                ctx.quadraticCurveTo(this.x - 6, this.y - 4, this.x - 4, this.y - 4);
                ctx.moveTo(this.x + 4, this.y);
                ctx.quadraticCurveTo(this.x + 6, this.y + 4, this.x + 4, this.y + 4);
                ctx.stroke();
                ctx.restore();
            }
        }

        // Spore Plant Flora Entity
        class Plant {
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

                this.energy = 25;
                this.isDead = false;
                this.color = getDnaColor(this.dna, true);
                this.age = 0;

                // Configure stunted germination mechanics (stealth seedlings 0x8B)
                this.isSeedling = this.dna.includes(0x8B);

                const succulenceCount = this.dna.filter(g => g === 0x40).length;
                this.maxAge = 1200 + (succulenceCount * 500) + Math.random() * 600;
            }

            update(soilGrid, plantList, sporeList, zoochores, indicators) {
                this.age++;

                // Natural senescence check
                if (this.age > this.maxAge) {
                    this.die(soilGrid, indicators);
                    return;
                }

                let cell = soilGrid.getCellAt(this.x, this.y);
                if (!cell) return;

                // If seedling, execute slow stunted growth mechanics (Section 3.3)
                if (this.isSeedling) {
                    if (this.energy < 40) {
                        // Blueprint-aligned dormancy: seedlings can mature with near-zero soil draw.
                        this.energy += 0.06;
                    }
                    if (this.energy >= 40) {
                        this.isSeedling = false;
                        indicators.push(new FloatIndicator(this.x, this.y - 12, 'MATURED', '#10b981'));
                    }
                    return;
                }

                // Senescence gradual production drop
                if (this.age > this.maxAge * 0.75) {
                    this.photosyntheticRate *= 0.95;
                    const recycledMass = 0.25;
                    this.energy = Math.max(5, this.energy - recycledMass);
                    cell.nutrients = Math.min(cell.maxNutrients * 2.2, cell.nutrients + recycledMass);
                }

                // Photosynthetic conversion scale based on water availability
                const moistureModifier = cell.moisture / 45;
                let growthBase = CONFIG.BASE_PLANT_GROWTH * (1.0 - cell.elevation * 0.4) * moistureModifier;
                if (cell.type === 'Clay/Silt') growthBase *= 1.4;

                if (cell.nutrients > 2 && this.energy < this.maxEnergy) {
                    const rate = Math.min(cell.nutrients, this.photosyntheticRate * growthBase * 0.2);
                    cell.nutrients -= rate;
                    this.energy += rate;
                }

                // 0x60 Deciduous shedding (Mulch) mechanics
                if (this.sheddingEnabled && this.energy >= this.maxEnergy * 0.85) {
                    this.energy -= 20;
                    cell.nutrients = Math.min(cell.maxNutrients * 2.5, cell.nutrients + 18);
                    indicators.push(new FloatIndicator(this.x, this.y - 8, 'MULCH', '#06b6d4'));
                }

                // Plant replication criteria
                if (this.energy >= this.maxEnergy) {
                    this.replicate(plantList, sporeList, zoochores, indicators);
                }
            }

            replicate(plantList, sporeList, zoochores, indicators) {
                this.energy /= 2;
                
                let childDna = [...this.dna];
                if (Math.random() < CONFIG.MUTATION_CHANCE) {
                    const geneMutants = [0x10, 0x20, 0x30, 0x40, 0x60, 0x6A, 0x7F, 0x8B];
                    const index = Math.floor(Math.random() * childDna.length);
                    childDna[index] = geneMutants[Math.floor(Math.random() * geneMutants.length)];
                }

                const dispersalLevel = this.dna.filter(g => g === 0x30).length;
                
                // Zoochory seed hooking (0x7F)
                if (this.dna.includes(0x7F)) {
                    const offsetAngle = Math.random() * Math.PI * 2;
                    const offsetDist = Math.random() * 15;
                    const zX = this.x + Math.cos(offsetAngle) * offsetDist;
                    const zY = this.y + Math.sin(offsetAngle) * offsetDist;
                    const wrapped = wrapPosition(zX, zY);
                    zoochores.push(new ZoochoreSeed(wrapped.x, wrapped.y, childDna, this.lineageId));
                    indicators.push(new FloatIndicator(this.x, this.y - 12, 'SEED DROPPED (ZOOCHORY)', '#38bdf8'));
                } else {
                    // Spore Dispersal (0x30)
                    const floatingBoost = this.dna.includes(0x6A) ? this.sporeFloatingCoefficient : 1;
                    const flotationLife = (35 + dispersalLevel * 35) * floatingBoost;
                    const launchSpeed = 1.2 + dispersalLevel * 1.5;
                    const sporeCount = 1 + Math.floor(dispersalLevel * 0.5);

                    for (let i = 0; i < sporeCount; i++) {
                        const angle = (Math.random() * Math.PI * 2) + (i * Math.PI / 2);
                        sporeList.push(new Spore(this.x, this.y, angle, launchSpeed, flotationLife, childDna, this.lineageId));
                    }
                    indicators.push(new FloatIndicator(this.x, this.y - 12, 'SPORES RELEASED', '#10b981'));
                }
            }

            die(soilGrid, indicators) {
                this.isDead = true;
                GlobalRegistry.decrementPopulation(this.lineageId);
                
                let cell = soilGrid.getCellAt(this.x, this.y);
                if (cell) {
                    cell.nutrients = Math.min(cell.maxNutrients * 2.0, cell.nutrients + Math.max(15, this.energy * 0.7));
                }
                indicators.push(new FloatIndicator(this.x, this.y, 'SENESCENCE', '#10b981'));
            }

            draw(ctx) {
                ctx.save();
                
                const maxRad = this.isSeedling ? 2.5 : 3.5;
                const r = Math.max(1, maxRad + (Math.max(0, this.energy) / this.maxEnergy) * 5);
                
                ctx.fillStyle = this.color;
                ctx.shadowBlur = this.isSeedling ? 2 : 10;
                ctx.shadowColor = this.color;

                if (this.isSeedling) {
                    ctx.globalAlpha = 0.5;
                }

                ctx.beginPath();
                ctx.arc(this.x, this.y, r, 0, Math.PI * 2);
                ctx.fill();

                // Core center
                ctx.fillStyle = this.toxicity > 15 ? '#a855f7' : '#ffffff';
                ctx.beginPath();
                ctx.arc(this.x, this.y, Math.max(0.5, r * 0.4), 0, Math.PI * 2);
                ctx.fill();

                // Spines toxic visualization
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

        // Active Microorganism Agent with Neural synapses navigation (ANN Brain)
        class Microorganism {
            constructor(x, y, dna, parentLineageId = null, brainWeights = null) {
                this.x = x;
                this.y = y;
                this.dna = [...dna];
                this.brain = new OrganismBrain(brainWeights);
                this.lineageId = GlobalRegistry.registerEntity(parentLineageId, this.dna, this.brain.weights);

                // Build phenotype parameters
                const traits = RibosomeParser.translateMicroorganism(this.dna);
                this.maxHealth = traits.health;
                this.health = traits.health;
                this.baseMetabolism = traits.baseMetabolism;
                this.speed = traits.speed;
                this.herbivoryEfficiency = traits.herbivoryEfficiency;
                this.sensorRange = traits.sensorRange;
                this.aggression = traits.aggression;
                this.insulation = traits.insulation;

                this.energy = 60;
                this.mass = 25 + (this.maxHealth * 0.08);
                this.isDead = false;
                this.color = getDnaColor(this.dna, false);
                this.angle = Math.random() * Math.PI * 2;
                this.wigglePhase = Math.random() * 100;
                this.target = null;

                // Special systems states (HGT, Epigenetics, Endosymbionts)
                this.carriedSpores = [];
                this.internalSymbionts = [];
                this.infected = false; 
                this.hijackedGenePool = null;
                
                // Neural outputs track variables for visualization
                this.latestBrainOutput = [0, 0, 0, 0];
                this.pheromoneSignal = 0;
            }

            // Checks both base genome insulation and endosymbiont compliance inheritances
            getHasInsulation() {
                return this.insulation > 0 || this.internalSymbionts.some(sym => sym.dna.includes(0x0A));
            }

            // Checks digestive efficiencies inherited from symbionts
            getHerbivoryEfficiency() {
                let eff = this.herbivoryEfficiency;
                this.internalSymbionts.forEach(sym => {
                    if (sym.dna.includes(0x03)) eff += 0.3; // shared efficiency
                });
                return eff;
            }

            update(soilGrid, environmentEntities, microorganismList, sporeList, indicators, globalWind) {
                let cell = soilGrid.getCellAt(this.x, this.y);
                if (!cell) return;

                // Epigenetic Stress Adaptations (Plasticity 0x0E) (Section 3.2)
                let activeSpeed = this.speed;
                let activeScaleReduction = 1.0;

                if (this.dna.includes(0x0E) && this.energy < 25) {
                    activeScaleReduction = 0.55; // shrink structure
                    activeSpeed = this.speed * 1.5; // hyper express locomotion
                }

                // Slopes & terrain biomes kinetic friction modifiers
                let uphillFriction = cell.type === 'Rocky/Shale' ? CONFIG.FRICTION_MODIFIER : 0.0;
                let actualVelocity = Math.max(0.3, activeSpeed - uphillFriction);

                // Collect normalized sensors variables for ANN Model
                const sensors = this.gatherBrainSensors(environmentEntities, cell, globalWind);
                
                // Fire Neural Synapses Weights
                const brainOutputs = this.brain.forward(sensors);
                this.latestBrainOutput = brainOutputs; // Cache outputs
                this.pheromoneSignal = Math.max(0, brainOutputs[2]);
                
                // Motor velocity coupling output decoding (Throttle & Steering)
                const moveX = brainOutputs[0] * actualVelocity;
                const moveY = brainOutputs[1] * actualVelocity;
                
                this.x += moveX;
                this.y += moveY;

                // Update drawn orientation based on calculated motor direction
                if (Math.abs(moveX) > 0.01 || Math.abs(moveY) > 0.01) {
                    this.angle = Math.atan2(moveY, moveX);
                }

                // Wrap coordinate bounds
                const wrapped = wrapPosition(this.x, this.y);
                this.x = wrapped.x;
                this.y = wrapped.y;

                // Thermodynamic energy deduction logic
                let altitudePenalty = (cell.elevation > 0.65) && (!this.getHasInsulation()) ? (cell.elevation * 0.15) : 0;
                let lowlandHeatPenalty = (cell.elevation < 0.3) && (this.getHasInsulation()) ? 0.12 : 0;
                
                let metabolicUsage = this.baseMetabolism + altitudePenalty + lowlandHeatPenalty + (Math.sqrt(moveX*moveX + moveY*moveY) * 0.04);
                
                // Viral infection continuous drain (Section 4.3)
                if (this.infected) {
                    metabolicUsage += 0.08;
                }

                // Organelles endosymbiont maintenance draft
                if (this.internalSymbionts.length > 0) {
                    metabolicUsage += this.internalSymbionts.length * 0.04;
                }

                this.energy -= metabolicUsage;

                // Passive Zoochory Detach drop spores (Zoochory 0x7F) (Section 3.3)
                if (this.carriedSpores) {
                    for (let i = this.carriedSpores.length - 1; i >= 0; i--) {
                        const seed = this.carriedSpores[i];
                        seed.ticksToCarry--;

                        if (seed.ticksToCarry <= 0 || Math.random() < 0.003) {
                            const dropAngle = Math.random() * Math.PI * 2;
                            sporeList.push(new Spore(this.x, this.y, dropAngle, 1.2, 45, seed.dna, seed.lineageId));
                            indicators.push(new FloatIndicator(this.x, this.y - 12, `SEED DETACHED`, '#38bdf8'));
                            this.carriedSpores.splice(i, 1);
                        }
                    }
                }

                // Process starvation death
                if (this.energy <= 0) {
                    this.health -= 0.6;
                    if (this.health <= 0) this.die(environmentEntities, indicators);
                }

                // Process replication criteria
                if (this.energy >= 140) {
                    this.replicate(microorganismList, indicators);
                }
            }

            gatherBrainSensors(entities, cell, globalWind) {
                let nearestFoodDist = 1.0;
                let nearestThreatDist = 1.0;
                let neighboringPheromone = 0;

                entities.forEach(entity => {
                    if (entity === this || entity.isDead) return;
                    
                    // Invisible seedlings logic (Section 3.3)
                    if (entity instanceof Plant && entity.isSeedling && this.sensorRange < 80) {
                        return; 
                    }

                    const dist = getToroidalDistance(this, entity) / Math.max(1, this.sensorRange);
                    if (dist <= 1.0) {
                        if (this.aggression > 25) {
                            // Predator looks for other animals
                            if (entity instanceof Microorganism) {
                                nearestFoodDist = Math.min(nearestFoodDist, dist);
                            }
                        } else {
                            // Herbivore looks for plants
                            if (entity instanceof Plant) {
                                nearestFoodDist = Math.min(nearestFoodDist, dist);
                            }
                            // Threats to herbivores are active predators (aggression > 25)
                            if (entity instanceof Microorganism && entity.aggression > 25) {
                                nearestThreatDist = Math.min(nearestThreatDist, dist);
                            }
                        }

                        if (entity instanceof Microorganism) {
                            neighboringPheromone += (entity.pheromoneSignal || 0) * (1.0 - dist);
                        }
                    }
                });

                const windDirection = (Math.atan2(globalWind.y, globalWind.x) + Math.PI) / (Math.PI * 2);

                return [
                    nearestFoodDist,
                    nearestThreatDist,
                    cell.nutrients / cell.maxNutrients,
                    windDirection,
                    Math.min(1.0, neighboringPheromone)
                ];
            }

            handleCollision(other, entities, sporeList, indicators) {
                if (other instanceof Microorganism) {
                    let geneticDistance = getHammingDistance(this.dna, other.dna);

                    // Predatory interactions & Endosymbiosis (Section 3.2)
                    if (geneticDistance > 1 && this.aggression > 30) {
                        // Endosymbiosis Compliance host check (0x1F)
                        if (other.dna.includes(0x1F) && this.internalSymbionts.length < 2 && Math.random() < 0.03) {
                            this.internalSymbionts.push({
                                dna: [...other.dna],
                                lineageId: other.lineageId
                            });
                            other.isDead = true;
                            indicators.push(new FloatIndicator(this.x, this.y, `ENDOSYMBIONT SECURED`, '#2dd4bf'));
                            GlobalRegistry.decrementPopulation(other.lineageId);
                            return;
                        }

                        other.health -= 15;
                        indicators.push(new FloatIndicator(other.x, other.y, '-15 HP', '#ef4444'));
                        
                        if (other.health <= 0) {
                            other.die(entities, indicators);
                            this.energy += other.mass * 1.2;
                            indicators.push(new FloatIndicator(this.x, this.y - 10, `+${Math.floor(other.mass)} NRG`, '#10b981'));
                        }
                    }
                } 
                else if (other instanceof Plant) {
                    if (other.isSeedling && this.sensorRange < 80) return; // Stunted seedling bypass

                    if (this.aggression <= 30) {
                        if (other.toxicity > this.insulation * 15) {
                            this.health -= other.toxicity * 0.6;
                            indicators.push(new FloatIndicator(this.x, this.y, `TOXIN BURST`, '#ef4444'));
                            other.takeDamage(15);
                        } else {
                            let yieldValue = other.consume();
                            this.energy += yieldValue * this.getHerbivoryEfficiency();
                            indicators.push(new FloatIndicator(this.x, this.y - 10, `+${Math.floor(yieldValue)} GRAZE`, '#10b981'));
                        }
                    }
                }
                else if (other instanceof ZoochoreSeed) {
                    // Hook sticky Zoochore seed payloads (Section 3.3)
                    if (this.carriedSpores.length < 3) {
                        this.carriedSpores.push({
                            dna: [...other.dna],
                            lineageId: other.lineageId,
                            ticksToCarry: 160 + Math.random() * 200
                        });
                        other.isDead = true;
                        indicators.push(new FloatIndicator(this.x, this.y, 'SEED ATTACHED', '#38bdf8'));
                    }
                }
                else if (other instanceof Carcass && this.aggression > 10) {
                    this.energy += other.mass;
                    other.isDead = true;
                    indicators.push(new FloatIndicator(this.x, this.y - 10, `FEED CARCASS`, '#eab308'));
                }
                else if (other instanceof PathogenCloud) {
                    // Contract virus
                    if (!this.infected && Math.random() < 0.4) {
                        this.infected = true;
                        this.hijackedGenePool = [...other.geneticPayload];
                        other.isDead = true;
                        indicators.push(new FloatIndicator(this.x, this.y, 'INFECTED', '#a855f7'));
                    }
                }
            }

            replicate(list, indicators) {
                this.energy -= 65;
                let childDna = [...this.dna];

                // Horizontal Gene Transfer (HGT) transduction check (Section 4.3)
                if (this.infected && this.hijackedGenePool && Math.random() < 0.25) {
                    const swapGene = this.hijackedGenePool[Math.floor(Math.random() * this.hijackedGenePool.length)];
                    if (!childDna.includes(swapGene)) {
                        childDna[Math.floor(Math.random() * childDna.length)] = swapGene;
                        indicators.push(new FloatIndicator(this.x, this.y - 10, 'VIRAL HGT SWAP', '#a855f7'));
                    }
                }

                // Check standard mutations
                if (Math.random() < CONFIG.MUTATION_CHANCE) {
                    const genePool = [0x01, 0x02, 0x03, 0x04, 0x07, 0x0A, 0x0E, 0x1F];
                    const index = Math.floor(Math.random() * childDna.length);
                    childDna[index] = genePool[Math.floor(Math.random() * genePool.length)];
                    indicators.push(new FloatIndicator(this.x, this.y - 10, 'SPECIATION MUTATION', '#a855f7'));
                }

                // Perturb synaptic brain connection weights
                const childBrainWeights = this.brain.mutate().weights;

                const childPos = wrapPosition(this.x + (Math.random() * 20 - 10), this.y + (Math.random() * 20 - 10));
                
                const child = new Microorganism(childPos.x, childPos.y, childDna, this.lineageId, childBrainWeights);
                if (this.infected && Math.random() < 0.5) {
                    child.infected = true;
                    child.hijackedGenePool = [...this.hijackedGenePool];
                }
                list.push(child);
            }

            die(entities, indicators) {
                this.isDead = true;
                GlobalRegistry.decrementPopulation(this.lineageId);
                
                // Highly virulent/poison carcass drops Pathogen Cloud (Section 4.3)
                if ((this.infected || this.dna.includes(0x20)) && Math.random() < 0.2) {
                    entities.push(new PathogenCloud(this.x, this.y, this.dna));
                    indicators.push(new FloatIndicator(this.x, this.y, 'VIRUS RELEASED', '#a855f7'));
                } else {
                    entities.push(new Carcass(this.x, this.y, this.mass));
                    indicators.push(new FloatIndicator(this.x, this.y, 'STARVED', '#ef4444'));
                }
            }

            draw(ctx, isSelected) {
                ctx.save();
                this.wigglePhase += 0.25;

                let activeScaleReduction = 1.0;
                if (this.dna.includes(0x0E) && this.energy < 25) {
                    activeScaleReduction = 0.55; // Epigenetic size shrink
                }

                // If selected, draw sensory sphere
                if (isSelected) {
                    ctx.strokeStyle = 'rgba(6, 182, 212, 0.2)';
                    ctx.fillStyle = 'rgba(6, 182, 212, 0.03)';
                    ctx.beginPath();
                    ctx.arc(this.x, this.y, Math.max(1, this.sensorRange), 0, Math.PI * 2);
                    ctx.fill();
                    ctx.stroke();

                    // Selected indicator ring
                    ctx.strokeStyle = '#06b6d4';
                    ctx.lineWidth = 1.5;
                    ctx.beginPath();
                    ctx.arc(this.x, this.y, Math.max(1, 16 + Math.sin(this.wigglePhase) * 2), 0, Math.PI * 2);
                    ctx.stroke();
                }

                // Pheromones neural signaling pulse visualizer
                if (this.latestBrainOutput[2] > 0.2) {
                    ctx.strokeStyle = 'rgba(6, 182, 212, 0.25)';
                    ctx.lineWidth = 1;
                    ctx.beginPath();
                    ctx.arc(this.x, this.y, Math.max(1, (10 + (this.wigglePhase % 15)) * activeScaleReduction), 0, Math.PI * 2);
                    ctx.stroke();
                }

                // Safe guard scaleRadius to be positive
                const scaleRadius = Math.max(1, (5 + (Math.max(0, this.health) / this.maxHealth) * 4) * activeScaleReduction);
                ctx.translate(this.x, this.y);
                ctx.rotate(this.angle);

                // Body rendering
                ctx.fillStyle = this.color;
                ctx.shadowBlur = isSelected ? 12 : 5;
                ctx.shadowColor = this.color;

                // Draw cilia/insulation fur
                if (this.insulation > 0) {
                    ctx.strokeStyle = 'rgba(255,255,255,0.4)';
                    ctx.lineWidth = 1;
                    for (let i = 0; i < Math.PI * 2; i += 0.4) {
                        ctx.beginPath();
                        ctx.moveTo(Math.cos(i) * scaleRadius, Math.sin(i) * scaleRadius);
                        ctx.lineTo(Math.cos(i) * (scaleRadius + 3), Math.sin(i) * (scaleRadius + 3));
                        ctx.stroke();
                    }
                }

                // Viral aura infected rendering
                if (this.infected) {
                    ctx.strokeStyle = '#a855f7';
                    ctx.lineWidth = 2;
                    ctx.beginPath();
                    ctx.arc(0, 0, scaleRadius + 2, 0, Math.PI * 2);
                    ctx.stroke();
                }

                // Core shell shape (predator vs herbivore shapes)
                ctx.beginPath();
                if (this.aggression > 25) {
                    ctx.moveTo(scaleRadius * 1.5, 0);
                    ctx.lineTo(-scaleRadius, -scaleRadius);
                    ctx.lineTo(-scaleRadius * 0.4, 0);
                    ctx.lineTo(-scaleRadius, scaleRadius);
                } else {
                    ctx.arc(0, 0, scaleRadius, 0, Math.PI * 2);
                }
                ctx.fill();

                // Draw endosymbionts organelles integrated (0x1F)
                if (this.internalSymbionts.length > 0) {
                    ctx.fillStyle = '#2dd4bf';
                    this.internalSymbionts.forEach((sym, index) => {
                        const symAngle = (index * Math.PI) + this.wigglePhase * 0.05;
                        const dist = scaleRadius * 0.55;
                        ctx.beginPath();
                        ctx.arc(Math.cos(symAngle) * dist, Math.sin(symAngle) * dist, 1.8, 0, Math.PI * 2);
                        ctx.fill();
                    });
                }

                // Draw flagellum locomotion tail
                const tailLen = 12 + this.speed * 4;
                ctx.strokeStyle = this.color;
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.moveTo(-scaleRadius * 0.8, 0);
                for (let i = 0; i < tailLen; i++) {
                    const tailX = -scaleRadius - i;
                    const tailY = Math.sin(i * 0.4 + this.wigglePhase) * 3;
                    ctx.lineTo(tailX, tailY);
                }
                ctx.stroke();

                // Passively carried Zoochore Spores sticky seed payload (0x7F)
                if (this.carriedSpores && this.carriedSpores.length > 0) {
                    ctx.fillStyle = '#38bdf8';
                    this.carriedSpores.forEach((sp, idx) => {
                        const offX = -scaleRadius + Math.sin(idx + this.wigglePhase) * 2;
                        const offY = -3 + idx * 3;
                        ctx.beginPath();
                        ctx.arc(offX, offY, 1.5, 0, Math.PI * 2);
                        ctx.fill();
                    });
                }

                ctx.restore();
            }
        }

        // ============================================================================
        // 7. CORE ECOSYSTEM SIMULATION ENGINE OBJECT
        // ============================================================================
        class EcosystemSimulation {
            constructor() {
                this.soilGrid = new SoilGrid();
                this.plants = [];
                this.microorganisms = [];
                this.carcasses = [];
                this.spores = [];
                this.zoochores = [];
                this.pathogens = [];
                this.indicators = [];
                
                // Atmospheric wind fields
                this.windFrame = 0;
                this.globalWind = { x: 0, y: 0 };
                this.windStreaks = [];
                for (let i = 0; i < 15; i++) {
                    this.windStreaks.push({
                        x: Math.random() * CONFIG.W,
                        y: Math.random() * CONFIG.H,
                        len: 20 + Math.random() * 30,
                        speed: 1.0 + Math.random() * 1.5
                    });
                }

                this.reset();
            }

            reset() {
                this.plants = [];
                this.microorganisms = [];
                this.carcasses = [];
                this.spores = [];
                this.zoochores = [];
                this.pathogens = [];
                this.indicators = [];
                
                GlobalRegistry.registry.clear();
                GlobalRegistry.nextId = 1;

                // Spawn initial vegetation clusters
                for (let i = 0; i < 70; i++) {
                    let rx = Math.random() * CONFIG.W;
                    let ry = Math.random() * CONFIG.H;
                    this.plants.push(new Plant(rx, ry, [0x10, 0x30, 0x40]));
                }

                // Spawn initial microorganism agents
                for (let i = 0; i < 22; i++) {
                    let rx = Math.random() * CONFIG.W;
                    let ry = Math.random() * CONFIG.H;
                    let dna = i % 4 === 0 ? [0x01, 0x02, 0x07, 0x0E] : [0x02, 0x03, 0x04, 0x1F];
                    this.microorganisms.push(new Microorganism(rx, ry, dna));
                }

                triggerToast('Ecosystem sandbox initialised and stabilized.', 'success');
            }

            update() {
                // Soil dynamic moisture updates & runoffs
                this.soilGrid.update(this.plants);

                // Wind currents driven by Altitudinal temperature convection (Section 2.3)
                this.windFrame++;
                const thermalConvectionOffset = Math.sin(this.windFrame * 0.005) * 0.15;
                this.globalWind = {
                    x: Math.sin(this.windFrame * 0.008) * 0.25 + thermalConvectionOffset,
                    y: Math.cos(this.windFrame * 0.006) * 0.25
                };

                const allEntities = [
                    ...this.plants, 
                    ...this.microorganisms, 
                    ...this.carcasses, 
                    ...this.spores, 
                    ...this.zoochores,
                    ...this.pathogens
                ];

                // Spore dynamics updates
                this.spores.forEach(spore => spore.update(this.soilGrid, this.plants, this.indicators, this.globalWind));

                // Pathogen cloud drifts updates
                this.pathogens.forEach(path => path.update(this.globalWind));

                // Vegetation updates
                this.plants.forEach(plant => plant.update(this.soilGrid, this.plants, this.spores, this.zoochores, this.indicators));

                // Carcass decomposition
                this.carcasses.forEach(carcass => carcass.decompose(this.soilGrid));

                // Microorganism brains & positions updates
                this.microorganisms.forEach(organism => {
                    organism.update(this.soilGrid, allEntities, this.microorganisms, this.spores, this.indicators, this.globalWind);
                });

                // Interaction Matrix & Collision detection
                for (let i = 0; i < this.microorganisms.length; i++) {
                    let agent = this.microorganisms[i];
                    if (agent.isDead) continue;

                    allEntities.forEach(entity => {
                        if (agent === entity || entity.isDead) return;
                        let dist = getToroidalDistance(agent, entity);
                        if (dist < 12) {
                            agent.handleCollision(entity, this.carcasses, this.spores, this.indicators);
                        }
                    });
                }

                // Cleanup dead elements
                this.plants = this.plants.filter(p => !p.isDead);
                this.microorganisms = this.microorganisms.filter(m => !m.isDead);
                this.carcasses = this.carcasses.filter(c => !c.isDead);
                this.spores = this.spores.filter(s => !s.isDead);
                this.zoochores = this.zoochores.filter(z => !z.isDead);
                this.pathogens = this.pathogens.filter(p => !p.isDead);

                // Update float notification particles
                this.indicators.forEach(ind => ind.update());
                this.indicators = this.indicators.filter(ind => ind.opacity > 0);

                if (Math.random() < 0.005) {
                    GlobalRegistry.pruneRegistry();
                }
            }

            draw(ctx) {
                ctx.clearRect(0, 0, CONFIG.W, CONFIG.H);

                // Render Soil Background Overlay Filter
                const cellW = CONFIG.GRID_SIZE;
                const cellH = CONFIG.GRID_SIZE;

                for (let x = 0; x < this.soilGrid.cols; x++) {
                    for (let y = 0; y < this.soilGrid.rows; y++) {
                        const cell = this.soilGrid.cells[x][y];
                        ctx.fillStyle = this.getCellFillColor(cell);
                        ctx.fillRect(cell.worldX, cell.worldY, cellW, cellH);
                    }
                }

                // Render wind vector lines
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

                // Render Decomposing Debris/Carcasses
                this.carcasses.forEach(carcass => carcass.draw(ctx));

                // Render Spores drift particles
                this.spores.forEach(spore => spore.draw(ctx));

                // Render Zoochory seeds
                this.zoochores.forEach(zoochore => zoochore.draw(ctx));

                // Render Pathogen clouds
                this.pathogens.forEach(path => path.draw(ctx));

                // Render Plants Flora
                this.plants.forEach(plant => plant.draw(ctx));

                // Render Microorganisms
                this.microorganisms.forEach(organism => {
                    const isSelected = selectedEntity === organism;
                    organism.draw(ctx, isSelected);
                });

                // Draw combat transaction texts
                this.indicators.forEach(ind => ind.draw(ctx));
            }

            getCellFillColor(cell) {
                if (activeFilter === 'elevation') {
                    let shade = Math.floor(cell.elevation * 180);
                    return `rgb(${shade}, ${shade * 0.7}, ${shade * 0.4})`;
                } 
                else if (activeFilter === 'nutrients') {
                    let intensity = Math.min(1.0, cell.nutrients / 100);
                    return `rgba(245, 158, 11, ${intensity * 0.7})`;
                } 
                else if (activeFilter === 'moisture') {
                    let intensity = Math.min(1.0, cell.moisture / 100);
                    return `rgba(6, 182, 212, ${0.1 + intensity * 0.75})`;
                }
                else {
                    // Classic Biomes
                    if (cell.type === 'Clay/Silt') {
                        return 'rgba(16, 185, 129, 0.08)'; // Emerald valleys
                    } else if (cell.type === 'Rocky/Shale') {
                        return 'rgba(239, 68, 68, 0.05)'; // Crimson peaks
                    } else {
                        return 'rgba(51, 65, 85, 0.03)'; // Plains
                    }
                }
            }
        }

        const EngineInstance = new EcosystemSimulation();

        // ============================================================================
        // 8. DASHBOARD DATA VISUALIZATION GRAPHICS & BRAIN VIEWER
        // ============================================================================
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
            for (let k in telemetryHistory) {
                let colMax = Math.max(...telemetryHistory[k], 10);
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

        // Selected Microorganism Neural Network brain viewer
        const brainCanvas = document.getElementById('brainCanvas');
        const brainCtx = brainCanvas ? brainCanvas.getContext('2d') : null;

        function drawSelectedBrainNet() {
            if (!brainCanvas || !brainCtx) return;
            const ctx = brainCtx;
            const w = brainCanvas.width = brainCanvas.parentElement.clientWidth;
            const h = brainCanvas.height = brainCanvas.parentElement.clientHeight;
            ctx.clearRect(0, 0, w, h);

            if (!selectedEntity || !(selectedEntity instanceof Microorganism)) {
                ctx.fillStyle = '#64748b';
                ctx.font = '10px "Inter", sans-serif';
                ctx.textAlign = 'center';
                ctx.fillText('Select a microorganism to view ANN synapses', w/2, h/2);
                return;
            }

            const brain = selectedEntity.brain;
            const inputNodes = ['FoodDist', 'DangerDist', 'SoilNutr', 'SoilMoist', 'Pathogen'];
            const hiddenNodes = ['H0', 'H1', 'H2', 'H3'];
            const outputNodes = ['MotorX', 'MotorY', 'Signal', 'Bite'];

            const colIn = w * 0.15;
            const colMid = w * 0.5;
            const colOut = w * 0.85;

            const inCoords = inputNodes.map((lbl, idx) => ({ x: colIn, y: h * 0.15 + (idx / 4) * h * 0.7, name: lbl }));
            const midCoords = hiddenNodes.map((lbl, idx) => ({ x: colMid, y: h * 0.2 + (idx / 3) * h * 0.6, name: lbl }));
            const outCoords = outputNodes.map((lbl, idx) => ({ x: colOut, y: h * 0.2 + (idx / 3) * h * 0.6, name: lbl }));

            // 1. Draw inputs-to-hidden synapses connections
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

            // 2. Draw hidden-to-outputs synapses connections
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

            // 3. Draw nodes dots
            const drawLayer = (coords, color, size = 4) => {
                coords.forEach(pt => {
                    ctx.fillStyle = color;
                    ctx.shadowBlur = 6;
                    ctx.shadowColor = color;
                    ctx.beginPath();
                    ctx.arc(pt.x, pt.y, size, 0, Math.PI * 2);
                    ctx.fill();

                    // Text labels
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

        // Phylogeny Tree custom rendering
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

            Object.keys(generationGroups).forEach((genStr) => {
                const gen = parseInt(genStr);
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
                        (parent.x + child.x) / 2, parent.y,
                        (parent.x + child.x) / 2, child.y,
                        child.x, child.y
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
            ctx.shadowBlur = 0; // Reset
        }

        // ============================================================================
        // 8. CONTROLS, ACTIONS AND USER INTERFACE BINDINGS
        // ============================================================================
        
        // Loop controls
        const btnPause = document.getElementById('btn-pause');
        const btnStep = document.getElementById('btn-step');
        const btnReset = document.getElementById('btn-reset');
        const lblPlayState = document.getElementById('lbl-play-state');
        const iconPlayState = document.getElementById('icon-play-state');

        btnPause.addEventListener('click', () => {
            isPaused = !isPaused;
            lblPlayState.innerText = isPaused ? 'PLAY' : 'PAUSE';
            iconPlayState.className = isPaused ? 'fa-solid fa-play text-emerald-400' : 'fa-solid fa-pause text-cyan-400';
            triggerToast(isPaused ? 'Simulation paused.' : 'Simulation resumed.');
        });

        btnStep.addEventListener('click', () => {
            if (isPaused) {
                EngineInstance.update();
                updateUIStats();
                triggerToast('Advanced 1 Frame.');
            }
        });

        btnReset.addEventListener('click', () => {
            EngineInstance.reset();
            telemetryHistory.animals = [];
            telemetryHistory.plants = [];
            telemetryHistory.spores = [];
            telemetryHistory.carcasses = [];
            telemetryHistory.lineages = [];
            selectedEntity = null;
            updateInspector();
        });

        // Coefficient sliders
        const sliderSpeed = document.getElementById('slider-speed');
        const valSpeedMult = document.getElementById('val-speed-mult');
        sliderSpeed.addEventListener('input', (e) => {
            speedMultiplier = parseInt(e.target.value);
            valSpeedMult.innerText = `${speedMultiplier}x`;
        });

        const sliderMutation = document.getElementById('slider-mutation-rate');
        const valMutation = document.getElementById('val-mutation-rate');
        sliderMutation.addEventListener('input', (e) => {
            CONFIG.MUTATION_CHANCE = parseInt(e.target.value) / 100;
            valMutation.innerText = `${e.target.value}%`;
        });

        const sliderSpeciation = document.getElementById('slider-speciation-delta');
        const valSpeciation = document.getElementById('val-speciation-delta');
        sliderSpeciation.addEventListener('input', (e) => {
            CONFIG.SPEC_MAX_DELTA = parseInt(e.target.value);
            valSpeciation.innerText = `${e.target.value} ${e.target.value > 1 ? 'Genes' : 'Gene'}`;
        });

        const sliderPlantGrowth = document.getElementById('slider-plant-growth');
        const valPlantGrowth = document.getElementById('val-plant-growth');
        sliderPlantGrowth.addEventListener('input', (e) => {
            CONFIG.BASE_PLANT_GROWTH = parseInt(e.target.value) / 100;
            valPlantGrowth.innerText = CONFIG.BASE_PLANT_GROWTH.toFixed(2);
        });

        const sliderErosion = document.getElementById('slider-erosion');
        const valErosion = document.getElementById('val-erosion-factor');
        sliderErosion.addEventListener('input', (e) => {
            CONFIG.EROSION_SPEED = parseInt(e.target.value) / 100;
            valErosion.innerText = CONFIG.EROSION_SPEED.toFixed(2);
        });

        // Filter overlays
        const filterClassic = document.getElementById('filter-classic');
        const filterElevation = document.getElementById('filter-elevation');
        const filterNutrients = document.getElementById('filter-nutrients');
        const filterMoisture = document.getElementById('filter-moisture');

        const updateFiltersUI = (activeBtn) => {
            [filterClassic, filterElevation, filterNutrients, filterMoisture].forEach(btn => {
                btn.className = 'px-2 py-1 rounded text-slate-400 hover:text-slate-200';
            });
            activeBtn.className = 'px-2 py-1 rounded bg-slate-800 text-slate-100 font-semibold';
        };

        filterClassic.addEventListener('click', () => { activeFilter = 'classic'; updateFiltersUI(filterClassic); });
        filterElevation.addEventListener('click', () => { activeFilter = 'elevation'; updateFiltersUI(filterElevation); });
        filterNutrients.addEventListener('click', () => { activeFilter = 'nutrients'; updateFiltersUI(filterNutrients); });
        filterMoisture.addEventListener('click', () => { activeFilter = 'moisture'; updateFiltersUI(filterMoisture); });

        // Lab Genotype Builder Configuration
        const tabLabAnimal = document.getElementById('tab-lab-animal');
        const tabLabPlant = document.getElementById('tab-lab-plant');
        const listAnimalGenes = document.getElementById('genome-animal-list');
        const listPlantGenes = document.getElementById('genome-plant-list');
        const txtGeneratedDna = document.getElementById('txt-generated-dna');
        const btnArmInjector = document.getElementById('btn-arm-injector');

        let activeLabTab = 'animal';

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
            const list = activeLabTab === 'animal' ? listAnimalGenes : listPlantGenes;
            const checkedCheckboxes = list.querySelectorAll('input[type="checkbox"]:checked');
            const dna = Array.from(checkedCheckboxes).map(cb => parseInt(cb.getAttribute('data-gene')));
            
            armedLabCreature = {
                type: activeLabTab,
                dna: dna
            };
            
            txtGeneratedDna.innerText = dna.length > 0 ? `[${dna.map(g => '0x' + g.toString(16).toUpperCase().padStart(2, '0')).join(', ')}]` : '[]';
        }

        document.querySelectorAll('.glass-panel input[type="checkbox"]').forEach(cb => {
            cb.addEventListener('change', rebuildLabBlueprint);
        });

        // Initialize default lab setup
        rebuildLabBlueprint();

        // Arm the injector to place next organism
        btnArmInjector.addEventListener('click', () => {
            isArmed = !isArmed;
            if (isArmed) {
                btnArmInjector.className = "w-full py-2 rounded-lg bg-emerald-600/30 border border-emerald-500 text-emerald-400 text-xs font-bold tracking-wider flex items-center justify-center gap-2 transition-all";
                btnArmInjector.innerHTML = `<i class="fa-solid fa-crosshairs animate-spin"></i> INJECTOR ARMED (TAP ON MAP)`;
            } else {
                btnArmInjector.className = "w-full py-2 rounded-lg bg-cyan-600/20 border border-cyan-500/30 hover:bg-cyan-600/40 text-xs font-bold text-cyan-400 tracking-wider flex items-center justify-center gap-2 transition-all";
                btnArmInjector.innerHTML = `<i class="fa-solid fa-syringe"></i> ARM LAB INJECTOR (TAP MAP TO SEED)`;
            }
        });

        // Click handler to inject onto main Canvas
        const simCanvas = document.getElementById('simCanvas');
        simCanvas.addEventListener('click', (e) => {
            const rect = simCanvas.getBoundingClientRect();
            const clickX = ((e.clientX - rect.left) / rect.width) * CONFIG.W;
            const clickY = ((e.clientY - rect.top) / rect.height) * CONFIG.H;

            if (isArmed && armedLabCreature) {
                if (armedLabCreature.type === 'animal') {
                    EngineInstance.microorganisms.push(new Microorganism(clickX, clickY, armedLabCreature.dna));
                    triggerToast('Engineered Animal Agent seeded successfully.', 'success');
                } else {
                    EngineInstance.plants.push(new Plant(clickX, clickY, armedLabCreature.dna));
                    triggerToast('Engineered Spore Flora injected successfully.', 'success');
                }
                isArmed = false;
                btnArmInjector.className = "w-full py-2 rounded-lg bg-cyan-600/20 border border-cyan-500/30 hover:bg-cyan-600/40 text-xs font-bold text-cyan-400 tracking-wider flex items-center justify-center gap-2 transition-all";
                btnArmInjector.innerHTML = `<i class="fa-solid fa-syringe"></i> ARM LAB INJECTOR (TAP MAP TO SEED)`;
            }
        });

        // Double click inspector triggers
        simCanvas.addEventListener('dblclick', (e) => {
            const rect = simCanvas.getBoundingClientRect();
            const clickX = ((e.clientX - rect.left) / rect.width) * CONFIG.W;
            const clickY = ((e.clientY - rect.top) / rect.height) * CONFIG.H;

            let closest = null;
            let minDist = 15; // tap threshold radius

            [...EngineInstance.plants, ...EngineInstance.microorganisms].forEach(ent => {
                const dist = getToroidalDistance({ x: clickX, y: clickY }, ent);
                if (dist < minDist) {
                    minDist = dist;
                    closest = ent;
                }
            });

            if (closest) {
                selectedEntity = closest;
                switchTab('inspector');
                updateInspector();
                triggerToast(`Locked telemetry focus onto Lineage #${closest.lineageId}`);
            } else {
                selectedEntity = null;
                updateInspector();
            }
        });

        // Left panels tabs management
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

        // Update single organism inspector view
        function updateInspector() {
            const placeholder = document.getElementById('inspector-placeholder');
            const content = document.getElementById('inspector-data');

            if (!placeholder || !content) return;

            if (!selectedEntity || selectedEntity.isDead) {
                placeholder.classList.remove('hidden');
                content.classList.add('hidden');
                return;
            }

            placeholder.classList.add('hidden');
            content.classList.remove('hidden');

            const isAnimal = selectedEntity instanceof Microorganism;

            const inspectName = document.getElementById('inspect-name');
            const badge = document.getElementById('inspect-type-badge');
            const inspectLineage = document.getElementById('inspect-lineage-val');
            const inspectEnergy = document.getElementById('inspect-energy-val');
            const inspectHealth = document.getElementById('inspect-health-val');
            const inspectSpeed = document.getElementById('inspect-speed-val');
            const inspectSensor = document.getElementById('inspect-sensor-val');
            const inspectVirus = document.getElementById('inspect-virus-val');

            if (!inspectName || !badge || !inspectLineage || !inspectEnergy || !inspectHealth || !inspectSpeed || !inspectSensor || !inspectVirus) return;

            inspectName.innerText = isAnimal ? `Microorganism #${selectedEntity.lineageId}` : `Spore Plant #${selectedEntity.lineageId}`;
            badge.innerText = isAnimal ? 'Animal' : 'Flora';
            badge.className = isAnimal ? 'px-2 py-0.5 rounded text-[10px] font-bold bg-cyan-950 text-cyan-400 border border-cyan-800' : 'px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-950 text-emerald-400 border border-emerald-800';

            inspectLineage.innerText = `#${selectedEntity.lineageId}`;
            inspectEnergy.innerText = `${Math.floor(selectedEntity.energy)} nrg`;
            inspectHealth.innerText = isAnimal ? `${Math.floor(selectedEntity.health)} hp` : 'N/A';
            inspectSpeed.innerText = isAnimal ? `${selectedEntity.speed.toFixed(1)} px/f` : 'Stationary';
            inspectSensor.innerText = isAnimal ? `${selectedEntity.sensorRange} px` : 'N/A';
            inspectVirus.innerText = isAnimal ? (selectedEntity.infected ? 'INFECTED (VIRAL)' : 'Healthy') : 'N/A';

            const brainWrap = document.getElementById('neural-view-wrapper');
            if (brainWrap && isAnimal) {
                brainWrap.classList.remove('hidden');
                drawSelectedBrainNet();
            } else if (brainWrap) {
                brainWrap.classList.add('hidden');
            }

            // Hex chips generator
            const chips = document.getElementById('inspect-dna-chips');
            if (!chips) return;
            chips.innerHTML = '';
            selectedEntity.dna.forEach(gene => {
                const span = document.createElement('span');
                span.className = 'px-1.5 py-0.5 rounded font-code text-[10px] bg-slate-900 border border-slate-800 text-slate-300';
                span.innerText = '0x' + gene.toString(16).toUpperCase().padStart(2, '0');
                chips.appendChild(span);
            });
        }

        // ============================================================================
        // 9. CORE SIMULATION FRAME LOOPS
        // ============================================================================
        const viewCanvas = document.getElementById('simCanvas');
        const viewCtx = viewCanvas.getContext('2d');

        function updateUIStats() {
            // General indicators
            document.getElementById('stat-animals-count').innerText = EngineInstance.microorganisms.length;
            document.getElementById('stat-plants-count').innerText = EngineInstance.plants.length;
            document.getElementById('stat-spores-count').innerText = EngineInstance.spores.length;
            document.getElementById('stat-carcasses-count').innerText = EngineInstance.carcasses.length;
            document.getElementById('stat-lineages-count').innerText = GlobalRegistry.registry.size;

            // Render table of lineages
            const tBody = document.getElementById('lineage-table-body');
            if (!tBody) return;
            tBody.innerHTML = '';
            
            const activeNodes = Array.from(GlobalRegistry.registry.values())
                .filter(n => n.livingPopulationSize > 0)
                .sort((a,b) => b.livingPopulationSize - a.livingPopulationSize);

            activeNodes.forEach(node => {
                const tr = document.createElement('tr');
                tr.className = 'hover:bg-slate-900 cursor-pointer';
                tr.innerHTML = `
                    <td class="p-1.5 flex items-center gap-1.5 font-bold">
                        <span class="w-2.5 h-2.5 rounded-full" style="background-color: ${node.color}"></span>
                        #${node.uniqueId}
                    </td>
                    <td class="p-1.5 text-slate-400">G${node.generationIndex}</td>
                    <td class="p-1.5 text-emerald-400 font-bold">${node.livingPopulationSize}</td>
                    <td class="p-1.5 text-slate-300 font-code text-[9px]">${node.dnaSequence}</td>
                `;
                tr.addEventListener('click', () => {
                    const matches = [...EngineInstance.microorganisms, ...EngineInstance.plants].filter(e => e.lineageId === node.uniqueId);
                    if (matches.length > 0) {
                        selectedEntity = matches[0];
                        switchTab('inspector');
                        updateInspector();
                        triggerToast(`Camera telemetry bound onto Lineage #${node.uniqueId}`);
                    }
                });
                tBody.appendChild(tr);
            });
        }

        // Background loop execution
        let lastHistoryTick = 0;
        function coreLoop() {
            if (!isPaused) {
                // Execute speedMultiplier cycles
                for (let step = 0; step < speedMultiplier; step++) {
                    EngineInstance.update();
                }

                // Process History Metrics Logging
                const now = Date.now();
                if (now - lastHistoryTick > 800) {
                    lastHistoryTick = now;
                    telemetryHistory.animals.push(EngineInstance.microorganisms.length);
                    telemetryHistory.plants.push(EngineInstance.plants.length);
                    telemetryHistory.spores.push(EngineInstance.spores.length);
                    telemetryHistory.carcasses.push(EngineInstance.carcasses.length);
                    telemetryHistory.lineages.push(GlobalRegistry.registry.size);

                    if (telemetryHistory.animals.length > MAX_DATA_POINTS) {
                        for (let key in telemetryHistory) {
                            telemetryHistory[key].shift();
                        }
                    }
                    drawTelemetryChart();
                }

                updateUIStats();
                updateInspector();
            }

            // Draw Viewport Frame
            EngineInstance.draw(viewCtx);
            drawPhylogenyTree();

            requestAnimationFrame(coreLoop);
        }

        // Boot system frame loop
        coreLoop();

        // ============================================================================
        // 10. CONNECTED AI BIO-INFORMATICS ADVISOR MODULE
        // ============================================================================
        const aiChatBuffer = document.getElementById('ai-chat-buffer');
        const aiInput = document.getElementById('ai-input');
        const aiSendBtn = document.getElementById('ai-send-btn');

        async function triggerAdvisorRequest(customPrompt = '') {
            const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`;

            // Pack ecosystem telemetry payload
            const diagnosticData = {
                activeAnimals: EngineInstance.microorganisms.length,
                activeFlora: EngineInstance.plants.length,
                activeSpores: EngineInstance.spores.length,
                carcassesDecomposing: EngineInstance.carcasses.length,
                totalLineagesCount: GlobalRegistry.registry.size,
                soilNutrientErosionRate: CONFIG.EROSION_SPEED,
                mutationChanceRate: CONFIG.MUTATION_CHANCE,
                activeLineages: Array.from(GlobalRegistry.registry.values())
                    .filter(node => node.livingPopulationSize > 0)
                    .map(node => ({
                        lineageId: node.uniqueId,
                        generation: node.generationIndex,
                        population: node.livingPopulationSize,
                        expressedGenoStrand: node.dnaSequence
                    }))
            };

            const systemPrompt = `You are an advanced Bio-Informatics AI Consultant overseeing an artificial life evolution simulation.
The simulation engine runs on a toroidal map coordinate with strict biomes: low-elevation Clay/Silt valleys (rich nutrients), Plains (normal Sandy/Loam), and high Rocky/Shale Peaks.
Metabolism decreases health if energy is exhausted. Movement uphill incurs friction modifiers.
Atmospheric wind currents drift Spore Particles. Slopes cause downhill Spore slides. Microorganisms carry spores on their backs passively in Zoochory mutualism.

Animal genome markers:
- 1 (0x01): Structural optimization (+HP, metabolism penalty)
- 2 (0x02): Locomotion Index (+Velocity, heavy metabolic penalty)
- 3 (0x03): Herbivory digestion efficiency (Plant graze absorption modifier)
- 4 (0x04): Perceptual Sensor Range radius
- 7 (0x07): Aggression/Predation Architecture (Prioritizes carnivory/prey hunting)
- 10 (0x0A): Thermal Insulation (Cancels high peak cold penalties, but suffers lowland hot valleys penalties)
- 14 (0x0E): Plasticity Regulator (Modulates phenotype conditionally during extreme starvation <25% energy)
- 31 (0x1F): Endosymbiosis (Survive predation by integrating into Host organs)

Plant genome markers:
- 16 (0x10): Photosynthesis efficiency (Soil absorption rate)
- 32 (0x20): Defensive Toxicity index (Inflicts poison penalty back on herbivores)
- 48 (0x30): Spore Dispersal Vector (Increases launch velocity, flotation life, wind-riding, and germination resistance)
- 64 (0x40): Succulence (Internal energy reserve capacities)
- 96 (0x60): Deciduous Shedding/Mulch (Drops organic matter on high density directly back into local soil cells)
- 106 (0x6A): Spore Floating Coefficient (Amplifies drift duration under wind vectors)
- 127 (0x7F): Zoochory payload (Hitchhike sticky seed membranes on moving animals)
- 139 (0x8B): Stunted Seedlings (grows at minimized rates, requiring zero soil energy and invisible to basic sensors)

Respond elegantly as a clinical bio-informatics system in 3-4 highly concise lines.
CRITICAL: If the user or context asks to suggest or create a balancer, specify a custom genetic sequence strictly using this exact JSON block format somewhere in your output (using standard base-10 integer values):
{"suggestedSequence": [1, 2, 7], "speciesType": "animal", "speciesName": "Apex Alpha"} 
Or for a plant:
{"suggestedSequence": [16, 32, 64], "speciesType": "plant", "speciesName": "Spike Spore"}`;

            appendChatMessage('system', 'Ecosystem telemetry packaged. Consulting AI advisor...');

            let attempt = 0;
            let responseText = '';
            let success = false;

            const payload = {
                contents: [{
                    parts: [{
                        text: customPrompt || `Conduct a structural assessment on the current live state metrics: ${JSON.stringify(diagnosticData)}`
                    }]
                }],
                systemInstruction: {
                    parts: [{ text: systemPrompt }]
                }
            };

            while (attempt < 5 && !success) {
                try {
                    const response = await fetch(url, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(payload)
                    });
                    
                    if (!response.ok) throw new Error(`HTTP Code ${response.status}`);
                    
                    const data = await response.json();
                    responseText = data.candidates?.[0]?.content?.parts?.[0]?.text || 'No response generated.';
                    success = true;
                } catch (err) {
                    attempt++;
                    const waitTime = Math.pow(2, attempt - 1) * 1000;
                    if (attempt === 5) {
                        appendChatMessage('ai-err', `Ecosystem Consultant connection timed out. Telemetry assessment offline.`);
                        return;
                    }
                    await new Promise(r => setTimeout(r, waitTime));
                }
            }

            if (success) {
                processAIResponse(responseText);
            }
        }

        function appendChatMessage(sender, text) {
            if (!aiChatBuffer) return;
            const div = document.createElement('div');
            if (sender === 'system') {
                div.className = 'bg-slate-900 border border-slate-800 text-slate-400 p-2 rounded-lg';
                div.innerHTML = `<strong>System Alert:</strong> ${text}`;
            } else if (sender === 'user') {
                div.className = 'bg-cyan-950/20 border border-cyan-900/30 text-cyan-300 p-2 rounded-lg self-end';
                div.innerHTML = `<strong>You:</strong> ${text}`;
            } else if (sender === 'ai-err') {
                div.className = 'bg-rose-950/20 border border-rose-900/30 text-rose-300 p-2 rounded-lg';
                div.innerHTML = `<strong>Engine Error:</strong> ${text}`;
            } else {
                div.className = 'bg-purple-950/20 border border-purple-900/30 text-purple-300 p-2 rounded-lg';
                div.innerHTML = `<strong>AI Advisor:</strong> ${text}`;
            }
            aiChatBuffer.appendChild(div);
            aiChatBuffer.scrollTop = aiChatBuffer.scrollHeight;
        }

        function processAIResponse(text) {
            let cleanText = text;
            let actionBtnHtml = '';

            try {
                // Robust matching and brace alignment pre-processor
                const startIdx = text.indexOf('{"suggestedSequence"');
                if (startIdx !== -1) {
                    let braceCount = 0;
                    let endIdx = -1;
                    for (let i = startIdx; i < text.length; i++) {
                        if (text[i] === '{') braceCount++;
                        if (text[i] === '}') {
                            braceCount--;
                            if (braceCount === 0) {
                                endIdx = i;
                                break;
                            }
                        }
                    }
                    if (endIdx !== -1) {
                        let jsonText = text.substring(startIdx, endIdx + 1);
                        
                        // Clean formatting/hex tokens
                        jsonText = jsonText.replace(/,(\s*[\]}])/g, '$1');
                        jsonText = jsonText.replace(/\b0x([0-9A-Fa-f]+)\b/g, (m, hex) => parseInt(hex, 16));

                        const payload = JSON.parse(jsonText);
                        
                        cleanText = text.substring(0, startIdx) + text.substring(endIdx + 1);

                        const injectionId = "inject-" + Date.now();
                        actionBtnHtml = `
                            <div class="mt-2.5 pt-2 border-t border-purple-800/40">
                                <button id="${injectionId}" class="px-2.5 py-1 bg-purple-700 hover:bg-purple-600 font-bold rounded text-[10px] text-white flex items-center gap-1.5 transition-all">
                                    <i class="fa-solid fa-seedling"></i> ACTIVATE INJECTION: ${payload.speciesName}
                                </button>
                            </div>
                        `;

                        setTimeout(() => {
                            const btn = document.getElementById(injectionId);
                            if (btn) {
                                btn.addEventListener('click', () => {
                                    updateLabTab(payload.speciesType);
                                    const list = payload.speciesType === 'animal' ? listAnimalGenes : listPlantGenes;
                                    list.querySelectorAll('input[type="checkbox"]').forEach(cb => {
                                        const geneVal = parseInt(cb.getAttribute('data-gene'));
                                        cb.checked = payload.suggestedSequence.includes(geneVal);
                                    });
                                    
                                    rebuildLabBlueprint();
                                    isArmed = true;
                                    btnArmInjector.className = "w-full py-2 rounded-lg bg-emerald-600/30 border border-emerald-500 text-emerald-400 text-xs font-bold tracking-wider flex items-center justify-center gap-2 transition-all";
                                    btnArmInjector.innerHTML = `<i class="fa-solid fa-crosshairs animate-spin"></i> INJECTOR ARMED (TAP ON MAP)`;
                                    
                                    triggerToast(`DNA Charged: ${payload.speciesName}. Tap viewport to seed.`, 'info');
                                });
                            }
                        }, 100);
                    }
                }
            } catch (err) {
                console.error("Failed to parse suggested sequence from AI response:", err);
            }

            appendChatMessage('ai', cleanText + actionBtnHtml);
        }

        // Send chat messages
        if (aiSendBtn && aiInput) {
            aiSendBtn.addEventListener('click', () => {
                const val = aiInput.value.trim();
                if (val) {
                    appendChatMessage('user', val);
                    aiInput.value = '';
                    triggerAdvisorRequest(val);
                }
            });

            aiInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    aiSendBtn.click();
                }
            });
        }

        // Quick action buttons
        document.querySelectorAll('.ai-quick-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const promptType = btn.getAttribute('data-prompt');
                let prompt = '';
                if (promptType === 'soil-assessment') {
                    prompt = "Analyze the soil chemistry and moisture runoff. How is moisture runoff affecting the valley deltas?";
                } else if (promptType === 'genocide-check') {
                    prompt = "Assess immediate extinction risks. Are there viral pathogen epidemic breakouts running through host colonies?";
                } else if (promptType === 'suggest-balancer') {
                    prompt = "Examine current predator/prey balances and suggest an organism balancing genotype (provide suggestedSequence JSON block).";
                } else {
                    prompt = "Design a mutant chaotic virus variant designed to carry hijacked genetic sequence fragments (HGT) (provide suggestedSequence JSON block).";
                }
                appendChatMessage('user', btn.innerText.trim());
                triggerAdvisorRequest(prompt);
            });
        });
