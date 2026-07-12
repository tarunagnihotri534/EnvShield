/**
 * Preload script — runs in an isolated context with access to ipcRenderer.
 * Exposes a fully-typed `window.envshield` API to the renderer (Next.js).
 */

import { contextBridge, ipcRenderer } from 'electron';
import { IPC } from './ipcTypes.js';
import type {
  ListReposResult,
  AddRepoPayload,
  AddRepoResult,
  RemoveRepoPayload,
  ScanRepoPayload,
  ScanRepoResult,
  GetHistoryPayload,
  GetHistoryResult,
  InstallHooksPayload,
  InstallHooksResult,
  PickFolderResult,
  GetRulesPayload,
  GetRulesResult,
  SaveRulesPayload,
  GetAllowlistPayload,
  GetAllowlistResult,
  SaveAllowlistPayload,
} from './ipcTypes.js';

/** The API surface exposed on window.envshield in the renderer. */
export interface EnvShieldBridge {
  listRepos:     ()                              => Promise<ListReposResult>;
  addRepo:       (p: AddRepoPayload)             => Promise<AddRepoResult>;
  removeRepo:    (p: RemoveRepoPayload)          => Promise<void>;
  scanRepo:      (p: ScanRepoPayload)            => Promise<ScanRepoResult>;
  getHistory:    (p: GetHistoryPayload)          => Promise<GetHistoryResult>;
  installHooks:  (p: InstallHooksPayload)        => Promise<InstallHooksResult>;
  pickFolder:    ()                              => Promise<PickFolderResult>;
  getRules:      (p: GetRulesPayload)            => Promise<GetRulesResult>;
  saveRules:     (p: SaveRulesPayload)           => Promise<void>;
  getAllowlist:   (p: GetAllowlistPayload)        => Promise<GetAllowlistResult>;
  saveAllowlist: (p: SaveAllowlistPayload)       => Promise<void>;
}

const bridge: EnvShieldBridge = {
  listRepos:     ()  => ipcRenderer.invoke(IPC.LIST_REPOS),
  addRepo:       (p) => ipcRenderer.invoke(IPC.ADD_REPO, p),
  removeRepo:    (p) => ipcRenderer.invoke(IPC.REMOVE_REPO, p),
  scanRepo:      (p) => ipcRenderer.invoke(IPC.SCAN_REPO, p),
  getHistory:    (p) => ipcRenderer.invoke(IPC.GET_HISTORY, p),
  installHooks:  (p) => ipcRenderer.invoke(IPC.INSTALL_HOOKS, p),
  pickFolder:    ()  => ipcRenderer.invoke(IPC.PICK_FOLDER),
  getRules:      (p) => ipcRenderer.invoke(IPC.GET_RULES, p),
  saveRules:     (p) => ipcRenderer.invoke(IPC.SAVE_RULES, p),
  getAllowlist:   (p) => ipcRenderer.invoke(IPC.GET_ALLOWLIST, p),
  saveAllowlist: (p) => ipcRenderer.invoke(IPC.SAVE_ALLOWLIST, p),
};

contextBridge.exposeInMainWorld('envshield', bridge);
