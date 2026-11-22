# Settlement Tile Manager handoff

This document is the technical handoff for humans and AI agents maintaining `settlement-hex-manager`. It describes release `0.2.2.8` and should be updated whenever the runtime architecture, stored schema, public API, or release process changes.

## Scope

The module adds exploration metadata, visibility rules, highlights, and a viewer/editor to Foundry VTT Scene grid tiles. It targets Foundry VTT v14 and is game-system agnostic.

The runtime does **not** manage settlements, settlement economies, phases, leaders, teams, activities, party membership, or settlement Actors. Those systems were removed in `0.2.2.8`. Old settlement/team state is retained as an opaque `state` object when the private database is rewritten so upgrading does not silently destroy prior plugin data, but no current code reads or changes that object.

## Repository map

| Path | Responsibility |
| --- | --- |
| `module.json` | Foundry manifest, compatibility, scripts/styles, Item subtype, and release URLs. |
| `scripts/core.mjs` | Pure tile defaults, normalization, migration, DC calculations, and player-safe filtering. |
| `scripts/module.mjs` | Foundry hooks, storage, sockets, permissions, modal UI, canvas interaction, highlights, settings, and public API. |
| `styles/module.css` | Tile Viewer/Manager layout and tile-content styling. |
| `lang/en.json` | Labels for the module-owned Landmark Feature Item subtype. |
| `tests/core.test.mjs` | Node regression tests for pure tile behavior. |
| `.github/workflows/release.yml` | Manifest validation, ZIP packaging, prerelease creation, and asset upload. |

## Runtime lifecycle

1. The `init` hook registers the Landmark Feature Item data model, module settings, and `game.modules.get("settlement-hex-manager").api`.
2. The `ready` hook subscribes to the module socket. A GM loads the shared private journal; a player loads sanitized Scene flags and requests a snapshot from an active GM when possible.
3. `canvasReady` binds pointer handlers to the current canvas and creates the PIXI outline layer.
4. The **Tile Viewer** Scene control toggles every tile interaction. When it is off, there is no hover outline, persistent outline, or tile-click interception.
5. A GM save is routed to the authoritative active GM, normalized, persisted to the private journal, copied to sanitized Scene flags, and announced to other clients.

## Authority and sockets

The socket channel is `module.settlement-hex-manager`. `authority()` chooses the lexicographically lowest active GM user ID; that client is the host for mutations. This gives all clients a deterministic authority without a separate election record.

Socket messages use these shapes:

- `{type: "request", action, args, requestId, target, sender}` asks the host to perform an action.
- `{type: "reply", to, requestId, ok, value, error}` resolves or rejects the caller's pending promise.
- `{type: "changed"}` tells other clients to reload shared or public data.

The host accepts `snapshot` from any connected user. `saveTile`, `deleteTile`, `deleteAllTiles`, and `reveal` require the sender to be a GM. Host mutations are chained through `queue` to prevent overlapping journal writes.

## Storage

### Private authoritative data

`storePage()` finds or creates a Journal Entry flagged at:

`flags.settlement-hex-manager.store = true`

The entry is named **Settlement Tile Manager — Private State** and contains a text page named **Private State JSON**. Every current GM receives ownership level 3. The page contains JSON:

```json
{
  "state": {},
  "maps": {
    "SCENE_ID": {
      "enabled": true,
      "revision": 1,
      "hexes": {
        "ROW,COLUMN": {}
      }
    }
  }
}
```

`state` is legacy opaque data. `maps` is authoritative current data. Tile keys are produced by `keyOf(i, j)` and currently use the string form `"i,j"` returned from Foundry's grid offset.

If the journal JSON cannot be parsed, the module resets only this module's private `maps` and legacy `state`, rewrites the page, and warns the GM. It does not delete Actors, Items, Scenes, or other modules' data.

### Player-accessible data

Each Scene can carry a sanitized map at:

`flags.settlement-hex-manager.publicMap`

`syncPublicMaps()` writes only maps with player-relevant data. `safeMap()`/`publicHex()` remove GM Notes, hidden Points of Interest, and unfound discoverables. Players can therefore read permitted tile data without owning the private journal. Scene flags are neutral world data rather than data owned by the GM who created the tile.

## Tile schema

`blankHex(id)` defines the canonical defaults. A normalized tile has:

```js
{
  id, name, region, zone,
  terrain, hillsOverlay, difficulty, terrainTags,
  pathBonus, travelType,
  discovered, status, cleared, claimed,
  thumbnail, security, owner,
  notes, gmNotes,
  features, discoverables
}
```

Important rules enforced by `validateHex()`:

- `claimed` implies `discovered`.
- Terrain must be one of `TERRAIN_TYPES`; tags must be in `TERRAIN_TAGS`.
- Difficulty, path bonus, security, tier, and modifiers are numeric and bounded.
- A discoverable tier is 1–4 and its improvement list is truncated to the tier's slot count.
- Legacy `reconnoitered` becomes `status: "mapped"`.
- Legacy `commodity` and `camp` values become discoverables, after which those legacy fields are removed.

### Point of Interest (`features[]`)

```js
{ id, name, thumbnail, description, revealed }
```

`description` may contain Foundry editor HTML. `revealed` controls player visibility.

### Discoverable (`discoverables[]`)

```js
{ id, name, category, tier, modifier, found, improvements }
```

`found` controls player visibility. `improvements` is an array of text values with at most `tier` entries.

## DC rules

`tileDCs(hex)` returns `travel`, `explore`, `forage`, `base`, `exploredAdjustment`, and `pathBonus`.

- Base DC is the tile difficulty, default 15.
- A Fully Explored tile applies −2 to all three DCs.
- Path bonus reduces Travel DC only.
- `travel = base + exploredAdjustment - pathBonus`.
- `explore = forage = base + exploredAdjustment`.
- Final values cannot be lower than 0.

`exploredLabel()` reports Unexplored, Discovered, Explored, or Fully Explored from `discovered`, `status`, `cleared`, and `claimed`.

## Canvas behavior

The module uses Foundry grid APIs instead of manually calculating hex offsets:

- `pointFromEvent()` converts client coordinates to canvas coordinates and calls `canvas.grid.getOffset()`.
- `gridShape()` uses `canvas.grid.getVertices({i, j})`, with a center/shape fallback.
- `renderOverlay()` draws into a non-interactive `PIXI.Graphics` child of `canvas.interface` or `canvas.stage`.

While Tile Viewer mode is active:

- Any hovered tile receives a green outline.
- A discovered, unclaimed tile has a persistent blue outline.
- A claimed tile has a persistent gold outline.
- Blue and gold are mutually exclusive; the green hover outline can coexist with either.

When mode is inactive, `renderOverlay()` clears all module highlights and pointer handlers do not open tiles.

## Viewer and editor

The Viewer and Manager share one fixed `#shm-pane` element. Its header stays outside the scrolling `.shm-modal-body`, so scrolling content cannot hide the drag bar. `dockModal()` positions the window just to the left of Foundry's right-side UI; dragging switches it to explicit screen coordinates.

Players can open only saved public tile data. Their Viewer omits GM Notes, hidden content, **Edit Tile Data**, and reveal controls. GMs see all data and can switch to Tile Manager.

Images use Foundry's file picker. Point of Interest descriptions use Foundry's ProseMirror element when available and fall back to a plain textarea. Player Notes and GM Notes are plain textareas.

## Public API

Access the API through:

```js
const api = game.modules.get("settlement-hex-manager").api;
```

### `api.showTileViewer()`

Opens the Viewer for the currently selected module tile, if any. It does not enable Tile Viewer mode or select a tile.

### `await api.getTile(sceneId, key)`

Returns the normalized saved tile. A GM receives private data; a player receives `publicHex()` output. Returns no saved record when the key is absent.

### `await api.saveTile(sceneId, key, hex)`

Requests a normalized save. The caller must be a GM. The host persists the change and refreshes public Scene data.

### `await api.deleteTile(sceneId, key)`

Deletes one saved tile record. The caller must be a GM.

The API is intentionally small. Prefer these calls over directly editing the journal or Scene flags.

## Core function inventory

### `scripts/core.mjs`

- `uid()` creates a random ID using Foundry's helper when available.
- `clampInt(value, min, max)` normalizes bounded integers.
- `keyOf(i, j)` creates the stored tile key.
- `blankHex(id)` creates tile defaults.
- `blankMap()` creates a map container.
- `hexWithDefaults(id, hex)` overlays a record onto defaults.
- `validateHex(hex)` normalizes, bounds, and migrates one record.
- `exploredLabel(hex)` derives the human-readable exploration state.
- `tileDCs(hex)` computes Travel, Explore, and Forage DCs.
- `publicHex(hex)` creates a player-safe tile copy.

### `scripts/module.mjs`

- Storage: `readPublicMaps`, `syncPublicMaps`, `refreshPublicMaps`, `storePage`, `load`, `persist`.
- Authority: `authority`, `host`, `mutate`, `request`, `onSocket`, `perform`.
- Modal UI: `modalOpen`, `dockModal`, `installDrag`, `renderModal`, `modalClick`, `modalChange`.
- Tile sub-editors: `mountRichEditors`, `featureRow`, `discoverableRow`, `readDiscoverableRow`.
- Canvas: `pointFromEvent`, `gridShape`, `strokeHex`, `renderOverlay`, `clearHover`, `setTileViewerMode`, `hoverMove`, `tileClick`, `connectCanvas`.
- Registration/lifecycle: `registerDocumentModel`, `startup`, and the Foundry hooks at the end of the file.

Small unexported helpers near the top of `module.mjs` handle escaping, cloning, markup, notifications, current Scene/map lookup, debug logging, and public snapshots.

## Settings

- **Enable normal click tile viewer** (`enableSelection`, client): allows a left click in Tile Viewer mode to intercept the canvas and open a tile.
- **Enable Settlement Tile Manager debug console logs** (`debugLogging`, client): logs store loading, hover conditions, clicks, canvas binding, and actions.
- **Delete all Settlement Tile Manager tile data** (`deleteAllTileData`, world): GM-only momentary action. It asks for confirmation, deletes `maps`, and resets itself to false. It does not touch unrelated Foundry documents or other module data.

## Foundry hooks

- `init`: data model, settings, public API.
- `ready`: socket subscription and initial data load.
- `canvasReady`: public refresh, canvas binding, overlay refresh.
- `updateScene`: player refresh when this module's Scene flags change.
- `getSceneControlButtons`: adds the Tile Viewer toggle.

## Landmark Feature Item subtype

The manifest declares `documentTypes.Item.landmarkFeature`, and `registerDocumentModel()` installs its namespaced `TypeDataModel` as `settlement-hex-manager.landmarkFeature`. It currently has one HTML field named `description`. This subtype is independent of a tile's embedded `features[]` array.

## Release procedure

1. Increment the final numeric component of the version (for example `0.2.2.8` → `0.2.2.9`) unless the user explicitly chooses another version.
2. Update `module.json` version plus `manifest` and `download` URLs.
3. Update version references and release notes in `README.md` and `.github/workflows/release.yml`.
4. Update this handoff when architecture or APIs change.
5. Run `node --test tests/core.test.mjs` and syntax checks before publishing.
6. Push to `main`. GitHub Actions builds the ZIP and publishes both the installable ZIP and `module.json` under the matching prerelease tag.

The release ZIP must keep `module.json` at its root and include `README.md`, `HANDOFF.md`, `LICENSE`, `scripts`, `styles`, and `lang`. Do not perform manual post-publish validation unless specifically requested; the release workflow owns asset validation.

## Safe extension guidance

- Keep all private GM fields out of `publicHex()` and add a regression test for every new private field.
- Route all mutations through `request()`/`perform()`/`mutate()` so multi-GM writes stay serialized and public flags stay synchronized.
- Use Foundry grid APIs for location and vertices; do not recreate offset math from canvas dimensions.
- Never write Actor, Item, Scene, or other-system data as part of tile deletion. The module may delete only its own tile records and flags.
- Preserve unknown top-level private data during migrations unless a release explicitly documents its removal.
- Keep the modal header outside the scroll container.
- Keep player UI decisions based on sanitized data, not merely hidden CSS.

## Current limitations

- Automated tests cover pure data behavior, not a running Foundry client or PIXI rendering.
- There is no automatic import/export UI beyond the module-owned journal storage.
- Landmark Feature Items are not automatically linked to tile Points of Interest.
- `showTileViewer()` depends on an existing in-memory tile selection.
- The host-GM election is intentionally simple; the lowest active GM ID is authoritative.
