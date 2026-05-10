
# @nwutils/updater

[![npm](https://img.shields.io/npm/v/node-webkit-updater.svg?style=flat)](https://www.npmjs.com/package/node-webkit-updater)
[![Join the chat at https://gitter.im/nwjs/nwjs](https://badges.gitter.im/nwjs/nwjs.svg)](https://gitter.im/nwjs/nwjs)

Update NW.js applications for Linux, MacOS and Windows platforms.

## Getting Started

1. Install [Volta](https://volta.sh/).
1. `npm i @nwutils/updater`

## Usage

```js
import Updater from "@nwutils/updater";

const updater = new Updater(nw.App.manifest);

let updateStatus = "";
let newManifest = "";
let downloadedFilePath = "";

// Check for new version via current running application.
updater.checkNewVersion((err, newerVersionExists, remoteManifest) => {
   if (err) {
      updateStatus = `Error checking for updates: ${err.message}`;
      return;
   }
   if (newerVersionExists) {
      updateStatus = "A newer version is available.";
      newManifest = remoteManifest;
   } else {
      updateStatus = "No new version available.";
   }
});

// Download to temporary directory if new version is available. 
let downloadStatus = "";
updater.download((err, filePath) => {
   if (err) {
      downloadStatus = `Error downloading update: ${err.message}`;
      return;
   }
   downloadStatus = "Update downloaded successfully at " + filePath;
   downloadedFilePath = filePath;
}, newManifest);

// Unpack the application in the temporary directory
updater.unpack();

// Run the new application from the temporary directory and kill the old one

// The new application will copy itself from the temporary directory to the directory where the previous application was running.

// The new application will run itself from the original directory and exit the process.
```

## API Schema

| Method | Arguments | Return Type | Description |
| ------ | --------- | ----------- | ----------- |
| new Updater | `manifest: object, options: object \| undefined` | `void` | Creates a new instance of Updater. See the [manifest schema](#manifest-schema) below. |
| checkNewVersion | `cb: (error: Error, newerVersionExists: boolean, remoteManifest: object) => void` | `void` | Checks the latest version of the application by requesting manifest at `manifestUrl`. Semantic versioning is used when comparing versions. |
| download | `cb: (error: Error, filepath: string) => void, newManifest: object` | `void` | Checks the latest version of the application by requesting manifest at `manifestUrl`. Downloads the new app to a temporary folder. |
| getAppPath | | `string` | Returns the executed application path. |
| getAppExec | | `string` | Returns the current application path. |
| unpack | `filename: string, cb: (error: Error, unpackedDir: string) => void, manifest: object` | `string` | Returns the executed application path. |

<a name="updater#runInstaller"></a>

#### updater.runInstaller(appPath, args, options)

Runs installer

**Params**

- appPath `string`  
- args `array` - Arguments which will be passed when running the new app  
- options `object` - Optional  

**Returns**: `function`  
<a name="updater#install"></a>

#### updater.install(copyPath, cb)

Installs the app (copies current application to `copyPath`)

**Params**

- copyPath `string`  
- cb `function` - Callback arguments: error  

<a name="updater#run"></a>

#### updater.run(execPath, args, options)

Runs the app from original app executable path.

**Params**

- execPath `string`  
- args `array` - Arguments passed to the app being ran.  
- options `object` - Optional. See `spawn` from nodejs docs.

Note: if this doesn't work, try `gui.Shell.openItem(execPath)` (see [node-webkit Shell](https://github.com/rogerwang/node-webkit/wiki/Shell)).  

---

## Manifest Schema

Example usage:

```json
{
    "name": "demo",
    "version": "0.0.1",
    "author": "NW.js Utils <contact@nwutils.io>",
    "manifestUrl": "http://localhost:3000/manifest.json",
    "packages": {
        "linux-x64": {
           "url": "http://localhost:3000/demo-0.0.1-linux-x64.zip"
        },
        "osx-arm64": {
           "url": "http://localhost:3000/demo-0.0.1-osx-arm64.zip"
        },
        "win-x64": {
           "url": "http://localhost:3000/demo-0.0.1-win-x64.zip"
        },
    }
}
```

> Note: The manifest could be a `package.json` of project, but doesn't have to be.

### manifest.name

The name of your app. From time, it is assumed your Mac app is called `<manifest.name>.app`, your Windows executable is `<manifest.name>.exe`, etc.

### manifest.version

[semver](http://semver.org) version of your app.

### manifest.manifestUrl

The URL where your latest manifest is hosted; where node-webkit-updater looks to check if there is a newer version of your app available.

### manifest.packages

An "object" containing an object for each OS your app (at least this version of your app) supports; `mac`, `win`, `linux32`, `linux64`.

### manifest.packages.{mac, win, linux32, linux64}.url

Each package has to contain a `url` property pointing to where the app (for the version & OS in question) can be downloaded.

### manifest.packages.{mac, win, linux32, linux64}.execPath (Optional)

It's assumed your app is stored at the root of your package, use this to override that and specify a path (relative to the root of your package).

This can also be used to override `manifest.name`; e.g. if your `manifest.name` is `helloWorld` (therefore `helloWorld.app` on Mac) but your Windows executable is named `nw.exe`. Then you'd set `execPath` to `nw.exe`

## Contributing

### External contributor

- Use Node.js standard libraries whenever possible.
- Prefer to use syncronous APIs over modern APIs which have been introduced in later versions.

### Maintainer

- npm trusted publishing is used for releases
- a package is released when a maintainer creates a release note for a specific version
