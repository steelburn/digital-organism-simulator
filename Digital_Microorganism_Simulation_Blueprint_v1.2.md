# **Comprehensive Blueprint for a Digital Microorganism Evolution Simulation**

**Document Version:** 2.0  
**Target Audience:** AI Developers, Software Architects, Simulation Engineers  
**Objective:** To provide an exhaustive technical blueprint to initialize, process, and execute an artificial life (Alife) ecosystem capable of open-ended evolution, genetic mutation, environmental physics, and multi-trophic niche differentiation.

## ---

**1\. System Architecture Overview**

The simulation operates on a zero-waste thermodynamic engine structure across a wrapping, continuous universe (toroidal topology). The design bridges bioinformatics, software engine loops, and emergent multi-agent systems using a rigid structure modeled after the biological Central Dogma.

| Biological Layer | Digital Component | Functional Software Process   |
| :---- | :---- | :---- |
| Genotype | Bitstring / Hex Array / Neural Weight Array | Immutable array containing genetic markers, alleles, and artificial neural network (ANN) connection weights. |
| Ribosome / Translation | Parser Singleton \+ Epigenetic Regulator | Evaluates DNA array elements and modulates gene expressions conditionally based on environmental stress factors. |
| Phenotype | Agent Variables & Multi-Layer ANN "Brain" | Active morphology parameters and behavioral weights dictating real-time motor outputs. |

## **2\. Environment Modeling, Fluid Dynamics & Hydrology**

### **2.1 Toroidal (Wrapping) Mechanics**

The operational viewport handles seamless cross-border wrapping using modulo arithmetic. For an engine viewport bounds defined by W (width) and H (height), absolute physical coordinates must be clamped using a floating-point modulo function:

`Position.x = (Position.x % W + W) % W`  
`Position.y = (Position.y % H + H) % H`

### **2.2 Toroidal Distance Metrics**

Standard distance formulas fail when crossing seams. Sensors and movement trajectories must compute distance using the absolute shortest path wrapping around the boundary:

`dx = abs(A.x - B.x)`  
`if dx > W / 2: dx = W - dx`

`dy = abs(A.y - B.y)`  
`if dy > H / 2: dy = H - dy`

`ToroidalDistance = sqrt(dx*dx + dy*dy)`

### **2.3 Elevation & Fluid Dynamics (Atmospheric Wind Current)**

* **Topography Noise:** Elevation is generated using a seamless 2D Perlin or Simplex noise map wrapped over a torus to prevent boundary cliffs.  
* **Temperature Gradients:** Higher elevation increments the baseline metabolic cost (cold penalty) for animal agents and dampens standard plant generation rates.  
* **Atmospheric Wind Currents:** The map calculates a global 2D continuous vector field representing wind currents, driven by altitude differentials (thermal convection) and Perlin noise. The wind vector fields affect any free-floating physical entity on the map.
* **Multi-Scale Wind Oscillation (Long-Period):** Wind is modeled as the superposition of short-wave convection and long-wave climate oscillation terms (seasonal jetstream and monsoon shear analogs). This enables climate-regime shifts over very long horizons rather than stationary turbulence.

`// Fluid velocity contribution to entity kinematics`  
`WindVector = FetchWindVectorAt(Entity.Position)`  
`Entity.Velocity += WindVector * Entity.DriftCoefficient`

### **2.4 Soil Heterogeneity, Nutrients & Hydraulic Flow Matrix**

The map grid consists of a hidden multi-layered data array tracking soil types, moisture, and chemical nutrient saturation levels:

* **Clay / Silt (Low Valleys):** High nutrient retention, low diffusion rates. Perfect for dense primary producer jungles.  
* **Sandy / Loam (Plains):** Rapid nutrient diffusion. Facilitates fast grassland cycles and high dispersal loops.  
* **Rocky / Shale (Mountainous Slopes):** Gravity-induced nutrient erosion washes organic matter down slopes.  
* **Passive Soil Nutrient Regeneration:** To prevent absolute biological extinction if all plant/animal mass bottleneck, soil grids exhibit a slow, uniform base-level nutrient recharge over time via simulated weathering up to a baseline cap.

`// Executed per cell per background tick`  
`Cell.Nutrients = min(Cell.Nutrients + (BaseRegenRate * delta), BaselineCap)`

* **Hydraulic Nutrient Runoff (Water Cycle):** Each terrain cell maintains a dynamic Moisture value. Regional "Rain Events" deposit moisture preferentially on high-altitude peaks. Water calculates a downhill flow vector following the steepest descent gradient of the elevation map. As water streams downhill, it strips a percentage of localized Soil Nutrients from mountainous slopes and precipitates/deposits them wherever water pooling settles (valleys, basins, deltas). Mature plants with advanced structural or root expressions actively suppress nutrient erosion within their cells, functioning as soil stabilizers.
* **Ambient Rainfall + Storm Pulses:** In addition to peak-biased storm injections, each cell receives continuous precipitation input from a climate forcing term. This supports wet/dry epoch behavior at planetary timescales.
* **Lateral Hydrology Diffusion:** Runoff is not restricted to a single vertical/downhill lane. A lateral routing term permits side-channel flow and floodplain spreading, improving delta and basin formation dynamics.
* **Wind-Driven Soil Transport (Aeolian Component):** Dry, weakly stabilized soils can lose nutrient mass via wind shear. This process is coupled to drought and wind magnitude, producing realistic aridification pressure in exposed terrain.
* **Soil-Mass Memory:** Cells track soil depth and suspended sediment as explicit state variables. Erosion removes topsoil depth from source cells and deposits depth/sediment into receiver cells, introducing delayed and path-dependent fertility outcomes.
* **Dynamic Fertility Capacity:** Local maximum nutrient capacity (`MaxNutrients`) is not static; it relaxes toward a target determined by biome baseline, soil depth, and sediment accumulation. This permits true long-term fertility drift (degradation and recovery) rather than short oscillation around a fixed cap.
* **Slow Elevation Drift & Biome Reclassification:** Repeated erosion/deposition events induce tiny elevation adjustments per tick. Over long epochs this can shift biome identity (e.g., slope to basin transition), feeding back into hydrology and nutrient retention.

### **2.5 Procedural Terrain Generator & Seed Control**

Terrain generation uses a seeded toroidal procedural noise stack, combining low-frequency continental fields, mid-frequency regional variation, high-frequency detail, and ridge modulation.

* **Map Seed:** `MAP_SEED` controls procedural terrain reproducibility.
* **Deterministic Regeneration Rule:** Same `MAP_SEED` + same world dimensions (`W`, `H`) regenerate the same elevation/soil topology on reset.
* **Toroidal Continuity:** Noise sampling is periodic across both axes, preventing seam discontinuities at world wrap boundaries.

## **3\. Genetic Specifications, Neural Networks & Behavioral Dictation**

### **3.1 Artificial Neural Network (ANN) Behavioral Processing**

Microorganism locomotion, signaling, and feeding behaviors are governed by a multi-layer Artificial Neural Network. An agent's DNA contains a sequence of floating-point values representing the weights and biases of this network, allowing complex behaviors to emerge via genetic optimization.

* **Network Input Layers (Sensors):** \[Food Proximity, Threat Proximity, Signed Turn Cue to target heading (seek/flee), Local Nutrient Stress, Combined Neighboring Pheromone and Wind Alignment\]  
* **Network Output Layers (Actions):** \[Steering Intent, Forward Thrust Intent, Signal Pheromone Emission Intensity, Feeding Bite Action Command\]

### **3.1.1 Locomotion Motivation Requirement (Normative)**

* Microorganism movement logic **SHALL NOT** apply ANN motor outputs as a fixed world-axis X/Y velocity vector.
* Microorganism movement logic **SHALL** operate on heading-based kinematics: steering updates orientation, and thrust drives forward motion in the current heading.
* Locomotion **SHALL** include directional motivation derived from sensed entities:
    * seek nearest viable food source when threat pressure is low,
    * flee nearest threat when threat pressure is high.
* Movement updates **SHALL** preserve toroidal shortest-path direction calculations when deriving seek/flee heading cues.
* Implementations **SHALL** smooth steering/thrust over time to prevent persistent single-direction drift artifacts caused by static or saturated ANN outputs.
* Implementations **SHOULD** include low-amplitude stochastic locomotion jitter so agents remain motivation-led but avoid perfectly deterministic trajectories.
* Implementations **MAY** amplify locomotion jitter through specific genotype expressions (for example mutation-linked instability alleles) rather than global baseline noise.

### **3.2 Microorganism Core Genome (Hex Values & Epigenetic Alleles)**

* 0x01 — **Structural Optimization:** Escalates maximum health and size metrics, but proportionally spikes base metabolism requirements.  
* 0x02 — **Locomotion Index:** Augments velocity capabilities, spiking metabolic cost during physics updates.  
* 0x05 — **Speed Specialist:** Adds burst locomotion throughput with a moderate metabolism drag; can evolve independently of 0x02.  
* 0x06 — **Jitter Instability:** Increases stochastic steering/thrust perturbations (erratic movement) and adds a metabolism burden to discourage universal fixation.  
* 0x03 — **Metabolic Efficiency (Herbivory):** Boosts processing efficiency of plant tissue digestion.  
* 0x04 — **Sensor Range:** Scales the radii of vision colliders detecting neighborhood entities.  
* 0x07 — **Aggression / Predation Architecture:** Dictates the capability to damage other organisms and switches prey target priorities.  
* 0x08 — **Energy Saver:** Activates low-threat coasting behavior and lowers baseline metabolic drain, with a balancing reduction in peak speed output. Under elevated appetite plus positive food cue, this allele must partially suspend coasting and bias steering/thrust toward food pursuit to avoid starvation lock-in.  
* 0x0A — **Thermal Insulation / Fur:** Negates high-altitude cold metabolism penalties, but increases decay rates in hot lowlands.  
* 0x0E — **Phenotypic Plasticity / Epigenetic Regulator:** Configures the translation engine to modulate phenotypic traits based on environmental stress inputs. Under extreme starvation (Energy \< 25%), it suppresses non-essential traits like structural size (0x01) and hyper-expresses speed (0x02) or digestion efficiency (0x03) dynamically.  
* 0x1F — **Endosymbiotic Compatibility:** Governs host compliance. When a cannibal agent attacks an entity possessing this allele, there is a tiny probability that instead of standard mass digestion, the victim is integrated into an Internal\_Symbiont array inside the host, surviving to exchange metabolic output or detoxification variables for a baseline energy sub-drain.

### **3.3 Plant Core Genome (Hex Values)**

* 0x10 — **Photosynthetic Efficiency:** Determines resource absorption velocity from the soil grid relative to ambient sunlight levels.  
* 0x20 — **Toxin / Defense Index:** Triggers an immediate energy penalty or damage variable calculation within grazing predators.  
* 0x30 — **Dispersal Vector Range:** Modifies the baseline length applied to child seed/spore placement vectors upon replication.  
* 0x40 — **Succulence Storage:** Dictates maximum internal energy storage thresholds, mitigating nutrient exhaustion during droughts.  
* 0x60 — **Deciduous Shedding (Mulching):** Triggers intentional mass dropping when internal energy criteria are saturated, turning mass immediately into local soil nutrients.  
* 0x6A — **Spore Floating Coefficient:** Configures the plant's reproductive mechanics to utilize a *Dynamic Floating Spore System* instead of a ground seed. Spores drift with the Atmospheric Wind Current Vector.  
* 0x7F — **Zoochory Affinity:** Modifies reproductive behavior to utilize *Symbiotic Zoochory*. Seeds are covered in sticky membranes or high-nutrient payloads designed to stick to or be ingested by passing microorganisms, utilizing animal locomotion for long-range dispersal. Deposited zoochore seeds enter a mandatory dormancy phase before becoming environmentally sensitive. After dormancy expires, they check soil moisture and nutrient levels each tick and germinate only when both thresholds are met — or expire after a maximum viability window if conditions never become favorable.  
* 0x8B — **Stunted Germination (Defensive Seedlings):** Organisms with this mutation grow at a severely minimized rate during their initial lifecycle phase. Slow-growing seedlings require minimal soil energy and have a compressed physical signature, making them highly invisible to grazing sensors, functioning as an anti-predator dormancy mechanism.
* 0x9C — **Clonal Runner Growth (Vine Replication):** Enables vegetative propagation where a mature plant attempts local runner budding into nearby viable cells (adequate moisture and nutrients), creating a daughter plant without requiring airborne or zoochory dispersal.
* 0x9D — **Clonal Aggression (Burst Seedling Strategy):** Scales vegetative fecundity. Plants with higher expression attempt multiple runner placements per reproductive cycle, producing seedling-form offspring en masse to improve lineage survival under predation and disturbance.

## **4\. State Mechanics and Interaction Pipeline**

### **4.1 Continuous Dispersal Feedback Loop**

Plant reproduction is no longer a single step-function event. Plant propagation splits into distinct stages: Parent $\rightarrow$ Dispersal Vector (Seed, Spore, or Hooked Zoochore) $\rightarrow$ **Dormancy Phase** $\rightarrow$ Germination Phase $\rightarrow$ Mature Plant. This sets up a continuous feedback loop between physics, geography, and genetic expressions.

Zoochore seeds specifically undergo a passive dormancy window (randomized per seed, ~80–260 ticks) before becoming environmentally sensitive. After dormancy, the seed evaluates soil moisture and nutrient levels every tick. When both thresholds are met, germination is attempted with a biome-weighted probability (Clay/Silt ≈ 92%, Sandy/Loam ≈ 75%, Rocky/Shale ≈ 22%). Seeds that never encounter viable conditions expire after a maximum viability window (~1400 ticks) and are removed without germinating.

### **4.2 Plant Senescence & Biomass Recycling**

Plants experience true age-related decay independent of animal consumption. As plants approach their maximum age, they undergo senescence—gradually shedding efficiency, shifting visually, and leaching continuous biomass variables back into the soil matrix before absolute mortality.

`// Senescence loop inside plant update`  
`if Plant.Age > Plant.Lifespan * 0.75:`  
    `Plant.PhotosyntheticEfficiency *= 0.95 // Efficiency degradation`  
    `RecycledMass = Plant.Mass * 0.05`  
    `Plant.Mass -= RecycledMass`  
    `LocalSoilCell.Nutrients += RecycledMass // Gradual biomass recycling`

### **4.3 Parasitism, Pathogens, and Viral Gene Shuffling (Horizontal Gene Transfer)**

When an organism falls victim to starvation or a high local toxin burden, its carcass has a set probability of mutating into a localized Pathogen Cloud instead of standard debris mass. Pathogens clamp onto nearby active hosts, establishing a continuous energy drain vector. When reproducing inside a host, the virus copies a random fragment of the host's genetic sequence. Upon spreading to an unrelated host entity, it features a tiny probability of inserting the hijacked genetic fragment into the new host's genome, driving Horizontal Gene Transfer (HGT) epidemics across dense colonies.

### **4.4 System Energy Cycle (The Consolidated Thermodynamics Loop)**

 `[Passive Soil Regen] ──> [Soil Nutrient Cell] ──> [Germinating Seedlings (0x8B)]`  
          `▲                        │                              │`  
          `│         Hydraulic Drift│                   Grows To    ▼`  
          `│         & Runoff Vector▼                 [Living Mature Plant (Flora)]`  
          `│      [Delta/Basin Accumulation]                       │`  
          `│                        ▲                              ▼`  
          `│         Continuous     │                 Eaten/Killed By/Zoochory (0x7F)`  
          `│         Recycling      │                              │`  
          `└──── [Senescent Plant Mass (0.75+)]                    │`  
                                                                  `│`  
       `┌──────────────────────────────────────────────────────────┴─────────────────┐`  
       `▼                                                          ▼                 ▼`  
`[Passive Grazers] ──> Hunted by ──> [Cannibals]             [Aggressive Herbivores] [Spores/Seeds]`  
       `│                                   │                       │                │`  
  `Dies / Starves / Viral Infestation (HGT) │                       │                │Drifts via`  
       `│                                   │                       │                │Wind (0x6A)`  
       `▼                                   ▼                       ▼                ▼`  
  `[Debris / Carcass / Pathogen Cloud] ─────┴───────────────────────┘          [New Soil Cell]`  
       `│`  
   `Decomposes`  
       `│`  
       `▼`  
`[Soil Grid Nutrient Cell] (Enriched via erosion, local diffusion, and decaying matter)`

### **4.5 Interaction Rules Engine**

When multi-agent colliders intersect, the logic checks specific conditional matrices to dictate behavioral outputs:

`IF Colliding_Entity is Animal:`  
    `Calculate GeneticDistance = HammingDistance(Self.DNA, Colliding_Entity.DNA)`  
      
    `// Predation / Endosymbiosis Check`  
    `IF GeneticDistance > Aggression_Threshold and Self.Expression(0x07) > High:`  
        `IF Colliding_Entity.Expression(0x1F) > High and RandomFloat() < SymbiosisChance:`  
            `Self.IngestAsInternalSymbiont(Colliding_Entity)`  
        `ELSE:`  
            `ExecuteAttackCommand(Colliding_Entity)`  
            `IF Colliding_Entity.is_dead:`  
                `IF Self.is_carnivore:`  
                    `Self.Energy += Colliding_Entity.Mass`  
                `ELSE IF Self.is_aggressive_herbivore:`  
                    `InstantiateCarcassObject(Colliding_Entity.Position, Colliding_Entity.Mass)`  
                  
    `// Zoochory Transport Check`  
    `IF Colliding_Entity.HasZoochoreAttachment():`  
        `// Sticky seeds hitchhike on animal nodes`  
        `Colliding_Entity.AttachSeed(Self)`

`ELSE IF Colliding_Entity is Plant/Seedling:`  
    `IF Self.Expression(0x03) > Baseline:`  
        `IF Colliding_Entity.Expression(0x8B) > High and Self.SensorRange < StealthThreshold:`  
            `// Slow growing seedlings remain invisible to basic sensors`  
            `Return`   
        `IF Colliding_Entity.Toxicity < Self.ToxinResistance:`  
            `Self.Energy += Colliding_Entity.Consume()`  
            `// If plant utilized endozoochory, animal stores seed internally for deferred dispersal`  
            `IF Colliding_Entity.Expression(0x7F) == Endozoochory:`  
                `Self.DigestiveTrack.Add(Colliding_Entity.Seed)`  
        `ELSE:`  
            `Self.TakeDamage(Colliding_Entity.Toxicity)`

### **4.6 Configurable Initialization and Staged Biome Bootstrapping**

Initial conditions are runtime-configurable and are applied on simulation reset. This supports scenario design without code edits.

* **Configurable World Geometry:**
    * `W` (world width)
    * `H` (world height)
    * On reset, terrain and hydrology grids are rebuilt using current `W` and `H` so toroidal wrapping, distance metrics, and soil partitioning stay coherent.

* **Configurable Starter Plant Population:**
    * `STARTER_PLANT_DENSITY_PER_10K`
    * `MIN_STARTER_PLANTS`
    * Initial plant count is computed as:

`WorldArea = W * H`

`InitialPlantCount = max(MIN_STARTER_PLANTS, floor((WorldArea / 10000) * STARTER_PLANT_DENSITY_PER_10K))`

* **Configurable Starter Fauna Population:**
    * `STARTER_FAUNA_DENSITY_PER_10K`
    * `MIN_STARTER_FAUNA`
    * `STARTER_PREDATOR_RATIO`
    * Initial fauna count is computed as:

`InitialFaunaCount = max(MIN_STARTER_FAUNA, floor((WorldArea / 10000) * STARTER_FAUNA_DENSITY_PER_10K))`

* **Staged Fauna Introduction (Plant-Only Headstart):**
    * `PLANT_HEADSTART_TICKS` controls how long flora can establish before fauna enters the system.
    * If `PLANT_HEADSTART_TICKS == 0`, fauna is seeded at reset.
    * If `PLANT_HEADSTART_TICKS > 0`, only plants are seeded at reset; fauna is introduced when the counter reaches zero in the update loop.
    * This mode is intended to prevent immediate herbivore/predator collapse in sparse-start scenarios and to allow controlled succession experiments.

### **4.7 RNG Model (Determinism Scope and Exceptions)**

The simulation runtime uses a seed-derived pseudorandom stream for core stochastic processes (mutation decisions, spawn placement, weather events, dispersal outcomes, infection checks, and other lifecycle branching).

* **Global RNG Seed Source:** `MAP_SEED` is used to initialize the simulation RNG on reset.
* **Deterministic Scope:** Given identical seed and identical control parameters, the same reset state will replay equivalent stochastic branches for simulation systems that consume the seeded RNG stream.
* **Locomotion Jitter Source:** Fauna locomotion jitter is generated from the same seeded simulation RNG stream as other stochastic systems, preserving exploratory motion while keeping reset behavior reproducible under fixed seed and controls. Baseline jitter remains low; genotype-linked alleles can scale additional jitter expression.

### **4.8 Implementation Alignment Addendum (May 2026)**

The simulation implementation now includes the following runtime updates aligned to this blueprint:

* **Randomized Starter Flora Genomes:** Initial plants are seeded with randomized plant-valid DNA sequences (sampled from plant gene pools) instead of a fixed baseline strand, increasing early ecological diversity.
* **Species-Specific Mutation Rates:** Mutation probability is independently configurable for flora and fauna via separate runtime parameters (`FLORA_MUTATION_CHANCE`, `FAUNA_MUTATION_CHANCE`) rather than a single global mutation scalar.
* **Linked Mutation Controls:** Environment controls include an optional toggle to link flora/fauna mutation sliders, enabling synchronized tuning for experiments that require symmetric mutation pressure.
* **Unified Mutation Pipeline:** Flora and fauna reproduction paths both route through a shared DNA mutation routine to enforce consistent mutation semantics and reduce species-specific divergence bugs.
* **Hex DNA Parsing Consistency:** UI genotype parsing normalizes DNA values using hex-safe numeric conversion, preventing malformed `0,0,0,0` strands when genes are represented as `0x..` tokens.
* **Alternative Flora Replication Strategy:** Plants carrying `0x9C` can select a growth-based vegetative reproduction path (runner budding) before defaulting to spore/zoochory dispersal, introducing short-range clonal spread dynamics.
* **Clonal Spread Balancing:** Runner budding now applies local density penalties and moisture/nutrient-aware placement scoring, reducing runaway plant clumping while preserving biome-following vegetative expansion.
* **Clonal Aggression Mutation Axis:** A separate flora mutation (`0x9D`) now modulates how many clonal seedlings can be produced in a single reproductive burst, analogous to how `0x30` modulates spore dispersal intensity.
* **Zoochore Dormancy and Environment-Gated Germination:** `ZoochoreSeed` instances now carry a per-seed dormancy counter. They remain inert until dormancy expires, then poll soil moisture and nutrient levels each tick. Germination fires only when both conditions are satisfied, with biome-weighted probability. Seeds that never reach viable ground decompose after a maximum viability window.
* **Fauna Jitter Mutation Axis:** Fauna now supports mutation `0x06` (Jitter Instability), which selectively amplifies steering/thrust noise while adding metabolic drag. This shifts high jitter from a global baseline artifact into an evolvable lineage trait.
* **Fauna Energy Conservation Axis:** Fauna now supports mutation `0x08` (Energy Saver), which introduces low-threat coasting and metabolic savings while reducing top-end locomotion speed for tradeoff balancing.
* **Energy Saver Hunger Override:** When appetite pressure and food proximity are both high, `0x08` behavior down-regulates conservation mode and up-regulates target-follow steering/thrust so energy-saving lineages still execute motivated foraging runs.
* **Stochastic Fauna Replication Gate:** Fauna replication is no longer guaranteed immediately at the energy threshold. Reproduction now routes through a fertility gate that combines energy surplus, health ratio, and local fauna density pressure to compute a per-attempt success probability.
* **Fauna Replication Cooldown:** Each microorganism now tracks a replication cooldown timer. A cooldown is applied after both successful and failed reproduction attempts to prevent deterministic tick-by-tick retry loops.
* **Density-Aware Fecundity Suppression:** Local crowding within a configurable radius suppresses fertility chance and can extend post-success cooldown, yielding more realistic boom/bust population dynamics under resource pressure.
* **Fauna Reproduction Runtime Controls:** New configuration parameters are exposed in runtime config for tuning reproductive dynamics: `FAUNA_REPLICATION_ENERGY_THRESHOLD`, `FAUNA_REPLICATION_COST`, `FAUNA_REPLICATION_COOLDOWN_TICKS`, `FAUNA_REPLICATION_BASE_CHANCE`, `FAUNA_REPLICATION_ENERGY_WINDOW`, `FAUNA_REPLICATION_LOCAL_DENSITY_RADIUS`, `FAUNA_REPLICATION_LOCAL_DENSITY_SOFT_CAP`, and `FAUNA_REPLICATION_HEALTH_FLOOR`.
* **Long-Timescale Climate Forcing:** Engine runtime now computes and applies explicit climate forcing each tick (`precipitation`, `storminess`, `evaporation`, `droughtBias`) and passes this forcing into soil update logic.
* **Long-Horizon Rain Model:** Soil moisture is driven by both ambient precipitation and stochastic storm pulses, replacing purely local/noisy moisture injection.
* **Hydrology Upgrade:** Runoff now combines slope-weighted downhill routing and lateral diffusion, allowing channel migration and broader floodplain redistribution over time.
* **Geomorphology Upgrade:** Soil update now tracks `soilDepth` and `suspendedSediment`; erosion and deposition exchange these values between adjacent cells, coupling nutrient movement to physical soil mass transport.
* **Wind Erosion Pathway:** Wind magnitude and drought-state now contribute to nutrient export in low-stabilization cells, introducing aeolian transport pressure as a second erosion axis beside water.
* **Fertility Capacity Drift:** `MaxNutrients` is now dynamically adjusted toward depth/sediment/biome targets instead of remaining permanently fixed at initialization values.
* **Terrain Drift + Reclassification:** Elevation now supports gradual drift from cumulative deposition/erosion, with periodic biome reclassification to keep soil type and diffusion behavior aligned with evolved terrain.
* **Long-Term Geo-Climate Runtime Controls:** Additional runtime config controls now include `LONG_TERM_PROCESS_SPEED`, `LONG_TERM_WEATHER_CYCLE_TICKS`, `LONG_TERM_MONSOON_CYCLE_TICKS`, `HYDRO_RUNOFF_BASE`, `HYDRO_LATERAL_DIFFUSION`, `WIND_SOIL_TRANSPORT`, `SOIL_CAPACITY_ADJUST_RATE`, `LONG_TERM_ELEVATION_DRIFT`, and `SOIL_RECLASSIFY_INTERVAL`.

### **4.9 Long-Run Timescale Tuning Guide (May 2026)**

The following presets provide practical starting points for long-duration climate/terrain experiments. These are not hard limits; they are calibrated baselines for different observation windows.

| Experiment Horizon | Primary Objective | Suggested Runtime Settings |
| :---- | :---- | :---- |
| **10k ticks (Short Validation)** | Verify rain/runoff/erosion coupling is alive and numerically stable. | `LONG_TERM_PROCESS_SPEED = 1.25`  \|  `LONG_TERM_WEATHER_CYCLE_TICKS = 12000`  \|  `LONG_TERM_MONSOON_CYCLE_TICKS = 48000`  \|  `SOIL_RECLASSIFY_INTERVAL = 1800` |
| **100k ticks (Ecological Epoch)** | Observe basin enrichment, slope depletion, and first biome boundary drift. | `LONG_TERM_PROCESS_SPEED = 1.0`  \|  `LONG_TERM_WEATHER_CYCLE_TICKS = 48000`  \|  `LONG_TERM_MONSOON_CYCLE_TICKS = 190000`  \|  `SOIL_RECLASSIFY_INTERVAL = 6000` |
| **1M+ ticks (Geomorphic Drift)** | Capture true long-horizon terrain/fertility regime shifts and path dependence. | `LONG_TERM_PROCESS_SPEED = 0.6 to 0.85`  \|  `LONG_TERM_WEATHER_CYCLE_TICKS = 150000 to 300000`  \|  `LONG_TERM_MONSOON_CYCLE_TICKS = 700000 to 1400000`  \|  `SOIL_RECLASSIFY_INTERVAL = 20000 to 50000` |

Additional per-process tuning guidance:

* Increase `HYDRO_RUNOFF_BASE` to accelerate valley loading and upslope depletion; reduce it to flatten nutrient transport gradients.
* Increase `HYDRO_LATERAL_DIFFUSION` to broaden floodplains and side-channel spread; reduce it to enforce narrow, incision-style flow paths.
* Increase `WIND_SOIL_TRANSPORT` to intensify arid-wind stripping during drought phases.
* Increase `SOIL_CAPACITY_ADJUST_RATE` to shorten fertility-memory lag; reduce it to preserve long ecological hysteresis.
* Increase `LONG_TERM_ELEVATION_DRIFT` only for explicit geomorphology experiments; keep conservative for biologically focused runs.

### **4.10 Satiety-State Behavior Model (May 2026)**

Fauna behavior now includes an explicit appetite/satiety state model to prevent continuously food-maximal movement and collision feeding when internal energy is already high.

* **Appetite Scalar:** Appetite is derived continuously from internal energy (low appetite at high energy, high appetite at low energy).
* **State Bands:** Agents are classified as `satiated`, `stable`, or `foraging` for runtime behavior tuning and debugging.
* **Sensor Reweighting:** Food attraction channels are appetite-weighted so high-energy organisms de-prioritize distant food targets while still allowing opportunistic close-range responses.
* **Locomotion Damping:** Forward thrust motivation is damped at high satiety; steering retains low-amplitude exploratory jitter to produce visible meandering behavior.
* **Collision Appetite Gating:** Grazing, predatory engagement, and carcass feeding are probabilistically suppressed when appetite is low, while threat response remains active.
* **Visual State Cue:** Satiated microorganisms render a low-intensity green aura to expose satiety transitions directly on-map.

## **5\. Phylogeny and Lineage Verification System**

* **The Evolutionary Registry:** A global dictionary tracking nodes containing Unique\_ID, Parent\_ID, Generation\_Index, a string snapshot of the mutated DNA\_Sequence (including artificial neural network connection profiles), and an active integer counter for Living\_Population\_Size.  
* **Speciation Thresholds:** If a replication cycle yields a mutation where HammingDistance(Parent, Offspring) \> Spec\_Max\_Delta, instantiate a distinct lineage node branch.  
* **Pruning Process:** Sub-branches that exhibit a population metric of 0 within a defined generational time slice are compressed, preserving structural root nodes to display historical branches accurately without bloating active execution memory.

---

Document compiled to facilitate engine independent multi-agent procedural simulation development.