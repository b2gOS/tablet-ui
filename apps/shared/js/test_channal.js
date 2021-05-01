broadcastChannel = new BroadcastChannel('tile1');
broadcastChannel.onmessage = function (ev) { console.log("###########testtile1###########"+ev);
HomeScreen.handleSearchClick();
}