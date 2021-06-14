class VolumeBar extends HTMLElement {
    constructor(){
        super()
        this.showStatus = false
    }

    connectedCallback() {


       this.innerHTML =  `<div id="volume" class="">
        <style scoped="">
          @import url("style/sound_manager/sound_manager.css");
        </style>
        <div id="type">
            <span class="channel-type">type</span>
        </div>
        <div id="value">
        </div>
      </div>`
      this.classList.add('hidden')
    //   this.volumebar = document.querySelector('volume-bar')
    }

    // todo
    show(){
        if(!this.showStatus){
            this.classList.remove('hidden')
        }else{
            window.clearTimeout(this.timer)
        }
        
        this.showStatus = true
        this.timer = window.setTimeout(() =>
        {
            this.showStatus = false
            this.classList.add('hidden')
        },3000)
    }



}

customElements.define("volume-bar", VolumeBar);