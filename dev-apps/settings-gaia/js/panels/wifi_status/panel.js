
define('panels/wifi_status/panel',['require','modules/dialog_panel','shared/wifi_helper'],function(require) {
  

  var DialogPanel = require('modules/dialog_panel');
  var WifiHelper = require('shared/wifi_helper');
  var wifiManager = WifiHelper.getWifiManager();

  return function ctor_statusWifi() {
    var elements = {};

    return DialogPanel({
      onInit: function(panel) {
        elements = {};
        elements.ip = panel.querySelector('[data-ip]');
        elements.speed = panel.querySelector('[data-speed]');
        elements.ssid = panel.querySelector('[data-ssid]');
        elements.signal = panel.querySelector('[data-signal]');
        elements.security = panel.querySelector('[data-security]');
      },
      onBeforeShow: function(panel, options) {
        this._updateNetworkInfo();
        elements.ssid.textContent = options.network.ssid;
        elements.signal.setAttribute('data-l10n-id',
          'signalLevel' + options.sl);
        if (options.security) {
          elements.security.removeAttribute('data-l10n-id');
          elements.security.textContent = options.security;
        } else {
          elements.security.setAttribute('data-l10n-id', 'securityNone');
        }
        wifiManager.onconnectioninfoupdate = this._updateNetworkInfo;
      },
      onBeforeHide: function() {
        wifiManager.onconnectioninfoupdate = null;
      },
      _updateNetworkInfo: function() {
        var info = wifiManager.connectionInformation || {};
        elements.ip.textContent = info.ipAddress || '';
        navigator.mozL10n.setAttributes(elements.speed,
          'linkSpeedMbs', { linkSpeed: info.linkSpeed });
      }
    });
  };
});
