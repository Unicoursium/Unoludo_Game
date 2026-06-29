/*global describe, globalThis, it*/
"use strict";

var assert = require("node:assert/strict");

require("../unoludo.js");

var Unoludo = globalThis.Unoludo;

var plane = function (status, position, extra) {
    extra = extra || {};

    return Object.freeze({
        status: status,
        position: position,
        shielded: extra.shielded || false,
        frozen: extra.frozen || false
    });
};

var player = function (id, name, colour, hand, planes) {
    return Object.freeze({
        id: id,
        name: name,
        colour: colour,
        kind: "human",
        hand: Object.freeze(hand),
        planes: Object.freeze(planes)
    });
};

var game_state = function (
    players,
    top_card,
    options
) {
    options = options || {};

    return Object.freeze({
        draw_pile: Object.freeze(options.draw_pile || []),
        discard_pile: Object.freeze(options.discard_pile || [top_card]),
        players: Object.freeze(players),
        current_player: options.current_player || 0,
        active_colour: options.active_colour || top_card.colour,
        winner: undefined,
        player_moods: Object.freeze({}),
        log: Object.freeze([])
    });
};

describe("Special card rules and edge cases", function () {
    it("allows a normal number 6 to be played on top of a reward 6", function () {
        assert.equal(
            Unoludo.can_play_on(
                Unoludo.card("blue-6", "number", "blue", 6),
                Unoludo.card("reward-6", "reward", "wild", 6),
                "red"
            ),
            true
        );
    });

    it("uses both Wild and number cards when a Wild combo moves a plane", function () {
        var wild = Unoludo.card("wild", "wild", "wild");
        var three = Unoludo.card("blue-3", "number", "blue", 3);
        var spare = Unoludo.card("blue-1", "number", "blue", 1);
        var blue = player(
            0,
            "Blue",
            "blue",
            [wild, three, spare],
            [
                plane("track", 4),
                plane("base", -1),
                plane("base", -1),
                plane("base", -1)
            ]
        );

        var next_state = Unoludo.play_wild_combo(
            game_state([blue], Unoludo.card("top-red", "number", "red", 5)),
            "wild",
            "blue-3",
            0,
            0
        );

        assert.deepEqual(next_state.players[0].planes[0], {
            status: "track",
            position: 7,
            shielded: false,
            frozen: false
        });
        assert.deepEqual(
            next_state.discard_pile.slice(-2).map(function (card) {
                return card.id;
            }),
            ["wild", "blue-3"]
        );
        assert.deepEqual(
            next_state.players[0].hand.map(function (card) {
                return card.id;
            }),
            ["blue-1"]
        );
        assert.equal(next_state.active_colour, "blue");
    });

    it("launches a base plane when a reward 6 card is used", function () {
        var reward = Unoludo.card("reward-6", "reward", "wild", 6);
        var spare = Unoludo.card("blue-1", "number", "blue", 1);
        var blue = player(
            0,
            "Blue",
            "blue",
            [reward, spare],
            Unoludo.empty_planes()
        );

        var next_state = Unoludo.play_reward_card(
            game_state([blue], Unoludo.card("top-blue", "number", "blue", 6)),
            "reward-6",
            0,
            0,
            "yellow"
        );

        assert.deepEqual(next_state.players[0].planes[0], {
            status: "gate",
            position: -1,
            shielded: false,
            frozen: false
        });
        assert.equal(next_state.active_colour, "yellow");
        assert.equal(next_state.discard_pile[next_state.discard_pile.length - 1].id, "reward-6");
    });

    it("freezes the targeted opponent's active planes until that opponent ends their turn", function () {
        var skip = Unoludo.card("blue-skip", "skip", "blue");
        var blue = player(
            0,
            "Blue",
            "blue",
            [skip],
            Unoludo.empty_planes()
        );
        var red = player(
            1,
            "Red",
            "red",
            [],
            [
                plane("track", 5),
                plane("gate", -1),
                plane("home", 0),
                plane("finished", 5)
            ]
        );

        var next_state = Unoludo.play_skip_card(
            game_state([blue, red], Unoludo.card("top-skip", "skip", "blue")),
            "blue-skip",
            1,
            0
        );

        assert.deepEqual(
            next_state.players[1].planes.map(function (red_plane) {
                return red_plane.frozen;
            }),
            [true, true, true, false]
        );

        next_state = Unoludo.end_turn(next_state);
        assert.deepEqual(
            next_state.players[1].planes.map(function (red_plane) {
                return red_plane.frozen;
            }),
            [true, true, true, false]
        );

        next_state = Unoludo.end_turn(next_state);
        assert.deepEqual(
            next_state.players[1].planes.map(function (red_plane) {
                return red_plane.frozen;
            }),
            [false, false, false, false]
        );
    });

    it("returns an opponent plane to base when Reverse moves it behind its start square", function () {
        var reverse = Unoludo.card("blue-reverse", "reverse", "blue");
        var blue = player(
            0,
            "Blue",
            "blue",
            [reverse],
            Unoludo.empty_planes()
        );
        var red = player(
            1,
            "Red",
            "red",
            [],
            [
                plane("track", 27),
                plane("base", -1),
                plane("base", -1),
                plane("base", -1)
            ]
        );

        var next_state = Unoludo.play_reverse_card(
            game_state([blue, red], Unoludo.card("top-reverse", "reverse", "blue")),
            "blue-reverse",
            1,
            0,
            2
        );

        assert.deepEqual(next_state.players[1].planes[0], {
            status: "base",
            position: -1,
            shielded: false,
            frozen: false
        });
        assert.deepEqual(next_state.player_moods, {
            0: "smug",
            1: "angry"
        });
    });

    it("refills the draw pile from the discard pile while preserving the top discard", function () {
        var blue = player(
            0,
            "Blue",
            "blue",
            [],
            Unoludo.empty_planes()
        );
        var next_state = Unoludo.draw_cards(
            game_state(
                [blue],
                Unoludo.card("discard-top", "number", "red", 4),
                {
                    draw_pile: [Unoludo.card("draw-first", "number", "blue", 1)],
                    discard_pile: [
                        Unoludo.card("discard-old", "skip", "yellow"),
                        Unoludo.card("discard-top", "number", "red", 4)
                    ],
                    active_colour: "red"
                }
            ),
            0,
            2
        );

        assert.equal(next_state.players[0].hand.length, 2);
        assert.deepEqual(next_state.discard_pile, [
            Unoludo.card("discard-top", "number", "red", 4)
        ]);
        assert.equal(
            next_state.log.indexOf("Draw pile was refilled from the discard pile.") !== -1,
            true
        );
    });

    it("sets the winner when a move finishes the player's fourth plane", function () {
        var one = Unoludo.card("blue-1", "number", "blue", 1);
        var blue = player(
            0,
            "Blue",
            "blue",
            [one],
            [
                plane("finished", 5),
                plane("finished", 5),
                plane("finished", 5),
                plane("home", 4)
            ]
        );

        var next_state = Unoludo.play_number_card(
            game_state([blue], Unoludo.card("top-blue", "number", "blue", 1)),
            "blue-1",
            3
        );

        assert.deepEqual(next_state.players[0].planes[3], {
            status: "finished",
            position: 5,
            shielded: false,
            frozen: false
        });
        assert.equal(next_state.winner, 0);
    });
});
