
/**
 * The template function for generating an UI element for a keyboard object.
 *
 * @module keyboard/keyboard_template
 */
define('panels/keyboard/keyboard_template',['require'],function(require) {
  

  return function kp_keyboardTemplate(keyboard, recycled) {
    var container = null;
    var a;
    var span;
    if (recycled) {
      container = recycled;
      a = container.querySelector('a');
      span = container.querySelector('span');
    } else {
      container = document.createElement('li');
      a = document.createElement('a');
      span = document.createElement('span');

      a.href = '#';
      a.className = 'menu-item';
      a.appendChild(span);
      container.appendChild(a);
    }

    container.onclick = function() {
      keyboard.app.launch();
    };
    span.textContent = keyboard.name;
    return container;
  };
});

/**
 * A template function for generating an UI element for a layout object.
 */
define('panels/keyboard/layout_template',['require'],function(require) {
  

  var layoutTemplate = function layoutTemplate(layout, recycled) {
    var container = null;
    var span;
    var small;
    if (recycled) {
      container = recycled;
      span = container.querySelector('span');
      small = container.querySelector('small');
    } else {
      container = document.createElement('li');
      span = document.createElement('span');
      small = document.createElement('small');
      container.appendChild(span);
      container.appendChild(small);
    }
    var refreshName = function() {
      span.textContent = layout.name;
      small.textContent = layout.appName;
    };
    refreshName();
    layout.observe('appName', refreshName);
    layout.observe('name', refreshName);
    return container;
  };

  return layoutTemplate;
});

/**
 * The module initializes a ListView displaying the installed keyboards.
 * Implementation details please refer to {@link KeyboardCore}.
 *
 * @module keyboard/installed_keyboards
 */
define('panels/keyboard/installed_keyboards',['require','modules/mvvm/list_view'],function(require) {
  

  var ListView = require('modules/mvvm/list_view');

  /**
   * @alias module:keyboard/installed_keyboards
   * @class KeyboardCore
   * @requires module:modules/mvvm/list_view
   * @param {KeyboardContext} context
                              The kyboard context providing installed keyboards.
   * @param {Function} template
                       The template function used to render an installed
                       keyboard.
   * @returns {KeyboardCore}
   */
  function KeyboardCore(context, template) {
    this._enabled = false;
    this._listView = null;
    this._keyboardContext = context;
    this._keyboardTemplate = template;
  }

  KeyboardCore.prototype = {
    /**
     * The value indicates whether the module is responding. If it is false, the
     * UI stops reflecting the updates from the keyboard context.
     *
     * @access public
     * @memberOf KeyboardCore.prototype
     * @type {Boolean}
     */
    get enabled() {
      return this._enabled;
    },

    set enabled(value) {
      this._enabled = value;
      if (this._listView) {
        this._listView.enabled = this._enabled;
      }
    },

    /**
     * @access private
     * @memberOf KeyboardCore.prototype
     * @param {HTMLElement} listViewRoot
     * @param {ObservableArray} keyboards
     * @param {Function} keyboardTemplate
     */
    _initAllKeyboardListView:
      function k_initListView(listViewRoot, keyboards, keyboardTemplate) {
        listViewRoot.hidden = (keyboards.length === 0);
        this._listView = ListView(listViewRoot, keyboards, keyboardTemplate);
    },

    /**
     * @access public
     * @memberOf KeyboardCore.prototype
     * @param {Array} elements
     *                Elements needed by this module.
     * @param {HTMLElement} elements.listViewRoot
     *                      The root element for the list view displaying the
     *                      installed keyboards.
     */
    init: function k_init(elements) {
      var that = this;
      this._keyboardContext.init(function() {
        that._keyboardContext.keyboards(function(keyboards) {
          that._initAllKeyboardListView(
            elements.listViewRoot, keyboards, that._keyboardTemplate);
          that.enabled = true;
        });
      });
    }
  };

  return function ctor_keyboardCore(context, template) {
    return new KeyboardCore(context, template);
  };
});

/**
 * The module initializes a ListView displaying all enabled layouts.
 * Implementation details please refer to {@link KeyboardEnabledLayoutsCore}.
 *
 * @module keyboard/enabled_layouts
 */
define('panels/keyboard/enabled_layouts',['require','modules/mvvm/list_view'],function(require) {
  

  var ListView = require('modules/mvvm/list_view');

  /**
   * @alias module:keyboard/enabled_layouts
   * @class KeyboardEnabledLayoutsCore
   * @requires module:modules/mvvm/list_view
   * @param {KeyboardContext} context
                              The kyboard context providing enabled layouts.
   * @param {Function} template
                       The template function used to render a layout.
   * @returns {KeyboardEnabledLayoutsCore}
   */
  function KeyboardEnabledLayoutsCore(context, template) {
    this._enabled = false;
    this._listView = null;
    this._keyboardContext = context;
    this._layoutTemplate = template;
  }

  KeyboardEnabledLayoutsCore.prototype = {
    /**
     * The value indicates whether the module is responding. If it is false, the
     * UI stops reflecting the updates from the keyboard context.
     *
     * @access public
     * @memberOf KeyboardEnabledLayoutsCore.prototype
     * @type {Boolean}
     */
    get enabled() {
      return this._enabled;
    },

    set enabled(value) {
      this._enabled = value;
      if (this._listView) {
        this._listView.enabled = this._enabled;
      }
    },

    /**
     * @access private
     * @memberOf KeyboardAddLayoutsCore.prototype
     * @param {HTMLElement} listViewRoot
     * @param {ObservableArray} layouts
     * @param {Function} layoutTemplate
     */
    _initEnabledLayoutListView:
      function kepl_initListView(listViewRoot, layouts, layoutTemplate) {
      this._listView = ListView(listViewRoot, layouts, layoutTemplate);
    },

    /**
     * @access public
     * @memberOf KeyboardEnabledLayoutsCore.prototype
     * @param {Array} elements
     *                Elements needed by this module.
     * @param {HTMLElement} elements.listViewRoot
     *                      The root element for the list view displaying the
     *                      installed keyboards.
     */
    init: function kepl_onInit(elements) {
      var that = this;
      this._keyboardContext.init(function() {
        that._keyboardContext.enabledLayouts(function(layouts) {
          that._initEnabledLayoutListView(
            elements.listViewRoot, layouts, that._layoutTemplate);
          that.enabled = true;
        });
      });
    }
  };

  return function ctor_keplCore(context, template) {
    return new KeyboardEnabledLayoutsCore(context, template);
  };
});

define('panels/keyboard/panel',['require','modules/settings_panel','modules/keyboard_context','panels/keyboard/keyboard_template','panels/keyboard/layout_template','panels/keyboard/installed_keyboards','panels/keyboard/enabled_layouts'],function(require) {
  

  var SettingsPanel = require('modules/settings_panel');
  var KeyboardContext = require('modules/keyboard_context');
  var keyboardTemplate = require('panels/keyboard/keyboard_template');
  var layoutTemplate = require('panels/keyboard/layout_template');
  var InstalledKeyboards = require('panels/keyboard/installed_keyboards');
  var EnabledLayouts = require('panels/keyboard/enabled_layouts');

  return function ctor_keyboardPanel() {
    var installedKeyboards =
      InstalledKeyboards(KeyboardContext, keyboardTemplate);
    var enabledLayouts = EnabledLayouts(KeyboardContext, layoutTemplate);

    return SettingsPanel({
      onInit: function kp_onInit(rootElement) {
        installedKeyboards.init({
          listViewRoot: rootElement.querySelector('.allKeyboardList')
        });
        enabledLayouts.init({
          listViewRoot: rootElement.querySelector('.enabledKeyboardList')
        });
      },
      onBeforeShow: function kp_onBeforeShow() {
        installedKeyboards.enabled = true;
        enabledLayouts.enabled = true;
      },
      onHide: function kp_onHide() {
        installedKeyboards.enabled = false;
        enabledLayouts.enabled = false;
      }
    });
  };
});
