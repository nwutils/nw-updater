  var request = require('request');
  var path = require('path');
  var os = require('os');
  var fs = require('fs');
  var exec = require('child_process').exec;
  var spawn = require('child_process').spawn;
  var ncp = require('ncp');
  var del = require('del');
  var semver = require('semver');

  var platform = process.platform;
  platform = /^win/.test(platform)? 'win' : /^darwin/.test(platform)? 'mac' : 'linux' + (process.arch == 'ia32' ? '32' : '64');


  /**
   * Creates new instance of updater. Manifest could be a `package.json` of project.
   *
   * Note that compressed apps are assumed to be downloaded in the format produced by [node-webkit-builder](https://github.com/mllrsohn/node-webkit-builder) (or [grunt-node-webkit-builder](https://github.com/mllrsohn/grunt-node-webkit-builder)).
   *
   * @constructor
   * @param {object} manifest - See the [manifest schema](#manifest-schema) below.
   * @param {object} options - Optional
   * @property {string} options.temporaryDirectory - (Optional) path to a directory to download the updates to and unpack them in. Defaults to [`os.tmpdir()`](https://nodejs.org/api/os.html#os_os_tmpdir)
   */
  function updater(manifest, options){
    this.manifest = manifest;
    this.options = {
      temporaryDirectory: options && options.temporaryDirectory || os.tmpdir()
    };
  }


  /**
   * Will check the latest available version of the application by requesting the manifest specified in `manifestUrl`.
   *
   * The callback will always be called; the second parameter indicates whether or not there's a newer version.
   * This function assumes you use [Semantic Versioning](http://semver.org) and enforces it; if your local version is `0.2.0` and the remote one is `0.1.23456` then the callback will be called with `false` as the second paramter. If on the off chance you don't use semantic versioning, you could manually download the remote manifest and call `download` if you're happy that the remote version is newer.
   *
   * @param {function} cb - Callback arguments: error, newerVersionExists (`Boolean`), remoteManifest
   */
  updater.prototype.checkNewVersion = function(cb){
    request.get(this.manifest.manifestUrl, gotManifest.bind(this)); //get manifest from url

    /**
     * @private
     */
    function gotManifest(err, req, data){
      if(err) {
        return cb(err);
      }

      if(req.statusCode < 200 || req.statusCode > 299){
        return cb(new Error(req.statusCode));
      }

      try{
        data = JSON.parse(data);
      } catch(e){
        return cb(e)
      }

      cb(null, semver.gt(data.version, this.manifest.version), data);
    }
  };

  /**
   * Downloads the new app to a template folder
   * @param  {Function} cb - called when download completes. Callback arguments: error, downloaded filepath
   * @param  {Object} newManifest - see [manifest schema](#manifest-schema) below
   * @return {Request} Request - stream, the stream contains `manifest` property with new manifest and 'content-length' property with the size of package.
   */
  updater.prototype.download = function(cb, newManifest){
    var manifest = newManifest || this.manifest;
    var url = manifest.packages[platform].url;
    var pkg = request(url, function(err, response){
        if(err){
            cb(err);
        }
        if(response && (response.statusCode < 200 || response.statusCode >= 300)){
            pkg.abort();
            return cb(new Error(response.statusCode));
        }
    });
    pkg.on('response', function(response){
      if(response && response.headers && response.headers['content-length']){
          pkg['content-length'] = response.headers['content-length'];
        }
    });
    var filename = path.basename(url),
        destinationPath = path.join(this.options.temporaryDirectory, filename);
    // download the package to template folder
    fs.unlink(path.join(this.options.temporaryDirectory, filename), function(){
      pkg.pipe(fs.createWriteStream(destinationPath));
      pkg.resume();
    });
    pkg.on('error', cb);
    pkg.on('end', appDownloaded);
    pkg.pause();

    function appDownloaded(){
      process.nextTick(function(){
        if(pkg.response.statusCode >= 200 && pkg.response.statusCode < 300){
          cb(null, destinationPath);
        }
      });
    }
    return pkg;
  };


  /**
   * Returns executed application path
   * @returns {string}
   */
  updater.prototype.getAppPath = function(){
    var appPath = {
      mac: path.join(process.cwd(),'../../..'),
      win: path.dirname(process.execPath)
    };
    appPath.linux32 = appPath.win;
    appPath.linux64 = appPath.win;
    return appPath[platform];
  };


  /**
   * Returns current application executable
   * @returns {string}
   */
  updater.prototype.getAppExec = function(){
    var execFolder = this.getAppPath();
    var exec = {
      mac: '',
      win: path.basename(process.execPath),
      linux32: path.basename(process.execPath),
      linux64: path.basename(process.execPath)
    };
    return path.join(execFolder, exec[platform]);
  };


  /**
   * Will unpack the `filename` in temporary folder.
   * For Windows, [unzip](https://www.mkssoftware.com/docs/man1/unzip.1.asp) is used (which is [not signed](https://github.com/edjafarov/node-webkit-updater/issues/68)).
   *
   * @param {string} filename
   * @param {function} cb - Callback arguments: error, unpacked directory
   * @param {object} manifest
   */
  updater.prototype.unpack = function(filename, cb, manifest){
    pUnpack[platform](filename, cb, manifest, this.options.temporaryDirectory);
  };

  /**
   * @private
   * @param {string} zipPath
   * @param {string} temporaryDirectory
   * @return {string}
   */
  var getZipDestinationDirectory = function(zipPath, temporaryDirectory){
      return path.join(temporaryDirectory, path.basename(zipPath, path.extname(zipPath)));
    },
    /**
     * @private
     * @param {object} manifest
     * @return {string}
     */
    getExecPathRelativeToPackage = function(manifest){
      var execPath = manifest.packages[platform] && manifest.packages[platform].execPath;

      if(execPath){
        return execPath;
      }
      else {
        var suffix = {
          win: '.exe',
          mac: '.app'
        };
        return manifest.name + (suffix[platform] || '');
      }
    };


  var pUnpack = {
    /**
     * @private
     */
    mac: function(filename, cb, manifest, temporaryDirectory){
      var args = arguments,
        extension = path.extname(filename),
        destination = path.join(temporaryDirectory, path.basename(filename, extension));

      if(!fs.existsSync(destination)){
        fs.mkdirSync(destination);
      }

      if(extension === ".zip"){
        exec('unzip -xo "' + filename + '" >/dev/null',{ cwd: destination }, function(err){
          if(err){
            console.log(err);
            return cb(err);
          }
          var appPath = path.join(destination, getExecPathRelativeToPackage(manifest));
          cb(null, appPath);
        })

      }
      else if(extension === ".dmg"){
        // just in case if something was wrong during previous mount
        exec('hdiutil unmount /Volumes/'+path.basename(filename, '.dmg'), function(err){
          // create a CDR from the DMG to bypass any steps which require user interaction
          var cdrPath = filename.replace(/.dmg$/, '.cdr');
          exec('hdiutil convert "' + filename + '" -format UDTO -o "' + cdrPath + '"', function(err){
            exec('hdiutil attach "' + cdrPath + '" -nobrowse', function(err){
              if(err) {
                if(err.code == 1){
                  pUnpack.mac.apply(this, args);
                }
                return cb(err);
              }
              findMountPoint(path.basename(filename, '.dmg'), cb);
            });
          });
        });

        function findMountPoint(dmg_name, callback) {
          exec('hdiutil info', function(err, stdout){
            if (err) return callback(err);
            var results = stdout.split("\n");
            var dmgExp = new RegExp(dmg_name + '$');
            for (var i=0,l=results.length;i<l;i++) {
              if (results[i].match(dmgExp)) {
                var mountPoint = results[i].split("\t").pop();
                var fileToRun = path.join(mountPoint, dmg_name + ".app");
                return callback(null, fileToRun);
              }
            }
            callback(Error("Mount point not found"));
          })
        }
      }
    },
    /**
     * @private
     */
    win: function(filename, cb, manifest, temporaryDirectory){
      var destinationDirectory = getZipDestinationDirectory(filename, temporaryDirectory),
          unzip = function(){
            // unzip by C. Spieler (docs: https://www.mkssoftware.com/docs/man1/unzip.1.asp, issues: http://www.info-zip.org/)
            exec( '"' + path.resolve(__dirname, 'tools/unzip.exe') + '" -u -o "' +
                filename + '" -d "' + destinationDirectory + '" > NUL', function(err){
              if(err){
                return cb(err);
              }

              cb(null, path.join(destinationDirectory, getExecPathRelativeToPackage(manifest)));
            });
          };

      fs.exists(destinationDirectory, function(exists){
        if(exists) {
          del(destinationDirectory, {force: true}, function (err) {
            if (err) {
              cb(err);
            }
            else {
              unzip();
            }
          });
        }
        else {
          unzip();
        }
      });

    },
    /**
     * @private
     */
    linux32: function(filename, cb, manifest, temporaryDirectory){
      //filename fix
      exec('tar -zxvf "' + filename + '" >/dev/null',{cwd: temporaryDirectory}, function(err){
        console.log(arguments);
        if(err){
          console.log(err);
          return cb(err);
        }
        cb(null,path.join(temporaryDirectory, getExecPathRelativeToPackage(manifest)));
      })
     }
  };
  pUnpack.linux64 = pUnpack.linux32;


  /**
   * Runs installer
   * @param {string} appPath
   * @param {array} args - Arguments which will be passed when running the new app
   * @param {object} options - Optional
   * @returns {function}
   */
  updater.prototype.runInstaller = function(appPath, args, options){
    return pRun[platform].apply(this, arguments);
  };

  var pRun = {
    /**
     * @private
     */
    mac: function(appPath, args, options){
      //spawn
      if(args && args.length) {
        args = [appPath].concat('--args', args);
      } else {
        args = [appPath];
      }
      return run('open', args, options);
    },
    /**
     * @private
     */
    win: function(appPath, args, options, cb){
      return run(appPath, args, options, cb);
    },
    /**
     * @private
     */
    linux32: function(appPath, args, options, cb){
      var appExec = path.join(appPath, path.basename(this.getAppExec()));
      fs.chmodSync(appExec, 0755)
      if(!options) options = {};
      options.cwd = appPath;
      return run(appPath + "/"+path.basename(this.getAppExec()), args, options, cb);
    }
  };

  pRun.linux64 = pRun.linux32;

  /**
   * @private
   */
  function run(path, args, options){
    var opts = {
      detached: true
    };
    for(var key in options){
      opts[key] = options[key];
    }
    var sp = spawn(path, args, opts);
    sp.unref();
    return sp;
  }

  /**
   * Installs the app (copies current application to `copyPath`)
   * @param {string} copyPath
   * @param {function} cb - Callback arguments: error
   */
  updater.prototype.install = function(copyPath, cb){
    pInstall[platform].apply(this, arguments);
  };

  var pInstall = {
    /**
     * @private
     */
    mac: function(to, cb){
      ncp(this.getAppPath(), to, cb);
    },
    /**
     * @private
     */
    win: function(to, cb){
      var self = this;
      var errCounter = 50;
      deleteApp(appDeleted);

      function appDeleted(err){
        if(err){
          errCounter--;
          if(errCounter > 0) {
            setTimeout(function(){
              deleteApp(appDeleted);
            }, 100);
          } else {
            return cb(err);
          }
        }
        else {
          ncp(self.getAppPath(), to, appCopied);
        }
      }
      function deleteApp(cb){
        del(to, {force: true}, cb);
      }
      function appCopied(err){
        if(err){
          setTimeout(deleteApp, 100, appDeleted);
          return
        }
        cb();
      }
    },
    /**
     * @private
     */
    linux32: function(to, cb){
      ncp(this.getAppPath(), to, cb);
    }
  };
  pInstall.linux64 = pInstall.linux32;

  /**
   * Runs the app from original app executable path.
   * @param {string} execPath
   * @param {array} args - Arguments passed to the app being ran.
   * @param {object} options - Optional. See `spawn` from nodejs docs.
   *
   * Note: if this doesn't work, try `gui.Shell.openItem(execPath)` (see [node-webkit Shell](https://github.com/rogerwang/node-webkit/wiki/Shell)).
   */
  updater.prototype.run = function(execPath, args, options){
    var arg = arguments;
    if(platform.indexOf('linux') === 0) arg[0] = path.dirname(arg[0]);
    pRun[platform].apply(this, arg);
  };

  module.exports = updater;
