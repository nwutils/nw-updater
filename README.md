node-webkit-updater
=======
This is [node-webkit](https://github.com/rogerwang/node-webkit) autoupdater.

```
npm install node-webkit-updater
```

Covered by tests and works for [linux](http://screencast.com/t/Je2ptbHhP), [windows](http://screencast.com/t/MSTKqVS3) and [mac](http://screencast.com/t/OXyC5xoA).
### How to run the tests
```
git clone git@github.com:edjafarov/updater.git
cd updater
npm install
cd app
npm install
cd ..
npm test
```

## Quick Start
```javascript
var pkg = require('../package.json'); // Insert your app's manifest here
var updater = require('node-webkit-updater');
var upd = new updater(pkg);

/* Checks the remote manifest for latest available version and calls the autoupgrading function */
upd.checkNewVersion(function(error, manifest) {
	if (!error) {
		// Insert your user download choice/version comparison code here
		upgradeNow();
	}
});

/* Downloads the new version, unpacks it, replaces the existing files, runs the new version, and exits the old app */
function upgradeNow() {
	var newVersion = upd.download(function(error, filename) {
		if (!error) {
			upd.unpack(filename, function(error, newAppPath) {
				if (!error) {
					upd.runInstaller(newAppPath, [upd.getAppPath(), upd.getAppExec()],{});
					process.exit();
				}
			});
		}
	});
}
```


## API
As a reference you can use the [example](https://github.com/edjafarov/updater/blob/master/app/index.html).
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

Inside the app manifest, you need to specify where to download packages from for all supported OS'es, a manifest url where this manifest can be found and the current version of the app.

Note that compressed apps are assumed to be downloaded in the format produced by [node-webkit-builder](https://github.com/mllrsohn/node-webkit-builder) (or [grunt-node-webkit-builder](https://github.com/mllrsohn/grunt-node-webkit-builder)).

### updater:checkNewVersion(cb)

Will check the latest available version of the application by requesting the manifest specified in manufestUrl. The callback will be executed if the version was changed.

Callback arguments: error, remote version

### updater:download(cb)

Will download the new app version in a temporary folder.

Callback arguments: error, downloaded filepath

### updater:unpack(filename, cb)

Will unpack the `filename` in temporary folder.

Callback arguments: error, unpacked directory

### updater:runInstaller(appPath, args, options)

Runs installer

### updater:getAppPath()

Returns executed application path

### updater:getAppExec()

Returns current application executable

### updater:install(copyPath, cb)

Installs the app (copies current application to copyPath)

Callback arguments: error

### updater:run(execPath, args, options)

Runs the app from original path.

## troubleshooting

to run the test on mac `ulimit -n 10240`
