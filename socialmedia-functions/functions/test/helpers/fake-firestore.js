'use strict';

// A small in-memory stand-in for the Firestore client, implementing only the
// surface these handlers actually use: collection/doc refs, chained
// where/orderBy/limit queries, add/set/update/delete, and batches.
//
// Data is held in a plain Map of collection name -> Map of docId -> fields, so
// each test starts from a known state and assertions can read the store back
// directly.

let autoId = 0;
const nextId = () => `generated-id-${++autoId}`;

const clone = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));

function compare(a, op, b) {
  switch (op) {
    case '==':
      return a === b;
    case '!=':
      return a !== b;
    case '>':
      return a > b;
    case '>=':
      return a >= b;
    case '<':
      return a < b;
    case '<=':
      return a <= b;
    default:
      throw new Error(`fake-firestore: unsupported operator "${op}"`);
  }
}

class DocSnapshot {
  constructor(id, data, ref) {
    this.id = id;
    this._data = data;
    this.ref = ref;
  }
  get exists() {
    return this._data !== undefined;
  }
  data() {
    return clone(this._data);
  }
}

class QuerySnapshot {
  constructor(docs) {
    this.docs = docs;
  }
  get empty() {
    return this.docs.length === 0;
  }
  get size() {
    return this.docs.length;
  }
  forEach(fn) {
    this.docs.forEach(fn);
  }
}

class Query {
  constructor(store, collection, filters = [], order = null, max = null) {
    this._store = store;
    this._collection = collection;
    this._filters = filters;
    this._order = order;
    this._max = max;
  }
  where(field, op, value) {
    return new Query(
      this._store,
      this._collection,
      [...this._filters, { field, op, value }],
      this._order,
      this._max
    );
  }
  orderBy(field, direction = 'asc') {
    return new Query(
      this._store,
      this._collection,
      this._filters,
      { field, direction },
      this._max
    );
  }
  limit(n) {
    return new Query(this._store, this._collection, this._filters, this._order, n);
  }
  get() {
    const docs = this._store._collection(this._collection);
    let rows = [...docs.entries()].filter(([, data]) =>
      this._filters.every((f) => compare(data[f.field], f.op, f.value))
    );

    if (this._order) {
      const { field, direction } = this._order;
      rows.sort((a, b) => {
        const av = a[1][field];
        const bv = b[1][field];
        if (av === bv) return 0;
        return (av > bv ? 1 : -1) * (direction === 'desc' ? -1 : 1);
      });
    }

    if (this._max !== null) rows = rows.slice(0, this._max);

    return Promise.resolve(
      new QuerySnapshot(
        rows.map(([id, data]) => new DocSnapshot(id, data, this._store.doc(`${this._collection}/${id}`)))
      )
    );
  }
}

class CollectionRef extends Query {
  add(fields) {
    const id = nextId();
    this._store._collection(this._collection).set(id, clone(fields));
    return Promise.resolve(this._store.doc(`${this._collection}/${id}`));
  }
}

class DocRef {
  constructor(store, collection, id) {
    this._store = store;
    this._collection = collection;
    this.id = id;
  }
  get() {
    const data = this._store._collection(this._collection).get(this.id);
    return Promise.resolve(new DocSnapshot(this.id, clone(data), this));
  }
  set(fields) {
    this._store._collection(this._collection).set(this.id, clone(fields));
    return Promise.resolve();
  }
  update(fields) {
    const docs = this._store._collection(this._collection);
    const existing = docs.get(this.id);
    if (existing === undefined) {
      return Promise.reject(
        Object.assign(new Error('No document to update'), { code: 5 })
      );
    }
    docs.set(this.id, { ...existing, ...clone(fields) });
    return Promise.resolve();
  }
  delete() {
    this._store._collection(this._collection).delete(this.id);
    return Promise.resolve();
  }
}

class FakeFirestore {
  constructor() {
    this.data = new Map();
  }

  _collection(name) {
    if (!this.data.has(name)) this.data.set(name, new Map());
    return this.data.get(name);
  }

  collection(name) {
    return new CollectionRef(this, name);
  }

  doc(path) {
    const parts = path.replace(/^\//, '').split('/');
    if (parts.length !== 2) {
      throw new Error(`fake-firestore: expected "collection/id", got "${path}"`);
    }
    return new DocRef(this, parts[0], parts[1]);
  }

  batch() {
    const ops = [];
    return {
      update: (ref, fields) => ops.push(() => ref.update(fields)),
      delete: (ref) => ops.push(() => ref.delete()),
      set: (ref, fields) => ops.push(() => ref.set(fields)),
      commit: () => Promise.all(ops.map((op) => op()))
    };
  }

  // --- test conveniences, not part of the Firestore API ---

  seed(collection, id, fields) {
    this._collection(collection).set(id, clone(fields));
    return this;
  }

  read(collection, id) {
    return clone(this._collection(collection).get(id));
  }

  count(collection) {
    return this._collection(collection).size;
  }
}

module.exports = { FakeFirestore };
