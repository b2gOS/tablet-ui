/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* eslint-disable quotes */
/* global WebEmbedder */
"use strict";

(function(exports) {
  const kPreallocLaunchDelay = 5000; // ms of wait time before launching a new preallocated process.

  function log(msg) {
    console.log(`Embedding: ${msg}`);
  }

  const windowProvider = {
    openURI(aURI, aOpener, aWhere, aFlags, aTriggeringPrincipal, aCsp) {
      log(`browserWindow::openURI ${aURI}`);
      throw Error("NOT IMPLEMENTED");
    },

    createContentWindow(
      aURI,
      aOpener,
      aWhere,
      aFlags,
      aTriggeringPrincipal,
      aCsp
    ) {
      log(`browserWindow::createContentWindow ${aURI}`);
      // throw Error("NOT IMPLEMENTED");

      let wm = document.getElementById('windowmanager')
      return wm.openWindow(hex_md5(aURI), aURI)

    },

    openURIInFrame(aURI, aParams, aWhere, aFlags, aName) {
      // We currently ignore aNextRemoteTabId on mobile.  This needs to change
      // when Fennec starts to support e10s.  Assertions will fire if this code
      // isn't fixed by then.
      //
      // We also ignore aName if it is set, as it is currently only used on the
      // e10s codepath.
      log(
        `browserWindow::openURIInFrame################# ${aURI} ${aParams} ${aWhere} ${aFlags} ${aName}`
      );

      // Need to return the new WebView here.
      return this.createContentWindowInFrame(
        aURI,
        aParams,
        aWhere,
        aFlags,
        aName
      );
    },

    // Open a new tab in all cases.
    createContentWindowInFrame(aURI, aParams, aWhere, aFlags, aName) {
      log(`browserWindow::createContentWindowInFrame ${aURI} ${aParams}`);

      let wm = document.getElementById('windowmanager')
      return wm.openWindow(hex_md5(aURI), aURI)
    },

    isTabContentWindow(aWindow) {
      log(`browserWindow::isTabContentWindow`);
      return false;
    },

    canClose() {
      log(`browserWindow::canClose`);
      return true;
    },
  };

  const processSelector = {
    NEW_PROCESS: -1,

    provideProcess(aType, aProcesses, aMaxCount) {
      log(
        `provideProcess ${aType} ${JSON.stringify(
          aProcesses
        )} (max=${aMaxCount})`
      );

      // If we find an existing process with no tab, use it.
      for (let i = 0; i < aProcesses.length; i++) {
        if (aProcesses[i].tabCount == 0) {
          log(`Re-using process #${i}`);
          // If we re-use a preallocated process, spawn a new one.
          window.setTimeout(() => {
            embedder.launchPreallocatedProcess();
          }, kPreallocLaunchDelay);
          return i;
        }
      }

      // Fallback to creating a new process.
      log(`No reusable process found, will create a new one.`);
      return processSelector.NEW_PROCESS;
    },
  };

  const imeHandler = {
    focusChanged(detail) {
      window.dispatchEvent(
        new CustomEvent("inputmethod-contextchange", { detail })
      );
    },
  };

  const embedder = new WebEmbedder({
    windowProvider,
    processSelector,
    imeHandler,
  });
  embedder.addEventListener("runtime-ready", e => {
    log(`Embedder event: ${e.type}`);
    embedder.launchPreallocatedProcess();
  });

  exports.embedder = embedder;

  // Hacks.
  const { Services } = ChromeUtils.import(
    "resource://gre/modules/Services.jsm"
  );
  // Force a Mobile User Agent string.
  Services.prefs.setCharPref(
    "general.useragent.override",
    "Mozilla/5.0 (Mobile; rv:90.0) Gecko/20100101 Firefox/90.0 B2GOS/3.0"
  );
})(window);