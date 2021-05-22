/**
 * Setup is done; add another account?
 */

define(['require','evt','./base','template!./setup_done.html'],function(require) {

var evt = require('evt');

return [
  require('./base')(require('template!./setup_done.html')),
  {
    onAddAnother: function() {
      evt.emit('addAccount');
    },
    onShowMail: function() {
      // Nuke this card
      evt.emit('showLatestAccount');
    },

    die: function() {
    }
  }
];

});
