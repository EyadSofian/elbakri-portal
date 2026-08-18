import test from 'node:test';
import assert from 'node:assert/strict';
import { asyncHandler } from '../src/middleware/async';
import { DuplicateEmailError, isDuplicateEmailError, isUniqueConstraintError, uniqueConstraintFields } from '../src/shared/prisma-errors';
import { generatePassword } from '../src/shared/helpers';
import { createUserSchema, updateUserSchema } from '../src/modules/users/users.schema';
import { loginSchema } from '../src/modules/auth/auth.schema';

// Account creation for real staff. PostgreSQL compares text case-sensitively,
// so an address must be stored and looked up in one canonical form, a re-used
// address must come back as a clear conflict rather than a hang, and the
// temporary passwords handed out must not be guessable.

// ── Email normalisation ─────────────────────────────────────────────────────

test('createUser lower-cases and trims the email', () => {
  const parsed = createUserSchema.parse({
    email: '  Ahmed.Hassan@Elbakri.COM ',
    name: 'Ahmed Hassan',
    companyId: 'c1',
  });
  assert.equal(parsed.email, 'ahmed.hassan@elbakri.com');
});

test('login normalises the email the same way, so a capitalised login still matches', () => {
  const signup = createUserSchema.parse({ email: 'Sara@Elbakri.com', name: 'Sara', companyId: 'c1' });
  const login = loginSchema.parse({ email: '  SARA@ELBAKRI.COM  ', password: 'whatever' });
  assert.equal(login.email, signup.email);
});

test('updateUser normalises the email too', () => {
  assert.equal(updateUserSchema.parse({ email: 'New.Address@X.CoM' }).email, 'new.address@x.com');
});

test('a malformed address is still rejected after normalising', () => {
  assert.throws(() => createUserSchema.parse({ email: 'not-an-email', name: 'X', companyId: 'c1' }));
});

// ── Duplicate email detection ───────────────────────────────────────────────

const p2002 = (target: unknown) => ({ code: 'P2002', meta: { target } });

test('P2002 on the email column is recognised as a duplicate email', () => {
  assert.equal(isDuplicateEmailError(p2002(['email'])), true);
  assert.equal(isDuplicateEmailError(p2002('User_email_key')), true);
});

test('P2002 on another column is not reported as a duplicate email', () => {
  assert.equal(isUniqueConstraintError(p2002(['refNumber'])), true);
  assert.equal(isDuplicateEmailError(p2002(['refNumber'])), false);
});

test('unrelated errors are not mistaken for constraint violations', () => {
  for (const err of [null, undefined, new Error('boom'), { code: 'P2025' }, 'P2002']) {
    assert.equal(isUniqueConstraintError(err), false);
    assert.equal(isDuplicateEmailError(err), false);
  }
});

test('constraint fields are reported whether the driver sends an array or a string', () => {
  assert.deepEqual(uniqueConstraintFields(p2002(['email'])), ['email']);
  assert.deepEqual(uniqueConstraintFields(p2002('User_email_key')), ['User_email_key']);
  assert.deepEqual(uniqueConstraintFields(p2002(undefined)), []);
});

// ── asyncHandler ────────────────────────────────────────────────────────────

test('asyncHandler forwards a rejection to next() instead of leaving it unanswered', async () => {
  const boom = new Error('database unreachable');
  let passedToNext: unknown = null;

  const handler = asyncHandler(async () => { throw boom; });
  handler({} as never, {} as never, ((err: unknown) => { passedToNext = err; }) as never);
  await new Promise(setImmediate);

  assert.equal(passedToNext, boom, 'the rejection must reach the global error handler');
});

test('asyncHandler leaves a successful handler alone', async () => {
  let nextCalled = false;
  let ran = false;

  const handler = asyncHandler(async () => { ran = true; });
  handler({} as never, {} as never, (() => { nextCalled = true; }) as never);
  await new Promise(setImmediate);

  assert.equal(ran, true);
  assert.equal(nextCalled, false, 'next() must not be called when nothing failed');
});

// ── Temporary passwords ─────────────────────────────────────────────────────

test('generated passwords are the requested length and avoid look-alike characters', () => {
  const pw = generatePassword(20);
  assert.equal(pw.length, 20);
  assert.match(pw, /^[A-HJ-NP-Za-hj-np-z2-9]+$/, 'no I, l, 1, O or 0');
});

test('generated passwords do not repeat', () => {
  const seen = new Set(Array.from({ length: 200 }, () => generatePassword(12)));
  assert.equal(seen.size, 200, 'every generated password should be distinct');
});

// ── Which email clashed ─────────────────────────────────────────────────────
// Company.email and User.email are both unique columns named "email", so the
// P2002 alone cannot say which one it was. createCompany tags the failing
// create so the caller is told the right thing to change.

test('DuplicateEmailError carries the scope and the address that clashed', () => {
  const company = new DuplicateEmailError('company', 'ops@agency.com');
  const user = new DuplicateEmailError('user', 'admin@agency.com');

  assert.equal(company.scope, 'company');
  assert.equal(company.email, 'ops@agency.com');
  assert.equal(user.scope, 'user');
  assert.equal(user.email, 'admin@agency.com');
});

test('DuplicateEmailError is distinguishable from any other thrown value', () => {
  assert.ok(new DuplicateEmailError('user', 'a@b.com') instanceof DuplicateEmailError);
  assert.ok(new DuplicateEmailError('user', 'a@b.com') instanceof Error);
  assert.equal(new Error('boom') instanceof DuplicateEmailError, false);
  assert.equal({ code: 'P2002' } instanceof DuplicateEmailError, false);
});
