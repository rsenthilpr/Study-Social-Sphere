'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  validateSignupData,
  validateLoginData,
  reduceUserDetails
} = require('../util/validators');

test('validateSignupData', async (t) => {
  const valid = {
    email: 'someone@example.test',
    password: 'secret123',
    confirmPassword: 'secret123',
    handle: 'someone'
  };

  await t.test('accepts a complete, well-formed signup', () => {
    const { valid: ok, errors } = validateSignupData(valid);
    assert.equal(ok, true);
    assert.deepEqual(errors, {});
  });

  await t.test('requires an email', () => {
    const { valid: ok, errors } = validateSignupData({ ...valid, email: '   ' });
    assert.equal(ok, false);
    assert.equal(errors.email, 'Must not be empty');
  });

  await t.test('rejects malformed email addresses', () => {
    for (const email of ['plainstring', 'no@tld', '@example.test', 'spaces in@example.test']) {
      const { valid: ok } = validateSignupData({ ...valid, email });
      assert.equal(ok, false, `"${email}" should be rejected`);
    }
  });

  await t.test('accepts ordinary email addresses', () => {
    for (const email of [
      'a@b.co',
      'first.last@example.test',
      'user+tag@sub.example.test'
    ]) {
      const { valid: ok, errors } = validateSignupData({ ...valid, email });
      assert.equal(ok, true, `"${email}" should be accepted, got ${JSON.stringify(errors)}`);
    }
  });

  await t.test('requires the passwords to match', () => {
    const { valid: ok, errors } = validateSignupData({ ...valid, confirmPassword: 'other' });
    assert.equal(ok, false);
    assert.equal(errors.confirmPassword, 'Passwords must match');
  });

  await t.test('requires a handle', () => {
    const { valid: ok, errors } = validateSignupData({ ...valid, handle: '  ' });
    assert.equal(ok, false);
    assert.equal(errors.handle, 'Must not be empty');
  });

  await t.test('reports every problem at once', () => {
    const { errors } = validateSignupData({
      email: '',
      password: '',
      confirmPassword: 'x',
      handle: ''
    });
    assert.deepEqual(Object.keys(errors).sort(), [
      'confirmPassword',
      'email',
      'handle',
      'password'
    ]);
  });
});

test('validateLoginData', async (t) => {
  await t.test('accepts an email and password', () => {
    const { valid } = validateLoginData({ email: 'a@b.co', password: 'pw' });
    assert.equal(valid, true);
  });

  await t.test('rejects blank fields', () => {
    const { valid, errors } = validateLoginData({ email: ' ', password: '' });
    assert.equal(valid, false);
    assert.equal(errors.email, 'Must not be empty');
    assert.equal(errors.password, 'Must not be empty');
  });
});

test('reduceUserDetails', async (t) => {
  await t.test('keeps only the fields that were filled in', () => {
    const out = reduceUserDetails({ bio: 'hello', website: '', location: '  ' });
    assert.deepEqual(out, { bio: 'hello' });
  });

  await t.test('prepends http:// to a bare domain', () => {
    const out = reduceUserDetails({ bio: '', website: 'example.test', location: '' });
    assert.equal(out.website, 'http://example.test');
  });

  await t.test('leaves an existing scheme alone', () => {
    for (const website of ['http://example.test', 'https://example.test']) {
      const out = reduceUserDetails({ bio: '', website, location: '' });
      assert.equal(out.website, website);
    }
  });

  await t.test('returns an empty object when nothing was provided', () => {
    assert.deepEqual(reduceUserDetails({ bio: '', website: '', location: '' }), {});
  });
});
