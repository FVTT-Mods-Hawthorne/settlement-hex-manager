import { MODULE_ID as ID, CORE_ID, CORE_MIN_VERSION, uid, keyOf, checkCoreApi, viewTile, toCorePatch, migrateLegacyHex } from "./core.mjs";

const LANDMARK_TYPE = `${ID}.landmarkFeature`;
const esc = value => String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
const clone = value => structuredClone(value);
const gm = () => !!game.user?.isGM;
const sceneId = () => canvas?.scene?.id || "";
const notify = (message, type = "info") => ui.notifications?.[type]?.(String(message));
const debug = (event, details = {}) => { try { if (game.settings.get(ID, "debugLogging")) console.debug(`[${ID}] ${event}`, details); } catch {} };
const button = (action, label, attrs = "") => `<button type="button" data-action="${esc(action)}" ${attrs}>${esc(label)}</button>`;
const field = (label, name, value, type = "text") => `<label>${esc(label)}<input type="${type}" name="${esc(name)}" value="${esc(value)}"></label>`;
const check = (label, name, value) => `<label class="shm-check"><input type="checkbox" name="${esc(name)}" ${value ? "checked" : ""}>${esc(label)}</label>`;
const image = (src, cls = "shm-thumb") => src ? `<img class="${cls}" src="${esc(src)}" alt="">` : `<span class="${cls} shm-placeholder">◇</span>`;
const imageField = (label, name, value) => `<label class="shm-image-field">${esc(label)}<span class="shm-image-controls"><input type="text" name="${esc(name)}" value="${esc(value)}"><button type="button" data-action="pick-image" data-target="${esc(name)}" data-type="image">Browse…</button></span></label>`;
const richSlot = (label, name, value, fieldName = name) => `<label class="shm-rich-label">${esc(label)}<span class="shm-rich-slot" data-rich-name="${esc(name)}" data-rich-field="${esc(fieldName)}" data-rich-value="${esc(value || "")}"></span></label>`;
const valueOf = (name, root = modal) => root?.querySelector(`[name="${CSS.escape(name)}"]`)?.value ?? "";
const safeRich = value => { const template = document.createElement("template"); template.innerHTML = String(value || ""); template.content.querySelectorAll("script,style,iframe,object,embed").forEach(element => element.remove()); template.content.querySelectorAll("*").forEach(element => { for (const attribute of [...element.attributes]) if (attribute.name.startsWith("on") || ((attribute.name === "href" || attribute.name === "src") && /^javascript:/i.test(attribute.value))) element.removeAttribute(attribute.name); }); return template.innerHTML; };

let coreApi = null, coreStatus = { ok: false, version: "", missing: ["api"] };
let active = null, modal = null, hoverKey = null, tileViewerMode = false, canvasElement = null, canvasHandlers = [], graphics = null;

function connectCore(api = game.modules.get(CORE_ID)?.api) {
  coreApi = api || null;
  coreStatus = checkCoreApi(coreApi);
  return coreStatus;
}
function core() {
  if (!coreApi) connectCore();
  if (!coreStatus.ok) throw Error(`Settlement Core ${CORE_MIN_VERSION}+ must be active${coreStatus.missing.length ? ` (missing ${coreStatus.missing.join(", ")})` : ""}`);
  return coreApi;
}
const definitions = kind => { try { return core().all(kind).slice().sort((a, b) => String(a.label || a.id).localeCompare(String(b.label || b.id))); } catch { return []; } };
const definition = (kind, id) => { try { return core().get(kind, id); } catch { return null; } };
const existingTile = (sid, key) => { try { return core().getTile(sid, key); } catch { return null; } };
function displayTile(sid, key) {
  const tile = existingTile(sid, key);
  if (!tile) return null;
  return viewTile(tile, { isGM: gm(), dcs: core().tileDCs(sid, key), security: core().tileSecurity(sid, key), fullyExplored: core().isFullyExplored(sid, key) });
}
function dataChanged() { renderOverlay(); if (modal?.isConnected) renderModal(); }
async function clearPresentation(sid, key) {
  const tile = existingTile(sid, key); if (!tile) return false;
  const ext = clone(tile.ext || {}); delete ext[ID];
  await core().saveTile(sid, key, { ext });
  return true;
}

function options(items, selected, includeUnknown = true) {
  const list = [...items];
  if (includeUnknown && selected && !list.some(item => item.id === selected)) list.unshift({ id: selected, label: selected });
  return list.map(item => `<option value="${esc(item.id)}" ${item.id === selected ? "selected" : ""}>${esc(item.label || item.id)}</option>`).join("");
}
function mountRichEditors(root = modal) {
  const Editor = foundry?.applications?.elements?.HTMLProseMirrorElement;
  for (const slot of root?.querySelectorAll?.(".shm-rich-slot") || []) {
    const config = { name: slot.dataset.richName, value: slot.dataset.richValue || "", dataset: { field: slot.dataset.richField || slot.dataset.richName }, classes: "shm-rich-editor", collaborate: false, documentUUID: "", toggled: false, height: 160 };
    try { if (!Editor?.create) throw Error("Foundry ProseMirror element unavailable"); slot.replaceWith(Editor.create(config)); }
    catch (error) { debug("rich editor fallback", { error: error.message }); const textarea = document.createElement("textarea"); textarea.name = config.name; textarea.dataset.field = config.dataset.field; textarea.value = config.value; slot.replaceWith(textarea); }
  }
}
function featureRow(feature = { id: uid(), name: "", thumbnail: "", description: "", revealed: false }) {
  const imageName = `feature-image-${feature.id}`;
  return `<div class="shm-feature" data-id="${esc(feature.id)}"><label>Point of Interest name<input data-field="name" type="text" value="${esc(feature.name || "")}"></label><label class="shm-image-field">Image<span class="shm-image-controls"><input data-field="thumbnail" type="text" name="${esc(imageName)}" value="${esc(feature.thumbnail || "")}"><button type="button" data-action="pick-image" data-target="${esc(imageName)}" data-type="image">Browse…</button></span></label><span data-image-preview>${image(feature.thumbnail || "")}</span>${richSlot("Description", `feature-description-${feature.id}`, feature.description || "", "description")}<label class="shm-check"><input data-field="revealed" type="checkbox" ${feature.revealed ? "checked" : ""}>Visible to players</label>${button("remove-feature", "Remove")}</div>`;
}
function slotSummary(slots = []) {
  if (!slots.length) return "";
  return slots.map(slot => { const id = slot.pending?.building || slot.built; const label = definition("buildings", id)?.label || id; return `${label}${slot.pending ? " (building)" : ""}${slot.damaged ? " (damaged)" : ""}`; }).filter(Boolean).join(", ");
}
function discoverableRow(item = { id: uid(), type: "", name: "", tier: 1, modifier: "", found: false, slots: [] }) {
  const types = definitions("discoverables");
  const protectedByBuildings = !!item.slots?.length;
  return `<div class="shm-discoverable" data-id="${esc(item.id)}"><label>Type<select data-field="type"><option value="">Custom / unknown</option>${options(types, item.type)}</select></label><label>Name<input data-field="name" type="text" value="${esc(item.name || "")}"></label><label>Tier<select data-field="tier">${[1, 2, 3, 4].map(tier => `<option value="${tier}" ${tier === Number(item.tier) ? "selected" : ""}>${tier}</option>`).join("")}</select></label><label>Modifier<input data-field="modifier" type="text" value="${esc(item.modifier || "")}"></label><label class="shm-check"><input data-field="found" type="checkbox" ${item.found ? "checked" : ""}>Found (visible to players)</label>${protectedByBuildings ? `<small class="shm-improvements">Settlement Manager improvements: ${esc(slotSummary(item.slots))}. Remove them in Settlement Manager before deleting this discoverable.</small>` : ""}${button("remove-discoverable", "Remove Discoverable", protectedByBuildings ? 'disabled title="Remove its Settlement Manager improvements first"' : "")}</div>`;
}
function readDiscoverableRow(element) {
  return { id: element.dataset.id, type: element.querySelector('[data-field="type"]')?.value || "", name: element.querySelector('[data-field="name"]')?.value || "", tier: Number(element.querySelector('[data-field="tier"]')?.value) || 1, modifier: element.querySelector('[data-field="modifier"]')?.value || "", found: !!element.querySelector('[data-field="found"]')?.checked };
}
function tagEditor(tags = {}) {
  return definitions("tags").map(tag => tag.states?.length
    ? `<label>${esc(tag.label || tag.id)}<select data-tile-tag="${esc(tag.id)}"><option value="">Absent</option>${tag.states.map(state => `<option value="${esc(state)}" ${tags[tag.id] === state ? "selected" : ""}>${esc(state)}</option>`).join("")}</select></label>`
    : `<label class="shm-check"><input type="checkbox" data-tile-tag="${esc(tag.id)}" ${tags[tag.id] ? "checked" : ""}>${esc(tag.label || tag.id)}</label>`).join("");
}
function readTags(form) {
  return Object.fromEntries([...form.querySelectorAll("[data-tile-tag]")].map(input => [input.dataset.tileTag, input.type === "checkbox" ? input.checked : input.value]).filter(([, value]) => value));
}
function discoverablePreview(item) {
  const def = definition("discoverables", item.type) || {};
  const buildings = slotSummary(item.slots);
  return `<article class="shm-discoverable-preview"><b>${esc(item.name || def.label || item.type || "Discoverable")}</b><span>${esc(def.category || "Uncategorized")} · Tier ${esc(item.tier)}${item.modifier ? ` · ${esc(item.modifier)}` : ""}</span>${buildings ? `<small>Improvements: ${esc(buildings)}</small>` : ""}${gm() && !item.found ? "<small>Hidden from players</small>" : ""}</article>`;
}

function rightUiBoundary() { const edges = [...document.querySelectorAll("#ui-right,#sidebar")].map(element => element.getBoundingClientRect()).filter(rect => rect.width > 0 && rect.height > 0 && rect.left > 0).map(rect => rect.left); return edges.length ? Math.min(...edges) : window.innerWidth; }
function dockModal() { if (!modal) return; const box = modal.getBoundingClientRect(), pad = 12; modal.style.right = "auto"; modal.style.left = `${Math.max(pad, rightUiBoundary() - box.width - pad)}px`; modal.style.top = `${Math.max(pad, Math.min(118, window.innerHeight - 64))}px`; }
function installDrag(element) {
  let offset = null;
  element.addEventListener("pointerdown", event => { const header = event.target.closest(".shm-modal-header"); if (!header || event.target.closest("button,input,select")) return; const box = element.getBoundingClientRect(); offset = { x: event.clientX - box.left, y: event.clientY - box.top }; header.setPointerCapture?.(event.pointerId); event.preventDefault(); });
  element.addEventListener("pointermove", event => { if (!offset) return; element.style.left = `${Math.max(0, Math.min(innerWidth - 100, event.clientX - offset.x))}px`; element.style.top = `${Math.max(0, Math.min(innerHeight - 50, event.clientY - offset.y))}px`; element.style.right = "auto"; });
  element.addEventListener("pointerup", () => offset = null);
  element.addEventListener("pointercancel", () => offset = null);
}
function modalOpen(mode = "tile") {
  if (!modal) { modal = document.createElement("section"); modal.id = "shm-pane"; document.body.append(modal); modal.addEventListener("click", modalClick); installDrag(modal); }
  modal.dataset.mode = mode; renderModal(); dockModal();
}
function renderModal() {
  if (!modal) return;
  if (!coreStatus.ok) { modal.innerHTML = `<header class="shm-modal-header"><strong>Tile Viewer</strong>${button("close", "×")}</header><div class="shm-modal-body"><p>Settlement Core ${esc(CORE_MIN_VERSION)} or later must be active.</p></div>`; return; }
  const mode = modal.dataset.mode, sid = active?.sceneId, key = active?.key, saved = key ? displayTile(sid, key) : null;
  const tile = mode === "edit" && gm() ? (saved || viewTile({ key, name: "", terrain: definitions("terrains")[0]?.id || "", adjust: 0, tags: {}, revealed: false, explores: 0, discoverables: [], slots: [], notes: "", gmNotes: "", ext: {} }, { isGM: true })) : saved;
  let out = `<header class="shm-modal-header"><strong>${mode === "edit" ? "Tile Manager" : "Tile Viewer"}</strong>${button("close", "×")}</header><div class="shm-modal-body">`;
  if (!key) out += "<p>Select a grid tile while Tile Viewer mode is active.</p>";
  else if (!tile) { out += "<p>No accessible Settlement Core tile data exists here.</p>"; if (gm()) out += button("edit", "Create Tile Data"); }
  else if (mode === "edit" && gm()) {
    out += `<h3>${esc(key)}</h3><form id="shm-tile-form">${field("Name", "name", tile.name)}${imageField("Tile image", "thumbnail", tile.thumbnail || "")}<span data-image-preview>${image(tile.thumbnail)}</span>${field("Region", "region", tile.region)}${field("Zone", "zone", tile.zone)}<fieldset><legend>Settlement Core terrain</legend><label>Terrain<select name="terrain"><option value="">None</option>${options(definitions("terrains"), tile.terrain)}</select></label>${field("Difficulty adjustment", "adjust", tile.adjust || 0, "number")}<div class="shm-tag-grid">${tagEditor(tile.tags)}</div></fieldset><fieldset><legend>Exploration</legend>${check("Revealed", "revealed", tile.revealed)}${field("Successful explores", "explores", tile.explores || 0, "number")}${check("Cleared", "cleared", tile.cleared)}${check("Claimed", "claimed", tile.claimed)}</fieldset>${field("Owner", "owner", tile.owner)}<fieldset><legend>Discoverables (Settlement Core)</legend><div id="shm-discoverable-list">${(tile.discoverables || []).map(discoverableRow).join("")}</div>${button("discoverable-add", "Add Discoverable")}</fieldset><fieldset><legend>Points of Interest (Tile Manager extension)</legend><div id="shm-feature-list">${(tile.features || []).map(featureRow).join("")}</div>${button("feature-add", "Add Point of Interest")}</fieldset><label>Player Notes<textarea name="notes">${esc(tile.notes)}</textarea></label><label>GM Notes<textarea name="gmNotes">${esc(tile.gmNotes)}</textarea></label>${button("tile-save", "Save Tile")} ${saved ? button("tile-delete", "Clear Presentation Data") : ""} ${button("tile", "Cancel")}</form>`;
  } else {
    const terrain = definition("terrains", tile.terrain), dcs = tile.dcs || {}, visibleDiscoverables = tile.discoverables || [];
    const tagText = Object.entries(tile.tags || {}).map(([id, value]) => `${definition("tags", id)?.label || id}${value === true ? "" : `: ${value}`}`).join(", ") || "None";
    out += `<div class="shm-tile-top">${image(tile.thumbnail)}<div><h3>${esc(tile.name || `Tile ${key}`)}</h3><small>${esc(key)} · ${esc(tile.region || "Unknown region")}</small><p><b>Exploration:</b> ${tile.fullyExplored ? "Fully Explored" : tile.revealed ? `${esc(tile.explores || 0)} / ${esc(dcs.exploresNeeded || 6)}` : "Unrevealed"}</p></div></div><dl>`;
    for (const [label, value] of [["Terrain", terrain?.label || tile.terrain || "None"], ["Tags", tagText], ["Travel DC", dcs.travel ?? (dcs.impassable ? "Impassable" : "—")], ["Explore DC", dcs.explore ?? "—"], ["Forage DC", dcs.forage ?? "—"], ["Security", tile.security], ["Cleared", tile.cleared ? "Yes" : "No"], ["Claimed", tile.claimed ? "Yes" : "No"]]) out += `<dt>${esc(label)}</dt><dd>${esc(value)}</dd>`;
    out += `</dl>${dcs.impassable ? `<small>Travel requires ${esc(dcs.impassable)}.</small>` : ""}<h4>Discoverables</h4>${visibleDiscoverables.map(discoverablePreview).join("") || "<p>No visible discoverables.</p>"}<h4>Points of Interest</h4>${(tile.features || []).map(feature => `<div class="shm-feature-preview">${image(feature.thumbnail)}<div><b>${esc(feature.name || "Point of Interest")}</b><div class="shm-rich-display">${safeRich(feature.description)}</div>${gm() && !feature.revealed ? "<small>GM hidden</small>" : ""}</div></div>`).join("") || "<p>No visible Points of Interest.</p>"}<h4>Player Notes</h4><p>${esc(tile.notes) || "None."}</p>`;
    if (gm()) out += `<details><summary>GM Notes</summary><p>${esc(tile.gmNotes) || "None."}</p></details>${button("edit", "Edit Tile Data")} ${button("tile-reveal", tile.revealed ? "Hide Tile" : "Reveal Tile")}`;
  }
  modal.innerHTML = out + "</div>"; mountRichEditors(modal);
}

async function pickImage(targetButton) {
  const Picker = foundry?.applications?.apps?.FilePicker?.implementation || foundry?.applications?.apps?.FilePicker || globalThis.FilePicker;
  if (!Picker?.fromButton) throw Error("Foundry file browser is unavailable");
  const scope = targetButton.closest(".shm-feature") || modal, input = scope.querySelector(`[name="${CSS.escape(targetButton.dataset.target || "thumbnail")}"]`), picker = Picker.fromButton(targetButton), original = picker.callback;
  picker.callback = path => { original?.(path); if (input) input.value = path; const preview = scope.querySelector("[data-image-preview]"); if (preview) preview.innerHTML = image(path); };
  await picker.render({ force: true });
}
async function modalClick(event) {
  const target = event.target.closest("button[data-action]"); if (!target) return;
  const action = target.dataset.action, sid = active?.sceneId, key = active?.key;
  try {
    if (action === "close") { modal.remove(); modal = null; return; }
    if (action === "tile" || action === "edit") { modalOpen(action); return; }
    if (action === "pick-image") { await pickImage(target); return; }
    if (action === "feature-add") { const list = modal.querySelector("#shm-feature-list"); list.insertAdjacentHTML("beforeend", featureRow()); mountRichEditors(list); return; }
    if (action === "remove-feature") { target.closest(".shm-feature")?.remove(); return; }
    if (action === "discoverable-add") { modal.querySelector("#shm-discoverable-list").insertAdjacentHTML("beforeend", discoverableRow()); return; }
    if (action === "remove-discoverable") { target.closest(".shm-discoverable")?.remove(); return; }
    if (action === "tile-save") {
      const form = modal.querySelector("#shm-tile-form"); form.querySelectorAll("prose-mirror").forEach(editor => editor.save?.());
      const draft = { name: valueOf("name", form), thumbnail: valueOf("thumbnail", form), region: valueOf("region", form), zone: valueOf("zone", form), terrain: valueOf("terrain", form), adjust: valueOf("adjust", form), owner: valueOf("owner", form), explores: valueOf("explores", form), notes: valueOf("notes", form), gmNotes: valueOf("gmNotes", form), revealed: !!form.querySelector('[name="revealed"]')?.checked, cleared: !!form.querySelector('[name="cleared"]')?.checked, claimed: !!form.querySelector('[name="claimed"]')?.checked, tags: readTags(form) };
      draft.discoverables = [...form.querySelectorAll(".shm-discoverable")].map(readDiscoverableRow).filter(item => item.type || item.name);
      draft.features = [...form.querySelectorAll(".shm-feature")].map(element => ({ id: element.dataset.id, name: element.querySelector('[data-field="name"]')?.value || "", thumbnail: element.querySelector('[data-field="thumbnail"]')?.value || "", description: element.querySelector('[data-field="description"]')?.value || "", revealed: !!element.querySelector('[data-field="revealed"]')?.checked })).filter(feature => feature.name || feature.thumbnail || feature.description);
      await core().saveTile(sid, key, toCorePatch(draft, existingTile(sid, key))); modalOpen("tile"); return;
    }
    if (action === "tile-delete") { if (!confirm(`Clear Tile Manager presentation data for ${key}? Settlement Core terrain, exploration, discoverables, notes, and Settlement Manager buildings will be kept.`)) return; await clearPresentation(sid, key); modalOpen("tile"); notify("Tile Manager presentation data cleared."); return; }
    if (action === "tile-reveal") { const tile = existingTile(sid, key); await core().revealTile(sid, key, !tile?.revealed); return; }
  } catch (error) { console.error(ID, error); notify(error.message, "error"); }
}

function pointFromEvent(event) { if (!canvas?.ready || !canvas.grid) return null; const world = canvas.canvasCoordinatesFromClient({ x: event.clientX, y: event.clientY }), offset = canvas.grid.getOffset(world); return Number.isInteger(offset?.i) && Number.isInteger(offset?.j) ? { key: keyOf(offset.i, offset.j), world } : null; }
function gridShape(key) { const [i, j] = key.split(",").map(Number); if (!Number.isInteger(i) || !Number.isInteger(j) || !canvas?.grid) return []; const vertices = canvas.grid.getVertices({ i, j }); if (Array.isArray(vertices) && vertices.length >= 3) return vertices.map(point => ({ x: Number(point.x), y: Number(point.y) })); const center = canvas.grid.getCenterPoint({ i, j }), shape = canvas.grid.getShape(); return center && Array.isArray(shape) ? shape.map(point => ({ x: center.x + point.x, y: center.y + point.y })) : []; }
function strokeHex(key, color, alpha = 0, width = Math.max(1, canvas.grid.size / 100)) { const points = gridShape(key); if (!points.length || !graphics) return; if (typeof graphics.fill === "function" && typeof graphics.stroke === "function") { graphics.moveTo(points[0].x, points[0].y); for (const point of points.slice(1)) graphics.lineTo(point.x, point.y); graphics.closePath(); if (alpha > 0) graphics.fill({ color, alpha }); graphics.stroke({ color, width, alpha: .95 }); return; } if (typeof graphics.drawPolygon === "function") { graphics.lineStyle?.(width, color, .95); if (alpha > 0) graphics.beginFill?.(color, alpha); graphics.drawPolygon(points.flatMap(point => [point.x, point.y])); if (alpha > 0) graphics.endFill?.(); } }
function renderOverlay() {
  if (!tileViewerMode || !coreStatus.ok || !canvas?.ready || !canvas.grid) { graphics?.clear?.(); return; }
  const parent = canvas.interface || canvas.stage;
  if (!graphics || graphics.destroyed || graphics.parent !== parent) { try { graphics?.destroy?.(); } catch {} graphics = new PIXI.Graphics(); graphics.eventMode = "none"; parent.addChild(graphics); }
  graphics.clear?.();
  for (const tile of core().getTiles(sceneId())) { const meta = viewTile(tile, { isGM: gm() }); if (meta.claimed) strokeHex(tile.key, 0xd8b45b, 0, Math.max(2, canvas.grid.size / 75)); else if (tile.revealed) strokeHex(tile.key, 0x438bd1, 0, Math.max(2, canvas.grid.size / 75)); }
  if (hoverKey) strokeHex(hoverKey, 0x35c759, .035, Math.max(4, canvas.grid.size / 28));
}
function clearHover(reason = "pointer left tile") { const changed = hoverKey !== null; hoverKey = null; if (changed) { renderOverlay(); debug("tile hover cleared", { reason }); } }
function setTileViewerMode(value) { tileViewerMode = !!value; debug("tile viewer mode changed", { active: tileViewerMode }); if (!tileViewerMode) clearHover("tile viewer disabled"); renderOverlay(); }
function hoverMove(event) { if (!tileViewerMode || !coreStatus.ok || !canvas?.grid) { clearHover("tile viewer inactive or core unavailable"); return; } const hit = pointFromEvent(event); if (!hit) { clearHover("no grid coordinate"); return; } if (hoverKey === hit.key) return; hoverKey = hit.key; debug("tile hover changed", { key: hit.key, hasTileData: !!existingTile(sceneId(), hit.key) }); renderOverlay(); }
function tileClick(event) { const accepted = tileViewerMode && event.button === 0 && coreStatus.ok && !!canvas?.grid && !!game.settings.get(ID, "enableSelection"); if (!accepted) return; const hit = pointFromEvent(event); if (!hit) return; const tile = existingTile(sceneId(), hit.key); if (!tile && !gm()) return; active = { sceneId: sceneId(), key: hit.key }; debug("tile selected", { ...active, hasTileData: !!tile, isGM: gm() }); modalOpen(tile ? "tile" : "edit"); event.preventDefault(); }
function connectCanvas() { for (const [element, name, handler] of canvasHandlers) element.removeEventListener(name, handler, true); canvasHandlers = []; canvasElement = canvas?.app?.canvas || canvas?.app?.view || document.querySelector("#board canvas"); if (!canvasElement) return; for (const [name, handler] of [["pointermove", hoverMove], ["pointerleave", () => clearHover("pointer left canvas")], ["pointerdown", tileClick]]) { canvasElement.addEventListener(name, handler, true); canvasHandlers.push([canvasElement, name, handler]); } renderOverlay(); }

function isHostGM() { if (!gm()) return false; const first = game.users.filter(user => user.active && user.isGM).sort((a, b) => a.id.localeCompare(b.id))[0]; return first?.id === game.user.id; }
async function migrateLegacyStore() {
  if (!isHostGM() || game.settings.get(ID, "coreMigration") === "done") return;
  const journal = game.journal.find(entry => entry.getFlag(ID, "store"));
  const page = journal?.pages.find(value => value.name === "Private State JSON");
  if (!page?.text?.content) { await game.settings.set(ID, "coreMigration", "done"); return; }
  let saved; try { saved = JSON.parse(page.text.content); } catch (error) { console.warn(ID, "Legacy Tile Manager data was not migrated because it is unreadable", error); return; }
  const terrainIds = definitions("terrains").map(value => value.id), discoverableIds = definitions("discoverables").map(value => value.id);
  let migrated = 0, skipped = 0;
  for (const [sid, map] of Object.entries(saved.maps || {})) for (const [key, hex] of Object.entries(map?.hexes || {})) {
    if (core().getTile(sid, key)) { skipped++; continue; }
    await core().saveTile(sid, key, migrateLegacyHex(hex, { terrainIds, discoverableIds })); migrated++;
  }
  await game.settings.set(ID, "coreMigration", "done");
  if (migrated || skipped) notify(`Settlement Tile Manager moved ${migrated} legacy tile(s) into Settlement Core${skipped ? ` and skipped ${skipped} existing Core tile(s)` : ""}. The old journal was kept as a backup.`);
}
function registerDocumentModel() { const fields = foundry.data.fields; class LandmarkFeatureDataModel extends foundry.abstract.TypeDataModel { static defineSchema() { return { description: new fields.HTMLField({ required: false, blank: true, initial: "" }) }; } } Object.assign(CONFIG.Item.dataModels, { [LANDMARK_TYPE]: LandmarkFeatureDataModel }); CONFIG.Item.typeLabels ??= {}; CONFIG.Item.typeLabels[LANDMARK_TYPE] = "TYPES.Item.landmarkFeature"; CONFIG.Item.typeIcons ??= {}; CONFIG.Item.typeIcons[LANDMARK_TYPE] = "fa-solid fa-map-location-dot"; }

Hooks.once("settlementCore.register", api => connectCore(api));
Hooks.once("settlementCore.ready", async api => { connectCore(api); if (!coreStatus.ok) { if (gm()) notify(`Settlement Tile Manager needs Settlement Core ${CORE_MIN_VERSION}+; found ${coreStatus.version || "none"}.`, "error"); return; } try { await migrateLegacyStore(); } catch (error) { console.error(ID, "Legacy migration failed", error); notify(`Legacy tile migration failed: ${error.message}`, "error"); } connectCanvas(); dataChanged(); });
Hooks.on("settlementCore.changed", () => dataChanged());
Hooks.once("init", () => {
  registerDocumentModel();
  game.settings.register(ID, "enableSelection", { name: "Enable normal click Tile Viewer", hint: "May open beside Settlement Manager's Hex Buildings panel when both tools are active.", scope: "client", config: true, type: Boolean, default: true });
  game.settings.register(ID, "debugLogging", { name: "Enable Settlement Tile Manager debug console logs", scope: "client", config: true, type: Boolean, default: false });
  game.settings.register(ID, "coreMigration", { scope: "world", config: false, type: String, default: "" });
  game.settings.register(ID, "deleteAllTileData", { name: "Clear all Tile Manager presentation data", hint: "GM-only. Clears this module's images, region/zone, claimed state, and Points of Interest. Settlement Core tiles and Settlement Manager data are kept.", scope: "world", config: true, type: Boolean, default: false, onChange: async enabled => { if (!enabled || !gm()) return; try { if (!confirm("Clear ALL Settlement Tile Manager presentation data? Core terrain, exploration, discoverables, notes, and buildings will be kept.")) return; const entries = Object.entries(core().getState().tiles || {}).flatMap(([sid, tiles]) => Object.entries(tiles || {}).filter(([, tile]) => tile.ext?.[ID]).map(([key]) => [sid, key])); for (const [sid, key] of entries) await clearPresentation(sid, key); notify(`Cleared Tile Manager presentation data from ${entries.length} Core tile records.`); } catch (error) { console.error(ID, error); notify(error.message, "error"); } finally { if (game.settings.get(ID, "deleteAllTileData")) await game.settings.set(ID, "deleteAllTileData", false); } } });
  game.modules.get(ID).api = { showTileViewer: () => modalOpen("tile"), getTile: (sid, key) => displayTile(sid, key), saveTile: (sid, key, draft) => core().saveTile(sid, key, toCorePatch(draft, existingTile(sid, key))), deleteTile: clearPresentation, clearTilePresentation: clearPresentation, get core() { return coreApi; } };
});
Hooks.once("ready", () => { connectCore(); if (!coreStatus.ok && gm()) notify(`Settlement Tile Manager needs Settlement Core ${CORE_MIN_VERSION}+ to be active.`, "error"); });
Hooks.on("canvasReady", () => { connectCore(); connectCanvas(); dataChanged(); });
Hooks.on("getSceneControlButtons", controls => { const group = Array.isArray(controls) ? controls.find(value => value.name === "token" || value.name === "tokens" || value.name === "measure") : (controls.tokens || controls.token || controls.measure || Object.values(controls).find(value => value?.tools)); if (!group?.tools) return; const tool = { name: "shm-tile", title: "Tile Viewer", icon: "fa-solid fa-map", toggle: true, active: tileViewerMode, visible: coreStatus.ok, onChange: (eventOrActive, activeValue) => setTileViewerMode(typeof activeValue === "boolean" ? activeValue : !!eventOrActive), onClick: activeValue => setTileViewerMode(!!activeValue) }; if (Array.isArray(group.tools)) group.tools.push(tool); else group.tools[tool.name] = { ...tool, order: Object.keys(group.tools).length }; });
