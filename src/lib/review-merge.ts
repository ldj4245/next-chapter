import { parseReflection, type ReflectionBlock, type ReflectionDocument } from './reflection.ts';

// Keep local structure, apply independent remote changes, and retain both
// versions of a block edited on both sides. Never drop a newly appended memo.
export function mergeReviewDraft(base:ReflectionDocument,local:ReflectionDocument,remote:ReflectionDocument,newId:()=>string=()=>crypto.randomUUID()):ReflectionDocument{
  const previous=new Map(base.blocks.map(block=>[block.id,block])),latest=new Map(remote.blocks.map(block=>[block.id,block]));
  const equal=(a:ReflectionBlock,b:ReflectionBlock)=>JSON.stringify(a)===JSON.stringify(b);
  const blocks:ReflectionBlock[]=[],conflicts:ReflectionBlock[]=[];
  for(const block of local.blocks){
    const before=previous.get(block.id),server=latest.get(block.id);
    if(before&&equal(before,block)){if(server)blocks.push({...server});}
    else {blocks.push({...block});if(server&&!equal(server,block)&&(!before||!equal(server,before)))conflicts.push({...server,id:newId()});}
  }
  const localIds=new Set(local.blocks.map(block=>block.id));
  for(const block of remote.blocks)if(!localIds.has(block.id)){
    const before=previous.get(block.id);
    if(!before||!equal(before,block))blocks.push({...block});
  }
  if(conflicts.length)blocks.push({id:newId(),kind:'heading2',text:'다른 곳에서 수정한 내용',checked:false},...conflicts);
  if(!blocks.length)blocks.push({id:newId(),kind:'paragraph',text:'',checked:false});
  return parseReflection({version:1,blocks});
}
