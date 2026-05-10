const fs = await import('node:fs');
const os = await import('node:os');
const path = await import('node:path');
const process = await import('node:process');
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
 * @property {Platform} osx - The macOS package
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

function getHost() {
  let platform;

  switch (process.platform) {
    case 'win32':
      platform = 'windows';
      break;

    case 'darwin':
      platform = 'macos';
      break;

    case 'linux':
      platform = 'linux';
      break;

    default:
      throw new Error(`Unsupported platform: ${process.platform}`);
  }

  const arch = process.arch;

  return `${platform}-${arch}`;

}

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
    const url = manifest.packages[getHost()].url;

    const filename = decodeURI(path.basename(url));

    fs.mkdirSync(this.options.temporaryDirectory, { recursive: true });
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

        return stream.promises.pipeline(
          response.body,
          writeStream
        );
      })
      .then(() => {
        cb(null, destinationPath);
      })
      .catch((err) => {
        cb(err, null);
      });
  }

  /**
     * Returns executed application path.
     * 
     * @returns {string}
     */
  getAppPath() {
    /**
     * @type {Object.<string, string>}
     */
    let appPath = {
      osx: path.join(process.cwd(), '../../..'),
      win: path.dirname(process.execPath)
    };
    appPath.linux32 = appPath.win;
    appPath.linux64 = appPath.win;
    return appPath[getHost()];
  }

  /**
   * Returns current application executable.
   * 
   * @returns {string}
   */
  getAppExec() {
    let execFolder = this.getAppPath();
    let exec = {
      osx: '',
      win: path.basename(process.execPath),
      linux32: path.basename(process.execPath),
      linux64: path.basename(process.execPath)
    };
    return path.join(execFolder, exec[platform]);
  }

  /**
     * Unpack the `filename` in temporary folder.
     * For Windows, [unzip](https://www.mkssoftware.com/docs/man1/unzip.1.asp) is used (which is [not signed](https://github.com/nwutils/updater/issues/68)).
     *
     * @param {string} filename
     * @param {function} cb - Callback arguments: error, unpacked directory
     * @param {object} manifest
     */
  unpack(filename, cb, manifest) {
    pUnpack[platform](filename, cb, manifest, this.options.temporaryDirectory);
  }
}

export default Updater;
