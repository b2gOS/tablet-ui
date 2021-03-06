/**
 * The battery panel displays battery information provided by Battery.
 */
define(['require','modules/settings_panel','modules/battery'],function(require) {
  

  var SettingsPanel = require('modules/settings_panel');
  var Battery = require('modules/battery');

  return function ctor_battery_panel() {
    var _batteryLevelText = null;
    var _refreshText = function() {
      navigator.mozL10n.setAttributes(_batteryLevelText,
                                      'batteryLevel-percent-' + Battery.state,
                                      { level: Battery.level });
    };

    return SettingsPanel({
      onInit: function bp_onInit(rootElement) {
        _batteryLevelText = rootElement.querySelector(
          '#battery-level span:last-of-type');
      },
      onBeforeShow: function bp_onBeforeShow(rootElement) {
        Battery.observe('level', _refreshText);
        Battery.observe('state', _refreshText);
        _refreshText();
      },
      onBeforeHide: function bp_onBeforeHide() {
        Battery.unobserve(_refreshText);
      }
    });
  };
});
