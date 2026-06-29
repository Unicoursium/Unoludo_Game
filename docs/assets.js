/**
 * Asset path mapping for Unoludo.
 *
 * @namespace UnoludoAssets
 */
/*global globalThis*/
"use strict";

var UnoludoAssets = Object.create(null);

UnoludoAssets.image_root = "./assets/img/";

UnoludoAssets.board = UnoludoAssets.image_root + "Unoludo_Board.png";

UnoludoAssets.finished_marker = UnoludoAssets.image_root + "PS.png";

UnoludoAssets.draw_card = UnoludoAssets.image_root + "P1.png";

UnoludoAssets.reward_6 = UnoludoAssets.image_root + "P6.png";

UnoludoAssets.colour_prefixes = Object.freeze({
    blue: "B",
    green: "G",
    red: "R",
    yellow: "Y"
});

UnoludoAssets.plane_images = Object.freeze({
    blue: UnoludoAssets.image_root + "PB.png",
    green: UnoludoAssets.image_root + "PG.png",
    red: UnoludoAssets.image_root + "PR.png",
    yellow: UnoludoAssets.image_root + "PY.png"
});

UnoludoAssets.card_image = function (card) {
    var prefix;

    if (card.type === "wild") {
        return UnoludoAssets.image_root + "PW.png";
    }

    if (card.type === "wild4") {
        return UnoludoAssets.image_root + "P4.png";
    }

    prefix = UnoludoAssets.colour_prefixes[card.colour];

    if (card.type === "number") {
        return UnoludoAssets.image_root + prefix + card.value + ".png";
    }

    if (card.type === "draw2") {
        return UnoludoAssets.image_root + prefix + "P.png";
    }

    if (card.type === "reverse") {
        return UnoludoAssets.image_root + prefix + "R.png";
    }

    if (card.type === "skip") {
        return UnoludoAssets.image_root + prefix + "S.png";
    }
    if (card.type === "reward") {
        return UnoludoAssets.image_root + "P" + card.value + ".png";
    }
    return "";
};

UnoludoAssets.plane_image = function (colour) {
    return UnoludoAssets.plane_images[colour];
};

Object.freeze(UnoludoAssets);
globalThis.UnoludoAssets = UnoludoAssets;
