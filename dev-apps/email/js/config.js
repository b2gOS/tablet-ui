
/**
 * alameda 0.2.0-native-promise Copyright (c) 2011-2014, The Dojo Foundation All Rights Reserved.
 * Available via the MIT or new BSD license.
 * see: http://github.com/requirejs/alameda for details
 */
//Going sloppy to avoid 'use strict' string cost, but strict practices should
//be followed.
/*jslint sloppy: true, nomen: true, regexp: true */
/*global document, navigator, importScripts, Promise, setTimeout */

var requirejs, require, define;
(function (global, undef) {
    var topReq, dataMain, src, subPath,
        bootstrapConfig = requirejs || require,
        hasOwn = Object.prototype.hasOwnProperty,
        contexts = {},
        queue = [],
        currDirRegExp = /^\.\//,
        urlRegExp = /^\/|\:|\?|\.js$/,
        commentRegExp = /(\/\*([\s\S]*?)\*\/|([^:]|^)\/\/(.*)$)/mg,
        cjsRequireRegExp = /[^.]\s*require\s*\(\s*["']([^'"\s]+)["']\s*\)/g,
        jsSuffixRegExp = /\.js$/;

    if (typeof requirejs === 'function') {
        return;
    }

    function hasProp(obj, prop) {
        return hasOwn.call(obj, prop);
    }

    function getOwn(obj, prop) {
        return obj && hasProp(obj, prop) && obj[prop];
    }

    /**
     * Cycles over properties in an object and calls a function for each
     * property value. If the function returns a truthy value, then the
     * iteration is stopped.
     */
    function eachProp(obj, func) {
        var prop;
        for (prop in obj) {
            if (hasProp(obj, prop)) {
                if (func(obj[prop], prop)) {
                    break;
                }
            }
        }
    }

    /**
     * Simple function to mix in properties from source into target,
     * but only if target does not already have a property of the same name.
     */
    function mixin(target, source, force, deepStringMixin) {
        if (source) {
            eachProp(source, function (value, prop) {
                if (force || !hasProp(target, prop)) {
                    if (deepStringMixin && typeof value === 'object' && value &&
                        !Array.isArray(value) && typeof value !== 'function' &&
                        !(value instanceof RegExp)) {

                        if (!target[prop]) {
                            target[prop] = {};
                        }
                        mixin(target[prop], value, force, deepStringMixin);
                    } else {
                        target[prop] = value;
                    }
                }
            });
        }
        return target;
    }

    //Allow getting a global that expressed in
    //dot notation, like 'a.b.c'.
    function getGlobal(value) {
        if (!value) {
            return value;
        }
        var g = global;
        value.split('.').forEach(function (part) {
            g = g[part];
        });
        return g;
    }

    function newContext(contextName) {
        var req, main, makeMap, callDep, handlers, checkingLater, load, context,
            defined = {},
            waiting = {},
            config = {
                //Defaults. Do not set a default for map
                //config to speed up normalize(), which
                //will run faster if there is no default.
                waitSeconds: 7,
                baseUrl: './',
                paths: {},
                bundles: {},
                pkgs: {},
                shim: {},
                config: {}
            },
            mapCache = {},
            requireDeferreds = [],
            deferreds = {},
            calledDefine = {},
            calledPlugin = {},
            loadCount = 0,
            startTime = (new Date()).getTime(),
            errCount = 0,
            trackedErrors = {},
            urlFetched = {},
            bundlesMap = {};

        //Uses a resolved promise to get an async resolution, but
        //using the microtask queue inside a promise, instead of
        //a setTimeout, so that other things in the main event
        //loop do not hold up the processing.
        var nextMicroTaskPass;
        (function () {
            

            var waitingResolving,
                waiting = [];

            function callWaiting() {
                waitingResolving = null;
                var w = waiting;
                waiting = [];
                while (w.length) {
                    w.shift()();
                }
            }

            nextMicroTaskPass = function (fn) {
                waiting.push(fn);
                if (!waitingResolving) {
                    waitingResolving = new Promise(function (resolve, reject) {
                        resolve();
                    }).then(callWaiting).catch(delayedError);
                }
            };
        }());

        /**
         * Trims the . and .. from an array of path segments.
         * It will keep a leading path segment if a .. will become
         * the first path segment, to help with module name lookups,
         * which act like paths, but can be remapped. But the end result,
         * all paths that use this function should look normalized.
         * NOTE: this method MODIFIES the input array.
         * @param {Array} ary the array of path segments.
         */
        function trimDots(ary) {
            var i, part, length = ary.length;
            for (i = 0; i < length; i++) {
                part = ary[i];
                if (part === '.') {
                    ary.splice(i, 1);
                    i -= 1;
                } else if (part === '..') {
                    if (i === 1 && (ary[2] === '..' || ary[0] === '..')) {
                        //End of the line. Keep at least one non-dot
                        //path segment at the front so it can be mapped
                        //correctly to disk. Otherwise, there is likely
                        //no path mapping for a path starting with '..'.
                        //This can still fail, but catches the most reasonable
                        //uses of ..
                        break;
                    } else if (i > 0) {
                        ary.splice(i - 1, 2);
                        i -= 2;
                    }
                }
            }
        }

        /**
         * Given a relative module name, like ./something, normalize it to
         * a real name that can be mapped to a path.
         * @param {String} name the relative name
         * @param {String} baseName a real name that the name arg is relative
         * to.
         * @param {Boolean} applyMap apply the map config to the value. Should
         * only be done if this normalization is for a dependency ID.
         * @returns {String} normalized name
         */
        function normalize(name, baseName, applyMap) {
            var pkgMain, mapValue, nameParts, i, j, nameSegment, lastIndex,
                foundMap, foundI, foundStarMap, starI,
                baseParts = baseName && baseName.split('/'),
                normalizedBaseParts = baseParts,
                map = config.map,
                starMap = map && map['*'];

            //Adjust any relative paths.
            if (name && name.charAt(0) === '.') {
                //If have a base name, try to normalize against it,
                //otherwise, assume it is a top-level require that will
                //be relative to baseUrl in the end.
                if (baseName) {
                    //Convert baseName to array, and lop off the last part,
                    //so that . matches that 'directory' and not name of the baseName's
                    //module. For instance, baseName of 'one/two/three', maps to
                    //'one/two/three.js', but we want the directory, 'one/two' for
                    //this normalization.
                    normalizedBaseParts = baseParts.slice(0, baseParts.length - 1);
                    name = name.split('/');
                    lastIndex = name.length - 1;

                    // If wanting node ID compatibility, strip .js from end
                    // of IDs. Have to do this here, and not in nameToUrl
                    // because node allows either .js or non .js to map
                    // to same file.
                    if (config.nodeIdCompat && jsSuffixRegExp.test(name[lastIndex])) {
                        name[lastIndex] = name[lastIndex].replace(jsSuffixRegExp, '');
                    }

                    name = normalizedBaseParts.concat(name);
                    trimDots(name);
                    name = name.join('/');
                } else if (name.indexOf('./') === 0) {
                    // No baseName, so this is ID is resolved relative
                    // to baseUrl, pull off the leading dot.
                    name = name.substring(2);
                }
            }

            //Apply map config if available.
            if (applyMap && map && (baseParts || starMap)) {
                nameParts = name.split('/');

                outerLoop: for (i = nameParts.length; i > 0; i -= 1) {
                    nameSegment = nameParts.slice(0, i).join('/');

                    if (baseParts) {
                        //Find the longest baseName segment match in the config.
                        //So, do joins on the biggest to smallest lengths of baseParts.
                        for (j = baseParts.length; j > 0; j -= 1) {
                            mapValue = getOwn(map, baseParts.slice(0, j).join('/'));

                            //baseName segment has config, find if it has one for
                            //this name.
                            if (mapValue) {
                                mapValue = getOwn(mapValue, nameSegment);
                                if (mapValue) {
                                    //Match, update name to the new value.
                                    foundMap = mapValue;
                                    foundI = i;
                                    break outerLoop;
                                }
                            }
                        }
                    }

                    //Check for a star map match, but just hold on to it,
                    //if there is a shorter segment match later in a matching
                    //config, then favor over this star map.
                    if (!foundStarMap && starMap && getOwn(starMap, nameSegment)) {
                        foundStarMap = getOwn(starMap, nameSegment);
                        starI = i;
                    }
                }

                if (!foundMap && foundStarMap) {
                    foundMap = foundStarMap;
                    foundI = starI;
                }

                if (foundMap) {
                    nameParts.splice(0, foundI, foundMap);
                    name = nameParts.join('/');
                }
            }

            // If the name points to a package's name, use
            // the package main instead.
            pkgMain = getOwn(config.pkgs, name);

            return pkgMain ? pkgMain : name;
        }

        function makeShimExports(value) {
            function fn() {
                var ret;
                if (value.init) {
                    ret = value.init.apply(global, arguments);
                }
                return ret || (value.exports && getGlobal(value.exports));
            }
            return fn;
        }

        function takeQueue(anonId) {
            var i, id, args, shim;
            for (i = 0; i < queue.length; i += 1) {
                //Peek to see if anon
                if (typeof queue[i][0] !== 'string') {
                    if (anonId) {
                        queue[i].unshift(anonId);
                        anonId = undef;
                    } else {
                        //Not our anon module, stop.
                        break;
                    }
                }
                args = queue.shift();
                id = args[0];
                i -= 1;

                if (!hasProp(defined, id) && !hasProp(waiting, id)) {
                    if (hasProp(deferreds, id)) {
                        main.apply(undef, args);
                    } else {
                        waiting[id] = args;
                    }
                }
            }

            //if get to the end and still have anonId, then could be
            //a shimmed dependency.
            if (anonId) {
                shim = getOwn(config.shim, anonId) || {};
                main(anonId, shim.deps || [], shim.exportsFn);
            }
        }

        function makeRequire(relName, topLevel) {
            var req = function (deps, callback, errback, alt) {
                var name, cfg;

                if (topLevel) {
                    takeQueue();
                }

                if (typeof deps === "string") {
                    if (handlers[deps]) {
                        return handlers[deps](relName);
                    }
                    //Just return the module wanted. In this scenario, the
                    //deps arg is the module name, and second arg (if passed)
                    //is just the relName.
                    //Normalize module name, if it contains . or ..
                    name = makeMap(deps, relName, true).id;
                    if (!hasProp(defined, name)) {
                        throw new Error('Not loaded: ' + name);
                    }
                    return defined[name];
                } else if (deps && !Array.isArray(deps)) {
                    //deps is a config object, not an array.
                    cfg = deps;
                    deps = undef;

                    if (Array.isArray(callback)) {
                        //callback is an array, which means it is a dependency list.
                        //Adjust args if there are dependencies
                        deps = callback;
                        callback = errback;
                        errback = alt;
                    }

                    if (topLevel) {
                        //Could be a new context, so call returned require
                        return req.config(cfg)(deps, callback, errback);
                    }
                }

                //Support require(['a'])
                callback = callback || function () {};

                //Complete async to maintain expected execution semantics.
                nextMicroTaskPass(function () {
                    //Grab any modules that were defined after a
                    //require call.
                    takeQueue();
                    main(undef, deps || [], callback, errback, relName);
                });

                return req;
            };

            req.isBrowser = typeof document !== 'undefined' &&
                typeof navigator !== 'undefined';

            req.nameToUrl = function (moduleName, ext, skipExt) {
                var paths, syms, i, parentModule, url,
                    parentPath, bundleId,
                    pkgMain = getOwn(config.pkgs, moduleName);

                if (pkgMain) {
                    moduleName = pkgMain;
                }

                bundleId = getOwn(bundlesMap, moduleName);

                if (bundleId) {
                    return req.nameToUrl(bundleId, ext, skipExt);
                }

                //If a colon is in the URL, it indicates a protocol is used and it is just
                //an URL to a file, or if it starts with a slash, contains a query arg (i.e. ?)
                //or ends with .js, then assume the user meant to use an url and not a module id.
                //The slash is important for protocol-less URLs as well as full paths.
                if (urlRegExp.test(moduleName)) {
                    //Just a plain path, not module name lookup, so just return it.
                    //Add extension if it is included. This is a bit wonky, only non-.js things pass
                    //an extension, this method probably needs to be reworked.
                    url = moduleName + (ext || '');
                } else {
                    //A module that needs to be converted to a path.
                    paths = config.paths;

                    syms = moduleName.split('/');
                    //For each module name segment, see if there is a path
                    //registered for it. Start with most specific name
                    //and work up from it.
                    for (i = syms.length; i > 0; i -= 1) {
                        parentModule = syms.slice(0, i).join('/');

                        parentPath = getOwn(paths, parentModule);
                        if (parentPath) {
                            //If an array, it means there are a few choices,
                            //Choose the one that is desired
                            if (Array.isArray(parentPath)) {
                                parentPath = parentPath[0];
                            }
                            syms.splice(0, i, parentPath);
                            break;
                        }
                    }

                    //Join the path parts together, then figure out if baseUrl is needed.
                    url = syms.join('/');
                    url += (ext || (/^data\:|\?/.test(url) || skipExt ? '' : '.js'));
                    url = (url.charAt(0) === '/' || url.match(/^[\w\+\.\-]+:/) ? '' : config.baseUrl) + url;
                }

                return config.urlArgs ? url +
                                        ((url.indexOf('?') === -1 ? '?' : '&') +
                                         config.urlArgs) : url;
            };

            /**
             * Converts a module name + .extension into an URL path.
             * *Requires* the use of a module name. It does not support using
             * plain URLs like nameToUrl.
             */
            req.toUrl = function (moduleNamePlusExt) {
                var ext,
                    index = moduleNamePlusExt.lastIndexOf('.'),
                    segment = moduleNamePlusExt.split('/')[0],
                    isRelative = segment === '.' || segment === '..';

                //Have a file extension alias, and it is not the
                //dots from a relative path.
                if (index !== -1 && (!isRelative || index > 1)) {
                    ext = moduleNamePlusExt.substring(index, moduleNamePlusExt.length);
                    moduleNamePlusExt = moduleNamePlusExt.substring(0, index);
                }

                return req.nameToUrl(normalize(moduleNamePlusExt, relName), ext, true);
            };

            req.defined = function (id) {
                return hasProp(defined, makeMap(id, relName, true).id);
            };

            req.specified = function (id) {
                id = makeMap(id, relName, true).id;
                return hasProp(defined, id) || hasProp(deferreds, id);
            };

            return req;
        }

        function resolve(name, d, value) {
            if (name) {
                defined[name] = value;
                if (requirejs.onResourceLoad) {
                    requirejs.onResourceLoad(context, d.map, d.deps);
                }
            }
            d.finished = true;
            d.resolve(value);
        }

        function reject(d, err) {
            d.finished = true;
            d.rejected = true;
            d.reject(err);
        }

        function makeNormalize(relName) {
            return function (name) {
                return normalize(name, relName, true);
            };
        }

        function defineModule(d) {
            var name = d.map.id,
                ret = d.factory.apply(defined[name], d.values);

            if (name) {
                // Favor return value over exports. If node/cjs in play,
                // then will not have a return value anyway. Favor
                // module.exports assignment over exports object.
                if (ret === undef) {
                    if (d.cjsModule) {
                        ret = d.cjsModule.exports;
                    } else if (d.usingExports) {
                        ret = defined[name];
                    }
                }
            } else {
                //Remove the require deferred from the list to
                //make cycle searching faster. Do not need to track
                //it anymore either.
                requireDeferreds.splice(requireDeferreds.indexOf(d), 1);
            }
            resolve(name, d, ret);
        }

        //This method is attached to every module deferred,
        //so the "this" in here is the module deferred object.
        function depFinished(val, i) {
            if (!this.rejected && !this.depDefined[i]) {
                this.depDefined[i] = true;
                this.depCount += 1;
                this.values[i] = val;
                if (!this.depending && this.depCount === this.depMax) {
                    defineModule(this);
                }
            }
        }

        function makeDefer(name) {
            var d = {};
            d.promise = new Promise(function (resolve, reject) {
                d.resolve = resolve;
                d.reject = reject;
            });
            d.map = name ? makeMap(name, null, true) : {};
            d.depCount = 0;
            d.depMax = 0;
            d.values = [];
            d.depDefined = [];
            d.depFinished = depFinished;
            if (d.map.pr) {
                //Plugin resource ID, implicitly
                //depends on plugin. Track it in deps
                //so cycle breaking can work
                d.deps = [makeMap(d.map.pr)];
            }
            return d;
        }

        function getDefer(name) {
            var d;
            if (name) {
                d = hasProp(deferreds, name) && deferreds[name];
                if (!d) {
                    d = deferreds[name] = makeDefer(name);
                }
            } else {
                d = makeDefer();
                requireDeferreds.push(d);
            }
            return d;
        }

        function makeErrback(d, name) {
            return function (err) {
                if (!d.rejected) {
                    if (!err.dynaId) {
                        err.dynaId = 'id' + (errCount += 1);
                        err.requireModules = [name];
                    }
                    reject(d, err);
                }
            };
        }

        function waitForDep(depMap, relName, d, i) {
            d.depMax += 1;

            //Do the fail at the end to catch errors
            //in the then callback execution.
            callDep(depMap, relName).then(function (val) {
                d.depFinished(val, i);
            }, makeErrback(d, depMap.id)).catch(makeErrback(d, d.map.id));
        }

        function makeLoad(id) {
            var fromTextCalled;
            function load(value) {
                //Protect against older plugins that call load after
                //calling load.fromText
                if (!fromTextCalled) {
                    resolve(id, getDefer(id), value);
                }
            }

            load.error = function (err) {
                getDefer(id).reject(err);
            };

            load.fromText = function (text, textAlt) {
                /*jslint evil: true */
                var d = getDefer(id),
                    map = makeMap(makeMap(id).n),
                   plainId = map.id;

                fromTextCalled = true;

                //Set up the factory just to be a return of the value from
                //plainId.
                d.factory = function (p, val) {
                    return val;
                };

                //As of requirejs 2.1.0, support just passing the text, to reinforce
                //fromText only being called once per resource. Still
                //support old style of passing moduleName but discard
                //that moduleName in favor of the internal ref.
                if (textAlt) {
                    text = textAlt;
                }

                //Transfer any config to this other module.
                if (hasProp(config.config, id)) {
                    config.config[plainId] = config.config[id];
                }

                try {
                    req.exec(text);
                } catch (e) {
                    reject(d, new Error('fromText eval for ' + plainId +
                                    ' failed: ' + e));
                }

                //Execute any waiting define created by the plainId
                takeQueue(plainId);

                //Mark this as a dependency for the plugin
                //resource
                d.deps = [map];
                waitForDep(map, null, d, d.deps.length);
            };

            return load;
        }

        load = typeof importScripts === 'function' ?
                function (map) {
                    var url = map.url;
                    if (urlFetched[url]) {
                        return;
                    }
                    urlFetched[url] = true;

                    //Ask for the deferred so loading is triggered.
                    //Do this before loading, since loading is sync.
                    getDefer(map.id);
                    importScripts(url);
                    takeQueue(map.id);
                } :
                function (map) {
                    var script,
                        id = map.id,
                        url = map.url;

                    if (urlFetched[url]) {
                        return;
                    }
                    urlFetched[url] = true;

                    script = document.createElement('script');
                    script.setAttribute('data-requiremodule', id);
                    script.type = config.scriptType || 'text/javascript';
                    script.charset = 'utf-8';
                    script.async = true;

                    loadCount += 1;

                    script.addEventListener('load', function () {
                        loadCount -= 1;
                        takeQueue(id);
                    }, false);
                    script.addEventListener('error', function () {
                        loadCount -= 1;
                        var err,
                            pathConfig = getOwn(config.paths, id),
                            d = getOwn(deferreds, id);
                        if (pathConfig && Array.isArray(pathConfig) && pathConfig.length > 1) {
                            script.parentNode.removeChild(script);
                            //Pop off the first array value, since it failed, and
                            //retry
                            pathConfig.shift();
                            d.map = makeMap(id);
                            load(d.map);
                        } else {
                            err = new Error('Load failed: ' + id + ': ' + script.src);
                            err.requireModules = [id];
                            getDefer(id).reject(err);
                        }
                    }, false);

                    script.src = url;

                    document.head.appendChild(script);
                };

        function callPlugin(plugin, map, relName) {
            plugin.load(map.n, makeRequire(relName), makeLoad(map.id), {});
        }

        callDep = function (map, relName) {
            var args, bundleId,
                name = map.id,
                shim = config.shim[name];

            if (hasProp(waiting, name)) {
                args = waiting[name];
                delete waiting[name];
                main.apply(undef, args);
            } else if (!hasProp(deferreds, name)) {
                if (map.pr) {
                    //If a bundles config, then just load that file instead to
                    //resolve the plugin, as it is built into that bundle.
                    if ((bundleId = getOwn(bundlesMap, name))) {
                        map.url = req.nameToUrl(bundleId);
                        load(map);
                    } else {
                        return callDep(makeMap(map.pr)).then(function (plugin) {
                            //Redo map now that plugin is known to be loaded
                            var newMap = makeMap(name, relName, true),
                                newId = newMap.id,
                                shim = getOwn(config.shim, newId);

                            //Make sure to only call load once per resource. Many
                            //calls could have been queued waiting for plugin to load.
                            if (!hasProp(calledPlugin, newId)) {
                                calledPlugin[newId] = true;
                                if (shim && shim.deps) {
                                    req(shim.deps, function () {
                                        callPlugin(plugin, newMap, relName);
                                    });
                                } else {
                                    callPlugin(plugin, newMap, relName);
                                }
                            }
                            return getDefer(newId).promise;
                        });
                    }
                } else if (shim && shim.deps) {
                    req(shim.deps, function () {
                        load(map);
                    });
                } else {
                    load(map);
                }
            }

            return getDefer(name).promise;
        };

        //Turns a plugin!resource to [plugin, resource]
        //with the plugin being undefined if the name
        //did not have a plugin prefix.
        function splitPrefix(name) {
            var prefix,
                index = name ? name.indexOf('!') : -1;
            if (index > -1) {
                prefix = name.substring(0, index);
                name = name.substring(index + 1, name.length);
            }
            return [prefix, name];
        }

        /**
         * Makes a name map, normalizing the name, and using a plugin
         * for normalization if necessary. Grabs a ref to plugin
         * too, as an optimization.
         */
        makeMap = function (name, relName, applyMap) {
            if (typeof name !== 'string') {
                return name;
            }

            var plugin, url, parts, prefix, result,
                cacheKey = name + ' & ' + (relName || '') + ' & ' + !!applyMap;

            parts = splitPrefix(name);
            prefix = parts[0];
            name = parts[1];

            if (!prefix && hasProp(mapCache, cacheKey)) {
                return mapCache[cacheKey];
            }

            if (prefix) {
                prefix = normalize(prefix, relName, applyMap);
                plugin = hasProp(defined, prefix) && defined[prefix];
            }

            //Normalize according
            if (prefix) {
                if (plugin && plugin.normalize) {
                    name = plugin.normalize(name, makeNormalize(relName));
                } else {
                    name = normalize(name, relName, applyMap);
                }
            } else {
                name = normalize(name, relName, applyMap);
                parts = splitPrefix(name);
                prefix = parts[0];
                name = parts[1];

                url = req.nameToUrl(name);
            }

            //Using ridiculous property names for space reasons
            result = {
                id: prefix ? prefix + '!' + name : name, //fullName
                n: name,
                pr: prefix,
                url: url
            };

            if (!prefix) {
                mapCache[cacheKey] = result;
            }

            return result;
        };

        handlers = {
            require: function (name) {
                return makeRequire(name);
            },
            exports: function (name) {
                var e = defined[name];
                if (typeof e !== 'undefined') {
                    return e;
                } else {
                    return (defined[name] = {});
                }
            },
            module: function (name) {
                return {
                    id: name,
                    uri: '',
                    exports: handlers.exports(name),
                    config: function () {
                        return getOwn(config.config, name) || {};
                    }
                };
            }
        };

        function breakCycle(d, traced, processed) {
            var id = d.map.id;

            traced[id] = true;
            if (!d.finished && d.deps) {
                d.deps.forEach(function (depMap) {
                    var depId = depMap.id,
                        dep = !hasProp(handlers, depId) && getDefer(depId);

                    //Only force things that have not completed
                    //being defined, so still in the registry,
                    //and only if it has not been matched up
                    //in the module already.
                    if (dep && !dep.finished && !processed[depId]) {
                        if (hasProp(traced, depId)) {
                            d.deps.forEach(function (depMap, i) {
                                if (depMap.id === depId) {
                                    d.depFinished(defined[depId], i);
                                }
                            });
                        } else {
                            breakCycle(dep, traced, processed);
                        }
                    }
                });
            }
            processed[id] = true;
        }

        function check(d) {
            var err,
                notFinished = [],
                waitInterval = config.waitSeconds * 1000,
                //It is possible to disable the wait interval by using waitSeconds of 0.
                expired = waitInterval && (startTime + waitInterval) < (new Date()).getTime();

            if (loadCount === 0) {
                //If passed in a deferred, it is for a specific require call.
                //Could be a sync case that needs resolution right away.
                //Otherwise, if no deferred, means it was the last ditch
                //timeout-based check, so check all waiting require deferreds.
                if (d) {
                    if (!d.finished) {
                        breakCycle(d, {}, {});
                    }
                } else if (requireDeferreds.length) {
                    requireDeferreds.forEach(function (d) {
                        breakCycle(d, {}, {});
                    });
                }
            }

            //If still waiting on loads, and the waiting load is something
            //other than a plugin resource, or there are still outstanding
            //scripts, then just try back later.
            if (expired) {
                //If wait time expired, throw error of unloaded modules.
                eachProp(deferreds, function (d) {
                    if (!d.finished) {
                        notFinished.push(d.map.id);
                    }
                });
                err = new Error('Timeout for modules: ' + notFinished);
                err.requireModules = notFinished;
                req.onError(err);
            } else if (loadCount || requireDeferreds.length) {
                //Something is still waiting to load. Wait for it, but only
                //if a later check is not already scheduled. Using setTimeout
                //because want other things in the event loop to happen,
                //to help in dependency resolution, and this is really a
                //last ditch check, mostly for detecting timeouts (cycles
                //should come through the main() use of check()), so it can
                //wait a bit before doing the final check.
                if (!checkingLater) {
                    checkingLater = true;
                    setTimeout(function () {
                        checkingLater = false;
                        check();
                    }, 70);
                }
            }
        }

        //Used to break out of the promise try/catch chains.
        function delayedError(e) {
            setTimeout(function () {
                if (!e.dynaId || !trackedErrors[e.dynaId]) {
                    trackedErrors[e.dynaId] = true;
                    req.onError(e);
                }
            });
        }

        main = function (name, deps, factory, errback, relName) {
            //Only allow main calling once per module.
            if (name && hasProp(calledDefine, name)) {
                return;
            }
            calledDefine[name] = true;

            var d = getDefer(name);

            //This module may not have dependencies
            if (deps && !Array.isArray(deps)) {
                //deps is not an array, so probably means
                //an object literal or factory function for
                //the value. Adjust args.
                factory = deps;
                deps = [];
            }

            d.promise.catch(errback || delayedError);

            //Use name if no relName
            relName = relName || name;

            //Call the factory to define the module, if necessary.
            if (typeof factory === 'function') {

                if (!deps.length && factory.length) {
                    //Remove comments from the callback string,
                    //look for require calls, and pull them into the dependencies,
                    //but only if there are function args.
                    factory
                        .toString()
                        .replace(commentRegExp, '')
                        .replace(cjsRequireRegExp, function (match, dep) {
                            deps.push(dep);
                        });

                    //May be a CommonJS thing even without require calls, but still
                    //could use exports, and module. Avoid doing exports and module
                    //work though if it just needs require.
                    //REQUIRES the function to expect the CommonJS variables in the
                    //order listed below.
                    deps = (factory.length === 1 ?
                            ['require'] :
                            ['require', 'exports', 'module']).concat(deps);
                }

                //Save info for use later.
                d.factory = factory;
                d.deps = deps;

                d.depending = true;
                deps.forEach(function (depName, i) {
                    var depMap;
                    deps[i] = depMap = makeMap(depName, relName, true);
                    depName = depMap.id;

                    //Fast path CommonJS standard dependencies.
                    if (depName === "require") {
                        d.values[i] = handlers.require(name);
                    } else if (depName === "exports") {
                        //CommonJS module spec 1.1
                        d.values[i] = handlers.exports(name);
                        d.usingExports = true;
                    } else if (depName === "module") {
                        //CommonJS module spec 1.1
                        d.values[i] = d.cjsModule = handlers.module(name);
                    } else if (depName === undefined) {
                        d.values[i] = undefined;
                    } else {
                        waitForDep(depMap, relName, d, i);
                    }
                });
                d.depending = false;

                //Some modules just depend on the require, exports, modules, so
                //trigger their definition here if so.
                if (d.depCount === d.depMax) {
                    defineModule(d);
                }
            } else if (name) {
                //May just be an object definition for the module. Only
                //worry about defining if have a module name.
                resolve(name, d, factory);
            }

            startTime = (new Date()).getTime();

            if (!name) {
                check(d);
            }
        };

        req = makeRequire(null, true);

        /*
         * Just drops the config on the floor, but returns req in case
         * the config return value is used.
         */
        req.config = function (cfg) {
            if (cfg.context && cfg.context !== contextName) {
                return newContext(cfg.context).config(cfg);
            }

            //Since config changed, mapCache may not be valid any more.
            mapCache = {};

            //Make sure the baseUrl ends in a slash.
            if (cfg.baseUrl) {
                if (cfg.baseUrl.charAt(cfg.baseUrl.length - 1) !== '/') {
                    cfg.baseUrl += '/';
                }
            }

            //Save off the paths and packages since they require special processing,
            //they are additive.
            var shim = config.shim,
                objs = {
                    paths: true,
                    bundles: true,
                    config: true,
                    map: true
                };

            eachProp(cfg, function (value, prop) {
                if (objs[prop]) {
                    if (!config[prop]) {
                        config[prop] = {};
                    }
                    mixin(config[prop], value, true, true);
                } else {
                    config[prop] = value;
                }
            });

            //Reverse map the bundles
            if (cfg.bundles) {
                eachProp(cfg.bundles, function (value, prop) {
                    value.forEach(function (v) {
                        if (v !== prop) {
                            bundlesMap[v] = prop;
                        }
                    });
                });
            }

            //Merge shim
            if (cfg.shim) {
                eachProp(cfg.shim, function (value, id) {
                    //Normalize the structure
                    if (Array.isArray(value)) {
                        value = {
                            deps: value
                        };
                    }
                    if ((value.exports || value.init) && !value.exportsFn) {
                        value.exportsFn = makeShimExports(value);
                    }
                    shim[id] = value;
                });
                config.shim = shim;
            }

            //Adjust packages if necessary.
            if (cfg.packages) {
                cfg.packages.forEach(function (pkgObj) {
                    var location, name;

                    pkgObj = typeof pkgObj === 'string' ? { name: pkgObj } : pkgObj;

                    name = pkgObj.name;
                    location = pkgObj.location;
                    if (location) {
                        config.paths[name] = pkgObj.location;
                    }

                    //Save pointer to main module ID for pkg name.
                    //Remove leading dot in main, so main paths are normalized,
                    //and remove any trailing .js, since different package
                    //envs have different conventions: some use a module name,
                    //some use a file name.
                    config.pkgs[name] = pkgObj.name + '/' + (pkgObj.main || 'main')
                                 .replace(currDirRegExp, '')
                                 .replace(jsSuffixRegExp, '');
                });
            }

            //If a deps array or a config callback is specified, then call
            //require with those args. This is useful when require is defined as a
            //config object before require.js is loaded.
            if (cfg.deps || cfg.callback) {
                req(cfg.deps, cfg.callback);
            }

            return req;
        };

        req.onError = function (err) {
            throw err;
        };

        context = {
            id: contextName,
            defined: defined,
            waiting: waiting,
            config: config,
            deferreds: deferreds
        };

        contexts[contextName] = context;

        return req;
    }

    requirejs = topReq = newContext('_');

    if (typeof require !== 'function') {
        require = topReq;
    }

    /**
     * Executes the text. Normally just uses eval, but can be modified
     * to use a better, environment-specific call. Only used for transpiling
     * loader plugins, not for plain JS modules.
     * @param {String} text the text to execute/evaluate.
     */
    topReq.exec = function (text) {
        /*jslint evil: true */
        return eval(text);
    };

    topReq.contexts = contexts;

    define = function () {
        queue.push([].slice.call(arguments, 0));
    };

    define.amd = {
        jQuery: true
    };

    if (bootstrapConfig) {
        topReq.config(bootstrapConfig);
    }

    //data-main support.
    if (topReq.isBrowser && !contexts._.config.skipDataMain) {
        dataMain = document.querySelectorAll('script[data-main]')[0];
        dataMain = dataMain && dataMain.getAttribute('data-main');
        if (dataMain) {
            //Strip off any trailing .js since dataMain is now
            //like a module name.
            dataMain = dataMain.replace(jsSuffixRegExp, '');

            if (!bootstrapConfig || !bootstrapConfig.baseUrl) {
                //Pull off the directory of data-main for use as the
                //baseUrl.
                src = dataMain.split('/');
                dataMain = src.pop();
                subPath = src.length ? src.join('/')  + '/' : './';

                topReq.config({baseUrl: subPath});
            }

            topReq([dataMain]);
        }
    }
}(this));

define("alameda", function(){});

// when running in B2G, send output to the console, ANSI-style
/*global dump */

(function() {
  function consoleHelper() {
    var msg = arguments[0] + ':';
    for (var i = 1; i < arguments.length; i++) {
      msg += ' ' + arguments[i];
    }
    msg += '\x1b[0m\n';
    dump(msg);
  }

  if ('mozTCPSocket' in window.navigator) {
    window.console = {
      log: consoleHelper.bind(null, '\x1b[32mLOG'),
      error: consoleHelper.bind(null, '\x1b[31mERR'),
      info: consoleHelper.bind(null, '\x1b[36mINF'),
      warn: consoleHelper.bind(null, '\x1b[33mWAR')
    };
  }
  window.onerror = function errHandler(msg, url, line) {
    console.error('onerror reporting:', msg, '@', url, ':', line);
    return false;
  };
}());

define("console_hook", function(){});

/*
 * Custom events lib. Notable features:
 *
 * - the module itself is an event emitter. Useful for "global" pub/sub.
 * - evt.mix can be used to mix in an event emitter into existing object.
 * - notification of listeners is done in a try/catch, so all listeners
 *   are notified even if one fails. Errors are thrown async via setTimeout
 *   so that all the listeners can be notified without escaping from the
 *   code via a throw within the listener group notification.
 * - new evt.Emitter() can be used to create a new instance of an
 *   event emitter.
 * - Uses "this" internally, so always call object with the emitter args.
 */

define('evt',[],function() {

  var evt,
      slice = Array.prototype.slice,
      props = ['_events', '_pendingEvents', 'on', 'once', 'latest',
               'latestOnce', 'removeListener', 'emitWhenListener', 'emit'];

  function Emitter() {
    this._events = {};
    this._pendingEvents = {};
  }

  Emitter.prototype = {
    on: function(id, fn) {
      var listeners = this._events[id],
          pending = this._pendingEvents[id];
      if (!listeners) {
        listeners = this._events[id] = [];
      }
      listeners.push(fn);

      if (pending) {
        pending.forEach(function(args) {
          fn.apply(null, args);
        });
        delete this._pendingEvents[id];
      }
      return this;
    },

    once: function(id, fn) {
      var self = this,
          fired = false;
      function one() {
        if (fired) {
          return;
        }
        fired = true;
        fn.apply(null, arguments);
        // Remove at a further turn so that the event
        // forEach in emit does not get modified during
        // this turn.
        setTimeout(function() {
          self.removeListener(id, one);
        });
      }
      return this.on(id, one);
    },

    /**
     * Waits for a property on the object that has the event interface
     * to be available. That property MUST EVALUATE TO A TRUTHY VALUE.
     * hasOwnProperty is not used because many objects are created with
     * null placeholders to give a proper JS engine shape to them, and
     * this method should not trigger the listener for those cases.
     * If the property is already available, call the listener right
     * away. If not available right away, listens for an event name that
     * matches the property name.
     * @param  {String}   id property name.
     * @param  {Function} fn listener.
     */
    latest: function(id, fn) {
      if (this[id] && !this._pendingEvents[id]) {
        fn(this[id]);
      }
      this.on(id, fn);
    },

    /**
     * Same as latest, but only calls the listener once.
     * @param  {String}   id property name.
     * @param  {Function} fn listener.
     */
    latestOnce: function(id, fn) {
      if (this[id] && !this._pendingEvents[id]) {
        fn(this[id]);
      } else {
        this.once(id, fn);
      }
    },

    removeListener: function(id, fn) {
      var i,
          listeners = this._events[id];
      if (listeners) {
        i = listeners.indexOf(fn);
        if (i !== -1) {
          listeners.splice(i, 1);
        }
        if (listeners.length === 0) {
          delete this._events[id];
        }
      }
    },

    /**
     * Like emit, but if no listeners yet, holds on
     * to the value until there is one. Any other
     * args after first one are passed to listeners.
     * @param  {String} id event ID.
     */
    emitWhenListener: function(id) {
      var listeners = this._events[id];
      if (listeners) {
        this.emit.apply(this, arguments);
      } else {
        if (!this._pendingEvents[id]) {
          this._pendingEvents[id] = [];
        }
        this._pendingEvents[id].push(slice.call(arguments, 1));
      }
    },

    emit: function(id) {
      var args = slice.call(arguments, 1),
          listeners = this._events[id];

      if (listeners) {
        listeners.forEach(function(fn) {
          try {
            fn.apply(null, args);
          } catch (e) {
            // Throw at later turn so that other listeners
            // can complete. While this messes with the
            // stack for the error, continued operation is
            // valued more in this tradeoff.
            // This also means we do not need to .catch()
            // for the wrapping promise.
            setTimeout(function() {
              throw e;
            });
          }
        });
      }
    }
  };

  evt = new Emitter();
  evt.Emitter = Emitter;

  evt.mix = function(obj) {
    var e = new Emitter();
    props.forEach(function(prop) {
      if (obj.hasOwnProperty(prop)) {
        throw new Error('Object already has a property "' + prop + '"');
      }
      obj[prop] = e[prop];
    });
    return obj;
  };

  return evt;
});

/**
 * Provides a wrapper over the mozApps.getSelf() API. Structured as an
 * evt emitter, with "latest" support, and "latest" is overridden so
 * that the call to getSelf() is delayed until the very first need
 * for it.
 *
 * This allows code to have a handle on this module, instead of making
 * the getSelf() call, and then only trigger the fetch via a call to
 * latest, delaying the work until it is actually needed. Once getSelf()
 * is fetched once, the result is reused.
 */

define('app_self',['require','exports','module','evt'],function(require, exports, module) {
  var evt = require('evt');

  var appSelf = evt.mix({}),
      mozApps = navigator.mozApps,
      oldLatest = appSelf.latest,
      loaded = false;

  if (!mozApps) {
    appSelf.self = {};
    loaded = true;
  }

  function loadSelf() {
    mozApps.getSelf().onsuccess = function(event) {
      loaded = true;
      var app = event.target.result;
      appSelf.self = app;
      appSelf.emit('self', appSelf.self);
    };
  }

  // Override latest to only do the work when something actually wants to
  // listen.
  appSelf.latest = function(id) {
    if (!loaded) {
      loadSelf();
    }

    if (id !== 'self') {
      throw new Error(module.id + ' only supports "self" property');
    }

    return oldLatest.apply(this, arguments);
  };

  return appSelf;
});


define('l10n',{
  load: function(id, require, onload, config) {
    if (config.isBuild) {
      return onload();
    }

    require(['l10nbase', 'l10ndate'], function() {
      navigator.mozL10n.once(function() {
        // The html cache restore in html_cache_restore could have set the ltr
        // direction incorrectly. If the language goes from an RTL one to a LTR
        // one while the app is closed, this could lead to a stale value.
        var dir = navigator.mozL10n.language.direction,
            htmlNode = document.querySelector('html');

        if (htmlNode.getAttribute('dir') !== dir) {
          console.log('email l10n updating html dir to ' + dir);
          htmlNode.setAttribute('dir', dir);
        }

        onload(navigator.mozL10n);
      });
    });
  }
});

/* exported NotificationHelper */
(function(window) {
  

  window.NotificationHelper = {
    getIconURI: function nh_getIconURI(app, entryPoint) {
      var icons = app.manifest.icons;

      if (entryPoint) {
        icons = app.manifest.entry_points[entryPoint].icons;
      }

      if (!icons) {
        return null;
      }

      var sizes = Object.keys(icons).map(function parse(str) {
        return parseInt(str, 10);
      });
      sizes.sort(function(x, y) { return y - x; });

      var HVGA = document.documentElement.clientWidth < 480;
      var index = sizes[HVGA ? sizes.length - 1 : 0];
      return app.installOrigin + icons[index];
    },

    // titleL10n and options.bodyL10n may be:
    // a string -> l10nId
    // an object -> {id: l10nId, args: l10nArgs}
    // an object -> {raw: string}
    send: function nh_send(titleL10n, options) {
      return new Promise(function(resolve, reject) {
        navigator.mozL10n.once(function() {
          var title = getL10n(titleL10n);

          if (options.bodyL10n) {
            options.body = getL10n(options.bodyL10n);
          }

          options.dir = navigator.mozL10n.language.direction;
          options.lang = navigator.mozL10n.language.code;

          var notification = new window.Notification(title, options);

          if (options.closeOnClick !== false) {
            notification.addEventListener('click', function nh_click() {
              notification.removeEventListener('click', nh_click);
              notification.close();
            });
          }

          resolve(notification);
        });
      });
    },
  };

  function getL10n(l10nAttrs) {
    if (typeof l10nAttrs === 'string') {
      return navigator.mozL10n.get(l10nAttrs);
    }
    if (l10nAttrs.raw) {
      return l10nAttrs.raw;
    }
    return navigator.mozL10n.get(l10nAttrs.id, l10nAttrs.args);
  }
})(this);

define("shared/js/notification_helper", (function (global) {
    return function () {
        var ret, fn;
        return ret || global.NotificationHelper;
    };
}(this)));

/*jshint browser: true */
/*global define, console, Notification */

define('sync',['require','app_self','evt','l10n!','shared/js/notification_helper'],function(require) {

  var cronSyncStartTime,
      appSelf = require('app_self'),
      evt = require('evt'),
      mozL10n = require('l10n!'),
      notificationHelper = require('shared/js/notification_helper');

  // Version marker for the notification data format. It is a string because
  // query_string only deals in strings. If the format of the notification data
  // changes, then this version needs to be changed.
  var notificationDataVersion = '1';

  // The expectation is that this module is called as part of model's
  // init process that calls the "model_init" module to finish its construction.
  return function syncInit(model, api) {
    var hasBeenVisible = !document.hidden,
        waitingOnCron = {};

    // Let the back end know the app is interactive, not just
    // a quick sync and shutdown case, so that it knows it can
    // do extra work.
    if (hasBeenVisible) {
      api.setInteractive();
    }

    // If the page is ever not hidden, then do not close it later.
    document.addEventListener('visibilitychange',
      function onVisibilityChange() {
        if (!document.hidden) {
          hasBeenVisible = true;
          api.setInteractive();
        }
    }, false);

    // Creates a string key from an array of string IDs. Uses a space
    // separator since that cannot show up in an ID.
    function makeAccountKey(accountIds) {
      return 'id' + accountIds.join(' ');
    }

    var sendNotification;
    if (typeof Notification !== 'function') {
      console.log('email: notifications not available');
      sendNotification = function() {};
    } else {
      sendNotification = function(notificationId, title, body,
                                  iconUrl, data, behavior) {
        console.log('Notification sent for ' + notificationId);

        if (Notification.permission !== 'granted') {
          console.log('email: notification skipped, permission: ' +
                      Notification.permission);
          return;
        }

        data = data || {};

        //TODO: consider setting dir and lang?
        //https://developer.mozilla.org/en-US/docs/Web/API/notification
        var notificationOptions = {
          body: body,
          icon: iconUrl,
          tag: notificationId,
          data: data,
          mozbehavior: {
            noscreen: true
          }
        };

        if (behavior) {
          Object.keys(behavior).forEach(function(key) {
            notificationOptions.mozbehavior[key] = behavior[key];
          });
        }

        title = title || mozL10n.get('notification-no-subject');

        var notification = new Notification(title, notificationOptions);

        // If the app is open, but in the background, when the notification
        // comes in, then we do not get notifived via our mozSetMessageHandler
        // that is set elsewhere. Instead need to listen to click event
        // and synthesize an "event" ourselves.
        notification.onclick = function() {
          evt.emit('notification', {
            clicked: true,
            imageURL: iconUrl,
            tag: notificationId,
            data: data
          });
        };
      };
    }

    api.oncronsyncstart = function(accountIds) {
      console.log('email oncronsyncstart: ' + accountIds);
      cronSyncStartTime = Date.now();
      var accountKey = makeAccountKey(accountIds);
      waitingOnCron[accountKey] = true;
    };

    /**
     * Fetches notification data for the notification type, ntype. This method
     * assumes there is only one ntype of notification per account.
     * @param  {String} ntype The notification type, like 'sync'.
     * @return {Promise}      Promise that resolves to a an object whose keys
     * are account IDs and values are notification data.
     */
    function fetchNotificationsData(ntype) {
      if (typeof Notification !== 'function' || !Notification.get) {
        return Promise.resolve({});
      }

      return Notification.get().then(function(notifications) {
        var result = {};
        notifications.forEach(function(notification) {
          var data = notification.data;

          // Want to avoid unexpected data formats. So if not a version match
          // then just close it since it cannot be processed as expected. This
          // means that notifications not generated by this module may be
          // closed. However, ideally only this module generates notifications,
          // for localization of concerns.
          if (!data.v || data.v !== notificationDataVersion) {
            notification.close();
          } else if (data.ntype === ntype) {
            data.notification = notification;
            result[data.accountId] = data;
          }
        });
        return result;
      }, function(err) {
        // Do not care about errors, just log and keep going.
        console.error('email notification.get call failed: ' + err);
        return {};
      });
    }

    /**
     * Helper to just get some environment data for dealing with sync-based
     * notfication data. Exists to reduce the curly brace pyramid of doom and
     * to normalize existing sync notification info.
     * @param {Function} fn function to call once env info is fetched.
     */
    function getSyncEnv(fn) {
      appSelf.latest('self', function(app) {
        model.latestOnce('account', function(currentAccount) {
          fetchNotificationsData('sync').then(
            function(existingNotificationsData) {
              fn(app, currentAccount, existingNotificationsData);
            }
          );
        });
      });
    }

    /**
     * Generates a list of unique top names sorted by most recent sender first,
     * and limited to a max number. The max number is just to limit amount of
     * work and likely display limits.
     * @param  {Array} latestInfos  array of result.latestMessageInfos. Modifies
     * result.latestMessageInfos via a sort.
     * @param  {Array} oldFromNames old from names from a previous notification.
     * @return {Array} a maxFromList array of most recent senders.
     */
    function topUniqueFromNames(latestInfos, oldFromNames) {
      var names = [],
          maxCount = 3;

      // Get the new from senders from the result. First,
      // need to sort by most recent.
      // Note that sort modifies result.latestMessageInfos
      latestInfos.sort(function(a, b) {
       return b.date - a.date;
      });

      // Only need three unique names, and just the name, not
      // the full info object.
      latestInfos.some(function(info) {
        if (names.length > maxCount) {
          return true;
        }

        if (names.indexOf(info.from) === -1) {
          names.push(info.from);
        }
      });

      // Now add in old names to fill out a list of
      // max names.
      oldFromNames.some(function(name) {
        if (names.length > maxCount) {
          return true;
        }
        if (names.indexOf(name) === -1) {
          names.push(name);
        }
      });

      return names;
    }

    /*
    accountsResults is an object with the following structure:
      accountIds: array of string account IDs.
      updates: array of objects includes properties:
        id: accountId,
        name: account name,
        count: number of new messages total
        latestMessageInfos: array of latest message info objects,
        with properties:
          - from
          - subject
          - accountId
          - messageSuid
     */
    api.oncronsyncstop = function(accountsResults) {
      console.log('email oncronsyncstop: ' + accountsResults.accountIds);

      function finishSync() {
        evt.emit('cronSyncStop', accountsResults.accountIds);

        // Mark this accountId set as no longer waiting.
        var accountKey = makeAccountKey(accountsResults.accountIds);
        waitingOnCron[accountKey] = false;
        var stillWaiting = Object.keys(waitingOnCron).some(function(key) {
          return !!waitingOnCron[key];
        });

        if (!hasBeenVisible && !stillWaiting) {
          console.log('sync completed in ' +
                     ((Date.now() - cronSyncStartTime) / 1000) +
                     ' seconds, closing mail app');
          window.close();
        }
      }

      // If no sync updates, wrap it up.
      if (!accountsResults.updates) {
        finishSync();
        return;
      }

      // There are sync updates, get environment and figure out how to notify
      // the user of the updates.
      getSyncEnv(function(app, currentAccount, existingNotificationsData) {
        var iconUrl = notificationHelper.getIconURI(app);

        accountsResults.updates.forEach(function(result) {
          // If the current account is being shown, then just send an update
          // to the model to indicate new messages, as the notification will
          // happen within the app for that case. The 'inboxShown' pathway
          // will be sure to close any existing notification for the current
          // account.
          if (currentAccount.id === result.id && !document.hidden) {
            model.notifyInboxMessages(result);
            return;
          }

          // If this account does not want notifications of new messages
          // or if no Notification object, stop doing work.
          if (!model.getAccount(result.id).notifyOnNew ||
              typeof Notification !== 'function') {
            return;
          }

          var dataObject, subject, body, behavior,
              count = result.count,
              oldFromNames = [];

          // Adjust counts/fromNames based on previous notification.
          var existingData = existingNotificationsData[result.id];
          if (existingData) {
            if (existingData.count) {
              count += parseInt(existingData.count, 10);
            }
            if (existingData.fromNames) {
              oldFromNames = existingData.fromNames;
            }
          }

          if (count > 1) {
            // Multiple messages were synced.
            // topUniqueFromNames modifies result.latestMessageInfos
            var newFromNames = topUniqueFromNames(result.latestMessageInfos,
                                                  oldFromNames);
            dataObject = {
              v: notificationDataVersion,
              ntype: 'sync',
              type: 'message_list',
              accountId: result.id,
              count: count,
              fromNames: newFromNames
            };

            // If already have a notification, then do not bother with sound or
            // vibration for this update. Longer term, the notification standard
            // will have a "silent" option, but using a non-existent URL as
            // suggested in bug 1042361 in the meantime.
            if (existingData && existingData.count) {
              behavior = {
                soundFile: 'does-not-exist-to-simulate-silent',
                // Cannot use 0 since system/js/notifications.js explicitly
                // ignores [0] values. [1] is good enough for this purpose.
                vibrationPattern: [1]
              };
            }

            if (model.getAccountCount() === 1) {
              subject = mozL10n.get('new-emails-notify-one-account', {
                n: count
              });
            } else {
              subject = mozL10n.get('new-emails-notify-multiple-accounts', {
                n: count,
                accountName: result.address
              });
            }

            body = newFromNames.join(mozL10n.get('senders-separation-sign'));
          } else {
            // Only one message to notify about.
            var info = result.latestMessageInfos[0];
            dataObject = {
              v: notificationDataVersion,
              ntype: 'sync',
              type: 'message_reader',
              accountId: info.accountId,
              messageSuid: info.messageSuid,
              count: 1,
              fromNames: [info.from]
            };

            if (model.getAccountCount() === 1) {
              subject = info.subject;
              body = info.from;
            } else {
              subject = mozL10n.get('new-emails-notify-multiple-accounts', {
                n: count,
                accountName: result.address
              });
              body = mozL10n.get('new-emails-notify-multiple-accounts-body', {
                from: info.from,
                subject: info.subject
              });
            }
          }

          sendNotification(
            result.id,
            subject,
            body,
            iconUrl,
            dataObject,
            behavior
          );
        });

        finishSync();
      });
    };

    // Background Send Notifications

    var BACKGROUND_SEND_NOTIFICATION_ID = 'backgroundSendFailed';
    var sentAudio = null; // Lazy-loaded when first needed

    /**
     * The API passes through background send notifications with the
     * following data (see the "sendOutboxMessages" job and/or
     * `GELAM/js/jobs/outbox.js`):
     *
     * @param {int} accountId
     * @param {string} suid
     *   SUID of the message
     * @param {string} state
     *   'pending', 'syncing', 'success', or 'error'
     * @param {string} err
     *   (if applicable, otherwise null)
     * @param {array} badAddresses
     *   (if applicable)
     * @param {int} sendFailures
     *   Count of the number of times the message failed to send.
     * @param {Boolean} emitNotifications
     *   True if this message is being sent as a direct result of
     *   the user sending a message from the compose window. False
     *   otherwise, as in when the user "refreshes" the outbox.
     * @param {Boolean} willSendMore
     *   True if we will send a subsequent message from the outbox
     *   immediately after sending this message.
     *
     * Additionally, this function appends the following to that
     * structured data:
     *
     * @param {string} localizedDescription Notification text.
     *
     * If the application is in the foreground, we notify the user on
     * both success and failure. If the application is in the
     * background, we only post a system notifiaction on failure.
     */
    api.onbackgroundsendstatus = function(data) {
      console.log('outbox: Message', data.suid, 'status =', JSON.stringify({
        state: data.state,
        err: data.err,
        sendFailures: data.sendFailures,
        emitNotifications: data.emitNotifications
      }));

      // Grab an appropriate localized string here. This description
      // may be displayed in a number of different places, so it's
      // cleaner to do the localization here.

      var descId;
      switch (data.state) {
      case 'pending': descId = 'background-send-pending'; break;
      case 'sending': descId = 'background-send-sending'; break;
      case 'success': descId = 'background-send-success'; break;
      case 'error':
        if ((data.badAddresses && data.badAddresses.length) ||
            data.err === 'bad-recipient') {
          descId = 'background-send-error-recipients';
        } else {
          descId = 'background-send-error';
        }
        break;
      case 'syncDone':
        // We will not display any notification for a 'syncDone'
        // message, except to stop refresh icons from spinning. No
        // need to attempt to populate a description.
        break;
      default:
        console.error('No state description for background send state "' +
                      data.state + '"');
        return;
      }

      // Only get localized description if we have a descId
      if (descId) {
        data.localizedDescription = mozL10n.get(descId);
      }

      // If the message sent successfuly, and we're sending this as a
      // side-effect of the user hitting "send" on the compose screen,
      // (i.e. emitNotifications is true), we may need to play a sound.
      if (data.state === 'success') {
        // Grab an up-to-date reading of the "play sound on send"
        // preference to decide if we're going to play a sound or not.
        model.latestOnce('acctsSlice', function() {
          var account = model.getAccount(data.accountId);
          if (!account) {
            console.error('Invalid account ID', data.accountId,
                          'for a background send notification.');
            return;
          }

          // If email is in the background, we should still be able to
          // play audio due to having the 'audio-channel-notification'
          // permission (unless higher priority audio is playing).

          // TODO: As of June 2014, this behavior is still in limbo;
          // see the following links for relevant discussion. We may
          // need to follow up to ensure we get the behavior we want
          // (which is to play a sound when possible, even if we're in
          // the background).
          //   Thread on dev-gaia: http://goo.gl/l6REZy
          //   AUDIO_COMPETING bugs: https://bugzil.la/911238
          if (account.playSoundOnSend) {
            if (!sentAudio) {
              sentAudio = new Audio('/sounds/firefox_sent.opus');
              sentAudio.mozAudioChannelType = 'notification';
            }
            sentAudio.play();
          }
        }.bind(this));
      }

      // If we are in the foreground, notify through the model, which
      // will display an in-app toast notification when appropriate.
      if (!document.hidden) {
        model.notifyBackgroundSendStatus(data);
      }
      // Otherwise, notify with a system notification in the case of
      // an error. By design, we don't use system-level notifications
      // to notify the user on success, lest they get inundated with
      // notifications.
      else if (data.state === 'error' && data.emitNotifications) {
        appSelf.latest('self', function(app) {
          var iconUrl = notificationHelper.getIconURI(app);
          var dataObject = {
            v: notificationDataVersion,
            ntype: 'outbox',
            type: 'message_reader',
            folderType: 'outbox',
            accountId: data.accountId,
            messageSuid: data.suid
          };

          sendNotification(
            BACKGROUND_SEND_NOTIFICATION_ID,
            mozL10n.get('background-send-error-title'),
            data.localizedDescription,
            iconUrl,
            dataObject
          );
        });
      }
    };

    // When inbox is viewed, be sure to clear out any possible notification
    // for that account.
    evt.on('inboxShown', function(accountId) {
      fetchNotificationsData('sync').then(function(notificationsData) {
        if (notificationsData.hasOwnProperty(accountId)) {
          notificationsData[accountId].notification.close();
        }
      });
    });
  };
});


define('model_init',['require','sync','evt','l10n!'],function(require) {
  return function modelInit(model, api) {
    require('sync')(model, api);

    var evt = require('evt'),
        mozL10n = require('l10n!');

    // If our password is bad, we need to pop up a card to ask for the updated
    // password.
    api.onbadlogin = function(account, problem, whichSide) {
      // Use emitWhenListener here, since the model can be started up before
      // the mail_app and cards infrastructure is available.
      evt.emitWhenListener('apiBadLogin', account, problem, whichSide);
    };

    api.useLocalizedStrings({
      wrote: mozL10n.get('reply-quoting-wrote'),
      originalMessage: mozL10n.get('forward-original-message'),
      forwardHeaderLabels: {
        subject: mozL10n.get('forward-header-subject'),
        date: mozL10n.get('forward-header-date'),
        from: mozL10n.get('forward-header-from'),
        replyTo: mozL10n.get('forward-header-reply-to'),
        to: mozL10n.get('forward-header-to'),
        cc: mozL10n.get('forward-header-cc')
      },
      folderNames: {
        inbox: mozL10n.get('folder-inbox'),
        outbox: mozL10n.get('folder-outbox'),
        sent: mozL10n.get('folder-sent'),
        drafts: mozL10n.get('folder-drafts'),
        trash: mozL10n.get('folder-trash'),
        queue: mozL10n.get('folder-queue'),
        junk: mozL10n.get('folder-junk'),
        archives: mozL10n.get('folder-archives'),
        localdrafts: mozL10n.get('folder-localdrafts')
      }
    });
  };
});


define('model',['require','evt','model_init'],function(require) {
  var evt = require('evt'),
      // Expect a module to provide a function that allows setting up model/api
      // pieces that depend on specific UI or localizations.
      modelInit = require('model_init');

  function dieOnFatalError(msg) {
    console.error('FATAL:', msg);
    throw new Error(msg);
  }

  function saveHasAccount(acctsSlice) {
    // Save localStorage value to improve startup choices
    localStorage.setItem('data_has_account',
                         (acctsSlice.items.length ? 'yes' : 'no'));

    console.log('WRITING LOCAL STORAGE ITEM: ' + 'data_has_account',
                (acctsSlice.items.length ? 'yes' : 'no'));
  }

/**
 * Provides a front end to the API and slice objects returned from the API.
 * Since the UI right now is driven by a shared set of slices, this module
 * tracks those slices and creates events when they are changed. This means
 * the card modules do not need a direct reference to each other to change
 * the backing data for a card, and that card modules and app logic do not
 * need a hard, static dependency on the MailAPI object. This allows some
 * more flexible and decoupled loading scenarios. In particular, cards can
 * be created an inserted into the DOM without needing the back end to
 * complete its startup and initialization.
 *
 * It mixes in 'evt' capabilities, so it will be common to see model
 * used with 'latest' and 'latestOnce' to get the latest model data
 * whenever it loads.
 *
 * Down the road, it may make sense to have more than one model object
 * in play. At that point, it may make sense to morph this into a
 * constructor function and then have the card objects receive a model
 * instance property for their model reference.
 *
 * @type {Object}
 */
  var model = {
    firstRun: null,

    /**
    * acctsSlice event is fired when the property changes.
    * event: acctsSlice
    * @param {Object} the acctsSlice object.
    **/
    acctsSlice: null,

    /**
    * account event is fired when the property changes.
    * event: account
    * @param {Object} the account object.
    **/
    account: null,

    /**
    * foldersSlice event is fired when the property changes.
    * event: foldersSlice
    * @param {Object} the foldersSlice object.
    **/
    foldersSlice: null,

    /**
    * folder event is fired when the property changes.
    * event: folder
    * @param {Object} the folder object.
    **/
    folder: null,

    /**
     * emits an event based on a property value. Since the
     * event is based on a property value that is on this
     * object, *do not* use emitWhenListener, since, due to
     * the possibility of queuing old values with that
     * method, it could cause bad results (bug 971617), and
     * it is not needed since the latest* methods will get
     * the latest value on this object.
     * @param  {String} id event ID/property name
     */
    _callEmit: function(id) {
      this.emit(id, this[id]);
    },

    inited: false,

    /**
     * Returns true if there is an account. Should only be
     * called after inited is true.
     */
    hasAccount: function() {
      return (model.getAccountCount() > 0);
    },

    /**
     * Given an account ID, get the account object. Only works once the
     * acctsSlice property is available. Use model.latestOnce to get a
     * handle on an acctsSlice property, then call this method.
     * @param  {String} id account ID.
     * @return {Object}    account object.
     */
    getAccount: function(id) {
      if (!model.acctsSlice || !model.acctsSlice.items) {
        throw new Error('No acctsSlice available');
      }

      var targetAccount;
      model.acctsSlice.items.some(function(account) {
        if (account.id === id) {
          return !!(targetAccount = account);
        }
      });

      return targetAccount;
    },

    /**
     * Get the numbers of configured account.
     * Should only be called after this.inited is true.
     * @return {Number} numbers of account.
     */
    getAccountCount: function() {
      var count = 0;

      if (model.acctsSlice &&
          model.acctsSlice.items &&
          model.acctsSlice.items.length) {
        count = model.acctsSlice.items.length;
      }

      return count;
    },

    /**
     * Call this to initialize the model. It can be called more than once
     * per the lifetime of an app. The usual use case for multiple calls
     * is when a new account has been added.
     *
     * It is *not* called by default in this module to allow for lazy startup,
     * and for cases like unit tests that may not want to trigger a full model
     * creation for a simple UI test.
     *
     * @param  {boolean} showLatest Choose the latest account in the
     * acctsSlice. Otherwise it choose the account marked as the default
     * account.
     */
    init: function(showLatest, callback) {
      require(['api'], function(api) {
        if (!this.api) {
          this.api = api;
          modelInit(this, api);
        }

        // If already initialized before, clear out previous state.
        this.die();

        var acctsSlice = api.viewAccounts(false);
        acctsSlice.oncomplete = (function() {
          // To prevent a race between Model.init() and
          // acctsSlice.oncomplete, only assign model.acctsSlice when
          // the slice has actually loaded (i.e. after
          // acctsSlice.oncomplete fires).
          model.acctsSlice = acctsSlice;

          saveHasAccount(acctsSlice);

          if (acctsSlice.items.length) {
            // For now, just use the first one; we do attempt to put unified
            // first so this should generally do the right thing.
            // XXX: Because we don't have unified account now, we should
            //      switch to the latest account which user just added.
            var account = showLatest ? acctsSlice.items.slice(-1)[0] :
                                       acctsSlice.defaultAccount;

            this.changeAccount(account, callback);
          } else if (callback) {
            callback();
          }

          this.inited = true;
          this._callEmit('acctsSlice');

          // Once the API/worker has started up and we have received account
          // data, consider the app fully loaded: we have verified full flow
          // of data from front to back.
          evt.emitWhenListener('metrics:apiDone');
        }).bind(this);

        acctsSlice.onchange = function() {
          saveHasAccount(acctsSlice);
        };
      }.bind(this));
    },

    /**
     * Changes the current account tracked by the model. This results
     * in changes to the 'account', 'foldersSlice' and 'folder' properties.
     * @param  {Object}   account  the account object.
     * @param  {Function} callback function to call once the account and
     * related folder data has changed.
     */
    changeAccount: function(account, callback) {
      // Do not bother if account is the same.
      if (this.account && this.account.id === account.id) {
        if (callback) {
          callback();
        }
        return;
      }

      this._dieFolders();

      this.account = account;
      this._callEmit('account');

      var foldersSlice = this.api.viewFolders('account', account);
      foldersSlice.oncomplete = (function() {
        this.foldersSlice = foldersSlice;
        this.foldersSlice.onchange = this.notifyFoldersSliceOnChange.bind(this);
        this.selectInbox(callback);
        this._callEmit('foldersSlice');
      }).bind(this);
    },

    /**
     * Given an account ID, change the current account to that account.
     * @param  {String} accountId
     * @return {Function} callback
     */
    changeAccountFromId: function(accountId, callback) {
      if (!this.acctsSlice || !this.acctsSlice.items.length) {
        throw new Error('No accounts available');
      }

      this.acctsSlice.items.some(function(account) {
        if (account.id === accountId) {
          this.changeAccount(account, callback);
          return true;
        }
      }.bind(this));
    },

    /**
     * Just changes the folder property tracked by the model.
     * Assumes the folder still belongs to the currently tracked
     * account. It also does not result in any state changes or
     * event emitting if the new folder is the same as the
     * currently tracked folder.
     * @param  {Object} folder the folder object to use.
     */
    changeFolder: function(folder) {
      if (folder && (!this.folder || folder.id !== this.folder.id)) {
        this.folder = folder;
        this._callEmit('folder');
      }
    },

    /**
     * For the already loaded account and associated foldersSlice,
     * set the inbox as the tracked 'folder'.
     * @param  {Function} callback function called once the inbox
     * has been selected.
     */
    selectInbox: function(callback) {
      this.selectFirstFolderWithType('inbox', callback);
    },

    /**
     * For the already loaded account and associated foldersSlice, set
     * the given folder as the tracked folder. The account MUST have a
     * folder with the given type, or a fatal error will occur.
     */
    selectFirstFolderWithType: function(folderType, callback) {
      if (!this.foldersSlice) {
        throw new Error('No foldersSlice available');
      }

      var folder = this.foldersSlice.getFirstFolderWithType(folderType);
      if (!folder) {
        dieOnFatalError('We have an account without a folderType ' +
                        folderType + '!', this.foldersSlice.items);
      }

      if (this.folder && this.folder.id === folder.id) {
        if (callback) {
          callback();
        }
      } else {
        if (callback) {
          this.once('folder', callback);
        }
        this.changeFolder(folder);
      }
    },

    /**
     * Called by other code when it knows the current account
     * has received new inbox messages. Just triggers an
     * event with the count for now.
     * @param  {Object} accountUpdate update object from
     * sync.js accountResults object structure.
     */
    notifyInboxMessages: function(accountUpdate) {
      if (accountUpdate.id === this.account.id) {
        model.emit('newInboxMessages', accountUpdate.count);
      }
    },

    /**
     * Triggered by the foldersSlice onchange event
     * @param  {Object} folder the folder that changed.
     */
    notifyFoldersSliceOnChange: function(folder) {
      model.emit('foldersSliceOnChange', folder);
    },

    notifyBackgroundSendStatus: function(data) {
      model.emit('backgroundSendStatus', data);
    },

    // Lifecycle

    _dieFolders: function() {
      if (this.foldersSlice) {
        this.foldersSlice.die();
      }
      this.foldersSlice = null;

      this.folder = null;
    },

    die: function() {
      if (this.acctsSlice) {
        this.acctsSlice.die();
      }
      this.acctsSlice = null;
      this.account = null;

      this._dieFolders();
    }
  };

  return evt.mix(model);
});

/* exported MimeMapper */


/**
 * MimeMapper helps gaia apps to decide the mapping of mimetype and extension.
 * The use cases often happen when apps need to know about the exact
 * mimetypes or extensions, such as to delegate the open web activity, we must
 * have suitable mimetypes or extensions to request the right activity
 *
 * The mapping is basically created according to:
 * http://en.wikipedia.org/wiki/Internet_media_type
 *
 * The supported formats are considered base on the deviceStorage properties:
 * http://dxr.mozilla.org/mozilla-central/toolkit/content/
 * devicestorage.properties
 *
 */

var MimeMapper = {
  // This list only contains the extensions we currently supported
  // We should make it more complete for further usages
  _typeToExtensionMap: {
    // Image
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/gif': 'gif',
    'image/bmp': 'bmp',
    // Audio
    'audio/mpeg': 'mp3',
    'audio/mp4': 'm4a',
    'audio/ogg': 'ogg',
    'audio/webm': 'webm',
    'audio/3gpp': '3gp',
    'audio/amr': 'amr',
    // Video
    'video/mp4': 'mp4',
    'video/mpeg': 'mpg',
    'video/ogg': 'ogg',
    'video/webm': 'webm',
    'video/3gpp': '3gp',
    'video/3gpp2': '3g2',
    // Application
    // If we want to support some types, like pdf, just add
    // 'application/pdf': 'pdf'
    'application/vcard': 'vcf',
    // Text
    'text/vcard': 'vcf',
    'text/x-vcard': 'vcf'
  },

  // This list only contains the mimetypes we currently supported
  // We should make it more complete for further usages
  _extensionToTypeMap: {
    // Image
    'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg',
    'jpe': 'image/jpeg',
    'png': 'image/png',
    'gif': 'image/gif',
    'bmp': 'image/bmp',
    // Audio
    'mp3': 'audio/mpeg',
    'm4a': 'audio/mp4',
    'm4b': 'audio/mp4',
    'm4p': 'audio/mp4',
    'm4r': 'audio/mp4',
    'aac': 'audio/aac',
    'opus': 'audio/ogg',
    'amr': 'audio/amr',
    // Video
    'mp4': 'video/mp4',
    'mpeg': 'video/mpeg',
    'mpg': 'video/mpeg',
    'ogv': 'video/ogg',
    'ogx': 'video/ogg',
    'webm': 'video/webm',
    '3gp': 'video/3gpp',
    '3g2': 'video/3gpp2',
    'ogg': 'video/ogg',
    // Application
    // If we want to support some extensions, like pdf, just add
    // 'pdf': 'application/pdf'
    // Text
    'vcf': 'text/vcard'
  },
  _parseExtension: function(filename) {
    var array = filename.split('.');
    return array.length > 1 ? array.pop() : '';
  },

  isSupportedType: function(mimetype) {
    return (mimetype in this._typeToExtensionMap);
  },

  isSupportedExtension: function(extension) {
    return (extension in this._extensionToTypeMap);
  },

  isFilenameMatchesType: function(filename, mimetype) {
    var extension = this._parseExtension(filename);
    var guessedType = this.guessTypeFromExtension(extension);
    return (guessedType == mimetype);
  },

  guessExtensionFromType: function(mimetype) {
    return this._typeToExtensionMap[mimetype];
  },

  guessTypeFromExtension: function(extension) {
    return this._extensionToTypeMap[extension];
  },

  // If mimetype is not in the supported list, we will try to
  // predict the possible valid mimetype based on extension.
  guessTypeFromFileProperties: function(filename, mimetype) {
    var extension = this._parseExtension(filename);
    var type = this.isSupportedType(mimetype) ?
      mimetype : this.guessTypeFromExtension(extension);
    return type || '';
  },

  // if mimetype is not supported, preserve the original extension
  // and add the predict result as new extension.
  // If both filename and mimetype are not supported, return the original
  // filename.
  ensureFilenameMatchesType: function(filename, mimetype) {
    if (!this.isFilenameMatchesType(filename, mimetype)) {
      var guessedExt = this.guessExtensionFromType(mimetype);
      if (guessedExt) {
        filename += '.' + guessedExt;
      }
    }
    return filename;
  }
};

define("shared/js/mime_mapper", (function (global) {
    return function () {
        var ret, fn;
        return ret || global.MimeMapper;
    };
}(this)));


define('attachment_name',['require','l10n!','shared/js/mime_mapper'],function(require) {
  var mozL10n = require('l10n!'),
      mapper = require('shared/js/mime_mapper');

  var attachmentName = {
    /**
     * Given a blob, and a possible name, make sure a text name
     * is constructed. If name is already a value, that is used,
     * otherwise, the blob type and the count are used to generate
     * a name.
     * @param  {Blob} blob the blog associated with the attachment.
     * @param  {String} [name] possible existing name.
     * @param  {Number} [count] a count to use in the generated name.
     * @return {String}
     */
    ensureName: function(blob, name, count) {
      if (!name) {
        count = count || 1;
        var suffix = mapper.guessExtensionFromType(blob.type);
        name = mozL10n.get('default-attachment-filename', { n: count }) +
                       (suffix ? ('.' + suffix) : '');
      }
      return name;
    },

    /**
     * Given an array of blobs and a corresponding array of file names,
     * make sure there is a file name entry for each blob. If a file name
     * is missing, generate one using part of the mime type of the blob
     * as the file extension in the name. This method MODIFIES the
     * names array, and expects names to be an array.
     * @param  {Array} blobs the blobs that need names.
     * @return {Array} Array of strings.
     */
    ensureNameList: function(blobs, names) {
      for (var i = 0; i < blobs.length; i++) {
        names[i] = attachmentName.ensureName(blobs[i], names[i], i + 1);
      }
    }
  };

  return attachmentName;
});

define('query_uri',[],function() {
  
  // Some sites may not get URI encoding correct, so this protects
  // us from completely failing in those cases.
  function decode(value) {
    try {
      return decodeURIComponent(value);
    } catch (err) {
      console.error('Skipping "' + value +
                    '", decodeURIComponent error: ' + err);
      return '';
    }
  }

  function queryURI(uri) {
    function addressesToArray(addresses) {
      if (!addresses) {
        return [];
      }
      addresses = addresses.split(/[,;]/);
      var addressesArray = addresses.filter(function notEmpty(addr) {
        return addr.trim() !== '';
      });
      return addressesArray;
    }
    var mailtoReg = /^mailto:(.*)/i;
    var obj = {};

    if (uri && uri.match(mailtoReg)) {
      uri = uri.match(mailtoReg)[1];
      var parts = uri.split('?');
      var subjectReg = /(?:^|&)subject=([^\&]*)/i,
      bodyReg = /(?:^|&)body=([^\&]*)/i,
      ccReg = /(?:^|&)cc=([^\&]*)/i,
      bccReg = /(?:^|&)bcc=([^\&]*)/i;
      // Check if the 'to' field is set and properly decode it
      obj.to = parts[0] ? addressesToArray(decode(parts[0])) : [];

      if (parts.length == 2) {
        var data = parts[1];
        if (data.match(subjectReg)) {
          obj.subject = decode(data.match(subjectReg)[1]);
        }
        if (data.match(bodyReg)) {
          obj.body = decode(data.match(bodyReg)[1]);
        }
        if (data.match(ccReg)) {
          obj.cc = addressesToArray(decode(data.match(ccReg)[1]));
        }
        if (parts[1].match(bccReg)) {
          obj.bcc = addressesToArray(decode(data.match(bccReg)[1]));
        }
      }
    }

    return obj;
  }

  return queryURI;
});



define('activity_composer_data',['require','exports','module','attachment_name','query_uri'],function(require, exports, module) {
  var attachmentName = require('attachment_name'),
      queryUri = require('query_uri');

  return function activityComposeR(rawActivity) {
    // Parse the activity request.
    var source = rawActivity.source;
    var data = source.data;
    var activityName = source.name;
    var dataType = data.type;
    var url = data.url || data.URI;

    var attachData;
    if (dataType === 'url' && activityName === 'share') {
      attachData = {
        body: url
      };
    } else {
      attachData = queryUri(url);
      attachData.attachmentBlobs = data.blobs || [];
      attachData.attachmentNames = data.filenames || [];

      attachmentName.ensureNameList(attachData.attachmentBlobs,
                                    attachData.attachmentNames);
    }

    return {
      onComposer: function(composer, composeCard) {
        var attachmentBlobs = attachData.attachmentBlobs;
        /* to/cc/bcc/subject/body all have default values that shouldn't
        be clobbered if they are not specified in the URI*/
        if (attachData.to) {
          composer.to = attachData.to;
        }
        if (attachData.subject) {
          composer.subject = attachData.subject;
        }
        if (attachData.body) {
          composer.body = { text: attachData.body };
        }
        if (attachData.cc) {
          composer.cc = attachData.cc;
        }
        if (attachData.bcc) {
          composer.bcc = attachData.bcc;
        }
        if (attachmentBlobs) {
          var attachmentsToAdd = [];
          for (var iBlob = 0; iBlob < attachmentBlobs.length; iBlob++) {
            attachmentsToAdd.push({
              name: attachData.attachmentNames[iBlob],
              blob: attachmentBlobs[iBlob]
            });
          }
          composeCard.addAttachmentsSubjectToSizeLimits(attachmentsToAdd);
        }
      }
    };
  };
});


define('cards_init',['require'],function(require) {
  return function cardsInit(cards) {
    // Handle cases where a default card is needed for back navigation
    // after a non-default entry point (like an activity) is triggered.
    cards.pushDefaultCard = function(onPushed) {
      cards.pushCard('message_list', 'none', {
        onPushed: onPushed
      },
      // Default to "before" placement.
      'left');
    };
  };
});

// These vars are set in html_cache_restore as a globals.

define('html_cache',['require','exports','module','l10n!'],function(require, exports) {

var mozL10n = require('l10n!');

/**
 * Safely clone a node so that it is inert and no document.registerElement
 * callbacks or magic happens.  This is not particularly intuitive, so it
 * needs a helper method and that helper method needs an appropriately
 * scary/warning-filled name.
 *
 * The most non-obvious thing here is that
 * document.implementation.createHTMLDocument() will create a document that
 * has the same custom element registry as our own, so using importNode
 * on such a document will not actually fix anything!  But a "template"
 * element's contents owner document does use a new registry, so we use
 * that.
 *
 * See the spec's details on this at:
 * http://w3c.github.io/webcomponents/spec/custom/
 *   #creating-and-passing-registries
 */
exports.cloneAsInertNodeAvoidingCustomElementHorrors = function(node) {
  // Create a template node with a new registry.  In theory we could
  // cache this node as long as we're sure no one goes and registers
  // anything in its registry.  Not caching it may result in slightly
  // more GC/memory turnover.
  var templateNode = document.createElement('template');
  // content is a DocumentFragment which does not have importNode, so we need
  // its ownerDocument.
  var cacheDoc = templateNode.content.ownerDocument;
  return cacheDoc.importNode(node, true); // yes, deep
};

/**
 * Saves a JS object to document.cookie using JSON.stringify().
 * This method claims all cookie keys that have pattern
 * /htmlc(\d+)/
 */
exports.save = function htmlCacheSave(moduleId, html) {
  // Only save the last part of the module ID as the cache key. This is specific
  // to how email lays out all card modules in a 'cards/' module ID prefix, and
  // with all / and underscores turned to dashes for component names.
  var id = exports.moduleIdToKey(moduleId);

  var langDir = document.querySelector('html').getAttribute('dir');
  html = window.HTML_CACHE_VERSION + (langDir ? ',' + langDir : '') +
         ':' + html;
  localStorage.setItem('html_cache_' + id, html);

  console.log('htmlCache.save ' + id + ': ' +
              html.length + ', lang dir: ' + langDir);
};

/**
 * Clears all the cache.
 */
exports.reset = function() {
  localStorage.clear();

  // Clear cookie cache for historical purposes, when the html cache used to be
  // a cookie cache. This can be removed once it is unlikely a person with a
  // 2.2 or earlier gaia might upgrade to a version with a localStorage cache.
  var expiry = Date.now() + (20 * 365 * 24 * 60 * 60 * 1000);
  expiry = (new Date(expiry)).toUTCString();
  for (var i = 0; i < 40; i++) {
    document.cookie = 'htmlc' + i + '=; expires=' + expiry;
  }

  console.log('htmlCache reset');
};

// If the locale changes, clear the cache so that incorrectly localized cache
// is not shown on the next eamil launch.
window.addEventListener('languagechange', exports.reset);

exports.moduleIdToKey = function moduleIdToKey(moduleId) {
  return moduleId.replace(/^cards\//, '').replace(/-/g, '_');
};

// XXX when a bigger rename can happen, remove the need
// to translate between custom element names and moz-style
// underbar naming, and consider the card- as part of the
// input names.
exports.nodeToKey = function nodeToKey(node) {
  return node.nodeName.toLowerCase().replace(/^cards-/, '').replace(/-/g, '_');
};

/**
 * Does a very basic clone of the given node and schedules it for saving as a
 * cached entry point. WARNING: only use this for very simple cards that do not
 * need to do any customization.
 */
exports.cloneAndSave = function cloneAndSave(moduleId, node) {
  var cachedNode = exports.cloneAsInertNodeAvoidingCustomElementHorrors(node);
  // Since this node is not inserted into the document, translation
  // needs to be manually triggered, and the cloneNode happens before
  // the async Mutation Observer work mozL10n fires.
  mozL10n.translateFragment(cachedNode);
  cachedNode.dataset.cached = 'cached';
  exports.delayedSaveFromNode(moduleId, cachedNode);
};

/**
 * Serializes the node to storage. NOTE: it modifies the node tree, and
 * cloneNode(true) is *NOT SAFE* because of custom element semantics, so
 * you must use cloneAsInertNodeAvoidingCustomElementHorrors(node) on
 * your node and pass that to us.  (And you call it instead of us because
 * you probably really want to perform some transforms/filtering before you
 * pass the node to us.)
 * @param  {Node} node Node to serialize to storage.
 */
exports.saveFromNode = function saveFromNode(moduleId, node) {
  // Make sure card will be visible in center of window. For example,
  // if user clicks on "search" or some other card is showing when
  // message list's atTop is received, then the node could be
  // off-screen when it is passed to this function.
  var cl = node.classList;
  cl.remove('before');
  cl.remove('after');
  cl.add('center');

  var html = node.outerHTML;
  exports.save(moduleId, html);
};

/**
 * setTimeout ID used to track delayed save.
 */
var delayedSaveId = 0;

/**
 * Node to save on a delayed save.
 */
var delayedNode = '';

/**
 * Like saveFromNode, but on a timeout. NOTE: it modifies the node tree,
 * so pass use cloneNode(true) on your node if you use it for other
 * things besides this call.
 * @param  {Node} node Node to serialize to storage.
 */
exports.delayedSaveFromNode = function delayedSaveFromNode(moduleId, node) {
  delayedNode = node;
  if (!delayedSaveId) {
    delayedSaveId = setTimeout(function() {
      delayedSaveId = 0;
      exports.saveFromNode(moduleId, delayedNode);
      delayedNode = null;
    }, 500);
  }
};

});


define('tmpl',['l10n!'], function(mozL10n) {
  var tmpl = {
    pluginBuilder: './tmpl_builder',

    toDom: function(text) {
        var temp = document.createElement('div');
        temp.innerHTML = text;
        var node = temp.children[0];
        mozL10n.translateFragment(node);
        return node;
    },

    load: function(id, require, onload, config) {
      require(['text!' + id], function(text) {
        var node = tmpl.toDom(text);
        onload(node);
      });
    }
  };

  return tmpl;
});

define('tmpl!cards/toaster.html',['tmpl'], function (tmpl) { return tmpl.toDom('<section role="status" class="toaster collapsed">\n  <p class="toaster-text"></p>\n  <div class="toaster-action-target"><button class="toaster-action"></button></div>\n</section>\n'); });


define('toaster',['require','l10n!','tmpl!./cards/toaster.html'],function(require) {
  var mozL10n = require('l10n!');
  var toasterNode = require('tmpl!./cards/toaster.html');

  /**
   * Manages the display of short status notifications, or 'toasts'.
   * Each toast may optionally include an action button. Common uses
   * may include:
   *
   * - Displaying notifications about message sending status
   * - Allowing the user to undo flags/moves/deletes
   * - Allowing the user to retry a failed operation, if applicable
   *
   * This class is a singleton, because there is only room for one
   * toaster on the screen at a time. Subsequent 'toasts' will remove
   * any previously-displaying toast.
   */
  var toaster = {

    defaultTimeout: 5000,

    /**
     * Tracks the CSS class that was previously applied to the action button,
     * so it can be removed on next display.
     */
    _previousActionClass: undefined,

    /**
     * Initialize the Toaster, adding things to the DOM and setting up
     * event handlers. The toaster starts out invisible.
     */
    init: function(parentEl) {
      this.el = toasterNode;
      parentEl.appendChild(this.el);
      this.text = this.el.querySelector('.toaster-text');
      this.actionButton = this.el.querySelector('.toaster-action');

      this.el.addEventListener('click', this.hide.bind(this));
      this.el.addEventListener('transitionend', this.hide.bind(this));

      // The target is used for the action to allow a larger tap target than
      // just the button.
      this.el.querySelector('.toaster-action-target')
          .addEventListener('click', this.onAction.bind(this));

      this.currentToast = null; // The data for the currently-displayed toast.
    },

    /**
     * Toast a potentially-undoable mail operation. If the operation
     * is undoable, an 'Undo' button will be shown, allowing the user
     * to undo the action, with one exception: The 'move' and 'delete'
     * operations currently do not allow 'undo' per bug 804916, so
     * those undo buttons are disabled.
     */
    toastOperation: function(op) {
      if (!op || !op.affectedCount) {
        return; // Nothing to do if no messages were affected.
      }

      // No undo for move/delete yet. <https://bugzil.la/804916>
      var type = op.operation;
      var canUndo = (op.undo && type !== 'move' && type !== 'delete');

      this.toast({
        text: mozL10n.get('toaster-message-' + type, { n: op.affectedCount }),
        actionLabel: mozL10n.get('toaster-undo'),
        actionClass: 'undo',
        action: canUndo && op.undo.bind(op)
      });
    },

    /**
     * Called when the user taps the action button (Undo, Retry, etc).
     */
    onAction: function() {
      var actionFunction = (this.currentToast && this.currentToast.action);
      this.hide();
      if (actionFunction) {
        actionFunction();
      }
    },

    /**
     * Display a transient message as a 'toast', with an optional
     * action button. The toast dismisses automatically, unless the
     * user taps the action button or the toast itself.
     *
     * @param {object} opts opts
     * @param {string} opts.text Localized status text to display.
     * @param {function} opts.action Optional function to call when the user
     *                               clicks the action button. If not provided,
     *                               the action button will not be visible.
     * @param {string} opts.actionLabel Label to display for the action button.
     *                                  Required only if `opts.action` is
     *                                  provided.
     * @param {string} opts.actionClass a CSS class name to apply to the action
     *                                  button.
     */
    toast: function(opts) {
      opts = opts || {};
      console.log('Showing toast:', JSON.stringify(opts));

      this.hide(); // Hide in case there was a previous toast already displayed.

      this.currentToast = opts;

      this.text.textContent = opts.text;
      this.actionButton.textContent = opts.actionLabel;

      if (this._previousActionClass) {
        this.actionButton.classList.remove(this._previousActionClass);
        this._previousActionClass = undefined;
      }
      if (opts.actionClass) {
        this._previousActionClass = opts.actionClass;
        this.actionButton.classList.add(this._previousActionClass);
      }

      this.el.classList.toggle('actionable', !opts.action);
      this.actionButton.disabled = !opts.action;
      this.el.classList.remove('collapsed');

      this._fadeTimeout = setTimeout(function() {
        // This will hide when the 'fadeout' is complete in 'transitionend'.
        this.el.classList.add('fadeout');
      }.bind(this), opts.timeout || this.defaultTimeout);
    },

    isShowing: function() {
      return !this.el.classList.contains('collapsed');
    },

    /**
     * Hide the current toast, if one was visible. Idempotent.
     */
    hide: function() {
      this.currentToast = null;
      this.el.classList.add('collapsed');
      this.el.classList.remove('fadeout');
      window.clearTimeout(this._fadeTimeout);
      this._fadeTimeout = null;
    }
  };

  return toaster;
});

/*
 * This file goes along with shared/style/input_areas.css
 * and is required to make the <button type="reset"> buttons work to clear
 * the form fields they are associated with.
 *
 * Bug 830127 should fix input_areas.css and move this JS functionality
 * to a shared JS file, so this file won't be in the email app for long.
 */

define('input_areas',['require','exports','module'],function(require, exports) {
  var slice = Array.prototype.slice;

  return function hookupInputAreaResetButtons(e) {
    // This selector is from shared/style/input_areas.css
    var selector = 'form p input + button[type="reset"],' +
          'form p textarea + button[type="reset"]';
    var resetButtons = slice.call(e.querySelectorAll(selector));
    resetButtons.forEach(function(resetButton) {
      resetButton.addEventListener('mousedown', function(e) {
        e.preventDefault();   // Don't take focus from the input field
      });
      resetButton.addEventListener('click', function(e) {
        e.target.previousElementSibling.value = ''; // Clear input field
        e.preventDefault();   // Don't reset the rest of the form.
      });
    });
  };
});


define('cards',['require','exports','module','cards_init','html_cache','l10n!','evt','toaster','input_areas'],function(require, exports, module) {

var cardsInit = require('cards_init'),
    htmlCache = require('html_cache'),
    mozL10n = require('l10n!'),
    evt = require('evt'),
    toaster = require('toaster'),
    hookupInputAreaResetButtons = require('input_areas');

function addClass(domNode, name) {
  if (domNode) {
    domNode.classList.add(name);
  }
}

function removeClass(domNode, name) {
  if (domNode) {
    domNode.classList.remove(name);
  }
}

/**
 * Fairly simple card abstraction with support for simple horizontal animated
 * transitions.  We are cribbing from deuxdrop's mobile UI's cards.js
 * implementation created jrburke.
 */
var cards = {
  _cardDefs: {},

  /*
   * Existing cards, left-to-right, new cards getting pushed onto the right.
   */
  _cardStack: [],
  activeCardIndex: -1,
  /*
   * @oneof[null @listof[cardName modeName]]{
   *   If a lazy load is causing us to have to wait before we push a card, this
   *   is the type of card we are planning to push.  This is used by hasCard
   *   to avoid returning misleading answers while an async push is happening.
   * }
   */
  _pendingPush: null,

  /**
   * Cards can stack on top of each other, make sure the stacked set is
   * visible over the lower sets.
   */
  _zIndex: 0,

  /**
   * The DOM node that contains the _containerNode ("#cardContainer") and which
   * we inject popup and masking layers into.  The choice of doing the popup
   * stuff at this layer is arbitrary.
   */
  _rootNode: null,

  /**
   * The "#cardContainer" node which serves as the scroll container for the
   * contained _cardsNode ("#cards").  It is as wide as the viewport.
   */
  _containerNode: null,

  /**
   * The "#cards" node that holds the cards; it is as wide as all of the cards
   * it contains and has its left offset changed in order to change what card
   * is visible.
   */
  _cardsNode: null,

  /**
   * The DOM nodes that should be removed from their parent when our current
   * transition ends.
   */
  _animatingDeadDomNodes: [],

  /**
   * Tracks the number of transition events per card animation. Since each
   * animation ends up with two transitionend events since two cards are
   * moving, need to wait for the last one to be finished before doing
   * cleanup, like DOM removal.
   */
  _transitionCount: 0,

  /**
   * Tracks if startup events have been emitted. The events only need to be
   * emitted once.
   * @type {Boolean}
   */
  _startupEventsEmitted: false,

  /**
   * Is a popup visible, suggesting that any click that is not on the popup
   * should be taken as a desire to close the popup?  This is not a boolean,
   * but rather info on the active popup.
   */
  _popupActive: null,

  /**
   * Are we eating all click events we see until we transition to the next
   * card (possibly due to a call to pushCard that has not yet occurred?).
   * Set by calling `eatEventsUntilNextCard`.
   */
  _eatingEventsUntilNextCard: false,

  /**
   * Initialize and bind ourselves to the DOM which should now be fully loaded.
   */
  init: function() {
    this._rootNode = document.body;
    this._containerNode = document.getElementById('cardContainer');
    this._cardsNode = document.getElementById('cards');

    this._statusColorMeta = document.querySelector('meta[name="theme-color"]');

    toaster.init(this._containerNode);

    this._containerNode.addEventListener('click',
                                         this._onMaybeIntercept.bind(this),
                                         true);

    // XXX be more platform detecty. or just add more events. unless the
    // prefixes are already gone with webkit and opera?
    this._cardsNode.addEventListener('transitionend',
                                     this._onTransitionEnd.bind(this),
                                     false);

    // Listen for visibility changes to let current card know of them too.
    // Do this here instead of each card needing to listen, and needing to know
    // if it is also the current card.
    document.addEventListener('visibilitychange', function(evt) {
      var card = this._cardStack[this.activeCardIndex];
      if (card && card.onCurrentCardDocumentVisibilityChange) {
        card.onCurrentCardDocumentVisibilityChange(document.hidden);
      }
    }.bind(this));

    cardsInit(this);
  },

  /**
   * If the tray is active and a click happens in the tray area, transition
   * back to the visible thing (which must be to our right currently.)
   */
  _onMaybeIntercept: function(event) {
    if (this._eatingEventsUntilNextCard) {
      event.stopPropagation();
      event.preventDefault();
      return;
    }
    if (this._popupActive) {
      event.stopPropagation();
      event.preventDefault();
      this._popupActive.close();
      return;
    }

    // Find the card containing the event target.
    var cardNode = event.target;
    for (cardNode = event.target; cardNode; cardNode = cardNode.parentElement) {
      if (cardNode.classList.contains('card')) {
        break;
      }
    }
  },

  /**
   * Push a card onto the card-stack.
   */
  /* @args[
   *   @param[type]
   *   @param[showMethod @oneof[
   *     @case['animate']{
   *       Perform an animated scrolling transition.
   *     }
   *     @case['immediate']{
   *       Immediately warp to the card without animation.
   *     }
   *     @case['none']{
   *       Don't touch the view at all.
   *     }
   *   ]]
   *   @param[args Object]{
   *     An arguments object to provide to the card's constructor when
   *     instantiating.
   *   }
   *   @param[placement #:optional @oneof[
   *     @case[undefined]{
   *       The card gets pushed onto the end of the stack.
   *     }
   *     @case['left']{
   *       The card gets inserted to the left of the current card.
   *     }
   *     @case['right']{
   *       The card gets inserted to the right of the current card.
   *     }
   *   }
   * ]
   */
  pushCard: function(type, showMethod, args, placement) {
    var cardDef = this._cardDefs[type];

    args = args || {};

    if (!cardDef) {
      var cbArgs = Array.prototype.slice.call(arguments);
      this._pendingPush = [type];

      // Only eat clicks if the card will be visibly displayed.
      if (showMethod !== 'none') {
        this.eatEventsUntilNextCard();
      }

      require(['element!cards/' + type], function(Ctor) {
        this._cardDefs[type] = Ctor;
        this.pushCard.apply(this, cbArgs);
      }.bind(this));
      return;
    }

    this._pendingPush = null;

    console.log('pushCard for type: ' + type);

    var domNode = args.cachedNode || new cardDef();

    if (args && domNode.onArgs) {
      domNode.onArgs(args);
    }

    var cardIndex, insertBuddy;
    if (!placement) {
      cardIndex = this._cardStack.length;
      insertBuddy = null;
      domNode.classList.add(cardIndex === 0 ? 'before' : 'after');
    }
    else if (placement === 'left') {
      cardIndex = this.activeCardIndex++;
      insertBuddy = this._cardsNode.children[cardIndex];
      domNode.classList.add('before');
    }
    else if (placement === 'right') {
      cardIndex = this.activeCardIndex + 1;
      if (cardIndex >= this._cardStack.length) {
        insertBuddy = null;
      } else {
        insertBuddy = this._cardsNode.children[cardIndex];
      }
      domNode.classList.add('after');
    }
    this._cardStack.splice(cardIndex, 0, domNode);

    if (!args.cachedNode) {
      this._cardsNode.insertBefore(domNode, insertBuddy);
    }

    // If the card has any <button type="reset"> buttons,
    // make them clear the field they're next to and not the entire form.
    // See input_areas.js and shared/style/input_areas.css.
    hookupInputAreaResetButtons(domNode);

    // Only do auto font size watching for cards that do not have more
    // complicated needs, like message_list, which modifies children contents
    // that are not caught by the font_size_util.
    if (!domNode.callHeaderFontSize) {
      // We're appending new elements to DOM so to make sure headers are
      // properly resized and centered, we emit a lazyload event.
      // This will be removed when the gaia-header web component lands.
      window.dispatchEvent(new CustomEvent('lazyload', {
        detail: domNode
      }));
    }

    if ('postInsert' in domNode) {
      domNode.postInsert();
    }

    if (showMethod !== 'none') {
      // make sure the reflow sees the new node so that the animation
      // later is smooth.
      if (!args.cachedNode) {
        domNode.clientWidth;
      }

      this._showCard(cardIndex, showMethod, 'forward');
    }

    if (args.onPushed) {
      args.onPushed(domNode);
    }
  },

  /**
   * Pushes a new card if none exists, otherwise, uses existing
   * card and passes args to that card via tellCard. Arguments
   * are the same as pushCard.
   * @return {Boolean} true if card was pushed.
   */
  pushOrTellCard: function(type, showMethod, args, placement) {
    var query = type;
    if (this.hasCard(query)) {
      this.tellCard(query, args);
      return false;
    } else {
      this.pushCard.apply(this, Array.prototype.slice.call(arguments));
      return true;
    }
  },

  /**
   * Sets the status bar color. The element, or any of its children, can specify
   * the color by setting data-statuscolor to one of the following values:
   * - default: uses the default data-statuscolor set on the meta theme-color
   * tag is used.
   * - background: the CSS background color, via getComputedStyle, is used. This
   * is useful if the background that is desired is not the one from the element
   * itself, but from one of its children.
   * - a specific color value.
   *
   * If no data-statuscolor attribute is found, then the background color for
   * the element, via getComputedStyle, is used. If that value is not a valid
   * color value, then the default statuscolor on the meta tag is used.
   *
   * Note that this method uses getComputedStyle. This could be expensive
   * depending on when it is called. For the card infrastructure, since it is
   * done as part of a card transition, and done before the card transition code
   * applies transition styles, the target element should not be visible at the
   * time of the query. In practice no negligble end user effect has been seen,
   * and that query is much more desirable than hardcoding colors in JS or HTML.
   *
   * @param {Element} [element] the card element of interest. If no element is
   * passed, the the current card is used.
   */
  setStatusColor: function(element) {
    var color;
    // Some use cases, like dialogs, are outside the card stack, so they may
    // not know what element to use for a baseline. In those cases, Cards
    // decides the target element.
    if (!element) {
      element = this._cardStack[this.activeCardIndex];
    }

    // Try first for specific color override. Do a node query, since for custom
    // elements, the custom elment tag may not set its color, but the template
    // used inside the tag may.
    var statusElement = element.dataset.statuscolor ? element :
                        element.querySelector('[data-statuscolor]');

    if (statusElement) {
      color = statusElement.dataset.statuscolor;
      // Allow cards to just indicate they want the default.
      if (color === 'default') {
        color = null;
      } else if (color === 'background') {
        color = getComputedStyle(statusElement).backgroundColor;
      }
    } else {
      // Just use the background color of the original element.
      color = getComputedStyle(element).backgroundColor;
    }

    // Only use specific color values, not values like 'transparent'.
    if (color && color.indexOf('rgb') !== 0 && color.indexOf('#') !== 0) {
      color = null;
    }

    color = color || this._statusColorMeta.dataset.statuscolor;
    var existingColor = this._statusColorMeta.getAttribute('content');
    if (color !== existingColor) {
      this._statusColorMeta.setAttribute('content', color);
    }
  },

  _findCardUsingType: function(type) {
    for (var i = 0; i < this._cardStack.length; i++) {
      var domNode = this._cardStack[i];
      if (htmlCache.nodeToKey(domNode) === type) {
        return i;
      }
    }
  },

  _findCard: function(query, skipFail) {
    var result;
    if (typeof query === 'string') {
      result = this._findCardUsingType(query, skipFail);
    } else if (typeof(query) === 'number') { // index number
      result = query;
    } else {
      // query is a DOM node in this case
      result = this._cardStack.indexOf(query);
    }

    if (result > -1) {
      return result;
    } else if (!skipFail) {
      throw new Error('Unable to find card with query:', query);
    } else {
      // Returning undefined explicitly so that index comparisons, like
      // the one in hasCard, are correct.
      return undefined;
    }
  },

  hasCard: function(query) {
    if (this._pendingPush && this._pendingPush === query) {
      return true;
    }

    return this._findCard(query, true) > -1;
  },

  isVisible: function(domNode) {
    return !!(domNode &&
              domNode.classList.contains('center'));
  },

  findCardObject: function(query) {
    return this._cardStack[this._findCard(query)];
  },

  getCurrentCardType: function() {
    var result = null,
        card = this._cardStack[this.activeCardIndex];

    // Favor any _pendingPush value as it is about to
    // become current, just waiting on an async cycle
    // to finish. Otherwise use current card value.
    if (this._pendingPush) {
      result = this._pendingPush;
    } else if (card) {
      result = htmlCache.nodeToKey(card);
    }
    return result;
  },

  // Filter is an optional paramater. It is a function that returns
  // true if the folder passed to it should be included in the selector
  folderSelector: function(callback, filter) {
    var self = this;

    require(['model', 'value_selector'], function(model, ValueSelector) {
      // XXX: Unified folders will require us to make sure we get the folder
      //      list for the account the message originates from.
      if (!self.folderPrompt) {
        var selectorTitle = mozL10n.get('messages-folder-select');
        self.folderPrompt = new ValueSelector(selectorTitle);
      }

      model.latestOnce('foldersSlice', function(foldersSlice) {
        var folders = foldersSlice.items;
        folders.forEach(function(folder) {
          var isMatch = !filter || filter(folder);
          if (folder.neededForHierarchy || isMatch) {
            self.folderPrompt.addToList(folder.name, folder.depth,
              isMatch,
              function(folder) {
                return function() {
                  self.folderPrompt.hide();
                  callback(folder);
                };
              }(folder));
          }
        });
        self.folderPrompt.show();
      });
    });
  },

  moveToCard: function(query, showMethod) {
    this._showCard(this._findCard(query), showMethod || 'animate');
  },

  tellCard: function(query, what) {
    var cardIndex = this._findCard(query),
        domNode = this._cardStack[cardIndex];
    if (!('told' in domNode)) {
      console.warn('Tried to tell a card that\'s not listening!', query, what);
    } else {
      domNode.told(what);
    }
  },

  /**
   * Remove the card identified by its DOM node and all the cards to its right.
   * Pass null to remove all of the cards! If cardDomNode passed, but there
   * are no cards before it, cards.getDefaultCard is called to set up a before
   * card.
   */
  /* @args[
   *   @param[cardDomNode]{
   *     The DOM node that is the first card to remove; all of the cards to its
   *     right will also be removed.  If null is passed it is understood you
   *     want to remove all cards.
   *   }
   *   @param[showMethod @oneof[
   *     @case['animate']{
   *       Perform an animated scrolling transition.
   *     }
   *     @case['immediate']{
   *       Immediately warp to the card without animation.
   *     }
   *     @case['none']{
   *       Remove the nodes immediately, don't do anything about the view
   *       position.  You only want to do this if you are going to push one
   *       or more cards and the last card will use a transition of 'immediate'.
   *     }
   *   ]]
   *   @param[numCards #:optional Number]{
   *     The number of cards to remove.  If omitted, all the cards to the right
   *     of this card are removed as well.
   *   }
   *   @param[nextCardSpec #:optional]{
   *     If a showMethod is not 'none', the card to show after removal.
   *   }
   *   @param[skipDefault #:optional Boolean]{
   *     Skips the default pushCard if the removal ends up with no more
   *     cards in the stack.
   *   }
   * ]
   */
  removeCardAndSuccessors: function(cardDomNode, showMethod, numCards,
                                    nextCardSpec, skipDefault) {
    if (!this._cardStack.length) {
      return;
    }

    if (cardDomNode && this._cardStack.length === 1 && !skipDefault) {
      // No card to go to when done, so ask for a default
      // card and continue work once it exists.
      return cards.pushDefaultCard(function() {
        this.removeCardAndSuccessors(cardDomNode, showMethod, numCards,
                                    nextCardSpec);
      }.bind(this));
    }

    var firstIndex, iCard, domNode;
    if (cardDomNode === undefined) {
      throw new Error('undefined is not a valid card spec!');
    }
    else if (cardDomNode === null) {
      firstIndex = 0;
      // reset the z-index to 0 since we may have cards in the stack that
      // adjusted the z-index (and we are definitively clearing all cards).
      this._zIndex = 0;
    }
    else {
      for (iCard = this._cardStack.length - 1; iCard >= 0; iCard--) {
        domNode = this._cardStack[iCard];
        if (domNode === cardDomNode) {
          firstIndex = iCard;
          break;
        }
      }
      if (firstIndex === undefined) {
        throw new Error('No card represented by that DOM node');
      }
    }
    if (!numCards) {
      numCards = this._cardStack.length - firstIndex;
    }

    if (showMethod === 'none') {
      // If a 'none' remove, and the remove is for a DOM node that used
      // anim-overlay, which would have increased the _zIndex when added, adjust
      // the zIndex appropriately.
      if (cardDomNode && cardDomNode.classList.contains('anim-overlay')) {
        this._zIndex -= 10;
      }
    } else {
      var nextCardIndex = -1;
      if (nextCardSpec) {
        nextCardIndex = this._findCard(nextCardSpec);
      } else if (this._cardStack.length) {
        nextCardIndex = Math.min(firstIndex - 1, this._cardStack.length - 1);
      }

      if (nextCardIndex > -1) {
        this._showCard(nextCardIndex, showMethod, 'back');
      }
    }

    // Update activeCardIndex if nodes were removed that would affect its
    // value.
    if (firstIndex <= this.activeCardIndex) {
      this.activeCardIndex -= numCards;
      if (this.activeCardIndex < -1) {
        this.activeCardIndex = -1;
      }
    }

    var deadDomNodes = this._cardStack.splice(
                          firstIndex, numCards);
    for (iCard = 0; iCard < deadDomNodes.length; iCard++) {
      domNode = deadDomNodes[iCard];
      try {
        domNode.die();
      }
      catch (ex) {
        console.warn('Problem cleaning up card:', ex, '\n', ex.stack);
      }
      switch (showMethod) {
        case 'animate':
        case 'immediate': // XXX handle properly
          this._animatingDeadDomNodes.push(domNode);
          break;
        case 'none':
          domNode.parentNode.removeChild(domNode);
          break;
      }
    }

    // Reset aria-hidden attributes to handle cards visibility.
    this._setScreenReaderVisibility();
  },

  /**
   * Shortcut for removing all the cards
   */
  removeAllCards: function() {
    return this.removeCardAndSuccessors(null, 'none');
  },

  _showCard: function(cardIndex, showMethod, navDirection) {
    // Do not do anything if this is a show card for the current card.
    if (cardIndex === this.activeCardIndex) {
      return;
    }

    // If the active element is one that can have focus, blur it so that the
    // keyboard goes away.
    var activeElement = document.activeElement;
    if (activeElement && activeElement.blur) {
      activeElement.blur();
    }

    if (cardIndex > this._cardStack.length - 1) {
      // Some cards were removed, adjust.
      cardIndex = this._cardStack.length - 1;
    }
    if (this.activeCardIndex > this._cardStack.length - 1) {
      this.activeCardIndex = -1;
    }

    if (this.activeCardIndex === -1) {
      this.activeCardIndex = cardIndex === 0 ? cardIndex : cardIndex - 1;
    }

    var domNode = (cardIndex !== null) ? this._cardStack[cardIndex] : null;
    var beginNode = this._cardStack[this.activeCardIndex];
    var endNode = this._cardStack[cardIndex];
    var isForward = navDirection === 'forward';

    if (this._cardStack.length === 1) {
      // Reset zIndex so that it does not grow ever higher when all but
      // one card are removed
      this._zIndex = 0;
    }

    // If going forward and it is an overlay node, then do not animate the
    // beginning node, it will just sit under the overlay.
    if (isForward && endNode.classList.contains('anim-overlay')) {
      beginNode = null;

      // anim-overlays are the transitions to new layers in the stack. If
      // starting a new one, it is forward movement and needs a new zIndex.
      // Otherwise, going back to
      this._zIndex += 10;
    }

    // If going back and the beginning node was an overlay, do not animate
    // the end node, since it should just be hidden under the overlay.
    if (beginNode && beginNode.classList.contains('anim-overlay')) {
      if (isForward) {
        // If a forward animation and overlay had a vertical transition,
        // disable it, use normal horizontal transition.
        if (showMethod !== 'immediate') {
          if (beginNode.classList.contains('anim-vertical')) {
            removeClass(beginNode, 'anim-vertical');
            addClass(beginNode, 'disabled-anim-vertical');
          } else if (beginNode.classList.contains('anim-fade')) {
            removeClass(beginNode, 'anim-fade');
            addClass(beginNode, 'disabled-anim-fade');
          }
        }
      } else {
        this.setStatusColor(endNode);
        endNode = null;
        this._zIndex -= 10;
      }
    }

    // If the zindex is not zero, then in an overlay stack, adjust zindex
    // accordingly.
    if (endNode && isForward && this._zIndex) {
      endNode.style.zIndex = this._zIndex;
    }

    var cardsNode = this._cardsNode;

    // Do the status bar color work before triggering transitions, otherwise
    // we lose some animation frames on the card transitions.
    if (endNode) {
      this.setStatusColor(endNode);
    }

    if (showMethod === 'immediate') {
      addClass(beginNode, 'no-anim');
      addClass(endNode, 'no-anim');

      // make sure the reflow sees the transition is turned off.
      cardsNode.clientWidth;
      // explicitly clear since there will be no animation
      this._eatingEventsUntilNextCard = false;
    }
    else if (showMethod === 'none') {
      // do not set _eatingEventsUntilNextCard, but don't clear it either.
    }
    else {
      this._transitionCount = (beginNode && endNode) ? 2 : 1;
      this._eatingEventsUntilNextCard = true;
    }

    if (this.activeCardIndex === cardIndex) {
      // same node, no transition, just bootstrapping UI.
      removeClass(beginNode, 'before');
      removeClass(beginNode, 'after');
      addClass(beginNode, 'center');
    } else if (this.activeCardIndex > cardIndex) {
      // back
      removeClass(beginNode, 'center');
      addClass(beginNode, 'after');

      removeClass(endNode, 'before');
      addClass(endNode, 'center');
    } else {
      // forward
      removeClass(beginNode, 'center');
      addClass(beginNode, 'before');

      removeClass(endNode, 'after');
      addClass(endNode, 'center');
    }

    if (showMethod === 'immediate') {
      // make sure the instantaneous transition is seen before we turn
      // transitions back on.
      cardsNode.clientWidth;

      removeClass(beginNode, 'no-anim');
      removeClass(endNode, 'no-anim');

      this._onCardVisible(domNode);
    }

    // Hide toaster while active card index changed:
    toaster.hide();

    this.activeCardIndex = cardIndex;

    // Reset aria-hidden attributes to handle cards visibility.
    this._setScreenReaderVisibility();
  },

  _setScreenReaderVisibility: function() {
    // We use aria-hidden to handle visibility instead of CSS because there are
    // semi-transparent cards, such as folder picker.
    this._cardStack.forEach(function(card, index) {
      card.setAttribute('aria-hidden', index !== this.activeCardIndex);
    }, this);
  },

  _onTransitionEnd: function(event) {
    // Avoid other transitions except ones on cards as a whole.
    if (!event.target.classList.contains('card')) {
      return;
    }

    var activeCard = this._cardStack[this.activeCardIndex];
    // If no current card, this could be initial setup from cache, no valid
    // cards yet, so bail.
    if (!activeCard) {
      return;
    }

    // Multiple cards can animate, so there can be multiple transitionend
    // events. Only do the end work when all have finished animating.
    if (this._transitionCount > 0) {
      this._transitionCount -= 1;
    }

    if (this._transitionCount === 0) {
      if (this._eatingEventsUntilNextCard) {
        this._eatingEventsUntilNextCard = false;
      }
      if (this._animatingDeadDomNodes.length) {
        // Use a setTimeout to give the animation some space to settle.
        setTimeout(function() {
          this._animatingDeadDomNodes.forEach(function(domNode) {
            if (domNode.parentNode) {
              domNode.parentNode.removeChild(domNode);
            }
          });
          this._animatingDeadDomNodes = [];
        }.bind(this), 100);
      }

      // If an vertical overlay transition was was disabled, if
      // current node index is an overlay, enable it again.
      var endNode = activeCard;

      if (endNode.classList.contains('disabled-anim-vertical')) {
        removeClass(endNode, 'disabled-anim-vertical');
        addClass(endNode, 'anim-vertical');
      } else if (endNode.classList.contains('disabled-anim-fade')) {
        removeClass(endNode, 'disabled-anim-fade');
        addClass(endNode, 'anim-fade');
      }

      // If any action to do at the end of transition trigger now.
      if (this._afterTransitionAction) {
        var afterTransitionAction = this._afterTransitionAction;
        this._afterTransitionAction = null;
        afterTransitionAction();
      }

      this._onCardVisible(activeCard);

      // If the card has next cards that can be preloaded, load them now.
      // Use of nextCards should be balanced with startup performance.
      // nextCards can result in smoother transitions to new cards on first
      // navigation to that new card type, but loading the extra module may
      // also compete with current card and data model performance.
      var nextCards = activeCard.nextCards;
      if (nextCards) {
        console.log('Preloading cards: ' + nextCards);
        require(nextCards.map(function(id) {
          return 'cards/' + id;
        }));
      }
    }
  },

  /**
   * Handles final notification of card visibility in the stack.
   * @param  {Card} domNode the card instance.
   */
  _onCardVisible: function(domNode) {
    if (domNode.onCardVisible) {
      domNode.onCardVisible();
    }
    this._emitStartupEvents(domNode.skipEmitContentEvents);
  },

  /**
   * Handles emitting startup events used for performance tracking.
   * @param  {Boolean} skipEmitContentEvents if content events should be skipped
   * because the card itself handles it.
   */
  _emitStartupEvents: function(skipEmitContentEvents) {
    if (!this._startupEventsEmitted) {
      if (window.startupCacheEventsSent) {
        // Cache already loaded, so at this point the content shown is wired
        // to event handlers.
        window.performance.mark('contentInteractive');
        window.dispatchEvent(new CustomEvent('moz-content-interactive'));
      } else {
        // Cache was not used, so only now is the chrome dom loaded.
        window.performance.mark('navigationLoaded');
        window.dispatchEvent(new CustomEvent('moz-chrome-dom-loaded'));
      }
      window.performance.mark('navigationInteractive');
      window.dispatchEvent(new CustomEvent('moz-chrome-interactive'));

      // If a card that has a simple static content DOM, content is complete.
      // Otherwise, like message_list, need backend data to call complete.
      if (!skipEmitContentEvents) {
        evt.emit('metrics:contentDone');
      }

      this._startupEventsEmitted = true;
    }
  },

  /**
   * Helper that causes (some) events targeted at our cards to be eaten until
   * we get to the next card.  The idea is to avoid bugs caused by the user
   * still being able to click things while our cards are transitioning or
   * while we are performing a (reliable) async wait before we actually initiate
   * a pushCard in response to user stimulus.
   *
   * This is automatically triggered when performing an animated transition;
   * other code should only call this in the async wait case mentioned above.
   *
   * For example, we don't want the user to have 2 message readers happening
   * at the same time because they managed to click on a second message before
   * the first reader got displayed.
   */
  eatEventsUntilNextCard: function() {
    this._eatingEventsUntilNextCard = true;
  },

  /**
   * Stop eating events, presumably because eatEventsUntilNextCard was used
   * as a hack for a known-fast async operation to avoid bugs (where we knew
   * full well that we weren't going to show a card).
   */
  stopEatingEvents: function() {
    this._eatingEventsUntilNextCard = false;
  },

  /**
   * If there are any cards on the deck right now, log an error and clear them
   * all out.  Our caller is strongly asserting that there should be no cards
   * and the presence of any indicates a bug.
   */
  assertNoCards: function() {
    if (this._cardStack.length) {
      throw new Error('There are ' + this._cardStack.length + ' cards but' +
                      ' there should be ZERO');
    }
  }
};

return cards;

});



define('array',['require'],function(require) {
  var array = {
    /**
     * @param {Array} array some array.
     * @param {Function} callback function to test for each element.
     * @param {Object} thisObject object to use as this for callback.
     */
    indexOfGeneric: function(array, callback, thisObject) {
      var result = -1;
      array.some(function(value, index) {
        if (callback.call(thisObject, value)) {
          result = index;
          return true;
        }
      });

      return result;
    }
  };

  return array;
});

/*global define */

/**
 * @fileoverview Bug 918303 - HeaderCursor added to provide MessageListCard and
 *     MessageReaderCard the current message and whether there are adjacent
 *     messages that can be advanced to. Expect for [other] consumers to add
 *     additional data to messagesSlice items after they've left the MailAPI.
 */
define('header_cursor',['require','array','evt','model'],function(require) {
  var array = require('array'),
      evt = require('evt'),
      model = require('model');

  function makeListener(type, obj) {
    return function() {
      var args = Array.prototype.slice.call(arguments);
      this.emit.apply(this, ['messages_' + type].concat(args));
    }.bind(obj);
  }

  /**
   * @constructor
   */
  function HeaderCursor() {
    // Inherit from evt.Emitter.
    evt.Emitter.call(this);

    // Need to distinguish between search and nonsearch slices,
    // since there can be two cards that both are listening for
    // slice changes, but one is for search output, and one is
    // for nonsearch output. The message_list is an example.
    this.searchMode = 'nonsearch';
  }

  HeaderCursor.prototype = evt.mix({
    /**
     * @type {CurrentMessage}
     */
    currentMessage: null,

    /**
     * @type {HeadersViewSlice}
     */
    messagesSlice: null,

    /**
     * @type {String}
     */
    expectingMessageSuid: null,

    /**
     * @type {Array}
     */
    sliceEvents: ['splice', 'change', 'status', 'remove', 'complete'],

    _inited: false,

    /**
     * Sets up the event wiring and will trigger the slice creation by listening
     * to model 'folder' changes. Want to wait until there are views that need
     * to use the header_cursor for showing UI, to avoid extra work, like in the
     * background sync case.
     */
    init: function() {
      this._inited = true;

      // Listen for some slice events to do some special work.
      this.on('messages_splice', this.onMessagesSplice.bind(this));
      this.on('messages_remove', this.onMessagesSpliceRemove.bind(this));
      this.on('messages_complete', function() {
        // Consumers, like message_list, always want their 'complete' work
        // to fire, but by default the slice removes the complete handler
        // at the end. So rebind on each call here.
        if (this.messagesSlice) {
          this.messagesSlice.oncomplete = makeListener('complete', this);
        }
      }.bind(this));

      // Listen to model for folder changes.
      this.onLatestFolder = this.onLatestFolder.bind(this);
      model.latest('folder', this.onLatestFolder);
    },

    /**
     * The messageReader told us it wanted to advance, so we should go ahead
     * and update our currentMessage appropriately and then report the new one.
     *
     * @param {string} direction either 'next' or 'previous'.
     */
    advance: function(direction) {
      var index = this.indexOfMessageById(this.currentMessage.header.id);
      switch (direction) {
        case 'previous':
          index -= 1;
          break;
        case 'next':
          index += 1;
          break;
      }

      var messages = this.messagesSlice.items;
      if (index < 0 || index >= messages.length) {
        // We can't advance that far!
        return;
      }

      this.setCurrentMessageByIndex(index);
    },

    /**
     * Tracks a messageSuid to use in selecting
     * the currentMessage once the slice data loads.
     * @param {String} messageSuid The message suid.
     */
    setCurrentMessageBySuid: function(messageSuid) {
      this.expectingMessageSuid = messageSuid;
      this.checkExpectingMessageSuid();
    },

    /**
     * Sets the currentMessage if there are messages now to check
     * against expectingMessageSuid. Only works if current folder
     * is set to an "inbox" type, so only useful for jumps into
     * the email app from an entry point like a notification.
     * @param  {Boolean} eventIfNotFound if set to true, an event
     * is emitted if the messageSuid is not found in the set of
     * messages.
     */
    checkExpectingMessageSuid: function(eventIfNotFound) {
      var messageSuid = this.expectingMessageSuid;
      if (!messageSuid || !model.folder || model.folder.type !== 'inbox') {
        return;
      }

      var index = this.indexOfMessageById(messageSuid);
      if (index > -1) {
        this.expectingMessageSuid = null;
        return this.setCurrentMessageByIndex(index);
      }

      if (eventIfNotFound) {
        console.error('header_cursor could not find messageSuid ' +
                      messageSuid + ', emitting messageSuidNotFound');
        this.emit('messageSuidNotFound', messageSuid);
      }
    },

    /**
     * @param {MailHeader} header message header.
     */
    setCurrentMessage: function(header) {
      if (!header) {
        return;
      }

      this.setCurrentMessageByIndex(this.indexOfMessageById(header.id));
    },

    setCurrentMessageByIndex: function(index) {
      var messages = this.messagesSlice.items;

      // Do not bother if not a valid index.
      if (index === -1 || index > messages.length - 1) {
        return;
      }

      var header = messages[index];
      if ('header' in header) {
        header = header.header;
      }

      var currentMessage = new CurrentMessage(header, {
        hasPrevious: index !== 0,                 // Can't be first
        hasNext: index !== messages.length - 1    // Can't be last
      });

      this.emit('currentMessage', currentMessage, index);
      this.currentMessage = currentMessage;
    },

    /**
     * @param {string} id message id.
     * @return {number} the index of the message cursor's current message
     *     in the message slice it has checked out.
     */
    indexOfMessageById: function(id) {
      var messages = (this.messagesSlice && this.messagesSlice.items) || [];
      return array.indexOfGeneric(messages, function(message) {
        var other = 'header' in message ? message.header.id : message.id;
        return other === id;
      });
    },

    /**
     * @param {Object} folder the folder we switched to.
     */
    onLatestFolder: function(folder) {
      // It is possible that the notification of latest folder is fired
      // but in the meantime the foldersSlice could be cleared due to
      // a change in the current account, before this listener is called.
      // So skip this work if no foldersSlice, this method will be called
      // again soon.
      if (!model.foldersSlice) {
        return;
      }

      this.freshMessagesSlice();
    },

    startSearch: function(phrase, whatToSearch) {
      this.searchMode = 'search';
      this.bindToSlice(model.api.searchFolderMessages(model.folder,
                                                      phrase,
                                                      whatToSearch));
    },

    endSearch: function() {
      this.die();
      this.searchMode = 'nonsearch';
      this.freshMessagesSlice();
    },

    freshMessagesSlice: function() {
      this.bindToSlice(model.api.viewFolderMessages(model.folder));
    },

    /**
     * holds on to messagesSlice and binds some events to it.
     * @param  {Slice} messagesSlice the new messagesSlice.
     */
    bindToSlice: function(messagesSlice) {
      this.die();

      this.messagesSlice = messagesSlice;
      this.sliceEvents.forEach(function(type) {
        messagesSlice['on' + type] = makeListener(type, this);
      }.bind(this));
    },

    onMessagesSplice: function(index, howMany, addedItems,
                                         requested, moreExpected) {
      // Avoid doing work if get called while in the process of
      // shutting down.
      if (!this.messagesSlice) {
        return;
      }

      // If there was a messageSuid expected and at the top, then
      // check to see if it was received. This is really just nice
      // for when a new message notification comes in, as the atTop
      // test is a bit fuzzy generally. Not all slices go to the top.
      if (this.messagesSlice.atTop && this.expectingMessageSuid &&
          this.messagesSlice.items && this.messagesSlice.items.length) {
        this.checkExpectingMessageSuid(true);
      }
    },

    /**
     * Choose a new currentMessage if we spilled the existing one.
     * Otherwise, emit 'currentMessage' event to update stale listeners
     * in case we spilled a sibling.
     *
     * @param {MailHeader} removedHeader header that got removed.
     * @param {number} removedFromIndex index header was removed from.
     */
    onMessagesSpliceRemove: function(removedHeader, removedFromIndex) {
      if (this.currentMessage !== removedHeader) {
        // Emit 'currentMessage' event in case we're spilling a sibling.
        return this.setCurrentMessage(this.currentMessage);
      }

      var messages = this.messagesSlice.items;
      if (messages.length === 0) {
        // No more messages... sad!
        return (this.currentMessage = null);
      }

      var index = Math.min(removedFromIndex, messages.length - 1);
      var message = this.messagesSlice.items[index];
      this.setCurrentMessage(message);
    },

    die: function() {
      if (this.messagesSlice) {
        this.messagesSlice.die();
        this.messagesSlice = null;
      }

      this.currentMessage = null;
    }
  });

  /*
   * Override the .on method so that initialization and slice creation is
   * delayed until there are listeners.
   */
  var oldOn = HeaderCursor.prototype.on;
  HeaderCursor.prototype.on = function() {
    if (!this._inited) {
      this.init();
      HeaderCursor.prototype.on = oldOn;
    }

    return oldOn.apply(this, arguments);
  };

  /**
   * @constructor
   * @param {MailHeader} header message header.
   * @param {Object} siblings whether message has next and previous siblings.
   */
  function CurrentMessage(header, siblings) {
    this.header = header;
    this.siblings = siblings;
  }

  CurrentMessage.prototype = {
    /**
     * @type {MailHeader}
     */
    header: null,

    /**
     * Something like { hasPrevious: true, hasNext: false }.
     * @type {Object}
     */
    siblings: null
  };

  return {
    CurrentMessage: CurrentMessage,
    cursor: new HeaderCursor()
  };
});

/* jshint -W083 */

(function(exports) {
  

  /**
   * Allowable font sizes for header elements.
   */
  const HEADER_SIZES = [
    16, 17, 18, 19, 20, 21, 22, 23
  ];

  /**
   * Utility functions for measuring and manipulating font sizes
   */
  var FontSizeUtils = {

    /**
     * Keep a cache of canvas contexts with a given font.
     * We do this because it is faster to create new canvases
     * than to re-set the font on existing contexts repeatedly.
     */
    _cachedContexts: {},

    /**
     * Grab or create a cached canvas context for a given fontSize/family pair.
     * @todo Add font-weight as a new dimension for caching.
     *
     * @param {Integer} fontSize The font size of the canvas we want.
     * @param {String} fontFamily The font family of the canvas we want.
     * @param {String} fontStyle The style of the font (default to italic).
     * @return {CanvasRenderingContext2D} A context with the specified font.
     */
    _getCachedContext: function(fontSize, fontFamily, fontStyle) {
      // Default to italic style since this code is only ever used
      // by headers right now and header text is always italic.
      fontStyle = fontStyle || 'italic';

      var cache = this._cachedContexts;
      var ctx = cache[fontSize] && cache[fontSize][fontFamily] ?
                cache[fontSize][fontFamily][fontStyle] : null;

      if (!ctx) {
        var canvas = document.createElement('canvas');
        canvas.setAttribute('moz-opaque', 'true');
        canvas.setAttribute('width', '1');
        canvas.setAttribute('height', '1');

        ctx = canvas.getContext('2d', { willReadFrequently: true });
        ctx.font = fontStyle + ' ' + fontSize + 'px ' + fontFamily;

        // Populate the contexts cache.
        if (!cache[fontSize]) {
          cache[fontSize] = {};
        }
        if (!cache[fontSize][fontFamily]) {
          cache[fontSize][fontFamily] = {};
        }
        cache[fontSize][fontFamily][fontStyle] = ctx;
      }

      return ctx;
    },

    /**
     * Clear any current canvas contexts from the cache.
     */
    resetCache: function() {
      this._cachedContexts = {};
    },

    /**
     * Use a single observer for all text changes we are interested in.
     */
    _textChangeObserver: null,

    /**
     * Auto resize all text changes.
     * @param {Array} mutations A MutationRecord list.
     */
    _handleTextChanges: function(mutations) {
      for (var i = 0; i < mutations.length; i++) {
        this._reformatHeaderText(mutations[i].target);
      }
    },

    /**
     * Singleton-like interface for getting our text change observer.
     * By reusing the observer, we make sure we only ever attach a
     * single observer to any given element we are interested in.
     */
    _getTextChangeObserver: function() {
      if (!this._textChangeObserver) {
        this._textChangeObserver = new MutationObserver(
          this._handleTextChanges.bind(this));
      }
      return this._textChangeObserver;
    },

    /**
     * Perform auto-resize when textContent changes on element.
     *
     * @param {HTMLElement} element The element to observer for changes
     */
    _observeHeaderChanges: function(element) {
      var observer = this._getTextChangeObserver();
      // Listen for any changes in the child nodes of the header.
      observer.observe(element, { childList: true });
    },

    /**
     * Resize and reposition the header text based on string length and
     * container position.
     *
     * @param {HTMLElement} header h1 text inside header to reformat.
     */
    _reformatHeaderText: function(header) {
      // Skip resize logic if header has no content, ie before localization.
      if (header.textContent.trim() === '') {
        return;
      }

      // Reset our centering styles.
      this.resetCentering(header);

      // Cache the element style properites to avoid reflows.
      var style = this.getStyleProperties(header);

      // Perform auto-resize and center.
      style.textWidth = this.autoResizeElement(header, style);
      this.centerTextToScreen(header, style);
    },

    /**
     * Reformat all the headers located inside a DOM node, and add mutation
     * observer to reformat when any changes are made.
     *
     * @param {HTMLElement} domNode
     */
    _registerHeadersInSubtree: function(domNode) {
      if (!domNode) {
        return;
      }

      var headers = domNode.querySelectorAll('header > h1');
      for (var i = 0; i < headers.length; i++) {
        // On some apps wrapping inside a requestAnimationFrame reduces the
        // number of calls to _reformatHeaderText().
        window.requestAnimationFrame(function(header) {
          this._reformatHeaderText(header);
          this._observeHeaderChanges(header);
        }.bind(this, headers[i]));
      }
    },

    /**
     * Get the width of a string in pixels, given its fontSize and fontFamily.
     *
     * @param {String} string The string we are measuring.
     * @param {Integer} fontSize The size of the font to measure against.
     * @param {String} fontFamily The font family to measure against.
     * @param {String} fontStyle The style of the font (default to italic).
     * @return {Integer} The pixel width of the string with the given font.
     */
    getFontWidth: function(string, fontSize, fontFamily, fontStyle) {
      var ctx = this._getCachedContext(fontSize, fontFamily, fontStyle);
      return ctx.measureText(string).width;
    },

    /**
     * Get the maximum allowable fontSize for a string such that it will
     * not overflow past a maximum width.
     *
     * @param {String} string The string for which to check max font size.
     * @param {Array} allowedSizes A list of fontSizes allowed.
     * @param {String} fontFamily The font family of the string we're measuring.
     * @param {Integer} maxWidth The maximum number of pixels before overflow.
     * @return {Object} Dict containing fontSize, overflow and textWidth.
     */
    getMaxFontSizeInfo: function(string, allowedSizes, fontFamily, maxWidth) {
      var fontSize;
      var resultWidth;
      var i = allowedSizes.length - 1;

      do {
        fontSize = allowedSizes[i];
        resultWidth = this.getFontWidth(string, fontSize, fontFamily);
        i--;
      } while (resultWidth > maxWidth && i >= 0);

      return {
        fontSize: fontSize,
        overflow: resultWidth > maxWidth,
        textWidth: resultWidth
      };
    },

    /**
     * Get the amount of characters truncated from overflow ellipses.
     *
     * @param {String} string The string for which to check max font size.
     * @param {Integer} fontSize The font size of the string we are measuring.
     * @param {String} fontFamily The font family of the string we're measuring.
     * @param {Integer} maxWidth The maximum number of pixels before overflow.
     */
    getOverflowCount: function(string, fontSize, fontFamily, maxWidth) {
      var substring;
      var resultWidth;
      var overflowCount = -1;

      do {
        overflowCount++;
        substring = string.substr(0, string.length - overflowCount);
        resultWidth = this.getFontWidth(substring, fontSize, fontFamily);
      } while (substring.length > 0 && resultWidth > maxWidth);

      return overflowCount;
    },

    /**
     * Get an array of allowed font sizes for an element
     *
     * @param {HTMLElement} element The element to get allowed sizes for.
     * @return {Array} An array containing pizels values of allowed sizes.
     */
    getAllowedSizes: function(element) {
      if (element.tagName === 'H1' && element.parentNode.tagName === 'HEADER') {
        return HEADER_SIZES;
      }
      // No allowed sizes for this element, so return empty array.
      return [];
    },

    /**
     * Get an element's content width disregarding its box model sizing.
     *
     * @param {HTMLElement|Object} HTML element, or style object.
     * @returns {Number} width in pixels of elements content.
     */
    getContentWidth: function(style) {
      var width = parseInt(style.width, 10);
      if (style.boxSizing === 'border-box') {
        width -= (parseInt(style.paddingRight, 10) +
          parseInt(style.paddingLeft, 10));
      }
      return width;
    },

    /**
     * Get an element's style properies.
     *
     * @param {HTMLElement} element The element from which to fetch style.
     * @return {Object} A dictionary containing element's style properties.
     */
    getStyleProperties: function(element) {
      var style = window.getComputedStyle(element);
      var contentWidth = this.getContentWidth(style);
      if (isNaN(contentWidth)) {
        contentWidth = 0;
      }

      return {
        fontFamily: style.fontFamily,
        contentWidth: contentWidth,
        paddingRight: parseInt(style.paddingRight, 10),
        paddingLeft: parseInt(style.paddingLeft, 10),
        offsetLeft: element.offsetLeft
      };
    },

    /**
     * Auto resize element's font to fit its content width.
     *
     * @param {HTMLElement} element The element to perform auto-resize on.
     * @param {Object} styleOptions Dictionary containing cached style props,
     *                 to avoid reflows caused by grabbing style properties.
     * @return {Integer} The pixel width of the resized text.
     */
    autoResizeElement: function(element, styleOptions) {
      var allowedSizes = this.getAllowedSizes(element);
      if (allowedSizes.length === 0) {
        return 0;
      }

      var contentWidth = styleOptions.contentWidth ||
        this.getContentWidth(element);

      var fontFamily = styleOptions.fontFamily ||
        getComputedStyle(element).fontFamily;

      var info = this.getMaxFontSizeInfo(
        element.textContent.trim(),
        allowedSizes,
        fontFamily,
        contentWidth
      );

      element.style.fontSize = info.fontSize + 'px';

      return info.textWidth;
    },

    /**
     * Reset the auto-centering styling on an element.
     *
     * @param {HTMLElement} element The element to reset.
     */
    resetCentering: function(element) {
      // We need to set the lateral margins to 0 to be able to measure the
      // element width properly. All previously set values are ignored.
      element.style.marginLeft = element.style.marginRight = '0';
    },

    /**
     * Center an elements text based on screen position rather than container.
     *
     * @param {HTMLElement} element The element whose text we want to center.
     * @param {Object} styleOptions Dictionary containing cached style props,
     *                 avoids reflows caused by caching style properties.
     */
    centerTextToScreen: function(element, styleOptions) {
      // Calculate the minimum amount of space needed for the header text
      // to be displayed without overflowing its content box.
      var minHeaderWidth = styleOptions.textWidth + styleOptions.paddingRight +
        styleOptions.paddingLeft;

      // Get the amount of space on each side of the header text element.
      var sideSpaceLeft = styleOptions.offsetLeft;
      var sideSpaceRight = this.getWindowWidth() - sideSpaceLeft -
        styleOptions.contentWidth - styleOptions.paddingRight -
        styleOptions.paddingLeft;

      // If both margins have the same width, the header is already centered.
      if (sideSpaceLeft === sideSpaceRight) {
        return;
      }

      // To center, we need to make sure the space to the left of the header
      // is the same as the space to the right, so take the largest of the two.
      var margin = Math.max(sideSpaceLeft, sideSpaceRight);

      // If the minimum amount of space our header needs plus the max margins
      // fits inside the width of the window, we can center this header.
      // We subtract 1 pixels to wrap text like Gecko.
      // See https://bugzil.la/1026955
      if (minHeaderWidth + (margin * 2) < this.getWindowWidth() - 1) {
        element.style.marginLeft = element.style.marginRight = margin + 'px';
      }
    },

    _initHeaderFormatting: function() {
      if (navigator.mozL10n) {
        // When l10n is ready, register all displayed headers for formatting.
        navigator.mozL10n.once(function() {
          this._registerHeadersInSubtree(document.body);
        }.bind(this));
      } else {
        this._registerHeadersInSubtree(document.body);
      }
    },

    /**
     * Initialize the FontSizeUtils, add overflow handler and perform
     * auto resize once strings have been localized.
     */
    init: function() {
      // Listen for lazy loaded DOM to register new headers.
      window.addEventListener('lazyload', function(evt) {
        this._registerHeadersInSubtree(evt.detail);
      }.bind(this));

      // Once document is ready, format any headers already in the DOM.
      if (document.readyState === 'loading') {
        window.addEventListener('DOMContentLoaded', function() {
          this._initHeaderFormatting();
        }.bind(this));
      } else {
        this._initHeaderFormatting();
      }
    },

    /**
     * Cache and return the width of the inner window.
     *
     * @return {Integer} The width of the inner window in pixels.
     */
    getWindowWidth: function() {
      return window.innerWidth;
    }
  };

  FontSizeUtils.init();

  exports.FontSizeUtils = FontSizeUtils;
}(this));

define("shared/js/font_size_utils", function(){});



/**
 * Handles sending out metrics, since final states are distributed across cards
 * and their interior actions. Need something to coordinate the completion of
 * certain states to know when to emit the right events. Used right now for:
 * https://developer.mozilla.org/en-US/Apps/Build/Performance/Firefox_OS_app_responsiveness_guidelines
 *
 * Events tracked:
 *
 * apiDone: triggered when app knows data is flowing back and forth from the
 * worker.
 *
 * contentDone: when a card's content is completely available. This includes
 * any parts that were needed
 */
define('metrics',['require','evt'],function(require) {
  var evt = require('evt'),
      apiDone = false,
      contentDone = false;

  function checkAppLoaded() {
    if (apiDone && contentDone) {
      window.performance.mark('fullyLoaded');
      window.dispatchEvent(new CustomEvent('moz-app-loaded'));
    }
  }

  // Event listeners. Note they all unsubscribe after the first reception of
  // that kind of event. This is because cards, who can have multiple instances,
  // can emit the events throughout the lifetime of the app, and for the
  // purposes of the startup events, they only need to be done once on startup.
  evt.once('metrics:apiDone', function onApiDone() {
    apiDone = true;
    checkAppLoaded();
  });

  evt.once('metrics:contentDone', function() {
    contentDone = true;

    // Only need to dispatch these events if the startup cache was not used.
    if (!window.startupCacheEventsSent) {
      // Now that content is in, it is visually complete, and content is
      // interactive, since event listeners are bound as part of content
      // insertion.
      window.performance.mark('visuallyLoaded');
      window.dispatchEvent(new CustomEvent('moz-app-visually-complete'));
      window.performance.mark('contentInteractive');
      window.dispatchEvent(new CustomEvent('moz-content-interactive'));
    }

    checkAppLoaded();
  });
});

/*jshint browser: true */
/*globals define, console */

define('wake_locks',['require','evt'],function(require) {
  
  var lockTimeouts = {},
      evt = require('evt'),
      allLocks = {},

      // Using an object instead of an array since dataIDs are unique
      // strings.
      dataOps = {},
      dataOpsTimeoutId = 0,

      // Only allow keeping the locks for a maximum of 45 seconds.
      // This is to prevent a long, problematic sync from consuming
      // all of the battery power in the phone. A more sophisticated
      // method may be to adjust the size of the timeout based on
      // past performance, but that would mean keeping a persistent
      // log of attempts. This naive approach just tries to catch the
      // most likely set of failures: just a temporary really bad
      // cell network situation that once the next sync happens, the
      // issue is resolved.
      maxLockInterval = 45000,

      // Allow UI-triggered data operations to complete in a wake lock timeout
      // case, but only for a certain amount of time, because they could be the
      // cause of the wake lock timeout.
      dataOpsTimeout = 5000;

  // START failsafe close support, bug 1025727.
  // If the wake locks are timed out, it means sync went on too long, and there
  // is likely a problem. Reset state via app shutdown. Allow for UI-triggered
  // data operations to complete though before finally releasing the wake locks
  // and shutting down.
  function close() {
    // Reset state in case a close does not actually happen.
    dataOps = {};
    dataOpsTimeoutId = 0;

    // Only really close if the app is hidden.
    if (document.hidden) {
      console.log('email: cronsync wake locks expired, force closing app');
      window.close();
    } else {
      console.log('email: cronsync wake locks expired, but app visible, ' +
                  'not force closing');
      // User is using the app. Just clear all locks so we do not burn battery.
      // This means the app could still be in a bad data sync state, so just
      // need to rely on the next sync attempt or OOM from other app usage.
      Object.keys(allLocks).forEach(function(accountKey) {
        clearLocks(accountKey);
      });
    }
  }

  function closeIfNoDataOps() {
    var dataOpsKeys = Object.keys(dataOps);

    if (!dataOpsKeys.length) {
      // All clear, no waiting data operations, shut it down.
      return close();
    }

    console.log('email: cronsync wake lock force shutdown waiting on email ' +
                'data operations: ' + dataOpsKeys.join(', '));
    // Allow data operations to complete, but also set a cap on that since
    // they could be the ones causing the sync to fail. Give it 5 seconds.
    dataOpsTimeoutId = setTimeout(close, dataOpsTimeout);
  }

  // Listen for data operation events that might want to delay the failsafe
  // close switch.
  evt.on('uiDataOperationStart', function(dataId) {
    dataOps[dataId] = true;
  });

  evt.on('uiDataOperationStop', function(dataId) {
    delete dataOps[dataId];

    if (dataOpsTimeoutId && !Object.keys(dataOps).length) {
      clearTimeout(dataOpsTimeoutId);
      close();
    }
  });
  // END failsafe close

  function clearLocks(accountKey) {
    console.log('email: clearing wake locks for "' + accountKey + '"');

    // Clear timer
    var lockTimeoutId = lockTimeouts[accountKey];
    if (lockTimeoutId) {
      clearTimeout(lockTimeoutId);
    }
    lockTimeouts[accountKey] = 0;

    // Clear the locks
    var locks = allLocks[accountKey];
    allLocks[accountKey] = null;
    if (locks) {
      locks.forEach(function(lock) {
        lock.unlock();
      });
    }
  }

  // Creates a string key from an array of string IDs. Uses a space
  // separator since that cannot show up in an ID.
  function makeAccountKey(accountIds) {
    return 'id' + accountIds.join(' ');
  }

  function onCronStop(accountIds) {
    clearLocks(makeAccountKey(accountIds));
  }

  evt.on('cronSyncWakeLocks', function(accountKey, locks) {
    if (lockTimeouts[accountKey]) {
      // Only support one set of locks. Better to err on the side of
      // saving the battery and not continue syncing vs supporting a
      // pathologic error that leads to a compound set of locks but
      // end up with more syncs completing.
      clearLocks(accountKey);
    }

    allLocks[accountKey] = locks;

    // If timeout is reached, means app is stuck in a bad state, and just
    // shut it down via the failsafe close.
    lockTimeouts[accountKey] = setTimeout(closeIfNoDataOps, maxLockInterval);
  });

  evt.on('cronSyncStop', onCronStop);
});

/**
 * Application logic that isn't specific to cards, specifically entailing
 * startup and mozSetMessageHandler message listening.
 **/
 /*global globalOnAppMessage */


define('mail_app',['require','exports','module','l10n!','activity_composer_data','cards','evt','model','header_cursor','html_cache','shared/js/font_size_utils','metrics','wake_locks'],function(require, exports, module) {

var mozL10n = require('l10n!'),
    activityComposerData = require('activity_composer_data'),
    cards = require('cards'),
    evt = require('evt'),
    model = require('model'),
    headerCursor = require('header_cursor').cursor,
    htmlCache = require('html_cache'),
    waitingRawActivity, activityCallback;

require('shared/js/font_size_utils');
require('metrics');
require('wake_locks');

var started = false;

function pushStartCard(id, addedArgs) {
  var args = {};

  // Mix in addedArgs to the args object that is passed to pushCard. Use a new
  // object in case addedArgs is reused again by the caller.
  if (addedArgs) {
    Object.keys(addedArgs).forEach(function(key) {
      args[key] = addedArgs[key];
    });
  }

  if (!started) {
    var cachedNode = cards._cardsNode.children[0];

    // Add in cached node to use, if it matches the ID type.
    if (cachedNode && id === htmlCache.nodeToKey(cachedNode)) {
      // l10n may not see this as it was injected before l10n.js was loaded,
      // so let it know it needs to translate it.
      mozL10n.translateFragment(cachedNode);
      args.cachedNode = cachedNode;
    }

    //Set body class to a solid background, see bug 1077605.
    document.body.classList.add('content-visible');
  }

  cards.pushCard(id, 'immediate', args);

  started = true;
}

// Handles visibility changes: if the app becomes visible after starting up
// hidden because of a request-sync, start showing some UI.
document.addEventListener('visibilitychange', function onVisibilityChange() {
  if (!document.hidden && !started) {
    pushStartCard('message_list');
  }
}, false);

/*
 * Determines if current card is a nonsearch message_list
 * card, which is the default kind of card.
 */
function isCurrentCardMessageList() {
  var cardType = cards.getCurrentCardType();
  return (cardType && cardType === 'message_list');
}


// The add account UI flow is requested.
evt.on('addAccount', function() {
  cards.removeAllCards();

  // Show the first setup card again.
  pushStartCard('setup_account_info', {
    allowBack: true
  });
});

function resetApp() {
  // Clear any existing local state and reset UI/model state.
  activityCallback = waitingRawActivity = undefined;
  cards.removeAllCards();

  model.init(false, function() {
    var cardId = model.hasAccount() ?
                 'message_list' : 'setup_account_info';
    pushStartCard(cardId);
  });
}

// An account was deleted. Burn it all to the ground and rise like a phoenix.
// Prefer a UI event vs. a slice listen to give flexibility about UI
// construction: an acctsSlice splice change may not warrant removing all the
// cards.
evt.on('accountDeleted', resetApp);
evt.on('resetApp', resetApp);

// Called when account creation canceled, most likely from setup_account_info.
// Need to complete the activity postError flow if an activity is waiting, then
// update the UI to the latest state.
evt.on('setupAccountCanceled', function(fromCard) {
  if (waitingRawActivity) {
    waitingRawActivity.postError('cancelled');
  }

  if (!model.foldersSlice) {
    // No account has been formally initialized, but one likely exists given
    // that this back button should only be available for cases that have
    // accounts. Likely just need the app to reset to load model.
    evt.emit('resetApp');
  } else {
    cards.removeCardAndSuccessors(fromCard, 'animate', 1);
  }
});

// A request to show the latest account in the UI. Usually triggered after an
// account has been added.
evt.on('showLatestAccount', function() {
  cards.removeAllCards();

  model.latestOnce('acctsSlice', function(acctsSlice) {
    var account = acctsSlice.items[acctsSlice.items.length - 1];

    model.changeAccount(account, function() {
      pushStartCard('message_list', {
        // If waiting to complete an activity, do so after pushing the message
        // list card.
        onPushed: function() {
          if (activityCallback) {
            var activityCb = activityCallback;
            activityCallback = null;
            activityCb();
            return true;
          }
          return false;
        }
      });
    });
  });
});

evt.on('apiBadLogin', function(account, problem, whichSide) {
  switch (problem) {
    case 'bad-user-or-pass':
      cards.pushCard('setup_fix_password', 'animate',
                { account: account,
                  whichSide: whichSide,
                  restoreCard: cards.activeCardIndex },
                'right');
      break;
    case 'imap-disabled':
    case 'pop3-disabled':
      cards.pushCard('setup_fix_gmail', 'animate',
                { account: account, restoreCard: cards.activeCardIndex },
                'right');
      break;
    case 'needs-app-pass':
      cards.pushCard('setup_fix_gmail_twofactor', 'animate',
                { account: account, restoreCard: cards.activeCardIndex },
                'right');
      break;
    case 'needs-oauth-reauth':
      cards.pushCard('setup_fix_oauth2', 'animate',
                { account: account, restoreCard: cards.activeCardIndex },
                'right');
      break;
  }
});

// Start init of main view/model modules now that all the registrations for
// top level events have happened, and before triggering of entry points start.
cards.init();
// If config could have already started up the model if there was no cache set
// up, so only trigger init if it is not already started up, for efficiency.
if (!model.inited) {
  model.init();
}

/**
 * Register setMozMessageHandler listeners with the plumbing set up in
 * html_cache_restore
 */
var startupData = globalOnAppMessage({
  activity: function(rawActivity) {
    // Remove previous cards because the card stack could get weird if inserting
    // a new card that would not normally be at that stack level. Primary
    // concern: going to settings, then trying to add a compose card at that
    // stack level. More importantly, the added card could have a "back"
    // operation that does not mean "back to previous state", but "back in
    // application flowchart". Message list is a good known jump point, so do
    // not needlessly wipe that one out if it is the current one.
    if (!isCurrentCardMessageList()) {
      cards.removeAllCards();
    }

    function activityCompose() {
      var cardArgs = {
        activity: rawActivity,
        composerData: activityComposerData(rawActivity)
      };

      pushStartCard('compose', cardArgs);
    }

    if (globalOnAppMessage.hasAccount()) {
      activityCompose();
    } else {
      activityCallback = activityCompose;
      waitingRawActivity = rawActivity;
      pushStartCard('setup_account_info', {
        allowBack: true,
        launchedFromActivity: true
      });
    }
  },

  notification: function(data) {
    data = data || {};
    var type = data.type || '';
    var folderType = data.folderType || 'inbox';

    model.latestOnce('foldersSlice', function latestFolderSlice() {
      function onCorrectFolder() {
        // Remove previous cards because the card stack could get weird if
        // inserting a new card that would not normally be at that stack level.
        // Primary concern: going to settings, then trying to add a reader or
        // message list card at that stack level. More importantly, the added
        // card could have a "back" operation that does not mean "back to
        // previous state", but "back in application flowchart". Message list is
        // a good known jump point, so do not needlessly wipe that one out if it
        // is the current one.
        if (!isCurrentCardMessageList()) {
          cards.removeAllCards();
        }

        if (type === 'message_list') {
          pushStartCard('message_list', {});
        } else if (type === 'message_reader') {
          headerCursor.setCurrentMessageBySuid(data.messageSuid);

          pushStartCard(type, {
              messageSuid: data.messageSuid
          });
        } else {
          console.error('unhandled notification type: ' + type);
        }
      }

      var acctsSlice = model.acctsSlice,
          accountId = data.accountId;

      if (model.account.id === accountId) {
        // folderType will often be 'inbox' (in the case of a new message
        // notification) or 'outbox' (in the case of a "failed send"
        // notification).
        return model.selectFirstFolderWithType(folderType, onCorrectFolder);
      } else {
        var newAccount;
        acctsSlice.items.some(function(account) {
          if (account.id === accountId) {
            newAccount = account;
            return true;
          }
        });

        if (newAccount) {
          model.changeAccount(newAccount, function() {
            model.selectFirstFolderWithType(folderType, onCorrectFolder);
          });
        }
      }
    });
  }
});

console.log('startupData: ' + JSON.stringify(startupData, null, '  '));

// If not a mozSetMessageHandler entry point, start up the UI now. Or, if
// a request-sync started the app, but the app became visible during the
// startup. In that case, make sure we show something to the user.
if (startupData.entry === 'default' ||
   (startupData.entry === 'request-sync' && !document.hidden)) {
  pushStartCard(startupData.view);
}

});

/*global requirejs, TestUrlResolver */


// Set up loading of scripts, but only if not in tests, which set up their own
// config.
if (typeof TestUrlResolver === 'undefined') {
  requirejs.config({
    // waitSeconds is set to the default here; the build step rewrites it to 0
    // in build/email.build.js so that we never timeout waiting for modules in
    // production. This is important when the device is under super-low-memory
    // stress, as it may take a while for the device to get around to loading
    // things email needs for background tasks like periodic sync.
    waitSeconds: 0,
    baseUrl: 'js',
    paths: {
      l10nbase: '../shared/js/l10n',
      l10ndate: '../shared/js/l10n_date',
      style: '../style',
      shared: '../shared'
    },
     map: {
      '*': {
        'api': 'ext/main-frame-setup'
      }
    },
    shim: {
      l10ndate: ['l10nbase'],

      'shared/js/mime_mapper': {
        exports: 'MimeMapper'
      },

      'shared/js/notification_helper': {
        exports: 'NotificationHelper'
      },

      'shared/js/accessibility_helper': {
        exports: 'AccessibilityHelper'
      }
    },
    config: {
      template: {
        tagToId: function(tag) {
           return tag.replace(/^cards-/, 'cards/').replace(/-/g, '_');
        }
      }
    },
    definePrim: 'prim'
  });
}

// Tell audio channel manager that we want to adjust the notification channel if
// the user press the volumeup/volumedown buttons in Email.
if (navigator.mozAudioChannelManager) {
  navigator.mozAudioChannelManager.volumeControlChannel = 'notification';
}

// startupOnModelLoaded can be set to a function in html_cache_restore. In that
// case, html_cache_restore needs to know the model state, if there is an
// account, before proceeding with the startup view to select.
if (window.startupOnModelLoaded) {
  requirejs(['console_hook', 'model'], function(hook, model) {
    model.init();
    window.startupOnModelLoaded(model, function() {
      require(['mail_app']);
    });
  });
} else {
  // Run the app module, bring in fancy logging
  requirejs(['console_hook', 'mail_app']);
}
;
define("config", function(){});

(function(window, undefined) {
  

  /* jshint validthis:true */
  function L10nError(message, id, loc) {
    this.name = 'L10nError';
    this.message = message;
    this.id = id;
    this.loc = loc;
  }
  L10nError.prototype = Object.create(Error.prototype);
  L10nError.prototype.constructor = L10nError;


  /* jshint browser:true */

  var io = {

    _load: function(type, url, callback, sync) {
      var xhr = new XMLHttpRequest();
      var needParse;

      if (xhr.overrideMimeType) {
        xhr.overrideMimeType(type);
      }

      xhr.open('GET', url, !sync);

      if (type === 'application/json') {
        //  Gecko 11.0+ forbids the use of the responseType attribute when
        //  performing sync requests (NS_ERROR_DOM_INVALID_ACCESS_ERR).
        //  We'll need to JSON.parse manually.
        if (sync) {
          needParse = true;
        } else {
          xhr.responseType = 'json';
        }
      }

      xhr.addEventListener('load', function io_onload(e) {
        if (e.target.status === 200 || e.target.status === 0) {
          // Sinon.JS's FakeXHR doesn't have the response property
          var res = e.target.response || e.target.responseText;
          callback(null, needParse ? JSON.parse(res) : res);
        } else {
          callback(new L10nError('Not found: ' + url));
        }
      });
      xhr.addEventListener('error', callback);
      xhr.addEventListener('timeout', callback);

      // the app: protocol throws on 404, see https://bugzil.la/827243
      try {
        xhr.send(null);
      } catch (e) {
        callback(new L10nError('Not found: ' + url));
      }
    },

    load: function(url, callback, sync) {
      return io._load('text/plain', url, callback, sync);
    },

    loadJSON: function(url, callback, sync) {
      return io._load('application/json', url, callback, sync);
    }

  };

  function EventEmitter() {}

  EventEmitter.prototype.emit = function ee_emit() {
    if (!this._listeners) {
      return;
    }

    var args = Array.prototype.slice.call(arguments);
    var type = args.shift();
    if (!this._listeners[type]) {
      return;
    }

    var typeListeners = this._listeners[type].slice();
    for (var i = 0; i < typeListeners.length; i++) {
      typeListeners[i].apply(this, args);
    }
  };

  EventEmitter.prototype.addEventListener = function ee_add(type, listener) {
    if (!this._listeners) {
      this._listeners = {};
    }
    if (!(type in this._listeners)) {
      this._listeners[type] = [];
    }
    this._listeners[type].push(listener);
  };

  EventEmitter.prototype.removeEventListener = function ee_rm(type, listener) {
    if (!this._listeners) {
      return;
    }

    var typeListeners = this._listeners[type];
    var pos = typeListeners.indexOf(listener);
    if (pos === -1) {
      return;
    }

    typeListeners.splice(pos, 1);
  };


  function getPluralRule(lang) {
    var locales2rules = {
      'af': 3,
      'ak': 4,
      'am': 4,
      'ar': 1,
      'asa': 3,
      'az': 0,
      'be': 11,
      'bem': 3,
      'bez': 3,
      'bg': 3,
      'bh': 4,
      'bm': 0,
      'bn': 3,
      'bo': 0,
      'br': 20,
      'brx': 3,
      'bs': 11,
      'ca': 3,
      'cgg': 3,
      'chr': 3,
      'cs': 12,
      'cy': 17,
      'da': 3,
      'de': 3,
      'dv': 3,
      'dz': 0,
      'ee': 3,
      'el': 3,
      'en': 3,
      'eo': 3,
      'es': 3,
      'et': 3,
      'eu': 3,
      'fa': 0,
      'ff': 5,
      'fi': 3,
      'fil': 4,
      'fo': 3,
      'fr': 5,
      'fur': 3,
      'fy': 3,
      'ga': 8,
      'gd': 24,
      'gl': 3,
      'gsw': 3,
      'gu': 3,
      'guw': 4,
      'gv': 23,
      'ha': 3,
      'haw': 3,
      'he': 2,
      'hi': 4,
      'hr': 11,
      'hu': 0,
      'id': 0,
      'ig': 0,
      'ii': 0,
      'is': 3,
      'it': 3,
      'iu': 7,
      'ja': 0,
      'jmc': 3,
      'jv': 0,
      'ka': 0,
      'kab': 5,
      'kaj': 3,
      'kcg': 3,
      'kde': 0,
      'kea': 0,
      'kk': 3,
      'kl': 3,
      'km': 0,
      'kn': 0,
      'ko': 0,
      'ksb': 3,
      'ksh': 21,
      'ku': 3,
      'kw': 7,
      'lag': 18,
      'lb': 3,
      'lg': 3,
      'ln': 4,
      'lo': 0,
      'lt': 10,
      'lv': 6,
      'mas': 3,
      'mg': 4,
      'mk': 16,
      'ml': 3,
      'mn': 3,
      'mo': 9,
      'mr': 3,
      'ms': 0,
      'mt': 15,
      'my': 0,
      'nah': 3,
      'naq': 7,
      'nb': 3,
      'nd': 3,
      'ne': 3,
      'nl': 3,
      'nn': 3,
      'no': 3,
      'nr': 3,
      'nso': 4,
      'ny': 3,
      'nyn': 3,
      'om': 3,
      'or': 3,
      'pa': 3,
      'pap': 3,
      'pl': 13,
      'ps': 3,
      'pt': 3,
      'rm': 3,
      'ro': 9,
      'rof': 3,
      'ru': 11,
      'rwk': 3,
      'sah': 0,
      'saq': 3,
      'se': 7,
      'seh': 3,
      'ses': 0,
      'sg': 0,
      'sh': 11,
      'shi': 19,
      'sk': 12,
      'sl': 14,
      'sma': 7,
      'smi': 7,
      'smj': 7,
      'smn': 7,
      'sms': 7,
      'sn': 3,
      'so': 3,
      'sq': 3,
      'sr': 11,
      'ss': 3,
      'ssy': 3,
      'st': 3,
      'sv': 3,
      'sw': 3,
      'syr': 3,
      'ta': 3,
      'te': 3,
      'teo': 3,
      'th': 0,
      'ti': 4,
      'tig': 3,
      'tk': 3,
      'tl': 4,
      'tn': 3,
      'to': 0,
      'tr': 0,
      'ts': 3,
      'tzm': 22,
      'uk': 11,
      'ur': 3,
      've': 3,
      'vi': 0,
      'vun': 3,
      'wa': 4,
      'wae': 3,
      'wo': 0,
      'xh': 3,
      'xog': 3,
      'yo': 0,
      'zh': 0,
      'zu': 3
    };

    // utility functions for plural rules methods
    function isIn(n, list) {
      return list.indexOf(n) !== -1;
    }
    function isBetween(n, start, end) {
      return typeof n === typeof start && start <= n && n <= end;
    }

    // list of all plural rules methods:
    // map an integer to the plural form name to use
    var pluralRules = {
      '0': function() {
        return 'other';
      },
      '1': function(n) {
        if ((isBetween((n % 100), 3, 10))) {
          return 'few';
        }
        if (n === 0) {
          return 'zero';
        }
        if ((isBetween((n % 100), 11, 99))) {
          return 'many';
        }
        if (n === 2) {
          return 'two';
        }
        if (n === 1) {
          return 'one';
        }
        return 'other';
      },
      '2': function(n) {
        if (n !== 0 && (n % 10) === 0) {
          return 'many';
        }
        if (n === 2) {
          return 'two';
        }
        if (n === 1) {
          return 'one';
        }
        return 'other';
      },
      '3': function(n) {
        if (n === 1) {
          return 'one';
        }
        return 'other';
      },
      '4': function(n) {
        if ((isBetween(n, 0, 1))) {
          return 'one';
        }
        return 'other';
      },
      '5': function(n) {
        if ((isBetween(n, 0, 2)) && n !== 2) {
          return 'one';
        }
        return 'other';
      },
      '6': function(n) {
        if (n === 0) {
          return 'zero';
        }
        if ((n % 10) === 1 && (n % 100) !== 11) {
          return 'one';
        }
        return 'other';
      },
      '7': function(n) {
        if (n === 2) {
          return 'two';
        }
        if (n === 1) {
          return 'one';
        }
        return 'other';
      },
      '8': function(n) {
        if ((isBetween(n, 3, 6))) {
          return 'few';
        }
        if ((isBetween(n, 7, 10))) {
          return 'many';
        }
        if (n === 2) {
          return 'two';
        }
        if (n === 1) {
          return 'one';
        }
        return 'other';
      },
      '9': function(n) {
        if (n === 0 || n !== 1 && (isBetween((n % 100), 1, 19))) {
          return 'few';
        }
        if (n === 1) {
          return 'one';
        }
        return 'other';
      },
      '10': function(n) {
        if ((isBetween((n % 10), 2, 9)) && !(isBetween((n % 100), 11, 19))) {
          return 'few';
        }
        if ((n % 10) === 1 && !(isBetween((n % 100), 11, 19))) {
          return 'one';
        }
        return 'other';
      },
      '11': function(n) {
        if ((isBetween((n % 10), 2, 4)) && !(isBetween((n % 100), 12, 14))) {
          return 'few';
        }
        if ((n % 10) === 0 ||
            (isBetween((n % 10), 5, 9)) ||
            (isBetween((n % 100), 11, 14))) {
          return 'many';
        }
        if ((n % 10) === 1 && (n % 100) !== 11) {
          return 'one';
        }
        return 'other';
      },
      '12': function(n) {
        if ((isBetween(n, 2, 4))) {
          return 'few';
        }
        if (n === 1) {
          return 'one';
        }
        return 'other';
      },
      '13': function(n) {
        if ((isBetween((n % 10), 2, 4)) && !(isBetween((n % 100), 12, 14))) {
          return 'few';
        }
        if (n !== 1 && (isBetween((n % 10), 0, 1)) ||
            (isBetween((n % 10), 5, 9)) ||
            (isBetween((n % 100), 12, 14))) {
          return 'many';
        }
        if (n === 1) {
          return 'one';
        }
        return 'other';
      },
      '14': function(n) {
        if ((isBetween((n % 100), 3, 4))) {
          return 'few';
        }
        if ((n % 100) === 2) {
          return 'two';
        }
        if ((n % 100) === 1) {
          return 'one';
        }
        return 'other';
      },
      '15': function(n) {
        if (n === 0 || (isBetween((n % 100), 2, 10))) {
          return 'few';
        }
        if ((isBetween((n % 100), 11, 19))) {
          return 'many';
        }
        if (n === 1) {
          return 'one';
        }
        return 'other';
      },
      '16': function(n) {
        if ((n % 10) === 1 && n !== 11) {
          return 'one';
        }
        return 'other';
      },
      '17': function(n) {
        if (n === 3) {
          return 'few';
        }
        if (n === 0) {
          return 'zero';
        }
        if (n === 6) {
          return 'many';
        }
        if (n === 2) {
          return 'two';
        }
        if (n === 1) {
          return 'one';
        }
        return 'other';
      },
      '18': function(n) {
        if (n === 0) {
          return 'zero';
        }
        if ((isBetween(n, 0, 2)) && n !== 0 && n !== 2) {
          return 'one';
        }
        return 'other';
      },
      '19': function(n) {
        if ((isBetween(n, 2, 10))) {
          return 'few';
        }
        if ((isBetween(n, 0, 1))) {
          return 'one';
        }
        return 'other';
      },
      '20': function(n) {
        if ((isBetween((n % 10), 3, 4) || ((n % 10) === 9)) && !(
            isBetween((n % 100), 10, 19) ||
            isBetween((n % 100), 70, 79) ||
            isBetween((n % 100), 90, 99)
            )) {
          return 'few';
        }
        if ((n % 1000000) === 0 && n !== 0) {
          return 'many';
        }
        if ((n % 10) === 2 && !isIn((n % 100), [12, 72, 92])) {
          return 'two';
        }
        if ((n % 10) === 1 && !isIn((n % 100), [11, 71, 91])) {
          return 'one';
        }
        return 'other';
      },
      '21': function(n) {
        if (n === 0) {
          return 'zero';
        }
        if (n === 1) {
          return 'one';
        }
        return 'other';
      },
      '22': function(n) {
        if ((isBetween(n, 0, 1)) || (isBetween(n, 11, 99))) {
          return 'one';
        }
        return 'other';
      },
      '23': function(n) {
        if ((isBetween((n % 10), 1, 2)) || (n % 20) === 0) {
          return 'one';
        }
        return 'other';
      },
      '24': function(n) {
        if ((isBetween(n, 3, 10) || isBetween(n, 13, 19))) {
          return 'few';
        }
        if (isIn(n, [2, 12])) {
          return 'two';
        }
        if (isIn(n, [1, 11])) {
          return 'one';
        }
        return 'other';
      }
    };

    // return a function that gives the plural form name for a given integer
    var index = locales2rules[lang.replace(/-.*$/, '')];
    if (!(index in pluralRules)) {
      return function() { return 'other'; };
    }
    return pluralRules[index];
  }




  var MAX_PLACEABLES = 100;


  var PropertiesParser = {
    patterns: null,
    entryIds: null,

    init: function() {
      this.patterns = {
        comment: /^\s*#|^\s*$/,
        entity: /^([^=\s]+)\s*=\s*(.*)$/,
        multiline: /[^\\]\\$/,
        index: /\{\[\s*(\w+)(?:\(([^\)]*)\))?\s*\]\}/i,
        unicode: /\\u([0-9a-fA-F]{1,4})/g,
        entries: /[^\r\n]+/g,
        controlChars: /\\([\\\n\r\t\b\f\{\}\"\'])/g,
        placeables: /\{\{\s*([^\s]*?)\s*\}\}/,
      };
    },

    parse: function(ctx, source) {
      if (!this.patterns) {
        this.init();
      }

      var ast = [];
      this.entryIds = Object.create(null);

      var entries = source.match(this.patterns.entries);
      if (!entries) {
        return ast;
      }
      for (var i = 0; i < entries.length; i++) {
        var line = entries[i];

        if (this.patterns.comment.test(line)) {
          continue;
        }

        while (this.patterns.multiline.test(line) && i < entries.length) {
          line = line.slice(0, -1) + entries[++i].trim();
        }

        var entityMatch = line.match(this.patterns.entity);
        if (entityMatch) {
          try {
            this.parseEntity(entityMatch[1], entityMatch[2], ast);
          } catch (e) {
            if (ctx) {
              ctx._emitter.emit('parseerror', e);
            } else {
              throw e;
            }
          }
        }
      }
      return ast;
    },

    parseEntity: function(id, value, ast) {
      var name, key;

      var pos = id.indexOf('[');
      if (pos !== -1) {
        name = id.substr(0, pos);
        key = id.substring(pos + 1, id.length - 1);
      } else {
        name = id;
        key = null;
      }

      var nameElements = name.split('.');

      if (nameElements.length > 2) {
        throw new L10nError('Error in ID: "' + name + '".' +
            ' Nested attributes are not supported.');
      }

      var attr;
      if (nameElements.length > 1) {
        name = nameElements[0];
        attr = nameElements[1];

        if (attr[0] === '$') {
          throw new L10nError('Attribute can\'t start with "$"', id);
        }
      } else {
        attr = null;
      }

      this.setEntityValue(name, attr, key, this.unescapeString(value), ast);
    },

    setEntityValue: function(id, attr, key, value, ast) {
      var pos, v;

      if (value.indexOf('{{') !== -1) {
        value = this.parseString(value);
      }

      if (attr) {
        pos = this.entryIds[id];
        if (pos === undefined) {
          v = {$i: id};
          if (key) {
            v[attr] = {};
            v[attr][key] = value;
          } else {
            v[attr] = value;
          }
          ast.push(v);
          this.entryIds[id] = ast.length - 1;
          return;
        }
        if (key) {
          if (typeof(ast[pos][attr]) === 'string') {
            ast[pos][attr] = {
              $x: this.parseIndex(ast[pos][attr]),
              $v: {}
            };
          }
          ast[pos][attr].$v[key] = value;
          return;
        }
        ast[pos][attr] = value;
        return;
      }

      // Hash value
      if (key) {
        pos = this.entryIds[id];
        if (pos === undefined) {
          v = {};
          v[key] = value;
          ast.push({$i: id, $v: v});
          this.entryIds[id] = ast.length - 1;
          return;
        }
        if (typeof(ast[pos].$v) === 'string') {
          ast[pos].$x = this.parseIndex(ast[pos].$v);
          ast[pos].$v = {};
        }
        ast[pos].$v[key] = value;
        return;
      }

      // simple value
      ast.push({$i: id, $v: value});
      this.entryIds[id] = ast.length - 1;
    },

    parseString: function(str) {
      var chunks = str.split(this.patterns.placeables);
      var complexStr = [];

      var len = chunks.length;
      var placeablesCount = (len - 1) / 2;

      if (placeablesCount >= MAX_PLACEABLES) {
        throw new L10nError('Too many placeables (' + placeablesCount +
                            ', max allowed is ' + MAX_PLACEABLES + ')');
      }

      for (var i = 0; i < chunks.length; i++) {
        if (chunks[i].length === 0) {
          continue;
        }
        if (i % 2 === 1) {
          complexStr.push({t: 'idOrVar', v: chunks[i]});
        } else {
          complexStr.push(chunks[i]);
        }
      }
      return complexStr;
    },

    unescapeString: function(str) {
      if (str.lastIndexOf('\\') !== -1) {
        str = str.replace(this.patterns.controlChars, '$1');
      }
      return str.replace(this.patterns.unicode, function(match, token) {
        return unescape('%u' + '0000'.slice(token.length) + token);
      });
    },

    parseIndex: function(str) {
      var match = str.match(this.patterns.index);
      if (!match) {
        throw new L10nError('Malformed index');
      }
      if (match[2]) {
        return [{t: 'idOrVar', v: match[1]}, match[2]];
      } else {
        return [{t: 'idOrVar', v: match[1]}];
      }
    }
  };



  var KNOWN_MACROS = ['plural'];

  var MAX_PLACEABLE_LENGTH = 2500;
  var rePlaceables = /\{\{\s*(.+?)\s*\}\}/g;

  function createEntry(node, env) {
    var keys = Object.keys(node);

    // the most common scenario: a simple string with no arguments
    if (typeof node.$v === 'string' && keys.length === 2) {
      return node.$v;
    }

    var attrs;

    /* jshint -W084 */
    for (var i = 0, key; key = keys[i]; i++) {
      if (key[0] === '$') {
        continue;
      }

      if (!attrs) {
        attrs = Object.create(null);
      }
      attrs[key] = createAttribute(node[key], env, node.$i + '.' + key);
    }

    return {
      id: node.$i,
      value: node.$v === undefined ? null : node.$v,
      index: node.$x || null,
      attrs: attrs || null,
      env: env,
      // the dirty guard prevents cyclic or recursive references
      dirty: false
    };
  }

  function createAttribute(node, env, id) {
    if (typeof node === 'string') {
      return node;
    }

    var value;
    if (Array.isArray(node)) {
      value = node;
    }

    return {
      id: id,
      value: value || node.$v || null,
      index: node.$x || null,
      env: env,
      dirty: false
    };
  }


  function format(args, entity) {
    if (typeof entity === 'string') {
      return entity;
    }

    if (entity.dirty) {
      throw new L10nError('Cyclic reference detected: ' + entity.id);
    }

    entity.dirty = true;
    var val;
    // if format fails, we want the exception to bubble up and stop the whole
    // resolving process;  however, we still need to clean up the dirty flag
    try {
      val = resolveValue(args, entity.env, entity.value, entity.index);
    } finally {
      entity.dirty = false;
    }
    return val;
  }

  function resolveIdentifier(args, env, id) {
    if (KNOWN_MACROS.indexOf(id) > -1) {
      return env['__' + id];
    }

    if (args && args.hasOwnProperty(id)) {
      if (typeof args[id] === 'string' || (typeof args[id] === 'number' &&
          !isNaN(args[id]))) {
        return args[id];
      } else {
        throw new L10nError('Arg must be a string or a number: ' + id);
      }
    }

    // XXX: special case for Node.js where still:
    // '__proto__' in Object.create(null) => true
    if (id in env && id !== '__proto__') {
      return format(args, env[id]);
    }

    throw new L10nError('Unknown reference: ' + id);
  }

  function subPlaceable(args, env, id) {
    var value;
    try {
      value = resolveIdentifier(args, env, id);
    } catch (err) {
      return '{{ ' + id + ' }}';
    }

    if (typeof value === 'number') {
      return value;
    }

    if (typeof value === 'string') {
      // prevent Billion Laughs attacks
      if (value.length >= MAX_PLACEABLE_LENGTH) {
        throw new L10nError('Too many characters in placeable (' +
                            value.length + ', max allowed is ' +
                            MAX_PLACEABLE_LENGTH + ')');
      }
      return value;
    }

    return '{{ ' + id + ' }}';
  }

  function interpolate(args, env, arr) {
    return arr.reduce(function(prev, cur) {
      if (typeof cur === 'string') {
        return prev + cur;
      } else if (cur.t === 'idOrVar'){
        return prev + subPlaceable(args, env, cur.v);
      }
    }, '');
  }

  function resolveSelector(args, env, expr, index) {
      var selectorName = index[0].v;
      var selector = resolveIdentifier(args, env, selectorName);

      if (typeof selector !== 'function') {
        // selector is a simple reference to an entity or args
        return selector;
      }

      var argValue = index[1] ?
        resolveIdentifier(args, env, index[1]) : undefined;

      if (selector === env.__plural) {
        // special cases for zero, one, two if they are defined on the hash
        if (argValue === 0 && 'zero' in expr) {
          return 'zero';
        }
        if (argValue === 1 && 'one' in expr) {
          return 'one';
        }
        if (argValue === 2 && 'two' in expr) {
          return 'two';
        }
      }

      return selector(argValue);
  }

  function resolveValue(args, env, expr, index) {
    if (typeof expr === 'string' ||
        typeof expr === 'boolean' ||
        typeof expr === 'number' ||
        !expr) {
      return expr;
    }

    if (Array.isArray(expr)) {
      return interpolate(args, env, expr);
    }

    // otherwise, it's a dict
    if (index) {
      // try to use the index in order to select the right dict member
      var selector = resolveSelector(args, env, expr, index);
      if (expr.hasOwnProperty(selector)) {
        return resolveValue(args, env, expr[selector]);
      }
    }

    // if there was no index or no selector was found, try 'other'
    if ('other' in expr) {
      return resolveValue(args, env, expr.other);
    }

    // XXX Specify entity id
    throw new L10nError('Unresolvable value');
  }

  var Resolver = {
    createEntry: createEntry,
    format: format,
    rePlaceables: rePlaceables
  };



  /* Utility functions */

  // Recursively walk an AST node searching for content leaves
  function walkContent(node, fn) {
    if (typeof node === 'string') {
      return fn(node);
    }

    if (node.t === 'idOrVar') {
      return node;
    }

    var rv = Array.isArray(node) ? [] : {};
    var keys = Object.keys(node);

    for (var i = 0, key; (key = keys[i]); i++) {
      // don't change identifier ($i) nor indices ($x)
      if (key === '$i' || key === '$x') {
        rv[key] = node[key];
      } else {
        rv[key] = walkContent(node[key], fn);
      }
    }
    return rv;
  }


  /* Pseudolocalizations
   *
   * PSEUDO is a dict of strategies to be used to modify the English
   * context in order to create pseudolocalizations.  These can be used by
   * developers to test the localizability of their code without having to
   * actually speak a foreign language.
   *
   * Currently, the following pseudolocales are supported:
   *
   *   qps-ploc - Ȧȧƈƈḗḗƞŧḗḗḓ Ḗḗƞɠŀīīşħ
   *
   *     In Accented English all English letters are replaced by accented
   *     Unicode counterparts which don't impair the readability of the content.
   *     This allows developers to quickly test if any given string is being
   *     correctly displayed in its 'translated' form.  Additionally, simple
   *     heuristics are used to make certain words longer to better simulate the
   *     experience of international users.
   *
   *   qps-plocm - ɥsıʅƃuƎ pǝɹoɹɹıW
   *
   *     Mirrored English is a fake RTL locale.  All words are surrounded by
   *     Unicode formatting marks forcing the RTL directionality of characters.
   *     In addition, to make the reversed text easier to read, individual
   *     letters are flipped.
   *
   *     Note: The name above is hardcoded to be RTL in case code editors have
   *     trouble with the RLO and PDF Unicode marks.  In reality, it should be
   *     surrounded by those marks as well.
   *
   * See https://bugzil.la/900182 for more information.
   *
   */

  var reAlphas = /[a-zA-Z]/g;
  var reVowels = /[aeiouAEIOU]/g;

  // ȦƁƇḒḖƑƓĦĪĴĶĿḾȠǾƤɊŘŞŦŬṼẆẊẎẐ + [\\]^_` + ȧƀƈḓḗƒɠħīĵķŀḿƞǿƥɋřşŧŭṽẇẋẏẑ
  var ACCENTED_MAP = '\u0226\u0181\u0187\u1E12\u1E16\u0191\u0193\u0126\u012A' +
                     '\u0134\u0136\u013F\u1E3E\u0220\u01FE\u01A4\u024A\u0158' +
                     '\u015E\u0166\u016C\u1E7C\u1E86\u1E8A\u1E8E\u1E90' +
                     '[\\]^_`' +
                     '\u0227\u0180\u0188\u1E13\u1E17\u0192\u0260\u0127\u012B' +
                     '\u0135\u0137\u0140\u1E3F\u019E\u01FF\u01A5\u024B\u0159' +
                     '\u015F\u0167\u016D\u1E7D\u1E87\u1E8B\u1E8F\u1E91';

  // XXX Until https://bugzil.la/1007340 is fixed, ᗡℲ⅁⅂⅄ don't render correctly
  // on the devices.  For now, use the following replacements: pɟפ˥ʎ
  // ∀ԐↃpƎɟפHIſӼ˥WNOԀÒᴚS⊥∩ɅＭXʎZ + [\\]ᵥ_, + ɐqɔpǝɟƃɥıɾʞʅɯuodbɹsʇnʌʍxʎz
  var FLIPPED_MAP = '\u2200\u0510\u2183p\u018E\u025F\u05E4HI\u017F' +
                    '\u04FC\u02E5WNO\u0500\xD2\u1D1AS\u22A5\u2229\u0245' +
                    '\uFF2DX\u028EZ' +
                    '[\\]\u1D65_,' +
                    '\u0250q\u0254p\u01DD\u025F\u0183\u0265\u0131\u027E' +
                    '\u029E\u0285\u026Fuodb\u0279s\u0287n\u028C\u028Dx\u028Ez';

  function makeLonger(val) {
    return val.replace(reVowels, function(match) {
      return match + match.toLowerCase();
    });
  }

  function replaceChars(map, val) {
    // Replace each Latin letter with a Unicode character from map
    return val.replace(reAlphas, function(match) {
      return map.charAt(match.charCodeAt(0) - 65);
    });
  }

  var reWords = /[^\W0-9_]+/g;

  function makeRTL(val) {
    // Surround each word with Unicode formatting codes, RLO and PDF:
    //   U+202E:   RIGHT-TO-LEFT OVERRIDE (RLO)
    //   U+202C:   POP DIRECTIONAL FORMATTING (PDF)
    // See http://www.w3.org/International/questions/qa-bidi-controls
    return val.replace(reWords, function(match) {
      return '\u202e' + match + '\u202c';
    });
  }

  // strftime tokens (%a, %Eb) and template {vars}
  var reExcluded = /(%[EO]?\w|\{\s*.+?\s*\})/;

  function mapContent(fn, val) {
    if (!val) {
      return val;
    }
    var parts = val.split(reExcluded);
    var modified = parts.map(function(part) {
      if (reExcluded.test(part)) {
        return part;
      }
      return fn(part);
    });
    return modified.join('');
  }

  function Pseudo(id, name, charMap, modFn) {
    this.id = id;
    this.translate = mapContent.bind(null, function(val) {
      return replaceChars(charMap, modFn(val));
    });
    this.name = this.translate(name);
  }

  var PSEUDO = {
    'qps-ploc': new Pseudo('qps-ploc', 'Runtime Accented',
                           ACCENTED_MAP, makeLonger),
    'qps-plocm': new Pseudo('qps-plocm', 'Runtime Mirrored',
                            FLIPPED_MAP, makeRTL)
  };



  function Locale(id, ctx) {
    this.id = id;
    this.ctx = ctx;
    this.isReady = false;
    this.entries = Object.create(null);
    this.entries.__plural = getPluralRule(this.isPseudo() ?
                                          this.ctx.defaultLocale : id);
  }

  Locale.prototype.isPseudo = function() {
    return this.ctx.qps.indexOf(this.id) !== -1;
  };

  var bindingsIO = {
    extra: function(id, ver, path, type, callback, errback) {
      if (type === 'properties') {
        type = 'text';
      }
      navigator.mozApps.getLocalizationResource(id, ver, path, type).
        then(callback.bind(null, null), errback);
    },
    app: function(id, ver, path, type, callback, errback, sync) {
      switch (type) {
        case 'properties':
          io.load(path, callback, sync);
          break;
        case 'json':
          io.loadJSON(path, callback, sync);
          break;
      }
    },
  };

  Locale.prototype.build = function L_build(callback) {
    var sync = !callback;
    var ctx = this.ctx;
    var self = this;

    var l10nLoads = ctx.resLinks.length;

    function onL10nLoaded(err) {
      if (err) {
        ctx._emitter.emit('fetcherror', err);
      }
      if (--l10nLoads <= 0) {
        self.isReady = true;
        if (callback) {
          callback();
        }
      }
    }

    if (l10nLoads === 0) {
      onL10nLoaded();
      return;
    }

    function onJSONLoaded(err, json) {
      if (!err && json) {
        self.addAST(json);
      }
      onL10nLoaded(err);
    }

    function onPropLoaded(err, source) {
      if (!err && source) {
        var ast = PropertiesParser.parse(ctx, source);
        self.addAST(ast);
      }
      onL10nLoaded(err);
    }

    var idToFetch = this.isPseudo() ? ctx.defaultLocale : this.id;
    var appVersion = null;
    var source = 'app';
    if (typeof(navigator) !== 'undefined') {
      source = navigator.mozL10n._config.localeSources[this.id] || 'app';
      appVersion = navigator.mozL10n._config.appVersion;
    }

    for (var i = 0; i < ctx.resLinks.length; i++) {
      var resLink = decodeURI(ctx.resLinks[i]);
      var path = resLink.replace('{locale}', idToFetch);
      var type = path.substr(path.lastIndexOf('.') + 1);

      var cb;
      switch (type) {
        case 'json':
          cb = onJSONLoaded;
          break;
        case 'properties':
          cb = onPropLoaded;
          break;
      }
      bindingsIO[source](this.id,
        appVersion, path, type, cb, onL10nLoaded, sync);
    }
  };

  function createPseudoEntry(node, entries) {
    return Resolver.createEntry(
      walkContent(node, PSEUDO[this.id].translate),
      entries);
  }

  Locale.prototype.addAST = function(ast) {
    /* jshint -W084 */

    var createEntry = this.isPseudo() ?
      createPseudoEntry.bind(this) : Resolver.createEntry;

    for (var i = 0, node; node = ast[i]; i++) {
      this.entries[node.$i] = createEntry(node, this.entries);
    }
  };




  function Context(id) {
    this.id = id;
    this.isReady = false;
    this.isLoading = false;

    this.defaultLocale = 'en-US';
    this.availableLocales = [];
    this.supportedLocales = [];
    this.qps = [];

    this.resLinks = [];
    this.locales = {};

    this._emitter = new EventEmitter();
    this._ready = new Promise(this.once.bind(this));
  }


  // Getting translations

  function reportMissing(id, err) {
    this._emitter.emit('notfounderror', err);
    return id;
  }

  function getWithFallback(id) {
    /* jshint -W084 */
    var cur = 0;
    var loc;
    var locale;
    while (loc = this.supportedLocales[cur]) {
      locale = this.getLocale(loc);
      if (!locale.isReady) {
        // build without callback, synchronously
        locale.build(null);
      }
      var entry = locale.entries[id];
      if (entry === undefined) {
        cur++;
        reportMissing.call(this, id, new L10nError(
          '"' + id + '"' + ' not found in ' + loc + ' in ' + this.id,
          id, loc));
        continue;
      }
      return entry;
    }

    throw new L10nError(
      '"' + id + '"' + ' missing from all supported locales in ' + this.id, id);
  }

  function formatValue(args, entity) {
    if (typeof entity === 'string') {
      return entity;
    }

    try {
      return Resolver.format(args, entity);
    } catch (err) {
      this._emitter.emit('resolveerror', err);
      return entity.id;
    }
  }

  function formatEntity(args, entity) {
    if (!entity.attrs) {
      return {
        value: formatValue.call(this, args, entity),
        attrs: null
      };
    }

    var formatted = {
      value: formatValue.call(this, args, entity),
      attrs: Object.create(null)
    };

    for (var key in entity.attrs) {
      /* jshint -W089 */
      formatted.attrs[key] = formatValue.call(this, args, entity.attrs[key]);
    }

    return formatted;
  }

  function formatAsync(fn, id, args) {
    return this._ready.then(
      getWithFallback.bind(this, id)).then(
        fn.bind(this, args),
        reportMissing.bind(this, id));
  }

  Context.prototype.formatValue = function(id, args) {
    return formatAsync.call(this, formatValue, id, args);
  };

  Context.prototype.formatEntity = function(id, args) {
    return formatAsync.call(this, formatEntity, id, args);
  };

  function legacyGet(fn, id, args) {
    if (!this.isReady) {
      throw new L10nError('Context not ready');
    }

    var entry;
    try {
      entry = getWithFallback.call(this, id);
    } catch (err) {
      // Don't handle notfounderrors in individual locales in any special way
      if (err.loc) {
        throw err;
      }
      // For general notfounderrors, report them and return legacy fallback
      reportMissing.call(this, id, err);
      // XXX legacy compat;  some Gaia code checks if returned value is falsy or
      // an empty string to know if a translation is available;  this is bad and
      // will be fixed eventually in https://bugzil.la/1020138
      return '';
    }

    // If translation is broken use regular fallback-on-id approach
    return fn.call(this, args, entry);
  }

  Context.prototype.get = function(id, args) {
    return legacyGet.call(this, formatValue, id, args);
  };

  Context.prototype.getEntity = function(id, args) {
    return legacyGet.call(this, formatEntity, id, args);
  };

  Context.prototype.getLocale = function getLocale(code) {
    /* jshint -W093 */

    var locales = this.locales;
    if (locales[code]) {
      return locales[code];
    }

    return locales[code] = new Locale(code, this);
  };


  // Getting ready

  function negotiate(available, requested, defaultLocale) {
    var supportedLocale;
    // Find the first locale in the requested list that is supported.
    for (var i = 0; i < requested.length; i++) {
      var locale = requested[i];
      if (available.indexOf(locale) !== -1) {
        supportedLocale = locale;
        break;
      }
    }
    if (!supportedLocale ||
        supportedLocale === defaultLocale) {
      return [defaultLocale];
    }

    return [supportedLocale, defaultLocale];
  }

  function freeze(supported) {
    var locale = this.getLocale(supported[0]);
    if (locale.isReady) {
      setReady.call(this, supported);
    } else {
      locale.build(setReady.bind(this, supported));
    }
  }

  function setReady(supported) {
    this.supportedLocales = supported;
    this.isReady = true;
    this._emitter.emit('ready');
  }

  Context.prototype.registerLocales = function(defLocale, available) {

    if (defLocale) {
      this.defaultLocale = defLocale;
    }
    /* jshint boss:true */
    this.availableLocales = [this.defaultLocale];
    this.qps = Object.keys(PSEUDO);

    if (available) {
      for (var i = 0, loc; loc = available[i]; i++) {
        if (this.availableLocales.indexOf(loc) === -1) {
          this.availableLocales.push(loc);
          var pos = this.qps.indexOf(loc);
          if (pos !== -1) {
            // remove from this context's runtime pseudolocales
            this.qps.splice(pos, 1);
          }
        }
      }
    }
  };

  Context.prototype.requestLocales = function requestLocales() {
    if (this.isLoading && !this.isReady) {
      throw new L10nError('Context not ready');
    }

    this.isLoading = true;
    var requested = Array.prototype.slice.call(arguments);
    if (requested.length === 0) {
      throw new L10nError('No locales requested');
    }

    var supported = negotiate(
      this.availableLocales.concat(this.qps),
      requested,
      this.defaultLocale);

    // freeze only if the first language in the fallback chain is new
    if (this.supportedLocales[0] !== supported[0]) {
      freeze.call(this, supported);
    }
  };


  // Events

  Context.prototype.addEventListener = function(type, listener) {
    this._emitter.addEventListener(type, listener);
  };

  Context.prototype.removeEventListener = function(type, listener) {
    this._emitter.removeEventListener(type, listener);
  };

  Context.prototype.ready = function(callback) {
    if (this.isReady) {
      setTimeout(callback);
    }
    this.addEventListener('ready', callback);
  };

  Context.prototype.once = function(callback) {
    /* jshint -W068 */
    if (this.isReady) {
      setTimeout(callback);
      return;
    }

    var callAndRemove = (function() {
      this.removeEventListener('ready', callAndRemove);
      callback();
    }).bind(this);
    this.addEventListener('ready', callAndRemove);
  };



  var DEBUG = false;
  var isPretranslated = false;
  var rtlList = ['ar', 'he', 'fa', 'ps', 'qps-plocm', 'ur'];
  var nodeObserver = null;
  var pendingElements = null;

  var moConfig = {
    attributes: true,
    characterData: false,
    childList: true,
    subtree: true,
    attributeFilter: ['data-l10n-id', 'data-l10n-args']
  };

  // Public API

  navigator.mozL10n = {
    ctx: new Context(window.document ? document.URL : null),
    get: function get(id, ctxdata) {
      return navigator.mozL10n.ctx.get(id, ctxdata);
    },
    formatValue: function(id, ctxdata) {
      return navigator.mozL10n.ctx.formatValue(id, ctxdata);
    },
    formatEntity: function(id, ctxdata) {
      return navigator.mozL10n.ctx.formatEntity(id, ctxdata);
    },
    translateFragment: function (fragment) {
      return translateFragment.call(navigator.mozL10n, fragment);
    },
    setAttributes: setL10nAttributes,
    getAttributes: getL10nAttributes,
    ready: function ready(callback) {
      return navigator.mozL10n.ctx.ready(callback);
    },
    once: function once(callback) {
      return navigator.mozL10n.ctx.once(callback);
    },
    get readyState() {
      return navigator.mozL10n.ctx.isReady ? 'complete' : 'loading';
    },
    language: {
      set code(lang) {
        navigator.mozL10n.ctx.requestLocales(lang);
      },
      get code() {
        return navigator.mozL10n.ctx.supportedLocales[0];
      },
      get direction() {
        return getDirection(navigator.mozL10n.ctx.supportedLocales[0]);
      }
    },
    qps: PSEUDO,
    _config: {
      appVersion: null,
      localeSources: Object.create(null),
    },
    _getInternalAPI: function() {
      return {
        Error: L10nError,
        Context: Context,
        Locale: Locale,
        Resolver: Resolver,
        getPluralRule: getPluralRule,
        rePlaceables: rePlaceables,
        translateDocument: translateDocument,
        onMetaInjected: onMetaInjected,
        PropertiesParser: PropertiesParser,
        walkContent: walkContent,
        buildLocaleList: buildLocaleList
      };
    }
  };

  navigator.mozL10n.ctx.ready(onReady.bind(navigator.mozL10n));

  navigator.mozL10n.ctx.addEventListener('notfounderror',
    function reportMissingEntity(e) {
      if (DEBUG || e.loc === 'en-US') {
        console.warn(e.toString());
      }
  });

  if (DEBUG) {
    navigator.mozL10n.ctx.addEventListener('fetcherror',
      console.error.bind(console));
    navigator.mozL10n.ctx.addEventListener('parseerror',
      console.error.bind(console));
    navigator.mozL10n.ctx.addEventListener('resolveerror',
      console.error.bind(console));
  }

  function getDirection(lang) {
    return (rtlList.indexOf(lang) >= 0) ? 'rtl' : 'ltr';
  }

  var readyStates = {
    'loading': 0,
    'interactive': 1,
    'complete': 2
  };

  function waitFor(state, callback) {
    state = readyStates[state];
    if (readyStates[document.readyState] >= state) {
      callback();
      return;
    }

    document.addEventListener('readystatechange', function l10n_onrsc() {
      if (readyStates[document.readyState] >= state) {
        document.removeEventListener('readystatechange', l10n_onrsc);
        callback();
      }
    });
  }

  if (window.document) {
    isPretranslated =
      navigator.mozL10n.ctx.qps.indexOf(navigator.language) === -1 &&
        (document.documentElement.lang === navigator.language);

    // XXX always pretranslate if data-no-complete-bug is set;  this is
    // a workaround for a netError page not firing some onreadystatechange
    // events;  see https://bugzil.la/444165
    var pretranslate = document.documentElement.dataset.noCompleteBug ?
      true : !isPretranslated;
    waitFor('interactive', init.bind(navigator.mozL10n, pretranslate));
  }

  function initObserver() {
    nodeObserver = new MutationObserver(onMutations.bind(navigator.mozL10n));
    nodeObserver.observe(document, moConfig);
  }

  function init(pretranslate) {
    if (!pretranslate) {
      // initialize MO early to collect nodes injected between now and when
      // resources are loaded because we're not going to translate the whole
      // document once l10n resources are ready
      initObserver();
    }
    initResources.call(navigator.mozL10n);
  }

  function initResources() {
    /* jshint boss:true */

    var meta = {};
    var nodes = document.head
                        .querySelectorAll('link[rel="localization"],' +
                                          'meta[name="availableLanguages"],' +
                                          'meta[name="defaultLanguage"],' +
                                          'meta[name="appVersion"],' +
                                          'script[type="application/l10n"]');
    for (var i = 0, node; node = nodes[i]; i++) {
      var type = node.getAttribute('rel') || node.nodeName.toLowerCase();
      switch (type) {
        case 'localization':
          this.ctx.resLinks.push(node.getAttribute('href'));
          break;
        case 'meta':
          onMetaInjected.call(this, node, meta);
          break;
        case 'script':
          onScriptInjected.call(this, node);
          break;
      }
    }

    var additionalLanguagesPromise;

    if (navigator.mozApps && navigator.mozApps.getAdditionalLanguages) {
      // if the environment supports langpacks, register extra languages…
      additionalLanguagesPromise =
        navigator.mozApps.getAdditionalLanguages().catch(function(e) {
          console.error('Error while loading getAdditionalLanguages', e);
        });

      // …and listen to langpacks being added and removed
      document.addEventListener('additionallanguageschange', function(evt) {
        registerLocales.call(this, meta, evt.detail);
        this.ctx.requestLocales.apply(
          this.ctx, navigator.languages || [navigator.language]);
      }.bind(this));
    } else {
      additionalLanguagesPromise = Promise.resolve();
    }

    additionalLanguagesPromise.then(function(extraLangs) {
      registerLocales.call(this, meta, extraLangs);
      initLocale.call(this);
    }.bind(this));
  }

  function registerLocales(meta, extraLangs) {
    var locales = buildLocaleList.call(this, meta, extraLangs);
    navigator.mozL10n._config.localeSources = locales[1];
    this.ctx.registerLocales(locales[0], Object.keys(locales[1]));
  }

  function getMatchingLangpack(appVersion, langpacks) {
    for (var i = 0, langpack; (langpack = langpacks[i]); i++) {
      if (langpack.target === appVersion) {
        return langpack;
      }
    }
    return null;
  }

  function buildLocaleList(meta, extraLangs) {
    var loc, lp;
    var localeSources = Object.create(null);
    var defaultLocale = meta.defaultLocale || this.ctx.defaultLocale;

    if (meta.availableLanguages) {
      for (loc in meta.availableLanguages) {
        localeSources[loc] = 'app';
      }
    }

    if (extraLangs) {
      for (loc in extraLangs) {
        lp = getMatchingLangpack(this._config.appVersion, extraLangs[loc]);

        if (!lp) {
          continue;
        }
        if (!(loc in localeSources) ||
            !meta.availableLanguages[loc] ||
            parseInt(lp.revision) > meta.availableLanguages[loc]) {
          localeSources[loc] = 'extra';
        }
      }
    }

    if (!(defaultLocale in localeSources)) {
      localeSources[defaultLocale] = 'app';
    }
    return [defaultLocale, localeSources];
  }

  function splitAvailableLanguagesString(str) {
    var langs = {};

    str.split(',').forEach(function(lang) {
      // code:revision
      lang = lang.trim().split(':');
      // if revision is missing, use NaN
      langs[lang[0]] = parseInt(lang[1]);
    });
    return langs;
  }

  function onMetaInjected(node, meta) {
    switch (node.getAttribute('name')) {
      case 'availableLanguages':
        meta.availableLanguages =
          splitAvailableLanguagesString(node.getAttribute('content'));
        break;
      case 'defaultLanguage':
        meta.defaultLanguage = node.getAttribute('content');
        break;
      case 'appVersion':
        navigator.mozL10n._config.appVersion = node.getAttribute('content');
        break;
    }
  }

  function onScriptInjected(node) {
    var lang = node.getAttribute('lang');
    var locale = this.ctx.getLocale(lang);
    locale.addAST(JSON.parse(node.textContent));
  }

  function initLocale() {
    this.ctx.requestLocales.apply(
      this.ctx, navigator.languages || [navigator.language]);
    window.addEventListener('languagechange', function l10n_langchange() {
      this.ctx.requestLocales.apply(
        this.ctx, navigator.languages || [navigator.language]);
    }.bind(this));
  }

  function localizeMutations(mutations) {
    var mutation;
    var targets = new Set();

    for (var i = 0; i < mutations.length; i++) {
      mutation = mutations[i];
      if (mutation.type === 'childList') {
        var addedNode;

        for (var j = 0; j < mutation.addedNodes.length; j++) {
          addedNode = mutation.addedNodes[j];
          if (addedNode.nodeType !== Node.ELEMENT_NODE) {
            continue;
          }
          targets.add(addedNode);
        }
      }

      if (mutation.type === 'attributes') {
        targets.add(mutation.target);
      }
    }

    targets.forEach(function(target) {
      if (target.childElementCount) {
        translateFragment.call(this, target);
      } else if (target.hasAttribute('data-l10n-id')) {
        translateElement.call(this, target);
      }
    }, this);
  }

  function onMutations(mutations, self) {
    self.disconnect();
    localizeMutations.call(this, mutations);
    self.observe(document, moConfig);
  }

  function onReady() {
    if (!isPretranslated) {
      translateDocument.call(this);
    }
    isPretranslated = false;

    if (pendingElements) {
      /* jshint boss:true */
      for (var i = 0, element; element = pendingElements[i]; i++) {
        translateElement.call(this, element);
      }
      pendingElements = null;
    }

    if (!nodeObserver) {
      initObserver();
    }
    fireLocalizedEvent.call(this);
  }

  function fireLocalizedEvent() {
    var event = new CustomEvent('localized', {
      'bubbles': false,
      'cancelable': false,
      'detail': {
        'language': this.ctx.supportedLocales[0]
      }
    });
    window.dispatchEvent(event);
  }

  /* jshint -W104 */

  function translateDocument() {
    document.documentElement.lang = this.language.code;
    document.documentElement.dir = this.language.direction;
    translateFragment.call(this, document.documentElement);
  }

  function translateFragment(element) {
    if (element.hasAttribute('data-l10n-id')) {
      translateElement.call(this, element);
    }

    var nodes = getTranslatableChildren(element);
    for (var i = 0; i < nodes.length; i++ ) {
      translateElement.call(this, nodes[i]);
    }
  }

  function setL10nAttributes(element, id, args) {
    element.setAttribute('data-l10n-id', id);
    if (args) {
      element.setAttribute('data-l10n-args', JSON.stringify(args));
    }
  }

  function getL10nAttributes(element) {
    return {
      id: element.getAttribute('data-l10n-id'),
      args: JSON.parse(element.getAttribute('data-l10n-args'))
    };
  }

  function getTranslatableChildren(element) {
    return element ? element.querySelectorAll('*[data-l10n-id]') : [];
  }

  var allowedHtmlAttrs = {
    'ariaLabel': 'aria-label',
    'ariaValueText': 'aria-valuetext',
    'ariaMozHint': 'aria-moz-hint',
    'label': 'label',
    'placeholder': 'placeholder',
    'title': 'title'
  };

  function translateElement(element) {
    if (!this.ctx.isReady) {
      if (!pendingElements) {
        pendingElements = [];
      }
      pendingElements.push(element);
      return;
    }

    var l10n = getL10nAttributes(element);

    if (!l10n.id) {
      return false;
    }

    var entity = this.ctx.getEntity(l10n.id, l10n.args);

    if (!entity) {
      return false;
    }

    if (typeof entity.value === 'string') {
      setTextContent.call(this, l10n.id, element, entity.value);
    }

    for (var key in entity.attrs) {
      var attr = entity.attrs[key];
      if (allowedHtmlAttrs.hasOwnProperty(key)) {
        element.setAttribute(allowedHtmlAttrs[key], attr);
      } else if (key === 'innerHTML') {
        // XXX: to be removed once bug 994357 lands
        element.innerHTML = attr;
      }
    }

    return true;
  }

  function setTextContent(id, element, text) {
    if (element.firstElementChild) {
      throw new L10nError(
        'setTextContent is deprecated (https://bugzil.la/1053629). ' +
        'Setting text content of elements with child elements is no longer ' +
        'supported by l10n.js. Offending data-l10n-id: "' + id +
        '" on element ' + element.outerHTML + ' in ' + this.ctx.id);
    }

    element.textContent = text;
  }

})(this);

define("l10nbase", function(){});

/* -*- Mode: js; js-indent-level: 2; indent-tabs-mode: nil -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */



/**
 * This lib relies on `l10n.js' to implement localizable date/time strings.
 *
 * The proposed `DateTimeFormat' object should provide all the features that are
 * planned for the `Intl.DateTimeFormat' constructor, but the API does not match
 * exactly the ES-i18n draft.
 *   - https://bugzilla.mozilla.org/show_bug.cgi?id=769872
 *   - http://wiki.ecmascript.org/doku.php?id=globalization:specification_drafts
 *
 * Besides, this `DateTimeFormat' object provides two features that aren't
 * planned in the ES-i18n spec:
 *   - a `toLocaleFormat()' that really works (i.e. fully translated);
 *   - a `fromNow()' method to handle relative dates ("pretty dates").
 *
 * WARNING: this library relies on the non-standard `toLocaleFormat()' method,
 * which is specific to Firefox -- no other browser is supported.
 */

navigator.mozL10n.DateTimeFormat = function(locales, options) {
  var _ = navigator.mozL10n.get;

  // https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/Date/toLocaleFormat
  function localeFormat(d, format) {
    var tokens = format.match(/(%E.|%O.|%.)/g);

    for (var i = 0; tokens && i < tokens.length; i++) {
      var value = '';

      // http://pubs.opengroup.org/onlinepubs/007908799/xsh/strftime.html
      switch (tokens[i]) {
        // localized day/month names
        case '%a':
          value = _('weekday-' + d.getDay() + '-short');
          break;
        case '%A':
          value = _('weekday-' + d.getDay() + '-long');
          break;
        case '%b':
        case '%h':
          value = _('month-' + d.getMonth() + '-short');
          break;
        case '%B':
          value = _('month-' + d.getMonth() + '-long');
          break;
        case '%Eb':
          value = _('month-' + d.getMonth() + '-genitive');
          break;

        // like %H, but in 12-hour format and without any leading zero
        case '%I':
          value = d.getHours() % 12 || 12;
          break;

        // like %d, without any leading zero
        case '%e':
          value = d.getDate();
          break;

        // %p: 12 hours format (AM/PM)
        case '%p':
          value = d.getHours() < 12 ? _('time_am') : _('time_pm');
          break;

        // localized date/time strings
        case '%c':
        case '%x':
        case '%X':
          // ensure the localized format string doesn't contain any %c|%x|%X
          var tmp = _('dateTimeFormat_' + tokens[i]);
          if (tmp && !(/(%c|%x|%X)/).test(tmp)) {
            value = localeFormat(d, tmp);
          }
          break;

        // other tokens don't require any localization
      }

      format = format.replace(tokens[i], value || d.toLocaleFormat(tokens[i]));
    }

    return format;
  }

  /**
   * Returns the parts of a number of seconds
   */
  function relativeParts(seconds) {
    seconds = Math.abs(seconds);
    var descriptors = {};
    var units = [
      'years', 86400 * 365,
      'months', 86400 * 30,
      'weeks', 86400 * 7,
      'days', 86400,
      'hours', 3600,
      'minutes', 60
    ];

    if (seconds < 60) {
      return {
        minutes: Math.round(seconds / 60)
      };
    }

    for (var i = 0, uLen = units.length; i < uLen; i += 2) {
      var value = units[i + 1];
      if (seconds >= value) {
        descriptors[units[i]] = Math.floor(seconds / value);
        seconds -= descriptors[units[i]] * value;
      }
    }
    return descriptors;
  }

  /**
   * Returns a translated string which respresents the
   * relative time before or after a date.
   * @param {String|Date} time before/after the currentDate.
   * @param {String} useCompactFormat whether to use a compact display format.
   * @param {Number} maxDiff returns a formatted date if the diff is greater.
   */
  function prettyDate(time, useCompactFormat, maxDiff) {
    maxDiff = maxDiff || 86400 * 10; // default = 10 days

    switch (time.constructor) {
      case String: // timestamp
        time = parseInt(time);
        break;
      case Date:
        time = time.getTime();
        break;
    }

    var secDiff = (Date.now() - time) / 1000;
    if (isNaN(secDiff)) {
      return _('incorrectDate');
    }

    if (Math.abs(secDiff) > 60) {
      // round milliseconds up if difference is over 1 minute so the result is
      // closer to what the user would expect (1h59m59s300ms diff should return
      // "in 2 hours" instead of "in an hour")
      secDiff = secDiff > 0 ? Math.ceil(secDiff) : Math.floor(secDiff);
    }

    if (secDiff > maxDiff) {
      return localeFormat(new Date(time), '%x');
    }

    var f = useCompactFormat ? '-short' : '-long';
    var parts = relativeParts(secDiff);

    var affix = secDiff >= 0 ? '-ago' : '-until';
    for (var i in parts) {
      return _(i + affix + f, { value: parts[i]});
    }
  }

  // API
  return {
    localeDateString: function localeDateString(d) {
      return localeFormat(d, '%x');
    },
    localeTimeString: function localeTimeString(d) {
      return localeFormat(d, '%X');
    },
    localeString: function localeString(d) {
      return localeFormat(d, '%c');
    },
    localeFormat: localeFormat,
    fromNow: prettyDate,
    relativeParts: relativeParts
  };
};

define("l10ndate", function(){});


define('text',{
  load: function(name, req, onload, config) {
    var url = req.toUrl(name),
        xhr = new XMLHttpRequest();

    xhr.open('GET', url, true);
    xhr.onreadystatechange = function(evt) {
      var status, err;
      if (xhr.readyState === 4) {
        status = xhr.status;
        if (status > 399 && status < 600) {
          //An http 4xx or 5xx error. Signal an error.
          err = new Error(url + ' HTTP status: ' + status);
          err.xhr = xhr;
          onload.error(err);
        } else {
          onload(xhr.responseText);
        }
      }
    };
    xhr.responseType = 'text';
    xhr.send(null);
  }
});



define('folder_depth_classes',[],function() {

return [
  'fld-folder-depth0',
  'fld-folder-depth1',
  'fld-folder-depth2',
  'fld-folder-depth3',
  'fld-folder-depth4',
  'fld-folder-depth5',
  'fld-folder-depthmax'
];

});

define('tmpl!cards/value_selector.html',['tmpl'], function (tmpl) { return tmpl.toDom('<form class="email-value-selector collapsed" role="dialog" data-type="value-selector">\n  <section class="scrollable">\n    <h1></h1>\n    <ol role="listbox">\n    </ol>\n  </section>\n  <menu>\n    <button class="full"\n            data-l10n-id="message-multiedit-cancel"></button>\n  </menu>\n</form>'); });

define('tmpl!cards/vsl/item.html',['tmpl'], function (tmpl) { return tmpl.toDom('<li role="option"><label role="presentation"> <span></span></label></li>'); });

/*
!! Warning !!
  This value selector uses the form layout as specified in
  shared/style/value_selector/index.html. If that changes, or its associated
  styles change, then this file or value_selector.html or vsl/index.html may
  need to be adjusted.

How to:
  var prompt1 = new ValueSelector('Dummy title 1', [
    {
      label: 'Dummy element',
      callback: function() {
        alert('Define an action here!');
      }
    }
  ]);

  prompt1.addToList('Another button', 'depth0',
                    true, function(){alert('Another action');});
  prompt1.show();
*/
/*jshint browser: true */
/*global alert, define */
define('value_selector',['require','cards','folder_depth_classes','tmpl!cards/value_selector.html','tmpl!cards/vsl/item.html'],function(require) {


var cards = require('cards'),
    FOLDER_DEPTH_CLASSES = require('folder_depth_classes'),
    formNode = require('tmpl!cards/value_selector.html'),
    itemTemplateNode = require('tmpl!cards/vsl/item.html');

// Used for empty click handlers.
function noop() {}

function ValueSelector(title, list) {
  var init, show, hide, render, setTitle, emptyList, addToList,
      data;

  init = function() {
    data = {
      title: 'No Title',
      list: [
        {
          label: 'Dummy element',
          callback: function() {
            alert('Define an action here!');
          }
        }
      ]
    };

    document.body.appendChild(formNode);

    var btnCancel = formNode.querySelector('button');
    btnCancel.addEventListener('click', function(event) {
      event.stopPropagation();
      event.preventDefault();
      hide();
    });

    // Empty dummy data
    emptyList();

    // Apply optional actions while initializing
    if (typeof title === 'string') {
      setTitle(title);
    }

    if (Array.isArray(list)) {
      data.list = list;
    }
  };

  show = function() {
    render();
    cards.setStatusColor(formNode);
    formNode.classList.remove('collapsed');
  };

  hide = function() {
    cards.setStatusColor();
    formNode.classList.add('collapsed');
    emptyList();
  };

  render = function() {
    var title = formNode.querySelector('h1'),
        list = formNode.querySelector('ol');

    title.textContent = data.title;

    list.innerHTML = '';
    data.list.forEach(function(listItem) {
      var node = itemTemplateNode.cloneNode(true);

      node.querySelector('span').textContent = listItem.label;

      // Here we apply the folder-card's depth indentation to represent label.
      var depthIdx = listItem.depth;
      depthIdx = Math.min(FOLDER_DEPTH_CLASSES.length - 1, depthIdx);
      node.classList.add(FOLDER_DEPTH_CLASSES[depthIdx]);

      // If not selectable use an empty click handler. Because of event
      // fuzzing, we want to have something registered, otherwise an
      // adjacent list item may receive the click.
      var callback = listItem.selectable ? listItem.callback : noop;
      node.addEventListener('click', callback, false);

      list.appendChild(node);
    });
  };

  setTitle = function(str) {
    data.title = str;
  };

  emptyList = function() {
    data.list = [];
  };

  addToList = function(label, depth, selectable, callback) {
    data.list.push({
      label: label,
      depth: depth,
      selectable: selectable,
      callback: callback
    });
  };

  init();

  return{
    init: init,
    show: show,
    hide: hide,
    setTitle: setTitle,
    addToList: addToList,
    List: list
  };
}

return ValueSelector;

});

/* exported GestureDetector */



/**
 * GestureDetector.js: generate events for one and two finger gestures.
 *
 * A GestureDetector object listens for touch events on a specified
 * element and generates higher-level events that describe one and two finger
 * gestures on the element.
 *
 * Supported events:
 *
 *  tap        like a click event
 *  dbltap     like dblclick
 *  pan        one finger motion
 *  swipe      when a finger is released following pan events
 *  holdstart  touch and hold. Must set an option to get these.
 *  holdmove   motion after a holdstart event
 *  holdend    when the finger goes up after holdstart/holdmove
 *  transform  2-finger pinch and twist gestures for scaling and rotation
 *
 * Each of these events is a bubbling CustomEvent with important details in the
 * event.detail field. The event details are not yet stable and are not yet
 * documented. See the calls to emitEvent() for details.
 *
 * To use this library, create a GestureDetector object by passing an element to
 * the GestureDetector() constructor and then calling startDetecting() on it.
 * The element will be the target of all the emitted gesture events. You can
 * also pass an optional object as the second constructor argument. If you're
 * interested in holdstart/holdmove/holdend events, pass {holdEvents:true} as
 * this second argument. Otherwise they will not be generated.
 * If you want to customize the pan threshold, pass {panThreshold:X} 
 * (X and Y in pixels) in the options argument.
 *
 * Implementation note: event processing is done with a simple finite-state
 * machine. This means that in general, the various kinds of gestures are
 * mutually exclusive. You won't get pan events until your finger has
 * moved more than a minimum threshold, for example, but it does, the FSM enters
 * a new state in which it can emit pan and swipe events and cannot emit hold
 * events. Similarly, if you've started a 1 finger pan/swipe gesture and
 * accidentally touch with a second finger, you'll continue to get pan events,
 * and won't suddenly start getting 2-finger transform events.
 *
 * This library never calls preventDefault() or stopPropagation on any of the
 * events it processes, so the raw touch events should still be
 * available for other code to process. It is not clear to me whether this is a
 * feature or a bug.
 */

var GestureDetector = (function() {

  //
  // Constructor
  //
  function GD(e, options) {
    this.element = e;
    this.options = options || {};
    this.options.panThreshold = this.options.panThreshold || GD.PAN_THRESHOLD;
    this.state = initialState;
    this.timers = {};
  }

  //
  // Public methods
  //

  GD.prototype.startDetecting = function() {
    var self = this;
    eventtypes.forEach(function(t) {
      self.element.addEventListener(t, self);
    });
  };

  GD.prototype.stopDetecting = function() {
    var self = this;
    eventtypes.forEach(function(t) {
      self.element.removeEventListener(t, self);
    });
  };

  //
  // Internal methods
  //

  GD.prototype.handleEvent = function(e) {
    var handler = this.state[e.type];
    if (!handler) {
      return;
    }
    // If this is a touch event handle each changed touch separately
    if (e.changedTouches) {
      // XXX https://bugzilla.mozilla.org/show_bug.cgi?id=785554
      // causes touchend events to list all touches as changed, so
      // warn if we see that bug
      if (e.type === 'touchend' && e.changedTouches.length > 1) {
        console.warn('gesture_detector.js: spurious extra changed touch on ' +
                     'touchend. See ' +
                     'https://bugzilla.mozilla.org/show_bug.cgi?id=785554');
      }

      for (var i = 0; i < e.changedTouches.length; i++) {
        handler(this, e, e.changedTouches[i]);
        // The first changed touch might have changed the state of the
        // FSM. We need this line to workaround the bug 785554, but it is
        // probably the right thing to have here, even once that bug is fixed.
        handler = this.state[e.type];
      }
    }
    else {    // Otherwise, just dispatch the event to the handler
      handler(this, e);
    }
  };

  GD.prototype.startTimer = function(type, time) {
    this.clearTimer(type);
    var self = this;
    this.timers[type] = setTimeout(function() {
      self.timers[type] = null;
      var handler = self.state[type];
      if (handler) {
        handler(self, type);
      }
    }, time);
  };

  GD.prototype.clearTimer = function(type) {
    if (this.timers[type]) {
      clearTimeout(this.timers[type]);
      this.timers[type] = null;
    }
  };

  // Switch to a new FSM state, and call the init() function of that
  // state, if it has one.  The event and touch arguments are optional
  // and are just passed through to the state init function.
  GD.prototype.switchTo = function(state, event, touch) {
    this.state = state;
    if (state.init) {
      state.init(this, event, touch);
    }
  };

  GD.prototype.emitEvent = function(type, detail) {
    if (!this.target) {
      console.error('Attempt to emit event with no target');
      return;
    }

    var event = this.element.ownerDocument.createEvent('CustomEvent');
    event.initCustomEvent(type, true, true, detail);
    this.target.dispatchEvent(event);
  };

  //
  // Tuneable parameters
  //
  GD.HOLD_INTERVAL = 1000;     // Hold events after 1000 ms
  GD.PAN_THRESHOLD = 20;       // 20 pixels movement before touch panning
  GD.DOUBLE_TAP_DISTANCE = 50;
  GD.DOUBLE_TAP_TIME = 500;
  GD.VELOCITY_SMOOTHING = 0.5;

  // Don't start sending transform events until the gesture exceeds a threshold
  GD.SCALE_THRESHOLD = 20;     // pixels
  GD.ROTATE_THRESHOLD = 22.5;  // degrees

  // For pans and zooms, we compute new starting coordinates that are part way
  // between the initial event and the event that crossed the threshold so that
  // the first event we send doesn't cause a big lurch. This constant must be
  // between 0 and 1 and says how far along the line between the initial value
  // and the new value we pick
  GD.THRESHOLD_SMOOTHING = 0.9;

  //
  // Helpful shortcuts and utility functions
  //

  var abs = Math.abs, floor = Math.floor, sqrt = Math.sqrt, atan2 = Math.atan2;
  var PI = Math.PI;

  // The names of events that we need to register handlers for
  var eventtypes = [
    'touchstart',
    'touchmove',
    'touchend'
  ];

  // Return the event's timestamp in ms
  function eventTime(e) {
    // In gecko, synthetic events seem to be in microseconds rather than ms.
    // So if the timestamp is much larger than the current time, assue it is
    // in microseconds and divide by 1000
    var ts = e.timeStamp;
    if (ts > 2 * Date.now()) {
      return Math.floor(ts / 1000);
    } else {
      return ts;
    }
  }


  // Return an object containg the space and time coordinates of
  // and event and touch. We freeze the object to make it immutable so
  // we can pass it in events and not worry about values being changed.
  function coordinates(e, t) {
    return Object.freeze({
      screenX: t.screenX,
      screenY: t.screenY,
      clientX: t.clientX,
      clientY: t.clientY,
      timeStamp: eventTime(e)
    });
  }

  // Like coordinates(), but return the midpoint between two touches
  function midpoints(e, t1, t2) {
    return Object.freeze({
      screenX: floor((t1.screenX + t2.screenX) / 2),
      screenY: floor((t1.screenY + t2.screenY) / 2),
      clientX: floor((t1.clientX + t2.clientX) / 2),
      clientY: floor((t1.clientY + t2.clientY) / 2),
      timeStamp: eventTime(e)
    });
  }

  // Given coordinates objects c1 and c2, return a new coordinates object
  // representing a point and time along the line between those points.
  // The position of the point is controlled by the THRESHOLD_SMOOTHING constant
  function between(c1, c2) {
    var r = GD.THRESHOLD_SMOOTHING;
    return Object.freeze({
      screenX: floor(c1.screenX + r * (c2.screenX - c1.screenX)),
      screenY: floor(c1.screenY + r * (c2.screenY - c1.screenY)),
      clientX: floor(c1.clientX + r * (c2.clientX - c1.clientX)),
      clientY: floor(c1.clientY + r * (c2.clientY - c1.clientY)),
      timeStamp: floor(c1.timeStamp + r * (c2.timeStamp - c1.timeStamp))
    });
  }

  // Compute the distance between two touches
  function touchDistance(t1, t2) {
    var dx = t2.screenX - t1.screenX;
    var dy = t2.screenY - t1.screenY;
    return sqrt(dx * dx + dy * dy);
  }

  // Compute the direction (as an angle) of the line between two touches
  // Returns a number d, -180 < d <= 180
  function touchDirection(t1, t2) {
    return atan2(t2.screenY - t1.screenY,
                 t2.screenX - t1.screenX) * 180 / PI;
  }

  // Compute the clockwise angle between direction d1 and direction d2.
  // Returns an angle a -180 < a <= 180.
  function touchRotation(d1, d2) {
    var angle = d2 - d1;
    if (angle > 180) {
      angle -= 360;
    } else if (angle <= -180) {
      angle += 360;
    }
    return angle;
  }

  // Determine if two taps are close enough in time and space to
  // trigger a dbltap event. The arguments are objects returned
  // by the coordinates() function.
  function isDoubleTap(lastTap, thisTap) {
    var dx = abs(thisTap.screenX - lastTap.screenX);
    var dy = abs(thisTap.screenY - lastTap.screenY);
    var dt = thisTap.timeStamp - lastTap.timeStamp;
    return (dx < GD.DOUBLE_TAP_DISTANCE &&
            dy < GD.DOUBLE_TAP_DISTANCE &&
            dt < GD.DOUBLE_TAP_TIME);
  }

  //
  // The following objects are the states of our Finite State Machine
  //

  // In this state we're not processing any gestures, just waiting
  // for an event to start a gesture and ignoring others
  var initialState = {
    name: 'initialState',
    init: function(d) {
      // When we enter or return to the initial state, clear
      // the detector properties that were tracking gestures
      // Don't clear d.lastTap here, though. We need it for dbltap events
      d.target = null;
      d.start = d.last = null;
      d.touch1 = d.touch2 = null;
      d.vx = d.vy = null;
      d.startDistance = d.lastDistance = null;
      d.startDirection = d.lastDirection = null;
      d.lastMidpoint = null;
      d.scaled = d.rotated = null;
    },

    // Switch to the touchstarted state and process the touch event there
    touchstart: function(d, e, t) {
      d.switchTo(touchStartedState, e, t);
    }
  };

  // One finger is down but we haven't generated any event yet. We're
  // waiting to see...  If the finger goes up soon, its a tap. If the finger
  // stays down and still, its a hold. If the finger moves its a pan/swipe.
  // And if a second finger goes down, its a transform
  var touchStartedState = {
    name: 'touchStartedState',
    init: function(d, e, t) {
      // Remember the target of the event
      d.target = e.target;
      // Remember the id of the touch that started
      d.touch1 = t.identifier;
      // Get the coordinates of the touch
      d.start = d.last = coordinates(e, t);
      // Start a timer for a hold
      // If we're doing hold events, start a timer for them
      if (d.options.holdEvents) {
        d.startTimer('holdtimeout', GD.HOLD_INTERVAL);
      }
    },

    touchstart: function(d, e, t) {
      // If another finger goes down in this state, then
      // go to transform state to start 2-finger gestures.
      d.clearTimer('holdtimeout');
      d.switchTo(transformState, e, t);
    },
    touchmove: function(d, e, t) {
      // Ignore any touches but the initial one
      // This could happen if there was still a finger down after
      // the end of a previous 2-finger gesture, e.g.
      if (t.identifier !== d.touch1) {
        return;
      }

      if (abs(t.screenX - d.start.screenX) > d.options.panThreshold ||
          abs(t.screenY - d.start.screenY) > d.options.panThreshold) {
        d.clearTimer('holdtimeout');
        d.switchTo(panStartedState, e, t);
      }
    },
    touchend: function(d, e, t) {
      // Ignore any touches but the initial one
      if (t.identifier !== d.touch1) {
        return;
      }

      // If there was a previous tap that was close enough in time
      // and space, then emit a 'dbltap' event
      if (d.lastTap && isDoubleTap(d.lastTap, d.start)) {
        d.emitEvent('tap', d.start);
        d.emitEvent('dbltap', d.start);
        // clear the lastTap property, so we don't get another one
        d.lastTap = null;
      }
      else {
        // Emit a 'tap' event using the starting coordinates
        // as the event details
        d.emitEvent('tap', d.start);

        // Remember the coordinates of this tap so we can detect double taps
        d.lastTap = coordinates(e, t);
      }

      // In either case clear the timer and go back to the initial state
      d.clearTimer('holdtimeout');
      d.switchTo(initialState);
    },

    holdtimeout: function(d) {
      d.switchTo(holdState);
    }

  };

  // A single touch has moved enough to exceed the pan threshold and now
  // we're going to generate pan events after each move and a swipe event
  // when the touch ends. We ignore any other touches that occur while this
  // pan/swipe gesture is in progress.
  var panStartedState = {
    name: 'panStartedState',
    init: function(d, e, t) {
      // Panning doesn't start until the touch has moved more than a
      // certain threshold. But we don't want the pan to have a jerky
      // start where the first event is a big distance. So proceed as
      // pan actually started at a point along the path between the
      // first touch and this current touch.
      d.start = d.last = between(d.start, coordinates(e, t));

      // If we transition into this state with a touchmove event,
      // then process it with that handler. If we don't do this then
      // we can end up with swipe events that don't know their velocity
      if (e.type === 'touchmove') {
        panStartedState.touchmove(d, e, t);
      }
    },

    touchmove: function(d, e, t) {
      // Ignore any fingers other than the one we're tracking
      if (t.identifier !== d.touch1) {
        return;
      }

      // Each time the touch moves, emit a pan event but stay in this state
      var current = coordinates(e, t);
      d.emitEvent('pan', {
        absolute: {
          dx: current.screenX - d.start.screenX,
          dy: current.screenY - d.start.screenY
        },
        relative: {
          dx: current.screenX - d.last.screenX,
          dy: current.screenY - d.last.screenY
        },
        position: current
      });

      // Track the pan velocity so we can report this with the swipe
      // Use a exponential moving average for a bit of smoothing
      // on the velocity
      var dt = current.timeStamp - d.last.timeStamp;
      var vx = (current.screenX - d.last.screenX) / dt;
      var vy = (current.screenY - d.last.screenY) / dt;

      if (d.vx == null) { // first time; no average
        d.vx = vx;
        d.vy = vy;
      }
      else {
        d.vx = d.vx * GD.VELOCITY_SMOOTHING +
          vx * (1 - GD.VELOCITY_SMOOTHING);
        d.vy = d.vy * GD.VELOCITY_SMOOTHING +
          vy * (1 - GD.VELOCITY_SMOOTHING);
      }

      d.last = current;
    },
    touchend: function(d, e, t) {
      // Ignore any fingers other than the one we're tracking
      if (t.identifier !== d.touch1) {
        return;
      }

      // Emit a swipe event when the finger goes up.
      // Report start and end point, dx, dy, dt, velocity and direction
      var current = coordinates(e, t);
      var dx = current.screenX - d.start.screenX;
      var dy = current.screenY - d.start.screenY;
      // angle is a positive number of degrees, starting at 0 on the
      // positive x axis and increasing clockwise.
      var angle = atan2(dy, dx) * 180 / PI;
      if (angle < 0) {
        angle += 360;
      }

      // Direction is 'right', 'down', 'left' or 'up'
      var direction;
      if (angle >= 315 || angle < 45) {
        direction = 'right';
      } else if (angle >= 45 && angle < 135) {
        direction = 'down';
      } else if (angle >= 135 && angle < 225) {
        direction = 'left';
      } else if (angle >= 225 && angle < 315) {
        direction = 'up';
      }

      d.emitEvent('swipe', {
        start: d.start,
        end: current,
        dx: dx,
        dy: dy,
        dt: e.timeStamp - d.start.timeStamp,
        vx: d.vx,
        vy: d.vy,
        direction: direction,
        angle: angle
      });

      // Go back to the initial state
      d.switchTo(initialState);
    }
  };

  // We enter this state if the user touches and holds for long enough
  // without moving much.  When we enter we emit a holdstart event. Motion
  // after the holdstart generates holdmove events. And when the touch ends
  // we generate a holdend event. holdmove and holdend events can be used
  // kind of like drag and drop events in a mouse-based UI. Currently,
  // these events just report the coordinates of the touch.  Do we need
  // other details?
  var holdState = {
    name: 'holdState',
    init: function(d) {
      d.emitEvent('holdstart', d.start);
    },

    touchmove: function(d, e, t) {
      var current = coordinates(e, t);
      d.emitEvent('holdmove', {
        absolute: {
          dx: current.screenX - d.start.screenX,
          dy: current.screenY - d.start.screenY
        },
        relative: {
          dx: current.screenX - d.last.screenX,
          dy: current.screenY - d.last.screenY
        },
        position: current
      });

      d.last = current;
    },

    touchend: function(d, e, t) {
      var current = coordinates(e, t);
      d.emitEvent('holdend', {
        start: d.start,
        end: current,
        dx: current.screenX - d.start.screenX,
        dy: current.screenY - d.start.screenY
      });
      d.switchTo(initialState);
    }
  };

  // We enter this state if a second touch starts before we start
  // recoginzing any other gesture.  As the touches move we track the
  // distance and angle between them to report scale and rotation values
  // in transform events.
  var transformState = {
    name: 'transformState',
    init: function(d, e, t) {
      // Remember the id of the second touch
      d.touch2 = t.identifier;

      // Get the two Touch objects
      var t1 = e.touches.identifiedTouch(d.touch1);
      var t2 = e.touches.identifiedTouch(d.touch2);

      // Compute and remember the initial distance and angle
      d.startDistance = d.lastDistance = touchDistance(t1, t2);
      d.startDirection = d.lastDirection = touchDirection(t1, t2);

      // Don't start emitting events until we're past a threshold
      d.scaled = d.rotated = false;
    },

    touchmove: function(d, e, t) {
      // Ignore touches we're not tracking
      if (t.identifier !== d.touch1 && t.identifier !== d.touch2) {
        return;
      }

      // Get the two Touch objects
      var t1 = e.touches.identifiedTouch(d.touch1);
      var t2 = e.touches.identifiedTouch(d.touch2);

      // Compute the new midpoints, distance and direction
      var midpoint = midpoints(e, t1, t2);
      var distance = touchDistance(t1, t2);
      var direction = touchDirection(t1, t2);
      var rotation = touchRotation(d.startDirection, direction);

      // Check all of these numbers against the thresholds. Otherwise
      // the transforms are too jittery even when you try to hold your
      // fingers still.
      if (!d.scaled) {
        if (abs(distance - d.startDistance) > GD.SCALE_THRESHOLD) {
          d.scaled = true;
          d.startDistance = d.lastDistance =
            floor(d.startDistance +
                  GD.THRESHOLD_SMOOTHING * (distance - d.startDistance));
        } else {
          distance = d.startDistance;
        }
      }
      if (!d.rotated) {
        if (abs(rotation) > GD.ROTATE_THRESHOLD) {
          d.rotated = true;
        } else {
          direction = d.startDirection;
        }
      }

      // If nothing has exceeded the threshold yet, then we
      // don't even have to fire an event.
      if (d.scaled || d.rotated) {
        // The detail field for the transform gesture event includes
        // 'absolute' transformations against the initial values and
        // 'relative' transformations against the values from the last
        // transformgesture event.
        d.emitEvent('transform', {
          absolute: { // transform details since gesture start
            scale: distance / d.startDistance,
            rotate: touchRotation(d.startDirection, direction)
          },
          relative: { // transform since last gesture change
            scale: distance / d.lastDistance,
            rotate: touchRotation(d.lastDirection, direction)
          },
          midpoint: midpoint
        });

        d.lastDistance = distance;
        d.lastDirection = direction;
        d.lastMidpoint = midpoint;
      }
    },

    touchend: function(d, e, t) {
      // If either finger goes up, we're done with the gesture.
      // The user might move that finger and put it right back down
      // again to begin another 2-finger gesture, so we can't go
      // back to the initial state while one of the fingers remains up.
      // On the other hand, we can't go back to touchStartedState because
      // that would mean that the finger left down could cause a tap or
      // pan event. So we need an afterTransform state that waits for
      // a finger to come back down or the other finger to go up.
      if (t.identifier === d.touch2) {
        d.touch2 = null;
      } else if (t.identifier === d.touch1) {
        d.touch1 = d.touch2;
        d.touch2 = null;
      } else {
        return; // It was a touch we weren't tracking
      }

      // If we emitted any transform events, now we need to emit
      // a transformend event to end the series.  The details of this
      // event use the values from the last touchmove, and the
      // relative amounts will 1 and 0, but they are included for
      // completeness even though they are not useful.
      if (d.scaled || d.rotated) {
        d.emitEvent('transformend', {
          absolute: { // transform details since gesture start
            scale: d.lastDistance / d.startDistance,
            rotate: touchRotation(d.startDirection, d.lastDirection)
          },
          relative: { // nothing has changed relative to the last touchmove
            scale: 1,
            rotate: 0
          },
          midpoint: d.lastMidpoint
        });
      }

      d.switchTo(afterTransformState);
    }
  };

  // We did a tranform and one finger went up. Wait for that finger to
  // come back down or the other finger to go up too.
  var afterTransformState = {
    name: 'afterTransformState',
    touchstart: function(d, e, t) {
      d.switchTo(transformState, e, t);
    },

    touchend: function(d, e, t) {
      if (t.identifier === d.touch1) {
        d.switchTo(initialState);
      }
    }
  };

  return GD;
}());

define("shared/js/gesture_detector", function(){});

define('iframe_shims',['shared/js/gesture_detector'], function() {



var GestureDetector = window.GestureDetector;

/**
 * Style tag to put in the header of the body.  We currently only support inline
 * styles in general, so these are primarily overrides and defaults.
 */
var DEFAULT_STYLE_TAG =
  '<style type="text/css">\n' +
  // ## blockquote
  // blockquote per html5: before: 1em, after: 1em, start: 4rem, end: 4rem
  'blockquote {' +
  'margin: 0; ' +
  // so, this is quoting styling, which makes less sense to have in here.
  '-moz-border-start: 0.2rem solid gray;' +
  // padding-start isn't a thing yet, somehow.
  'padding: 0; -moz-padding-start: 0.5rem; ' +
  '}\n' +
  // Give the layout engine an upper-bound on the width that's arguably
  // much wider than anyone should find reasonable, but might save us from
  // super pathological cases.
  'html, body { max-width: 120rem; word-wrap: break-word;' +
  // don't let the html/body grow the scrollable area.  Also, it's not clear
  // overflow: hidden actually works in either of these cases, but I did most of
  // the development and testing where things worked with the overflow: hidden
  // present and I'm worried about removing it now.
  ' overflow: hidden; padding: 0; margin: 0; }\n' +
  // pre messes up wrapping very badly if left to its own devices
  'pre { white-space: pre-wrap; word-wrap: break-word; }\n' +
  '.moz-external-link { color: #00aac5; cursor: pointer; }\n' +
  '</style>';

/**
 * Tweakable display settings for timings.  If you want to mess with these
 * values from the debugger, do requirejs('iframe_shims').iframeShimsOpts.
 *
 * All current poll timeouts (circa Sep 19, 2014) are ballpark figures arrived
 * at on a Flame device.  We could probably tighten things up if need be.
 */
var iframeShimsOpts = {
  /**
   * What is the minimum delay between changing the transform setting?  You
   * might think that we want this low, but because we experience memory-spikes
   * if we modify the transform from a setTimeout, we currently want this
   * to be short enough that a human would be unlikely to actually re-trigger
   * while this is active.  It's handy to keep around to turn it way up so that
   * we can reproduce the setTimeout problem for debugging, however.
   */
  zoomDelayMS: 200,
  /**
   * What should our initial scale-factor be?  If 1, it's 100%.  If null, we use
   * the fit-page-width value.
   */
  initialScale: null,
  /**
   * How many times should we poll the dimensions of the HTML iframe before
   * ceasing?  This is used both for initial display and after "display external
   * images" or "display embedded images" is triggered.
   */
  resizeLimit: 4,
  /**
   * After first creating the document, how long should we wait before we start
   * to poll?  Note that the "load" event doesn't work for us and
   * "DOMContentLoaded" turns out to be too early.  Even though we forbid remote
   * resources, it seems like our fonts or something can still need to
   * asynchronously load or the HTML5 parser no longer synchronously lays
   * everything out for us.
   */
  initialResizePollIntervalMS: 200,
  /**
   * If we polled and there was no change in dimensions, how long should we wait
   * before our next poll?  The idea is you might make this shorter in order to
   * make sure we respond sooner / faster.
   */
  noResizePollIntervalMS: 250,
  /**
   * If we polled and there was a change in dimensions, how long should we wait
   * before our next poll?  The idea is you might make this longer so as to
   * avoid churn if there is something going on that would affect sizing.
   */
  didResizePollIntervalMS: 300,
  /**
   * How long should we wait until after we get the last picture "load" event
   * before polling?  Note that in this case we will have reset our resize count
   * back to 0 so resizeLimit will need to be hit again.  The waiting is
   * accomplished by constantly resetting the timeout, so extremely small values
   * are dangerous here.  Also, experience has shown that when we previously
   * tried to update our size immediately or near-immediately getting the final
   * load event, we still would be too early.
   */
  pictureDelayPollIntervalMS: 200
};

/**
 * Logic to help with creating, populating, and handling events involving our
 * HTML message-disply iframes.
 *
 * ## UX Goals ##
 *
 * We want a continuous scrolling experience.  The message's envelope and the
 * HTML body should scroll continuously.
 *
 * Pinch-and-zoom: We want the user to be able to zoom in and out on the message
 * in a responsive fashion without crashing the app.  We also want to start
 * with fit-to-page-width because when the email is wider than the screen it
 * tends to look stupid.
 *
 * ## Security ##
 *
 * All HTML content is passed through a white-list-based sanitization process,
 * but we still want the iframe so that:
 *
 * - We can guarantee the content can't escape out into the rest of the page.
 * - We can both avoid the content being influenced by our stylesheets as well
 *   as to allow the content to use inline "style" tags without any risk to our
 *   styling.
 *
 * Our iframe sandbox attributes (not) specified and rationale are as follows.
 * Note that "NO" means we don't specify the string in our sandbox.
 * - "allow-same-origin": YES.  We do this because in order to touch the
 *   contentDocument we need to live in the same origin.  Because scripts are
 *   not enabled in the iframe this is not believed to have any meaningful
 *   impact.
 *
 *   In the future when we are able to do nested APZ stuff, what we
 *   will likely do is have two layers of iframes.  The outer mozbrowser iframe
 *   will have its own origin but be running (only) our code.  It will talk to
 *   us via postMessage.  Then it will have a sandboxed iframe where script is
 *   disabled but that lives in the same origin.  So our code in that origin
 *   can then poke at things as needed.
 *
 * - "allow-scripts": NO.  We never ever want to let scripts from an email
 *   run.  And since we are setting "allow-same-origin", even if we did want
 *   to allow scripts we *must not* while that setting is on.  Our CSP should
 *   limit the use of scripts if the iframe has the same origin as us since
 *   everything in the iframe should qualify as
 *
 * - "allow-top-navigation": NO.  The iframe should not navigate if the user
 *   clicks on a link.  Note that the current plan is to just capture the
 *   click event and trigger the browse event ourselves so we can show them the
 *   URL, so this is just extra protection.
 *
 * - "allow-forms": NO.  We already sanitize forms out, so this is just extra
 *   protection.
 *
 * - "allow-popups": NO.  We would never want this, but it also shouldn't be
 *   possible to even try to trigger this (scripts are disabled and sanitized,
 *   links are sanitized to forbid link targets as well as being nerfed), so
 *   this is also just extra protection.
 *
 * ## Platform Limitations: We Got'em! ##
 *
 * ### Seamless iframes ###
 *
 * Gecko does not support seamless iframes, so we have to manually make sure
 * that we set the iframe's outer size to what its inner size is.  Because
 * layout is asynchronous (even in the document.write case, apparently), we end
 * up polling after any notable event that might affect layout.
 *
 * I did experiment with the gecko-specific 'overflow' event a bit.  Although I
 * suspect there were complicating factors, I do believe I ran into trouble with
 * it since it is an event that is only generated each time you transition from
 * overflow and back to underflow.  So if you get an overflow event but didn't
 * actually cause yourself to go back to underflow (like if you have weird CSS
 * maybe doing something like setting a width to 105% or something?), you won't
 * get another overflow event.
 *
 * ### Pinch-and-Zoom ###
 *
 * Gecko supports Asynchronous Pan-and-Zoom (APZ), but we can't use it for our
 * HTML pages right now because it can only be used for the root of an
 * app/browser window.  And there is no support for nested subprocesses yet.
 * When that stuff happens, we want to just use that instead of doing manual
 * pinchy-zoomy support.
 *
 * We fake some level of usable pinch-zoom by using a "transform: scale()" on
 * our iframe.  Because the transform is a painting thing and not a layout thing
 * we have to wrap the iframe in a "viewport" div that provides our effective
 * DOM size for scrolling.  We could maybe use better nomenclature for this and
 * maybe even stop nesting the iframe in the viewport.  (The current structure
 * is somewhat historical from when the viewport div actually was clipping the
 * iframe.)
 *
 * For example, let's say our iframe is internally 580px by 1000px but we are
 * displaying it at 50% scale so it's 290px by 500px.  In that case the iframe's
 * size still needs to be 580px by 1000px, but the viewport needs to be 290px by
 * 500px so that the scrolling works out right.  Otherwise you end up with lots
 * of white space at the right and bottom.
 *
 * Likewise if we are zooming it to 200% we need the viewport's dimensions to be
 * doubled so that there is the extra space to scroll into.
 *
 * ### Transform Performance / Memory Limitations ###
 *
 * We can't actually mess with "transform: scale()" in realtime.  This is
 * primarily because it results in memory spikes that can get our process killed
 * as the graphics subsystem's logic glitches and ends up allocating graphics
 * buffers for the entirety of the HTML document, even the parts not on the
 * screen.  But a secondary concern is that especially when it's drawing too
 * much, it can take a very long time to scale.
 *
 * So we've implemented a "quantized" scaling approach where we have four zoom
 * levels: "fit-to-width" (which is <= 1), 100%, 150%, and 200%.  Pinching to
 * zoom in moves you to the right in the list, pinching to zoom out moves you
 * out in the list.
 *
 * We use the shared gesture_detector code to figure out what's going on.
 * Specifically, once the scale in absolute terms is clearly a zoom in or a zoom
 * out, we trigger the scale change and then ignore the rest of the gesture
 * until a new gesture occurs.  This is arguably intuitive, but more importantly
 * it avoids the problems we had in the past where you could just absurdly
 * oscillate your pinchers and kill the app as we swamped the system with a
 * gazillion transforms.
 *
 *
 * ## Email types and Pinchy-Zoomy time ##
 *
 * There are two types of HTML e-mails:
 *
 * 1) E-mails written by humans which are basically unstructured prose plus
 *    quoting.  The biggest problems these face are deep quoting causing
 *    blockquote padding to cause text to have very little screen real estate.
 *
 * 2) Newsletter style e-mails which are structured and may have multiple
 *    columns, grids of images and stuff like that.  They historically have
 *    tended to assume a size of about 600px.  However, it's increasingly common
 *    to be smart and use media queries.  Unfortunately, we don't support media
 *    queries right now and so it's very likely we'll end up in the desktop
 *    case.
 *
 * We originally treated these types of mails differently, but over time it
 * became clear that this was not a great strategy, especially since showing
 * external images/etc. could push a "normal" email into being a "newsletter"
 * email.  We also intentionally would trigger a layout with relaxed constraints
 * then try and tighten them up.
 *
 * Our (new) strategy is to create the iframe so that it fits in the width we
 * have available.  On flame devices that's 290px right now, though the actual
 * size is discovered at runtime and doesn't matter.
 *
 * As discussed above, we poll the scrollWidth and scrollHeight for a while to
 * make sure that it stabilizes.  The trick is that if something is a newsletter
 * it will end up wanting to be wider than our base/screen 290px.  We will
 * detect this and update our various dimensions, including our "fit-to-width"
 * scale.  Since we pick 100% or the computed fit-to-width scale, whichever is
 * smaller, the non-newsletter case is just us using a fit-to-width zoom factor
 * that just happens to be 100%.  The newsletter case is when fit-to-width is
 * less than 100%.
 *
 * ## Bugs / Doc Links ##
 *
 * - Font-inflation is a thing.  It's not clear it affects us:
 *   http://jwir3.wordpress.com/2012/07/30/font-inflation-fennec-and-you/
 *
 * - iframe "seamless" doesn't work, so we manually need to poke stuff:
 *   https://bugzilla.mozilla.org/show_bug.cgi?id=80713
 *
 * Uh, the ^ stuff below should really be @, but it's my jstut syntax that
 * gjslint simply hates, so...
 *
 * ^args[
 *   ^param[htmlStr]
 *   ^param[parentNode]{
 *     The (future) parent node of the iframe.
 *   }
 *   ^param[adjacentNode ^oneof[null HTMLNode]]{
 *     insertBefore semantics.
 *   }
 *   ^param[linkClickHandler ^func[
 *     ^args[
 *       ^param[event]{
 *       }
 *       ^param[linkNode HTMLElement]{
 *         The actual link HTML element
 *       }
 *       ^param[linkUrl String]{
 *         The URL that would be navigated to.
 *       }
 *       ^param[linkText String]{
 *         The text associated with the link.
 *       }
 *     ]
 *   ]]{
 *     The function to invoke when (sanitized) hyperlinks are clicked on.
 *     Currently, the links are always 'a' tags, but we might support image
 *     maps in the future.  (Or permanently rule them out.)
 *   }
 * ]
 */
function createAndInsertIframeForContent(htmlStr, scrollContainer,
                                         parentNode, beforeNode,
                                         interactiveMode,
                                         clickHandler) {
  // We used to care about running in Firefox nightly.  This was a fudge-factor
  // to account for its stupid scroll-bars that could not be escaped.  If you
  // are using nightly, maybe it makes sense to turn this back up.  Or maybe we
  // leave this zero and style the scrollbars to be overlays in b2g.  Who knows.
  var scrollPad = 0;

  var viewportWidth = parentNode.offsetWidth - scrollPad;
  var viewport = document.createElement('div');
  viewport.setAttribute(
    'style',
    'padding: 0; border-width: 0; margin: 0; ' +
    //'position: relative; ' +
    'overflow: hidden;');
  viewport.style.width = viewportWidth + 'px';
  // leave height unsized for now.

  var iframe = document.createElement('iframe');

  iframe.setAttribute('sandbox', 'allow-same-origin');
  // Styling!
  iframe.setAttribute(
    'style',
    // no border! no padding/margins.
    'padding: 0; border-width: 0; margin: 0; ' +
    // I don't think this actually stops the iframe from being internally
    // scrolly, but I wouldn't remove this without some testing...
    'overflow: hidden; ' +
    // When scaling, use the top-left for math sanity.
    'transform-origin: top ' +
    (document.documentElement.dir === 'rtl' ? 'right' : 'left') + '; ' +
    // The iframe does not want to process its own clicks!  that's what
    // bindSanitizedClickHandler is for!
    'pointer-events: none;');
  if (iframeShimsOpts.tapTransform) {
    iframe.style.transform = 'scale(1)';
  }
  // try and get the page to size itself to our actually available space.
  iframe.style.width = viewportWidth + 'px';

  // We need to be linked into the DOM tree to be able to write to our document
  // and have CSS and improtant things like that work.
  viewport.appendChild(iframe);
  parentNode.insertBefore(viewport, beforeNode);

  // we want this fully synchronous so we can know the size of the document
  iframe.contentDocument.open();
  iframe.contentDocument.write('<!doctype html><html><head>');
  iframe.contentDocument.write(DEFAULT_STYLE_TAG);
  iframe.contentDocument.write('</head><body>');
  // (currently our sanitization only generates a body payload...)
  iframe.contentDocument.write(htmlStr);
  iframe.contentDocument.write('</body>');
  iframe.contentDocument.close();
  var iframeBody = iframe.contentDocument.body;

  // NOTE.  This has gone through some historical iterations here AKA is
  // evolved.  Technically, getBoundingClientRect() may be superior since it can
  // have fractional parts.  I believe I tried using it with
  // iframe.contentDocument.documentElement and it ended up betraying me by
  // reporting clientWidth/clientHeight instead of scrollWidth, whereas
  // scrollWidth/scrollHeight worked better.  However I was trying a lot of
  // things; I might just have been confused by some APZ glitches where panning
  // right would not work immediately after zooming and you'd have to pan left
  // first in order to pan all the way to the newly expaned right.  What we know
  // right now is this gives the desired behaviour sizing behaviour.
  var scrollWidth = iframeBody.scrollWidth;
  var scrollHeight = iframeBody.scrollHeight;

  // fit-to-width scale.
  var baseScale = Math.min(1, viewportWidth / scrollWidth),
      // If there's an initial scale, use that, otherwise fall back to the base
      // (fit-to-width) scale
      lastRequestedScale = iframeShimsOpts.initialScale || baseScale,
      scale = lastRequestedScale,
      lastDoubleTapScale = scale,
      scaleMode = 0;

  viewport.style.width = Math.ceil(scrollWidth * scale) + 'px';
  viewport.style.height = Math.ceil(scrollHeight * scale) + 'px';

  // setting iframe.style.height is not sticky, so be heavy-handed.
  // Also, do not set overflow: hidden since we are already clipped by our
  // viewport or our containing card and Gecko slows down a lot because of the
  // extra clipping.
  iframe.style.width = scrollWidth + 'px';

  var resizeFrame = function(why) {
    if (why === 'initial' || why === 'poll') {
      scrollWidth = iframeBody.scrollWidth;
      scrollHeight = iframeBody.scrollHeight;
      // the baseScale will almost certainly have changed
      var oldBaseScale = baseScale;
      baseScale = Math.min(1, viewportWidth / scrollWidth);
      if (scale === oldBaseScale) {
        scale = baseScale;
      }
      iframe.style.width = scrollWidth + 'px';
      console.log('iframe_shims: recalculating height / width because', why,
                  'sw', scrollWidth, 'sh', scrollHeight, 'bs', baseScale);
    }
    console.log('iframe_shims: scale:', scale);
    iframe.style.transform = 'scale(' + scale + ')';
    iframe.style.height =
      ((scrollHeight * Math.max(1, scale)) + scrollPad) + 'px';
    viewport.style.width = Math.ceil(scrollWidth * scale) + 'px';
    viewport.style.height = (Math.ceil(scrollHeight * scale) + scrollPad) +
                              'px';
  };
  resizeFrame('initial');

  var activeZoom = false, lastCenterX, lastCenterY;
  /**
   * Zoom to the given scale, eventually.  If we are actively zooming or have
   * recently zoomed and need for various async things to catch up, we will
   * wait a bit before actually zooming to that scale.  We latch the most recent
   * value in all cases.
   */
  var zoomFrame = function(newScale, centerX, centerY) {
    // There is nothing to do if we are actually already at this scale level.
    // (Note that there still is something to do if newScale ===
    //  lastRequestedScale, though!)
    if (newScale === scale) {
      return;
    }
    lastRequestedScale = newScale;
    lastCenterX = centerX;
    lastCenterY = centerY;
    if (activeZoom) {
      return;
    }
    activeZoom = true;

    // Our goal is to figure out how to scroll the window so that the
    // location on the iframe corresponding to centerX/centerY maintains
    // its position after zooming.

    // centerX, centerY  are in screen coordinates.  Offset coordinates of
    // the scrollContainer are screen (card) relative, but those of things
    // inside the scrollContainer exist within that coordinate space and
    // do not change as we scroll.
    // console.log('----ZOOM from', scale, 'to', newScale);
    // console.log('cx', centerX, 'cy', centerY,
    //             'vl', viewport.offsetLeft,
    //             'vt', viewport.offsetTop);
    // console.log('sl', scrollContainer.offsetLeft,
    //             'st', scrollContainer.offsetTop);

    // Figure out how much of our iframe is scrolled off the screen.
    var iframeScrolledTop = scrollContainer.scrollTop - extraHeight,
        iframeScrolledLeft = scrollContainer.scrollLeft;

    // and now convert those into iframe-relative coords
    var ix = centerX + iframeScrolledLeft,
        iy = centerY + iframeScrolledTop;

    var scaleDelta = (newScale / scale);

    var vertScrollDelta = Math.ceil(iy * scaleDelta),
        horizScrollDelta = Math.ceil(ix * scaleDelta);

    scale = newScale;
    resizeFrame('zoom');
    scrollContainer.scrollTop = vertScrollDelta + extraHeight - centerY;
    scrollContainer.scrollLeft = horizScrollDelta - centerX;

    // Right, so on a Flame device I'm noticing serious delays in getting all
    // this painting and such done, so it seems like we really want to up this
    // constant to let any async stuff happen and to give the system some time
    // to recover and maybe run a GC.  Because there is a very real chance of
    // someone happilly zooming in-and-out over and over to cause us to hit a
    // GC ceiling.
    window.setTimeout(clearActiveZoom, iframeShimsOpts.zoomDelayMS);
  };
  var clearActiveZoom = function() {
    activeZoom = false;
    if (scale !== lastRequestedScale) {
      window.requestAnimationFrame(function() {
        // This is almost certainly going to cause a memory spike, so log it.
        // ugh.
        console.log('delayed zoomFrame timeout, probably causing a mem-spike');
        zoomFrame(lastRequestedScale, lastCenterX, lastCenterY);
      });
    }
  };

  // See giant block comment and timer constants for a description of our
  // polling logic and knobs.
  var resizePollerTimeout = null;
  // track how many times we've checked.  We want to bound this for battery life
  // purposes and also to avoid weird sad cases.
  var resizePollCount = 0;
  var pollResize = function() {
    var opts = iframeShimsOpts;
    var desiredScrollWidth = iframeBody.scrollWidth;
    var desiredScrollHeight = iframeBody.scrollHeight;
    var resized = false;
    // if we need to grow, grow.  (for stability reasons, we never want to
    // shrink since it could lead to infinite oscillation)
    if (desiredScrollWidth > scrollWidth ||
        desiredScrollHeight > scrollHeight) {
      resizeFrame('poll');
      resized = true;
    }

    if (++resizePollCount < opts.resizeLimit) {
      // we manually schedule ourselves for slack purposes
      resizePollerTimeout = window.setTimeout(
        pollResize,
        resized ? opts.didResizePollIntervalMS : opts.noResizePollIntervalMS);
    } else {
      resizePollerTimeout = null;
    }
  };
  resizePollerTimeout = window.setTimeout(
    pollResize, iframeShimsOpts.initialResizePollIntervalMS);

  var iframeShims = {
    iframe: iframe,
    // (This is invoked each time an image "load" event fires.)
    resizeHandler: function() {
      resizePollCount = 0;
      // Reset the existing timeout because many emails with external images
      // will have a LOT of external images so it could take a while for them
      // all to load.
      if (resizePollerTimeout) {
        window.clearTimeout(resizePollerTimeout);
      }
      resizePollerTimeout = window.setTimeout(
        pollResize, iframeShimsOpts.pictureDelayPollIntervalMS);
    }
  };

  if (interactiveMode !== 'interactive') {
    return iframeShims;
  }

  var detectorTarget = viewport;
  var detector = new GestureDetector(detectorTarget);
  // We don't need to ever stopDetecting since the closures that keep it
  // alive are just the event listeners on the iframe.
  detector.startDetecting();
  // Using tap gesture event for URL link handling.
  if (clickHandler) {
    viewport.removeEventListener('click', clickHandler);
    bindSanitizedClickHandler(viewport, clickHandler, null, iframe);
  }

  var title = document.getElementsByClassName('msg-reader-header')[0];
  var header = document.getElementsByClassName('msg-envelope-bar')[0];
  var extraHeight = title.clientHeight + header.clientHeight;

  // -- Double-tap zoom idiom
  detectorTarget.addEventListener('dbltap', function(e) {
    var newScale = scale;
    if (lastDoubleTapScale === lastRequestedScale) {
      scaleMode = (scaleMode + 1) % 3;
      switch (scaleMode) {
        case 0:
          newScale = baseScale;
          break;
        case 1:
          newScale = 1;
          break;
        case 2:
          newScale = 2;
          break;
      }
      console.log('already in double-tap, deciding on new scale', newScale);
    }
    else {
      // If already zoomed in, zoom out to starting scale
      if (lastRequestedScale > 1) {
        newScale = lastDoubleTapScale;
        scaleMode = 0;
      }
      // Otherwise zoom in to 2x
      else {
        newScale = 2;
        scaleMode = 2;
      }
      console.log('user was not in double-tap switching to double-tap with',
                  newScale);
    }
    lastDoubleTapScale = newScale;
    try {
      zoomFrame(newScale, e.detail.clientX, e.detail.clientY);
    } catch (ex) {
      console.error('zoom bug!', ex, '\n', ex.stack);
    }
  });

  // -- quantized pinchy-zoomy idiom
  // track whether we've already transformed this transform event cycle
  var transformDone = false;
  // reset when the transform has ended.  (there is no transformbegin event)
  detectorTarget.addEventListener('transformend', function(e) {
    transformDone = false;
  });
  detectorTarget.addEventListener('transform', function(e) {
    // if we already zoomed in/out this time, then just bail
    if (transformDone) {
      return;
    }

    var scaleFactor = e.detail.absolute.scale;
    var newScale = lastRequestedScale;
    // once it's clear this is a zoom-in, we can handle
    if (scaleFactor > 1.15) {
      transformDone = true;
      // Zoom in if we can.
      // (Note that if baseScale is 1, we will properly go direct to 1.5 from
      // baseScale.  Hooray!)
      if (lastRequestedScale < 1) {
        newScale = 1;
      }
      else if (lastRequestedScale < 1.5) {
        newScale = 1.5;
      }
      else if (lastRequestedScale < 2) {
        newScale = 2;
      }
      else {
        return;
      }
    }
    else if (scaleFactor < 0.9) {
      transformDone = true;
      if (lastRequestedScale > 1.5) {
        newScale = 1.5;
      }
      else if (lastRequestedScale > 1) {
        newScale = 1;
      }
      else if (lastRequestedScale > baseScale) {
        newScale = baseScale;
      }
      else {
        return;
      }
    }
    else {
      return;
    }
    zoomFrame(
      newScale,
      e.detail.midpoint.clientX, e.detail.midpoint.clientY);
  });


  return iframeShims;
}

function bindSanitizedClickHandler(target, clickHandler, topNode, iframe) {
  var eventType, node;
  // Variables that only valid for HTML type mail.
  var root, title, header, attachmentsContainer, msgBodyContainer,
      titleHeight, headerHeight, attachmentsHeight,
      msgBodyMarginTop, msgBodyMarginLeft, attachmentsMarginTop,
      iframeDoc, inputStyle, loadBar, loadBarHeight;
  // Tap gesture event for HTML type mail and click event for plain text mail
  if (iframe) {
    root = document.getElementsByClassName('scrollregion-horizontal-too')[0];
    title = document.getElementsByClassName('msg-reader-header')[0];
    header = document.getElementsByClassName('msg-envelope-bar')[0];
    attachmentsContainer =
      document.getElementsByClassName('msg-attachments-container')[0];
    loadBar = document.getElementsByClassName('msg-reader-load-infobar')[0];
    msgBodyContainer = document.getElementsByClassName('msg-body-container')[0];
    inputStyle = window.getComputedStyle(msgBodyContainer);
    msgBodyMarginTop = parseInt(inputStyle.marginTop);
    msgBodyMarginLeft = parseInt(inputStyle.marginLeft);
    titleHeight = title.clientHeight;
    headerHeight = header.clientHeight;
    eventType = 'tap';
    iframeDoc = iframe.contentDocument;
  } else {
    eventType = 'click';
  }
  target.addEventListener(
    eventType,
    function clicked(event) {
      if (iframe) {
        // Because the "show (external) images" loadBar could be opened or
        // closed depending on what the user does relative to this click, get
        // the client height at the time of click.
        loadBarHeight = loadBar.clientHeight;

        // Because the attachments are updating late,
        // get the client height while clicking iframe.
        attachmentsHeight = attachmentsContainer.clientHeight;
        inputStyle = window.getComputedStyle(attachmentsContainer);
        attachmentsMarginTop =
          (attachmentsHeight) ? parseInt(inputStyle.marginTop) : 0;
        var dx, dy;
        var transform = iframe.style.transform || 'scale(1)';
        var scale = transform.match(/(\d|\.)+/g)[0];

        // When in rtl mode, scroll is relative to right side, but the
        // document inside the iframe is ltr based, since it does not set a
        // document-wide dir setting and instead the DOM content inside the
        // message manages the dir itself.
        if (document.dir === 'rtl') {
          dx = event.detail.clientX - msgBodyMarginLeft +
               // The scrollLeft is calculated from the right side, with right
               // being zero and left being a negative value from the *right*
               // edge of the element. So to get the x value from the left, need
               // the difference of scrollWidth from scrollLeft (which is a
               // negative value), and also subtracting out the width of the
               // element to get the value relative to the *left* side of the
               // element.
               root.scrollWidth + root.scrollLeft - root.clientWidth;
        } else {
          dx = event.detail.clientX + root.scrollLeft - msgBodyMarginLeft;
        }

        dy = event.detail.clientY + root.scrollTop -
             titleHeight - headerHeight - loadBarHeight -
             attachmentsHeight - attachmentsMarginTop - msgBodyMarginTop;

        node = iframeDoc.elementFromPoint(dx / scale, dy / scale);

        // Uncomment to show a red square on where the code thinks the tap
        // occurred in the iframe. Useful for debugging.
        // var temp = iframeDoc.createElement('div');
        // temp.style.position = 'absolute';
        // temp.style.overflow = 'hidden';
        // temp.style.top = ((dy / scale) - 5) + 'px';
        // temp.style.left = ((dx / scale) - 5) + 'px';
        // temp.style.width = '10px';
        // temp.style.height = '10px';
        // temp.style.backgroundColor = 'red';
        // iframeDoc.body.appendChild(temp);
      } else {
        node = event.originalTarget;
      }
      while (node !== topNode) {
        if (node.nodeName === 'A') {
          if (node.hasAttribute('ext-href')) {
            clickHandler(event, node, node.getAttribute('ext-href'),
                         node.textContent);
            event.preventDefault();
            event.stopPropagation();
            return;
          }
        }
        node = node.parentNode;
      }
    });
}

return {
  createAndInsertIframeForContent: createAndInsertIframeForContent,
  bindSanitizedClickHandler: bindSanitizedClickHandler,
  iframeShimsOpts: iframeShimsOpts
};

});



define('cards/editor_mixins',['require'],function(require) {

  return {

    _bindEditor: function(textNode) {
      this._editorNode = textNode;
    },
    /**
     * Inserts an email into the contenteditable element
     */
    populateEditor: function(value) {
      var lines = value.split('\n');
      var frag = document.createDocumentFragment();
      for (var i = 0, len = lines.length; i < len; i++) {
        if (i) {
          frag.appendChild(document.createElement('br'));
        }
        frag.appendChild(document.createTextNode(lines[i]));
      }
      this._editorNode.appendChild(frag);
    },

    /**
     * Gets the raw value from a contenteditable div
     */
    fromEditor: function(value) {
      var content = '';
      var len = this._editorNode.childNodes.length;
      for (var i = 0; i < len; i++) {
        var node = this._editorNode.childNodes[i];
        if (node.nodeName === 'BR' &&
            // Gecko's contenteditable implementation likes to create a
            // synthetic trailing BR with type="_moz".  We do not like/need
            // this synthetic BR, so we filter it out.  Check out
            // nsTextEditRules::CreateTrailingBRIfNeeded to find out where it
            // comes from.
            node.getAttribute('type') !== '_moz') {
          content += '\n';
        } else {
          content += node.textContent;
        }
      }

      return content;
    }

  };


});
define('tmpl!cards/msg/header_item.html',['tmpl'], function (tmpl) { return tmpl.toDom('<a class="msg-header-item" role="option">\n  <label class="pack-checkbox negative" aria-hidden="true">\n    <input type="checkbox"><span></span>\n  </label>\n  <div class="msg-header-details-section">\n    <span dir="auto" class="msg-header-author"></span>\n    <span dir="auto" class="msg-header-subject"></span>\n    <span dir="auto" class="msg-header-date"></span>\n    <span dir="auto" class="msg-header-snippet"></span>\n  </div>\n  <div class="msg-header-syncing-section"></div>\n  <div class="msg-header-unread-section"\n       data-l10n-id="message-header-unread"></div>\n  <div class="msg-header-icons-section">\n    <span class="msg-header-star" data-l10n-id="message-header-starred"></span>\n    <span class="msg-header-attachments"\n          data-l10n-id="message-header-attachments"></span>\n  </div><div class="msg-header-avatar-section" aria-hidden="true">\n  </div></a>\n'); });

define('tmpl!cards/msg/delete_confirm.html',['tmpl'], function (tmpl) { return tmpl.toDom('<form role="dialog" class="msg-delete-confirm" data-type="confirm">\n  <section>\n    <h1 data-l10n-id="confirm-dialog-title"></h1>\n    <p></p>\n  </section>\n  <menu>\n    <button id="msg-delete-cancel" data-l10n-id="message-multiedit-cancel"></button>\n    <button id="msg-delete-ok" class="danger" data-l10n-id="message-edit-menu-delete"></button>\n  </menu>\n</form>'); });

define('tmpl!cards/msg/large_message_confirm.html',['tmpl'], function (tmpl) { return tmpl.toDom('<form role="dialog" class="msg-large-message-confirm" data-type="confirm">\n  <section>\n    <h1 data-l10n-id="confirm-dialog-title"></h1>\n    <p><span data-l10n-id="message-large-message-confirm"></span></p>\n  </section>\n  <menu>\n    <button id="msg-large-message-cancel" data-l10n-id="message-large-message-cancel"></button>\n    <button id="msg-large-message-ok" data-l10n-id="message-large-message-ok"></button>\n  </menu>\n</form>\n'); });

/**
 * element 0.0.0-native-register
 * Copyright (c) 2013-2014, The Dojo Foundation All Rights Reserved.
 * Available via the MIT or new BSD license.
 * see: http://github.com/jrburke/element for details
 */
/*jshint browser: true */
/*globals define */
define('element',[],function() {
  
  var slice = Array.prototype.slice,
      callbackSuffix = 'Callback',
      callbackSuffixLength = callbackSuffix.length,
      charRegExp = /[^a-z]/g;

  /**
   * Converts an attribute like a-long-attr to aLongAttr
   * @param  {String} attrName The attribute name
   * @return {String}
   */
  function makePropName(attrName) {
    var parts = attrName.split('-');
    for (var i = 1; i < parts.length; i++) {
      parts[i] = parts[i].charAt(0).toUpperCase() + parts[i].substring(1);
    }
    return parts.join('');
  }

  /**
   * Given an attribute name, set the corresponding property
   * name on the custom element instance, if it has such a
   * property.
   * @param  {Object} instance the custom element instance.
   * @param  {String} attrName the attribute name.
   * @param  {String} attrValue The attribute value.
   */
  function setPropFromAttr(instance, attrName, attrValue) {
    var proto = Object.getPrototypeOf(instance),
        propName = makePropName(attrName),
        descriptor = Object.getOwnPropertyDescriptor(proto, propName);

    // Only check immediate prototype for a property that
    // matches, to avoid calling base setters that may be
    // on original HTML-based element that could cause
    // bad effects. Needs more testing for those cases to
    // confirm, but since element is a mixin approach, this
    // approach is safe.
    if (descriptor && descriptor.set) {
      instance[propName] = attrValue;
    }
  }

  function makePropFn(prop) {
    return function() {
      var i, ret,
          args = slice.call(arguments),
          fns = this._element.props[prop];

      for (i = 0; i < fns.length; i++) {
        ret = fns[i].apply(this, args);
      }

      // Last function wins on the return value.
      return ret;
    };
  }

  function mixFnProp(proto, prop, value, operation) {
    if (proto.hasOwnProperty(prop)) {
      var existing = proto._element.props[prop];
      if (!existing) {
        existing = proto._element.props[prop] = [proto[prop]];
        proto[prop] = makePropFn(prop);
      }
      operation = operation || 'push';
      existing[operation](value);
    } else {
      proto[prop] = value;
    }
  }

  function mix(proto, mixin) {
    // Allow a top level of a mixin to be an array of other
    // mixins.
    if (Array.isArray(mixin)) {
      mixin.forEach(function(mixin) {
        mix(proto, mixin);
      });
      return;
    }

    Object.keys(mixin).forEach(function(key) {
      var suffixIndex,
          descriptor = Object.getOwnPropertyDescriptor(mixin, key);

      // Any property that ends in Callback, like the custom element
      // lifecycle events, can be multiplexed.
      suffixIndex = key.indexOf(callbackSuffix);
      if (suffixIndex > 0 &&
          suffixIndex === key.length - callbackSuffixLength) {
        mixFnProp(proto, key, descriptor.value);
      } else {
        Object.defineProperty(proto, key, descriptor);
      }
    });
  }

  /**
   * Main module export. These methods are visible to
   * any module.
   */
  var element = {
    /**
     * The AMD loader plugin API. Called by an AMD loader
     * to handle 'element!' resources.
     * @param  {String} id     module ID to load.
     * @param  {Function} req  context-specific `require` function.
     * @param  {Function} onload function to call once loading is complete.
     * @param  {Object} config config from the loader. Normally just has
     * config.isBuild if in a build scenario.
     */
    load: function(id, req, onload, config) {
      // Normal dependency request.
      req([id], function(mod) {
        // For builds do nothing else. Also if no module export or
        // it is a function because the module already called
        // document.register itself, then do not bother with the
        // other work.
        if (config.isBuild || !mod || typeof mod === 'function') {
          return onload();
        }

        // Create the prototype for the custom element.
        // Allow the module to be an array of mixins.
        // If it is an array, then mix them all in to the
        // prototype.
        var proto = Object.create(HTMLElement.prototype);

        // Define a property to hold all the element-specific information
        Object.defineProperty(proto, '_element', {
          enumerable: false,
          configurable: false,
          writable: false,
          value: {}
        });
        proto._element.props = {};

        mix(proto, mod);

        // Wire attributes to this element's custom/getter setters.
        // Because of the 'unshift' use, this will actually execute
        // before the templateCreatedCallback, which is good. The
        // exterior API should set up the internal state before
        // other parts of createdCallback run.
        mixFnProp(proto, 'createdCallback', function attrCreated() {
          var i, item,
              attrs = this.attributes;

          for (i = 0; i < attrs.length; i++) {
            item = attrs.item(i);
            setPropFromAttr(this, item.nodeName, item.value);
          }
        }, 'unshift');

        // Listen for attribute changed calls, and just trigger getter/setter
        // calling if matching property. Make sure it is the first one in
        // the listener set.
        mixFnProp(proto, 'attributeChangedCallback',
        function attrChanged(name, oldValue, newValue) {
            // Only called if value has changed, so no need to check
            // oldValue !== newValue
            setPropFromAttr(this, name, newValue);
        }, 'unshift');

        // Translate any characters that are unfit for custom element
        // names to dashes
        id = id.toLowerCase().replace(charRegExp, '-');

        // todo
        // onload(document.registerElement(id, {
        //   prototype: proto
        // }));
      });
    }
  };

  return element;
});


define('cards/mixins/data-prop',[],function () {
  return {
    templateInsertedCallback: function () {
      var nodes = this.querySelectorAll('[data-prop]'),
          length = nodes.length;

      for (var i = 0; i < length; i++) {
        this[nodes[i].dataset.prop] = nodes[i];
      }
    }
  };
});


define('cards/mixins/data-event',[],function () {
  var slice = Array.prototype.slice;

  return {
    templateInsertedCallback: function () {
      slice.call(this.querySelectorAll('[data-event]'))
      .forEach(function (node) {
        // Value is of type 'name:value,name:value',
        // with the :value part optional.
        node.dataset.event.split(',').forEach(function (pair) {
          var evtName, method,
              parts = pair.split(':');

          if (!parts[1]) {
            parts[1] = parts[0];
          }
          evtName = parts[0].trim();
          method = parts[1].trim();

          if (typeof this[method] !== 'function') {
            throw new Error('"' + method + '" is not a function, ' +
                            'cannot bind with data-event');
          }

          node.addEventListener(evtName, function(evt) {
            // Treat these events as private to the
            // custom element.
            evt.stopPropagation();
            return this[method](evt);
          }.bind(this), false);
        }.bind(this));
      }.bind(this));
    }
  };
});


define('cards/base',['require','l10n!','evt','./mixins/data-prop','./mixins/data-event'],function(require) {
  var mozL10n = require('l10n!'),
      Emitter = require('evt').Emitter;

  // Set up the global time updates for all nodes.
  (function() {
    var formatter = new mozL10n.DateTimeFormat();
    var updatePrettyDate = function updatePrettyDate() {
      var labels = document.querySelectorAll('[data-time]');
      var i = labels.length;
      while (i--) {
        labels[i].textContent = formatter.fromNow(
          labels[i].dataset.time,
          // the presence of the attribute is our indicator; not its value
          'compactFormat' in labels[i].dataset);
      }
    };
    var timer = setInterval(updatePrettyDate, 60 * 1000);

    function updatePrettyDateOnEvent() {
      clearTimeout(timer);
      updatePrettyDate();
      timer = setInterval(updatePrettyDate, 60 * 1000);
    }
    // When user changes the language, update timestamps.
    mozL10n.ready(updatePrettyDateOnEvent);

    // On visibility change to not hidden, update timestamps
    document.addEventListener('visibilitychange', function() {
      if (document && !document.hidden) {
        updatePrettyDateOnEvent();
      }
    });

  })();


  /**
   * Returns an array of objects that can be fed to the 'element' module to
   * create a prototype for a custom element. It takes an optional
   * `templateMixins` object that is the first object to be mixed in by the
   * "mixins insted of prototypes" construction that 'element' favors. This
   * templateMixins should come first, as it sets up the inner DOM structure
   * for an instance of the element, and needs to have been inserted before the
   * other mixins in this base are applied. The templateMixins are normally
   * passed to this function via a `require('template!...')` dependency. The
   * 'template' loader plugin knows how to set up an object for use in this type
   * of 'element' target. See the README.md in this file's directory for more
   * information on the custom element approach.
   * @param {Object|Array} [templateMixins] Handles the templating duties
   * for the inner HTML structure of the element.
   * @returns {Array} Array of objects for use in a mixin construction.
   */
  return function cardBase(templateMixins) {
    // Set up the base mixin
    return [
      // Mix in the template first, so that its createdCallback is
      // called before the other createdCallbacks, so that the
      // template is there for things like l10n mixing and node
      // binding inside the template.
      templateMixins ? templateMixins : {},

      // Wire up support for auto-node binding
      require('./mixins/data-prop'),
      require('./mixins/data-event'),

      // Every custom element is an evt Emitter!
      Emitter.prototype,

      {
        createdCallback: function() {
          Emitter.call(this);

          // Set up extra classes and other node information that distinguishes
          // as a card. Doing this here so that by the time the createdCallback
          // provided by the card so that the DOM at that point can be used for
          // HTML caching purposes.
          if (this.extraClasses) {
            this.classList.add.apply(this.classList,
                                        this.extraClasses);
          }

          this.classList.add('card');
        },

        batchAddClass: function(searchClass, classToAdd) {
          var nodes = this.getElementsByClassName(searchClass);
          for (var i = 0; i < nodes.length; i++) {
            nodes[i].classList.add(classToAdd);
          }
        },

        /**
         * Add an event listener on a container that, when an event is encounted
         * on a descendant, walks up the tree to find the immediate child of the
         * container and tells us what the click was on.
         */
        bindContainerHandler: function(containerNode, eventName, func) {
          containerNode.addEventListener(eventName, function(event) {
            var node = event.target;
            // bail if they clicked on the container and not a child...
            if (node === containerNode) {
              return;
            }
            while (node && node.parentNode !== containerNode) {
              node = node.parentNode;
            }
            func(node, event);
          }, false);
        }
      }
    ];
  };
});

/**
 * template 0.0.0-native-register
 * Copyright (c) 2013-2014, The Dojo Foundation All Rights Reserved.
 * Available via the MIT or new BSD license.
 * see: http://github.com/jrburke/element for details
 */
/*jshint browser: true, strict: false */
/*globals define, requirejs */
define('template',['require','exports','module','element'],function(require, exports, module) {
  var template, fetchText, templateDiv,
      isReady = false,
      readyQueue = [],
      tagRegExp = /<(\w+-[\w-]+)(\s|>)/g,
      commentRegExp = /<!--*.?-->/g,
      attrIdRegExp = /\s(hrefid|srcid)="([^"]+)"/g,
      buildProtocol = 'build:',
      moduleConfig = module.config(),
      depPrefix = 'element!',
      buildMap = {},
      tagToId = function(tag) { return tag; };

  // Referencing element module to make sure
  // document.register shim is in place. Over time,
  // as browsers implement it, this require call
  // can be removed.
  require('element');

  if (moduleConfig.hasOwnProperty('depPrefix')) {
    depPrefix = moduleConfig.depPrefix;
  }
  if (moduleConfig.hasOwnProperty('tagToId')) {
    tagToId = moduleConfig.tagToId;
  }

  if (typeof document !== 'undefined') {
    templateDiv = document.createElement('div');
  }

  /**
   * Handles converting <template id="body"> template
   * into a real body content, and calling back
   * template.ready listeners.
   */
  function onReady() {
    isReady = true;

    // The template#body is on purpose. Do not want to get
    // other element that may be #body if the page decides
    // to not use the template tag to avoid FOUC.
    var bodyTemplate = document.querySelector('template#body');

    if (bodyTemplate) {
      bodyTemplate.parentNode.removeChild(bodyTemplate);
      document.body.innerHTML = bodyTemplate.innerHTML;
    }

    readyQueue.forEach(function(fn) {
      fn();
    });
    readyQueue = [];
  }

  /**
   * For hrefid and srcid resolution, need full IDs.
   * This method takes care of creating full IDs. It
   * could be improved by removing extraneous ./ and
   * ../ references.
   * @param  {String} id    possible local, relative ID
   * @param  {String} refId ID to use as a basis for the
   * the local ID.
   * @return {String} full ID
   */
  function makeFullId(id, refId) {
    if (id.indexOf('.') === 0 && refId) {
      // Trim off the last segment of the refId, as we want
      // the "directory" level of the ID
      var parts = refId.split('/');
      parts.pop();
      refId = parts.join('/');

      id = (refId ? refId + '/' : '') + id;
    }

    return id;
  }

  /**
   * Supports cached internal nodes if data-cached is set to a truthy
   * value.
   */
  function templateCreatedCallback() {
      if (this.dataset.cached === 'cached' || this.template) {
        if (this.dataset.cached !== 'cached' && this.template) {
          // Clear out previous contents. If they were needed, they
          // would have been consumed by the this.template.fn() call.
          this.innerHTML = '';

          this.appendChild(this.template());
        }

        if (this.templateInsertedCallback) {
          this.templateInsertedCallback();
        }
      }
  }

  if (typeof XMLHttpRequest !== 'undefined') {
    // browser loading
    fetchText = function(url, onload, onerror) {
      var xhr = new XMLHttpRequest();

      xhr.open('GET', url, true);
      xhr.onreadystatechange = function() {
        var status, err;

        if (xhr.readyState === 4) {
          status = xhr.status;
          if (status > 399 && status < 600) {
            //An http 4xx or 5xx error. Signal an error.
            err = new Error(url + ' HTTP status: ' + status);
            err.xhr = xhr;
            onerror(err);
          } else {
            onload(xhr.responseText);
          }
        }
      };
      xhr.responseType = 'text';
      xhr.send(null);
    };
  } else {
    // Likely a build scenario. Cheat a bit and use
    // an r.js helper. This could be modified to support
    // more AMD loader tools though in the future.
    fetchText = function(url, onload) {
      onload(requirejs._readFile(url));
    };
  }

  template = {
    fetchText: fetchText,

    /**
     * Register a function to be run once element dependency
     * tracing and registration has finished.
     * @param  {Function} fn
     */
    ready: function(fn) {
      if (isReady) {
        setTimeout(fn);
      } else {
        readyQueue.push(fn);
      }
    },

    makeFullId: makeFullId,

    /**
     * Makes a template function for use as the template object
     * used in a fully realized custom element.
     * @param  {String} text string of HTML
     * @return {Function} by calling this function, creates a
     * clone of the DocumentFragment from template.
     */
    makeTemplateFn: function(text) {
      return function() {
        var e,
            frag = document.createDocumentFragment();

        // For the security conscious: the contents of `text` comes from the
        // require('template!...') calls that exercises this module's
        // functionality as a loader plugin to load UI fragments from .html
        // files via XHR calls to paths the application can reach, or from a \
        // built resource that was constructed from a similar XHR-type call, but
        // done at application build time. This means that dynamic calls to
        // require('template!...') are the source of risk for injection of
        // hostile HTML.
        templateDiv.innerHTML = text;

        while ((e = templateDiv.firstChild)) {
          frag.appendChild(e);
        }
        return frag;
      };
    },

    /**
     * Replaces hrefid and srcid with href and src, using
     * require.toUrl(id) to convert the IDs to paths.
     * @param  {String} text  string of HTML
     * @param  {String} refId the reference module ID to use,
     * which is normallly the module ID associated with the
     * HTML string given as input.
     * @return {String} converted HTML string.
     */
    idsToUrls: function(text, refId) {
      text = text
              .replace(attrIdRegExp, function(match, type, id) {
                id = makeFullId(id, refId);
                var attr = type === 'hrefid' ? 'href' : 'src';

                return ' ' + attr + '="' + require.toUrl(id) + '"';
              });
      return text;
    },

    /**
     * Gives and array of 'element!'-based module IDs for
     * any custom elements found in the string of HTML.
     * So if the HTML has <some-thing> in it, the returned
     * dependency array will have 'element!some-thing' in it.
     * @param  {String} text string of HTML
     * @return {Array} array of dependencies. Could be zero
     * length if no dependencies found.
     */
    depsFromText: function(text) {
      var match, noCommentText,
          deps = [];

      // Remove comments so only legit tags are found
      noCommentText = text.replace(commentRegExp, '');

      tagRegExp.lastIndex = 0;
      while ((match = tagRegExp.exec(noCommentText))) {
        deps.push(depPrefix + tagToId(match[1]));
      }

      return deps;
    },

    /**
     * Converts a string of HTML into a full template
     * object that is used for a custom element's
     * prototype `template` property.
     * @param  {String} text string of HTML
     * @param  {String} id module ID for the custom
     * element associated with this template.
     * @param  {Boolean} skipTranslateIds for build
     * concerns, want to avoid the work that translate
     * IDs until runtime, when more state is known
     * about final path information. If that is the
     * case, then pass true for this value.
     * @return {Object} template object.
     */
    textToTemplate: function(text, id, skipTranslateIds) {
      var obj,
          deps = template.depsFromText(text);

      obj = {
        id: id,
        deps: deps,
        text: text
      };

      if (!skipTranslateIds) {
        obj.text = template.idsToUrls(text, id);
        // Cannot reliably create the template function
        // until IDs are translated, so wait on that
        // step until later.
        obj.fn = template.makeTemplateFn(obj.text);
      }

      return obj;
    },

    /**
     * Turns a template object, created via build, into
     * a template function.
     * @param  {Object} obj the object created by a build.
     * @return {Function}   a function to call to get a
     * DOM object for insertion into the document.
     */
    objToFn: function(obj) {
      var text = template.idsToUrls(obj.text, obj.id);
      return template.makeTemplateFn(text);
    },

    templateCreatedCallback: templateCreatedCallback,

    /**
     * AMD loader plugin API. Loads the resource. Called by an
     * AMD loader.
     * @param  {String} id     resource ID to load.
     * @param  {Function} req    context-specific `require` function.
     * @param  {Function} onload called when loading is complete.
     * @param  {Object} config config object, normally just has
     * config.isBuild to indicate build scenario.
     */
    load: function(id, req, onload, config) {
      var isBuild = config.isBuild;

      // If a build directive, load those files and scan
      // for dependencies, loading them all.
      if (id.indexOf(buildProtocol) === 0 && isBuild) {
        id = id.substring(buildProtocol.length);

        var idList = id.split(','),
            count = 0,
            buildIdDone = function() {
              count += 1;
              if (count === idList.length) {
                onload();
              }
            };

        // Set buildIdDone as executable by the build
        buildIdDone.__requireJsBuild = true;

        // Allow for multiple files separated by commas
        id.split(',').forEach(function(moduleId) {
          var path = req.toUrl(moduleId);

          // Leverage r.js optimizer special method for reading
          // files synchronously.
          require(template.depsFromText(requirejs._readFile(path)),
                  buildIdDone);
        });
      } else {
        fetchText(req.toUrl(id), function(text) {
          var templateObj = template.textToTemplate(text, id, isBuild);

          req(templateObj.deps, function() {
            if (isBuild) {
              buildMap[id] = templateObj;
            }
            onload({
              createdCallback: templateCreatedCallback,
              template: templateObj.fn
            });
          });
        }, onload.error);
      }
    },

    /**
     * AMD loader plugin API. Called by a build tool, to give
     * this plugin the opportunity to write a resource to
     * a build file.
     * @param  {String} pluginName ID of this module, according
     * to what the loader thinks the ID is.
     * @param  {String} id         resource ID handled by plugin.
     * @param  {Function} write      Used to write output to build file.
     */
    write: function(pluginName, id, write) {
      if (buildMap.hasOwnProperty(id)) {
        var obj = buildMap[id],
            depString = JSON.stringify(obj.deps);

        depString = depString.replace(/^\s*\[/, '').replace(/\]\s*$/, '')
                             .trim();
        if (depString) {
          depString = ', ' + depString;
        }

        write.asModule(pluginName + '!' + id,
          'define([\'' + module.id + '\'' + depString +
          '], function(template) { return {\n' +
          'createdCallback: template.templateCreatedCallback,\n' +
          'template: template.objToFn(' + JSON.stringify(buildMap[id]) +
          ')}; });\n');
      }
    }
  };

  if (typeof document !== 'undefined') {
    // This section wires up processing of the initial document DOM.
    // In a real document.register browser, this would not be possible
    // to do, as document.register would grab all the tags before this
    // would likely run. Also, onDomDone just a hack related to
    // DOMContentLoaded not firing.
    var onDom, onDomDone = false;
    onDom = function() {
      if (onDomDone) {
        return;
      }
      onDomDone = true;

      // Collect all the tags already in the DOM
      var converted = template.textToTemplate(document.body.innerHTML);

      require(converted.deps, onReady);
    };


    if (document.readyState === 'interactive' ||
        document.readyState === 'complete') {
      onDom();
    } else {
      window.addEventListener('DOMContentLoaded', onDom);
    }
  }

  return template;
});

define('template!cards/confirm_dialog.html',['template'], function(template) { return {
createdCallback: template.templateCreatedCallback,
template: template.objToFn({"id":"cards/confirm_dialog.html","deps":[],"text":"<div class=\"card-confirm-dialog card\">\n  <form data-statuscolor=\"background\"\n        role=\"dialog\" data-type=\"confirm\" class=\"collapsed confirm-dialog-form\">\n    <section>\n      <h1 data-l10n-id=\"confirm-dialog-title\"></h1>\n      <p class=\"confirm-dialog-message\"></p>\n    </section>\n    <menu>\n      <button class=\"confirm-dialog-cancel\" data-l10n-id=\"message-multiedit-cancel\"></button>\n      <button class=\"confirm-dialog-ok recommend\" data-l10n-id=\"dialog-button-ok\"></button>\n    </menu>\n  </form>\n</div>\n"})}; });


define('cards/confirm_dialog',['require','cards','./base','template!./confirm_dialog.html'],function(require) {
  var cards = require('cards');

  return [
    require('./base')(require('template!./confirm_dialog.html')),
    {
      onArgs: function(args) {
        var dialogBodyNode = args.dialogBodyNode,
            confirm = args.confirm,
            cancel = args.cancel,
            callback = args.callback;

        if (dialogBodyNode) {
          this.appendChild(dialogBodyNode);
        } else {
          // If no dialogBodyNode passed in, use the default form display, and
          // configure the confirm/cancel hand, for the simple way of handling
          // confirm dialogs.
          dialogBodyNode = this.querySelector('.confirm-dialog-form');

          dialogBodyNode.querySelector('.confirm-dialog-message')
                        .textContent = args.message;

          dialogBodyNode.classList.remove('collapsed');

          confirm = {
            handler: function() {
              callback(true);
            }
          };
          cancel = {
            handler: function() {
              callback(false);
            }
          };
        }

        // Wire up the event handling
        dialogBodyNode.addEventListener('submit', function(evt) {
          evt.preventDefault();
          evt.stopPropagation();

          this.hide();

          var target = evt.explicitOriginalTarget,
              targetId = target.id,
              isOk = target.classList.contains('confirm-dialog-ok'),
              isCancel = target.classList.contains('confirm-dialog-cancel');

          if ((isOk || targetId === confirm.id) && confirm.handler) {
            confirm.handler();
          } else if ((isCancel || targetId === cancel.id) && cancel.handler) {
            cancel.handler();
          }
        }.bind(this));
      },

      hide: function() {
        cards.removeCardAndSuccessors(this, 'immediate', 1, null, true);
      },

      die: function() {
      }
    }
  ];
});



define('confirm_dialog',['require','exports','module','cards','element!cards/confirm_dialog'],function(require, exports) {

  var cards = require('cards'),
      ConfirmDialog = require('element!cards/confirm_dialog');

  /**
   * A class method used by others to create confirm dialogs.
   * This method has two call types, to accommodate older
   * code that used ConfirmDialog to pass a full form node:
   *
   *  ConfirmDialog.show(dialogFormNode, confirmObject, cancelObject);
   *
   * and simpler code that just wants to pass a string message
   * and a callback that returns true (if OK is pressed) or
   * false (if cancel is pressed):
   *
   *  ConfirmDialog.show(messageString, function(confirmed) {});
   *
   * This newer style mimics a plain confirm dialog, with an
   * OK and Cancel that are not customizable.
   */
  ConfirmDialog.show = function(message, callback, cancel) {
    var dialogBodyNode;

    // Old style confirms that have their own form.
    if (typeof message !== 'string') {
      dialogBodyNode = message;
      message = null;
    }

    cards.pushCard('confirm_dialog', 'immediate', {
      dialogBodyNode: dialogBodyNode,
      message: message,
      confirm: callback,
      callback: callback,
      cancel: cancel
    }, 'right');
  };

  return ConfirmDialog;

});


define('date',['require','l10n!'],function(require) {
  var mozL10n = require('l10n!');

  var date = {
    /**
     * Display a human-readable relative timestamp.
     */
    prettyDate: function(time, useCompactFormat) {
      var f = new mozL10n.DateTimeFormat();
      return f.fromNow(time, useCompactFormat);
    },

    /**
     * Given a node, show a pretty date for its contents.
     * @param {Node} node  the DOM node.
     * @param {Number} timestamp a timestamp like the one retuned
     * from Date.getTime().
     */
    setPrettyNodeDate: function(node, timestamp) {
      if (timestamp) {
        node.dataset.time = timestamp.valueOf();
        node.dataset.compactFormat = true;
        node.textContent = date.prettyDate(timestamp, true);
      } else {
        node.textContent = '';
        node.removeAttribute('data-time');
      }
    }
  };

  return date;
});



define('vscroll',['require','exports','module','evt'],function(require, exports, module) {

  var evt = require('evt'),
      slice = Array.prototype.slice,
      useTransform = false;

  /**
   * Indirection for setting the top of a node. Used to allow
   * experimenting with either a transform or using top
   */
  function setTop(node, value) {
    if (useTransform) {
      node.style.transform = 'translateY(' + value + 'px)';
    } else {
      node.style.top = value + 'px';
    }
  }

  // VScroll --------------------------------------------------------
  /**
   * Creates a new VScroll instance. Needs .setData() called on it
   * to actually show content, the constructor just wires up nodes
   * and sets starting state.
   *
   * @param {Node} container the DOM node that will show the items.
   *
   * @param {Node} scrollingContainer the scrolling DOM node, which
   * contains the `container` node. Note that in email, there are
   * other nodes in the scrollingContainer besides just container.
   *
   * @param {Node} template a DOM node that is cloned to provide
   * the DOM node to use for an item that is shown on the screen.
   * The clones of this node are cached and reused for multiple
   * data items.
   *
   * @param {Object} defaultData a placeholder data object to use
   * if list(index) does not return an object. Usually shows up when
   * the scroll gets to a place in the list that does not have data
   * loaded yet from the back end.
   */
  function VScroll(container, scrollingContainer, template, defaultData) {
    evt.Emitter.call(this);

    this.container = container;
    this.scrollingContainer = scrollingContainer;
    this.template = template;
    this.defaultData = defaultData;

    this._inited = false;

    // In a sane world, _initing would not be needed. However, it was discovered
    // during the fastcache work that _init() would be entered twice. The first
    // entrance would pause at the .clientHeight call, which would trigger
    // events that led to nowVisible being called and this second _init call
    // would complete. The first one would try to complete but then rand into
    // errors. This happened on an activity return cancel from contacts to
    // compose card, where the compose card back was pressed without saving the
    // draft. Usually, but not always, this weird condition would manifest
    // during the transition back to the contacts app. The error in the logcat
    // that indicated this error was:
    // ERR: onerror reporting: NotFoundError:
    // Node was not found @ app://email.gaiamobile.org/js/config.js : 10814
    this._initing = false;

    // Because the FxOS keyboard works by resizing our window, we/our caller
    // need to be careful about when we sample things involving the screen size.
    // So, we want to only capture this once and do it separably from other
    // things.
    this._capturedScreenMetrics = false;

    /**
     * What is the first/lowest rendered index?  Tracked so the HTML
     * cache logic can know if we've got the data for it to be able to
     * render the first N nodes.
     */
    this.firstRenderedIndex = 0;

    this._limited = false;

    /**
     * The list of reused Element nodes.  Their order in this list has
     * no correlation with their display position.  If you decide to
     * reorder them you may break/hurt _nextAvailableNode.
     */
    this.nodes = [];
    /**
     * Maps data indexes to their reusable Element nodes if currently
     * rendered, or -1 if previously (but not currently rendered).
     * Populated as nodes are rendered so not being in the map is
     * effectively the same as having a value of -1.
     *
     * Maintained by _setNodeDataIndex and accessed by
     * _getNodeFromDataIndex.  Use those methods and do not touch this
     * map directly.
     */
    this.nodesDataIndices = {};
    /** Internal state variable of _nextAvailableNode for efficiency. */
    this.nodesIndex = -1;

    this.scrollTop = 0;

    /**
     * Any visible height offset to where container sits in relation
     * to scrollingContainer. Expected to be set by owner of the
     * VScroll instance. In email, the search box height is an
     * example of a visibleOffset.
     */
    this.visibleOffset = 0;

    /**
     * The old list size is used for display purposes, to know if new data would
     * affect the scroll offset or if the total display height needs to be
     * adjusted.
     */
    this.oldListSize = 0;

    this._lastEventTime = 0;

    // Bind to this to make reuse in functional APIs easier.
    this.onEvent = this.onEvent.bind(this);
    this.onChange = this.onChange.bind(this);
    this._scrollTimeoutPoll = this._scrollTimeoutPoll.bind(this);
  }

  VScroll.nodeClassName = 'vscroll-node';

  /**
   * Given a node that is handled by VScroll, trim it down for use
   * in a string cache, like email's html cache. Modifies the
   * node in place.
   * @param  {Node} node the containerNode that is bound to
   * a VScroll instance.
   * @param  {Number} itemLimit number of items to cache. If greater
   * than the length of items in a NodeCache, the NodeCache item
   * length will be used.
   */
  VScroll.trimMessagesForCache = function(container, itemLimit) {
    // Find the NodeCache that is at the top
    var nodes = slice.call(container.querySelectorAll(
                           '.' + VScroll.nodeClassName));
    nodes.forEach(function(node) {
      var index = parseInt(node.dataset.index, 10);
      // None of the clones need this value after we read it off, so reduce
      // the size of the cache by clearing it.
      delete node.dataset.index;
      if (index > itemLimit - 1) {
        container.removeChild(node);
      }
    });
  };

  VScroll.prototype = {
    /**
     * rate limit for event handler, in milliseconds, so that
     * it does not do work for every event received. If set to
     * zero, it means always do the work for every scroll event.
     * If this code continues to use 0, then the onEvent/onChange
     * duality could be removed, and just use onChange directly.
     * A non-zero value, like 50 subjectively seems to result in
     * more checkerboarding of half the screen every so often.
     */
    eventRateLimitMillis: 0,


    /**
     * The maximum number of items visible on the screen at once
     * (derived from available space and rounded up).
     */
    itemsPerScreen: undefined,

    /**
     * The number of screens worth of items to pre-render in the
     * direction we are scrolling beyond the current screen.
     */
    prerenderScreens: 3,

    /**
     * The number of screens worth of items to prefetch (but not
     * render!) beyond what we prerender.
     */
    prefetchScreens: 2,

    /**
     * The number of extra screens worth of rendered items to keep
     * around beyond what is required for prerendering.  When
     * scrolling in a single direction, this ends up being the number
     * of screens worth of items to keep rendered behind us.  If this
     * is less than the value of `prerenderScreens` then a user just
     * jiggling the screen up and down by even a pixel will cause us
     * work as we move the delta back and forth.
     *
     * In other words, don't have this be less than
     * `prerenderScreens`, but you can have it be more.  (Although
     * having it be more is probably wasteful since extra DOM nodes
     * the user is moving away from don't help us.)
     */
    retainExtraRenderedScreens: 3,

    /**
     * When recalculating, pre-render this many screens of messages on
     * each side of the current screen.  This may be a fractional
     * value (we round up).
     *
     * In the initial case we very much want to minimize rendering
     * latency, so it makes sense for this to be smaller than
     * `prerenderScreens`.
     *
     * In the non-initial case we wait for scrolling to have quiesced,
     * so there's no overriding need to bias in either direction.
     */
    recalculatePaddingScreens: 1.5,

    /**
     * Track when the last time vscroll manually changed the scrollTop
     * of the scrolling container. Useful for when knowing if a recent
     * scroll event was triggered by this component or by user action.
     * The value resets to 0 periodically to avoid interested code from
     * doing too many timestamp checks on every scroll event.
     */
    lastScrollTopSetTime: 0,

    /**
     * The number of items to prerender (computed).
     */
    prerenderItemCount: undefined,

    /**
     * The number of items to prefetch (computed).
     */
    prefetchItemCount: undefined,

    /**
     * The number of items to render when (non-initial) recalculating.
     */
    recalculatePaddingItemCount: undefined,

    /**
     * The class to find items that have their default data set,
     * in the case where a scroll into a cache has skipped updates
     * because a previous fast scroll skipped the updates since they
     * were not visible at the time of that fast scroll.
     */
    itemDefaultDataClass: 'default-data',

    /**
     * Hook that is implemented by the creator of a VScroll instance.
     * Called when the VScroll thinks it will need the next set of
     * data, but before the VScroll actually shows that section of
     * data. Passed the inclusive high absolute index for which it
     * wants data.  ASSUMES data sources that only need to grow
     * downward.
     */
    prepareData: function(highAbsoluteIndex) {},

    /**
     * Hook that is implemented by the creator of a VScroll instance.
     * Called when the VScroll wants to bind a model object to a
     * display node.
     */
    bindData: function(model, node) {},

    /**
     * Sets the list data source, and then triggers a recalculate
     * since the data changed.
     * @param {Function} list the list data source.
     */
    setData: function(list) {
      this.list = list;
      if (this._inited) {
        if (!this.waitingForRecalculate) {
          this._recalculate(0);
        }
        this.emit('dataChanged');
      } else {
        this._init();
        this.renderCurrentPosition();
      }
    },

    /**
     * Called by code that created the VScroll instance, when that
     * code has data fetched and wants to let the VScroll know
     * about it. This is useful from removing the display of
     * defaultData and showing the finally fetched data.
     * @param  {Number} index the list item index for which the
     * data update is available
     * @param  {Array} dataList the list of data items that are
     * now available. The first item in that list corresponds to
     * the data list index given in the first argument.
     * @param  {number} removedCount the count of any items removed.
     * Used mostly to know if a recalculation needs to be done.
     */
    updateDataBind: function(index, dataList, removedCount) {
      if (!this._inited) {
        return;
      }

      // If the list data set length is different from before, that
      // indicates state is now invalid and a recalculate is needed,
      // but wait until scrolling stops. This can happen if items
      // were removed, or if new things were added to the list.
      if (this.oldListSize !== this.list.size() || removedCount) {
        if (!this.waitingForRecalculate) {
          this.waitingForRecalculate = true;
          this.once('scrollStopped', function() {
            this._recalculate(index);
          }.bind(this));
        }
        return;
      }

      // Not a list data size change, just an update to existing
      // data items, so update them in place.
      for (var i = 0; i < dataList.length; i++) {
        var absoluteIndex = index + i;
        var node = this._getNodeFromDataIndex(absoluteIndex);
        if (node) {
          this.bindData(dataList[i], node);
        }
      }
    },

    /**
     * Handles events fired, and allows rate limiting the work if
     * this.eventRateLimitMillis has been set. Otherwise just calls
     * directly to onChange.
     */
    onEvent: function() {
      this._lastEventTime = Date.now();

      if (!this.eventRateLimitMillis) {
        this.onChange();
        return;
      }

      if (this._limited) {
        return;
      }
      this._limited = true;
      setTimeout(this.onChange, this.eventRateLimitMillis);
    },

    /**
     * Process a scroll event (possibly delayed).
     */
    onChange: function() {
      // Rate limit is now expired since doing actual work.
      this._limited = false;

      if (!this._inited) {
        return;
      }

      if (this.lastScrollTopSetTime) {
        // Keep the last scroll time for about a second, which should
        // be enough time for interested parties to check the value.
        if (this.lastScrollTopSetTime + 1000 < Date.now()) {
          this.lastScrollTopSetTime = 0;
        }
      }

      var startIndex,
          endIndex,
          scrollTop = this.scrollingContainer.scrollTop,
          scrollingDown = scrollTop >= this.scrollTop;
      this.scrollTop = scrollTop;
      // must get after updating this.scrollTop since it uses that
      var visibleRange = this.getVisibleIndexRange();

      if (scrollingDown) {
        // both _render and prepareData clamp appropriately
        startIndex = visibleRange[0];
        endIndex = visibleRange[1] + this.prerenderItemCount;
        this.prepareData(endIndex + this.prefetchItemCount);
      } else {
        // scrolling up
        startIndex = visibleRange[0] - this.prerenderItemCount;
        endIndex = visibleRange[1];
        // no need to prepareData; it's already there!
      }

      this._render(startIndex, endIndex);

      this._startScrollStopPolling();
    },

    /**
     * Called when the vscroll becomes visible. In cases where the vscroll
     * may have been intially created for an element that is not visible,
     * the sizing information would not be correct and the vscroll instance
     * would not be initialized correctly. So the instance needs to know
     * when it should check again to properly initialize. Otherwise, there
     * may not be any new data signals from the the list data that a display
     * needs to be tried.
     */
    nowVisible: function() {
      // Only do work if not initialized and have data.
      if (!this._inited && this.list) {
        this._init();
        this.onChange();
      }
    },

    /**
     * Renders the list at the current scroll position.
     */
    renderCurrentPosition: function() {
      if (!this._inited) {
        return;
      }

      var scrollTop = this.scrollingContainer.scrollTop;
      this.scrollTop = scrollTop;

      var visibleRange = this.getVisibleIndexRange();
      // (_render clamps these values for sanity; we don't have to)
      var startIndex = visibleRange[0] - this.recalculatePaddingItemCount;
      var endIndex = visibleRange[1] + this.recalculatePaddingItemCount;

      this._render(startIndex, endIndex);
      // make sure we have at least enough data to cover what we want
      // to display
      this.prepareData(endIndex);
    },

    /**
     * Determine what data index is at the given scroll position.
     * @param  {Number} position scroll position
     * @return {Number} the data index.
     */
    indexAtScrollPosition: function (position) {
      var top = position - this.visibleOffset;
      if (top < 0) {
        top = 0;
      }
      return this.itemHeight ? Math.floor(top / this.itemHeight) : 0;
    },

    /**
     * Returns the start index and end index of the list items that
     * are currently visible to the user using the currently cached
     * scrollTop value.
     * @return {Array} first and last index. Array could be undefined
     * if the VScroll is not in a position to show data yet.
     */
    getVisibleIndexRange: function() {
      // Do not bother if itemHeight has not bee initialized yet.
      if (this.itemHeight === undefined) {
        return undefined;
      }

      var top = this.scrollTop;

      return [
        this.indexAtScrollPosition(top),
        this.indexAtScrollPosition(top + this.innerHeight)
      ];
    },

    /**
     * Given the list index, scroll to the top of that item.
     * @param  {Number} index the list item index.
     */
    jumpToIndex: function(index) {
      this._setContainerScrollTop((index * this.itemHeight) +
                                          this.visibleOffset);
    },

    /**
     * Removes items from display in the container. Just a visual
     * change, does not change data in any way. Data-related
     * elements, like the positions of this.nodes, are reset in
     * the data entry points that follow a clearDisplay, like
     * _init() or recalculate().
     */
    clearDisplay: function() {
      // Clear the HTML content.
      this.container.innerHTML = '';
      this.container.style.height = '0px';

      // Also clear the oldListSize, since it used for height/scroll offset
      // updates, and now that the container does not have any children, this
      // property should be reset to zero. If this is not done, it is possible
      // for an update that matches the same size as the previous data will not
      // end up showing items. This happened for search in bug 1081403.
      this.oldListSize = 0;
    },

    /**
     * Call this method before the VScroll instance will be destroyed.
     * Used to clean up the VScroll.
     */
    destroy: function() {
      this.scrollingContainer.removeEventListener('scroll', this.onEvent);
      if (this._scrollTimeoutPoll) {
        clearTimeout(this._scrollTimeoutPoll);
        this._scrollTimeoutPoll = 0;
      }
    },

    _setContainerScrollTop: function(value) {
      this.scrollingContainer.scrollTop = value;
      // Opt for using a property set instead of an event emitter, since the
      // timing of that event emit is not guaranteed to get to listeners before
      // scroll events.
      this.lastScrollTopSetTime = Date.now();
    },

    /**
     * Ensure that we are rendering at least all messages in the
     * inclusive range [startIndex, endIndex].  Already rendered
     * messages outside this range may be reused but will not be
     * removed or de-rendered unless they are needed.
     *
     *
     * @param {Number} startIndex first inclusive index in this.list's
     * data that should be used.  Will be clamped to the bounds of
     * this.list but what's visible on the screen is not considered
     * @param {Number} endIndex last inclusive index in this.list's
     * data that should be used.  Clamped like startIndex.
     */
    _render: function(startIndex, endIndex) {
      var i,
          listSize = this.list.size();

      // Paranoia clamp the inputs; we depend on callers to deal with
      // the visible range.
      if (startIndex < 0) {
        startIndex = 0;
      }
      if (endIndex >= listSize) {
        endIndex = listSize - 1;
      }

      this.firstRenderedIndex = startIndex;

      if (!this._inited) {
        this._init();
      }

      for (i = startIndex; i <= endIndex; i++) {
        // If node already bound and placed correctly, skip it.
        if (this._getNodeFromDataIndex(i)) {
          continue;
        }

        var node = this._nextAvailableNode(startIndex, endIndex),
            data = this.list(i);

        if (!data) {
          data = this.defaultData;
        }

        // Remove the node while doing updates in positioning to
        // avoid extra layers from being created which really slows
        // down scrolling.
        if (node.parentNode) {
          node.parentNode.removeChild(node);
        }

        setTop(node, i * this.itemHeight);
        this._setNodeDataIndex(this.nodesIndex, i);
        this.bindData(data, node);

        this.container.appendChild(node);

      }
    },

    _setNodeDataIndex: function(nodesIndex, dataIndex) {
      // Clear dataIndices map for old dataIndex value.
      var oldDataIndex = this.nodes[nodesIndex].vScrollDataIndex;
      if (oldDataIndex > -1) {
        this.nodesDataIndices[oldDataIndex] = -1;
      }

      var node = this.nodes[nodesIndex];
      node.vScrollDataIndex = dataIndex;
      // Expose the index into the DOM so that the cache logic can
      // consider them since only the underlying DOM node is cloned by
      // cloneNode().  (vScrollDataIndex is an "expando" property on
      // the JS wrapper on the native DOM object.)
      node.dataset.index = dataIndex;
      this.nodesDataIndices[dataIndex] = nodesIndex;
    },

    _getNodeFromDataIndex: function (dataIndex) {
      var index = this.nodesDataIndices[dataIndex];

      if (index === undefined) {
        index = -1;
      }

      return index === -1 ? null : this.nodes[index];
    },

    captureScreenMetrics: function() {
      if (this._capturedScreenMetrics) {
        return;
      }
      this.innerHeight = this.scrollingContainer.getBoundingClientRect().height;
      if (this.innerHeight > 0) {
        this._capturedScreenMetrics = true;
      }
    },

    /**
     * Handles final initialization, once the VScroll is expected
     * to actually show data.
     *
     * XXX eventually consume 'resize' events.  Right now we are
     * assuming that the email app only supports a single orientation
     * (portrait) and that the only time a resize event will trigger
     * is if the keyboard is shown or hidden.  When used in the
     * message_list's search mode, it explicitly calls _init on us
     * prior to causing the keyboard to be displayed, which currently
     * saves us from getting super confused.
     */
    _init: function() {
      if (this._inited || this._initing) {
        return;
      }
      this._initing = true;

      // Clear out any previous container contents. For example, a
      // cached HTML of a previous card may have been used to init
      // this VScroll instance.
      this.container.innerHTML = '';

      // Get the height of an item node.
      var node = this.template.cloneNode(true);
      this.container.appendChild(node);
      this.itemHeight = node.clientHeight;
      this.container.removeChild(node);

      // Set up all the bounds used in scroll calculations
      this.captureScreenMetrics();

      // The instance is not visible yet, so cannot finish initialization.
      // Wait for the next instance API call to see if initialization can
      // complete.
      if (!this.itemHeight || !this.innerHeight) {
        this._initing = false;
        return;
      }

      this.scrollingContainer.addEventListener('scroll', this.onEvent);

      this.itemsPerScreen = Math.ceil(this.innerHeight / this.itemHeight);
      this.prerenderItemCount =
        Math.ceil(this.itemsPerScreen * this.prerenderScreens);
      this.prefetchItemCount =
        Math.ceil(this.itemsPerScreen * this.prefetchScreens);
      this.recalculatePaddingItemCount =
        Math.ceil(this.itemsPerScreen * this.recalculatePaddingScreens);

      this.nodeCount = this.itemsPerScreen + this.prerenderItemCount +
                       Math.ceil(this.retainExtraRenderedScreens *
                                 this.itemsPerScreen);


      // Fill up the pool of nodes to use for data items.
      for (var i = 0; i < this.nodeCount; i++) {
        node = this.template.cloneNode(true);
        node.classList.add(VScroll.nodeClassName);
        setTop(node, (-1 * this.itemHeight));
        this.nodes.push(node);
        this._setNodeDataIndex(i, -1);
      }

      this._calculateTotalHeight();
      this._inited = true;
      this._initing = false;
      this.emit('inited');
    },

    /**
     * Finds the next node in the pool to use in the visible area.
     * Uses a hidden persistent index to provide efficient lookup for
     * repeated calls using the same stratIndex/endIndex as long as
     * there are at least (endIndex - beginIndex + 1) * 2 nodes.
     *
     * @param  {Number} beginIndex the starting data index for the
     * range of already visible data indices. They should be
     * avoided as choices since they are already in visible area.
     * @param  {Number} endIndex the ending data index for the
     * range of already visible data indices.
     * @return {Node} the DOM node that can be used next for display.
     */
    _nextAvailableNode: function(beginIndex, endIndex) {
      var i, node, vScrollDataIndex,
          count = 0;

      // Loop over nodes finding the first one that is out of visible
      // range, making sure to loop back to the beginning of the
      // nodes if cycling over the end of the list.
      for (i = this.nodesIndex + 1; count < this.nodes.length; count++, i++) {
        // Loop back to the beginning if past the end of the nodes.
        if (i > this.nodes.length - 1) {
          i = 0;
        }

        node = this.nodes[i];
        vScrollDataIndex = node.vScrollDataIndex;

        if (vScrollDataIndex < beginIndex || vScrollDataIndex > endIndex) {
          this.nodesIndex = i;
          break;
        }
      }

      return node;
    },

    /**
     * Recalculates the size of the container, and resets the
     * display of items in the container. Maintains the scroll
     * position inside the list.
     * @param {Number} refIndex a reference index that spawned
     * the recalculate. If that index is "above" the targeted
     * computed index found by recalculate, then it means the
     * the absolute scroll position may need to change.
     */
    _recalculate: function(refIndex) {
      if (!this._inited) {
        return;
      }

      var node,
          index = this.indexAtScrollPosition(this.scrollTop),
          remainder = this.scrollTop % this.itemHeight,
          sizeDiff = this.list.size() - this.oldListSize;

      // If this recalculate was spawned from the top and more
      // items, then new messages from the top, and account for
      // them so the scroll position does not jump. Only do this
      // though if old size was not 0, which is common on first
      // folder sync, or if the reference index that spawned the
      // recalculate is "above" the target index, since that
      // means the contents above the target index shifted.
      if (refIndex && refIndex < index && sizeDiff > 0 &&
          this.oldListSize !== 0 && index !== 0) {
        index += sizeDiff;
      }

      console.log('VSCROLL scrollTop: ' + this.scrollTop +
                  ', RECALCULATE: ' + index + ', ' + remainder);

      this._calculateTotalHeight();

      // Now clear the caches from the visible area
      for (var i = 0; i < this.nodeCount; i++) {
        node = this.nodes[i];
        setTop(node, (-1 * this.itemHeight));
        this._setNodeDataIndex(i, -1);
      }
      this.waitingForRecalculate = false;

      this._setContainerScrollTop((this.itemHeight * index) + remainder);
      this.renderCurrentPosition();

      this.emit('recalculated', index === 0);
    },

    /**
     * Sets the total height of the container.
     */
    _calculateTotalHeight: function() {
      // Size the scrollable area to the full height if all items
      // were rendered inside of it, so that there is no weird
      // scroll bar grow/shrink effects and so that inertia
      // scrolling is not artificially truncated.
      var newListSize = this.list.size();

      // Do not bother if same size, or if the container was set to 0 height,
      // most likely by a clearDisplay.
      if (this.oldListSize !== newListSize ||
        parseInt(this.container.style.height, 10) === 0) {
        this.totalHeight = this.itemHeight * newListSize;
        this.container.style.height = this.totalHeight + 'px';
        this.oldListSize = newListSize;
      }
    },

    /**
     * Handles checking for the end of a scroll, based on a time
     * delay since the last scroll event.
     */
    _scrollTimeoutPoll: function() {
      this._scrollStopTimeout = 0;
      if (Date.now() > this._lastEventTime + 300) {
        this.emit('scrollStopped');
      } else {
        this._scrollStopTimeout = setTimeout(this._scrollTimeoutPoll, 300);
      }
    },

    /**
     * Starts checking for the end of scroll events.
     */
    _startScrollStopPolling: function() {
      if (!this._scrollStopTimeout) {
        // "this" binding for _scrollTimeoutPoll done in constructor
        this._scrollStopTimeout = setTimeout(this._scrollTimeoutPoll, 300);
      }
    }
  };

  evt.mix(VScroll.prototype);

  // Override on() to allow for a lazy firing of scrollStopped,
  // particularly when the list is not scrolling, so the stop
  // polling is not currently running. This is useful for "once"
  // listeners that just want to be sure to do work when scroll
  // is not in action.
  var originalOn = VScroll.prototype.on;
  VScroll.prototype.on = function(id, fn) {
    if (id === 'scrollStopped') {
      this._startScrollStopPolling();
    }

    return originalOn.apply(this, slice.call(arguments));
  };

  // Introspection tools --------------------------------------------
  // uncomment this section to use them. Useful for tracing how the
  // code is called.
  /*
  require('debug_trace_methods')(VScroll.prototype, module.id);
  */

  return VScroll;
});


/**
 * @fileoverview This file provides a MessageListTopbar which is
 *     a little notification bar that tells the user
 *     how many new emails they've received after a sync.
 */

// TODO: this file is set up to be a web component, but needs more plumbing
// changes, tracked in bug 1005446, so that template! can be used instead of
// tmpl!, which does not find and wait for referenced web components.
// Once that other bug lands, this file can be changed to a web component by:
// * change `this.domNode` to just be `this`
// * use the commented out document.registerElement() call instead of the manual
// instance creation and passing of the domNode.

/**
 * This module handles the display of either "N new messages" or showing a
 * "jump to top" arrow if the user is scrolled down more than the
 * _thresholdMultiplier amounts of screens and the user starts scrolling up.
 *
 * New message notification takes priority over top arrow display, and CSS
 * animations are used to transition between the different states. Instances of
 * this module will rely on a VScroll instance and a scrollContainer to do their
 * work. The VScroll instance is used to know if the VScroll decided to change
 * the scroll position itself (vs. a user choice), and in that case the up arrow
 * is not shown. Also, if the user taps on either the top arrow or New Messages
 * indicator, VScroll will be told to jump to the top.
 *
 * The scrollContainer is used to track the scroll events, to know whether to
 * show the top arrow.
 *
 * The contents of the element used for an instance will contain either the top
 * arrow (via background image, and accessibility text) or the New Messages
 * text. CSS styles based on the data-state attribute trigger the styling.
 *
 * Possible states for an instance:
 * - '': hidden
 * - 'top': the top arrow is showing
 * - 'message': the New Messages indicator is showing.
 *
 */
define('message_list_topbar',['require','exports','module','l10n!'],function(require, exports, module) {
  var mozL10n = require('l10n!');

  var proto = {
    domNode: null,
    _scrollContainer: null,
    _vScroll: null,
    _delayedState: null,
    _newEmailCount: 0,
    _scrollTop: 0,
    _thresholdMultiplier: 2,

    visibleOffset: 0,

    createdCallback: function() {
      this.domNode.addEventListener('click', this._onClick.bind(this));
      this.domNode.addEventListener('transitionend',
                                    this._onTransitionEnd.bind(this));
    },

    /**
     * Resets the passed in node to not have any styles or content so that it is
     * suitable for html cache storage. Modifies the node in place.
     * @param  {Node} node the cloned node of message_list_topbar type.
     */
    resetNodeForCache: function(node) {
      node.classList.remove('closing');
      node.textContent = '';
      node.dataset.state = '';
      this.domNode.style.left = '';
    },

    bindToElements: function(scrollContainer, vScroll) {
      this._scrollContainer = scrollContainer;
      this._scrollContainer.addEventListener('scroll',
                                             this._onScroll.bind(this));
      this._scrollTop = this._scrollContainer.scrollTop;
      this._vScroll = vScroll;
    },

    /**
     * Main method called by consumers of this module. Will display
     * @param  {[type]} newEmailCount [description]
     * @return {[type]}               [description]
     */
    showNewEmailCount: function(newEmailCount) {
      // If already at the top, do not show the new message.
      if (this._scrollTop <= this.visibleOffset) {
        return;
      }

      this._newEmailCount = newEmailCount;
      this._showState('message');
    },

    _getState: function() {
      return this.domNode.dataset.state;
    },

    _showState: function(state) {
      var nodeState = this._getState();
      if (nodeState === state) {
        return;
      } else if (!nodeState || !state) {
        this._animateState(state);
      } else if (nodeState !== state &&
                // Favor message display to top display.
                (nodeState !== 'message' || state !== 'top')) {
        // Transition away from old state, then set the new one.
        this._delayedState = state;
        if (!this._animating) {
          this._animateState('');
        }
      }
    },

    _animateState: function(state) {
      this._animating = true;
      if (!state && this._getState()) {
        this.domNode.classList.add('closing');
      } else {
        // Turn off animation to allow an immediate transform move to the
        // correct horizontal position. This is mainly for the benefit of the
        // New Messages state, where we want it centered, but it is a variable
        // width, and we want to use the left: 50%, transformX -50% trick.
        // However transformY is used for the sliding animation, so need to turn
        // that off while the horizontal story is straightened out.
        this.domNode.classList.add('no-anim');
        this.domNode.classList.toggle('horiz-message', state === 'message');
        this.domNode.classList.toggle('horiz-top', state === 'top');
        this.domNode.clientWidth;

        if (state === 'message') {
          mozL10n.setAttributes(this.domNode, 'new-messages',
                                { n: this._newEmailCount });
        } else if (state === 'top') {
          mozL10n.setAttributes(this.domNode, 'message-list-top-action');
        }

        // Release the animation hounds!
        this.domNode.classList.remove('no-anim');
        this.domNode.clientWidth;
        this.domNode.dataset.state = state;
      }
    },

    _onTransitionEnd: function(evt) {
      this._animating = false;

      if (this.domNode.classList.contains('closing')) {
        this.domNode.classList.remove('closing');
        this.domNode.dataset.state = '';
        this.domNode.style.left = '';
      }

      if (this._delayedState) {
        this._animateState(this._delayedState);
        this._delayedState = null;
      }
    },

    _onScroll: function(evt) {
      if (!this._topThreshold) {
        var rect = this._scrollContainer.getBoundingClientRect();
        this._topThreshold = rect.height * this._thresholdMultiplier;
        this.domNode.style.top = rect.top + 'px';
      }

      // If the vscroll component just recently set the scrollTop of its
      // container, then do not bother with detecting scroll and showing then
      // top action.
      if (this._vScroll.lastScrollTopSetTime &&
          (this._vScroll.lastScrollTopSetTime + 500 > Date.now())) {
        return;
      }

      var scrollTop = this._scrollContainer.scrollTop,
          scrollingDown = scrollTop > this._scrollTop,
          nodeState = this._getState();

      // Do not bother if scroll values are the same, nothing has changed.
      // Ideally the values would never be the same, but at least on the flame,
      // it was possible to get two sequential scroll events with the same
      // value.
      if (scrollTop !== this._scrollTop) {
        if (scrollTop <= this.visibleOffset) {
          this._showState('');
        } else if (scrollingDown) {
          this._showState('');
        } else if (nodeState !== 'top' && scrollTop > this._topThreshold) {
          this._showState('top');
        }
      }

      this._scrollTop = scrollTop;
    },

    _onClick: function(evt) {
      if (this._vScroll) {
        this._vScroll.jumpToIndex(0);
        this._showState('');
      }
    }
  };

  // return document.registerElement(module.id.replace(/_/g, '-'), {
  //   prototype: proto
  // });

  function MessageListTopBar(domNode) {
    this.domNode = domNode;
    this.createdCallback();
  }

  MessageListTopBar.prototype = proto;

  return MessageListTopBar;
});



(function(exports) {

  var AccessibilityHelper = {
    /**
     * For a set of tab elements, set aria-selected attribute in accordance with
     * the current selection.
     * @param {Object} selectedTab a tab to select object.
     * @param {Array} tabs an array of tabs.
     */
    setAriaSelected: function ah_setAriaSelected(selectedTab, tabs) {
      // In case tabs is a NodeList, that does not have forEach.
      Array.prototype.forEach.call(tabs, function setAriaSelectedAttr(tab) {
        tab.setAttribute('aria-selected',
          tab === selectedTab ? 'true' : 'false');
      });
    }
  };

  exports.AccessibilityHelper = AccessibilityHelper;

})(window);

define("shared/js/accessibility_helper", (function (global) {
    return function () {
        var ret, fn;
        return ret || global.AccessibilityHelper;
    };
}(this)));



/**
 * Helpers for displaying information about email messages.
 */
define('message_display',['require','l10n!'],function(require) {
  var mozL10n = require('l10n!');

  return {
    /**
     * Format the message subject appropriately.  This means ensuring that
     * if the subject is empty, we use a placeholder string instead.
     *
     * @param {DOMElement} subjectNode the DOM node for the message's
     * subject.
     * @param {Object} message the message object.
     */
    subject: function(subjectNode, message) {
      var subject = message.subject && message.subject.trim();
      if (subject) {
        subjectNode.textContent = subject;
        subjectNode.classList.remove('msg-no-subject');
        subjectNode.removeAttribute('data-l10n-id');
      }
      else {
        mozL10n.setAttributes(subjectNode, 'message-no-subject');
        subjectNode.classList.add('msg-no-subject');
      }
    }
  };
});

define('template!cards/message_list.html',['template'], function(template) { return {
createdCallback: template.templateCreatedCallback,
template: template.objToFn({"id":"cards/message_list.html","deps":[],"text":"<!-- Non-search header -->\n<section data-prop=\"normalHeader\"\n         class=\"msg-list-header msg-nonsearch-only\"\n         data-statuscolor=\"default\"\n         role=\"region\">\n  <header>\n    <!-- Unlike a generic back button that navigates to a different screen,\n       folder list header button triggers the folders and settings overlay. Thus\n       the screen reader user requires more context as to what activating the\n       button would do. -->\n    <a href=\"#\" class=\"msg-folder-list-btn\" data-event=\"click:onShowFolders\"\n       aria-expanded=\"false\" aria-controls=\"cards-folder-picker\"\n       role=\"button\" data-l10n-id=\"message-list-menu\">\n      <span class=\"icon icon-menu\"></span>\n    </a>\n    <menu data-prop=\"headerMenuNode\" type=\"toolbar\" class=\"anim-opacity\">\n      <a href=\"#\" class=\"msg-compose-btn\" data-event=\"click:onCompose\"\n         data-l10n-id=\"message-list-compose\">\n        <span class=\"icon icon-compose\"></span>\n      </a>\n    </menu>\n    <h1 data-prop=\"folderLabel\"\n        class=\"msg-list-header-folder-label header-label\">\n      <span data-prop=\"folderNameNode\"\n            dir=\"auto\"\n            class=\"msg-list-header-folder-name\"></span>\n      <span data-prop=\"folderUnread\"\n            class=\"msg-list-header-folder-unread collapsed\"></span>\n      </h1>\n  </header>\n</section>\n<!-- Multi-edit state header -->\n<section data-prop=\"editHeader\"\n         class=\"msg-listedit-header collapsed\" role=\"region\">\n  <header>\n    <a href=\"#\" data-event=\"click:setEditModeDone\"\n       class=\"msg-listedit-cancel-btn\" role=\"button\"\n       data-l10n-id=\"close-button\">\n      <span class=\"icon icon-close\"></span>\n    </a>\n    <h1 data-prop=\"headerNode\" class=\"msg-listedit-header-label\">\n    </h1>\n  </header>\n</section>\n<!-- Search header -->\n<section role=\"region\" data-prop=\"searchHeader\"\n         class=\"msg-search-header msg-search-only\">\n  <form role=\"search\" data-event=\"submit:onSearchSubmit\">\n    <button data-event=\"click:onCancelSearch\"\n            class=\"msg-search-cancel\" type=\"submit\"\n            data-l10n-id=\"message-search-cancel\"></button>\n    <p>\n      <input data-prop=\"searchInput\" data-event=\"input:onSearchTextChange\"\n             type=\"text\" required=\"required\" class=\"msg-search-text\"\n             autocorrect=\"off\"\n             inputmode=\"verbatim\"\n             x-inputmode=\"verbatim\"\n             dir=\"auto\"\n             data-l10n-id=\"message-search-input\" />\n      <button type=\"reset\" data-l10n-id=\"form-clear-input\" data-event=\"click:onClearSearch\"></button>\n    </p>\n  </form>\n  <!-- Search filter switcher -->\n  <header class=\"msg-search-controls-bar\">\n    <ul role=\"tablist\" class=\"bb-tablist filter\" data-type=\"filter\">\n      <li role=\"presentation\" class=\"msg-search-from msg-search-filter\"\n          data-filter=\"author\">\n        <a data-l10n-id=\"message-search-from\" role=\"tab\"\n          aria-selected=\"false\"></a></li>\n      <li role=\"presentation\" class=\"msg-search-to msg-search-filter\"\n          data-filter=\"recipients\">\n        <a data-l10n-id=\"message-search-to\" role=\"tab\"\n          aria-selected=\"false\"></a></li>\n      <li role=\"presentation\" class=\"msg-search-subject msg-search-filter\"\n           data-filter=\"subject\">\n        <a data-l10n-id=\"message-search-subject\" role=\"tab\"\n          aria-selected=\"false\"></a>\n      </li>\n      <li role=\"presentation\" class=\"msg-search-body msg-search-filter\"\n           data-filter=\"body\">\n        <a data-l10n-id=\"message-search-body\" role=\"tab\"\n          aria-selected=\"false\"></a></li>\n      <li role=\"presentation\" class=\"msg-search-body msg-search-filter\"\n          data-filter=\"all\">\n        <a data-l10n-id=\"message-search-all\" role=\"tab\"\n          aria-selected=\"true\"></a></li>\n    </ul>\n  </header>\n</section>\n<!-- Scroll region -->\n<div data-prop=\"scrollContainer\" class=\"msg-list-scrollouter\">\n  <!-- exists so we can force a minimum height -->\n  <div class=\"msg-list-scrollinner\">\n    <!-- The search textbox hides under the lip of the messages.\n         As soon as any typing happens in it, we push the search\n         controls card. -->\n    <form role=\"search\" data-prop=\"searchBar\"\n          class=\"msg-search-tease-bar msg-nonsearch-only\">\n      <p>\n        <input data-event=\"focus:onSearchButton\"\n               class=\"msg-search-text-tease\" type=\"text\"\n               dir=\"auto\"\n               data-l10n-id=\"message-search-input\" />\n      </p>\n    </form>\n    <div data-prop=\"messagesContainer\" class=\"msg-messages-container\"\n         role=\"listbox\" aria-multiselectable=\"true\">\n    </div>\n    <!-- maintain vertical space for the syncing/sync more div's\n         regardless of their displayed status so we don't scroll them\n         out of the way -->\n    <div class=\"msg-messages-sync-container\">\n      <p data-prop=\"syncingNode\" class=\"msg-messages-syncing collapsed\">\n        <span data-l10n-id=\"messages-syncing\"></span>\n      </p>\n      <p data-prop=\"syncMoreNode\"\n         data-event=\"click:onGetMoreMessages\"\n         class=\"msg-messages-sync-more collapsed\">\n        <span data-l10n-id=\"messages-load-more\"></span>\n      </p>\n    </div>\n  </div>\n</div>\n<!-- New email notification bar -->\n<div class=\"message-list-topbar\"></div>\n<!-- Conveys background send, plus undo-able recent actions -->\n<div class=\"msg-activity-infobar hidden\">\n</div>\n<!-- Toolbar for non-multi-edit state -->\n<ul data-prop=\"normalToolbar\" class=\"bb-tablist msg-list-action-toolbar\"\n    role=\"toolbar\">\n  <li role=\"presentation\" class=\"msg-nonsearch-only\">\n    <button data-prop=\"refreshBtn\" data-event=\"click:onRefresh\"\n            class=\"icon msg-refresh-btn\" data-state=\"synchronized\"\n            data-l10n-id=\"messages-refresh-button\">\n    </button>\n  </li>\n  <li role=\"status\" class=\"msg-nonsearch-only msg-last-sync\">\n    <span data-prop=\"lastSyncedLabel\"\n          class=\"msg-last-synced-label\"\n          data-l10n-id=\"folder-last-synced-label\"></span>\n    <span data-prop=\"lastSyncedAtNode\"\n          class=\"msg-last-synced-value\"></span>\n  </li>\n  <li role=\"presentation\">\n    <button data-prop=\"editBtn\" data-event=\"click:setEditModeStart\"\n            class=\"icon msg-edit-btn\" data-l10n-id=\"edit-button\"></button>\n  </li>\n</ul>\n\n<!-- Toolbar for multi-edit state -->\n<ul data-prop=\"editToolbar\"\n    class=\"bb-tablist msg-listedit-action-toolbar collapsed\"\n    role=\"toolbar\">\n  <li role=\"presentation\">\n    <button data-prop=\"deleteBtn\" data-event=\"click:onDeleteMessages\"\n            class=\"icon msg-delete-btn\"\n            data-l10n-id=\"message-delete-button\"></button>\n  </li>\n  <li role=\"presentation\">\n    <button data-prop=\"starBtn\" data-event=\"click:onStarMessages\"\n            class=\"icon msg-star-btn\"\n            data-l10n-id=\"message-star-button\"></button>\n  </li>\n  <li role=\"presentation\">\n    <button data-prop=\"readBtn\" data-event=\"click:onMarkMessagesRead\"\n            class=\"icon msg-mark-read-btn\"\n            data-l10n-id=\"message-mark-read-button\"></button>\n  </li>\n  <li role=\"presentation\">\n    <button data-prop=\"moveBtn\" data-event=\"click:onMoveMessages\"\n            class=\"icon msg-move-btn\"\n            data-l10n-id=\"message-move-button\"></button>\n  </li>\n</ul>\n\n<div data-prop=\"messageEmptyContainer\"\n     class=\"msg-list-empty-container collapsed\">\n  <p data-prop=\"messageEmptyText\"\n     class=\"msg-list-empty-message-text\"\n     data-l10n-id=\"messages-folder-empty\"></p>\n</div>\n"})}; });

/*jshint browser: true */
/*global define, console, FontSizeUtils, requestAnimationFrame */


define('cards/message_list',['require','exports','module','tmpl!./msg/header_item.html','tmpl!./msg/delete_confirm.html','tmpl!./msg/large_message_confirm.html','cards','confirm_dialog','date','evt','toaster','model','header_cursor','html_cache','l10n!','vscroll','message_list_topbar','shared/js/accessibility_helper','message_display','./base','template!./message_list.html'],function(require, exports, module) {

var msgHeaderItemNode = require('tmpl!./msg/header_item.html'),
    deleteConfirmMsgNode = require('tmpl!./msg/delete_confirm.html'),
    largeMsgConfirmMsgNode = require('tmpl!./msg/large_message_confirm.html'),
    cards = require('cards'),
    ConfirmDialog = require('confirm_dialog'),
    date = require('date'),
    evt = require('evt'),
    toaster = require('toaster'),
    model = require('model'),
    headerCursor = require('header_cursor').cursor,
    htmlCache = require('html_cache'),
    mozL10n = require('l10n!'),
    VScroll = require('vscroll'),
    MessageListTopBar = require('message_list_topbar'),
    accessibilityHelper = require('shared/js/accessibility_helper'),
    messageDisplay = require('message_display');


var MATCHED_TEXT_CLASS = 'highlight';

function appendMatchItemTo(matchItem, node) {
  var text = matchItem.text;
  var idx = 0;
  for (var iRun = 0; iRun <= matchItem.matchRuns.length; iRun++) {
    var run;
    if (iRun === matchItem.matchRuns.length) {
      run = { start: text.length, length: 0 };
    } else {
      run = matchItem.matchRuns[iRun];
    }

    // generate the un-highlighted span
    if (run.start > idx) {
      var tnode = document.createTextNode(text.substring(idx, run.start));
      node.appendChild(tnode);
    }

    if (!run.length) {
      continue;
    }
    var hspan = document.createElement('span');
    hspan.classList.add(MATCHED_TEXT_CLASS);
    hspan.textContent = text.substr(run.start, run.length);
    node.appendChild(hspan);
    idx = run.start + run.length;
  }
}

// Default data used for the VScroll component, when data is not
// loaded yet for display in the virtual scroll listing.
var defaultVScrollData = {
  'isPlaceholderData': true,
  'id': 'INVALID',
  'author': {
    'name': '\u2583\u2583\u2583\u2583\u2583\u2583\u2583\u2583',
    'address': '',
    'contactId': null
  },
  'to': [
    {
      'name': ' ',
      'address': ' ',
      'contactId': null
    }
  ],
  'cc': null,
  'bcc': null,
  'date': '0',
  'hasAttachments': false,
  'snippet': '\u2583\u2583\u2583\u2583\u2583\u2583\u2583\u2583' +
             '\u2583\u2583\u2583\u2583\u2583\u2583\u2583\u2583' +
             '\u2583\u2583\u2583\u2583\u2583\u2583\u2583\u2583',
  'isRead': true,
  'isStarred': false,
  'sendStatus': {},
  'subject': '\u2583\u2583\u2583\u2583\u2583\u2583\u2583\u2583' +
             '\u2583\u2583\u2583\u2583\u2583\u2583\u2583\u2583' +
             '\u2583\u2583\u2583\u2583\u2583\u2583\u2583\u2583'
};

// We will display this loading data for any messages we are
// pretending exist so that the UI has a reason to poke the search
// slice to do more work.
var defaultSearchVScrollData = {
  header: defaultVScrollData,
  matches: []
};

/**
 * Minimum number of items there must be in the message slice
 * for us to attempt to limit the selection of snippets to fetch.
 */
var MINIMUM_ITEMS_FOR_SCROLL_CALC = 10;

/**
 * Maximum amount of time between issuing snippet requests.
 */
var MAXIMUM_MS_BETWEEN_SNIPPET_REQUEST = 6000;

/**
 * Fetch up to 4kb while scrolling
 */
var MAXIMUM_BYTES_PER_MESSAGE_DURING_SCROLL = 4 * 1024;

/**
 * List messages for listing the contents of folders ('nonsearch' mode) and
 * searches ('search' mode).  Multi-editing is just a state of the card.
 *
 * Nonsearch and search modes exist together in the same card because so much
 * of what they do is the same.  We have the cards differ by marking nodes that
 * are not shared with 'msg-nonsearch-only' or 'msg-search-only'.  We add the
 * collapsed class to all of the nodes that are not applicable for a node at
 * startup.
 *
 * == Cache behavior ==
 *
 * This is a card that can be instantiated using the cached HTML stored by the
 * html_cache. As such, it is constructed to allow clicks on message list items
 * before the back end has loaded up, and to know how to refresh the cached
 * state by looking at the use the usingCachedNode property. It also prevents
 * clicks from button actions that need back end data to complete if the click
 * would result in a card that cannot also handle delayed back end startup.
 * It tracks if the back end has started up by checking curFolder, which is
 * set to a data object sent from the back end.
 *
 * == Less-than-infinite scrolling ==
 *
 * A dream UI would be to let the user smoothly scroll through all of the
 * messages in a folder, syncing them from the server as-needed.  The limits
 * on this are 1) bandwidth cost, and 2) storage limitations.
 *
 * Our sync costs are A) initial sync of a time range, and B) update sync of a
 * time range.  #A is sufficiently expensive that it makes sense to prompt the
 * user when we are going to sync further into a time range.  #B is cheap
 * enough and having already synced the time range suggests sufficient user
 * interest.
 *
 * So the way our UI works is that we do an infinite-scroll-type thing for
 * messages that we already know about.  If we are on metered bandwidth, then
 * we require the user to click a button in the display list to sync more
 * messages.  If we are on unmetered bandwidth, we will eventually forego that.
 * (For testing purposes right now, we want to pretend everything is metered.)
 * We might still want to display a button at some storage threshold level,
 * like if the folder is already using a lot of space.
 *
 * See `onScroll` for more details.
 *
 * XXX this class wants to be cleaned up, badly.  A lot of this may want to
 * happen via pushing more of the hiding/showing logic out onto CSS, taking
 * care to use efficient selectors.
 *
 */
return [
  require('./base')(require('template!./message_list.html')),
  {
    createdCallback: function() {
      var mode = this.mode;

      if (mode === 'nonsearch') {
        this.batchAddClass('msg-search-only', 'collapsed');
      } else {
        this.batchAddClass('msg-nonsearch-only', 'collapsed');
        // Favor the use of the card background color for the status bar instead
        // of the default color.
        this.dataset.statuscolor = 'background';
      }

      this.bindContainerHandler(this.messagesContainer, 'click',
                                this.onClickMessage.bind(this));
      // Sync display
      this._needsSizeLastSync = true;
      this.updateLastSynced();

      // -- search mode
      if (mode === 'search') {
        this.bindContainerHandler(
          this.querySelector('.filter'),
          'click', this.onSearchFilterClick.bind(this));
        this.searchFilterTabs = this.querySelectorAll('.filter [role="tab"]');
      }

      this.editMode = false;
      this.selectedMessages = null;
      this.isFirstTimeVisible = true;

      this.curFolder = null;
      this.isIncomingFolder = true;
      this._emittedContentEvents = false;

      this.usingCachedNode = this.dataset.cached === 'cached';

      // Set up the list data source for VScroll
      var listFunc = (function(index) {
         return headerCursor.messagesSlice.items[index];
      }.bind(this));

      listFunc.size = function() {
        // This method could get called during VScroll updates triggered
        // by messages_splice. However at that point, the headerCount may
        // not be correct, like when fetching more messages from the
        // server. So approximate by using the size of slice.items.
        var slice = headerCursor.messagesSlice;
        // coerce headerCount to 0 if it was undefined to avoid a NaN
        return Math.max(slice.headerCount || 0, slice.items.length);
      };
      this.listFunc = listFunc;

      // We need to wait for the slice to complete before we can issue any
      // sensible growth requests.
      this.waitingOnChunk = true;
      this.desiredHighAbsoluteIndex = 0;
      this._needVScrollData = false;
      this.vScroll = new VScroll(
        this.messagesContainer,
        this.scrollContainer,
        msgHeaderItemNode,
        (this.mode === 'nonsearch' ?
                       defaultVScrollData : defaultSearchVScrollData)
      );

      // Called by VScroll wants to bind some data to a node it wants to
      // display in the DOM.
      if (this.mode === 'nonsearch') {
        this.vScroll.bindData = (function bindNonSearch(model, node) {
          model.element = node;
          node.message = model;
          this.updateMessageDom(true, model);
        }).bind(this);
      } else {
        this.vScroll.bindData = (function bindSearch(model, node) {
          model.element = node;
          node.message = model.header;
          this.updateMatchedMessageDom(true, model);
        }).bind(this);
      }

      // Called by VScroll when it detects it will need more data in the near
      // future. VScroll does not know if it already asked for this information,
      // so this function needs to be sure it actually needs to ask for more
      // from the back end.
      this.vScroll.prepareData = (function(highAbsoluteIndex) {
        var items = headerCursor.messagesSlice &&
                    headerCursor.messagesSlice.items,
            headerCount = headerCursor.messagesSlice.headerCount;

        if (!items || !headerCount) {
          return;
        }

        // Make sure total amount stays within possible range.
        if (highAbsoluteIndex > headerCount - 1) {
          highAbsoluteIndex = headerCount - 1;
        }

        // We're already prepared if the slice is already that big.
        if (highAbsoluteIndex < items.length) {
          return;
        }

        this.loadNextChunk(highAbsoluteIndex);
      }.bind(this));

      this._hideSearchBoxByScrolling =
                                      this._hideSearchBoxByScrolling.bind(this);
      this._onVScrollStopped = this._onVScrollStopped.bind(this);

      // Event listeners for VScroll events.
      this.vScroll.on('inited', this._hideSearchBoxByScrolling);
      this.vScroll.on('dataChanged', this._hideSearchBoxByScrolling);
      this.vScroll.on('scrollStopped', this._onVScrollStopped);
      this.vScroll.on('recalculated', function(calledFromTop) {
        if (calledFromTop) {
          this._hideSearchBoxByScrolling();
        }
      }.bind(this));

      this._topBar = new MessageListTopBar(
        this.querySelector('.message-list-topbar')
      );
      this._topBar.bindToElements(this.scrollContainer, this.vScroll);

      // Binding "this" to some functions as they are used for
      // event listeners.
      this._folderChanged = this._folderChanged.bind(this);
      this.onNewMail = this.onNewMail.bind(this);
      this.onFoldersSliceChange = this.onFoldersSliceChange.bind(this);
      this.messages_splice = this.messages_splice.bind(this);
      this.messages_change = this.messages_change.bind(this);
      this.messages_status = this.messages_status.bind(this);
      this.messages_complete = this.messages_complete.bind(this);

      this.onFolderPickerClosing = this.onFolderPickerClosing.bind(this);
      evt.on('folderPickerClosing', this.onFolderPickerClosing);

      model.latest('folder', this._folderChanged);
      model.on('newInboxMessages', this.onNewMail);
      model.on('backgroundSendStatus', this.onBackgroundSendStatus.bind(this));

      model.on('foldersSliceOnChange', this.onFoldersSliceChange);

      this.sliceEvents.forEach(function(type) {
        var name = 'messages_' + type;
        headerCursor.on(name, this[name]);
      }.bind(this));

      this.onCurrentMessage = this.onCurrentMessage.bind(this);
      headerCursor.on('currentMessage', this.onCurrentMessage);

      // If this card is created after header_cursor is set up
      // with a messagesSlice, then need to bootstrap this card
      // to catch up, since the normal events will not fire.
      // Common scenarios for this case are: going back to the
      // message list after reading a message from a notification,
      // or from a compose triggered from an activity. However,
      // only do this if there is a current folder. A case
      // where there is not a folder: after deleting an account,
      // and the UI is bootstrapping back to existing account.
      // Also, search pushes a new message_list card, but search
      // needs a special slice, created only when the search
      // actually starts. So do not bootstrap in that case.
      if (this.curFolder && this.mode === 'nonsearch') {
        var items = headerCursor.messagesSlice &&
                    headerCursor.messagesSlice.items;
        if (items && items.length) {
          this.messages_splice(0, 0, items);
          this.messages_complete(0);
        }
      }
    },

    // Hack to get separate modules for search vs non-search, but
    // eventually the search branches in this file should be moved
    // to message_list_search
    mode: 'nonsearch',

    /**
     * @type {MessageListTopbar}
     * @private
     */
    _topBar: null,

    /**
     * Cache the distance between messages since rows are effectively fixed
     * height.
     */
    _distanceBetweenMessages: 0,

    sliceEvents: ['splice', 'change', 'status', 'complete'],

    toolbarEditButtonNames:['starBtn', 'readBtn', 'deleteBtn', 'moveBtn'],

    /**
     * Inform Cards to not emit startup content events, this card will trigger
     * them once data from back end has been received and the DOM is up to date
     * with that data.
     * @type {Boolean}
     */
    skipEmitContentEvents: true,

    postInsert: function() {
      this._hideSearchBoxByScrolling();

      // Now that _hideSearchBoxByScrolling has activated the display
      // of the search box, get the height of the search box and tell
      // vScroll about it, but only do this once the DOM is displayed
      // so the ClientRect gives an actual height.
      this.vScroll.visibleOffset =
                                  this.searchBar.getBoundingClientRect().height;

      // Also tell the MessageListTopBar
      this._topBar.visibleOffset = this.vScroll.visibleOffset;

      // For search we want to make sure that we capture the screen size prior
      // to focusing the input since the FxOS keyboard will resize our window to
      // be smaller which messes up our logic a bit.  We trigger metric
      // gathering in non-search cases too for consistency.
      this.vScroll.captureScreenMetrics();
    },

    onSearchButton: function() {
      // Do not bother if there is no current folder.
      if (!this.curFolder) {
        return;
      }

      cards.pushCard(
        'message_list_search', 'animate',
        {
          folder: this.curFolder
        });
    },

    setEditMode: function(editMode) {
      // Do not bother if this is triggered before
      // a folder has loaded.
      if (!this.curFolder) {
        return;
      }

      if (this.curFolder.type === 'outbox') {
        // You cannot edit the outbox messages if the outbox is syncing.
        if (editMode && this.outboxSyncInProgress) {
          return;
        }

        // Outbox Sync and Edit Mode are mutually exclusive. Disable
        // outbox syncing before allowing us to enter edit mode, and
        // vice versa. The callback shouldn't take long, but we wait to
        // trigger edit mode until outbox sync has been fully disabled,
        // to prevent ugly theoretical race conditions.
        model.api.setOutboxSyncEnabled(model.account, !editMode, function() {
          this._setEditMode(editMode);
        }.bind(this));
      } else {
        this._setEditMode(editMode);
      }
    },

    // This function is called from setEditMode() after ensuring that
    // the backend is in a state where we can safely use edit mode.
    _setEditMode: function(editMode) {
      var i;

      this.editMode = editMode;

      // XXX the manual DOM play here is now a bit overkill; we should very
      // probably switch top having the CSS do this for us or at least invest
      // some time in cleanup.
      if (editMode) {
        this.normalHeader.classList.add('collapsed');
        this.searchHeader.classList.add('collapsed');
        this.normalToolbar.classList.add('collapsed');
        this.editHeader.classList.remove('collapsed');
        this.editToolbar.classList.remove('collapsed');
        this.messagesContainer.classList.add('show-edit');

        this.selectedMessages = [];
        this.selectedMessagesUpdated();
      }
      else {
        if (this.mode === 'nonsearch') {
          this.normalHeader.classList.remove('collapsed');
        } else {
          this.searchHeader.classList.remove('collapsed');
        }
        this.normalToolbar.classList.remove('collapsed');
        this.editHeader.classList.add('collapsed');
        this.editToolbar.classList.add('collapsed');
        this.messagesContainer.classList.remove('show-edit');

        this.selectedMessages = null;
      }

      // Reset checked mode for all message items.
      var msgNodes = this.messagesContainer.querySelectorAll(
        '.msg-header-item');
      for (i = 0; i < msgNodes.length; i++) {
        this.setMessageChecked(msgNodes[i], false);
      }

      // UXXX do we want to disable the buttons if nothing is selected?
    },

    // Event handler wired up in HTML template
    setEditModeStart: function() {
      this.setEditMode(true);
    },

    // Event handler wired up in HTML template
    setEditModeDone: function() {
      this.setEditMode(false);
    },

    /**
     * Update the edit mode UI bits sensitive to a change in the set of selected
     * messages.  This means the label that says how many messages are selected,
     * whether the buttons are enabled, which of the toggle-pairs are visible.
     */
    selectedMessagesUpdated: function() {
      mozL10n.setAttributes(this.headerNode, 'message-multiedit-header',
                            { n: this.selectedMessages.length });

      var hasMessages = !!this.selectedMessages.length;

      // Enabling/disabling rules (not UX-signed-off):  Our bias is that people
      // want to star messages and mark messages unread (since it they naturally
      // end up unread), so unless messages are all in this state, we assume
      // that is the desired action.
      var numStarred = 0, numRead = 0;
      for (var i = 0; i < this.selectedMessages.length; i++) {
        var msg = this.selectedMessages[i];
        if (msg.isStarred) {
          numStarred++;
        }
        if (msg.isRead) {
          numRead++;
        }
      }

      // Unstar if everything is starred, otherwise star
      this.setAsStarred = !(numStarred && numStarred ===
                            this.selectedMessages.length);
      mozL10n.setAttributes(this.starBtn,
        this.setAsStarred ? 'message-star-button' : 'message-unstar-button');

      // Mark read if everything is unread, otherwise unread
      this.setAsRead = (hasMessages && numRead === 0);

      // Update mark read/unread button to show what action will be taken.
      this.readBtn.classList.toggle('unread', numRead > 0);
      mozL10n.setAttributes(this.readBtn, numRead > 0 ?
        'message-mark-unread-button' : 'message-mark-read-button');

      // Update disabled state based on if there are selected messages
      this.toolbarEditButtonNames.forEach(function(key) {
        this[key].disabled = !hasMessages;
      }.bind(this));
    },

    _hideSearchBoxByScrolling: function() {
      // scroll the search bit out of the way
      var searchBar = this.searchBar,
          scrollContainer = this.scrollContainer;

      // Search bar could have been collapsed with a cache load,
      // make sure it is visible, but if so, adjust the scroll
      // position in case the user has scrolled before this code
      // runs.
      if (searchBar.classList.contains('collapsed')) {
        searchBar.classList.remove('collapsed');
        scrollContainer.scrollTop += searchBar.offsetHeight;
      }

      // Adjust scroll position now that there is something new in
      // the scroll region, but only if at the top. Otherwise, the
      // user's purpose scroll positioning may be disrupted.
      //
      // Note that when we call this.vScroll.clearDisplay() we
      // inherently scroll back up to the top, so this check is still
      // okay even when switching folders.  (We do not want to start
      // index 50 in our new folder because we were at index 50 in our
      // old folder.)
      if (scrollContainer.scrollTop === 0) {
        scrollContainer.scrollTop = searchBar.offsetHeight;
      }
    },

    onShowFolders: function() {
      cards.pushCard('folder_picker', 'immediate', {
        onPushed: function() {
          this.headerMenuNode.classList.add('transparent');
        }.bind(this)
      });
    },

    onCompose: function() {
      cards.pushCard('compose', 'animate');
    },

    /**
     * If the last synchronised label is more than half the length
     * of its display area, set a "long" style on it that allows
     * different styling. But only do this once per card instance,
     * the label should not change otherwise.
     * TODO though, once locale changing in app is supported, this
     * should be revisited.
     */
    sizeLastSync: function() {
      if (this._needsSizeLastSync && this.lastSyncedLabel.scrollWidth) {
        var label = this.lastSyncedLabel;
        var overHalf = label.scrollWidth > label.parentNode.clientWidth / 2;
        label.parentNode.classList[(overHalf ? 'add' : 'remove')]('long');
        this._needsSizeLastSync = false;
      }
    },

    updateLastSynced: function(value) {
      var method = value ? 'remove' : 'add';
      this.lastSyncedLabel.classList[method]('collapsed');
      date.setPrettyNodeDate(this.lastSyncedAtNode, value);
      this.sizeLastSync();
    },

    updateUnread: function(num) {
      var content = '';
      if (num > 0) {
        content = num > 999 ? mozL10n.get('messages-folder-unread-max') : num;
      }

      this.folderUnread.textContent = content;
      this.folderUnread.classList.toggle('collapsed', !content);
      this.callHeaderFontSize();
    },

    onFoldersSliceChange: function(folder) {
      if (folder === this.curFolder) {
        this.updateUnread(folder.unread);
        this.updateLastSynced(folder.lastSyncedAt);
      }
    },

    /**
     * A workaround for shared/js/font_size_utils not recognizing child node
     * content changing, and if it did, it would be noisy/extra work if done
     * generically. Using a rAF call to not slow down the rest of card updates,
     * it is something that can happen lazily on another turn.
     */
    callHeaderFontSize: function(node) {
      requestAnimationFrame(function() {
        FontSizeUtils._reformatHeaderText(this.folderLabel);
      }.bind(this));
    },

    /**
     * Show a folder, returning true if we actually changed folders or false if
     * we did nothing because we were already in the folder.
     */
    showFolder: function(folder, forceNewSlice) {
      if (folder === this.curFolder && !forceNewSlice) {
        return false;
      }

      // If using a cache, do not clear the HTML as it will
      // be cleared once real data has been fetched.
      if (!this.usingCachedNode) {
        // This inherently scrolls us back up to the top of the list.
        this.vScroll.clearDisplay();
      }
      this._needVScrollData = true;

      this.curFolder = folder;

      switch (folder.type) {
        case 'drafts':
        case 'localdrafts':
        case 'outbox':
        case 'sent':
          this.isIncomingFolder = false;
          break;
        default:
          this.isIncomingFolder = true;
          break;
      }

      this.folderNameNode.textContent = folder.name;
      this.updateUnread(folder.unread);
      this.messagesContainer.setAttribute('aria-label', folder.name);
      this.hideEmptyLayout();

      // You can't refresh messages in the localdrafts folder.
      this.refreshBtn.classList.toggle('collapsed',
                                               folder.type === 'localdrafts');
      // You can't move messages in localdrafts or the outbox.
      this.moveBtn.classList.toggle('collapsed',
                                            folder.type === 'localdrafts' ||
                                            folder.type === 'outbox');
      // You can't flag or change the read status of messages in the outbox.
      this.starBtn.classList.toggle('collapsed',
                                            folder.type === 'outbox');
      this.readBtn.classList.toggle('collapsed',
                                            folder.type === 'outbox');

      this.updateLastSynced(folder.lastSyncedAt);

      if (forceNewSlice) {
        // We are creating a new slice, so any pending snippet requests are
        // moot.
        this._snippetRequestPending = false;
        headerCursor.freshMessagesSlice();
      }

      this.onFolderShown();

      return true;
    },

    showSearch: function(phrase, filter) {
      console.log('sf: showSearch. phrase:', phrase, phrase.length);

      this.curFolder = model.folder;
      this.vScroll.clearDisplay();
      this.curPhrase = phrase;
      this.curFilter = filter;

      // We are creating a new slice, so any pending snippet requests are moot.
      this._snippetRequestPending = false;
      // Don't bother the new slice with requests until we hears it completion
      // event.
      this.waitingOnChunk = true;
      headerCursor.startSearch(phrase, {
        author: filter === 'all' || filter === 'author',
        recipients: filter === 'all' || filter === 'recipients',
        subject: filter === 'all' || filter === 'subject',
        body: filter === 'all' || filter === 'body'
      });

      return true;
    },

    onSearchFilterClick: function(filterNode, event) {
      accessibilityHelper.setAriaSelected(filterNode.firstElementChild,
        this.searchFilterTabs);
      this.showSearch(this.searchInput.value, filterNode.dataset.filter);
    },

    onSearchTextChange: function(event) {
      console.log('sf: typed, now:', this.searchInput.value);
      this.showSearch(this.searchInput.value, this.curFilter);
    },

    onSearchSubmit: function(event) {
      // Not a real form to submit, so stop actual submission.
      event.preventDefault();

      // Blur the focus away from the text input. This has the effect of hiding
      // the keyboard. This is useful for the two cases where this function is
      // currently triggered: Enter on the keyboard or Cancel on form submit.
      // Note that the Cancel button has a type="submit", which is technically
      // an incorrect use of that type. However the /shared styles depend on it
      // being marked as such for style reasons.
      this.searchInput.blur();
    },

    onCancelSearch: function(event) {
      // Only care about real clicks on actual button, not fake ones triggered
      // by a form submit from the Enter button on the keyboard.
      // Note: the cancel button should not really be a type="submit", but it is
      // that way because the /shared styles for this search form wants to see
      // a submit. Longer term this should be changed in the /shared components.
      // This event test is used because in form submit cases, the
      // explicitOriginalTarget (the text input) is not the same as the target
      // (the button).
      if (event.explicitOriginalTarget !== event.target) {
        return;
      }

      try {
        headerCursor.endSearch();
      }
      catch (ex) {
        console.error('problem killing slice:', ex, '\n', ex.stack);
      }
      cards.removeCardAndSuccessors(this, 'animate');
    },

    onClearSearch: function() {
      this.showSearch('', this.curFilter);
    },

    onGetMoreMessages: function() {
      if (!headerCursor.messagesSlice) {
        return;
      }

      headerCursor.messagesSlice.requestGrowth(1, true);
    },

    /**
     * Set the refresh button state based on the new message status.
     */
    setRefreshState: function(syncing) {
      if (syncing) {
          this.refreshBtn.dataset.state = 'synchronizing';
          this.refreshBtn.setAttribute('role', 'progressbar');
          mozL10n.setAttributes(this.refreshBtn, 'messages-refresh-progress');
      } else {
        this.refreshBtn.dataset.state = 'synchronized';
        this.refreshBtn.removeAttribute('role');
        mozL10n.setAttributes(this.refreshBtn, 'messages-refresh-button');
      }
    },

    // The funny name because it is auto-bound as a listener for
    // messagesSlice events in headerCursor using a naming convention.
    messages_status: function(newStatus) {
      if (headerCursor.searchMode !== this.mode) {
        return;
      }

      // The outbox's refresh button is used for sending messages, so we
      // ignore any syncing events generated by the slice. The outbox
      // doesn't need to show many of these indicators (like the "Load
      // More Messages..." node, etc.) and it has its own special
      // "refreshing" display, as documented elsewhere in this file.
      if (this.curFolder.type === 'outbox') {
        return;
      }

      if (newStatus === 'synchronizing' ||
         newStatus === 'syncblocked') {
          this.syncingNode.classList.remove('collapsed');
          this.syncMoreNode.classList.add('collapsed');
          this.hideEmptyLayout();
          this.setRefreshState(true);
      } else if (newStatus === 'syncfailed' ||
                 newStatus === 'synced') {
        if (newStatus === 'syncfailed') {
          // If there was a problem talking to the server, notify the user and
          // provide a means to attempt to talk to the server again.  We have
          // made onRefresh pretty clever, so it can do all the legwork on
          // accomplishing this goal.
          toaster.toast({
            text: mozL10n.get('toaster-retryable-syncfailed')
          });
        }
        this.setRefreshState(false);
        this.syncingNode.classList.add('collapsed');
        this._manuallyTriggeredSync = false;
      }
    },

    isEmpty: function() {
      return headerCursor.messagesSlice.items.length === 0;
    },

    /**
     * Hide buttons that are not appropriate if we have no messages and display
     * the appropriate l10n string in the message list proper.
     */
    showEmptyLayout: function() {
      this._clearCachedMessages();

      mozL10n.setAttributes(
        this.messageEmptyText,
        (this.mode === 'search') ? 'messages-search-empty' :
                                   'messages-folder-empty');
      this.messageEmptyContainer.classList.remove('collapsed');

      this.editBtn.disabled = true;

      // The outbox can't refresh anything if there are no messages.
      if (this.curFolder.type === 'outbox') {
        this.refreshBtn.disabled = true;
      }

      this._hideSearchBoxByScrolling();
    },
    /**
     * Show buttons we hid in `showEmptyLayout` and hide the "empty folder"
     * message.
     */
    hideEmptyLayout: function() {
      this.messageEmptyContainer.classList.add('collapsed');
      this.editBtn.disabled = false;
      this.refreshBtn.disabled = false;
    },


    /**
     * @param {number=} newEmailCount Optional number of new messages.
     * The funny name because it is auto-bound as a listener for
     * messagesSlice events in headerCursor using a naming convention.
     */
    messages_complete: function(newEmailCount) {
      if (headerCursor.searchMode !== this.mode) {
        return;
      }

      console.log('message_list complete:',
                  headerCursor.messagesSlice.items.length, 'items of',
                  headerCursor.messagesSlice.headerCount,
                  'alleged known headers. canGrow:',
                  headerCursor.messagesSlice.userCanGrowDownwards);

    // Show "load more", but only if the slice can grow and if there is a
    // non-zero headerCount. If zero headerCount, it likely means the folder
    // has never been synchronized, and this display was an offline display,
    // so it is hard to know if messages can be synchronized. In this case,
    // canGrow is not enough of an indicator, because as far as the back end is
    // concerned, it could grow, it just has no way to check for sure yet. So
    // hide the "load more", the user can use the refresh icon once online to
    // load messages.
    if (headerCursor.messagesSlice.userCanGrowDownwards &&
        headerCursor.messagesSlice.headerCount) {
        this.syncMoreNode.classList.remove('collapsed');
      } else {
        this.syncMoreNode.classList.add('collapsed');
      }

      // Show empty layout, unless this is a slice with fake data that
      // will get changed soon.
      if (headerCursor.messagesSlice.items.length === 0) {
        this.showEmptyLayout();
      }

      // Search does not trigger normal conditions for a folder changed,
      // so if vScroll is missing its data, set it up now.
      if (this.mode === 'search' && !this.vScroll.list) {
        this.vScroll.setData(this.listFunc);
      }

      this.onNewMail(newEmailCount);

      this.waitingOnChunk = false;
      // Load next chunk if one is pending
      if (this.desiredHighAbsoluteIndex) {
        this.loadNextChunk(this.desiredHighAbsoluteIndex);
        this.desiredHighAbsoluteIndex = 0;
      }

      // It's possible for a synchronization to result in a change to
      // headerCount without resulting in a splice.  This is very likely
      // to happen with a search filter when it was lying about another
      // messages existing, but it's also possible to happen in
      // synchronizations.
      //
      // XXX Our total correctness currently depends on headerCount only
      // changing as a result of a synchronization triggered by this slice.
      // This does not hold up when confronted with periodic background sync; we
      // need to finish cleanup up the headerCount change notification stuff.
      //
      // (However, this is acceptable glitchage right now.  We just need to make
      // sure it doesn't happen for searches since it's so blatant.)
      //
      // So, anyways, use updateDataBind() to cause VScroll to double-check that
      // our list size didn't change from what it thought it was.  (It renders
      // coordinate-space predictively based on our headerCount, but we
      // currently only provide strong correctness guarantees for actually
      // reported `items`, so we must do this.)  If our list size is the same,
      // this call is effectively a no-op.
      this.vScroll.updateDataBind(0, [], 0);


      // Inform that content is ready. There could actually be a small delay
      // with vScroll.updateDataBind from rendering the final display, but it is
      // small enough that it is not worth trying to break apart the design to
      // accommodate this metrics signal.
      if (!this._emittedContentEvents) {
        evt.emit('metrics:contentDone');
        this._emittedContentEvents = true;
      }
    },

    onNewMail: function(newEmailCount) {
      var inboxFolder = model.foldersSlice.getFirstFolderWithType('inbox');

      if (inboxFolder.id === this.curFolder.id &&
          newEmailCount && newEmailCount > 0) {
        if (!cards.isVisible(this)) {
          this._whenVisible = this.onNewMail.bind(this, newEmailCount);
          return;
        }

        // If the user manually synced, then want to jump to show the new
        // messages. Otherwise, show the top bar.
        if (this._manuallyTriggeredSync) {
          this.vScroll.jumpToIndex(0);
        } else {
          // Update the existing status bar.
          this._topBar.showNewEmailCount(newEmailCount);
        }
      }
    },

    // When an email is being sent from the app (and not from an outbox
    // refresh), we'll receive notification here. Play a sound and
    // raise a toast, if appropriate.
    onBackgroundSendStatus: function(data) {
      if (this.curFolder.type === 'outbox') {
        if (data.state === 'sending') {
          // If the message is now sending, make sure we're showing the
          // outbox as "currently being synchronized".
          this.toggleOutboxSyncingDisplay(true);
        } else if (data.state === 'syncDone') {
          this.toggleOutboxSyncingDisplay(false);
        }
      }

      if (data.emitNotifications) {
        toaster.toast({
          text: data.localizedDescription
        });
      }
    },

    /**
     * Waits for scrolling to stop before fetching snippets.
     */
    _onVScrollStopped: function() {
      // Give any pending requests in the slice priority.
      if (!headerCursor.messagesSlice ||
          headerCursor.messagesSlice.pendingRequestCount) {
        return;
      }

      // Do not bother fetching snippets if this card is not in view.
      // The card could still have a scroll event triggered though
      // by the next/previous work done in message_reader.
      if (cards.isVisible(this) && !this._hasSnippetRequest()) {
        this._requestSnippets();
      }
    },

    _hasSnippetRequest: function() {
      var max = MAXIMUM_MS_BETWEEN_SNIPPET_REQUEST;
      var now = Date.now();

      // if we before the maximum time to wait between requests...
      var beforeTimeout =
        (this._lastSnippetRequest + max) > now;

      // there is an important case where the backend may be slow OR have some
      // fatal error which would prevent us from ever requesting an new set of
      // snippets because we wait until the last batch finishes. To prevent that
      // from ever happening we maintain the request start time and if more then
      // MAXIMUM_MS_BETWEEN_SNIPPET_REQUEST passes we issue a new request.
      if (
        this._snippetRequestPending &&
        beforeTimeout
      ) {
        return true;
      }

      return false;
    },

    _pendingSnippetRequest: function() {
      this._snippetRequestPending = true;
      this._lastSnippetRequest = Date.now();
    },

    _clearSnippetRequest: function() {
      this._snippetRequestPending = false;
    },

    _requestSnippets: function() {
      var items = headerCursor.messagesSlice.items;
      var len = items.length;

      if (!len) {
        return;
      }

      var clearSnippets = this._clearSnippetRequest.bind(this);
      var options = {
        // this is per message
        maximumBytesToFetch: MAXIMUM_BYTES_PER_MESSAGE_DURING_SCROLL
      };

      if (len < MINIMUM_ITEMS_FOR_SCROLL_CALC) {
        this._pendingSnippetRequest();
        headerCursor.messagesSlice.maybeRequestBodies(0,
            MINIMUM_ITEMS_FOR_SCROLL_CALC - 1, options, clearSnippets);
        return;
      }

      var visibleIndices = this.vScroll.getVisibleIndexRange();

      if (visibleIndices) {
        this._pendingSnippetRequest();
        headerCursor.messagesSlice.maybeRequestBodies(
          visibleIndices[0],
          visibleIndices[1],
          options,
          clearSnippets
        );
      }
    },

    /**
     * How many items in the message list to keep for the _cacheDom call.
     * @type {Number}
     */
    _cacheListLimit: 7,

    /**
     * Tracks if a DOM cache save is scheduled for later.
     * @type {Number}
     */
    _cacheDomTimeoutId: 0,

    /**
     * Confirms card state is in a visual state suitable for caching.
     */
    _isCacheableCardState: function() {
      return this.cacheableFolderId === this.curFolder.id &&
             this.mode === 'nonsearch' &&
             !this.editMode;
    },

    /**
     * Caches the DOM for this card, but trims it down a bit first.
     */
    _cacheDom: function() {
      this._cacheDomTimeoutId = 0;
      if (!this._isCacheableCardState()) {
        return;
      }

      // Safely clone the node so we can mutate the tree to cut out the parts
      // we do not want/need.
      var cacheNode =
            htmlCache.cloneAsInertNodeAvoidingCustomElementHorrors(this);
      cacheNode.dataset.cached = 'cached';

      // Make sure toolbar is visible, could be hidden by drawer
      cacheNode.querySelector('menu[type="toolbar"]')
               .classList.remove('transparent');

      // Hide search field as it will not operate and gets scrolled out
      // of view after real load.
      var removableCacheNode = cacheNode.querySelector('.msg-search-tease-bar');
      if (removableCacheNode) {
        removableCacheNode.classList.add('collapsed');
      }

      // Hide "new mail" topbar too
      removableCacheNode = cacheNode.querySelector('.message-list-topbar');
      if (removableCacheNode) {
        this._topBar.resetNodeForCache(removableCacheNode);
      }

      // Hide the last sync number
      var tempNode = cacheNode.querySelector('.msg-last-synced-label');
      if (tempNode) {
        tempNode.classList.add('collapsed');
      }
      tempNode = cacheNode.querySelector('.msg-last-synced-value');
      if (tempNode) {
        tempNode.innerHTML = '';
      }

      // Trim vScroll containers that are not in play
      VScroll.trimMessagesForCache(
        cacheNode.querySelector('.msg-messages-container'),
        this._cacheListLimit
      );

      htmlCache.saveFromNode(module.id, cacheNode);
    },

    /**
     * Considers a DOM cache, but only if it meets the criteria for what
     * should be saved in the cache, and if a save is not already scheduled.
     * @param  {Number} index the index of the message that triggered
     *                  this call.
     */
    _considerCacheDom: function(index) {
      // Only bother if not already waiting to update cache and
      if (!this._cacheDomTimeoutId &&
          // card visible state is appropriate
          this._isCacheableCardState() &&
          // if the scroll area is at the top (otherwise the
          // virtual scroll may be showing non-top messages)
          this.vScroll.firstRenderedIndex === 0 &&
          // if actually got a numeric index and
          (index || index === 0) &&
          // if it affects the data we cache
          index < this._cacheListLimit) {
        this._cacheDomTimeoutId = setTimeout(this._cacheDom.bind(this), 600);
      }
    },

    /**
     * Clears out the messages HTML in messageContainer from using the cached
     * nodes that were picked up when the HTML cache of this list was used
     * (which is indicated by usingCachedNode being true). The cached HTML
     * needs to be purged when the real data is finally available and will
     * replace the cached state. A more sophisticated approach would be to
     * compare the cached HTML to what would be inserted in its place, and
     * if no changes, skip this step, but that comparison operation could get
     * tricky, and it is cleaner just to wipe it and start fresh. Once the
     * cached HTML has been cleared, then usingCachedNode is set to false
     * to indicate that the main piece of content in the card, the message
     * list, is no longer from a cached node.
     */
    _clearCachedMessages: function() {
      if (this.usingCachedNode) {
        this.messagesContainer.innerHTML = '';
        this.usingCachedNode = false;
      }
    },

    /**
     * Request data through desiredHighAbsoluteIndex if we don't have it
     * already and we think it exists.  If we already have an outstanding
     * request we will save off this most recent request to process once
     * the current request completes.  Any previously queued request will
     * be forgotten regardless of how it compares to the newly queued
     * request.
     *
     * @param  {Number} desiredHighAbsoluteIndex
     */
    loadNextChunk: function(desiredHighAbsoluteIndex) {
      // The recalculate logic will trigger a call to prepareData, so
      // it's okay for us to bail.  It's advisable for us to bail
      // because any calls to prepareData will be based on outdated
      // index information.
      if (this.vScroll.waitingForRecalculate) {
        return;
      }

      if (this.waitingOnChunk) {
        this.desiredHighAbsoluteIndex = desiredHighAbsoluteIndex;
        return;
      }

      // Do not bother asking for more than exists
      if (desiredHighAbsoluteIndex >= headerCursor.messagesSlice.headerCount) {
        desiredHighAbsoluteIndex = headerCursor.messagesSlice.headerCount - 1;
      }

      // Do not bother asking for more than what is already
      // fetched
      var items = headerCursor.messagesSlice.items;
      var curHighAbsoluteIndex = items.length - 1;
      var amount = desiredHighAbsoluteIndex - curHighAbsoluteIndex;
      if (amount > 0) {
        // IMPORTANT NOTE!
        // 1 is unfortunately a special value right now for historical reasons
        // that the other side interprets as a request to grow downward with the
        // default growth size.  XXX change backend and its tests...
        console.log('message_list loadNextChunk growing', amount,
                    (amount === 1 ? '(will get boosted to 15!) to' : 'to'),
                    (desiredHighAbsoluteIndex + 1), 'items out of',
                    headerCursor.messagesSlice.headerCount, 'alleged known');
        headerCursor.messagesSlice.requestGrowth(
          amount,
          // the user is not requesting us to go synchronize new messages
          false);
        this.waitingOnChunk = true;
      }
    },

    // The funny name because it is auto-bound as a listener for
    // messagesSlice events in headerCursor using a naming convention.
    messages_splice: function(index, howMany, addedItems,
                               requested, moreExpected, fake) {

      // If no work to do, or wrong mode, just skip it.
      if (headerCursor.searchMode !== this.mode ||
         (index === 0 && howMany === 0 && !addedItems.length)) {
        return;
      }

      this._clearCachedMessages();

      if (this._needVScrollData) {
        this.vScroll.setData(this.listFunc);
        this._needVScrollData = false;
      }

      this.vScroll.updateDataBind(index, addedItems, howMany);

      // Remove the no message text while new messages added:
      if (addedItems.length > 0) {
        this.hideEmptyLayout();
      }

      // If the end result is no more messages, then show empty layout.
      // This is needed mostly because local drafts do not trigger
      // a messages_complete callback when removing the last draft
      // from the compose triggered in that view. The scrollStopped
      // is used to avoid a flash where the old message is briefly visible
      // before cleared, and having the empty layout overlay it.
      // Using the slice's headerCount because it is updated before splice
      // listeners are notified, so should be accurate.
      if (!headerCursor.messagesSlice.headerCount) {
        this.vScroll.once('scrollStopped', function() {
          // Confirm there are still no messages. Since this callback happens
          // async, some items could have appeared since first issuing the
          // request to show empty.
          if (!headerCursor.messagesSlice.headerCount) {
            this.showEmptyLayout();
          }
        }.bind(this));
      }

      // Only cache if it is an add or remove of items
      if (addedItems.length || howMany) {
        this._considerCacheDom(index);
      }
    },

    // The funny name because it is auto-bound as a listener for
    // messagesSlice events in headerCursor using a naming convention.
    messages_change: function(message, index) {
      if (headerCursor.searchMode !== this.mode) {
        return;
      }

      if (this.mode === 'nonsearch') {
        this.onMessagesChange(message, index);
      } else {
        this.updateMatchedMessageDom(false, message);
      }
    },

    onMessagesChange: function(message, index) {
      this.updateMessageDom(false, message);

      // Since the DOM change, cache may need to change.
      this._considerCacheDom(index);
    },

    _updatePeepDom: function(peep) {
      peep.element.textContent = peep.name || peep.address;
    },

    /**
     * Update the state of the given DOM node.  Note that DOM nodes are reused
     * so although you can depend on `firstTime` to be accurate, you must ensure
     * that this method cleans up any dirty state resulting from any possible
     * prior operation of this method.
     *
     * Also note that there is a separate method `updateMatchedMessageDom` for
     * our search mode.  If you are changing this method you probably also want
     * to be changing that method.
     */
    updateMessageDom: function(firstTime, message) {
      var msgNode = message.element;

      if (!msgNode) {
        return;
      }

      // If the placeholder data, indicate that in case VScroll
      // wants to go back and fix later.
      var classAction = message.isPlaceholderData ? 'add' : 'remove';
      msgNode.classList[classAction](this.vScroll.itemDefaultDataClass);

      // ID is stored as a data- attribute so that it can survive
      // serialization to HTML for storing in the HTML cache, and
      // be usable before the actual data from the backend has
      // loaded, as clicks to the message list are allowed before
      // the back end is available. For this reason, click
      // handlers should use dataset.id when wanting the ID.
      msgNode.dataset.id = message.id;

      // some things only need to be done once
      var dateNode = msgNode.querySelector('.msg-header-date');
      var subjectNode = msgNode.querySelector('.msg-header-subject');
      var snippetNode = msgNode.querySelector('.msg-header-snippet');
      if (firstTime) {
        var listPerson;
        if (this.isIncomingFolder) {
          listPerson = message.author;
        // XXX This is not to UX spec, but this is a stop-gap and that would
        // require adding strings which we cannot justify as a slipstream fix.
        } else if (message.to && message.to.length) {
          listPerson = message.to[0];
        } else if (message.cc && message.cc.length) {
          listPerson = message.cc[0];
        } else if (message.bcc && message.bcc.length) {
          listPerson = message.bcc[0];
        } else {
          listPerson = message.author;
        }

        // author
        listPerson.element =
          msgNode.querySelector('.msg-header-author');
        listPerson.onchange = this._updatePeepDom;
        listPerson.onchange(listPerson);
        // date
        var dateTime = message.date.valueOf();
        dateNode.dataset.time = dateTime;
        dateNode.textContent = dateTime ? date.prettyDate(message.date) : '';
        // subject
        messageDisplay.subject(msgNode.querySelector('.msg-header-subject'),
                              message);

        // attachments (can't change within a message but can change between
        // messages, and since we reuse DOM nodes...)
        var attachmentsNode = msgNode.querySelector('.msg-header-attachments');
        attachmentsNode.classList.toggle('msg-header-attachments-yes',
                                         message.hasAttachments);
        // snippet needs to be shorter if icon is shown
        snippetNode.classList.toggle('icon-short', message.hasAttachments);
      }

      // snippet
      snippetNode.textContent = message.snippet;

      // update styles throughout the node for read vs unread
      msgNode.classList.toggle('unread', !message.isRead);

      // star
      var starNode = msgNode.querySelector('.msg-header-star');

      starNode.classList.toggle('msg-header-star-starred', message.isStarred);
      // subject needs to give space for star if it is visible
      subjectNode.classList.toggle('icon-short', message.isStarred);

      // sync status
      var syncNode =
            msgNode.querySelector('.msg-header-syncing-section');

      // sendState is only intended for outbox messages, so not all
      // messages will have sendStatus defined.
      var sendState = message.sendStatus && message.sendStatus.state;

      syncNode.classList.toggle('msg-header-syncing-section-syncing',
                                sendState === 'sending');
      syncNode.classList.toggle('msg-header-syncing-section-error',
                                sendState === 'error');

      // Set the accessible label for the syncNode.
      if (sendState) {
        mozL10n.setAttributes(syncNode, 'message-header-state-' + sendState);
      } else {
        syncNode.removeAttribute('data-l10n-id');
      }

      // edit mode select state
      this.setSelectState(msgNode, message);
    },

    updateMatchedMessageDom: function(firstTime, matchedHeader) {
      var msgNode = matchedHeader.element,
          matches = matchedHeader.matches,
          message = matchedHeader.header;

      if (!msgNode) {
        return;
      }

      // If the placeholder data, indicate that in case VScroll
      // wants to go back and fix later.
      var classAction = message.isPlaceholderData ? 'add' : 'remove';
      msgNode.classList[classAction](this.vScroll.itemDefaultDataClass);

      // Even though updateMatchedMessageDom is only used in searches,
      // which likely will not be cached, the dataset.is is set to
      // maintain parity withe updateMessageDom and so click handlers
      // can always just use the dataset property.
      msgNode.dataset.id = matchedHeader.id;

      // some things only need to be done once
      var dateNode = msgNode.querySelector('.msg-header-date');
      var subjectNode = msgNode.querySelector('.msg-header-subject');
      if (firstTime) {
        // author
        var authorNode = msgNode.querySelector('.msg-header-author');
        if (matches.author) {
          authorNode.textContent = '';
          appendMatchItemTo(matches.author, authorNode);
        }
        else {
          // we can only update the name if it wasn't matched on.
          message.author.element = authorNode;
          message.author.onchange = this._updatePeepDom;
          message.author.onchange(message.author);
        }

        // date
        dateNode.dataset.time = message.date.valueOf();
        dateNode.textContent = date.prettyDate(message.date);

        // subject
        if (matches.subject) {
          subjectNode.textContent = '';
          appendMatchItemTo(matches.subject[0], subjectNode);
        } else {
          messageDisplay.subject(subjectNode, message);
        }

        // snippet
        var snippetNode = msgNode.querySelector('.msg-header-snippet');
        if (matches.body) {
          snippetNode.textContent = '';
          appendMatchItemTo(matches.body[0], snippetNode);
        } else {
          snippetNode.textContent = message.snippet;
        }

        // attachments (can't change within a message but can change between
        // messages, and since we reuse DOM nodes...)
        var attachmentsNode =
          msgNode.querySelector('.msg-header-attachments');
        attachmentsNode.classList.toggle('msg-header-attachments-yes',
                                         message.hasAttachments);
        // snippet needs to be shorter if icon is shown
        snippetNode.classList.toggle('icon-short', message.hasAttachments);
      }

      // Set unread state.
      msgNode.classList.toggle('unread', !message.isRead);

      // star
      var starNode = msgNode.querySelector('.msg-header-star');
      starNode.classList.toggle('msg-header-star-starred', message.isStarred);
      // subject needs to give space for star if it is visible
      subjectNode.classList.toggle('icon-short', message.isStarred);

      // edit mode select state
      this.setSelectState(msgNode, message);
    },

    /**
     * Set or unset the select state based on the edit mode.
     */
    setSelectState: function(msgNode, message) {
      if (this.editMode) {
        this.setMessageChecked(msgNode,
          this.selectedMessages.indexOf(message) !== -1);
      } else {
        msgNode.removeAttribute('aria-selected');
      }
    },

    /**
     * Set the checked state for the message item in the list. It sets both
     * checkbox checked and aria-selected states.
     */
    setMessageChecked: function(msgNode, checked) {
      var checkbox = msgNode.querySelector('input[type=checkbox]');
      checkbox.checked = checked;
      msgNode.setAttribute('aria-selected', checked);
    },

    /**
     * Called when the folder picker is animating to close. Need to
     * listen for it so this card can animate fading in the header menu.
     */
    onFolderPickerClosing: function() {
      this.headerMenuNode.classList.remove('transparent');
    },

    /**
     * Listener called when a folder is shown. The listener emits an
     * 'inboxShown' for the current account, if the inbox is really being shown
     * and the app is visible. Useful if periodic sync is involved, and
     * notifications need to be closed if the inbox is visible to the user.
     */
    onFolderShown: function() {
      if (this.mode === 'search') {
        return;
      }

      var account = model.account,
          foldersSlice = model.foldersSlice;

      // The extra checks here are to allow for lazy startup when we might have
      // a card instance but not a full model available. Once the model is
      // available though, this method will get called again, so the event
      // emitting is still correctly done in the lazy startup case.
      if (!document.hidden && account && foldersSlice && this.curFolder) {
        var inboxFolder = foldersSlice.getFirstFolderWithType('inbox');
        if (inboxFolder === this.curFolder) {
          evt.emit('inboxShown', account.id);
        }
      }
    },

    /**
     * An API method for the cards infrastructure, that Cards will call when the
     * page visibility changes and this card is the currently displayed card.
     */
    onCurrentCardDocumentVisibilityChange: function() {
      this.onFolderShown();
    },

    /**
     * Called by Cards when the instance of this card type is the
     * visible card.
     */
    onCardVisible: function() {
      if (this._whenVisible) {
        var fn = this._whenVisible;
        this._whenVisible = null;
        fn();
      }

      // First time this card is visible, want the search field focused if this
      // is a search. Do not want to do it on every cardVisible, as the user
      // could be scrolled/have their own place in the search results, and are
      // likely going back and forth between this card and message_reader.
      if (this.mode === 'search' && this.isFirstTimeVisible) {
        this.searchInput.focus();
      }

      this.isFirstTimeVisible = false;

      // In case the vScroll was initialized when the card was not visible, like
      // in an activity/notification flow when this card is created in the
      // background behind the compose/reader card, let it know it is visible
      // now in case it needs to finish initializing and initial display.
      this.vScroll.nowVisible();

      // On first construction, or if done in background,
      // this card would not be visible to do the last sync
      // sizing so be sure to check it now.
      this.sizeLastSync();
    },

    onClickMessage: function(messageNode, event) {
      // You cannot open a message if this is the outbox and it is syncing.
      if (this.curFolder &&
          this.curFolder.type === 'outbox' && this.outboxSyncInProgress) {
        return;
      }

      var header = messageNode.message;

      // Skip nodes that are default/placeholder ones.
      if (header && header.isPlaceholderData) {
        return;
      }

      if (this.editMode) {
        var idx = this.selectedMessages.indexOf(header);
        if (idx !== -1) {
          this.selectedMessages.splice(idx, 1);
        }
        else {
          this.selectedMessages.push(header);
        }
        this.setMessageChecked(messageNode, idx === -1);
        this.selectedMessagesUpdated();
        return;
      }

      if (this.curFolder && this.curFolder.type === 'localdrafts') {
        var composer = header.editAsDraft(function() {
          cards.pushCard('compose', 'animate',
                         { composer: composer });
        });
        return;
      }

      // When tapping a message in the outbox, don't open the message;
      // instead, move it to localdrafts and edit the message as a
      // draft.
      if (this.curFolder && this.curFolder.type === 'outbox') {
        // If the message is currently being sent, abort.
        if (header.sendStatus.state === 'sending') {
          return;
        }
        var draftsFolder =
              model.foldersSlice.getFirstFolderWithType('localdrafts');

        console.log('outbox: Moving message to localdrafts.');
        model.api.moveMessages([header], draftsFolder, function(moveMap) {
          header.id = moveMap[header.id];
          console.log('outbox: Editing message in localdrafts.');
          var composer = header.editAsDraft(function() {
            cards.pushCard('compose', 'animate',
                           { composer: composer });
          });
        });

        return;
      }

      function pushMessageCard() {
        cards.pushCard(
          'message_reader', 'animate',
          {
            // The header here may be undefined here, since the click
            // could be on a cached HTML node before the back end has
            // started up. It is OK if header is not available as the
            // message_reader knows how to wait for the back end to
            // start up to get the header value later.
            header: header,
            // Use the property on the HTML, since the click could be
            // from a cached HTML node and the real data object may not
            // be available yet.
            messageSuid: messageNode.dataset.id
          });
      }

      if (header) {
        headerCursor.setCurrentMessage(header);
      } else if (messageNode.dataset.id) {
        // a case where header was not set yet, like clicking on a
        // html cached node, or virtual scroll item that is no
        // longer backed by a header.
        headerCursor.setCurrentMessageBySuid(messageNode.dataset.id);
      } else {
        // Not an interesting click, bail
        return;
      }

      // If the message is really big, warn them before they open it.
      // Ideally we'd only warn if you're on a cell connection
      // (metered), but as of now `navigator.connection.metered` isn't
      // implemented.

      // This number is somewhat arbitrary, based on a guess that most
      // plain-text/HTML messages will be smaller than this. If this
      // value is too small, users get warned unnecessarily. Too large
      // and they download a lot of data without knowing. Since we
      // currently assume that all network connections are metered,
      // they'll always see this if they get a large message...
      var LARGE_MESSAGE_SIZE = 1 * 1024 * 1024;

      // watch out, header might be undefined here (that's okay, see above)
      if (header && header.bytesToDownloadForBodyDisplay > LARGE_MESSAGE_SIZE) {
        this.showLargeMessageWarning(
          header.bytesToDownloadForBodyDisplay, function(result) {
          if (result) {
            pushMessageCard();
          } else {
            // abort
          }
        });
      } else {
        pushMessageCard();
      }
    },

    /**
     * Scroll to make sure that the current message is in our visible window.
     *
     * @param {header_cursor.CurrentMessage} currentMessage representation of
     *     the email we're currently reading.
     * @param {Number} index the index of the message in the messagesSlice
     */
    onCurrentMessage: function(currentMessage, index) {
      if (!currentMessage || headerCursor.searchMode !== this.mode) {
        return;
      }

      var visibleIndices = this.vScroll.getVisibleIndexRange();
      if (visibleIndices &&
          (index < visibleIndices[0] || index > visibleIndices[1])) {
        this.vScroll.jumpToIndex(index);
      }
    },

    onHoldMessage: function(messageNode, event) {
      if (this.curFolder) {
        this.setEditMode(true);
      }
    },

    /**
     * The outbox has a special role in the message_list, compared to
     * other folders. We don't expect to synchronize the outbox with the
     * server, but we do allow the user to use the refresh button to
     * trigger all of the outbox messages to send.
     *
     * While they're sending, we need to display several spinny refresh
     * icons: One next to each message while it's queued for sending,
     * and also the main refresh button.
     *
     * However, the outbox send operation doesn't happen all in one go;
     * the backend only fires one 'sendOutboxMessages' at a time,
     * iterating through the pending messages. Fortunately, it notifies
     * the frontend (via `onBackgroundSendStatus`) whenever the state of
     * any message changes, and it provides a flag to let us know
     * whether or not the outbox sync is fully complete.
     *
     * So the workflow for outbox's refresh UI display is as follows:
     *
     * 1. The user taps the "refresh" button. In response:
     *
     *    1a. Immediately make all visible refresh icons start spinning.
     *
     *    1b. Immediately kick off a 'sendOutboxMessages' job.
     *
     * 2. We will start to see send status notifications, in this
     *    class's onBackgroundSendStatus notification. We listen to
     *    these events as they come in, and wait until we see a
     *    notification with state === 'syncDone'. We'll keep the main
     *    refresh icon spinning throughout this process.
     *
     * 3. As messages send or error out, we will receive slice
     *    notifications for each message (handled here in `messages_change`).
     *    Since each message holds its own status as `header.sendStatus`,
     *    we don't need to do anything special; the normal rendering logic
     *    will reset each message's status icon to the appropriate state.
     *
     * But don't take my word for it; see `jobs/outbox.js` and
     * `jobmixins.js` in GELAM for backend-centric descriptions of how
     * the outbox sending process works.
     */
    toggleOutboxSyncingDisplay: function(syncing) {
      // Use an internal guard so that we only trigger changes to the UI
      // when necessary, rather than every time, which could break animations.
      if (syncing === this._outboxSyncing) {
        return;
      }

      this._outboxSyncing = syncing;

      var i;
      var items = this.messagesContainer.getElementsByClassName(
        'msg-header-syncing-section');

      if (syncing) {
        // For maximum perceived responsiveness, show the spinning icons
        // next to each message immediately, rather than waiting for the
        // backend to actually start sending each message. When the
        // backend reports back with message results, it'll update the
        // icon to reflect the proper result.
        for (i = 0; i < items.length; i++) {
          items[i].classList.add('msg-header-syncing-section-syncing');
          items[i].classList.remove('msg-header-syncing-section-error');
        }

        this.editBtn.disabled = true;
      } else {
        // After sync, the edit button should remain disabled only if
        // the list is empty.
        this.editBtn.disabled = this.isEmpty();

        // Similarly, we must stop the refresh icons for each message
        // from rotating further. For instance, if we are offline, we
        // won't actually attempt to send any of those messages, so
        // they'll still have a spinny icon until we forcibly remove it.
        for (i = 0; i < items.length; i++) {
          items[i].classList.remove('msg-header-syncing-section-syncing');
        }
      }
      this.setRefreshState(syncing);
    },

    onRefresh: function() {
      if (!headerCursor.messagesSlice) {
        return;
      }

      // If this is the outbox, refresh has a different meaning.
      if (this.curFolder.type === 'outbox') {
        // Rather than refreshing the folder, we'll send the pending
        // outbox messages, and spin the refresh icon while doing so.
        this.toggleOutboxSyncingDisplay(true);
      }
      // If this is a normal folder...
      else {
        switch (headerCursor.messagesSlice.status) {
        // If we're still synchronizing, then the user is not well served by
        // queueing a refresh yet, let's just squash this.
        case 'new':
        case 'synchronizing':
          break;
        // If we fully synchronized, then yes, let us refresh.
        case 'synced':
          this._manuallyTriggeredSync = true;
          headerCursor.messagesSlice.refresh();
          break;
        // If we failed to talk to the server, then let's only do a refresh if
        // we know about any messages.  Otherwise let's just create a new slice
        // by forcing reentry into the folder.
        case 'syncfailed':
          if (headerCursor.messagesSlice.items.length) {
            headerCursor.messagesSlice.refresh();
          } else {
            this.showFolder(this.curFolder, /* force new slice */ true);
          }
          break;
        }
      }

      // Even if we're not actually viewing the outbox right now, we
      // should still attempt to sync any pending messages. It's fairly
      // harmless to kick off this job here, but it could also make
      // sense to do this at the backend level. There are a number of
      // cases where we might also want to  sendOutboxMessages() if
      // we follow up with a more comprehensive sync setting -- e.g. on
      // network change, on app startup, etc., so it's worth revisiting
      // this and how coupled we want incoming vs outgoing sync to be.
      model.api.sendOutboxMessages(model.account);
    },

    onStarMessages: function() {
      var op = model.api.markMessagesStarred(this.selectedMessages,
                                           this.setAsStarred);
      this.setEditMode(false);
      toaster.toastOperation(op);
    },

    onMarkMessagesRead: function() {
      var op = model.api.markMessagesRead(this.selectedMessages,
                                          this.setAsRead);
      this.setEditMode(false);
      toaster.toastOperation(op);
    },

    onDeleteMessages: function() {
      // TODO: Batch delete back-end mail api is not ready for IMAP now.
      //       Please verify this function under IMAP when api completed.

      if (this.selectedMessages.length === 0) {
        return this.setEditMode(false);
      }

      var dialog = deleteConfirmMsgNode.cloneNode(true);
      var content = dialog.getElementsByTagName('p')[0];
      mozL10n.setAttributes(content, 'message-multiedit-delete-confirm',
                            { n: this.selectedMessages.length });
      ConfirmDialog.show(dialog,
        { // Confirm
          id: 'msg-delete-ok',
          handler: function() {
            var op = model.api.deleteMessages(this.selectedMessages);
            toaster.toastOperation(op);
            this.setEditMode(false);
          }.bind(this)
        },
        { // Cancel
          id: 'msg-delete-cancel',
          handler: null
        }
      );
    },

    /**
     * Show a warning that the given message is large.
     * Callback is called with cb(true|false) to continue.
     */
    showLargeMessageWarning: function(size, cb) {
      var dialog = largeMsgConfirmMsgNode.cloneNode(true);
      // TODO: If UX designers want the size included in the warning
      // message, add it here.
      ConfirmDialog.show(dialog,
        { // Confirm
          id: 'msg-large-message-ok',
          handler: function() { cb(true); }
        },
        { // Cancel
          id: 'msg-large-message-cancel',
          handler: function() { cb(false); }
        }
      );
    },

    onMoveMessages: function() {
      // TODO: Batch move back-end mail api is not ready now.
      //       Please verify this function when api landed.

      cards.folderSelector(function(folder) {
        var op = model.api.moveMessages(this.selectedMessages, folder);
        toaster.toastOperation(op);
        this.setEditMode(false);
      }.bind(this), function(folder) {
        return folder.isValidMoveTarget;
      });


    },

    _folderChanged: function(folder) {
      // It is possible that the notification of latest folder is fired
      // but in the meantime the foldersSlice could be cleared due to
      // a change in the current account, before this listener is called.
      // So skip this work if no foldersSlice, this method will be called
      // again soon.
      if (!model.foldersSlice) {
        return;
      }

      // Folder could have changed because account changed. Make sure
      // the cacheableFolderId is still set correctly.
      var inboxFolder = model.foldersSlice.getFirstFolderWithType('inbox');
      this.cacheableFolderId =
                             model.account === model.acctsSlice.defaultAccount ?
                            inboxFolder.id : null;

      this.folder = folder;

      if (this.mode == 'nonsearch') {
        if (this.showFolder(folder)) {
          this._hideSearchBoxByScrolling();
        }
      } else {
        this.showSearch('', 'all');
      }
    },

    die: function() {
      this.sliceEvents.forEach(function(type) {
        var name = 'messages_' + type;
        headerCursor.removeListener(name, this[name]);
      }.bind(this));

      evt.removeListener('folderPickerClosing', this.onFolderPickerClosing);

      model.removeListener('folder', this._folderChanged);
      model.removeListener('newInboxMessages', this.onNewMail);
      model.removeListener('foldersSliceOnChange', this.onFoldersSliceChange);
      headerCursor.removeListener('currentMessage', this.onCurrentMessage);

      this.vScroll.destroy();
    }
  }
];
});
