'use strict';

// Boots the real Express app from app.js against in-memory fakes, over a real
// HTTP server on an ephemeral port. The routes, middleware and handlers under
// test are the actual production ones - only Firestore, Firebase Auth and Cloud
// Storage are substituted.

const http = require('http');
const path = require('path');
const { FakeFirestore } = require('./fake-firestore');

const FUNCTIONS_DIR = path.join(__dirname, '..', '..');

const VALID_TOKEN = 'test-valid-token';
const TEST_USER = {
  uid: 'test-uid',
  handle: 'tester',
  imageUrl: 'https://example.test/avatar.png'
};

function resolveFrom(request) {
  return require.resolve(request, { paths: [FUNCTIONS_DIR] });
}

// Replace a module's exports before anything requires it.
function stubModule(request, exports) {
  const filename = resolveFrom(request);
  require.cache[filename] = {
    id: filename,
    filename,
    path: path.dirname(filename),
    loaded: true,
    exports,
    children: [],
    paths: []
  };
}

function uncache(request) {
  delete require.cache[resolveFrom(request)];
}

async function start(options = {}) {
  // The handlers log liberally on their error paths, which is expected
  // behaviour but drowns the test output. Set TEST_LOGS=1 to see it.
  const realConsole = { log: console.log, error: console.error };
  if (!process.env.TEST_LOGS) {
    console.log = () => {};
    console.error = () => {};
  }

  const db = new FakeFirestore();
  const uploads = [];
  const authCalls = [];

  const admin = {
    auth: () => ({
      verifyIdToken: (token) => {
        authCalls.push(token);
        return token === VALID_TOKEN
          ? Promise.resolve({ uid: TEST_USER.uid })
          : Promise.reject(
              Object.assign(new Error('Decoding Firebase ID token failed'), {
                code: 'auth/argument-error'
              })
            );
      }
    }),
    storage: () => ({
      bucket: () => ({
        upload: (filepath, meta) => {
          uploads.push({ filepath, meta });
          return Promise.resolve();
        }
      })
    })
  };

  // The handlers import { admin, db } from util/admin, which would otherwise
  // call admin.initializeApp() and reach for real credentials.
  stubModule('./util/admin', { admin, db });

  // handlers/users.js calls getAuth() at module load and the two auth helpers
  // inside the signup/login routes.
  stubModule('firebase/app', { initializeApp: () => ({ name: 'test-app' }) });
  stubModule('firebase/auth', {
    getAuth: () => ({ name: 'test-auth' }),
    createUserWithEmailAndPassword: (auth, email, password) =>
      (options.createUser || defaultCreateUser)(email, password),
    signInWithEmailAndPassword: (auth, email, password) =>
      (options.signIn || defaultSignIn)(email, password)
  });

  // Force the app and its handlers to pick up the stubs above.
  ['./app', './handlers/screams', './handlers/users', './util/fbAuth'].forEach(uncache);

  const app = require(resolveFrom('./app'));

  // firebase-functions' https.onRequest buffers and parses the request body
  // before handing it to the Express app, which is why app.js registers no body
  // parser of its own. Reproduce that here rather than changing the app: adding
  // express.json() to app.js would re-read an already-consumed stream in Cloud
  // Functions and clobber req.body.
  const server = await new Promise((resolve) => {
    const s = http.createServer((req, res) => {
      const chunks = [];
      req.on('data', (c) => chunks.push(c));
      req.on('end', () => {
        req.rawBody = Buffer.concat(chunks);
        const type = req.headers['content-type'] || '';
        if (type.includes('application/json')) {
          try {
            req.body = req.rawBody.length ? JSON.parse(req.rawBody.toString()) : {};
          } catch {
            req.body = {};
          }
        } else if (req.rawBody.length) {
          req.body = req.rawBody;
        } else {
          req.body = {};
        }
        app(req, res);
      });
    });
    s.listen(0, '127.0.0.1', () => resolve(s));
  });
  const { port } = server.address();
  const base = `http://127.0.0.1:${port}`;

  // Seed the user record that the auth middleware looks up after verifying a
  // token, so authenticated requests resolve to a handle.
  db.seed('users', TEST_USER.handle, {
    handle: TEST_USER.handle,
    email: 'tester@example.test',
    userId: TEST_USER.uid,
    imageUrl: TEST_USER.imageUrl,
    createdAt: '2024-01-01T00:00:00.000Z'
  });

  async function request(method, routePath, { body, token, headers = {} } = {}) {
    const init = { method, headers: { ...headers } };
    // fetch() refuses a body on GET/HEAD; the route still needs exercising.
    const bodyAllowed = !['GET', 'HEAD'].includes(method.toUpperCase());
    if (body !== undefined && bodyAllowed) {
      init.headers['content-type'] = 'application/json';
      init.body = JSON.stringify(body);
    }
    if (token) init.headers.authorization = `Bearer ${token}`;

    const res = await fetch(base + routePath, init);
    const text = await res.text();
    let parsed;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      parsed = text;
    }
    return { status: res.status, body: parsed };
  }

  return {
    db,
    uploads,
    authCalls,
    request,
    base,
    get: (p, o) => request('GET', p, o),
    post: (p, o) => request('POST', p, o),
    delete: (p, o) => request('DELETE', p, o),
    close: () =>
      new Promise((resolve) => {
        Object.assign(console, realConsole);
        server.close(resolve);
      })
  };
}

const defaultCreateUser = (email) =>
  Promise.resolve({
    user: { uid: 'new-uid', getIdToken: () => Promise.resolve('new-user-token') }
  });

const defaultSignIn = (email) =>
  Promise.resolve({
    user: { uid: TEST_USER.uid, getIdToken: () => Promise.resolve('signed-in-token') }
  });

module.exports = { start, VALID_TOKEN, TEST_USER };
