/**
 * Tablet System
 *
 * The main System object which starts everything else.
 */

var System = {

  /**
   * Start System.
   */
  start: function() {
    this.windowManager = WindowManager.start();
    this.soundManager = SoundManager.start();
    this.statusBar = StatusBar.start();
    this.systemToolbar = SystemToolbar.start();
    this.homeScreen = HomeScreen.start();
    this.powerManager = PowerManager.start();
    this.batteryManager = BatteryManager.start();
    this.hwButtons = HwButtons.start();
    this.keyboardManager = KeyboardManager.start();

    Places.start().then(function() {
      console.log('Started the Places database');
    }, function(error) {
      console.error('Failed to start Places database ' + error);
    });
  }

};

function startup() {
  // //Hack
  // const { Services } = ChromeUtils.import(
  //   "resource://gre/modules/Services.jsm"
  // );
  // // Grant "web-view" permission for system-app.
  // Services.perms.addFromPrincipal(
  //   Services.scriptSecurityManager.createContentPrincipalFromOrigin(
  //     "chrome://b2g/content/minios/system/index.html"
  //   ),
  //   "web-view",
  //   Ci.nsIPermissionManager.ALLOW_ACTION
  // );
  // // Grant "powersupply" permission for system-app.
  // Services.perms.addFromPrincipal(
  //   Services.scriptSecurityManager.createContentPrincipalFromOrigin(
  //     "chrome://b2g/content/minios/system/index.html"
  //   ),
  //   "powersupply",
  //   Ci.nsIPermissionManager.ALLOW_ACTION
  // );
  // // Grant "power" permission for system-app.
  // Services.perms.addFromPrincipal(
  //   Services.scriptSecurityManager.createContentPrincipalFromOrigin(
  //     "chrome://b2g/content/minios/system/index.html"
  //   ),
  //   "power",
  //   Ci.nsIPermissionManager.ALLOW_ACTION
  // );
  // // Grant "input" permission for system-app.
  // Services.perms.addFromPrincipal(
  //   Services.scriptSecurityManager.createContentPrincipalFromOrigin(
  //     "chrome://b2g/content/minios/system/index.html"
  //   ),
  //   "input",
  //   Ci.nsIPermissionManager.ALLOW_ACTION
  // );
  // // Grant "input" permission for keyboard-app.
  // Services.perms.addFromPrincipal(
  //   Services.scriptSecurityManager.createContentPrincipalFromOrigin(
  //     "chrome://b2g/content/minios/keyboard/index.html"
  //   ),
  //   "input",
  //   Ci.nsIPermissionManager.ALLOW_ACTION
  // );
  
  System.start();

  var readyEvent = {
    detail: {
      type: 'system-message-listener-ready'
    }
  };
  window.dispatchEvent(new CustomEvent('mozContentEvent', readyEvent, true));
}

/**
  * Start System on page load.
  */
window.addEventListener('load', function system_onLoad() {
  window.removeEventListener('load', system_onLoad);

  // var home = document.getElementById('home-screen-frame');
  // home.addEventListener('mozbrowserloadend', function home_loaded() {
  //   home.removeEventListener('mozbrowserloadend', home_loaded);
  //   console.debug('about:home has been loaded');
  //   window.focus();
  // });
  // home.src = 'http://home.localhost/home.html';

  window.addEventListener('visibilitychange', function hasVisibilityChange(evt) {
    console.debug('>>>> SYSTEM APP VISIBILITYCHANGE', evt);
  });

  window.addEventListener('mozbrowservisibilitychange', function hasVisibilityChange(evt) {
    console.debug('>>>> SYSTEM APP MOZBROWSERVISIBILITYCHANGE', evt);
  });

  console.debug('initial readyState', document.readyState);
  if (document.readyState !== 'loading') {
    startup();
  } else {
    document.addEventListener('readystatechange', function readyStateChange() {
      console.debug('changed readyState', document.readyState);
      if (document.readyState === 'interactive') {
        document.removeEventListener('readystatechange', readyStateChange);
        startup();
      }
    });
  }
});
