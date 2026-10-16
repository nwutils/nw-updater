# @nwutils/updater

[![npm](https://img.shields.io/npm/v/@nwutils/updater/latest)](https://www.npmjs.com/package/@nwutils/updater/v/latest)

Self update NW.js applications packaged by
[`@nwutils/packager`](https://www.npmjs.com/package/@nwutils/packager), or
`nw-builder` in package mode, with `publish` set:

| Platform | Package        | Updater           |
| -------- | -------------- | ----------------- |
| Linux    | AppImage       | `AppImageUpdater` |
| Windows  | NSIS installer | `NsisUpdater`     |
| MacOS    | DMG            | `MacUpdater`      |

All three follow electron-updater's approach. The packager ships an
`app-update.yml` (where releases are published) with the app, and writes an
update info file (version, file name, size, SHA-512) next to each release.
Upload both to every release. The updater reads `app-update.yml`, downloads the
update info file, and compares versions with semantic versioning. For GitHub it
uses `https://github.com/<owner>/<repo>/releases/latest/download/`, so no API
token is needed.

## Getting Started

1. `npm i @nwutils/updater`

The updater only uses Node.js built-in modules, imported as ES modules. Enable
NW.js' [ES module support](https://nwjs.io/blog/v0.98.2) in your app's
`package.json`:

```json
{
  "chromium-args": "--enable-features=NWESM,NWChainImportNode"
}
```

> In a module loaded by your page at startup, import Node.js built-ins
> dynamically, eg. `const fs = await import("node:fs")`; a static
> `import fs from "node:fs"` fails to load there. Since module scripts may
> finish evaluating after `DOMContentLoaded` has fired, check
> `document.readyState` before waiting for that event.

## Self updating AppImages

`AppImageUpdater` updates a Linux app packaged as an AppImage by
[`@nwutils/packager`](https://www.npmjs.com/package/@nwutils/packager) with
`publish` set. It follows electron-updater's approach: the packager embeds an
`app-update.yml` (where releases are published) in the AppImage and writes a
`latest-linux.yml` update info file (version, file name, size, SHA-512) next to
it. Upload both the AppImage and `latest-linux.yml` to every release.

```js
import { AppImageUpdater } from "@nwutils/updater";

const updater = new AppImageUpdater({
  currentVersion: nw.App.manifest.version,
});

const update = await updater.checkForUpdates();
if (update.updateAvailable) {
  const filePath = await updater.downloadUpdate(update, {
    onProgress: ({ transferred, total }) => console.log(transferred, total),
  });
  await updater.install(filePath);
  updater.restart();
}
```

1. `checkForUpdates()` reads `app-update.yml` and downloads
   `latest-linux.yml` (`latest-linux-<arch>.yml` for architectures other than
   `x64`). For GitHub it uses
   `https://github.com/<owner>/<repo>/releases/latest/download/`, so no API
   token is needed. It then compares the published version with
   `currentVersion` using semantic versioning.
1. `downloadUpdate()` downloads the new AppImage to `temporaryDirectory` and
   checks its size and SHA-512 digest.
1. `install()` replaces the AppImage at `$APPIMAGE` atomically. The running app
   keeps working until it exits.
1. `restart()` starts the new AppImage and quits the app.

The AppImage's directory must be writable by the user.

### zsync

For users who prefer zsync, pass `method: "zsync"`. This uses
[AppImageUpdate](https://github.com/AppImageCommunity/AppImageUpdate)'s
`appimageupdatetool` and the update information embedded in the AppImage
(`updateInformation` in `@nwutils/packager`). Only the changed blocks are
downloaded. `appimageupdatetool` must be installed on the user's machine, and
it doesn't report the new version number.

```js
const updater = new AppImageUpdater({ method: "zsync" });

const update = await updater.checkForUpdates(); // appimageupdatetool -j
if (update.updateAvailable) {
  await updater.downloadUpdate(update); // appimageupdatetool -O: updates the AppImage in place
  updater.restart();
}
```

| Option             | Type                    | Default                                 | Description                                     |
| ------------------ | ----------------------- | --------------------------------------- | ----------------------------------------------- |
| method             | `"manifest" \| "zsync"` | `"manifest"`                            | Update via `latest-linux.yml` or zsync          |
| currentVersion     | `string`                |                                         | Running app's version. Required by `"manifest"` |
| appImagePath       | `string`                | `process.env.APPIMAGE`                  | Path to the running AppImage                    |
| configPath         | `string`                | `app-update.yml` next to the executable | Path to `app-update.yml`                        |
| temporaryDirectory | `string`                | `os.tmpdir()`                           | Directory updates are downloaded to             |
| appImageUpdateTool | `string`                | `"appimageupdatetool"`                  | `appimageupdatetool` executable for `"zsync"`   |

## Self updating NSIS installs

`NsisUpdater` updates a Windows app installed by an NSIS installer built by
[`@nwutils/packager`](https://www.npmjs.com/package/@nwutils/packager) with
`publish` set. The installer puts an `app-update.yml` next to the app's
executable, and the packager writes a `latest.yml` update info file next to
the installer. Upload both the installer and `latest.yml` to every release.

```js
import { NsisUpdater } from "@nwutils/updater";

const updater = new NsisUpdater({ currentVersion: nw.App.manifest.version });

const update = await updater.checkForUpdates();
if (update.updateAvailable) {
  const filePath = await updater.downloadUpdate(update, {
    onProgress: ({ transferred, total }) => console.log(transferred, total),
  });
  await updater.install(filePath);
  updater.restart();
}
```

1. `checkForUpdates()` reads `app-update.yml` and downloads `latest.yml`
   (`latest-<arch>.yml` for architectures other than `x64`), the same way
   `AppImageUpdater` does.
1. `downloadUpdate()` downloads the new installer to `temporaryDirectory` and
   checks its size and SHA-512 digest.
1. `install()` starts the installer in the background with `/S /UPDATE`.
   Windows can't replace the files of a running app, so it waits up to 60
   seconds for the app to exit.
1. `restart()` quits the app. The installer then updates it silently and starts
   the new version. Arguments can't be passed to the new version this way.

The installer installs for the current user, so updating never asks for
administrator rights. Build the published installer with a version of
`@nwutils/packager` that supports `/UPDATE`. An older one asks the user to close
the app, which nobody sees in silent mode, so the update is cancelled.

| Option             | Type     | Default                                 | Description                         |
| ------------------ | -------- | --------------------------------------- | ----------------------------------- |
| currentVersion     | `string` |                                         | Running app's version. Required     |
| configPath         | `string` | `app-update.yml` next to the executable | Path to `app-update.yml`            |
| temporaryDirectory | `string` | `os.tmpdir()`                           | Directory updates are downloaded to |

## Self updating DMGs

`MacUpdater` updates a MacOS app packaged as a DMG. Updates don't use the DMG:
the packager also writes a `<appName>-<arch>-mac.zip` of the app and a
`latest-mac.yml` update info file (`latest-mac-<arch>.yml` for architectures
other than `x64`) next to it, and puts `app-update.yml` in the app's
`Contents/Resources`. Upload the DMG, the zip and `latest-mac.yml` to every
release.

```js
import { MacUpdater } from "@nwutils/updater";

const updater = new MacUpdater({ currentVersion: nw.App.manifest.version });

const update = await updater.checkForUpdates();
if (update.updateAvailable) {
  const filePath = await updater.downloadUpdate(update, {
    onProgress: ({ transferred, total }) => console.log(transferred, total),
  });
  await updater.install(filePath);
  updater.restart();
}
```

1. `checkForUpdates()` reads `app-update.yml` and downloads `latest-mac.yml`.
1. `downloadUpdate()` downloads the zip to `temporaryDirectory` and checks its
   size and SHA-512 digest.
1. `install()` unpacks the zip with `ditto` next to the running app, then swaps
   the two bundles with renames. The running app keeps working until it quits.
1. `restart()` starts the new version with `open -n` and quits the app.

If the running app is signed with a Developer ID, `install()` only accepts an
update that passes `codesign --verify --deep --strict` and is signed by the same
team, and leaves the app untouched otherwise. Sign and notarize every release,
eg. with the packager's `signIdentity`. The directory the app is in, usually
`/Applications`, must be writable by the user.

| Option             | Type     | Default                                | Description                         |
| ------------------ | -------- | -------------------------------------- | ----------------------------------- |
| currentVersion     | `string` |                                        | Running app's version. Required     |
| appPath            | `string` | Outermost `.app` in `process.execPath` | Path to the running app bundle      |
| configPath         | `string` | `Contents/Resources/app-update.yml`    | Path to `app-update.yml`            |
| temporaryDirectory | `string` | `os.tmpdir()`                          | Directory updates are downloaded to |

## Contributing

### External contributor

- Use Node.js standard libraries whenever possible.
- Prefer to use syncronous APIs over modern APIs which have been introduced in later versions.

### Maintainer

- Commits follow [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`, `chore:`).
- [release-please](https://github.com/googleapis/release-please) keeps a release PR open that bumps the version and updates `CHANGELOG.md` from those commits.
- Merging the release PR tags the release, creates the GitHub release and publishes to npm via trusted publishing (OIDC) with provenance - no npm token is needed.
