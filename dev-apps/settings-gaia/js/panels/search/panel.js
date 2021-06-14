
/* exported Format */


/**
 * format.js: simple formatters and string utilities.
 */

var Format = {

  /**
   * Pads a string to the number of characters specified.
   * @param {String} input value to add padding to.
   * @param {Integer} len length to pad to.
   * @param {String} padWith char to pad with (defaults to " ").
   */
  padLeft: function(input, len, padWith) {
    padWith = padWith || ' ';

    var pad = len - (input + '').length;
    while (--pad > -1) {
      input = padWith + input;
    }
    return input;
  }
};

define("shared/format", function(){});



/* exported SearchProvider */
/* globals LazyLoader */
/* globals SettingsListener */
/* globals Format */

(function(exports) {

  // When the "search_providers_input.json" file is edited, both this
  // and PROVIDERS_VERSION in app/search/test/marionette/lib/search.js
  // should be bumped so existing clients reload the updated data
  var VERSION = 3;

  // Cache for current provider configuration
  var SEARCH_CACHE_KEY = 'search.cache';
  // The users current provider selection
  var SEARCH_PROVIDER_KEY = 'search.provider';

  // File containing the provider configurations for all partners
  var DEFAULT_PROVIDERS_URL = '/shared/js/search_providers.json';

  // Store the users current provider selection
  var provider = null;

  // Store the list of available providers
  var providers = {};
  var defaultEngine = null;

  // Notify a client when provider configuration changes
  var updatedFun;

  // Allow consumers to wait for data to be initialised
  var readyPromise;
  var resolver;

  function extend(dest, source) {
    for (var k in source) {
      if (source.hasOwnProperty(k)) {
        var value = source[k];
        if (dest.hasOwnProperty(k) &&
            typeof dest[k] === 'object' &&
            typeof value === 'object') {
          extend(dest[k], value);
        } else {
          dest[k] = value;
        }
      }
    }
    return dest;
  }

  function resolveUrl(urlConf) {
    var params = Object.keys(urlConf.params).map(function(k) {
      return k + '=' + urlConf.params[k];
    }).join('&');
    return urlConf.url + (params ? '?' + params : '');
  }

  // We havent got valid cached data so load the json configuration
  // file and pick the configuration based on the current
  // partner code
  function loadProviderConfig() {
    LazyLoader.getJSON(DEFAULT_PROVIDERS_URL).then(result => {

      var conns = navigator.mozMobileConnections || [];
      var mccs = Array.prototype.slice.call(conns).map(function(conn) {
        if (conn.voice && conn.voice.network) {
          return Format.padLeft(conn.voice.network.mcc, 3, '0') + '-' +
            Format.padLeft(conn.voice.network.mnc, 3, '0');
        }
      });
      var engines = SearchProvider.pickEngines(result, mccs,
                                               result.partner_code || null,
                                               navigator.language);
      defaultEngine = engines.defaultEngine;
      providers = engines.providers;

      // Cache for future lookups
      var cache = {};
      cache[SEARCH_CACHE_KEY] = {};
      cache[SEARCH_CACHE_KEY].defaultEngine = defaultEngine;
      cache[SEARCH_CACHE_KEY].providers = providers;
      cache[SEARCH_CACHE_KEY].version = VERSION;
      navigator.mozSettings.createLock().set(cache);

      providersLoaded();
    });
  }

  // Once the providers are loaded, find the users current provider
  // selection
  function providersLoaded() {
    SettingsListener.observe(SEARCH_PROVIDER_KEY, false, value => {
      if (value === false || !(value in providers)) {
        provider = defaultEngine;
      } else {
        provider = value;
      }

      if (resolver && isReady()) {
        resolver();
        resolver = null;
      }

      if (updatedFun) {
        updatedFun();
      }
    });
  }

  function isReady() {
    return provider !== null && Object.keys(providers).length;
  }

  var SearchProvider = function(key) {
    if (!provider || !(key in providers[provider])) {
      return false;
    }
    return providers[provider][key];
  };

  SearchProvider.providerUpdated = function(cb) {
    updatedFun = cb;
  };

  SearchProvider.setProvider = function(value) {
    if (!(value in providers)) {
      return false;
    }
    var setting = {};
    setting[SEARCH_PROVIDER_KEY] = value;
    navigator.mozSettings.createLock().set(setting);
  };

  SearchProvider.selected = function() {
    return provider;
  };

  SearchProvider.providers = function() {
    return providers;
  };

  SearchProvider.pickEngines = function(config, sims, partnerCode, locale) {

    config = JSON.parse(JSON.stringify(config));

    var engine = config.defaultEngines;
    var usersConfig = {defaultEngine: null, providers: {}};

    if (partnerCode in config.partnerConfig &&
        locale in config.partnerConfig[partnerCode]) {
      engine = config.partnerConfig[partnerCode][locale];
    }

    sims.forEach(function(sim) {
      if (sim in config.simConfigs && locale in config.simConfigs[sim]) {
        engine = config.simConfigs[sim][locale];
      }
    });

    usersConfig.defaultEngine = engine.defaultEngine;
    Object.keys(engine.providers).forEach(function (provider) {
      var obj = config.search_providers[provider];

      if (locale in config.locales && provider in config.locales[locale]) {
        obj = extend(obj, config.locales[locale][provider]);
      }

      obj = extend(obj, engine.providers[provider]);

      usersConfig.providers[provider] = {
        'title': obj.title,
        'searchUrl': resolveUrl(obj.search),
        'suggestUrl': resolveUrl(obj.suggest)
      };
    });

    return usersConfig;
  };

  SearchProvider.ready = function() {

    if (readyPromise) {
      return readyPromise;
    }

    // Attempt to load cached provider configuration
    var req = navigator.mozSettings.createLock().get(SEARCH_CACHE_KEY);
    req.onsuccess = function() {
      // Do a version check so if the data has updated since it
      // was cached, reload it
      if (SEARCH_CACHE_KEY in req.result &&
          req.result[SEARCH_CACHE_KEY].version === VERSION) {
        defaultEngine = req.result[SEARCH_CACHE_KEY].defaultEngine;
        providers = req.result[SEARCH_CACHE_KEY].providers;
        providersLoaded();
      } else {
        // There was no cache or it failed the version check, reload
        // from file
        loadProviderConfig();
      }
    };

    readyPromise = new Promise(resolve => {
      resolver = resolve;
    });

    return readyPromise;
  };

  exports.SearchProvider = SearchProvider;

})(window);

define("shared/search_provider", (function (global) {
    return function () {
        var ret, fn;
        return ret || global.SearchProvider;
    };
}(this)));



define('panels/search/search',['require','shared/format','shared/search_provider'],function(require) {

  require('shared/format');
  var SearchProvider = require('shared/search_provider');

  function Search() {
    this._searchEngineSelect = null;
  }

  Search.prototype.init = function(searchEngineSelect) {
    this._searchEngineSelect = searchEngineSelect;
    SearchProvider.ready().then(() => {
      this.drawProviders();
      // Listen for updates as the providers may be updated
      // within the search app
      SearchProvider.providerUpdated(this.drawProviders.bind(this));
    });
  };

  /**
   * Generate <options> for the search engine <select> element.
   *
   * @this
   */
  Search.prototype.drawProviders = function() {

    if (!this._searchEngineSelect) {
      return;
    }

    this._searchEngineSelect.innerHTML = '';

    var selectFragment = document.createDocumentFragment();
    var optionNode = document.createElement('option');

    var providers = SearchProvider.providers();

    Object.keys(providers).forEach(function(provider) {
      var option = optionNode.cloneNode();
      option.value = provider;
      option.text = providers[provider].title;
      if (provider === SearchProvider.selected()) {
        option.selected = true;
      }
      selectFragment.appendChild(option);
    });

    this._searchEngineSelect.appendChild(selectFragment);
  };

  return function() {
    return new Search();
  };
});

/**
 * SearchSettings provides the settings interface for search (i.e. default
 * search engine)
 */
define('panels/search/panel',['require','modules/settings_panel','panels/search/search'],function(require) {
  

  var SettingsPanel = require('modules/settings_panel');
  var Search = require('panels/search/search');

  var search;

  function onInit(panel) {
    var searchEngineSelect = panel.querySelector('[name="search.provider"]');
    search = Search();
    search.init(searchEngineSelect);
  }

  return function() {
    // SettingsPanel is not a constructor. Not even a little bit.
    return SettingsPanel({
      onInit: onInit
    });
  };
});
