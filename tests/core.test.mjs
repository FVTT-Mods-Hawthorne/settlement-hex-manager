import assert from "node:assert/strict";
import { test } from "node:test";
import { MODULE_ID, checkCoreApi, compareVersions, tileMeta, viewTile, toCorePatch, migrateLegacyHex } from "../scripts/core.mjs";

const api = Object.fromEntries(["getState", "getTile", "getTiles", "get", "all", "tileDCs", "tileSecurity", "isFullyExplored", "saveTile", "revealTile", "request"].map(name => [name, () => {}]));
api.version = "0.3.1";

test("requires the Settlement Core 0.3.1 API contract", () => {
  assert.equal(checkCoreApi(api).ok, true);
  assert.equal(checkCoreApi({ ...api, version: "0.2.1" }).ok, false);
  assert.deepEqual(checkCoreApi({ ...api, saveTile: undefined }).missing, ["saveTile"]);
  assert.equal(compareVersions("0.3.0", "0.2.9"), 1);
});

test("player and GM tile metadata follow Core extension visibility", () => {
  const tile = { key: "2,3", name: "Crossing", revealed: true, ext: { [MODULE_ID]: {
    public: { region: "Greenbelt", features: [{ id: "v", name: "Visible", revealed: true }] },
    gm: { features: [{ id: "v", name: "Visible", revealed: true }, { id: "h", name: "Hidden", revealed: false }] }
  } } };
  assert.deepEqual(tileMeta(tile, false).features.map(value => value.name), ["Visible"]);
  assert.deepEqual(tileMeta(tile, true).features.map(value => value.name), ["Visible", "Hidden"]);
  assert.equal(viewTile(tile, { dcs: { travel: 25 }, security: 8 }).dcs.travel, 25);
});

test("Tile Manager saves preserve Settlement Manager slots and other extensions", () => {
  const current = {
    key: "2,3", slots: [{ id: "tile-slot", built: "farm-1", pending: null, damaged: false }],
    discoverables: [{ id: "ore", type: "stone-outcrop", name: "Stone", tier: 2, modifier: "", found: true, slots: [{ id: "resource-slot", built: "yield-1", pending: null, damaged: false }], notes: "core note", gmNotes: "secret" }],
    ext: { "settlement-manager": { public: { marker: 1 }, gm: {} } }
  };
  const patch = toCorePatch({ name: "Edited", terrain: "mountain", dcs: { travel: 28, explore: "", forage: 19 }, revealed: true, explores: 3, tags: { lifted: true }, discoverables: [{ id: "ore", type: "stone-outcrop", name: "Edited Stone", tier: 2, modifier: "+1", found: true }], features: [{ id: "poi", name: "Tower", revealed: false }], notes: "players", gmNotes: "gm" }, current);
  assert.deepEqual(patch.discoverables[0].slots, current.discoverables[0].slots);
  assert.equal(patch.discoverables[0].notes, "core note");
  assert.equal(patch.ext["settlement-manager"].public.marker, 1);
  assert.equal(patch.ext[MODULE_ID].public.features.length, 0);
  assert.equal(patch.ext[MODULE_ID].gm.features[0].name, "Tower");
  assert.equal("slots" in patch, false, "Core owns tile building slots and tile.save preserves them");
  assert.deepEqual(patch.dcs, { travel: 28, explore: null, forage: 19 });
});

test("Core-shaped tile remains directly usable by Settlement Manager", () => {
  const patch = toCorePatch({ name: "Home", terrain: "grassland", revealed: true, explores: 6, discoverables: [{ id: "food", type: "root-tuber-bed", name: "Tubers", tier: 1, found: true }], features: [] });
  assert.equal(patch.revealed, true);
  assert.equal(patch.explores, 6);
  assert.deepEqual(Object.keys(patch.discoverables[0]).sort(), ["found", "gmNotes", "id", "modifier", "name", "notes", "slots", "tier", "type"]);
  assert.deepEqual(patch.discoverables[0].slots, []);
});

test("legacy private-store tiles migrate into the Core contract", () => {
  const patch = migrateLegacyHex({ name: "Old Hex", terrain: "forest", hillsOverlay: true, difficulty: 18, discovered: true, status: "mapped", terrainTags: ["Coastal"], claimed: false, discoverables: [{ name: "Stone Outcrop", category: "terrain", tier: 2, found: true, improvements: ["Yield I"] }], features: [{ name: "Tower", revealed: true }] }, { terrainIds: ["grassland", "woodland"], discoverableIds: ["stone-outcrop"] });
  assert.equal(patch.terrain, "woodland");
  assert.equal(patch.adjust, 3);
  assert.equal(patch.tags["low-hills"], true);
  assert.equal(patch.tags.coastal, true);
  assert.equal(patch.revealed, true);
  assert.equal(patch.discoverables[0].type, "stone-outcrop");
  assert.match(patch.discoverables[0].notes, /Legacy improvements/);
});
