// HOS
// <system-status> element
// show in the top of each web site
// 2021 shenzhen ittat

class StatusBar extends HTMLElement {
    constructor(){
        super();
    }

    connectedCallback() {
        // FIXME: We can't use the shadow DOM here because that makes loading <web-view> fail.
        // let shadow = this.attachShadow({ mode: "open" });
        this.innerHTML =
        `<menu type="toolbar" id="status-bar">
        <span id="clock"></span>
        <div id="battery" data-charging-status="false" data-battery-level="0">
          <div id="battery-charging-indicator"></div>
        </div>
        <span id="battery-level">0%</span>
        <span id="notification"></span>
        </menu>`;

        this.init();

      }

      init(){
        // Get DOM elements
        this.element = document.getElementById('status-bar');
        this.battery = document.getElementById('battery');
        this.clock = document.getElementById('clock');
        this.battery_level = document.getElementById('battery-level');
        this.notification = document.getElementById('notification');

        // Set the clock going
        this.updateClock(true);
        window.setInterval(this.updateClock.bind(this, false), 1000);

        window.addEventListener('_batterychange', this.updateBatteryStatus.bind(this));

      }


      
  /**
   * Update Clock.
   */
   updateClock(initial) {
    var date = new Date(),
        hours = date.getHours() + '', // get hours as string
        minutes = date.getMinutes() + '', // get minutes as string
        seconds = date.getSeconds();

    // pad with zero if needed
    if (hours.length < 2) {
      hours = '0' + hours;
    }
    if (minutes.length < 2) {
      minutes = '0' + minutes;
    }

    // Only update display when it should change
    if (initial || seconds === 0) {
      this.clock.textContent = hours + ':' + minutes;
    }
  }


  updateBatteryStatus(evt) {
    console.debug('Received _batterychange event:', evt, JSON.stringify(evt.detail));

    this.battery.setAttribute('data-charging-status', evt.detail.charging);

    let lvl = Math.floor(evt.detail.level * 10);
    this.battery.setAttribute('data-charging-level', lvl);
    this.battery_level.textContent = evt.detail.level*100 + '%' ;
  }

}

customElements.define("system-status", StatusBar);
