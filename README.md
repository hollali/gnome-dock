# gnome-dock

A GNOME Shell dock extension (based on Dash2Dock Animated by icedman, GPL‑3.0) that gives you a fully‑customisable dock with a distribution‑aware Applications button. The home icon opens the application grid.

## Features

* Full Dash2Dock behaviour (animated dock icons, autohide/intellihide, scroll‑wheel to cycle windows, click to maximise/minimise windows)  
* **Distribution‑aware Applications button** – shows the logo of your Linux distribution (auto‑detect, manual selection, or a custom SVG file).  
* **Applications home icon** – a single click opens the GNOME application grid; clicking it again returns to the window picker, like the stock GNOME Show Apps button.  
* All 100+ Dash2Dock settings now live under `org.gnome.shell.extensions.the-dock` (General, Appearance, Style, Tweaks and the new **Distribution Icon** page).  
* Default dock position is **bottom** (dock‑location = 0).  
* GNOME Shell 45 – 51 compatible (tested headless on GNOME 51).  

## Installation

```bash
# 1️⃣  Copy the extension into GNOME’s extensions directory
cp -a /path/to/gnome-dock ~/.local/share/gnome-shell/extensions/the-dock@hollali.local

# 2️⃣  Compile the GNOME schema
glib-compile-schemas --strict ~/.local/share/gnome-shell/extensions/the-dock@hollali.local/schemas

# 3️⃣  Reset stale settings (avoids type‑mismatch errors)
dconf reset -f /org/gnome/shell/extensions/the-dock/

# 4️⃣  Restart the session (log out / in on Wayland) so the new code loads
```

*Dash2Dock Animated is marked **out‑of‑date** on GNOME 51, so it won’t load and won’t conflict with the‑dock.*

## Usage after restart

* The dock appears at the **bottom** of the screen.  
* The **Applications button** now shows your distribution’s logo (Fedora, Ubuntu, …) or a custom SVG you provide.  
* Clicking the home icon (the Applications button) opens the application grid; clicking it again returns to the window picker, matching the stock GNOME Show Apps button.  
* Open the extension’s preferences (`gnome-extensions prefs the-dock@hollali.local`) to tweak the Distribution Icon page, animation, autohide, colours, etc.

## Compatibility notes

* The extension was verified in an isolated GNOME Shell 51 headless test – it starts, loads the schema, and layouts without JS errors.  
* Dash2Dock Animated is **out‑of‑date** on GNOME 51, so there is no conflict when both are listed as “enabled”.  
* If you previously had the old The Dock extension installed, its settings will be cleared by the `dconf reset` step; you can re‑apply any custom preferences you want.

## CI/CD

GitHub Actions (`.github/workflows/ci.yml`) and GitLab CI (`.gitlab-ci.yml`) run the same checks on pushes and merge requests: metadata/schema consistency, preference-key coverage, UI XML parsing, strict GSettings compilation, and ES-module syntax checks for every JavaScript file.

Both pipelines build `dist/the-dock@hollali.local.zip`, which can be installed with `gnome-extensions install`. Pushing a tag starting with `v` publishes that ZIP as a release asset on GitHub and GitLab.

The checks can also be run locally:

```bash
./scripts/ci_validate.py
./scripts/ci_package.sh
```

## License

Distributed under the **GNU General Public License v3.0** (see the `LICENSE` file that came with the port).  
Upstream Dash2Dock Animated is also GPL‑3.0; attribution is kept in the `LICENSE` file and in the extension’s metadata description.

---

Enjoy your new dock! If you run into any trouble, open an issue on the [GitHub repository](https://github.com/hollali/gnome-dock) or ask here.