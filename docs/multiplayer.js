/**
 * multiplayer.js — Multiplayer game synchronization via Firebase Realtime Database.
 */

(function () {
    "use strict";

    var roomRef = null;
    var roomId = null;
    var myIndex = null;
    var gameStateListener = null;
    var lastActionListener = null;
    var onStateChangeCallback = null;
    var onTurnChangeCallback = null;
    var isProcessing = false;
    var lastSyncedVersion = null;
    var arrayToObject;
    var destroy;
    var flattenState;
    var objectToArray;
    var startGameStateListener;
    var startLastActionListener;

    function init(roomIdParam, playerIndex) {
        destroy();
        roomId = roomIdParam;
        myIndex = playerIndex;
        roomRef = db.ref("rooms/" + roomId);
        startGameStateListener();
        startLastActionListener();
    }

    startGameStateListener = function () {
        gameStateListener = roomRef.child("gameState").on("value", function (snapshot) {
            var remoteState = snapshot.val();
            var remoteVersion;

            if (!remoteState || !onStateChangeCallback) {
                return;
            }

            remoteVersion = (
                remoteState.version === undefined
                ? 0
                : remoteState.version
            );

            // Ignore snapshots older than the one we have already applied, so a
            // delayed or out-of-order Firebase update cannot overwrite a newer
            // state and desync the game.
            if (lastSyncedVersion !== null && remoteVersion < lastSyncedVersion) {
                return;
            }

            lastSyncedVersion = remoteVersion;
            onStateChangeCallback(remoteState);
        });
    };

    startLastActionListener = function () {
        lastActionListener = roomRef.child("lastAction").on("value", function (snapshot) {
            var action = snapshot.val();
            if (action && onTurnChangeCallback) {
                onTurnChangeCallback(action);
            }
        });
    };

    function setInitialState(state) {
        if (!roomRef) {
            return Promise.reject("No room");
        }
        var flatState = flattenState(state);
        flatState.version = 0;
        lastSyncedVersion = 0;
        return firebaseReady.then(function () {
            return roomRef.child("gameState").set(flatState);
        }).then(function () {
            return roomRef.update({
                currentTurn: 0,
                status: "playing"
            });
        });
    }

    function submitAction(actionType, data) {
        var action;

        if (!roomRef) {
            return Promise.reject("No room");
        }
        if (isProcessing) {
            return Promise.reject("Already processing");
        }
        isProcessing = true;
        action = {
            type: actionType,
            player: myIndex,
            timestamp: Date.now()
        };
        Object.keys(data || {}).forEach(function (key) {
            action[key] = data[key];
        });
        return roomRef.child("lastAction").set(action).then(function () {
            isProcessing = false;
        }).catch(function (err) {
            isProcessing = false;
            throw err;
        });
    }

    function updateGameState(newState, nextTurn) {
        if (!roomRef) {
            return Promise.reject("No room");
        }
        var flatState = flattenState(newState);
        var expectedVersion = (
            lastSyncedVersion === null
            ? 0
            : lastSyncedVersion
        );
        var nextVersion = expectedVersion + 1;

        flatState.version = nextVersion;

        return firebaseReady.then(function () {
            return new Promise(function (resolve, reject) {
                roomRef.child("gameState").transaction(function (remoteState) {
                    var remoteVersion;

                    if (!remoteState) {
                        return;
                    }

                    remoteVersion = (
                        remoteState.version === undefined
                        ? 0
                        : remoteState.version
                    );

                    if (remoteVersion !== expectedVersion) {
                        return;
                    }

                    return flatState;
                }, function (error, committed, snapshot) {
                    if (error) {
                        reject(error);
                        return;
                    }

                    if (!committed) {
                        resolve({
                            committed: false,
                            expectedVersion: expectedVersion,
                            remoteState: snapshot ? snapshot.val() : undefined
                        });
                        return;
                    }

                    lastSyncedVersion = nextVersion;

                    roomRef.update({
                        currentTurn: nextTurn
                    }).then(function () {
                        resolve({
                            committed: true,
                            version: nextVersion
                        });
                    }).catch(reject);
                }, false);
            });
        });
    }

    function isMyTurn(currentTurn) {
        return currentTurn === myIndex;
    }

    function getMyIndex() { return myIndex; }
    function getRoomId() { return roomId; }
    function getSyncedVersion() { return lastSyncedVersion; }

    // ---- Flatten state for Firebase (arrays -> objects with numeric keys) ----
    function removeUndefined(obj) {
        var arr;
        var keys;
        var result;

        if (obj === null || obj === undefined) {
            return undefined;
        }
        if (typeof obj !== "object") {
            return obj;
        }
        if (Array.isArray(obj)) {
            arr = obj
                .map(function (item) { return removeUndefined(item); })
                .filter(function (item) { return item !== undefined; });
            return arr;
        }

        result = {};
        keys = Object.keys(obj);
        keys.forEach(function (key) {
            var val = removeUndefined(obj[key]);
            if (val !== undefined) {
                result[key] = val;
            }
        });
        return result;
    }

    flattenState = function (state) {
        var flat = {};

        if (!state) {
            return state;
        }

        Object.keys(state).forEach(function (key) {
            // Firebase rejects undefined values — skip them
            if (state[key] !== undefined) {
                flat[key] = state[key];
            }
        });

        if (state.players && Array.isArray(state.players)) {
            flat.players = {};
            state.players.forEach(function (player, i) {
                var p = {};

                Object.keys(player).forEach(function (pk) {
                    if ((pk === "hand" || pk === "planes") && Array.isArray(player[pk])) {
                        p[pk] = arrayToObject(player[pk]);
                    } else {
                        p[pk] = player[pk];
                    }
                });
                flat.players[i] = p;
            });
        }
        if (state.discard_pile && Array.isArray(state.discard_pile)) {
            flat.discard_pile = arrayToObject(state.discard_pile);
        }
        if (state.draw_pile && Array.isArray(state.draw_pile)) {
            flat.draw_pile = arrayToObject(state.draw_pile);
        }
        if (state.log && Array.isArray(state.log)) {
            flat.log = arrayToObject(state.log);
        }
        return removeUndefined(flat);
    };

    // ---- Unflatten state from Firebase (objects -> arrays) ----
    function unflattenState(state) {
        var result = {};

        if (!state) {
            return state;
        }

        Object.keys(state).forEach(function (key) {
            if (key === "players") {
                result.players = objectToArray(state.players).map(function (player) {
                    var p = {};

                    Object.keys(player).forEach(function (pk) {
                        if (pk === "hand" || pk === "planes") {
                            p[pk] = objectToArray(player[pk]);
                        } else {
                            p[pk] = player[pk];
                        }
                    });
                    return p;
                });
            } else if (key === "discard_pile" || key === "draw_pile" || key === "log") {
                result[key] = objectToArray(state[key]);
            } else {
                result[key] = state[key];
            }
        });
        return result;
    }

    arrayToObject = function (arr) {
        var obj = {};

        if (!arr || !Array.isArray(arr)) {
            return arr;
        }

        arr.forEach(function (item, i) { obj[i] = item; });
        return obj;
    };

    objectToArray = function (obj) {
        var keys;

        if (!obj) {
            return [];
        }
        if (Array.isArray(obj)) {
            return obj;
        }

        keys = Object.keys(obj).sort(function (a, b) {
            return parseInt(a, 10) - parseInt(b, 10);
        });
        return keys.map(function (key) { return obj[key]; });
    };

    destroy = function () {
        if (roomRef) {
            if (gameStateListener) {
                roomRef.child("gameState").off("value", gameStateListener);
            }
            if (lastActionListener) {
                roomRef.child("lastAction").off("value", lastActionListener);
            }
        }
        gameStateListener = null;
        lastActionListener = null;
        lastSyncedVersion = null;
        roomRef = null;
        roomId = null;
        myIndex = null;
    };

    window.UnoludoMultiplayer = {
        init: init,
        setInitialState: setInitialState,
        submitAction: submitAction,
        updateGameState: updateGameState,
        isMyTurn: isMyTurn,
        getMyIndex: getMyIndex,
        getRoomId: getRoomId,
        getSyncedVersion: getSyncedVersion,
        unflattenState: unflattenState,
        destroy: destroy,
        onStateChange: function (callback) { onStateChangeCallback = callback; },
        onTurnChange: function (callback) { onTurnChangeCallback = callback; }
    };
}());
