/* globals dump */

(function() {
  

  function dump_off(msg, optionalObject) {}
  function dump_on(msg, optionalObject) {
    var output = msg;
    if (optionalObject) {
      output += JSON.stringify(optionalObject);
    }
    if (dump) {
      var appName = document.location.hostname.replace(/\..*$/, '');
      dump('[' + appName + '] ' + output + '\n');
    } else {
      console.log(output);
    }
  }

  window.DUMP = dump_off;   // no traces by default

  // enable/disable DUMP according to the related setting
  var settings = new SettingsServiceManager();

  setTimeout(() => {
      settings.get('debug.gaia.enabled', (status, value) => {
        console.log(`call setTime status ${status} value:`, value);
        window.DUMP = value ? dump_on : dump_off;
      });
    
      settings.addObserver('debug.gaia.enabled', (state, result) => {
        console.log('Observer callback, result:', result);
        window.DUMP = result.value ? dump_on : dump_off;
        dump_on(result.value ? 'Enabling DUMP' : 'Disabling DUMP');
      });
  }, 1500);

  // var settings = window.navigator.mozSettings;
  // var reqGaiaDebug = settings.createLock().get('debug.gaia.enabled');
  // reqGaiaDebug.onsuccess = function gaiaDebug() {
  //   window.DUMP =
  //     reqGaiaDebug.result['debug.gaia.enabled'] ? dump_on : dump_off;
  // };
  // settings.addObserver('debug.gaia.enabled', function(event) {
  //   window.DUMP = event.settingValue ? dump_on : dump_off;
  //   dump_on(event.settingValue ? 'Enabling DUMP' : 'Disabling DUMP');
  // });
}());
