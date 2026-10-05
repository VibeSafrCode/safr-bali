import assert from 'node:assert/strict';
import test from 'node:test';
import {projectionMayReplace} from '../src/lib/pricing-projection-order.js';
test('out-of-order response cannot restore an older catalog/FX publication',()=>{
 assert.equal(projectionMayReplace({publication_version:12},{publication_version:11}),false);
 assert.equal(projectionMayReplace({publication_version:12},{publication_version:12}),true);
 assert.equal(projectionMayReplace({publication_version:12},{publication_version:13}),true);
 assert.equal(projectionMayReplace(null,{publication_version:11}),true);
});
