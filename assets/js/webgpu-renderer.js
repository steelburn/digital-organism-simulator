/**
 * WebGPU Terrain Renderer
 *
 * Renders the soil-grid background in a single GPU draw call (full-screen quad +
 * fragment shader) and exposes an off-screen HTMLCanvasElement whose contents can
 * be composited onto the main Canvas 2D via drawImage().
 *
 * Falls back gracefully: if WebGPU is unavailable or initialisation fails,
 * `isReady` stays false and the caller should use the original Canvas 2D path.
 */

import { CONFIG } from './state.js';

/* ─── WGSL shader source ─────────────────────────────────────────────────── */

const TERRAIN_WGSL = /* wgsl */ `

// ── Uniforms (16 bytes, aligned to 16) ───────────────────────────────────────
struct Uniforms {
    cols         : u32,
    rows         : u32,
    activeFilter : u32,  // 0=classic 1=elevation 2=nutrients 3=moisture
    _pad         : u32,
};

// ── Per-cell data (16 bytes each) ────────────────────────────────────────────
struct CellData {
    elevation : f32,
    nutrients : f32,
    moisture  : f32,
    cellType  : u32,  // 0=Sandy/Loam  1=Clay/Silt  2=Rocky/Shale
};

@group(0) @binding(0) var<uniform>          u     : Uniforms;
@group(0) @binding(1) var<storage, read>    cells : array<CellData>;

// ── Vertex shader — full-screen quad in two triangles ───────────────────────
struct VOut {
    @builtin(position) pos : vec4f,
    @location(0)       uv  : vec2f,
};

@vertex
fn vs_main(@builtin(vertex_index) vi : u32) -> VOut {
    // NDC positions (Y-up) for 6 vertices covering [-1,1]²
    var pos = array<vec2f, 6>(
        vec2f(-1.0, -1.0), vec2f( 1.0, -1.0), vec2f(-1.0,  1.0),
        vec2f( 1.0, -1.0), vec2f( 1.0,  1.0), vec2f(-1.0,  1.0)
    );
    // UV: (0,0) = top-left canvas, (1,1) = bottom-right canvas
    var uv = array<vec2f, 6>(
        vec2f(0.0, 1.0), vec2f(1.0, 1.0), vec2f(0.0, 0.0),
        vec2f(1.0, 1.0), vec2f(1.0, 0.0), vec2f(0.0, 0.0)
    );
    var o : VOut;
    o.pos = vec4f(pos[vi], 0.0, 1.0);
    o.uv  = uv[vi];
    return o;
}

// ── Fragment shader — map UV → cell index → colour ──────────────────────────
@fragment
fn fs_main(in : VOut) -> @location(0) vec4f {
    let col     = min(u32(in.uv.x * f32(u.cols)), u.cols - 1u);
    let row     = min(u32(in.uv.y * f32(u.rows)), u.rows - 1u);
    let idx     = row * u.cols + col;
    let cell    = cells[idx];

    var colour : vec4f;

    switch u.activeFilter {
        case 1u: {   // elevation – warm greyscale
            let s = cell.elevation * (180.0 / 255.0);
            colour = vec4f(s, s * 0.7, s * 0.4, 1.0);
        }
        case 2u: {   // nutrients – amber heat-map
            let i = min(1.0, cell.nutrients / 100.0);
            colour = vec4f(245.0/255.0, 158.0/255.0, 11.0/255.0, i * 0.7);
        }
        case 3u: {   // moisture – cyan heat-map
            let i = min(1.0, cell.moisture / 100.0);
            colour = vec4f(6.0/255.0, 182.0/255.0, 212.0/255.0, 0.1 + i * 0.75);
        }
        default: {   // classic – subtle tint by soil type
            switch cell.cellType {
                case 1u: { colour = vec4f(16.0/255.0, 185.0/255.0, 129.0/255.0, 0.08); }
                case 2u: { colour = vec4f(239.0/255.0,  68.0/255.0,  68.0/255.0, 0.05); }
                default: { colour = vec4f( 51.0/255.0,  65.0/255.0,  85.0/255.0, 0.03); }
            }
        }
    }

    return colour;
}
`;

/* ─── WebGPUTerrainRenderer ──────────────────────────────────────────────── */

export class WebGPUTerrainRenderer {
    constructor() {
        this.device        = null;
        this.gpuCanvas     = null;   // off-screen HTMLCanvasElement
        this.gpuCtx        = null;   // GPUCanvasContext
        this.canvasFormat  = null;
        this.pipeline      = null;
        this.uniformBuf    = null;
        this.cellBuf       = null;
        this.bindGroup     = null;
        this.isReady       = false;

        this._lastFilter   = null;
        this._staticLoaded = false;  // elevation + cellType are immutable after init
        this._gridCols     = 0;
        this._gridRows     = 0;
    }

    /* ── Initialise WebGPU device + render pipeline ─────────────────────── */
    async init() {
        if (!navigator.gpu) {
            console.warn('[WebGPU] navigator.gpu not available — falling back to Canvas 2D.');
            return false;
        }

        try {
            const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
            if (!adapter) {
                console.warn('[WebGPU] No adapter found — falling back to Canvas 2D.');
                return false;
            }

            this.device = await adapter.requestDevice();
            this.device.lost.then(info => {
                console.warn('[WebGPU] Device lost:', info.reason, info.message);
                this.isReady = false;
            });

            /* Off-screen canvas that WebGPU renders into */
            this.gpuCanvas        = document.createElement('canvas');
            this.gpuCanvas.width  = CONFIG.W;
            this.gpuCanvas.height = CONFIG.H;
            this.gpuCtx           = this.gpuCanvas.getContext('webgpu');

            const fmt = navigator.gpu.getPreferredCanvasFormat();
            this.canvasFormat = fmt;
            this.gpuCtx.configure({
                device    : this.device,
                format    : fmt,
                alphaMode : 'premultiplied',
            });

            /* Shader module */
            const shader = this.device.createShaderModule({ code: TERRAIN_WGSL });

            /* Render pipeline */
            this.pipeline = this.device.createRenderPipeline({
                layout   : 'auto',
                vertex   : { module: shader, entryPoint: 'vs_main' },
                fragment : {
                    module     : shader,
                    entryPoint : 'fs_main',
                    targets    : [{
                        format : fmt,
                        blend  : {
                            color : { srcFactor: 'src-alpha',  dstFactor: 'one-minus-src-alpha', operation: 'add' },
                            alpha : { srcFactor: 'one',        dstFactor: 'one-minus-src-alpha', operation: 'add' },
                        },
                    }],
                },
                primitive : { topology: 'triangle-list' },
            });

            /* Uniform buffer: Uniforms struct = 16 bytes */
            this.uniformBuf = this.device.createBuffer({
                size  : 16,
                usage : GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
            });

            /* Storage buffer: CellData[cols * rows], 16 bytes each */
            const cols = Math.ceil(CONFIG.W / CONFIG.GRID_SIZE);
            const rows = Math.ceil(CONFIG.H / CONFIG.GRID_SIZE);
            this._allocateCellBuffer(cols, rows);
            this._rebuildBindGroup();

            this.isReady = true;
            console.info('[WebGPU] Terrain renderer ready — GPU-accelerated terrain enabled.');
            return true;

        } catch (err) {
            console.warn('[WebGPU] Initialisation failed:', err);
            return false;
        }
    }

    _allocateCellBuffer(cols, rows) {
        const safeCols = Math.max(1, cols | 0);
        const safeRows = Math.max(1, rows | 0);
        const cellCount = safeCols * safeRows;

        if (this.cellBuf) {
            this.cellBuf.destroy();
        }

        this.cellBuf = this.device.createBuffer({
            size  : cellCount * 16,
            usage : GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
        });

        this._gridCols = safeCols;
        this._gridRows = safeRows;
        this._staticLoaded = false;
    }

    _rebuildBindGroup() {
        this.bindGroup = this.device.createBindGroup({
            layout  : this.pipeline.getBindGroupLayout(0),
            entries : [
                { binding: 0, resource: { buffer: this.uniformBuf } },
                { binding: 1, resource: { buffer: this.cellBuf   } },
            ],
        });
    }

    _syncWorldResources(soilGrid) {
        if (!this.isReady || !soilGrid) return;

        if (this.gpuCanvas.width !== CONFIG.W || this.gpuCanvas.height !== CONFIG.H) {
            this.gpuCanvas.width = CONFIG.W;
            this.gpuCanvas.height = CONFIG.H;
            this.gpuCtx.configure({
                device: this.device,
                format: this.canvasFormat,
                alphaMode: 'premultiplied'
            });
        }

        if (soilGrid.cols !== this._gridCols || soilGrid.rows !== this._gridRows) {
            this._allocateCellBuffer(soilGrid.cols, soilGrid.rows);
            this._rebuildBindGroup();
        }
    }

    /* ── Upload uniform data (16 bytes) ─────────────────────────────────── */
    _writeUniforms(activeFilter, cols, rows) {
        const filterIndex = { classic: 0, elevation: 1, nutrients: 2, moisture: 3 }[activeFilter] ?? 0;

        const ab  = new ArrayBuffer(16);
        const u32 = new Uint32Array(ab);
        u32[0] = cols;
        u32[1] = rows;
        u32[2] = filterIndex;
        u32[3] = 0; // _pad

        this.device.queue.writeBuffer(this.uniformBuf, 0, ab);
    }

    /* ── Upload cell buffer (only when necessary) ────────────────────────── */
    _writeCells(soilGrid) {
        const { cols, rows } = soilGrid;
        const ab  = new ArrayBuffer(cols * rows * 16);
        const f32 = new Float32Array(ab);
        const u32 = new Uint32Array(ab);

        const typeMap = { 'Sandy/Loam': 0, 'Clay/Silt': 1, 'Rocky/Shale': 2 };

        for (let x = 0; x < cols; x++) {
            for (let y = 0; y < rows; y++) {
                const cell = soilGrid.cells[x][y];
                const base = (y * cols + x) * 4; // 4 × f32/u32 per cell
                f32[base    ] = cell.elevation;
                f32[base + 1] = cell.nutrients;
                f32[base + 2] = cell.moisture;
                u32[base + 3] = typeMap[cell.type] ?? 0;
            }
        }

        this.device.queue.writeBuffer(this.cellBuf, 0, ab);
    }

    /* ── Main render call — invoke once per frame before drawImage ────────── */
    render(soilGrid, activeFilter) {
        if (!this.isReady || !soilGrid) return;

        this._syncWorldResources(soilGrid);

        const filterChanged = activeFilter !== this._lastFilter;
        this._lastFilter = activeFilter;

        this._writeUniforms(activeFilter, soilGrid.cols, soilGrid.rows);

        // Static filters (classic, elevation) only need one upload per session;
        // dynamic filters (nutrients, moisture) need fresh data every frame.
        const isDynamic = (activeFilter === 'nutrients' || activeFilter === 'moisture');
        if (!this._staticLoaded || isDynamic || filterChanged) {
            this._writeCells(soilGrid);
            if (!isDynamic) this._staticLoaded = true;
        }

        const texture = this.gpuCtx.getCurrentTexture();
        const encoder = this.device.createCommandEncoder();
        const pass    = encoder.beginRenderPass({
            colorAttachments: [{
                view       : texture.createView(),
                clearValue : { r: 0, g: 0, b: 0, a: 0 },
                loadOp     : 'clear',
                storeOp    : 'store',
            }],
        });

        pass.setPipeline(this.pipeline);
        pass.setBindGroup(0, this.bindGroup);
        pass.draw(6); // 2 triangles, 3 vertices each
        pass.end();

        this.device.queue.submit([encoder.finish()]);
    }

    /**
     * Returns the off-screen WebGPU canvas.
     * Call render() first each frame, then drawImage(renderer.getCanvas(), 0, 0)
     * on the main 2D context.
     */
    getCanvas() {
        return this.gpuCanvas;
    }

    /**
     * Notify the renderer that static soil data (type / elevation) has been
     * regenerated (e.g. after a map reset), forcing a re-upload next frame.
     */
    invalidateStatic() {
        this._staticLoaded = false;
    }
}
