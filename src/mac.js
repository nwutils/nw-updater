const child_process = await import('node:child_process');
const fs = await import('node:fs');
const os = await import('node:os');
const path = await import('node:path');
const process = await import('node:process');

import { checkUpdateInfo, downloadVerified, quitApp, updateInfoFileName } from './publish.js';

/**
 * @typedef {object} MacUpdaterOptions
 * @property {string} [currentVersion] - Version of the running application, eg. `nw.App.manifest.version`. Required.
 * @property {string} [appPath] - Path to the running `.app` bundle. Defaults to the outermost `.app` in `process.execPath`.
 * @property {string} [configPath] - Path to `app-update.yml`. Defaults to `Contents/Resources/app-update.yml` in the app bundle, where `@nwutils/packager` puts it.
 * @property {string} [temporaryDirectory] - Directory updates are downloaded to. Defaults to [`os.tmpdir()`](https://nodejs.org/api/os.html#os_os_tmpdir).
 * @property {string} [dittoPath='ditto'] - Path to `ditto`, which unpacks the update.
 * @property {string} [codesignPath='codesign'] - Path to `codesign`, which checks the update's signature.
 * @property {string} [openPath='open'] - Path to `open`, which starts the updated app.
 */

/**
 * @typedef {import('./publish.js').UpdateCheckResult} UpdateCheckResult
 */

/**
 * @typedef {import('./publish.js').DownloadProgress} DownloadProgress
 */

/**
 * Outermost `.app` bundle containing `filePath`. NW.js runs code in helper
 * apps nested inside the main app, eg.
 * `Demo.app/Contents/Frameworks/.../Helpers/nwjs Helper (Renderer).app/...`,
 * so the first `.app` from the root is the one to update.
 * @param {string} filePath
 * @returns {string | undefined}
 */
function findAppBundle(filePath) {
  const parts = path.resolve(filePath).split(path.sep);
  const index = parts.findIndex((part) => part.endsWith('.app'));
  return index === -1 ? undefined : parts.slice(0, index + 1).join(path.sep);
}

/**
 * Run `file` with `args`, resolving with its exit code and output.
 * @param {string} file
 * @param {string[]} args
 * @param {string} toolName - For error messages, eg. `"ditto"`.
 * @returns {Promise<{code: number, stdout: string, stderr: string}>}
 */
function exec(file, args, toolName) {
  return new Promise((resolve, reject) => {
    child_process.execFile(file, args, (error, stdout, stderr) => {
      if (error && typeof error.code !== 'number') {
        reject(new Error(`Unable to run ${JSON.stringify(file)}. "${toolName}" is part of MacOS.`, { cause: error }));
        return;
      }
      resolve({ code: error ? /** @type {number} */ (error.code) : 0, stdout, stderr });
    });
  });
}

/**
 * Self updates a NW.js application packaged as a DMG by `@nwutils/packager`
 * with `publish` set.
 *
 * Updates don't use the DMG: the packager publishes a zip of the app next to
 * it. `install` unpacks that next to the running app and swaps the two
 * bundles. The running app keeps working until it quits - call `restart` to
 * switch to the new version.
 */
class MacUpdater {

  /**
   * @param {MacUpdaterOptions} [options]
   */
  constructor(options = {}) {
    const appPath = options.appPath ?? findAppBundle(process.execPath);
    this.options = {
      currentVersion: options.currentVersion,
      appPath,
      configPath: options.configPath ?? (appPath === undefined ? undefined : path.join(appPath, 'Contents', 'Resources', 'app-update.yml')),
      temporaryDirectory: options.temporaryDirectory ?? os.tmpdir(),
      dittoPath: options.dittoPath ?? 'ditto',
      codesignPath: options.codesignPath ?? 'codesign',
      openPath: options.openPath ?? 'open',
    };
  }

  /**
   * Path to the running app bundle.
   * @private
   * @returns {string}
   */
  getAppPath() {
    if (this.options.appPath === undefined || this.options.appPath === '') {
      throw new Error('The application is not running from a MacOS app bundle.');
    }
    return this.options.appPath;
  }

  /**
   * Check whether a newer version is published.
   *
   * This downloads the `latest-mac.yml` update info file (`latest-mac-<arch>.yml`
   * for architectures other than `x64`) and compares its version with
   * `currentVersion` using semantic versioning.
   * @returns {Promise<UpdateCheckResult>}
   */
  async checkForUpdates() {
    const configPath = this.options.configPath ?? path.join(this.getAppPath(), 'Contents', 'Resources', 'app-update.yml');
    return checkUpdateInfo({
      currentVersion: this.options.currentVersion,
      configPath,
      fileName: updateInfoFileName(process.arch, 'osx'),
      packageName: 'the app',
    });
  }

  /**
   * Download the zip of the app found by `checkForUpdates` to
   * `temporaryDirectory`, and verify it against the published size and
   * SHA-512 digest. Pass the returned path to `install`.
   * @param {UpdateCheckResult} update
   * @param {{onProgress?: (progress: DownloadProgress) => void}} [options]
   * @returns {Promise<string>} Path to the downloaded zip.
   */
  async downloadUpdate(update, options = {}) {
    if (update.url === undefined) {
      throw new Error('Expected the result of "checkForUpdates()" with a "url" and "sha512".');
    }

    await fs.promises.mkdir(this.options.temporaryDirectory, { recursive: true });
    const destinationPath = path.join(
      this.options.temporaryDirectory,
      `${update.version ?? 'update'}-${path.basename(new URL(update.url).pathname)}`,
    );
    await downloadVerified({
      update,
      destinationPath,
      packageName: 'The app',
      onProgress: options.onProgress,
    });
    return destinationPath;
  }

  /**
   * Team identifier the app at `appPath` is signed with, or `undefined` if it
   * is unsigned or signed ad-hoc.
   * @private
   * @param {string} appPath
   * @returns {Promise<string | undefined>}
   */
  async getTeamIdentifier(appPath) {
    const { code, stderr } = await exec(this.options.codesignPath, ['-dv', '--verbose=2', appPath], 'codesign');
    if (code !== 0) {
      return undefined;
    }
    const teamIdentifier = /^TeamIdentifier=(.+)$/m.exec(stderr)?.[1]?.trim();
    return teamIdentifier === undefined || teamIdentifier === 'not set' ? undefined : teamIdentifier;
  }

  /**
   * Replace the running app with the one in the zip at `filePath`.
   *
   * The zip is unpacked next to the app, so the two bundles can be swapped
   * with renames, which are atomic within a directory. If the running app is
   * signed with a Developer ID, the new app must have a valid signature from
   * the same team, or nothing is replaced.
   * @param {string} filePath - Path returned by `downloadUpdate`.
   * @returns {Promise<void>}
   */
  async install(filePath) {
    const appPath = this.getAppPath();
    const parentDir = path.dirname(appPath);
    const appName = path.basename(appPath);
    const stagingDir = path.join(parentDir, `.${appName}.update-${process.pid}`);
    const oldAppPath = path.join(parentDir, `.${appName}.old-${process.pid}`);

    try {
      await fs.promises.rm(stagingDir, { recursive: true, force: true });
      await fs.promises.mkdir(stagingDir);
    } catch (error) {
      throw new Error(`Unable to update ${appPath}. Is ${parentDir} writable?`, { cause: error });
    }

    try {
      /* `ditto` restores the permissions, symbolic links and extended attributes the app's signature covers. */
      const unpack = await exec(this.options.dittoPath, ['-x', '-k', filePath, stagingDir], 'ditto');
      if (unpack.code !== 0) {
        throw new Error(`Unable to unpack ${filePath}: ${unpack.stderr.trim()}`);
      }

      const apps = (await fs.promises.readdir(stagingDir)).filter((entry) => entry.endsWith('.app'));
      if (apps.length !== 1) {
        throw new Error(`Expected ${filePath} to contain one .app bundle. Found: ${JSON.stringify(apps)}`);
      }
      const newAppPath = path.join(stagingDir, apps[0]);

      const teamIdentifier = await this.getTeamIdentifier(appPath);
      if (teamIdentifier !== undefined) {
        const verify = await exec(this.options.codesignPath, ['--verify', '--deep', '--strict', newAppPath], 'codesign');
        if (verify.code !== 0) {
          throw new Error(`The update's code signature is not valid: ${verify.stderr.trim()}`);
        }
        const newTeamIdentifier = await this.getTeamIdentifier(newAppPath);
        if (newTeamIdentifier !== teamIdentifier) {
          throw new Error(`The update is signed by ${JSON.stringify(newTeamIdentifier)}, not by ${JSON.stringify(teamIdentifier)} like the running app.`);
        }
      }

      await fs.promises.rename(appPath, oldAppPath);
      try {
        await fs.promises.rename(newAppPath, appPath);
      } catch (error) {
        await fs.promises.rename(oldAppPath, appPath);
        throw error;
      }
    } finally {
      await fs.promises.rm(stagingDir, { recursive: true, force: true });
    }

    /* The running process keeps its files open, so the old bundle can go now. */
    await fs.promises.rm(oldAppPath, { recursive: true, force: true });
    await fs.promises.rm(filePath, { force: true });
  }

  /**
   * Start the (updated) app and quit the running application.
   * @param {string[]} [args] - Arguments passed to the new process.
   * @returns {void}
   */
  restart(args = []) {
    /* `-n` starts a new instance even though this one is still running. */
    const child = child_process.spawn(
      this.options.openPath,
      ['-n', this.getAppPath(), ...(args.length > 0 ? ['--args', ...args] : [])],
      { detached: true, stdio: 'ignore' },
    );
    child.unref();
    quitApp();
  }
}

export default MacUpdater;
export { findAppBundle };
