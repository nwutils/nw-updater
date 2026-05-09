export default Updater;
export type Platform = {
    /**
     * - The URL to the package
     */
    url: string;
    /**
     * - The path to the executable
     */
    execPath: string;
};
export type Packages = {
    /**
     * - The Windows package
     */
    win: Platform;
    /**
     * - The macOS package
     */
    mac: Platform;
    /**
     * - The Linux 32-bit package
     */
    linux32: Platform;
    /**
     * - The Linux 64-bit package
     */
    linux64: Platform;
};
export type Manifest = {
    /**
     * - The name of the application
     */
    name: string;
    /**
     * - The current version of the application
     */
    version: string;
    /**
     * - The URL to the remote manifest file
     */
    manifestUrl: string;
    /**
     * - The packages for the application
     */
    packages: Packages;
};
export type UpdaterOptions = {
    /**
     * - The path to a directory to download the updates to and unpack them in. Defaults to [`os.tmpdir()`](https://nodejs.org/api/os.html#os_os_tmpdir)
     */
    temporaryDirectory: string;
};
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
declare class Updater {
    /**
     * Creates new instance of Updater.
     *
     * @constructor
     * @param {Manifest} manifest - See the [manifest schema](https://github.com/nwutils/updater?tab=readme-ov-file#manifest-schema).
     * @param {UpdaterOptions} options - Optional
     */
    constructor(manifest: Manifest, options: UpdaterOptions);
    manifest: Manifest;
    options: {
        temporaryDirectory: string;
    };
    /**
    * Check the latest available version of the application by requesting the manifest specified in `manifestUrl`.
    *
    * @async
    * @method
    * @param {(error: Error|null, newerVersionExists: boolean, remoteManifest: object|null) => void} cb
    * @returns {void}
    */
    checkNewVersion(cb: (error: Error | null, newerVersionExists: boolean, remoteManifest: object | null) => void): void;
    /**
     * Downloads the new app to a temporary folder.
     *
     * @async
     * @method
     * @param {(error: Error|null, filepath: string|null) => void} cb
     * @param {Manifest} newManifest
     * @returns {void}
     */
    download(cb: (error: Error | null, filepath: string | null) => void, newManifest: Manifest): void;
}
