/**
 * HomeScreen.
 *
 * System UI element including search bar and home screen frame.
 */

var HomeScreen = {

  /**
   * Start the home screen.
   */
  start: function() {

    const homescreen =  document.getElementById("home-screen")
    homescreen.querySelector('web-view').openWindowInfo = null;
    return this;

  }

};
