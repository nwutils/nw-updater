/**
 * Self update NW.js applications packaged by `@nwutils/packager` (directly or
 * through `nw-builder`) with `publish` set. Use the updater matching how the
 * application was packaged:
 *
 * - `AppImageUpdater` for a Linux AppImage
 * - `NsisUpdater` for a Windows NSIS installer
 * - `MacUpdater` for a MacOS DMG
 *
 * Each reads the `app-update.yml` the packager ships with the application to
 * find out where releases are published, and the update info file the
 * packager writes next to each release to find the latest version.
 */

export { default as AppImageUpdater } from './appImage.js';
export { default as MacUpdater } from './mac.js';
export { default as NsisUpdater } from './nsis.js';
export { parseYaml, updateInfoFileName } from './publish.js';
