/**
 * Managing sound volume
 **/

var SoundManager = {

  settings: null,
  _audioVolumeService: null,
  volumebar: null,

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

  observeAudioVolumeChange: async function(){
    await this._audioVolumeService.observeAudioVolumeChange(this.audioVolumeChangeCallback.bind(this));
  },

  unobserveAudioVolumeChange:function(){
    this._audioVolumeService.unobserveAudioVolumeChange(this.audioVolumeChangeCallback);
  },

  audioVolumeChangeCallback: function(data){
    console.log('audio volume change callback', data)
    // this.getVolume()
    this.volumebar = document.querySelector('volume-bar')
    this.volumebar.show()
    // StatusBar.showNotification("audio volume change callback:" + data);
  },


  start: async function() {
    this._audioVolumeService = new AudioVolumeServiceManager()
    this._audioVolumeService.init().then(()=>{
      this.observeAudioVolumeChange()
    })
    //   window.setTimeout(()=>{
    // await this.observeAudioVolumeChange()
    //   },3000)
      return this;
  }

};
