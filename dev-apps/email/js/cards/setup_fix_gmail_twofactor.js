
define(['require','./base','template!./setup_fix_gmail_twofactor.html','./setup_fix_mixin'],function(require) {
  return [
    require('./base')(require('template!./setup_fix_gmail_twofactor.html')),
    require('./setup_fix_mixin')
  ];
});
