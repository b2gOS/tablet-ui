ALL: clean build-webapps push-package

clean: 
	- ./build/build.py clean

build-webapps:
	- ./build/build.py build

push-package:
	- adb remount
	- adb root
	- adb shell rm -r  /data/local/webapps/ 
	- adb shell rm -r  /data/b2g/
	- adb shell rm -r /cache/cache2
	- adb shell rm -r  /system/b2g/webapps/ 
	- adb push out/webapps/ /system/b2g/ 
	- adb shell stop api-daemon && adb shell start api-daemon
	- adb shell stop b2g && adb shell start b2g

push:
	- adb remount
	- adb root
	- adb shell rm -r /cache/cache2
	- adb shell rm -r  /data/local/webapps/ 
	- adb shell rm -r  /data/b2g/
	- adb shell rm -r  /system/b2g/webapps/*
	- adb push apps/*  /system/b2g/webapps/
	- adb push out/webapps/webapps.json /system/b2g/webapps/
	- adb shell stop api-daemon && adb shell start api-daemon
	- adb shell stop b2g && adb shell start b2g