import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { Store } from './store.js';
import { installHooks } from './installerBridge.js';
import { scanRepo } from './scanBridge.js';
import { IPC } from './ipcTypes.js';
import type {
  AddRepoPayload,
  RemoveRepoPayload,
  ScanRepoPayload,
  GetHistoryPayload,
  InstallHooksPayload,
  GetRulesPayload,
  SaveRulesPayload,
  GetAllowlistPayload,
  SaveAllowlistPayload,
} from './ipcTypes.js';

// ─── Store (singleton, lives as long as the main process) ─────────────────────

let store: Store;

// ─── Window factory ───────────────────────────────────────────────────────────

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#0a0a0a',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    webPreferences: {
      preload: join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false, // preload needs require()
    },
  });

  if (!app.isPackaged) {
    void win.loadURL('http://localhost:3000');
    win.webContents.openDevTools();
  } else {
    // Static Next.js export lands in apps/desktop/out/
    void win.loadFile(join(__dirname, '../../out/index.html'));
  }

  return win;
}

// ─── IPC handlers ─────────────────────────────────────────────────────────────

function registerIpcHandlers(): void {
  // ── Repos ──────────────────────────────────────────────────────────────────
  ipcMain.handle(IPC.LIST_REPOS, () => ({
    repos: store.listRepos(),
  }));

  ipcMain.handle(IPC.ADD_REPO, (_e, payload: AddRepoPayload) => ({
    repo: store.addRepo(payload.path, payload.name),
  }));

  ipcMain.handle(IPC.REMOVE_REPO, (_e, payload: RemoveRepoPayload) => {
    store.removeRepo(payload.id);
    return { ok: true };
  });

  // ── Scan ───────────────────────────────────────────────────────────────────
  ipcMain.handle(IPC.SCAN_REPO, async (_e, payload: ScanRepoPayload) => {
    const repo = store.getRepo(payload.repoId);
    if (!repo) throw new Error(`Repo ${payload.repoId} not found`);

    const rules    = store.getRules(payload.repoId);
    const allowlist = store.getAllowlist(payload.repoId);

    const entry = await scanRepo(
      payload.repoId,
      repo.path,
      rules,
      allowlist,
      payload.entropy ?? false,
    );

    store.addHistoryEntry(entry);
    store.updateRepo(payload.repoId, {
      lastScannedAt:   entry.scannedAt,
      lastScanBlocked: entry.blocked,
      lastFindingCount: entry.findings.length,
    });

    return { entry };
  });

  ipcMain.handle(IPC.GET_HISTORY, (_e, payload: GetHistoryPayload) => ({
    entries: store.getHistory(payload.repoId),
  }));

  // ── Install hooks ──────────────────────────────────────────────────────────
  ipcMain.handle(IPC.INSTALL_HOOKS, (_e, payload: InstallHooksPayload) => {
    if (!existsSync(payload.repoPath)) {
      throw new Error(`Path does not exist: ${payload.repoPath}`);
    }
    return installHooks(payload.repoPath, payload.addGitignore);
  });

  // ── Folder picker dialog ───────────────────────────────────────────────────
  ipcMain.handle(IPC.PICK_FOLDER, async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory'],
      title: 'Select a git repository to protect',
    });
    return { path: result.canceled ? null : (result.filePaths[0] ?? null) };
  });

  // ── Custom rules ───────────────────────────────────────────────────────────
  ipcMain.handle(IPC.GET_RULES, (_e, payload: GetRulesPayload) => ({
    rules: store.getRules(payload.repoId),
  }));

  ipcMain.handle(IPC.SAVE_RULES, (_e, payload: SaveRulesPayload) => {
    store.saveRules(payload.repoId, payload.rules);
    return { ok: true };
  });

  // ── Allowlist ──────────────────────────────────────────────────────────────
  ipcMain.handle(IPC.GET_ALLOWLIST, (_e, payload: GetAllowlistPayload) => ({
    content: store.getAllowlist(payload.repoId),
  }));

  ipcMain.handle(IPC.SAVE_ALLOWLIST, (_e, payload: SaveAllowlistPayload) => {
    store.saveAllowlist(payload.repoId, payload.content);
    return { ok: true };
  });
}

// ─── App lifecycle ────────────────────────────────────────────────────────────

app.whenReady().then(() => {
  store = new Store(app.getPath('userData'));
  registerIpcHandlers();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
