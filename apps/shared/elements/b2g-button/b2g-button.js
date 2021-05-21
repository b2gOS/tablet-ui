/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// <b2g-button> custom element.

class Button extends HTMLElement  {
    constructor() {
      super();
      console.log("B2G JS Element:<b2g-button>");

    }

    connectedCallback() {
        // FIXME: We can't use the shadow DOM here because that makes loading <web-view> fail.
        // let shadow = this.attachShadow({ mode: "open" });
    
        let container = document.createElement("button");

        this.innerHTML = `<link rel="stylesheet" href="http://shared.localhost/elements/b2g-button/b2g-button.css">`;
    
          if(this.hasAttribute('button-text')) {
            this.button_text = this.getAttribute('button-text');
            container.innerHTML = this.button_text;
          } 
    
          if(this.hasAttribute('button-id')) {
            this.button_id = this.getAttribute('button-id');
            container.setAttribute('id',this.button_id);
          }
    
          this.appendChild(container);  
      }
    

  }
  
  customElements.define("b2g-button", Button);