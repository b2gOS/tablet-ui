
/**
 * This is a factory method that returns a template function that is able to
 * render nested lists. The constructor takes two template functions. One for
 * the first level item and one for the second level item. The created inner
 * list views is exposed via the listViews property.
 *
 * @module keyboard_add_layouts/nested_template_factory
 */
define('panels/keyboard_add_layouts/nested_template_factory',['require'],function(require) {
  

  return function ctor_nestedTemplate(parentTemplate, childTemplate) {
    var listViews = [];
    var template = parentTemplate.bind({
      listViews: listViews,
      childTemplate: childTemplate
    });

    // Expose the list views.
    Object.defineProperty(template, 'listViews', {
      configurable: false,
      get: function() {
        return listViews;
      }
    });

    return template;
  };
});

/**
 * The template function for generating an UI element for a keyboard object.
 *
 * @module keyboard_add_layouts/keyboard_template
 */
define('panels/keyboard_add_layouts/keyboard_template',['require','modules/mvvm/list_view'],function(require) {
  

  var ListView = require('modules/mvvm/list_view');

  return function kal_keyboardTemplate(keyboard, recycled, helper) {
    // This function is served as a parent template, we expected to get the
    // childTemplate and all generated list views.
    // XXX: we need a better way the recycle and reuse list view objects.
    var layoutTemplate = this.childTemplate;
    var listViews = this.listViews;

    var container, header, h2, ul, listView;
    if (recycled) {
      container = recycled;
      h2 = container.querySelector('h2');
      ul = container.querySelector('ul');
    } else {
      container = document.createElement('div');
      header = document.createElement('header');
      h2 = document.createElement('h2');
      ul = document.createElement('ul');
      header.appendChild(h2);
      container.appendChild(header);
      container.appendChild(ul);
    }

    // if we find a listView for the ul, reuse it, otherwise create one
    listView = listViews.some(function eachListView(list) {
      if (list.element === ul) {
        list.set(keyboard.layouts);
        list.enabled = true;
        return true;
      }
    });

    if (!listView) {
      listView = ListView(ul, keyboard.layouts, layoutTemplate);
      listView.enabled = true;
      listViews.push(listView);
    }

    helper.observeAndCall(keyboard, {
      name: function refreshName() {
        h2.textContent = keyboard.name;
      }
    });

    return container;
  };
});

/**
 * The template function for generating an UI element for a layout object.
 *
 * @module keyboard_add_layouts/layout_template
 */
define('panels/keyboard_add_layouts/layout_template',['require'],function(require) {
  

  return function kal_layoutTemplate(layout, recycled, helper) {
    var container = null;
    var span, checkbox;
    if (recycled) {
      container = recycled;
      checkbox = container.querySelector('input');
      span = container.querySelector('span');
    } else {
      container = document.createElement('li');
      checkbox = document.createElement('input');
      var label = document.createElement('label');
      span = document.createElement('span');

      label.className = 'pack-checkbox';
      checkbox.type = 'checkbox';

      label.appendChild(checkbox);
      label.appendChild(span);

      container.appendChild(label);
    }

    checkbox.onchange = function() {
      layout.enabled = this.checked;
    };

    helper.observeAndCall(layout, {
      name: function refreshName() {
        span.textContent = layout.name;
      },
      enabled: function() {
        checkbox.checked = layout.enabled;
      }
    });

    return container;
  };
});

/**
 * DialogManager is a singleton that will help DialogService to load panels
 * and control any transitions on panels.
 *
 * API:
 *
 * DialogManager.open(dialog, options);
 * DialogManager.close(dialog, options);
 *
 * @module DialogManager
 */
define('modules/dialog_manager',['require','modules/panel_cache','shared/lazy_loader'],function(require) {
  

  var PanelCache = require('modules/panel_cache');
  var LazyLoader = require('shared/lazy_loader');

  var DialogManager = function() {
    this.OVERLAY_SELECTOR = '.settings-dialog-overlay';

    this._overlayDOM = document.querySelector(this.OVERLAY_SELECTOR);
  };

  DialogManager.prototype = {
    /**
     * load panel based on passed in panelId
     *
     * @memberOf DialogManager
     * @access private
     * @param {String} panelId
     * @return {Promise}
     */
    _loadPanel: function dm__loadPanel(panelId) {
      var promise = new Promise(function(resolve, reject) {
        var panelElement = document.getElementById(panelId);
        if (panelElement.dataset.rendered) { // already initialized
          resolve();
          return;
        }

        panelElement.dataset.rendered = true;

        // XXX remove SubPanel loader once sub panel are modulized
        if (panelElement.dataset.requireSubPanels) {
          // load the panel and its sub-panels (dependencies)
          // (load the main panel last because it contains the scripts)
          var selector = 'section[id^="' + panelElement.id + '-"]';
          var subPanels = document.querySelectorAll(selector);
          for (var i = 0, il = subPanels.length; i < il; i++) {
            LazyLoader.load([subPanels[i]]);
          }
          LazyLoader.load([panelElement], resolve);
        } else {
          LazyLoader.load([panelElement], resolve);
        }
      });
      return promise;
    },

    /**
     * promised version of mozL10n.once()
     *
     * @memberOf DialogManager
     * @access private
     * @return {Promise}
     */
    _initializedL10n: function dm__initializedL10n() {
      var promise = new Promise(function(resolve) {
        navigator.mozL10n.once(resolve);
      });
      return promise;
    },

    /**
     * promised version of PanelCache.get()
     *
     * @memberOf DialogManager
     * @access private
     * @param {String} panelId
     * @return {Promise}
     */
    _getPanel: function dm__getPanel(panelId) {
      var promise = new Promise(function(resolve) {
        PanelCache.get(panelId, function(panel) {
          resolve(panel);
        });
      });
      return promise;
    },

    /**
     * this is used to control visibility of overlayDOM
     *
     * @memberOf DialogManager
     * @access private
     * @param {Boolean} show
     */
    _showOverlay: function dm__showOverlay(show) {
      this._overlayDOM.hidden = !show;
    },

    /**
     * It is used to control the timing of transitions so that we can make sure
     * whether animation is done or not.
     *
     * @memberOf DialogManager
     * @access private
     * @param {String} method
     * @param {BaseDialog} dialog
     * @param {Object} options
     * @return {Promise}
     */
    _transit: function dm__transit(method, dialog, options) {
      var promise = new Promise(function(resolve) {
        var panel = dialog.panel;

        panel.addEventListener('transitionend', function paintWait(evt) {
          if ((method === 'close' || method === 'open') &&
            evt.propertyName === 'visibility') {
              // After transition, we have to `hide` the panel, otherwise
              // the panel would still exist on the layer and would block
              // the scrolling event.
              if (method === 'close') {
                panel.hidden = true;
              }
              panel.removeEventListener('transitionend', paintWait);
              resolve();
          }
        });

        // Before transition, we have to `show` the panel, otherwise
        // the panel before applying transition class.
        if (method === 'open') {
          panel.hidden = false;
        }

        // We need to apply class later otherwise Gecko can't apply
        // this transition and 150ms is an approximate number after doing
        // several rounds of manual tests.
        setTimeout(function() {
          if (method === 'open') {
            // Let's unhide the panel first
            panel.classList.add('current');
          } else {
            panel.classList.remove('current');
          }
        }, 150);
      });
      return promise;
    },

    /**
     * Do necessary works to open panel like loading panel, doing transition
     * and call related functions.
     *
     * @memberOf DialogManager
     * @access private
     * @param {BaseDialog} dialog
     * @param {Object} options
     * @return {Promise}
     */
    _open: function dm__open(dialog, options) {
      var self = this;
      var foundPanel;

      return Promise.resolve()
      .then(function() {
        // 1: load panel
        return self._loadPanel(dialog.panel.id);
      })
      .then(function() {
        // 2: l10n is ready
        return self._initializedL10n();
      })
      .then(function() {
        // 3: Get that panel
        return self._getPanel(dialog.panel.id);
      })
      .then(function(panel) {
        // 4: call beforeShow
        foundPanel = panel;
        return foundPanel.beforeShow(dialog.panel, options);
      })
      .then(function() {
        // 5. UI stuffs + transition
        dialog.init();
        dialog.initUI();
        dialog.bindEvents();

        if (dialog.TRANSITION_CLASS === 'zoom-in-80') {
          self._showOverlay(true);
        }

        return self._transit('open', dialog, options);
      })
      .then(function() {
        // 6. show that panel as a dialog
        return foundPanel.show(dialog.panel, options);
      });
    },

    /**
     * Do necessary works to close panel like loading panel, doing transition
     * and call related functions.
     *
     * @memberOf DialogManager
     * @access private
     * @param {BaseDialog} dialog
     * @param {Object} options
     * @return {Promise}
     */
    _close: function dm__close(dialog, options) {
      var self = this;
      var foundPanel;
      var cachedResult;

      return Promise.resolve()
      .then(function() {
        // 1: Get that panel
        return self._getPanel(dialog.panel.id);
      })
      .then(function(panel) {
        // 2: Let's validate to see whether we can close this dialog or not.
        foundPanel = panel;

        var promise;
        // custom dialog - onSubmit
        if (foundPanel.onSubmit && options._type === 'submit') {
          promise = foundPanel.onSubmit();
        // custom dialog - onCancel
        } else if (foundPanel.onCancel && options._type === 'cancel') {
          promise = foundPanel.onCancel();
        // if no onSubmit & onCancel, pass directly
        } else {
          promise = Promise.resolve();
        }

        return promise;
      })
      .then(function(result) {
        cachedResult = result;

        // 3: call beforeHide
        return foundPanel.beforeHide();
      })
      .then(function() {
        // 4. transition
        return self._transit('close', dialog, options);
      })
      .then(function() {
        // 5. call hide
        return foundPanel.hide();
      })
      .then(function() {
        // 6. Get result and cleanup dialog
        var result;

        // for prompt dialog, we have to get its own result from input text.
        if (dialog.DIALOG_CLASS === 'prompt-dialog') {
          result = dialog.getResult();
        } else if (cachedResult) {
          result = cachedResult;
        }

        dialog.cleanup();

        if (dialog.TRANSITION_CLASS === 'zoom-in-80') {
          self._showOverlay(false);
        }

        return result;
      });
    },

    /**
     * It is a bridge to call open or close function.
     *
     * @memberOf DialogManager
     * @access private
     * @param {String} method
     * @param {BaseDialog} dialog
     * @param {Object} options
     * @return {Promise}
     */
    _navigate: function dm__navigate(method, dialog, options) {
      method = (method === 'open') ? '_open' : '_close';
      return this[method](dialog, options);
    },

    /**
     * DialogService would use this exposed API to open dialog.
     *
     * @memberOf DialogManager
     * @access public
     * @param {BaseDialog} dialog
     * @param {Object} options
     * @return {Promise}
     */
    open: function dm_open(dialog, options) {
      return this._navigate('open', dialog, options);
    },

    /**
     * DialogService would use this exposed API to close dialog.
     *
     * @memberOf DialogManager
     * @access public
     * @param {BaseDialog} dialog
     * @param {Object} options
     * @return {Promise}
     */
    close: function dm_close(dialog, type, options) {
      options._type = type;
      return this._navigate('close', dialog, options);
    }
  };

  var dialogManager = new DialogManager();
  return dialogManager;
});

define('modules/dialog/base_dialog',['require'],function(require) {
  

  var BaseDialog = function(panelDOM, options) {
    this.panel = panelDOM;
    this._options = options || {};
  };

  BaseDialog.prototype.DIALOG_CLASS = 'dialog';
  BaseDialog.prototype.TRANSITION_CLASS = 'fade';
  BaseDialog.prototype.SUBMIT_BUTTON_SELECTOR = '[type="submit"]';
  BaseDialog.prototype.CANCEL_BUTTON_SELECTOR = '[type="reset"]';
  BaseDialog.prototype.MESSAGE_SELECTOR = '.settings-dialog-message';
  BaseDialog.prototype.TITLE_SELECTOR = '.settings-dialog-title';

  BaseDialog.prototype.init = function bd_init() {
    // We can override animation class from options
    this.TRANSITION_CLASS = this._options.transition || this.TRANSITION_CLASS;
    this.panel.classList.add(this.DIALOG_CLASS);
    this.panel.classList.add(this.TRANSITION_CLASS);
  };

  BaseDialog.prototype.initUI = function bd_initUI() {
    var message = this._options.message;
    var title = this._options.title;
    var submitButton = this._options.submitButton;
    var cancelButton = this._options.cancelButton;

    this._updateMessage(message);
    this._updateTitle(title);
    this._updateSubmitButton(submitButton);
    this._updateCancelButton(cancelButton);
  };

  BaseDialog.prototype.bindEvents = function bd_bindEvent() {
    var self = this;

    this.getSubmitButton().onclick = function() {
      self._options.onWrapSubmit();
    };

    this.getCancelButton().onclick = function() {
      self._options.onWrapCancel();
    };
  };

  BaseDialog.prototype._updateMessage = function bd__updateMessage(message) {
    var messageDOM = this.panel.querySelector(this.MESSAGE_SELECTOR);
    if (messageDOM && message) {
      message = this._getWrapL10nObject(message);
      navigator.mozL10n.setAttributes(messageDOM, message.id, message.args);
    }
  };

  BaseDialog.prototype._updateTitle = function bd__updateTitle(title) {
    var titleDOM = this.panel.querySelector(this.TITLE_SELECTOR);
    if (titleDOM && title) {
      title = this._getWrapL10nObject(title);
      navigator.mozL10n.setAttributes(titleDOM, title.id, title.args);
    }
  };

  BaseDialog.prototype._updateSubmitButton = function bd__update(options) {
    var buttonDOM = this.getSubmitButton();
    if (buttonDOM && options) {
      options = this._getWrapL10nObject(options);
      navigator.mozL10n.setAttributes(buttonDOM, options.id, options.args);
      buttonDOM.className = options.style || 'recommend';
    }
  };

  BaseDialog.prototype._updateCancelButton = function bd__updateText(options) {
    var buttonDOM = this.getCancelButton();
    if (buttonDOM && options) {
      options = this._getWrapL10nObject(options);
      navigator.mozL10n.setAttributes(buttonDOM, options.id, options.args);
      buttonDOM.className = options.style || '';
    }
  };

  BaseDialog.prototype._getWrapL10nObject =
    function bd__getWrapL10nObject(input) {
      if (typeof input === 'string') {
        return {id: input, args: null};
      } else if (typeof input === 'object') {
        if (typeof input.id === 'undefined') {
          throw new Error('You forgot to put l10nId - ' +
            JSON.stringify(input));
        } else {
          return {id: input.id, args: input.args || null, style: input.style};
        }
      } else {
        throw new Error('You are using the wrong L10nObject, ' +
          'please check its format again');
      }
  };

  BaseDialog.prototype.getDOM = function bd_getDOM() {
    return this.panel;
  };

  BaseDialog.prototype.getSubmitButton = function bd_getSubmitButton() {
    return this.panel.querySelector(this.SUBMIT_BUTTON_SELECTOR);
  };

  BaseDialog.prototype.getCancelButton = function bd_getCancelButton() {
    return this.panel.querySelector(this.CANCEL_BUTTON_SELECTOR);
  };

  BaseDialog.prototype.cleanup = function bd_cleanup() {
    // We only have to restore system-wise panels instead of custom panels
    if (this.DIALOG_CLASS !== 'panel-dialog') {
      this._updateTitle('settings-' + this.DIALOG_CLASS + '-header');
      this._updateSubmitButton('ok');
      this._updateCancelButton('cancel');
    }

    // clear all added classes
    this.panel.classList.remove(this.DIALOG_CLASS);
    this.panel.classList.remove(this.TRANSITION_CLASS);
  };

  return BaseDialog;
});

define('modules/dialog/panel_dialog',['require','modules/dialog/base_dialog'],function(require) {
  

  var BaseDialog = require('modules/dialog/base_dialog');

  var PanelDialog = function(panelDOM, options) {
    BaseDialog.call(this, panelDOM, options);
  };

  PanelDialog.prototype = Object.create(BaseDialog.prototype);
  PanelDialog.prototype.constructor = PanelDialog;
  PanelDialog.prototype.DIALOG_CLASS = 'panel-dialog';
  PanelDialog.prototype.TRANSITION_CLASS = 'fade';

  return function ctor_PanelDialog(panelDOM, options) {
    return new PanelDialog(panelDOM, options);
  };
});

define('modules/dialog/alert_dialog',['require','modules/dialog/base_dialog'],function(require) {
  

  var BaseDialog = require('modules/dialog/base_dialog');

  var AlertDialog = function(panelDOM, options) {
    BaseDialog.call(this, panelDOM, options);
  };

  AlertDialog.prototype = Object.create(BaseDialog.prototype);
  AlertDialog.prototype.constructor = AlertDialog;
  AlertDialog.prototype.DIALOG_CLASS = 'alert-dialog';
  AlertDialog.prototype.TRANSITION_CLASS = 'fade';

  AlertDialog.prototype.bindEvents = function() {
    var self = this;

    this.getSubmitButton().onclick = function() {
      self._options.onWrapSubmit();
    };
  };

  return function ctor_alertDialog(panelDOM, options) {
    return new AlertDialog(panelDOM, options);
  };
});

define('modules/dialog/confirm_dialog',['require','modules/dialog/base_dialog'],function(require) {
  

  var BaseDialog = require('modules/dialog/base_dialog');

  var ConfirmDialog = function(panelDOM, options) {
    BaseDialog.call(this, panelDOM, options);
  };

  ConfirmDialog.prototype = Object.create(BaseDialog.prototype);
  ConfirmDialog.prototype.constructor = ConfirmDialog;
  ConfirmDialog.prototype.DIALOG_CLASS = 'confirm-dialog';
  ConfirmDialog.prototype.TRANSITION_CLASS = 'fade';

  ConfirmDialog.prototype.bindEvents = function() {
    var self = this;

    this.getSubmitButton().onclick = function() {
      self._options.onWrapSubmit();
    };

    this.getCancelButton().onclick = function() {
      self._options.onWrapCancel();
    };
  };

  return function ctor_confirmDialog(panelDOM, options) {
    return new ConfirmDialog(panelDOM, options);
  };
});

define('modules/dialog/prompt_dialog',['require','modules/dialog/base_dialog'],function(require) {
  

  var BaseDialog = require('modules/dialog/base_dialog');

  var PromptDialog = function(panelDOM, options) {
    BaseDialog.call(this, panelDOM, options);
  };

  PromptDialog.prototype = Object.create(BaseDialog.prototype);
  PromptDialog.prototype.constructor = PromptDialog;
  PromptDialog.prototype.DIALOG_CLASS = 'prompt-dialog';
  PromptDialog.prototype.TRANSITION_CLASS = 'fade';
  PromptDialog.prototype.INPUT_SELECTOR = '.settings-dialog-input';

  PromptDialog.prototype.bindEvents = function() {
    var self = this;

    this.getSubmitButton().onclick = function() {
      self._options.onWrapSubmit();
    };

    this.getCancelButton().onclick = function() {
      self._options.onWrapCancel();
    };
  };

  PromptDialog.prototype.initUI = function() {
    BaseDialog.prototype.initUI.call(this);
    this.getInput().value = this._options.defaultValue || '';
  };

  PromptDialog.prototype.getInput = function() {
    return this.panel.querySelector(this.INPUT_SELECTOR);
  };

  PromptDialog.prototype.getResult = function() {
    return this.getInput().value;
  };

  return function ctor_promptDialog(panelDOM, options) {
    return new PromptDialog(panelDOM, options);
  };
});

/**
 * DialogService is a singleton that provides few ways for you to show/hide
 * dialogs. Here, we predefined alert/confirm/prompt dialogs to replace
 * window.alert/window.confirm/window.prompt if you want any further controls
 * of animations and UI.
 *
 * And also, there is one more dialog called panelDialog that would be used
 * when you are going to show any predefined panel in dialog way.
 *
 * API:
 *
 * 1. Alert dialog
 *
 * DialogService.alert({
 *   id: 'MessageId',
 *   args: {}
 * }, {
 *   title: { id: 'TitleId', args: {} }
 * })
 * .then(function(result) {
 *   var type = result.type;
 * });
 *
 * NOTE:
 * If there is no args in locales, you can direclty pass l10nId without args.
 *
 * DialogService.alert('MessageId', {
 *   title: 'TitleId'
 * })
 * .then(function(result) {
 *   var type = result.type;
 * });
 *
 * 2. Confirm dialog
 *
 * DialogService.confirm({
 *   id: 'MessageId',
 *   args: {}
 * }, {
 *   title: { id: 'TitleId', args: {} },
 *   submitButton: { id: 'SubmitButtonId', args: {}, style: 'recommend' },
 *   cancelButton: { id: 'CancelButtonId', args: {} }
 * })
 * .then(function(result) {
 *   var type = result.type;
 * });
 *
 * 3. Prompt dialog
 * 
 * DialogService.prompt({
 *   id: 'MessageId',
 *   args: {}
 * }, {
 *   title: { id: 'TitleId', args: {} },
 *   defaultValue: 'e.g. test@mozilla.com',
 * }).then(function(result) {
 *   var type = result.type;
 *   var value = result.value;
 * });
 *
 * 4. Panel dialog
 *
 * DialogService.show('screen-lcok', {
 *   transition: 'zoom-in',
 * }).then(function(result) {
 *   // type would be submit or cancel
 *   var type = result.type;
 *   var value = result.value;
 * });
 *
 * NOTES:
 * We support some customized options for each dialog, please check the API
 * below to know what you can customize !
 *
 * @module DialogService
 */
define('modules/dialog_service',['require','settings','modules/defer','modules/dialog_manager','modules/dialog/panel_dialog','modules/dialog/alert_dialog','modules/dialog/confirm_dialog','modules/dialog/prompt_dialog'],function(require) {
  

  var Settings = require('settings');
  var Defer = require('modules/defer');
  var DialogManager = require('modules/dialog_manager');

  var PanelDialog = require('modules/dialog/panel_dialog');
  var AlertDialog = require('modules/dialog/alert_dialog');
  var ConfirmDialog = require('modules/dialog/confirm_dialog');
  var PromptDialog = require('modules/dialog/prompt_dialog');

  var DialogService = function() {
    this._navigating = false;
    this._pendingRequests = [];
    this._settingsAlertDialogId = 'settings-alert-dialog';
    this._settingsBaseDialogId = 'settings-base-dialog';
    this._settingsConfirmDialogId = 'settings-confirm-dialog';
    this._settingsPromptDialogId = 'settings-prompt-dialog';
  };

  DialogService.prototype = {
    /**
     * Alert dialog with more controls.
     *
     * @memberOf DialogService
     * @access public
     * @param {String} message
     * @param {Object} userOptions
     * @return {Promise}
     */
    alert: function(message, userOptions) {
      var options = userOptions || {};
      return this.show(this._settingsAlertDialogId, {
        type: 'alert',
        message: message,
        title: options.title,
        submitButton: options.submitButton
      });
    },

    /**
     * Confirm dialog with more controls.
     *
     * @memberOf DialogService
     * @access public
     * @param {String} message
     * @param {Object} userOptions
     * @return {Promise}
     */
    confirm: function(message, userOptions) {
      var options = userOptions || {};
      return this.show(this._settingsConfirmDialogId, {
        type: 'confirm',
        message: message,
        title: options.title,
        submitButton: options.submitButton,
        cancelButton: options.cancelButton
      });
    },

    /**
     * Prompt dialog with more controls.
     *
     * @memberOf DialogService
     * @access public
     * @param {String} message
     * @param {Object} userOptions
     * @return {Promise}
     */
    prompt: function(message, userOptions) {
      var options = userOptions || {};
      return this.show(this._settingsPromptDialogId, {
        type: 'prompt',
        message: message,
        title: options.title,
        defaultValue: options.defaultValue,
        submitButton: options.submitButton,
        cancelButton: options.cancelButton
      });
    },

    /**
     * Panel dialog. If you are going to show any panel as a dialog,
     * you have to use this method to show them.
     *
     * @memberOf DialogService
     * @access public
     * @param {String} panelId
     * @param {Object} userOptions
     * @return {Promise}
     */
    show: function dm_show(panelId, userOptions, _pendingDefer) {
      var self = this;
      var defer;
      var dialog;
      var dialogDOM = document.getElementById(panelId);
      var currentPanel = Settings.currentPanel;
      var options = userOptions || {};

      if (_pendingDefer) {
        defer = _pendingDefer;
      } else {
        defer = Defer();
      }

      if (this._navigating) {
        this._pendingRequests.push({
          defer: defer,
          panelId: panelId,
          userOptions: userOptions
        });
      } else {
        if ('#' + panelId === currentPanel) {
          defer.reject('You are showing the same panel #' + panelId);
        } else {
          options.onWrapSubmit = function() {
            DialogManager.close(dialog, 'submit', options)
            .then(function(result) {
              defer.resolve({
                type: 'submit',
                value: result
              });
              self._navigating = false;
              self._execPendingRequest();
            });
          };

          options.onWrapCancel = function() {
            DialogManager.close(dialog, 'cancel', options)
            .then(function(result) {
              defer.resolve({
                type: 'cancel',
                value: result
              });
              self._navigating = false;
              self._execPendingRequest();
            });
          };

          switch (options.type) {
            case 'alert':
              dialog = AlertDialog(dialogDOM, options);
              break;
            case 'confirm':
              dialog = ConfirmDialog(dialogDOM, options);
              break;
            case 'prompt':
              dialog = PromptDialog(dialogDOM, options);
              break;
            default:
              dialog = PanelDialog(dialogDOM, options);
              break;
          }
          this._navigating = true;
          DialogManager.open(dialog, options);
        }
      }

      return defer.promise;
    },

    /**
     * This method can help us pop up any pending request and would try to
     * show it after previous request was done.
     *
     * @memberOf DialogService
     * @access private
     */
    _execPendingRequest: function() {
      var request = this._pendingRequests.pop();
      if (request) {
        this.show(request.panelId, request.userOptions, request.defer);
      }
    },
  };

  var dialogService = new DialogService();
  return dialogService;
});

/**
 * The module initializes a ListView displaying all installed layouts.
 * Implementation details please refer to {@link KeyboardAddLayoutsCore}.
 *
 * @module keyboard_add_layouts/core
 */
define('panels/keyboard_add_layouts/core',['require','modules/mvvm/list_view'],function(require) {
  

  var ListView = require('modules/mvvm/list_view');

  var _ = navigator.mozL10n.get;

  /**
   * @alias module:keyboard_add_layouts/core
   * @class KeyboardAddLayoutsCore
   * @requires module:modules/settings_service
   * @requires module:modules/mvvm/list_view
   * @param {KeyboardContext} context
                              The kyboard context providing installed keyboards.
   * @param {Function} template
                       The template function used to render an installed
                       keyboard.
   * @returns {KeyboardAddLayoutsCore}
   */
  function KeyboardAddLayoutsCore(context, template) {
    this._enabled = false;
    this._listView = null;
    this._keyboardContext = context;
    this._keyboardTemplate = template;
  }

  KeyboardAddLayoutsCore.prototype = {
    /**
     * The value indicates whether the module is responding. If it is false, the
     * UI stops reflecting the updates from the keyboard context.
     *
     * @access public
     * @memberOf KeyboardAddLayoutsCore.prototype
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
      // Disable all inner list views
      this._keyboardTemplate.listViews.forEach(function(listView) {
        listView.enabled = this._enabled;
      }.bind(this));
    },

    /**
     * @access private
     * @memberOf KeyboardAddLayoutsCore.prototype
     * @param {HTMLElement} listViewRoot
     * @param {ObservableArray} keyboards
     * @param {Function} keyboardTemplate
     */
    _initInstalledLayoutListView:
      function kal_initListView(listViewRoot, keyboards, keyboardTemplate) {
        this._listView = ListView(listViewRoot, keyboards, keyboardTemplate);
    },

    /**
     * The handler is invoked when users disable the must-have input type. In
     * the handler we navigate to the dialog.
     *
     * @access private
     * @memberOf KeyboardAddLayoutsCore.prototype
     * @param {Object} layout
     * @param {String} missingType
     */
    _showEnabledDefaultDialog: function kal_showDialog(layout, missingType) {
      require(['modules/dialog_service'], function(DialogService) {
        var type = _('keyboardType-' + missingType);
        DialogService.alert({
          id: 'defaultKeyboardEnabled',
          args: {
            layoutName: layout.inputManifest.name,
            appName: layout.manifest.name
          }
        }, {
          title: {
            id: 'mustHaveOneKeyboard',
            args: {
              type: type
            }
          }
        });
      });
    },

    /**
     * @access public
     * @memberOf KeyboardAddLayoutsCore.prototype
     * @param {Array} elements
     *                Elements needed by this module.
     * @param {HTMLElement} elements.listViewRoot
     *                      The root element for the list view displaying the
     *                      installed keyboards.
     */
    init: function kal_onInit(elements) {
      var that = this;
      this._keyboardContext.init(function() {
        that._keyboardContext.keyboards(function(keyboards) {
          that._initInstalledLayoutListView(
            elements.listViewRoot, keyboards, that._keyboardTemplate);
          that.enabled = true;
        });
      });

      this._keyboardContext.defaultKeyboardEnabled(
        this._showEnabledDefaultDialog);
    }
  };

  return function ctor_kalCore(context, template) {
    return new KeyboardAddLayoutsCore(context, template);
  };
});

define('panels/keyboard_add_layouts/panel',['require','modules/settings_panel','modules/keyboard_context','shared/keyboard_helper','panels/keyboard_add_layouts/nested_template_factory','panels/keyboard_add_layouts/keyboard_template','panels/keyboard_add_layouts/layout_template','panels/keyboard_add_layouts/core'],function(require) {
  

  var SettingsPanel = require('modules/settings_panel');
  var KeyboardContext = require('modules/keyboard_context');
  var KeyboardHelper = require('shared/keyboard_helper');
  var NestedTemplateFactory =
    require('panels/keyboard_add_layouts/nested_template_factory');
  var keyboardTemplate =
    require('panels/keyboard_add_layouts/keyboard_template');
  var layoutTemplate = require('panels/keyboard_add_layouts/layout_template');
  var Core = require('panels/keyboard_add_layouts/core');

  return function ctor_addLayoutsPanel() {
    var nestedTemplate =
      NestedTemplateFactory(keyboardTemplate, layoutTemplate);
    var core = Core(KeyboardContext, nestedTemplate);

    return SettingsPanel({
      onInit: function kalp_onInit(rootElement) {
        core.init({
          listViewRoot: rootElement.querySelector('.keyboardAppContainer')
        });
      },
      onBeforeShow: function kalp_onBeforeShow() {
        core.enabled = true;
      },
      onBeforeHide: function kalp_onBeforeHide() {
        // save changes to settings
        KeyboardHelper.saveToSettings();
      },
      onHide: function kalp_onHide() {
        core.enabled = false;
      }
    });
  };
});
