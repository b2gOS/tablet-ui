
/**
 * The moudle supports displaying bluetooth information on an element.
 *
 * @module panels/root/bluetooth_item
 */
define('panels/root/bluetooth_item',['require','modules/bluetooth/version_detector','modules/settings_service'],function(require) {
  

  var APIVersionDetector = require('modules/bluetooth/version_detector');
  var SettingsService = require('modules/settings_service');

  var APIVersion = APIVersionDetector.getVersion();

  var _debug = false;
  var Debug = function() {};
  if (_debug) {
    Debug = function bti_debug(msg) {
      console.log('--> [BluetoothItem]: ' + msg);
    };
  }

  /**
   * @alias module:panels/root/bluetooth_item
   * @class BluetoothItem
   * @requires module:modules/bluetooth
   * @param {HTMLElement} element
                          The element displaying the bluetooth information
   * @return {BluetoothItem}
   */
  function BluetoothItem(element) {
    this._enabled = false;
    this._element = element;
    this._boundRefreshMenuDescription =
      this._refreshMenuDescription.bind(this, element);
  }

  BluetoothItem.prototype = {
    /**
     * Return Bluetooth API version via APIVersionDetector module.
     *
     * @access private
     * @memberOf BluetoothItem.prototype
     * @type {Number}
     */
    _APIVersion: function bt__APIVersion() {
      return APIVersion;
    },

    /**
     * An instance to maintain that we have created a promise to get Bluetooth
     * module.
     *
     * @access private
     * @memberOf BluetoothItem.prototype
     * @type {Promise}
     */
    _getBluetoothPromise: null,

    /**
     * A promise function to get Bluetooth module.
     *
     * @access private
     * @memberOf BluetoothItem.prototype
     * @type {Promise}
     */
    _getBluetooth: function bt__getBluetooth() {
      if (!this._getBluetoothPromise) {
        this._getBluetoothPromise = new Promise(function(resolve) {
          var bluetoothModulePath;
          if (this._APIVersion() === 1) {
            bluetoothModulePath = 'modules/bluetooth/bluetooth_v1';
          } else if (this._APIVersion() === 2) {
            Debug('loading.. modules/bluetooth/bluetooth_context');
            bluetoothModulePath = 'modules/bluetooth/bluetooth_context';
          }

          require([bluetoothModulePath], resolve);
        }.bind(this));
      }
      return this._getBluetoothPromise;
    },

    /**
     * Refresh the text based on the Bluetooth module enabled/disabled,
     * paired devices information.
     *
     * @access private
     * @memberOf BluetoothItem.prototype
     * @param {HTMLElement} element
                            The element displaying the bluetooth information
     */
    _refreshMenuDescription: function bt__refreshMenuDescription(element) {
      if (!navigator.mozL10n) {
        return;
      }

      this._getBluetooth().then(function(bluetooth) {
        Debug('Got bluetooth context');
        if (bluetooth.enabled) {
          if (bluetooth.numberOfPairedDevices === 0) {
            element.setAttribute('data-l10n-id', 'bt-status-nopaired');
          } else {
            navigator.mozL10n.setAttributes(element, 'bt-status-paired',
              {
                name: bluetooth.firstPairedDeviceName,
                n: bluetooth.numberOfPairedDevices - 1
              });
          }
        } else {
          element.setAttribute('data-l10n-id', 'bt-status-turnoff');
        }
      });
    },

    /**
     * The value indicates whether the module is responding.
     *
     * @access public
     * @memberOf BluetoothItem.prototype
     * @type {Boolean}
     */
    get enabled() {
      return this._enabled;
    },

    set enabled(value) {
      if (this._enabled === value) {
        return;
      }

      this._enabled = value;
      this._getBluetooth().then(function(bluetooth) {
        if (this._enabled) {
          bluetooth.observe('enabled', this._boundRefreshMenuDescription);
          bluetooth.observe('numberOfPairedDevices',
            this._boundRefreshMenuDescription);
          this._boundRefreshMenuDescription();
        } else {
          bluetooth.unobserve('enabled', this._boundRefreshMenuDescription);
          bluetooth.unobserve('numberOfPairedDevices',
            this._boundRefreshMenuDescription);
        }
      }.bind(this));
    },

    /**
     * Navigate new/old Bluetooth panel via version of mozBluetooth API.
     *
     * @access private
     * @memberOf BluetoothItem.prototype
     * @type {Function}
     */
    _navigatePanelWithVersionCheck:
    function bt__navigatePanelWithVersionCheck() {
      if (this._APIVersion() === 1) {
        // navigate old bluetooth panel..
        SettingsService.navigate('bluetooth');
      } else if (this._APIVersion() === 2) {
        // navigate new bluetooth panel..
        Debug('navigate bluetooth_v2 panel');
        SettingsService.navigate('bluetooth_v2');
      }
    }
  };

  return function ctor_bluetoothItem(element) {
    return new BluetoothItem(element);
  };
});

/**
 * The moudle supports displaying nfc toggle on an element.
 *
 * @module panels/root/nfc_item
 */
define('panels/root/nfc_item',['require','shared/settings_listener'],function(require) {
  

  var SettingsListener = require('shared/settings_listener');

  /**
   * @alias module:panels/root/nfc_item
   * @class NFCItem
   * @param {Object} elements
   * @param {HTMLElement} elements.nfcMenuItem
   * @param {HTMLElement} elements.nfcCheckBox
   * @returns {NFCItem}
   */
  function NFCItem(elements) {
    if (!navigator.mozNfc) {
      return;
    }
    elements.nfcMenuItem.hidden = false;
    this._checkbox = elements.nfcCheckBox;
    this._checkbox.addEventListener('change', () => this._onCheckboxChanged());

    SettingsListener.observe('nfc.status', undefined,
                             (status) => this._onNfcStatusChanged(status));
  }

  NFCItem.prototype = {
    // disabling on change to prevent double clicking and remove toggle
    // flickering before nfcManger will change nfc.status
    _onCheckboxChanged: function ni_onCheckboxChanged() {
      this._checkbox.disabled = true;
    },

    _onNfcStatusChanged: function ni_onNfcStatusChanged(status) {
      if (status === 'enabling' || status === 'disabling') {
        this._checkbox.disabled = true;
      } else if (status === 'enabled' || status === 'disabled') {
        this._checkbox.disabled = false;
      }
    }
  };

  return function ctor_nfcItem(elements) {
    return new NFCItem(elements);
  };
});

/**
 * The moudle supports displaying language information on an element.
 *
 * @module panels/root/language_item
 */
define('panels/root/language_item',['require','shared/language_list'],function(require) {
  

  var LanguageList = require('shared/language_list');

  /**
   * @alias module:panels/root/language_item
   * @class LanguageItem
   * @param {HTMLElement} element
                          The element displaying the language information
   * @returns {LanguageItem}
   */
  function LanguageItem(element) {
    this._enabled = false;
    this._boundRefreshText = this._refreshText.bind(this, element);
  }

  LanguageItem.prototype = {
    /**
     * Refresh the text based on the language setting.
     *
     * @access private
     * @memberOf LanguageItem.prototype
     * @param {HTMLElement} element
                            The element displaying the language information
     */
    _refreshText: function l_refeshText(element) {
      // display the current locale in the main panel
      LanguageList.get(function displayLang(languages, currentLanguage) {
        element.textContent = LanguageList.wrapBidi(
          currentLanguage, languages[currentLanguage]);
      });
    },

    /**
     * The value indicates whether the module is responding.
     *
     * @access public
     * @memberOf LanguageItem.prototype
     * @type {Boolean}
     */
    get enabled() {
      return this._enabled;
    },

    set enabled(value) {
      if (this._enabled === value || !navigator.mozL10n) {
        return;
      }
      
      this._enabled = value;
      if (this._enabled) {
        window.addEventListener('localized', this._boundRefreshText);
        this._boundRefreshText();
      } else {
        window.removeEventListener('localized', this._boundRefreshText);
      }
    }
  };

  return function ctor_languageItem(element) {
    return new LanguageItem(element);
  };
});

/**
 * The moudle supports displaying battery information on an element.
 *
 * @module panels/root/battery_item
 */
define('panels/root/battery_item',['require','modules/battery'],function(require) {
  

  var Battery = require('modules/battery');

  /**
   * @alias module:panels/root/battery_item
   * @class BatteryItem
   * @requires module:modules/battery
   * @param {HTMLElement} element
                          The element displaying the battery information
   * @returns {BatteryItem}
   */
  function BatteryItem(element) {
    this._enabled = false;
    this._element = element;
    this._boundRefreshText = this._refreshText.bind(this, element);
  }

  BatteryItem.prototype = {
    /**
     * Refresh the text based on the Battery module.
     *
     * @access private
     * @memberOf BatteryItem.prototype
     * @param {HTMLElement} element
                            The element displaying the battery information
     */
    _refreshText: function b_refreshText(element) {
      if (!navigator.mozL10n) {
        return;
      }

      navigator.mozL10n.setAttributes(element,
        'batteryLevel-percent-' + Battery.state, { level: Battery.level });
      if (element.hidden) {
        element.hidden = false;
      }
    },

    /**
     * The value indicates whether the module is responding.
     *
     * @access public
     * @memberOf BatteryItem.prototype
     * @type {Boolean}
     */
    get enabled() {
      return this._enabled;
    },

    set enabled(value) {
      if (this._enabled === value) {
        return;
      }
      
      this._enabled = value;
      if (this._enabled) {
        Battery.observe('level', this._boundRefreshText);
        Battery.observe('state', this._boundRefreshText);
        this._boundRefreshText();
      } else {
        Battery.unobserve('level', this._boundRefreshText);
        Battery.unobserve('state', this._boundRefreshText);
      }
    }
  };

  return function ctor_batteryItem(element) {
    return new BatteryItem(element);
  };
});

/* global SettingsListener */

/**
 * This module display Find My Device's enabled/disabled state on an
 * element.
 *
 * @module panels/root/findmydevice_item
 */
define('panels/root/findmydevice_item',['require'],function(require) {
  

  /**
   * @alias module:panels/root/findmydevice_item
   * @class FindMyDeviceItem
   * @param {HTMLElement} element
                          The element displaying Find My Device's enabled state
   * @returns {FindMyDeviceItem}
   */
  function FindMyDeviceItem(element) {
    this._itemEnabled = false;
    this._FMDEnabled = false;
    this._boundRefreshText = this._refreshText.bind(this, element);
    this._boundFMDEnabledChanged = this._onFMDEnabledChanged.bind(this);
  }

  FindMyDeviceItem.prototype = {
    /**
     * Refresh the text based on Find My Device's enabled state
     *
     * @access private
     * @memberOf FindMyDeviceItem.prototype
     * @param {HTMLElement} element
                            The element showing Find My Device's enabled state
     */
    _refreshText: function fmd_refresh_text(element) {
      if (!navigator.mozL10n) {
        return;
      }

      element.setAttribute('data-l10n-id',
                           this._FMDEnabled ? 'enabled' : 'disabled');
      element.hidden = false;
    },

    /**
     * Listener for changes in Find My Device's enabled state. Updates the
     * text if this item is enabled.
     *
     * @access private
     * @memberOf FindMyDeviceItem.prototype
     * @param {Boolean} value
                        The current enabled state for Find My Device
     */
    _onFMDEnabledChanged: function fmd_enabled_changed(value) {
      this._FMDEnabled = value;
      if (this._itemEnabled) {
        this._boundRefreshText();
      }
    },

    /**
     * The value indicates whether the module is responding.
     *
     * @access public
     * @memberOf FindMyDeviceItem.prototype
     * @type {Boolean}
     */
    get enabled() {
      return this._itemEnabled;
    },

    set enabled(value) {
      if (this._itemEnabled === value) {
        return;
      }

      this._itemEnabled = value;
      if (this._itemEnabled) {
        SettingsListener.observe('findmydevice.enabled', false,
          this._boundFMDEnabledChanged);
      } else {
        SettingsListener.unobserve('findmydevice.enabled',
          this._boundFMDEnabledChanged);
      }
    }
  };

  return function ctor_findMyDeviceItem(element) {
    return new FindMyDeviceItem(element);
  };
});

/* global DeviceStorageHelper, openIncompatibleSettingsDialog */
/**
 * Links the root panel list item with USB Storage.
 *
 * XXX bug 973451 will remove media storage part
 */
define('panels/root/storage_usb_item',['require','shared/settings_listener','shared/async_storage','modules/settings_cache','modules/settings_service'],function(require) {
  

  var SettingsListener = require('shared/settings_listener');
  var AsyncStorage = require('shared/async_storage');
  var SettingsCache = require('modules/settings_cache');
  var SettingsService = require('modules/settings_service');

  /**
   * @alias module:panels/root/storage_usb_item
   * @class USBStorageItem
   * @param {Object} elements
                     elements displaying the usb and media storage information
   * @returns {USBStorageItem}
   */
  function USBStorageItem(elements) {
    this._enabled = false;
    this._elements = elements;
    this._umsSettingKey = 'ums.enabled';
    // XXX media related attributes
    this._defaultMediaVolume = null;
    this._defaultVolumeState = 'available';
    this._defaultMediaVolumeKey = 'device.storage.writable.name';
    this._boundUmsSettingHandler = this._umsSettingHandler.bind(this);
    this._boundMediaVolumeChangeHandler =
      this._mediaVolumeChangeHandler.bind(this);
  }

  USBStorageItem.prototype = {
    /**
     * The value indicates whether the module is responding. If it is false, the
     * UI stops reflecting the updates from the root panel context.
     *
     * @access public
     * @memberOf USBStorageItem.prototype
     * @type {Boolean}
     */
    get enabled() {
      return this._enabled;
    },

    set enabled(value) {
      if (this._enabled === value) {
        return;
      } else {
        this._enabled = value;
      }
      if (value) { //observe
        this._elements.usbEnabledCheckBox.disabled = false;
        // ums master switch on root panel
        this._elements.usbEnabledCheckBox.addEventListener('change', this);

        SettingsListener.observe(this._umsSettingKey, false,
          this._boundUmsSettingHandler);

        // media storage
        // Show default media volume state on root panel
        SettingsListener.observe(this._defaultMediaVolumeKey, 'sdcard',
          this._boundMediaVolumeChangeHandler);
        window.addEventListener('localized', this);

        // register USB storage split click handler
        this._elements.usbStorage.addEventListener('click', this._onItemClick);
      } else { //unobserve
        this._elements.usbEnabledCheckBox.removeEventListener('change', this);

        SettingsListener.unobserve(this._umsSettingKey,
          this._boundUmsSettingHandler);

        // media storage
        SettingsListener.unobserve(this._defaultMediaVolumeKey,
          this._boundMediaVolumeChangeHandler);
        window.removeEventListener('localized', this);

        this._elements.usbStorage.removeEventListener('click',
          this._onItemClick);
      }
    },

    _umsSettingHandler: function storage_umsSettingHandler(enabled) {
      this._elements.usbEnabledCheckBox.checked = enabled;
      this._updateUmsDesc();
    },

    // navigate to USB Storage panel
    _onItemClick: function storage_onItemClick(evt) {
      SettingsService.navigate('usbStorage');
    },

    handleEvent: function storage_handleEvent(evt) {
      switch (evt.type) {
        case 'localized':
          this._updateMediaStorageInfo();
          break;
        case 'change':
          if (evt.target === this._elements.usbEnabledCheckBox) {
            this._umsMasterSettingChanged(evt);
          } else {
            // we are handling storage state changes
            // possible state: available, unavailable, shared
            this._updateMediaStorageInfo();
          }
          break;
      }
    },

    // ums description
    _updateUmsDesc: function storage_updateUmsDesc() {
      var key;
      if (this._elements.usbEnabledCheckBox.checked) {
        //TODO list all enabled volume name
        key = 'enabled';
      } else if (this._defaultVolumeState === 'shared') {
        key = 'umsUnplugToDisable';
      } else {
        key = 'disabled';
      }
      this._elements.usbEnabledInfoBlock.setAttribute('data-l10n-id', key);
    },

    _umsMasterSettingChanged: function storage_umsMasterSettingChanged(evt) {
      var checkbox = evt.target;
      var cset = {};
      var warningKey = 'ums-turn-on-warning';

      if (checkbox.checked) {
        AsyncStorage.getItem(warningKey, function(showed) {
          if (!showed) {
            this._elements.umsWarningDialog.hidden = false;

            this._elements.umsConfirmButton.onclick = function() {
              AsyncStorage.setItem(warningKey, true);
              this._elements.umsWarningDialog.hidden = true;

              SettingsCache.getSettings(
                this._openIncompatibleSettingsDialogIfNeeded.bind(this));
            }.bind(this);

            this._elements.umsCancelButton.onclick = function() {
              cset[this._umsSettingKey] = false;
              Settings.mozSettings.createLock().set(cset);

              checkbox.checked = false;
              this._elements.umsWarningDialog.hidden = true;
            }.bind(this);
          } else {
            SettingsCache.getSettings(
              this._openIncompatibleSettingsDialogIfNeeded.bind(this));
          }
        }.bind(this));
      } else {
        cset[this._umsSettingKey] = false;
        Settings.mozSettings.createLock().set(cset);
      }
    },

    _openIncompatibleSettingsDialogIfNeeded:
      function storage_openIncompatibleSettingsDialogIfNeeded(settings) {
        var cset = {};
        var umsSettingKey = this._umsSettingKey;
        var usbTetheringSetting = settings['tethering.usb.enabled'];

        if (!usbTetheringSetting) {
          cset[umsSettingKey] = true;
          Settings.mozSettings.createLock().set(cset);
        } else {
          var oldSetting = 'tethering.usb.enabled';
          openIncompatibleSettingsDialog('incompatible-settings-warning',
            umsSettingKey, oldSetting, null);
        }
    },

    // XXX media related functions
    _mediaVolumeChangeHandler:
      function storage_mediaVolumeChangeHandler(defaultName) {
      if (this._defaultMediaVolume) {
        this._defaultMediaVolume.removeEventListener('change', this);
      }
      this._defaultMediaVolume = this._getDefaultVolume(defaultName);
      this._defaultMediaVolume.addEventListener('change', this);
      this._updateMediaStorageInfo();
    },

    // Media Storage
    _updateMediaStorageInfo: function storage_updateMediaStorageInfo() {
      if (!this._defaultMediaVolume) {
        return;
      }

      var self = this;
      this._defaultMediaVolume.available().onsuccess = function(evt) {
        var state = evt.target.result;
        var firstVolume = navigator.getDeviceStorages('sdcard')[0];
        // if the default storage is unavailable, and it's not the
        // internal storage, we show the internal storage status instead.
        if (state === 'unavailable' &&
          self._defaultMediaVolume.storageName !== firstVolume.storageName) {
          firstVolume.available().onsuccess = function(e) {
            self._updateVolumeState(firstVolume, e.target.result);
          };
        } else {
          self._updateVolumeState(self._defaultMediaVolume, state);
        }
      };
    },

    _updateVolumeState: function storage_updateVolumeState(volume, state) {
      this._defaultVolumeState = state;
      this._updateUmsDesc();
      switch (state) {
        case 'available':
          this._updateMediaFreeSpace(volume);
          this._lockMediaStorageMenu(false);
          break;

        case 'shared':
          this._elements.mediaStorageDesc.removeAttribute('data-l10n-id');
          this._elements.mediaStorageDesc.textContent = '';
          this._lockMediaStorageMenu(false);
          break;

        case 'unavailable':
          this._elements.mediaStorageDesc.setAttribute('data-l10n-id',
                                                       'no-storage');
          this._lockMediaStorageMenu(true);
          break;
      }
    },

    _updateMediaFreeSpace: function storage_updateMediaFreeSpace(volume) {
      var self = this;
      volume.freeSpace().onsuccess = function(e) {
        DeviceStorageHelper.showFormatedSize(self._elements.mediaStorageDesc,
          'availableSize', e.target.result);
      };
    },

    _lockMediaStorageMenu: function storage_setMediaMenuState(lock) {
      if (lock) {
        this._elements.mediaStorageSection.setAttribute('aria-disabled', true);
      } else {
        this._elements.mediaStorageSection.removeAttribute('aria-disabled');
      }
    },

    // util function
    _getDefaultVolume: function storage_getDefaultVolume(name) {
      // Per API design, all media type return the same volumes.
      // So we use 'sdcard' here for no reason.
      // https://bugzilla.mozilla.org/show_bug.cgi?id=856782#c10
      var volumes = navigator.getDeviceStorages('sdcard');
      if (!name || name === '') {
        return volumes[0];
      }
      for (var i = 0; i < volumes.length; ++i) {
        if (volumes[i].storageName === name) {
          return volumes[i];
        }
      }
      return volumes[0];
    }
  };

  return function ctor_usb_storage_item(elements) {
    return new USBStorageItem(elements);
  };
});

/* global DeviceStorageHelper */
/**
 * Links the root panel list item with AppStorage.
 */
define('panels/root/storage_app_item',['require','modules/app_storage'],function(require) {
  

  var AppStorage = require('modules/app_storage');

  /**
   * @alias module:panels/root/storage_app_item
   * @class AppStorageItem
   * @requires module:modules/app_storage
   * @param {HTMLElement} element
                          The element displaying the app storage information
   * @returns {AppStorageItem}
   */
  function AppStorageItem(element) {
    this._enabled = false;
    this._element = element;
    this._boundUpdateAppFreeSpace = this._updateAppFreeSpace.bind(this);
  }

  AppStorageItem.prototype = {
    /**
     * The value indicates whether the module is responding. If it is false, the
     * UI stops reflecting the updates from the root panel context.
     *
     * @access public
     * @memberOf AppStorageItem.prototype
     * @type {Boolean}
     */
    get enabled() {
      return this._enabled;
    },

    set enabled(value) {
      if (this._enabled === value) {
        return;
      } else {
        this._enabled = value;
      }
      if (value) { //observe
        AppStorage.storage.observe('freeSize', this._boundUpdateAppFreeSpace);
        this._updateAppFreeSpace();
        window.addEventListener('localized', this);
      } else { //unobserve
        AppStorage.storage.unobserve('freeSize', this._boundUpdateAppFreeSpace);
        window.removeEventListener('localized', this);
      }
    },

    // Application Storage
    _updateAppFreeSpace: function storage_updateAppFreeSpace() {
      DeviceStorageHelper.showFormatedSize(this._element,
        'availableSize', AppStorage.storage.freeSize);
    },

    handleEvent: function storage_handleEvent(evt) {
      switch (evt.type) {
        case 'localized':
          this._updateAppFreeSpace();
          break;
      }
    }
  };

  return function ctor_app_storage_item(element) {
    return new AppStorageItem(element);
  };
});

define('panels/root/wifi_item',['require','modules/wifi_context'],function(require) {
  

  var WifiContext = require('modules/wifi_context');
  var wifiManager = navigator.mozWifiManager;

  function WifiItem(element) {
    this._enabled = false;
    this._boundUpdateWifiDesc = this._updateWifiDesc.bind(this, element);
  }

  WifiItem.prototype = {
    set enabled(value) {
      if (value === this._enabled || !wifiManager) {
        return;
      }

      this._enabled = value;
      if (this._enabled) {
        this._boundUpdateWifiDesc();
        WifiContext.addEventListener('wifiStatusTextChange',
          this._boundUpdateWifiDesc);
      } else {
        WifiContext.removeEventListener('wifiStatusTextChange',
          this._boundUpdateWifiDesc);
      }
    },

    get enabled() {
      return this._enabled;
    },

    _updateWifiDesc: function root_updateWifiDesc(element) {
      element.setAttribute('data-l10n-id', WifiContext.wifiStatusText.id);
      if (WifiContext.wifiStatusText.args) {
        element.setAttribute('data-l10n-args',
          JSON.stringify(WifiContext.wifiStatusText.args));
      } else {
        element.removeAttribute('data-l10n-args');
      }
    }
  };

  return function ctor_wifiItem(element) {
    return new WifiItem(element);
  };
});

define('panels/root/screen_lock_item',['require','shared/settings_listener'],function(require) {
  

  var SettingsListener = require('shared/settings_listener');

  function ScreenLockItem(element) {
    this._itemEnabled = false;
    this._observedKey = 'lockscreen.enabled';
    this._element = element;
    this._boundUpdateUI = this._updateUI.bind(this);
  }
  
  ScreenLockItem.prototype = {
    set enabled(value) {
      if (value === this._itemEnabled) {
        return;
      } else {
        this._itemEnabled = value;
        if (this._itemEnabled) {
          SettingsListener.observe(this._observedKey, false,
            this._boundUpdateUI);
        } else {
          SettingsListener.unobserve(this._observedKey, this._boundUpdateUI);
        }
      }
    },

    get enabled() {
      return this._itemEnabled;
    },

    _updateUI: function sl_updateUI(enabled) {
      var l10nId = enabled ? 'enabled' : 'disabled';
      this._element.setAttribute('data-l10n-id', l10nId);
    }
  };

  return function ctor_screen_lock_item(element) {
    return new ScreenLockItem(element);
  };
});

/**
 * SimSecurityItem is manily used in Single Sim device because this would
 * be integrated into Sim Manager > Sim Security in DSDS devices.
 *
 * @module SimSecurityItem
 */
define('panels/root/sim_security_item',['require','shared/simslot_manager','shared/airplane_mode_helper'],function(require) {
  

  var SIMSlotManager = require('shared/simslot_manager');
  var AirplaneModeHelper = require('shared/airplane_mode_helper');

  function SimSecurityItem(element) {
    this._element = element;
    this._itemEnabled = false;
    this._activeSlot = this._getActiveSlot();
    this._boundUpdateUI = this._updateUI.bind(this);
  }

  SimSecurityItem.prototype = {
    /**
     * Set the current status of SimSecurityItem
     *
     * @access public
     * @param {Boolean} enabled
     * @memberOf SimSecurityItem
     */
    set enabled(enabled) {
      // 1. SimSecurityItem only shows up on Single SIM devices
      // 2. If there is no activeSlot, it means we don't have to do anything
      // 3. If internal variable is enabled and we still want to enable,
      // we don't have to do anything and vice versa.
      if (SIMSlotManager.isMultiSIM() ||
        !this._activeSlot || enabled === this._itemEnabled) {
          return;
      }

      this._itemEnabled = enabled;
      if (this._itemEnabled) {
        this._boundUpdateUI();
        this._activeSlot.conn.addEventListener('cardstatechange',
          this._boundUpdateUI);
        AirplaneModeHelper.addEventListener('statechange',
          this._boundUpdateUI);
      } else {
        this._activeSlot.conn.removeEventListener('cardstatechange',
          this._boundUpdateUI);
        AirplaneModeHelper.removeEventListener('statechange',
          this._boundUpdateUI);
      }
    },

    /**
     * Get the current status of SimSecurityItem
     *
     * @access public
     * @memberOf SimSecurityItem
     */
    get enabled() {
      return this._itemEnabled;
    },

    /**
     * This method is used to update UI based on statuses of SIM / APM
     *
     * @access private
     * @memberOf SimSecurityItem
     */
    _updateUI: function() {
      var self = this;
      AirplaneModeHelper.ready(function() {
        // if disabled
        self._element.style.fontStyle = 'italic';

        // if APM is enabled
        var airplaneModeStatus = AirplaneModeHelper.getStatus();
        if (airplaneModeStatus === 'enabled') {
          self._element.setAttribute('data-l10n-id', 'simCardNotReady');
          return;
        }

        var cardState = self._activeSlot.simCard.cardState;
        switch(cardState) {
          case null:
            self._element.setAttribute('data-l10n-id', 'noSimCard');
            return;
          case 'unknown':
            self._element.setAttribute('data-l10n-id', 'unknownSimCardState');
            return;
        }

        // enabled instead
        self._element.style.fontStyle = 'normal';

        // with SIM card, query its status
        var icc = self._activeSlot.simCard;
        var req = icc.getCardLock('pin');
        req.onsuccess = function spl_checkSuccess() {
          var enabled = req.result.enabled;
          self._element.setAttribute('data-l10n-id',
            enabled ? 'enabled' : 'disabled');
        };
      });
    },

    /**
     * We use this to get active Sim slot.
     *
     * @access private
     * @memberOf SimSecurityItem
     */
    _getActiveSlot: function() {
      var activeSlot;
      SIMSlotManager.getSlots().forEach(function(SIMSlot) {
        if (!SIMSlot.isAbsent()) {
          activeSlot = SIMSlot;
        }
      });
      return activeSlot;
    }
  };

  return function ctor_sim_security_item(element) {
    return new SimSecurityItem(element);
  };
});

/**
 * This module contains modules for the low priority items in the root panel.
 * The module should only be loaded after the menu items are ready for user
 * interaction.
 *
 * @module panels/root/low_priority_items
 */
define('panels/root/low_priority_items',['require','panels/root/bluetooth_item','panels/root/nfc_item','panels/root/language_item','panels/root/battery_item','panels/root/findmydevice_item','panels/root/storage_usb_item','panels/root/storage_app_item','panels/root/wifi_item','panels/root/screen_lock_item','panels/root/sim_security_item'],function(require) {
  

  var items = {
    BluetoothItem: require('panels/root/bluetooth_item'),
    NFCItem: require('panels/root/nfc_item'),
    LanguageItem: require('panels/root/language_item'),
    BatteryItem: require('panels/root/battery_item'),
    FindMyDeviceItem: require('panels/root/findmydevice_item'),
    StorageUSBItem: require('panels/root/storage_usb_item'),
    StorageAppItem: require('panels/root/storage_app_item'),
    WifiItem: require('panels/root/wifi_item'),
    ScreenLockItem: require('panels/root/screen_lock_item'),
    SimSecurityItem: require('panels/root/sim_security_item')
  };

  return {
    get BluetoothItem()    { return items.BluetoothItem; },
    get NFCItem()          { return items.NFCItem; },
    get LanguageItem()     { return items.LanguageItem; },
    get BatteryItem()      { return items.BatteryItem; },
    get FindMyDeviceItem() { return items.FindMyDeviceItem; },
    get StorageUSBItem()   { return items.StorageUSBItem; },
    get StorageAppItem()   { return items.StorageAppItem; },
    get WifiItem()         { return items.WifiItem; },
    get ScreenLockItem()   { return items.ScreenLockItem; },
    get SimSecurityItem()  { return items.SimSecurityItem; }
  };
});
