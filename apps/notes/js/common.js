var App = new function() {
    var self = this,
        cards = null, user = null,
        $notebooksList = null, elButtonNewNote = null,
        elButtonEvernoteLogin = null,
        createNoteOnTap = false,

        LOGGER_NAMESPACE = "[FxOS-Notes]",
        TIME_FOR_NEW_NOTE_DOUBLECLICK = 200,
        NUMBER_OF_SCROLL_RETRIES = 10,
        EVERNOTE_SYNC_MIN_GECKO_VERSION = 26,
        EMPTY_CONTENT_CLASS = "show-empty",
        CLASS_EDIT_TITLE = "edit-title",
        CLASS_SEARCH_RESULTS = "search-results",
        CLASS_LOADING = "loading",
        DEFAULT_USER = {
            "id": "1",
            "username": "default",
            "name": "default"
        },
        TEXTS = null,
        ORDERS = null,
        INFO_FIELDS = null,
        imageResizeQueue = [],
        imageLoadQueue = [],
        resizeInProgress = 0,
        SEARCH_FIELDS = ["content", "title"];

    this.DEBUG = true;

    this.init = function() {
        self.DEBUG && Console.init(LOGGER_NAMESPACE);

        setupCache();
        self.setupTexts();

        cards = new Cards({
            "onMove": onCardMove,
            "onTransitionEnd": onCardTransitionEnd
        });

        // handler of the notebook card (list of notes)
        NotebookView.init({
            "container": $("main"),
            "onClickNote": self.showNote,
            "onChange": NotebooksList.refresh
        });
        // handler of the note card (view and edit actual note)
        NoteView.init({
            "container": $("note"),
            "elCancel": $("button-note-cancel"),
            "elSave": $("button-note-save"),
            "onSave": onNoteSave,
            "onCancel": onNoteCancel,
            "onRestore": onNoteRestore,
            "onDelete": onNoteDelete,
            "onResourceClick": onResourceClick,
            "NoteActionsPhotoLabel": TEXTS.PHOTO_LABEL
        });
        // handler of the note-info card
        NoteInfoView.init({
            "container": $("note-info"),
            "fields": INFO_FIELDS,
            "onNotebookChange": onNoteChangeNotebook
        });
        // handles the sorting of notebooks
        Sorter.init({
            "orders": ORDERS,
            "container": $("notebook-footer"),
            "onChange": function(order, desc) {
                NotebookView.showNotes(order, desc);
            }
        });
        // general object to show notifications on screen
        Notification.init({
            "container": $("container")
        });

        // when viewing image in full screen
        ResourceView.init({
            "container": $("image-fullscreen"),
            "onDelete": onResourceDelete
        });
        // main notes-search class
        Searcher.init({
            "input": $("searchNotes"),
            "fields": SEARCH_FIELDS,
            "onSearch": SearchHandler.onSearch,
            "onInputFocus": SearchHandler.onFocus,
            "onInputBlur": SearchHandler.onBlur
        });

        // list of notebooks
        NotebooksList.init({
            "container": $("notebooks"),
            "onClick": onNotebookClick,
            "onRefresh": NoteInfoView.refreshNotebooks,
            "onRename": onNotebookRename,
            "onDelete": onNotebookDelete
        });

        Settings.init({
            "elSettings": $("button-settings"),
            "elCancel": $("button-settings-cancel"),
            "elUsername": document.querySelectorAll("#settings .username, .drawer .username"),
            "elAccount": $$("#settings .account"),
            "elButtons": $$("#settings .buttons"),
            "elUploadLeft": $$("#settings .upload-left"),
            "elDaysLeft": $$("#settings .days-left"),
            "elSignout": $("button-evernote-logout"),
            "onSignout": function() {
                Evernote.logout();
            },
            "onEnter": function() {
                cards.goTo(cards.CARDS.SETTINGS);
            },
            "onCancel": function() {
                cards.goTo(cards.CARDS.NOTEBOOKS);
            }
        });

        elButtonNewNote = $("button-notebook-add");

        $("button-new-notebook").addEventListener("click", self.promptNewNotebook);
        $("button-notebook-search").addEventListener("click", SearchHandler.open);
        $("button-evernote-login").addEventListener("click", Evernote.login);
        $("button-manual-sync").addEventListener("click", Evernote.getSyncState);

        elButtonNewNote.addEventListener("click", function() {
            self.newNote();
        });

        elButtonEvernoteLogin = $("button-evernote-login");
        self.checkGeckoVersion();

        DB.init(initUser);

        document.body.classList.remove(CLASS_LOADING);

        document.addEventListener('localechange', function(){
            navigator.mozL10n.ready(function(){
                self.setupTexts();
            });
        }, false);

        window.addEventListener('online', function() {
            if (user.isValidEvernoteUser()) {
                Evernote.getSyncState();
            }
            document.body.classList.remove('offline');
            setConnection(true);
        });
        window.addEventListener('offline', function() {
            document.body.classList.remove('online');
            setConnection(false);
        });
        setConnection(navigator.onLine);
    };

    function setConnection(isOnline) {
        var status = isOnline ? 'online' : 'offline';
        if (self.DEBUG) {
            Console.log('setConnection: '+JSON.stringify(status));
        }
        document.body.classList.add(status);
    }

    function setupCache() {
        // window.applicationCache.addEventListener('updateready', function onCacheUpdated() {
        //     window.applicationCache.swapCache();
        //     window.location.reload();
        // }, false);
    }

    function initUser(){
        var signedout = window.location.search.indexOf('signedout') > -1;
        DB.getUsers({}, function onSuccess(users) {
            if (users.length === 0) {
                user = new Models.User(DEFAULT_USER);
                DB.addUser(user, function onSuccess() {
                    self.getUserNotes(signedout);
                });
            } else {
                user = users[0];
                self.getUserNotes(signedout);
            }

            if (user.isValidEvernoteUser()) {
                Evernote.init(user);
                self.onLogin(user);
            }
        });
    }

    this.setupTexts = function() {
        TEXTS = {
            "NEW_NOTEBOOK": navigator.mozL10n.get("new-notebook"),
            "NOTEBOOK_ALL": navigator.mozL10n.get("notebook-all"),
            "NOTEBOOK_TRASH": navigator.mozL10n.get("notebook-trash"),
            "NOTEBOOK_ACTION_TITLE": navigator.mozL10n.get("notebook-action-title"),
            "NOTEBOOK_ACTION_RENAME": navigator.mozL10n.get("notebook-action-rename"),
            "NOTEBOOK_ACTION_DELETE": navigator.mozL10n.get("notebook-action-delete"),
            "PROMPT_RENAME_NOTEBOOK": navigator.mozL10n.get("prompt-rename-notebook"),
            "PROMPT_DELETE_NOTEBOOK": navigator.mozL10n.get("prompt-delete-notebook"),
            "NOTE_RESTORED": navigator.mozL10n.get("note-restored"),
            "NEW_NOTE": navigator.mozL10n.get("new-note"),
            "EMPTY_NOTEBOOK": navigator.mozL10n.get("empty-notebook"),
            "EMPTY_TRASH": navigator.mozL10n.get("empty-trash"),
            "FIRST_NOTEBOOK_NAME": navigator.mozL10n.get("first-notebook-name"),
            "EMPTY_NOTEBOOK_NAME": navigator.mozL10n.get("empty-notebook-name"),
            "NOTE_CANCEL_CHANGES": navigator.mozL10n.get("note-cancel-changes"),
            "CONFIRM_TRASH_NOTE": navigator.mozL10n.get("confirm-trash-note"),
            "CONFIRM_DELETE_NOTE": navigator.mozL10n.get("confirm-delete-note"),
            "ADD_IMAGE_TITLE": navigator.mozL10n.get("add-image-title"),
            "IMAGE_NOT_SUPPORTED": navigator.mozL10n.get("image-not-supported"),
            "PHOTO_LABEL": navigator.mozL10n.get("image-label"),
            "NOTEBOOK_NAME_ALREADY_EXISTS": navigator.mozL10n.get("notebook-name-already-exists"),
            "NOTE_UNSAVEABLE": navigator.mozL10n.get("note-unsaveable")
        };

        ORDERS = [
            {
                "property": "date_updated",
                "label": navigator.mozL10n.get("date-updated"),
                "descending": true
            },
            {
                "property": "date_created",
                "label": navigator.mozL10n.get("date-created"),
                "descending": true
            },
            {
                "property": "title",
                "label": navigator.mozL10n.get("title"),
                "descending": false
            },
            {
                "property": "notebook_id",
                "label": navigator.mozL10n.get("notebook"),
                "descending": false
            }
        ];

        INFO_FIELDS = [
            {
                "key": "notebook_id",
                "label": navigator.mozL10n.get("notebook"),
                "type": "options"
            },
            {
                "key": "date_created",
                "label": navigator.mozL10n.get("created-on"),
                "type": "date"
            },
            {
                "key": "date_updated",
                "label": navigator.mozL10n.get("modified-on"),
                "type": "date"
            }
        ];
    };

    this.checkGeckoVersion = function checkGeckoVersion() {
        var str = navigator.userAgent;
        var regex = new RegExp("Gecko/[0-9\.]+");
        var geckoVersion = parseFloat(str.match(regex)[0].split("/")[1]);
        if (geckoVersion < EVERNOTE_SYNC_MIN_GECKO_VERSION) {
            elButtonEvernoteLogin.style.display = "none";
        }
    };

    this.getUser = function() {
        return user;
    };

    this.updateMigrationStatus = function(data, c, e) {
        user.set(data, c, e);
    };

    this.updateUserData = function(data, c, e) {
        user.set(data, c, e);
        Settings.update();
    };

    this.updateNoteContent = function(note) {
        NoteView.updateContent(note);
    };

    this.getUserNotes = function(signedout) {
        user.getNotebooks(function(notebooks) {
            if (notebooks.length == 0) {
                self.newNotebook(TEXTS.FIRST_NOTEBOOK_NAME, function(){
                    NotebooksList.refresh(notebooks);
                }, signedout);
            } else {
                self.showNotes(notebooks[0]);
                NotebooksList.refresh(notebooks);
            }
        });
    };

    this.newNotebook = function(name, cb, signedout) {
        user.newNotebook({
            "name": name
        }, function(notebook) {
            self.addQueue('Notebook', notebook);
            NotebookView.show(notebook);
            if (!signedout) {
                self.newNote(notebook, function(note){
                    cb && cb();
                });
            } else {
                cb && cb();
            }
        });
    };

    this.newNote = function newNote(notebook, cb) {
        if (!notebook) {
            notebook = NotebookView.getCurrent();
        }

        if (!notebook) {
            return false;
        }

        notebook.newNote({
            "notebook_id": notebook.getId(),
            "notebookGuid": notebook.getGuid()
        }, function onSuccess(note){
            self.addQueue('Note', note);
            self.showNote(note, notebook);

            cb && cb(note);
        });

        return true;
    };

    this.getNotes = function() {
        return notes;
    };

    this.addQueue = function addQueue(type, obj, cbSuccess) {
        new Models.Queue({
            rel : type,
            rel_id : obj.data_id || obj.id,
            rel_guid : obj.data_guid || obj.guid,
            expunge : obj.expunge || false
        }).set(cbSuccess || onAddQueue);
    };

    this.getQueues = function getQueues(cbSuccess, cbError) {
        DB.getQueues({}, cbSuccess, cbError);
    };

    this.showNote = function showNote(note, notebook) {
        if (typeof note === "string") {
            DB.getNoteByKey(note, function(obj) {
                self.showNote(obj, notebook);
            });
        } else {
            NoteView.show(note, notebook);
            cards.goTo(cards.CARDS.NOTE);
        }
    };

    this.showNotes = function(notebook) {
        NotebookView.show(notebook);
        cards.goTo(cards.CARDS.MAIN);

        if (NotebookView.getCurrent()) {
            elButtonNewNote.style.display = "";
        }
    };

    this.promptNewNotebook = function() {
        var notebookName = prompt(TEXTS.NEW_NOTEBOOK, "");
        if (notebookName) {
            validateNotebookName(notebookName, null, function(){
                self.newNotebook(notebookName);
            });
        }
    };

    this.sortNotes = function(sort, isDesc) {
        NotebookView.showNotes(sort, isDesc);
    };

    this.showAllNotes = function() {
        NotebookView.show(null, {"trashed": false});

        elButtonNewNote.style.display = "none";
        NotebookView.setTitle(TEXTS.NOTEBOOK_ALL);

        cards.goTo(cards.CARDS.MAIN);
    };

    this.showTrashedNotes = function() {
        NotebookView.show(null, {"trashed": true});

        elButtonNewNote.style.display = "none";
        NotebookView.setTitle(TEXTS.NOTEBOOK_TRASH);

        cards.goTo(cards.CARDS.MAIN);
    };

    this.refershNotebooksList = function() {
        NotebooksList.refresh();
    };
    this.refershNotebookView = function() {
        NotebookView.show();
    };

    this.startSync = function() {
        document.body.classList.add('syncing');
        document.querySelector('progress').value = 0;
    };
    this.stopSync = function() {
        document.body.classList.remove('syncing');
        document.querySelector('progress').value = 0;
    };

    this.onLogin = function() {
        document.body.classList.add('loggedin');
    };

    this.pendingResourceData = function(guid) {
        imageLoadQueue.push({
            "guid" : guid
        });
    };

    this.resourceDataLoaded = function(resource) {
        var indexFound = null;
        for (var i = 0, len = imageLoadQueue.length; i < len; i++) {
            if (imageLoadQueue[i].guid === resource.guid) {
                indexFound = i;
            }
        }
        imageLoadQueue.splice(indexFound, 1);

        NoteView.updateResource(resource);

        var key = "";
        for (var i in resource.data.bodyHash) {
            key += String("0123456789abcdef".substr((resource.data.bodyHash[i] >> 4) & 0x0F,1)) + "0123456789abcdef".substr(resource.data.bodyHash[i] & 0x0F,1);
        }
        App.resizeImage(resource.data.body, resource.width, resource.height, resource.mime, key);
        App.processImageResizeQueue();
    };

    this.noteResourceNotLoaded = function(resource) {
        NoteView.missingResource();
    };

    this.resizeImage = function(data, width, height, type, hash) {
        if (screen.width < width) {
            imageResizeQueue.push({
               "data" : data,
               "width" : width,
               "height" : height,
               "type" : type,
               "hash" : hash
            });
            return null;
        } else {
            var blobURL = window.URL.createObjectURL(ArrayBufferHelper.getBlob(data, type));
            NoteView.renderImageResource(blobURL, hash);
            return blobURL;
        }
    };

    this.processImageResizeQueue = function() {
        if (imageResizeQueue.length > 0) {
            var item = imageResizeQueue.pop();
            var data = item.data;
            var width = item.width;
            var height = item.height;
            var type = item.type;
            var hash = item.hash;
            var blobURL = window.URL.createObjectURL(ArrayBufferHelper.getBlob(data, type));
            var image = document.createElement('img');
            image.onload = function() {
                var newWidth = screen.width;
                var newHeight = Math.floor((screen.width*height)/width);
                var canvas = document.createElement('canvas');
                canvas.width = newWidth;
                canvas.height = newHeight;
                var ctx = canvas.getContext("2d");
                ctx.drawImage(image, 0, 0, newWidth, newHeight);
                canvas.toBlob(function (blob) {
                    NoteView.renderImageResource(window.URL.createObjectURL(blob), hash);
                    resizeInProgress--;
                    self.processImageResizeQueue();
                }, type);
            };
            image.type = type;
            image.width = width;
            image.height = height;
            image.src = blobURL;
            resizeInProgress++;
        } else {
            if (imageLoadQueue.length == 0) {
                NoteView.renderImageComplete();
            }
        }
    };

    function validateNotebookName(name, id, cbSuccess, cbError) {
        DB.getNotebooks({"name": name}, function(notebooks) {
            var notebookWithNameExists = false;
            for (var i in notebooks) {
                if (notebooks[i].getName() === name && (!id || notebooks[i].getId() !== id)) {
                    notebookWithNameExists = true;
                    break;
                }
            }
            if (notebookWithNameExists) {
                alert(TEXTS.NOTEBOOK_NAME_ALREADY_EXISTS);
                cbError && cbError();
            } else {
                cbSuccess && cbSuccess();
            }
        });
    };

    function onAddQueue(queue) {
        if (user.isValidEvernoteUser() && navigator.onLine) {
            if (queue.getRel() == 'Notebook') {
                Evernote.processNotebookQueue(queue);
            } else if (queue.getRel() == 'Note') {
                Evernote.processNoteQueue(queue);
            }
        }
    }

    function onCardMove(cardIndex) {
        Notification.hide();
        if (cards && (cardIndex === cards.CARDS.SETTINGS)) {
            Settings.update();
        }
    }

    function onCardTransitionEnd(e) {
        var activeCard = $$('.card.active');
    }

    function onNotebookClick(type, notebook) {
        switch(type) {
            case "notebook":
                self.showNotes(notebook);
                break;
            case "all":
                self.showAllNotes();
                break;
            case "trash":
                self.showTrashedNotes();
                break;
        }
    }

    function onNotebookRename(notebook) {
        var newName = prompt(TEXTS.PROMPT_RENAME_NOTEBOOK, notebook.getName() || "");
        if (newName) {
            validateNotebookName(newName, notebook.getId(), function() {
                notebook.set({
                    "name": newName
                }, function onSuccess() {
                    self.addQueue('Notebook', notebook);
                    NotebooksList.refresh();
                    NotebookView.show(notebook);
                });
            });
        }
    }

    function onNotebookDelete(notebookAffected) {
        if (confirm(TEXTS.PROMPT_DELETE_NOTEBOOK)) {
            DB.getNotebooks({}, function(notebooks) {
                for (var i in notebooks) {
                    if (notebooks[i].getId() != notebookAffected.getId()) {
                        notebookAffected.getNotes(true, function(notes){
                            for (var k in notes) {
                                notes[k].set({
                                    "trashed": true,
                                    "active": false,
                                    "notebook_id": notebooks[i].getId(),
                                    "notebookGuid": notebooks[i].getGuid()
                                }, function (noteAffected){
                                    self.addQueue('Note', noteAffected);
                                });
                            }
                        });
                        break;
                    }
                }
            });
            notebookAffected.remove(function onSuccess(notebook) {
                NotebooksList.refresh();
                self.addQueue('Notebook', {
                    id : notebookAffected.getId(),
                    guid : notebookAffected.getGuid(),
                    expunge : true
                });
            });
        }
    }

    function onNoteSave(noteAffected) {
        self.showNotes();
        NotebooksList.refresh();
        if (noteAffected) {
            self.addQueue('Note', noteAffected);
        }
    }

    function onNoteCancel(noteAffected, isChanged) {
        if (isChanged && NoteView.currentNoteUnsaveable()) {
            if (confirm(TEXTS.NOTE_UNSAVEABLE)) {
                cards.goTo(cards.CARDS.MAIN);
            }
            return;
        }
        if (isChanged && confirm(TEXTS.NOTE_CANCEL_CHANGES)) {
            NoteView.save();
            return;
        }

        if (noteAffected.getName() == "" && noteAffected.getContent(true, false) == "") {
            noteAffected.remove(function onSuccess(){
                self.showNotes();
                NotebooksList.refresh();
            }, function onError() {

            });
        } else {
            imageResizeQueue = [];
            imageLoadQueue = [];
            cards.goTo(cards.CARDS.MAIN);
        }
    }

    function onNoteRestore(noteAffected) {
        self.showTrashedNotes();
        NotebooksList.refresh();

        noteAffected.getNotebook(function onSuccess(notebook){
            var txt = TEXTS.NOTE_RESTORED.replace("{{notebook}}", notebook.getName());
            Notification.show(txt);
        }, function onError() {});

        self.addQueue('Note', noteAffected);
    }

    function onNoteDelete(noteAffected) {
        self.showTrashedNotes();
        NotebooksList.refresh();
        self.addQueue('Note', {
            id : noteAffected.getId(),
            guid : noteAffected.getGuid(),
            expunge : true
        });
    }

    function onNoteChangeNotebook(newNotebookId) {
        var note = NoteInfoView.getCurrent();

        note.getNotebook(function(notebook) {
            notebook.set({
                "numberOfNotes": notebook.getNumberOfNotes()-1
            });
        });

        note.set({
            "notebook_id": newNotebookId
        }, function onSuccess() {
            note.getNotebook(function(notebook) {
                notebook.set({
                    "numberOfNotes": notebook.getNumberOfNotes()+1
                });

                NotebooksList.refresh();
                NoteInfoView.selectNotebook(newNotebookId);
                NotebookView.show(notebook);
            });
            self.addQueue('Note', note);
        }, function onError() {});
    }

    function onResourceClick(resource) {
        ResourceView.show(resource);
    }

    function onResourceDelete(resource) {
        resource.remove(function onSuccess() {
            NoteView.loadResources();
            ResourceView.hide();
        });
    }

    function getNoteNameFromContent(content) {
        return (content || "").split(/<br[^>]*>/i)[0];
    }

    var NotebooksList = new function() {
        var self = this,
            el = null, elList = null,
            onClick = null, onRefresh = null, onRename = null, onDelete = null,
            tapIgnored, timeTouchStart,

            DISTANCE_TO_IGNORE_AS_MOVE = 3,
            TIMEOUT_BEFORE_EDITING_NOTEBOOK = 400;

        this.init = function(options) {
            !options && (options = {});

            el = options.container;
            elList = el.querySelector("ul");

            onClick = options.onClick;
            onRefresh = options.onRefresh;
            onRename = options.onRename;
            onDelete = options.onDelete;
        };

        this.refresh = function(notebooks) {
            if (!notebooks || notebooks.length == 0) {
                user.getNotebooks(self.refresh);
                return;
            }

            var numberOfTrashedNotes = 0;

            elList.innerHTML = "";

            createNotebookEntry_All();
            for (var i=0; i<notebooks.length; i++) {
                numberOfTrashedNotes += notebooks[i].getNumberOfTrashedNotes();

                if (!notebooks[i].isTrashed()) {
                    createNotebookEntry(notebooks[i]);
                }
            }
            createNotebookEntry_Trash(numberOfTrashedNotes);

            onRefresh && onRefresh(notebooks);
        };

        function createNotebookEntry(notebook) {
            var el = document.createElement("li"),
                numberOfApps = notebook.getNumberOfNotes();

            el.innerHTML = html_str(notebook.getName()) + (numberOfApps? " (" + numberOfApps + ")" : "");

            el.addEventListener("touchstart", function(e){
                tapIgnored = false;
                touchStartPos = getEventPoint(e);

                this.timeoutHold = window.setTimeout(function(){
                    el.edited = true;
                    tapIgnored = false;
                    onEditNotebook(notebook);
                }, TIMEOUT_BEFORE_EDITING_NOTEBOOK);
            });
            el.addEventListener("touchmove", function(e){
                if (!touchStartPos) { return; }

                var point = getEventPoint(e),
                    distance = [point[0] - touchStartPos[0], point[1] - touchStartPos[1]];

                if (Math.abs(distance[0]) > DISTANCE_TO_IGNORE_AS_MOVE ||
                    Math.abs(distance[1]) > DISTANCE_TO_IGNORE_AS_MOVE)
                {
                    window.clearTimeout(this.timeoutHold);
                    tapIgnored = true;
                }
            });
            el.addEventListener("touchend", function(e){
                window.clearTimeout(this.timeoutHold);
            });
            el.addEventListener("click", function(e){
                if (!this.edited && !tapIgnored) {
                    clickNotebook(notebook);
                }
                this.edited = false;
            });

            elList.appendChild(el);
        }

        function createNotebookEntry_All() {
            var el = document.createElement("li");
            el.innerHTML = TEXTS.NOTEBOOK_ALL;
            el.className = "all";
            el.dataset.l10nId = "notebook-all";
            el.addEventListener("click", clickAll);

            elList.appendChild(el);
        }

        function createNotebookEntry_Trash(numberOfTrashedNotes) {
            var el = document.createElement("li");

            el.innerHTML = TEXTS.NOTEBOOK_TRASH + (numberOfTrashedNotes? " (" + numberOfTrashedNotes + ")" : "");
            el.className = "trash";
            el.dataset.l10nId = "notebook-trash";
            el.addEventListener("click", clickTrash);

            elList.appendChild(el);
        }

        function onEditNotebook(notebook) {
            dialog(TEXTS.NOTEBOOK_ACTION_TITLE, [TEXTS.NOTEBOOK_ACTION_RENAME, TEXTS.NOTEBOOK_ACTION_DELETE], function(optionClicked) {
                if (optionClicked == 0) {
                    onRename && onRename(notebook);
                } else if (optionClicked == 1) {
                    onDelete && onDelete(notebook);
                }
            });
        }

        function clickNotebook(notebook) {
            onClick && onClick("notebook", notebook);
        }
        function clickAll(e) {
            onClick && onClick("all");
        }
        function clickTrash(e) {
            onClick && onClick("trash");
        }
    };

    var NoteView = new function() {
        var self = this,
            currentNote = null, currentNotebook = null,
            noteContentBeforeEdit = "", noteNameBeforeEdit = "",
            el = null, elContent = null, elResources = null, elTitle = null, elEditTitle = null, elActions = null,
            elRestore = null, elDelete = null, elWarning = null,
            onSave = null, onCancel = null, onRestore = null, onDelete = null, onTitleChange = null,

            CLASS_EDIT_TITLE = "edit-title",
            CLASS_WHEN_VISIBLE = "visible",
            CLASS_WHEN_TRASHED = "readonly-trashed",
            CLASS_WHEN_READONLY = "readonly",
            CLASS_WHEN_HAS_IMAGES = "has-images";

        this.init = function(options) {
            el = options.container;
            elSave = options.elSave;
            elCancel = options.elCancel;

            onSave = options.onSave;
            onCancel = options.onCancel;
            onRestore = options.onRestore;
            onDelete = options.onDelete;
            onTitleChange = options.onTitleChange;
            onResourceClick = options.onResourceClick;

            elContent = el.querySelector("#note-content");
            elResources = el.querySelector("#note-resources");
            elTitle = el.querySelector("h1");
            elEditTitle = el.querySelector("input");
            elActions = el.querySelector("#note-edit-actions");
            elRestore = el.querySelector("#button-note-restore");
            elDelete = el.querySelector("#button-note-delete");
            elWarning = el.querySelector('#warning');

            elTitle.addEventListener("click", self.editTitle);
            elEditTitle.addEventListener("blur", self.saveEditTitle);
            elEditTitle.addEventListener("keyup", function(e){
                (e.keyCode == 13) && self.saveEditTitle();
            });

            elContent.addEventListener("focus", onContentFocus);
            elContent.addEventListener("blur", onContentBlur);
            elContent.addEventListener("keyup", onContentKeyUp);

            elSave.addEventListener("click", self.save);
            elCancel.addEventListener("click", self.cancel);

            elRestore.addEventListener("click", self.restore);
            elDelete.addEventListener("click", self.del);

            NoteActions.init({
                "el": elActions,
                "elContainer": el,
                "onBeforeAction": onBeforeAction,
                "onAfterAction": onAfterAction,
                "label": options.NoteActionsPhotoLabel
            });
        };

        this.show = function(note, notebook) {
            elWarning.style.display = "none";
            el.classList.add(CLASS_WHEN_READONLY);
            noteContent = "Loading...";

            var noteContent = note.getContent(true, true),
                noteName = note.getName();
            if (noteContent != null) {
                if (!note.isMissingResourceData()) {
                    el.classList.remove(CLASS_WHEN_READONLY);
                    elWarning.style.display = "none";
                }
                var noteContentBody = noteContent.match(/<body[^>]*>([\w\W]*)<\/body>/);
                if (noteContentBody && noteContentBody.length > 1) {
                    noteContent = noteContentBody[1];
                }
            }

//            noteContentBeforeEdit = noteContent.replace(/\/>/g,">");
            noteNameBeforeEdit = noteName;

            elContent.innerHTML = noteContent;
            noteContentBeforeEdit = elContent.innerHTML;
            self.setTitle(noteName);
            /**
             * we currently only support inline-image resources, this is made for future versions of the app
             */
            // self.loadResources(note);

            if (note.isTrashed()) {
                el.classList.add(CLASS_WHEN_TRASHED);
            } else {
                el.classList.remove(CLASS_WHEN_TRASHED);
            }

            onContentKeyUp();
            onContentBlur();

            currentNote = note;
            currentNotebook = notebook;
        };

        this.updateContent = function(note) {
            if (typeof note.guid !== "undefined") {
                currentNote.updateContent(note.content);
                if (note.guid === currentNote.getGuid()) {
                    DB.getNoteByIndex("guid", note.guid, function(note) {
                        self.show(note, currentNotebook);
                    });
                }
            } else {
                currentNote.updateContent(note.data_content);
                if (note.getId() === currentNote.getId()) {
                    DB.getNoteByKey(note.getId(), function(note) {
                        self.show(note, currentNotebook);
                    });
                }
            }
        };

        this.missingResource = function() {
            el.classList.add(CLASS_WHEN_READONLY);
            elWarning.style.display = "block";
        };

        this.updateResource = function(resource) {
            // Update note resource
            currentNote.updateResourceData(resource.guid, resource.data.body);
        };

        this.renderImageResource = function(blobURL, hash) {
            var imgs = elContent.getElementsByTagName("img");
            for (var i = 0, l = imgs.length; i < l; i++) {
                if (imgs[i].getAttribute("hash").toLowerCase() === hash) {
                    imgs[i].src = blobURL;
                }
            }
            // Update content before edit so change detection will work properly.
            noteContentBeforeEdit = elContent.innerHTML;
        };

        this.renderImageComplete = function() {
            if (currentNote && !currentNote.isMissingResourceData()) {
                el.classList.remove(CLASS_WHEN_READONLY);
                elWarning.style.display = "none";
            }
        };

        this.loadResources = function(note) {
            !note && (note = currentNote);

            elResources.innerHTML = '';

            var resources = note.getResources();
            for (var i=0; i<resources.length; i++) {
                self.addResource(resources[i]);
            }
        };

        this.addResource = function(resource) {
            elResources.appendChild(getResourceElement(resource));
        };

        this.getCurrentNote = function() { return currentNote; };
        this.getCurrentNotebook = function() { return currentNotebook; };

        this.setTitle = function(title) {
            html(elTitle, title || getNoteNameFromContent(elContent.innerHTML) || TEXTS.NEW_NOTE);
            elEditTitle.value = title || "";
        };

        this.editTitle = function() {
            if (!currentNote || currentNote.isTrashed()) return;

            el.classList.add(CLASS_EDIT_TITLE);
            elEditTitle.focus();
        };

        this.saveEditTitle = function() {
            el.classList.remove(CLASS_EDIT_TITLE);
            elEditTitle.blur();

            self.setTitle(elEditTitle.value);

            onTitleChange && onTitleChange();
        };

        this.save = function() {
            if (self.changed() && self.currentNoteUnsaveable()) {
                if (confirm(TEXTS.NOTE_UNSAVEABLE)) {
                    onSave && onSave(null);
                }
                return;
            }

            var content = elContent.innerHTML,
                name = (elEditTitle.value || elTitle.innerHTML).replace(/&amp;/g, "&");

            currentNote.set({
                "title": name,
                "content": content
            }, function onSuccess(note){
                onSave && onSave(note);
            }, function onError(){
                Console.error("Error saving note!");
            });
        };

        this.cancel = function() {
            onCancel && onCancel(currentNote, self.changed());
        };

        this.restore = function() {
            currentNote.restore(function onSuccess(){
                onRestore && onRestore(currentNote);
            }, function onError() {

            });
        };

        this.del = function() {
            if (confirm(TEXTS.CONFIRM_DELETE_NOTE)) {
                currentNote.remove(function onSuccess(){
                    onDelete && onDelete(currentNote);
                }, function onError() {

                });
            }
        };

        this.focus = function() {
            elContent.focus();
            self.scrollToElement(NUMBER_OF_SCROLL_RETRIES);
        };

        this.scrollToElement = function(numberOfTries) {
            var top = elContent.getBoundingClientRect().top;

            window.scrollTo(0, top);
            if (numberOfTries > 0 && document.body.scrollTop < top) {
                window.setTimeout(function(){
                    self.scrollToElement(numberOfTries-1);
                }, 80);
            }
        };

        this.changed = function() {
            // Have to convert contents to DOM tree in order to compare properly
            var htmlContentBeforeEdit= document.createElement('div');
            htmlContentBeforeEdit.innerHTML= noteContentBeforeEdit;
            var htmlContentAfterEdit= document.createElement('div');
            htmlContentAfterEdit.innerHTML= elContent.innerHTML;

            if (htmlContentBeforeEdit == null || htmlContentAfterEdit == null) {
                return noteContentBeforeEdit !== elContent.innerHTML || noteNameBeforeEdit !== elEditTitle.value;
            } else {
                return !htmlContentBeforeEdit.isEqualNode(htmlContentAfterEdit) || noteNameBeforeEdit !== elEditTitle.value;
            }
        };

        this.currentNoteUnsaveable = function() {
            return currentNote.isMissingResourceData();
        };

        function onContentKeyUp(e) {
            if (elContent.innerHTML) {
                elSave.classList.add(CLASS_WHEN_VISIBLE);
                !elEditTitle.value && (html(elTitle, getNoteNameFromContent(elContent.innerHTML)));
            } else {
                elSave.classList.remove(CLASS_WHEN_VISIBLE);
                self.setTitle();
            }
        }

        function onContentFocus(e) {
            el.classList.remove(EMPTY_CONTENT_CLASS);

            window.scrollTo(0, 1);

            setHeightAccordingToScreen();
        }

        function onContentBlur(e) {
            if (elContent.innerHTML) {
                el.classList.remove(EMPTY_CONTENT_CLASS);
            } else {
                el.classList.add(EMPTY_CONTENT_CLASS);
            }

            resetHeight();
        }

        function setHeightAccordingToScreen() {
            var tries = 30,
                initialHeight = window.innerHeight,
                intervalHeight = window.setInterval(function(){

                if (window.innerHeight < initialHeight) {
                    elContent.style.height = elContent.style.minHeight = (window.innerHeight-elTitle.offsetHeight-elActions.offsetHeight) + "px";
                    window.scrollTo(0, 1);
                }

                if (tries == 0 || window.innerHeight < initialHeight) {
                    window.clearInterval(intervalHeight);
                }
                tries--;
            }, 100);
        }

        function resetHeight() {
            elContent.style.height = elContent.style.minHeight = "";
        }

        function getResourceElement(resource) {
            var el = document.createElement("li"),
                size = resource.getSize();

            el.className = resource.getType();
            el.innerHTML = '<span style="background-image: url(' + resource.getSrc() + ')"></span> ' +
                            (resource.getName() || "").replace(/</g, '&lt;') + (size? ' (' + readableFilesize(size) + ')' : '');


            el.addEventListener("click", function(){
                onResourceClick(resource);
            });

            return el;
        }

        function onResourceClick(resource) {
            onResourceClick && onResourceClick(resource);
        }

        function onBeforeAction(action) {
            switch(action) {
                case "type":
                    elContent.focus();
                    break;
                case "info":
                    NoteInfoView.load(currentNote);
                    cards.goTo(cards.CARDS.NOTE_INFO);
                    break;
                case "share":
                    break;
            }
        }

        function onAfterAction(action, output) {
            switch(action) {
                case "type":
                    break;
                case "photo":
                    currentNote.newResource(output, function(data){
                        elContent.innerHTML += " <img type=\""+output.mime+"\" src=\""+window.URL.createObjectURL(output.blob)+"\" hash=\""+output.hash+"\" />";
                        elContent.focus();
                    });
                    break;
                case "info":
                    break;
                case "share":
                    break;
                case "delete":
                    if (output) {
                        App.showNotes();
                        NotebooksList.refresh();
                    }
                    break;
            }
        }
    };

    var NoteInfoView = new function() {
        var self = this,
            el = null, fields = [], currentNote = null,
            onNotebookChange = null;

        this.init = function(options) {
            el = options.container;
            fields = options.fields;
            onNotebookChange = options.onNotebookChange;

            elFields = el.querySelector(".fields");

            initView();
        };

        this.load = function(note) {
            if (currentNote && note.getId() === currentNote.getId()) {
                return;
            }

            for (var i=0,f; f=fields[i++];) {
                var value = note['data_' + f.key],
                    elValue = elFields.querySelector("." + f.key);

                switch(f.type) {
                    case "date":
                        value = printDate(value);
                        html(elValue, value);
                        break;
                    case "options":
                        elValue.value = value;
                        break;
                }
            }

            currentNote = note;
        };

        this.getCurrent = function() {
            return currentNote;
        };

        this.refreshNotebooks = function(notebooks) {
            var html = '',
                elSelect = elFields.querySelector(".notebook_id"),
                currentValue = elSelect.value;

            for (var i=0,notebook; notebook=notebooks[i++];) {
                html += '<option value="' + notebook.getId() + '">' + html_str(notebook.getName()) + '</option>';
            }
            elSelect.innerHTML = html;

            elSelect.value = currentValue;
        };

        this.selectNotebook = function(notebookId) {
            elFields.querySelector(".notebook_id").value = notebookId;
        };

        this.onChange_notebook_id = function(e) {
            onNotebookChange && onNotebookChange(this.value);
        };

        function initView() {
            var html = '';

            for (var i=0,f; f=fields[i++];) {
                var type = f.type;

                html += '<li>' +
                            '<label>' + f.label + '</label>' +
                            ((type === "options")?
                            '<select class="' + f.key + '"></select>' :
                            '<b class="value ' + f.key + '"></b>') +
                        '</li>';
            }

            elFields.innerHTML += html;

            // automatically bind onChange events to all fields of type "option"
            for (var i=0,f; f=fields[i++];) {
                if (f.type === "options") {
                    elFields.querySelector("select." + f.key).addEventListener("change", self["onChange_" + f.key]);
                }
            }
        }

        function printDate(date) {
            if (typeof date == "number") {
                date = new Date(date);
            }

            var formatted = "",
                h = date.getHours(),
                m = date.getMinutes();

            formatted += (h<10? '0' : '') + h + ":" + (m<10? '0' : '') + m;
            formatted += " ";
            formatted += date.getDate() + "/" + (date.getMonth()+1) + "/" + date.getFullYear();

            return formatted;
        }
    };

    var NotebookView = new function() {
        var self = this,
            MAX_NOTE_PREVIEW_LENGTH = 420,
            el = null, elTitle = null, elEditTitle = null, elSearchTitle = null, elSearchNotes = null, elEmptyNotes = null, $notesList = null,
            currentNotebook = null, currentFilters = null, currentSort = "", currentIsDesc = false,
            onClickNote = null, notebookScrollOffset = 0,
            onChange = null;

        this.init = function(options) {
            el = options.container;
            onClickNote = options.onClickNote;
            onChange = options.onChange;

            elTitle = el.querySelector("h1");
            elEditTitle = el.querySelector("input");
            elEmptyNotes = el.querySelector(".empty p");

            elSearchTitle = el.querySelector("h2");
            elSearchNotes = $("searchNotes");

            elTitle.addEventListener("click", self.editTitle);
            elEditTitle.addEventListener("blur", self.saveEditTitle);
            elEditTitle.addEventListener("keyup", function(e){
                (e.keyCode == 13) && self.saveEditTitle();
            });

            $notesList = el.getElementsByClassName("notebook-notes")[0];

            $notesList.addEventListener("click", clickNote);

            notebookScrollOffset = $("search").offsetHeight;
        };

        this.show = function(notebook, filters, bDontScroll) {
            // Hide Search title in case there were previous search results
            self.hideSearchTitle();
            elSearchNotes.value = '';

            if (filters) {
                notebook = null;
                currentNotebook = null;
            } else if(!notebook) {
                if (currentFilters) {
                    filters = currentFilters;
                    notebook = null;
                } else {
                    filters = null;
                    notebook = currentNotebook;
                }
            }

            el.classList.remove("notebook-real");
            el.classList.remove("notebook-fake");
            el.classList.add(notebook || !filters.trashed ? "notebook-real": "notebook-fake");

            notebook && self.setTitle(notebook.getName());

            if (!currentNotebook || currentNotebook.getId() != notebook.getId()) {
                currentSort = "";
                currentIsDesc = false;
                startNotesLoading();
                self.clearNoteList();
            }

            currentNotebook = notebook;
            currentFilters = filters;
            self.showNotes(currentSort, currentIsDesc, filters);

            if (!bDontScroll) {
                self.scrollTop();
            }
        };

        this.showNotes = function(sortby, isDesc, filters) {
            currentSort = sortby;
            currentIsDesc = isDesc;
            if (filters === undefined) {
                filters = currentFilters;
            }

            if (currentNotebook) {
                if (currentNotebook.getNumberOfNotes() == 0) {
                    self.printNotes([]);
                } else {
                    currentNotebook.getNotes(false, function(notes){
                        self.printNotes(notes);
                    }, function onError() {

                    });
                }
            } else {
                user.getNotes(filters, function onSuccess(notes){
                    self.printNotes(notes, filters.trashed);
                }, function onError() {

                });
            }
        };

        this.printNotes = function(notes, trashed) {
            startNotesLoading();
            self.clearNoteList();

            notes = sortNotes(notes, currentSort, currentIsDesc);
            if (notes && notes.length > 0) {
                for (var i=0; i<notes.length; i++) {
                    $notesList.appendChild(getNoteElement(notes[i]));
                }
                el.classList.remove(EMPTY_CONTENT_CLASS);
            } else {
                el.classList.add(EMPTY_CONTENT_CLASS);
                elEmptyNotes.innerHTML = currentNotebook || !trashed ? TEXTS.EMPTY_NOTEBOOK : TEXTS.EMPTY_TRASH;
                elEmptyNotes.dataset.l10nId = currentNotebook || !trashed ? "empty-notebook" : "empty-trash";
            }

            finishNotesLoading();
            return $notesList;
        };

        this.setTitle = function(title) {
            html(elTitle, title || TEXTS.EMPTY_NOTEBOOK_NAME);
            elEditTitle.value = title || "";
        };

        this.editTitle = function() {
            if (!currentNotebook) return;

            el.classList.add(CLASS_EDIT_TITLE);
            elEditTitle.focus();
        };

        this.saveEditTitle = function() {
            if (!currentNotebook) return;

            var newName = elEditTitle.value.replace(/(^[\s]+|[\s]+$)/g, '');

            validateNotebookName(newName, currentNotebook.getId(), function() {
                el.classList.remove(CLASS_EDIT_TITLE);
                elEditTitle.blur();

                if (newName != currentNotebook.getName()) {
                    currentNotebook.set({
                        "name": newName
                    }, function cbSuccess() {
                        self.setTitle(newName);
                        onChange && onChange();
                        App.addQueue('Notebook', currentNotebook);
                    }, function cbError() {});
                }
            }, function() {
                elEditTitle.focus();
            });
        };

        this.getCurrent = function() {
            return currentNotebook;
        };

        this.scrollTop = function(scrollTop) {
            $notesList.parentNode.scrollTop = (typeof scrollTop == "number")? scrollTop : notebookScrollOffset;
        };

        this.showSearchTitle = function() {
            elTitle.style.display = "none";
            elSearchTitle.style.display = "";
        };

        this.hideSearchTitle = function() {
            elTitle.style.display = "";
            elSearchTitle.style.display = "none";
        };

        this.clearNoteList = function() {
            $notesList.innerHTML = '';
        };

        function startNotesLoading() {
            document.body.classList.add('loading');
        };

        function finishNotesLoading() {
            document.body.classList.remove('loading');
        };

        function getNoteElement(note) {
            var el = document.createElement("li");

            var content;
            if (typeof note.data_text !== "undefined" && note.data_text != null) {
                content = note.data_text;
            } else {
                content = note.getContent(true, false);
            }
            var contentBody = content.match(/<body[^>]*>([\w\W]*)<\/body>/);
            if (contentBody && contentBody.length > 1) {
                content = contentBody[1];
            }
            var title = html_str(note.getName() || getNoteNameFromContent(content));

            el.className = "note";
            el.dataset.noteId = note.getId();
            el.innerHTML = '<div>' +
                               '<span class="title">' + title + '</span> <span class="time">' + prettyDate(note.getDateUpdated()) + '</span>' +
                           '</div>' +
                           '<div class="text">' + html_str(getNotePreview(content)) + '</div>'
            // Not showing image preview because large images are memory intensive
/*
            var resources = note.getResources();
            if (resources && resources.length > 0) {
                var resource = resources[0],
                    elResource = document.createElement('div'),
                    src = window.URL.createObjectURL(ArrayBufferHelper.getBlob(resource.data.body, resource.mime));

                elResource.className = 'image';
                elResource.style.backgroundImage = 'url(' + src + ')';

                el.appendChild(elResource);
            }
*/
            if (note.isTrashed()) {
                el.className += " trashed";
            }

            return el;
        }

        function getNotePreview(content) {
            var contentDiv = document.createElement('div');
            contentDiv.innerHTML = content;

            return contentDiv.textContent;
        }

        function sortNotes(notes, sortby, isDesc) {
            if (!sortby) return notes;

            notes.sort(function(a, b){
                var valA = a['data_' + sortby] || (sortby == "title" && a['data_content']) || '',
                    valB = b['data_' + sortby] || (sortby == "title" && b['data_content']) || '';

                return valA > valB? (isDesc?-1:1)*1 : valA < valB? (isDesc?1:-1)*1 : 0;
            });

            return notes;
        }

        // the click is captured on the entire list,
        // and we extract the specific note from the event target
        function clickNote(e) {
            var elNote = e.target;
            while (elNote && elNote.tagName != "LI") {
                elNote = elNote.parentNode;
            }

            if (elNote) {
                onClickNote && onClickNote(elNote.dataset.noteId, currentNotebook);
            } else if (TIME_FOR_NEW_NOTE_DOUBLECLICK) {
                if (currentNotebook && (createNoteOnTap || el.classList.contains(EMPTY_CONTENT_CLASS))) {
                    App.newNote(currentNotebook);
                } else {
                    createNoteOnTap = true;
                    window.setTimeout(function(){
                        createNoteOnTap = false;
                    }, TIME_FOR_NEW_NOTE_DOUBLECLICK);
                }
            }
        }
    };

    var ResourceView = new function() {
        var self = this,
            el = null, elImage = null, elName = null,
            currentResource = null, onDelete = null;

        var CLASS_WHEN_VISIBLE = "visible";

        this.init = function(options) {
            el = options.container;
            onDelete = options.onDelete;

            elImage = el.querySelector(".image");
            elName = el.querySelector(".name");

            el.querySelector("#button-resource-close").addEventListener("click", self.hide);
            el.querySelector("#button-resource-delete").addEventListener("click", self.del);
        };

        this.show = function(resource) {
            elImage.style.backgroundImage = 'url(' + resource.getSrc() + ')';
            html(elName, resource.getName());

            el.classList.add(CLASS_WHEN_VISIBLE);

            currentResource = resource;
        };

        this.hide = function() {
            el.classList.remove(CLASS_WHEN_VISIBLE);
        };

        this.del = function() {
            currentResource && onDelete && onDelete(currentResource);
        };
    };

    var NoteActions = new function() {
        var self = this,
            el = null, elContainer = null,
            onBeforeAction = null, onAfterAction = null, photoLabel = null;

        this.init = function(options) {
            el = options.el;
            elContainer = options.elContainer;
            onBeforeAction = options.onBeforeAction;
            onAfterAction = options.onAfterAction;

            elType = el.querySelector(".type");
            elPhoto = el.querySelector(".photo");
            elInfo = el.querySelector(".info");
            elShare = el.querySelector(".share");
            elDelete = el.querySelector(".delete");

            elType.addEventListener("click", actionType);
            elPhoto.addEventListener("click", actionPhoto);
            elInfo.addEventListener("click", actionInfo);
            elShare.addEventListener("click", actionShare);
            elDelete.addEventListener("click", actionDelete);

            photoLabel = options.label;
        };

        function actionType() {
            onBeforeAction && onBeforeAction("type");

            onAfterAction && onAfterAction("type");
        }

        function actionPhoto() {
            onBeforeAction && onBeforeAction("photo");

            if ("MozActivity" in window) {
                var act = new MozActivity({
                    'name': 'pick',
                    'data': {
                        'type': 'image/jpeg',
                        'width': 320,
                        'height': 480
                    }
                });

                act.onsuccess = function() {
                    if (!act.result.blob) return;

                    var reader = new FileReader();
                    reader.readAsArrayBuffer(act.result.blob);
                    reader.onload = function onBlobRead(e) {
                        onAfterAction && onAfterAction("photo", {
                            "name": photoLabel + "-" + new Date().getTime() + "." + act.result.blob.type.replace("image/", ""),
                            "mime": act.result.blob.type,
                            "size": act.result.blob.size,
                            "blob": act.result.blob,
                            "buffer": reader.result,
                            "hash": SparkMD5.ArrayBuffer.hash(reader.result)
                        });
                    };
                };
            } else {
                alert(TEXTS.IMAGE_NOT_SUPPORTED);
            }
        }

        function actionInfo() {
            onBeforeAction && onBeforeAction("info");

            onAfterAction && onAfterAction("info");
        }

        function actionShare() {
            onBeforeAction && onBeforeAction("share");

            var elContent = elContainer.querySelector("#note-content");
            var noteTitle = elContainer.querySelector("h1").innerHTML;

			// Get stripped text
            var cloneDom = elContent.cloneNode(true);
            convertFormattingToText(cloneDom);
            var strippedText = stripHTML(cloneDom.innerHTML);

			// Get HTML with inline images
            cloneDom = elContent.cloneNode(true);
            var imageNodes = cloneDom.getElementsByTagName('img');
            for (var j=0,m=imageNodes.length; j<m; j++) {
                imageNodes[j].src = convertImgToBase64(imageNodes[j]);
            }

            var htmlData = [cloneDom.innerHTML];
            var htmlBlob = new Blob(htmlData, {type : 'text/html'});
            var act = new MozActivity({
                name: "new",
                data: {
                    type : "mail",
                    url: "mailto:?subject="+encodeURIComponent(noteTitle)+"&body="+encodeURIComponent(strippedText),
                    blobs: [htmlBlob],
                    filenames: ["note"]
                }
            });
            act.onsuccess = function(e){ };
            act.onerror = function(e){ };

            onAfterAction && onAfterAction("share");
        }

        function actionDelete() {
            onBeforeAction && onBeforeAction("delete");

            if (confirm(TEXTS.CONFIRM_TRASH_NOTE)) {
                NoteView.getCurrentNote().trash(function onSuccess() {
                    App.addQueue('Note', NoteView.getCurrentNote());
                    onAfterAction && onAfterAction("delete", true);
                }, function onError() {

                });
            } else {
                onAfterAction && onAfterAction("delete", false);
            }
        }
    };

    var Notification = new function() {
        var self = this,
            el = null, timeoutHide = null;

        var CLASS_WHEN_VISIBLE = "visible",
            TIME_TO_SHOW = 4000;

        this.init = function(options) {
            el = document.createElement("div");
            el.className = "notifier";

            options.container.appendChild(el);
        };

        this.show = function(message) {
            if (!el) return;

            window.clearTimeout(timeoutHide);

            el.innerHTML = message;
            el.classList.add(CLASS_WHEN_VISIBLE);

            timeoutHide = window.setTimeout(self.hide, TIME_TO_SHOW);
        };

        this.hide = function() {
            if (!el) return;

            window.clearTimeout(timeoutHide);
            el.classList.remove(CLASS_WHEN_VISIBLE);
        };
    }

    var SearchHandler = new function() {
        var notebookBeforeSearch = null;

        this.open = function() {
            NotebookView.scrollTop(0);
            Searcher.focus();
        };

        this.onSearch = function(items, keyword, fields) {
            NotebookView.showSearchTitle();
            if (items.length > 0) {
                var elList = NotebookView.printNotes(items);

                window.setTimeout(function(){
                    markOccurences(elList, keyword, fields);
                }, 0);
            } else {
                if (!keyword) {
                    NotebookView.hideSearchTitle();
                    showPreviousNotebook(true);
                } else {
                    NotebookView.printNotes([]);
                }
            }
        };

        this.onFocus = function(e) {
            document.body.classList.add(CLASS_SEARCH_RESULTS);

            var _currentNotebook = NotebookView.getCurrent();
            if (_currentNotebook) {
                notebookBeforeSearch = _currentNotebook;
            }

            user.getNotes({}, function onSuccess(notes){
                Searcher.setData(notes);
            }, function onError() {

            });
        };

        this.onBlur = function(e) {
            document.body.classList.remove(CLASS_SEARCH_RESULTS);
            if (!Searcher.value()) {
                showPreviousNotebook(true);
            }
        };

        function showPreviousNotebook(hideSearch) {
            NotebookView.show(notebookBeforeSearch, null, hideSearch);
        }

        function markOccurences(elList, keyword, fields) {
            var els = elList.childNodes,
                regex = new RegExp("(" + keyword + ")", "ig");

            for (var i=0,l=els.length; i<l; i++) {
                for (var j=0; j<fields.length; j++) {
                    var el = els[i].getElementsByClassName(fields[j]);
                    if (el && el.length > 0) {
                        el = el[0];
                        el.innerHTML = el.innerHTML.replace(regex, '<b>$1</b>');
                    }
                }
            }
        }
    };

    var Settings = new function() {
        var self = this,
            elUsername, elAccount, elButtons, elUploadLeft, elDaysLeft;

        this.init = function(options) {
            elUsername = options.elUsername;
            elAccount = options.elAccount;
            elButtons = options.elButtons;
            elUploadLeft = options.elUploadLeft;
            elDaysLeft = options.elDaysLeft;
            options.elCancel.addEventListener("click", options.onCancel);
            options.elSignout.addEventListener("click", options.onSignout);
            options.elSettings.addEventListener("click", options.onEnter);
        };

        this.update = function() {
            var userData = user.export();

            var username = userData.username || "";
            for (var i=0,len=elUsername.length; i<len; i++) {
              elUsername[i].innerHTML = username;
            }

            // account type
            var type = userData.privilege == PrivilegeLevel.PREMIUM ? "Premium" : (userData.privilege == PrivilegeLevel.NORMAL ? "Free" : "");
            if (type && typeof type === "string") {
                elAccount.innerHTML = type;
                elButtons.classList.add(type.toLowerCase());
            }

            // upload left
            elUploadLeft.innerHTML = getUploadLeft(userData.accounting.uploadLimit);
            elDaysLeft.innerHTML = getDaysLeft(userData.accounting.uploadLimitEnd);
        };

        function getUploadLeft(num) {
            if (!num) { return "" }

            var steps = {'B': 1000000000, 'M': 1000000, 'K': 1000};

            for (var k in steps) {
                if (num >= steps[k]) {
                    return Math.round(num/steps[k]*10)/10 + k;
                }
            }

            return num;
        }

        function getDaysLeft(uploadLimitEnd) {
            var diff = uploadLimitEnd - new Date().getTime();
            diff = diff / (1000 * 60 * 60 * 24);
            diff = parseInt(diff, 10);
            return  diff;
        }
    };

    var Sorter = new function() {
        var self = this,
            el = null, elOptionNotebook = null,
            currentOrder = "", currentDesc = false, onChange = null;

        this.ORDER = {};

        this.init = function(options) {
            this.ORDER = options.orders;
            onChange = options.onChange;
            createElement(options.container);
        };

        this.show = function() {
            el.focus();
        };

        /* these don't work on B2G, since they create a new element of their own.
         * the created element should take the visibility from the actual options
         */
        this.showSortByNotebook = function() {
            elOptionNotebook.style.display = "block";
        };
        this.hideSortByNotebook = function() {
            elOptionNotebook.style.display = "none";
        };

        function createElement(parent) {
            if (el) return;

            el = document.createElement("select");

            el.addEventListener("change", el.blur);
            el.addEventListener("blur", select);

            var html = '';
            for (var i=0,order; order=self.ORDER[i++];) {
                var option = document.createElement("option");

                option.value = order.property;
                option.innerHTML = order.label;
                option.setAttribute("data-descending", order.descending);

                if (option.value == "notebook_id") {
                    elOptionNotebook = option;
                }

                el.appendChild(option);
            }

            self.hideSortByNotebook();

            parent.appendChild(el);
        }

        function select() {
            var options = el.childNodes,
                sortby = "",
                isDescending = false;

            for (var i=0,option; option=options[i++];) {
                if (option.selected) {
                    sortby = option.value;
                    isDescending = option.getAttribute("data-descending") === "true";
                    break;
                }
            }

            if (currentOrder != sortby) {
                currentOrder = sortby;
                currentDesc = isDescending;
                onChange && onChange(currentOrder, currentDesc);
            }
        }
    };
};

function convertFormattingToText(dom) {
	// Replace ordered list items with numbered text
    var olNodes = dom.getElementsByTagName('ol');
    for (var i=0,l=olNodes.length; i<l; i++) {
        var brNode = document.createElement("br");
        olNodes[i].parentNode.insertBefore(brNode, olNodes[i]);
	    var text = "";
        var liNodes = olNodes[i].getElementsByTagName('li');
        for (var j=0,m=liNodes.length; j<m; j++) {
            text = text+(j+1)+". "+stripHTML(liNodes[j].innerHTML);
        }
        olNodes[i].innerHTML = text;
    }

	// Replace unordered list items with "* " prefixed text
    var ulNodes = dom.getElementsByTagName('ul');
    for (var i=0,l=ulNodes.length; i<l; i++) {
        var brNode = document.createElement("br");
        ulNodes[i].parentNode.insertBefore(brNode, ulNodes[i]);
	    var text = "";
        var liNodes = ulNodes[i].getElementsByTagName('li');
        for (var j=0,m=liNodes.length; j<m; j++) {
            text = text+"* "+stripHTML(liNodes[j].innerHTML);
        }
        ulNodes[i].innerHTML = text;
    }

	// Replace checked checkbox items with "x " prefixed text,
	// unchecked item with just text.
    var inputNodes = dom.getElementsByTagName('input');
    for (var i=0,l=inputNodes.length; i<l; i++) {
        if (inputNodes[i].type == "checkbox") {
            var checked = inputNodes[i].checked;
            var spanNode = document.createElement("span");
            if (checked) {
                spanNode.innerHTML = "x ";
            } else {
                spanNode.innerHTML = "  ";
            }
            inputNodes[i].parentNode.insertBefore(spanNode, inputNodes[i]);
            var brNode = document.createElement("br");
            spanNode.parentNode.insertBefore(brNode, spanNode);
        }
    }

	// Remove tables
    var tableNodes = dom.getElementsByTagName('table');
    for (var i=0,l=tableNodes.length; i<l; i++) {
        var brNode = document.createElement("br");
        tableNodes[i].parentNode.insertBefore(brNode, tableNodes[i]);
    }
}

function stripHTML(html) {
	// Remove all HTML markups
	var brTagRegex = /<br([^>]*)>/ig;
	html = html.replace(brTagRegex, "\n");
    var htmlTagRegex = /(<([^>]+)>)/ig;
    return html.replace(htmlTagRegex, "");
}

function convertImgToBase64(img) {
    var canvas = document.createElement("canvas");
    canvas.width = img.width;
    canvas.height = img.height;
    var ctx = canvas.getContext("2d");
    ctx.drawImage(img, 0, 0);
    var imgType = img.getAttribute("type")
    return canvas.toDataURL(imgType);
}

function readableFilesize(size) {
    var sizes = ["kb", "mb", "gb", "tb"];

    for (var i=0; i<sizes.length; i++) {
        size = Math.round(size/1000);
        if (size < 1000) {
            return size + sizes[i];
        }
    }
}

function prettyDate(time) {
  switch (time.constructor) {
    case String:
      time = parseInt(time);
      break;
    case Date:
      time = time.getTime();
      break;
  }

  var diff = (Date.now() - time) / 1000;
  var day_diff = Math.floor(diff / 86400);

  if (isNaN(day_diff)) {
    return '';
  }

  return day_diff < 0 && ' ' ||
    // Less than one day -- return relative hours/minutes
    day_diff == 0 && (
        diff < 3600 && navigator.mozL10n.get("minutes-ago", { "t": Math.floor(diff / 60) }) ||
        diff < 86400 && navigator.mozL10n.get("hours-ago", { "t": Math.floor(diff / 3600) })) ||
    // Less than one week -- return relative days
    day_diff < 8 && navigator.mozL10n.get("days-ago", { "t": day_diff }) ||
    // Over one week -- return last edit date
    formatDate(new Date(time));
}

function formatDate(date) {
    return date.getDate() + "/" + (date.getMonth()+1) + "/" + date.getFullYear();
}

function getEventPoint(e) {
    var touch = e.touches && e.touches[0] ? e.touches[0] : e,
        point = touch && [touch.pageX || touch.clientX, touch.pageY || touch.clientY];

    return point;
}

function $(s) { return document.getElementById(s); }
function $$(s) { return document.querySelector(s); }
function html_str(s) { return (s || "").replace(/</g, '&lt;'); }
function html(el, s) { el.innerHTML = html_str(s); }

function b64ToUint6(nChr) {
  return nChr > 64 && nChr < 91 ?
      nChr - 65
    : nChr > 96 && nChr < 123 ?
      nChr - 71
    : nChr > 47 && nChr < 58 ?
      nChr + 4
    : nChr === 43 ?
      62
    : nChr === 47 ?
      63
    :
      0;
}

var ArrayBufferHelper = {
    getBlob : function(arraybuffer, type) {
        return new Blob([arraybuffer], {type: type});
    },

    b64ToArrayBuffer : function(sBase64, nBlocksSize) {
      var
        sB64Enc = sBase64.replace(/[^A-Za-z0-9\+\/]/g, ""), nInLen = sB64Enc.length,
        nOutLen = nBlocksSize ? Math.ceil((nInLen * 3 + 1 >> 2) / nBlocksSize) * nBlocksSize : nInLen * 3 + 1 >> 2, taBytes = new Uint8Array(nOutLen);

      for (var nMod3, nMod4, nUint24 = 0, nOutIdx = 0, nInIdx = 0; nInIdx < nInLen; nInIdx++) {
        nMod4 = nInIdx & 3;
        nUint24 |= b64ToUint6(sB64Enc.charCodeAt(nInIdx)) << 18 - 6 * nMod4;
        if (nMod4 === 3 || nInLen - nInIdx === 1) {
          for (nMod3 = 0; nMod3 < 3 && nOutIdx < nOutLen; nMod3++, nOutIdx++) {
            taBytes[nOutIdx] = nUint24 >>> (16 >>> nMod3 & 24) & 255;
          }
          nUint24 = 0;

        }
      }
      return taBytes;
    }
};


window.onload = function() {
    navigator.mozL10n.ready(App.init);
    $('search').addEventListener('submit', function(e) {
        e.preventDefault();
        e.stopPropagation();
    });
}


window.dispatchEvent(new CustomEvent('lazyload', {
    detail: document.body
}));
