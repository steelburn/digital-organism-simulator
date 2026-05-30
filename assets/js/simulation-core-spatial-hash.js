import { CONFIG } from './state.js';

/* ── Spatial Hash (toroidal world) ──────────────────────────────────────── */
export class SpatialHash {
    constructor(cellSize) {
        this.cellSize = cellSize;
        this.gridW = Math.ceil(CONFIG.W / cellSize);
        this.gridH = Math.ceil(CONFIG.H / cellSize);
        this.cells = new Array(this.gridW * this.gridH).fill(null).map(() => []);
    }

    clear() {
        for (let i = 0; i < this.cells.length; i++) this.cells[i].length = 0;
    }

    _idx(worldX, worldY) {
        if (!Number.isFinite(worldX) || !Number.isFinite(worldY) || this.gridW <= 0 || this.gridH <= 0) {
            return -1;
        }

        const cx = Math.floor(((worldX % CONFIG.W) + CONFIG.W) % CONFIG.W / this.cellSize);
        const cy = Math.floor(((worldY % CONFIG.H) + CONFIG.H) % CONFIG.H / this.cellSize);

        if (!Number.isFinite(cx) || !Number.isFinite(cy) || cx < 0 || cy < 0 || cx >= this.gridW || cy >= this.gridH) {
            return -1;
        }

        return cy * this.gridW + cx;
    }

    insert(entity) {
        if (!entity) return;

        const idx = this._idx(entity.x, entity.y);
        if (idx < 0 || idx >= this.cells.length) return;

        const bucket = this.cells[idx];
        if (!bucket) return;
        bucket.push(entity);
    }

    queryRadius(cx, cy, radius, out = []) {
        if (!Number.isFinite(cx) || !Number.isFinite(cy) || !Number.isFinite(radius) || this.gridW <= 0 || this.gridH <= 0) {
            return out;
        }

        const r = Math.ceil(radius / this.cellSize);
        const baseCX = Math.floor(((cx % CONFIG.W) + CONFIG.W) % CONFIG.W / this.cellSize);
        const baseCY = Math.floor(((cy % CONFIG.H) + CONFIG.H) % CONFIG.H / this.cellSize);
        for (let ddx = -r; ddx <= r; ddx++) {
            for (let ddy = -r; ddy <= r; ddy++) {
                const ncx = ((baseCX + ddx) % this.gridW + this.gridW) % this.gridW;
                const ncy = ((baseCY + ddy) % this.gridH + this.gridH) % this.gridH;
                const bucket = this.cells[ncy * this.gridW + ncx];
                if (!bucket || bucket.length === 0) continue;
                for (let i = 0; i < bucket.length; i++) out.push(bucket[i]);
            }
        }
        return out;
    }
}

