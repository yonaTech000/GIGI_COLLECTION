import test from 'node:test'
import assert from 'node:assert/strict'

import { BUSINESS_WHATSAPP_NUMBER, createCartWhatsAppLink, createWhatsAppLink, resolveBusinessWhatsAppNumber } from './whatsapp.js'

test('business WhatsApp number must come from the configured environment and never default to a hidden fallback', () => {
  assert.equal(resolveBusinessWhatsAppNumber({ VITE_BUSINESS_WHATSAPP_NUMBER: '254700000000' }), '254700000000')
  assert.equal(resolveBusinessWhatsAppNumber({}), '')
  assert.equal(BUSINESS_WHATSAPP_NUMBER, '')
})

test('checkout messages include product and customer details without inventing customer data', () => {
  const singleItemLink = createWhatsAppLink({
    productName: 'Classic Tote',
    price: 1800,
    quantity: 2,
    variant: 'Default',
    productReference: 'GGC-001',
    customerName: 'suzie',
    customerPhone: '+254712345678',
  })

  const cartLink = createCartWhatsAppLink({
    items: [{ product: { name: 'Classic Tote', price: 1800, sku: 'GGC-001', id: 'p-1' }, quantity: 2, variant: 'Default' }],
    customerName: 'suzie',
    customerPhone: '+254712345678',
    customerNote: 'Order from GIGI COLLECTION storefront.',
  })

  assert.equal(singleItemLink, null)
  assert.equal(cartLink, null)
  assert.equal(typeof BUSINESS_WHATSAPP_NUMBER, 'string')
})
