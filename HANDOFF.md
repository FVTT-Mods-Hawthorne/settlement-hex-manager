# Settlement Tile Manager handoff

This describes version `0.2.2.9`, the first release where Settlement Tile Manager is a UI client of Settlement Core rather than an independent tile database.

## Ownership boundary

Settlement Core owns:

- The authoritative private journal and player-safe world setting.
- GM authority, socket requests, write serialization, validation, and revision tracking.
- Tile identity (`sceneId` plus `"row,col"`).
- `name`, `terrain`, `adjust`, `tags`, `revealed`, `explores`, `discoverables`, `slots`, `notes`, `gmNotes`, and `ext`.
- Terrain, tag, discoverable, building, resource, and activity definitions.
- Travel/Explore/Forage DCs, fully explored state, Security, Work profiles, and building placement rules.

Tile Manager owns only:

- Scene pointer interaction, PIXI outlines, and the Viewer/Manager window.
- Tile presentation metadata in its Core extension namespace.
- The optional Landmark Feature Item subtype.
- One-time migration from its pre-Core journal.

Settlement Manager owns settlement procedures and building UI. It reads and writes the same Core tile objects. Tile Manager must never duplicate those records or replace their building slots.

## Repository map

| Path | Responsibility |
| --- | --- |
| `module.json` | Requires Settlement Core 0.3.0+, declares Foundry assets and release URLs. |
| `scripts/core.mjs` | Pure Core contract checks, UI projection, save-patch construction, and legacy conversion. |
| `scripts/module.mjs` | Foundry hooks, UI, Core calls, canvas events, outlines, settings, and migration orchestration. |
| `styles/module.css` | Viewer/Manager presentation. |
| `tests/core.test.mjs` | Contract, privacy, slot-preservation, and migration tests. |

## Dependency contract

`checkCoreApi()` requires these Settlement Core calls:

```text
getState, getTile, getTiles, get, all,
tileDCs, tileSecurity, isFullyExplored,
saveTile, revealTile, request
```

Core must report version `0.3.0` or newer. The manifest also declares this requirement so Foundry can install and order modules correctly.

The runtime connects during `settlementCore.register` and refreshes during `settlementCore.ready`. It re-renders on `settlementCore.changed`.

## Core tile schema

Tile Manager consumes Core's tile shape directly:

```js
{
  key, name, terrain, adjust, tags,
  revealed, explores,
  discoverables, slots,
  notes, gmNotes, ext
}
```

Discoverables remain Core records:

```js
{ id, type, name, tier, modifier, found, slots, notes, gmNotes }
```

`type` is a Core discoverable definition ID. `slots` are building/improvement slots used by Settlement Manager. `toCorePatch()` copies current discoverable slots and notes when the Tile Manager form edits the other fields.

The tile-level `slots` property is deliberately omitted from a Tile Manager save patch. Core's `tile.save` action preserves it.

## Tile Manager extension

Core validates extensions as `{ public, gm }`. Tile Manager uses:

```js
tile.ext["settlement-hex-manager"] = {
  public: {
    thumbnail, region, zone, owner,
    cleared, claimed,
    features: [/* visible Points of Interest only */]
  },
  gm: {
    features: [/* complete Point of Interest list */]
  }
};
```

Each Point of Interest is:

```js
{ id, name, thumbnail, description, revealed }
```

Core strips every extension's `gm` object from player state. Tile Manager also stores only revealed Points of Interest in `public`, so privacy does not depend on CSS or client-side filtering.

`toCorePatch()` preserves every other module's `tile.ext` entry.

## Runtime flow

1. `init` registers settings, the Landmark Feature Item subtype, and Tile Manager's small API.
2. `settlementCore.register` captures the Core API during Foundry setup.
3. `settlementCore.ready` validates Core, performs one-time legacy migration on the host GM, binds the canvas, and renders.
4. Tile Viewer mode controls all hover and click behavior.
5. A click reads the tile synchronously from Core and opens Viewer or GM editor.
6. Save builds a Core patch and calls `core.saveTile()`.
7. Core serializes, validates, persists, publishes player data, and fires `settlementCore.changed`.
8. Tile Manager re-renders the modal and outlines from Core's new state.

There is no Tile Manager socket, journal write, Scene flag, public-map cache, or independent authority election after migration.

## Canvas and Settlement Manager coexistence

Tile Manager binds to the canvas only while preserving event propagation. It calls `preventDefault()` for its own selection but does not call `stopImmediatePropagation()`. Settlement Manager's Hex Buildings tool listens on the board and can therefore open its panel for the same tile when both tools are enabled.

Outlines appear only in Tile Viewer mode:

- Green: hover.
- Blue: `tile.revealed` and not claimed.
- Gold: `tile.ext.settlement-hex-manager.public.claimed`.

Persistent outlines draw first and green hover draws last.

## Definition-driven UI

Do not hard-code campaign terrain, tags, or discoverables in this module.

- Terrain options come from `core.all("terrains")`.
- Tag controls come from `core.all("tags")`; definitions with `states` render a state selector.
- Discoverable options come from `core.all("discoverables")`.
- Labels and categories come from `core.get(kind, id)`.
- Building labels shown on existing slots come from `core.get("buildings", id)`.

This allows the Liftland content set or another module to replace definitions without a Tile Manager release.

## Legacy migration

The hidden world setting `coreMigration` prevents repeated imports. Only the lowest-ID active GM performs migration.

The importer reads, but never deletes or rewrites:

- Journal flag: `flags.settlement-hex-manager.store`.
- Page: `Private State JSON`.
- Old path: `maps[sceneId].hexes[key]`.

Rules:

- If a Core tile already exists, skip it.
- Common old terrain names map to Core terrain IDs.
- Old hills and terrain tags become Core tags.
- Old Difficulty becomes Core `adjust` relative to the previous default 15.
- Discovered becomes revealed; mapped becomes one Explore; cleared/claimed becomes six Explores.
- Old discoverable improvement labels are appended to notes, not converted into building IDs.
- Images, region/zone, claimed state, and Points of Interest enter the extension envelope.
- The old journal remains a backup.

## Deletion

The legacy `deleteTile` API and the world setting now clear only `tile.ext["settlement-hex-manager"]`. They save the remaining extension object through Core and preserve terrain, exploration, notes, discoverables, tile slots, settlement homes, and Settlement Manager buildings.

Deleting a shared Core tile is outside this module's ownership boundary. A caller that explicitly needs that destructive operation must use Settlement Core's `tile.delete` action directly.

## Public API

```js
game.modules.get("settlement-hex-manager").api
```

- `showTileViewer()` opens the UI.
- `getTile(sceneId, key)` returns a projected Core tile with Tile Manager metadata and computed values.
- `saveTile(sceneId, key, draft)` converts and saves through Core.
- `deleteTile(sceneId, key)` clears only Tile Manager's extension (safe backward-compatible behavior).
- `clearTilePresentation(sceneId, key)` is the explicit alias for that operation.
- `core` is the connected Core API reference for diagnostics.

New integrations should prefer Settlement Core's API. Tile Manager's API exists for UI-oriented callers and backward compatibility.

## Safe extension rules

- Never add another tile store, socket channel, authority election, or public Scene flag.
- Never replace `tile.slots` or `discoverable.slots` from the editor.
- Preserve unknown Core fields and other modules' extension keys.
- Store private presentation fields only under the extension's `gm` object.
- Use Core registry IDs, not display labels, as saved terrain/tag/discoverable values.
- Use Core calculations; do not recreate DC or Security formulas here.
- Do not stop pointer propagation needed by Settlement Manager.
- Add a contract test whenever a Core field or API call becomes required.

## Release procedure

Increment the last numeric version component unless explicitly told otherwise. Update the manifest URLs, README, handoff, and workflow notes. Run the Node tests and syntax checks. Publishing `main` lets the existing workflow create the prerelease and upload the versioned ZIP plus `module.json`.
