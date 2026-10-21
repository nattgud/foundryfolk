# Foundryfolk

Foundryfolk is a browser-based city-building and resource management game built with JavaScript.

Build a growing production network, gather resources, process materials, and expand your settlement across procedurally generated levels.

**[Play Foundryfolk](https://microgame-git-1090286016332.europe-north1.run.app/)**

## Gameplay

- **Build:** Construct buildings to gather resources, store materials, and produce goods.
- **Manage resources:** Balance resource production, consumption, and storage capacity.
- **Automate logistics:** Carriers transport resources between buildings and warehouses.
- **Develop production chains:** Turn raw materials into processed goods, metals, tools, and other products.
- **Defend your settlement:** Build Guard Towers and Garrisons that train Swordsmen, Archers and Knights from weapons, armor and horses made in your workshops. Soldiers wait inside and march out when enemies come within range.
- **Unlock new buildings:** Progress through levels to gain access to more advanced production.
- **Complete objectives:** Each level has its own goals. Complete them to progress and earn stars based on your completion time.
- **Explore new maps:** Levels feature procedurally generated landscapes, different terrain layouts, and varying resource availability.

## How to play

1. Select a building from the build menu.
2. Click or tap a suitable location on the map to construct it.
3. Gather resources and build the production chains needed for expansion.
4. Use warehouses and carriers to move resources where they are needed.
5. Complete the level objectives to advance.

Some buildings require specific terrain, and more advanced buildings become available as you progress.

## Controls

| Action | Control |
|---|---|
| Select a building or inspect a location | Click or tap |
| Move around the map | Drag |
| Zoom in or out | Mouse wheel or pinch gesture |
| Manage the game | Main menu |

The game supports both mouse and touchscreen input.

## Saving

Foundryfolk automatically saves progress every 30 seconds and when the browser tab is closed or hidden.

The game also supports five manual save slots. Saves are stored locally in the browser, so they are not automatically shared between devices or browsers.

## Run locally

Requirements: Node.js and npm.

```bash
git clone https://github.com/nattgud/microgame.git
cd microgame
npm install
npm start
```

Open [http://localhost:8080](http://localhost:8080) in your browser.

## Technology

- JavaScript
- HTML5 Canvas
- CSS
- Node.js and Express

The game logic, world generation, rendering, economy, logistics, and user interface are implemented in separate JavaScript modules.

## Development status

Foundryfolk is an ongoing project. Gameplay systems, balance, content, and features may change as development continues.
