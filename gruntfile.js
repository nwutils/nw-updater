var exec = require('child_process').exec;

module.exports = function(grunt){
  grunt.initConfig({
    compress:{
      win:{
        options: {
          mode: 'zip',
          archive: './deploy/releases/updapp/win/updapp.zip'
        },
        expand: true,
        cwd: './deploy/releases/updapp/',
        src: ['win/updapp/**'],
        dest: 'win/'
      },
      linux:{
        options: {
          mode: 'tgz',
          archive: './deploy/releases/updapp/linux32/updapp.tar.gz'
        },
        expand: true,
        cwd: './delpoy/releases/updapp/',
        src: ['linux32/updapp/**'],
        dest: 'linux32/'
      }
    },
    nodewebkit: {
      options: {
        build_dir: './deploy/', // Where the build version of my node-webkit app is saved
        mac: false, // We want to build it for mac
        win: true,
        version: '0.9.1',
        toolbar: false,
        frame: false
      },
      src: ['./app/**/*'] // Your node-wekit app
    },
    mochaTest:{
      test:{
        options: {
          reporter: 'spec'
        },
        src: ['test/**/*.spec.js']
      }
    }
  });
  grunt.loadNpmTasks('grunt-node-webkit-builder');
  grunt.loadNpmTasks('grunt-mocha-test');
  grunt.loadNpmTasks('grunt-contrib-compress');

  grunt.registerTask('packageMac', function(){
    var done = this.async();
    console.log('packaging...');
    exec('hdiutil create -format UDZO -srcfolder ./deploy/releases/updapp/mac/updapp.app ./deploy/releases/updapp/mac/updapp.dmg',function(error, stdout, stderr){
      console.log('stdout: ' + stdout);
      console.log('stderr: ' + stderr);
      if (error !== null) {
        console.log('exec error: ' + error);
      }
      done()
    })
  })

  grunt.registerTask('version', function(){
    var ver = grunt.option('ver');
    customizePackageJson({version: ver}, './app/package.json');
    
    function customizePackageJson(obj, path){
      var json = require(path);
      for(var i in obj){
        json[i] = obj[i];
      }
      fs.writeFileSync(path, JSON.stringify(json, null, 4));
    }
  });
  
  grunt.registerTask('buildapp', ['nodewebkit']);

  grunt.registerTask('default', 'test');
}