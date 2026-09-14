'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { start, VALID_TOKEN } = require('./helpers/harness');

const auth = { token: VALID_TOKEN };

test('user routes', async (t) => {
  let h;
  t.beforeEach(async () => {
    h = await start();
  });
  t.afterEach(async () => {
    await h.close();
  });

  // --- signup ---

  await t.test('POST /signup creates the user and returns a token', async () => {
    const res = await h.post('/signup', {
      body: {
        email: 'new@example.test',
        password: 'secret123',
        confirmPassword: 'secret123',
        handle: 'newhandle'
      }
    });

    assert.equal(res.status, 201);
    assert.equal(res.body.token, 'new-user-token');

    const stored = h.db.read('users', 'newhandle');
    assert.equal(stored.email, 'new@example.test');
    assert.equal(stored.userId, 'new-uid');
    assert.match(stored.imageUrl, /no-img\.png/, 'gets the default avatar');
  });

  await t.test('POST /signup rejects an invalid email', async () => {
    const res = await h.post('/signup', {
      body: {
        email: 'not-an-email',
        password: 'secret123',
        confirmPassword: 'secret123',
        handle: 'someone'
      }
    });
    assert.equal(res.status, 400);
    assert.equal(res.body.email, 'Must be a valid email address');
  });

  await t.test('POST /signup rejects mismatched passwords', async () => {
    const res = await h.post('/signup', {
      body: {
        email: 'new@example.test',
        password: 'secret123',
        confirmPassword: 'different',
        handle: 'someone'
      }
    });
    assert.equal(res.status, 400);
    assert.equal(res.body.confirmPassword, 'Passwords must match');
  });

  await t.test('POST /signup rejects empty fields', async () => {
    const res = await h.post('/signup', {
      body: { email: '', password: '', confirmPassword: '', handle: '' }
    });
    assert.equal(res.status, 400);
    assert.equal(res.body.email, 'Must not be empty');
    assert.equal(res.body.password, 'Must not be empty');
    assert.equal(res.body.handle, 'Must not be empty');
  });

  await t.test('POST /signup rejects a handle that is already taken', async () => {
    const res = await h.post('/signup', {
      body: {
        email: 'another@example.test',
        password: 'secret123',
        confirmPassword: 'secret123',
        handle: 'tester' // seeded by the harness
      }
    });
    assert.equal(res.status, 400);
    assert.deepEqual(res.body, { handle: 'this handle is already taken' });

    // Regression: this branch used to fall through and overwrite the record.
    assert.equal(h.db.read('users', 'tester').email, 'tester@example.test');
  });

  // --- login ---

  await t.test('POST /login returns a token for valid credentials', async () => {
    const res = await h.post('/login', {
      body: { email: 'tester@example.test', password: 'secret123' }
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.token, 'signed-in-token');
  });

  await t.test('POST /login rejects empty credentials', async () => {
    const res = await h.post('/login', { body: { email: '', password: '' } });
    assert.equal(res.status, 400);
    assert.equal(res.body.email, 'Must not be empty');
    assert.equal(res.body.password, 'Must not be empty');
  });

  await t.test('POST /login returns 403 when the credentials are wrong', async () => {
    await h.close();
    h = await start({
      signIn: () =>
        Promise.reject(
          Object.assign(new Error('bad password'), { code: 'auth/wrong-password' })
        )
    });

    const res = await h.post('/login', {
      body: { email: 'tester@example.test', password: 'wrong' }
    });
    assert.equal(res.status, 403);
    assert.deepEqual(res.body, { general: 'Wrong credentials, please try again' });
  });

  // --- profile ---

  await t.test('GET /user returns the caller credentials, likes and notifications', async () => {
    h.db.seed('likes', 'l1', { userHandle: 'tester', screamId: 's1' });
    h.db.seed('notifications', 'n1', {
      recipient: 'tester',
      sender: 'someone',
      screamId: 's1',
      type: 'like',
      read: false,
      createdAt: '2024-03-01T00:00:00.000Z'
    });

    const res = await h.get('/user', auth);
    assert.equal(res.status, 200);
    assert.equal(res.body.credentials.handle, 'tester');
    assert.equal(res.body.likes.length, 1);
    assert.equal(res.body.notifications.length, 1);
    assert.equal(res.body.notifications[0].notificationId, 'n1');
  });

  await t.test('GET /user/:handle returns a profile with that user\'s screams', async () => {
    h.db.seed('screams', 's1', {
      body: 'by tester',
      userHandle: 'tester',
      createdAt: '2024-01-01T00:00:00.000Z',
      likeCount: 0,
      commentCount: 0
    });
    h.db.seed('screams', 's2', {
      body: 'by someone else',
      userHandle: 'other',
      createdAt: '2024-01-02T00:00:00.000Z',
      likeCount: 0,
      commentCount: 0
    });

    const res = await h.get('/user/tester');
    assert.equal(res.status, 200);
    assert.equal(res.body.user.handle, 'tester');
    assert.equal(res.body.screams.length, 1, 'only this user\'s screams');
    assert.equal(res.body.screams[0].screamId, 's1');
  });

  await t.test('GET /user/:handle returns 404 for an unknown handle', async () => {
    const res = await h.get('/user/nobody');
    assert.equal(res.status, 404);
  });

  await t.test('POST /user updates the caller profile details', async () => {
    const res = await h.post('/user', {
      body: { bio: 'my bio', website: 'example.test', location: 'Chennai' },
      ...auth
    });

    assert.equal(res.status, 200);
    assert.deepEqual(res.body, { message: 'Details added successfully' });

    const stored = h.db.read('users', 'tester');
    assert.equal(stored.bio, 'my bio');
    assert.equal(stored.location, 'Chennai');
    assert.equal(stored.website, 'http://example.test', 'a scheme is prepended');
  });

  await t.test('POST /notifications marks the given notifications read', async () => {
    h.db.seed('notifications', 'n1', { recipient: 'tester', read: false });
    h.db.seed('notifications', 'n2', { recipient: 'tester', read: false });
    h.db.seed('notifications', 'n3', { recipient: 'tester', read: false });

    const res = await h.post('/notifications', { body: ['n1', 'n3'], ...auth });

    assert.equal(res.status, 200);
    assert.deepEqual(res.body, { message: 'Notifications marked read' });
    assert.equal(h.db.read('notifications', 'n1').read, true);
    assert.equal(h.db.read('notifications', 'n3').read, true);
    assert.equal(h.db.read('notifications', 'n2').read, false, 'untouched');
  });

  await t.test('POST /user/image stores the uploaded image and records the URL', async () => {
    const boundary = '----testboundary';
    const multipart = Buffer.concat([
      Buffer.from(
        `--${boundary}\r\n` +
          'Content-Disposition: form-data; name="image"; filename="avatar.png"\r\n' +
          'Content-Type: image/png\r\n\r\n'
      ),
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      Buffer.from(`\r\n--${boundary}--\r\n`)
    ]);

    const res = await fetch(`${h.base}/user/image`, {
      method: 'POST',
      headers: {
        'content-type': `multipart/form-data; boundary=${boundary}`,
        authorization: `Bearer ${VALID_TOKEN}`
      },
      body: multipart
    });

    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { message: 'image uploaded successfully' });
    assert.equal(h.uploads.length, 1, 'one file reached storage');
    assert.match(h.db.read('users', 'tester').imageUrl, /firebasestorage/);
  });

  await t.test('POST /user/image rejects a non-image upload', async () => {
    const boundary = '----testboundary';
    const multipart = Buffer.concat([
      Buffer.from(
        `--${boundary}\r\n` +
          'Content-Disposition: form-data; name="image"; filename="payload.txt"\r\n' +
          'Content-Type: text/plain\r\n\r\n'
      ),
      Buffer.from('not an image'),
      Buffer.from(`\r\n--${boundary}--\r\n`)
    ]);

    const res = await fetch(`${h.base}/user/image`, {
      method: 'POST',
      headers: {
        'content-type': `multipart/form-data; boundary=${boundary}`,
        authorization: `Bearer ${VALID_TOKEN}`
      },
      body: multipart
    });

    assert.equal(res.status, 400);
    assert.deepEqual(await res.json(), { error: 'Wrong file type submitted' });
    assert.equal(h.uploads.length, 0, 'nothing reached storage');
  });
});
