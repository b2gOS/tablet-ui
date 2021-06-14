//KeyboardManager
var KeyboardManager = {
  keyboard: null,
  start: function() {
    // Bug 109000, we must set the openWindowInfo.
    document.getElementById("keyboard").openWindowInfo = null;
    window.addEventListener("inputmethod-contextchange", event => {
      let detail = event.detail;
      console.log(`Event 'inputmethod-contextchange' ${JSON.stringify(detail)}`);
      if (detail.isFocus === true) {
        document.getElementById("keyboard").classList.remove("offscreen");
      }
      if (detail.isFocus === false) {
        document.getElementById("keyboard").classList.add("offscreen");
      }
  });
  }
};
