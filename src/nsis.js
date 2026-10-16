const child_process = await import('node:child_process');
const fs = await import('node:fs');
const os = await import('node:os');
const path = await import('node:path');
const process = await import('node:process');

import { checkUpdateInfo, downloadVerified, quitApp, updateInfoFileName } from './publish.js';

/**
 * @typedef {object} NsisUpdaterOptions
 * @property {string} [currentVersion] - Version of the running application, eg. `nw.App.manifest.version`. Required.
 * @property {string} [configPath] - Path to `app-update.yml`. Defaults to the file next to the NW.js executable, where the installer puts it.
 * @property {string} [temporaryDirectory] - Directory updates are downloaded to. Defaults to [`os.tmpdir()`](https://nodejs.org/api/os.html#os_os_tmpdir).
 */

/**
 * @typedef {import('./publish.js').UpdateCheckResult} UpdateCheckResult
 */

/**
 * @typedef {import('./publish.js').DownloadProgress} DownloadProgress
 */

/**
 * Self updates a NW.js application installed by an NSIS installer built by
 * `@nwutils/packager` with `publish` set.
 *
 * The application's files can't be replaced while it runs, so `install`
 * starts the new installer with `/S /UPDATE` and `restart` quits the
 * application. The installer waits for it to exit, updates it silently and
 * starts the new version. It installs for the current user, so updating never
 * asks for administrator rights.
 */
class NsisUpdater {

  /**
   * @param {NsisUpdaterOptions} [options]
   */
  constructor(options = {}) {
    this.options = {
      currentVersion: options.currentVersion,
      configPath: options.configPath ?? path.join(path.dirname(process.execPath), 'app-update.yml'),
      temporaryDirectory: options.temporaryDirectory ?? os.tmpdir(),
    };
    /**
     * True once `install` has started the installer.
     * @private
     * @type {boolean}
     */
    this.installerStarted = false;
  }

  /**
   * Check whether a newer version is published.
   *
   * This downloads the `latest.yml` update info file (`latest-<arch>.yml` for
   * architectures other than `x64`) and compares its version with
   * `currentVersion` using semantic versioning.
   * @returns {Promise<UpdateCheckResult>}
   */
  async checkForUpdates() {
    return checkUpdateInfo({
      currentVersion: this.options.currentVersion,
      configPath: this.options.configPath,
      fileName: updateInfoFileName(process.arch, 'win'),
      packageName: 'the installer',
    });
  }

  /**
   * Download the installer found by `checkForUpdates` to
   * `temporaryDirectory`, and verify it against the published size and
   * SHA-512 digest. Pass the returned path to `install`.
   * @param {UpdateCheckResult} update
   * @param {{onProgress?: (progress: DownloadProgress) => void}} [options]
   * @returns {Promise<string>} Path to the downloaded installer.
   */
  async downloadUpdate(update, options = {}) {
    if (update.url === undefined) {
      throw new Error('Expected the result of "checkForUpdates()" with a "url" and "sha512".');
    }

    await fs.promises.mkdir(this.options.temporaryDirectory, { recursive: true });
    /* Keep the `.exe` extension, which Windows needs to run the file. */
    const destinationPath = path.join(
      this.options.temporaryDirectory,
      `${update.version ?? 'update'}-${path.basename(new URL(update.url).pathname)}`,
    );
    await downloadVerified({
      update,
      destinationPath,
      packageName: 'The installer',
      onProgress: options.onProgress,
    });
    return destinationPath;
  }

  /**
   * Start the installer at `filePath` in the background, with `/S /UPDATE`.
   * It waits up to 60 seconds for the application to exit before it updates
   * anything, so call `restart` next.
   * @param {string} filePath - Path returned by `downloadUpdate`.
   * @returns {Promise<void>}
   */
  async install(filePath) {
    try {
      await fs.promises.access(filePath);
    } catch (error) {
      throw new Error(`Unable to find the installer at ${filePath}.`, { cause: error });
    }

    await new Promise((resolve, reject) => {
      const child = child_process.spawn(filePath, ['/S', '/UPDATE'], {
        detached: true,
        stdio: 'ignore',
      });
      child.once('error', (error) => reject(new Error(`Unable to start the installer at ${filePath}.`, { cause: error })));
      child.once('spawn', () => {
        child.unref();
        resolve(undefined);
      });
    });
    this.installerStarted = true;
  }

  /**
   * Quit the application. After `install`, the installer then updates it and
   * starts the new version. Without a pending update, this starts the
   * application again with `args`.
   * @param {string[]} [args] - Arguments passed to the new process. Not supported after `install`: the installer starts the new version without arguments.
   * @returns {void}
   */
  restart(args = []) {
    if (this.installerStarted) {
      if (args.length > 0) {
        throw new Error('"restart()" can\'t pass arguments after "install()": the installer starts the new version.');
      }
    } else {
      const child = child_process.spawn(process.execPath, args, {
        detached: true,
        stdio: 'ignore',
      });
      child.unref();
    }
    quitApp();
  }
}

export default NsisUpdater;
