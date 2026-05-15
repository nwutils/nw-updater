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
    osx: Platform;
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
    /**
       * Returns executed application path.
       *
       * @returns {string}
       */
    getAppPath(): string;
    /**
     * Returns current application executable.
     *
     * @returns {string}
     */
    getAppExec(): string;
    /**
       * Unpack the `filename` in temporary folder.
       * For Windows, [unzip](https://www.mkssoftware.com/docs/man1/unzip.1.asp) is used (which is [not signed](https://github.com/nwutils/updater/issues/68)).
       *
       * @param {string} filename
       * @param {function} cb - Callback arguments: error, unpacked directory
       * @param {object} manifest
       */
    unpack(filename: string, cb: Function, manifest: object): void;
}
