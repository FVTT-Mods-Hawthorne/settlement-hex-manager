/** Pure, testable domain rules with no dependency on Foundry. */
export const RESOURCE_IDS = ["rations", "materials", "resources", "supplies", "uniques"];
export const LEGACY_RESOURCE_IDS = ["food", "ore", "lumber", "luxuries", "stone"];
export const FEATURE_TYPES = ["landmark", "refuge", "ruin", "structure", "bridge", "ford", "waterfall", "hazard", "farmland"];
export const CAMPS = ["none", "farm", "mine", "lumber-camp", "quarry", "trading-post"];
export const TERRAIN_TYPES = ["plains","forest","hills","mountains","swamp","aquatic","desert","arctic","urban","underground"];
export const TERRAIN_TAGS = ["Lifted","Crystal Growth","Crystal Waters","Coastal"];
export const YIELDS = {farm:{rations:3},mine:{resources:2},"lumber-camp":{materials:2},quarry:{materials:2},"trading-post":{supplies:1}};
export const uid = () => globalThis.crypto?.randomUUID?.() || `id-${Date.now()}-${Math.random().toString(36).slice(2)}`;
export const clampInt = (value, min=0, max=999999999) => Math.max(min, Math.min(max, Math.trunc(Number(value)||0)));
export const keyOf = (row,col) => `${Math.trunc(row)},${Math.trunc(col)}`;
export const normalizeDocumentTypes = value => {
  if(Array.isArray(value))return value.map(String);
  if(value instanceof Set)return [...value].map(String);
  if(value&&typeof value==='object')return Object.keys(value);
  return [];
};
export const blankHex = (key) => ({id:key, name:"",region:"",zone:"",terrain:"plains",hillsOverlay:false,difficulty:15,terrainTags:[],pathBonus:0,travelType:"", discovered:false, status:"unexplored", thumbnail:"",security:0,cleared:false,claimed:false,owner:"",commodity:"none",camp:"none",notes:"",gmNotes:"",features:[],discoverables:[]});
export const blankState = () => ({schema:1,revision:0,turn:0,phase:"upkeep",settlements:{main:{id:"main",name:"Main Settlement",balances:Object.fromEntries(RESOURCE_IDS.map(r=>[r,0])),capacity:{},upkeep:{},actorId:"",homeSceneId:"",homeHexId:"",security:20,morale:0,population:0,maxPopulation:20,features:{structure:[],crafting:[],society:[],research:[],misc:[]}}},activities:[],ledger:[],processed:[],teams:[]});
export const blankMap = () => ({schema:1,revision:0,enabled:false,hexes:{}});
export const hexWithDefaults = (key, value={}) => ({...blankHex(key),...value,features:Array.isArray(value.features)?value.features:[],discoverables:Array.isArray(value.discoverables)?value.discoverables:[]});
export function validateHex(hex){
  const h=hexWithDefaults(String(hex.id),hex);
  if(h.status==="none"||h.status==="reconnoitered")h.status=h.status==="none"?"unexplored":"mapped";
  if(!["unexplored","mapped"].includes(h.status))throw Error("Invalid exploration status");
  if(!["none",...LEGACY_RESOURCE_IDS].includes(h.commodity))throw Error("Invalid commodity");
  if(!CAMPS.includes(h.camp))throw Error("Invalid camp");
  if(!Array.isArray(h.features)||h.features.length>100)throw Error("Invalid features");
  h.features=h.features.map(f=>({id:String(f.id||uid()),type:FEATURE_TYPES.includes(f.type)?f.type:"landmark",name:String(f.name||"").slice(0,120),thumbnail:String(f.thumbnail||"").slice(0,1000),revealed:!!f.revealed,description:String(f.description||"").slice(0,15000)}));
  if(!TERRAIN_TYPES.includes(h.terrain))h.terrain="plains";h.hillsOverlay=!!h.hillsOverlay;h.difficulty=clampInt(h.difficulty,0,99);h.pathBonus=clampInt(h.pathBonus,0,99);h.terrainTags=Array.isArray(h.terrainTags)?[...new Set(h.terrainTags.filter(tag=>TERRAIN_TAGS.includes(tag)))]:[];
  if(!h.discoverables.length){if(h.commodity&&h.commodity!=="none")h.discoverables.push({name:h.commodity,category:"Commodity",tier:1,modifier:0,found:true,improvements:[]});if(h.camp&&h.camp!=="none")h.discoverables.push({name:h.camp,category:"Camp",tier:1,modifier:0,found:true,improvements:[]});}if(h.discoverables.length>100)throw Error("Invalid discoverables");h.discoverables=h.discoverables.map(d=>{const tier=clampInt(d.tier,1,4);return {id:String(d.id||uid()),name:String(d.name||"").slice(0,120),category:String(d.category||"").slice(0,80),tier,modifier:clampInt(d.modifier,-99,99),found:!!d.found,improvements:(Array.isArray(d.improvements)?d.improvements:[]).slice(0,tier).map(value=>String(value||"").slice(0,120)).filter(Boolean)};});
  for(const f of ["name","region","terrain","travelType","owner","notes","gmNotes","thumbnail"])h[f]=String(h[f]||"").slice(0,f.endsWith("Notes")||f==="notes"?15000:200);
  h.zone=String(h.zone||"").slice(0,100);h.security=clampInt(h.security,0,999999);
  for(const f of ["discovered","cleared","claimed"])h[f]=!!h[f];if(h.claimed)h.discovered=true;
  return h;
}
export function publicHex(h){
  if(!h?.discovered&&!h?.claimed)return null;
  return {id:h.id,name:h.name,region:h.region,zone:h.zone,terrain:h.terrain,hillsOverlay:!!h.hillsOverlay,difficulty:h.difficulty,terrainTags:[...(h.terrainTags||[])],pathBonus:h.pathBonus,travelType:h.travelType,dcs:tileDCs(h),discovered:true,status:h.status,explored:exploredLabel(h),thumbnail:h.thumbnail,security:h.security,cleared:h.cleared,claimed:h.claimed,owner:h.owner,notes:h.notes,features:(h.features||[]).filter(f=>f.revealed).map(f=>({id:f.id,type:f.type,name:f.name,thumbnail:f.thumbnail,description:f.description,revealed:true})),discoverables:(h.discoverables||[]).filter(d=>d.found).map(d=>({...d,improvements:[...(d.improvements||[])]}))};
}
/** Computed exploration label independent of the editor's mapped flag. */
export function exploredLabel(hex){
  if(!hex || !hex.discovered || hex.status==="unexplored")return "Unexplored";
  const features=hex.features||[];
  return features.length && features.some(f=>!f.revealed) ? "Partially Mapped" : "Fully Explored";
}
export function tileDCs(hex){const base=clampInt(hex?.difficulty,0,99),explored=exploredLabel(hex)==="Fully Explored"?-2:0,path=clampInt(hex?.pathBonus,0,99);return {travel:Math.max(0,base+explored-path),explore:Math.max(0,base+explored),forage:Math.max(0,base+explored),exploredAdjustment:explored,pathBonus:path};}
export function production(map, settlementId){
  const results=Object.fromEntries(RESOURCE_IDS.map(r=>[r,0]));
  for(const h of Object.values(map?.hexes||{})){
    if(!h.claimed||h.owner!==settlementId||!h.discovered)continue;
    const camp=(h.discoverables||[]).find(d=>d.found&&d.category.toLowerCase()==="camp"&&YIELDS[d.name])?.name||h.camp,yieldMap=YIELDS[camp]||{};
    for(const [resource,n] of Object.entries(yieldMap))results[resource]+=n;
  }
  return results;
}
export function applyCosts(balances,costs){
  const out={...balances};
  for(const [r,amount] of Object.entries(costs||{})){
    if(!RESOURCE_IDS.includes(r)||!Number.isInteger(amount)||amount<0)throw Error(`Invalid cost ${r}`);
    if((out[r]||0)<amount)throw Error(`Insufficient ${r}`);
    out[r]-=amount;
  }
  return out;
}
export function addResources(balances,delta,capacity={}){
  const out={...balances};
  for(const [r,amount] of Object.entries(delta||{})){
    if(!RESOURCE_IDS.includes(r)||!Number.isInteger(amount))throw Error(`Invalid resource delta ${r}`);
    const next=(out[r]||0)+amount;
    if(next<0)throw Error(`Insufficient ${r}`);
    out[r]=Math.min(next,capacity[r]??Number.MAX_SAFE_INTEGER);
  }
  return out;
}
export const DEFAULT_ACTIVITIES = [
 {id:"claim",name:"Claim Territory",category:"expansion",cost:{rations:2},duration:0,effect:"claim"},
 {id:"map",name:"Map Hex",category:"exploration",cost:{rations:1},duration:0,effect:"map"},
 {id:"farm",name:"Build Farm",category:"construction",cost:{materials:6},duration:1,effect:"farm"},
 {id:"mine",name:"Build Mine",category:"construction",cost:{materials:8},duration:1,effect:"mine"},
 {id:"lumber-camp",name:"Build Lumber Camp",category:"construction",cost:{materials:3},duration:1,effect:"lumber-camp"},
 {id:"quarry",name:"Build Quarry",category:"construction",cost:{materials:5},duration:1,effect:"quarry"},
 {id:"watchtower",name:"Build Watchtower",category:"construction",cost:{materials:8},duration:2,effect:"watchtower"}
];
export function validateActivity(activity,hex,settlementId){
  if(!hex)throw Error("Select a hex first");
  if(!hex.discovered && activity.id!=="map")throw Error("Hex is undiscovered");
  if(activity.id==="claim"){
    if(hex.claimed)throw Error("Hex is already claimed");
    if(hex.status==="unexplored")throw Error("Map the hex before claiming");
  }else if(activity.id!=="map" && (!hex.claimed || hex.owner!==settlementId))throw Error("Settlement does not own this hex");
  if(activity.id==="map" && hex.status==="mapped")throw Error("Hex already mapped");
  const needs={farm:"food",mine:"ore","lumber-camp":"lumber",quarry:"stone"};
  const discoverables=hex.discoverables||[],hasCommodity=value=>discoverables.some(d=>d.found&&d.category.toLowerCase()==="commodity"&&d.name.toLowerCase()===value)||hex.commodity===value,hasCamp=discoverables.some(d=>d.found&&d.category.toLowerCase()==="camp")||hex.camp!=="none";
  if(needs[activity.id] && !hasCommodity(needs[activity.id]))throw Error(`Hex must have ${needs[activity.id]} commodity`);
  if(needs[activity.id] && hasCamp)throw Error("An improvement already exists");
  return true;
}
export function applyEffect(h,activity){
  const hex={...h,features:[...(h.features||[])],discoverables:[...(h.discoverables||[])]};
  switch(activity.effect){
    case "claim":hex.claimed=true;hex.owner=activity.settlementId;break;
    case "map":hex.discovered=true;hex.status="mapped";break;
    case "watchtower":hex.features.push({id:uid(),type:"structure",name:"Watchtower",thumbnail:"",revealed:true,description:""});break;
    default:if(CAMPS.includes(activity.effect))hex.discoverables.push({id:uid(),name:activity.effect,category:"Camp",tier:1,modifier:0,found:true,improvements:[]});
  }
  return validateHex(hex);
}
export function nextTurn(state,map,settlementId="main",requestId=uid()){
  if(state.processed.includes(requestId))return {state,map,duplicate:true};
  const s=structuredClone(state),m=structuredClone(map);
  const settlement=s.settlements[settlementId];
  if(!settlement)throw Error("Unknown settlement");
  const completed=[];
  for(const a of s.activities){
    if(a.status!=="in-progress"||a.settlementId!==settlementId)continue;
    a.remaining=Math.max(0,a.remaining-1);
    if(a.remaining===0){
      m.hexes[a.hexId]=applyEffect(hexWithDefaults(a.hexId,m.hexes[a.hexId]),a);
      a.status="completed";completed.push(a.name);
    }
  }
  const income=production(m,settlementId);
  const costs={...settlement.upkeep,rations:(settlement.upkeep?.rations||0)+clampInt(settlement.population||0)};
  // Upkeep is clamped by balance and separately reported; it never creates negative stock.
  const before=settlement.balances;
  const gross=addResources(before,income,settlement.capacity);
  const actualCosts={};
  for(const r of RESOURCE_IDS)actualCosts[r]=Math.min(gross[r]||0,clampInt(costs[r]||0));
  settlement.balances=applyCosts(gross,actualCosts);
  s.turn++;
  s.processed.push(requestId);if(s.processed.length>200)s.processed.shift();
  s.ledger.unshift({id:requestId,turn:s.turn,type:"turn",settlementId,income,costs:actualCosts,completed,at:new Date().toISOString()});
  s.ledger=s.ledger.slice(0,150);
  return {state:s,map:m,summary:{income,costs:actualCosts,completed}};
}


