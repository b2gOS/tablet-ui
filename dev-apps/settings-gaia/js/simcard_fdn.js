/* global getIccByIndex, DsdsSettings, MozActivity, FdnAuthorizedNumbers */


define('simcard_fdn', ['modules/dialog_service'], function(DialogService) {
  var SimFdnLock = {
    // enable|disable|unlock FDN
    simFdnDesc: document.querySelector('#fdn-enabled small'),
    simFdnCheckBox: document.querySelector('#fdn-enabled input'),
    resetPin2Item: document.getElementById('fdn-resetPIN2'),
    resetPin2Button: document.querySelector('#fdn-resetPIN2 button'),

    // FDN contact list (display, add)
    contactsContainer: document.getElementById('fdn-contactsContainer'),
    fdnContactButton: document.getElementById('fdnContact'),

    // FDN contact action menu (call, edit, delete)
    fdnActionMenu: document.getElementById('call-fdnList-action'),
    fdnActionMenuName: document.getElementById('fdnAction-name'),
    fdnActionMenuNumber: document.getElementById('fdnAction-number'),
    fdnActionMenuCall: document.getElementById('fdnAction-call'),
    fdnActionMenuEdit: document.getElementById('fdnAction-edit'),
    fdnActionMenuRemove: document.getElementById('fdnAction-delete'),
    fdnActionMenuCancel: document.getElementById('fdnAction-cancel'),
    currentContact: null,

    updateFdnStatus: function spl_updateSimStatus() {
      var self = this;
      var iccObj = getIccByIndex();
      if (!iccObj) {
        return console.error('Could not retrieve ICC object');
      }

      var req = iccObj.getCardLock('fdn');
      req.onsuccess = function spl_checkSuccess() {
        var enabled = req.result.enabled;
        self.simFdnDesc.setAttribute('data-l10n-id',
                                     enabled ? 'enabled' : 'disabled');
        self.simFdnCheckBox.disabled = false;
        self.simFdnCheckBox.checked = enabled;
        self.resetPin2Item.hidden = !enabled;
      };
    },

    init: function spl_init() {
      var iccObj = getIccByIndex();
      if (!iccObj) {
        return console.error('Could not retrieve ICC object');
      }

      var updateFdnStatusCallback = this.updateFdnStatus.bind(this);
      iccObj.addEventListener('cardstatechange', updateFdnStatusCallback);

      var self = this;

      // enable|disable|unlock FDN

      this.simFdnCheckBox.disabled = true;
      this.simFdnCheckBox.onchange = function spl_togglePin2() {
        var action = this.checked ? 'enable_fdn' : 'disable_fdn';
        if (iccObj.cardState === 'puk2Required') {
          action = 'unlock_puk2';
        }
        DialogService.show('simpin-dialog', {
          method: action,
          cardIndex: DsdsSettings.getIccCardIndexForCallSettings()
        }).then(function(result) {
          // we will update fdn status no matter how
          updateFdnStatusCallback();
        });
      };

      this.resetPin2Button.onclick = function spl_resetPin2() {
        DialogService.show('simpin-dialog', {
          method: 'change_pin2',
          cardIndex: DsdsSettings.getIccCardIndexForCallSettings()
        });
      };

      this.updateFdnStatus();

      // add|edit|remove|call FDN contact
      window.addEventListener('panelready', (function(e) {
        if (e.detail.current === '#call-fdnList') {
          this.renderAuthorizedNumbers();
        } else if (e.detail.current === '#call-fdnSettings') {
          // Refresh FDN status when the panel is reloaded, since we could be
          // dealing with different FDNsettings on dual SIM phones.
          this.updateFdnStatus();
        }
      }).bind(this));

      this.fdnContactButton.onclick = function() { // add FDN contact
        DialogService.show('call-fdnList-add', {
          mode: 'add'
        }).then(function(result) {
          var type = result.type;
          var value = result.value;
          if (type === 'submit') {
            self.updateContact('add', {
              name: value.name,
              number: value.number
            });
          }
        });
      };

      this.fdnActionMenuEdit.onclick = function() { // edit FDN contact
        // hide action menu first
        self.hideActionMenu();

        // then show dialog
        DialogService.show('call-fdnList-add', {
          name: self.currentContact.name,
          number: self.currentContact.number,
          mode: 'edit'
        }).then(function(result) {
          var type = result.type;
          var value = result.value;
          if (type === 'submit') {
            self.updateContact('edit', {
              name: value.name,
              number: value.number
            });
          }
        });
      };

      this.fdnActionMenuRemove.onclick = function() { // remove FDN contact
        self.hideActionMenu();
        self.updateContact('remove');
      };

      this.fdnActionMenuCall.onclick = function() {
        var activity = new MozActivity({
          name: 'dial',
          data: {
            type: 'webtelephony/number',
            number: self.currentContact.number
          }
        });

        activity.onerror = function() {
          console.error('we are not able to call mozActivity to dialer with' +
            ' number ' + self.currentContact.number);
        };
      };

      this.fdnActionMenuCancel.onclick = this.hideActionMenu.bind(this);
    },


    /**
     * Display FDN contact list and action menu
     */

    renderFdnContact: function(contact) {
      var li = document.createElement('li');
      var nameContainer = document.createElement('span');
      var numberContainer = document.createElement('small');

      nameContainer.textContent = contact.name;
      numberContainer.textContent = contact.number;
      li.appendChild(numberContainer);
      li.appendChild(nameContainer);

      li.onclick = (function() {
        this.showActionMenu(contact);
      }).bind(this);
      return li;
    },

    renderAuthorizedNumbers: function() {
      this.contactsContainer.innerHTML = '';
      FdnAuthorizedNumbers.getContacts(null, (function(contacts) {
        for (var i = 0, l = contacts.length; i < l; i++) {
          var li = this.renderFdnContact(contacts[i]);
          this.contactsContainer.appendChild(li);
        }
      }).bind(this));
    },

    showActionMenu: function(contact) {
      this.currentContact = contact;
      this.fdnActionMenuName.textContent = contact.name;
      this.fdnActionMenuNumber.textContent = contact.number;
      this.fdnActionMenu.hidden = false;
    },

    hideActionMenu: function() {
      this.fdnActionMenu.hidden = true;
    },


    /**
     * Add|Edit|Remove FDN contact
     */

    updateContact: function(action, options) {
      // `action' is either `add', `edit' or `remove': these three actions all
      // rely on the same mozIccManager.updateContact() method.
      options = options || {};
      var name = options.name;
      var number = options.number;

      var contact = FdnAuthorizedNumbers.getContactInfo(action, {
        id: this.currentContact && this.currentContact.id,
        name: name,
        number: number
      });

      DialogService.show('simpin-dialog', {
        method: 'get_pin2',
        cardIndex: DsdsSettings.getIccCardIndexForCallSettings(),
        pinOptions: {
          fdnContact: contact
        }
      }).then((result) => {
        var type = result.type;
        if (type === 'submit') {
          this.renderAuthorizedNumbers();
        }
      });
    }
  };

  return SimFdnLock;
});

navigator.mozL10n.once(function() {
  require(['simcard_fdn'], function(SimFdnLock) {
    SimFdnLock.init();
  });
});
