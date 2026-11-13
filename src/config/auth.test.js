import test from 'node:test'
import assert from 'node:assert/strict'

import { buildCustomerProfileRecord, buildCustomerSignupMetadata, isValidPhoneNumber } from './auth.js'
import { authLoginRoute, authOtpRoute, authSignupRoute, getAuthRouteSwap, isPublicAuthRoute } from './navigation.js'

test('customer profile record keeps username, phone and role in sync for future logins', () => {
  const record = buildCustomerProfileRecord({
    id: 'c2d4-1234',
    email: 'customer@example.com',
    phone: '+254712345678',
    username: 'maria',
    role: 'customer',
  })

  assert.equal(record.id, 'c2d4-1234')
  assert.equal(record.username, 'maria')
  assert.equal(record.phone, '+254712345678')
  assert.equal(record.role, 'customer')
  assert.equal(record.email, 'customer@example.com')
})

test('customer profile records always force the customer role and ignore browser role overrides', () => {
  const record = buildCustomerProfileRecord({
    id: 'c2d4-1234',
    email: 'customer@example.com',
    phone: '+254712345678',
    username: 'maria',
    role: 'owner',
  })

  assert.equal(record.role, 'customer')
  assert.notEqual(record.role, 'owner')
})

test('customer signup metadata includes full name, email, phone and username for the trusted database trigger', () => {
  const metadata = buildCustomerSignupMetadata({
    fullName: 'Jane Wanjiku',
    email: 'jane@example.com',
    phone: '0712345678',
    username: 'janewanjiku',
  })

  assert.deepEqual(metadata, {
    full_name: 'Jane Wanjiku',
    username: 'janewanjiku',
    email: 'jane@example.com',
    phone: '+254712345678',
  })
})

test('phone validation accepts standard mobile numbers and rejects invalid input', () => {
  assert.equal(isValidPhoneNumber('+254712345678'), true)
  assert.equal(isValidPhoneNumber('0712345678'), true)
  assert.equal(isValidPhoneNumber('abc'), false)
  assert.equal(isValidPhoneNumber(''), false)
})

test('public auth routes include both login and signup pages for navigation toggles', () => {
  assert.equal(isPublicAuthRoute(authLoginRoute), true)
  assert.equal(isPublicAuthRoute(authSignupRoute), true)
  assert.equal(isPublicAuthRoute(authOtpRoute), true)
  assert.equal(getAuthRouteSwap(authLoginRoute), authSignupRoute)
  assert.equal(getAuthRouteSwap(authSignupRoute), authLoginRoute)
  assert.equal(getAuthRouteSwap(authOtpRoute), authLoginRoute)
})
