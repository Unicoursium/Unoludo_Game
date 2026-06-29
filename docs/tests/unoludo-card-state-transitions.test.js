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

var state = function (players, top_card, current_player) {
    current_player = current_player || 0;

    return Object.freeze({
        draw_pile: Object.freeze([]),
        discard_pile: Object.freeze([top_card]),
        players: Object.freeze(players),
        current_player: current_player,
        active_colour: top_card.colour,
        winner: undefined,
        player_moods: Object.freeze({}),
        log: Object.freeze([])
    });
};

var four_planes = function (first_plane) {
    return Object.freeze([first_plane].concat(
        Unoludo.empty_planes().slice(1)
    ));
};

describe("Card driven plane state transitions", function () {
    it("launches a plane from base to the gate when a playable 6 card is used", function () {
        var six = Unoludo.card("blue-6", "number", "blue", 6);
        var blue = player(
            0,
            "Blue",
            "blue",
            [six],
            Unoludo.empty_planes()
        );

        var next_state = Unoludo.play_number_card(
            state([blue], Unoludo.card("top-blue", "number", "blue", 1)),
            "blue-6",
            0
        );

        assert.deepEqual(next_state.players[0].planes[0], {
            status: "gate",
            position: -1,
            shielded: false,
            frozen: false
        });
        assert.equal(
            next_state.players[0].hand.some(function (card) {
                return card.id === "blue-6";
            }),
            false
        );
        assert.equal(next_state.discard_pile[next_state.discard_pile.length - 1].id, "blue-6");
    });

    it("does not launch a plane from base when the card is not a 6", function () {
        var three = Unoludo.card("blue-3", "number", "blue", 3);
        var blue = player(
            0,
            "Blue",
            "blue",
            [three],
            Unoludo.empty_planes()
        );

        var next_state = Unoludo.play_number_card(
            state([blue], Unoludo.card("top-blue", "number", "blue", 1)),
            "blue-3",
            0
        );

        assert.equal(next_state, undefined);
    });

    it("moves a plane from the gate onto the track, counting the start square as the first step", function () {
        var two = Unoludo.card("blue-2", "number", "blue", 2);
        var blue = player(
            0,
            "Blue",
            "blue",
            [two],
            four_planes(plane("gate", -1))
        );

        var next_state = Unoludo.play_number_card(
            state([blue], Unoludo.card("top-blue", "number", "blue", 1)),
            "blue-2",
            0
        );

        assert.deepEqual(next_state.players[0].planes[0], {
            status: "track",
            position: 1,
            shielded: false,
            frozen: false
        });
    });

    it("moves a plane into the home lane after passing its home entry", function () {
        var one = Unoludo.card("blue-1", "number", "blue", 1);
        var blue = player(
            0,
            "Blue",
            "blue",
            [one],
            four_planes(plane("track", 49))
        );

        var next_state = Unoludo.play_number_card(
            state([blue], Unoludo.card("top-blue", "number", "blue", 1)),
            "blue-1",
            0
        );

        assert.deepEqual(next_state.players[0].planes[0], {
            status: "home",
            position: 0,
            shielded: false,
            frozen: false
        });
    });

    it("captures an opponent plane that finishes on the same track square", function () {
        var four = Unoludo.card("blue-4", "number", "blue", 4);
        var blue = player(
            0,
            "Blue",
            "blue",
            [four],
            four_planes(plane("track", 5))
        );
        var red = player(
            1,
            "Red",
            "red",
            [],
            four_planes(plane("track", 9))
        );

        var next_state = Unoludo.play_number_card(
            state([blue, red], Unoludo.card("top-blue", "number", "blue", 1)),
            "blue-4",
            0
        );

        assert.deepEqual(next_state.players[0].planes[0], {
            status: "track",
            position: 9,
            shielded: false,
            frozen: false
        });
        assert.deepEqual(next_state.players[1].planes[0], {
            status: "base",
            position: -1,
            shielded: false,
            frozen: false
        });
        assert.match(next_state.log[next_state.log.length - 1], (/captured Red's plane 0/));
    });

    it("leaves a shielded opponent plane on the track instead of capturing it", function () {
        var four = Unoludo.card("blue-4", "number", "blue", 4);
        var blue = player(
            0,
            "Blue",
            "blue",
            [four],
            four_planes(plane("track", 5))
        );
        var red = player(
            1,
            "Red",
            "red",
            [],
            four_planes(plane("track", 9, {shielded: 1}))
        );

        var next_state = Unoludo.play_number_card(
            state([blue, red], Unoludo.card("top-blue", "number", "blue", 1)),
            "blue-4",
            0
        );

        assert.deepEqual(next_state.players[1].planes[0], {
            status: "track",
            position: 9,
            shielded: 1,
            frozen: false
        });
        assert.match(next_state.log[next_state.log.length - 1], (/protected by shield/));
    });

    it("advances every active own plane by four spaces when Wild +4 advance all is chosen", function () {
        var wild_four = Unoludo.card("wild4-advance", "wild4", "wild");
        var blue = player(
            0,
            "Blue",
            "blue",
            [wild_four],
            [
                plane("track", 5),
                plane("gate", -1),
                plane("base", -1),
                plane("finished", 5)
            ]
        );

        var next_state = Unoludo.play_wild4_card(
            state([blue], Unoludo.card("top-blue", "number", "blue", 1)),
            "wild4-advance",
            "advance_all",
            "blue"
        );

        assert.deepEqual(next_state.players[0].planes[0], {
            status: "track",
            position: 9,
            shielded: false,
            frozen: false
        });
        assert.deepEqual(next_state.players[0].planes[1], {
            status: "track",
            position: 3,
            shielded: false,
            frozen: false
        });
        assert.deepEqual(next_state.players[0].planes[2], {
            status: "base",
            position: -1,
            shielded: false,
            frozen: false
        });
        assert.deepEqual(next_state.players[0].planes[3], {
            status: "finished",
            position: 5,
            shielded: false,
            frozen: false
        });
    });

    it("keeps a shield active for two arrivals at the protected player's turn", function () {
        var zero = Unoludo.card("blue-0", "number", "blue", 0);
        var blue = player(
            0,
            "Blue",
            "blue",
            [zero],
            four_planes(plane("track", 8))
        );
        var red = player(
            1,
            "Red",
            "red",
            [],
            Unoludo.empty_planes()
        );

        var next_state = Unoludo.play_zero_card(
            state([blue, red], Unoludo.card("top-blue", "number", "blue", 1)),
            "blue-0",
            0
        );

        assert.equal(next_state.players[0].planes[0].shielded, 2);

        next_state = Unoludo.end_turn(next_state);
        assert.equal(next_state.players[0].planes[0].shielded, 2);

        next_state = Unoludo.end_turn(next_state);
        assert.equal(next_state.players[0].planes[0].shielded, 1);

        next_state = Unoludo.end_turn(next_state);
        assert.equal(next_state.players[0].planes[0].shielded, 1);

        next_state = Unoludo.end_turn(next_state);
        assert.equal(next_state.players[0].planes[0].shielded, false);
    });
});
