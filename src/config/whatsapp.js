export const resolveBusinessWhatsAppNumber = (runtimeEnv = typeof import.meta !== 'undefined' ? import.meta.env : undefined) => {
  const configuredValue = runtimeEnv?.VITE_BUSINESS_WHATSAPP_NUMBER ?? ''
  return String(configuredValue).trim()
}

export const BUSINESS_WHATSAPP_NUMBER = resolveBusinessWhatsAppNumber()

const getEffectiveBusinessWhatsAppNumber = (businessNumberOverride) => {
  const explicitNumber = typeof businessNumberOverride === 'string' ? businessNumberOverride.trim() : ''
  if (explicitNumber) {
    return explicitNumber
  }

  return resolveBusinessWhatsAppNumber()
}

export const buildWhatsAppOrderMessage = ({
  productName,
  price,
  quantity = 1,
  variant = 'Default',
  productSku = '',
  productId = '',
  customerName = 'Guest',
  customerPhone = '',
}) => {
  const reference = productSku || productId || 'N/A'
  const displayName = String(customerName || 'Guest').trim() || 'Guest'
  const phoneLine = String(customerPhone || '').trim()
  const productMessage = `Hello GIGI COLLECTION, I am interested in ordering the following product:\n\nCustomer: ${displayName}\nPhone: ${phoneLine || 'Not supplied'}\nProduct: ${productName}\nReference: ${reference}\nVariant: ${variant}\nQuantity: ${quantity}\nPrice: KES ${Number(price).toLocaleString('en-KE')}\n\nPlease confirm availability and the next steps to complete the order.`

  return productMessage
}

export const createWhatsAppLink = ({
  productName,
  price,
  quantity = 1,
  variant = 'Default',
  productReference = '',
  productId = '',
  customerName = 'Guest',
  customerPhone = '',
  businessNumber,
}) => {
  const effectiveNumber = getEffectiveBusinessWhatsAppNumber(businessNumber)
  const message = buildWhatsAppOrderMessage({
    productName,
    price,
    quantity,
    variant,
    productSku: productReference,
    productId,
    customerName,
    customerPhone,
  })
  const encodedMessage = encodeURIComponent(message)

  if (!effectiveNumber) {
    return null
  }

  return `https://wa.me/${effectiveNumber}?text=${encodedMessage}`
}

export const createCartWhatsAppLink = ({ items = [], customerName = 'Guest', customerPhone = '', customerNote = '', businessNumber } = {}) => {
  const effectiveNumber = getEffectiveBusinessWhatsAppNumber(businessNumber)

  if (!effectiveNumber) {
    return null
  }

  const subtotal = items.reduce((sum, item) => sum + Number(item.price || item.product?.price || 0) * Number(item.quantity || 0), 0)
  const displayName = String(customerName || 'Guest').trim() || 'Guest'
  const customerPhoneLine = String(customerPhone || '').trim()
  const lineItems = items
    .map((item) => {
      const product = item.product || {}
      const reference = product.sku || product.id || 'N/A'
      return `- ${product.name || item.name} | Ref: ${reference} | ${item.variant || 'Default'} x${item.quantity} = KES ${Number((Number(product.price || item.price || 0) * Number(item.quantity || 0))).toLocaleString('en-KE')}`
    })
    .join('\n')

  const message = `Hello GIGI COLLECTION, I would like to place an order from the website.\n\nCustomer: ${displayName}\nPhone: ${customerPhoneLine || 'Not supplied'}\n\n${lineItems}\n\nSubtotal: KES ${Number(subtotal).toLocaleString('en-KE')}\n${customerNote ? `Note: ${customerNote}\n` : ''}Please confirm availability and the next steps to complete the order.`

  return `https://wa.me/${effectiveNumber}?text=${encodeURIComponent(message)}`
}
