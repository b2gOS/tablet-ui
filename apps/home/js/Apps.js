
class Apps {
  constructor(){
    this.appsManagerService = null;
    this.appslist = [];
    this.status = false;
    this.appsManagerService = new AppsServiceManager();
  }

  getapps(){
    
    return new Promise((resolve,reject) => {
      this.appsManagerService.getAll((status, apps) => {
        this.appslist = [];
        apps.forEach((app) => {
          const { name, manifestUrl } = app;
          console.log(`app-name:${name} app-manifest:${manifestUrl}`);
          var app = {
            name: name,
            manifestUrl: manifestUrl
          }
          this.appslist.push(app);
        });
        resolve(this.appslist)
      });

      // callback(this.appslist);
      // resolve(this.appslist)
    })

    
    
  }

}

