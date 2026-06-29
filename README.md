# 🎲 Unoludo 3.0

[![Version](https://img.shields.io/badge/version-3.0-blue.svg)]()
[![License: MIT](https://img.shields.io/badge/license-MIT-green.svg)]()
[![JavaScript](https://img.shields.io/badge/language-JavaScript-yellow.svg)]()

**[▶ Play Now](https://unoludo.unicoy.uk)** · [API Docs](api-docs/index.html)

---

## 🎮 About Unoludo

Unoludo is a turn-based board game that fuses the card-matching strategy of **UNO** with the race-and-capture movement of **Ludo**. Each player commands four planes, racing them from base through the main track, into the home lane, and ultimately to the finish.

Draw and play coloured cards to move your planes, launch new ones onto the board, shield them from capture, or unleash powerful effects against your opponents. Every turn is a tactical decision — when to advance, when to defend, and when to strike.

---

## ✨ Features

- 🎴 **Rich Card System** — Number cards, Skip, Reverse, Shield, Wild, and Wild +4 with combo mechanics
- 🤖 **Single Player** — Battle against three CPU opponents with adjustable difficulty
- 🌐 **Online Multiplayer** — Create or join rooms with a 4-digit code, powered by Firebase Realtime Database
- 📖 **Interactive Tutorials** — Basic and Enhanced tutorials that teach rules step by step
- 🏠 **Home Lane & Finishing** — Strategic endgame with precise card plays to land planes exactly
- 🎨 **Polished UI** — Custom board, card assets, smooth piece animations, and sound effects
- 🧪 **Unit Tested** — Comprehensive test suite covering card rules, movement, and state transitions

---

## 🕹️ Game Modes

### Single Player
Start a local game against three CPU opponents. You play as **blue**; the other colours are controlled by the AI. CPU players make decisions based on available moves and basic strategy.

### Multiplayer
Play with friends online. The host creates a room and shares a **4-digit room code**. Other players enter the code to join. The host can also add CPU players to fill empty seats (minimum 2 players to start).

> **Tip:** When running locally from source, open multiple browser tabs and join the same room code to test multiplayer. Or visit the [live deployment](https://unoludo.unicoy.uk) for the full experience.

### Basic Tutorial
A guided walkthrough of the core rules:
- Launching planes from base with a 6
- Matching cards by colour or number
- Moving along the main track
- Shielding planes from capture
- Capturing opponent planes
- Drawing when no card can be played
- Entering the home lane and winning

### Enhanced Tutorial
Covers advanced mechanics:
- Draw Two, Reverse, and Wild card effects
- Wild +4 combo and colour selection
- Reward cards and bonus draws
- Moving opponents' planes
- Hand management and endgame bonuses

---

## 🃏 Card System

| Card | Effect |
|------|--------|
| **Number (0–6)** | Move a plane forward by the card's number. Must match the discard pile by colour or number. |
| **Skip** 🚫 | Freezes all of an opponent's planes for one turn. |
| **Reverse** 🔙 | Moves an opponent's plane backwards by the card's number. |
| **Shield** 🛡️ | Protects one of your planes from being captured until your next turn. |
| **Wild** 🌈 | Can be played on any discard. Choose a colour; move any player's plane. |
| **Wild +4** 💥 | Powerful combo — choose a colour, move a plane, and force the next player to draw. |
| **6 (any colour)** | Can alternatively **launch** a new plane from base onto the starting gate. |

**Combo mechanic:** When you play your last card in hand, you draw bonus cards based on the combo chain.

---

## 🚀 Quick Start

### Prerequisites

- [Node.js](https://nodejs.org/) (for running tests and linting)
- A modern web browser

### Setup

```bash
# Clone the repository
git clone https://github.com/Unicoursium/Unoludo_Game.git
cd Unoludo_Game

# Install dependencies
npm install
```

### Run the Game

Simply open `docs/index.html` in your browser — no build step required.

### Run Tests

```bash
npm test
```

### Run Linting

```bash
npm run lint
```

### Generate API Docs

```bash
npx jsdoc -c jsdoc.json
```

Generated documentation will appear in `api-docs/`.

---

## 📂 Project Structure

**🎮 `docs/`** — Game application *(open `index.html` to play)*

| File | Description |
|------|-------------|
| `index.html` | Main HTML entry point — all screens defined here |
| `default.css` | Core game styles, board layout, card UI, animations |
| `lobby.css` | Home screen, lobby, and room waiting styles |
| `unoludo.js` | Game engine — rules, state, card logic, movement |
| `main.js` | UI controller — rendering, input, animations, sound |
| `lobby.js` | Home screen, room creation/joining, waiting room |
| `multiplayer.js` | Firebase Realtime Database sync for online multiplayer |
| `board_positions.js` | Board coordinate data — track, home lanes, bases |
| `assets.js` | Asset path mapping for cards, board, planes |
| `firebase-config.js` | Firebase initialization and anonymous auth |
| `ramda.js` | Utility library (functional programming helpers) |
| `position_picker.html` | Developer tool for picking board coordinates |

**🖼️ `docs/assets/`** — Card images, board, plane tokens, fonts

**🧪 `docs/tests/`** — Unit test suites

- `unoludo-card-state-transitions.test.js`
- `unoludo-movement-and-rewards.test.js`
- `unoludo-special-card-rules.test.js`

**📄 Root files**

| File | Description |
|------|-------------|
| `api-docs/` | Generated JSDoc API documentation |
| `.docs-template/` | JSDoc template customizations |
| `package.json` | npm scripts: test, lint |
| `jsdoc.json` | JSDoc configuration |
| `.mocharc.json` | Mocha test runner configuration |
| `.jslintrc` | JSLint configuration |

### Core Modules

| File | Lines | Role |
|------|------:|------|
| `unoludo.js` | 2648 | **Game engine** — Pure JavaScript module implementing all game rules. Creates immutable game states; illegal moves return `undefined` without mutation. Exposes the `Unoludo` namespace. |
| `main.js` | 5045 | **UI controller** — Renders the board, handles card selection, animates piece movement, manages CPU turns, plays sound effects, and coordinates all screen transitions. |
| `lobby.js` | 606 | **Lobby system** — Manages the home screen, multiplayer room creation/joining via room codes, and the waiting room with player list. |
| `multiplayer.js` | 344 | **Network sync** — Firebase Realtime Database integration for real-time game state synchronization between players. Handles flatten/restore of state objects. |
| `board_positions.js` | 201 | **Board data** — All board coordinates as percentages: main track (52 positions × 4 colours), home lanes, base gates, and finish positions. |
| `assets.js` | 74 | **Asset registry** — Maps card colours and values to image file paths. Provides board image, plane tokens, and marker references. |
| `firebase-config.js` | 33 | **Firebase setup** — Initializes Firebase app, database reference, and anonymous authentication for multiplayer. |

---

## 🧪 Testing

Unit tests use [Mocha](https://mochajs.org/) and cover three areas:

| Test File | Coverage |
|-----------|----------|
| `unoludo-card-state-transitions.test.js` | Card play validation, draw mechanics, hand management, turn transitions |
| `unoludo-movement-and-rewards.test.js` | Plane movement, base launching, home lane entry, finishing, capture rewards |
| `unoludo-special-card-rules.test.js` | Skip, Reverse, Shield, Wild, Wild +4 — effect resolution and edge cases |

Run all tests:

```bash
npm test
```

---

## 📄 API Documentation

The game engine (`unoludo.js`) is fully documented with JSDoc. Browse the generated API docs:

```text
api-docs/index.html
```

Or regenerate them:

```bash
npx jsdoc -c jsdoc.json
```

---

## 🛠️ Tech Stack

- **Language:** Vanilla JavaScript (ES5 strict mode, no build step)
- **Styling:** Pure CSS3 with custom properties and animations
- **Multiplayer:** Firebase Realtime Database (anonymous auth, real-time sync)
- **Testing:** Mocha + JSLint
- **Documentation:** JSDoc with custom template
- **Hosting:** GitHub Pages

---

## 👤 Author

**Unico Yin**

---

## 📝 License

This project is open source. See the repository for license details.
