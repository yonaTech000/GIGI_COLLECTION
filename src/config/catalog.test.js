import test from 'node:test'
import assert from 'node:assert/strict'

import { buildInventoryAdjustment, buildProductSavePayload, calculateDiscountPercent, clampQuantityToStock, filterUnusedStorageUrls, getInventoryStatus, isSupportedImageFile, normalizeProduct, validateProductDraft } from './catalog.js'
import { createCartWhatsAppLink } from './whatsapp.js'

test('discount percent only applies when marked price exceeds selling price', () => {
  assert.equal(calculateDiscountPercent(2500, 1800), 28)
  assert.equal(calculateDiscountPercent(1800, 2000), 0)
  assert.equal(calculateDiscountPercent(0, 1200), 0)
})

test('inventory status handles draft, low stock and stockouts', () => {
  assert.equal(getInventoryStatus({ is_published: false }, 10), 'Draft')
  assert.equal(getInventoryStatus({ is_published: true, stock_quantity: 4, low_stock_threshold: 5 }, 4), 'Low stock')
  assert.equal(getInventoryStatus({ is_published: true, stock_quantity: 0, low_stock_threshold: 5 }, 0), 'Sold out')
})

test('quantity clamping keeps cart selections within available stock', () => {
  assert.equal(clampQuantityToStock({ product: { stockQuantity: 3 }, quantity: 5 }), 3)
  assert.equal(clampQuantityToStock({ product: { stockQuantity: 0 }, quantity: 2 }), 0)
  assert.equal(clampQuantityToStock({ product: { stockQuantity: 4 }, quantity: 1 }), 1)
})

test('product validation rejects invalid values and duplicate SKUs', () => {
  const result = validateProductDraft({
    name: 'Test',
    category: 'Handbags',
    description: 'An example product',
    price: '2500',
    markedPrice: '3000',
    stockQuantity: '2',
    lowStockThreshold: '5',
    sku: 'SKU-1',
    images: ['https://example.com/a.jpg'],
  }, [
    { id: 99, sku: 'sku-1' },
  ])

  assert.equal(result.valid, false)
  assert.match(result.message, /unique/i)

  const valid = validateProductDraft({
    name: 'Valid',
    category: 'Handbags',
    description: 'Valid product description',
    price: '2500',
    stockQuantity: '7',
    lowStockThreshold: '5',
    sku: 'SKU-2',
    images: ['https://example.com/b.jpg'],
  }, [])

  assert.equal(valid.valid, true)
})

test('normalizeProduct keeps consistent product fields and price values', () => {
  const product = normalizeProduct({
    id: 12,
    name: 'Classic Tote',
    category: 'Handbags',
    sku: 'GGC-001',
    selling_price: 1800,
    marked_price: 2500,
    stock_quantity: 8,
    low_stock_threshold: 4,
    is_published: true,
    images: ['https://example.com/tote.jpg'],
    primary_image: 'https://example.com/tote.jpg',
  })

  assert.equal(product.name, 'Classic Tote')
  assert.equal(product.price, 1800)
  assert.equal(product.markedPrice, 2500)
  assert.equal(product.availability, 'In stock')
  assert.equal(product.images[0], 'https://example.com/tote.jpg')
})

test('inventory adjustment keeps publication state separate from stock availability', () => {
  const soldOut = buildInventoryAdjustment({ currentStock: 3, delta: -5, lowStockThreshold: 5, isPublished: true, isArchived: false })
  assert.equal(soldOut.nextStock, 0)
  assert.equal(soldOut.nextStatus, 'Sold out')

  const draft = buildInventoryAdjustment({ currentStock: 3, delta: 2, lowStockThreshold: 5, isPublished: false, isArchived: false })
  assert.equal(draft.nextStatus, 'Draft')
  assert.equal(draft.nextStock, 5)

  const archived = buildInventoryAdjustment({ currentStock: 4, delta: -1, lowStockThreshold: 5, isPublished: true, isArchived: true })
  assert.equal(archived.nextStatus, 'Archived')
})

test('product save payload stays aligned with the database schema and does not include unsupported alias columns', () => {
  const payload = buildProductSavePayload({
    id: 42,
    name: 'Classic Tote',
    slug: 'classic-tote',
    category: 'Handbags',
    sku: 'GGC-001',
    brand: 'Gigi',
    price: 1800,
    sellingPrice: 1800,
    markedPrice: 2500,
    description: 'A roomy tote.',
    images: ['https://example.com/tote.jpg'],
    primaryImage: 'https://example.com/tote.jpg',
    stockQuantity: 8,
    lowStockThreshold: 4,
    isPublished: true,
    isArchived: false,
  })

  assert.equal(payload.price, 1800)
  assert.equal(payload.id, 42)
  assert.equal('selling_price' in payload, false)
  assert.equal(payload.primary_image, 'https://example.com/tote.jpg')
})

test('shared product images are not removed while still referenced by another product', () => {
  const products = [
    { id: 1, images: ['https://example.com/shared.jpg'], primary_image: 'https://example.com/shared.jpg' },
    { id: 2, images: ['https://example.com/shared.jpg'], primary_image: 'https://example.com/shared.jpg' },
    { id: 3, images: ['https://example.com/unique.jpg'], primary_image: 'https://example.com/unique.jpg' },
  ]

  assert.deepEqual(filterUnusedStorageUrls(['https://example.com/shared.jpg'], products, 1), [])
  assert.deepEqual(filterUnusedStorageUrls(['https://example.com/unique.jpg'], products, 1), [])
  assert.deepEqual(filterUnusedStorageUrls(['https://example.com/unique.jpg', 'https://example.com/shared.jpg'], products, 3), ['https://example.com/unique.jpg'])
})

test('supported image files are accepted even when the browser omits the image mime type', () => {
  const png = new File(['img'], 'hero.png', { type: 'image/png' })
  const avif = new File(['img'], 'look.avif', { type: 'image/avif' })
  const missingTypeJpeg = new File(['img'], 'photo.jpeg', { type: '' })
  const txt = new File(['nope'], 'notes.txt', { type: 'text/plain' })

  assert.equal(isSupportedImageFile(png), true)
  assert.equal(isSupportedImageFile(avif), true)
  assert.equal(isSupportedImageFile(missingTypeJpeg), true)
  assert.equal(isSupportedImageFile(txt), false)
})

test('cart WhatsApp message includes customer data, line items and subtotal', () => {
  const link = createCartWhatsAppLink({
    items: [
      { name: 'Classic Tote', price: 1800, quantity: 2, variant: 'Default', product: { name: 'Classic Tote', price: 1800, sku: 'GGC-001', id: 1 } },
      { name: 'Satin Scarf', price: 1200, quantity: 1, variant: 'Default', product: { name: 'Satin Scarf', price: 1200, sku: 'GGC-002', id: 2 } },
    ],
    customerName: 'Amina Njeri',
    customerPhone: '0712345678',
    customerNote: 'Gift wrap requested',
    businessNumber: '254791728291',
  })

  assert.ok(link)
  assert.match(link, /wa\.me\/254791728291/)
  assert.match(link, /Amina%20Njeri/)
  assert.match(link, /Classic%20Tote/)
  assert.match(link, /KES%204%2C800/)
  assert.match(link, /Gift%20wrap%20requested/)
})
