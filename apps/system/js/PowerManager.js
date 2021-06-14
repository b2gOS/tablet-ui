/**
 * Managing power
 **/

var PowerManager = {

  _screenState: null,
  _powerService: null,
  _ScreenBrightness: null,

  powerScreen: function(enabled) {
    console.log('Turning on screen!');
    this._screenState = enabled;
    this._ScreenBrightness = 100;
  },

  powerOff: function() {
    this._powerService.powerOff();
  },

  reboot: function() {
    this._powerService.reboot();
  },

  start: function() {
    this.powerScreen(true);
    this._powerService = new PowerServiceManager();
    return this;
  },

  stop: function() {
    this.powerScreen(false);
  },

  toggleScreen: function() {
    // console.debug('Toggling screen' + this._screenState );
    //this._powerService.setCpuSleepAllowed(!this._screenState);

    ChromeUtils.import("resource://gre/modules/CustomHeaderInjector.jsm");

    const { libcutils } = ChromeUtils.import("resource://gre/modules/systemlibs.js");

    // libcutils.property_set("shell.ready", "1");

    // deviceinfo.product_model

    device = libcutils.property_get("ro.product.system.device")

    if(device == "onyx"){
      if(this._screenState){
          this._powerService.setScreenBrightness(0);
      }else{
          this._powerService.setScreenBrightness(100);
      }
    }else{
      this._powerService.setScreenEnabled(!this._screenState);
    }
    

    this._screenState =! this._screenState
  },
  
  setScreenBrightnessUp: function() {
      console.debug('ScreenBrightness:' + this._ScreenBrightness );
      if((this._ScreenBrightness + 10) >= 100){
        this._ScreenBrightness=100;
      }else{
        this._ScreenBrightness=this._ScreenBrightness + 10;
      }
      this._powerService.setScreenBrightness(this._ScreenBrightness);
  },

  setScreenBrightnessDown: function() {
    console.debug('ScreenBrightness:' + this._ScreenBrightness );
    if((this._ScreenBrightness - 10) <= 0){
      this._ScreenBrightness=0;
    }else{
      this._ScreenBrightness=this._ScreenBrightness - 10;
    }
    this._powerService.setScreenBrightness(this._ScreenBrightness);
  }

};
