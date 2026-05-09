const os = await import('node:os');

function semverGt(v1, v2) {
  const [major1, minor1, patch1] = v1.replace(/^v/i, '').split('.').map(Number);
  const [major2, minor2, patch2] = v2.replace(/^v/i, '').split('.').map(Number);

  if (major1 !== major2) {
    return major1 > major2;
  }
  if (minor1 !== minor2) {
    return minor1 > minor2;
  }
  return patch1 > patch2;
}

/**
 * @typedef {object} Platform
 * @property {string} url - The URL to the package
 * @property {string} execPath - The path to the executable
 */

/**
 * @typedef {object} Packages
 * @property {Platform} win - The Windows package
 * @property {Platform} mac - The macOS package
 * @property {Platform} linux32 - The Linux 32-bit package
 * @property {Platform} linux64 - The Linux 64-bit package
 */

/**
 * @typedef {object} Manifest
 * @property {string} name - The name of the application
 * @property {string} version - The current version of the application
 * @property {string} manifestUrl - The URL to the remote manifest file
 * @property {Packages} packages - The packages for the application
 */

/**
 * @typedef {object} UpdaterOptions
 * @property {string} temporaryDirectory - The path to a directory to download the updates to and unpack them in. Defaults to [`os.tmpdir()`](https://nodejs.org/api/os.html#os_os_tmpdir)
 */

class Updater {

  /**
   * Creates new instance of Updater.
   * 
   * @constructor
   * @param {Manifest} manifest - See the [manifest schema](https://github.com/nwutils/updater?tab=readme-ov-file#manifest-schema).
   * @param {UpdaterOptions} options - Optional
   */
  constructor(manifest, options) {
    this.manifest = manifest;
    this.options = {
      temporaryDirectory: options && options.temporaryDirectory || os.tmpdir(),
    };
  }

  /**
  * Check the latest available version of the application by requesting the manifest specified in `manifestUrl`.
  *
  * @async
  * @method
  * @param {(error: Error|null, newerVersionExists: boolean, remoteManifest: object|null) => void} cb
  * @returns {void}
  */
  checkNewVersion(cb) {
    const currentVersion = this.manifest.version;

    fetch(this.manifest.manifestUrl)
      .then((response) => {
        if (!response.ok) {
          throw new Error(`HTTP error: ${response.status}`);
        }
        return response.json();
      })
      .then((data) => {
        const latestVersion = data.version;

        cb(null, semverGt(latestVersion, currentVersion), data);
      })
      .catch((error) => {
        cb(error, false, null);
      });
  }
}

export default Updater;
