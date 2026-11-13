// Entry point for the distributed bundles (dist/clan-sdk.js and dist/clan-sdk.esm.js).
// Adds `version` so a bug report can say exactly which build a game loaded.
export * from './index.js';
export const version = __CLAN_SDK_VERSION__;
