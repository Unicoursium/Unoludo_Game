/**
 * Board position data for Unoludo.
 *
 * Coordinates are stored as percentages of the board image.
 * x: 0 is the left edge, 100 is the right edge.
 * y: 0 is the top edge, 100 is the bottom edge.
 *
 * @namespace UnoludoBoard
 */
/*global globalThis*/
"use strict";

var UnoludoBoard = Object.create(null);

/**
 * Main track coordinates for Board V3.
 *
 * Index 0 is the grey triangle immediately after the blue gate.
 * The four coloured gate triangles are not part of this list.
 *
 * @memberof UnoludoBoard
 * @type {Object[]}
 */
UnoludoBoard.track_positions = Object.freeze([
    Object.freeze({x: 29.79, y: 92.06}),
    Object.freeze({x: 28.11, y: 85.61}),
    Object.freeze({x: 28.11, y: 78.74}),
    Object.freeze({x: 29.46, y: 72.59}),
    Object.freeze({x: 26.76, y: 69.89}),
    Object.freeze({x: 20.61, y: 71.24}),
    Object.freeze({x: 13.74, y: 71.24}),
    Object.freeze({x: 7.50, y: 69.98}),
    Object.freeze({x: 6.24, y: 63.74}),
    Object.freeze({x: 6.24, y: 56.86}),
    Object.freeze({x: 6.24, y: 49.99}),
    Object.freeze({x: 6.24, y: 43.11}),
    Object.freeze({x: 6.24, y: 36.24}),
    Object.freeze({x: 7.91, y: 29.79}),
    Object.freeze({x: 14.36, y: 28.11}),
    Object.freeze({x: 21.24, y: 28.11}),
    Object.freeze({x: 27.39, y: 29.46}),
    Object.freeze({x: 29.65, y: 26.62}),
    Object.freeze({x: 28.74, y: 20.61}),
    Object.freeze({x: 28.74, y: 13.74}),
    Object.freeze({x: 30.00, y: 7.50}),
    Object.freeze({x: 36.24, y: 6.24}),
    Object.freeze({x: 43.11, y: 6.24}),
    Object.freeze({x: 49.99, y: 6.24}),
    Object.freeze({x: 56.86, y: 6.24}),
    Object.freeze({x: 63.74, y: 6.24}),
    Object.freeze({x: 70.19, y: 7.91}),
    Object.freeze({x: 71.86, y: 14.36}),
    Object.freeze({x: 71.86, y: 21.24}),
    Object.freeze({x: 70.51, y: 27.39}),
    Object.freeze({x: 73.21, y: 29.96}),
    Object.freeze({x: 79.36, y: 28.74}),
    Object.freeze({x: 86.24, y: 28.74}),
    Object.freeze({x: 92.48, y: 30.00}),
    Object.freeze({x: 93.74, y: 36.24}),
    Object.freeze({x: 93.74, y: 43.11}),
    Object.freeze({x: 93.74, y: 49.99}),
    Object.freeze({x: 93.74, y: 56.86}),
    Object.freeze({x: 93.74, y: 63.74}),
    Object.freeze({x: 92.06, y: 70.19}),
    Object.freeze({x: 85.61, y: 71.86}),
    Object.freeze({x: 78.74, y: 71.86}),
    Object.freeze({x: 72.59, y: 70.51}),
    Object.freeze({x: 70.33, y: 73.35}),
    Object.freeze({x: 71.24, y: 79.36}),
    Object.freeze({x: 71.24, y: 86.24}),
    Object.freeze({x: 69.98, y: 92.48}),
    Object.freeze({x: 63.74, y: 93.74}),
    Object.freeze({x: 56.86, y: 93.74}),
    Object.freeze({x: 49.99, y: 93.74}),
    Object.freeze({x: 43.11, y: 93.74}),
    Object.freeze({x: 36.24, y: 93.74})
]);

/**
 * Home lane coordinates for each plane colour.
 *
 * The coloured door tile on the track is excluded; each lane has five tiles.
 *
 * @memberof UnoludoBoard
 * @type {Object}
 */
UnoludoBoard.home_positions = Object.freeze({
    blue: Object.freeze([
        Object.freeze({x: 49.99, y: 86.61}),
        Object.freeze({x: 49.99, y: 80.49}),
        Object.freeze({x: 49.99, y: 74.36}),
        Object.freeze({x: 49.99, y: 68.24}),
        Object.freeze({x: 49.99, y: 62.11})
    ]),
    green: Object.freeze([
        Object.freeze({x: 13.36, y: 49.99}),
        Object.freeze({x: 19.49, y: 49.99}),
        Object.freeze({x: 25.61, y: 49.99}),
        Object.freeze({x: 31.74, y: 49.99}),
        Object.freeze({x: 37.86, y: 49.99})
    ]),
    red: Object.freeze([
        Object.freeze({x: 49.99, y: 13.36}),
        Object.freeze({x: 49.99, y: 19.49}),
        Object.freeze({x: 49.99, y: 25.61}),
        Object.freeze({x: 49.99, y: 31.74}),
        Object.freeze({x: 49.99, y: 37.86})
    ]),
    yellow: Object.freeze([
        Object.freeze({x: 86.61, y: 49.99}),
        Object.freeze({x: 80.49, y: 49.99}),
        Object.freeze({x: 74.36, y: 49.99}),
        Object.freeze({x: 68.24, y: 49.99}),
        Object.freeze({x: 62.11, y: 49.99})
    ])
});

/**
 * Gate coordinates for newly launched planes.
 *
 * These tiles sit between base and track and are not counted as track spaces.
 *
 * @memberof UnoludoBoard
 * @type {Object}
 */
UnoludoBoard.gate_positions = Object.freeze({
    blue: Object.freeze({x: 26.23, y: 95.00}),
    green: Object.freeze({x: 4.98, y: 26.23}),
    red: Object.freeze({x: 73.75, y: 4.98}),
    yellow: Object.freeze({x: 95.00, y: 73.75})
});

/**
 * Starting base coordinates for planes not yet launched.
 *
 * @memberof UnoludoBoard
 * @type {Object}
 */
UnoludoBoard.base_positions = Object.freeze({
    blue: Object.freeze([
        Object.freeze({x: 7.49, y: 82.49}),
        Object.freeze({x: 17.49, y: 82.49}),
        Object.freeze({x: 7.49, y: 92.49}),
        Object.freeze({x: 17.49, y: 92.49})
    ]),
    green: Object.freeze([
        Object.freeze({x: 7.49, y: 7.49}),
        Object.freeze({x: 17.49, y: 7.49}),
        Object.freeze({x: 7.49, y: 17.49}),
        Object.freeze({x: 17.49, y: 17.49})
    ]),
    red: Object.freeze([
        Object.freeze({x: 82.49, y: 7.49}),
        Object.freeze({x: 92.49, y: 7.49}),
        Object.freeze({x: 82.49, y: 17.49}),
        Object.freeze({x: 92.49, y: 17.49})
    ]),
    yellow: Object.freeze([
        Object.freeze({x: 82.49, y: 82.49}),
        Object.freeze({x: 92.49, y: 82.49}),
        Object.freeze({x: 82.49, y: 92.49}),
        Object.freeze({x: 92.49, y: 92.49})
    ])
});

/**
 * Get the visual coordinate for a plane.
 *
 * @memberof UnoludoBoard
 * @function
 * @param {Unoludo.Plane} plane The plane state.
 * @param {Unoludo.Colour} colour The plane colour.
 * @param {number} plane_index The plane index inside its base, usually 0.
 * @returns {(Object | undefined)} The visual coordinate.
 */
UnoludoBoard.position_for_plane = function (plane, colour, plane_index) {
    if (plane.status === "base") {
        return UnoludoBoard.base_positions[colour][plane_index];
    }

    if (plane.status === "gate") {
        return UnoludoBoard.gate_positions[colour];
    }

    if (plane.status === "track") {
        return UnoludoBoard.track_positions[plane.position];
    }

    if (plane.status === "home") {
        return UnoludoBoard.home_positions[colour][plane.position];
    }

    if (plane.status === "finished") {
        return {x: 50, y: 50};
    }

    return undefined;
};

Object.freeze(UnoludoBoard);
globalThis.UnoludoBoard = UnoludoBoard;
