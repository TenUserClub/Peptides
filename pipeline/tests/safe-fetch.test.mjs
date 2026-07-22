import test from 'node:test';
import assert from 'node:assert/strict';
import { pinnedLookup } from '../lib/safe-fetch.mjs';

test('pinned DNS lookup supports both Node single-address and all-address callbacks', async () => {
  const selected = { address: '8.8.8.8', family: 4 };
  const lookup = pinnedLookup(selected);

  await new Promise((resolve, reject) => {
    lookup('example.test', {}, (error, address, family) => {
      try {
        assert.equal(error, null);
        assert.equal(address, selected.address);
        assert.equal(family, selected.family);
        resolve();
      } catch (assertionError) {
        reject(assertionError);
      }
    });
  });

  await new Promise((resolve, reject) => {
    lookup('example.test', { all: true }, (error, addresses) => {
      try {
        assert.equal(error, null);
        assert.deepEqual(addresses, [selected]);
        resolve();
      } catch (assertionError) {
        reject(assertionError);
      }
    });
  });
});
