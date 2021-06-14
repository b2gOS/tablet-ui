/**
 * SystemToolbar.
 *
 * UI element containing the back button, home button and tabs button.
 */

class SystemToolbar extends HTMLElement {
  constructor(){
    super()

    this.wm = document.querySelector("window-manager")
  }

  connectedCallback() {
    this.contianer = document.createElement("menu")
    this.contianer.setAttribute("type", "toolbar")
    this.contianer.setAttribute("id", "system-toolbar")
    this.goBackButton = document.createElement("button")
    this.goBackButton.setAttribute("id", "back-button")
    this.goHomeButton = document.createElement("button")
    this.goHomeButton.setAttribute("id", "home-button")
    this.windowButton = document.createElement("button")
    this.windowButton.setAttribute("id", "windows-button")
    this.contianer.appendChild(this.goBackButton)
    this.contianer.appendChild(this.goHomeButton)
    this.contianer.appendChild(this.windowButton)
    
    this.appendChild(this.contianer)

    this.goBackButton.addEventListener("click", () => {
      this.goBack()
    })
    this.goHomeButton.addEventListener("click", () => {
      this.goHome()
    })
    this.windowButton.addEventListener('click', () => {
      this.goTask()
    })

  }

  goBack(){
    this.wm.goBack();
  }

  goHome(){
    this.wm.goHome();
  }

  goTask(){
    this.wm.goTask()
  }

}

customElements.define("software-buttons", SystemToolbar);