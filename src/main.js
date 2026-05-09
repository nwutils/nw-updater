const fs = await import('node:fs');
const os = await import('node:os');
const path = await import('node:path');
const stream = await import('node:stream');

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

  /**
   * Downloads the new app to a temporary folder.
   *
   * @async
   * @method
   * @param {(error: Error|null, filepath: string|null) => void} cb
   * @param {Manifest} newManifest
   * @returns {void}
   */
  download(cb, newManifest) {
    const manifest = newManifest ?? this.manifest;
    const url = manifest.packages[platform].url;

    const filename = decodeURI(path.basename(url));

    const destinationPath = path.resolve(
      this.options.temporaryDirectory,
      filename
    );

    const writeStream = fs.createWriteStream(destinationPath);

    fetch(url)
      .then((response) => {
        if (!response.ok) {
          throw new Error(
            `Failed to download update: ${response.status} ${response.statusText}`
          );
        }

        if (!response.body) {
          throw new Error('Response body is not readable');
        }

        // Web ReadableStream -> Node.js Readable
        const readable = stream.Readable.fromWeb(response.body);
        return stream.promises.pipeline(readable, writeStream);
      })
      .then(() => {
        cb(null, destinationPath);
      })
      .catch((err) => {
        cb(err, null);
      });
  }
}

export default Updater;
