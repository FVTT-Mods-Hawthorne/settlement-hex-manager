# Settlement Tile Manager — v0.2.2.8 beta

A Foundry VTT v14 module for attaching exploration data to Scene grid tiles. This release is intentionally tile-only: settlement management, settlement resources/phases, leaders, teams, activities, and Actor integration have been removed.

## Install

Use this manifest URL in Foundry's **Install Module** dialog:

`https://github.com/powercore2000/settlement-hex-manager/releases/download/v0.2.2.8/module.json`

The release also contains `settlement-hex-manager-v0.2.2.8.zip`. For a manual install, extract that archive into the Foundry user-data `Data/modules/` directory and restart Foundry.

## Tile workflow

1. Enable **Tile Viewer** from the Scene controls.
2. Hover any grid tile for a green outline.
3. Click a tile. A GM can create or edit its data; a player can open data that is available to players.
4. Saved discovered tiles keep a blue outline. Claimed tiles keep a gold outline instead. These outlines only appear while Tile Viewer mode is active.

The Tile Manager supports:

- Terrain, optional hills overlay, difficulty, path bonus, travel notes, and terrain tags.
- Computed Travel, Explore, and Forage DCs. Fully Explored tiles receive a −2 adjustment and paths reduce Travel DC.
- Exploration state, security, owner, normal Player Notes, and private GM Notes.
- Tier 1–4 discoverables with category, modifier, found/hidden state, and one improvement slot per tier.
- Points of Interest with a name, Foundry file-browser image, formatted description, and player visibility toggle.
- Per-tile deletion and a GM-only module setting that deletes every tile record owned by this module.

## Access and privacy

All GMs use one module-owned private Journal Entry as the authoritative tile database. The module grants every GM owner access to that journal so data created by one GM can be edited by another.

Players receive a sanitized copy through Scene flags and socket snapshots. Player data excludes GM Notes, hidden Points of Interest, and discoverables that have not been found. Player tile viewers also omit editing and reveal controls.

## Landmark Feature items

The module registers a **Landmark Feature** Item subtype so it is available from Foundry's Create Item menu. Tile Points of Interest are stored directly on their tile; the Item subtype is available for world-level content authors who want separate reusable documents.

## API and architecture

The public module API provides `showTileViewer()`, `getTile(sceneId, key)`, `saveTile(sceneId, key, hex)`, and `deleteTile(sceneId, key)`. Mutating calls require a GM and are serialized by the active host GM.

See [HANDOFF.md](HANDOFF.md) for the data model, storage design, socket protocol, lifecycle hooks, public API, function inventory, and extension notes.

## Development

Run the core regression tests with:

```sh
node --test tests/core.test.mjs
```

The GitHub Actions release workflow validates the manifest URLs, builds the installable ZIP, creates the prerelease, and uploads both the ZIP and `module.json`.

## License

MIT. See [LICENSE](LICENSE).
