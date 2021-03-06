define(['require','modules/settings_panel','panels/call_iccs/call_icc_handler'],function(require) {
  

  var SettingsPanel = require('modules/settings_panel');
  var CallIccHandler = require('panels/call_iccs/call_icc_handler');

  return function ctor_call_iccs() {
    return SettingsPanel({
      onInit: function() {
        CallIccHandler.init();
      }
    });
  };
});
