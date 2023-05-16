var ncp = require('ncp');
var expect = require('chai').expect;
var spawn = require('child_process').spawn;
var exec = require('child_process').exec;
var express = require('express');
var isWin = /^win/.test(process.platform);
var isMac = /^darwin/.test(process.platform);
var isLinux = /^linux/.test(process.platform);
var path = require('path');
var fs = require('fs');
var getPort = undefined;
var port = null;
var app;

(async function () {
  try {
    getPort = (await import('get-port')).default;
  } catch (e) {
    console.log(e);
  }
})();

ncp.limit = 100;

describe('build app: copy current to temp', function buildApp(){
  this.timeout(2000000);
  before(function(done){
    ncp('./app', './test/app', function(err){
        if(err) return done(err);
        getPort(function(err, availablePort){
            if(err) return done(err);
            port = availablePort;
            done();
        })
    });
  })
  describe('change manifest, build from temp', function(){
    before(function(done){
      var mock = {
        name: "updapp",
        manifestUrl: "http://localhost:" + port + "/package.json",
        packages: {
          mac: {
              url: "http://localhost:" + port + "/updapp/osx/updapp.zip",
              execPath: "updapp/updapp.app"
          },
          win: {
              url: "http://localhost:" + port + "/updapp/win/updapp.zip",
              execPath: "updapp\\updapp.exe"
          },
          linux32: {
              url: "http://localhost:" + port + "/updapp/linux32/updapp.tar.gz"
          },
          linux64: {
              url: "http://localhost:" + port + "/updapp/linux64/updapp.tar.gz"
          }
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
        if(isMac) pkgCommand = 'packageMacZip';//'packageMac';
        if(isWin) pkgCommand = 'compress:win';
        if(isLinux) pkgCommand = 'compress:linux' + (process.arch == 'ia32'?'32':'64');
        console.log(pkgCommand)


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
            name: "updapp",
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
              name: "updapp",
              manifestUrl: "http://localhost:" + port + "/package.json",
              packages: {
                mac: {
                    url: "http://localhost:" + port + "/updapp/osx/updapp.zip",
                    execPath: "updapp/updapp.app"
                },
                win: {
                    url: "http://localhost:" + port + "/updapp/win/updapp.zip",
                    execPath: "updapp\\updapp.exe"
                },
                linux32: {
                    url: "http://localhost:" + port + "/updapp/linux32/updapp.tar.gz"
                },
                linux64: {
                    url: "http://localhost:" + port + "/updapp/linux64/updapp.tar.gz"
                }
              },
              updated: true,
              version: "0.0.2"
            }
            fs.writeFileSync( __dirname + "/deploy0.2/package.json" , JSON.stringify(json, null, 4));
            app = express();
            app.use(express.static('./test/deploy0.2'));
            app.listen(port);
            done();
          })
          it('should be updated, with new version',function(done){
            var os = {
              mac:{
                dir: 'osx/',
                run: 'open ' + __dirname + "/deploy0.1/updapp/osx/updapp.app"
              },
              win:{
                dir: 'win/',
                run: path.join(__dirname, "/deploy0.1/updapp/win/updapp.exe")
              },
              linux32: {
                dir: 'linux32/',
                run: __dirname + "/deploy0.1/updapp/linux32/updapp"
              },
              linux64: {
                dir: 'linux64/',
                run: __dirname + "/deploy0.1/updapp/linux64/updapp"
              }
            };
            if(isMac) os = os.mac;
            if(isWin) os = os.win;
            if(isLinux) os = os['linux' + (process.arch == 'ia32'?'32':'64')];

		app.get('/version/0.0.2', function(req, res){
		  res.end();
		  done();
		});

            exec(os.run, function(err, stdo, stder){
              console.log(arguments)
              console.log(arguments[2])
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
