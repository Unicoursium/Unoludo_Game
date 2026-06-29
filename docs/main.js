/*global document, window, globalThis, Unoludo, UnoludoBoard, UnoludoAssets*/
"use strict";

var state;
var rendered_discard_card_id;
var selected_card_id;
var combo_card_id;
var target_mode;
var cpu_timer;
var winner_popup_shown = false;
var sound_enabled = true;
var audio_context;
var pending_render_effects;
var active_piece_animations = 0;
var gameMode = "none";
var tutorialLevelIndex = 0;
var tutorialCompletionTimer;
var tutorialAcknowledged = false;
var tutorialAckPending = false;
var myPlayerIndex = 0;
var mpStateSynced = false;
var multiplayerCpuAuthorityIndex = 0;
var draw_streaks = Object.create(null);
var CPU_TURN_DELAY = 1600;
var PIECE_STEP_INTERVAL = 230;
var PIECE_STEP_VARIATIONS = Object.freeze([-18, 12, -7, 20, -12, 8]);
var PIECE_STEP_START_DELAY = 90;
var PIECE_STEP_FINISH_DELAY = 140;
var piece_elements = Object.create(null);
var previous_piece_snapshots = Object.create(null);
var piece_animation_tokens = Object.create(null);
var draw_end_turn_button = document.getElementById("draw-end-turn");
var sound_toggle_button = document.getElementById("sound-toggle");
var tutorial_prev_button = document.getElementById("tutorial-prev");
var tutorial_exit_button = document.getElementById("tutorial-exit");
var single_exit_button = document.getElementById("single-exit");
var tutorial_panel = document.getElementById("tutorial-panel");
var tutorial_level_label = document.getElementById("tutorial-level-label");
var tutorial_title = document.getElementById("tutorial-title");
var tutorial_instruction = document.getElementById("tutorial-instruction");
var tutorial_coach_layer = document.getElementById("tutorial-coach-layer");
var tutorial_complete_overlay = document.getElementById("tutorial-complete-overlay");
var tutorial_complete_title = document.getElementById("tutorial-complete-title");
var action_message;
var apply_multiplayer_turn_controls;
var check_tutorial_progress;
var exit_single_player;
var exit_tutorial;
var hand_cards;
var hide_tutorial_coach;
var load_tutorial_level;
var piece_key_for;
var play_reward_on_plane;
var play_reverse_on_plane;
var play_selected_card_on_plane;
var play_selected_card_without_plane;
var play_skip_on_plane;
var play_wild_on_plane;
var prepare_card_effects_from_next_state;
var prepare_render_effects;
var render;
var render_tutorial_coach;
var reset_local_runtime_state;
var sync_multiplayer_state;
var tutorial_levels;
var tutorial_series_title;
var update_tutorial_panel;
var update_mode_controls;

var initGameState = function (playerNames, options) {
    state = Unoludo.create_initial_state(playerNames, options || {});

    if (options !== undefined && options.playerKinds !== undefined) {
        state = Object.freeze({
            draw_pile: state.draw_pile,
            discard_pile: state.discard_pile,
            players: Object.freeze(state.players.map(function (player, index) {
                return Object.freeze({
                    id: player.id,
                    name: player.name,
                    colour: player.colour,
                    kind: options.playerKinds[index] || player.kind,
                    hand: player.hand,
                    planes: player.planes
                });
            })),
            current_player: state.current_player,
            active_colour: state.active_colour,
            winner: state.winner,
            player_moods: state.player_moods,
            log: state.log
        });
    }

    return state;
};

var tutorial_plane = function (status, position, options) {
    var plane_options = options || {};

    return Object.freeze({
        status: status,
        position: position,
        shielded: plane_options.shielded || false,
        frozen: plane_options.frozen || false
    });
};

var tutorial_player = function (id, name, colour, hand, planes) {
    return Object.freeze({
        id: id,
        name: name,
        colour: colour,
        kind: "human",
        hand: Object.freeze(hand),
        planes: Object.freeze(planes)
    });
};

var tutorial_four_planes = function (first_plane) {
    return Object.freeze([first_plane].concat(Unoludo.empty_planes().slice(1)));
};

var tutorial_state = function (players, top_card, options) {
    var state_options = options || {};

    return Object.freeze({
        draw_pile: Object.freeze(state_options.draw_pile || []),
        discard_pile: Object.freeze(state_options.discard_pile || [top_card]),
        players: Object.freeze(players),
        current_player: state_options.current_player || 0,
        active_colour: state_options.active_colour || top_card.colour,
        winner: undefined,
        player_moods: Object.freeze({}),
        log: Object.freeze(state_options.log || ["Tutorial level started."])
    });
};

var AudioContextClass = window.AudioContext || window.webkitAudioContext;

var audio_time = function () {
    if (!sound_enabled || AudioContextClass === undefined) {
        return undefined;
    }

    if (audio_context === undefined) {
        audio_context = new AudioContextClass();
    }

    if (audio_context.state === "suspended") {
        audio_context.resume();
    }

    return audio_context.currentTime;
};

var connect_to_output = function (node, gain_value, start_time, duration) {
    var gain = audio_context.createGain();

    gain.gain.setValueAtTime(0.0001, start_time);
    gain.gain.exponentialRampToValueAtTime(gain_value, start_time + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, start_time + duration);

    node.connect(gain);
    gain.connect(audio_context.destination);

    return gain;
};

var create_noise_source = function (duration) {
    var sample_rate = audio_context.sampleRate;
    var buffer = audio_context.createBuffer(
        1,
        Math.max(1, Math.floor(sample_rate * duration)),
        sample_rate
    );
    var data = buffer.getChannelData(0);
    var source = audio_context.createBufferSource();
    var index;

    for (index = 0; index < data.length; index += 1) {
        data[index] = Math.random() * 2 - 1;
    }

    source.buffer = buffer;
    return source;
};

var play_tone = function (frequency, duration, type, gain_value, delay) {
    var start_time = audio_time();
    var oscillator;

    if (start_time === undefined) {
        return;
    }

    oscillator = audio_context.createOscillator();
    oscillator.type = type || "sine";
    oscillator.frequency.setValueAtTime(frequency, start_time + (delay || 0));
    connect_to_output(
        oscillator,
        gain_value || 0.08,
        start_time + (delay || 0),
        duration
    );
    oscillator.start(start_time + (delay || 0));
    oscillator.stop(start_time + (delay || 0) + duration + 0.02);
};

var playCardSound = function () {
    var start_time = audio_time();
    var noise = start_time === undefined ? undefined : create_noise_source(0.055);
    var filter;

    if (noise === undefined) {
        return;
    }

    filter = audio_context.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.setValueAtTime(1850, start_time);
    filter.Q.setValueAtTime(7, start_time);
    noise.connect(filter);
    connect_to_output(filter, 0.16, start_time, 0.055);
    noise.start(start_time);
    noise.stop(start_time + 0.07);
};

var playMoveSound = function () {
    var start_time = audio_time();
    var noise = start_time === undefined ? undefined : create_noise_source(0.22);
    var filter;

    if (noise === undefined) {
        return;
    }

    filter = audio_context.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(280, start_time);
    filter.frequency.exponentialRampToValueAtTime(1450, start_time + 0.18);
    noise.connect(filter);
    connect_to_output(filter, 0.08, start_time, 0.22);
    noise.start(start_time);
    noise.stop(start_time + 0.24);
};

var playCaptureSound = function () {
    var start_time = audio_time();
    var thump = start_time === undefined ? undefined : audio_context.createOscillator();
    var crack = start_time === undefined ? undefined : create_noise_source(0.08);
    var filter;

    if (thump === undefined || crack === undefined) {
        return;
    }

    thump.type = "sine";
    thump.frequency.setValueAtTime(110, start_time);
    thump.frequency.exponentialRampToValueAtTime(48, start_time + 0.16);
    connect_to_output(thump, 0.18, start_time, 0.18);
    thump.start(start_time);
    thump.stop(start_time + 0.2);

    filter = audio_context.createBiquadFilter();
    filter.type = "highpass";
    filter.frequency.setValueAtTime(2600, start_time);
    crack.connect(filter);
    connect_to_output(filter, 0.13, start_time, 0.075);
    crack.start(start_time);
    crack.stop(start_time + 0.09);
};

var playDrawSound = function () {
    var start_time = audio_time();
    var oscillator = start_time === undefined ? undefined : audio_context.createOscillator();

    if (oscillator === undefined) {
        return;
    }

    oscillator.type = "triangle";
    oscillator.frequency.setValueAtTime(260, start_time);
    oscillator.frequency.exponentialRampToValueAtTime(760, start_time + 0.2);
    connect_to_output(oscillator, 0.07, start_time, 0.23);
    oscillator.start(start_time);
    oscillator.stop(start_time + 0.25);
};

var playWinSound = function () {
    [523.25, 659.25, 783.99, 1046.5].forEach(function (frequency, index) {
        play_tone(frequency, 0.22, "triangle", 0.09, index * 0.12);
    });
};

var playShieldSound = function () {
    var start_time = audio_time();
    var oscillator = start_time === undefined ? undefined : audio_context.createOscillator();

    if (oscillator === undefined) {
        return;
    }

    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(1320, start_time);
    oscillator.frequency.exponentialRampToValueAtTime(2180, start_time + 0.04);
    connect_to_output(oscillator, 0.08, start_time, 0.24);
    oscillator.start(start_time);
    oscillator.stop(start_time + 0.26);
};

var playFreezeSound = function () {
    var start_time = audio_time();
    var noise = start_time === undefined ? undefined : create_noise_source(0.16);
    var filter;

    if (noise === undefined) {
        return;
    }

    filter = audio_context.createBiquadFilter();
    filter.type = "highpass";
    filter.frequency.setValueAtTime(3600, start_time);
    filter.Q.setValueAtTime(5, start_time);
    noise.connect(filter);
    connect_to_output(filter, 0.09, start_time, 0.16);
    noise.start(start_time);
    noise.stop(start_time + 0.18);
};

var playTurnSound = function () {
    play_tone(880, 0.12, "sine", 0.045, 0);
};

if (sound_toggle_button !== null) {
    sound_toggle_button.addEventListener("click", function () {
        sound_enabled = !sound_enabled;
        sound_toggle_button.textContent = sound_enabled ? "Sound On" : "Sound Off";
        sound_toggle_button.setAttribute("aria-pressed", String(sound_enabled));
    });
}

var clear_selection = function () {
    selected_card_id = undefined;
    combo_card_id = undefined;
    target_mode = undefined;
};

var has_base_plane = function (player) {
    return player.planes.some(function (plane) {
        return plane.status === "base";
    });
};

var has_playable_launch_six = function (player, test_state) {
    if (!has_base_plane(player)) {
        return false;
    }

    return player.hand.some(function (card) {
        return (
            (card.type === "number" || card.type === "reward") &&
            card.value === 6 &&
            Unoludo.can_play_card(card, test_state)
        );
    });
};

var increment_draw_streak = function (player_id) {
    if (draw_streaks[player_id] === undefined) {
        draw_streaks[player_id] = 0;
    }
    draw_streaks[player_id] += 1;
};

var reset_draw_streak = function (player_id) {
    draw_streaks[player_id] = 0;
};

var has_no_planes_on_track = function (player) {
    return player.planes.every(function (plane) {
        return plane.status !== "track";
    });
};

var check_draw_streak_p6 = function (player_id) {
    if (draw_streaks[player_id] === 3) {
        draw_streaks[player_id] = 0;
        return true;
    }
    return false;
};
var colour_overlay = document.getElementById("colour-overlay");
var colour_choice_buttons = document.querySelectorAll(".colour-choice");

var wild4_option_overlay = document.getElementById("wild4-option-overlay");
var wild4_draw4_choice = document.getElementById("wild4-draw4-choice");
var wild4_move_choice = document.getElementById("wild4-move-choice");
var reverse_step_overlay = document.getElementById("reverse-step-overlay");
var reverse_step_buttons = document.querySelectorAll("[data-reverse-step]");
var winner_overlay = document.getElementById("winner-overlay");
var winner_name = document.getElementById("winner-name");
var winner_restart_button = document.getElementById("winner-restart");
var player_colour_hex = function (colour) {
    if (colour === "blue") {
        return "#4979E0";
    }

    if (colour === "green") {
        return "#48DB73";
    }

    if (colour === "red") {
        return "#BD2222";
    }

    if (colour === "yellow") {
        return "#E5CA22";
    }

    return "#f8fafc";
};

var colour_label = function (colour) {
    if (typeof colour !== "string" || colour.length === 0) {
        return "Any";
    }

    return colour.charAt(0).toUpperCase() + colour.slice(1);
};

var card_match_label = function (card) {
    if (card.type === "number") {
        return String(card.value);
    }

    if (card.type === "skip") {
        return "Skip";
    }

    if (card.type === "reverse") {
        return "Reverse";
    }

    if (card.type === "draw2") {
        return "+2";
    }

    if (card.type === "wild") {
        return "Wild";
    }

    if (card.type === "wild4") {
        return "+4";
    }

    if (card.type === "reward") {
        return String(card.value);
    }

    return card.type;
};
var show_winner_popup = function () {
    var winner;

    if (state.winner === undefined || winner_popup_shown) {
        return;
    }

    winner = state.players[state.winner];

    winner_name.textContent = winner.name;
    winner_name.style.color = player_colour_hex(winner.colour);

    winner_overlay.classList.remove("hidden");
    winner_popup_shown = true;
};

var hide_winner_popup = function () {
    winner_overlay.classList.add("hidden");
};
var played_card_title = document.getElementById("played-card-title");
var played_card_image = document.getElementById("played-card-image");
var player_status_panel = document.getElementById("player-status-panel");
var hand_play_hint = document.getElementById("hand-play-hint");
var hand_play_colour_swatch = document.getElementById("hand-play-colour-swatch");
var hand_play_colour = document.getElementById("hand-play-colour");
var hand_play_type = document.getElementById("hand-play-type");
var open_log_button = document.getElementById("open-log");
var log_overlay = document.getElementById("log-overlay");
var close_log_button = document.getElementById("close-log");
var log_overlay_list = document.getElementById("log-overlay-list");
var debug_move_button = document.getElementById("debug-move");
var give_card_button = document.getElementById("give-card");

var render_log_overlay = function () {
    log_overlay_list.replaceChildren();

    state.log.forEach(function (message) {
        var item = document.createElement("li");
        item.textContent = message;
        log_overlay_list.appendChild(item);
    });
};

var open_log = function () {
    render_log_overlay();
    log_overlay.classList.remove("hidden");
};

var close_log = function () {
    log_overlay.classList.add("hidden");
};

var player_id_by_colour = function (colour) {
    var player = state.players.filter(function (candidate) {
        return candidate.colour === colour;
    })[0];

    if (player === undefined) {
        return undefined;
    }

    return player.id;
};

var debug_plane_from_input = function (position_input) {
    var trimmed = position_input.trim().toLowerCase();
    var value;

    if (trimmed === "base") {
        return Object.freeze({
            status: "base",
            position: -1,
            shielded: false,
            frozen: false
        });
    }

    if (trimmed === "gate") {
        return Object.freeze({
            status: "gate",
            position: -1,
            shielded: false,
            frozen: false
        });
    }

    if (trimmed === "finished") {
        return Object.freeze({
            status: "finished",
            position: Unoludo.home_lane_length,
            shielded: false,
            frozen: false
        });
    }

    if (trimmed.indexOf("home:") === 0) {
        value = Number(trimmed.slice(5));

        if (
            Number.isInteger(value) &&
            value >= 0 &&
            value < Unoludo.home_lane_length
        ) {
            return Object.freeze({
                status: "home",
                position: value,
                shielded: false,
                frozen: false
            });
        }

        return undefined;
    }

    if (trimmed.indexOf("track:") === 0) {
        value = Number(trimmed.slice(6));
    } else {
        value = Number(trimmed);
    }

    if (
        Number.isInteger(value) &&
        value >= 0 &&
        value < Unoludo.track_length
    ) {
        return Object.freeze({
            status: "track",
            position: value,
            shielded: false,
            frozen: false
        });
    }

    return undefined;
};

if (debug_move_button !== null) {
    debug_move_button.addEventListener("click", function () {
        if (gameMode === "multi") {
            return;
        }
        var colour = window.prompt(
            "Choose plane colour: blue, green, red, yellow"
        );

        var plane_index_text = window.prompt(
            "Choose plane index: 0, 1, 2, or 3"
        );

        var position_text = window.prompt(
            "Enter position: number, track:number, home:number, gate, base, or finished"
        );

        var player_id = player_id_by_colour(
            colour === null
            ? ""
            : colour.trim().toLowerCase()
        );

        var plane_index = Number(plane_index_text);
        var new_plane = (
            position_text === null
            ? undefined
            : debug_plane_from_input(position_text)
        );

        if (
            player_id === undefined ||
            !Number.isInteger(plane_index) ||
            plane_index < 0 ||
            plane_index > 3 ||
            new_plane === undefined
        ) {
            action_message.textContent = "Debug move failed: invalid input.";
            return;
        }

        var next_state = Unoludo.update_plane(
            state,
            player_id,
            plane_index,
            new_plane
        );

        prepare_render_effects(state, next_state, {});
        state = next_state;
        clear_selection();
        action_message.textContent = (
            "Debug moved " + colour + " plane " + plane_index + "."
        );
        render();
    });
}

var colour_from_card_code = function (letter) {
    if (letter === "B") {
        return "blue";
    }

    if (letter === "G") {
        return "green";
    }

    if (letter === "R") {
        return "red";
    }

    if (letter === "Y") {
        return "yellow";
    }

    return undefined;
};

var create_debug_card_from_code = function (code) {
    var normalised = code.trim().toUpperCase();
    var colour = colour_from_card_code(normalised[0]);
    var symbol = normalised.slice(1);
    var unique_suffix = Date.now() + "-" + Math.random().toString(36).slice(2);
    var value;

    if (normalised === "PW") {
        return Unoludo.card(
            "debug-wild-" + unique_suffix,
            "wild",
            "wild"
        );
    }

    if (normalised === "P4") {
        return Unoludo.card(
            "debug-wild4-" + unique_suffix,
            "wild4",
            "wild"
        );
    }

    if (
        normalised === "P6" ||
        normalised === "P7" ||
        normalised === "P8" ||
        normalised === "P9"
    ) {
        value = Number(normalised.slice(1));

        return Unoludo.card(
            "debug-reward-" + value + "-" + unique_suffix,
            "reward",
            "wild",
            value
        );
    }

    if (colour === undefined) {
        return undefined;
    }

    if (/^[0-6]$/.test(symbol)) {
        value = Number(symbol);

        return Unoludo.card(
            "debug-" + colour + "-number-" + value + "-" + unique_suffix,
            "number",
            colour,
            value
        );
    }

    if (symbol === "S") {
        return Unoludo.card(
            "debug-" + colour + "-skip-" + unique_suffix,
            "skip",
            colour
        );
    }

    if (symbol === "R") {
        return Unoludo.card(
            "debug-" + colour + "-reverse-" + unique_suffix,
            "reverse",
            colour
        );
    }

    if (symbol === "P" || symbol === "+2") {
        return Unoludo.card(
            "debug-" + colour + "-draw2-" + unique_suffix,
            "draw2",
            colour
        );
    }

    return undefined;
};

var give_card_to_current_player = function (card) {
    var player = Unoludo.current_player(state);
    var updated_player = Object.freeze({
        id: player.id,
        name: player.name,
        colour: player.colour,
        kind: player.kind,
        hand: Unoludo.sorted_hand(player.hand.concat([card])),
        planes: player.planes
    });

    state = Unoludo.update_player(
        state,
        player.id,
        updated_player
    );
};

if (give_card_button !== null) {
    give_card_button.addEventListener("click", function () {
        if (gameMode === "multi") {
            return;
        }
        var code = window.prompt(
            "Enter card code, e.g. B3, YR, GS, RP, PW, P4, P7, P8, P9"
        );

        var card;

        if (code === null) {
            return;
        }

        card = create_debug_card_from_code(code);

        if (card === undefined) {
            action_message.textContent = "Give card failed: invalid card code.";
            return;
        }

        var before_state = state;

        give_card_to_current_player(card);
        prepare_render_effects(before_state, state, {});
        clear_selection();
        action_message.textContent = "Gave card " + code.toUpperCase() + " to current player.";
        render();
    });
}

open_log_button.addEventListener("click", open_log);
close_log_button.addEventListener("click", close_log);

var is_active_plane = function (plane) {
    return (
        plane.status === "gate" ||
        plane.status === "track" ||
        plane.status === "home"
    );
};

var is_cpu_self_target_plane = function (plane) {
    return (
        plane.status === "base" ||
        is_active_plane(plane)
    );
};

var track_distance = function (from_position, to_position) {
    return (
        (to_position - from_position + Unoludo.track_length) %
        Unoludo.track_length
    );
};

var projected_track_position = function (player, from_position, steps) {
    var raw_position = (
        (from_position + steps + Unoludo.track_length) %
        Unoludo.track_length
    );
    var jump = Unoludo.jump_positions[player.colour];

    if (jump !== undefined && raw_position === jump.from) {
        return jump.to;
    }

    return raw_position;
};

var plane_progress = function (player, plane) {
    var start_position = Unoludo.start_positions[player.colour];
    var entry_position = Unoludo.home_entry_positions[player.colour];
    var entry_distance;

    if (plane.status === "finished") {
        return Unoludo.track_length + Unoludo.home_lane_length + 1;
    }

    if (plane.status === "home") {
        entry_distance = track_distance(start_position, entry_position);
        return entry_distance + 2 + plane.position;
    }

    if (plane.status === "track") {
        return track_distance(start_position, plane.position) + 1;
    }

    if (plane.status === "gate") {
        return 0;
    }

    return -1;
};

var distance_to_home = function (player, plane) {
    if (plane.status === "finished") {
        return 0;
    }

    if (plane.status === "home") {
        return Unoludo.home_lane_length - plane.position;
    }

    if (plane.status === "track") {
        return (
            1 +
            track_distance(
                plane.position,
                Unoludo.home_entry_positions[player.colour]
            ) +
            Unoludo.home_lane_length +
            1
        );
    }

    return Unoludo.track_length + Unoludo.home_lane_length;
};

var card_matches_next_colour = function (card, colour) {
    return (
        card.colour === colour ||
        card.colour === "wild"
    );
};

var count_active_planes = function (player) {
    return player.planes.filter(is_active_plane).length;
};

var can_capture_plane_with_steps = function (
    attacker,
    attacker_plane,
    target_plane,
    steps
) {
    if (
        attacker_plane.status !== "track" ||
        attacker_plane.frozen ||
        target_plane.status !== "track" ||
        target_plane.shielded
    ) {
        return false;
    }

    return projected_track_position(
        attacker,
        attacker_plane.position,
        steps
    ) === target_plane.position;
};

var player_can_capture_plane = function (
    attacker,
    target_plane
) {
    if (target_plane.status !== "track" || target_plane.shielded) {
        return false;
    }

    return attacker.hand.some(function (card) {
        var steps;

        if (card.type === "number" && card.value >= 1 && card.value <= 6) {
            steps = card.value;
        } else if (card.type === "wild") {
            steps = 6;
        } else {
            return false;
        }

        return attacker.planes.some(function (attacker_plane) {
            return can_capture_plane_with_steps(
                attacker,
                attacker_plane,
                target_plane,
                steps
            );
        });
    });
};

var plane_is_threatened = function (board_state, player_id, plane_index) {
    var player = board_state.players[player_id];
    var plane = player.planes[plane_index];

    return board_state.players.some(function (opponent) {
        if (opponent.id === player_id) {
            return false;
        }

        return player_can_capture_plane(opponent, plane);
    });
};

var opponent_near_own_plane = function (own_plane, opponent_plane) {
    if (own_plane.status !== "track" || opponent_plane.status !== "track") {
        return false;
    }

    return track_distance(opponent_plane.position, own_plane.position) <= 3;
};

var count_threatened_planes = function (board_state, player_id) {
    var player = board_state.players[player_id];

    return player.planes.filter(function (plane, plane_index) {
        return is_active_plane(plane) && plane_is_threatened(
            board_state,
            player_id,
            plane_index
        );
    }).length;
};

var capture_count_against_player = function (
    before_state,
    after_state,
    player_id
) {
    var count = 0;

    before_state.players[player_id].planes.forEach(function (before_plane, index) {
        var after_plane = after_state.players[player_id].planes[index];

        if (
            before_plane.status !== "base" &&
            before_plane.status !== "finished" &&
            after_plane.status === "base"
        ) {
            count += 1;
        }
    });

    return count;
};

var score_colour_for_cpu = function (player, colour) {
    var score = 0;

    player.hand.forEach(function (card) {
        if (card_matches_next_colour(card, colour)) {
            score += 4;
        }

        if (card.colour === colour && card.type !== "number") {
            score += 2;
        }
    });

    player.planes.forEach(function (plane) {
        if (is_active_plane(plane)) {
            score += 1;
        }
    });

    return score;
};

var choose_colour_for_cpu = function (player, board_state) {
    var counts = {
        blue: 0,
        green: 0,
        red: 0,
        yellow: 0
    };
    var colour_scores = {
        blue: 0,
        green: 0,
        red: 0,
        yellow: 0
    };

    var best_colour = player.colour;

    player.hand.forEach(function (card) {
        if (counts[card.colour] !== undefined) {
            counts[card.colour] += 1;
        }
    });

    Object.keys(colour_scores).forEach(function (colour) {
        colour_scores[colour] = (
            score_colour_for_cpu(player, colour) +
            counts[colour]
        );

        if (board_state !== undefined) {
            board_state.players.forEach(function (opponent) {
                if (opponent.id === player.id) {
                    return;
                }

                opponent.hand.forEach(function (card) {
                    if (card_matches_next_colour(card, colour)) {
                        colour_scores[colour] -= 1.5;
                    }
                });

                opponent.planes.forEach(function (plane) {
                    if (
                        plane.status === "track" &&
                        distance_to_home(opponent, plane) <= 8
                    ) {
                        colour_scores[colour] -= 0.5;
                    }
                });
            });
        }

        if (
            colour_scores[colour] > colour_scores[best_colour] ||
            (
                colour_scores[colour] === colour_scores[best_colour] &&
                counts[colour] > counts[best_colour]
            )
        ) {
            best_colour = colour;
        }
    });

    return best_colour;
};

var move_reason_from_score = function (details) {
    if (details.finished) {
        return "finished a plane";
    }

    if (details.captures > 0) {
        return "captured an opponent plane";
    }

    if (details.shielded_threat) {
        return "shielded a threatened plane";
    }

    if (details.prevented_threat) {
        return "protected a plane from capture";
    }

    if (details.frozen_planes > 0) {
        return "froze active opponent planes";
    }

    if (details.reversed_close_plane) {
        return "pushed back a plane near home";
    }

    if (details.launched) {
        return "launched a plane";
    }

    if (details.setup_capture) {
        return "set up a capture";
    }

    if (details.draw_pressure) {
        return "built card pressure while behind";
    }

    if (details.progress > 0) {
        return "advanced toward home";
    }

    return "kept the best position";
};

var score_cpu_move = function (before_state, move) {
    var player = before_state.players[move.player_id];
    var after_player = move.state.players[move.player_id];
    var before_threats = count_threatened_planes(before_state, player.id);
    var after_threats = count_threatened_planes(move.state, player.id);
    var details = {
        captures: 0,
        frozen_planes: 0,
        progress: 0,
        draw_pressure: false,
        finished: false,
        launched: false,
        prevented_threat: after_threats < before_threats,
        reversed_close_plane: false,
        setup_capture: false,
        shielded_threat: false
    };
    var score = 0;

    before_state.players.forEach(function (target_player) {
        if (target_player.id === player.id) {
            return;
        }

        target_player.planes.forEach(function (before_plane, plane_index) {
            var after_plane = move.state
                .players[target_player.id]
                .planes[plane_index];
            var close_to_home = distance_to_home(target_player, before_plane);
            var before_progress = plane_progress(target_player, before_plane);
            var after_progress = plane_progress(target_player, after_plane);

            if (
                before_plane.status !== "base" &&
                before_plane.status !== "finished" &&
                after_plane.status === "base"
            ) {
                var capture_score = 15 + Math.max(0, 12 - close_to_home);
                details.captures += 1;
                score += (
                    target_player.kind === "human" && close_to_home <= 8
                    ? Math.max(6, Math.floor(capture_score * 0.35))
                    : capture_score
                );
            }

            if (
                after_plane.frozen &&
                !before_plane.frozen &&
                is_active_plane(before_plane)
            ) {
                details.frozen_planes += count_active_planes(target_player);
                score += 8 * count_active_planes(target_player);
            }

            if (move.kind === "reverse" && after_progress < before_progress) {
                score += 10 + Math.max(0, 10 - close_to_home);
                if (close_to_home <= 10) {
                    details.reversed_close_plane = true;
                }
            }
        });
    });

    player.planes.forEach(function (before_plane, plane_index) {
        var after_plane = after_player.planes[plane_index];
        var before_progress = plane_progress(player, before_plane);
        var after_progress = plane_progress(player, after_plane);
        var gained = Math.max(0, after_progress - before_progress);

        if (before_plane.status === "base" && after_plane.status === "gate") {
            details.launched = true;
            score += (
                move.kind === "reward" || move.kind === "wild"
                ? 32
                : 24
            );
        }

        if (before_plane.status !== "finished" && after_plane.status === "finished") {
            details.finished = true;
            score += 25;
        }

        if (before_plane.status === "home" || after_plane.status === "home") {
            score += gained * 5;
        } else {
            score += gained * 3;
        }

        details.progress += gained;

        if (
            before_plane.shielded !== true &&
            after_plane.shielded === true &&
            plane_is_threatened(before_state, player.id, plane_index)
        ) {
            details.shielded_threat = true;
            score += 22;
        }

        if (
            plane_is_threatened(before_state, player.id, plane_index) &&
            !plane_is_threatened(move.state, player.id, plane_index)
        ) {
            score += 12;
        }
    });

    if (move.kind === "zero") {
        score += 10;
    }

    if (move.kind === "draw2" && player.hand.length < 4) {
        details.draw_pressure = true;
        score += 6;
    }

    if (
        move.target_player_id === player.id &&
        (
            move.kind === "reward" ||
            move.kind === "wild" ||
            move.kind === "wild4"
        )
    ) {
        score += 14;
    }

    if (move.kind === "wild4" && move.option === "advance_all") {
        score -= capture_count_against_player(
            before_state,
            move.state,
            player.id
        ) * 20;
    }

    before_state.players.forEach(function (opponent) {
        if (opponent.id === player.id) {
            return;
        }

        move.state.players[opponent.id].planes.forEach(function (opponent_plane) {
            if (opponent_plane.status !== "track") {
                return;
            }

            after_player.planes.forEach(function (own_plane) {
                var has_capture_card = after_player.hand.some(function (card) {
                    return (
                        card.type === "number" &&
                        card.value >= 1 &&
                        card.value <= 6 &&
                        own_plane.status === "track" &&
                        track_distance(own_plane.position, opponent_plane.position) === card.value
                    );
                });

                if (has_capture_card) {
                    details.setup_capture = true;
                    score += 7;
                }
            });
        });
    });

    before_state.players.forEach(function (opponent) {
        if (opponent.id === player.id) {
            return;
        }

        opponent.planes.forEach(function (opponent_plane) {
            player.planes.forEach(function (own_plane) {
                if (opponent_near_own_plane(own_plane, opponent_plane)) {
                    score += (
                        move.kind === "skip" || move.kind === "reverse"
                        ? 6
                        : 0
                    );
                }
            });
        });
    });

    score += choose_colour_for_cpu(after_player, move.state) === move.chosen_colour ? 2 : 0;

    move.score = score;
    move.reason = move_reason_from_score(details);

    return move;
};

var create_cpu_move = function (before_state, player, next_state, kind, message, extra) {
    var move = {
        player_id: player.id,
        state: next_state,
        kind: kind,
        message: message
    };

    Object.keys(extra || {}).forEach(function (key) {
        move[key] = extra[key];
    });

    return score_cpu_move(before_state, move);
};

var find_cpu_number_move = function (cpu_state, player) {
    var moves = [];

    player.hand.some(function (card) {
        if (
            !Unoludo.can_play_card(card, cpu_state) ||
            card.type !== "number" ||
            card.value < 1 ||
            card.value > 6
        ) {
            return false;
        }

        player.planes.forEach(function (plane, plane_index) {
            var next_state = Unoludo.play_number_card(
                cpu_state,
                card.id,
                plane_index
            );

            if (next_state !== undefined) {
                moves.push(create_cpu_move(
                    cpu_state,
                    player,
                    next_state,
                    "number",
                    player.name + " played a number card",
                    {card: card, plane_index: plane_index}
                ));
            }
        });

    });

    return moves;
};

var find_cpu_zero_move = function (cpu_state, player) {
    var moves = [];

    player.hand.some(function (card) {
        if (
            !Unoludo.can_play_card(card, cpu_state) ||
            card.type !== "number" ||
            card.value !== 0
        ) {
            return false;
        }

        player.planes.forEach(function (plane, plane_index) {
            var next_state = Unoludo.play_zero_card(
                cpu_state,
                card.id,
                plane_index
            );

            if (next_state !== undefined) {
                moves.push(create_cpu_move(
                    cpu_state,
                    player,
                    next_state,
                    "zero",
                    player.name + " played a shield card",
                    {card: card, plane_index: plane_index}
                ));
            }
        });

        return false;
    });

    return moves;
};

var find_cpu_draw2_move = function (cpu_state, player) {
    var moves = [];

    player.hand.some(function (card) {
        var next_state;

        if (
            !Unoludo.can_play_card(card, cpu_state) ||
            card.type !== "draw2"
        ) {
            return false;
        }

        next_state = Unoludo.play_draw2_card(cpu_state, card.id);

        if (next_state !== undefined) {
            moves.push(create_cpu_move(
                cpu_state,
                player,
                next_state,
                "draw2",
                player.name + " played +2",
                {card: card}
            ));
        }

        return false;
    });

    return moves;
};

var find_cpu_skip_move = function (cpu_state, player) {
    var moves = [];

    player.hand.some(function (card) {
        if (
            !Unoludo.can_play_card(card, cpu_state) ||
            card.type !== "skip"
        ) {
            return false;
        }

        cpu_state.players.forEach(function (target_player) {
            if (target_player.id === player.id) {
                return false;
            }

            target_player.planes.forEach(function (plane, plane_index) {
                var next_state = Unoludo.play_skip_card(
                    cpu_state,
                    card.id,
                    target_player.id,
                    plane_index
                );

                if (next_state !== undefined) {
                    moves.push(create_cpu_move(
                        cpu_state,
                        player,
                        next_state,
                        "skip",
                        player.name + " played Skip",
                        {
                            card: card,
                            target_player_id: target_player.id,
                            plane_index: plane_index
                        }
                    ));
                }
            });
        });

        return false;
    });

    return moves;
};

var find_cpu_reverse_move = function (cpu_state, player) {
    var moves = [];

    player.hand.some(function (reverse_card) {
        if (reverse_card.type !== "reverse") {
            return false;
        }

        if (!Unoludo.can_play_card(reverse_card, cpu_state)) {
            return false;
        }

        [1, 2, 3, 4, 5, 6].forEach(function (steps) {
            cpu_state.players.forEach(function (target_player) {
                if (target_player.id === player.id) {
                    return;
                }

                target_player.planes.forEach(function (plane, plane_index) {
                    var next_state = Unoludo.play_reverse_card(
                        cpu_state,
                        reverse_card.id,
                        target_player.id,
                        plane_index,
                        steps
                    );

                    if (next_state !== undefined) {
                        moves.push(create_cpu_move(
                            cpu_state,
                            player,
                            next_state,
                            "reverse",
                            player.name + " played Reverse",
                            {
                                card: reverse_card,
                                steps: steps,
                                target_player_id: target_player.id,
                                plane_index: plane_index
                            }
                        ));
                    }
                });
            });
        });

        return false;
    });

    return moves;
};

var find_cpu_wild_move = function (cpu_state, player) {
    var moves = [];
    var self_plane_indexes = player.planes
        .map(function (plane, plane_index) {
            return is_cpu_self_target_plane(plane) ? plane_index : undefined;
        })
        .filter(function (plane_index) {
            return plane_index !== undefined;
        });

    if (self_plane_indexes.length === 0) {
        return moves;
    }

    player.hand.some(function (wild_card) {
        if (
            wild_card.type !== "wild" ||
            !Unoludo.can_play_card(wild_card, cpu_state)
        ) {
            return false;
        }

        return player.hand.some(function (number_card) {
            if (
                number_card.type !== "number" ||
                number_card.value < 1 ||
                number_card.value > 6
            ) {
                return false;
            }

            self_plane_indexes.forEach(function (plane_index) {
                var next_state = Unoludo.play_wild_combo(
                    cpu_state,
                    wild_card.id,
                    number_card.id,
                    player.id,
                    plane_index
                );

                if (next_state !== undefined) {
                    moves.push(create_cpu_move(
                        cpu_state,
                        player,
                        next_state,
                        "wild",
                        player.name + " played Wild combo",
                        {
                            card: wild_card,
                            number_card: number_card,
                            target_player_id: player.id,
                            plane_index: plane_index,
                            chosen_colour: number_card.colour
                        }
                    ));
                }
            });

            return false;
        });

    });

    return moves;
};

var find_cpu_wild4_move = function (cpu_state, player) {
    var moves = [];

    player.hand.some(function (card) {
        var has_active_plane = player.planes.some(is_active_plane);
        var choices = (
            has_active_plane
            ? ["advance_all", "draw4"]
            : ["draw4"]
        );

        if (
            card.type !== "wild4" ||
            !Unoludo.can_play_card(card, cpu_state)
        ) {
            return false;
        }

        choices.forEach(function (choice) {
            var colour = choose_colour_for_cpu(player, cpu_state);
            var next_state = Unoludo.play_wild4_card(
                cpu_state,
                card.id,
                choice,
                colour
            );

            if (next_state !== undefined) {
                moves.push(create_cpu_move(
                    cpu_state,
                    player,
                    next_state,
                    "wild4",
                    player.name + " played Wild +4",
                    {card: card, option: choice, chosen_colour: colour}
                ));
            }
        });

        return false;
    });

    return moves;
};

var find_cpu_reward_move = function (cpu_state, player) {
    var moves = [];
    var self_plane_indexes = player.planes
        .map(function (plane, plane_index) {
            return is_cpu_self_target_plane(plane) ? plane_index : undefined;
        })
        .filter(function (plane_index) {
            return plane_index !== undefined;
        });

    if (self_plane_indexes.length === 0) {
        return moves;
    }

    player.hand.some(function (card) {
        if (card.type !== "reward") {
            return false;
        }

        self_plane_indexes.forEach(function (plane_index) {
            var next_state = Unoludo.play_reward_card(
                cpu_state,
                card.id,
                player.id,
                plane_index,
                choose_colour_for_cpu(player, cpu_state)
            );

            if (next_state !== undefined) {
                moves.push(create_cpu_move(
                    cpu_state,
                    player,
                    next_state,
                    "reward",
                    player.name + " played reward " + card.value,
                    {card: card, target_player_id: player.id, plane_index: plane_index}
                ));
            }
        });

        return false;
    });

    return moves;
};

var all_cpu_moves = function (cpu_state, player) {
    return [].concat(
        find_cpu_reward_move(cpu_state, player),
        find_cpu_number_move(cpu_state, player),
        find_cpu_draw2_move(cpu_state, player),
        find_cpu_skip_move(cpu_state, player),
        find_cpu_reverse_move(cpu_state, player),
        find_cpu_wild_move(cpu_state, player),
        find_cpu_wild4_move(cpu_state, player),
        find_cpu_zero_move(cpu_state, player)
    );
};

var select_cpu_move = function (moves) {
    var priority_moves = moves.filter(function (move) {
        return (
            (
                move.target_player_id === move.player_id &&
                (
                    move.kind === "reward" ||
                    move.kind === "wild"
                )
            ) ||
            (
                move.kind === "wild4" &&
                move.option === "advance_all"
            )
        );
    });
    var candidate_moves = (
        priority_moves.length > 0
        ? priority_moves
        : moves
    );

    if (moves.length === 0) {
        return undefined;
    }

    return candidate_moves.reduce(function (best_move, move) {
        var move_score = move.score * (0.8 + Math.random() * 0.4);
        var best_score = (
            best_move.adjusted_score !== undefined
            ? best_move.adjusted_score
            : best_move.score * (0.8 + Math.random() * 0.4)
        );

        move.adjusted_score = move_score;
        best_move.adjusted_score = best_score;

        return move_score > best_score ? move : best_move;
    });
};

var find_cpu_action = function (cpu_state) {
    var player = Unoludo.current_player(cpu_state);
    var move = select_cpu_move(all_cpu_moves(cpu_state, player));

    if (move === undefined) {
        return undefined;
    }

    return {
        state: move.state,
        message: move.message + " because it " + move.reason + "."
    };
};

var cpu_take_turn = function () {
    var player = Unoludo.current_player(state);
    var action = find_cpu_action(state);

    if (player.kind !== "cpu") {
        return;
    }

    if (action !== undefined) {
        var final_state = Unoludo.end_turn(action.state);

        prepare_render_effects(
            state,
            final_state,
            prepare_card_effects_from_next_state(action.state)
        );
        state = final_state;
        clear_selection();
        action_message.textContent = action.message;
        render();
        return;
    }

    var next_state = Unoludo.draw_one_and_end_turn(state);

    prepare_render_effects(state, next_state, {});

    if (!has_playable_launch_six(player, state)) {
        increment_draw_streak(player.id);
    } else {
        reset_draw_streak(player.id);
    }

    if (check_draw_streak_p6(player.id) && has_no_planes_on_track(player)) {
        var p6_card = Unoludo.create_reward_card(6);
        var new_players = next_state.players.map(function (p, i) {
            if (i === player.id) {
                return Object.freeze({
                    id: p.id,
                    name: p.name,
                    colour: p.colour,
                    kind: p.kind,
                    hand: Unoludo.sorted_hand(p.hand.concat([p6_card])),
                    planes: p.planes
                });
            }
            return p;
        });

        state = Object.freeze({
            draw_pile: next_state.draw_pile,
            discard_pile: next_state.discard_pile,
            players: Object.freeze(new_players),
            current_player: next_state.current_player,
            active_colour: next_state.active_colour,
            winner: next_state.winner,
            player_moods: next_state.player_moods,
            log: Object.freeze(next_state.log.concat([
                player.name + " received a P6 reward card (6th draw streak)!"
            ]))
        });
    } else {
        state = next_state;
    }

    clear_selection();
    action_message.textContent = player.name + " drew one card and ended turn.";
    render();
};

var schedule_cpu_if_needed = function () {
    var player;

    if (active_piece_animations !== 0) {
        return;
    }

    // In multiplayer, the host is the single authority for CPU turns.
    if (gameMode === "multi") {
        player = Unoludo.current_player(state);
        if (Unoludo.is_ended(state)) {
            return;
        }
        if (player.kind !== "cpu") {
            return;
        }
        if (myPlayerIndex !== multiplayerCpuAuthorityIndex) {
            return;
        }
        if (cpu_timer !== undefined) {
            return;
        }

        action_message.textContent = player.name + " is thinking...";
        hand_cards.classList.add("cpu-thinking");
        hand_cards.style.filter = "drop-shadow(0 0 16px " + player_colour_hex(player.colour) + ")";
        hand_cards.style.transition = "filter 220ms ease, transform 220ms ease";
        hand_cards.style.transform = "translateY(-4px)";

        cpu_timer = window.setTimeout(function () {
            cpu_timer = undefined;
            hand_cards.classList.remove("cpu-thinking");
            hand_cards.style.filter = "";
            hand_cards.style.transform = "";
            cpu_take_turn();
            // Sync the result to Firebase so the other player sees it
            sync_multiplayer_state();
        }, CPU_TURN_DELAY);
        return;
    }

    player = Unoludo.current_player(state);

    if (Unoludo.is_ended(state)) {
        return;
    }

    if (player.kind !== "cpu") {
        return;
    }

    if (cpu_timer !== undefined) {
        return;
    }

    action_message.textContent = player.name + " is thinking...";
    hand_cards.classList.add("cpu-thinking");
    hand_cards.style.filter = "drop-shadow(0 0 16px " + player_colour_hex(player.colour) + ")";
    hand_cards.style.transition = "filter 220ms ease, transform 220ms ease";
    hand_cards.style.transform = "translateY(-4px)";

    cpu_timer = window.setTimeout(function () {
        cpu_timer = undefined;
        hand_cards.classList.remove("cpu-thinking");
        hand_cards.style.filter = "";
        hand_cards.style.transform = "";
        cpu_take_turn();
    }, CPU_TURN_DELAY);
};

var choose_colour_with_modal = function () {
    return new Promise(function (resolve) {
        var close_with_colour = function (colour) {
            colour_overlay.classList.add("hidden");

            colour_choice_buttons.forEach(function (button) {
                button.onclick = null;
            });

            resolve(colour);
        };

        colour_choice_buttons.forEach(function (button) {
            button.onclick = function () {
                close_with_colour(button.dataset.colour);
            };
        });

        colour_overlay.classList.remove("hidden");
    });
};

var choose_wild4_option_with_modal = function (forced_option) {
    return new Promise(function (resolve) {
        var lock_draw4 = forced_option === "advance_all";
        var lock_move = forced_option === "draw4";

        var cleanup = function () {
            wild4_option_overlay.classList.add("hidden");
            wild4_draw4_choice.onclick = null;
            wild4_move_choice.onclick = null;
            wild4_draw4_choice.disabled = false;
            wild4_move_choice.disabled = false;
            wild4_draw4_choice.classList.remove("choice-locked");
            wild4_move_choice.classList.remove("choice-locked");
        };

        // In tutorial steps that teach one specific option, the other option is
        // locked so the player cannot pick the choice that breaks the lesson.
        wild4_draw4_choice.disabled = lock_draw4;
        wild4_move_choice.disabled = lock_move;
        wild4_draw4_choice.classList.toggle("choice-locked", lock_draw4);
        wild4_move_choice.classList.toggle("choice-locked", lock_move);

        wild4_draw4_choice.onclick = function () {
            if (lock_draw4) {
                return;
            }
            cleanup();
            resolve("draw4");
        };

        wild4_move_choice.onclick = function () {
            if (lock_move) {
                return;
            }
            cleanup();
            resolve("advance_all");
        };

        wild4_option_overlay.classList.remove("hidden");
    });
};

var choose_reverse_steps_with_modal = function () {
    return new Promise(function (resolve) {
        var close_with_steps = function (steps) {
            reverse_step_overlay.classList.add("hidden");
            reverse_step_buttons.forEach(function (button) {
                button.onclick = null;
            });
            resolve(steps);
        };

        reverse_step_buttons.forEach(function (button) {
            button.onclick = function () {
                close_with_steps(Number(button.dataset.reverseStep));
            };
        });

        reverse_step_overlay.classList.remove("hidden");
    });
};
var piece_layer = document.getElementById("piece-layer");
var discard_layer = document.getElementById("discard-layer");
hand_cards = document.getElementById("hand-cards");

var game_log = document.getElementById("game-log");
action_message = document.getElementById("action-message");
var particle_canvas = document.getElementById("particle-canvas");
var turn_indicator_label = document.querySelector(".turn-indicator-label");


var action_message_observer = new MutationObserver(function () {
    action_message.classList.remove("action-message-pop");
    action_message.style.animation = "none";

    window.requestAnimationFrame(function () {
        action_message.classList.add("action-message-pop");
        action_message.style.animation = "";
    });

    window.setTimeout(function () {
        action_message.classList.remove("action-message-pop");
    }, 1300);
});

action_message_observer.observe(action_message, {
    childList: true,
    characterData: true,
    subtree: true
});

var card_rect_for_id = function (card_id) {
    var escaped_card_id = (
        window.CSS !== undefined && window.CSS.escape !== undefined
        ? window.CSS.escape(card_id)
        : card_id.replace(/'/g, "\\'")
    );
    var card_element = hand_cards.querySelector(
        "[data-card-id='" + escaped_card_id + "']"
    );

    if (card_element === null) {
        return undefined;
    }

    return card_element.getBoundingClientRect();
};

var board_relative_rect = function (rect) {
    var board_rect = discard_layer.getBoundingClientRect();

    return {
        left: rect.left - board_rect.left,
        top: rect.top - board_rect.top,
        width: rect.width,
        height: rect.height
    };
};

var plane_visual_position = function (player, plane, plane_index) {
    if (plane.status === "finished") {
        return UnoludoBoard.base_positions[player.colour][plane_index];
    }

    return UnoludoBoard.position_for_plane(plane, player.colour, plane_index);
};

var push_path_position = function (path, player, plane, plane_index) {
    var position = plane_visual_position(player, plane, plane_index);

    if (position !== undefined) {
        path.push(position);
    }
};

var build_forward_track_path = function (from_position, to_position) {
    var path = [];
    var position = from_position;
    var guard = 0;

    while (position !== to_position && guard < Unoludo.track_length) {
        position = (position + 1) % Unoludo.track_length;
        path.push(UnoludoBoard.track_positions[position]);
        guard += 1;
    }

    return path;
};

var build_backward_track_path = function (from_position, to_position) {
    var path = [];
    var position = from_position;
    var guard = 0;

    while (position !== to_position && guard < Unoludo.track_length) {
        position = (
            position - 1 + Unoludo.track_length
        ) % Unoludo.track_length;
        path.push(UnoludoBoard.track_positions[position]);
        guard += 1;
    }

    return path;
};

var build_piece_step_path = function (
    player,
    before_plane,
    after_plane,
    plane_index
) {
    var path = [];
    var forward_path;
    var index;
    var reverse_path;
    var start_position;

    if (
        before_plane.status === "base" ||
        after_plane.status === "base"
    ) {
        push_path_position(path, player, after_plane, plane_index);
        return path;
    }

    if (before_plane.status === "gate" && after_plane.status === "track") {
        start_position = Unoludo.start_positions[player.colour];
        path.push(UnoludoBoard.track_positions[start_position]);

        if (after_plane.position !== start_position) {
            build_forward_track_path(
                start_position,
                after_plane.position
            ).forEach(function (position) {
                path.push(position);
            });
        }

        return path;
    }

    if (
        before_plane.status === "track" &&
        after_plane.status === "track"
    ) {
        var jump = Unoludo.jump_positions[player.colour];
        forward_path = build_forward_track_path(
            before_plane.position,
            after_plane.position
        );
        reverse_path = build_backward_track_path(
            before_plane.position,
            after_plane.position
        );

        if (
            jump !== undefined &&
            after_plane.position === jump.to
        ) {
            var jump_source_index = -1;

            forward_path.some(function (position, index) {
                if (position === UnoludoBoard.track_positions[jump.from]) {
                    jump_source_index = index;
                    return true;
                }

                return false;
            });

            if (jump_source_index !== -1) {
                return forward_path.slice(0, jump_source_index + 1).concat([
                    UnoludoBoard.track_positions[jump.to]
                ]);
            }
        }

        return (
            reverse_path.length < forward_path.length
            ? reverse_path
            : forward_path
        );
    }

    if (
        before_plane.status === "track" &&
        after_plane.status === "home"
    ) {
        build_forward_track_path(
            before_plane.position,
            Unoludo.home_entry_positions[player.colour]
        ).forEach(function (position) {
            path.push(position);
        });

        for (index = 0; index <= after_plane.position; index += 1) {
            path.push(UnoludoBoard.home_positions[player.colour][index]);
        }

        return path;
    }

    if (
        before_plane.status === "home" &&
        after_plane.status === "home"
    ) {
        if (after_plane.position > before_plane.position) {
            for (
                index = before_plane.position + 1;
                index <= after_plane.position;
                index += 1
            ) {
                path.push(UnoludoBoard.home_positions[player.colour][index]);
            }
        } else {
            for (
                index = before_plane.position - 1;
                index >= after_plane.position;
                index -= 1
            ) {
                path.push(UnoludoBoard.home_positions[player.colour][index]);
            }
        }

        return path;
    }

    if (after_plane.status === "finished") {
        push_path_position(path, player, after_plane, plane_index);
        return path;
    }

    push_path_position(path, player, after_plane, plane_index);
    return path;
};

var piece_step_duration_for_path = function (path) {
    var elapsed = PIECE_STEP_START_DELAY;

    path.forEach(function (position, index) {
        elapsed += (
            PIECE_STEP_INTERVAL +
            PIECE_STEP_VARIATIONS[index % PIECE_STEP_VARIATIONS.length]
        );
    });

    return elapsed + PIECE_STEP_FINISH_DELAY;
};

prepare_render_effects = function (before_state, after_state, options) {
    var before_top = Unoludo.top_discard(before_state);
    var after_top = Unoludo.top_discard(after_state);
    var effects = {
        card_played: after_top.id !== before_top.id,
        card_source_rect: options && options.card_source_rect,
        drew_cards: after_state.draw_pile.length < before_state.draw_pile.length,
        moved_pieces: false,
        captured_keys: Object.create(null),
        shielded: false,
        frozen: false,
        capture_delay: 0,
        piece_paths: Object.create(null),
        turn_changed: after_state.current_player !== before_state.current_player,
        winner_changed: after_state.winner !== before_state.winner
    };

    after_state.players.forEach(function (player, player_index) {
        player.planes.forEach(function (plane, plane_index) {
            var before_plane = before_state.players[player_index].planes[plane_index];
            var piece_key = piece_key_for(player, plane_index);

            if (
                before_plane.status !== plane.status ||
                before_plane.position !== plane.position
            ) {
                effects.moved_pieces = true;
                effects.piece_paths[piece_key] = build_piece_step_path(
                    player,
                    before_plane,
                    plane,
                    plane_index
                );
            }

            if (
                before_plane.status !== "base" &&
                plane.status === "base"
            ) {
                effects.captured_keys[piece_key] = true;
            }

            if (!before_plane.shielded && plane.shielded) {
                effects.shielded = true;
            }

            if (!before_plane.frozen && plane.frozen) {
                effects.frozen = true;
            }
        });
    });

    Object.keys(effects.piece_paths).forEach(function (piece_key) {
        if (effects.captured_keys[piece_key] === true) {
            return;
        }

        effects.capture_delay = Math.max(
            effects.capture_delay,
            piece_step_duration_for_path(effects.piece_paths[piece_key])
        );
    });

    pending_render_effects = effects;
};

prepare_card_effects_from_next_state = function (next_state) {
    var played_card = Unoludo.top_discard(next_state);

    return {
        card_source_rect: card_rect_for_id(played_card.id)
    };
};

sync_multiplayer_state = function () {
    if (gameMode !== "multi") {
        return Promise.resolve({committed: true});
    }

    return window.UnoludoMultiplayer.updateGameState(
        state,
        state.current_player
    ).then(function (result) {
        if (!result.committed) {
            if (result.remoteState !== undefined) {
                state = window.UnoludoMultiplayer.unflattenState(
                    result.remoteState
                );
                mpStateSynced = true;
                clear_selection();
                render();
            }

            action_message.textContent = (
                "Game state changed. Please try your move again."
            );
        }

        return result;
    }).catch(function () {
        action_message.textContent = "Could not sync multiplayer state.";
        return {committed: false};
    });
};

var can_take_local_turn = function () {
    if (active_piece_animations !== 0) {
        return false;
    }

    if (gameMode === "tutorial" && tutorialAckPending) {
        return false;
    }

    return (
        (gameMode !== "multi" &&
            Unoludo.current_player(state).kind !== "cpu") ||
        (mpStateSynced === true &&
            window.UnoludoMultiplayer.isMyTurn(state.current_player) === true)
    );
};

var current_tutorial_level = function () {
    if (gameMode !== "tutorial") {
        return undefined;
    }

    return tutorial_levels[tutorialLevelIndex];
};

var tutorial_hand_contains = function (test_state, player_id, card_id) {
    return test_state.players[player_id].hand.some(function (card) {
        return card.id === card_id;
    });
};

var tutorial_requires_acknowledgement = function (level) {
    return (
        level !== undefined &&
        level.acknowledgeMessage !== undefined
    );
};

var finish_successful_action = function (next_state, message, should_sync) {
    var final_state = Unoludo.end_turn(next_state);
    var player = Unoludo.current_player(state);

    reset_draw_streak(player.id);
    prepare_render_effects(
        state,
        final_state,
        prepare_card_effects_from_next_state(next_state)
    );
    state = final_state;
    clear_selection();
    action_message.textContent = message;
    if (should_sync !== false) {
        sync_multiplayer_state();
    }
    render();
    check_tutorial_progress();
    return true;
};

// Rebuild a state in which the mover's planes have already advanced but the
// opponents they captured are restored to where they were standing. This is
// the snapshot shown while the player's planes travel; the real captures are
// applied afterwards.
var restore_captured_planes = function (before_state, after_state) {
    var result = after_state;

    after_state.players.forEach(function (target_player, player_index) {
        if (player_index === before_state.current_player) {
            return;
        }

        target_player.planes.forEach(function (plane, plane_index) {
            var before_plane = (
                before_state.players[player_index].planes[plane_index]
            );

            if (plane.status === "base" && before_plane.status !== "base") {
                result = Unoludo.update_plane(
                    result,
                    target_player.id,
                    plane_index,
                    before_plane
                );
            }
        });
    });

    return result;
};

var run_when_pieces_settled = function (callback) {
    if (active_piece_animations === 0) {
        callback();
        return;
    }

    window.setTimeout(function () {
        run_when_pieces_settled(callback);
    }, 60);
};

// Wild +4 "move all" is animated in two phases: first the player's own planes
// advance, and only after they arrive are the planes they landed on sent home.
var finish_advance_all_in_two_phases = function (next_state, message) {
    var before_state = state;
    var player = Unoludo.current_player(before_state);
    var moved_only = restore_captured_planes(before_state, next_state);

    reset_draw_streak(player.id);

    // Phase one: advance the player's planes; captured opponents stay put.
    prepare_render_effects(
        before_state,
        moved_only,
        prepare_card_effects_from_next_state(next_state)
    );
    state = moved_only;
    clear_selection();
    action_message.textContent = message;
    render();

    // Phase two: once the planes have arrived, resolve the captures and end the
    // turn so the opponents are sent home afterwards.
    run_when_pieces_settled(function () {
        var final_state = Unoludo.end_turn(next_state);

        prepare_render_effects(moved_only, final_state, {});
        state = final_state;
        sync_multiplayer_state();
        render();
        check_tutorial_progress();
    });

    // The final state is committed after the second animation phase. Returning
    // false prevents the generic hand click handler from syncing the temporary
    // animation-only state in multiplayer games.
    return false;
};

play_selected_card_without_plane = function () {
    var player = Unoludo.current_player(state);
    var card = Unoludo.card_in_hand(player, selected_card_id);
    var next_state;

    if (card === undefined) {
        return Promise.resolve(undefined);
    }

    if (!Unoludo.can_play_card(card, state)) {
        action_message.textContent = "That card cannot be played on the current discard.";
        return Promise.resolve(undefined);
    }

    if (card.type === "reverse") {
        target_mode = "reverse_target";
        combo_card_id = undefined;
        action_message.textContent = "Select an opponent plane to move backwards.";
        render();
        return Promise.resolve(undefined);
    }

    if (card.type === "wild") {
        var has_number_card = player.hand.some(function (hand_card) {
            return (
                hand_card.id !== card.id &&
                hand_card.type === "number" &&
                hand_card.value > 0
            );
        });

        if (!has_number_card) {
            clear_selection();
            action_message.textContent = "Wild needs a number card.";
            render();
            return Promise.resolve(undefined);
        }

        target_mode = "wild_number";
        combo_card_id = undefined;
        action_message.textContent = "Select a number card for Wild.";
        return Promise.resolve(undefined);
    }

    if (card.type === "number" && card.value === 0) {
        action_message.textContent = "Select one of your active planes to shield.";
        return Promise.resolve(undefined);
    }

    if (card.type === "draw2") {
        next_state = Unoludo.play_draw2_card(
            state,
            selected_card_id
        );

        if (next_state === undefined) {
            action_message.textContent = "That +2 card cannot be played.";
            return Promise.resolve(undefined);
        }

        finish_successful_action(
            next_state,
            "Played +2, drew two cards, and ended turn.",
            false
        );
        return Promise.resolve(true);
    }

    if (card.type === "wild4") {
        var level = current_tutorial_level();
        return choose_wild4_option_with_modal(
            level === undefined
            ? undefined
            : level.forcedWild4Option
        ).then(function (option) {
            return choose_colour_with_modal().then(function (chosen_colour) {
                next_state = Unoludo.play_wild4_card(
                    state,
                    selected_card_id,
                    option,
                    chosen_colour
                );

                if (next_state === undefined) {
                    action_message.textContent = "That Wild +4 card cannot be played.";
                    return undefined;
                }

                if (option === "advance_all") {
                    // Two-phase so the player's planes are seen moving forward first,
                    // and only then are the planes they land on sent home.
                    return finish_advance_all_in_two_phases(
                        next_state,
                        "Played Wild +4 and advanced all active planes."
                    );
                }

                return finish_successful_action(
                    next_state,
                    "Played Wild +4 and drew four cards.",
                    false
                );
            });
        });
    }

    if (card.type === "skip") {
        target_mode = "skip";
        action_message.textContent = "Select one active plane belonging to the next player.";
        return Promise.resolve(undefined);
    }

    if (card.type === "reward") {
        target_mode = "reward_target";
        action_message.textContent = "Select any active plane for reward " + card.value + ".";
        return Promise.resolve(undefined);
    }

    return Promise.resolve(undefined);
};

play_reward_on_plane = function (target_player_id, plane_index) {
    return choose_colour_with_modal().then(function (chosen_colour) {
        var next_state = Unoludo.play_reward_card(
            state,
            selected_card_id,
            target_player_id,
            plane_index,
            chosen_colour
        );

        if (next_state === undefined) {
            action_message.textContent = "That reward target is not legal.";
            return undefined;
        }

        target_mode = undefined;
        finish_successful_action(
            next_state,
            "Played reward card, chose " + chosen_colour + ", and moved a plane."
        );

        return true;
    });
};

play_selected_card_on_plane = function (plane_index) {
    var player = Unoludo.current_player(state);
    var card = Unoludo.card_in_hand(player, selected_card_id);
    var next_state;

    if (card === undefined) {
        action_message.textContent = "Select a card first.";
        return;
    }

    if (!Unoludo.can_play_card(card, state)) {
        action_message.textContent = "That card cannot be played on the current discard.";
        return;
    }

    if (card.type === "number" && card.value > 0) {
        next_state = Unoludo.play_number_card(
            state,
            selected_card_id,
            plane_index
        );
    } else if (card.type === "number" && card.value === 0) {
        next_state = Unoludo.play_zero_card(
            state,
            selected_card_id,
            plane_index
        );
    } else {
        action_message.textContent = "This card does not move your plane directly.";
        return;
    }

    if (next_state === undefined) {
        action_message.textContent = "That move is not legal for this plane.";
        return;
    }

    finish_successful_action(next_state, "Move played and turn ended.");
};

play_skip_on_plane = function (target_player_id, plane_index) {
    var next_state = Unoludo.play_skip_card(
        state,
        selected_card_id,
        target_player_id,
        plane_index
    );

    if (next_state === undefined) {
        action_message.textContent = "That Skip target is not legal.";
        return;
    }

    target_mode = undefined;
    finish_successful_action(
        next_state,
        "Played Skip and froze a plane."
    );
};

play_reverse_on_plane = function (target_player_id, plane_index) {
    return choose_reverse_steps_with_modal().then(function (steps) {
        var next_state = Unoludo.play_reverse_card(
            state,
            selected_card_id,
            target_player_id,
            plane_index,
            steps
        );

        if (next_state === undefined) {
            action_message.textContent = "That Reverse target is not legal.";
            return undefined;
        }

        target_mode = undefined;
        combo_card_id = undefined;
        finish_successful_action(
            next_state,
            "Played Reverse and moved a plane backwards."
        );

        return true;
    });
};

play_wild_on_plane = function (target_player_id, plane_index) {
    var next_state = Unoludo.play_wild_combo(
        state,
        selected_card_id,
        combo_card_id,
        target_player_id,
        plane_index
    );

    if (next_state === undefined) {
        action_message.textContent = "That Wild target is not legal.";
        return;
    }

    target_mode = undefined;
    combo_card_id = undefined;
    finish_successful_action(
        next_state,
        "Played Wild combo and moved a plane forward."
    );
};

var plane_position_key = function (player, plane, plane_index) {
    if (plane.status === "base") {
        return player.colour + "-base-" + plane_index;
    }

    if (plane.status === "gate") {
        return player.colour + "-gate";
    }

    if (plane.status === "track") {
        return "track-" + plane.position;
    }

    if (plane.status === "home") {
        return player.colour + "-home-" + plane.position;
    }

    if (plane.status === "finished") {
        return player.colour + "-finished-" + plane_index;
    }

    return "unknown";
};

var overlap_offset = function (overlap_index, overlap_count) {
    var offsets = [
        {x: 0, y: 0},
        {x: -1.15, y: -1.15},
        {x: 1.15, y: -1.15},
        {x: -1.15, y: 1.15},
        {x: 1.15, y: 1.15},
        {x: 0, y: -1.75},
        {x: 0, y: 1.75},
        {x: -1.75, y: 0},
        {x: 1.75, y: 0}
    ];

    if (overlap_count <= 1) {
        return offsets[0];
    }

    return offsets[overlap_index % offsets.length];
};

piece_key_for = function (player, plane_index) {
    return "player-" + player.id + "-plane-" + plane_index;
};

var animate_card_to_discard = function (source_rect, card) {
    var target_card = discard_layer.querySelector(".center-discard-card");
    var target_rect = (
        target_card === null
        ? discard_layer.getBoundingClientRect()
        : target_card.getBoundingClientRect()
    );
    var source = board_relative_rect(source_rect);
    var target = board_relative_rect(target_rect);
    var flying_card = document.createElement("img");

    flying_card.src = UnoludoAssets.card_image(card);
    flying_card.alt = "";
    flying_card.style.position = "absolute";
    flying_card.style.left = source.left + "px";
    flying_card.style.top = source.top + "px";
    flying_card.style.width = source.width + "px";
    flying_card.style.height = source.height + "px";
    flying_card.style.zIndex = "80";
    flying_card.style.pointerEvents = "none";
    flying_card.style.borderRadius = "8px";
    flying_card.style.filter = "drop-shadow(0 18px 24px rgba(0, 0, 0, 0.42))";
    flying_card.style.transformOrigin = "center center";
    flying_card.style.transition = "left 430ms cubic-bezier(0.22, 1, 0.36, 1), top 430ms cubic-bezier(0.22, 1, 0.36, 1), width 430ms cubic-bezier(0.22, 1, 0.36, 1), height 430ms cubic-bezier(0.22, 1, 0.36, 1), transform 430ms cubic-bezier(0.22, 1, 0.36, 1), opacity 180ms ease 330ms";
    flying_card.style.transform = "rotate(-8deg) scale(1)";

    discard_layer.appendChild(flying_card);

    window.requestAnimationFrame(function () {
        flying_card.style.left = target.left + "px";
        flying_card.style.top = target.top + "px";
        flying_card.style.width = target.width + "px";
        flying_card.style.height = target.height + "px";
        flying_card.style.transform = "rotate(12deg) scale(1.08)";
        flying_card.style.opacity = "0";
    });

    window.setTimeout(function () {
        flying_card.remove();
    }, 560);
};

var spawn_piece_trail = function (snapshot, current_left, current_top, image_src, image_alt) {
    [0.28, 0.55, 0.78].forEach(function (step, index) {
        var trail = document.createElement("div");
        var image = document.createElement("img");
        var left = snapshot.left + (current_left - snapshot.left) * step;
        var top = snapshot.top + (current_top - snapshot.top) * step;

        trail.className = "piece";
        trail.style.left = left + "%";
        trail.style.top = top + "%";
        trail.style.opacity = "0.46";
        trail.style.pointerEvents = "none";
        trail.style.zIndex = "3";
        trail.style.transition = "opacity 400ms ease, transform 400ms ease";
        trail.style.transform = "translate(-50%, -50%) perspective(640px) rotateX(12deg) translateZ(2px) scale(" + (0.92 - index * 0.08) + ")";

        image.src = image_src;
        image.alt = image_alt;
        trail.appendChild(image);
        piece_layer.appendChild(trail);

        window.setTimeout(function () {
            trail.style.opacity = "0";
            trail.style.transform = "translate(-50%, -50%) perspective(640px) rotateX(12deg) translateZ(2px) scale(0.45)";
        }, 20 + index * 55);

        window.setTimeout(function () {
            trail.remove();
        }, 470 + index * 70);
    });
};

var move_confetti_particle = function (particle, drift, rotation, duration) {
    window.setTimeout(function () {
        particle.style.top = "108%";
        particle.style.transform = (
            "translate3d(" + drift + "px, 0, 0) rotate(" + rotation + "deg)"
        );
        particle.style.opacity = "0";
    }, 20 + Math.random() * 120);

    window.setTimeout(function () {
        particle.remove();
    }, duration + 220);
};

var spawn_confetti = function () {
    var colours = ["#4979E0", "#48DB73", "#BD2222", "#E5CA22", "#9b5cff", "#f8fafc"];
    var duration;
    var drift;
    var index;
    var particle;
    var rotation;
    var start_x;

    if (particle_canvas === null) {
        return;
    }

    for (index = 0; index < 38; index += 1) {
        particle = document.createElement("div");
        drift = Math.random() * 180 - 90;
        duration = 1500 + Math.random() * 1500;
        start_x = Math.random() * 100;
        rotation = Math.random() * 720 - 360;

        particle.style.position = "absolute";
        particle.style.left = start_x + "%";
        particle.style.top = "-8%";
        particle.style.width = (6 + Math.random() * 8) + "px";
        particle.style.height = (8 + Math.random() * 12) + "px";
        particle.style.borderRadius = "2px";
        particle.style.background = colours[index % colours.length];
        particle.style.opacity = "0.95";
        particle.style.transform = "translate3d(0, 0, 0) rotate(0deg)";
        particle.style.transition = (
            "transform " + duration + "ms cubic-bezier(0.16, 1, 0.3, 1), " +
            "top " + duration + "ms linear, opacity 260ms ease " + (duration - 260) + "ms"
        );

        particle_canvas.appendChild(particle);

        move_confetti_particle(particle, drift, rotation, duration);
    }
};

var play_pending_sounds = function (effects) {
    if (effects.card_played) {
        playCardSound();
    }

    if (effects.drew_cards) {
        window.setTimeout(playDrawSound, effects.card_played ? 120 : 0);
    }

    if (effects.moved_pieces) {
        playMoveSound();
    }

    if (Object.keys(effects.captured_keys).length > 0) {
        window.setTimeout(playCaptureSound, effects.capture_delay);
    }

    if (effects.shielded) {
        playShieldSound();
    }

    if (effects.frozen) {
        playFreezeSound();
    }

    if (effects.winner_changed) {
        playWinSound();
    } else if (effects.turn_changed) {
        window.setTimeout(playTurnSound, effects.card_played || effects.drew_cards ? 240 : 0);
    }
};

var render_piece_badge = function (piece, badge_class, should_show, label) {
    var badge = piece.querySelector("." + badge_class);

    if (should_show) {
        if (badge === null) {
            badge = document.createElement("span");
            badge.className = "piece-badge " + badge_class;
            badge.setAttribute("aria-hidden", "true");
            piece.appendChild(badge);
        }

        badge.textContent = label;
        return;
    }

    if (badge !== null) {
        badge.remove();
    }
};

var animate_piece_along_path = function (
    piece,
    piece_key,
    from_position,
    path,
    offset,
    options
) {
    var token = (piece_animation_tokens[piece_key] || 0) + 1;
    var delay = (
        options && options.delay !== undefined
        ? options.delay
        : 0
    );
    var wobble = (
        piece_key.length % 2 === 0
        ? "-2.4deg"
        : "2.4deg"
    );
    var positions = path.map(function (position) {
        return {
            left: position.x + offset.x,
            top: position.y + offset.y
        };
    });

    if (positions.length === 0) {
        return false;
    }

    piece_animation_tokens[piece_key] = token;
    active_piece_animations += 1;

    piece.style.transition = "none";
    piece.style.left = from_position.left + "%";
    piece.style.top = from_position.top + "%";

    window.setTimeout(function () {
        var elapsed = PIECE_STEP_START_DELAY;

        if (piece_animation_tokens[piece_key] !== token) {
            return;
        }

        piece.getBoundingClientRect();
        piece.style.setProperty("--piece-step-wobble", wobble);
        piece.classList.add("piece-step-animating");
        piece.style.transition = "";

        positions.forEach(function (position, index) {
            window.setTimeout(function () {
                if (piece_animation_tokens[piece_key] !== token) {
                    return;
                }

                piece.style.left = position.left + "%";
                piece.style.top = position.top + "%";
            }, elapsed);

            elapsed += (
                PIECE_STEP_INTERVAL +
                PIECE_STEP_VARIATIONS[index % PIECE_STEP_VARIATIONS.length]
            );
        });
    }, delay);

    window.setTimeout(function () {
        if (piece_animation_tokens[piece_key] === token) {
            piece.classList.remove("piece-step-animating");
            piece.style.transition = "";
            piece.style.removeProperty("--piece-step-wobble");
        }

        active_piece_animations = Math.max(0, active_piece_animations - 1);

        if (active_piece_animations === 0) {
            apply_multiplayer_turn_controls();
            render_tutorial_coach();
            schedule_cpu_if_needed();
        }
    }, delay + piece_step_duration_for_path(path));

    return true;
};

var render_piece = function (
    player,
    plane,
    plane_index,
    overlap_index,
    overlap_count
) {
    var position = UnoludoBoard.position_for_plane(
        plane,
        player.colour,
        plane_index
    );

    var piece_key = piece_key_for(player, plane_index);
    var offset = overlap_offset(overlap_index, overlap_count);
    var previous_snapshot = previous_piece_snapshots[piece_key];
    var path = (
        pending_render_effects === undefined
        ? undefined
        : pending_render_effects.piece_paths[piece_key]
    );
    var is_captured = (
        pending_render_effects !== undefined &&
        pending_render_effects.captured_keys[piece_key] === true
    );

    var piece = piece_elements[piece_key];
    var image;
    var image_src;
    var image_alt;
    var target_left;
    var target_top;

    if (plane.status === "finished") {
        position = UnoludoBoard.base_positions[player.colour][plane_index];
        image_src = UnoludoAssets.finished_marker;
        image_alt = player.colour + " finished marker";
    } else {
        image_src = UnoludoAssets.plane_image(player.colour);
        image_alt = player.colour + " plane";
    }

    if (position === undefined) {
        return;
    }

    target_left = position.x + offset.x;
    target_top = position.y + offset.y;

    if (piece === undefined) {
        piece = document.createElement("div");
        image = document.createElement("img");

        piece.dataset.pieceKey = piece_key;
        piece.appendChild(image);
        piece_layer.appendChild(piece);

        piece_elements[piece_key] = piece;
    } else {
        image = piece.querySelector("img");
    }

    piece.className = (
        plane.status === "finished"
        ? "finished-marker"
        : "piece"
    );

    piece.onclick = null;

    if (
        plane.status !== "finished" &&
        target_mode === "skip" &&
        player.id !== state.current_player &&
        can_take_local_turn()
    ) {
        piece.className += " target-piece";
        piece.onclick = function () {
            play_skip_on_plane(player.id, plane_index);
        };
    } else if (
        plane.status !== "finished" &&
        target_mode === "reverse_target" &&
        player.id !== state.current_player &&
        can_take_local_turn()
    ) {
        piece.className += " target-piece";
        piece.onclick = function () {
            play_reverse_on_plane(player.id, plane_index);
        };
    } else if (
        plane.status !== "finished" &&
        target_mode === "wild_target" &&
        can_take_local_turn()
    ) {
        piece.className += " target-piece";
        piece.onclick = function () {
            play_wild_on_plane(player.id, plane_index);
        };
    } else if (
        plane.status !== "finished" &&
        target_mode === undefined &&
        player.id === state.current_player &&
        can_take_local_turn()
    ) {
        piece.className += " current-player-piece";
        piece.onclick = function () {
            play_selected_card_on_plane(plane_index);
        };
    } else if (
        plane.status !== "finished" &&
        target_mode === "reward_target" &&
        can_take_local_turn()
    ) {
        piece.className += " target-piece";
        piece.onclick = function () {
            play_reward_on_plane(player.id, plane_index);
        };
    }

    if (plane.status !== "finished" && plane.shielded) {
        piece.className += " shielded";
    }

    if (plane.status !== "finished" && plane.frozen) {
        piece.className += " frozen";
    }

    image.src = image_src;
    image.alt = image_alt;

    render_piece_badge(
        piece,
        "shield-badge",
        plane.status !== "finished" && plane.shielded,
        "🛡️"
    );
    render_piece_badge(
        piece,
        "skip-badge",
        plane.status !== "finished" && plane.frozen,
        "🚫"
    );

    if (
        previous_snapshot === undefined ||
        path === undefined ||
        (plane.status === "base" && !is_captured) ||
        !animate_piece_along_path(
            piece,
            piece_key,
            previous_snapshot,
            path,
            offset,
            {
                delay: (
                    is_captured && pending_render_effects !== undefined
                    ? pending_render_effects.capture_delay
                    : 0
                )
            }
        )
    ) {
        piece.style.left = target_left + "%";
        piece.style.top = target_top + "%";
    }

    if (is_captured) {
        var capture_delay = (
            pending_render_effects !== undefined
            ? pending_render_effects.capture_delay
            : 0
        );

        window.setTimeout(function () {
            piece.classList.add("captured");
        }, capture_delay);

        window.setTimeout(function () {
            piece.classList.remove("captured");
        }, capture_delay + 520);
    }

    if (
        previous_piece_snapshots[piece_key] !== undefined &&
        previous_piece_snapshots[piece_key].status !== "base" &&
        previous_piece_snapshots[piece_key].status !== "finished" &&
        path === undefined &&
        (
            Math.abs(previous_piece_snapshots[piece_key].left - target_left) > 0.01 ||
            Math.abs(previous_piece_snapshots[piece_key].top - target_top) > 0.01
        )
    ) {
        spawn_piece_trail(
            previous_piece_snapshots[piece_key],
            target_left,
            target_top,
            image_src,
            image_alt
        );
    }

    previous_piece_snapshots[piece_key] = {
        left: target_left,
        top: target_top,
        status: plane.status
    };
};

var render_top_discard_on_board = function () {
    var top_card = Unoludo.top_discard(state);
    var image;

    if (
        rendered_discard_card_id !== undefined &&
        rendered_discard_card_id === top_card.id
    ) {
        return;
    }

    rendered_discard_card_id = top_card.id;
    discard_layer.replaceChildren();

    image = document.createElement("img");
    image.className = "center-discard-card";
    image.src = UnoludoAssets.card_image(top_card);
    image.alt = "Top discard: " + top_card.id;

    discard_layer.appendChild(image);

    if (
        pending_render_effects !== undefined &&
        pending_render_effects.card_played &&
        pending_render_effects.card_source_rect !== undefined
    ) {
        animate_card_to_discard(pending_render_effects.card_source_rect, top_card);
    }
};

var render_pieces = function () {
    var groups = Object.create(null);
    var rendered_keys = Object.create(null);

    state.players.forEach(function (player) {
        player.planes.forEach(function (plane, plane_index) {
            var key = plane_position_key(player, plane, plane_index);

            if (groups[key] === undefined) {
                groups[key] = [];
            }

            groups[key].push({
                player: player,
                plane: plane,
                plane_index: plane_index
            });
        });
    });

    Object.keys(groups).forEach(function (key) {
        var group = groups[key];

        group.forEach(function (entry, overlap_index) {
            var piece_key = piece_key_for(
                entry.player,
                entry.plane_index
            );

            rendered_keys[piece_key] = true;

            render_piece(
                entry.player,
                entry.plane,
                entry.plane_index,
                overlap_index,
                group.length
            );
        });
    });

    Object.keys(piece_elements).forEach(function (piece_key) {
        if (rendered_keys[piece_key] !== true) {
            piece_elements[piece_key].remove();
            delete piece_elements[piece_key];
            delete previous_piece_snapshots[piece_key];
        }
    });
};

var render_hand = function () {
    var player = (gameMode === "multi")
        ? state.players[myPlayerIndex]
        : Unoludo.current_player(state);
    var tutorial_level = current_tutorial_level();
    var show_draw_card = (
        player.kind !== "cpu" &&
        (
            gameMode !== "tutorial" ||
            (tutorial_level !== undefined && tutorial_level.allowTutorialDraw === true)
        )
    );

    hand_cards.replaceChildren();

    if (gameMode !== "multi" && player.kind === "cpu") {
        var hidden_notice = document.createElement("div");
        var swatch = document.createElement("span");
        var name = document.createElement("span");

        hidden_notice.className = "hidden-hand-notice";
        swatch.className = "hidden-hand-swatch";
        swatch.style.background = player_colour_hex(player.colour);
        name.className = "hidden-hand-name";
        name.textContent = player.name + " is choosing a move";

        hidden_notice.appendChild(swatch);
        hidden_notice.appendChild(name);
        hand_cards.appendChild(hidden_notice);
        return;
    }

    var has_playable_card = player.hand.some(function (card) {
        return Unoludo.can_play_card(card, state);
    });

    player.hand.forEach(function (card, card_index) {
        var image = document.createElement("img");

        image.className = "card-image";
        image.style.setProperty("--card-order", String(card_index + 1));

        if (Unoludo.can_play_card(card, state)) {
            image.className += " playable-card";
        }

        if (card.id === selected_card_id) {
            image.className += " selected-card";
        }
        if (card.id === combo_card_id) {
            image.className += " combo-card";
        }

        image.src = UnoludoAssets.card_image(card);
        image.alt = card.id;
        image.dataset.cardId = card.id;

        image.addEventListener("click", function () {
            if (!can_take_local_turn()) {
                return;
            }

            if (target_mode === "wild_number") {
                if (
                    card.type === "number" &&
                    card.value > 0
                ) {
                    combo_card_id = card.id;
                    target_mode = "wild_target";
                    action_message.textContent = "Select any active plane to move forward.";
                    render();
                    return;
                }

                clear_selection();
                selected_card_id = card.id;
                play_selected_card_without_plane().then(function (did_update) {
                    if (did_update) {
                        sync_multiplayer_state();
                    }
                    render();
                });
                render();
                return;
            }

            clear_selection();
            selected_card_id = card.id;
            play_selected_card_without_plane().then(function (did_update) {
                if (did_update) {
                    sync_multiplayer_state();
                }
                render();
            });
            render();
        });

        hand_cards.appendChild(image);
    });

    if (show_draw_card) {
        var draw_image = document.createElement("img");

        draw_image.className = (
            has_playable_card
            ? "card-image draw-card-button"
            : "card-image draw-card-button draw-card-suggested"
        );
        draw_image.style.setProperty("--card-order", String(player.hand.length + 1));
        draw_image.src = UnoludoAssets.draw_card;
        draw_image.alt = "Draw and end turn";
        if (gameMode === "tutorial") {
            draw_image.dataset.cardId = "tutorial-draw-card";
        }

        draw_image.addEventListener("click", function () {
            if (!can_take_local_turn()) {
                return;
            }

            var next_state = Unoludo.draw_one_and_end_turn(state);

            if (next_state !== undefined) {
                prepare_render_effects(state, next_state, {});

                if (!has_playable_launch_six(player, state)) {
                    increment_draw_streak(player.id);
                } else {
                    reset_draw_streak(player.id);
                }

                if (check_draw_streak_p6(player.id) && has_no_planes_on_track(player)) {
                    var p6_card = Unoludo.create_reward_card(6);
                    var new_players = next_state.players.map(function (p, i) {
                        if (i === player.id) {
                            return Object.freeze({
                                id: p.id,
                                name: p.name,
                                colour: p.colour,
                                kind: p.kind,
                                hand: Unoludo.sorted_hand(p.hand.concat([p6_card])),
                                planes: p.planes
                            });
                        }
                        return p;
                    });

                    state = Object.freeze({
                        draw_pile: next_state.draw_pile,
                        discard_pile: next_state.discard_pile,
                        players: Object.freeze(new_players),
                        current_player: next_state.current_player,
                        active_colour: next_state.active_colour,
                        winner: next_state.winner,
                        player_moods: next_state.player_moods,
                        log: Object.freeze(next_state.log.concat([
                            player.name + " received a P6 reward card (6th draw streak)!"
                        ]))
                    });
                } else {
                    state = next_state;
                }

                clear_selection();
                action_message.textContent = "Drew one card and ended turn.";
                render();
                if (gameMode === "tutorial") {
                    check_tutorial_progress();
                } else {
                    sync_multiplayer_state();
                }
            }
        });

        hand_cards.appendChild(draw_image);
    }

    if (gameMode === "tutorial" && tutorialAckPending) {
        var ack_card = document.createElement("div");
        var ack_text = document.createElement("p");
        var ack_button = document.createElement("button");

        ack_card.className = "tutorial-ack-card";
        ack_card.id = "tutorial-ack-card";
        ack_text.className = "tutorial-ack-text";
        ack_text.textContent = tutorial_level.acknowledgeMessage;
        ack_button.className = "tutorial-ack-button";
        ack_button.type = "button";
        ack_button.textContent = "Got It";
        ack_button.addEventListener("click", function () {
            tutorialAcknowledged = true;
            tutorialAckPending = false;
            render();
            check_tutorial_progress();
        });

        ack_card.appendChild(ack_text);
        ack_card.appendChild(ack_button);
        hand_cards.appendChild(ack_card);
    }
};

var render_player_status_panel = function () {
    if (player_status_panel === null) {
        return;
    }

    player_status_panel.replaceChildren();

    state.players.forEach(function (player) {
        var row = document.createElement("div");
        var swatch = document.createElement("span");
        var name = document.createElement("span");
        var hand_count = document.createElement("span");
        var emoji = document.createElement("span");
        var is_current = player.id === state.current_player;
        var mood = (
            state.player_moods === undefined
            ? undefined
            : state.player_moods[player.id]
        );
        var emoji_text = (
            is_current
            ? "🤔"
            : (
                mood === "smug"
                ? "🤭"
                : (
                    mood === "angry"
                    ? "😡"
                    : "⏳"
                )
            )
        );

        row.className = (
            is_current
            ? "player-status-row is-thinking"
            : "player-status-row"
        );

        swatch.className = "player-status-swatch";
        swatch.style.background = player_colour_hex(player.colour);
        swatch.style.boxShadow = (
            "0 0 18px " + player_colour_hex(player.colour)
        );

        name.className = "player-status-name";
        name.textContent = player.name;

        hand_count.className = "player-status-hand-count";
        hand_count.textContent = String(player.hand.length);
        hand_count.setAttribute(
            "aria-label",
            player.hand.length + " cards left"
        );

        emoji.className = "player-status-emoji";
        emoji.textContent = emoji_text;
        emoji.setAttribute(
            "aria-label",
            (
                is_current
                ? "Thinking"
                : (
                    mood === "smug"
                    ? "Disrupted another player"
                    : (
                        mood === "angry"
                        ? "Disrupted by another player"
                        : "Waiting"
                    )
                )
            )
        );

        row.appendChild(swatch);
        row.appendChild(name);
        row.appendChild(hand_count);
        row.appendChild(emoji);
        player_status_panel.appendChild(row);
    });
};

var render_hand_play_hint = function () {
    var top_card = Unoludo.top_discard(state);
    var active_colour = state.active_colour || top_card.colour;
    var active_colour_hex = player_colour_hex(active_colour);
    var match_label = card_match_label(top_card);

    if (
        hand_play_hint === null ||
        hand_play_colour_swatch === null ||
        hand_play_colour === null ||
        hand_play_type === null
    ) {
        return;
    }

    hand_play_colour_swatch.style.background = active_colour_hex;
    hand_play_colour_swatch.style.boxShadow = "0 0 14px " + active_colour_hex;
    hand_play_colour.textContent = colour_label(active_colour);

    if (top_card.colour === "wild") {
        hand_play_type.textContent = "or any Wild";
    } else {
        hand_play_type.textContent = "or " + match_label;
    }

    hand_play_hint.setAttribute(
        "aria-label",
        "Can play " + colour_label(active_colour) + " or " + match_label
    );
};

var render_info = function () {
    var current_player = Unoludo.current_player(state);
    var previous_player_id = (
        state.current_player - 1 + state.players.length
    ) % state.players.length;
    var previous_player = state.players[previous_player_id];
    var top_card = Unoludo.top_discard(state);
    var winner;

    render_player_status_panel();
    render_hand_play_hint();
    update_tutorial_panel();

    if (state.winner !== undefined) {
        winner = state.players[state.winner];
        action_message.textContent = winner.name + " wins the game!";
    }

    if (state.log.length === 1) {
        played_card_title.textContent = "First card:";
    } else {
        // "drew" log is second-to-last because end_turn always appends after it
        var last_log = state.log[state.log.length - 2] || "";
        var last_action_is_draw = last_log.indexOf(" drew ") !== -1;
        if (last_action_is_draw) {
            played_card_title.textContent = previous_player.name + " drew:";
        } else {
            played_card_title.textContent = previous_player.name + " played:";
        }
    }

    var last_log_for_image = state.log[state.log.length - 2] || "";
    if (last_log_for_image.indexOf(" drew ") !== -1) {
        played_card_image.src = UnoludoAssets.draw_card;
        played_card_image.alt = "Draw card";
    } else {
        played_card_image.src = UnoludoAssets.card_image(top_card);
        played_card_image.alt = "Last played card: " + top_card.id;
    }

    if (turn_indicator_label !== null) {
        turn_indicator_label.textContent = (
            gameMode === "tutorial"
            ? (
                tutorial_series_title + " " + (tutorialLevelIndex + 1) +
                ": " + tutorial_levels[tutorialLevelIndex].title
            )
            : current_player.name + "'s turn"
        );
    }



    if (game_log !== null) {
        game_log.replaceChildren();

        state.log.slice(-5).forEach(function (message) {
            var item = document.createElement("li");
            item.textContent = message;
            game_log.appendChild(item);
        });
    }
    if (state.winner !== undefined) {
        show_winner_popup();
    }
};

apply_multiplayer_turn_controls = function () {
    var can_play = can_take_local_turn();

    hand_cards.querySelectorAll(".card-image").forEach(function (card_image) {
        card_image.style.pointerEvents = can_play ? "" : "none";
        card_image.style.opacity = can_play ? "" : "0.48";
        card_image.setAttribute("aria-disabled", String(!can_play));
    });

    if (gameMode !== "multi") {
        if (draw_end_turn_button !== null) {
            draw_end_turn_button.disabled = !can_play;
        }
        return;
    }

    if (draw_end_turn_button !== null) {
        draw_end_turn_button.disabled = !can_play;
    }
};

render = function () {
    var effects = pending_render_effects;

    render_top_discard_on_board();
    render_pieces();
    render_hand();
    render_info();
    apply_multiplayer_turn_controls();

    if (effects !== undefined) {
        if (effects.winner_changed) {
            spawn_confetti();
        }

        play_pending_sounds(effects);
        pending_render_effects = undefined;
    }

    schedule_cpu_if_needed();
    render_tutorial_coach();
};

update_mode_controls = function () {
    var restart_button = document.getElementById("reset-demo");
    var is_tutorial = gameMode === "tutorial";

    if (restart_button !== null) {
        restart_button.hidden = gameMode === "multi";
    }

    if (tutorial_prev_button !== null) {
        tutorial_prev_button.hidden = !is_tutorial;
        tutorial_prev_button.disabled = tutorialLevelIndex === 0;
    }

    if (tutorial_exit_button !== null) {
        tutorial_exit_button.hidden = !is_tutorial;
    }

    if (single_exit_button !== null) {
        single_exit_button.hidden = gameMode !== "single";
    }

    if (draw_end_turn_button !== null) {
        draw_end_turn_button.hidden = is_tutorial;
    }

    if (sound_toggle_button !== null) {
        sound_toggle_button.hidden = is_tutorial;
    }

    if (open_log_button !== null) {
        open_log_button.hidden = is_tutorial;
    }

    if (debug_move_button !== null) {
        debug_move_button.hidden = gameMode === "multi" || is_tutorial;
    }

    if (give_card_button !== null) {
        give_card_button.hidden = gameMode === "multi" || is_tutorial;
    }
};

var set_demo_plane = function (status, position) {
    var player = state.players[0];

    var blue_plane = Object.freeze({
        status: status,
        position: position,
        shielded: false,
        frozen: false
    });

    var next_state = Unoludo.update_plane(
        state,
        player.id,
        0,
        blue_plane
    );

    prepare_render_effects(state, next_state, {});
    state = next_state;
    render();
};

var restart_game = function () {
    if (gameMode === "multi") {
        action_message.textContent = "Restart is disabled in multiplayer games.";
        return;
    }

    if (gameMode === "tutorial") {
        load_tutorial_level(tutorialLevelIndex);
        return;
    }

    Object.keys(piece_elements).forEach(function (piece_key) {
        piece_elements[piece_key].remove();
        delete piece_elements[piece_key];
        delete previous_piece_snapshots[piece_key];
    });

    if (cpu_timer !== undefined) {
        window.clearTimeout(cpu_timer);
        cpu_timer = undefined;
    }

    hand_cards.classList.remove("cpu-thinking");
    hand_cards.style.filter = "";
    hand_cards.style.transform = "";

    initGameState([
        "Player",
        "CPU Green",
        "CPU Red",
        "CPU Yellow"
    ], {
        shuffle: true
    });
    rendered_discard_card_id = undefined;
    pending_render_effects = undefined;
    winner_popup_shown = false;
    tutorialAcknowledged = false;
    tutorialAckPending = false;
    Object.keys(draw_streaks).forEach(function (key) {
        draw_streaks[key] = 0;
    });
    if (particle_canvas !== null) {
        particle_canvas.replaceChildren();
    }
    clear_selection();
    hide_winner_popup();
    action_message.textContent = "Game reset.";
    render();
};

document.getElementById("reset-demo").addEventListener("click", restart_game);
winner_restart_button.addEventListener("click", restart_game);

if (tutorial_prev_button !== null) {
    tutorial_prev_button.addEventListener("click", function () {
        if (gameMode === "tutorial") {
            load_tutorial_level(tutorialLevelIndex - 1);
        }
    });
}

if (tutorial_exit_button !== null) {
    tutorial_exit_button.addEventListener("click", function () {
        if (gameMode === "tutorial") {
            exit_tutorial();
        }
    });
}

if (single_exit_button !== null) {
    single_exit_button.addEventListener("click", function () {
        if (gameMode === "single") {
            exit_single_player();
        }
    });
}

document.getElementById("draw-end-turn").addEventListener("click", function () {
    if (!can_take_local_turn()) {
        return;
    }

    var next_state = Unoludo.draw_one_and_end_turn(state);

    if (next_state !== undefined) {
        var player = Unoludo.current_player(state);

        prepare_render_effects(state, next_state, {});

        if (!has_playable_launch_six(player, state)) {
            increment_draw_streak(player.id);
        } else {
            reset_draw_streak(player.id);
        }

        if (check_draw_streak_p6(player.id) && has_no_planes_on_track(player)) {
            var p6_card = Unoludo.create_reward_card(6);
            var new_players = next_state.players.map(function (p, i) {
                if (i === player.id) {
                    return Object.freeze({
                        id: p.id,
                        name: p.name,
                        colour: p.colour,
                        kind: p.kind,
                        hand: Unoludo.sorted_hand(p.hand.concat([p6_card])),
                        planes: p.planes
                    });
                }
                return p;
            });

            state = Object.freeze({
                draw_pile: next_state.draw_pile,
                discard_pile: next_state.discard_pile,
                players: Object.freeze(new_players),
                current_player: next_state.current_player,
                active_colour: next_state.active_colour,
                winner: next_state.winner,
                player_moods: next_state.player_moods,
                log: Object.freeze(next_state.log.concat([
                    player.name + " received a P6 reward card (6th draw streak)!"
                ]))
            });
        } else {
            state = next_state;
        }

        clear_selection();
        action_message.textContent = "Drew one card and ended turn.";
        sync_multiplayer_state();
        render();
    }
});

var cancel_action_button = document.getElementById("cancel-action");

if (cancel_action_button !== null) {
    cancel_action_button.addEventListener("click", function () {
        clear_selection();
        action_message.textContent = "Selection cancelled.";
        render();
    });
}

window.addEventListener("resize", function () {
    render_tutorial_coach();
});

var multiplayer_player_names = Object.freeze([
    "Player 1",
    "Player 2",
    "Player 3",
    "Player 4"
]);

var single_player_names = Object.freeze([
    "Player",
    "CPU Green",
    "CPU Red",
    "CPU Yellow"
]);

var basic_tutorial_levels = Object.freeze([
    Object.freeze({
        title: "Launch",
        instruction: "Blue 6 can launch a blue plane. Yellow 6 is not playable here.",
        coach: Object.freeze({
            cardIds: Object.freeze(["tutorial-blue-6"]),
            cardHint: "6 can launch a plane.",
            targetSelector: ".current-player-piece",
            targetHint: "Click any blue plane to launch."
        }),
        setup: function () {
            return tutorial_state([
                tutorial_player(
                    0,
                    "Player",
                    "blue",
                    [
                        Unoludo.card("tutorial-yellow-6", "number", "yellow", 6),
                        Unoludo.card("tutorial-blue-6", "number", "blue", 6)
                    ],
                    Unoludo.empty_planes()
                )
            ], Unoludo.card("tutorial-top-blue-1", "number", "blue", 1));
        },
        isComplete: function (test_state) {
            return test_state.players[0].planes.some(function (plane) {
                return plane.status === "gate";
            });
        }
    }),
    Object.freeze({
        title: "Move From Gate",
        instruction: "Play the blue 2 and move the plane from the gate onto the track.",
        coach: Object.freeze({
            cardIds: Object.freeze(["tutorial-blue-2"]),
            cardHint: "This 2 moves your plane two steps.",
            targetSelector: "[data-piece-key='player-0-plane-0']",
            targetHint: "Move this plane from the gate."
        }),
        setup: function () {
            return tutorial_state([
                tutorial_player(
                    0,
                    "Player",
                    "blue",
                    [Unoludo.card("tutorial-blue-2", "number", "blue", 2)],
                    tutorial_four_planes(tutorial_plane("gate", -1))
                )
            ], Unoludo.card("tutorial-top-blue-1", "number", "blue", 1));
        },
        isComplete: function (test_state) {
            var plane = test_state.players[0].planes[0];

            return plane.status === "track" && plane.position === 1;
        }
    }),
    Object.freeze({
        title: "Match Colour Or Number",
        instruction: "The top card is blue 4. Blue 2 matches colour, red 4 matches number, but red 1 cannot be played.",
        coach: Object.freeze({
            cardIds: Object.freeze(["tutorial-blue-2-match", "tutorial-red-4-match"]),
            cardHint: "Match blue or match the number 4.",
            targetSelector: "[data-piece-key='player-0-plane-0']",
            targetHint: "Now choose your plane."
        }),
        setup: function () {
            return tutorial_state([
                tutorial_player(
                    0,
                    "Player",
                    "blue",
                    [
                        Unoludo.card("tutorial-red-1-mismatch", "number", "red", 1),
                        Unoludo.card("tutorial-blue-2-match", "number", "blue", 2),
                        Unoludo.card("tutorial-red-4-match", "number", "red", 4)
                    ],
                    tutorial_four_planes(tutorial_plane("gate", -1))
                )
            ], Unoludo.card("tutorial-top-blue-4", "number", "blue", 4));
        },
        isComplete: function (test_state) {
            var top_card = Unoludo.top_discard(test_state);

            return (
                top_card.id === "tutorial-blue-2-match" ||
                top_card.id === "tutorial-red-4-match"
            );
        }
    }),
    Object.freeze({
        title: "Draw When Stuck",
        instruction: "None of your cards can be played. Click the grey Draw card to take one card and end the turn.",
        allowTutorialDraw: true,
        coach: Object.freeze({
            cardIds: Object.freeze(["tutorial-draw-card"]),
            cardHint: "No playable cards? Click Draw.",
            targetSelector: undefined,
            targetHint: ""
        }),
        setup: function () {
            return tutorial_state([
                tutorial_player(
                    0,
                    "Player",
                    "blue",
                    [
                        Unoludo.card("tutorial-draw-red-1", "number", "red", 1),
                        Unoludo.card("tutorial-draw-yellow-2", "number", "yellow", 2)
                    ],
                    tutorial_four_planes(tutorial_plane("gate", -1))
                )
            ], Unoludo.card("tutorial-top-blue-4-draw", "number", "blue", 4), {
                draw_pile: Object.freeze([
                    Unoludo.card("tutorial-drawn-blue-6", "number", "blue", 6)
                ])
            });
        },
        isComplete: function (test_state) {
            return test_state.players[0].hand.some(function (card) {
                return card.id === "tutorial-drawn-blue-6";
            });
        }
    }),
    Object.freeze({
        title: "Capture",
        instruction: "Play the blue 4 to land on the red plane and send it back to base.",
        coach: Object.freeze({
            cardIds: Object.freeze(["tutorial-blue-4-capture"]),
            cardHint: "This 4 lands on the red plane.",
            targetSelector: "[data-piece-key='player-0-plane-0']",
            targetHint: "Move your plane to capture."
        }),
        setup: function () {
            return tutorial_state([
                tutorial_player(
                    0,
                    "Player",
                    "blue",
                    [Unoludo.card("tutorial-blue-4-capture", "number", "blue", 4)],
                    tutorial_four_planes(tutorial_plane("track", 5))
                ),
                tutorial_player(
                    1,
                    "Red",
                    "red",
                    [],
                    tutorial_four_planes(tutorial_plane("track", 9))
                )
            ], Unoludo.card("tutorial-top-blue-1", "number", "blue", 1));
        },
        isComplete: function (test_state) {
            return test_state.players[1].planes[0].status === "base";
        }
    }),
    Object.freeze({
        title: "Shield",
        instruction: "Shield the blue plane, then var Red try to capture it. The shield blocks the attack.",
        coach: function () {
            if (state.current_player === 1) {
                return Object.freeze({
                    cardIds: Object.freeze(["tutorial-blue-4-shield-attack"]),
                    cardHint: "Now try to attack the shielded plane.",
                    targetSelector: "[data-piece-key='player-1-plane-0']",
                    targetHint: "Move Red onto Blue."
                });
            }

            return Object.freeze({
                cardIds: Object.freeze(["tutorial-blue-0"]),
                cardHint: "0 gives a shield.",
                targetSelector: "[data-piece-key='player-0-plane-0']",
                targetHint: "Shield this active plane."
            });
        },
        setup: function () {
            return tutorial_state([
                tutorial_player(
                    0,
                    "Player",
                    "blue",
                    [Unoludo.card("tutorial-blue-0", "number", "blue", 0)],
                    tutorial_four_planes(tutorial_plane("track", 9))
                ),
                tutorial_player(
                    1,
                    "Red",
                    "red",
                    [Unoludo.card("tutorial-blue-4-shield-attack", "number", "blue", 4)],
                    tutorial_four_planes(tutorial_plane("track", 5))
                )
            ], Unoludo.card("tutorial-top-blue-5", "number", "blue", 5));
        },
        isComplete: function (test_state) {
            var blue_plane = test_state.players[0].planes[0];
            var red_plane = test_state.players[1].planes[0];
            var top_card = Unoludo.top_discard(test_state);

            return (
                top_card.id === "tutorial-blue-4-shield-attack" &&
                blue_plane.status === "track" &&
                blue_plane.position === 9 &&
                red_plane.status === "track" &&
                red_plane.position === 9
            );
        }
    }),
    Object.freeze({
        title: "Skip",
        instruction: "Play Skip, then choose the red plane to freeze it.",
        coach: Object.freeze({
            cardIds: Object.freeze(["tutorial-blue-skip"]),
            cardHint: "Skip freezes another player's planes.",
            targetSelector: "[data-piece-key='player-1-plane-0']",
            targetHint: "Freeze this red plane."
        }),
        setup: function () {
            return tutorial_state([
                tutorial_player(
                    0,
                    "Player",
                    "blue",
                    [Unoludo.card("tutorial-blue-skip", "skip", "blue")],
                    Unoludo.empty_planes()
                ),
                tutorial_player(
                    1,
                    "Red",
                    "red",
                    [],
                    tutorial_four_planes(tutorial_plane("track", 12))
                )
            ], Unoludo.card("tutorial-top-skip", "skip", "blue"));
        },
        isComplete: function (test_state) {
            return test_state.players[1].planes[0].frozen === true;
        }
    }),
    Object.freeze({
        title: "Jump Square",
        instruction: "Play the blue 2 to land on the jump square and leap ahead.",
        coach: Object.freeze({
            cardIds: Object.freeze(["tutorial-blue-2-jump"]),
            cardHint: "This 2 reaches the jump square.",
            targetSelector: "[data-piece-key='player-0-plane-0']",
            targetHint: "Move onto the jump square."
        }),
        setup: function () {
            return tutorial_state([
                tutorial_player(
                    0,
                    "Player",
                    "blue",
                    [Unoludo.card("tutorial-blue-2-jump", "number", "blue", 2)],
                    tutorial_four_planes(tutorial_plane("track", 15))
                )
            ], Unoludo.card("tutorial-top-blue-1", "number", "blue", 1));
        },
        isComplete: function (test_state) {
            var plane = test_state.players[0].planes[0];

            return plane.status === "track" && plane.position === 29;
        }
    }),
    Object.freeze({
        title: "Finish A Plane",
        instruction: "Play the blue 1 to move from the last home-lane square into the finish.",
        coach: Object.freeze({
            cardIds: Object.freeze(["tutorial-blue-1-finish"]),
            cardHint: "This 1 reaches the finish.",
            targetSelector: "[data-piece-key='player-0-plane-0']",
            targetHint: "Finish this plane."
        }),
        setup: function () {
            return tutorial_state([
                tutorial_player(
                    0,
                    "Player",
                    "blue",
                    [Unoludo.card("tutorial-blue-1-finish", "number", "blue", 1)],
                    tutorial_four_planes(tutorial_plane("home", 4))
                )
            ], Unoludo.card("tutorial-top-blue-1", "number", "blue", 1));
        },
        isComplete: function (test_state) {
            var plane = test_state.players[0].planes[0];

            return plane.status === "finished";
        }
    }),
    Object.freeze({
        title: "Win The Game",
        instruction: "Three planes are already finished. Play the blue 1 on the last home-lane plane to finish all four and win.",
        coach: Object.freeze({
            cardIds: Object.freeze(["tutorial-blue-1-win"]),
            cardHint: "This final move wins the game.",
            targetSelector: "[data-piece-key='player-0-plane-0']",
            targetHint: "Finish the last plane."
        }),
        setup: function () {
            return tutorial_state([
                tutorial_player(
                    0,
                    "Player",
                    "blue",
                    [Unoludo.card("tutorial-blue-1-win", "number", "blue", 1)],
                    Object.freeze([
                        tutorial_plane("home", 4),
                        tutorial_plane("finished", 5),
                        tutorial_plane("finished", 5),
                        tutorial_plane("finished", 5)
                    ])
                )
            ], Unoludo.card("tutorial-top-blue-1-win", "number", "blue", 1));
        },
        isComplete: function (test_state) {
            return test_state.winner === 0;
        }
    })
]);

var enhanced_tutorial_levels = Object.freeze([
    Object.freeze({
        title: "Draw Two",
        instruction: "Only the blue +2 can be played. It replaces itself with two new cards, so your hand grows from 3 cards to 4.",
        coach: Object.freeze({
            cardIds: Object.freeze(["enhanced-blue-draw2"]),
            cardHint: "Play +2 to draw two cards.",
            targetSelector: undefined,
            targetHint: ""
        }),
        acknowledgeMessage: "You played 1 card and drew 2 new cards. Your hand increased from 3 cards to 4.",
        setup: function () {
            return tutorial_state([
                tutorial_player(
                    0,
                    "Player",
                    "blue",
                    [
                        Unoludo.card("enhanced-red-1-draw2-blocked", "number", "red", 1),
                        Unoludo.card("enhanced-yellow-2-draw2-blocked", "number", "yellow", 2),
                        Unoludo.card("enhanced-blue-draw2", "draw2", "blue")
                    ],
                    tutorial_four_planes(tutorial_plane("track", 0))
                )
            ], Unoludo.card("enhanced-top-blue-5", "number", "blue", 5), {
                draw_pile: Object.freeze([
                    Unoludo.card("enhanced-draw2-drawn-red-1", "number", "red", 1),
                    Unoludo.card("enhanced-draw2-drawn-yellow-2", "number", "yellow", 2)
                ])
            });
        },
        isComplete: function (test_state) {
            return (
                Unoludo.top_discard(test_state).id === "enhanced-blue-draw2" &&
                test_state.players[0].hand.some(function (card) {
                    return card.id === "enhanced-draw2-drawn-red-1";
                }) &&
                test_state.players[0].hand.some(function (card) {
                    return card.id === "enhanced-draw2-drawn-yellow-2";
                })
            );
        }
    }),
    Object.freeze({
        title: "Reverse",
        instruction: "Only Reverse can be played. Choose an enemy plane, then choose how many spaces it moves backward.",
        coach: Object.freeze({
            cardIds: Object.freeze(["enhanced-blue-reverse"]),
            cardHint: "Reverse pushes an enemy plane back.",
            targetSelector: "[data-piece-key='player-1-plane-0']",
            targetHint: "Choose this red plane."
        }),
        setup: function () {
            return tutorial_state([
                tutorial_player(
                    0,
                    "Player",
                    "blue",
                    [
                        Unoludo.card("enhanced-red-1-reverse-blocked", "number", "red", 1),
                        Unoludo.card("enhanced-yellow-2-reverse-blocked", "number", "yellow", 2),
                        Unoludo.card("enhanced-blue-reverse", "reverse", "blue")
                    ],
                    tutorial_four_planes(tutorial_plane("track", 0))
                ),
                tutorial_player(
                    1,
                    "Red",
                    "red",
                    [],
                    tutorial_four_planes(tutorial_plane("track", 10))
                )
            ], Unoludo.card("enhanced-top-blue-5-reverse", "number", "blue", 5));
        },
        isComplete: function (test_state) {
            var red_plane = test_state.players[1].planes[0];

            return (
                Unoludo.top_discard(test_state).id === "enhanced-blue-reverse" &&
                red_plane.status === "track" &&
                red_plane.position < 10
            );
        }
    }),
    Object.freeze({
        title: "Wild Combo",
        instruction: "Red sent one of your planes home. Use Green's plane with Wild to get revenge on Red.",
        coach: function () {
            if (target_mode === "wild_number") {
                return Object.freeze({
                    cardIds: Object.freeze(["enhanced-green-4-wild"]),
                    cardHint: "Choose green 4 for Wild.",
                    showCardDuringTargetMode: true,
                    targetSelector: undefined,
                    targetHint: ""
                });
            }

            if (target_mode === "wild_target") {
                return Object.freeze({
                    cardIds: Object.freeze(["enhanced-wild"]),
                    cardHint: "",
                    targetSelector: "[data-piece-key='player-1-plane-0']",
                    targetHint: "Move Green to hit Red."
                });
            }

            return Object.freeze({
                cardIds: Object.freeze(["enhanced-wild"]),
                cardHint: "Wild can move any player's active plane.",
                targetSelector: "[data-piece-key='player-1-plane-0']",
                targetHint: "Use Green's plane for revenge."
            });
        },
        setup: function () {
            return tutorial_state([
                tutorial_player(
                    0,
                    "Player",
                    "blue",
                    [
                        Unoludo.card("enhanced-wild", "wild", "wild"),
                        Unoludo.card("enhanced-green-4-wild", "number", "green", 4)
                    ],
                    Unoludo.empty_planes()
                ),
                tutorial_player(
                    1,
                    "Green",
                    "green",
                    [],
                    tutorial_four_planes(tutorial_plane("track", 19))
                ),
                tutorial_player(
                    2,
                    "Red",
                    "red",
                    [],
                    tutorial_four_planes(tutorial_plane("track", 23))
                )
            ], Unoludo.card("enhanced-top-red-5-wild", "number", "red", 5));
        },
        isComplete: function (test_state) {
            var green_plane = test_state.players[1].planes[0];
            var red_plane = test_state.players[2].planes[0];

            return (
                Unoludo.top_discard(test_state).id === "enhanced-green-4-wild" &&
                green_plane.status === "track" &&
                green_plane.position === 23 &&
                red_plane.status === "base"
            );
        }
    }),
    Object.freeze({
        title: "Wild +4: Draw Four",
        instruction: "First try Wild +4's Draw 4 option. After choosing it, choose any colour.",
        forcedWild4Option: "draw4",
        coach: Object.freeze({
            cardIds: Object.freeze(["enhanced-wild4-draw"]),
            cardHint: "Choose Draw 4 this time.",
            targetSelector: undefined,
            targetHint: ""
        }),
        acknowledgeMessage: "Draw 4 added four new cards to your hand. Wild +4 also lets you choose the next colour.",
        setup: function () {
            return tutorial_state([
                tutorial_player(
                    0,
                    "Player",
                    "blue",
                    [
                        Unoludo.card("enhanced-red-1-wild4-draw-blocked", "number", "red", 1),
                        Unoludo.card("enhanced-yellow-2-wild4-draw-blocked", "number", "yellow", 2),
                        Unoludo.card("enhanced-wild4-draw", "wild4", "wild")
                    ],
                    tutorial_four_planes(tutorial_plane("track", 0))
                )
            ], Unoludo.card("enhanced-top-blue-5-wild4", "number", "blue", 5), {
                draw_pile: Object.freeze([
                    Unoludo.card("enhanced-wild4-draw-a", "number", "blue", 1),
                    Unoludo.card("enhanced-wild4-draw-b", "number", "green", 2),
                    Unoludo.card("enhanced-wild4-draw-c", "number", "red", 3),
                    Unoludo.card("enhanced-wild4-draw-d", "number", "yellow", 4)
                ])
            });
        },
        isComplete: function (test_state) {
            return (
                Unoludo.top_discard(test_state).id === "enhanced-wild4-draw" &&
                tutorial_hand_contains(test_state, 0, "enhanced-wild4-draw-a") &&
                tutorial_hand_contains(test_state, 0, "enhanced-wild4-draw-b") &&
                tutorial_hand_contains(test_state, 0, "enhanced-wild4-draw-c") &&
                tutorial_hand_contains(test_state, 0, "enhanced-wild4-draw-d")
            );
        }
    }),
    Object.freeze({
        title: "Wild +4: Move All",
        instruction: "Now choose Wild +4's Move All option. All four blue planes move 4 spaces and can capture together.",
        forcedWild4Option: "advance_all",
        coach: Object.freeze({
            cardIds: Object.freeze(["enhanced-wild4-move"]),
            cardHint: "Choose Move All Active Planes.",
            targetSelector: undefined,
            targetHint: ""
        }),
        setup: function () {
            return tutorial_state([
                tutorial_player(
                    0,
                    "Player",
                    "blue",
                    [
                        Unoludo.card("enhanced-red-1-wild4-move-blocked", "number", "red", 1),
                        Unoludo.card("enhanced-yellow-2-wild4-move-blocked", "number", "yellow", 2),
                        Unoludo.card("enhanced-wild4-move", "wild4", "wild")
                    ],
                    Object.freeze([
                        tutorial_plane("track", 0),
                        tutorial_plane("track", 1),
                        tutorial_plane("track", 2),
                        tutorial_plane("track", 3)
                    ])
                ),
                tutorial_player(
                    1,
                    "Red",
                    "red",
                    [],
                    Object.freeze([
                        tutorial_plane("track", 4),
                        tutorial_plane("track", 5),
                        tutorial_plane("track", 6),
                        tutorial_plane("track", 7)
                    ])
                )
            ], Unoludo.card("enhanced-top-green-5-wild4-move", "number", "green", 5));
        },
        isComplete: function (test_state) {
            return (
                Unoludo.top_discard(test_state).id === "enhanced-wild4-move" &&
                test_state.players[0].planes.every(function (plane, index) {
                    return plane.status === "track" && plane.position === index + 4;
                }) &&
                test_state.players[1].planes.every(function (plane) {
                    return plane.status === "base";
                })
            );
        }
    }),
    Object.freeze({
        title: "Last Card Reward",
        instruction: "When you play your final card, you receive two normal cards and one reward card. Reward cards are wild 6, 7, 8, or 9 cards that ignore colour.",
        coach: Object.freeze({
            cardIds: Object.freeze(["enhanced-blue-1-empty"]),
            cardHint: "Play your final card.",
            targetSelector: "[data-piece-key='player-0-plane-0']",
            targetHint: "Empty your hand to earn a reward."
        }),
        setup: function () {
            return tutorial_state([
                tutorial_player(
                    0,
                    "Player",
                    "blue",
                    [Unoludo.card("enhanced-blue-1-empty", "number", "blue", 1)],
                    tutorial_four_planes(tutorial_plane("gate", -1))
                )
            ], Unoludo.card("enhanced-top-blue-5-empty", "number", "blue", 5), {
                draw_pile: Object.freeze([
                    Unoludo.card("enhanced-empty-drawn-red-2", "number", "red", 2),
                    Unoludo.card("enhanced-empty-drawn-yellow-3", "number", "yellow", 3)
                ])
            });
        },
        isComplete: function (test_state) {
            return test_state.players[0].hand.some(function (card) {
                return card.type === "reward";
            });
        }
    }),
    Object.freeze({
        title: "Reward 6",
        instruction: "Reward 6 ignores colour and can launch a plane from base.",
        coach: Object.freeze({
            cardIds: Object.freeze(["enhanced-reward-6"]),
            cardHint: "Reward 6 can launch from base.",
            targetSelector: "[data-piece-key='player-0-plane-0']",
            targetHint: "Launch any plane with Reward 6."
        }),
        setup: function () {
            return tutorial_state([
                tutorial_player(
                    0,
                    "Player",
                    "blue",
                    [Unoludo.card("enhanced-reward-6", "reward", "wild", 6)],
                    Unoludo.empty_planes()
                )
            ], Unoludo.card("enhanced-top-red-2-reward6", "number", "red", 2));
        },
        isComplete: function (test_state) {
            // Completing on any launched plane (not only plane 0) so the player
            // is free to choose which plane to launch.
            return Unoludo.top_discard(test_state).id === "enhanced-reward-6";
        }
    }),
    Object.freeze({
        title: "Reward 7-9",
        instruction: "Reward 7, 8, and 9 also ignore colour. Like Reward 6, they can launch a plane from base, or move any active plane by their number.",
        coach: Object.freeze({
            cardIds: Object.freeze(["enhanced-reward-9"]),
            cardHint: "Reward 9 moves any active plane.",
            targetSelector: "[data-piece-key='player-0-plane-0']",
            targetHint: "Use Reward 9 on any plane."
        }),
        setup: function () {
            return tutorial_state([
                tutorial_player(
                    0,
                    "Player",
                    "blue",
                    [Unoludo.card("enhanced-reward-9", "reward", "wild", 9)],
                    tutorial_four_planes(tutorial_plane("track", 0))
                )
            ], Unoludo.card("enhanced-top-red-2-reward9", "number", "red", 2));
        },
        isComplete: function (test_state) {
            // Reward 9 may either move the active plane or launch a base plane,
            // so completion only requires that the reward card has been played.
            return Unoludo.top_discard(test_state).id === "enhanced-reward-9";
        }
    })
]);

tutorial_levels = basic_tutorial_levels;
tutorial_series_title = "Basic Tutorial";

reset_local_runtime_state = function () {
    Object.keys(piece_elements).forEach(function (piece_key) {
        piece_elements[piece_key].remove();
        delete piece_elements[piece_key];
        delete previous_piece_snapshots[piece_key];
    });

    if (cpu_timer !== undefined) {
        window.clearTimeout(cpu_timer);
        cpu_timer = undefined;
    }

    if (tutorialCompletionTimer !== undefined) {
        window.clearTimeout(tutorialCompletionTimer);
        tutorialCompletionTimer = undefined;
    }

    hand_cards.classList.remove("cpu-thinking");
    hand_cards.style.filter = "";
    hand_cards.style.transform = "";
    rendered_discard_card_id = undefined;
    pending_render_effects = undefined;
    winner_popup_shown = false;
    tutorialAcknowledged = false;
    tutorialAckPending = false;
    Object.keys(draw_streaks).forEach(function (key) {
        draw_streaks[key] = 0;
    });
    if (particle_canvas !== null) {
        particle_canvas.replaceChildren();
    }
    clear_selection();
    hide_winner_popup();
    if (tutorial_complete_overlay !== null) {
        tutorial_complete_overlay.classList.add("hidden");
    }
    if (tutorial_coach_layer !== null) {
        tutorial_coach_layer.classList.add("hidden");
        tutorial_coach_layer.replaceChildren();
    }
};

update_tutorial_panel = function () {
    var level = tutorial_levels[tutorialLevelIndex];

    if (
        tutorial_panel === null ||
        tutorial_level_label === null ||
        tutorial_title === null ||
        tutorial_instruction === null
    ) {
        return;
    }

    if (gameMode !== "tutorial" || level === undefined) {
        tutorial_panel.classList.add("hidden");
        return;
    }

    tutorial_panel.classList.remove("hidden");
    tutorial_level_label.textContent = (
        tutorial_series_title + " Level " + (tutorialLevelIndex + 1) +
        " / " + tutorial_levels.length
    );
    tutorial_title.textContent = level.title;
    tutorial_instruction.textContent = level.instruction;
};

hide_tutorial_coach = function () {
    if (tutorial_coach_layer !== null) {
        tutorial_coach_layer.classList.add("hidden");
        tutorial_coach_layer.replaceChildren();
    }
};

var first_existing_tutorial_card = function (card_ids) {
    var found_card = null;

    card_ids.some(function (card_id) {
        var candidate = hand_cards.querySelector(
            ".card-image[data-card-id='" + card_id + "']"
        );

        if (candidate !== null) {
            found_card = candidate;
            return true;
        }

        return false;
    });

    return found_card;
};

var position_tutorial_coach = function (target, message) {
    var bubble = document.createElement("div");
    var rect = target.getBoundingClientRect();
    var bubble_width = Math.min(260, Math.max(180, window.innerWidth - 32));
    var target_center = rect.left + rect.width / 2;
    var left;
    var top;
    var arrow_left;

    if (tutorial_coach_layer === null) {
        return;
    }

    bubble.className = "tutorial-coach-bubble";
    bubble.textContent = message;
    bubble.style.width = bubble_width + "px";
    bubble.style.visibility = "hidden";

    tutorial_coach_layer.replaceChildren(bubble);
    tutorial_coach_layer.classList.remove("hidden");

    var bubble_rect = bubble.getBoundingClientRect();
    left = target_center - bubble_rect.width / 2;
    top = rect.top - bubble_rect.height - 16;

    if (top < 12) {
        top = rect.bottom + 16;
        bubble.classList.add("is-below");
    }

    left = Math.max(12, Math.min(left, window.innerWidth - bubble_rect.width - 12));
    top = Math.max(12, Math.min(top, window.innerHeight - bubble_rect.height - 12));
    arrow_left = Math.max(22, Math.min(target_center - left, bubble_rect.width - 22));

    bubble.style.setProperty("--coach-arrow-left", arrow_left + "px");
    bubble.style.left = left + "px";
    bubble.style.top = top + "px";
    bubble.style.visibility = "visible";
};

var tutorial_coach_for_level = function (level) {
    if (typeof level.coach === "function") {
        return level.coach();
    }

    return level.coach;
};

render_tutorial_coach = function () {
    var level = tutorial_levels[tutorialLevelIndex];
    var coach = level === undefined ? undefined : tutorial_coach_for_level(level);
    var target;

    if (
        gameMode !== "tutorial" ||
        level === undefined ||
        coach === undefined ||
        active_piece_animations !== 0
    ) {
        hide_tutorial_coach();
        return;
    }

    if (
        (selected_card_id === undefined && target_mode === undefined) ||
        coach.showCardDuringTargetMode === true
    ) {
        target = first_existing_tutorial_card(coach.cardIds);

        if (target !== null) {
            position_tutorial_coach(target, coach.cardHint);
            return;
        }
    }

    if (coach.targetSelector !== undefined) {
        target = document.querySelector(coach.targetSelector);

        if (target !== null) {
            position_tutorial_coach(target, coach.targetHint);
            return;
        }
    }

    hide_tutorial_coach();
};

load_tutorial_level = function (level_index) {
    var bounded_index = Math.max(
        0,
        Math.min(level_index, tutorial_levels.length - 1)
    );
    var level = tutorial_levels[bounded_index];

    tutorialLevelIndex = bounded_index;
    reset_local_runtime_state();
    state = level.setup();
    action_message.textContent = level.instruction;
    update_mode_controls();
    update_tutorial_panel();
    render();
};

exit_single_player = function () {
    gameMode = "none";
    reset_local_runtime_state();
    update_mode_controls();
    update_tutorial_panel();
    close_log();

    if (window.UnoludoLobby !== undefined) {
        window.UnoludoLobby.showScreen(window.UnoludoLobby.getHomeScreen());
    }
};

exit_tutorial = function () {
    gameMode = "none";
    reset_local_runtime_state();
    update_mode_controls();
    update_tutorial_panel();

    if (window.UnoludoLobby !== undefined) {
        window.UnoludoLobby.showScreen(window.UnoludoLobby.getHomeScreen());
    }
};

var show_tutorial_complete_overlay = function (is_final_level) {
    if (
        tutorial_complete_overlay === null ||
        tutorial_complete_title === null
    ) {
        return;
    }

    tutorial_complete_title.textContent = (
        is_final_level
        ? "Tutorial Complete"
        : "Level Complete"
    );
    tutorial_complete_overlay.classList.remove("hidden");
};

check_tutorial_progress = function () {
    var level = tutorial_levels[tutorialLevelIndex];
    var is_final_level = tutorialLevelIndex >= tutorial_levels.length - 1;

    if (
        gameMode !== "tutorial" ||
        level === undefined ||
        !level.isComplete(state)
    ) {
        return;
    }

    if (
        tutorial_requires_acknowledgement(level) &&
        tutorialAcknowledged === false
    ) {
        tutorialAckPending = true;
        action_message.textContent = level.acknowledgeMessage;
        render();
        return;
    }

    if (active_piece_animations !== 0) {
        if (tutorialCompletionTimer === undefined) {
            tutorialCompletionTimer = window.setTimeout(function () {
                tutorialCompletionTimer = undefined;
                check_tutorial_progress();
            }, 180);
        }
        return;
    }

    show_tutorial_complete_overlay(is_final_level);

    tutorialCompletionTimer = window.setTimeout(function () {
        tutorialCompletionTimer = undefined;

        if (is_final_level) {
            exit_tutorial();
            return;
        }

        load_tutorial_level(tutorialLevelIndex + 1);
    }, 1200);
};

window.UnoludoApp = {
    startSinglePlayer: function () {
        gameMode = "single";
        update_mode_controls();
        myPlayerIndex = 0;
        multiplayerCpuAuthorityIndex = 0;
        mpStateSynced = false;
        reset_local_runtime_state();
        initGameState(single_player_names, {
            shuffle: true
        });
        action_message.textContent = "Game started.";
        render();
    },

    startTutorial: function () {
        gameMode = "tutorial";
        myPlayerIndex = 0;
        multiplayerCpuAuthorityIndex = 0;
        mpStateSynced = false;
        tutorial_levels = basic_tutorial_levels;
        tutorial_series_title = "Basic Tutorial";
        tutorialLevelIndex = 0;
        load_tutorial_level(0);
    },

    startEnhancedTutorial: function () {
        gameMode = "tutorial";
        myPlayerIndex = 0;
        multiplayerCpuAuthorityIndex = 0;
        mpStateSynced = false;
        tutorial_levels = enhanced_tutorial_levels;
        tutorial_series_title = "Enhanced Tutorial";
        tutorialLevelIndex = 0;
        load_tutorial_level(0);
    },

    startMultiPlayer: function (roomId, playerIndex, playerKinds, playerNames) {
        gameMode = "multi";
        update_mode_controls();
        myPlayerIndex = playerIndex;
        multiplayerCpuAuthorityIndex = (
            window.UnoludoLobby !== undefined &&
            window.UnoludoLobby.getCurrentHostIndex !== undefined
            ? window.UnoludoLobby.getCurrentHostIndex()
            : 0
        );
        mpStateSynced = false;
        reset_local_runtime_state();

        // Use the definitive playerKinds from the lobby (all clients get the same array)
        // Empty slots default to "cpu" so the game cycles through all 4 players
        var kinds = playerKinds || ["human", "human", "human", "human"];
        var names = playerNames || multiplayer_player_names;
        console.log("[MultiPlayer] playerKinds:", kinds, "myIndex:", playerIndex);

        initGameState(names, {
            shuffle: true,
            playerKinds: kinds
        });

        window.UnoludoMultiplayer.onStateChange(function (remote_state) {
            state = window.UnoludoMultiplayer.unflattenState(remote_state);
            mpStateSynced = true;
            clear_selection();
            render();
        });

        window.UnoludoMultiplayer.init(roomId, playerIndex);

        if (playerIndex === 0) {
            window.UnoludoMultiplayer.setInitialState(state);
        }

        render();
    }
};

if (window.UnoludoLobby !== undefined) {
    window.UnoludoLobby.onGameStart(function (
        roomId,
        playerIndex,
        playerKinds,
        playerNames
    ) {
        window.UnoludoLobby.showScreen(window.UnoludoLobby.getGameScreen());
        window.UnoludoApp.startMultiPlayer(
            roomId,
            playerIndex,
            playerKinds,
            playerNames
        );
    });
}

initGameState(single_player_names, {
    shuffle: true
});
update_mode_controls();
render();
