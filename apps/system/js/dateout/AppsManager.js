/**
 * AppsManager
 */

 var AppsManager = {

    broadcastChannel: null,
    appsManagerService: null,
    appslist:[],
  
    /**
     * Start
     */
    start: function() {
      this.appsManagerService.getAll((status, apps) => {
        console.log(`call getAll status ${status} Apps:${apps}`);
        apps.forEach((app) => {
          const { name, manifestUrl } = app;
          console.log(`app-name:${name} app-manifest:${manifestUrl}`);
          this.appslist.push(name);
        });
        console.log(this.appslist);
      });
  
    },
  
    init: function(){
      this.appsManagerService = new AppsServiceManager();
      if (this.appsManagerService) {
        setTimeout(() => {
          this.start();
        }, 1000);
      }
    }
  
  
  
  };

//   window.addEventListener('load', function UI_onLoad() {
//     window.removeEventListener('load', UI_onLoad);
//     UI.init();
//   });
  
  