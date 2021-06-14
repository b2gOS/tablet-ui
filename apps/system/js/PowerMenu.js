var PowerMenu = {
    start: function(){
        document.getElementById('sleep_menu_close_button').addEventListener("click",() =>{
            document.querySelector('sleep-menu').classList.add('hidden')
        })

        document.getElementById('menu_poweroff').addEventListener("click",() =>{
            PowerManager.powerOff()
        })

        document.getElementById('menu_reboot').addEventListener("click",() =>{
            PowerManager.reboot()
        })
    }

}