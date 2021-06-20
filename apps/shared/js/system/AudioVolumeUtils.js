/* global lib_session, lib_audiovolume */

(function (exports) {
  let _audioVolumeManagerService = null;
  let session = null;

  /**
   * lib_session
   * lib_audiovolume.audioVolumeManagerService
   * lib_audiovolume.audioVolumeManager
   *
   * */

  function AudioVolumeServiceManager() {
    session = new lib_session.Session();
  }

  AudioVolumeServiceManager.prototype = {
    init: async function init(){
      return new Promise((r,j) => {
        const sessionstate = {};
        sessionstate.onsessionconnected = async function () {
          console.log(`SettingsManager onsessionconnected`);
          _audioVolumeManagerService = await lib_audiovolume.AudioVolumeManager.get(session)
        };
    
        // On desktop version, set ENV WS_RUNTIME_TOKEN=secrettoken
        session.open('websocket', 'localhost', 'secrettoken', sessionstate, true);
        r(_audioVolumeManagerService)
      })
    },

    requestVolumeUp: function requestVolumeUp(callback) {
      console.log('Calling requestVolumeUp');
      _audioVolumeManagerService.requestVolumeUp().then(() => {
        callback('success');
      }, () => {
        callback('error');
      });
    },

    requestVolumeDown: function requestVolumeDown(callback) {
      console.log('Calling requestVolumeDown');
      _audioVolumeManagerService.requestVolumeDown().then(() => {
        callback('success');
      }, () => {
        callback('error');
      });
    },

    requestVolumeShow: function requestVolumeShow(callback) {
      console.log('Calling requestVolumeShow');
      _audioVolumeManagerService.requestVolumeShow().then(() => {
        callback('success');
      }, () => {
        callback('error');
      });
    },

    observeAudioVolumeChange: function observeAudioVolumeChange(callback) {
      _audioVolumeManagerService.addEventListener(
        _audioVolumeManagerService.AUDIO_VOLUME_CHANGED_EVENT,
        callback,
      );
      console.log('start observeAudioVolumeChange');
    },

    unobserveAudioVolumeChange: function unobserveAudioVolumeChange(callback) {
      _audioVolumeManagerService.removeEventListener(
        _audioVolumeManagerService.AUDIO_VOLUME_CHANGED_EVENT,
        callback,
      );
      console.log('stop observeAudioVolumeChange');
    },

    closeSession: function closeSession() {
      if (session) {
        session.close();
        console.log('[AudioVolumeServiceManager] session successfully closed');
        session = null;
      }
    },
  };
  exports.AudioVolumeServiceManager = AudioVolumeServiceManager;
}(window));
