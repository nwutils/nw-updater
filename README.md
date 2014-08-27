node-webkit-updater [![NPM version][npm-image]][npm-url]
=======
This is [node-webkit](https://github.com/rogerwang/node-webkit)-updater.

```
npm install node-webkit-updater
```

It gives you low-level API to:

1. Check the manifest for version (from your running "old" app).
2. If the version is different from the running one, download new package to a temp directory.
3. Unpack the package in temp.
4. Run new app from temp and kill the old one (i.e. still all from the running app).
5. The new app (in temp) will copy itself to the original folder, overriding the old app.
6. The new app will run itself from original folder and exit the process.

You should build this logic by yourself though. As a reference you can use [example](app/index.html).

Covered by tests and works for [linux](http://screencast.com/t/Je2ptbHhP), [windows](http://screencast.com/t/MSTKqVS3) and [mac](http://screencast.com/t/OXyC5xoA).
### How to run the tests
```
git clone git@github.com:edjafarov/updater.git
npm run deps
npm test
```

## Quick Start
```javascript
var gui = require('nw.gui');
var pkg = require('../package.json'); // Insert your app's manifest here
var updater = require('node-webkit-updater');
var upd = new updater(pkg);

/* Checks the remote manifest for latest available version and calls the autoupgrading function */
upd.checkNewVersion(function(error, newVersionExists, manifest) {
    if (!error && newVersionExists) {
        upgradeNow(manifest);
    }
});

/* Downloads the new version, unpacks it, replaces the existing files, runs the new version, and exits the old app */
function upgradeNow(newManifest) {
    var newVersion = upd.download(function(error, filename) {
        if (!error) {
            upd.unpack(filename, function(error, newAppPath) {
                if (!error) {
                    upd.runInstaller(newAppPath, [upd.getAppPath(), upd.getAppExec()],{});
                    gui.App.quit();
                }
            }, newManifest);
        }
    }, newManifest);
}
```


## API

As a reference you can use the [example](https://github.com/edjafarov/updater/blob/master/app/index.html).

<a name="new_updater"></a>
###new updater(manifest)
Creates new instance of updater. Manifest could be a `package.json` of project.

```json
{
    "name": "updapp",
    "version": "0.0.2",
    "author": "Eldar Djafarov <djkojb@gmail.com>",
    "manifestUrl": "http://localhost:3000/package.json",
    "packages": {
        "mac": "http://localhost:3000/releases/updapp/mac/updapp.zip",
        "win": "http://localhost:3000/releases/updapp/win/updapp.zip",
        "linux32": "http://localhost:3000/releases/updapp/linux32/updapp.tar.gz"
    }
}
```

Inside the app manifest, you need to specify where to download packages from for all supported OS'es, a manifest url where this manifest can be found and the current version of the app.

Note that compressed apps are assumed to be downloaded in the format produced by [node-webkit-builder](https://github.com/mllrsohn/node-webkit-builder) (or [grunt-node-webkit-builder](https://github.com/mllrsohn/grunt-node-webkit-builder)).

**Params**

- manifest `object`  

<a name="updater#checkNewVersion"></a>
###updater.checkNewVersion(cb)
Will check the latest available version of the application by requesting the manifest specified in `manufestUrl`.
The callback will be executed if the version was changed.

**Params**

- cb `function` - Callback arguments: error, remote version  

<a name="updater#download"></a>
###updater.download(cb, newManifest)
Downloads the new app to a template folder

**Params**

- cb `function` - called when download completes. Callback arguments: error, downloaded filepath  
- newManifest `Object` - package.json manifest where are defined remote url  

**Returns**: `Request` - Request - stream, the stream contains `manifest` property with new manifest  
<a name="updater#getAppPath"></a>
###updater.getAppPath()
Returns executed application path

**Returns**: `string`  
<a name="updater#getAppExec"></a>
###updater.getAppExec()
Returns current application executable

**Returns**: `string`  
<a name="updater#unpack"></a>
###updater.unpack(filename, cb)
Will unpack the `filename` in temporary folder.
For Windows, [unzip](https://www.mkssoftware.com/docs/man1/unzip.1.asp) is used.

**Params**

- filename `string`  
- cb `function` - Callback arguments: error, unpacked directory  

<a name="updater#runInstaller"></a>
###updater.runInstaller(appPath, args, options)
Runs installer

**Params**

- appPath `string`  
- args `array` - Arguments which will be passed when running the new app  
- options `object` - Optional  

**Returns**: `function`  
<a name="updater#install"></a>
###updater.install(copyPath, cb)
Installs the app (copies current application to `copyPath`)

**Params**

- copyPath `string`  
- cb `function` - Callback arguments: error  

<a name="updater#run"></a>
###updater.run(execPath, args, options)
Runs the app from original path.

**Params**

- execPath `string`  
- args `array` - Arguments based to the app being ran  
- options `object` - Optional  

---

## Troubleshooting

If you get an error on Mac about too many files being open, run `ulimit -n 10240`

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md)

[npm-url]: https://npmjs.org/package/node-webkit-updater
[npm-image]: https://badge.fury.io/js/node-webkit-updater.png