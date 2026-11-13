# Slagworks — design and build plan

An original top-down factory-automation game. All art is generated procedurally by code at start-up (no external image files).

## Platforms

| Platform | How it runs |
|---|---|
| Windows | Electron desktop build (`npm run dist:win`) or any Chromium browser |
| Linux | Electron AppImage (`npm run dist:linux`) or any Chromium browser |
| Xbox | Edge browser on the console, or installed as a PWA; full controller support. A Store release needs MSIX packaging and a Partner Center account (see `docs/XBOX.md`) |

Tech: plain ES modules + Canvas 2D, no build step, no runtime dependencies.

## 1. Assets (all procedural)

- **Terrain**: per-pixel painted 16x16-tile chunks — grass, dirt, desert, sand, shallow and deep water, with soft biome blending, grain, tufts, pebbles, flowers.
- **Resources**: iron, copper, coal, stone (faceted rock clusters, 3 density levels x 4 variants), oil seeps.
- **Nature**: 4 tree variants with canopies and ground shadows.
- **Buildings** (64 px per tile, lit from top-left, bevels, rivets, grime pass, baked soft shadows):
  belts (2 tiers, 8-frame animation, straight + curves), underground belt, splitter, 3 robotic arms,
  2 chests, burner and electric drills, stone and electric furnaces, 2 assemblers, refinery, lab,
  burner generator, solar panel, accumulator, small and big power poles, pumpjack, gun turret, wall,
  lamp, launch pad + rocket.
- **Animated parts**: drill bits, gears, flywheel, pump beam, turret gun, arm swing, furnace/lab/lamp glow overlays.
- **Characters**: engineer, two crawler sizes (2-frame legs), nest.
- **Icons**: every item (ores, plates, gear, wire, circuits, plastic, fuel, pipe, engine, battery, alloy, rocket part, 3 science packs, ammo) plus building icons derived from their sprites.
- **FX**: smoke, tracers, explosions, floating text, night lighting with light sources.
- **Audio**: synthesized WebAudio sound effects.

## 2. World

- Infinite seeded world, lazily generated in chunks; guaranteed starter patches near spawn.
- Day/night cycle with darkness overlay and lights.
- Minimap.

## 3. Factory simulation (60 updates per second, fixed step)

- Two-lane belts with compression, curves, side-loading, underground pairs, splitters.
- Arms: pick/drop between belts and machines, only take what the target accepts.
- Drills (output straight into belt/chest/furnace), pumpjacks on oil.
- Furnaces (fuel or electric), assemblers with recipe selection, refinery.
- Electric networks: poles with wire reach and supply area, generators, solar, accumulators, brown-outs.
- Labs and a 23-node tech tree with three science packs and bonus upgrades.
- End goal: build the Launch Pad, deliver rocket parts, launch.

## 4. Player

- Walk, hand-mine, inventory (60 slots), hotbar, hand-crafting queue with automatic intermediate crafting.
- Build with ghost preview, drag-build, rotate, pipette, fast belt replace, deconstruct.
- Machine windows for moving items in and out; quick-insert by clicking a machine with an item held.
- Objectives tracker guiding from first drill to launch.

## 5. Enemies

- Nests far from spawn, defenders, periodic attack waves that scale with time ("evolution").
- Player auto-fires when carrying ammo; gun turrets; walls. Peaceful mode option.

## 6. UI and input

- Keyboard + mouse and gamepad (virtual cursor on right stick so every menu works on a controller).
- Main menu, pause menu, save/load (browser storage) with autosave, controls reference.
- TV-safe margins and resolution-scaled UI for consoles.

## 7. Packaging

- `tools/serve.js` dev server, Electron wrapper in `desktop/`, PWA manifest + service worker.

## Build order

1. Data tables, world generation, state
2. Sprite and terrain generators
3. Renderer
4. Simulation
5. Input, UI, player actions
6. Enemies, research, save/load, audio
7. Packaging and playtest

## Added in the second round

Tree regrowth, full-screen map, blueprints and blueprint library, settings copy/paste, production statistics and power graph, arm filters, chest limits, pipes and fluids with steam power and an oil chain, trains, construction and logistic robots, generated music, a settings window with key rebinding, a starting supply crate, spitter enemies and nest expansion.

## Still not included

Multiplayer, chain signals (a train may stop inside a junction while waiting), modules and beacons, circuit networks.
