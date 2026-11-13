import { categoryOptions as fallbackCategories, products as fallbackProducts } from '../data/products.js'
import { supabase } from './supabase.js'

export const PRODUCT_IMAGE_BUCKET = 'product-images'
export const PRODUCT_IMAGE_MAX_BYTES = 5 * 1024 * 1024

export const isSupportedImageFile = (file) => {
  if (!(file instanceof File)) return false

  const mimeType = String(file.type || '').toLowerCase()
  const fileName = String(file.name || '').toLowerCase()
  const supportedMime = mimeType.startsWith('image/')
  const supportedExtension = /\.(jpe?g|png|webp|avif|gif|bmp|svg|ico|tiff?|jfif|heic|heif)$/i.test(fileName)

  return supportedMime || supportedExtension
}

export const toNumber = (value, fallback = 0) => {
  const nextValue = Number(value ?? fallback)
  return Number.isFinite(nextValue) ? nextValue : fallback
}

export const createSlug = (value) =>
  String(value || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')

export const normalizeCategory = (record = {}) => ({
  id: String(record.id ?? record.slug ?? record.name ?? ''),
  label: String(record.name ?? '').trim() || 'Uncategorized',
  slug: String(record.slug ?? record.name ?? '').trim() || 'uncategorized',
})

export const calculateDiscountPercent = (markedPrice, sellingPrice) => {
  const marked = toNumber(markedPrice, 0)
  const selling = toNumber(sellingPrice, 0)

  if (!marked || !selling || marked <= selling) {
    return 0
  }

  return Math.round(((marked - selling) / marked) * 100)
}

export const getAvailabilityState = (stockQuantity = 0, lowStockThreshold = 5) => {
  const nextStock = Math.max(0, toNumber(stockQuantity, 0))
  const nextThreshold = Math.max(0, toNumber(lowStockThreshold, 5))

  if (nextStock <= 0) return 'Sold out'
  if (nextThreshold > 0 && nextStock <= nextThreshold) return 'Low stock'
  return 'In stock'
}

export const getInventoryStatus = (product = {}, fallbackStock = 0) => {
  const stockQuantity = Number(product.stock_quantity ?? product.stockQuantity ?? fallbackStock ?? 0)
  const threshold = Number(product.low_stock_threshold ?? product.lowStockThreshold ?? 5)
  const published = product.is_published ?? product.isPublished ?? true
  const archived = Boolean(product.is_archived ?? product.isArchived ?? false)

  if (archived) return 'Archived'
  if (published === false) return 'Draft'

  return getAvailabilityState(stockQuantity, threshold)
}

export const clampQuantityToStock = ({ product = {}, quantity = 1, minimumQuantity = 1 } = {}) => {
  const stockQuantity = Math.max(0, toNumber(product?.stock_quantity ?? product?.stockQuantity ?? 0, 0))
  const requestedQuantity = Number(quantity)

  if (!Number.isFinite(requestedQuantity)) {
    return stockQuantity > 0 ? Math.max(1, minimumQuantity) : 0
  }

  const lowerBound = Math.max(0, Number(minimumQuantity) || 0)
  if (stockQuantity <= 0) {
    return lowerBound > 0 ? 0 : 0
  }

  const nextValue = Math.max(lowerBound, Math.min(Math.floor(requestedQuantity), stockQuantity))
  return nextValue
}

export const buildInventoryAdjustment = ({ currentStock = 0, delta = 0, lowStockThreshold = 5, isPublished = true, isArchived = false } = {}) => {
  const previousStock = Math.max(0, toNumber(currentStock, 0))
  const adjustment = Number(delta)

  if (!Number.isInteger(adjustment)) {
    throw new TypeError('Inventory delta must be an integer.')
  }

  const nextStock = Math.max(0, previousStock + adjustment)
  const nextStatus = getInventoryStatus(
    {
      stock_quantity: nextStock,
      low_stock_threshold: lowStockThreshold,
      is_published: isPublished,
      is_archived: isArchived,
    },
    nextStock,
  )

  return {
    valid: true,
    previousStock,
    nextStock,
    nextStatus,
  }
}

export const normalizeProduct = (record = {}) => {
  const rawImages = Array.isArray(record.images) ? record.images.filter(Boolean) : []
  const stockQuantity = Math.max(0, toNumber(record.stock_quantity ?? record.stockQuantity, 0))
  const lowStockThreshold = Math.max(0, toNumber(record.low_stock_threshold ?? record.lowStockThreshold, 5))
  const sellingPrice = toNumber(record.selling_price ?? record.price ?? record.sellingPrice, 0)
  const markedPrice = toNumber(record.marked_price ?? record.markedPrice, 0)
  const published = Boolean(record.is_published ?? record.isPublished ?? true)
  const archived = Boolean(record.is_archived ?? record.isArchived ?? false)
  const availability = getAvailabilityState(stockQuantity, lowStockThreshold)
  const status = getInventoryStatus({
    ...record,
    stock_quantity: stockQuantity,
    low_stock_threshold: lowStockThreshold,
    is_published: published,
    is_archived: archived,
  }, stockQuantity)

  return {
    id: String(record.id ?? record.uuid ?? record.slug ?? `product-${Date.now()}`),
    name: String(record.name ?? 'Unnamed product').trim() || 'Unnamed product',
    slug: String(record.slug ?? createSlug(record.name ?? 'product')).trim() || createSlug(record.name ?? 'product'),
    category: String(record.category ?? 'Handbags').trim() || 'Handbags',
    sku: String(record.sku ?? record.product_code ?? '').trim(),
    brand: String(record.brand ?? '').trim(),
    markedPrice: markedPrice > 0 ? markedPrice : 0,
    price: sellingPrice,
    sellingPrice,
    description: String(record.description ?? '').trim(),
    images: rawImages.length ? rawImages : [],
    primaryImage: String(record.primary_image ?? record.primaryImage ?? rawImages[0] ?? '').trim(),
    stockQuantity,
    lowStockThreshold,
    availability,
    status,
    featured: Boolean(record.featured),
    isNew: Boolean(record.is_new ?? record.isNew),
    isPublished: published && !archived,
    is_archived: archived,
    createdAt: record.created_at ?? record.createdAt ?? new Date().toISOString(),
    updatedAt: record.updated_at ?? record.updatedAt ?? record.created_at ?? new Date().toISOString(),
  }
}

export const validateProductDraft = (draft = {}, existingProducts = []) => {
  const trimmedName = String(draft.name ?? '').trim()
  const category = String(draft.category ?? '').trim()
  const description = String(draft.description ?? '').trim()
  const sellingPrice = Number(draft.price ?? draft.sellingPrice ?? 0)
  const markedPrice = Number(draft.markedPrice ?? 0)
  const stockQuantity = Number(draft.stockQuantity ?? 0)
  const lowStockThreshold = Number(draft.lowStockThreshold ?? 0)
  const normalizedSku = String(draft.sku ?? '').trim()

  if (!trimmedName) return { valid: false, message: 'Product name is required.' }
  if (!category) return { valid: false, message: 'Please choose a category.' }
  if (!description) return { valid: false, message: 'Product description is required.' }
  if (!Number.isFinite(sellingPrice) || sellingPrice <= 0) return { valid: false, message: 'Selling price must be greater than zero.' }
  if (markedPrice > 0 && sellingPrice <= 0) return { valid: false, message: 'Marked price must be greater than the selling price when used.' }
  if (!Number.isInteger(stockQuantity) || stockQuantity < 0) return { valid: false, message: 'Initial stock must be a non-negative whole number.' }
  if (!Number.isInteger(lowStockThreshold) || lowStockThreshold < 0) return { valid: false, message: 'Low-stock threshold must be a non-negative whole number.' }
  if (markedPrice > 0 && markedPrice < sellingPrice) return { valid: false, message: 'Marked price should be greater than the selling price for a valid discount.' }
  if (markedPrice < 0 || sellingPrice < 0) return { valid: false, message: 'Prices cannot be negative.' }
  if (!Array.isArray(draft.images) || draft.images.every((image) => !image)) {
    return { valid: false, message: 'Add at least one product image or a placeholder image before saving.' }
  }

  const duplicate = existingProducts.some((product) => {
    const currentProductId = String(product.id ?? '')
    const currentSku = String(product.sku ?? '').trim().toLowerCase()
    const draftSku = normalizedSku.toLowerCase()
    return String(draft.id ?? '') !== currentProductId && draftSku && currentSku && currentSku === draftSku
  })

  if (duplicate) {
    return { valid: false, message: 'This SKU already exists. Please use a unique product code.' }
  }

  return { valid: true, message: 'Product validation passed.' }
}

export const fetchCatalogData = async () => {
  if (!supabase) {
    return {
      categories: fallbackCategories,
      products: fallbackProducts,
    }
  }

  try {
    const [{ data: categoriesData, error: categoryError }, { data: productsData, error: productError }] = await Promise.all([
      supabase.from('catalog_categories').select('*').order('sort_order', { ascending: true }),
      supabase.from('catalog_products').select('*').order('created_at', { ascending: false }),
    ])

    if (categoryError || productError) {
      return {
        categories: fallbackCategories,
        products: fallbackProducts,
      }
    }

    return {
      categories: (categoriesData ?? []).map(normalizeCategory),
      products: (productsData ?? []).map(normalizeProduct),
    }
  } catch (error) {
    console.warn('Supabase catalog unavailable; using storefront fallback.', error)
    return {
      categories: fallbackCategories,
      products: fallbackProducts,
    }
  }
}

export const saveCategoryRecord = async ({ name, slug }) => {
  if (!supabase) {
    return null
  }

  const trimmedName = String(name ?? '').trim()
  const trimmedSlug = String(slug ?? '').trim() || createSlug(trimmedName)

  if (!trimmedName || !trimmedSlug) {
    return null
  }

  const { data, error } = await supabase
    .from('catalog_categories')
    .upsert({ name: trimmedName, slug: trimmedSlug }, { onConflict: 'slug' })
    .select()
    .single()

  if (error) {
    console.error('Unable to save category:', error)
    return null
  }

  return normalizeCategory(data)
}

export const resolveStoredImagePath = (imageUrl = '') => {
  if (!imageUrl) return null

  try {
    const normalizedUrl = String(imageUrl).trim()
    const url = new URL(normalizedUrl)
    const pathParts = url.pathname.split('/').filter(Boolean)
    const bucketIndex = pathParts.indexOf(PRODUCT_IMAGE_BUCKET)

    if (bucketIndex >= 0) {
      return decodeURIComponent(pathParts.slice(bucketIndex + 1).join('/'))
    }

    return decodeURIComponent(pathParts.slice(1).join('/'))
  } catch {
    return null
  }
}

export const getReferencedStorageUrls = (products = [], ignoredProductId = null) => {
  const referenced = new Set()

  for (const product of Array.isArray(products) ? products : []) {
    if (ignoredProductId != null && String(product.id) === String(ignoredProductId)) {
      continue
    }

    const imageUrls = [
      ...(Array.isArray(product.images) ? product.images : []),
      product.primary_image ?? product.primaryImage ?? '',
    ].filter(Boolean)

    for (const imageUrl of imageUrls) {
      referenced.add(String(imageUrl).trim())
    }
  }

  return [...referenced].filter(Boolean)
}

export const filterUnusedStorageUrls = (imageUrls = [], products = [], ignoredProductId = null) => {
  const referenced = new Set(getReferencedStorageUrls(products, ignoredProductId))
  const uniqueUrls = [...new Set((Array.isArray(imageUrls) ? imageUrls : [imageUrls]).filter(Boolean).map((imageUrl) => String(imageUrl).trim()))]

  return uniqueUrls.filter((imageUrl) => !referenced.has(imageUrl))
}

export const deleteStorageImageFiles = async (imageUrls = [], { productId = null, productRecords = null } = {}) => {
  if (!supabase) return []

  const uniqueUrls = [...new Set((Array.isArray(imageUrls) ? imageUrls : [imageUrls]).filter(Boolean).map((imageUrl) => String(imageUrl).trim()))]
  if (!uniqueUrls.length) return []

  let knownProducts = productRecords
  if (!knownProducts && supabase) {
    const { data, error } = await supabase.from('catalog_products').select('id, images, primary_image, primaryImage')
    if (!error) {
      knownProducts = data ?? []
    }
  }

  const removableUrls = filterUnusedStorageUrls(uniqueUrls, knownProducts ?? [], productId)
  const uniquePaths = [...new Set(removableUrls.map(resolveStoredImagePath).filter(Boolean))]
  if (!uniquePaths.length) return []

  const { error } = await supabase.storage.from(PRODUCT_IMAGE_BUCKET).remove(uniquePaths)
  if (error) {
    console.warn('Unable to remove product image files from storage.', error)
  }

  return uniquePaths
}

export const uploadProductImages = async ({ files, productId = null }) => {
  if (!supabase) {
    throw new Error('Supabase is not configured for image uploads.')
  }

  const imageFiles = Array.isArray(files) ? files.filter((file) => isSupportedImageFile(file)) : []

  if (!imageFiles.length) {
    return []
  }

  const invalidFile = imageFiles.find((file) => file.size > PRODUCT_IMAGE_MAX_BYTES)
  if (invalidFile) {
    throw new Error('Each image must be 5MB or smaller.')
  }

  const uploadedUrls = []

  try {
    for (const file of imageFiles) {
      const timeStamp = Date.now() + Math.random().toString(36).slice(2, 8)
      const safeName = String(file.name || 'product-image').replace(/[^a-zA-Z0-9._-]/g, '-').slice(0, 80)
      const folderPath = productId ? `${productId}/${timeStamp}-${safeName}` : `uploads/${timeStamp}-${safeName}`

      const { data, error } = await supabase.storage
        .from(PRODUCT_IMAGE_BUCKET)
        .upload(folderPath, file, {
          cacheControl: '3600',
          upsert: false,
        })

      if (error) {
        const message = String(error.message || '')
        if (message.toLowerCase().includes('bucket') || message.toLowerCase().includes('not found')) {
          throw new Error('The product-images storage bucket is missing. Apply the storage migration in Supabase Dashboard or create the bucket manually.')
        }
        throw new Error(`Image upload failed: ${error.message || 'Unknown upload error.'}`)
      }

      const { data: publicUrlData } = supabase.storage.from(PRODUCT_IMAGE_BUCKET).getPublicUrl(data.path)
      uploadedUrls.push(publicUrlData.publicUrl)
    }

    return uploadedUrls
  } catch (error) {
    if (uploadedUrls.length) {
      await deleteStorageImageFiles(uploadedUrls)
    }
    throw error
  }
}

export const buildProductSavePayload = (product = {}) => {
  const rawImages = Array.isArray(product.images) ? product.images.filter(Boolean) : []
  const sellingPrice = toNumber(product.sellingPrice ?? product.price ?? product.selling_price, 0)
  const markedPrice = toNumber(product.markedPrice ?? product.marked_price, 0)
  const stockQuantity = Number.isInteger(Number(product.stockQuantity ?? product.stock_quantity))
    ? Number(product.stockQuantity ?? product.stock_quantity)
    : 0
  const lowStockThreshold = Number.isInteger(Number(product.lowStockThreshold ?? product.low_stock_threshold))
    ? Number(product.lowStockThreshold ?? product.low_stock_threshold)
    : 5

  const availability = getAvailabilityState(stockQuantity, lowStockThreshold)
  const status = getInventoryStatus({
    is_published: Boolean(product.isPublished ?? product.is_published ?? true),
    stock_quantity: stockQuantity,
    low_stock_threshold: lowStockThreshold,
    is_archived: Boolean(product.is_archived ?? product.isArchived ?? false),
  }, stockQuantity)

  const normalizedProduct = {
    ...product,
    name: String(product.name ?? '').trim(),
    slug: String(product.slug ?? '').trim() || createSlug(product.name ?? 'product'),
    category: String(product.category ?? 'Handbags').trim() || 'Handbags',
    sku: String(product.sku ?? '').trim(),
    brand: String(product.brand ?? '').trim(),
    price: sellingPrice,
    marked_price: markedPrice > 0 ? markedPrice : null,
    markedPrice: markedPrice > 0 ? markedPrice : 0,
    description: String(product.description ?? '').trim(),
    images: rawImages,
    primary_image: String(product.primaryImage || rawImages[0] || '').trim() || null,
    primaryImage: String(product.primaryImage || rawImages[0] || '').trim() || null,
    availability,
    status,
    featured: Boolean(product.featured),
    is_new: Boolean(product.isNew ?? product.is_new),
    is_published: Boolean(product.isPublished ?? product.is_published ?? true),
    is_archived: Boolean(product.is_archived ?? product.isArchived ?? false),
    stock_quantity: Math.max(0, stockQuantity),
    stockQuantity: Math.max(0, stockQuantity),
    low_stock_threshold: Math.max(0, lowStockThreshold),
    lowStockThreshold: Math.max(0, lowStockThreshold),
    created_at: product.createdAt ?? new Date().toISOString(),
  }

  return {
    id: product.id != null && product.id !== '' ? Number(product.id) : undefined,
    name: normalizedProduct.name,
    slug: normalizedProduct.slug,
    category: normalizedProduct.category,
    sku: normalizedProduct.sku || null,
    brand: normalizedProduct.brand || null,
    price: normalizedProduct.price,
    marked_price: normalizedProduct.marked_price,
    description: normalizedProduct.description,
    images: normalizedProduct.images,
    primary_image: normalizedProduct.primary_image,
    availability: normalizedProduct.availability,
    status: normalizedProduct.status,
    featured: normalizedProduct.featured,
    is_new: normalizedProduct.is_new,
    is_published: normalizedProduct.is_published,
    is_archived: normalizedProduct.is_archived,
    stock_quantity: normalizedProduct.stock_quantity,
    low_stock_threshold: normalizedProduct.low_stock_threshold,
    updated_at: new Date().toISOString(),
  }
}

export const saveProductRecord = async (product) => {
  if (!supabase) {
    return null
  }

  const payload = buildProductSavePayload(product)

  const { data, error } = await supabase
    .from('catalog_products')
    .upsert(payload, { onConflict: 'id' })
    .select()
    .single()

  if (error) {
    console.error('Unable to save product:', error)
    return null
  }

  return normalizeProduct(data)
}

export const archiveProductRecord = async (productId) => {
  if (!supabase || !productId) return false

  const { error } = await supabase
    .from('catalog_products')
    .update({
      is_archived: true,
      is_published: false,
      status: 'Archived',
      updated_at: new Date().toISOString(),
    })
    .eq('id', productId)

  if (error) {
    console.error('Unable to archive product:', error)
    return false
  }

  return true
}

export const updateProductInventory = async ({ productId, delta, reason = 'Manual stock adjustment' }) => {
  if (!supabase || !productId) {
    return null
  }

  const adjustment = Number(delta)
  if (!Number.isInteger(adjustment)) {
    return null
  }

  try {
    const { data, error } = await supabase.rpc('adjust_product_inventory', {
      p_product_id: Number(productId),
      p_delta: adjustment,
      p_reason: String(reason || 'Manual stock adjustment').trim() || 'Manual stock adjustment',
    })

    if (error || !data) {
      console.error('Unable to update inventory:', error)
      return null
    }

    return normalizeProduct(data)
  } catch (error) {
    console.error('Inventory adjustment failed:', error)
    return null
  }
}

export const deleteProductRecord = async (productId) => {
  if (!supabase) {
    return false
  }

  try {
    const { data: existingProduct, error: fetchError } = await supabase
      .from('catalog_products')
      .select('id, images, primary_image, primaryImage')
      .eq('id', productId)
      .single()

    const { data: remainingProducts } = await supabase
      .from('catalog_products')
      .select('id, images, primary_image, primaryImage')
      .neq('id', productId)

    const imageUrls = Array.isArray(existingProduct?.images) ? existingProduct.images.filter(Boolean) : []
    const primaryImage = existingProduct?.primary_image ? [existingProduct.primary_image] : []
    const cleanupTargets = [...new Set([...imageUrls, ...primaryImage])]

    if (!fetchError && existingProduct) {
      await deleteStorageImageFiles(cleanupTargets, { productId, productRecords: remainingProducts ?? [] })
    }

    const { error } = await supabase.from('catalog_products').delete().eq('id', productId)

    if (error) {
      console.error('Unable to delete product:', error)
      return false
    }

    return true
  } catch (error) {
    console.error('Unable to delete product and clean up images:', error)
    return false
  }
}

export const reassignProductsForCategory = async ({ categoryName, replacementCategory = 'Handbags' } = {}) => {
  if (!supabase || !categoryName) {
    return true
  }

  const safeReplacement = String(replacementCategory || 'Handbags').trim() || 'Handbags'

  const { error } = await supabase
    .from('catalog_products')
    .update({ category: safeReplacement, updated_at: new Date().toISOString() })
    .eq('category', categoryName)

  if (error) {
    console.error('Unable to reassign products before category deletion:', error)
    return false
  }

  return true
}

export const deleteCategoryRecord = async (categoryId, { fallbackCategory = 'Handbags', categoryName = '' } = {}) => {
  if (!supabase) {
    return false
  }

  try {
    const resolvedCategoryName = String(categoryName || '').trim()

    if (resolvedCategoryName) {
      const reassigned = await reassignProductsForCategory({
        categoryName: resolvedCategoryName,
        replacementCategory: fallbackCategory,
      })
      if (!reassigned) return false
    } else {
      const { data: existingCategory, error: fetchError } = await supabase
        .from('catalog_categories')
        .select('id, name')
        .eq('id', categoryId)
        .single()

      if (!fetchError && existingCategory?.name) {
        const reassigned = await reassignProductsForCategory({
          categoryName: existingCategory.name,
          replacementCategory: fallbackCategory,
        })
        if (!reassigned) return false
      }
    }

    const { error } = await supabase.from('catalog_categories').delete().eq('id', categoryId)

    if (error) {
      console.error('Unable to delete category:', error)
      return false
    }

    return true
  } catch (error) {
    console.error('Unable to delete category and reassign products:', error)
    return false
  }
}

