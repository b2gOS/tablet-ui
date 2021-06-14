
/**
 * Handle display panel functionality, which will change the value of
 * screen.automatic-brightness of settings.
 *
 * @module display/display
 */
define('panels/display/display',['require','shared/settings_listener'],function(require) {
  

  var SettingsListener = require('shared/settings_listener');

  /**
   * @alias module:display/display
   * @class Display
   * @returns {Display}
   */
  var Display = function() {
    this.elements = null;
  };

  Display.prototype = {
    /**
     * Init Display module with doms and data of device-features.json.
     *
     * @access public
     * @memberOf Display.prototype
     * @param {HTMLElement} elements
     * @param {Object} data
     *                 content of resources/device-features.json.
     */
    init: function d_init(elements, data) {
      this.elements = elements;
      this.initBrightnessItems(data);
    },

    /**
     * Decide whether to show brightnessAuto and brightnessManual options.
     *
     * @access public
     * @memberOf Display.prototype
     * @param {Object} data
     *                 content of resources/device-features.json.
     */
    initBrightnessItems: function d_init_brightness_items(data) {
      var autoBrightnessSetting = 'screen.automatic-brightness';

      if (data.ambientLight) {
        this.elements.brightnessAuto.hidden = false;
        SettingsListener.observe(autoBrightnessSetting, false, function(value) {
          this.elements.brightnessManual.hidden = value;
        }.bind(this));
      } else {
        this.elements.brightnessAuto.hidden = true;
        this.elements.brightnessManual.hidden = false;
        var cset = {};
        cset[autoBrightnessSetting] = false;
        SettingsListener.getSettingsLock().set(cset);
      }
    }
  };

  return function ctor_display() {
    return new Display();
  };
});

/* global MozActivity */
/**
 * Wallpaper:
 *   - Select wallpaper by calling wallpaper.selectWallpaper.
 *   - Update wallpaperSrc if wallpaper.image is changed, which is watched
 *     by Observable module.
 * Wallpaper handles only data and does not involve in any UI logic.
 *
 * @module Wallpaper
 */
define('panels/display/wallpaper',['require','shared/settings_listener','shared/settings_url','shared/omadrm/fl','modules/mvvm/observable'],function(require) {
  

  var SettingsListener = require('shared/settings_listener');
  var SettingsURL = require('shared/settings_url');
  var ForwardLock = require('shared/omadrm/fl');
  var Observable = require('modules/mvvm/observable');
  var WALLPAPER_KEY = 'wallpaper.image';
  /**
   * @alias module:display/wallpaper
   * @requires module:modules/mvvm/observable
   * @returns {wallpaperPrototype}
   */
  var wallpaperPrototype = {
    /**
     * Init Wallpaper module.
     *
     * @access private
     * @memberOf wallpaperPrototype
     */
    _init: function w_init() {
      this.WALLPAPER_KEY = WALLPAPER_KEY;
      this.wallpaperURL = new SettingsURL();
      this._watchWallpaperChange();
    },

    /**
     * Watch the value of wallpaper.image from settings and change wallpaperSrc.
     *
     * @access private
     * @memberOf wallpaperPrototype
     */
    _watchWallpaperChange: function w__watch_wallpaper_change() {
      SettingsListener.observe(this.WALLPAPER_KEY, '',
        function onHomescreenchange(value) {
          this.wallpaperSrc = this.wallpaperURL.set(value);
      }.bind(this));
    },

    /**
     * Switch to wallpaper or gallery app to pick wallpaper.
     *
     * @access private
     * @memberOf wallpaperPrototype
     * @param {String} secret
     */
    _triggerActivity: function w__trigger_activity(secret) {
      var mozActivity = new MozActivity({
        name: 'pick',
        data: {
          type: ['wallpaper', 'image/*'],
          includeLocked: (secret !== null),
          // XXX: This will not work with Desktop Fx / Simulator.
          width: Math.ceil(window.screen.width * window.devicePixelRatio),
          height: Math.ceil(window.screen.height * window.devicePixelRatio)
        }
      });
      mozActivity.onsuccess = function() {
        this._onPickSuccess(mozActivity.result.blob, secret);
      }.bind(this);

      mozActivity.onerror = this._onPickError;
    },

    /**
     * Call back when picking success.
     *
     * @access private
     * @memberOf wallpaperPrototype
     * @param {String} blob
     * @param {String} secret
     */
    _onPickSuccess: function w__on_pick_success(blob, secret) {
      if (!blob) {
        return;
      }
      if (blob.type.split('/')[1] === ForwardLock.mimeSubtype) {
        // If this is a locked image from the locked content app, unlock it
        ForwardLock.unlockBlob(secret, blob, function(unlocked) {
          this._setWallpaper(unlocked);
        }.bind(this));
      } else {
        this._setWallpaper(blob);
      }
    },

    /**
     * Update the value of wallpaper.image from settings.
     *
     * @access private
     * @param {String} value
     * @memberOf wallpaperPrototype
     */
    _setWallpaper: function w__set_wallpaper(value) {
      var config = {};
      config[this.WALLPAPER_KEY] = value;
      SettingsListener.getSettingsLock().set(config);
    },

    /**
     * Call back when picking fail.
     *
     * @access private
     * @memberOf wallpaperPrototype
     */
    _onPickError: function w__on_pick_error() {
      console.warn('pick failed!');
    },

    /**
     * Source path of wallpaper.
     *
     * @access public
     * @memberOf wallpaperPrototype
     * @type {String}
     */
    wallpaperSrc: '',

    /**
     * Start to select wallpaper.
     *
     * @access public
     * @memberOf wallpaperPrototype
     */
    selectWallpaper: function w_select_wallpaper() {
      ForwardLock.getKey(this._triggerActivity.bind(this));
    }
  };

  return function ctor_wallpaper() {
    // Create the observable object using the prototype.
    var wallpaper = Observable(wallpaperPrototype);
    wallpaper._init();
    return wallpaper;
  };
});

/**
 * The display panel allow user to modify timeout forscreen-off, brightness, and
 * change wallpaper.
 */
define('panels/display/panel',['require','modules/settings_panel','panels/display/display','panels/display/wallpaper','shared/lazy_loader'],function(require) {
  

  var SettingsPanel = require('modules/settings_panel');
  var DisplayModule = require('panels/display/display');
  var WallpaperModule = require('panels/display/wallpaper');
  var LazyLoader = require('shared/lazy_loader');

  var wallpaperElements = {};
  var displayElements = {};

  return function ctor_display_panel() {
    var display = DisplayModule();
    var wallpaper = WallpaperModule();

    return SettingsPanel({
      onInit: function dp_onInit(panel) {
        displayElements = {
          brightnessManual: panel.querySelector('.brightness-manual'),
          brightnessAuto: panel.querySelector('.brightness-auto')
        };

        wallpaperElements = {
          wallpaper: panel.querySelector('.wallpaper'),
          wallpaperPreview: panel.querySelector('.wallpaper-preview')
        };

        wallpaperElements.wallpaper.addEventListener('click',
          wallpaper.selectWallpaper.bind(wallpaper));

        LazyLoader.getJSON('/resources/device-features.json')
        .then(function(data) {
          display.init(displayElements, data);
        });
      },

      onBeforeShow: function dp_onBeforeShow() {
        wallpaper.observe('wallpaperSrc', function(newValue) {
          wallpaperElements.wallpaperPreview.src = newValue;
        });
        wallpaperElements.wallpaperPreview.src = wallpaper.wallpaperSrc;
      },

      onBeforeHide: function dp_onBeforeHide() {
        wallpaper.unobserve('wallpaperSrc');
      }
    });
  };
});
