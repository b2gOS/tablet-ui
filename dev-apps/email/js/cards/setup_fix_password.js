/**
 * Asks the user to re-enter their password for the account
 */

define(['require','./base','template!./setup_fix_password.html','./setup_fix_mixin'],function(require) {
  return [
    require('./base')(require('template!./setup_fix_password.html')),
    require('./setup_fix_mixin')
  ];
});
