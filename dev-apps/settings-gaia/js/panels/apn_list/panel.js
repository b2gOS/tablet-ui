/**
 * The apn list panel
 */
define(['require','modules/settings_service','modules/settings_panel','modules/settings_cache','modules/mvvm/list_view','modules/apn/apn_settings_manager','panels/apn_list/apn_template_factory'],function(require) {
  

  var SettingsService = require('modules/settings_service');
  var SettingsPanel = require('modules/settings_panel');
  var SettingsCache = require('modules/settings_cache');
  var ListView = require('modules/mvvm/list_view');
  var ApnSettingsManager = require('modules/apn/apn_settings_manager');
  var ApnTemplateFactory = require('panels/apn_list/apn_template_factory');

  var HEADER_L10N_MAP = {
    'default': 'dataSettings-header',
    'mms': 'messageSettings-header',
    'ims': 'imsSettings-header2',
    'supl': 'suplSettings-header',
    'dun': 'dunSettings-header'
  };

  var _getDialogService = function() {
    return new Promise(function(resolve) {
      require(['modules/dialog_service'], resolve);
    });
  };

  var _showChangeApnWarning = function() {
    return _getDialogService().then((DialogService) => {
      return DialogService.confirm('change-apn-warning-message1', {
        title: 'apnSettings',
        submitButton: {
          id: 'yes',
          style: 'recommend'
        },
        cancelButton: 'cancel'
      });
    });
  };

  return function ctor_apn_settings_panel() {
    var _rootElement;
    var _mainHeader;
    var _header;
    var _apnListViewRoot;
    var _apnListView;
    var _addApnBtn;

    var _role;

    var _apnType = 'default';
    var _serviceId = 0;

    var _onApnItemClick = function(serviceId, apnType, apnItem) {
      SettingsService.navigate('apn-editor',
        {
          mode: 'edit',
          serviceId: serviceId,
          type: apnType,
          item: apnItem
        }
      );
    };

    var _onRadioClick = function(serviceId, apnType, apnItem, radio) {
      var setActive = function() {
        apnItem.active = true;
        radio.checked = true;
        ApnSettingsManager.setActiveApnId(serviceId, apnType, apnItem.id);
      };

      SettingsCache.getSettings(function(results) {
        if (results['ril.data.roaming_enabled'] === true) {
          // Only display the warning when roaming is enabled.
          _showChangeApnWarning().then((result) => {
            if (result.type === 'submit') {
              setActive();
            }
          });
        } else {
          // XXX: We need to make this to the next tick to the UI gets updated
          // because we've prevented the default behavior in the handler.
          setTimeout(function() {
            setActive();
          });
        }
      });
    };

    var _onAddApnBtnClick = function(serviceId, apnType) {
      SettingsService.navigate('apn-editor',
        {
          mode: 'new',
          serviceId: serviceId,
          type: apnType
        }
      );
    };

    var _onBackBtnClick = function() {
      if (_role === 'activity') {
        _role = null;
        Settings.finishActivityRequest();
      } else {
        SettingsService.navigate('apn-settings');
      }
    };

    return SettingsPanel({
      onInit: function bp_onInit(rootElement) {
        _rootElement = rootElement;
        _mainHeader = rootElement.querySelector('gaia-header');
        _header = _mainHeader.querySelector('h1');
        _apnListViewRoot = rootElement.querySelector('.apn-list');
        _addApnBtn = rootElement.querySelector('button.add-apn');

        _mainHeader.addEventListener('action', _onBackBtnClick);
      },
      onBeforeShow: function bp_onBeforeShow(rootElement, options) {
        _role = options.role || _role;

        // When back from apn editor, there is no type and serviceId specified
        // so that we use the original type and service id.
        _apnType = options.type || _apnType;
        _serviceId = (options.serviceId === undefined) ?
          _serviceId : options.serviceId;

        _header.setAttribute('data-l10n-id', HEADER_L10N_MAP[_apnType]);

        var apnTemplate =
          ApnTemplateFactory(_apnType,
            _onApnItemClick.bind(null, _serviceId, _apnType),
            _onRadioClick.bind(null, _serviceId, _apnType));

        _addApnBtn.onclick = _onAddApnBtnClick.bind(null, _serviceId, _apnType);

        ApnSettingsManager.queryApns(_serviceId, _apnType)
        .then(function(apnItems) {
          _apnListView = ListView(_apnListViewRoot, apnItems, apnTemplate);
        });
      },
      onHide: function bp_onBeforeHide() {
        if (_apnListView) {
          _apnListView.destroy();
          _apnListView = null;
        }
      }
    });
  };
});
