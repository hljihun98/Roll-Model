const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..');
const names=['20_state.js','30_engine.js','25_validation.js','31_compute.js','32_inputs.js'];
const source=names.map(n=>fs.readFileSync(path.join(root,'src',n),'utf8')).join('\n');
function loadEngine(){
  const ctx=vm.createContext({console});
  return vm.runInContext(source+'\n({DEFAULTS,SCENARIOS,WHEELS,FLOORS,compute,computeCore,solveLine,solveEllipse,thermalAllow,thermal,calibrate,applyWheel,applyFloor,validateState,importState,suggest,scaledGeom,concreteBearing,floorHalfspace,INPUTS,IMPACT,inputRelevant,defaultValueFor,initialSources,importSources,missingInputs,checkRatios,sensitivity,inputQuality,defaultWarnings})',ctx);
}
module.exports={root,source,loadEngine};
