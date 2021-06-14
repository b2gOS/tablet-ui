/**
 * Handling hardware buttons
 **/

var HwButtons = {

  powerTimer: null,
  powerMenu: null,

  handleEvent: function(evt) {
    console.debug('!!! evt', evt, evt.type, evt.key, "prevented?", evt.defaultPrevented);
    var key = evt.key.toLowerCase();
    switch (key) {
      case 'power': {
        switch (evt.type) {
          case 'keydown':
          case 'mozbrowserafterkeydown':
          case 'mozbrowserbeforekeydown':
            this.powerTimer = new Date().getTime();
            this.timer = window.setTimeout(() =>
            {
              console.debug('Issuing shutdown sequence');
              this.powerMenu = document.querySelector('sleep-menu')
              this.powerMenu.classList.remove('hidden')
            },2000)
            break;

          case 'keyup':
          case 'mozbrowserafterkeyup':
          case 'mozbrowserbeforekeyup':
            var delta = new Date().getTime() - this.powerTimer;
            console.debug('delta', delta);

            // Pressing Power for more than 1500ms should power off device
            if (delta < 1500) {
              window.clearTimeout(this.timer)
              console.debug('Short pressing power, toggling screen');
              setTimeout(() => {
                console.debug('Issuing screen toggle');
                PowerManager.toggleScreen();
              });
            }

            this.powerTimer = null;
            break;
        }

        break;
      }

      case 'audiovolumeup':
        SoundManager.setVolumeUp();
        break;

      case 'audiovolumedown':
        SoundManager.setVolumeDown();
        break;

      default:
        console.debug('Unhandled key: ', key);
        break;
    }
  },

  start: function() {
    console.debug('Starting HwButtons ...');
    window.addEventListener('keyup', this);
    window.addEventListener('mozbrowserafterkeyup', this);
    window.addEventListener('keydown', this);
    window.addEventListener('mozbrowserbeforekeydown', this);
    return this;
  },

  stop: function() {
    window.removeEventListener('keyup', this);
    window.removeEventListener('keydown', this);
  }

};
