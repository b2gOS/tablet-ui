/**
 * UI
 */

var UI = {
  /**
   * Broadcast channel used to communicate with the system.
   */
  broadcastChannel: null,


  /**
   * Start
   */
  start: function() {
    App.start();
    Wifi.start();
  },


  // Init
  init: function(){
    App.init();
    Wifi.init();
    Light.init();

    if (App.appsManagerService != null && Wifi.manager != null ) {
      setTimeout(() => {
        this.start();
      }, 1000);
    }
  }


};

/**
  * Start home screen on page load.
  */
window.addEventListener('load', function UI_onLoad() {
  window.removeEventListener('load', UI_onLoad);
  UI.init();
});


