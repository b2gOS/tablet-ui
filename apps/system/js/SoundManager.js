/**
 * Managing sound volume
 **/

var SoundManager = {

  settings: null,
  _audioVolumeService: null,

  _channelsVolume: {
    'normal': 0,
    'content': 0,
    'notification': 0,
    'system': 0
  },

  setVolumeUp: function() {
    console.debug('XXX setVolumeUp ');
    this._audioVolumeService.requestVolumeUp((status) => {
      console.log(`call requestVolumeUp status ${status}`);
    });
  },

  setVolumeDown: function() {
    console.debug('XXX setVolumeDown ');
    this._audioVolumeService.requestVolumeDown((status) => {
      console.log(`call requestVolumeDown status ${status}`);
    });
  },

  getVolume: function(){
    this._audioVolumeService.requestVolumeShow((status) => {
      console.log(`call requestVolumeShow status ${status}`);
    });

  },

  observeAudioVolumeChange: function(){
    this._audioVolumeService.observeAudioVolumeChange(this.audioVolumeChangeCallback);
  },

  unobserveAudioVolumeChange:function(){
    this._audioVolumeService.unobserveAudioVolumeChange(this.audioVolumeChangeCallback);
  },

  audioVolumeChangeCallback: function(data){
    console.log('audio volume change callback', data);
    StatusBar.showNotification("audio volume change callback:" + data);
  },

  start: function() {
    this._audioVolumeService = new AudioVolumeServiceManager();
    if (this._audioVolumeService) {
      setTimeout(() => {
        this.observeAudioVolumeChange();
      }, 1000);
      return this;
    }
    return null;
  }

};
