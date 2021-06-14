
/* global TelephonySettingHelper */
/**
 * The module loads scripts used by the root panel. In the future these scripts
 * must be converted to AMD modules. Implementation details please refer to
 * {@link Root}.
 *
 * @module root/root
 */
define('panels/root/root',['require','shared/lazy_loader'],function(require) {
  

  var LazyLoader = require('shared/lazy_loader');

  /**
   * @alias module:root/root
   * @class Root
   * @requires module:shared/lazy_loader
   * @returns {Root}
   */
  function Root() {}

  Root.prototype = {
    _loadScripts: function root_loadScripts() {
      /**
       * Enable or disable the menu items related to the ICC card
       * relying on the card and radio state.
       */
      LazyLoader.load([
        'js/firefox_accounts/menu_loader.js',
        'js/telephony_settings.js',
        'js/telephony_items_handler.js'
      ], function() {
        TelephonySettingHelper
          .init()
          .then(function telephonySettingInitDone() {
            window.dispatchEvent(new CustomEvent('telephony-settings-loaded'));
          });
      });
    },

    init: function root_init() {
      // Load the necessary scripts after the UI update.
      setTimeout(this._loadScripts);
    }
  };

  return function ctor_root() {
    return new Root();
  };
});

/**
 * This module is used to control the background stuff when users
 * toggle on/off airplane mode checkbox.
 *
 * @module panels/root/airplane_mode_item
 */
define('panels/root/airplane_mode_item',['require','shared/airplane_mode_helper'],function(require) {
  

  var AirplaneModeHelper = require('shared/airplane_mode_helper');

  /**
   * @alias module:panels/root/airplane_mode_item
   * @class AirplaneModeItem
   * @param {HTMLElement} element the checkbox for airplane mode
   * @returns {AirplaneModeItem}
   */
  function AirplaneModeItem(element) {
    this._itemEnabled = false;
    this._element = element;
    this.init();
    this._boundAPMStateChange = this._onAPMStateChange.bind(this);
  }

  AirplaneModeItem.prototype = {
    /**
     * The value indicates whether the module is responding.
     *
     * @access public
     * @memberOf AirplaneModeItem.prototype
     * @type {Boolean}
     */
    set enabled(value) {
      if (this._itemEnabled === value) {
        return;
      } else {
        this._itemEnabled = value;
        if (this._itemEnabled) {
          AirplaneModeHelper.addEventListener('statechange',
            this._boundAPMStateChange);
        } else {
          AirplaneModeHelper.removeEventListener('statechange',
            this._boundAPMStateChange);
        }
      }
    },

    /**
     * The value indicates whether the module is responding.
     *
     * @access public
     * @memberOf AirplaneModeItem.prototype
     * @type {Boolean}
     */
    get enabled() {
      return this._itemEnabled;
    },

    /**
     * This function is used to reflect current status of APM to checkbox
     *
     * @access private
     * @memberOf AirplaneModeItem.prototype
     * @param {String} status current status of APM
     * @type {Function}
     */
    _onAPMStateChange: function ami_onAPMStateChange(status) {
      if (status === 'enabled' || status === 'disabled') {
        this._element.checked = (status === 'enabled') ? true : false;
        this._element.disabled = false;
      } else {
        this._element.disabled = true;
      }
    },

    /**
     * Initialize function
     *
     * @access public
     * @memberOf AirplaneModeItem.prototype
     * @type {Function}
     */
    init: function ami_init() {
      AirplaneModeHelper.ready(function() {
        // handle change on radio
        this._element.addEventListener('change', function(e) {
          this.disabled = true;
          AirplaneModeHelper.setEnabled(this.checked);
        });

        // initial status
        var status = AirplaneModeHelper.getStatus();
        this._element.checked = (status === 'enabled') ? true : false;
        this._element.disabled = false;
      }.bind(this));
    }
  };

  return function ctor_airplane_mode_item(element) {
    return new AirplaneModeItem(element);
  };
});

/**
 * This module is used to show/hide themes menuItem based on the number of
 * current installed themes.
 *
 * @module ThemesItem
 */
define('panels/root/themes_item',['require','modules/apps_cache'],function(require) {
  

  var AppsCache = require('modules/apps_cache');

  function ThemesItem(element) {
    this._enabled = false;
    this._element = element; 
    this._themeCount = 0;
    this._boundUpdateThemes = this._updateThemes.bind(this);
    this.init();
  }

  ThemesItem.prototype = {
    /**
     * Set current status of themesItem
     *
     * @access public
     * @param {Boolean} enabled
     * @memberOf ThemesItem
     */
    set enabled(enabled) {
      if (this._enabled === enabled) {
        return;
      } else {
        this._enabled = enabled;
        if (this._enabled) {
          this._updateThemeSectionVisibility();
        }
      }
    },

    /**
     * Get current status of themesItem
     *
     * @access public
     * @memberOf ThemesItem
     */
    get enabled() {
      return this._enabled;
    },

    /**
     * Initialization
     *
     * @access private
     * @memberOf ThemesItem
     * @return {Promise}
     */
    init: function() {
      var self = this;
      AppsCache.addEventListener('install', this._boundUpdateThemes);
      AppsCache.addEventListener('uninstall', this._boundUpdateThemes);
      return AppsCache.apps().then(function(apps) {
        apps.some(function(app) {
          if (self._isThemeApp(app)) {
            self._themeCount += 1;
          }
        });
        self._updateThemeSectionVisibility();
      });
    },

    /**
     * Check whether this app is theme app
     *
     * @param {Object} app
     * @returns {Boolean}
     * @memberOf ThemesItem
     */
    _isThemeApp: function(app) {
      var manifest = app.manifest || app.updateManifest;
      return manifest.role === 'theme';
    },

    /**
     * We have to update theme count based on incoming evt and
     * decide to show/hide or not.
     *
     * @param {Object} evt
     * @memberOf ThemesItem
     */
    _updateThemes: function(evt) {
      var app = evt && evt.application;
      var type = evt.type;

      if (this._isThemeApp(app)) {
        if (type === 'install') {
          this._themeCount += 1;
        } else if (type === 'uninstall') {
          this._themeCount -= 1;
        }
        this._updateThemeSectionVisibility();
      }
    },

    /**
     * Update theme section visibility based on _themeCount
     *
     * @memberOf ThemesItem
     */
    _updateThemeSectionVisibility: function() {
      this._element.hidden = (this._themeCount < 2);
    }
  };

  return function ctor_themesItem(element) {
    return new ThemesItem(element);
  };
});



define('modules/mvvm/observable_array',[],function() {
  function unobserve(_eventHandlers, prop, handler) {
    // arguments in reverse order to support .bind(handler) for the
    // unbind from all case
    function removeHandler(handler, prop) {
      var handlers = _eventHandlers[prop];
      if (!handlers) {
        return;
      }
      var index = handlers.indexOf(handler);
      if (index >= 0) {
        handlers.splice(index, 1);
      }
    }

    if (typeof prop === 'function') {
      // (handler) -- remove from every key in _eventHandlers
      Object.keys(_eventHandlers).forEach(removeHandler.bind(null, prop));
    } else if (handler) {
      // (prop, handler) -- remove handler from the specific prop
      removeHandler(handler, prop);
    } else if (prop in _eventHandlers) {
      // (prop) -- otherwise remove all handlers for property
      _eventHandlers[prop] = [];
    }
  }

  /*
   * An ObservableArray is able to notify its change through four basic
   * operations including 'insert', 'remove', 'replace', 'reset'. It is
   * initialized by an ordinary array.
   */
  function ObservableArray(array) {
    var _array = array || [];
    var _eventHandlers = {
      'insert': [],
      'remove': [],
      'replace': [],
      'reset': []
    };

    var _notify = function(eventType, data) {
      var handlers = _eventHandlers[eventType];
      handlers.forEach(function(handler) {
        handler({
          type: eventType,
          data: data
        });
      });
    };

    return {
      get length() {
        return _array.length;
      },

      get array() {
        return _array;
      },

      forEach: function oa_foreach(func) {
        _array.forEach(func);
      },

      observe: function oa_observe(eventType, handler) {
        var handlers = _eventHandlers[eventType];
        if (handlers) {
          handlers.push(handler);
        }
      },

      unobserve: unobserve.bind(null, _eventHandlers),

      push: function oa_push(item) {
        _array.push(item);

        _notify('insert', {
          index: _array.length - 1,
          count: 1,
          items: [item]
        });
      },

      pop: function oa_pop() {
        if (!_array.length) {
          return;
        }

        var item = _array.pop();

        _notify('remove', {
          index: _array.length,
          count: 1
        });

        return item;
      },

      splice: function oa_splice(index, count) {
        if (arguments.length < 2) {
          return;
        }

        var addedItems = Array.prototype.slice.call(arguments, 2);
        _array.splice.apply(_array, arguments);

        if (count) {
          _notify('remove', {
            index: index,
            count: count
          });
        }

        if (addedItems.length) {
          _notify('insert', {
            index: index,
            count: addedItems.length,
            items: addedItems
          });
        }
      },

      set: function oa_set(index, value) {
        if (index < 0 || index >= _array.length) {
          return;
        }

        var oldValue = _array[index];
        _array[index] = value;
        _notify('replace', {
          index: index,
          oldValue: oldValue,
          newValue: value
        });
      },

      get: function oa_get(index) {
        return _array[index];
      },

      reset: function oa_reset(array) {
        _array = array;
        _notify('reset', {
          items: _array
        });
      }
    };
  }

  return ObservableArray;
});

/**
 * Handle addons panel's functionality.
 *
 * @module AddonsManager
 */
define('panels/addons/addons_manager',['require','modules/apps_cache','modules/mvvm/observable_array'],function(require) {
  

  var AppsCache = require('modules/apps_cache');
  var ObservableArray = require('modules/mvvm/observable_array');

  function AddonsManager() {
    this.addons = {};
  }

  AddonsManager.prototype = {
    /**
     * initialization
     *
     * @memberOf AddonsManager
     * @access public
     */
    init: function am_init() {
      this.addons = ObservableArray([]);
      return AppsCache.apps().then((apps) => {
        apps.some((app) => {
          if (this._isAddon(app)) {
            this.addons.push(app);
          }
        });
      });
    },

    set enabled(value) {
      if (value !== this._enabled) {
        this._enabled = value;
        if (this._enabled) {
          this._bindEvents();
        } else {
          this._unbindEvents();
        }
      }
    },

    _bindEvents: function am__bindEvents() {
      AppsCache.addEventListener('oninstall', this._updateAddons.bind(this));
      AppsCache.addEventListener('onuninstall', this._updateAddons.bind(this));
    },

    _unbindEvents: function am__unbindEvents() {
      AppsCache.removeEventListener('oninstall', this._updateAddons);
      AppsCache.removeEventListener('onuninstall', this._updateAddons);
    },

    /**
     * We have to update the addon count based on incoming evt and
     * decide to show/hide or not.
     *
     * @param {Object} evt
     * @memberOf AddonsManager
     */
    _updateAddons: function(evt) {
      var app = evt && evt.application;
      var type = evt.type;

      if (this._isAddon(app)) {
        if (type === 'install' && !this._alreadyExists(app)) {
          this.addons.push(app);
        } else if (type === 'uninstall') {
          var index = this._findAddon(app);
          if (index !== -1) {
            this.addons.splice(index, 1);  
          }
        }
      }
    },

    _alreadyExists: function(app) {
      return this._findAddonIndex(app) !== -1;
    },

    _findAddonIndex: function(app) {
      return this.addons.array.findIndex((elem) => {
        return app.manifestURL === elem.manifestURL;
      });
    },

    /**
     * Check whether this app is an addon
     *
     * @param {Object} app
     * @returns {Boolean}
     * @memberOf AddonsManager
     */
    _isAddon: function(app) {
      var manifest = app.manifest || app.updateManifest;
      return manifest.role === 'addon';
    },

    enableAddon: function(app) {
      navigator.mozApps.mgmt.setEnabled(app, true);
    },

    disableAddon: function(app) {
      navigator.mozApps.mgmt.setEnabled(app, false);
    },

    get length() {
      return this.addons.length;
    }

  };

  return function ctor_addons_manager() {
    return new AddonsManager();
  };
});

/**
 * This module is used to show/hide addon menuItem based on the number of
 * current installed addons.
 *
 * @module AddonsItem
 */
define('panels/root/addons_item',['require','panels/addons/addons_manager'],function(require) {
  

  var AddonsManager = require('panels/addons/addons_manager');

  function AddonsItem(element) {
    this._enabled = false;
    this._element = element;
    this.addonsManager = AddonsManager();
    this.init();
  }

  AddonsItem.prototype = {
    /**
     * Set current status of addonsItem
     *
     * @access public
     * @param {Boolean} enabled
     * @memberOf AddonsItem
     */
    set enabled(enabled) {
      if (this._enabled === enabled) {
        return;
      } else {
        this._enabled = enabled;
        if (this._enabled) {
          this._updateAddonSectionVisibility();
        }
      }
    },

    /**
     * Get current status of addonsItem
     *
     * @access public
     * @memberOf AddonsItem
     */
    get enabled() {
      return this._enabled;
    },

    /**
     * Initialization
     *
     * @access private
     * @memberOf AddonsItem
     * @return {Promise}
     */
    init: function() {
      this.addonsManager.init().then( () => {
        var _handleEvent = this._updateAddonSectionVisibility.bind(this);
        this.addonsManager.addons.observe('insert', _handleEvent);
        this.addonsManager.addons.observe('remove', _handleEvent);
        this.addonsManager.addons.observe('reset', _handleEvent);

        this._updateAddonSectionVisibility();
      });
    },

    /**
     * Update addon section visibility based on _addonCount
     *
     * @memberOf AddonsItem
     */
    _updateAddonSectionVisibility: function() {
      this._element.hidden = this.addonsManager.length === 0;
    }
  };

  return function(element) {
    return new AddonsItem(element);
  };
});

/**
 * HomescreenItem is used to handle the visibility of this menuItem
 *
 * @module HomescreenItem
 */
define('panels/root/homescreen_item',['require','modules/apps_cache'],function(require) {
  

  var AppsCache = require('modules/apps_cache');

  var HomescreenItem = function(element) {
    this._itemEnabled = false;
    this._element = element;
    this._boundToggleHomescreenSection =
      this._updateHomescreenSection.bind(this);
  };

  HomescreenItem.prototype = {
    /**
     * Set the current status of HomescreenItem
     * 
     * @access public
     * @param {Boolean} value
     * @memberOf HomescreenItem
     */
    set enabled(value) {
      if (this._itemEnabled === value) {
        return;
      } else {
        this._itemEnabled = value;
        if (this._itemEnabled) {
          this._boundToggleHomescreenSection();
          AppsCache.addEventListener('oninstall',
            this._boundToggleHomescreenSection);
          AppsCache.addEventListener('onuninstall',
            this._boundToggleHomescreenSection);
        } else {
          AppsCache.removeEventListener('oninstall',
            this._boundToggleHomescreenSection);
          AppsCache.removeEventListener('onuninstall',
            this._boundToggleHomescreenSection);
        }
      }
    },

    /**
     * Get the current status of HomescreenItem
     *
     * @access public
     * @memberOf HomescreenItem
     */
    get enabled() {
      return this._itemEnabled;
    },

    /**
     * Toggle the visibility of homescreen menuItem
     *
     * @access private
     * @memberOf HomescreenItem
     * @return {Promise}
     */
    _updateHomescreenSection: function h__updateHomescreenSection() {
      var self = this;
      return AppsCache.apps().then(function(apps) {
        var homescreenApps = self._getHomescreenApps(apps);
        if (homescreenApps.length < 2) {
          self._element.hidden = true;
        } else {
          self._element.hidden = false;
        }
      });
    },

    /**
     * Get homescreen related apps
     *
     * @access private
     * @param {Array.<Object>} apps - all installed apps
     * @memberOf HomescreenItem
     * @return {Array.<Object>} homescreen apps
     */
    _getHomescreenApps: function h__getHomescreenApps(apps) {
      return apps.filter(function(app) {
        var manifest = app.manifest || app.updateManifest;
        var role = manifest && manifest.role;
        return role === 'homescreen';
      });
    }
  };
  
  return function ctor_homescreenItem(element) {
    return new HomescreenItem(element);
  };
});

/**
 * PrivacyPanelItem provides the transition to Privacy Panel app.
 *
 * @module PrivacyPanelItem
 */

define('panels/root/privacy_panel_item',['require','modules/apps_cache'],function(require) {
  

  var AppsCache = require('modules/apps_cache');

  function PrivacyPanelItem(args) {
    this._element = args.element;
    this._link = args.link;
    this._app = null;

    this._privacyPanelManifestURL = document.location.protocol +
      '//privacy-panel.gaiamobile.org' +
      (location.port ? (':' + location.port) : '') + '/manifest.webapp';

    this._getApp();

    this._element.addEventListener('click', this._launch.bind(this));
  }

  PrivacyPanelItem.prototype = {

    /**
     * Set current status of privacyPanelItem
     *
     * @access public
     * @param {Boolean} enabled
     * @memberOf PrivacyPanelItem
     */
    set enabled(enabled) {
      if (this._enabled === enabled) {
        return;
      } else {
        this._enabled = enabled;
        if (this._enabled) {
          this._blurLink();
        }
      }
    },

    /**
     * Get current status of privacyPanelItem
     *
     * @access public
     * @memberOf PrivacyPanelItem
     */
    get enabled() {
      return this._enabled;
    },

    /**
     * Search from privacy-panel app and grab it's instance.
     * @memberOf PrivacyPanelItem
     */
    _getApp: function pp_getApp() {
      return AppsCache.apps().then(function(apps) {
        var i, app;
        for (i = 0; i < apps.length; i++) {
          app = apps[i];
          if (app.manifestURL === this._privacyPanelManifestURL) {
            this._app = app;
            this._element.removeAttribute('hidden');
            return;
          }
        }
      }.bind(this));
    },

    /**
     * Launch Privacy Panel app.
     *
     * @param {Event} event
     * @memberOf PrivacyPanelItem
     */
    _launch: function pp_launch(event) {
      // Stop propagation & prevent default not to block other settings events.
      event.stopImmediatePropagation();
      event.preventDefault();

      if (this._app) {
        // Bug 1120733: Privacy-panel app is always launched from settings
        this._app.launch();
      } else {
        alert(navigator.mozL10n.get('no-privacy-panel'));
      }
    },

    /**
     * Blur link.
     *
     * @memberOf PrivacyPanelItem
     */
    _blurLink: function pp_blurLink() {
      this._link.blur();
    }
  };

  return function ctor_privacyPanelItem(element) {
    return new PrivacyPanelItem(element);
  };
});

define('panels/root/stk_item',['require','shared/stk_helper'],function(require) {
  
  var STKHelper = require('shared/stk_helper');

  function STKItem(elements) {
    this._elements = elements;
    this.init();
  }

  STKItem.prototype.init = function() {
    var iccLoaded = false;
    var self = this;
    function loadIccPage(callback) {
      callback = (typeof callback === 'function') ? callback : function() {};
      if (iccLoaded) {
        return callback();
      }
      Settings.currentPanel = '#icc';
      window.addEventListener('iccPageLoaded',
        function oniccPageLoaded(event) {
          iccLoaded = true;
          callback();
        });
    }

    function executeIccCmd(iccMessage) {
      if (!iccMessage) {
        return;
      }

      // Clear cache
      var reqIccData = window.navigator.mozSettings.createLock().set({
        'icc.data': null
      });
      reqIccData.onsuccess = function icc_getIccData() {
        window.DUMP('ICC Cache cleared');
      };

      // Open ICC section
      window.DUMP('ICC message to execute: ', iccMessage);
      loadIccPage(function() {
        var event = new CustomEvent('stkasynccommand', {
          detail: { 'message': iccMessage }
        });
        window.dispatchEvent(event);
      });
    }

    setTimeout(function updateStkMenu() {
      window.DUMP('Showing STK main menu');
      // XXX https://bugzilla.mozilla.org/show_bug.cgi?id=844727
      // We should use Settings.settingsCache first
      var settings = Settings.mozSettings;
      var lock = settings.createLock();

      function showStkEntries(menu) {
        window.DUMP('STK cached menu: ', menu);
        if (!menu || typeof menu !== 'object' ||
          Object.keys(menu).length === 0) {
            window.DUMP('No STK available - exit');
            self._elements.iccMainHeader.hidden = true;
            self._elements.iccEntries.hidden = true;
            return;
        }

        // Clean current entries
        self._elements.iccEntries.innerHTML = '';
        self._elements.iccMainHeader.hidden = true;
        self._elements.iccEntries.hidden = true;

        // update and show the entry in settings
        Object.keys(menu).forEach(function(SIMNumber) {
          window.DUMP('STK Menu for SIM ' + SIMNumber +
            ' (' + menu[SIMNumber].iccId + ') - ', menu[SIMNumber].entries);

          var li = document.createElement('li');
          var a = document.createElement('a');
          var menuItem = menu[SIMNumber].entries;
          var icon = STKHelper.getFirstIconRawData(menuItem);

          a.id = 'menuItem-icc-' + menu[SIMNumber].iccId;
          a.className = 'menu-item menuItem-icc';
          a.href = '#icc';
          if (icon) {
            var iconContainer = document.createElement('span');
            iconContainer.appendChild(STKHelper.getIconCanvas(icon));
            li.appendChild(iconContainer);
            self._elements.iccEntries.dataset.customIcon = true;
          } else {
            a.dataset.icon = 'sim-toolkit';
          }
          a.onclick = function menu_icc_onclick() {
            window.DUMP('Touched ' + menu[SIMNumber].iccId);
            loadIccPage(function() {
              var event = new CustomEvent('stkmenuselection', {
                detail: { 'menu': menu[SIMNumber] }
              });
              window.dispatchEvent(event);
            });
          };

          var span = document.createElement('span');
          span.textContent = menu[SIMNumber].entries.title;
          a.appendChild(span);

          if (Object.keys(menu).length > 1) {
            var small = document.createElement('small');
            small.setAttribute('data-l10n-id', 'sim' + SIMNumber);
            small.classList.add('menu-item-desc');
            a.appendChild(small);
          }

          li.appendChild(a);
          self._elements.iccEntries.appendChild(li);

          self._elements.iccMainHeader.hidden = false;
          self._elements.iccEntries.hidden = false;
        });
      }

      // Check if SIM card sends an Applications menu
      var reqApplications = lock.get('icc.applications');
      reqApplications.onsuccess = function icc_getApplications() {
        var json = reqApplications.result['icc.applications'];
        var menu = json && JSON.parse(json);
        showStkEntries(menu);
      };

      settings.addObserver('icc.applications',
        function icc_getApplications(event) {
          var json = event.settingValue;
          var menu = json && JSON.parse(json);
          showStkEntries(menu);
        });

      // Check if there are pending STK commands
      var reqIccData = lock.get('icc.data');
      reqIccData.onsuccess = function icc_getIccData() {
        var cmd = reqIccData.result['icc.data'];
        if (cmd) {
          window.DUMP('ICC async command (launcher)');
          executeIccCmd(JSON.parse(cmd));
        }
      };

      settings.addObserver('icc.data', function(event) {
        var value = event.settingValue;
        if (value) {
          window.DUMP('ICC async command while settings running: ', value);
          executeIccCmd(JSON.parse(value));
        }
      });
    }.bind(this));
  };

  return function ctor_stk_item(elements) {
    return new STKItem(elements); 
  };
});

define('panels/root/panel',['require','modules/settings_service','modules/settings_panel','panels/root/root','panels/root/airplane_mode_item','panels/root/themes_item','panels/root/addons_item','panels/root/homescreen_item','panels/root/privacy_panel_item','panels/root/stk_item','modules/bluetooth/version_detector','dsds_settings'],function(require) {
  

  var SettingsService = require('modules/settings_service');
  var SettingsPanel = require('modules/settings_panel');
  var Root = require('panels/root/root');
  var AirplaneModeItem = require('panels/root/airplane_mode_item');
  var ThemesItem = require('panels/root/themes_item');
  var AddonsItem = require('panels/root/addons_item');
  var HomescreenItem = require('panels/root/homescreen_item');
  var PrivacyPanelItem = require('panels/root/privacy_panel_item');
  var STKItem = require('panels/root/stk_item');
  var BTAPIVersionDetector = require('modules/bluetooth/version_detector');
  var DsdsSettings = require('dsds_settings');

  var queryRootForLowPriorityItems = function(panel) {
    // This is a map from the module name to the object taken by the constructor
    // of the module.
    var storageDialog = document.querySelector('.turn-on-ums-dialog');
    return {
      'BluetoothItem': panel.querySelector('.bluetooth-desc'),
      'NFCItem': {
        nfcMenuItem: panel.querySelector('.nfc-settings'),
        nfcCheckBox: panel.querySelector('#nfc-input')
      },
      'LanguageItem': panel.querySelector('.language-desc'),
      'BatteryItem': panel.querySelector('.battery-desc'),
      'FindMyDeviceItem': panel.querySelector('.findmydevice-desc'),
      'StorageUSBItem': {
        mediaStorageDesc: panel.querySelector('.media-storage-desc'),
        usbEnabledCheckBox: panel.querySelector('.usb-switch'),
        usbStorage: panel.querySelector('#menuItem-enableStorage'),
        usbEnabledInfoBlock: panel.querySelector('.usb-desc'),
        umsWarningDialog: storageDialog,
        umsConfirmButton: storageDialog.querySelector('.ums-confirm-option'),
        umsCancelButton: storageDialog.querySelector('.ums-cancel-option'),
        mediaStorageSection: panel.querySelector('.media-storage-section')
      },
      'StorageAppItem': panel.querySelector('.application-storage-desc'),
      'WifiItem': panel.querySelector('#wifi-desc'),
      'ScreenLockItem': panel.querySelector('.screenLock-desc'),
      'SimSecurityItem': panel.querySelector('.simCardLock-desc')
    };
  };

  return function ctor_root_panel() {
    var root;
    var airplaneModeItem;
    var themesItem;
    var homescreenItem;
    var privacyPanelItem;
    var addonsItem;
    var stkItem;

    var lowPriorityRoots = null;
    var initLowPriorityItemsPromise = null;
    var initLowPriorityItems = function(rootElements) {
      if (!initLowPriorityItemsPromise) {
        initLowPriorityItemsPromise = new Promise(function(resolve) {
          require(['panels/root/low_priority_items'], resolve);
        }).then(function(itemCtors) {
          var result = {};
          Object.keys(rootElements).forEach(function(name) {
            var itemCtor = itemCtors[name];
            if (itemCtor) {
              result[name] = itemCtor(rootElements[name]);
            }
          });
          return result;
        });
      }
      return initLowPriorityItemsPromise;
    };

    return SettingsPanel({
      onInit: function rp_onInit(panel) {
        root = Root();
        root.init();

        airplaneModeItem =
          AirplaneModeItem(panel.querySelector('.airplaneMode-input'));
        themesItem =
          ThemesItem(panel.querySelector('.themes-section'));
        homescreenItem =
          HomescreenItem(panel.querySelector('#homescreens-section'));
        addonsItem =
          AddonsItem(panel.querySelector('#addons-section'));
        privacyPanelItem = PrivacyPanelItem({
          element: panel.querySelector('.privacy-panel-item'),
          link: panel.querySelector('.privacy-panel-item a')
        });
        stkItem = STKItem({
          iccMainHeader: panel.querySelector('#icc-mainheader'),
          iccEntries: panel.querySelector('#icc-entries')
        });

        // The decision of navigation panel will be removed while we are no
        // longer to use Bluetooth API v1.
        var bluetoothListItem = panel.querySelector('.menuItem-bluetooth');
        var BTAPIVersion = BTAPIVersionDetector.getVersion();
        bluetoothListItem.addEventListener('click', function() {
          if (BTAPIVersion === 1) {
            // navigate old bluetooth panel..
            SettingsService.navigate('bluetooth');
          } else if (BTAPIVersion === 2) {
            // navigate new bluetooth panel..
            SettingsService.navigate('bluetooth_v2');
          }
        });

        // If the device supports dsds, callSettings must be changed 'href' for 
        // navigating call-iccs panel first.
        if (DsdsSettings.getNumberOfIccSlots() > 1) {
          var callItem = document.getElementById('menuItem-callSettings');
          callItem.setAttribute('href', '#call-iccs');
        }

        var idleObserver = {
          time: 3,
          onidle: function() {
            navigator.removeIdleObserver(idleObserver);
            lowPriorityRoots = queryRootForLowPriorityItems(panel);
            initLowPriorityItems(lowPriorityRoots).then(function(items) {
              Object.keys(items).forEach((key) => items[key].enabled = true);
            });
          }
        };
        navigator.addIdleObserver(idleObserver);
      },
      onShow: function rp_onShow(panel) {
        airplaneModeItem.enabled = true;
        themesItem.enabled = true;
        privacyPanelItem.enabled = true;
        homescreenItem.enabled = true;
        addonsItem.enabled = true;

        if (initLowPriorityItemsPromise) {
          initLowPriorityItemsPromise.then(function(items) {
            Object.keys(items).forEach((key) => items[key].enabled = true);
          });
        }
      },
      onHide: function rp_onHide() {
        airplaneModeItem.enabled = false;
        themesItem.enabled = false;
        homescreenItem.enabled = false;
        privacyPanelItem.enabled = false;
        addonsItem.enabled = false;

        if (initLowPriorityItemsPromise) {
          initLowPriorityItemsPromise.then(function(items) {
            Object.keys(items).forEach((key) => items[key].enabled = false);
          });
        }
      }
    });
  };
});
