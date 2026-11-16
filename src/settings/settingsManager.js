import Gio from 'gi://Gio';

export const SCHEMA_ID = 'org.gnome.shell.extensions.the-dock';

export class SettingsManager {
    constructor(extension) {
        this._extension = extension;
        this._settings = extension.getSettings(SCHEMA_ID);
        this._listeners = new Map();
    }

    get settings() { return this._settings; }

    get(key) { const type = this._settings.get_value(key).get_type_string(); if (type.startsWith('a')) return this._settings.get_strv(key); return this._settings.get_value(key).unpack(); }

    getString(key) { return this._settings.get_string(key); }
    getInt(key) { return this._settings.get_int(key); }
    getDouble(key) { return this._settings.get_double(key); }
    getBoolean(key) { return this._settings.get_boolean(key); }
    getStrv(key) { return this._settings.get_strv(key); }

    set(key, value) {
        if (typeof value === 'boolean') this._settings.set_boolean(key, value);
        else if (typeof value === 'number' && Number.isInteger(value)) this._settings.set_int(key, value);
        else if (typeof value === 'number') this._settings.set_double(key, value);
        else if (Array.isArray(value)) this._settings.set_strv(key, value);
        else this._settings.set_string(key, String(value));
    }

    connect(key, cb) {
        const id = this._settings.connect(`changed::${key}`, () => cb(this.get(key), key));
        if (!this._listeners.has(key)) this._listeners.set(key, []);
        this._listeners.get(key).push(id);
        return id;
    }

    connectAll(cb) {
        return this._settings.connect('changed', cb);
    }

    destroy() {
        for (const ids of this._listeners.values()) {
            for (const id of ids) this._settings.disconnect(id);
        }
        this._listeners.clear();
    }
}
