  var request = require('request');
  var path = require('path');
  var os = require('os');
  var fs = require('fs');
  var exec = require('child_process').exec;
  var execFile = require('child_process').execFile;
  var spawn = require('child_process').spawn;
  var ncp = require('ncp');

  var platform = process.platform;
  platform = /^win/.test(platform)? 'win' : /^darwin/.test(platform)? 'mac' : 'linux' + (process.arch == 'ia32' ? '32' : '64');


  /**
   * @constructor
   * @param {object} manifest
   */
  function updater(manifest){
    this.manifest = manifest;
  }


  /**
   * Will check the latest available version of the application by requesting the manifest specified in `manufestUrl`.
   * The callback will be executed if the version was changed.
   * @param {function} cb - Callback arguments: error, remote version
   */
  updater.prototype.checkNewVersion = function(cb){
    request.get(this.manifest.manifestUrl, gotManifest.bind(this)); //get manifest from url

    function gotManifest(err, req, data){
      if(err) {
        return cb(err);
      }
      try{
        data = JSON.parse(data);
      } catch(e){
        return cb(e)
      }
      if(data.version !== this.manifest.version){
        cb(null, data);
      }
    }
  };


  /**
   * Downloads the new app to a template folder
   * @param  {Function} cb - called when download completes. Callback arguments: error, downloaded filepath
   * @param  {Object} newManifest - package.json manifest where are defined remote url
   * @return {Request} Request - stream, the stream contains `manifest` property with new manifest
   */
  updater.prototype.download = function(cb, newManifest){
    var manifest = newManifest || this.manifest;
    var url = manifest.packages[platform];
    var pkg = request(url);
    var filename = path.basename(url);
    // download the package to template folder
    //fs.unlink(path.join(os.tmpdir(), filename), function(){
      pkg.pipe(fs.createWriteStream(path.join(os.tmpdir(), filename)));
    //});
    
    pkg.on('end', appDownloaded);

    function appDownloaded(){
      process.nextTick(function(){
        cb(null, path.join(os.tmpdir(), filename))
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
   * For Windows, [unzip](https://www.mkssoftware.com/docs/man1/unzip.1.asp) is used.
   *
   * @param {string} filename
   * @param {function} cb - Callback arguments: error, unpacked directory
   */
  updater.prototype.unpack = function(filename, cb){
    pUnpack[platform].apply(this, arguments);
  };

  var pUnpack = {
    mac: function(filename, cb){
      var args = arguments;
      if(filename.slice(-4) == ".zip"){
        exec('unzip -xo ' + filename,{cwd: os.tmpdir()}, function(err){
          if(err){
            console.log(err);
            return cb(err);
          }
          var theName = path.basename(filename, '.zip');
          var appPath = path.join(os.tmpdir(), theName, theName + '.app');
          cb(null, appPath);
        })

      }
      if(filename.slice(-4) == ".dmg"){
        // just in case if something was wrong during previous mount
        exec('hdiutil unmount /Volumes/'+path.basename(filename, '.dmg'), function(err){
          exec('hdiutil attach ' + filename + ' -nobrowse', function(err){
            if(err) {
              if(err.code == 1){
                pUnpack.mac.apply(this, args);
              }
              return cb(err);
            }
            findMountPoint(path.basename(filename, '.dmg'), cb);
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
    win: function(filename, cb){
      // unzip by C. Spieler (docs: https://www.mkssoftware.com/docs/man1/unzip.1.asp, issues: http://www.info-zip.org/)
      exec(path.resolve(__dirname, 'tools/unzip.exe') + " -u -o " +
        filename + " -d " + os.tmpdir(), function(err){
          if(err){
            return cb(err);
          }
          var theName = path.basename(filename, path.extname(filename));
          cb(null, path.join(os.tmpdir(), theName, theName + '.exe'));
        });
    },
    linux32: function(filename, cb){
      //filename fix
      console.log('starting');
      exec('tar -zxvf ' + filename,{cwd: os.tmpdir()}, function(err){
        console.log(arguments);
        if(err){
          console.log(err);
          return cb(err);
        }
        var theName = path.basename(filename, '.tar.gz');
        cb(null,path.join(os.tmpdir(), theName, theName));
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
    mac: function(appPath, args, options){
      //spawn
      if(args && args.length) {
        args = [appPath].concat('--args', args);
      } else {
        args = [appPath];
      }
      return run('open', args, options);
    },
    win: function(appPath, args, options, cb){
      return run(appPath, args, options, cb);
    },
    linux32: function(appPath, args, options, cb){
      fs.chmodSync(appPath, 0755);
      if(!options) options = {};
      options.cwd = path.dirname(appPath);
      return run(appPath, args, options, cb);
    }
  };

  pRun.linux64 = pRun.linux32;

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
    mac: function(to, cb){
      ncp(this.getAppPath(), to, cb);
    },
    win: function(to, cb){
      deleteApp(appDeleted.bind(this));
      function appDeleted(err){
        ncp(this.getAppPath(), to, appCopied.bind(this));
      }
      function deleteApp(cb){
        exec('rd ' + to + '/s /q', cb)
      }
      function appCopied(err){
        if(err){
          setTimeout(function(){deleteApp(appDeleted.bind(this))}.bind(this), 100);
          return
        }
        cb();
      }
    },
    linux32: function(to, cb){
      ncp(this.getAppPath(), to, cb);
    }
  };
  pInstall.linux64 = pInstall.linux32;

  /**
   * Runs the app from original path.
   * @param {string} execPath
   * @param {array} args - Arguments based to the app being ran
   * @param {object} options - Optional
   */
  updater.prototype.run = function(execPath, args, options){
    pRun[platform].apply(this, arguments);
  };

  module.exports = updater;