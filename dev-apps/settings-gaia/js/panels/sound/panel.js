
/**
 * Handle each slider's functionality.
 * Get correspondent tone, make sure the tone is playable,
 * set volume based on slider position.
 *
 * @module SliderHandler
 */
define('panels/sound/slider_handler',['require','shared/settings_listener','modules/settings_cache'],function(require) {
  

  var SettingsListener = require('shared/settings_listener');
  var SettingsCache = require('modules/settings_cache');

  var INTERVAL = 500;
  var DELAY = 800;
  var BASESHAREURL = '/shared/resources/media/';
  var TONEURLS = {
    'content': BASESHAREURL + 'notifications/notifier_firefox.opus',
    'notification': BASESHAREURL + 'ringtones/ringer_firefox.opus',
    'alarm': BASESHAREURL + 'alarms/ac_awake.opus'
  };
  var TONEKEYS = {
    'content': 'media.ringtone',
    'notification': 'dialer.ringtone',
    'alarm': 'alarm.ringtone'
  };

  var SliderHandler = function() {
    this._element = null;
    this._channelType = '';
    this._channelKey = '';
    this._toneURL = '';
    this._toneKey = '';
    this._previous = null;
    this._isTouching = false;
    this._isFirstInput = false;
    this._intervalID = null;
    this._player = new Audio();
  };

  SliderHandler.prototype = {
    /**
     * initialization
     *
     * The sliders listen to input, touchstart and touchend events to fit
     * the ux requirements, and when the user tap or drag the sliders, the
     * sequence of the events is:
     * touchstart -> input -> input(more if dragging) -> touchend -> input
     *
     * @access public
     * @memberOf SliderHandler.prototype
     * @param  {Object} element html elements
     * @param  {String} channelType type of sound channel
     */
    init: function sh_init(element, channelType) {
      this._element = element;
      this._channelType = channelType;
      this._channelKey = 'audio.volume.' + channelType;
      this._toneURL = TONEURLS[channelType];
      this._toneKey = TONEKEYS[channelType];

      this._boundSetSliderValue = function(value) {
        this._setSliderValue(value);
      }.bind(this);

      // Get the volume value for the slider, also observe the value change.
      SettingsListener.observe(this._channelKey, '', this._boundSetSliderValue);

      this._element.addEventListener('touchstart',
        this._touchStartHandler.bind(this));
      this._element.addEventListener('input',
        this._inputHandler.bind(this));
      this._element.addEventListener('touchend',
        this._touchEndHandler.bind(this));
    },

    /**
     * Stop the tone
     *
     * @access private
     * @memberOf SliderHandler.prototype
     */
    _stopTone: function vm_stopTone() {
      this._player.pause();
      this._player.removeAttribute('src');
      this._player.load();
    },

    /**
     * Play the tone
     *
     * @access private
     * @memberOf SliderHandler.prototype
     * @param  {Blob} blob tone blob
     */
    _playTone: function vm_playTone(blob) {
      // Don't set the audio channel type to content or it will interrupt the
      // background music and won't resume after the user previewed the tone.
      if (this._channelType !== 'content') {
        this._player.mozAudioChannelType = this._channelType;
      }
      this._player.src = URL.createObjectURL(blob);
      this._player.load();
      this._player.loop = true;
      this._player.play();
    },

    /**
     * Change slider's value
     *
     * @access private
     * @memberOf SliderHandler.prototype
     * @param {Number} value slider value
     */
    _setSliderValue: function vm_setSliderValue(value) {
      this._element.value = value;
      // The slider is transparent if the value is not set yet, display it
      // once the value is set.
      if (this._element.style.opacity !== 1) {
        this._element.style.opacity = 1;
      }

      // If it is the first time we set the slider value, we must update the
      // previous value of this channel type
      if (this._previous === null) {
        this._previous = value;
      }
    },

    /**
     * get default tone
     *
     * @access private
     * @memberOf SliderHandler.prototype
     * @param  {Function} callback callback function
     */
    _getDefaultTone: function vm_getDefaultTone(callback) {
      var xhr = new XMLHttpRequest();
      xhr.open('GET', this._toneURL);
      xhr.overrideMimeType('audio/ogg');
      xhr.responseType = 'blob';
      xhr.send();
      xhr.onload = function() {
        callback(xhr.response);
      };
    },

    /**
     * get tone's blob object
     *
     * @access private
     * @memberOf SliderHandler.prototype
     * @param  {Function} callback callback function
     */
    _getToneBlob: function vm_getToneBlob(callback) {
      SettingsCache.getSettings(function(results) {
        if (results[this._toneKey]) {
          callback(results[this._toneKey]);
        } else {
          // Fall back to the predefined tone if the value does not exist
          // in the mozSettings.
          this._getDefaultTone(function(blob) {
            // Save the default tone to mozSettings so that next time we
            // don't have to fall back to it from the system files.
            var settingObject = {};
            settingObject[this._toneKey] = blob;
            navigator.mozSettings.createLock().set(settingObject);

            callback(blob);
          });
        }
      }.bind(this));
    },

    /**
     * Handle touchstart event
     *
     * It stop the tone previewing from the last touchstart if the delayed
     * stopTone() is not called yet.
     *
     * It stop observing when the user is adjusting the slider, this is to
     * get better ux that the slider won't be updated by both the observer
     * and the ui.
     *
     * @access private
     * @memberOf SliderHandler.prototype
     */
    _touchStartHandler: function sh_touchStartHandler(event) {
      this._isTouching = true;
      this._isFirstInput = true;
      this._stopTone();
      SettingsListener.unobserve(this._channelKey, this._boundSetSliderValue);

      this._getToneBlob(function(blob) {
        this._playTone(blob);
      }.bind(this));
    },

    /**
     * Change volume
     *
     * @access private
     * @memberOf SliderHandler.prototype
     */
    _setVolume: function sh_setVolume() {
      var value = parseInt(this._element.value);
      var settingObject = {};
      settingObject[this._channelKey] = value;

      // Only set the new value if it does not equal to the previous one.
      if (value !== this._previous) {
        navigator.mozSettings.createLock().set(settingObject);
        this._previous = value;
      }
    },

    /**
     * Handle input event
     *
     * The mozSettings api is not designed to call rapidly, but ux want the
     * new volume to be applied immediately while previewing the tone, so
     * here we use setInterval() as a timer to ease the number of calling,
     * or we will see the queued callbacks try to update the slider's value
     * which we are unable to avoid and make bad ux for the users.
     *
     * @access private
     * @memberOf SliderHandler.prototype
     */
    _inputHandler: function sh_inputHandler(event) {
      if (this._isFirstInput) {
        this._isFirstInput = false;
        this._setVolume();
        this._intervalID = setInterval(this._setVolume.bind(this), INTERVAL);
      }
    },

    /**
     * Handle touchend event
     *
     * It Clear the interval setVolume() and set it directly when the
     * user's finger leaves the panel.
     *
     * It Re-observe the value change after the user finished tapping/dragging
     * on the slider and the preview is ended.
     *
     * If the user tap the slider very quickly, like the click event, then
     * we try to stop the player after a constant duration so that the user
     * is able to hear the tone's preview with the adjusted volume.
     *
     * @access private
     * @memberOf SliderHandler.prototype
     */
    _touchEndHandler: function sh_touchEndHandler(event) {
      this._isTouching = false;
      clearInterval(this._intervalID);
      this._setVolume();
      SettingsListener.observe(this._channelKey, '', this._boundSetSliderValue);
      setTimeout(function() {
        if (!this._isTouching) {
          this._stopTone();
        }
      }.bind(this), DELAY);
    }
  };

  return function ctor_sliderHandler() {
    return new SliderHandler();
  };
});

/**
 * Setup the sliders for previewing the tones.
 * @module VolumeManager
 */
define('panels/sound/volume_manager',['require','panels/sound/slider_handler'],function(require) {
  

  var SliderHandler = require('panels/sound/slider_handler');

  var VolumeManager = function() {
    this._elements = null;
  };

  VolumeManager.prototype = {
    /**
     * initialization
     *
     * @access public
     * @memberOf VolumeManager.prototype
     */
    init: function vm_init(elements) {
      this._elements = elements;

      var contentHandler = SliderHandler();
      contentHandler.init(this._elements.media, 'content');
      var notification = SliderHandler();
      notification.init(this._elements.notification, 'notification');
      var alarm = SliderHandler();
      alarm.init(this._elements.alarm, 'alarm');
    }
  };

  return function ctor_volumeManager() {
    return new VolumeManager();
  };
});

/* global URL, MozActivity */
/**
 * Handle tone functionality in sound panel
 * @module ToneManager
 */
define('panels/sound/tone_manager',['require','shared/settings_listener','modules/settings_cache','shared/omadrm/fl'],function(require) {
  

  var SettingsListener = require('shared/settings_listener');
  var SettingsCache = require('modules/settings_cache');
  var ForwardLock = require('shared/omadrm/fl');

  var ToneManager = function() {
    this._elements = null;
    this._tones = null;
  };

  ToneManager.prototype = {
    /**
     * initialization.
     *
     * @access public
     * @memberOf ToneManager.prototype
     */
    init: function tm_init(elements) {
      this._elements = elements;
      this._configureTones();
      this._handleTones();

      this._elements.manageTones.addEventListener('click',
        this._manageTonesClickHandler);
    },

    /**
     * Initialize the ring tone and alert tone menus.
     *
     * @access private
     * @memberOf ToneManager.prototype
     */
    _configureTones: function tm_configureTones() {
      // This array has one element for each selectable tone that
      // appears in the "Tones" section of ../elements/sound.html.
      this._tones = [{
        pickType: 'alerttone',
        settingsKey: 'notification.ringtone',
        allowNone: true, // Allow "None" as a choice for alert tones.
        button: this._elements.alertToneSelection,
        desc: this._elements.alertToneSelectionDesc
      }];

      // If we're a telephone, then show the section for ringtones, too.
      if (navigator.mozTelephony) {
        this._tones.push({
          pickType: 'ringtone',
          settingsKey: 'dialer.ringtone',
          allowNone: false, // The ringer must always have an actual sound.
          button: this._elements.ringToneSelection,
          desc: this._elements.ringToneSelectionDesc
        });
        this._elements.ringer.hidden = false;
      }
    },

    /**
     * The button looks like a select element and holds the name of the
     * currently-selected tone. Sometimes the name is an l10n ID
     * and sometimes it is just text.
     *
     * @access private
     * @memberOf ToneManager.prototype
     */
    _renderToneName: function tm_renderToneName(tone, tonename) {
      var l10nID = tonename && tonename.l10nID;

      if (l10nID) {
        tone.desc.setAttribute('data-l10n-id', l10nID);
      } else {
        tone.desc.removeAttribute('data-l10n-id');
        tone.desc.textContent = tonename;
      }
    },

    /**
     * render tone content
     *
     * @access private
     * @memberOf ToneManager.prototype
     * @param  {Object} tone     tone element
     * @param  {Object} result     web activity result
     * @param  {String} secret   sound is playable
     */
    _renderTone: function tm_renderTone(tone, result, secret) {
      var oldRingtoneName = null;

      var l10nId = tone.desc.getAttribute('data-l10n-id');
      if (!l10nId) {
        oldRingtoneName = tone.desc.textContent;
      }
      tone.desc.setAttribute('data-l10n-id', 'saving-tone');
      var promise;
      var self = this;
      // If we got a locked ringtone, we have to unlock it first
      if (result.blob.type.split('/')[1] === ForwardLock.mimeSubtype) {
        ForwardLock.unlockBlob(secret, result.blob, function(unlocked) {
          promise = self._isPlayableTone(unlocked);
        });
      } else {  // Otherwise we can just use the blob directly.
        promise = self._isPlayableTone(result.blob);
      }
      promise.then(function(isPlayable) {
        if (isPlayable) {
          self._setRingtone(tone.settingsKey, result.l10nID,
            result.name, result.blob, result.id);
        } else {
          if (l10nId) {
            tone.desc.setAttribute('data-l10n-id', l10nId);
          } else {
             // remove temp 'saving-tone' l10nId
            tone.desc.removeAttribute('data-l10n-id');
            tone.desc.textContent = oldRingtoneName;
          }
          alert(navigator.mozL10n.get('unplayable-ringtone'));
        }
      });
    },

    /**
     * Call web activity to pick a tone
     *
     * @access private
     * @memberOf ToneManager.prototype
     * @param  {Object} tone          tone element
     * @param  {Number} currentToneID tone id
     * @param  {String} secret        forwardlock secret key
     */
    _pickTone: function tm_pickRingTone(tone, currentToneID, secret) {
      var self = this;
      var activity = new MozActivity({
        name: 'pick',
        data: {
          type: tone.pickType,
          allowNone: tone.allowNone,
          currentToneID: currentToneID,
          // If we have a secret then there is locked content on the
          // phone so include it as a choice for the user
          includeLocked: (secret !== null)
        }
      });

      activity.onsuccess = function() {
        var result = activity.result;
        if (!result.blob) {
          if (tone.allowNone) {
            // If we allow a null blob, then everything is okay
            self._setRingtone(tone.settingsKey, result.l10nID, result.name,
              result.blob, result.id);
          } else {
            // Otherwise this is an error and we should not change the
            // current setting. (The ringtones app should never return
            // a null blob if allowNone is false, but other apps might.)
            alert(navigator.mozL10n.get('unplayable-ringtone'));
          }
          return;
        }

        self._renderTone(tone, result, secret);
      };
    },

    /**
     * Update Ringtones list.
     *
     * @access private
     * @memberOf ToneManager.prototype
     */
    _handleTones: function tm_handleTones() {
      // For each kind of tone, hook up the button that will allow the user
      // to select a sound for that kind of tone.
      this._tones.forEach(function(tone) {
        var nameKey = tone.settingsKey + '.name';
        var idKey = tone.settingsKey + '.id';

        SettingsListener.observe(nameKey, '',
          this._renderToneName.bind(this, tone));

        var self = this;
        // When the user clicks the button, we launch an activity that lets
        // the user select new ringtone.
        tone.button.addEventListener('click', function() {
          // First, get the ID of the currently-selected tone.
          SettingsCache.getSettings(function(results) {
            var currentToneID = results[idKey];

            // Before we can start the Pick activity, we need to know if there
            // is locked content on the phone because we don't want the user to
            // see "Purchased Media" as a choice if there isn't any purchased
            // media on the phone. The ForwardLock secret key is not generated
            // until it is needed, so we can use its existance to
            // determine whether to show the Purchased Media app.
            ForwardLock.getKey(function(secret) {
              self._pickTone(tone, currentToneID, secret);
            });
          });
        });
      }.bind(this));
    },

    /**
     * Save the sound blob in the settings so that other apps can use it.
     * Also save the sound name in the db so we can display it in the
     * future.  And update the button text to the new name now.
     *
     * @access private
     * @memberOf ToneManager.prototype
     * @param  {String} settingsKey   key string
     * @param  {String} l10nID        element l10nID id
     * @param  {String} toneName      element name
     * @param  {Blob} blob            tone blob
     * @param  {String} id            tone id
     */
    _setRingtone: function tm_setRingtone(settingsKey, l10nID, toneName,
      blob, id) {
      var blobKey = settingsKey;
      var nameKey = settingsKey + '.name';
      var idKey = settingsKey + '.id';

      // Update the settings database. This will cause the button
      // text to change as well because of the SettingsListener above.
      var values = {};
      var name = l10nID ? {l10nID : l10nID} : toneName;

      values[blobKey] = blob;
      values[nameKey] = name || '';
      values[idKey] = id;
      navigator.mozSettings.createLock().set(values);
    },

    /**
     * Make sure that the blob we got from the activity is actually
     * a playable audio file. It would be very bad to set an corrupt
     * blob as a ringtone because then the phone wouldn't ring!
     *
     * @access private
     * @memberOf ToneManager.prototype
     * @param  {Blob} blob            tone blob
     * @return {Promise} A promise that resolves to the media playable stat
     */
    _isPlayableTone: function tm_isPlayableTone(blob) {
      return new Promise(function(resolve, reject) {
        var player = new Audio();
        player.preload = 'metadata';
        player.src = URL.createObjectURL(blob);
        player.oncanplay = function() {
          release();
          resolve(true);
        };
        player.onerror = function() {
          release();
          resolve(false);
        };

        function release() {
          URL.revokeObjectURL(player.src);
          player.removeAttribute('src');
          player.load();
        }
      });
    },

    /**
     * Call ringtone activity to manage tones.
     *
     * @access private
     * @memberOf ToneManager.prototype
     */
    _manageTonesClickHandler: function tm_manageTonesClickHandler() {
      var activity = new MozActivity({
        name: 'configure',
        data: {
          target: 'ringtone'
        }
      });

      // We should hopefully never encounter this error, but if we do, it means
      // we couldn't find the ringtone app. It also has the happy side effect of
      // quieting jshint about not using the `activity` variable.
      activity.onerror = function() {
        console.log(this.error);
        if (this.error.name === 'NO_PROVIDER') {
          alert(navigator.mozL10n.get('no-ringtone-app'));
        }
      };
    }
  };

  return function ctor_toneManager() {
    return new ToneManager();
  };
});

/* global getSupportedNetworkInfo*/
/**
 * Used to show Personalization/Sound panel
 */
define('panels/sound/panel',['require','modules/settings_panel','panels/sound/volume_manager','panels/sound/tone_manager','shared/lazy_loader'],function(require) {
  

  var SettingsPanel = require('modules/settings_panel');
  var VolumeManager = require('panels/sound/volume_manager');
  var ToneManager = require('panels/sound/tone_manager');
  var LazyLoader = require('shared/lazy_loader');

  return function ctor_sound_panel() {
    var volumeManager = VolumeManager();
    var toneManager = ToneManager();

    return SettingsPanel({
      onInit: function(panel) {
        var _elements = {
          vibrationSetting: panel.querySelector('.vibration-setting'),
          toneSelector: panel.querySelector('.touch-tone-selector')
        };
        this._customize(_elements);

        var vmElements = {
          media: panel.querySelector('.volume.media input'),
          notification: panel.querySelector('.volume.notification input'),
          alarm: panel.querySelector('.volume.alarm input')
        };
        volumeManager.init(vmElements);

        var tmElements = {
          alertToneSelection: panel.querySelector('.alert-tone-selection'),
          alertToneSelectionDesc:
            panel.querySelector('.alert-tone-selection .desc'),
          ringToneSelection: panel.querySelector('.ring-tone-selection'),
          ringToneSelectionDesc:
            panel.querySelector('.ring-tone-selection .desc'),
          ringer: panel.querySelector('.ringer'),
          manageTones: panel.querySelector('.manage-tones-button')
        };
        toneManager.init(tmElements);
      },

      /**
       * Change UI based on conditions
       */
      _customize: function(elements) {
        // Show/hide 'Vibrate' checkbox according to device-features.json
        LazyLoader.getJSON('/resources/device-features.json')
        .then(function(data) {
          elements.vibrationSetting.hidden = !data.vibration;
        });


        // Show/hide tone selector based on mozMobileConnections
        if (window.navigator.mozMobileConnections) {
          var mobileConnections = window.navigator.mozMobileConnections;
          // Show the touch tone selector if and only if we're on a CDMA network
          var toneSelector = elements.toneSelector;
          Array.prototype.forEach.call(mobileConnections,
            function(mobileConnection) {
              getSupportedNetworkInfo(mobileConnection, function(result) {
                toneSelector.hidden = toneSelector.hidden && !result.cdma;
              });
          });
        }
      }
    });
  };
});
