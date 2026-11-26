import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import { getDistribution } from './distributionRegistry.js';

export class DistributionIconResolver {
    constructor(extension, settingsManager, detector) {
        this._extension = extension;
        this._settings = settingsManager;
        this._detector = detector;
    }

    _extFile(rel) {
        try {
            return this._extension.dir.get_child(rel);
        } catch (e) {
            return Gio.File.new_for_path(this._extension.path + '/' + rel);
        }
    }

    _getString(key) {
        try {
            if (this._settings && typeof this._settings.getString === 'function')
                return this._settings.getString(key);
            return this._settings.get_string(key);
        } catch (e) {
            if (key === 'distro-mode') return 'auto';
            return '';
        }
    }

    resolve() {
        let mode;
        try {
            mode = this._getString('distro-mode');
        } catch (e) {
            mode = 'auto';
        }
        // 1. custom
        if (mode === 'custom' || mode === 'auto') {
            if (mode === 'custom') {
                const p = this._getString('distro-custom-path');
                if (p) {
                    const f = Gio.File.new_for_path(p);
                    if (f.query_exists(null)) return { type: 'file', path: p };
                }
            }
        }
        if (mode === 'custom') {
            // fall through to generic if invalid
        }
        if (mode === 'generic') {
            return this._generic();
        }
        if (mode === 'manual') {
            const id = this._getString('distro-manual-id');
            const reg = getRegistryEntry(id);
            if (reg) {
                const f = this._extFile(reg.logo);
                if (f.query_exists(null)) return { type: 'file', path: f.get_path() };
            }
            return this._generic();
        }
        // auto
        if (mode === 'auto') {
            const det = this._detector.detect();
            if (det && det.distro) {
                const f = this._extFile(det.distro.logo);
                if (f.query_exists(null)) return { type: 'file', path: f.get_path() };
            }
        }
        // custom mode with valid path handled above; if we reach here for custom, try path
        if (mode === 'custom') {
            const p = this._getString('distro-custom-path');
            if (p) {
                const f = Gio.File.new_for_path(p);
                if (f.query_exists(null)) return { type: 'file', path: p };
            }
        }
        return this._generic();
    }

    _generic() {
        const f = this._extFile('assets/logos/generic.svg');
        return { type: 'file', path: f.get_path() };
    }
}

// lazy import to avoid cycle
function getRegistryEntry(id) {
    return getDistribution(id);
}
