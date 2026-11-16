import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import { SettingsManager } from '../settings/settingsManager.js';
import { DockController } from './dockController.js';

export class DockManager {
    constructor(extension) {
        this.extension = extension;
        this.settings = new SettingsManager(extension);
        this.controllers = [];
        this._signals = [];
    }

    enable() {
        this._connect(this.settings.settings, 'changed::monitor', () => this._rebuild());
        this._connect(this.settings.settings, 'changed::all-monitors', () => this._rebuild());
        this._connect(Main.layoutManager, 'monitors-changed', () => this._rebuild());
        this._rebuild();
    }

    _rebuild() {
        for (const controller of this.controllers) {
            try { controller.disable(); } catch (e) {}
        }
        this.controllers = [];

        const monitors = Main.layoutManager.monitors || [];
        if (!monitors.length) return;

        if (this.settings.getBoolean('all-monitors')) {
            monitors.forEach((mon, index) => this._create(index));
            return;
        }

        let index = this.settings.getInt('monitor');
        if (index < 0) {
            try { index = Main.layoutManager.primaryMonitor?.index ?? 0; } catch (e) { index = 0; }
        }
        if (index >= monitors.length) index = 0;
        this._create(index);
    }

    _create(index) {
        const controller = new DockController(this.extension, { monitorIndex: index });
        try {
            controller.enable();
            this.controllers.push(controller);
        } catch (e) {}
    }

    _connect(obj, signal, cb) {
        const id = obj.connect(signal, cb.bind(this));
        this._signals.push({ obj, id });
    }

    disable() {
        for (const { obj, id } of this._signals) {
            try { obj.disconnect(id); } catch (e) {}
        }
        this._signals = [];
        for (const controller of this.controllers) {
            try { controller.disable(); } catch (e) {}
        }
        this.controllers = [];
        this.settings.destroy();
    }
}
