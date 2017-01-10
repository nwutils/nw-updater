/*

 1. Check the manifest for version (from your running "old" app).
 2. If the version is different from the running one, download new package to a temp directory.
 3. Unpack the package in temp.
 4. Run new app from temp and kill the old one (i.e. still all from the running app).
 5. The new app (in temp) will copy itself to the original folder, overwriting the old app.
 6. The new app will run itself from original folder and exit the process.

*/

var gui = require('nw.gui');
var pkg = require('../package.json'); // Insert your app's manifest here
var updater = require('node-webkit-updater');
var path = require('path')
var upd = new updater(pkg);
var copyPath, execPath;

// Args passed when new app is launched from temp dir during update
if(gui.App.argv.length) {
    // ------------- Step 5 -------------
    copyPath = gui.App.argv[0];
    execPath = gui.App.argv[1];

    // Replace old app, Run updated app from original location and close temp instance
    upd.install(copyPath, function(err) {
        if(!err) {

            // ------------- Step 6 -------------
            upd.run(execPath, null);
            gui.App.quit();
        }
    });
}
else { // if no arguments were passed to the app

    // ------------- Step 1 -------------
    upd.checkNewVersion(function(error, newVersionExists, manifest) {
        if (!error && newVersionExists) {

            // ------------- Step 2 -------------
            upd.download(function(error, filename) {
                if (!error) {

                    // ------------- Step 3 -------------
                    upd.unpack(filename, function(error, newAppPath) {
                        if (!error) {
							var newAppDir = path.dirname(newAppPath); 
                            // ------------- Step 4 -------------
                            upd.runInstaller(newAppPath, [upd.getAppPath(), upd.getAppExec()], {cwd: newAppDir} );
                            gui.App.quit();
                        }
                    }, manifest);
                }
            }, manifest);
        }
    });
}
