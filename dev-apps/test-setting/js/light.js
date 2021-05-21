var Light = {
    powerService: null,
    
    init:function(){
        this.powerService = new PowerServiceManager();
        document.getElementById("display-light").oninput = (function handleInput(e) {
            value = document.getElementById("display-light").value
            this.changelight(value);

        }).bind(this);
    },

    changelight: function(ScreenBrightness){
        this.powerService.setScreenBrightness(ScreenBrightness);
    },
    updateUI:function(){

    }

}