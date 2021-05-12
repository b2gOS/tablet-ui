ALL: build-clean build-webapps

build: build-clean build-webapps 

ifeq ($(findstring  attached , ${shell adb devices}), attached )
push-packages:  devices-remount devices-clean-b2g-data devices-clean-profiles adb-push-packages devices-reboot
else
push-packages: 
	@echo unknown which is your device!!!
endif

ifeq ($(findstring  attached , ${shell adb devices}), attached )
push: devices-remount devices-clean-b2g-data devices-clean-profiles adb-push devices-reboot
else
push: 
	@echo unknown which is your device!!!
endif

devices-remount:
	- adb root
	- adb remount

devices-clean-b2g-data:
	- adb shell rm -r  /data/b2g/
	- adb shell rm -r /cache/cache2/

devices-clean-profiles:
	- adb shell rm -r  /data/local/webapps/ 
	- adb shell rm -r  /system/b2g/webapps/ 

devices-reboot:
	- adb shell stop api-daemon
	- adb shell start api-daemon
	- adb shell stop b2g
	- adb shell start b2g

build-clean: 
	- ./build/build.py clean

build-webapps:
	- ./build/build.py build

adb-push-packages:
	- adb push out/webapps /system/b2g/ 

adb-push:
	- adb shell mkdir /system/b2g/webapps/
	- adb push apps/*  /system/b2g/webapps/
	- adb push out/webapps/webapps.json /system/b2g/webapps/
ifeq ($(DEVAPPS),1)
	- adb push dev-apps/*  /system/b2g/webapps/
endif
	@echo Done!

