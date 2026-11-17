import Clutter from 'gi://Clutter';
import Graphene from 'gi://Graphene';
import Gio from 'gi://Gio';
import Shell from 'gi://Shell';
import GLib from 'gi://GLib';
import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import { AppMenu } from 'resource:///org/gnome/shell/ui/appMenu.js';
import * as AppFavorites from 'resource:///org/gnome/shell/ui/appFavorites.js';

import { SettingsManager } from '../settings/settingsManager.js';
import { DockRenderer } from './dockRenderer.js';
import { ApplicationItem } from '../applications/applicationItem.js';
import { DistributionDetector } from '../distribution/distributionDetector.js';
import { DistributionIconResolver } from '../distribution/distributionIcon.js';

export class DockController {
    constructor(extension, options = {}) {
        this.extension = extension;
        this.settings = new SettingsManager(extension);
        this.detector = new DistributionDetector();
        this.iconResolver = new DistributionIconResolver(extension, this.settings, this.detector);
        this.renderer = new DockRenderer(extension, this.settings);
        this._fixedMonitor = Number.isInteger(options.monitorIndex) ? options.monitorIndex : null;
        this.actor = null;
        this.appRegion = null;
        this._items = new Map(); // appId -> ApplicationItem
        this._appsButtonActor = null;
        this._monitorIndex = -1;
        this._hoveredItem = null;
        this._signals = [];
        this._timeouts = [];
        this._autohideConnected = false;
        this._appSignals = new Map();
    }

    enable() {
        this.actor = this.renderer.build();
        this.actor.opacity = 0;
        this.actor.visible = this.settings.getBoolean('enabled');
        try { this.actor.pivot_point = new Graphene.Point({ x: 0.5, y: 0.5 }); } catch (e) {}
        this.appRegion = this.renderer.appRegion;

        // Applications button
        this._createAppsButton();
        this.renderer.actor.add_child(this._appsButtonActor);

        // Add chrome
        Main.layoutManager.addChrome(this.actor, { affectsStruts: true, trackFullscreen: true });
        try { this._hideOverviewDash(); } catch (e) {}
        try {
            this.actor.connect('notify::width', () => this._position());
            this.actor.connect('notify::height', () => this._position());
        } catch (e) {}

        this._monitorIndex = this._fixedMonitor !== null ? this._fixedMonitor : this.settings.getInt('monitor');
        if (this._monitorIndex < 0) {
            // primary
            try { this._monitorIndex = Main.layoutManager.primaryMonitor?.index ?? 0; } catch (e) { this._monitorIndex = 0; }
        }

        // populate apps
        this._refreshApps();

        // react to app/favorite changes
        try { this._connect(AppFavorites.getAppFavorites(), 'changed', () => this._refreshApps()); } catch (e) {}
        try { this._connect(Shell.AppSystem.get_default(), 'app-state-changed', () => this._refreshApps()); } catch (e) {}

        // settings changes
        this.settings.connect('enabled', () => { if (this.actor) this.actor.visible = this.settings.getBoolean('enabled'); });
        this.settings.connect('position', () => this._onSettingsChanged());
        this.settings.connect('alignment', () => this._position());
        if (this._fixedMonitor === null) {
            this.settings.connect('monitor', () => { this._monitorIndex = this.settings.getInt('monitor'); if (this._monitorIndex < 0) { try { this._monitorIndex = Main.layoutManager.primaryMonitor?.index ?? 0; } catch (e) { this._monitorIndex = 0; } } this._position(); });
            this.settings.connect('all-monitors', () => this._onSettingsChanged());
        }
        this.settings.connect('icon-size', () => this._updateItemSizes());
        this.settings.connect('icon-spacing', () => this._updateSpacing());
        this.settings.connect('dock-length', () => this._onSettingsChanged());
        this.settings.connect('background-opacity', () => this.renderer.refresh());
        this.settings.connect('corner-radius', () => this.renderer.refresh());
        this.settings.connect('margin', () => { this.renderer.refresh(); this._position(); });
        this.settings.connect('shadow-strength', () => this.renderer.refresh());
        this.settings.connect('blur-enabled', () => this.renderer.refresh());
        this.settings.connect('appearance-mode', () => this.renderer.refresh());
        this.settings.connect('preset', () => this.renderer.refresh());
        this.settings.connect('hover-magnification', () => this._applyHoverScales());
        this.settings.connect('hover-duration', () => this._applyHoverScales());
        this.settings.connect('animation-speed', () => this._applyHoverScales());
        this.settings.connect('running-indicator-style', () => this._refreshApps());
        this.settings.connect('running-indicator-size', () => this._refreshApps());
        this.settings.connect('autohide-mode', () => this._updateAutohide());
        this.settings.connect('show-tooltips', () => this._refreshApps());
        this.settings.connect('window-previews', () => this._refreshApps());
        this.settings.connect('workspace-mode', () => this._refreshApps());
        this.settings.connect('group-windows', () => this._refreshApps());
        this.settings.connect('window-per-item', () => this._refreshApps());
        this.settings.connect('drag-drop-reorder', () => this._refreshApps());
        this.settings.connect('distro-mode', () => this._updateAppsButtonIcon());
        this.settings.connect('distro-manual-id', () => this._updateAppsButtonIcon());
        this.settings.connect('distro-custom-path', () => this._updateAppsButtonIcon());

        // monitor changes
        this._connect(Main.layoutManager, 'monitors-changed', () => this._onMonitorsChanged());
        try { this._connect(global.display, 'window-created', () => this._updateAutohide()); } catch (e) {}
        try { this._connect(global.display, 'notify::focus-window', () => this._updateAutohide()); } catch (e) {}

        this._position();
        this._schedulePosition();
        this._updateAutohide();
        try {
            GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
                if (this.actor) {
                    this.actor.ease({
                        opacity: 255,
                        duration: 220,
                        mode: Clutter.AnimationMode.EASE_OUT_QUAD,
                    });
                }
                return GLib.SOURCE_REMOVE;
            });
        } catch (e) {}
    }

    _createAppsButton() {
        const size = this.settings.getInt('icon-size');
        const btn = new St.Button({
            style_class: 'the-dock-item the-dock-apps-button',
            reactive: true,
            can_focus: true,
            track_hover: true,
        });
        btn.set_style('background: transparent; border: none; box-shadow: none; padding: 0;');
        const box = new St.BoxLayout({ orientation: Clutter.Orientation.VERTICAL, x_align: Clutter.ActorAlign.CENTER, y_align: Clutter.ActorAlign.CENTER });
        btn.set_child(box);
        this._appsIcon = new St.Icon({ icon_size: size, style_class: 'the-dock-icon' });
        try { this._appsIcon.pivot_point = new Graphene.Point({ x: 0.5, y: 0.5 }); } catch (e) {}
        box.add_child(this._appsIcon);
        // spacer for indicator alignment
        const spacer = new St.Widget({ width: 4, height: 4 });
        spacer.set_style('background-color: transparent;');
        box.add_child(spacer);

        btn.connect('clicked', () => {
            try { Main.overview.showApps(); } catch (e) {}
        });
        btn.connect('button-press-event', (a, e) => {
            if (e.get_button() !== 3) return Clutter.EVENT_PROPAGATE;
            try {
                const menu = new PopupMenu.PopupMenu(this.actor, 0.5, St.Side.TOP);
                try { Main.uiGroup.add_child(menu.actor); } catch (err) {}
                const addItem = (label, cb) => { const it = new PopupMenu.PopupMenuItem(label); it.connect('activate', cb); menu.addMenuItem(it); };
                const run = (cmd) => { try { GLib.spawn_command_line_async(cmd); } catch (e2) {} };
                addItem('Show Applications', () => { try { Main.overview.showApps(); } catch (e2) {} });
                addItem('Search', () => { try { Main.overview.show(); Main.overview.searchEntry?.grab_key_focus(); } catch (e2) {} });
                menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
                addItem('Settings', () => run('gnome-control-center'));
                addItem('Extension Settings', () => run('gnome-extensions prefs ' + this.extension.uuid));
                menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
                addItem('Lock Screen', () => run('loginctl lock-session'));
                addItem('Log Out', () => run('gnome-session-quit --logout --no-prompt'));
                addItem('Restart', () => run('gnome-session-quit --reboot --no-prompt'));
                addItem('Shut Down', () => run('gnome-session-quit --power-off --no-prompt'));
                menu.connect('open-state-changed', (m, open) => { if (!open) try { m.destroy(); } catch (e2) {} });
                menu.open();
            } catch (err) {}
            return Clutter.EVENT_STOP;
        });
        btn.connect('enter-event', () => {
            try { this._appsIcon.ease({ scale_x: 1.2, scale_y: 1.2, translation_y: -Math.round(this.settings.getInt('icon-size') * 0.12), duration: this.settings.getInt('animation-speed'), mode: Clutter.AnimationMode.EASE_OUT_QUAD }); } catch (e) {}
            return Clutter.EVENT_PROPAGATE;
        });
        btn.connect('leave-event', () => {
            try { this._appsIcon.ease({ scale_x: 1.0, scale_y: 1.0, translation_y: 0, duration: this.settings.getInt('animation-speed'), mode: Clutter.AnimationMode.EASE_OUT_QUAD }); } catch (e) {}
            return Clutter.EVENT_PROPAGATE;
        });
        btn.set_accessible_name('Show Applications');

        this._appsButtonActor = btn;
        this._updateAppsButtonIcon();
    }

    _updateAppsButtonIcon() {
        const res = this.iconResolver.resolve();
        if (res && res.path) {
            try {
                const file = Gio.File.new_for_path(res.path);
                const gicon = new Gio.FileIcon({ file });
                this._appsIcon.set_gicon(gicon);
            } catch (e) {
                // fallback to named icon
                this._appsIcon.set_icon_name('view-app-grid-symbolic');
            }
        }
    }

    _refreshApps() {
        const size = this.settings.getInt('icon-size');
        const favApps = AppFavorites.getAppFavorites().getFavorites();
        const perWindow = this.settings.getBoolean('window-per-item') || !this.settings.getBoolean('group-windows');

        const entries = [];
        const addEntry = (app, win = null) => {
            const id = app.get_id();
            const key = win ? `${id}::${win.get_id ? win.get_id() : win.get_stable_sequence()}` : id;
            entries.push({ app, win, key });
        };

        for (const app of favApps) {
            if (!app) continue;
            if (perWindow) {
                const wins = app.get_windows ? app.get_windows() : [];
                if (wins.length) wins.forEach(w => addEntry(app, w));
                else addEntry(app);
            } else {
                addEntry(app);
            }
        }
        try {
            const apps = Shell.AppSystem.get_default().get_running();
            const seen = new Set(entries.map(e => e.app.get_id()));
            for (const app of apps) {
                if (!app) continue;
                const id = app.get_id();
                if (seen.has(id)) continue;
                if (!this._shouldShowApp(app)) continue;
                seen.add(id);
                if (perWindow) {
                    const wins = app.get_windows ? app.get_windows() : [];
                    if (wins.length) wins.forEach(w => addEntry(app, w));
                    else addEntry(app);
                } else {
                    addEntry(app);
                }
            }
        } catch (e) {}

        const desiredKeys = new Set(entries.map(e => e.key));
        for (const { app } of entries) this._watchApp(app);

        // remove items no longer desired
        for (const [key, item] of this._items) {
            if (desiredKeys.has(key)) continue;
            try { item.destroy(); } catch (e) {}
            this._items.delete(key);
        }

        // add new items
        for (const { app, win, key } of entries) {
            if (this._items.has(key)) continue;
            const title = win && win.get_title ? win.get_title() : null;
            const item = new ApplicationItem({
                app,
                iconSize: size,
                title,
                onClick: () => win ? this._activateWindow(app, win) : this._activateApp(app),
                onContextMenu: (a, e) => this._showAppMenu(a, e),
                settings: this.settings,
            });
            item.setRunning(this._isRunning(app));
            try { item.actor.pivot_point = new Graphene.Point({ x: 0.5, y: 0.5 }); } catch (e) {}
            try { item.actor.opacity = 0; item.actor.scale_x = 0; item.actor.scale_y = 0; } catch (e) {}
            try {
                item.actor.connect('enter-event', () => { this._setHovered(item); return Clutter.EVENT_PROPAGATE; });
                item.actor.connect('leave-event', () => { this._clearHovered(item); return Clutter.EVENT_PROPAGATE; });
            } catch (e) {}
            this._items.set(key, item);
            item._animateIn = true;
        }

        // update running state + reorder
        this.appRegion.remove_all_children();
        for (const { app, key } of entries) {
            const item = this._items.get(key);
            if (!item) continue;
            item.setRunning(this._isRunning(app));
            this.appRegion.add_child(item.actor);
            if (item._animateIn) {
                item._animateIn = false;
                try {
                    item.actor.ease({
                        opacity: 255,
                        scale_x: 1,
                        scale_y: 1,
                        duration: 180,
                        mode: Clutter.AnimationMode.EASE_OUT_QUAD,
                    });
                } catch (e) {}
            }
        }
    }

    _watchApp(app) {
        try {
            const id = app.get_id();
            if (this._appSignals.has(id)) return;
            const sig = app.connect('windows-changed', () => this._refreshApps());
            this._appSignals.set(id, { app, sig });
        } catch (e) {}
    }

    _shouldShowApp(app) {
        const mode = this.settings.getString('workspace-mode');
        if (mode === 'all') return true;
        // current workspace
        try {
            const ws = global.workspace_manager.get_active_workspace();
            const wins = app.get_windows();
            return wins.some(w => w.get_workspace() === ws);
        } catch (e) {
            return true;
        }
    }

    _addItem(app, size, pinned) {
        const item = new ApplicationItem({
            app,
            iconSize: size,
            onClick: (a) => this._activateApp(a),
            onContextMenu: (a, e) => this._showAppMenu(a, e),
            settings: this.settings,
        });
        item.setRunning(this._isRunning(app));
        this._items.set(app.get_id(), item);
        this.appRegion.add_child(item.actor);
    }

    _isRunning(app) {
        try { return app.get_state() === Shell.AppState.RUNNING; } catch (e) { return (app.get_windows() || []).length > 0; }
    }

    _showAppMenu(app, event) {
        try {
            const menu = new AppMenu(this.actor, St.Side.TOP, { favoritesSection: true, showSingleWindows: true });
            menu.setApp(app);
            Main.uiGroup.add_child(menu.actor);
            menu.connect('open-state-changed', (m, open) => { if (!open) { try { m.destroy(); } catch (e) {} } });
            menu.open();
        } catch (e) {}
    }

    _activateWindow(app, win) {
        try { if (win) { win.activate(global.get_current_time()); return; } } catch (e) {}
        this._activateApp(app);
    }

    _activateApp(app) {
        try {
            let item = this._items.get(app.get_id());
            if (!item) {
                for (const it of this._items.values()) {
                    if (it.app === app) { item = it; break; }
                }
            }
            if (item) item.bounce();
        } catch (e) {}
        try {
            const wins = app.get_windows();
            if (!wins || wins.length === 0) {
                app.activate();
                return;
            }
            if (wins.length === 1) {
                app.activate();
                return;
            }
            if (this.settings.getBoolean('window-previews')) {
                this._showAppMenu(app);
                return;
            }
            // raise the most recently used window
            try {
                const last = wins[wins.length - 1];
                if (last) {
                    last.activate(global.get_current_time());
                    return;
                }
            } catch (e) {}
            app.activate();
        } catch (e) {
            try { app.open_new_window(-1); } catch (e2) {}
        }
    }

    _setHovered(item) {
        this._hoveredItem = item;
        this._applyHoverScales();
    }

    _clearHovered(item) {
        if (this._hoveredItem !== item) return;
        const id = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 40, () => {
            if (this._hoveredItem === item) {
                this._hoveredItem = null;
                this._applyHoverScales();
            }
            return GLib.SOURCE_REMOVE;
        });
        this._timeouts.push(id);
    }

    _applyHoverScales() {
        const actors = this.appRegion.get_children();
        const items = actors.map((a) => {
            for (const it of this._items.values()) {
                if (it.actor === a) return it;
            }
            return null;
        }).filter(Boolean);
        const idx = this._hoveredItem ? items.indexOf(this._hoveredItem) : -1;
        const base = this.settings.getDouble('hover-magnification') || 1.25;
        items.forEach((it, i) => {
            let scale = 1.0;
            if (idx >= 0) {
                const d = Math.abs(i - idx);
                if (d === 0) scale = base;
                else if (d === 1) scale = 1 + (base - 1) * 0.5;
                else if (d === 2) scale = 1 + (base - 1) * 0.2;
            }
            try { it.setIconScale(scale); } catch (e) {}
        });
    }

    _updateSpacing() {
        try { this.renderer.updateSpacing(); } catch (e) {}
    }

    _updateItemSizes() {
        const size = this.settings.getInt('icon-size');
        for (const item of this._items.values()) item.setIconSize(size);
        if (this._appsIcon) this._appsIcon.set_icon_size(size);
    }

    _updateAutohide() {
        const mode = this.settings.getString('autohide-mode');
        if (!this.actor) return;
        const shouldHide = mode === 'always' || (mode === 'intelligent' && this._windowOverlapsDock());
        if (shouldHide) {
            this.actor.opacity = 0;
            this.actor.reactive = true;
            if (!this._autohideConnected) {
                this._autohideConnected = true;
                this.actor.connect('enter-event', () => { this.actor.ease({ opacity: 255, duration: 150, mode: Clutter.AnimationMode.EASE_OUT_QUAD }); return Clutter.EVENT_PROPAGATE; });
                this.actor.connect('leave-event', () => { GLib.timeout_add(GLib.PRIORITY_DEFAULT, 400, () => { if (!this.actor?.has_pointer) this.actor?.ease({ opacity: 0, duration: 200, mode: Clutter.AnimationMode.EASE_IN_QUAD }); return GLib.SOURCE_REMOVE; }); return Clutter.EVENT_PROPAGATE; });
            }
        } else {
            this.actor.opacity = 255;
        }
    }

    _windowOverlapsDock() {
        try {
            const [x, y] = this.actor.get_transformed_position();
            const w = this.actor.width;
            const h = this.actor.height;
            for (const actor of global.get_window_actors()) {
                const win = actor.meta_window;
                if (!win) continue;
                const r = win.get_frame_rect();
                if (r.x < x + w && r.x + r.width > x && r.y < y + h && r.y + r.height > y)
                    return true;
            }
        } catch (e) {}
        return false;
    }

    _onSettingsChanged() {
        this.renderer.refresh();
        this._position();
    }

    _onMonitorsChanged() {
        const monitors = Main.layoutManager.monitors;
        if (this._monitorIndex >= monitors.length) {
            try { this._monitorIndex = Main.layoutManager.primaryMonitor?.index ?? 0; } catch (e) { this._monitorIndex = 0; }
        }
        this._position();
    }

    _position() {
        if (!this.actor) return;
        const monIndex = this._monitorIndex >= 0 ? this._monitorIndex : 0;
        const monitors = Main.layoutManager.monitors;
        const mon = monitors[monIndex] || Main.layoutManager.primaryMonitor || monitors[0];
        if (!mon) return;

        const pos = this.settings.getString('position');
        const margin = this.settings.getInt('margin');
        const align = this.settings.getString('alignment');

        const horiz = pos === 'top' || pos === 'bottom';
        const lengthPct = this.settings.getInt('dock-length');
        try {
            if (lengthPct > 0) {
                const max = horiz ? mon.width : mon.height;
                const length = Math.round((max * lengthPct) / 100);
                if (horiz) this.actor.set_width(length);
                else this.actor.set_height(length);
            } else {
                if (horiz) this.actor.set_width(-1);
                else this.actor.set_height(-1);
            }
        } catch (e) {}

        // ensure size allocated
        const width = this.actor.get_width();
        const height = this.actor.get_height();
        if (!width || !height) {
            this._schedulePosition();
            return;
        }

        let x, y;
        if (pos === 'bottom') {
            x = this._alignX(mon, width, align);
            y = mon.y + mon.height - height - margin;
        } else if (pos === 'top') {
            x = this._alignX(mon, width, align);
            y = mon.y + margin;
        } else if (pos === 'left') {
            x = mon.x + margin;
            y = this._alignY(mon, height, align);
        } else { // right
            x = mon.x + mon.width - width - margin;
            y = this._alignY(mon, height, align);
        }
        this.actor.set_position(x, y);
    }

    _alignX(mon, width, align) {
        if (align === 'start') return mon.x + this.settings.getInt('margin');
        if (align === 'end') return mon.x + mon.width - width - this.settings.getInt('margin');
        return mon.x + (mon.width - width) / 2;
    }

    _alignY(mon, height, align) {
        if (align === 'start') return mon.y + this.settings.getInt('margin');
        if (align === 'end') return mon.y + mon.height - height - this.settings.getInt('margin');
        return mon.y + (mon.height - height) / 2;
    }

    _schedulePosition() {
        const id = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 100, () => {
            this._position();
            return GLib.SOURCE_REMOVE;
        });
        this._timeouts.push(id);
    }

    _connect(obj, signal, cb) {
        const id = obj.connect(signal, cb.bind(this));
        this._signals.push({ obj, id });
    }


    _hideOverviewDash() {
        const dash = Main.overview && Main.overview.dash;
        if (!dash) return;
        try { dash.__box = dash.__box || dash._box; } catch (e) {}
        dash.opacity = 0;
        try { dash._background.style = 'background: transparent !important;'; } catch (e) {}
        const box = dash.__box || dash._box;
        if (box && box.get_children) {
            box.get_children().forEach((c) => {
                c.opacity = 0;
                c.visible = false;
                if (c.child) {
                    try { c.child.reactive = false; } catch (e) {}
                    try { c.child.track_hover = false; } catch (e) {}
                }
            });
        }
        try {
            dash._showAppsIcon.opacity = 0;
            dash._showAppsIcon.visible = false;
            if (dash._showAppsIcon.child) {
                dash._showAppsIcon.child.reactive = false;
                dash._showAppsIcon.child.track_hover = false;
            }
        } catch (e) {}
    }

    _restoreOverviewDash() {
        const dash = Main.overview && Main.overview.dash;
        if (!dash) return;
        dash.opacity = 255;
        try { dash._background.style = ''; } catch (e) {}
        const box = dash.__box || dash._box;
        if (box && box.get_children) {
            box.get_children().forEach((c) => {
                c.opacity = 255;
                c.visible = true;
                if (c.child) {
                    try { c.child.reactive = true; } catch (e) {}
                    try { c.child.track_hover = true; } catch (e) {}
                }
            });
        }
        try {
            dash._showAppsIcon.opacity = 255;
            dash._showAppsIcon.visible = true;
            if (dash._showAppsIcon.child) {
                dash._showAppsIcon.child.reactive = true;
                dash._showAppsIcon.child.track_hover = true;
            }
        } catch (e) {}
    }

    disable() {
        try { this._restoreOverviewDash(); } catch (e) {}
        // disconnect
        for (const { obj, id } of this._signals) {
            try { obj.disconnect(id); } catch (e) {}
        }
        this._signals = [];
        for (const id of this._timeouts) {
            try { GLib.source_remove(id); } catch (e) {}
        }
        this._timeouts = [];
        for (const item of this._items.values()) item.destroy();
        this._items.clear();
        for (const { app, sig } of this._appSignals.values()) {
            try { app.disconnect(sig); } catch (e) {}
        }
        this._appSignals.clear();
        if (this._appsButtonActor) { this._appsButtonActor.destroy(); this._appsButtonActor = null; }
        if (this.actor) {
            Main.layoutManager.removeChrome(this.actor);
            this.actor.destroy();
            this.actor = null;
        }
        this.settings.destroy();
    }
}
