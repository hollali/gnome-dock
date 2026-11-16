import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import { findDistribution, normalizeId } from './distributionRegistry.js';

export function parseOsRelease(text) {
    const result = {};
    if (!text) return result;
    const lines = String(text).split(/\n/);
    for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line || line.startsWith('#')) continue;
        const eq = line.indexOf('=');
        if (eq < 0) continue;
        const key = line.slice(0, eq).trim();
        let value = line.slice(eq + 1).trim();
        if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
            value = value.slice(1, -1);
        }
        result[key] = value;
    }
    return result;
}

export class DistributionDetector {
    constructor() {
        this._cache = null;
    }

    detect() {
        if (this._cache) return this._cache;
        let id = '';
        let idLike = '';
        try {
            const file = Gio.File.new_for_path('/etc/os-release');
            const [ok, contents] = file.load_contents(null);
            if (ok) {
                const text = new TextDecoder().decode(contents);
                const parsed = parseOsRelease(text);
                id = parsed.ID || '';
                idLike = parsed.ID_LIKE || '';
            }
        } catch (e) {
            // ignore; fallback
        }
        const distro = findDistribution(id, idLike);
        this._cache = { id, idLike, distro };
        return this._cache;
    }

    clearCache() {
        this._cache = null;
    }
}
