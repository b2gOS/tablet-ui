/**
 * Window Manager.
 *
 * Manages windows.
 */

class WindowManager extends HTMLElement {
  constructor(){
      super();
      this.apps = {}; // {...{appname:{dom}}...} 
      this.activeApp = null;
  }

  connectedCallback() {
    //todo
    this.windowHtml = document.getElementById('windows')
    this.homeScreen = document.getElementById('home-screen')
    this.body = document.querySelector('body')

    //keyborad bug
    // this.openWindow("keyborad", "NUK")

  }

  openWindow(appName, appUrl){
      // check app if outline 
      if( typeof(this.apps[appName]) == "undefined" ){
        console.log(`openWindow:: ${typeof(this.apps[appName])}`)
        
        const isAppURL = UrlHelper.isLoaclApp(appUrl); 
        const appWindow = document.createElement("app-contain");
        appWindow.setAttribute("process-id",appName)
        appWindow.setAttribute("appurl",appUrl)
        appWindow.setAttribute("islocalapp",isAppURL)
        appWindow.classList.add('browser-window')
        this.appendChild(appWindow);
        this.apps[appName] = appWindow;
        console.log(`apps:: ${this.apps}`)
        console.log(this.apps)

        // app switch
        this.switchWindow(appName);

        return appWindow.querySelector('web-view');
      }else{

        this.switchWindow(appName);
        return this.apps[appName].querySelector('web-view');
      }

  }

  closeWindow(appName){
      // check app online
      let app = this.apps[appName]
      if( typeof(app) != "undefined" ){
        console.log(`closeWindow:: ${typeof(this.apps[appName])}`)
        if(app == this.activeApp){
          this.goHome();
        }

        // remove info from apps
        this.removeChild(app)
        delete this.apps[appName]

        console.log(`apps:: ${this.apps}`)
        console.log(this.apps)
      }
  }

  switchWindow(appName){
      // check online
      if( typeof(this.apps[appName]) != "undefined" ){
        // active app
        if( this.activeApp != null ){
          this.activeApp.classList.remove('windows-active');
          this.activeApp.classList.add('hidden');
        }
        this.apps[appName].classList.add('windows-active');
        this.apps[appName].classList.remove('hidden');
        //todo
        this.windowHtml.classList.remove('hidden');
        this.body.classList.remove('task-manager-active')
        this.homeScreen.classList.add('hidden');

        this.activeApp = this.apps[appName];
      }
  }

  goBack(){
      if( this.activeApp != null ){
        let wm = this.activeApp.querySelector('web-view')
        wm.goBack()
      }
  }

  goHome(){
        for (var name in this.apps) {
          this.apps[name].classList.add('hidden')
          this.apps[name].classList.remove('windows-active')
        }
        this.windowHtml.classList.add('hidden');
        this.homeScreen.classList.remove('hidden')
        this.body.classList.remove('task-manager-active')
        this.body.classList.remove('windows-active')
  }


  goTask(){

    for (var name in this.apps) {
      this.apps[name].classList.remove('hidden')
    }
    this.homeScreen.classList.add('hidden')
    this.body.classList.add('windows-active')
    this.body.classList.add('task-manager-active')
  
    // todo

  }

  killall(){
  }

}

customElements.define("window-manager", WindowManager);
