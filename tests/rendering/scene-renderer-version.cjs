// Run from either frontend checkout: node tests/rendering/scene-renderer-version.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const {createRequire} = require('node:module');
const path = require('node:path');
const ts = createRequire(path.resolve('packages/editor/package.json'))('typescript');
const read = name => fs.readFileSync(`packages/editor/${name}`, 'utf8');
const source = read('src/utils/common/saveSceneToService.ts');
const version = source.match(/setKey\("sceneInfo.rendererVersion", "(webgl|webgpu)"\)/)[1];

async function check(oldMarker, failure) {
    let info = {id:'local-unit-test',sceneVersion:3,rendererVersion:oldMarker,sceneName:'test',coverPicture:'cover.png'};
    let submitted, packed;
    const project = {
        getKey: () => info,
        setKey: (key,value) => key === 'sceneInfo' ? info=value : info[key.split('.')[1]]=value
    };
    const mocks = {
        vue:{nextTick:async()=>{}},
        '@astral3d/engine':{App:{project},Package:class {
            async pack() { packed={...info}; return {firstUploadResult:'new.zip',totalSize:100}; }
            dispose() {}
        }},
        '@/store/modules/globalConfig':{useGlobalConfigStore:()=>({})},
        '@/http/api/sys':{fetchUpload:async()=>({error:null,data:'new-cover.png'})},
        '@/utils/common/file':{filterSize:()=> '100 B'},
        '@/utils/common/constant':{DefaultScreenshot:'default.png'},
        '@/http/api/scenes':{fetchUpdateScene:async(id,data)=>{
            submitted={...data};
            return failure ? {error:{msg:'intentional test rejection',message:'intentional test rejection'},data:null} : {error:null,data:{...data}};
        }}
    };
    const context={exports:{},require:id=>{assert.ok(id in mocks,id);return mocks[id]},
        window:{$t:x=>x,viewer:{ready:Promise.resolve(),assertRenderable(){}}},
        fetch:async()=>({ok:failure!=='http',status:failure==='http'?503:200,
            blob:async()=>new Blob(failure==='empty'?[]:['test'])}),File,Blob,setTimeout:fn=>fn()};
    vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,context);
    if(failure) await assert.rejects(context.exports.saveSceneToService(),failure===true?/intentional test rejection/:/Failed to save the cover image/);
    else await context.exports.saveSceneToService();
    if(failure==='http'||failure==='empty') {
        assert.equal(submitted,undefined);
        assert.equal(packed,undefined);
    } else {
        assert.equal(submitted.rendererVersion,version);
        assert.equal(packed.rendererVersion,version);
    }
    assert.equal(info.rendererVersion,failure?oldMarker:version);
    assert.equal(info.sceneVersion,failure?3:4);
}

(async()=>{
    for(const marker of [undefined,null,'webgl','webgpu']) for(const failed of [false,true,'http','empty']) await check(marker,failed);
    assert.ok(read('src/views/home/project/components/CreateProject.vue').includes(`rendererVersion: "${version}"`));
    const list=read('src/views/home/project/SharedProject.vue');
    assert.ok(list.includes("project.rendererVersion === 'webgpu'"));
    assert.ok(list.includes("project.rendererVersion === 'webgl'"));
    assert.ok(list.includes("'未标记'"));
    console.log(`${version}: 16 save/rollback/cover-failure cases + creation/list marker checks passed`);
})().catch(error=>{console.error(error);process.exitCode=1});
