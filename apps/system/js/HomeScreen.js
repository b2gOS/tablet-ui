/**
 * HomeScreen.
 *
 * System UI element including search bar and home screen frame.
 */

var HomeScreen = {

  /**
   * Start the home screen.
   */
  start: function() {

    // Get DOM elements
    this.element = document.getElementById('home-screen');
    this.searchBar = document.getElementById('search-bar');
    this.topSites = document.getElementById('top-sites-list');
    // Start the Places database
    Places.start().then((function() {
      this.showTopSites();
    }).bind(this), function(error) {
      console.error('Failed to start Places database ' + error);
    });

    // Register event listeners
    this.searchBar.addEventListener('click', this.handleSearchClick);

    this.broadcastChannel = new BroadcastChannel('system');
    this.broadcastChannel.onmessage = this.handleMessage.bind(this);
    this.broadcastChannel = new BroadcastChannel('openweb');
    this.broadcastChannel.onmessage = function (event) { 
                                                      this.handleOpenWindow(
                                                        {detail: {
                                                                    url: event.data
                                                                  }
                                                        });
                                                    }.bind(this)

    return this;
  },

  showTopSites: function() {
    this.topSites.innerHTML = '';
    var pinnedSiteIds = [];

    // First get pinned sites
    Places.getPinnedSites().then(function(pinnedSites) {
      pinnedSites.forEach(function(siteObject) {
        pinnedSiteIds.push(siteObject.id);
        var tile = new Tile(siteObject, '_blank', true);
      }, this);
    });
    
    // Then get all top sites and de-dupe
    Places.getTopSites().then((function(topSites) {
      topSites.forEach(function(siteObject) {
        if (pinnedSiteIds.indexOf(siteObject.id) == -1) {
          var tile = new Tile(siteObject, '_blank');
        }
      }, this);
    }).bind(this));
  },

  /**
   * Handle a message received via postMessage().
   */
  handleMessage: function(event) {
    this.showTopSites();
    console.log('Received message saying ' + event.data);
  },


  /**
   * Handle click on search box.
   */
  handleSearchClick: function() {
    window.dispatchEvent(new CustomEvent('_openwindow'));
  },

  /**
   * Handle open window event.
   *
   * @param {Event} e mozbrowseropenwindow event.
   */
  handleOpenWindow: function(e) {
    // e.preventDefault();
    window.dispatchEvent(new CustomEvent('_openwindow', {
      'detail': e.detail
    }));
  }

};