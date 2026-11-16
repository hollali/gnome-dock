const LOGO_BASE = 'assets/logos';

export const DISTRIBUTIONS = [
    { id: 'fedora', name: 'Fedora', logo: `${LOGO_BASE}/fedora.svg`, aliases: ['fedora'] },
    { id: 'ubuntu', name: 'Ubuntu', logo: `${LOGO_BASE}/ubuntu.svg`, aliases: ['ubuntu'] },
    { id: 'debian', name: 'Debian', logo: `${LOGO_BASE}/debian.svg`, aliases: ['debian'] },
    { id: 'arch', name: 'Arch Linux', logo: `${LOGO_BASE}/arch.svg`, aliases: ['arch', 'archlinux'] },
    { id: 'linuxmint', name: 'Linux Mint', logo: `${LOGO_BASE}/linuxmint.svg`, aliases: ['linuxmint', 'mint'] },
    { id: 'opensuse', name: 'openSUSE', logo: `${LOGO_BASE}/opensuse.svg`, aliases: ['opensuse', 'opensuse-tumbleweed', 'opensuse-leap', 'sles'] },
    { id: 'manjaro', name: 'Manjaro', logo: `${LOGO_BASE}/manjaro.svg`, aliases: ['manjaro'] },
    { id: 'pop', name: 'Pop!_OS', logo: `${LOGO_BASE}/pop.svg`, aliases: ['pop', 'popos', 'pop-os'] },
    { id: 'zorin', name: 'Zorin OS', logo: `${LOGO_BASE}/zorin.svg`, aliases: ['zorin'] },
    { id: 'elementary', name: 'elementary OS', logo: `${LOGO_BASE}/elementary.svg`, aliases: ['elementary'] },
    { id: 'nixos', name: 'NixOS', logo: `${LOGO_BASE}/nixos.svg`, aliases: ['nixos'] },
];

export function normalizeId(id) {
    if (!id) return '';
    return String(id).trim().toLowerCase().replace(/[^a-z0-9]/g, '');
}

export function findDistribution(id, idLike) {
    const norm = normalizeId(id);
    if (norm) {
        for (const d of DISTRIBUTIONS) {
            if (normalizeId(d.id) === norm) return d;
            if (d.aliases && d.aliases.some(a => normalizeId(a) === norm)) return d;
        }
    }
    if (idLike) {
        const hints = String(idLike).split(/\s+/).map(normalizeId).filter(Boolean);
        for (const h of hints) {
            for (const d of DISTRIBUTIONS) {
                if (normalizeId(d.id) === h) return d;
                if (d.aliases && d.aliases.some(a => normalizeId(a) === h)) return d;
            }
        }
    }
    return null;
}

export function getDistribution(id) {
    return DISTRIBUTIONS.find(d => d.id === id) || null;
}
