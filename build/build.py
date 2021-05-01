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

def build(sourcesPath,appsList,outPath):
    appsJson = []
    for appName in appsList:
        print("["+ appName + "]" + ": packing...")
        # webapps.josn
        appJson = {}
        appJson["name"] = appName
        appJson["manifest_url"] = "http://" + appName + ".localhost:80/manifest.webmanifest"
        appJson["manifest_hash"] = ""
        appJson["package_hash"] = ""
        appsJson.append(appJson)
        # application
        appSourcesPath = os.path.join(sourcesPath, appName)
        os.chdir(appSourcesPath)
        outAppPath = os.path.join(outPath,appName)
        os.mkdir(outAppPath)
        # print("zip "+ outAppPath + "/application.zip" + " *")
        os.system("zip "+ outAppPath + "/application.zip" + " *")
        os.system("cp ./manifest.webmanifest " + outAppPath)
        # os.system("ls " + outAppPath)
        os.chdir(sourcesPath)
        print("["+ appName + "]" + ": Done!")
    webappsJson = open(os.path.join(outPath,'webapps.json'), 'w')
    webappsJson.write(json.dumps(appsJson))
    webappsJson.close()

rootPath = os.getenv("PWD")

if(sys.argv[1] == "build"):
    clean(rootPath)
    appsSources = os.path.join(rootPath,"apps")
    outPath = os.path.join(rootPath, "out/webapps")
    appsList = getAppsList(appsSources)
    build(appsSources,appsList,outPath)
    print("Successfully!")

if(sys.argv[1] == "clean"):
    clean(rootPath)