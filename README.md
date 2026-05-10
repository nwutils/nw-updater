
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

let downloadStatus = "";
updater.download((err, filePath) => {
   if (err) {
      downloadStatus = `Error downloading update: ${err.message}`;
      return;
   }
   downloadStatus = "Update downloaded successfully at " + filePath;
   downloadedFilePath = filePath;
}, newManifest);

updater.download();
```

## API

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

An example manifest:

```json
{
    "name": "updapp",
    "version": "0.0.2",
    "author": "Eldar Djafarov <djkojb@gmail.com>",
    "manifestUrl": "http://localhost:3000/package.json",
    "packages": {
        "mac": {
           "url": "http://localhost:3000/releases/updapp/mac/updapp.zip"
        },
        "win": {
           "url": "http://localhost:3000/releases/updapp/win/updapp.zip"
        },
        "linux32": {
           "url": "http://localhost:3000/releases/updapp/linux32/updapp.tar.gz"
        }
    }
}
```

The manifest could be a `package.json` of project, but doesn't have to be.

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

## Roadmap

1. Check the manifest for version (from your running "old" app).
2. If the version is different from the running one, download new package to a temp directory.
3. Unpack the package in temp.
4. Run new app from temp and kill the old one (i.e. still all from the running app).
5. The new app (in temp) will copy itself to the original folder, overwriting the old app.
6. The new app will run itself from original folder and exit the process.

## Contributing

### External contributor

- Use Node.js standard libraries whenever possible.
- Prefer to use syncronous APIs over modern APIs which have been introduced in later versions.

### Maintainer

- npm trusted publishing is used for releases
- a package is released when a maintainer creates a release note for a specific version
