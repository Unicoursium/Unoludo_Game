/**
 * lobby.js — Home screen, room creation, room joining, and waiting room.
 * Communicates with Firebase Realtime Database.
 */

(function () {
    "use strict";

    var leaveRoom;
    var removeCpuPlayer;
    var startRoomListener;
    var updatePlayersCount;

    // ---- DOM refs ----
    var homeScreen = document.getElementById("home-screen");
    var lobbyScreen = document.getElementById("lobby-screen");
    var roomScreen = document.getElementById("room-screen");
    var gameScreen = document.getElementById("game-screen");

    var btnSinglePlayer = document.getElementById("btn-single-player");
    var btnMultiPlayer = document.getElementById("btn-multi-player");
    var btnTutorial = document.getElementById("btn-tutorial");
    var btnEnhancedTutorial = document.getElementById("btn-enhanced-tutorial");

    var lobbyBack = document.getElementById("lobby-back");
    var playerNameInput = document.getElementById("player-name-input");
    var btnCreateRoom = document.getElementById("btn-create-room");
    var roomCodeInput = document.getElementById("room-code-input");
    var btnJoinRoom = document.getElementById("btn-join-room");

    var roomLeave = document.getElementById("room-leave");
    var roomCodeValue = document.getElementById("room-code-value");
    var btnCopyCode = document.getElementById("btn-copy-code");
    var roomPlayerList = document.getElementById("room-player-list");
    var roomStatus = document.getElementById("room-status");

    var cpuAddArea = document.getElementById("cpu-add-area");
    var btnAddCpu = document.getElementById("btn-add-cpu");
    var btnStartGame = document.getElementById("btn-start-game");

    // ---- State ----
    var currentRoomId = null;
    var currentPlayerIndex = null;
    var currentHostIndex = 0;
    var currentPlayers = {};
    var roomListener = null;
    var listenerRoomId = null;
    var gameStartCallback = null;

    var PLAYER_COLOURS = ["#4d96ff", "#6bcb77", "#ff6b6b", "#ffd93d"];

    // ---- Screen management ----
    function showScreen(screen) {
        [homeScreen, lobbyScreen, roomScreen, gameScreen].forEach(function (s) {
            s.classList.add("hidden");
        });
        screen.classList.remove("hidden");
    }

    // ---- Generate 4-digit room code ----
    function generateRoomCode() {
        var code = "";
        var i;

        for (i = 0; i < 4; i += 1) {
            code += Math.floor(Math.random() * 10).toString();
        }
        return code;
    }

    // ---- Room code validation ----
    function isValidRoomCode(code) {
        return (/^\d{4}$/).test(code);
    }

    // ---- Check if player is host ----
    function isHost() {
        return (
            currentPlayerIndex !== null &&
            currentPlayerIndex === currentHostIndex
        );
    }

    // ---- Count human and CPU players ----
    function countPlayers(players) {
        var human = 0;
        var cpu = 0;
        Object.keys(players).forEach(function (key) {
            if (players[key].isCPU) {
                cpu += 1;
            } else {
                human += 1;
            }
        });
        return { human: human, cpu: cpu, total: human + cpu };
    }

    // ---- Update player list UI ----
    function renderPlayerList(players) {
        roomPlayerList.innerHTML = "";
        var keys = Object.keys(players).sort();
        keys.forEach(function (key) {
            var p = players[key];
            var li = document.createElement("li");
            if (p.isCPU) {
                li.className = "cpu-player-item";
            }

            var dot = document.createElement("span");
            dot.className = "player-dot";
            dot.style.background = PLAYER_COLOURS[parseInt(key, 10)] || "#999";

            var name = document.createElement("span");
            if (p.isCPU) {
                name.innerHTML = "🤖 " + p.name + ' <span class="cpu-tag">CPU</span>';
            } else {
                name.textContent = p.name;
            }

            var label = document.createElement("span");
            label.className = "player-label";
            label.textContent = "P" + (parseInt(key, 10) + 1);

            li.appendChild(dot);
            li.appendChild(name);
            li.appendChild(label);

            // Host can remove CPU players (but not human players)
            if (isHost() && p.isCPU) {
                var removeBtn = document.createElement("button");
                removeBtn.className = "cpu-remove-btn";
                removeBtn.textContent = "✕";
                removeBtn.title = "Remove CPU";
                removeBtn.addEventListener("click", function () {
                    removeCpuPlayer(key);
                });
                li.appendChild(removeBtn);
            }

            roomPlayerList.appendChild(li);
        });

        // Show/hide add CPU button (host only, if slots available)
        if (isHost() && keys.length < 4) {
            cpuAddArea.style.display = "";
        } else {
            cpuAddArea.style.display = "none";
        }

        // Show/hide start game button (host only, all 4 slots must be filled)
        if (isHost() && keys.length >= 4) {
            btnStartGame.style.display = "";
        } else {
            btnStartGame.style.display = "none";
        }
    }

    // ---- Add CPU player ----
    function addCpuPlayer() {
        if (!isHost() || !currentRoomId) {
            return;
        }

        firebaseReady.then(function (user) {
            var roomRef = db.ref("rooms/" + currentRoomId);
            var colourNames = ["Blue", "Green", "Red", "Yellow"];

            roomRef.once("value", function (snapshot) {
                var room = snapshot.val();
                var players;
                var keys;
                var usedSlots;
                var newSlot = -1;
                var i;

                if (!room || room.status !== "waiting") {
                    return;
                }

                players = room.players || {};
                keys = Object.keys(players);

                if (keys.length >= 4) {
                    return;
                }

                usedSlots = keys.map(function (k) { return parseInt(k, 10); });
                for (i = 0; i < 4; i += 1) {
                    if (usedSlots.indexOf(i) === -1) {
                        newSlot = i;
                        break;
                    }
                }

                if (newSlot === -1) {
                    return;
                }

                roomRef.child("players/" + newSlot).transaction(function (slot) {
                    if (slot !== null) {
                        return;
                    }

                    return {
                        name: "CPU " + colourNames[newSlot],
                        uid: user.uid,
                        isCPU: true,
                        addedAt: Date.now()
                    };
                }, function (error, committed) {
                    if (!error && committed) {
                        updatePlayersCount(currentRoomId);
                    }
                });
            });
        }).catch(function () {
            alert("Could not sign in to Firebase. Please refresh and try again.");
        });
    }

    updatePlayersCount = function (roomId) {
        db.ref("rooms/" + roomId + "/players").once("value", function (snapshot) {
            var players = snapshot.val() || {};
            db.ref("rooms/" + roomId + "/playersCount").set(
                Object.keys(players).length
            );
        });
    };

    // ---- Remove CPU player ----
    removeCpuPlayer = function (slotKey) {
        if (!isHost() || !currentRoomId) {
            return;
        }

        db.ref("rooms/" + currentRoomId + "/players/" + slotKey)
            .remove()
            .then(function () {
                updatePlayersCount(currentRoomId);
            });
    };

    // ---- Create room ----
    function createRoom() {
        var name = playerNameInput.value.trim() || "Player 1";
        var code = generateRoomCode();

        firebaseReady.then(function (user) {
            var roomRef = db.ref("rooms/" + code);

            roomRef.once("value", function (snapshot) {
                if (snapshot.exists()) {
                    createRoom();
                    return;
                }

                var roomData = {
                    status: "waiting",
                    hostUid: user.uid,
                    hostIndex: 0,
                    createdAt: firebase.database.ServerValue.TIMESTAMP,
                    playersCount: 1,
                    players: {
                        "0": {
                            name: name,
                            uid: user.uid,
                            joinedAt: firebase.database.ServerValue.TIMESTAMP
                        }
                    }
                };

                roomRef.set(roomData).then(function () {
                    currentRoomId = code;
                    currentPlayerIndex = 0;
                    currentHostIndex = 0;
                    roomCodeValue.textContent = code;
                    showScreen(roomScreen);
                    roomStatus.textContent = "Waiting for players...";
                    startRoomListener(code);
                });
            });
        }).catch(function () {
            alert("Could not sign in to Firebase. Please refresh and try again.");
        });
    }

    // ---- Join room ----
    function joinRoom() {
        var code = roomCodeInput.value.trim();
        var name = playerNameInput.value.trim() || "Player 2";
        var joinToken = (
            Date.now().toString(36) +
            "-" +
            Math.random().toString(36).slice(2)
        );

        if (!isValidRoomCode(code)) {
            alert("Please enter a valid 4-digit code.");
            return;
        }

        firebaseReady.then(function (user) {
            var roomRef = db.ref("rooms/" + code);

            roomRef.once("value", function (roomSnap) {
                var existingRoom = roomSnap.val();

                if (!existingRoom) {
                    alert("Room not found. Check the code and try again.");
                    return;
                }

                if (existingRoom.status !== "waiting") {
                    alert("This game has already started.");
                    return;
                }

                var players = existingRoom.players || {};
                var keys = Object.keys(players);
                var usedSlots;
                var newIndex = -1;
                var i;

                if (keys.length >= 4) {
                    alert("Room is full.");
                    return;
                }

                usedSlots = keys.map(function (k) { return parseInt(k, 10); });
                for (i = 0; i < 4; i += 1) {
                    if (usedSlots.indexOf(i) === -1) {
                        newIndex = i;
                        break;
                    }
                }

                if (newIndex === -1) {
                    alert("Room is full.");
                    return;
                }

                roomRef.child("players/" + newIndex).transaction(function (slot) {
                    if (slot !== null) {
                        return;
                    }

                    return {
                        name: name,
                        uid: user.uid,
                        joinToken: joinToken,
                        joinedAt: Date.now()
                    };
                }, function (error, committed, snapshot) {
                    var player;

                    if (error) {
                        alert("Could not join room. Please try again.");
                        return;
                    }

                    if (!committed) {
                        alert("That player slot was just taken. Please try again.");
                        return;
                    }

                    player = snapshot.val();

                    if (!player || player.joinToken !== joinToken) {
                        alert("Could not confirm your player slot. Please try again.");
                        return;
                    }

                    currentRoomId = code;
                    currentPlayerIndex = newIndex;
                    currentHostIndex = (
                        existingRoom.hostIndex === undefined
                        ? 0
                        : existingRoom.hostIndex
                    );
                    updatePlayersCount(code);
                    roomCodeValue.textContent = code;
                    showScreen(roomScreen);
                    roomStatus.textContent = "Waiting for players...";
                    startRoomListener(code);
                });
            });
        }).catch(function () {
            alert("Could not sign in to Firebase. Please refresh and try again.");
        });
    }

    // ---- Listen for room changes ----
    startRoomListener = function (code) {
        var previousRoomId = listenerRoomId;
        if (roomListener) {
            db.ref("rooms/" + previousRoomId).off("value", roomListener);
        }
        listenerRoomId = code;

        roomListener = db.ref("rooms/" + code).on("value", function (snapshot) {
            var room = snapshot.val();
            if (!room) {
                alert("Room has been closed.");
                leaveRoom();
                return;
            }

            currentHostIndex = (
                room.hostIndex === undefined
                ? 0
                : room.hostIndex
            );
            currentPlayers = room.players || {};
            renderPlayerList(currentPlayers);

            var counts = countPlayers(currentPlayers);
            roomStatus.textContent = "Waiting for players... (" + counts.total + "/4)";

            console.log("[Lobby] Room update: status=" + room.status + " players=" + counts.total + " myIndex=" + currentPlayerIndex);

            if (room.status === "playing") {
                console.log("[Lobby] Game is playing! Triggering callback...");
                if (roomListener) {
                    db.ref("rooms/" + code).off("value", roomListener);
                    roomListener = null;
                }
                if (gameStartCallback) {
                    // Build the definitive playerKinds array from room data
                    // Every client must use the SAME array for consistency
                    var playerKinds = ["cpu", "cpu", "cpu", "cpu"];
                    var playerNames = [
                        "Player 1",
                        "Player 2",
                        "Player 3",
                        "Player 4"
                    ];
                    Object.keys(currentPlayers).forEach(function (key) {
                        var idx = parseInt(key, 10);
                        playerNames[idx] = currentPlayers[key].name || playerNames[idx];
                        if (currentPlayers[key].isCPU) {
                            playerKinds[idx] = "cpu";
                        } else {
                            playerKinds[idx] = "human";
                        }
                    });
                    console.log("[Lobby] Calling gameStartCallback with code=" + code + " index=" + currentPlayerIndex + " playerKinds=" + JSON.stringify(playerKinds));
                    gameStartCallback(
                        code,
                        currentPlayerIndex,
                        playerKinds,
                        playerNames
                    );
                } else {
                    console.log("[Lobby] WARNING: gameStartCallback is not set!");
                }
                return;
            }
        });
    };

    // ---- Leave room ----
    leaveRoom = function () {
        var roomId = currentRoomId;
        var playerIndex = currentPlayerIndex;

        if (roomListener && roomId) {
            db.ref("rooms/" + roomId).off("value", roomListener);
            roomListener = null;
            listenerRoomId = null;
        }

        if (roomId !== null && playerIndex !== null) {
            db.ref("rooms/" + roomId).transaction(function (room) {
                var remainingKeys;
                var hostIndex;

                if (!room || !room.players) {
                    return room;
                }

                delete room.players[playerIndex];
                remainingKeys = Object.keys(room.players);

                if (remainingKeys.length === 0) {
                    return null;
                }

                room.playersCount = remainingKeys.length;
                hostIndex = (
                    room.hostIndex === undefined
                    ? 0
                    : room.hostIndex
                );

                if (hostIndex === playerIndex) {
                    room.hostIndex = parseInt(remainingKeys.sort(function (a, b) {
                        return parseInt(a, 10) - parseInt(b, 10);
                    })[0], 10);
                }

                return room;
            });
        }

        currentRoomId = null;
        currentPlayerIndex = null;
        currentHostIndex = 0;
        currentPlayers = {};
        showScreen(lobbyScreen);
    };

    // ---- Start the game (host only) ----
    function startGame() {
        if (!isHost()) {
            return;
        }
        var roomRef = db.ref("rooms/" + currentRoomId);
        roomRef.update({ status: "playing" });
    }

    // ---- Event bindings ----
    btnSinglePlayer.addEventListener("click", function () {
        showScreen(gameScreen);
        if (window.UnoludoApp && window.UnoludoApp.startSinglePlayer) {
            window.UnoludoApp.startSinglePlayer();
        }
    });

    btnMultiPlayer.addEventListener("click", function () {
        showScreen(lobbyScreen);
    });

    if (btnTutorial !== null) {
        btnTutorial.addEventListener("click", function () {
            showScreen(gameScreen);
            if (window.UnoludoApp && window.UnoludoApp.startTutorial) {
                window.UnoludoApp.startTutorial();
            }
        });
    }

    if (btnEnhancedTutorial !== null) {
        btnEnhancedTutorial.addEventListener("click", function () {
            showScreen(gameScreen);
            if (window.UnoludoApp && window.UnoludoApp.startEnhancedTutorial) {
                window.UnoludoApp.startEnhancedTutorial();
            }
        });
    }

    lobbyBack.addEventListener("click", function () {
        showScreen(homeScreen);
    });

    btnCreateRoom.addEventListener("click", function () {
        createRoom();
    });

    btnJoinRoom.addEventListener("click", function () {
        joinRoom();
    });

    roomCodeInput.addEventListener("keydown", function (e) {
        if (e.key === "Enter") {
            joinRoom();
        }
    });

    roomLeave.addEventListener("click", function () {
        leaveRoom();
    });

    btnCopyCode.addEventListener("click", function () {
        if (currentRoomId) {
            navigator.clipboard.writeText(currentRoomId).then(function () {
                btnCopyCode.textContent = "Copied!";
                setTimeout(function () {
                    btnCopyCode.textContent = "Copy";
                }, 1500);
            });
        }
    });

    btnAddCpu.addEventListener("click", function () {
        addCpuPlayer();
    });

    btnStartGame.addEventListener("click", function () {
        startGame();
    });

    // ---- Public API ----
    window.UnoludoLobby = {
        showScreen: showScreen,
        getHomeScreen: function () { return homeScreen; },
        getGameScreen: function () { return gameScreen; },
        getCurrentRoomId: function () { return currentRoomId; },
        getCurrentPlayerIndex: function () { return currentPlayerIndex; },
        getCurrentHostIndex: function () { return currentHostIndex; },
        startGame: startGame,
        onGameStart: function (callback) { gameStartCallback = callback; }
    };

    // Show home screen on load
    showScreen(homeScreen);
}());
