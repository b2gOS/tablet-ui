
class AppContain extends HTMLElement {
    constructor(){
        super()

        this.wm = document.querySelector("window-manager")
    }

    connectedCallback() {
        // FIXME: We can't use the shadow DOM here because that makes loading <web-view> fail.
        // let shadow = this.attachShadow({ mode: "open" });
    
        const id = this.getAttribute('process-id')
        const appURL = this.getAttribute('appurl')

        this.innerHTML =
        `<menu type="toolbar" class="browser-chrome">
        <form id="url-bar-form-${id}" novalidate="novalidate">
        <input type="url" id="url-bar-${id}" type="text"></input>
        </form>
        <button id="browser-go-${id}" class="menu-button">
        <button id="close-button-${id}" class="close-button">
        </menu>
        <web-view id="window-frame-${id}" src=${appURL}
        mozpasspointerevents="true"  remote="true">
        </web-view>
        <div id="window-scrim-${id}" class="window-scrim">
        <p>Window Scrim</p>
        </div>`;
        
        // Bug 109000, we must set the openWindowInfo.
        const web_view = document.getElementById(`window-frame-${id}`);
        web_view.openWindowInfo = null;


        window.addEventListener("inputmethod-contextchange", event => {
            let detail = event.detail;
            if (detail.isFocus === true) {
              web_view.classList.add("AppsInputMode");
            }
            if (detail.isFocus === false) {
              web_view.classList.remove("AppsInputMode");
            }
        });

        document.getElementById(`close-button-${id}`).addEventListener("click", () => {
          this.wm.closeWindow(id)
        })

        document.getElementById(`window-scrim-${id}`).addEventListener("click", () => {
          this.wm.openWindow(id, appURL)
        })

        document.getElementById(`browser-go-${id}`).addEventListener("click", () => {
          let url = document.getElementById(`url-bar-${id}`).value
          this.wm.openWindow(url, url)
          // document.getElementById(`window-frame-${id}`).src = url

        })

        document.getElementById(`window-frame-${id}`).addEventListener("loadstart", () => {
          console.log("Browser:: Page loading...")
        })

        document.getElementById(`window-frame-${id}`).addEventListener("loadend", () => {
          console.log("Browser:: Page loadend ...")
        })
        document.getElementById(`window-frame-${id}`).addEventListener("error ", () => {
          console.log("Browser:: Page error ...")
        })
        document.getElementById(`window-frame-${id}`).addEventListener("close ", () => {
          console.log("Browser:: Page close ...")
        })


      }
}

customElements.define("app-contain", AppContain);
