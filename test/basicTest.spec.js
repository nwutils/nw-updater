var ncp = require('ncp');
var expect = require('chai').expect;
var spawn = require('child_process').spawn;
var exec = require('child_process').exec;
var express = require('express');
var chokidar = require('chokidar');
var isWin = /^win/.test(process.platform);
var isMac = /^darwin/.test(process.platform);
var isLinux = /^linux/.test(process.platform);
var path = require('path');
var fs = require('fs');
ncp.limit = 100;
console.log(__dirname);
describe('build app: copy current to temp', function buildApp(){
  this.timeout(200000);
  before(function(done){
    ncp('./app', './test/app', done);
  })
  describe('change manifest, build from temp', function(){
    before(function(done){
      var mock = {
        manifestUrl: "http://localhost:3000/package.json",
        packages: {
          mac: "http://localhost:3000/releases/updapp/mac/updapp.dmg",
          win: "http://localhost:3000/releases/updapp/win/updapp.zip",
          linux32: "http://localhost:3000/releases/updapp/linux32/updapp.tar.gz"
        },
        updated: true,
        version: "0.0.2"
      }
      customizePackageJson(mock, __dirname + '/app/package.json');
      var base = path.normalize(__dirname);
      var bd = spawn('node', ['./node_modules/grunt-cli/bin/grunt', 'buildapp', 
        '--dest=' + base + '/deploy0.2',
        '--src=' + base + '/app']);
      bd.stdout.on('data', function(data){
        console.log(data.toString());
      })
      bd.stderr.on('data', function(data){
        console.log(data.toString());
      })
      bd.on('close', function(code){
        expect(code).to.equal(0);
        done();
      });
    })
    describe('package for [current os]', function(){
      before(function(done){
        
        var pkgCommand;
        if(isMac) pkgCommand = 'packageMac';
        if(isWin) pkgCommand = 'compress:win';
        if(isLinux) pkgCommand = 'compress:linux';
        
        var pk = spawn('node', ['./node_modules/grunt-cli/bin/grunt', pkgCommand, '--dest=./test/deploy0.2','--src=./test/app']);
        
        pk.stdout.on('data', function(data){
          console.log(data.toString());
        })
        pk.on('close', function(code){
          expect(code).to.equal(0);
          done();
        })
      })
      describe('change manifest, build from temp', function(){
        before(function(done){
          var mock = {
            updated: false,
            version: "0.0.1"
          }
          customizePackageJson(mock, __dirname + '/app/package.json');
          var bd = spawn('node', ['./node_modules/grunt-cli/bin/grunt', 'buildapp', '--dest=./test/deploy0.1','--src=./test/app']);
          bd.stdout.on('data', function(data){
            console.log(data.toString());
          })

          bd.on('close', function(code){
            expect(code).to.equal(0);
            done();
          });
        })

        describe('run built app for [os], wait for app to be updated', function(){
          before(function(done){
            var json = {
              version: "0.0.2"
            }
            fs.writeFileSync( __dirname + "/deploy0.2/package.json" , JSON.stringify(json, null, 4));
            app = express();
            app.use(express.static('./test/deploy0.2'));
            app.listen(3000);
            done();
          })
          it('should be updated',function(done){
            var os = {
              mac:{
                dir: 'mac/',
                run: 'open ' + __dirname + "/deploy0.1/releases/updapp/mac/updapp.app"
              },
              win:{
                dir: 'win/',
                run: path.join(__dirname, "/deploy0.1/releases/updapp/win/updapp/updapp.exe")
              }
            };
            if(isMac) os = os.mac;
            if(isWin) os = os.win;
            if(isLinux) os = os.linux;
            console.log(os.run)
            var watcher = chokidar.watch(__dirname + '/deploy0.1/releases/updapp/' + os.dir);
            var wasDone = false;
            watcher.on('change', function(){
              if(!wasDone) {
                console.log("original folder was changed");
                wasDone = true;
                done();
              }
            })
            exec(os.run, function(err, stdo, stder){
              console.log("opened and updated");
            });
          })
        })
      })
    })
  })
});


function customizePackageJson(obj, path){
  var json = require(path);
  for(var i in obj){
    json[i] = obj[i];
  }
  fs.writeFileSync(path, JSON.stringify(json, null, 4));
}
//build app
//serve from url dmg
//check app ver
//update served version
//wait
//check app ver updated