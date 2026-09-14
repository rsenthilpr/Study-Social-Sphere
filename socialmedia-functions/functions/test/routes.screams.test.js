'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { start, VALID_TOKEN } = require('./helpers/harness');

const auth = { token: VALID_TOKEN };

function seedScream(h, id, overrides = {}) {
  h.db.seed('screams', id, {
    body: 'a scream',
    userHandle: 'tester',
    userImage: 'https://example.test/avatar.png',
    createdAt: '2024-01-01T00:00:00.000Z',
    likeCount: 0,
    commentCount: 0,
    ...overrides
  });
}

test('scream routes', async (t) => {
  let h;
  t.beforeEach(async () => {
    h = await start();
  });
  t.afterEach(async () => {
    await h.close();
  });

  await t.test('GET /screams returns an empty feed when there are none', async () => {
    const res = await h.get('/screams');
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, []);
  });

  await t.test('GET /screams returns newest first', async () => {
    seedScream(h, 'old', { body: 'older', createdAt: '2024-01-01T00:00:00.000Z' });
    seedScream(h, 'new', { body: 'newer', createdAt: '2024-06-01T00:00:00.000Z' });

    const res = await h.get('/screams');
    assert.equal(res.status, 200);
    assert.deepEqual(
      res.body.map((s) => s.screamId),
      ['new', 'old']
    );
    assert.equal(res.body[0].body, 'newer');
  });

  await t.test('POST /scream persists and echoes the new scream', async () => {
    const res = await h.post('/scream', { body: { body: 'hello world' }, ...auth });

    assert.equal(res.status, 200);
    assert.equal(res.body.body, 'hello world');
    assert.equal(res.body.userHandle, 'tester');
    assert.equal(res.body.likeCount, 0);
    assert.equal(res.body.commentCount, 0);
    assert.ok(res.body.screamId, 'response carries the generated id');

    const stored = h.db.read('screams', res.body.screamId);
    assert.equal(stored.body, 'hello world');
  });

  await t.test('POST /scream rejects an empty body', async () => {
    const res = await h.post('/scream', { body: { body: '   ' }, ...auth });
    assert.equal(res.status, 400);
    assert.deepEqual(res.body, { body: 'Body must not be empty' });
    assert.equal(h.db.count('screams'), 0, 'nothing was written');
  });

  await t.test('GET /scream/:id returns 404 for an unknown scream', async () => {
    const res = await h.get('/scream/does-not-exist');
    assert.equal(res.status, 404);
    assert.deepEqual(res.body, { error: 'Scream not found' });
  });

  await t.test('GET /scream/:id returns the scream with its comments', async () => {
    seedScream(h, 's1', { body: 'parent' });
    h.db.seed('comments', 'c1', {
      screamId: 's1',
      body: 'first comment',
      userHandle: 'someone',
      createdAt: '2024-02-01T00:00:00.000Z'
    });
    h.db.seed('comments', 'c2', {
      screamId: 'other-scream',
      body: 'unrelated',
      userHandle: 'someone',
      createdAt: '2024-02-02T00:00:00.000Z'
    });

    const res = await h.get('/scream/s1');
    assert.equal(res.status, 200);
    assert.equal(res.body.screamId, 's1');
    assert.equal(res.body.body, 'parent');
    assert.equal(res.body.comments.length, 1, 'only comments for this scream');
    assert.equal(res.body.comments[0].body, 'first comment');
  });

  await t.test('DELETE /scream/:id removes a scream owned by the caller', async () => {
    seedScream(h, 's1', { userHandle: 'tester' });

    const res = await h.delete('/scream/s1', auth);
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, { message: 'Scream deleted successfully' });
    assert.equal(h.db.read('screams', 's1'), undefined);
  });

  await t.test('DELETE /scream/:id refuses to delete another user\'s scream', async () => {
    seedScream(h, 's1', { userHandle: 'someone-else' });

    const res = await h.delete('/scream/s1', auth);
    assert.equal(res.status, 403);
    assert.deepEqual(res.body, { error: 'Unauthorized' });
    assert.ok(h.db.read('screams', 's1'), 'the scream survives');
  });

  await t.test('DELETE /scream/:id returns 404 for an unknown scream', async () => {
    const res = await h.delete('/scream/missing', auth);
    assert.equal(res.status, 404);
    assert.deepEqual(res.body, { error: 'Scream not found' });
  });

  await t.test('GET /scream/:id/like records a like and increments the count', async () => {
    seedScream(h, 's1', { likeCount: 0 });

    const res = await h.get('/scream/s1/like', auth);
    assert.equal(res.status, 200);
    assert.equal(res.body.likeCount, 1);
    assert.equal(h.db.read('screams', 's1').likeCount, 1);
    assert.equal(h.db.count('likes'), 1);
  });

  await t.test('GET /scream/:id/like rejects a duplicate like', async () => {
    seedScream(h, 's1', { likeCount: 1 });
    h.db.seed('likes', 'l1', { screamId: 's1', userHandle: 'tester' });

    const res = await h.get('/scream/s1/like', auth);
    assert.equal(res.status, 400);
    assert.deepEqual(res.body, { error: 'Scream already liked' });
    assert.equal(h.db.read('screams', 's1').likeCount, 1, 'count unchanged');
  });

  await t.test('GET /scream/:id/like returns 404 for an unknown scream', async () => {
    const res = await h.get('/scream/missing/like', auth);
    assert.equal(res.status, 404);
  });

  await t.test('GET /scream/:id/unlike removes the like and decrements', async () => {
    seedScream(h, 's1', { likeCount: 1 });
    h.db.seed('likes', 'l1', { screamId: 's1', userHandle: 'tester' });

    const res = await h.get('/scream/s1/unlike', auth);
    assert.equal(res.status, 200);
    assert.equal(res.body.likeCount, 0);
    assert.equal(h.db.read('screams', 's1').likeCount, 0);
    assert.equal(h.db.count('likes'), 0);
  });

  await t.test('GET /scream/:id/unlike rejects when not liked', async () => {
    seedScream(h, 's1', { likeCount: 0 });

    const res = await h.get('/scream/s1/unlike', auth);
    assert.equal(res.status, 400);
    assert.deepEqual(res.body, { error: 'Scream not liked' });
  });

  await t.test('a like is scoped to the user who made it', async () => {
    seedScream(h, 's1', { likeCount: 1 });
    h.db.seed('likes', 'l1', { screamId: 's1', userHandle: 'someone-else' });

    // tester has not liked it, so tester may still like it
    const res = await h.get('/scream/s1/like', auth);
    assert.equal(res.status, 200);
    assert.equal(h.db.count('likes'), 2);
  });

  await t.test('POST /scream/:id/comment stores the comment and bumps the count', async () => {
    seedScream(h, 's1', { commentCount: 0 });

    const res = await h.post('/scream/s1/comment', { body: { body: 'nice one' }, ...auth });
    assert.equal(res.status, 200);
    assert.equal(res.body.body, 'nice one');
    assert.equal(res.body.screamId, 's1');
    assert.equal(res.body.userHandle, 'tester');
    assert.equal(h.db.read('screams', 's1').commentCount, 1);
    assert.equal(h.db.count('comments'), 1);
  });

  await t.test('POST /scream/:id/comment rejects an empty comment', async () => {
    seedScream(h, 's1');
    const res = await h.post('/scream/s1/comment', { body: { body: '  ' }, ...auth });
    assert.equal(res.status, 400);
    assert.deepEqual(res.body, { comment: 'Must not be empty' });
    assert.equal(h.db.count('comments'), 0);
  });

  await t.test('POST /scream/:id/comment returns 404 for an unknown scream', async () => {
    const res = await h.post('/scream/missing/comment', { body: { body: 'hi' }, ...auth });
    assert.equal(res.status, 404);
    assert.deepEqual(res.body, { error: 'Scream not found' });

    // Regression: the 404 branch used to fall through the promise chain and
    // write the comment anyway, against a scream that does not exist.
    assert.equal(h.db.count('comments'), 0, 'no orphan comment was written');
  });

  await t.test('a terminal response is never followed by a second one', async () => {
    // Regression: `return res.status(...)` inside a .then does not stop the
    // chain, so these paths used to send two responses for one request.
    seedScream(h, 'owned-by-other', { userHandle: 'someone-else' });

    const cases = [
      ['GET', '/scream/missing/like', 404],
      ['GET', '/scream/missing/unlike', 404],
      ['DELETE', '/scream/missing', 404],
      ['DELETE', '/scream/owned-by-other', 403],
      ['GET', '/scream/missing', 404]
    ];

    for (const [method, route, expected] of cases) {
      const res = await h.request(method, route, auth);
      assert.equal(res.status, expected, `${method} ${route}`);
    }

    // Give any stray second write a chance to blow up before the server closes.
    await new Promise((r) => setTimeout(r, 50));
    assert.ok(h.db.read('screams', 'owned-by-other'), 'the 403 did not delete');
  });
});
