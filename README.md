node-webkit-updater
=======
This is node-webkit autoupdater.

```
npm install node-webkit-updater
```

Covered by tests and works for [linux](http://screencast.com/t/Je2ptbHhP), [windows](http://screencast.com/t/MSTKqVS3) and [mac](http://screencast.com/t/OXyC5xoA).
### how to run the tests
```
git clone git@github.com:edjafarov/updater.git
cd updater
npm install
cd app
npm install
cd ..
npm test
```

## API
As a reference you can use [example](https://github.com/edjafarov/updater/blob/master/app/index.html).
### new updater(manifest)

Creates new instance of updater. Manifest could be a package.json of project.

```json
{
    "name": "updapp",
    "version": "0.0.2",
    "author": "Eldar Djafarov <djkojb@gmail.com>",
    "manifestUrl": "http://localhost:3000/package.json",
    "packages": {
        "mac": "http://localhost:3000/releases/updapp/mac/updapp.dmg",
        "win": "http://localhost:3000/releases/updapp/win/updapp.zip",
        "linux32": "http://localhost:3000/releases/updapp/linux32/updapp.tar.gz"
    }
}
```

Inside manifest, you need to specify where to download packages from for all supported OS'es, manifest url where this manifest could be found and version of the app.

### updater:checkNewVersion(cb)

Will check version of application by checking manifest specified in manufestUrl. Callback will be executed if the version was changed.
### updater:download(cb)

Will download the new app version in temporary folder.

### updater:unpack(filename, cb)

Will unpack the `filename` in temporary folder.

### updater:runInstaller(appPath, args, options)

Runs installer

### updater:getAppPath()

Returns executed application path

### updater:getAppExec()

Returns current application executable

### updater:install(copyPath, cb)

Installs the app (copies current application to copyPath)

### updater:run(execPath, args, options)

Runs the app from original path.

