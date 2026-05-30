import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const statePath = path.join(root, 'assets/js/state.js');
const outConfigDir = path.join(root, 'docs/reports/config-audit');
const outReplayDir = path.join(root, 'docs/reports/replay');

const requiredKeys = [
  'W','H','STARTER_PLANT_DENSITY_PER_10K','MIN_STARTER_PLANTS','STARTER_FAUNA_DENSITY_PER_10K','MIN_STARTER_FAUNA','STARTER_PREDATOR_RATIO','PLANT_HEADSTART_TICKS','MAP_SEED',
  'FLORA_MUTATION_CHANCE','FAUNA_MUTATION_CHANCE','FAUNA_REPLICATION_ENERGY_THRESHOLD','FAUNA_REPLICATION_COST','FAUNA_REPLICATION_COOLDOWN_TICKS','FAUNA_REPLICATION_BASE_CHANCE','FAUNA_REPLICATION_ENERGY_WINDOW','FAUNA_REPLICATION_LOCAL_DENSITY_RADIUS','FAUNA_REPLICATION_LOCAL_DENSITY_SOFT_CAP','FAUNA_REPLICATION_HEALTH_FLOOR',
  'LONG_TERM_PROCESS_SPEED','LONG_TERM_WEATHER_CYCLE_TICKS','LONG_TERM_MONSOON_CYCLE_TICKS','HYDRO_RUNOFF_BASE','HYDRO_LATERAL_DIFFUSION','WIND_SOIL_TRANSPORT','SOIL_CAPACITY_ADJUST_RATE','LONG_TERM_ELEVATION_DRIFT','SOIL_RECLASSIFY_INTERVAL',
  'BEHAVIOR_STEER_SMOOTHING','BEHAVIOR_THRUST_SMOOTHING','BEHAVIOR_BASE_JITTER_AMPLITUDE','BEHAVIOR_NEUTRAL_TURN_RATE_CAP','BEHAVIOR_SEEK_DISTANCE_GAIN_MIN','BEHAVIOR_FLEE_DISTANCE_GAIN_MIN','SATIETY_LOW_THRESHOLD','SATIETY_HIGH_THRESHOLD','APPETITE_FEED_GATE_MIN','APPETITE_COLLISION_FEED_CHANCE_AT_LOW_APPETITE',
  'ZOOCHORE_DORMANCY_MIN_TICKS','ZOOCHORE_DORMANCY_MAX_TICKS','ZOOCHORE_MAX_VIABILITY_TICKS','GERMINATION_MOISTURE_THRESHOLD','GERMINATION_NUTRIENT_THRESHOLD','GERMINATION_PROB_CLAY_SILT','GERMINATION_PROB_SANDY_LOAM','GERMINATION_PROB_ROCKY_SHALE',
  'SENESCENCE_START_AGE_FRACTION','SENESCENCE_EFFICIENCY_DECAY_PER_STEP','SENESCENCE_RECYCLE_MASS_FRACTION',
  'PATHOGEN_CLOUD_SPAWN_CHANCE','PATHOGEN_ENERGY_DRAIN_PER_TICK','HGT_FRAGMENT_COPY_CHANCE','HGT_INSERTION_CHANCE','ENDOSYMBIOSIS_BASE_CHANCE','ENDOSYMBIOSIS_HOST_ENERGY_DRAIN',
  'REPRODUCIBILITY_MODE','RNG_FIXED_DT'
];

function parseConfigKeys(fileText) {
  const keys = new Set();
  const configStart = fileText.indexOf('export const CONFIG = {');
  if (configStart < 0) return keys;
  const slice = fileText.slice(configStart);
  const match = slice.match(/export const CONFIG\s*=\s*\{([\s\S]*?)\n\};/);
  if (!match) return keys;
  const body = match[1];
  const keyRegex = /^\s*([A-Z0-9_]+)\s*:/gm;
  let m;
  while ((m = keyRegex.exec(body)) !== null) keys.add(m[1]);
  return keys;
}

const stateText = fs.readFileSync(statePath, 'utf8');
const present = parseConfigKeys(stateText);
const missing = requiredKeys.filter(k => !present.has(k));

fs.mkdirSync(outConfigDir, { recursive: true });
fs.mkdirSync(outReplayDir, { recursive: true });

const generatedAtIso = new Date().toISOString();

const configAudit = {
  generatedAtIso,
  source: 'assets/js/state.js',
  requiredKeyCount: requiredKeys.length,
  presentRequiredKeyCount: requiredKeys.length - missing.length,
  missing,
  status: missing.length === 0 ? 'pass' : 'needs-work'
};

fs.writeFileSync(path.join(outConfigDir, 'latest.json'), JSON.stringify(configAudit, null, 2));

const replayTemplate = {
  generatedAtIso,
  note: 'Populate this report from seeded replay runs. This template is generated automatically.',
  reproducibilityDeclaration: {
    mode: 'statistical',
    fixedDt: 1,
    seedSource: 'CONFIG.MAP_SEED'
  },
  scenarios: [
    {
      name: 'baseline-ecology',
      seed: 1337,
      runCount: 0,
      controlsSnapshot: {},
      metrics: {},
      pass: null
    },
    {
      name: 'high-mutation',
      seed: 1337,
      runCount: 0,
      controlsSnapshot: {},
      metrics: {},
      pass: null
    },
    {
      name: 'long-run-terrain-drift',
      seed: 1337,
      runCount: 0,
      controlsSnapshot: {},
      metrics: {},
      pass: null
    }
  ]
};

fs.writeFileSync(path.join(outReplayDir, 'latest.json'), JSON.stringify(replayTemplate, null, 2));

console.log('Generated: docs/reports/config-audit/latest.json');
console.log('Generated: docs/reports/replay/latest.json');
console.log(`Required keys: ${requiredKeys.length}, missing: ${missing.length}`);
