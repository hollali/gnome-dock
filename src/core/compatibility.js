import Config from 'resource:///org/gnome/shell/misc/config.js';

export const ShellVersion = (Config.PACKAGE_VERSION || '').split('.').map(n => parseInt(n, 10));

export function versionAtLeast(major, minor = 0) {
    if (ShellVersion[0] !== major) return ShellVersion[0] > major;
    return (ShellVersion[1] || 0) >= minor;
}

export function getMonitorManager() {
    const Main = imports.ui.main;
    return Main.layoutManager;
}
