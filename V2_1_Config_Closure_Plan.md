# v2.1 Config Externalization Closure Plan

Document Version: 1.0
Date: 2026-05-30
Purpose: Priority-ordered implementation plan to externalize hardcoded constants and close remaining Blueprint v2.1 compliance gaps.
Scope: This plan is implementation-specific to this repository and complements the engine-independent base blueprint.

## 1. Current Gap Summary

From the current implementation profile:

- Core geometry, bootstrap, mutation, and long-run climate keys are mostly externalized in config.
- Remaining gaps are concentrated in behavior tuning, zoochore/germination, senescence, pathogen/HGT, endosymbiosis, and reproducibility governance.
- Automated conformance tests and replay harness are not yet present.

## 2. Priority Plan

## Priority 0: Reproducibility Contract and Runtime Declaration

Goal:

- Resolve requirement gaps around reproducibility mode declaration and stricter replay assumptions.

Tasks:

1. Add reproducibility mode field to configuration.
- Add REPRODUCIBILITY_MODE with values strict or statistical.
- Add RNG_FIXED_DT for explicit fixed-step documentation.

2. Add runtime display/telemetry visibility for current reproducibility mode.
- Expose current mode in UI diagnostics/telemetry panel.

3. Add replay metadata snapshot output.
- Seed, mode, speed multiplier, and critical config hash logged at reset and optionally downloadable.

Primary files:

- assets/js/state.js
- assets/js/simulation-core-utils.js
- assets/js/simulation-core-engine.js
- assets/js/ui-dashboard.js

Exit criteria:

- Reproducibility mode is explicitly declared at runtime.
- Replay report can include mode and fixed-step metadata.

## Priority 1: Zoochore, Germination, and Senescence Key Externalization

Goal:

- Remove hardcoded ecology lifecycle constants and bind to config keys in blueprint parameter registry.

Tasks:

1. Move zoochore timing constants to config.
- ZOOCHORE_DORMANCY_MIN_TICKS
- ZOOCHORE_DORMANCY_MAX_TICKS
- ZOOCHORE_MAX_VIABILITY_TICKS

2. Move germination thresholds and biome probabilities to config.
- GERMINATION_MOISTURE_THRESHOLD
- GERMINATION_NUTRIENT_THRESHOLD
- GERMINATION_PROB_CLAY_SILT
- GERMINATION_PROB_SANDY_LOAM
- GERMINATION_PROB_ROCKY_SHALE

3. Move senescence constants to config.
- SENESCENCE_START_AGE_FRACTION
- SENESCENCE_EFFICIENCY_DECAY_PER_STEP
- SENESCENCE_RECYCLE_MASS_FRACTION

Primary files:

- assets/js/state.js
- assets/js/simulation-core-biomes.js
- assets/js/ui-controls.js

Exit criteria:

- No hardcoded numeric literals remain for the above lifecycle keys in simulation-core-biomes.js.
- UI controls or config editing path exists for new keys.

## Priority 2: Behavior and Satiety Key Externalization

Goal:

- Parameterize behavior smoothing and appetite/satiety gates currently encoded as inline constants.

Tasks:

1. Externalize smoothing and jitter parameters.
- BEHAVIOR_STEER_SMOOTHING
- BEHAVIOR_THRUST_SMOOTHING
- BEHAVIOR_BASE_JITTER_AMPLITUDE

2. Externalize appetite/satiety gating thresholds.
- SATIETY_LOW_THRESHOLD
- SATIETY_HIGH_THRESHOLD
- APPETITE_FEED_GATE_MIN
- APPETITE_COLLISION_FEED_CHANCE_AT_LOW_APPETITE

3. Externalize measurable acceptance thresholds used by verification harness.
- BEHAVIOR_NEUTRAL_TURN_RATE_CAP
- BEHAVIOR_SEEK_DISTANCE_GAIN_MIN
- BEHAVIOR_FLEE_DISTANCE_GAIN_MIN

Primary files:

- assets/js/state.js
- assets/js/simulation-core-organisms.js
- assets/js/ui-controls.js

Exit criteria:

- Behavior constants are sourced from config keys.
- Default values preserve existing behavior envelope within acceptable tolerance.

## Priority 3: Pathogen, HGT, and Endosymbiosis Key Externalization

Goal:

- Replace inline interaction probabilities with config-driven values for auditability and experiment control.

Tasks:

1. Externalize pathogen and HGT keys.
- PATHOGEN_CLOUD_SPAWN_CHANCE
- PATHOGEN_ENERGY_DRAIN_PER_TICK
- HGT_FRAGMENT_COPY_CHANCE
- HGT_INSERTION_CHANCE

2. Externalize endosymbiosis keys.
- ENDOSYMBIOSIS_BASE_CHANCE
- ENDOSYMBIOSIS_HOST_ENERGY_DRAIN

3. Replace direct literals in collision/death/replication flows.
- Infection chance branches.
- Viral swap chance branches.
- Symbiont capture and host drain branches.

Primary files:

- assets/js/state.js
- assets/js/simulation-core-organisms.js
- assets/js/ui-controls.js

Exit criteria:

- No hardcoded probabilities for these systems remain in organisms module except clearly documented fallback guards.

## Priority 4: Conformance Test Harness and Evidence Artifacts

Goal:

- Add baseline automated evidence for SHALL requirements and close profile gaps from partial/untested to verified.

Tasks:

1. Add lightweight automated checks for core math and lifecycle.
- Toroidal wrap and distance assertions.
- Dormancy and germination gating checks.
- Senescence progression checks.

2. Add replay harness for seeded scenarios.
- Scenario presets for baseline, high mutation, long-run drift.
- Metric outputs for trend comparison.

3. Create reproducibility and parameter audit reports.
- Report includes missing key scan and replay variance summary.

Suggested artifact paths:

- docs/reports/replay/
- docs/reports/config-audit/
- docs/reports/conformance/

Exit criteria:

- Conformance checklist can be filled with objective artifact references for all SHALL rows.

## 3. Patch Sequence (Recommended Order)

1. Add all missing keys to state.js first.
2. Refactor simulation-core-biomes.js to consume zoochore/germination/senescence keys.
3. Refactor simulation-core-organisms.js to consume behavior and interaction keys.
4. Wire UI controls for newly externalized keys in ui-controls.js.
5. Add replay mode declaration and diagnostics output.
6. Add evidence scripts/tests and populate conformance artifacts.
7. Update Implementation Profile and Conformance Checklist statuses.

## 4. Regression Safety Checklist

Before and after each priority block:

- Run seeded 5k-tick smoke scenario and capture population trend snapshot.
- Run seeded 50k-tick scenario and capture climate/fertility trend snapshot.
- Compare key observables:
  - mean fauna energy
  - mean flora count
  - extinction events
  - seed germination success rate
  - replay variance under same seed

If large deviation is observed:

- Verify defaults mirror prior inline constants.
- Roll back only the offending key changes and re-run comparison.

## 5. Ownership Suggestion

- P0 and P4: engine/runtime maintainer and QA lead.
- P1 and P3: ecology and interaction system maintainer.
- P2: behavior/ANN maintainer.

## 6. Completion Definition

This plan is complete when:

- All blueprint v2.1 registry keys are present and bound to runtime config or explicitly waived.
- Implementation profile rows with current PARTIAL or FAIL statuses are either PASS or have approved waivers.
- Conformance checklist contains concrete evidence references for each SHALL requirement.

End of document.
