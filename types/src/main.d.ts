declare const updater: any;
export default updater;
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
