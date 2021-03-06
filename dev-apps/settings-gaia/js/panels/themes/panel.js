define(['require','modules/settings_panel','panels/themes/themes'],function(require) {
  

  var SettingsPanel = require('modules/settings_panel');
  var Themes = require('panels/themes/themes');

  return function ctor_themes() {
    var themes = Themes();

    return SettingsPanel({
      onInit: function(panel) {
        themes.onInit(panel);
      },
      onBeforeShow: function() {
        themes.onBeforeShow();
      }
    });
  };
});
