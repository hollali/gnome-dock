import Clutter from 'gi://Clutter';
import St from 'gi://St';

export class DockRenderer {
    constructor(extension, settings) {
        this._extension = extension;
        this._settings = settings;
        this.actor = null;
        this.appRegion = null;
        this.separator = null;
        this.appsButton = null;
        this._position = settings.getString('position');
    }

    _isHorizontal() {
        const p = this._settings.getString('position');
        return p === 'top' || p === 'bottom';
    }

    build() {
        this.actor = new St.BoxLayout({
            style_class: 'the-dock-surface',
            reactive: true,
            track_hover: true,
        });
        this.applyOrientation();
        this._applySurfaceStyle();

        this.appRegion = new St.BoxLayout({
            style_class: 'the-dock-app-region',
        });
        try { if (this.appRegion.layout_manager) this.appRegion.layout_manager.spacing = this._settings.getInt('icon-spacing'); } catch (e) {}
        this.separator = new St.Widget({
            style_class: 'the-dock-separator',
        });
        this.appsButton = null; // set later

        this.actor.add_child(this.appRegion);
        this.actor.add_child(this.separator);

        return this.actor;
    }

    updateSpacing() {
        try { if (this.appRegion?.layout_manager) this.appRegion.layout_manager.spacing = this._settings.getInt('icon-spacing'); } catch (e) {}
    }

    applyOrientation() {
        const horiz = this._isHorizontal();
        if (this.actor) {
            this.actor.orientation = horiz ? Clutter.Orientation.HORIZONTAL : Clutter.Orientation.VERTICAL;
        }
        if (this.appRegion) {
            this.appRegion.orientation = horiz ? Clutter.Orientation.HORIZONTAL : Clutter.Orientation.VERTICAL;
        }
        if (this.separator) {
            if (horiz) {
                this.separator.set_width(1);
                this.separator.set_height(this._settings.getInt('icon-size'));
            } else {
                this.separator.set_height(1);
                this.separator.set_width(this._settings.getInt('icon-size'));
            }
        }
    }

    _applySurfaceStyle() {
        if (!this.actor) return;
        const preset = this._settings.getString('preset');
        let opacity = this._settings.getDouble('background-opacity');
        let radius = this._settings.getInt('corner-radius');
        let padding = 6;
        if (preset === 'classic') {
            radius = 0;
            padding = 4;
        } else if (preset === 'compact') {
            padding = 2;
        } else if (preset === 'glass') {
            opacity = Math.min(opacity, 0.18);
        } else if (preset === 'dynamic') {
            opacity = Math.min(opacity + 0.15, 1.0);
        }
        const margin = this._settings.getInt('margin');
        const shadow = this._settings.getDouble('shadow-strength');
        const blur = this._settings.getBoolean('blur-enabled');
        const mode = this._settings.getString('appearance-mode');
        let bg = mode === 'light' ? `240,240,240` : `30,30,30`;
        let style =
            `background-color: rgba(${bg},${opacity}); ` +
            `border-radius: ${radius}px; ` +
            `padding: ${padding}px; ` +
            `margin: ${margin}px;`;
        if (shadow > 0) style += ` box-shadow: 0 4px 16px rgba(0,0,0,${shadow});`;
        if (blur) style += ` backdrop-filter: blur(8px);`;
        this.actor.set_style(style);
    }

    refresh() {
        this.applyOrientation();
        this._applySurfaceStyle();
    }

    destroy() {
        if (this.actor) {
            this.actor.destroy();
            this.actor = null;
        }
    }
}
