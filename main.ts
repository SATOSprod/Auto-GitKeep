import {
	App,
	Notice,
	Plugin,
	PluginSettingTab,
	Setting,
	TAbstractFile,
	TFile,
	TFolder,
	normalizePath,
} from "obsidian";

// ─────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────

const GITKEEP_FILENAME = ".gitkeep";

// ─────────────────────────────────────────────
// SVG icons
// ─────────────────────────────────────────────

// const SVG_GITKEEP = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" xmlns="http://www.w3.org/2000/svg"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/><line x1="12" y1="11" x2="12" y2="17"/><line x1="9" y1="14" x2="15" y2="14"/></svg>`;

const SVG_TRASH = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" xmlns="http://www.w3.org/2000/svg"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>`;

const SVG_SCAN = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" xmlns="http://www.w3.org/2000/svg"><path d="M3 7V5a2 2 0 0 1 2-2h2"/><path d="M17 3h2a2 2 0 0 1 2 2v2"/><path d="M21 17v2a2 2 0 0 1-2 2h-2"/><path d="M7 21H5a2 2 0 0 1-2-2v-2"/><rect x="7" y="7" width="10" height="10" rx="1"/></svg>`;

// ─────────────────────────────────────────────
// Types & Settings
// ─────────────────────────────────────────────

interface AutoGitKeepSettings {
	/** Whether the watcher is active (auto-adds .gitkeep to new folders) */
	autoEnabled:   boolean;
	/** Folder paths to skip, one per line */
	excludedPaths: string;
}

function getDefaultSettings(app: App): AutoGitKeepSettings {
	return {
		autoEnabled: true,
		excludedPaths: `${app.vault.configDir}\n.trash`,
	};
}
// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

/** Parse the excluded paths setting into a Set of normalised paths */
function parseExcluded(raw: string): Set<string> {
	return new Set(
		raw
			.split("\n")
			.map((l) => normalizePath(l.trim()))
			.filter(Boolean)
	);
}

function appendSvg(target: HTMLElement, svg: string): void {
	const doc = new DOMParser().parseFromString(svg, "image/svg+xml");
	const node = doc.documentElement;
	if (node && node.nodeName.toLowerCase() === "svg") {
		target.appendChild(target.ownerDocument.importNode(node, true));
	}
}

/** Return true if the given folder path should be skipped */
function isFolderExcluded(folderPath: string, excluded: Set<string>): boolean {
	for (const ex of excluded) {
		if (folderPath === ex || folderPath.startsWith(ex + "/")) return true;
	}
	return false;
}

/** Collect all TFolder instances in the vault recursively */
function getAllFolders(app: App): TFolder[] {
	const folders: TFolder[] = [];
	const recurse = (folder: TFolder) => {
		folders.push(folder);
		for (const child of folder.children) {
			if (child instanceof TFolder) recurse(child);
		}
	};
	recurse(app.vault.getRoot());
	return folders;
}

// ─────────────────────────────────────────────
// Core operations
// ─────────────────────────────────────────────

/**
 * Ensure a .gitkeep file exists in the given folder.
 * Does nothing if the file already exists or the folder is excluded.
 * Returns true if a file was created.
 */
async function ensureGitKeep(
	app: App,
	folder: TFolder,
	excluded: Set<string>
): Promise<boolean> {
	if (isFolderExcluded(folder.path, excluded)) return false;

	const filePath = normalizePath(
		folder.path === "/" ? GITKEEP_FILENAME : `${folder.path}/${GITKEEP_FILENAME}`
	);

	if (await app.vault.adapter.exists(filePath)) return false;

	await app.vault.create(filePath, "");
	return true;
}

/**
 * Remove the .gitkeep file from the given folder if it exists.
 * Returns true if a file was removed.
 */
async function removeGitKeep(app: App, folder: TFolder): Promise<boolean> {
	const filePath = normalizePath(
		folder.path === "/" ? GITKEEP_FILENAME : `${folder.path}/${GITKEEP_FILENAME}`
	);
	if (!(await app.vault.adapter.exists(filePath))) return false;

	const file = app.vault.getAbstractFileByPath(filePath);
	if (file instanceof TFile) {
		await app.fileManager.trashFile(file);
		return true;
	}
	return false;
}

/**
 * Scan entire vault and add .gitkeep to every folder not excluded.
 * Returns count of files created.
 */
async function scanAndAddAll(app: App, excluded: Set<string>): Promise<number> {
	const folders = getAllFolders(app);
	let count = 0;
	for (const folder of folders) {
		if (await ensureGitKeep(app, folder, excluded)) count++;
	}
	return count;
}

/**
 * Remove all .gitkeep files from the entire vault.
 * Returns count of files removed.
 */
async function removeAll(app: App): Promise<number> {
	const folders = getAllFolders(app);
	let count = 0;
	for (const folder of folders) {
		if (await removeGitKeep(app, folder)) count++;
	}
	return count;
}

// ─────────────────────────────────────────────
// Main Plugin
// ─────────────────────────────────────────────

export default class AutoGitKeepPlugin extends Plugin {
	settings!: AutoGitKeepSettings;
	private statusBarItem: HTMLElement | null = null;

	async onload() {
		await this.loadSettings();

		// Status bar
		this.statusBarItem = this.addStatusBarItem();
		this.updateStatusBar();

		// Settings tab
		this.addSettingTab(new AutoGitKeepSettingTab(this.app, this));

		// On vault ready: initial scan if auto is enabled
		this.app.workspace.onLayoutReady(async () => {
			if (this.settings.autoEnabled) {
				const excluded = parseExcluded(this.settings.excludedPaths);
				const count = await scanAndAddAll(this.app, excluded);
				if (count > 0) {
					new Notice(`Auto GitKeep: added ${count} .gitkeep file${count !== 1 ? "s" : ""}.`);
				}
			}
		});

		// Watch for new folders
		this.registerEvent(
			this.app.vault.on("create", async (file: TAbstractFile) => {
				if (!this.settings.autoEnabled) return;
				if (!(file instanceof TFolder)) return;
				const excluded = parseExcluded(this.settings.excludedPaths);
				await ensureGitKeep(this.app, file, excluded);
			})
		);

		// Watch for folder renames: ensure .gitkeep in new path
		this.registerEvent(
			this.app.vault.on("rename", async (file: TAbstractFile) => {
				if (!this.settings.autoEnabled) return;
				if (!(file instanceof TFolder)) return;
				const excluded = parseExcluded(this.settings.excludedPaths);
				await ensureGitKeep(this.app, file, excluded);
			})
		);
	}

	onunload() {
		// nothing extra — Obsidian cleans up registered events
	}

	// ── Status bar ────────────────────────────

	updateStatusBar() {
		if (!this.statusBarItem) return;
		// this.statusBarItem.empty();
		// this.statusBarItem.addClass("agk-statusbar");
		// appendSvg(this.statusBarItem, SVG_GITKEEP);
		// this.statusBarItem.createSpan({ text: this.settings.autoEnabled ? "GitKeep: on" : "GitKeep: off" });
		// this.statusBarItem.setAttribute(
		// 	"title",
		// 	this.settings.autoEnabled
		// 		? "Auto GitKeep is active — new folders get .gitkeep automatically"
		// 		: "Auto GitKeep is paused"
		// );
	}

	// ── Settings persistence ──────────────────

	async loadSettings() {
		const loaded = (await this.loadData()) as Partial<AutoGitKeepSettings> | null;
		this.settings = Object.assign({}, getDefaultSettings(this.app), loaded ?? {});
	}

	async saveSettings() {
		await this.saveData(this.settings);
		this.updateStatusBar();
	}
}

// ─────────────────────────────────────────────
// Settings Tab
// ─────────────────────────────────────────────

class AutoGitKeepSettingTab extends PluginSettingTab {
	plugin: AutoGitKeepPlugin;

	constructor(app: App, plugin: AutoGitKeepPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	// ── Rich description helper ───────────────

	private desc(parts: Array<string | { strong?: string; code?: string }>): DocumentFragment {
		const frag = activeDocument.createDocumentFragment();
		for (const p of parts) {
			if (typeof p === "string") {
				frag.appendText(p);
			} else if (p.strong) {
				const el = activeDocument.createElement("span");
				el.className = "agk-desc-strong";
				el.textContent = p.strong;
				frag.appendChild(el);
			} else if (p.code) {
				const el = activeDocument.createElement("code");
				el.className = "agk-desc-code";
				el.textContent = p.code;
				frag.appendChild(el);
			}
		}
		return frag;
	}

	// ── Main render ───────────────────────────

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		// ─── General ──────────────────────────
		// new Setting(containerEl).setName("General").setHeading();

		new Setting(containerEl)
			.setName("Auto GitKeep")
			.setDesc(this.desc([
				"When enabled, ",
				{ strong: "automatically adds" },
				{ code: ".gitkeep" },
				" to every new folder and scans the vault on startup.",
			]))
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.autoEnabled)
					.onChange(async (value) => {
						this.plugin.settings.autoEnabled = value;
						await this.plugin.saveSettings();
						this.display();
					})
			);

		new Setting(containerEl)
			.setName("Excluded paths")
			.setDesc(this.desc([
				"Vault-relative folder paths to skip — one per line. ",
				{ strong: "Subdirectories are excluded automatically." },
				" Example: ",
				{ code: this.app.vault.configDir },
				", ",
				{ code: ".trash" },
				".",
			]))
			.addTextArea((ta) => {
				ta.setPlaceholder(`${this.app.vault.configDir}\n.trash`)
					.setValue(this.plugin.settings.excludedPaths)
					.onChange(async (value) => {
						this.plugin.settings.excludedPaths = value;
						await this.plugin.saveSettings();
					});
					ta.inputEl.rows = 5;
					ta.inputEl.addClass("agk-excluded-textarea");
				return ta;
			});

		// ─── Actions ──────────────────────────
		new Setting(containerEl).setName("Actions").setHeading();

		containerEl.createEl("p", {
			text: "Run these operations on demand regardless of the auto toggle above.",
			cls: "setting-item-description",
		});

		const actionsRow = containerEl.createDiv({ cls: "agk-actions" });

		// Button: Scan & add all
		const addBtn = actionsRow.createEl("button", { cls: "agk-btn mod-cta" });
		appendSvg(addBtn, SVG_SCAN);
		addBtn.createSpan({ text: "Add .gitkeep to all folders" });
		addBtn.onclick = async () => {
			addBtn.setAttribute("disabled", "true");
			addBtn.querySelector("span")!.textContent = "Working…";
			const excluded = parseExcluded(this.plugin.settings.excludedPaths);
			const count = await scanAndAddAll(this.app, excluded);
			new Notice(
				count > 0
					? `Auto GitKeep: added ${count} .gitkeep file${count !== 1 ? "s" : ""}.`
					: "Auto GitKeep: all folders already have .gitkeep."
			);
			addBtn.removeAttribute("disabled");
			addBtn.querySelector("span")!.textContent = "Add .gitkeep to all folders";
			this.display();
		};

		// Button: Remove all
		const removeBtn = actionsRow.createEl("button", { cls: "agk-btn mod-danger" });
		appendSvg(removeBtn, SVG_TRASH);
		removeBtn.createSpan({ text: "Remove all .gitkeep" });
		removeBtn.onclick = async () => {
			removeBtn.setAttribute("disabled", "true");
			removeBtn.querySelector("span")!.textContent = "Removing…";
			const count = await removeAll(this.app);
			new Notice(
				count > 0
					? `Auto GitKeep: removed ${count} .gitkeep file${count !== 1 ? "s" : ""}.`
					: "Auto GitKeep: no .gitkeep files found."
			);
			removeBtn.removeAttribute("disabled");
			removeBtn.querySelector("span")!.textContent = "Remove all .gitkeep";
			this.display();
		};

		// ─── Status ───────────────────────────
		new Setting(containerEl).setName("Status").setHeading();

		const statusDiv = containerEl.createDiv({ cls: "agk-status-block" });

		// Count current .gitkeep files
		const countGitKeep = (): number => {
			let count = 0;
			const recurse = (folder: TFolder) => {
				const has = folder.children.some(
					(c) => !(c instanceof TFolder) && c.name === GITKEEP_FILENAME
				);
				if (has) count++;
				for (const child of folder.children) {
					if (child instanceof TFolder) recurse(child);
				}
			};
			recurse(this.app.vault.getRoot());
			return count;
		};

		const totalFolders = getAllFolders(this.app).length;
		const totalGitKeep = countGitKeep();
		const excluded     = parseExcluded(this.plugin.settings.excludedPaths);
		const excludedCount = getAllFolders(this.app).filter((f) =>
			isFolderExcluded(f.path, excluded)
		).length;

		const statusLine = (label: string, value: string | number) => {
			const p = statusDiv.createEl("p");
			p.createEl("strong", { text: `${label}:` });
			p.appendText(` ${value}`);
		};
		statusLine("Auto mode", this.plugin.settings.autoEnabled ? "Enabled" : "Disabled");
		statusLine("Total folders", totalFolders);
		statusLine("Excluded folders", excludedCount);
		statusLine(".gitkeep files present", totalGitKeep);
	}
}
