import { CONFIG } from './state.js';
import { Carcass, GlobalRegistry, FloatIndicator, OrganismBrain, RibosomeParser, getDnaColor, getHammingDistance, getToroidalDistance, getToroidalOffset, mutateDnaSequence, randomFloat, wrapCoordinate, wrapPosition } from './simulation-core-utils.js';
import { PathogenCloud, Plant, Spore, ZoochoreSeed } from './simulation-core-biomes.js';

export class Microorganism {
    constructor(x, y, dna, parentLineageId = null, brainWeights = null) {
        this.x = x;
        this.y = y;
        this.dna = [...dna];
        this.brain = new OrganismBrain(brainWeights);
        this.lineageId = GlobalRegistry.registerEntity(parentLineageId, this.dna, this.brain.weights);

        const traits = RibosomeParser.translateMicroorganism(this.dna);
        this.maxHealth = traits.health;
        this.health = traits.health;
        this.baseMetabolism = traits.baseMetabolism;
        this.speed = traits.speed;
        this.herbivoryEfficiency = traits.herbivoryEfficiency;
        this.sensorRange = traits.sensorRange;
        this.aggression = traits.aggression;
        this.insulation = traits.insulation;
        this.jitterInstability = traits.jitterInstability;
        this.energyConservation = traits.energyConservation;

        this.energy = 60;
        this.mass = 25 + this.maxHealth * 0.08;
        this.isDead = false;
        this.color = getDnaColor(this.dna, false);
        this.angle = randomFloat() * Math.PI * 2;
        this.wigglePhase = randomFloat() * 100;

        this.carriedSpores = [];
        this.internalSymbionts = [];
        this.infected = false;
        this.hijackedGenePool = null;

        this.latestBrainOutput = [0, 0, 0, 0];
        this.pheromoneSignal = 0;
        this.turnVelocity = 0;
        this.forwardMomentum = 0;
        this.behaviorState = 'foraging';
        this.replicationCooldownTicks = Math.floor(CONFIG.FAUNA_REPLICATION_COOLDOWN_TICKS * (0.35 + randomFloat() * 0.45));
    }

    getHasInsulation() {
        return this.insulation > 0 || this.internalSymbionts.some(sym => sym.dna.includes(0x0A));
    }

    getHerbivoryEfficiency() {
        let eff = this.herbivoryEfficiency;
        this.internalSymbionts.forEach(sym => {
            if (sym.dna.includes(0x03)) eff += 0.3;
        });
        return eff;
    }

    update(soilGrid, environmentEntities, microorganismList, sporeList, indicators, globalWind, spatialHash = null) {
        const cell = soilGrid.getCellAt(this.x, this.y);
        if (!cell) return;

        const satietySpan = Math.max(1, CONFIG.SATIETY_HIGH_THRESHOLD - CONFIG.SATIETY_LOW_THRESHOLD);
        const appetiteDrive = Math.max(0, Math.min(1, (CONFIG.SATIETY_HIGH_THRESHOLD - this.energy) / CONFIG.SATIETY_HIGH_THRESHOLD));
        const satiatedLevel = Math.max(0, Math.min(1, (this.energy - CONFIG.SATIETY_LOW_THRESHOLD) / satietySpan));
        this.behaviorState = appetiteDrive < 0.2 ? 'satiated' : appetiteDrive < 0.5 ? 'stable' : 'foraging';

        let activeSpeed = this.speed;
        let activeScaleReduction = 1.0;

        if (this.dna.includes(0x0E) && this.energy < 25) {
            activeScaleReduction = 0.55;
            activeSpeed = this.speed * 1.5;
        }

        const uphillFriction = cell.type === 'Rocky/Shale' ? CONFIG.FRICTION_MODIFIER : 0.0;
        const actualVelocity = Math.max(0.3, activeSpeed - uphillFriction);

        // Use spatial hash for sensor scan when available — O(N) vs O(N²) fallback.
        const nearbyForSensors = spatialHash
            ? spatialHash.queryRadius(this.x, this.y, this.sensorRange)
            : environmentEntities;
        const sensors = this.gatherBrainSensors(nearbyForSensors, cell, globalWind, appetiteDrive);
        const brainOutputs = this.brain.forward(sensors);
        this.latestBrainOutput = brainOutputs;
        this.pheromoneSignal = Math.max(0, brainOutputs[2]);

        const hungerDrive = appetiteDrive;
        const panicDrive = sensors[1];
        const foodCue = sensors[0];
        const hungerPressure = Math.max(0, Math.min(1, (hungerDrive - 0.45) / 0.55));
        const saverFocusBias = this.energyConservation * hungerPressure * foodCue;
        const cueStrength = Math.max(sensors[0], sensors[1]);
        const exploratorySteer = brainOutputs[0] * (0.2 + (1 - cueStrength) * 0.18) * (1 - Math.min(0.7, saverFocusBias * 0.8));
        const steeringIntent = exploratorySteer + sensors[2] * (0.9 + hungerDrive * 0.35 + panicDrive * 0.2 + saverFocusBias * 0.35);
        const turnRetention = cueStrength > 0.15 ? 0.66 : 0.52;
        this.turnVelocity = this.turnVelocity * turnRetention + steeringIntent * CONFIG.BEHAVIOR_STEER_SMOOTHING;
        this.turnVelocity = Math.max(-0.35, Math.min(0.35, this.turnVelocity));
        this.angle += this.turnVelocity;

        const rawThrust = Math.max(0, (brainOutputs[1] + 1) * 0.5);
        const satiationDamp = 1 - satiatedLevel * 0.55;
        const motivatedThrust = Math.max(rawThrust, hungerDrive * 0.55 + panicDrive * 0.75) * satiationDamp;
        const safeMode = Math.max(0, Math.min(1, (1 - panicDrive) * (1 - hungerDrive)));
        const conservationBias = this.energyConservation * safeMode * (1 - hungerPressure * 0.85);
        const conservationThrottle = 1 - conservationBias * (0.35 + satiatedLevel * 0.45);
        const saverPursuitBoost = saverFocusBias * 0.32;
        const thrustAfterConservation = Math.min(1, motivatedThrust * conservationThrottle + saverPursuitBoost);

        // Keep motion mostly intention-driven. Baseline jitter stays subtle while jitter gene expression amplifies noise.
        const uncertainty = 1 - Math.max(sensors[0], sensors[1]);
        const baseJitterScale = Math.max(0, CONFIG.BEHAVIOR_BASE_JITTER_AMPLITUDE);
        const baseTurnJitter = (randomFloat() * 2 - 1) * (0.005 + uncertainty * 0.016 + hungerDrive * 0.012 + satiatedLevel * 0.01) * baseJitterScale;
        const baseThrustJitter = (randomFloat() * 2 - 1) * (0.004 + uncertainty * 0.014) * baseJitterScale;
        const mutationTurnJitter = (randomFloat() * 2 - 1) * (0.006 + uncertainty * 0.028 + hungerDrive * 0.018) * this.jitterInstability;
        const mutationThrustJitter = (randomFloat() * 2 - 1) * (0.005 + uncertainty * 0.02) * this.jitterInstability;
        const randomTurnJitter = baseTurnJitter + mutationTurnJitter;
        const randomThrustJitter = baseThrustJitter + mutationThrustJitter;

        this.turnVelocity += randomTurnJitter;
        if (cueStrength < 0.12) {
            this.turnVelocity *= 0.84;
        }
        this.turnVelocity = Math.max(-0.35, Math.min(0.35, this.turnVelocity));

        const jitteredThrust = Math.max(0, Math.min(1, thrustAfterConservation + randomThrustJitter - satiatedLevel * 0.25));
        const thrustSmoothing = Math.max(0.01, Math.min(0.99, CONFIG.BEHAVIOR_THRUST_SMOOTHING));
        this.forwardMomentum = this.forwardMomentum * (1 - thrustSmoothing) + jitteredThrust * actualVelocity * thrustSmoothing;
        const lateralSlip = this.turnVelocity * actualVelocity * 0.35;

        const moveX = Math.cos(this.angle) * this.forwardMomentum - Math.sin(this.angle) * lateralSlip + globalWind.x * 0.18;
        const moveY = Math.sin(this.angle) * this.forwardMomentum + Math.cos(this.angle) * lateralSlip + globalWind.y * 0.18;

        this.x += moveX;
        this.y += moveY;

        this.x = wrapCoordinate(this.x, CONFIG.W);
        this.y = wrapCoordinate(this.y, CONFIG.H);

        const altitudePenalty = cell.elevation > 0.65 && !this.getHasInsulation() ? cell.elevation * 0.15 : 0;
        const lowlandHeatPenalty = cell.elevation < 0.3 && this.getHasInsulation() ? 0.12 : 0;

        let metabolicUsage = this.baseMetabolism + altitudePenalty + lowlandHeatPenalty + Math.sqrt(moveX * moveX + moveY * moveY) * 0.04;
        const conservationCoast = this.energyConservation * safeMode * (1 - hungerPressure * 0.85);
        metabolicUsage *= 1 - Math.min(0.35, conservationCoast * (0.12 + satiatedLevel * 0.16));

        if (this.infected) {
            metabolicUsage += CONFIG.PATHOGEN_ENERGY_DRAIN_PER_TICK;
        }

        if (this.internalSymbionts.length > 0) {
            metabolicUsage += this.internalSymbionts.length * CONFIG.ENDOSYMBIOSIS_HOST_ENERGY_DRAIN;
        }

        this.energy -= metabolicUsage;

        if (this.replicationCooldownTicks > 0) {
            this.replicationCooldownTicks--;
        }

        if (this.carriedSpores) {
            for (let i = this.carriedSpores.length - 1; i >= 0; i--) {
                const seed = this.carriedSpores[i];
                seed.ticksToCarry--;

                if (seed.ticksToCarry <= 0 || randomFloat() < 0.003) {
                    const dropAngle = randomFloat() * Math.PI * 2;
                    sporeList.push(new Spore(this.x, this.y, dropAngle, 1.2, 45, seed.dna, seed.lineageId));
                    indicators.push(new FloatIndicator(this.x, this.y - 12, 'SEED DETACHED', '#38bdf8'));
                    this.carriedSpores.splice(i, 1);
                }
            }
        }

        if (this.energy <= 0) {
            this.health -= 0.6;
            if (this.health <= 0) this.die(environmentEntities, indicators);
        }

        if (this.energy >= CONFIG.FAUNA_REPLICATION_ENERGY_THRESHOLD && this.replicationCooldownTicks <= 0) {
            this.tryReplication(microorganismList, indicators, spatialHash);
        }

        void activeScaleReduction;
    }

    tryReplication(list, indicators, spatialHash = null) {
        const threshold = CONFIG.FAUNA_REPLICATION_ENERGY_THRESHOLD;
        const healthFloor = Math.max(0.01, Math.min(0.99, CONFIG.FAUNA_REPLICATION_HEALTH_FLOOR));
        const healthRatio = this.maxHealth > 0 ? Math.max(0, Math.min(1, this.health / this.maxHealth)) : 0;

        if (healthRatio < healthFloor) {
            return;
        }

        const nearbyCount = this.countNearbyFauna(list, spatialHash, CONFIG.FAUNA_REPLICATION_LOCAL_DENSITY_RADIUS);
        const densityPressure = Math.min(1, nearbyCount / Math.max(1, CONFIG.FAUNA_REPLICATION_LOCAL_DENSITY_SOFT_CAP));

        const energySurplus = Math.max(0, this.energy - threshold);
        const energyFactor = Math.min(1, energySurplus / Math.max(1, CONFIG.FAUNA_REPLICATION_ENERGY_WINDOW));
        const healthFactor = Math.max(0, Math.min(1, (healthRatio - healthFloor) / (1 - healthFloor)));

        const fertilityChance = Math.max(
            0.03,
            Math.min(
                0.95,
                CONFIG.FAUNA_REPLICATION_BASE_CHANCE
                    + energyFactor * 0.56
                    + healthFactor * 0.24
                    - densityPressure * 0.58
            )
        );

        if (randomFloat() >= fertilityChance) {
            // Failed attempts still consume time and prevent deterministic every-tick retries.
            this.replicationCooldownTicks = Math.floor(CONFIG.FAUNA_REPLICATION_COOLDOWN_TICKS * (0.4 + randomFloat() * 0.25));
            return;
        }

        this.replicate(list, indicators);
        this.replicationCooldownTicks = Math.floor(CONFIG.FAUNA_REPLICATION_COOLDOWN_TICKS * (0.85 + densityPressure * 0.5 + randomFloat() * 0.2));
    }

    countNearbyFauna(list, spatialHash, radius) {
        let count = 0;
        if (spatialHash) {
            const nearby = spatialHash.queryRadius(this.x, this.y, radius);
            for (let i = 0; i < nearby.length; i++) {
                const entity = nearby[i];
                if (entity === this || entity.isDead || !(entity instanceof Microorganism)) continue;
                if (getToroidalDistance(this, entity) <= radius) count++;
            }
            return count;
        }

        for (let i = 0; i < list.length; i++) {
            const entity = list[i];
            if (entity === this || entity.isDead) continue;
            if (getToroidalDistance(this, entity) <= radius) count++;
        }
        return count;
    }

    gatherBrainSensors(entities, cell, globalWind, appetiteDrive = 1) {
        let nearestFoodDist = 1.0;
        let nearestThreatDist = 1.0;
        let neighboringPheromone = 0;
        let nearestFoodEntity = null;
        let nearestThreatEntity = null;

        entities.forEach(entity => {
            if (entity === this || entity.isDead) return;

            const dist = getToroidalDistance(this, entity) / Math.max(1, this.sensorRange);
            if (entity instanceof Plant && entity.isSeedling && this.sensorRange < 80 && dist > 0.28 && appetiteDrive < 0.75) {
                return;
            }

            if (dist <= 1.0) {
                if (this.aggression > 25) {
                    if (entity instanceof Microorganism) {
                        if (dist < nearestFoodDist && (appetiteDrive > 0.2 || dist < 0.18)) {
                            nearestFoodDist = dist;
                            nearestFoodEntity = entity;
                        }
                    }
                } else {
                    if (entity instanceof Plant) {
                        if (dist < nearestFoodDist && (appetiteDrive > 0.18 || dist < 0.16)) {
                            nearestFoodDist = dist;
                            nearestFoodEntity = entity;
                        }
                    }
                    if (entity instanceof Microorganism && entity.aggression > 25) {
                        if (dist < nearestThreatDist) {
                            nearestThreatDist = dist;
                            nearestThreatEntity = entity;
                        }
                    }
                }

                if (entity instanceof Microorganism) {
                    neighboringPheromone += (entity.pheromoneSignal || 0) * (1.0 - dist);
                }
            }
        });

        let targetTurn = 0;
        if (nearestThreatEntity && nearestThreatDist < 0.55) {
            const { dx, dy } = getToroidalOffset(this, nearestThreatEntity);
            const threatAngle = Math.atan2(dy, dx);
            const fleeAngle = threatAngle + Math.PI;
            const turnDelta = Math.atan2(Math.sin(fleeAngle - this.angle), Math.cos(fleeAngle - this.angle));
            targetTurn = turnDelta / Math.PI;
        } else if (nearestFoodEntity) {
            const { dx, dy } = getToroidalOffset(this, nearestFoodEntity);
            const foodAngle = Math.atan2(dy, dx);
            const turnDelta = Math.atan2(Math.sin(foodAngle - this.angle), Math.cos(foodAngle - this.angle));
            targetTurn = turnDelta / Math.PI;
        }

        const windHeading = Math.atan2(globalWind.y, globalWind.x);
        const windAlignment = (Math.cos(windHeading - this.angle) + 1) * 0.5;

        return [
            (1 - nearestFoodDist) * (0.15 + appetiteDrive * 0.85),
            1 - nearestThreatDist,
            Math.max(-1, Math.min(1, targetTurn)),
            1 - cell.nutrients / cell.maxNutrients,
            Math.min(1.0, neighboringPheromone * 0.75 + windAlignment * 0.25)
        ];
    }

    handleCollision(other, entities, sporeList, indicators) {
        const appetiteDrive = Math.max(0, Math.min(1, (CONFIG.SATIETY_HIGH_THRESHOLD - this.energy) / CONFIG.SATIETY_HIGH_THRESHOLD));

        if (other instanceof Microorganism) {
            const geneticDistance = getHammingDistance(this.dna, other.dna);

            if (geneticDistance > 1 && this.aggression > 30 && (appetiteDrive > 0.2 || (this.aggression > 45 && randomFloat() < 0.08))) {
                if (other.dna.includes(0x1F) && this.internalSymbionts.length < 2 && randomFloat() < CONFIG.ENDOSYMBIOSIS_BASE_CHANCE) {
                    this.internalSymbionts.push({
                        dna: [...other.dna],
                        lineageId: other.lineageId
                    });
                    other.isDead = true;
                    indicators.push(new FloatIndicator(this.x, this.y, 'ENDOSYMBIONT SECURED', '#2dd4bf'));
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
        } else if (other instanceof Plant) {
            if (other.isSeedling && this.sensorRange < 80 && appetiteDrive < 0.55 && randomFloat() < 0.65) return;

            if (this.aggression <= 30) {
                if (appetiteDrive < CONFIG.APPETITE_FEED_GATE_MIN && randomFloat() < CONFIG.APPETITE_COLLISION_FEED_CHANCE_AT_LOW_APPETITE) {
                    return;
                }

                if (other.toxicity > this.insulation * 15) {
                    this.health -= other.toxicity * 0.6;
                    indicators.push(new FloatIndicator(this.x, this.y, 'TOXIN BURST', '#ef4444'));
                    other.takeDamage(15);
                    if (this.health <= 0) {
                        this.health = 0;
                        this.die(entities, indicators);
                    }
                } else {
                    const yieldValue = other.consume();
                    this.energy += yieldValue * this.getHerbivoryEfficiency();
                    indicators.push(new FloatIndicator(this.x, this.y - 10, `+${Math.floor(yieldValue)} GRAZE`, '#10b981'));
                }
            }
        } else if (other instanceof ZoochoreSeed) {
            if (this.carriedSpores.length < 3) {
                this.carriedSpores.push({
                    dna: [...other.dna],
                    lineageId: other.lineageId,
                    ticksToCarry: 160 + randomFloat() * 200
                });
                other.isDead = true;
                indicators.push(new FloatIndicator(this.x, this.y, 'SEED ATTACHED', '#38bdf8'));
            }
        } else if (other instanceof Carcass && this.aggression > 10) {
            if (appetiteDrive < CONFIG.APPETITE_FEED_GATE_MIN && randomFloat() < CONFIG.APPETITE_COLLISION_FEED_CHANCE_AT_LOW_APPETITE) {
                return;
            }
            this.energy += other.mass;
            other.isDead = true;
            indicators.push(new FloatIndicator(this.x, this.y - 10, 'FEED CARCASS', '#eab308'));
        } else if (other instanceof PathogenCloud) {
            if (!this.infected && randomFloat() < CONFIG.PATHOGEN_INFECTION_CHANCE) {
                this.infected = true;
                this.hijackedGenePool = [...other.geneticPayload];
                other.isDead = true;
                indicators.push(new FloatIndicator(this.x, this.y, 'INFECTED', '#a855f7'));
            }
        }
    }

    replicate(list, indicators) {
        this.energy -= CONFIG.FAUNA_REPLICATION_COST;
        const faunaGenePool = [0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x0A, 0x0E, 0x1F];
        const mutationResult = mutateDnaSequence(this.dna, faunaGenePool, CONFIG.FAUNA_MUTATION_CHANCE);
        const childDna = mutationResult.childDna;

        if (this.infected && this.hijackedGenePool && randomFloat() < CONFIG.HGT_FRAGMENT_COPY_CHANCE) {
            const swapGene = this.hijackedGenePool[Math.floor(randomFloat() * this.hijackedGenePool.length)];
            if (!childDna.includes(swapGene)) {
                if (childDna.length === 0) {
                    childDna.push(swapGene);
                } else {
                    childDna[Math.floor(randomFloat() * childDna.length)] = swapGene;
                }
                indicators.push(new FloatIndicator(this.x, this.y - 10, 'VIRAL HGT SWAP', '#a855f7'));
            }
        }

        if (mutationResult.mutated) {
            indicators.push(new FloatIndicator(this.x, this.y - 10, 'SPECIATION MUTATION', '#a855f7'));
        }

        const childBrainWeights = this.brain.mutate().weights;
        const childPos = wrapPosition(this.x + (randomFloat() * 20 - 10), this.y + (randomFloat() * 20 - 10));

        const child = new Microorganism(childPos.x, childPos.y, childDna, this.lineageId, childBrainWeights);
        if (this.infected && randomFloat() < CONFIG.HGT_INSERTION_CHANCE) {
            child.infected = true;
            child.hijackedGenePool = [...this.hijackedGenePool];
        }
        list.push(child);
    }

    die(entities, indicators) {
        this.isDead = true;
        GlobalRegistry.decrementPopulation(this.lineageId);

        if ((this.infected || this.dna.includes(0x20)) && randomFloat() < CONFIG.PATHOGEN_CLOUD_SPAWN_CHANCE) {
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
            activeScaleReduction = 0.55;
        }

        if (isSelected) {
            ctx.strokeStyle = 'rgba(6, 182, 212, 0.2)';
            ctx.fillStyle = 'rgba(6, 182, 212, 0.03)';
            ctx.beginPath();
            ctx.arc(this.x, this.y, Math.max(1, this.sensorRange), 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();

            ctx.strokeStyle = '#06b6d4';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.arc(this.x, this.y, Math.max(1, 16 + Math.sin(this.wigglePhase) * 2), 0, Math.PI * 2);
            ctx.stroke();
        }

        if (this.latestBrainOutput[2] > 0.2) {
            ctx.strokeStyle = 'rgba(6, 182, 212, 0.25)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.arc(this.x, this.y, Math.max(1, (10 + (this.wigglePhase % 15)) * activeScaleReduction), 0, Math.PI * 2);
            ctx.stroke();
        }

        const satietySpan = Math.max(1, CONFIG.SATIETY_HIGH_THRESHOLD - CONFIG.SATIETY_LOW_THRESHOLD);
        const satiatedLevel = Math.max(0, Math.min(1, (this.energy - CONFIG.SATIETY_LOW_THRESHOLD) / satietySpan));
        if (satiatedLevel > 0.2) {
            ctx.strokeStyle = `rgba(34, 197, 94, ${0.14 + satiatedLevel * 0.2})`;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.arc(this.x, this.y, Math.max(1, (8 + Math.sin(this.wigglePhase * 0.8) * 1.8) * activeScaleReduction), 0, Math.PI * 2);
            ctx.stroke();
        }

        const scaleRadius = Math.max(1, (5 + (Math.max(0, this.health) / this.maxHealth) * 4) * activeScaleReduction);
        ctx.translate(this.x, this.y);
        ctx.rotate(this.angle);

        ctx.fillStyle = this.color;
        ctx.shadowBlur = isSelected ? 12 : 5;
        ctx.shadowColor = this.color;

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

        if (this.infected) {
            ctx.strokeStyle = '#a855f7';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(0, 0, scaleRadius + 2, 0, Math.PI * 2);
            ctx.stroke();
        }

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

        if (this.internalSymbionts.length > 0) {
            ctx.fillStyle = '#2dd4bf';
            this.internalSymbionts.forEach((sym, index) => {
                const symAngle = index * Math.PI + this.wigglePhase * 0.05;
                const dist = scaleRadius * 0.55;
                ctx.beginPath();
                ctx.arc(Math.cos(symAngle) * dist, Math.sin(symAngle) * dist, 1.8, 0, Math.PI * 2);
                ctx.fill();
                void sym;
            });
        }

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

        if (this.carriedSpores && this.carriedSpores.length > 0) {
            ctx.fillStyle = '#38bdf8';
            this.carriedSpores.forEach((sp, idx) => {
                const offX = -scaleRadius + Math.sin(idx + this.wigglePhase) * 2;
                const offY = -3 + idx * 3;
                ctx.beginPath();
                ctx.arc(offX, offY, 1.5, 0, Math.PI * 2);
                ctx.fill();
                void sp;
            });
        }

        ctx.restore();
    }
}

