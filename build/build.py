#!/usr/bin/python3
import os
import json
import sys

def getAppsList(path):
    list = []
    if (os.path.exists(path)):
        files = os.listdir(path)
        for file in files:
            m = os.path.join(path,file)
            if (os.path.isdir(m)):
                h = os.path.split(m)
                list.append(h[1])
    return list

def clean(rootPath):
    outAppsPath = os.path.join(rootPath, "out/webapps")
    if(os.path.exists(outAppsPath)):
        os.system("rm -r " + outAppsPath)
    os.makedirs(outAppsPath)

def package(sourcesPath,appsList,outPath):
    for appName in appsList:
        print("["+ appName + "]" + ": packing...")
        # webapps.josn
        appJson = {}
        appJson["name"] = appName
        appJson["manifest_url"] = "http://" + appName + ".localhost/manifest.webmanifest"
        appJson["manifest_hash"] = ""
        appJson["package_hash"] = ""
        appsJson.append(appJson)
        # application
        appSourcesPath = os.path.join(sourcesPath, appName)
        os.chdir(appSourcesPath)
        outAppPath = os.path.join(outPath,appName)
        os.mkdir(outAppPath)
        os.system("zip "+ outAppPath + "/application.zip" + " *")
        os.system("cp ./manifest.webmanifest " + outAppPath)
        os.chdir(sourcesPath)
        print("["+ appName + "]" + ": Done!")

def build(rootPath,isDevApps,outPath):
    appsSources = os.path.join(rootPath,"apps")
    if(isDevApps == "1"):
        appsSources = os.path.join(rootPath,"dev-apps")
    appsList = getAppsList(appsSources)
    package(appsSources,appsList,outPath)

def produce_webapps_json(outPath):
    webappsJson = open(os.path.join(outPath,'webapps.json'), 'w')
    webappsJson.write(json.dumps(appsJson))
    webappsJson.close()

# __main__
rootPath = os.getenv("PWD")
appsJson = []
outPath = os.path.join(rootPath, "out/webapps")

if(sys.argv[1] == "build"):
    clean(rootPath)
    build(rootPath,"0",outPath)
    if(os.getenv("DEVAPPS") == "1"):
        build(rootPath,"1",outPath)
    produce_webapps_json(outPath)
    print("Successfully!")

if(sys.argv[1] == "clean"):
    clean(rootPath)