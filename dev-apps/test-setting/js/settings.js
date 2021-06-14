var Settings = {

    settingsManagerService: null,
    appslist:[],

  start: function() {
    this.appsManagerService.getAll((status, apps) => {
    //   console.log(`call getAll status ${status} Apps:${apps}`);
      apps.forEach((app) => {
        const { name, manifestUrl } = app;
        // console.log(`app-name:${name} app-manifest:${manifestUrl}`);
        this.appslist.push(name);
      });
    //   console.log(this.appslist);
      this.updateapplist();
    });

  },

  updateapplist: function(){
    appdiv = document.getElementById("app");
    innerhtml = ``;
    this.appslist.forEach((app, index) => {
      innerhtml = innerhtml + `<div style="width: auto;">
        <ul id="app_` + index + `" >
          <li style="width: 80%;">` + app +`</li>
          <li id="app_` + index + `_explan" status="hidden">
            more..
          </li>
        </ul>
        <div id="app_` + index + `_sub" class="hidden">
          <button>uninstall</button>
        </div>
      </div>`

    });

    appdiv.innerHTML = innerhtml;

    this.appslist.forEach((app, index) => {
      document.getElementById("app_" + index +"_explan").addEventListener('click', () => {
        console.log("app_" + index +"_explan");
        if (document.getElementById("app_" + index +"_explan").getAttribute("status") == "hidden"){
          document.getElementById("app_" + index +"_sub").classList.remove("hidden")
          document.getElementById("app_" + index +"_explan").setAttribute("status","")
        }else{
          document.getElementById("app_" + index +"_sub").classList.add("hidden")
          document.getElementById("app_" + index +"_explan").setAttribute("status","hidden")
        }
      });
    });

  },

  // Init
  init: function(){
    this.settingsManagerService = new SettingsServiceManager();
  }

}