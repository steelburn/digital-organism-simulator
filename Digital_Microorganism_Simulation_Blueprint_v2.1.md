# Digital Microorganism Evolution Simulation Blueprint

Document Version: 2.1
Date: 2026-05-30
Status: Normative Specification with Conceptual Explanations
Supersedes: Digital_Microorganism_Simulation_Blueprint_v1.2.md

Engine Independence Policy:

- Normative sections in this document SHALL remain implementation-agnostic.
- No engine, framework, language, or repository file-path dependency is required for conformance.
- Concrete code mappings MAY be maintained in separate implementation profile documents.

## 0. Purpose and Scope

This document defines a testable and implementation-aligned specification for a toroidal artificial life simulation with evolving flora and fauna. It is written to be:

- Normative: requirements are stated with SHALL/SHOULD/MAY and can be verified.
- Conceptual: each subsystem includes short rationale so intent remains clear.

Conformance:

- A runtime is conformant if all SHALL requirements pass verification criteria.
- SHOULD items are recommended quality targets.
- MAY items are optional extension points.

## 0.1 Reader Guide (Human Readability and Learner Assistance)

How to read this blueprint:

- Start each section with the Concept line to understand intent in plain language.
- Then read the Requirements list to see the normative contract.
- Use Verification and Acceptance Thresholds to understand how compliance is measured.
- Use the Parameter Registry as the single source of tuneable constants.

Learning workflow suggestion:

- First pass: read Concept and glossary only.
- Second pass: map each requirement ID to your implementation.
- Third pass: execute checklist-driven verification.

## 1. Architecture Model

Concept:

- Genotype encodes inheritable traits and ANN parameters.
- Translation maps genotype to phenotype at runtime.
- Phenotype executes behavior in physics and ecology loops.

Learner note:

- Think of genotype as the recipe, translation as the cooking step, and phenotype as the final dish that can act in the world.

Normative requirements:

- R-ARCH-001: Runtime SHALL maintain separate genotype state (DNA array) and phenotype state (derived traits).
- R-ARCH-002: Translation from genotype to phenotype SHALL be deterministic for a fixed DNA and fixed environment inputs in a single tick.
- R-ARCH-003: ANN parameters SHALL be sourced from DNA or DNA-derived structures.

Reference implementation responsibilities (non-normative):

- Organism lifecycle and interaction domain
- Translation and utility math domain
- Simulation orchestration and scheduling domain

## 2. Environment and Terrain

### 2.1 Toroidal topology

Concept: The world has wraparound boundaries; no hard edges.

Learner note:

- If an organism exits the right boundary, it reappears at the left boundary continuously, like movement on a wrapped game map.

Requirements:

- R-ENV-001: Position updates SHALL wrap using modulo-safe logic for negative values.
- R-ENV-002: Distance and heading cues SHALL use toroidal shortest-path deltas.

Reference formulas:

- x = (x % W + W) % W
- y = (y % H + H) % H
- dx = abs(ax - bx); if dx > W/2 then dx = W - dx
- dy = abs(ay - by); if dy > H/2 then dy = H - dy

Verification:

- Crossing either boundary SHALL produce continuous motion with no teleport discontinuity.
- Sensor target chosen across seam SHALL match shortest toroidal distance.

### 2.2 Terrain, moisture, nutrient transport

Concept: Fertility emerges from climate input, runoff, diffusion, erosion, deposition, and slow geomorphology drift.

Requirements:

- R-ENV-010: Soil cells SHALL track at minimum nutrients and moisture.
- R-ENV-011: Long-run mode SHALL track soilDepth and suspendedSediment.
- R-ENV-012: Nutrient capacity SHALL be dynamic (MaxNutrients drift toward a target), not fixed forever.
- R-ENV-013: Water transport SHALL include downhill runoff and lateral diffusion terms.
- R-ENV-014: Wind-driven nutrient export SHALL be supported in dry low-stability cells.
- R-ENV-015: Optional slow elevation drift and periodic biome reclassification SHALL be supported.

Implementation responsibilities (non-normative):

- Terrain and hydrology domain
- Climate forcing and update-loop integration domain
- Runtime configuration and parameter management domain

## 3. Behavior and ANN Locomotion

Concept: Locomotion is motivation-led. ANN output drives steering/thrust, not fixed world-axis velocity.

Learner note:

- Steering changes heading direction; thrust changes forward speed along that heading.
- This prevents unnatural straight-line drift that ignores food/threat context.

Requirements:

- R-BEH-001: Motor outputs SHALL be heading-relative (steer + thrust).
- R-BEH-002: Movement logic SHALL include food-seeking and threat-fleeing directional cues.
- R-BEH-003: Directional cues SHALL use toroidal shortest-path heading.
- R-BEH-004: Steering/thrust SHALL be temporally smoothed.
- R-BEH-005: Baseline stochastic jitter SHALL be low-amplitude and configurable.
- R-BEH-006: Genotype-linked jitter amplification MAY be applied (e.g., 0x06).

Acceptance thresholds (configurable):

- Mean heading change at neutral stimuli SHALL remain below BEHAVIOR_NEUTRAL_TURN_RATE_CAP.
- In threat-on tests, median distance-to-threat over N ticks SHALL increase by at least BEHAVIOR_FLEE_DISTANCE_GAIN_MIN.
- In food-on tests with low threat, median distance-to-food over N ticks SHALL decrease by at least BEHAVIOR_SEEK_DISTANCE_GAIN_MIN.

## 4. Genome and Trait Registry

Learner note:

- Hex IDs (for example 0x08) are trait keys, not direct behaviors by themselves.
- Behavior emerges from trait expression plus environmental context plus ANN outputs.

### 4.1 Fauna genes

- 0x01 Structural optimization
- 0x02 Locomotion index
- 0x03 Herbivory metabolic efficiency
- 0x04 Sensor range
- 0x05 Speed specialist
- 0x06 Jitter instability
- 0x07 Aggression/predation architecture
- 0x08 Energy saver
- 0x0A Thermal insulation
- 0x0E Phenotypic plasticity
- 0x1F Endosymbiotic compatibility

Requirements:

- R-GEN-001: Trait expression SHALL be bounded to configured min/max values.
- R-GEN-002: 0x08 SHALL include appetite override so starvation lock-in cannot persist under strong food cues.
- R-GEN-003: 0x06 SHALL increase jitter and metabolism burden together.

### 4.2 Flora genes

- 0x10 Photosynthetic efficiency
- 0x20 Toxin/defense
- 0x30 Dispersal range
- 0x40 Succulence storage
- 0x60 Deciduous shedding
- 0x6A Spore floating coefficient
- 0x7F Zoochory affinity
- 0x8B Stunted germination
- 0x9C Clonal runner growth
- 0x9D Clonal aggression burst

Requirements:

- R-GEN-010: Flora replication SHALL support airborne/spore and optional vegetative runner strategies.
- R-GEN-011: Zoochory seeds SHALL implement dormancy and environment-gated germination.
- R-GEN-012: Seedling stealth effects SHALL be bounded and not make 0x8B permanently uneatable.

## 5. Lifecycle, Interaction, and Ecology

Learner note:

- Ecology is a loop: resources -> organisms -> waste/recycling -> resources.
- Stability depends on feedback timing, not only on individual trait strength.

### 5.1 Seed lifecycle

Concept: Parent -> dispersal object -> dormancy -> germination -> maturity.

Requirements:

- R-ECO-001: Zoochory dormancy SHALL be sampled from configured min/max ticks.
- R-ECO-002: After dormancy, germination checks SHALL evaluate moisture and nutrients each tick.
- R-ECO-003: Germination probability SHALL be biome-weighted and fully parameterized.
- R-ECO-004: Seeds SHALL expire at configured viability limit if never viable.

### 5.2 Senescence and recycling

Requirements:

- R-ECO-010: Senescence onset, efficiency decay, and biomass recycle fraction SHALL be config-driven.
- R-ECO-011: Senescence math SHALL be timestep-safe (fixed-step loop or delta-normalized).

### 5.3 Interaction rules

Requirements:

- R-INT-001: Collision rule evaluation SHALL be explicit about actor and target.
- R-INT-002: Predation, herbivory, toxin response, and carcass handling SHALL be mutually exclusive per interaction resolution step unless explicitly designed as a chain.
- R-INT-003: Zoochory attachment SHALL define ownership direction unambiguously (seed attaches to carrier).

Implementation responsibilities (non-normative):

- Collision and interaction resolution domain
- World update coordination domain

## 6. Initialization, RNG, and Reproducibility

Learner note:

- Same seed does not guarantee identical outcomes unless update order, timestep, and RNG consumption order are also controlled.

### 6.1 World and starter populations

Requirements:

- R-INIT-001: World dimensions W/H SHALL be runtime-configurable.
- R-INIT-002: Starter flora/fauna counts SHALL be density-derived with minimum floors.
- R-INIT-003: Plant headstart mode SHALL delay fauna seeding by configured ticks.

### 6.2 Determinism model

Requirements:

- R-RNG-001: MAP_SEED SHALL initialize simulation RNG stream.
- R-RNG-002: Deterministic replay claims SHALL be scoped to fixed timestep, fixed iteration order, fixed RNG consumption order, and stable sort keys.
- R-RNG-003: If browser/hardware floating-point variance is possible, runtime SHALL declare reproducibility mode as either strict or statistical.

Minimum strict mode constraints:

- Deterministic entity iteration order by stable ID.
- No unordered map iteration for gameplay-critical decisions.
- Fixed update step dt = RNG_FIXED_DT.

## 7. Parameter Registry (All Constants Must Be Keyed)

This section replaces hardcoded numerics with config keys.

### 7.1 Core geometry and bootstrap

- W
- H
- STARTER_PLANT_DENSITY_PER_10K
- MIN_STARTER_PLANTS
- STARTER_FAUNA_DENSITY_PER_10K
- MIN_STARTER_FAUNA
- STARTER_PREDATOR_RATIO
- PLANT_HEADSTART_TICKS
- MAP_SEED

### 7.2 Mutation and replication

- FLORA_MUTATION_CHANCE
- FAUNA_MUTATION_CHANCE
- FAUNA_REPLICATION_ENERGY_THRESHOLD
- FAUNA_REPLICATION_COST
- FAUNA_REPLICATION_COOLDOWN_TICKS
- FAUNA_REPLICATION_BASE_CHANCE
- FAUNA_REPLICATION_ENERGY_WINDOW
- FAUNA_REPLICATION_LOCAL_DENSITY_RADIUS
- FAUNA_REPLICATION_LOCAL_DENSITY_SOFT_CAP
- FAUNA_REPLICATION_HEALTH_FLOOR

### 7.3 Long-run climate and geomorphology

- LONG_TERM_PROCESS_SPEED
- LONG_TERM_WEATHER_CYCLE_TICKS
- LONG_TERM_MONSOON_CYCLE_TICKS
- HYDRO_RUNOFF_BASE
- HYDRO_LATERAL_DIFFUSION
- WIND_SOIL_TRANSPORT
- SOIL_CAPACITY_ADJUST_RATE
- LONG_TERM_ELEVATION_DRIFT
- SOIL_RECLASSIFY_INTERVAL

### 7.4 Behavior and satiety

- BEHAVIOR_STEER_SMOOTHING
- BEHAVIOR_THRUST_SMOOTHING
- BEHAVIOR_BASE_JITTER_AMPLITUDE
- BEHAVIOR_NEUTRAL_TURN_RATE_CAP
- BEHAVIOR_SEEK_DISTANCE_GAIN_MIN
- BEHAVIOR_FLEE_DISTANCE_GAIN_MIN
- SATIETY_LOW_THRESHOLD
- SATIETY_HIGH_THRESHOLD
- APPETITE_FEED_GATE_MIN
- APPETITE_COLLISION_FEED_CHANCE_AT_LOW_APPETITE

### 7.5 Seed and germination

- ZOOCHORE_DORMANCY_MIN_TICKS
- ZOOCHORE_DORMANCY_MAX_TICKS
- ZOOCHORE_MAX_VIABILITY_TICKS
- GERMINATION_MOISTURE_THRESHOLD
- GERMINATION_NUTRIENT_THRESHOLD
- GERMINATION_PROB_CLAY_SILT
- GERMINATION_PROB_SANDY_LOAM
- GERMINATION_PROB_ROCKY_SHALE

### 7.6 Senescence

- SENESCENCE_START_AGE_FRACTION
- SENESCENCE_EFFICIENCY_DECAY_PER_STEP
- SENESCENCE_RECYCLE_MASS_FRACTION

### 7.7 Pathogens and HGT

- PATHOGEN_CLOUD_SPAWN_CHANCE
- PATHOGEN_ENERGY_DRAIN_PER_TICK
- HGT_FRAGMENT_COPY_CHANCE
- HGT_INSERTION_CHANCE

### 7.8 Endosymbiosis

- ENDOSYMBIOSIS_BASE_CHANCE
- ENDOSYMBIOSIS_HOST_ENERGY_DRAIN

## 8. Traceability Matrix (Requirements -> Responsibility Area -> Verification)

| Requirement ID | Summary | Responsibility Area (Implementation-Defined) | Verification |
| --- | --- | --- | --- |
| R-ENV-001, R-ENV-002 | Toroidal wrap and distance correctness | Coordinate math and movement domain | Unit tests for wrap and seam-distance vectors |
| R-ENV-010..015 | Soil, moisture, erosion, drift, reclassification | Terrain, hydrology, and climate domain | Scenario tests over 10k/100k ticks |
| R-BEH-001..006 | Heading-based ANN locomotion and jitter controls | Locomotion and behavior domain | Behavior tests with food/threat fixtures |
| R-GEN-001..012 | Gene expression bounds and trait effects | Genetics and phenotype translation domain | Gene-focused regression tests |
| R-ECO-001..004 | Seed dormancy and germination gate | Reproduction and seed lifecycle domain | Seed lifecycle tests with forced climates |
| R-ECO-010..011 | Senescence timestep-safe recycling | Aging and biomass recycling domain | Fixed-step vs variable-step consistency tests |
| R-INT-001..003 | Collision resolution and zoochory directionality | Interaction resolution domain | Interaction table tests by actor/target role |
| R-INIT-001..003 | Startup and staged fauna introduction | Bootstrap and runtime initialization domain | Reset/bootstrap tests |
| R-RNG-001..003 | Seeded RNG and replay constraints | Randomness and scheduling domain | Deterministic replay harness |

Implementation profile requirement:

- Each engine-specific implementation SHALL maintain a separate profile document mapping requirement IDs to concrete source artifacts and tests.
- This base v2.1 document SHALL remain free of engine-specific file paths.

## 9. Required Verification Artifacts for v2.1 Adoption

Before declaring full v2.1 compliance, produce these artifacts:

- A requirement checklist mapping every SHALL to pass/fail evidence.
- A deterministic replay report (strict mode and statistical mode, if both supported).
- A parameter audit proving all numeric constants are externally keyed.
- A regression report for seed lifecycle, senescence, and interaction matrix behavior.

## 10. Learner Glossary

- Genotype: Inheritable encoded data (DNA array) used to derive traits.
- Phenotype: Runtime trait expression and behavior produced from genotype.
- Toroidal topology: Wrapped world geometry where opposite boundaries connect.
- Heading-based locomotion: Movement defined by orientation plus forward thrust.
- Deterministic replay: Re-running with same controls and obtaining equivalent trajectories/results under declared constraints.
- Germination gate: Environmental checks a seed must pass before becoming a plant.
- Senescence: Age-related functional decline and biomass recycling process.
- HGT (horizontal gene transfer): Genetic material movement between non-parent lineages.
- Responsibility area: Engine-defined implementation domain used for traceability without engine lock-in.

## 11. Migration Notes from v1.2

- Version alignment fixed: this file is authoritative v2.1.
- Ambiguous pseudocode in collision handling replaced by explicit actor/target requirements.
- Hardcoded ecology numerics converted into mandatory config keys.
- Determinism language tightened with concrete scope and prerequisites.
- Traceability section now uses engine-independent responsibility areas; concrete file mappings move to implementation profiles.

End of document.
