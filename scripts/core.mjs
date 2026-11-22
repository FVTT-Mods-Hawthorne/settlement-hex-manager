/** Pure tile-domain rules with no dependency on Foundry. */
export const FEATURE_TYPES = ["landmark", "refuge", "ruin", "structure", "bridge", "ford", "waterfall", "hazard", "farmland"];
export const TERRAIN_TYPES = ["plains","forest","hills","mountains","swamp","aquatic","desert","arctic","urban","underground"];
export const TERRAIN_TAGS = ["Lifted","Crystal Growth","Crystal Waters","Coastal"];

export const uid = () => globalThis.crypto?.randomUUID?.() || `id-${Date.now()}-${Math.random().toString(36).slice(2)}`;
export const clampInt = (value, min=0, max=999999999) => Math.max(min, Math.min(max, Math.trunc(Number(value)||0)));
export const keyOf = (row,col) => `${Math.trunc(row)},${Math.trunc(col)}`;

export const blankHex = key => ({
  id:key,name:"",region:"",zone:"",terrain:"plains",hillsOverlay:false,difficulty:15,
  terrainTags:[],pathBonus:0,travelType:"",discovered:false,status:"unexplored",thumbnail:"",
  security:0,cleared:false,claimed:false,owner:"",notes:"",gmNotes:"",features:[],discoverables:[]
});
export const blankMap = () => ({schema:2,revision:0,enabled:false,hexes:{}});
export const hexWithDefaults = (key,value={}) => ({
  ...blankHex(key),...value,
  features:Array.isArray(value.features)?value.features:[],
  discoverables:Array.isArray(value.discoverables)?value.discoverables:[]
});

export function validateHex(hex){
  const h=hexWithDefaults(String(hex.id),hex);
  if(h.status==="none"||h.status==="reconnoitered")h.status=h.status==="none"?"unexplored":"mapped";
  if(!["unexplored","mapped"].includes(h.status))throw Error("Invalid exploration status");
  if(!Array.isArray(h.features)||h.features.length>100)throw Error("Invalid Points of Interest");
  h.features=h.features.map(f=>({
    id:String(f.id||uid()),type:FEATURE_TYPES.includes(f.type)?f.type:"landmark",
    name:String(f.name||"").slice(0,120),thumbnail:String(f.thumbnail||"").slice(0,1000),
    revealed:!!f.revealed,description:String(f.description||"").slice(0,15000)
  }));
  if(!TERRAIN_TYPES.includes(h.terrain))h.terrain="plains";
  h.hillsOverlay=!!h.hillsOverlay;
  h.difficulty=clampInt(h.difficulty,0,99);
  h.pathBonus=clampInt(h.pathBonus,0,99);
  h.terrainTags=Array.isArray(h.terrainTags)?[...new Set(h.terrainTags.filter(tag=>TERRAIN_TAGS.includes(tag)))]:[];
  if(!h.discoverables.length){
    if(h.commodity&&h.commodity!=="none")h.discoverables.push({name:h.commodity,category:"Commodity",tier:1,modifier:0,found:true,improvements:[]});
    if(h.camp&&h.camp!=="none")h.discoverables.push({name:h.camp,category:"Camp",tier:1,modifier:0,found:true,improvements:[]});
  }
  if(h.discoverables.length>100)throw Error("Invalid discoverables");
  h.discoverables=h.discoverables.map(d=>{
    const tier=clampInt(d.tier,1,4);
    return {id:String(d.id||uid()),name:String(d.name||"").slice(0,120),category:String(d.category||"").slice(0,80),tier,
      modifier:clampInt(d.modifier,-99,99),found:!!d.found,
      improvements:(Array.isArray(d.improvements)?d.improvements:[]).slice(0,tier).map(v=>String(v||"").slice(0,120)).filter(Boolean)};
  });
  for(const f of ["name","region","terrain","travelType","owner","notes","gmNotes","thumbnail"])h[f]=String(h[f]||"").slice(0,f.endsWith("Notes")||f==="notes"?15000:200);
  h.zone=String(h.zone||"").slice(0,100);
  h.security=clampInt(h.security,0,999999);
  for(const f of ["discovered","cleared","claimed"])h[f]=!!h[f];
  if(h.claimed)h.discovered=true;
  delete h.commodity;
  delete h.camp;
  return h;
}

export function exploredLabel(hex){
  if(!hex||!hex.discovered||hex.status==="unexplored")return "Unexplored";
  const features=hex.features||[];
  return features.length&&features.some(f=>!f.revealed)?"Partially Mapped":"Fully Explored";
}

export function tileDCs(hex){
  const base=clampInt(hex?.difficulty,0,99);
  const explored=exploredLabel(hex)==="Fully Explored"?-2:0;
  const path=clampInt(hex?.pathBonus,0,99);
  return {travel:Math.max(0,base+explored-path),explore:Math.max(0,base+explored),forage:Math.max(0,base+explored),exploredAdjustment:explored,pathBonus:path};
}

export function publicHex(h){
  if(!h?.discovered&&!h?.claimed)return null;
  return {
    id:h.id,name:h.name,region:h.region,zone:h.zone,terrain:h.terrain,hillsOverlay:!!h.hillsOverlay,
    difficulty:h.difficulty,terrainTags:[...(h.terrainTags||[])],pathBonus:h.pathBonus,travelType:h.travelType,
    dcs:tileDCs(h),discovered:true,status:h.status,explored:exploredLabel(h),thumbnail:h.thumbnail,
    security:h.security,cleared:h.cleared,claimed:h.claimed,owner:h.owner,notes:h.notes,
    features:(h.features||[]).filter(f=>f.revealed).map(f=>({...f,revealed:true})),
    discoverables:(h.discoverables||[]).filter(d=>d.found).map(d=>({...d,improvements:[...(d.improvements||[])]}))
  };
}
