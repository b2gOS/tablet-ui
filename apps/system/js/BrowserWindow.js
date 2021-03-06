/**
 * Browser Window.
 *
 * A browser window includes a URL bar and a mozbrowser frame.
 */

/**
 * Browser Window Constructor.
 */
var BrowserWindow = function(id, url) {
  if (id === undefined) {
    return null;
  }
  this.container = document.getElementById('windows');
  this.id = id;
  this.currentURL = '';
  this.currentTitle = '';
  this.render(url);
  this.pageIconURL = '';
  return this;
};


/**
 * Render the window.
 *
 * @param {String} url URL to navigate window to.
 */
BrowserWindow.prototype.render = function(url) {
  
  // Navigate to URL
  this.url = url;
  if (!url) { 
    this.url = "http://newtab.localhost/index.html" 
  }

  const isAppURL = UrlHelper.isLoaclApp(this.url); 

  this.container.insertAdjacentHTML('beforeend',
  `<sub-app id="window${this.id}" process-id=${this.id} appurl=${this.url} 
   class="browser-window" islocalapp=${isAppURL}>
   </sub-app>`
  );

  // Get DOM elements
  this.element = document.getElementById('window' + this.id);
  this.urlBar = document.getElementById('url-bar-' + this.id);
  this.urlBarForm = document.getElementById('url-bar-form-' + this.id);
  this.frame = document.getElementById('window-frame-' + this.id);
  this.closeButton = document.getElementById('close-button-' + this.id);
  this.scrim = document.getElementById('window-scrim-' + this.id);

  // Add event listeners
 this.frame.addEventListener('mozbrowserlocationchange',
    this.handleLocationChange.bind(this));
 this.frame.addEventListener('mozbrowseropenwindow',
    this.handleOpenWindow.bind(this));
 this.frame.addEventListener('mozbrowserloadstart',
    this.handleLoadStart.bind(this));
 this.frame.addEventListener('mozbrowserloadend',
    this.handleLoadEnd.bind(this));
 this.frame.addEventListener('mozbrowsericonchange',
    this.handleIconChange.bind(this));
 window.addEventListener('_setvolume', this.setVolume.bind(this));
 this.urlBar.addEventListener('focus', this.handleUrlBarFocus.bind(this));
 this.urlBar.addEventListener('blur', this.handleUrlBarBlur.bind(this));
 this.urlBarForm.addEventListener('submit',
    this.handleUrlSubmit.bind(this));
 this.closeButton.addEventListener('click', this.close.bind(this));
 this.scrim.addEventListener('click', this.handleScrimClick.bind(this));

};

/**
 * Show the Window.
 */
BrowserWindow.prototype.show = function() {
  this.element.classList.remove('hidden');
};

/**
 * Hide the window.
 */
BrowserWindow.prototype.hide = function() {
  this.element.classList.add('hidden');
};

/**
 * Close the window.
 */
BrowserWindow.prototype.close = function() {
  var e = new CustomEvent('_closewindow', {
    detail: {
      id: this.id
    }
  });
  window.dispatchEvent(e);
};

/**
 * Delete the element from the DOM.
 */
BrowserWindow.prototype.destroy = function() {
  this.container.removeChild(this.element);
};

/**
 * Handle location change.
 *
 * @param {Event} e mozbrowserlocationchange event.
 */
BrowserWindow.prototype.handleLocationChange = function(e) {
  this.pageIconURL = '';
  var url = e.detail;
  if (url == 'about:blank' || url =='about:newtab') {
     this.urlBar.focus();
     return;
  }
  this.currentURL = url;
  var hostname = new URL(url).hostname;
  this.currentTitle = hostname;
  this.urlBar.value = hostname;
};

/**
 * Handle open window.
 *
 * @param {Event} mozbrowseropenwindow event.
 */
BrowserWindow.prototype.handleOpenWindow = function(e) {
  e.preventDefault();
  window.dispatchEvent(new CustomEvent('_openwindow', {
    'detail': e.detail
  }));
};

/**
 * Handle loadstart event.
 *
 * @param {Event} e mozbrowserloadstart event.
 */
BrowserWindow.prototype.handleLoadStart = function(e) {
  this.urlBar.classList.add('loading');

  this._audioChannels = {};
  if (navigator.mozAudioChannelManager) {
    navigator.mozAudioChannelManager.allowedAudioChannels.forEach(ch => {
      console.debug("ALLOWED AUDIO CHANNEL: name=", ch.name);
      ch.onactivestatechanged = ch_evt => {
        console.debug("AudioChannel activestatechanged: ", ch_evt.name, ch.name);
      };
      this._audioChannels[ch.name] = ch;
      ch.getVolume().then(v => {
        console.debug("name=", ch.name, "volume=", v);
        ch.getMuted().then(m => {
          console.debug("name=", ch.name, "muted=", m);
          ch.isActive().then(a => {
            console.debug("name=", ch.name, "active=", a);
          });
        });
      });
    });
  }
};

/**
 * Handle loadend event.
 *
 * @param {Event} e mozbrowserloadend event.
 */
BrowserWindow.prototype.handleLoadEnd = function(e) {
  this.urlBar.classList.remove('loading');
  Places.updateSite(this.currentURL, this.pageIconURL);
};

/*
 * Handle icon change.
 *
 * @param {Event} mozbrowsericonchange event.
 */
BrowserWindow.prototype.handleIconChange = function(e) {
  if (e.detail.href) {
    this.pageIconURL = e.detail.href
  }
};

BrowserWindow.prototype.setVolume = function(e) {
  if (!e.detail.level) {
    console.debug('No valid volume level set');
    return;
  }

  var level = parseFloat(e.detail.level);
  Object.keys(this._audioChannels).forEach(ch => {
    console.debug('Setting', ch, 'to', level);
    this._audioChannels[ch].setVolume(level);
  });
};

/**
 *  Handle focus of URL bar.
 *
 *  @param {Event} e focus event.
 */
BrowserWindow.prototype.handleUrlBarFocus = function (e) {
  this.urlBar.value = this.currentURL;
  this.urlBar.select();
};

/**
 *  Handle URL bar losing focus.
 *
 *  @param {Event} e blur event.
 */
BrowserWindow.prototype.handleUrlBarBlur = function (e) {
  this.urlBar.value = this.currentTitle;
};

/**
 * Handle URL submission.
 *
 * If URL is invald, prepend "http://".
 *
 * @param {Event} e submit event.
 */
BrowserWindow.prototype.handleUrlSubmit = function (e) {
  e.preventDefault();
  var input = this.urlBar.value;
  if (UrlHelper.isURL(input)) {
    if (UrlHelper.hasScheme(input)) {
      this.frame.setAttribute('src',input);
    } else {
      this.frame.setAttribute('src','http://' + input);
    }
  } else {
    this.frame.setAttribute('src','https://google.com/search?q=' + input);

  }
  this.urlBar.blur();
};

/**
 * Navigate back in session history.
 */
BrowserWindow.prototype.goBack = function() {
  this.frame.goBack();
};

/**
 * Handle click on window scrim.
 */
BrowserWindow.prototype.handleScrimClick = function() {
  var e = new CustomEvent('_openwindow', {
    detail: {
      id: this.id
    }
  });
  window.dispatchEvent(e);
};
