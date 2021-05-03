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
// TODO
  };

  const processSelector = {
// TODO
  };

  const imeHandler = {
    focusChanged(detail) {
      window.dispatchEvent(
        new CustomEvent("inputmethod-contextchange", { detail })
      );
    },
  };

  const embedder = new WebEmbedder({
    // windowProvider,
    // processSelector,
    imeHandler,
  });
  embedder.addEventListener("runtime-ready", e => {
    log(`Embedder event: ${e.type}`);
    // embedder.launchPreallocatedProcess();
  });

  exports.embedder = embedder;

  // Hacks.
  const { Services } = ChromeUtils.import(
    "resource://gre/modules/Services.jsm"
  );
  // Force a Mobile User Agent string.
//   TODO
    Services.prefs.setCharPref(
      "general.useragent.override",
      "Mozilla/5.0 (Mobile; rv:90.0) Gecko/90.0 Firefox/90.0 B2GOS/3.0"
    );
})(window);
