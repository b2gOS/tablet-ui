
/*
 * SimUIModel is a helper to help us map real card status
 * into needed virtual status, and SimCardManager will
 * be responsible for reflecting these virtual status
 * into real UI.
 * 
 * @module SimUIModel
 */
define('panels/simcard_manager/sim_ui_model',['require'],function(require) {
  
  var _ = window.navigator.mozL10n.get;

  var SimUIModel = function(cardIndex) {
    this._cardIndex = cardIndex;

    /*
     * We have following states and would try to reflect them on
     * related UI. Take `locked` state for example, it doesn't mean
     * that this SIM is locked (we have to access icc.cardState
     * to make sure the SIM is locked), instead, it means that
     * SimCardManager has to show a small `locker` icon on the screen.
     *
     * The reason why we need this Model is because UX needs different
     * look and feel based on different cardState, in this way, I
     * think this would be better to use separate propeties to reflect
     * each UI on the screen so that we can change them easily.
     */
    this._enabled = false;
    this._absent = false;
    this._locked = false;
    this._name = 'SIM ' + (this._cardIndex + 1);
    this._number = '';
    this._operator = '';
  };

  SimUIModel.prototype = {
    /**
     * We can get useful information stored in SimUIModel like
     * enabled, absent ... etc
     *
     * @memberOf SimUIModel
     * @access public
     * @return {Object} information about current SimUIModel
     */
    getInfo: function() {
      var keys = [
        'enabled', 'absent', 'locked',
        'name', 'number', 'operator'
      ];

      var info = {};
      keys.forEach(function(key) {
        info[key] = this['_' + key];
      }.bind(this));

      return info;
    },

    /**
     * With this method, you can update states on current SimUIModel.
     *
     * @memberOf SimUIModel
     * @access public
     * @param {String} key
     * @param {Object} options
     */
    setState: function(key, options) {
      switch (key) {
        case 'nosim':
          this._enabled = false;
          this._absent = true;
          this._locked = false;
          this._number = '';
          this._operator = _('noSimCard');
          break;

        case 'locked':
          this._enabled = false;
          this._absent = false;
          this._locked = true;
          this._number = '';
          this._operator = _('sim-pin-locked');
          break;

        case 'blocked':
          this._enabled = true;
          this._absent = true;
          this._locked = false;
          this._number = '';
          this._operator = '';
          this._name = _('noSimCard');
          break;

        case 'normal':
          this._enabled = true;
          this._absent = false;
          this._locked = false;
          this._number = options.number;
          this._operator = options.operator;
          break;
      }
    }
  };

  return function ctor_simUIModel(cardIndex) {
    return new SimUIModel(cardIndex);
  };
});

/**
 * SimCardManager is responsible for
 *   1. handling simcard UI
 *   2. handling simcard virtual status (please refer SimUIModel class)
 *   3. handling related mozSettings (please refer SimSettingsHelper class)
 *
 * @module SimCardManager
 */
define('panels/simcard_manager/simcard_manager',['require','shared/template','shared/sim_settings_helper','shared/airplane_mode_helper','shared/mobile_operator','panels/simcard_manager/sim_ui_model'],function(require) {
  

  var _ = window.navigator.mozL10n.get;
  var Template = require('shared/template');
  var SimSettingsHelper = require('shared/sim_settings_helper');
  var AirplaneModeHelper = require('shared/airplane_mode_helper');
  var MobileOperator = require('shared/mobile_operator');
  var SimUIModel = require('panels/simcard_manager/sim_ui_model');

  var SimCardManager = function(elements) {
    // we store all SimUIModel instances into this array
    this._elements = elements;
    this._simcards = [];
    this._isAirplaneMode = false;
    this._simItemTemplate = new Template(this._elements.simCardTmpl);
  };

  SimCardManager.prototype = {
    /**
     * Initiazlization
     *
     * @memberOf SimCardManager
     * @access public
     */
    init: function scm_init() {
      // `handleEvent` is used to handle these sim related changes
      this._elements.outgoingCallSelect.addEventListener('change', this);
      this._elements.outgoingMessagesSelect.addEventListener('change', this);

      // XXX because we handle `onchange` event differently in value selector,
      // in order to show confirm dialog after users changing value, the better
      // way right now is to check values when `onblur` event triggered.
      this._addOutgoingDataSelectEvent();
      this._addVoiceChangeEventOnConns();
      this._addCardStateChangeEventOnIccs();
      this._addLocalizedChangeEventOnIccs();

      // SMS app will directly change this value if users are going to
      // donwload specific sms from differnt simcard, so we have to
      // make sure our UI will reflect the right value at the moment.
      SimSettingsHelper.observe('outgoingData',
        this._outgoingDataChangeEvent.bind(this));

      // because in fugu, airplaneMode will not change cardState
      // but we still have to make UI consistent. In this way,
      // when airplaneMode is on in fugu, we have to mimic the nosim
      // situation in single sim.
      this._addAirplaneModeChangeEvent();

      this._isAirplaneMode =
        AirplaneModeHelper.getStatus() === 'enabled' ? true : false;

      // init UI
      this._initSimCardsInfo();
      this._initSimCardManagerUI();
    },

    /**
     * We will initialize SimUIModel and store them into our internal
     * variables.
     *
     * @memberOf SimCardManager
     * @access public
     */
    _initSimCardsInfo: function scm__initSimCardsInfo() {
      var conns = window.navigator.mozMobileConnections;
      for (var cardIndex = 0; cardIndex < conns.length; cardIndex++) {
        var conn = conns[cardIndex];
        var iccId = conn.iccId;
        var simcard = SimUIModel(cardIndex);
        this._simcards.push(simcard);
        this._updateCardState(cardIndex, iccId);
      }
    },

    /**
     * Handle incoming events
     *
     * @memberOf SimCardManager
     * @access private
     * @param {Event} evt
     */
    handleEvent: function scm_handlEvent(evt) {
      var cardIndex = evt.target.value;

      // it means users is seleting '--' options
      // when _simcards are all disabled
      if (cardIndex === SimSettingsHelper.EMPTY_OPTION_VALUE) {
        return;
      }

      switch (evt.target) {
        case this._elements.outgoingCallSelect:
          SimSettingsHelper.setServiceOnCard('outgoingCall', cardIndex);
          break;

        case this._elements.outgoingMessagesSelect:
          SimSettingsHelper.setServiceOnCard('outgoingMessages', cardIndex);
          break;
      }
    },

    /**
     * Handle mozSettings change event for `outgoing data` key
     *
     * @memberOf SimCardManager
     * @access private
     * @param {Number} cardIndex
     */
    _outgoingDataChangeEvent: function scm__outgoingDataChangeEvent(cardIndex) {
      this._elements.outgoingDataSelect.value = cardIndex;
    },

    /**
     * Handle change event for `outgoing data` select
     *
     * @memberOf SimCardManager
     * @access private
     */
    _addOutgoingDataSelectEvent: function scm__addOutgoingDataSelectEvent() {
      var prevCardIndex;
      var newCardIndex;

      // initialize these two variables when focus
      this._elements.outgoingDataSelect.addEventListener('focus', function() {
        prevCardIndex = this.selectedIndex;
        newCardIndex = this.selectedIndex;
      });

      this._elements.outgoingDataSelect.addEventListener('blur', function() {
        newCardIndex = this.selectedIndex;
        if (prevCardIndex !== newCardIndex) {
          // UX needs additional hint for users to make sure
          // they really want to change data connection
          var wantToChange =
            window.confirm(_('change-outgoing-data-confirm'));

          if (wantToChange) {
            SimSettingsHelper.setServiceOnCard('outgoingData',
              newCardIndex);
          } else {
            this.selectedIndex = prevCardIndex;
          }
        }
      });
    },

    /**
     * Get count of current simcards
     *
     * @memberOf SimCardManager
     * @access private
     * @return {Number} count of simcards
     */
    _getSimCardsCount: function scm__getSimCardsCount() {
      return this._simcards.length;
    },
    
    /**
     * Get information of simcard
     *
     * @memberOf SimCardManager
     * @access private
     * @param {Number} cardIndex
     * @return {Object} information stored in SimUIModel
     */
    _getSimCardInfo: function scm__getSimCardInfo(cardIndex) {
      return this._simcards[cardIndex].getInfo();
    },

    /**
     * Get simcard
     *
     * @memberOf SimCardManager
     * @access private
     * @param {Number} cardIndex
     * @return {SimUIModel}
     */
    _getSimCard: function scm__getSimCard(cardIndex) {
      return this._simcards[cardIndex];
    },

    /**
     * Iterate stored instances of SimUIModel and update each Sim UI
     *
     * @memberOf SimCardManager
     * @access private
     */
    _updateSimCardsUI: function scm__updateSimCardsUI() {
      this._simcards.forEach(function(simcard, cardIndex) {
        this._updateSimCardUI(cardIndex);
      }.bind(this));
    },

    /**
     * We would use specified instance of SimUIModel based on passing cardIndex
     * to render related UI on SimCardManager.
     *
     * @memberOf SimCardManager
     * @access private
     * @param {Number} cardIndex
     */
    _updateSimCardUI: function scm__updateSimCardUI(cardIndex) {
      var simcardInfo = this._getSimCardInfo(cardIndex);
      var selectors = ['name', 'number', 'operator'];

      var cardSelector = '.sim-card-' + cardIndex;

      var cardDom =
        this._elements.simCardContainer.querySelector(cardSelector);

      // reflect cardState on UI
      cardDom.classList.toggle('absent', simcardInfo.absent);
      cardDom.classList.toggle('locked', simcardInfo.locked);
      cardDom.classList.toggle('enabled', simcardInfo.enabled);

      // we are in three rows now, we have to fix styles
      cardDom.classList.toggle('with-number', !!simcardInfo.number);

      // relflect wordings on UI
      selectors.forEach(function(selector) {

        // will generate ".sim-card-0 .sim-card-name" for example
        var targetSelector = cardSelector + ' .sim-card-' + selector;

        this._elements.simCardContainer.querySelector(targetSelector)
          .textContent = simcardInfo[selector];
      }.bind(this));
    },

    /**
     * Initialize SimCardManager UIs which includes
     * SimCardsUI, selectOptionsUI, simSecurityUI
     *
     * @memberOf SimCardManager
     * @access private
     */
    _initSimCardManagerUI: function scm__initSimCardManagerUI() {
      this._initSimCardsUI();
      this._updateSelectOptionsUI();

      // we only inject basic DOM from templates before
      // , so we have to map UI to its info
      this._updateSimCardsUI();
      this._updateSimSecurityUI();
    },

    /**
     * Initialize SimCardsUI
     *
     * @memberOf SimCardManager
     * @access private
     */
    _initSimCardsUI: function scm__initSimCardsUI() {
      var simItemHTMLs = [];

      // inject new childs
      this._simcards.forEach(function(simcard, index) {
        simItemHTMLs.push(
          this._simItemTemplate.interpolate({
          'sim-index': index.toString()
          })
        );
      }.bind(this));

      this._elements.simCardContainer.innerHTML = simItemHTMLs.join('');
    },

    /**
     * Update SimSecurityUI
     *
     * @memberOf SimCardManager
     * @access private
     */
    _updateSimSecurityUI: function scm__updateSimSecurityUI() {
      var firstCardInfo = this._simcards[0].getInfo();
      var secondCardInfo = this._simcards[1].getInfo();

      // if we don't have any card available right now
      // or if we are in airplane mode
      if (firstCardInfo.absent && secondCardInfo.absent ||
        this._isAirplaneMode) {
          this._elements.securityEntry.setAttribute('aria-disabled', true);
          this._elements.securityDesc.setAttribute('data-l10n-id', 'noSimCard');
      } else {
        this._elements.securityEntry.setAttribute('aria-disabled', false);
        this._elements.securityDesc.removeAttribute('data-l10n-id');
        this._elements.securityDesc.textContent = '';
      }
    },

    /**
     * Update SelectOptions UI
     *
     * @memberOf SimCardManager
     * @access private
     */
    _updateSelectOptionsUI: function scm__updateSelectOptionsUI() {
      var firstCardInfo = this._simcards[0].getInfo();
      var secondCardInfo = this._simcards[1].getInfo();

      // two cards all are not absent, we have to update separately
      if (!firstCardInfo.absent && !secondCardInfo.absent) {
        SimSettingsHelper.getCardIndexFrom('outgoingCall',
          function(cardIndex) {
            this._updateSelectOptionUI('outgoingCall', cardIndex,
              this._elements.outgoingCallSelect);
        }.bind(this));

        SimSettingsHelper.getCardIndexFrom('outgoingMessages',
          function(cardIndex) {
            this._updateSelectOptionUI('outgoingMessages', cardIndex,
              this._elements.outgoingMessagesSelect);
        }.bind(this));

        SimSettingsHelper.getCardIndexFrom('outgoingData',
          function(cardIndex) {
            this._updateSelectOptionUI('outgoingData', cardIndex,
              this._elements.outgoingDataSelect);
        }.bind(this));
      } else {
        // there is one card absent while the other one is not

        var selectedCardIndex;

        // if two cards all are absent
        if (firstCardInfo.absent && secondCardInfo.absent) {
          // we will just set on the first card even
          // they are all with '--'
          selectedCardIndex = 0;
        } else {
          // if there is one card absent, the other one is not absent

          // we have to set defaultId to available card automatically
          // and disable select/option
          selectedCardIndex = firstCardInfo.absent ? 1 : 0;
        }

        // for these two situations, they all have to be disabled
        // and can not be selected by users
        this._elements.outgoingCallSelect.disabled = true;
        this._elements.outgoingMessagesSelect.disabled = true;
        this._elements.outgoingDataSelect.disabled = true;

        // then change related UI
        this._updateSelectOptionUI('outgoingCall', selectedCardIndex,
          this._elements.outgoingCallSelect);
        this._updateSelectOptionUI('outgoingMessages', selectedCardIndex,
          this._elements.outgoingMessagesSelect);
        this._updateSelectOptionUI('outgoingData', selectedCardIndex,
          this._elements.outgoingDataSelect);
      }
    },

    /**
     * Update SelectOption UI
     *
     * @memberOf SimCardManager
     * @access private
     * @param {String} storageKey
     * @param {Number} selectedCardIndex
     * @param {HTMLElement} selectedDOM 
     */
    _updateSelectOptionUI: function scm__updateSelectOptionUI(
      storageKey, selectedCardIndex, selectDOM) {
        // We have to remove old options first
        while (selectDOM.firstChild) {
          selectDOM.removeChild(selectDOM.firstChild);
        }

        // then insert the new ones
        this._simcards.forEach(function(simcard, index) {
          var simcardInfo = simcard.getInfo();
          var option = document.createElement('option');
          option.value = index;
          option.text = simcardInfo.name;

          if (simcardInfo.absent) {
            option.value = SimSettingsHelper.EMPTY_OPTION_VALUE;
            option.text = SimSettingsHelper.EMPTY_OPTION_TEXT;
          }

          if (index == selectedCardIndex) {
            option.selected = true;
          }

          selectDOM.add(option);
        });

        // we will add `always ask` option these two select
        if (storageKey === 'outgoingCall' ||
          storageKey === 'outgoingMessages') {
            var option = document.createElement('option');
            option.value = SimSettingsHelper.ALWAYS_ASK_OPTION_VALUE;
            option.setAttribute('data-l10n-id', 'sim-manager-always-ask');

            if (SimSettingsHelper.ALWAYS_ASK_OPTION_VALUE ===
              selectedCardIndex) {
                option.selected = true;
            }
            selectDOM.add(option);
        }
    },
    
    /**
     * Check whether current cardState is locked or not.
     *
     * @memberOf SimCardManager
     * @access private
     * @param {String} cardState
     * @return {Boolean}
     */
    _isSimCardLocked: function scm__isSimCardLocked(cardState) {
      var lockedState = [
        'pinRequired',
        'pukRequired',
        'networkLocked',
        'serviceProviderLocked',
        'corporateLocked',
        'network1Locked',
        'network2Locked',
        'hrpdNetworkLocked',
        'ruimCorporateLocked',
        'ruimServiceProviderLocked'
      ];

      // make sure the card is in locked mode or not
      return lockedState.indexOf(cardState) !== -1;
    },

    /**
     * Check whether current cardState is blocked or not.
     *
     * @memberOf SimCardManager
     * @access private
     * @param {String} cardState
     * @return {Boolean}
     */
    _isSimCardBlocked: function scm__isSimCardBlocked(cardState) {
      var uselessState = [
        'permanentBlocked'
      ];
      return uselessState.indexOf(cardState) !== -1;
    },

    /**
     * If voidechange happened on any conn, we would upate its cardState and
     * reflect the change on UI.
     *
     * @memberOf SimCardManager
     * @access private
     */
    _addVoiceChangeEventOnConns: function scm__addVoiceChangeEventOnConns() {
      var conns = window.navigator.mozMobileConnections;
      for (var i = 0; i < conns.length; i++) {
        var iccId = conns[i].iccId;
        conns[i].addEventListener('voicechange',
          this._updateCardStateWithUI.bind(this, i, iccId));
      }
    },

    /**
     * Iterate conns to add changeEvent
     *
     * @memberOf SimCardManager
     * @access private
     */
    _addCardStateChangeEventOnIccs:
      function scm__addCardStateChangeEventOnIccs() {
        var conns = window.navigator.mozMobileConnections;
        var iccManager = window.navigator.mozIccManager;
        for (var i = 0; i < conns.length; i++) {
          var iccId = conns[i].iccId;
          var icc = iccManager.getIccById(iccId);
          if (icc) {
            this._addChangeEventOnIccByIccId(iccId);
          }
        }
    },

    /**
     * When localized event happened, we would update each cardState and its
     * UI.
     *
     * @memberOf SimCardManager
     * @access private
     */
    _addLocalizedChangeEventOnIccs:
      function scm__addLocalizedChangeEventOnIccs() {
        var conns = window.navigator.mozMobileConnections;
        window.addEventListener('localized', function() {
          for (var i = 0; i < conns.length; i++) {
            var iccId = conns[i].iccId;
            this._updateCardStateWithUI(i, iccId);
          }
        }.bind(this));
    },

    /**
     * Add change event on each icc and would update UI if possible.
     *
     * @memberOf SimCardManager
     * @access private
     * @param {String} iccId
     */
    _addChangeEventOnIccByIccId:
      function scm__addChangeEventOnIccByIccId(iccId) {
        var self = this;
        var icc = window.navigator.mozIccManager.getIccById(iccId);
        if (icc) {
          icc.addEventListener('cardstatechange', function() {
            var cardIndex = self._getCardIndexByIccId(iccId);
            self._updateCardStateWithUI(cardIndex, iccId);

            // If we make PUK locked for more than 10 times,
            // we sould get `permanentBlocked` state, in this way
            // we have to update select/options
            if (self._isSimCardBlocked(icc.cardState)) {
              self._updateSelectOptionsUI();
            }
          });
        }
    },

    /**
     * If the state of APM is changed, we will update states and update all
     * related UIs.
     *
     * @memberOf SimCardManager
     * @access private
     */
    _addAirplaneModeChangeEvent: function scm__addAirplaneModeChangeEvent() {
      var self = this;
      AirplaneModeHelper.addEventListener('statechange', function(state) {
        // we only want to handle these two states
        if (state === 'enabled' || state === 'disabled') {
          var enabled = (state === 'enabled') ? true : false;
          self._isAirplaneMode = enabled;
          self._updateCardsState();
          self._updateSimCardsUI();
          self._updateSimSecurityUI();
        }
      });
    },

    /**
     * Iterate conns to call updateCardState on each conn.
     *
     * @memberOf SimCardManager
     * @access private
     */
    _updateCardsState: function scm__updateCardsState() {
      var conns = window.navigator.mozMobileConnections;
      for (var cardIndex = 0; cardIndex < conns.length; cardIndex++) {
        var iccId = conns[cardIndex].iccId;
        this._updateCardState(cardIndex, iccId);
      }
    },

    /**
     * we will use specified conn to update its state on our internal simcards
     *
     * @memberOf SimCardManager
     * @access private
     * @param {Number} cardIndex
     * @param {String} iccId
     */
    _updateCardState: function scm__updateCardState(cardIndex, iccId) {
      var iccManager = window.navigator.mozIccManager;
      var conn = window.navigator.mozMobileConnections[cardIndex];
      var simcard = this._simcards[cardIndex];

      if (!iccId || this._isAirplaneMode) {
        simcard.setState('nosim');
      } else {
        // else if we can get mobileConnection,
        // we have to check locked / enabled state
        var icc = iccManager.getIccById(iccId);
        var iccInfo = icc.iccInfo;
        var cardState = icc.cardState;
        var operatorInfo = MobileOperator.userFacingInfo(conn);

        if (this._isSimCardLocked(cardState)) {
          simcard.setState('locked');
        } else if (this._isSimCardBlocked(cardState)) {
          simcard.setState('blocked');
        } else {
          // TODO:
          // we have to call Gecko API here to make sure the
          // simcard is enabled / disabled
          simcard.setState('normal', {
            number: iccInfo.msisdn || iccInfo.mdn || '',
            operator: operatorInfo.operator || _('no-operator')
          });
        }
      }
    },

    /**
     * Sometimes, we have to update state and UI at the same time, so this is
     * a handy function to use.
     *
     * @memberOf SimCardManager
     * @access private
     * @param {Number} cardIndex
     * @return {String} iccId
     */
    _updateCardStateWithUI:
      function scm__updateCardStateWithUI(cardIndex, iccId) {
        this._updateCardState(cardIndex, iccId);
        this._updateSimCardUI(cardIndex);
        this._updateSimSecurityUI();
    },

    /**
     * This method would help us find out the index of passed in iccId.
     *
     * @memberOf SimCardManager
     * @access private
     * @param {String} iccId
     * @return {Number} cardIndex
     */
    _getCardIndexByIccId: function scm__getCardIndexByIccId(iccId) {
      var conns = window.navigator.mozMobileConnections;
      var cardIndex;
      for (var i = 0; i < conns.length; i++) {
        if (conns[i].iccId == iccId) {
          cardIndex = i;
        }
      }
      return cardIndex;
    }
  };

  return SimCardManager;
});

define('panels/simcard_manager/panel',['require','modules/settings_panel','panels/simcard_manager/simcard_manager'],function(require) {
  

  var SettingsPanel = require('modules/settings_panel');
  var SimCardManager = require('panels/simcard_manager/simcard_manager');

  return function ctor_sim_manager_panel() {
    return SettingsPanel({
      onInit: function(panel) {
        var simcardManager = new SimCardManager({
          simCardContainer: panel.querySelector('.sim-card-container'),
          simCardTmpl: panel.querySelector('.sim-card-tmpl'),
          securityEntry: panel.querySelector('.sim-manager-security-entry'),
          securityDesc: panel.querySelector('.sim-manager-security-desc'),
          outgoingCallSelect:
            panel.querySelector('.sim-manager-outgoing-call-select'),
          outgoingMessagesSelect:
            panel.querySelector('.sim-manager-outgoing-messages-select'),
          outgoingDataSelect:
            panel.querySelector('.sim-manager-outgoing-data-select'),
        });
        simcardManager.init();
      }
    });
  };
});
