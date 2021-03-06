
define('panels/feedback_send/feedback_send',['require','modules/settings_service','modules/settings_cache','shared/async_storage'],function(require) {
  

  var SettingsService = require('modules/settings_service');
  var SettingsCache = require('modules/settings_cache');
  require('shared/async_storage');

  var SendFeedback = function(){};
  SendFeedback.prototype = {
    _SettingsCache: SettingsCache,
    _SettingsService: SettingsService,

    init: function(elements) {
      this.elements = elements;
      this.options = {};
      this._sendData = {
        product: 'Firefox OS',
        platform: 'Firefox OS'
      };
      this._showEmail = false;
    },

    updateTitle: function() {
      this.elements.title.setAttribute('data-l10n-id',
        'feedback_whyfeel_' +
        (this.options.feel === 'feedback-happy' ? 'happy' : 'sad'));
    },

    /**
     * Get previous inputs from asyncStorage.
     */
    getPreviousInputs: function() {
      window.asyncStorage.getItem('feedback', function(value) {
        this._inputData = value || {};
      }.bind(this));
    },

    keepAllInputs: function() {
      window.asyncStorage.setItem('feedback', this._inputData);
    },

    get _inputData() {
      return {
        description: this.elements.description.value,
        email: this.elements.emailInput.value,
        emailEnable: this._showEmail
      };
    },

    set _inputData(data) {
      this.elements.description.value = data.description || '';
      this.elements.emailInput.value = data.email || '';
      this._showEmail = !data.emailEnable;
      this.enableEmail();
    },

    alertConfirm: function() {
      this.elements.alertDialog.hidden = true;
      this.elements.alertMsg.textContent = '';
      this.elements.alertMsg.removeAttribute('data-l10n-id');
    },

    /**
     * Once the data is sent successfully and user click 'ok' button,
     * we'll go back to improveBrowserOS panel.
     */
    done: function() {
      this._SettingsService.navigate('improveBrowserOS');
      this.elements.doneDialog.hidden = true;
    },

    send: function() {
      this.elements.sendBtn.disabled = true;
      if (!navigator.onLine) {
        this._messageHandler('connect-error');
        return;
      }
      var emailBar = this.elements.emailColumn;
      var emailInput = this.elements.emailInput;
      var contextInput = this.elements.description;
      if (contextInput.textLength === 0) {
        this._messageHandler('empty-comment');
        return;
      } else {
        this._sendData.description = contextInput.value;
      }

      if (!emailBar.hidden) {
        this._sendData.email = emailInput.value;
      } else {
        delete this._sendData.email;
      }

      if (!emailBar.hidden &&
          (!emailInput.value.length ||
          !emailInput.validity.valid)) {
        this._messageHandler('wrong-email');
        return;
      }

      var currentSetting = this._SettingsCache.cache;
      var feedbackUrl = currentSetting['feedback.url'];
      this._sendData.version =
        currentSetting['deviceinfo.os'];
      this._sendData.device =
        currentSetting['deviceinfo.hardware'];
      this._sendData.locale =
        currentSetting['language.current'];

      this._xhr = new XMLHttpRequest({mozSystem: true});
      this._xhr.open('POST', feedbackUrl, true);
      this._xhr.setRequestHeader(
        'Content-type', 'application/json');
      this._xhr.timeout = 5000;
      this._xhr.onreadystatechange =
        this._responseHandler.bind(this);
      this._xhr.ontimeout = function() {
        this._messageHandler('timeout');
      }.bind(this);
      this._xhr.send(JSON.stringify(this._sendData));
    },

    /**
     * Show email input column if use click the checkbox.
     */
    enableEmail: function() {
      var original = this._showEmail;
      this._showEmail = !original;
      this.elements.emailEnable.checked = !original;
      this.elements.emailColumn.hidden = original;
    },

    back: function() {
      this.keepAllInputs();
      this._SettingsService.navigate('improveBrowserOS-chooseFeedback');
    },

    _responseHandler: function() {
      if (this._xhr.readyState !== 4) {
        return;
      }
      switch (this._xhr.status) {
        case 201:
          this._messageHandler('success');
          break;
        case 400:
          this._messageHandler('wrong-email');
          break;
        case 429:
          this._messageHandler('just-sent');
          break;
        case 404:
          this._messageHandler('server-off');
          break;
        default:
          this._messageHandler('connect-error');
          break;
      }
    },

    _messageHandler: function(type) {
      if (type === 'success') {
        this.elements.doneDialog.hidden = false;
      } else {
        this.keepAllInputs();
        this.elements.alertMsg.setAttribute('data-l10n-id',
          'feedback-errormessage-' + type);
        this.elements.alertDialog.hidden = false;
      }
      this.elements.sendBtn.disabled = false;
    }
  };
  return function ctor_send_feedback() {
    return new SendFeedback();
  };
});

define('panels/feedback_send/panel',['require','modules/settings_panel','panels/feedback_send/feedback_send'],function(require) {
  

  var SettingsPanel = require('modules/settings_panel');
  var SendFeedback = require('panels/feedback_send/feedback_send');

  return function ctor_sendFeedbackPanel() {
    var elements = {};
    var sendFeedback = SendFeedback();
    var eventMapping = [
      { elementName: 'alertBtn', eventType: 'click',
        methodName: 'alertConfirm' },
      { elementName: 'doneBtn', eventType: 'click', methodName: 'done' },
      { elementName: 'sendBtn', eventType: 'click', methodName: 'send' },
      { elementName: 'emailEnable', eventType: 'click',
        methodName: 'enableEmail' },
      { elementName: 'header', eventType: 'action', methodName: 'back' }
    ];

    function bindEvents(elements) {
      eventMapping.forEach(function(map) {
        map.method = sendFeedback[map.methodName].bind(sendFeedback);
        elements[map.elementName].addEventListener(map.eventType,
          map.method);
      });
    }

    function unbindEvents(elements) {
      eventMapping.forEach(function(map) {
        if (!map.method) {
          return;
        }
        elements[map.elementName].removeEventListener(map.eventType,
          map.method);
      });
    }

    return SettingsPanel({
      onInit: function(panel) {
        elements = {
          alertDialog: panel.querySelector('#feedback-alert'),
          alertMsg: panel.querySelector('#feedback-alert-msg'),
          alertBtn: panel.querySelector('#feedback-alert-btn'),
          doneDialog: panel.querySelector('#feedback-done'),
          doneBtn: panel.querySelector('#feedback-done-btn'),
          title: panel.querySelector('#feedback-title'),
          description: panel.querySelector('#feedback-description'),
          emailInput: panel.querySelector('#feedback-email'),
          emailColumn: panel.querySelector('#feedback-emailbar'),
          emailEnable: panel.querySelector('#email-enable'),
          sendBtn: panel.querySelector('#feedback-send-btn'),
          header: panel.querySelector('#feedback-header')
        };
        sendFeedback.init(elements);
      },
      onBeforeShow: function(panel, options) {
        bindEvents(elements);
        sendFeedback.options = options;
        sendFeedback.updateTitle();
        sendFeedback.getPreviousInputs();
      },
      onBeforeHide: function() {
        unbindEvents(elements);
        if (document.hidden) {
          sendFeedback.keepAllInputs();
        }
      }
    });
  };
});
