// Public CI does not receive private source inputs. Both explicit contracts
// share the same public assertions and must yield the same publication model.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import registry from '../../shared/content/service-registry.v1.json' with {type:'json'};
import readyGrant from '../../shared/content/registry-ready-editorial-public-build.v1.json' with {type:'json'};
import draftGrant from '../../shared/content/registry-draft-editorial-public-build.v1.json' with {type:'json'};
import {validateReadyEditorialPublicBuild,validateReadyEditorialPublicDerivative} from './registry-ready-editorial-publication.mjs';
import {validateDraftEditorialPublicBuild,validateDraftEditorialPublicDerivative} from './registry-draft-editorial-publication.mjs';
import {derivePrivateEditorialBindings,readEditorialInput} from './registry-private-editorial-inputs.mjs';
import {PRIVATE_ORIGINALS,editorialVerificationContract} from './registry-editorial-verification-contract.mjs';

const contentRoot=new URL('../../shared/content/',import.meta.url);
const publicRead=file=>readFileSync(new URL(file,contentRoot));
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');

export function verifyEditorialContract(contract,{readContent}={}) {
  assert.notEqual(contract,undefined,'Explicit editorial verification contract required');
  contract=editorialVerificationContract(contract);
  const publicProjection=[
    ...validateReadyEditorialPublicDerivative(readyGrant,registry,{readContent:readContent??publicRead}),
    ...validateDraftEditorialPublicDerivative(draftGrant,registry,{readContent:readContent??publicRead}),
  ];
  const receipt={schemaVersion:1,contract,status:'PUBLIC_DERIVATIVE_VERIFIED',
    readyEntries:60,draftEntries:180,publicProjectionSha256:sha(JSON.stringify(publicProjection)),
    privateOriginals:'NOT_EXECUTED',privateOriginalCount:0,publicPrivateProjectionEquality:'NOT_EXECUTED',
    releaseRequires:'PUBLIC_CI_AND_PRIVATE_ORIGINALS_SAME_CANDIDATE_AND_EQUAL_PUBLIC_PROJECTION',
    sourceQaPromoted:false,production:'NOT_EXECUTED'};
  if(contract===PRIVATE_ORIGINALS) {
    const strictRead=readContent??readEditorialInput;
    const inventory=derivePrivateEditorialBindings();
    // Require every one of the independent fixed240 bindings, not just those
    // reached by today's renderer. No optional input or missing-file success.
    for(const pin of inventory.files)assert.equal(sha(strictRead(pin.file)),pin.sha256,'Private original bytes drift');
    const strictProjection=[
      ...validateReadyEditorialPublicBuild(readyGrant,registry,{readContent:strictRead}),
      ...validateDraftEditorialPublicBuild(draftGrant,registry,{readContent:strictRead}),
    ];
    assert.deepEqual(strictProjection,publicProjection,'Public/private publication projection drift');
    Object.assign(receipt,{status:'PRIVATE_ORIGINALS_VERIFIED',privateOriginals:'VERIFIED',
      privateOriginalCount:inventory.files.length,privateBindingSha256:inventory.bindingSha256,
      publicPrivateProjectionEquality:'VERIFIED'});
  }
  return receipt;
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const args=process.argv.slice(2);
  assert.deepEqual(args,['--contract',editorialVerificationContract(args[1])],'Explicit --contract required');
  const contract=editorialVerificationContract(args[1]);
  assert.equal(editorialVerificationContract(),contract,'Entrypoint and build verification contract differ');
  console.log(JSON.stringify({...verifyEditorialContract(contract),
    candidate:process.env.GITHUB_SHA??null,node:process.version},null,2));
}
