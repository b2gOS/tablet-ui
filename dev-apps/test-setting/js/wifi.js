var Wifi = {

    manager: null,
    ssidlist:null,
    
    init: function(){
        this.manager = navigator.b2g.wifiManager;
    },

    start: function(){
        document.getElementById("wifi-reflash").addEventListener("click",()=>{
            this.updateWIFIList();
            this.updateUI();
        });

        document.getElementById("wifi-on").addEventListener("click",()=>{
            this.enable();
            this.updateWIFIList();
            this.updateUI();
        });

        document.getElementById("wifi-off").addEventListener("click",()=>{
            this.disable();
            this.updateUI();
        });

    },

    updateWIFIList:function(){
        req = this.manager.getNetworks();
        req.onsuccess = () => {
          this.ssidlist = req.result;
        };
        req.onerror = event => {
        };
    },

    updateUI: function(){
        wifidiv = document.getElementById("wifi-list");
        wifistatus = document.getElementById("wifi-status-value");
        innerhtml = ``;
        if(this.ssidlist){
            this.ssidlist.forEach((list) => {
                innerhtml = innerhtml + `<div style="width: auto;">
                  <ul id="wifi_` + list.ssid + `" >
                    <li style="width: 80%;">` + list.ssid +`</li>
                    <li id="wifi_` + list.ssid + `_explan" status="hidden">
                      more..
                    </li>
                  </ul>
                  <div id="wifi_` + list.ssid + `_sub" class="hidden">
                    <h5> Security: ` + list.security +`</h5>
                    <h5> Connected: ` + list.connected +`</h5>
                    <input type="password" placeholder="password" value="" id="wifi_`+ list.ssid +`_password"></input>
                    <button id="wifi_`+ list.ssid + `_button">鏈接</button>
                  </div>
                </div>`
              });

              wifidiv.innerHTML = innerhtml;

              this.ssidlist.forEach((list) => {
                // 鏈接
                document.getElementById("wifi_" + list.ssid +"_button").addEventListener('click', () => {
                   passwd = document.getElementById("wifi_" + list.ssid +"_password").value;
                   this.associate(list.ssid, passwd);
                   this.updateWIFIList();
                   this.updateUI();
                })
                // more..
                document.getElementById("wifi_" + list.ssid +"_explan").addEventListener('click', () => {
                  if (document.getElementById("wifi_" + list.ssid +"_explan").getAttribute("status") == "hidden"){
                    document.getElementById("wifi_" + list.ssid +"_sub").classList.remove("hidden")
                    document.getElementById("wifi_" + list.ssid +"_explan").setAttribute("status","")
                  }else{
                    document.getElementById("wifi_" + list.ssid +"_sub").classList.add("hidden")
                    document.getElementById("wifi_" + list.ssid +"_explan").setAttribute("status","hidden")
                  }
                });
              });

        }
        
        wifistatus.innerHTML = this.manager.enabled;
        if(navigator.b2g.wifiManager.connection.network.ssid != null){
            wifistatus.innerHTML = navigator.b2g.wifiManager.connection.network.ssid //online ssid
        }

    },

    disable: function(){
        if (this.manager.enabled) {
            this.manager.setWifiEnabled(false);
            this.ssidlist = null;
        }
    },

    associate: function(ssid,password){    
    // ### Connect to WPA/WPA2-PSK network
        var net = {
            ssid: ssid,
            security: "WPA-EAP",
            psk: password,
        };
        console.log(ssid)
        console.log(password)

        this.manager.associate(new window.WifiNetwork(net));
    },

    forget: function(ssid,security){
        var net = {
            ssid: ssid,
            security: security, // "OPEN", "WPA-EAP", "WEP"
        };
        navigator.b2g.wifiManager.forget(new window.WifiNetwork(net));
    },

    enable: function(){
        if (!(this.manager.enabled)) {
            this.manager.setWifiEnabled(true);
        }
    }
}