'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { start, VALID_TOKEN } = require('./helpers/harness');

// Every route behind the FBAuth middleware, as registered in app.js.
const PROTECTED = [
  ['POST', '/scream'],
  ['DELETE', '/scream/some-id'],
  ['GET', '/scream/some-id/like'],
  ['GET', '/scream/some-id/unlike'],
  ['POST', '/scream/some-id/comment'],
  ['POST', '/user/image'],
  ['POST', '/user'],
  ['GET', '/user'],
  ['POST', '/notifications']
];

// Routes that must stay reachable without a token.
const PUBLIC = [
  ['GET', '/screams'],
  ['GET', '/scream/some-id'],
  ['GET', '/user/tester']
];

test('authentication', async (t) => {
  let h;
  t.beforeEach(async () => {
    h = await start();
  });
  t.afterEach(async () => {
    await h.close();
  });

  await t.test('protected routes reject a request with no Authorization header', async () => {
    for (const [method, route] of PROTECTED) {
      const res = await h.request(method, route, { body: {} });
      assert.equal(res.status, 403, `${method} ${route} should be 403`);
      assert.deepEqual(res.body, { error: 'Unauthorized' });
    }
  });

  await t.test('protected routes reject a malformed Authorization header', async () => {
    for (const [method, route] of PROTECTED) {
      const res = await h.request(method, route, {
        body: {},
        headers: { authorization: VALID_TOKEN } // missing the "Bearer " prefix
      });
      assert.equal(res.status, 403, `${method} ${route} should be 403`);
      assert.deepEqual(res.body, { error: 'Unauthorized' });
    }
  });

  await t.test('protected routes reject an unrecognised bearer token', async () => {
    const res = await h.post('/scream', {
      body: { body: 'hello' },
      token: 'not-a-real-token'
    });
    assert.equal(res.status, 403);
    assert.equal(h.authCalls.at(-1), 'not-a-real-token');
  });

  await t.test('a valid token resolves the caller to their handle', async () => {
    const res = await h.post('/scream', {
      body: { body: 'authenticated post' },
      token: VALID_TOKEN
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.userHandle, 'tester');
    assert.equal(res.body.userImage, 'https://example.test/avatar.png');
  });

  await t.test('public routes are reachable without a token', async () => {
    h.db.seed('screams', 'some-id', {
      body: 'public',
      userHandle: 'tester',
      createdAt: '2024-01-01T00:00:00.000Z',
      likeCount: 0,
      commentCount: 0
    });
    for (const [method, route] of PUBLIC) {
      const res = await h.request(method, route);
      assert.equal(res.status, 200, `${method} ${route} should be reachable`);
    }
  });
});
