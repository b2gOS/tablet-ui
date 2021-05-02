## Tablet-UI (The Tablet Project)

#### Building 

- Building `B2GOS` for your devices

  In order to boot `tablet-ui`, you need to modify or add the following codes in the `gecko-b2g` :

  ```javascript
  // in /b2g/app/b2g.js
  pref("b2g.neterror.url", "chrome://b2g/content/system/net_error.html");
  pref("b2g.system_startup_url", "chrome://b2g/content/system/index.html");
  ```

  For details on how to build B2G, you can check [this section](https://github.com/b2gOS/B2G#buiding-for-devices). 
  

- Building and pushing`tablet-ui` to your devices

  1. Install `python3`, `make` and `adb`  in your laptop

  2. Connect the `B2G` device

  3. Clone the `tablet-ui` codes and use command to build `tablet-ui` 

     ```shell
     # All webapps will be packaged and output to the `out` directory 
     make build
     # Push all application.zip under out directory to device
     make push-package
     # or only push just the application files
     make push
     ```
