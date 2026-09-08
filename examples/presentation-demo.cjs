const {mkdtempSync,rmSync,statSync,copyFileSync}=require('node:fs');
const {join}=require('node:path');const {tmpdir}=require('node:os');
const {resolveBuiltin}=require('../dist/templates');
const {resolveRenderConfig}=require('../dist/schema');
const {writeProject}=require('../dist/project');
const {render}=require('../dist/render');
(async()=>{
 const root=mkdtempSync(join(tmpdir(),'kinecard-demo-'));
 try {
  const template=resolveBuiltin('minimal');
  const card={title:'知识卡片',lines:[{text:'一个完整的本地渲染示例'}],platform:'douyin'};
  const config=resolveRenderConfig(card,{},template.timing);
  config.size=[360,640];config.fps=4;
  config.timing={titleMs:400,perLineMs:600,lineInMs:200,outroMs:400};
  writeProject({dir:root,card,render:config,template});
  const result=await render({input:root});
  copyFileSync(result.outFile,'docs/demo-preview.mp4');
  console.log(JSON.stringify({template:'minimal',size:config.size,fps:config.fps,duration_ms:result.durationMs,frames:result.frameCount,warnings:result.warnings.length,video_bytes:statSync(result.outFile).size},null,2));
 } finally {rmSync(root,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1});
