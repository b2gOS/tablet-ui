/**
 * HomeScreen.
 *
 * Displays your top sites.
 */

var HomeScreen = {
  /**
   * Broadcast channel used to communicate with the system.
   */
  broadcastChannel: null,

  /**
   * Start the home screen.
   */
  start: function() {
    this.topSites = document.getElementById('top-sites-list');
    // Start the Places database
    // Apps.Init();
    this.appmanager = new Apps;
    setTimeout(() => {
      this.appmanager.getapps().then((appsList)=>{
        this.showTopSites(appsList);
      })
    },1000)
  },

  /*
   * Show top sites.
   */
  showTopSites: function(AppsList) {
    AppsShow = document.getElementById("top-sites-list");
    AppsShow.innerHTML = `Loading...`;
    this.AppsIconHtml(AppsList).then((html) =>{
      AppsShow.innerHTML = html;
    });
  },

  AppsIconHtml: function(AppsList){
    return new Promise((resolve,reject) => {
      innerhtml = ``;
      AppsList.forEach((app) => {
        this.getManifest(app.manifestUrl).then(manifest =>{ 
          innerhtml = innerhtml + this.AppIconHtml(manifest);
        });
      });
      setTimeout(() => {
        resolve(innerhtml)
      },3000)
    });
  },

  AppIconHtml: function(manifest){
    if(manifest.icons){
      var style = '';
      var backgroundBrightness = 'light';
      var label = manifest.name;
      var appurl = `http://${manifest.name}.localhost`

      if (manifest.theme_color) {
        style += 'background-color: ' + manifest.theme_color + ';';
        var rgb = this._hexToRgb(manifest.theme_color);
        backgroundBrightness = this._darkOrLight(rgb);
      }
      if (manifest.icons && manifest.icons[0]) {
        style += `background-image: url(${appurl}${manifest.icons[0].src});`
      } else if (manifest.iconUrl) {
        style += `background-image: url(${appurl}${manifest.iconUrl});`
      }
      return `<a id="tile-${manifest.name}_localhost" href="${appurl}${manifest.start_url}" target="_blank" class="tile ${backgroundBrightness}
      " style="${style}"><span class="tile-name">${label}</span></a>`;
    }else{
      return ``
    }
  },


  getManifest: function(manifestUrl){
    return new Promise((resolve,reject) => {
      var url = manifestUrl
      var request = new XMLHttpRequest();
      request.open("get", url);
      request.send(null);/*不发送数据到服务器*/
      request.onload = function () {/*XHR对象获取到返回信息后执行*/
        if (request.status == 200) {/*返回状态为200，即为数据获取成功*/
                var manifest = JSON.parse(request.responseText);

                resolve(manifest);
        }else{
          reject(null);
        }
      }
    });
  },

  _hexToRgb: function(hex) {
    var result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16)
    } : null;
  },

  _darkOrLight: function(rgb) {
    if ((rgb.r*0.299 + rgb.g*0.587 + rgb.b*0.114) > 186) {
      return 'light'; 
    } else {
      return 'dark';
    }
  }

  /**
   * Handle a message received via postMessage().
   */
  // handleMessage: function(event) {
  //   this.showTopSites();
  //   console.log('Received message saying ' + event.data);
  // }

  /**
   * Handle click on search box.
   */
  // handleSearchClick: function() {
  //   window.dispatchEvent(new CustomEvent('_openwindow'));
  // }

  /**
   * Handle open window event.
   *
   * @param {Event} e mozbrowseropenwindow event.
   */
  // handleOpenWindow: function(e) {
  //   // e.preventDefault();
  //   window.dispatchEvent(new CustomEvent('_openwindow', {
  //     'detail': e.detail
  //   }));
  // }

};

/**
  * Start home screen on page load.
  */
window.addEventListener('load', function homeScreen_onLoad() {
  window.removeEventListener('load', homeScreen_onLoad);
  HomeScreen.start();
  // if(!(Apps.status)) {
  //   setTimeout(() => {
  //     HomeScreen.showTopSites();
  //   }, 1000);
  // }
});


