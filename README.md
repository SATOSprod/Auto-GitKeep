# Auto GitKeep

> Obsidian plugin that automatically places a `.gitkeep` file in every folder of your vault so empty directories are tracked by Git.

**Author:** [SATOSprod](https://github.com/SATOSprod)  
**License:** Proprietary — see [LICENSE](./LICENSE)

---

## Why .gitkeep?

Git does not track empty directories. If your vault has folders with no files — or folders that become empty after a `.gitignore` rule — those folders simply disappear when someone clones the repository. A `.gitkeep` is a zero-byte placeholder that forces Git to include the directory.

---

## Features

- **Auto scan on startup** — when the plugin loads, it scans the entire vault and adds `.gitkeep` to every folder that is missing one
- **Watcher** — when a new folder is created (or renamed), `.gitkeep` is added automatically
- **Exclude paths** — configure a list of folders to skip (`.obsidian`, `.trash`, etc.)
- **Manual actions** — two on-demand buttons in settings:
  - **Add `.gitkeep` to all folders** — full vault scan, safe to run multiple times
  - **Remove all `.gitkeep`** — cleans up every `.gitkeep` from the vault
- **Status panel** — live counter: total folders, excluded folders, `.gitkeep` files present
- **SVG icons, no emoji** — consistent with the SATOSprod plugin style

---

## Requirements

- Obsidian **0.15.0** or later
- Works on **desktop and mobile**

---

## Installation

### From source

```bash
# 1. Clone the repository
git clone https://github.com/SATOSprod/auto-gitkeep.git
cd auto-gitkeep

# 2. Install dependencies
npm install

# 3. Build
npm run build
# Produces: main.js
```

Copy the following files into your vault:

```
<your-vault>/.obsidian/plugins/auto-gitkeep/
├── main.js          ← compiled output
├── manifest.json
└── styles.css
```

Open Obsidian → **Settings → Community plugins → Installed plugins** and enable **Auto GitKeep**.

### Development mode (auto-rebuild on save)

```bash
npm run dev
```

---

## Configuration

Open **Settings → Auto GitKeep**.

### Auto GitKeep toggle

| State | Behaviour |
|---|---|
| **On** | Scans vault on startup; watches for new/renamed folders and adds `.gitkeep` immediately |
| **Off** | Watcher is paused; manual action buttons still work |

### Excluded paths

One vault-relative path per line. Subdirectories are excluded automatically.

Default exclusions:

```
.obsidian
.trash
```

You can add any folder you do not want `.gitkeep` files in, for example:

```
.obsidian
.trash
assets/cache
node_modules
```

---

## Manual Actions

Both buttons are available in the settings panel regardless of the auto toggle state.

| Button | Description |
|---|---|
| **Add .gitkeep to all folders** | Scans the entire vault and creates `.gitkeep` in every folder that does not already have one. Respects excluded paths. Safe to run multiple times — existing files are not touched. |
| **Remove all .gitkeep** | Deletes every `.gitkeep` file from every folder in the vault. |

---

## Status Panel

The bottom of the settings page shows a live summary:

| Field | Description |
|---|---|
| **Auto mode** | Whether the watcher is currently enabled |
| **Total folders** | Number of folders in the vault |
| **Excluded folders** | Folders skipped by the excluded paths list |
| **.gitkeep files present** | How many folders currently have a `.gitkeep` |

---

## File Structure

```
auto-gitkeep/
├── main.ts               ← TypeScript source
├── main.js               ← compiled output (gitignored, built locally)
├── styles.css            ← plugin styles
├── manifest.json         ← Obsidian plugin manifest
├── package.json
├── tsconfig.json
├── esbuild.config.mjs
├── versions.json
├── .gitignore
├── LICENSE
└── README.md
```

---

## How It Works

1. On **load**, the plugin calls `onLayoutReady` and iterates every `TFolder` in the vault via Obsidian's file system API, creating `.gitkeep` where missing.
2. It registers a listener on the `vault.on("create")` event — when Obsidian creates a `TFolder`, `.gitkeep` is added to it.
3. A listener on `vault.on("rename")` handles folder renames — the new path also gets `.gitkeep`.
4. All file operations go through `app.vault` so they are compatible with both local vaults and sync services.

---

## License

This project is released under a **proprietary license**.  
Copying source code into other projects is **not permitted**.  
See [LICENSE](./LICENSE) for full terms.

© 2026 SATOSprod
