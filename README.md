# Settlement Tile Manager — v0.2.2.11 beta

A Foundry VTT v14 viewer and editor for tiles owned by **Settlement Core**. This module supplies the map UI; Settlement Core is the single source of truth for tile records, terrain and tag definitions, exploration, discoverables, calculated DCs, player visibility, building slots, and persistence.

## Requirements

- Foundry VTT 14.
- [Settlement Core](https://github.com/FVTT-Mods-Hawthorne/settlement-core-module) 0.3.2 or later.
- Optional: [Settlement Manager](https://github.com/FridgeboyAI/settlement-manager-module/tree/test). Both modules operate on the same Core tiles.

Install using:

`https://raw.githubusercontent.com/FVTT-Mods-Hawthorne/settlement-hex-manager/main/module.json`

Foundry should offer to install Settlement Core from the dependency declared in `module.json`.

This permanent manifest URL is also the automatic-update channel. Release ZIP URLs remain version-specific.

## What it does

Enable **Tile Viewer** in Scene controls, then click a Scene grid tile.

- Green outline: currently hovered tile.
- Blue outline: revealed Core tile.
- Gold outline: claimed tile. Claimed is Tile Manager presentation metadata stored in Core's extension envelope.
- No outlines or click interception while Tile Viewer mode is off.

The GM editor uses Settlement Core's live registries for:

- Terrain choices, per-tile Difficulty adjustment, and optional exact Travel, Explore, and Forage DC overrides.
- Pathfinder-style tag entry for Boolean, state-valued, and custom Core tile tags.
- Revealed state and successful Explore count.
- Discoverable types, names, tiers, modifiers, and found state.
- Travel, Explore, and Forage DCs.
- Security from finished Core buildings.

Tile Manager adds presentation fields without competing with Core:

- Tile image, region, zone, owner, cleared, and claimed.
- Points of Interest with an image, plain-text description, and player visibility.
- Plain Player Notes and GM Notes.

## Settlement Manager interoperability

Settlement Manager's Hex Buildings panel reads the same Core tile returned by `settlement-core.api.getTile(sceneId, key)`.

- Tile Manager never writes its own tile database.
- Saving a tile preserves Core's tile building slots.
- Saving discoverables preserves each discoverable's Settlement Manager improvement slots and notes.
- Tile Manager does not define or calculate building effects, Security, Work profiles, or settlement state.
- When Tile Viewer and Hex Buildings modes are both active, a click may open both windows; Tile Manager no longer stops the event before Settlement Manager receives it.

## Visibility

Settlement Core publishes the player-safe copy. Tile Manager does not maintain a second public database.

- Unrevealed tiles are absent for players.
- Unfound discoverables and GM Notes are removed by Core.
- Visible Points of Interest are stored in `tile.ext.settlement-hex-manager.public`.
- The complete Point of Interest list is stored in `tile.ext.settlement-hex-manager.gm`.

## Upgrade from v0.2.2.8

On the first load with a hosting GM and Settlement Core active, Tile Manager looks for its old private journal and copies tiles that do not already exist in Core. Existing Core tiles win and are never overwritten. The old journal remains untouched as a backup.

Legacy conversion maps common terrain/tag names, exploration state, discoverables, notes, images, and Points of Interest. Old free-text discoverable improvements are retained in the discoverable notes; Settlement Manager building slots cannot be inferred from those labels.

## Public API

```js
const tiles = game.modules.get("settlement-hex-manager").api;
```

- `tiles.showTileViewer()` opens the current viewer.
- `tiles.getTile(sceneId, key)` returns the UI view of the Core tile.
- `await tiles.saveTile(sceneId, key, draft)` saves through Core's GM-hosted pipeline.
- `await tiles.deleteTile(sceneId, key)` clears Tile Manager's presentation extension while preserving the shared Core tile. `clearTilePresentation` is an explicit alias.
- `tiles.core` exposes the connected Settlement Core API for diagnostics only.

For rules, building, settlement, or raw tile operations, use `game.modules.get("settlement-core").api` directly.

## Development

```sh
node --test tests/core.test.mjs
node --check scripts/core.mjs
node --check scripts/module.mjs
```

See [HANDOFF.md](HANDOFF.md) for schemas, ownership boundaries, lifecycle hooks, migration rules, and extension guidance.

## License

MIT. See [LICENSE](LICENSE).
