import test from 'node:test';
import assert from 'node:assert/strict';
import { radialReferralLayout, type ReferralData } from '../src/components/referral-layout';
const data = (pairs:number[][], ids:number[]):ReferralData=>({nodes:ids.map(id=>({id,label:`Person ${id}`})),edges:pairs.map(([parent_id,child_id],id)=>({id,parent_id,child_id})),total_edges:pairs.length,truncated:false});
test('root stays centered, direct leaves group, continuing branch remains visible',()=>{
 const source=data([[1,2],[1,3],[1,4],[2,5],[5,6]],[1,2,3,4,5,6]);const original=JSON.stringify(source);const map=radialReferralLayout(source);
 assert.deepEqual(map.nodes.find(n=>n.root),{key:'1',id:1,label:'Person 1',has_registered_services:undefined,x:0,y:0,root:true});
 assert.deepEqual(map.nodes.find(n=>n.members)?.members?.map(n=>n.id),[3,4]);
 assert.deepEqual(map.nodes.filter(n=>n.id).map(n=>n.id).sort(),[1,2,5,6]);
 assert.equal(map.edges.length,4);assert.equal(JSON.stringify(source),original);
});
test('empty, disconnected and cyclic data terminate without losing people',()=>{
 assert.equal(radialReferralLayout(data([],[])).nodes.length,0);
 for(const source of [data([], [1,2,3]), data([[1,2],[2,1],[3,4]],[1,2,3,4])]){
 const map=radialReferralLayout(source);const ids=map.nodes.flatMap(n=>n.members?.map(m=>m.id)??(n.id===undefined?[]:[n.id]));assert.equal(new Set(ids).size,source.nodes.length);assert.equal(ids.length,source.nodes.length);assert(map.nodes.every(n=>Number.isFinite(n.x)&&Number.isFinite(n.y)));
 }
});
test('dense branches reserve enough space for every card',()=>{
 const pairs:number[][]=[];const ids=[1];for(let i=2;i<14;i++){ids.push(i,100+i);pairs.push([1,i],[i,100+i]);}
 const map=radialReferralLayout(data(pairs,ids));
 for(let i=0;i<map.nodes.length;i++)for(let j=i+1;j<map.nodes.length;j++){
 const a=map.nodes[i],b=map.nodes[j];assert(Math.abs(a.x-b.x)>=210||Math.abs(a.y-b.y)>=64,`overlap ${a.key},${b.key}`);
 }
});
