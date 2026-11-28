/** Pure adapters between Settlement Tile Manager's UI and settlement-core's tile contract. */
export const MODULE_ID = "settlement-hex-manager";
export const CORE_ID = "settlement-core";
export const CORE_MIN_VERSION = "0.3.0";

export const uid = () => globalThis.crypto?.randomUUID?.() || `id-${Date.now()}-${Math.random().toString(36).slice(2)}`;
export const clampInt = (value, min = 0, max = 999999999) => Math.max(min, Math.min(max, Math.trunc(Number(value) || 0)));
export const keyOf = (row, col) => `${Math.trunc(row)},${Math.trunc(col)}`;
const object = value => value && typeof value === "object" && !Array.isArray(value) ? value : {};
const text = (value, max = 15000) => String(value ?? "").slice(0, max);
const copy = value => structuredClone(value);

export function compareVersions(left, right) {
  const parts = value => String(value || "").split(".").map(v => Number.parseInt(v, 10) || 0);
  const a = parts(left), b = parts(right);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const difference = (a[i] || 0) - (b[i] || 0);
    if (difference) return Math.sign(difference);
  }
  return 0;
}

export function checkCoreApi(api) {
  const required = ["getState", "getTile", "getTiles", "get", "all", "tileDCs", "tileSecurity", "isFullyExplored", "saveTile", "revealTile", "request"];
  if (!api || typeof api !== "object") return { ok: false, version: "", missing: ["api"] };
  const missing = required.filter(name => typeof api[name] !== "function");
  return { ok: !missing.length && compareVersions(api.version, CORE_MIN_VERSION) >= 0, version: String(api.version || ""), missing };
}

export const emptyMeta = () => ({ thumbnail: "", region: "", zone: "", owner: "", cleared: false, claimed: false, features: [] });

function cleanFeature(feature) {
  return {
    id: text(feature?.id || uid(), 60),
    name: text(feature?.name, 120),
    thumbnail: text(feature?.thumbnail, 1000),
    description: text(feature?.description, 15000),
    revealed: !!feature?.revealed
  };
}

export function tileMeta(tile, isGM = false) {
  const extension = object(tile?.ext?.[MODULE_ID]);
  const publicMeta = { ...emptyMeta(), ...object(extension.public) };
  const gmMeta = object(extension.gm);
  const merged = isGM ? { ...publicMeta, ...gmMeta } : publicMeta;
  merged.features = (Array.isArray(merged.features) ? merged.features : []).map(cleanFeature);
  return merged;
}

export function viewTile(tile, { isGM = false, dcs = null, security = 0, fullyExplored = false } = {}) {
  if (!tile) return null;
  const meta = tileMeta(tile, isGM);
  return {
    ...copy(tile),
    ...meta,
    id: tile.key,
    discovered: !!tile.revealed,
    dcs,
    security: Number(security) || 0,
    fullyExplored: !!fullyExplored
  };
}

function cleanDiscoverable(value, currentById = new Map()) {
  const id = text(value?.id || uid(), 60);
  const current = currentById.get(id) || {};
  return {
    ...current,
    id,
    type: text(value?.type, 80),
    name: text(value?.name, 120),
    tier: clampInt(value?.tier, 1, 4),
    modifier: text(value?.modifier, 60),
    found: !!value?.found,
    slots: copy(current.slots || value?.slots || []),
    notes: text(current.notes || value?.notes, 5000),
    gmNotes: text(current.gmNotes || value?.gmNotes, 5000)
  };
}

/** Build a settlement-core tile.save patch while preserving building slots and other modules' extensions. */
export function toCorePatch(draft, current = null) {
  const existing = current || {};
  const currentDiscoverables = new Map((existing.discoverables || []).map(value => [value.id, value]));
  const allFeatures = (draft.features || []).map(cleanFeature);
  const publicMeta = {
    thumbnail: text(draft.thumbnail, 1000), region: text(draft.region, 120), zone: text(draft.zone, 120),
    owner: text(draft.owner, 120), cleared: !!draft.cleared, claimed: !!draft.claimed,
    features: allFeatures.filter(feature => feature.revealed)
  };
  const gmMeta = { features: allFeatures };
  return {
    name: text(draft.name, 120),
    terrain: text(draft.terrain, 60),
    adjust: clampInt(draft.adjust, -20, 20),
    tags: Object.fromEntries(Object.entries(object(draft.tags)).filter(([, value]) => value)),
    revealed: !!draft.revealed,
    explores: clampInt(draft.explores, 0, 99),
    discoverables: (draft.discoverables || []).map(value => cleanDiscoverable(value, currentDiscoverables)),
    notes: text(draft.notes),
    gmNotes: text(draft.gmNotes),
    ext: {
      ...copy(object(existing.ext)),
      [MODULE_ID]: { public: publicMeta, gm: gmMeta }
    }
  };
}

const TERRAIN_MAP = {
  plains: "grassland", forest: "woodland", hills: "grassland", mountains: "mountain",
  swamp: "wetland", aquatic: "water", desert: "grassland", arctic: "grassland",
  urban: "grassland", underground: "mountain"
};
const TAG_MAP = { "Lifted": "lifted", "Crystal Growth": "crystal-growth", "Crystal Waters": "crystal-waters", "Coastal": "coastal" };

/** Convert one pre-Core Tile Manager record without deleting or modifying the old store. */
export function migrateLegacyHex(hex, { terrainIds = [], discoverableIds = [] } = {}) {
  const terrainSet = new Set(terrainIds), discoverableSet = new Set(discoverableIds);
  let terrain = TERRAIN_MAP[hex?.terrain] || text(hex?.terrain, 60);
  if (!terrainSet.has(terrain)) terrain = terrainSet.has("grassland") ? "grassland" : (terrainIds[0] || terrain);
  const tags = {};
  if (hex?.hillsOverlay || hex?.terrain === "hills") tags["low-hills"] = true;
  for (const tag of hex?.terrainTags || []) tags[TAG_MAP[tag] || String(tag).toLowerCase().replaceAll(" ", "-")] = true;
  const discoverables = (hex?.discoverables || []).map(value => {
    const fallback = String(value?.name || value?.category || "discoverable").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    const type = discoverableSet.has(value?.type) ? value.type : (discoverableSet.has(fallback) ? fallback : value?.type || fallback);
    const improvements = (value?.improvements || []).filter(Boolean);
    return {
      id: value?.id || uid(), type, name: value?.name || value?.category || "Discoverable",
      tier: clampInt(value?.tier, 1, 4), modifier: text(value?.modifier, 60), found: !!value?.found,
      slots: [], notes: improvements.length ? `Legacy improvements: ${improvements.join(", ")}` : "", gmNotes: ""
    };
  });
  const explores = hex?.claimed || hex?.cleared ? 6 : (hex?.status === "mapped" ? 1 : 0);
  return toCorePatch({
    name: hex?.name, terrain, adjust: clampInt(Number(hex?.difficulty ?? 15) - 15, -20, 20), tags,
    revealed: !!(hex?.discovered || hex?.claimed), explores, discoverables,
    notes: hex?.notes, gmNotes: hex?.gmNotes, thumbnail: hex?.thumbnail, region: hex?.region,
    zone: hex?.zone, owner: hex?.owner, cleared: hex?.cleared, claimed: hex?.claimed, features: hex?.features || []
  });
}
