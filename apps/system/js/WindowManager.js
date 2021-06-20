/**
 * Window Manager.
 *
 * Manages windows.
 */

class WindowManager extends HTMLElement {
  constructor(){
      super();
      this.apps = {}; //is a json {apps.{appname.{dom}}} 
      this.activeApp = null;
  }

  connectedCallback() {
    //todo
    this.element = document.getElementById('windows')
    this.homeScreen = document.getElementById('home-screen')

    //keyborad bug
    // this.openWindow("keyborad", "NUK")

  }

  openWindow(appName, appUrl){
      // check app if outline 
      if( typeof(this.apps[appName]) == "undefined" ){
        console.log(`openWindow:: ${typeof(this.apps[appName])}`)
        
        const isAppURL = UrlHelper.isLoaclApp(appUrl); 
        const appWindow = document.createElement("sub-app");
        appWindow.setAttribute("process-id",appName)
        appWindow.setAttribute("appurl",appUrl)
        appWindow.setAttribute("islocalapp",isAppURL)
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
        this.element.classList.remove('hidden');
        this.homeScreen.classList.add('hidden');

        this.activeApp = this.apps[appName];
      }
  }

  goBack(){
      // check app online and is active one
      // check can go back
      // this.apps.(this.activeapp).go_back();
  }

  goHome(){
      if( this.activeApp != null ){
        this.activeApp.classList.remove('windows-active');
        this.activeApp.classList.add('hidden');
        this.activeApp = null;
        this.element.classList.add('hidden');
        this.homeScreen.classList.remove('hidden');
      }
  }

  killall(){
  }

}

customElements.define("window-manager", WindowManager);




// var WindowManager = {

//   /**
//    * The collection of App Windows.
//    */
//   windows: [],

//   /**
//    * The number of windows opened in this session.
//    */
//   windowCount: 0,

//   /**
//    * The ID of the currently displayed window.
//    */
//   currentWindow: null,

//   /**
//    * Task manager mode.
//    */
//   taskManagerMode: false,

//   /**
//    * Start the Window Manager.
//    *
//    * @return {Object} The WindowManager object.
//    */
//   start: function() {
//     this.container = document.getElementById('system');
//     this.element = document.getElementById('windows');
//     this.homeScreen = document.getElementById('home-screen');
    
//     window.addEventListener('_openwindow',
//       this.handleOpenWindow.bind(this));
//     window.addEventListener('_closewindow',
//       this.handleCloseWindow.bind(this));
//     window.addEventListener('_homeclicked',
//       this.handleHome.bind(this));
//     window.addEventListener('_backclicked',
//       this.handleBack.bind(this));
//     window.addEventListener('_windowsclicked',
//       this.handleWindows.bind(this));
//     return this;
//   },

//   /**
//    * Handle _openwindow event.
//    *
//    * @param {Event} e _openwindow event.
//    */
//   handleOpenWindow: function(e) {
//     if (e.detail && e.detail.id != null) {
//       this.switchWindow(e.detail.id);
//     } else if (e.detail && e.detail.url) {
//       this.createWindow(e.detail.url);
//     } else {
//       this.createWindow();
//     }
//     this.showWindows();
//     this.hideTaskManager();
//   },
  
//   /**
//    * Handle _closewindow event.
//    *
//    * @param {Event} e _closewindow event.
//    */
//   handleCloseWindow: function(e) {
//     if (!e.detail || e.detail.id === undefined) {
//       return;
//     }
//     this.windows[e.detail.id].destroy();
//     delete this.windows[e.detail.id];
//     this.currentWindow = null;
//     var windowIds = Object.keys(this.windows);
//     if (windowIds.length > 0) {
//       this.switchWindow(windowIds[windowIds.length-1]);
//     } else {
//       this.hideTaskManager();
//       this.hideWindows();
//       this.element.classList.add('no-windows');
//     }
//   },

//   /**
//    * Handle _homeclicked event.
//    *
//    */
//   handleHome: function() {
//     if (this.taskManagerMode) {
//       this.hideTaskManager();
//     }
//     this.hideWindows();
//   },

//   /**
//    * Handle _backclicked event.
//    */
//   handleBack: function() {
//     if (this.windows[this.currentWindow]) {
//       this.windows[this.currentWindow].goBack();
//     }
//   },

//   /**
//    * Handle _windowsclicked event.
//    */
//   handleWindows: function() {
//       this.showTaskManager();
//   },

//   /**
//    * Create a new window.
//    *
//    * @param {String} url URL to create window at.
//    */
//   createWindow: function(url) {
//     var id = this.windowCount;
//     var newWindow = new BrowserWindow(id, url);
//     this.windows[id] = newWindow;
//     this.element.classList.remove('no-windows');
//     this.switchWindow(id);
//     this.windowCount++;
//   },

//   /**
//    * Switch to a window.
//    *
//    * @param {Integer} id The ID of the BrowserWindow to switch to.
//    */
//   switchWindow: function(id) {
//     if (this.currentWindow != null) {
//       this.windows[this.currentWindow].hide();
//     }
//     this.currentWindow = id;
//     this.windows[id].show();
//   },
  
//   /**
//    * Show windows.
//    */
//   showWindows: function() {
//     this.container.classList.add('windows-active');
//     this.element.classList.remove('hidden');
//     this.homeScreen.classList.add('hidden');
//   },

//   /**
//    * Hide windows.
//    */
//   hideWindows: function() {
//     this.container.classList.remove('windows-active');
//     this.element.classList.add('hidden');
//     this.homeScreen.classList.remove('hidden');
//   },

//   showTaskManager: function() {
//     this.taskManagerMode = true;
//     this.showWindows();
//     this.container.classList.add('task-manager-active');
//     window.dispatchEvent(new CustomEvent('_taskmanageropened'));
//   },
  
//   hideTaskManager: function() {
//     this.taskManagerMode = false;
//     this.container.classList.remove('task-manager-active');
//     window.dispatchEvent(new CustomEvent('_taskmanagerclosed'));
//   }
// };
