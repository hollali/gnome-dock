import Clutter from 'gi://Clutter';
import Graphene from 'gi://Graphene';
import GObject from 'gi://GObject';
import Shell from 'gi://Shell';
import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as AppFavorites from 'resource:///org/gnome/shell/ui/appFavorites.js';
import * as DND from 'resource:///org/gnome/shell/ui/dnd.js';

export class ApplicationItem {
    constructor({ app, iconSize, onClick, onContextMenu, settings, title }) {
        this.app = app;
        this.iconSize = iconSize;
        this._onClick = onClick;
        this._onContextMenu = onContextMenu;
        this.settings = settings;
        this._title = title;
        this.actor = null;
        this._indicator = null;
        this._icon = null;
        this._running = false;
        this._build();
    }

    _build() {
        this.actor = new St.Button({
            style_class: 'the-dock-item',
            reactive: true,
            can_focus: true,
            track_hover: true,
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER,
        });
        this.actor._delegate = this;
        // remove any background/border/shadow from theme
        this.actor.set_style('background: transparent; border: none; box-shadow: none; padding: 0;');

        const box = new St.BoxLayout({
            orientation: Clutter.Orientation.VERTICAL,
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER,
        });
        this.actor.set_child(box);

        let appInfo = null;
        try { appInfo = (typeof this.app.get_app_info === 'function') ? this.app.get_app_info() : this.app.app_info; } catch (e) { appInfo = this.app.app_info; }
        let gicon = null;
        try { gicon = appInfo ? appInfo.get_icon() : null; } catch (e) { gicon = null; }
        if (gicon) {
            this._icon = new St.Icon({
                gicon: gicon,
                icon_size: this.iconSize,
                style_class: 'the-dock-icon',
            });
        } else {
            try {
                this._icon = this.app.create_icon_texture(this.iconSize);
            } catch (e) {
                this._icon = new St.Icon({ icon_name: 'application-x-executable', icon_size: this.iconSize, style_class: 'the-dock-icon' });
            }
        }
        box.add_child(this._icon);
        try { this._icon.pivot_point = new Graphene.Point({ x: 0.5, y: 0.5 }); } catch (e) {}

        this._indicator = new St.Widget({
            style_class: 'the-dock-indicator',
            width: 4,
            height: 4,
            x_align: Clutter.ActorAlign.CENTER,
        });
        this._indicator.set_style('background-color: transparent; border-radius: 2px;');
        box.add_child(this._indicator);

        const label = this._title || (this.app.get_name ? this.app.get_name() : 'Application');
        try { this.actor.set_accessible_name(label); } catch (e) {}
        const showTooltips = this.settings ? this.settings.getBoolean('show-tooltips') : true;
        if (showTooltips) {
            try { this.actor.set_tooltip_text(label); } catch (e) {}
        }
        try { this._windowsChangedId = this.app.connect('windows-changed', () => this._updateRunning()); } catch (e) { this._windowsChangedId = 0; }
        this._updateRunning();

        this.actor.connect('clicked', () => {
            if (this._onClick) this._onClick(this.app);
        });
        this.actor.connect('button-press-event', (a, e) => {
            const btn = e.get_button();
            if (btn === 2) {
                try { this.app.open_new_window(-1); } catch (e2) { try { this.app.activate(); } catch (e3) {} }
                return Clutter.EVENT_STOP;
            }
            if (btn === 3 && this._onContextMenu) {
                this._onContextMenu(this.app, e);
                return Clutter.EVENT_STOP;
            }
            return Clutter.EVENT_PROPAGATE;
        });

        // tooltip
        this.actor.connect('notify::hover', () => {
            // simple tooltip via Main (optional)
        });

        if (this.settings?.getBoolean('drag-drop-reorder')) {
            try { this._draggable = DND.makeDraggable(this.actor, { timeoutThreshold: 200 }); } catch (e) {}
        }
    }

    getDragActor() {
        try { return this.app.create_icon_texture(this.iconSize); } catch (e) { return this._icon; }
    }

    getDragActorSource() {
        return this.actor;
    }

    handleDragOver() {
        return DND.DragMotionResult.MOVE_DROP;
    }

    acceptDrop(source) {
        try {
            if (!source || !source.app) return false;
            const favs = AppFavorites.getAppFavorites();
            const ids = favs.getFavorites().map(a => a.get_id());
            const from = ids.indexOf(source.app.get_id());
            const to = ids.indexOf(this.app.get_id());
            if (from < 0 || to < 0) return false;
            favs.moveFavoriteToPos(source.app.get_id(), to);
            return true;
        } catch (e) {
            return false;
        }
    }

    _updateRunning() {
        let running = false;
        try { running = this.app.get_state() === Shell.AppState.RUNNING; } catch (e) { running = false; }
        if (!running) {
            try { running = (this.app.get_windows() || []).length > 0; } catch (e) { running = false; }
        }
        this.setRunning(running);
    }

    setRunning(running) {
        this._running = running;
        if (!this._indicator) return;
        const style = this.settings ? this.settings.getString('running-indicator-style') : 'dot';
        const size = this.settings ? this.settings.getInt('running-indicator-size') : 4;
        if (!running || style === 'none') {
            this._indicator.set_style('background-color: transparent;');
            this._indicator.set_size(0, 0);
            return;
        }
        if (style === 'line') {
            this._indicator.set_size(this.iconSize, Math.max(2, size));
            this._indicator.set_style('background-color: rgba(255,255,255,0.9); border-radius: 1px;');
        } else {
            this._indicator.set_size(size, size);
            this._indicator.set_style('background-color: rgba(255,255,255,0.9); border-radius: 999px;');
        }
    }

    setIconSize(size) {
        this.iconSize = size;
        if (this._icon && typeof this._icon.set_icon_size === 'function') {
            try { this._icon.set_icon_size(size); } catch (e) {}
        }
    }


    setIconScale(scale) {
        if (!this._icon) return;
        const duration = this.settings ? this.settings.getInt('hover-duration') : 120;
        try {
            this._icon.ease({
                scale_x: scale,
                scale_y: scale,
                translation_y: -Math.round((scale - 1) * this.iconSize * 0.6),
                duration,
                mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            });
        } catch (e) {}
    }

    bounce() {
        if (!this._icon) return;
        const speed = this.settings ? this.settings.getInt('animation-speed') : 150;
        try {
            this._icon.pivot_point = new Graphene.Point({ x: 0.5, y: 0.5 });
            this._icon.ease({
                translation_y: -Math.round(this.iconSize * 0.45),
                duration: Math.max(40, Math.round(speed * 0.9)),
                mode: Clutter.AnimationMode.EASE_OUT_QUAD,
                onComplete: () => {
                    try {
                        this._icon.ease({
                            translation_y: 0,
                            duration: Math.max(40, Math.round(speed * 1.4)),
                            mode: Clutter.AnimationMode.EASE_IN_QUAD,
                        });
                    } catch (e) {}
                },
            });
        } catch (e) {}
    }

    destroy() {
        if (this._windowsChangedId && this.app) {
            try { this.app.disconnect(this._windowsChangedId); } catch (e) {}
            this._windowsChangedId = 0;
        }
        if (this.actor) {
            this.actor.destroy();
            this.actor = null;
        }
    }
}
