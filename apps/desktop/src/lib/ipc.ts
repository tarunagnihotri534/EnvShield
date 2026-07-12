/**
 * Renderer-side typed wrappers around window.envshield.
 * Components import from here — never call window.envshield directly.
 *
 * In the browser (Next.js static export running in Electron) the bridge is
 * injected by the preload script. During SSR/static-generation there is no
 * window, so we guard every call.
 */

import type { EnvShieldBridge } from '../../electron/preload.js';
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
} from '../../electron/ipcTypes.js';

declare global {
  interface Window {
    envshield: EnvShieldBridge;
  }
}

function bridge(): EnvShieldBridge {
  if (typeof window === 'undefined' || !window.envshield) {
    throw new Error('EnvShield IPC bridge is not available (not running in Electron?)');
  }
  return window.envshield;
}

export const ipc = {
  listRepos:     ()  => bridge().listRepos(),
  addRepo:       (p: AddRepoPayload)       => bridge().addRepo(p),
  removeRepo:    (p: RemoveRepoPayload)    => bridge().removeRepo(p),
  scanRepo:      (p: ScanRepoPayload)      => bridge().scanRepo(p),
  getHistory:    (p: GetHistoryPayload)    => bridge().getHistory(p),
  installHooks:  (p: InstallHooksPayload)  => bridge().installHooks(p),
  pickFolder:    ()  => bridge().pickFolder(),
  getRules:      (p: GetRulesPayload)      => bridge().getRules(p),
  saveRules:     (p: SaveRulesPayload)     => bridge().saveRules(p),
  getAllowlist:   (p: GetAllowlistPayload)  => bridge().getAllowlist(p),
  saveAllowlist: (p: SaveAllowlistPayload) => bridge().saveAllowlist(p),
};
