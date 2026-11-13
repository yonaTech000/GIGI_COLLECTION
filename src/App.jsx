import { useEffect, useMemo, useRef, useState } from 'react'
import './App.css'
import {
  clearPrototypeAccounts,
  getCurrentSession,
  isAuthorizedAdminSession,
  isDeveloperSession,
  resendCustomerConfirmationEmail,
  signInWithUsernameOrPhone,
  signOutPrototype,
  signUpCustomer,
} from './config/auth'
import {
  authLoginRoute,
  authOtpRoute,
  authSignupRoute,
  hiddenDashboardRoute,
  isPublicAuthRoute,
} from './config/navigation'
import { BUSINESS_WHATSAPP_NUMBER, createCartWhatsAppLink, createWhatsAppLink } from './config/whatsapp'
import {
  archiveProductRecord,
  calculateDiscountPercent,
  clampQuantityToStock,
  deleteCategoryRecord,
  deleteProductRecord,
  deleteStorageImageFiles,
  fetchCatalogData,
  isSupportedImageFile,
  saveCategoryRecord,
  saveProductRecord,
  uploadProductImages,
  updateProductInventory,
  validateProductDraft,
} from './config/catalog'
import { categoryOptions as seedCategoryOptions, products as seedProducts } from './data/products'

const CART_KEY = 'gigi_cart_v1'
const CURRENT_YEAR = new Date().getFullYear()

const localImageLibrary = {
  hero: [
    {
      src: '/img/Gemini_Generated_Image_bun5zkbun5zkbun5.jpeg',
      alt: 'Soccer jersey styling with handbag accessory',
      title: 'Luxury match-day styling',
    },
    {
      src: '/img/Gemini_Generated_Image_n6m24jn6m24jn6m2.jpeg',
      alt: 'White club jersey and bag fashion look',
      title: 'Statement essentials',
    },
    {
      src: '/img/Gemini_Generated_Image_xl32vkxl32vkxl32.jpeg',
      alt: 'Green football jersey with scarf and accessories',
      title: 'Boutique football fashion',
    },
  ],
  categories: {
    Handbags: '/img/photo-1483985988355-763728e1935b.avif',
    'Soccer Jerseys': '/img/Gemini_Generated_Image_1yzafi1yzafi1yza.jpeg',
    Clothing: '/img/Gemini_Generated_Image_bun5zkbun5zkbun5.jpeg',
    Accessories: '/img/Gemini_Generated_Image_qtud6kqtud6kqtud.jpeg',
    Shoes: '/img/IMG-20261023-WA0015.jpg',
    'Fashion Collections': '/img/Gemini_Generated_Image_n6m24jn6m24jn6m2.jpeg',
    All: '/img/IMG-20261023-WA0015.jpg',
  },
  productFallbacks: [
    '/img/Gemini_Generated_Image_bun5zkbun5zkbun5.jpeg',
    '/img/Gemini_Generated_Image_n6m24jn6m24jn6m2.jpeg',
    '/img/Gemini_Generated_Image_qtud6kqtud6kqtud.jpeg',
    '/img/Gemini_Generated_Image_xl32vkxl32vkxl32.jpeg',
    '/img/IMG-20261023-WA0015.jpg',
    '/img/photo-1483985988355-763728e1935b.avif',
  ],
}

const heroSlides = localImageLibrary.hero

const getCategoryImage = (categoryLabel = '') => localImageLibrary.categories[categoryLabel] || localImageLibrary.categories.All

const getFallbackProductImage = (index = 0) => localImageLibrary.productFallbacks[index % localImageLibrary.productFallbacks.length]

const defaultSettings = {
  businessName: 'GIGI COLLECTION',
  businessDescription: 'Curated fashion essentials and boutique updates coming soon.',
  whatsappNumber: BUSINESS_WHATSAPP_NUMBER,
  contactEmail: 'Contact details will be added soon.',
  instagram: 'Instagram details will be added soon.',
  facebook: 'Facebook details will be added soon.',
  promotionalCopy: 'Curated essentials for elevated everyday style and standout moments.',
}

const EMPTY_PRODUCT_DRAFT = {
  id: null,
  name: '',
  slug: '',
  category: 'Handbags',
  sku: '',
  brand: '',
  markedPrice: '',
  price: '',
  description: '',
  images: [],
  primaryImage: '',
  stockQuantity: '0',
  lowStockThreshold: '5',
  availability: 'In stock',
  status: 'In stock',
  isPublished: true,
  featured: false,
  isNew: false,
  pendingFiles: [],
  createdAt: '',
}

const formatPrice = (value) => `KES ${Number(value || 0).toLocaleString('en-KE')}`
const buildTimestamp = () => new Date().toISOString()

const createSlug = (value) =>
  String(value || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')

const getRouteFromPath = () => {
  if (typeof window === 'undefined') return '/'
  const path = window.location.pathname
  if (path === hiddenDashboardRoute || path === `${hiddenDashboardRoute}/`) return hiddenDashboardRoute
  if (path.startsWith(`${hiddenDashboardRoute}/`)) return path
  return '/'
}

const resolvePostLoginRoute = (session) => {
  if (!session) return '/'
  return isAuthorizedAdminSession(session) ? `${hiddenDashboardRoute}/overview` : '/'
}

const readCart = () => {
  if (typeof window === 'undefined') return []
  try {
    return JSON.parse(window.localStorage.getItem(CART_KEY) || '[]')
  } catch {
    return []
  }
}

const saveCart = (items) => {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(CART_KEY, JSON.stringify(items))
}

const getAvailabilityLabel = (product) => {
  const stock = Number(product?.stockQuantity ?? product?.stock_quantity ?? 0)
  const threshold = Number(product?.lowStockThreshold ?? product?.low_stock_threshold ?? 0)
  const published = product?.isPublished ?? product?.is_published ?? true

  if (!published) return 'Draft'
  if (stock <= 0) return 'Sold out'
  if (threshold > 0 && stock <= threshold) return 'Low stock'
  return 'In stock'
}

const getProductStockLimit = (product) => Math.max(0, Number(product?.stockQuantity ?? product?.stock_quantity ?? 0))

function App() {
  const [route, setRoute] = useState(getRouteFromPath)
  const [session, setSession] = useState(null)
  const [catalogProducts, setCatalogProducts] = useState(seedProducts)
  const [catalogCategories, setCatalogCategories] = useState(seedCategoryOptions)
  const [dashboardView, setDashboardView] = useState('overview')
  const [cart, setCart] = useState(() => readCart())
  const [cartOpen, setCartOpen] = useState(false)
  const [toast, setToast] = useState('')
  const [selectedProduct, setSelectedProduct] = useState(null)
  const [selectedQuantity, setSelectedQuantity] = useState(1)
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('All')
  const [availabilityFilter, setAvailabilityFilter] = useState('all')
  const [sortOrder, setSortOrder] = useState('featured')
  const [storeSettings, setStoreSettings] = useState(defaultSettings)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [activeHeroSlide, setActiveHeroSlide] = useState(0)
  const [scrollProgress, setScrollProgress] = useState(0)

  const [loginForm, setLoginForm] = useState({ username: '', password: '', remember: false })
  const [loginError, setLoginError] = useState('')
  const [isSubmittingLogin, setIsSubmittingLogin] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  const [signupForm, setSignupForm] = useState({ fullName: '', email: '', phone: '', password: '', confirmPassword: '' })
  const [signupError, setSignupError] = useState('')
  const [signupMessage, setSignupMessage] = useState('')
  const [isSubmittingSignup, setIsSubmittingSignup] = useState(false)
  const [isResendingConfirmation, setIsResendingConfirmation] = useState(false)

  const [productDraft, setProductDraft] = useState({ ...EMPTY_PRODUCT_DRAFT })
  const [categoryDraft, setCategoryDraft] = useState({ id: '', name: '' })
  const [query, setQuery] = useState('')
  const [uploadStatus, setUploadStatus] = useState('')
  const [uploadingImages, setUploadingImages] = useState(false)
  const [inventoryDraft, setInventoryDraft] = useState({ productId: '', quantity: '', reason: 'Manual stock adjustment' })

  const productInputRef = useRef(null)
  const developerOnly = isDeveloperSession(session)

  useEffect(() => { saveCart(cart) }, [cart])

  useEffect(() => {
    const handlePopState = () => setRoute(getRouteFromPath())
    if (typeof window !== 'undefined') {
      window.addEventListener('popstate', handlePopState)
      return () => window.removeEventListener('popstate', handlePopState)
    }
  }, [])

  useEffect(() => {
    let mounted = true
    const loadSession = async () => {
      const activeSession = await getCurrentSession()
      if (mounted) setSession(activeSession)
    }
    loadSession()
    return () => { mounted = false }
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return

    const params = new URLSearchParams(window.location.search)
    const confirmed = params.get('confirmed') === '1'
    const errorCode = params.get('error_code') || params.get('error')
    const errorDescription = params.get('error_description') || params.get('message')

    if (confirmed) {
      setLoginError('Your email has been confirmed. You can now sign in with your email and password.')
      const nextUrl = new URL(window.location.href)
      nextUrl.searchParams.delete('confirmed')
      window.history.replaceState({}, '', `${nextUrl.pathname}${nextUrl.search}`)
      return
    }

    if (errorCode || errorDescription) {
      setLoginError(errorDescription || 'The confirmation link is invalid or has expired. Request a new confirmation email.')
      const nextUrl = new URL(window.location.href)
      nextUrl.searchParams.delete('error')
      nextUrl.searchParams.delete('error_code')
      nextUrl.searchParams.delete('error_description')
      nextUrl.searchParams.delete('message')
      window.history.replaceState({}, '', `${nextUrl.pathname}${nextUrl.search}`)
    }
  }, [])

  useEffect(() => {
    const handleScroll = () => {
      const nextScrollY = window.scrollY || 0
      const documentHeight = document.documentElement.scrollHeight - window.innerHeight
      const nextProgress = documentHeight > 0 ? Math.min(nextScrollY / documentHeight, 1) : 0

      setScrollProgress(nextProgress)
    }

    handleScroll()
    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return undefined

    const mediaQuery = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null
    const prefersReducedMotion = mediaQuery?.matches ?? false

    if (prefersReducedMotion || heroSlides.length <= 1) return undefined

    const intervalId = window.setInterval(() => {
      setActiveHeroSlide((current) => (current + 1) % heroSlides.length)
    }, 5000)

    return () => window.clearInterval(intervalId)
  }, [])

  useEffect(() => {
    let mounted = true
    const loadCatalog = async () => {
      try {
        const { categories, products } = await fetchCatalogData()
        if (mounted) {
          setCatalogCategories(categories)
          setCatalogProducts(products)
        }
      } catch (error) {
        console.warn('Catalog unavailable, using fallback data.', error)
        if (mounted) {
          setCatalogCategories(seedCategoryOptions)
          setCatalogProducts(seedProducts)
        }
      }
    }
    loadCatalog()
    return () => { mounted = false }
  }, [])

  const navigateTo = (nextPath) => {
    setRoute(nextPath)
    setMobileMenuOpen(false)
    if (typeof window !== 'undefined') {
      window.history.pushState({}, '', nextPath)
    }
  }

  const closeMobileMenu = () => setMobileMenuOpen(false)

  const handleScrollToTop = () => {
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'smooth' })
    }
    if (route.startsWith(hiddenDashboardRoute)) {
      navigateTo('/')
    }
  }

  const featuredProducts = useMemo(
    () => catalogProducts.filter((product) => product.featured).slice(0, 4),
    [catalogProducts],
  )

  const newArrivals = useMemo(
    () => catalogProducts.filter((product) => product.isNew).slice(0, 4),
    [catalogProducts],
  )

  const filteredProducts = useMemo(() => {
    const queryText = searchTerm.trim().toLowerCase()
    const products = [...catalogProducts]
      .filter((product) => (product.isPublished ?? product.is_published ?? true) && !(product.is_archived ?? product.isArchived ?? false))
      .filter((product) => {
        const matchesCategory = selectedCategory === 'All' || product.category === selectedCategory
        const matchesSearch =
          queryText.length === 0 ||
          (product.name || '').toLowerCase().includes(queryText) ||
          (product.description || '').toLowerCase().includes(queryText) ||
          (product.category || '').toLowerCase().includes(queryText) ||
          (product.sku || '').toLowerCase().includes(queryText) ||
          (product.brand || '').toLowerCase().includes(queryText)
        const matchesAvailability = availabilityFilter === 'all' || getAvailabilityLabel(product) === availabilityFilter
        return matchesCategory && matchesSearch && matchesAvailability
      })

    switch (sortOrder) {
      case 'low-high':
        return products.sort((a, b) => Number(a.price || 0) - Number(b.price || 0))
      case 'high-low':
        return products.sort((a, b) => Number(b.price || 0) - Number(a.price || 0))
      case 'newest':
        return products.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())
      case 'name-asc':
        return products.sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')))
      default:
        return products.sort((a, b) => Number(b.featured) - Number(a.featured))
    }
  }, [availabilityFilter, catalogProducts, searchTerm, selectedCategory, sortOrder])

  const clearCatalogueFilters = () => {
    setSearchTerm('')
    setSelectedCategory('All')
    setAvailabilityFilter('all')
    setSortOrder('featured')
  }

  const cartItems = useMemo(
    () =>
      cart
        .map((item) => {
          const product = catalogProducts.find((entry) => entry.id === item.productId)
          return product ? { ...item, product } : null
        })
        .filter(Boolean),
    [cart, catalogProducts],
  )

  const cartSubtotal = useMemo(
    () => cartItems.reduce((sum, item) => sum + Number(item.product.price || 0) * item.quantity, 0),
    [cartItems],
  )

  const overviewStats = useMemo(
    () => ({
      totalProducts: catalogProducts.length,
      availableProducts: catalogProducts.filter((product) => getAvailabilityLabel(product) !== 'Sold out').length,
      outOfStockProducts: catalogProducts.filter((product) => getAvailabilityLabel(product) === 'Sold out').length,
      totalCategories: catalogCategories.length,
    }),
    [catalogCategories, catalogProducts],
  )

  const handleLoginSubmit = async (event) => {
    event.preventDefault()
    setLoginError('')
    setIsSubmittingLogin(true)
    const result = await signInWithUsernameOrPhone({ username: loginForm.username, password: loginForm.password })
    setIsSubmittingLogin(false)

    if (!result.success) {
      setLoginError(result.message)
      return
    }

    setSession(result.session)
    setLoginForm({ username: '', password: '', remember: false })
    const nextRoute = resolvePostLoginRoute(result.session)
    navigateTo(nextRoute)
    setDashboardView('overview')
  }

  const handleSignupSubmit = async (event) => {
    event.preventDefault()
    setSignupError('')
    setSignupMessage('')

    const name = signupForm.fullName.trim()
    const email = signupForm.email.trim()
    const phone = signupForm.phone.trim()

    if (!name) return setSignupError('Please enter your full name.')
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return setSignupError('Please enter a valid email address.')
    if (!phone) return setSignupError('Please add a phone number.')
    if (!signupForm.password || signupForm.password.length < 8) return setSignupError('Password must be at least 8 characters long.')
    if (signupForm.password !== signupForm.confirmPassword) return setSignupError('Passwords do not match.')

    setIsSubmittingSignup(true)
    const result = await signUpCustomer({
      fullName: name,
      email,
      phone,
      username: signupForm.email.split('@')[0].trim() || name.trim().replace(/\s+/g, '').toLowerCase(),
      password: signupForm.password,
      confirmPassword: signupForm.confirmPassword,
    })
    setIsSubmittingSignup(false)

    if (!result.success) {
      setSignupError(result.message)
      return
    }

    setSignupMessage(result.message)
    setSignupError('')
  }

  const handleResendConfirmation = async () => {
    setSignupError('')
    setSignupMessage('')
    setIsResendingConfirmation(true)
    const result = await resendCustomerConfirmationEmail({ email: signupForm.email })
    setIsResendingConfirmation(false)

    if (!result.success) {
      setSignupError(result.message)
      return
    }

    setSignupMessage(result.message)
  }

  const handleLogout = async () => {
    const result = await signOutPrototype()
    if (result?.success === false) setToast(result.message || 'Unable to sign out.')
    setSession(null)
    if (typeof window !== 'undefined') {
      window.history.pushState({}, '', authLoginRoute)
    }
    setRoute(authLoginRoute)
    navigateTo(authLoginRoute)
  }

  const handleCreateCategoryFromProduct = async () => {
    const name = window.prompt('Enter a new category name for this product:', categoryDraft.name.trim() || '')
    const trimmedName = String(name ?? '').trim()

    if (!trimmedName) return

    const saved = await saveCategoryRecord({ name: trimmedName, slug: createSlug(trimmedName) })
    if (!saved) {
      setToast('Category save failed. Please verify the database permissions and category data.')
      return
    }

    setCatalogCategories((current) => {
      const exists = current.some((item) => item.label.toLowerCase() === trimmedName.toLowerCase())
      return exists ? current : [...current, saved]
    })
    setCategoryDraft({ id: createSlug(trimmedName), name: trimmedName })
    setProductDraft((current) => ({ ...current, category: saved.label }))
    setToast(`Category created: ${saved.label}`)
  }

  const handleAddCategory = async () => {
    const name = categoryDraft.name.trim()
    if (!name) return setToast('Add a category name first.')

    const saved = await saveCategoryRecord({ name, slug: createSlug(name) })
    if (!saved) {
      setToast('Category save failed. Please verify the database permissions and category data.')
      return
    }

    setCatalogCategories((current) => {
      const exists = current.some((item) => item.label.toLowerCase() === name.toLowerCase())
      return exists ? current : [...current, saved]
    })
    setCategoryDraft({ id: '', name: '' })
    setToast('Category saved.')
  }

  const handleDeleteCategory = async (categoryId) => {
    const category = catalogCategories.find((entry) => entry.id === categoryId)
    if (!category) return

    const ok = window.confirm(`Remove ${category.label}? This will reassign all products in that category to Handbags before the category is deleted.`)
    if (!ok) return

    const success = await deleteCategoryRecord(categoryId, {
      fallbackCategory: 'Handbags',
      categoryName: category.label,
    })

    if (!success) {
      setToast('Category delete failed. Please verify the category and row-level permissions.')
      return
    }

    setCatalogCategories((current) => current.filter((entry) => entry.id !== categoryId))
    setCatalogProducts((current) =>
      current.map((product) =>
        product.category === category.label ? { ...product, category: 'Handbags' } : product,
      ),
    )
    setToast('Category removed from the catalogue and reassigned in the database.')
  }

  const handleSaveProduct = async () => {
    const validation = validateProductDraft(productDraft, catalogProducts)
    if (!validation.valid) {
      setToast(validation.message)
      return
    }

    try {
      const existingRemoteImages = (productDraft.images || []).filter((image) => image && !String(image).startsWith('blob:'))
      const pendingFiles = Array.isArray(productDraft.pendingFiles) ? productDraft.pendingFiles.filter((entry) => entry && entry.file) : []
      const uploadedImageUrls = pendingFiles.length
        ? await uploadProductImages({ files: pendingFiles.map((entry) => entry.file), productId: productDraft.id || undefined })
        : []
      const finalImages = [...new Set([...existingRemoteImages, ...uploadedImageUrls])]
      const removedImages = existingRemoteImages.filter((image) => !finalImages.includes(image))
      const trimmedName = productDraft.name.trim()
      const sellingPrice = Number(productDraft.price || 0)
      const markedPrice = Number(productDraft.markedPrice || 0)
      const stockQuantity = Number(productDraft.stockQuantity || 0)
      const lowStockThreshold = Number(productDraft.lowStockThreshold || 0)
      const normalizedSku = (productDraft.sku || createSlug(trimmedName)).trim()
      const nextProduct = {
        ...productDraft,
        id: productDraft.id ?? Date.now(),
        name: trimmedName,
        slug: productDraft.slug || createSlug(trimmedName),
        sku: normalizedSku,
        brand: (productDraft.brand || '').trim(),
        price: sellingPrice,
        sellingPrice,
        markedPrice: markedPrice > 0 ? markedPrice : 0,
        stockQuantity,
        lowStockThreshold,
        availability: stockQuantity <= 0 ? 'Sold out' : stockQuantity <= lowStockThreshold ? 'Low stock' : 'In stock',
        status: productDraft.isPublished === false ? 'Draft' : stockQuantity <= 0 ? 'Sold out' : stockQuantity <= lowStockThreshold ? 'Low stock' : 'In stock',
        isPublished: productDraft.isPublished !== false,
        featured: Boolean(productDraft.featured),
        isNew: Boolean(productDraft.isNew),
        images: finalImages,
        primaryImage: finalImages.includes(productDraft.primaryImage) ? productDraft.primaryImage : finalImages[0] || '',
        createdAt: productDraft.createdAt || buildTimestamp(),
      }

      const persisted = await saveProductRecord(nextProduct)
      if (!persisted) {
        if (uploadedImageUrls.length) {
          await deleteStorageImageFiles(uploadedImageUrls)
        }
        setUploadStatus('')
        setToast('Product save failed. The database did not confirm the record was saved.')
        return
      }

      if (removedImages.length) {
        await deleteStorageImageFiles(removedImages, { productId: persisted?.id ?? productDraft.id ?? null, productRecords: catalogProducts })
      }

      setCatalogProducts((current) => {
        const exists = current.some((product) => String(product.id) === String(persisted.id))
        return exists ? current.map((product) => (String(product.id) === String(persisted.id) ? persisted : product)) : [persisted, ...current]
      })

      setProductDraft({ ...EMPTY_PRODUCT_DRAFT, category: catalogCategories[0]?.label || 'Handbags', pendingFiles: [] })
      setUploadStatus('Product saved to the database.')
      setToast('Product saved successfully.')
    } catch (error) {
      console.error('Product save failed:', error)
      setUploadStatus('')
      setToast(error.message || 'Product save failed. Please check the upload setup and permissions.')
    }
  }

  const handleEditProduct = (product) => {
    setProductDraft({
      id: product.id,
      name: product.name,
      slug: product.slug,
      category: product.category,
      sku: product.sku || '',
      brand: product.brand || '',
      markedPrice: String(product.markedPrice || ''),
      price: String(product.price || ''),
      description: product.description || '',
      images: Array.isArray(product.images) ? product.images.filter(Boolean) : [],
      primaryImage: product.primaryImage || '',
      stockQuantity: String(product.stockQuantity || 0),
      lowStockThreshold: String(product.lowStockThreshold || 5),
      availability: product.availability || 'In stock',
      status: product.status || 'In stock',
      isPublished: product.isPublished !== false,
      featured: Boolean(product.featured),
      isNew: Boolean(product.isNew),
      pendingFiles: [],
      createdAt: product.createdAt || buildTimestamp(),
    })
    setDashboardView('products')
  }

  const handleArchiveProduct = async (productId) => {
    const product = catalogProducts.find((entry) => String(entry.id) === String(productId))
    if (!product) return
    const ok = window.confirm(`Archive ${product.name}? It will be hidden from the public storefront until restored.`)
    if (!ok) return

    const success = await archiveProductRecord(productId)
    if (!success) {
      setToast('Archive action failed. Please verify the product and permissions.')
      return
    }

    setCatalogProducts((current) => current.map((entry) => (String(entry.id) === String(productId) ? { ...entry, is_archived: true, isPublished: false, status: 'Archived', availability: entry.availability || 'In stock' } : entry)))
    setToast('Product archived successfully.')
  }

  const handleDeleteProduct = async (productId) => {
    const product = catalogProducts.find((entry) => String(entry.id) === String(productId))
    if (!product) return

    const ok = window.confirm(`Permanently delete ${product.name}? This cannot be undone and may break historical references if the product is still linked elsewhere.`)
    if (!ok) return

    const success = await deleteProductRecord(productId)
    if (!success) {
      setToast('Delete failed. Please verify the product and permissions.')
      return
    }

    setCatalogProducts((current) => current.filter((entry) => String(entry.id) !== String(productId)))
    setToast('Product deleted from the database.')
  }

  const handleImageSelection = async (event) => {
    const files = Array.from(event.target.files || [])
    if (!files.length) return

    const validFiles = files.filter((file) => isSupportedImageFile(file) && file.size <= 5 * 1024 * 1024)
    if (!validFiles.length) {
      setToast('Only supported image files under 5MB are allowed. PNG, JPG, JPEG, WEBP, AVIF and other browser-supported image formats are accepted.')
      event.target.value = ''
      return
    }

    setUploadingImages(true)
    setUploadStatus('Preparing image previews...')

    const pendingRecords = validFiles.map((file) => ({
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      file,
      previewUrl: URL.createObjectURL(file),
    }))
    const previews = pendingRecords.map((entry) => entry.previewUrl)

    setProductDraft((current) => ({
      ...current,
      images: [...(current.images || []), ...previews],
      pendingFiles: [...(current.pendingFiles || []), ...pendingRecords],
      primaryImage: current.primaryImage || previews[0] || '',
    }))

    setUploadStatus(`Added ${previews.length} image${previews.length === 1 ? '' : 's'} to the product preview.`)
    setUploadingImages(false)
    event.target.value = ''
  }

  const handleRemoveImage = (imageUrl) => {
    setProductDraft((current) => {
      const images = (current.images || []).filter((image) => image !== imageUrl)
      const pendingFiles = (current.pendingFiles || []).filter((entry) => entry.previewUrl !== imageUrl)
      return {
        ...current,
        images,
        pendingFiles,
        primaryImage: current.primaryImage === imageUrl ? images[0] || '' : current.primaryImage,
      }
    })
  }

  const handleReorderImage = (imageUrl, direction) => {
    setProductDraft((current) => {
      const images = [...(current.images || [])]
      const index = images.indexOf(imageUrl)
      if (index < 0) return current

      const targetIndex = index + direction
      if (targetIndex < 0 || targetIndex >= images.length) return current

      ;[images[index], images[targetIndex]] = [images[targetIndex], images[index]]
      return { ...current, images }
    })
  }

  const handleStockAdjustment = async () => {
    const productId = inventoryDraft.productId
    const adjustment = Number(inventoryDraft.quantity || 0)
    if (!productId) return setToast('Select a product before updating stock.')
    if (!Number.isInteger(adjustment) || adjustment === 0) return setToast('Use a whole-number stock change.')

    const updatedProduct = await updateProductInventory({ productId, delta: adjustment, reason: inventoryDraft.reason || 'Manual stock adjustment' })
    if (!updatedProduct) return setToast('Stock update failed. Please verify the product and permissions.')

    setCatalogProducts((current) =>
      current.map((product) => (product.id === updatedProduct.id ? updatedProduct : product)),
    )
    setInventoryDraft({ productId: '', quantity: '', reason: 'Manual stock adjustment' })
    setToast('Inventory adjusted successfully.')
  }

  const previewDiscount = useMemo(
    () => calculateDiscountPercent(productDraft.markedPrice, productDraft.price),
    [productDraft.markedPrice, productDraft.price],
  )

  const previewStatus = useMemo(() => {
    const stock = Number(productDraft.stockQuantity || 0)
    const threshold = Number(productDraft.lowStockThreshold || 0)
    if (productDraft.isPublished === false) return 'Draft'
    if (stock <= 0) return 'Sold out'
    if (threshold > 0 && stock <= threshold) return 'Low stock'
    return 'In stock'
  }, [productDraft.isPublished, productDraft.lowStockThreshold, productDraft.stockQuantity])

  const openProductDetails = (product) => {
    if (!product) return

    setSelectedProduct(product)
    setSelectedQuantity(clampQuantityToStock({ product, quantity: 1, minimumQuantity: 1 }))
  }

  const removeCartItem = (productId, variant) => {
    setCart((current) => current.filter((item) => !(item.productId === productId && item.variant === variant)))
    setToast('Item removed from your cart.')
  }

  const clearCart = () => {
    setCart([])
    setToast('Your cart has been cleared.')
  }

  const addToCart = (product, quantity = 1) => {
    if (!product) return

    const productStock = getProductStockLimit(product)
    if (productStock <= 0) {
      setToast(`${product.name} is sold out.`)
      return
    }

    const safeQuantity = clampQuantityToStock({ product, quantity, minimumQuantity: 1 })
    if (safeQuantity <= 0) {
      setToast(`${product.name} is sold out.`)
      return
    }

    setCart((current) => {
      const existing = current.find((item) => item.productId === product.id && item.variant === 'Default')
      const currentQty = existing ? Number(existing.quantity || 0) : 0
      const remainingStock = Math.max(0, productStock - currentQty)

      if (remainingStock <= 0) {
        return current
      }

      const nextQty = Math.min(safeQuantity, remainingStock)

      if (existing) {
        return current.map((item) =>
          item.productId === product.id && item.variant === 'Default' ? { ...item, quantity: currentQty + nextQty } : item,
        )
      }

      return [...current, { productId: product.id, quantity: nextQty, variant: 'Default' }]
    })

    setCartOpen(true)
    setToast(`${product.name} added to cart.`)
  }

  const updateCartQuantity = (productId, variant, nextQty) => {
    const targetProduct = catalogProducts.find((product) => String(product.id) === String(productId))
    const maxQty = getProductStockLimit(targetProduct)
    const nextQuantity = Math.max(0, Number(nextQty) || 0)

    setCart((current) =>
      current
        .map((item) => {
          if (item.productId !== productId || item.variant !== variant) return item
          if (nextQuantity <= 0 || maxQty <= 0) return null
          return { ...item, quantity: Math.min(nextQuantity, maxQty) }
        })
        .filter(Boolean),
    )
  }

  const checkoutCart = () => {
    if (!BUSINESS_WHATSAPP_NUMBER) {
      setToast('Business WhatsApp number needs confirmation in the environment before checkout can continue.')
      return
    }
    if (!cartItems.length) {
      setToast('Your cart is empty.')
      return
    }
    if (!session?.authenticated) {
      setToast('Please sign in to place your order via WhatsApp.')
      navigateTo(authLoginRoute)
      return
    }

    const unavailableItems = cartItems.filter((item) => {
      const stock = getProductStockLimit(item.product)
      return stock <= 0 || item.quantity > stock
    })

    if (unavailableItems.length) {
      const productName = unavailableItems[0].product.name
      setToast(`${productName} is no longer available in the quantity selected.`)
      return
    }

    const url = createCartWhatsAppLink({
      items: cartItems.map((item) => ({
        name: item.product.name,
        price: item.product.price,
        quantity: Math.min(item.quantity, getProductStockLimit(item.product) || item.quantity),
        variant: item.variant,
        product: {
          name: item.product.name,
          price: item.product.price,
          sku: item.product.sku,
          id: item.product.id,
        },
      })),
      customerName: session.username,
      customerPhone: session.phone || '',
      customerNote: 'Order from GIGI COLLECTION storefront.',
      businessNumber: BUSINESS_WHATSAPP_NUMBER,
    })

    if (url) window.open(url, '_blank', 'noopener,noreferrer')
    setCartOpen(false)
  }

  useEffect(() => {
    if (!route.startsWith(hiddenDashboardRoute)) return

    const isProtectedPortalRoute = !isPublicAuthRoute(route) && route !== hiddenDashboardRoute && route !== `${hiddenDashboardRoute}/`

    if (!session && isProtectedPortalRoute) {
      navigateTo(authLoginRoute)
      return
    }

    if (session && !isAuthorizedAdminSession(session) && isProtectedPortalRoute) {
      navigateTo('/')
    }
  }, [route, session])

  if (route.startsWith(`${hiddenDashboardRoute}`) && session && isAuthorizedAdminSession(session)) {
    return (
      <div className="dashboard-shell">
        <aside className="sidebar">
          <div className="sidebar-brand">
            <img src="/photo (1).jpg" alt="GIGI COLLECTION" />
          </div>
          <nav className="sidebar-nav">
            {['overview', 'products', 'categories', 'inventory', 'settings', 'account', ...(developerOnly ? ['developer'] : [])].map((section) => (
              <button
                key={section}
                type="button"
                className={dashboardView === section ? 'sidebar-link active' : 'sidebar-link'}
                onClick={() => setDashboardView(section)}
              >
                {section === 'overview' && 'Overview'}
                {section === 'products' && 'Products'}
                {section === 'categories' && 'Categories'}
                {section === 'inventory' && 'Inventory'}
                {section === 'settings' && 'Store settings'}
                {section === 'account' && 'Account'}
                {section === 'developer' && 'Developer'}
              </button>
            ))}
            <button type="button" className="sidebar-link danger-link" onClick={handleLogout}>Logout</button>
          </nav>
        </aside>

        <main className="dashboard-main">
          <header className="dashboard-topbar">
            <div>
              <p className="eyebrow">Dashboard</p>
              <h2>{session.role === 'developer' ? 'Developer Portal' : 'Owner Portal'}</h2>
            </div>
            <div className="topbar-actions">
              <button type="button" className="secondary-button" onClick={() => navigateTo('/')}>Site</button>
              <div className="topbar-user">
                <span>{session.username}</span>
                <small>{session.role}</small>
              </div>
            </div>
          </header>

          {dashboardView === 'overview' && (
            <div className="dashboard-content">
              <div className="stats-grid">
                <div className="stat-card"><span>Total products</span><strong>{overviewStats.totalProducts}</strong></div>
                <div className="stat-card"><span>Available</span><strong>{overviewStats.availableProducts}</strong></div>
                <div className="stat-card"><span>Out of stock</span><strong>{overviewStats.outOfStockProducts}</strong></div>
                <div className="stat-card"><span>Categories</span><strong>{overviewStats.totalCategories}</strong></div>
              </div>

              <div className="panel-grid">
                <section className="panel">
                  <div className="panel-header"><h3>Recently added</h3></div>
                  <ul className="list-stack">
                    {catalogProducts.slice(0, 5).map((product) => (
                      <li key={product.id}><span>{product.name}</span><strong>{formatPrice(product.price)}</strong></li>
                    ))}
                  </ul>
                </section>

                <section className="panel">
                  <div className="panel-header"><h3>Quick actions</h3></div>
                  <div className="quick-actions">
                    <button type="button" className="primary-button" onClick={() => setDashboardView('products')}>Add product</button>
                    <button type="button" className="secondary-button" onClick={() => setDashboardView('categories')}>Manage categories</button>
                    <button type="button" className="secondary-button" onClick={() => setDashboardView('inventory')}>Inventory</button>
                  </div>
                </section>
              </div>
            </div>
          )}

          {dashboardView === 'products' && (
            <div className="dashboard-content product-layout">
              <div className="panel-toolbar">
                <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search name, SKU or category" />
                <select value={availabilityFilter} onChange={(event) => setAvailabilityFilter(event.target.value)}>
                  <option value="all">All status</option>
                  <option value="In stock">In stock</option>
                  <option value="Low stock">Low stock</option>
                  <option value="Sold out">Sold out</option>
                  <option value="Draft">Draft</option>
                </select>
              </div>

              <div className="product-grid-admin">
                <section className="panel product-list-panel">
                  <div className="panel-header"><h3>Catalogue</h3></div>
                  <div className="catalog-list">
                    {catalogProducts.filter((product) => {
                      const text = query.trim().toLowerCase()
                      return text.length === 0 || product.name.toLowerCase().includes(text) || (product.category || '').toLowerCase().includes(text) || (product.sku || '').toLowerCase().includes(text)
                    }).map((product) => (
                      <div key={product.id} className="catalog-row">
                        <div className="catalog-thumb">
                          <img src={product.primaryImage || product.images?.[0] || getFallbackProductImage(0)} alt={product.name} />
                        </div>
                        <div className="catalog-copy">
                          <strong>{product.name}</strong>
                          <small>{product.category} · {product.sku || 'No SKU'}</small>
                          <span>{product.availability} · Stock {product.stockQuantity ?? 0}</span>
                        </div>
                        <div className="catalog-actions">
                          <button type="button" className="ghost-button" onClick={() => handleEditProduct(product)}>Edit</button>
                          <button type="button" className="ghost-button" onClick={() => handleArchiveProduct(product.id)}>Archive</button>
                          <button type="button" className="ghost-button danger-button" onClick={() => handleDeleteProduct(product.id)}>Delete</button>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>

                <section className="panel product-form-panel">
                  <div className="panel-header"><h3>{productDraft.id ? 'Edit product' : 'Add product'}</h3></div>

                  <div className="product-preview-card">
                    <div className="preview-image-box">
                      {productDraft.primaryImage || productDraft.images[0] ? (
                        <img src={productDraft.primaryImage || productDraft.images[0]} alt={productDraft.name || 'Preview'} />
                      ) : (
                        <div className="placeholder-box">No image selected</div>
                      )}
                    </div>
                    <div className="preview-copy">
                      <div className="preview-meta-row"><span>{productDraft.category || 'Category'}</span><span>{previewStatus}</span></div>
                      <h4>{productDraft.name || 'Product name'}</h4>
                      <div className="preview-price-row">
                        <strong>{formatPrice(Number(productDraft.price || 0))}</strong>
                        {Number(productDraft.markedPrice || 0) > Number(productDraft.price || 0) && (
                          <span className="marked-price">{formatPrice(Number(productDraft.markedPrice || 0))}</span>
                        )}
                      </div>
                      {previewDiscount > 0 && <div className="discount-badge">Save {Math.round(previewDiscount)}%</div>}
                    </div>
                  </div>

                  <div className="form-grid">
                    <div className="form-section-block">
                      <div className="section-label">Product information</div>
                      <div className="field-grid">
                        <label>Product name<input type="text" value={productDraft.name} onChange={(event) => setProductDraft((current) => ({ ...current, name: event.target.value }))} /></label>
                        <label>
                          Category
                          <div className="field-inline-row">
                            <select value={productDraft.category} onChange={(event) => setProductDraft((current) => ({ ...current, category: event.target.value }))}>
                              {catalogCategories.map((category) => <option key={category.id} value={category.label}>{category.label}</option>)}
                            </select>
                            <button type="button" className="secondary-button" onClick={handleCreateCategoryFromProduct}>Create category</button>
                          </div>
                        </label>
                        <label>SKU<input type="text" value={productDraft.sku} onChange={(event) => setProductDraft((current) => ({ ...current, sku: event.target.value }))} /></label>
                        <label>Brand<input type="text" value={productDraft.brand} onChange={(event) => setProductDraft((current) => ({ ...current, brand: event.target.value }))} /></label>
                        <label className="full-width">Description<textarea rows="4" value={productDraft.description} onChange={(event) => setProductDraft((current) => ({ ...current, description: event.target.value }))} /></label>
                      </div>
                    </div>

                    <div className="form-section-block">
                      <div className="section-label">Product images</div>
                      <div className="full-width image-upload-panel">
                        <div className="upload-header"><strong>Upload and arrange photos</strong><button type="button" className="secondary-button" onClick={() => productInputRef.current?.click()}>Upload</button></div>
                        <input ref={productInputRef} hidden type="file" multiple accept="image/*,.png,.jpg,.jpeg,.webp,.avif,.gif,.bmp,.svg,.tif,.tiff,.heic,.heif" onChange={handleImageSelection} />
                        {uploadStatus && <div className={uploadingImages ? 'form-alert info' : 'form-alert success'}>{uploadStatus}</div>}
                        <div className="preview-gallery">
                          {productDraft.images.length ? (
                            productDraft.images.map((image) => (
                              <div key={image} className={productDraft.primaryImage === image ? 'gallery-thumb selected' : 'gallery-thumb'}>
                                <img src={image} alt="Product asset" />
                                <div className="gallery-actions">
                                  <button type="button" onClick={() => setProductDraft((current) => ({ ...current, primaryImage: image }))}>Main</button>
                                  <button type="button" onClick={() => handleReorderImage(image, -1)}>Left</button>
                                  <button type="button" onClick={() => handleReorderImage(image, 1)}>Right</button>
                                  <button type="button" onClick={() => handleRemoveImage(image)}>Remove</button>
                                </div>
                              </div>
                            ))
                          ) : (
                            <div className="placeholder-box">No images added yet</div>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="form-section-block">
                      <div className="section-label">Pricing</div>
                      <div className="field-grid">
                        <label>Marked price<input type="number" value={productDraft.markedPrice} onChange={(event) => setProductDraft((current) => ({ ...current, markedPrice: event.target.value }))} /></label>
                        <label>Selling price<input type="number" value={productDraft.price} onChange={(event) => setProductDraft((current) => ({ ...current, price: event.target.value }))} /></label>
                      </div>
                    </div>

                    <div className="form-section-block">
                      <div className="section-label">Inventory</div>
                      <div className="field-grid">
                        <label>Stock<input type="number" value={productDraft.stockQuantity} onChange={(event) => setProductDraft((current) => ({ ...current, stockQuantity: event.target.value }))} /></label>
                        <label>Low-stock threshold<input type="number" value={productDraft.lowStockThreshold} onChange={(event) => setProductDraft((current) => ({ ...current, lowStockThreshold: event.target.value }))} /></label>
                      </div>
                    </div>

                    <div className="form-section-block">
                      <div className="section-label">Publishing</div>
                      <div className="checkbox-grid">
                        <label className="checkbox-row"><input type="checkbox" checked={productDraft.isPublished} onChange={(event) => setProductDraft((current) => ({ ...current, isPublished: event.target.checked }))} /><span>Published</span></label>
                        <label className="checkbox-row"><input type="checkbox" checked={productDraft.featured} onChange={(event) => setProductDraft((current) => ({ ...current, featured: event.target.checked }))} /><span>Featured</span></label>
                        <label className="checkbox-row"><input type="checkbox" checked={productDraft.isNew} onChange={(event) => setProductDraft((current) => ({ ...current, isNew: event.target.checked }))} /><span>New arrival</span></label>
                      </div>
                    </div>
                  </div>

                  <button type="button" className="primary-button full-width-button" onClick={handleSaveProduct}>Save product</button>
                </section>
              </div>
            </div>
          )}

          {dashboardView === 'categories' && (
            <div className="dashboard-content panel-grid">
              <section className="panel">
                <div className="panel-header"><h3>Categories</h3></div>
                <div className="category-list">
                  {catalogCategories.map((category) => (
                    <div key={category.id} className="category-item">
                      <span>{category.label}</span>
                      <button type="button" className="ghost-button danger-button" onClick={() => handleDeleteCategory(category.id)}>Remove</button>
                    </div>
                  ))}
                </div>
              </section>

              <section className="panel">
                <div className="panel-header"><h3>Add category</h3></div>
                <div className="form-grid compact-box">
                  <input type="text" value={categoryDraft.name} onChange={(event) => setCategoryDraft({ id: createSlug(event.target.value), name: event.target.value })} placeholder="Category name" />
                  <button type="button" className="primary-button" onClick={handleAddCategory}>Save category</button>
                </div>
              </section>
            </div>
          )}

          {dashboardView === 'inventory' && (
            <div className="dashboard-content inventory-layout">
              <section className="panel">
                <div className="panel-header"><h3>Inventory</h3></div>
                <div className="inventory-table">
                  {catalogProducts.map((product) => (
                    <div key={product.id} className="inventory-row">
                      <span>{product.name}</span>
                      <span>{product.category}</span>
                      <span>{getAvailabilityLabel(product)}</span>
                      <span>{product.stockQuantity ?? 0}</span>
                      <span>{formatPrice(product.price)}</span>
                    </div>
                  ))}
                </div>
              </section>

              <section className="panel">
                <div className="panel-header"><h3>Adjust stock</h3></div>
                <div className="form-grid compact-box">
                  <select value={inventoryDraft.productId} onChange={(event) => setInventoryDraft((current) => ({ ...current, productId: event.target.value }))}>
                    <option value="">Select product</option>
                    {catalogProducts.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}
                  </select>
                  <input type="number" value={inventoryDraft.quantity} onChange={(event) => setInventoryDraft((current) => ({ ...current, quantity: event.target.value }))} placeholder="e.g. -2 or +5" />
                  <input type="text" value={inventoryDraft.reason} onChange={(event) => setInventoryDraft((current) => ({ ...current, reason: event.target.value }))} placeholder="Reason" />
                  <button type="button" className="primary-button" onClick={handleStockAdjustment}>Update stock</button>
                </div>
              </section>
            </div>
          )}

          {dashboardView === 'settings' && (
            <div className="dashboard-content">
              <section className="panel">
                <div className="panel-header"><h3>Store settings</h3></div>
                <div className="form-grid">
                  <input type="text" value={storeSettings.businessName} onChange={(event) => setStoreSettings((current) => ({ ...current, businessName: event.target.value }))} />
                  <textarea rows="4" value={storeSettings.businessDescription} onChange={(event) => setStoreSettings((current) => ({ ...current, businessDescription: event.target.value }))} />
                  <input type="text" value={storeSettings.whatsappNumber} onChange={(event) => setStoreSettings((current) => ({ ...current, whatsappNumber: event.target.value }))} />
                  <input type="text" value={storeSettings.contactEmail} onChange={(event) => setStoreSettings((current) => ({ ...current, contactEmail: event.target.value }))} />
                  <input type="text" value={storeSettings.instagram} onChange={(event) => setStoreSettings((current) => ({ ...current, instagram: event.target.value }))} />
                  <input type="text" value={storeSettings.facebook} onChange={(event) => setStoreSettings((current) => ({ ...current, facebook: event.target.value }))} />
                  <textarea rows="3" value={storeSettings.promotionalCopy} onChange={(event) => setStoreSettings((current) => ({ ...current, promotionalCopy: event.target.value }))} />
                </div>
              </section>
            </div>
          )}

          {dashboardView === 'account' && (
            <div className="dashboard-content">
              <section className="panel">
                <div className="panel-header"><h3>Account</h3></div>
                <div className="account-box">
                  <p>Signed in as: <strong>{session.username}</strong></p>
                  <p>Role: <strong>{session.role}</strong></p>
                </div>
              </section>
            </div>
          )}

          {dashboardView === 'developer' && (
            <div className="dashboard-content">
              <section className="panel">
                <div className="panel-header"><h3>Developer settings</h3></div>
                <div className="account-box">
                  <button type="button" className="danger-button ghost-button" onClick={async () => { await clearPrototypeAccounts(); setSession(null); navigateTo(authLoginRoute) }}>Reset prototype auth</button>
                </div>
              </section>
            </div>
          )}
        </main>
      </div>
    )
  }

  if (route.startsWith(`${hiddenDashboardRoute}`) && !session && (route === authLoginRoute || route === hiddenDashboardRoute || route === `${hiddenDashboardRoute}/` || route === authOtpRoute)) {
    return (
      <div className="auth-shell">
        <div className="auth-card">
          <div className="auth-brand-row"><img src="/photo (1).jpg" alt="GIGI COLLECTION" className="auth-logo" /></div>
          <div className="auth-header">
            <p className="eyebrow">Welcome back</p>
            <h1>Sign in to GIGI COLLECTION</h1>
          </div>

          <form onSubmit={handleLoginSubmit} className="auth-form">
            <label>Email address<input type="email" value={loginForm.username} onChange={(event) => setLoginForm((current) => ({ ...current, username: event.target.value }))} /></label>
            <label>Password<div className="password-wrap"><input type={showPassword ? 'text' : 'password'} value={loginForm.password} onChange={(event) => setLoginForm((current) => ({ ...current, password: event.target.value }))} /><button type="button" className="password-toggle" onClick={() => setShowPassword((current) => !current)}>{showPassword ? 'Hide' : 'Show'}</button></div></label>
            {loginError && <div className="form-alert error">{loginError}</div>}
            <button type="submit" className="primary-button auth-button" disabled={isSubmittingLogin}>{isSubmittingLogin ? 'Signing in...' : 'Sign in'}</button>
          </form>

          <div className="auth-meta">
            <span>New to GIGI?</span>
            <button type="button" className="text-link" onClick={() => navigateTo(authSignupRoute)}>Create account</button>
          </div>
        </div>
      </div>
    )
  }

  if (route === authSignupRoute) {
    return (
      <div className="auth-shell">
        <div className="auth-card">
          <div className="auth-brand-row"><img src="/photo (1).jpg" alt="GIGI COLLECTION" className="auth-logo" /></div>
          <div className="auth-header"><p className="eyebrow">Create account</p><h1>Customer signup</h1></div>
          <form onSubmit={handleSignupSubmit} className="auth-form">
            <label>Full name<input type="text" value={signupForm.fullName} onChange={(event) => setSignupForm((current) => ({ ...current, fullName: event.target.value }))} /></label>
            <label>Email address<input type="email" value={signupForm.email} onChange={(event) => setSignupForm((current) => ({ ...current, email: event.target.value }))} /></label>
            <label>Phone number<input type="tel" value={signupForm.phone} onChange={(event) => setSignupForm((current) => ({ ...current, phone: event.target.value }))} /></label>
            <label>Password<input type="password" value={signupForm.password} onChange={(event) => setSignupForm((current) => ({ ...current, password: event.target.value }))} /></label>
            <label>Confirm password<input type="password" value={signupForm.confirmPassword} onChange={(event) => setSignupForm((current) => ({ ...current, confirmPassword: event.target.value }))} /></label>
            {signupError && <div className="form-alert error">{signupError}</div>}
            {signupMessage && <div className="form-alert success">{signupMessage}</div>}
            <button type="submit" className="primary-button auth-button" disabled={isSubmittingSignup}>{isSubmittingSignup ? 'Creating account...' : 'Create account'}</button>
            {signupMessage && (
              <button type="button" className="secondary-button auth-button" onClick={handleResendConfirmation} disabled={isResendingConfirmation}>
                {isResendingConfirmation ? 'Sending...' : 'Resend confirmation email'}
              </button>
            )}
          </form>

          <div className="auth-meta">
            <span>Already have an account?</span>
            <button type="button" className="text-link" onClick={() => navigateTo(authLoginRoute)}>Sign in</button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="page-shell">
      <header className="site-header">
        <div className="container header-inner">
          <a href="#home" className="brand" onClick={(event) => { event.preventDefault(); closeMobileMenu(); window.scrollTo({ top: 0, behavior: 'smooth' }) }}>
            <img src="/photo (1).jpg" alt="GIGI COLLECTION" />
          </a>

          <nav className={`main-nav ${mobileMenuOpen ? 'is-open' : ''}`} aria-label="Main navigation">
            <button type="button" className="nav-link" onClick={() => { closeMobileMenu(); window.scrollTo({ top: 0, behavior: 'smooth' }) }}>Home</button>
            <button type="button" className="nav-link" onClick={() => { closeMobileMenu(); document.getElementById('shop')?.scrollIntoView({ behavior: 'smooth' }) }}>Shop</button>
            <button type="button" className="nav-link" onClick={() => { closeMobileMenu(); setSelectedCategory('Handbags') }}>Handbags</button>
            <button type="button" className="nav-link" onClick={() => { closeMobileMenu(); setSelectedCategory('Soccer Jerseys') }}>Soccer Jerseys</button>
            <button type="button" className="nav-link" onClick={() => { closeMobileMenu(); document.getElementById('about')?.scrollIntoView({ behavior: 'smooth' }) }}>About</button>
          </nav>

          <div className="header-actions">
            <button type="button" className="cart-button" onClick={() => { closeMobileMenu(); setCartOpen(true) }}>
              Cart <span className="cart-count">({cartItems.length})</span>
            </button>
            {session ? (
              <div className="header-account">
                <span className="account-chip">{session.username}</span>
                {!isAuthorizedAdminSession(session) && (
                  <button type="button" className="secondary-button" onClick={handleLogout}>Sign out</button>
                )}
                {isAuthorizedAdminSession(session) && (
                  <button type="button" className="nav-button" onClick={() => navigateTo(`${hiddenDashboardRoute}/overview`)}>Portal</button>
                )}
              </div>
            ) : (
              <div className="auth-inline-actions">
                <button type="button" className="primary-button account-button" onClick={() => navigateTo(authLoginRoute)}>Sign in / Up</button>
              </div>
            )}
            <button
              type="button"
              className="mobile-menu-toggle"
              aria-label={mobileMenuOpen ? 'Close navigation menu' : 'Open navigation menu'}
              aria-expanded={mobileMenuOpen}
              onClick={() => setMobileMenuOpen((current) => !current)}
            >
              <span />
              <span />
              <span />
            </button>
          </div>
        </div>
      </header>

      <button
        type="button"
        className={`scroll-top-button ${scrollProgress > 0.02 ? 'visible' : ''}`}
        style={{ '--progress': scrollProgress.toFixed(3) }}
        onClick={handleScrollToTop}
        aria-label="Scroll back to top"
      >
        <span>↑</span>
      </button>

      <main>
        <section id="home" className="hero-section">
          <div className="container hero-grid">
            <div className="hero-copy">
              <p className="eyebrow">Boutique essentials</p>
              <h1>Curated fashion for everyday confidence.</h1>
              <p className="hero-text">GIGI COLLECTION brings together statement accessories, elevated essentials and premium casualwear for a refined wardrobe.</p>
              <div className="hero-actions">
                <button type="button" className="primary-button" onClick={() => document.getElementById('shop')?.scrollIntoView({ behavior: 'smooth' })}>Shop now</button>
              </div>
            </div>

            <div className="hero-visual">
              <div className="hero-visual-frame">
                <div className="hero-slide-stage" aria-live="polite">
                  {heroSlides.map((slide, index) => (
                    <div key={`${slide.alt}-${index}`} className={`hero-slide ${index === activeHeroSlide ? 'is-active' : ''}`} aria-hidden={index !== activeHeroSlide}>
                      <img src={slide.src} alt={slide.alt} />
                    </div>
                  ))}
                </div>

                {heroSlides.length > 1 && (
                  <>
                    <button type="button" className="hero-slide-nav prev" onClick={() => setActiveHeroSlide((current) => (current - 1 + heroSlides.length) % heroSlides.length)} aria-label="Previous hero image">←</button>
                    <button type="button" className="hero-slide-nav next" onClick={() => setActiveHeroSlide((current) => (current + 1) % heroSlides.length)} aria-label="Next hero image">→</button>
                    <div className="hero-dots" aria-label="Hero navigation dots">
                      {heroSlides.map((slide, index) => (
                        <button
                          key={`${slide.alt}-dot-${index}`}
                          type="button"
                          className={`hero-dot ${index === activeHeroSlide ? 'active' : ''}`}
                          onClick={() => setActiveHeroSlide(index)}
                          aria-label={`Show slide ${index + 1}`}
                          aria-current={index === activeHeroSlide ? 'true' : undefined}
                        />
                      ))}
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </section>

        <section className="category-section">
          <div className="container">
            <div className="section-heading"><h2>Shop by category</h2><p>Curated categories selected from the boutique catalogue.</p></div>
            <div className="category-grid">
              {(catalogCategories || []).filter((category) => category.label !== 'All').map((category) => {
                const categoryCount = catalogProducts.filter((product) => product.category === category.label).length

                return (
                  <button key={category.id} type="button" className="category-card" onClick={() => setSelectedCategory(category.label)}>
                    <div className="category-visual" aria-hidden="true">
                      <img src={getCategoryImage(category.label)} alt={category.label} />
                    </div>
                    <div className="category-copy">
                      <div className="category-copy-top"><span className="category-kicker">Collection</span><strong>{categoryCount} item{categoryCount === 1 ? '' : 's'}</strong></div>
                      <h3>{category.label}</h3>
                      <span>Explore collection</span>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        </section>

        <section id="shop" className="shop-section">
          <div className="container">
            <div className="catalog-header">
              <div>
                <p className="eyebrow">The collection</p>
                <h2>Shop favourites</h2>
              </div>
              <div className="search-wrap">
                <input type="search" value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} placeholder="Search catalogue" aria-label="Search products" />
                {searchTerm && (
                  <button type="button" className="clear-search" onClick={() => setSearchTerm('')} aria-label="Clear search">Clear</button>
                )}
              </div>
            </div>

            <div className="catalog-filter-panel">
              <div className="filter-row">
                {['All', ...catalogCategories.map((category) => category.label)].map((category) => (
                  <button key={category} type="button" className={selectedCategory === category ? 'filter-pill active' : 'filter-pill'} onClick={() => setSelectedCategory(category)}>{category}</button>
                ))}
              </div>

              <div className="toolbar-inline">
                <div className="toolbar-field">
                  <label htmlFor="catalog-availability">Availability</label>
                  <select id="catalog-availability" value={availabilityFilter} onChange={(event) => setAvailabilityFilter(event.target.value)}>
                    <option value="all">All availability</option>
                    <option value="In stock">In stock</option>
                    <option value="Low stock">Low stock</option>
                    <option value="Sold out">Sold out</option>
                  </select>
                </div>

                <div className="toolbar-field">
                  <label htmlFor="catalog-sort">Sort by</label>
                  <select id="catalog-sort" value={sortOrder} onChange={(event) => setSortOrder(event.target.value)}>
                    <option value="featured">Featured</option>
                    <option value="newest">Newest arrivals</option>
                    <option value="low-high">Price: low to high</option>
                    <option value="high-low">Price: high to low</option>
                    <option value="name-asc">Name: A–Z</option>
                  </select>
                </div>

                {(searchTerm || selectedCategory !== 'All' || availabilityFilter !== 'all' || sortOrder !== 'featured') && (
                  <button type="button" className="secondary-button compact-button" onClick={clearCatalogueFilters}>Reset filters</button>
                )}
              </div>
            </div>

            {!catalogProducts.length ? (
              <div className="empty-state-box">
                <p className="empty-state-title">The boutique catalogue is being updated.</p>
                <p>New pieces will appear here as the store is refreshed.</p>
              </div>
            ) : filteredProducts.length ? (
              <div className="product-grid">
                {filteredProducts.map((product) => {
                  const productImage = product.primaryImage || product.images?.[0] || getFallbackProductImage(product.id || 0)
                  const stockLabel = getAvailabilityLabel(product)

                  return (
                    <article key={product.id} className="product-card">
                      <div className="product-image-wrap">
                        <img src={productImage} alt={product.name} />
                        {product.featured && <span className="product-tag">Featured</span>}
                        <span className={`stock-badge ${stockLabel === 'Sold out' ? 'sold-out' : stockLabel === 'Low stock' ? 'low-stock' : 'in-stock'}`}>{stockLabel}</span>
                      </div>
                      <div className="product-body">
                        <div className="product-meta"><span>{product.category}</span><span>{stockLabel}</span></div>
                        <h3>{product.name}</h3>
                        <p>{product.description}</p>
                        <div className="product-footer">
                          <div className="price-stack">
                            <strong>{formatPrice(product.price)}</strong>
                            {Number(product.markedPrice || 0) > Number(product.price || 0) && <span className="marked-price-inline">{formatPrice(product.markedPrice)}</span>}
                          </div>
                          <div className="product-actions">
                            <button type="button" className="ghost-button" onClick={() => openProductDetails(product)}>Details</button>
                            <button type="button" className="primary-button" onClick={() => addToCart(product)} disabled={getAvailabilityLabel(product) === 'Sold out'}>
                              {getAvailabilityLabel(product) === 'Sold out' ? 'Sold out' : 'Add to cart'}
                            </button>
                          </div>
                        </div>
                      </div>
                    </article>
                  )
                })}
              </div>
            ) : (
              <div className="empty-state-box empty-state-search">
                <p className="empty-state-title">No matching products found.</p>
                <p>Try another keyword or reset the active filters to browse the full catalogue.</p>
                <button type="button" className="primary-button" onClick={clearCatalogueFilters}>Reset catalogue</button>
              </div>
            )}
          </div>
        </section>

        <section className="featured-section">
          <div className="container">
            <div className="section-heading"><h2>Featured picks</h2></div>
            <div className="product-grid">
              {featuredProducts.length ? featuredProducts.map((product) => (
                <article key={product.id} className="product-card">
                  <div className="product-image-wrap"><img src={product.primaryImage || product.images?.[0] || getFallbackProductImage(product.id || 0)} alt={product.name} /></div>
                  <div className="product-body"><h3>{product.name}</h3><div className="product-footer"><strong>{formatPrice(product.price)}</strong><button type="button" className="primary-button" onClick={() => addToCart(product)} disabled={getAvailabilityLabel(product) === 'Sold out'}>{getAvailabilityLabel(product) === 'Sold out' ? 'Sold out' : 'Add'}</button></div></div>
                </article>
              )) : <div className="empty-state-box"><p>Featured pieces will appear once new inventory is added.</p></div>}
            </div>
          </div>
        </section>

        <section className="new-arrivals">
          <div className="container">
            <div className="section-heading"><h2>New arrivals</h2></div>
            <div className="product-grid">
              {newArrivals.length ? newArrivals.map((product) => (
                <article key={product.id} className="product-card">
                  <div className="product-image-wrap"><img src={product.primaryImage || product.images?.[0] || getFallbackProductImage(product.id || 0)} alt={product.name} /></div>
                  <div className="product-body"><h3>{product.name}</h3><div className="product-footer"><strong>{formatPrice(product.price)}</strong><button type="button" className="primary-button" onClick={() => addToCart(product)} disabled={getAvailabilityLabel(product) === 'Sold out'}>{getAvailabilityLabel(product) === 'Sold out' ? 'Sold out' : 'Add'}</button></div></div>
                </article>
              )) : <div className="empty-state-box"><p>New arrivals will appear once products are published.</p></div>}
            </div>
          </div>
        </section>

        <section id="about" className="about-section">
          <div className="container about-grid">
            <div className="about-copy">
              <p className="eyebrow">Our story</p>
              <h2>Elevated essentials for every occasion.</h2>
              <p>GIGI COLLECTION blends clean silhouettes, premium fabrics, and unforgettable details to create wardrobe staples that feel effortless and distinctive.</p>
            </div>
            <div className="promo-panel">
              <h2>Luxury in the details.</h2>
              <p>Each edit is made to feel personal, polished and ready for your next chapter.</p>
            </div>
          </div>
        </section>
      </main>

      <footer className="site-footer">
        <div className="container footer-grid">
          <div className="footer-brand-block">
            <img src="/photo (1).jpg" alt="GIGI COLLECTION" className="footer-logo" />
            <p>Premium essentials for elevated moments and everyday confidence.</p>
          </div>

          <div className="footer-links">
            <h4>Explore</h4>
            <a href="#home">Home</a>
            <a href="#shop">Shop</a>
            <a href="#about">About</a>
          </div>

          <div className="footer-links">
            <h4>GIGI COLLECTION</h4>
            <a href={BUSINESS_WHATSAPP_NUMBER ? `https://wa.me/${BUSINESS_WHATSAPP_NUMBER.replace(/\D/g, '')}` : '#'} target={BUSINESS_WHATSAPP_NUMBER ? '_blank' : undefined} rel={BUSINESS_WHATSAPP_NUMBER ? 'noreferrer' : undefined}>WhatsApp order line</a>
            <a href="mailto:contact@gigicollection.co.ke">contact@gigicollection.co.ke</a>
          </div>

          <div className="footer-links developer-footer">
            <h4>EnZone Technologies</h4>
            <p>© {CURRENT_YEAR} EnZone Technologies. All rights reserved.</p>
            <p>Designed and developed by EnZone Technologies.</p>
            <a href="https://wa.me/254716194441" target="_blank" rel="noreferrer">WhatsApp: 0716194441</a>
            <a href="mailto:yonatechnologies.ltd@gmail.com">Email: yonatechnologies.ltd@gmail.com</a>
          </div>
        </div>
      </footer>

      {selectedProduct && (
        <div className="product-modal-backdrop" onClick={() => setSelectedProduct(null)}>
          <div className="product-modal" onClick={(event) => event.stopPropagation()}>
            <button type="button" className="modal-close" onClick={() => setSelectedProduct(null)}>×</button>
            <div className="product-modal-grid">
              <div className="product-modal-gallery">
                <img src={selectedProduct.primaryImage || selectedProduct.images?.[0] || getFallbackProductImage(selectedProduct.id || 0)} alt={selectedProduct.name} />
              </div>
              <div className="product-modal-copy">
                <p className="eyebrow">{selectedProduct.category}</p>
                <h3>{selectedProduct.name}</h3>
                <div className="modal-price-row"><strong>{formatPrice(selectedProduct.price)}</strong>{Number(selectedProduct.markedPrice || 0) > Number(selectedProduct.price || 0) && <span>{formatPrice(selectedProduct.markedPrice)}</span>}</div>
                <p>{selectedProduct.description}</p>
                <div className="qty-row">
                  <button
                    type="button"
                    disabled={getProductStockLimit(selectedProduct) <= 0 || selectedQuantity <= 1}
                    onClick={() => setSelectedQuantity((current) => clampQuantityToStock({ product: selectedProduct, quantity: Math.max(1, (Number(current) || 1) - 1), minimumQuantity: 1 }))}
                  >
                    -
                  </button>
                  <span>{selectedQuantity}</span>
                  <button
                    type="button"
                    disabled={getProductStockLimit(selectedProduct) <= 0 || selectedQuantity >= getProductStockLimit(selectedProduct)}
                    onClick={() => setSelectedQuantity((current) => clampQuantityToStock({ product: selectedProduct, quantity: (Number(current) || 1) + 1, minimumQuantity: 1 }))}
                  >
                    +
                  </button>
                </div>
                <div className="modal-actions">
                  <button type="button" className="primary-button" onClick={() => addToCart(selectedProduct, selectedQuantity)} disabled={getProductStockLimit(selectedProduct) <= 0}>
                    {getProductStockLimit(selectedProduct) <= 0 ? 'Sold out' : 'Add to cart'}
                  </button>
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => {
                      if (!session?.authenticated) {
                            setToast('Please sign in to enquire via WhatsApp.')
                        navigateTo(authLoginRoute)
                        return
                      }

                      if (!BUSINESS_WHATSAPP_NUMBER) {
                        setToast('Business WhatsApp number needs confirmation in the environment before checkout can continue.')
                        return
                      }

                      const url = createWhatsAppLink({
                        productName: selectedProduct.name,
                        price: selectedProduct.price,
                        quantity: selectedQuantity,
                        variant: 'Default',
                        productReference: selectedProduct.sku || selectedProduct.id,
                        productId: selectedProduct.id,
                        customerName: session.username,
                        customerPhone: session.phone || '',
                        businessNumber: BUSINESS_WHATSAPP_NUMBER,
                      })

                      if (url) window.open(url, '_blank', 'noopener,noreferrer')
                    }}
                  >
                    WhatsApp enquiry
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {cartOpen && (
        <div className="cart-backdrop" onClick={() => setCartOpen(false)}>
          <aside className="cart-panel" onClick={(event) => event.stopPropagation()}>
            <div className="cart-header"><h3>Cart</h3><button type="button" className="modal-close" onClick={() => setCartOpen(false)}>×</button></div>
            {cartItems.length ? (
              <>
                <div className="cart-items">
                  {cartItems.map((item) => (
                    <div key={`${item.productId}-${item.variant}`} className="cart-item">
                      <div className="cart-item-visual">
                        <img src={item.product.primaryImage || item.product.images?.[0] || getFallbackProductImage(item.product.id || 0)} alt={item.product.name} />
                      </div>
                      <div className="cart-item-copy"><strong>{item.product.name}</strong><small>{item.variant}</small></div>
                      <div className="cart-item-meta"><button type="button" onClick={() => updateCartQuantity(item.productId, item.variant, item.quantity - 1)}>-</button><span>{item.quantity}</span><button type="button" onClick={() => updateCartQuantity(item.productId, item.variant, item.quantity + 1)}>+</button></div>
                      <div className="cart-item-secondary">
                        <strong>{formatPrice(Number(item.product.price || 0) * item.quantity)}</strong>
                        <button type="button" className="text-link" onClick={() => removeCartItem(item.productId, item.variant)}>Remove</button>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="cart-summary"><span>Subtotal</span><strong>{formatPrice(cartSubtotal)}</strong></div>
                <div className="cart-actions-row">
                  <button type="button" className="secondary-button" onClick={clearCart}>Clear cart</button>
                  <button type="button" className="primary-button cart-submit" onClick={checkoutCart}>Checkout on WhatsApp</button>
                </div>
              </>
            ) : (
              <div className="empty-state-box"><p>Your cart is empty.</p></div>
            )}
          </aside>
        </div>
      )}

      {toast && <div className="toast" onClick={() => setToast('')}>{toast}</div>}
    </div>
  )
}

export default App