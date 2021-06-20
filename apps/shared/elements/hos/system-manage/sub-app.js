// HOS
// <sub-app> element
// show in the top of each web site
// 2021 shenzhen ittat

class SubApp extends HTMLElement {
    constructor(){
        super();
    }

    connectedCallback() {
        // FIXME: We can't use the shadow DOM here because that makes loading <web-view> fail.
        // let shadow = this.attachShadow({ mode: "open" });
    
        const id = this.getAttribute('process-id');
        const appURL = this.getAttribute('appurl');

        this.innerHTML =
        `<menu type="toolbar" class="browser-chrome">
        <form id="url-bar-form-${id}" novalidate="novalidate">
        <input type="url" id="url-bar-${id}" type="text"></input>
        </form>
        <button class="menu-button">
        <button id="close-button-${id}" class="close-button">
        </menu>
        <web-view id="window-frame-${id}" src=${appURL}
        mozpasspointerevents="true"  remote="true">
        </web-view>
        <div id="window-scrim-${id}" class="window-scrim"></div>`;
        
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

      }
}

customElements.define("sub-app", SubApp);
