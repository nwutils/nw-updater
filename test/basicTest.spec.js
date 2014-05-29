var ncp = require('ncp');
var expect = require('chai').expect;
var spawn = require('child_process').spawn;
var exec = require('child_process').exec;
var express = require('express');
var fs = require('fs');
ncp.limit = 100;
describe('build app', function buildApp(){
  it('should', function(done){
    var app;
    this.timeout(100000);
    var bd = spawn('node', ['./node_modules/grunt-cli/bin/grunt', 'buildapp']);
/*
    bd.stdout.on('data', function(data){
      console.log(data.toString());
    })
    bd.stderr.on('data', function(data){
      console.log(data.toString());
    })
*/
    bd.on('close', function(code){
      expect(code).to.equal(0);
      var mock = {
        manifestUrl: "http://localhost:3000/package.json",
        packages: {
          mac: "http://localhost:3000/updapp.dmg",
          win: "http://localhost:3000/updapp.zip"
        },
        updated: true,
        version: "0.0.2"
      }
      customizePackageJson(mock, __dirname + '/../deploy/releases/updapp/mac/updapp.app/Contents/resources/app.nw/package.json');
      var pk = spawn('node', ['./node_modules/grunt-cli/bin/grunt', 'packageMac']);
      pk.on('close', function(code){
        expect(code).to.equal(0);
        var mock = {
          updated: false,
          version: "0.0.1"
        }
        customizePackageJson(mock, __dirname + '/../deploy/releases/updapp/mac/updapp.app/Contents/resources/app.nw/package.json');
        
        ncp('./deploy/releases/updapp/mac', './test/temp', built)
      });
      
    


    
    
    });
    function built(err){
      expect(err).to.be.not.ok;
      var json = {
        version: "0.0.2"
      }
      fs.writeFileSync( __dirname + "/temp/package.json" , JSON.stringify(json, null, 4));
      app = express();
      app.use(express.static('./test/temp'));
      app.listen(3000);
      console.log("runApp");
      exec('open ' + __dirname + "/temp/updapp.app", function(err, stdo, stder){
        console.log(arguments);
      });
      //localhost:3000/updapp.app/Contents/resources/app.nw/package.json
    }
  })
}
);


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