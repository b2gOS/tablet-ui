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
    window.focus()

    Places.start().then(function() {
      console.log('Started the Places database');
    }, function(error) {
      console.error('Failed to start Places database ' + error);
    });
  }

};

function startup() {  
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
