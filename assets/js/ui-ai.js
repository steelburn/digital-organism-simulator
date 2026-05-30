import { apiKey, CONFIG, runtime } from './state.js';
import { EngineInstance, GlobalRegistry, Microorganism, Plant, triggerToast } from './simulation-core.js';
import {
    btnArmInjector,
    listAnimalGenes,
    listPlantGenes,
    rebuildLabBlueprint,
    updateLabTab
} from './ui-controls.js';
import { startCoreLoop } from './ui-dashboard.js';

const aiChatBuffer = document.getElementById('ai-chat-buffer');
const aiInput = document.getElementById('ai-input');
const aiSendBtn = document.getElementById('ai-send-btn');

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
                jsonText = jsonText.replace(/,(\s*[\]}])/g, '$1');
                jsonText = jsonText.replace(/\b0x([0-9A-Fa-f]+)\b/g, (_m, hex) => parseInt(hex, 16));

                const payload = JSON.parse(jsonText);
                cleanText = text.substring(0, startIdx) + text.substring(endIdx + 1);

                const injectionId = `inject-${Date.now()}`;
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
                                const geneVal = Number(cb.getAttribute('data-gene'));
                                cb.checked = payload.suggestedSequence.includes(geneVal);
                            });

                            rebuildLabBlueprint();
                            runtime.isArmed = true;
                            btnArmInjector.className = 'w-full py-2 rounded-lg bg-emerald-600/30 border border-emerald-500 text-emerald-400 text-xs font-bold tracking-wider flex items-center justify-center gap-2 transition-all';
                            btnArmInjector.innerHTML = '<i class="fa-solid fa-crosshairs animate-spin"></i> INJECTOR ARMED (TAP ON MAP)';

                            triggerToast(`DNA Charged: ${payload.speciesName}. Tap viewport to seed.`, 'info');
                        });
                    }
                }, 100);
            }
        }
    } catch (err) {
        console.error('Failed to parse suggested sequence from AI response:', err);
    }

    appendChatMessage('ai', cleanText + actionBtnHtml);
}

async function triggerAdvisorRequest(customPrompt = '') {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`;

    const diagnosticData = {
        activeAnimals: EngineInstance.microorganisms.length,
        activeFlora: EngineInstance.plants.length,
        activeSpores: EngineInstance.spores.length,
        carcassesDecomposing: EngineInstance.carcasses.length,
        totalLineagesCount: GlobalRegistry.registry.size,
        soilNutrientErosionRate: CONFIG.EROSION_SPEED,
        floraMutationChanceRate: CONFIG.FLORA_MUTATION_CHANCE,
        faunaMutationChanceRate: CONFIG.FAUNA_MUTATION_CHANCE,
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
- 5 (0x05): Speed Specialist (+Burst speed, moderate metabolic drag)
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
- 156 (0x9C): Clonal Runner Growth (Enables vine-like vegetative budding into nearby viable cells)
- 157 (0x9D): Clonal Aggression (Increases burst seedling output during clonal replication)

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
                appendChatMessage('ai-err', 'Ecosystem Consultant connection timed out. Telemetry assessment offline.');
                return;
            }
            await new Promise(r => setTimeout(r, waitTime));
            void err;
        }
    }

    if (success) {
        processAIResponse(responseText);
    }
}

if (aiSendBtn && aiInput) {
    aiSendBtn.addEventListener('click', () => {
        const val = aiInput.value.trim();
        if (val) {
            appendChatMessage('user', val);
            aiInput.value = '';
            triggerAdvisorRequest(val);
        }
    });

    aiInput.addEventListener('keypress', e => {
        if (e.key === 'Enter') {
            aiSendBtn.click();
        }
    });
}

document.querySelectorAll('.ai-quick-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        const promptType = btn.getAttribute('data-prompt');
        let prompt = '';
        if (promptType === 'soil-assessment') {
            prompt = 'Analyze the soil chemistry and moisture runoff. How is moisture runoff affecting the valley deltas?';
        } else if (promptType === 'genocide-check') {
            prompt = 'Assess immediate extinction risks. Are there viral pathogen epidemic breakouts running through host colonies?';
        } else if (promptType === 'suggest-balancer') {
            prompt = 'Examine current predator/prey balances and suggest an organism balancing genotype (provide suggestedSequence JSON block).';
        } else {
            prompt = 'Design a mutant chaotic virus variant designed to carry hijacked genetic sequence fragments (HGT) (provide suggestedSequence JSON block).';
        }
        appendChatMessage('user', btn.innerText.trim());
        triggerAdvisorRequest(prompt);
    });
});

startCoreLoop();
