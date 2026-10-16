const child_process = await import('node:child_process');
const fs = await import('node:fs');
const os = await import('node:os');
const path = await import('node:path');
const process = await import('node:process');

import { checkUpdateInfo, downloadVerified, parseYaml, quitApp, updateInfoFileName } from './publish.js';

/**
 * Contents of the `app-update.yml` file `@nwutils/packager` embeds next to the
 * NW.js executable inside the AppImage.
 * @typedef {import('./publish.js').PublishConfig} PublishConfig
 */

/**
 * @typedef {object} AppImageUpdaterOptions
 * @property {'manifest' | 'zsync'} [method='manifest'] - `'manifest'` uses the `latest-linux.yml` update info file published next to the AppImage, the same way electron-updater does. `'zsync'` delegates to `appimageupdatetool` and the update information embedded in the AppImage.
 * @property {string} [currentVersion] - Version of the running application, eg. `nw.App.manifest.version`. Required by the `'manifest'` method.
 * @property {string} [appImagePath] - Path to the running AppImage. Defaults to the `APPIMAGE` environment variable the AppImage runtime sets.
 * @property {string} [configPath] - Path to `app-update.yml`. Defaults to the file next to the NW.js executable.
 * @property {string} [temporaryDirectory] - Directory updates are downloaded to. Defaults to [`os.tmpdir()`](https://nodejs.org/api/os.html#os_os_tmpdir).
 * @property {string} [appImageUpdateTool='appimageupdatetool'] - `appimageupdatetool` executable used by the `'zsync'` method.
 */

/**
 * @typedef {import('./publish.js').UpdateCheckResult} UpdateCheckResult
 */

/**
 * @typedef {import('./publish.js').DownloadProgress} DownloadProgress
 */

/**
 * Run `file` with `args`, resolving with its exit code.
 * @param {string} file
 * @param {string[]} args
 * @returns {Promise<number>}
 */
function execExitCode(file, args) {
  return new Promise((resolve, reject) => {
    const child = child_process.spawn(file, args, { stdio: 'ignore' });
    child.on('error', (error) => {
      if (/** @type {NodeJS.ErrnoException} */ (error).code === 'ENOENT') {
        reject(new Error(`"${file}" was not found. Install AppImageUpdate's "appimageupdatetool" to use the "zsync" update method.`));
      } else {
        reject(error);
      }
    });
    child.on('close', (code) => resolve(code ?? 1));
  });
}

/**
 * Self updates a NW.js application packaged as an AppImage by
 * `@nwutils/packager` with `publish` set.
 */
class AppImageUpdater {

  /**
   * @param {AppImageUpdaterOptions} [options]
   */
  constructor(options = {}) {
    if (options.method !== undefined && options.method !== 'manifest' && options.method !== 'zsync') {
      throw new Error(`Expected "options.method" to be "manifest" or "zsync". Received: ${JSON.stringify(options.method)}`);
    }
    this.options = {
      method: options.method ?? 'manifest',
      currentVersion: options.currentVersion,
      appImagePath: options.appImagePath ?? process.env.APPIMAGE,
      configPath: options.configPath ?? path.join(path.dirname(process.execPath), 'app-update.yml'),
      temporaryDirectory: options.temporaryDirectory ?? os.tmpdir(),
      appImageUpdateTool: options.appImageUpdateTool ?? 'appimageupdatetool',
    };
  }

  /**
   * Path to the running AppImage.
   * @private
   * @returns {string}
   */
  getAppImagePath() {
    if (this.options.appImagePath === undefined || this.options.appImagePath === '') {
      throw new Error('The application is not running from an AppImage: the "APPIMAGE" environment variable is not set.');
    }
    return this.options.appImagePath;
  }

  /**
   * Check whether a newer version is published.
   *
   * With the `'manifest'` method this downloads the `latest-linux.yml` update
   * info file for the running architecture and compares its version with
   * `currentVersion` using semantic versioning. With the `'zsync'` method it
   * runs `appimageupdatetool --check-for-update`.
   * @returns {Promise<UpdateCheckResult>}
   */
  async checkForUpdates() {
    const appImagePath = this.getAppImagePath();

    if (this.options.method === 'zsync') {
      const exitCode = await execExitCode(this.options.appImageUpdateTool, ['-j', appImagePath]);
      if (exitCode !== 0 && exitCode !== 1) {
        throw new Error(`"${this.options.appImageUpdateTool} -j" failed with exit code ${exitCode}. Does the AppImage embed update information?`);
      }
      /* `-j` exits with 1 when an update is available, 0 when it isn't. */
      return { updateAvailable: exitCode === 1 };
    }

    return checkUpdateInfo({
      currentVersion: this.options.currentVersion,
      configPath: this.options.configPath,
      fileName: updateInfoFileName(process.arch, 'linux'),
      packageName: 'the AppImage',
    });
  }

  /**
   * Download the update found by `checkForUpdates`.
   *
   * With the `'manifest'` method the new AppImage is downloaded to
   * `temporaryDirectory` and verified against the published size and SHA-512
   * digest - pass the returned path to `install`. With the `'zsync'` method
   * `appimageupdatetool` downloads only the changed blocks and replaces the
   * running AppImage in place, so the returned path is the AppImage itself and
   * `install` has nothing left to do.
   * @param {UpdateCheckResult} update
   * @param {{onProgress?: (progress: DownloadProgress) => void}} [options]
   * @returns {Promise<string>} Path to the downloaded AppImage.
   */
  async downloadUpdate(update, options = {}) {
    const appImagePath = this.getAppImagePath();

    if (this.options.method === 'zsync') {
      const exitCode = await execExitCode(this.options.appImageUpdateTool, ['-O', appImagePath]);
      if (exitCode !== 0) {
        throw new Error(`"${this.options.appImageUpdateTool}" failed with exit code ${exitCode}.`);
      }
      return appImagePath;
    }

    await fs.promises.mkdir(this.options.temporaryDirectory, { recursive: true });
    const destinationPath = path.join(
      this.options.temporaryDirectory,
      `${path.basename(appImagePath)}.${update.version ?? 'update'}.download`,
    );
    await downloadVerified({
      update,
      destinationPath,
      packageName: 'The AppImage',
      onProgress: options.onProgress,
    });
    return destinationPath;
  }

  /**
   * Replace the running AppImage with the one at `filePath`. The running
   * process keeps working from the old, already mounted image until it
   * exits - call `restart` to switch to the new version.
   * @param {string} filePath - Path returned by `downloadUpdate`.
   * @returns {Promise<void>}
   */
  async install(filePath) {
    const appImagePath = this.getAppImagePath();
    if (path.resolve(filePath) === path.resolve(appImagePath)) {
      return;
    }

    /*
     * Copy next to the AppImage first, then rename over it: a rename within
     * a directory is atomic, so the AppImage is never left half written, and
     * works even though the old file is still in use.
     */
    const stagingPath = path.join(
      path.dirname(appImagePath),
      `.${path.basename(appImagePath)}.update-${process.pid}`,
    );
    try {
      await fs.promises.copyFile(filePath, stagingPath);
      await fs.promises.chmod(stagingPath, 0o755);
      await fs.promises.rename(stagingPath, appImagePath);
    } catch (error) {
      await fs.promises.rm(stagingPath, { force: true });
      throw new Error(`Unable to replace ${appImagePath}. Is its directory writable?`, { cause: error });
    }
    await fs.promises.rm(filePath, { force: true });
  }

  /**
   * Start the (updated) AppImage and quit the running application.
   * @param {string[]} [args] - Arguments passed to the new process.
   * @returns {void}
   */
  restart(args = []) {
    const child = child_process.spawn(this.getAppImagePath(), args, {
      detached: true,
      stdio: 'ignore',
    });
    child.unref();
    quitApp();
  }
}

export default AppImageUpdater;
export { parseYaml, updateInfoFileName };
