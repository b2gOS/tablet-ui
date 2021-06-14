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
    const sessionstate = {};

    sessionstate.onsessionconnected = function () {
      console.log('[AudioVolumeServiceManager] onsessionconnected');
      lib_audiovolume.AudioVolumeManager.get(session).then((audioVolumeManager) => {
        console.log(`Got AudioVolumemanagerService : #${audioVolumeManager.service_id}`);
        _audioVolumeManagerService = audioVolumeManager;
      }).catch((e) => {
        console.log(`Error calling AudioVolumemanagerService service${JSON.stringify(e)}`);
        _audioVolumeManagerService = null;
      });
    };

    sessionstate.onsessiondisconnected = function () {
      console.log('[AudioVolumeServiceManager] onsessiondisconnected Daemon Crashed');
    };

    // On desktop version, set ENV WS_RUNTIME_TOKEN=secrettoken
    session.open('websocket', 'localhost', 'secrettoken', sessionstate, true);
  }

  AudioVolumeServiceManager.prototype = {
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



// class AudioVolumeServiceManager {
//   constructor(){
//   }

//   connectedCallback() {
//     this.session = new lib_session.Session();
//     const sessionstate = {};

//     sessionstate.onsessionconnected = function () {
//       console.log('[AudioVolumeServiceManager] onsessionconnected');
//       lib_audiovolume.AudioVolumeManager.get(this.session).then((audioVolumeManager) => {
//         console.log(`Got AudioVolumemanagerService : #${audioVolumeManager.service_id}`);
//         this._audioVolumeManagerService = audioVolumeManager;
//       }).catch((e) => {
//         console.log(`Error calling AudioVolumemanagerService service${JSON.stringify(e)}`);
//         this._audioVolumeManagerService = null;
//       });
//     };

//     sessionstate.onsessiondisconnected = function () {
//       console.log('[AudioVolumeServiceManager] onsessiondisconnected Daemon Crashed');
//     };

//     // On desktop version, set ENV WS_RUNTIME_TOKEN=secrettoken
//     this.session.open('websocket', 'localhost', 'secrettoken', sessionstate, true);
//   }


//   requestVolumeUprequestVolumeUp(callback) {
//     console.log('Calling requestVolumeUp');
//     this._audioVolumeManagerService.requestVolumeUp().then(() => {
//       callback('success');
//     }, () => {
//       callback('error');
//     });
//   }

//   requestVolumeDown(callback) {
//     console.log('Calling requestVolumeDown');
//     this._audioVolumeManagerService.requestVolumeDown().then(() => {
//       callback('success');
//     }, () => {
//       callback('error');
//     });
//   }

//   requestVolumeShow(callback) {
//     console.log('Calling requestVolumeShow');
//     this._audioVolumeManagerService.requestVolumeShow().then(() => {
//       callback('success');
//     }, () => {
//       callback('error');
//     });
//   }

//   observeAudioVolumeChange(callback) {
//     this._audioVolumeManagerService.addEventListener(
//       this._audioVolumeManagerService.AUDIO_VOLUME_CHANGED_EVENT,
//       callback,
//     );
//     console.log('start observeAudioVolumeChange');
//   }

//   unobserveAudioVolumeChange(callback) {
//     this._audioVolumeManagerService.removeEventListener(
//       this._audioVolumeManagerService.AUDIO_VOLUME_CHANGED_EVENT,
//       callback,
//     );
//     console.log('stop observeAudioVolumeChange');
//   }

//   closeSession() {
//     if (this.session) {
//       this.session.close();
//       console.log('[AudioVolumeServiceManager] session successfully closed');
//       this.session = null;
//     }
//   }


// }