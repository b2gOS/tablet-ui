class Toaster extends HTMLElement {
    constructor(){
        super()
        this.showStatus = false
    }

    connectedCallback() {

       this.innerHTML =  `<div id="notification-toaster">
                            <span class="icon">
                                <p>icon</p>
                            </span>
                            <span class="message">
                                <p>text</p>
                            </span>
                            </div>
                            <div id="calling-toaster">
                            <span class="icon">
                                <p>icon</p>
                            </span>
                            <span class="message">
                                <p>text</p>
                            </span>
                            </div>`
      this.classList.add('hidden')
      this.notification = document.getElementById('notification-toaster')
      this.calling =  document.getElementById('calling-toaster')
      this.show(null,"Start system")
    }

    // todo
    show(icon = null, message = "Null"){
        if(!this.showStatus){
            this.classList.remove('hidden')
        }else{
            window.clearTimeout(this.timer)
        }
        this.showStatus = true

        if(icon != null){
            // todo
            this.icon = this.notification.getElementsByClassName('icon')[0]
        }

        this.message = this.notification.getElementsByClassName('message')[0]
        this.message.innerHTML = `<p>${message}<\p>`


        this.timer = window.setTimeout(() =>
        {
            this.showStatus = false
            this.classList.add('hidden')
        },8000)
    }



}

customElements.define("toaster-bar", Toaster);