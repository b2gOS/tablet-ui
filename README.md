## Tablet-UI

#### A HTML5-based UI for the Boot to Gecko(B2G)  

`Tablet-UI` is mainly UI part of  `Tablet Project`, which is aims to a explore a simple, single-purpose tablet, completely dedicated to browsing the web made by Ben Francis. 

You can read more about `Tablet Project` here:

- https://wiki.mozilla.org/Connected_Devices/Projects/Project_Tablet
- https://github.com/mozilla-b2g/gecko-tablet

And you can read more about `B2G` here:

- http://wiki.mozilla.org/B2G

- https://developer.mozilla.org/en-US/docs/Mozilla/B2G_OS

- https://github.com/b2gOS/B2G

or talk to us on Matrix:

- https://chat.mozilla.org/#/room/#b2g:mozilla.org

  

#### Building for devices

##### Step 1: Building `B2GOS` for your devices

​	For details on how to build B2G, you can check [this section](https://github.com/b2gOS/B2G#buiding-for-devices).

###### Step 2: Building and pushing Tablet-UI to your devices

1. Install `python3`, `make` and `adb`  in your laptop

2. Connect the `B2G` device

3. Clone the `tablet-ui` codes and use command to build it:

   ```shell
   # All webapps will be packaged and output to the `out` directory 
   make build

   # Other command
   # Push all application.zip under out directory to device
   make push-package
   # Only push just the applications files to device
   make push
   # Build with dev-apps
   make DEVAPPS=1
   ```

