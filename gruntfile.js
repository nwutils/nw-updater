module.exports = function(grunt){
  grunt.initConfig({
    nodewebkit: {
      options: {
        build_dir: './deploy/', // Where the build version of my node-webkit app is saved
        mac: true, // We want to build it for mac
        win: false,
        version: '0.9.2',
        toolbar: false,
        frame: false
      },
      src: ['./app/**/*'] // Your node-wekit app
    }
  });
  grunt.loadNpmTasks('grunt-node-webkit-builder');
  

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

  
  grunt.registerTask('buildapp', ['nodewebkit']);

  grunt.registerTask('default', 'test');
}