import { supabase } from './supabase.js'

const PROFILE_SELECT = 'id, username, phone, role, email'

const normalizePhoneNumber = (phone) => {
  if (!phone) {
    return ''
  }

  const digits = phone.replace(/\D/g, '')
  if (!digits) {
    return ''
  }

  return digits.startsWith('0') ? `+254${digits.slice(1)}` : `+${digits}`
}

export const isValidPhoneNumber = (phone) => {
  const digits = String(phone ?? '').replace(/\D/g, '')
  return digits.length >= 10 && digits.length <= 15
}

const isValidEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim())

const isStrongPassword = (password) => /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/.test(password)

export const AUTHORIZED_ADMIN_ROLES = ['developer', 'owner']

export const isAuthenticatedSession = (session) => Boolean(session?.authenticated)
export const isDeveloperSession = (session) => session?.role === 'developer'
export const isOwnerSession = (session) => session?.role === 'owner'
export const isAuthorizedAdminRole = (role) => AUTHORIZED_ADMIN_ROLES.includes(role)
export const isAuthorizedAdminSession = (session) => isAuthorizedAdminRole(session?.role)
export const isCustomerRole = (role) => role === 'customer'

const getProfileByUsername = async (username) => {
  if (!supabase) {
    return null
  }

  const trimmedUsername = username?.trim()

  if (!trimmedUsername) {
    return null
  }

  const { data, error } = await supabase
    .from('profiles')
    .select(PROFILE_SELECT)
    .ilike('username', trimmedUsername)
    .maybeSingle()

  if (error) {
    console.error('Profile lookup failed:', error)
    return null
  }

  return data
}

const getProfileByPhone = async (phone) => {
  if (!supabase) {
    return null
  }

  const normalizedPhone = normalizePhoneNumber(phone)

  if (!normalizedPhone) {
    return null
  }

  const { data, error } = await supabase
    .from('profiles')
    .select(PROFILE_SELECT)
    .eq('phone', normalizedPhone)
    .maybeSingle()

  if (error) {
    console.error('Phone profile lookup failed:', error)
    return null
  }

  return data
}

const getProfileByEmail = async (email) => {
  if (!supabase) {
    return null
  }

  const trimmedEmail = email?.trim()

  if (!trimmedEmail) {
    return null
  }

  const { data, error } = await supabase
    .from('profiles')
    .select(PROFILE_SELECT)
    .ilike('email', trimmedEmail)
    .maybeSingle()

  if (error) {
    console.error('Email profile lookup failed:', error)
    return null
  }

  return data
}

export const getProfileByUsernameOrPhone = async (value) => {
  if (!value) {
    return null
  }

  const trimmedValue = value.trim()
  if (!trimmedValue) {
    return null
  }

  const byUsername = await getProfileByUsername(trimmedValue)
  if (byUsername) {
    return byUsername
  }

  const byEmail = await getProfileByEmail(trimmedValue)
  if (byEmail) {
    return byEmail
  }

  return getProfileByPhone(trimmedValue)
}

export const checkUsernameAvailability = async (username) => {
  if (!supabase) {
    return { available: false, message: 'Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to continue.' }
  }

  const trimmedUsername = username?.trim()

  if (!trimmedUsername) {
    return { available: false, message: 'Enter a username to continue.' }
  }

  const { data, error } = await supabase
    .from('profiles')
    .select('id')
    .ilike('username', trimmedUsername)
    .limit(1)

  if (error) {
    console.error('Username availability check failed:', error)
    return { available: false, message: 'Unable to verify username availability right now.' }
  }

  if (data && data.length > 0) {
    return { available: false, message: 'Username is already taken.' }
  }

  return { available: true, message: 'Username is available.' }
}

export const buildCustomerSignupMetadata = ({ fullName, email, phone, username } = {}) => {
  const trimmedFullName = String(fullName ?? '').trim()
  const trimmedEmail = String(email ?? '').trim()
  const trimmedUsername = String(username ?? '').trim()
  const normalizedPhone = normalizePhoneNumber(phone)

  return {
    full_name: trimmedFullName || null,
    username: trimmedUsername || null,
    email: trimmedEmail || null,
    phone: normalizedPhone || null,
  }
}

export const buildCustomerProfileRecord = ({ id, email, phone, username } = {}) => {
  const trimmedUsername = String(username ?? '').trim() || `customer-${String(id ?? '').slice(0, 8) || 'user'}`
  const trimmedEmail = String(email ?? '').trim()
  const normalizedPhone = normalizePhoneNumber(phone)

  return {
    id,
    username: trimmedUsername,
    email: trimmedEmail || null,
    phone: normalizedPhone || null,
    role: 'customer',
  }
}

export const ensureCustomerProfileRecord = async ({ id, email, phone, username }) => {
  if (!id) {
    return null
  }

  return buildCustomerProfileRecord({ id, email, phone, username })
}

export const getPrototypeAccounts = async () => {
  if (!supabase) {
    return []
  }

  const { data, error } = await supabase
    .from('profiles')
    .select(PROFILE_SELECT)
    .order('username', { ascending: true })

  if (error) {
    console.error('Unable to load profiles:', error)
    return []
  }

  return data ?? []
}

export const createAccountPrototype = async ({ username, email, password, role }) => {
  if (!supabase) {
    return {
      success: false,
      message: 'Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to the project environment.',
    }
  }

  const trimmedUsername = username?.trim()

  if (!trimmedUsername || !email || !password || !role) {
    return {
      success: false,
      message: 'Account creation is disabled in the browser. Use the secure Supabase dashboard and SQL setup process described in the project documentation.',
    }
  }

  return {
    success: false,
    message: 'Public registration is disabled. Create the developer and owner accounts through the secure Supabase admin workflow and then sign in with those accounts.',
  }
}

export const signUpCustomer = async ({ fullName, email, phone, username, password, confirmPassword }) => {
  if (!supabase) {
    return {
      success: false,
      message: 'Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to continue.',
    }
  }

  const trimmedFullName = fullName?.trim()
  const trimmedEmail = email?.trim()
  const trimmedUsername = username?.trim()
  const normalizedPhone = normalizePhoneNumber(phone)

  if (!trimmedFullName) {
    return {
      success: false,
      message: 'Enter your full name to continue.',
    }
  }

  if (!trimmedEmail || !isValidEmail(trimmedEmail)) {
    return {
      success: false,
      message: 'Enter a valid email address.',
    }
  }

  if (!normalizedPhone || !isValidPhoneNumber(normalizedPhone)) {
    return {
      success: false,
      message: 'Enter a valid phone number.',
    }
  }

  if (!trimmedUsername || trimmedUsername.length < 3) {
    return {
      success: false,
      message: 'Choose a username with at least 3 characters.',
    }
  }

  const availability = await checkUsernameAvailability(trimmedUsername)
  if (!availability.available) {
    return {
      success: false,
      message: availability.message || 'Username is already taken.',
    }
  }

  if (!password || !isStrongPassword(password)) {
    return {
      success: false,
      message: 'Use a strong password with at least 8 characters, including uppercase, lowercase, a number and a symbol.',
    }
  }

  if (confirmPassword !== undefined && password !== confirmPassword) {
    return {
      success: false,
      message: 'Passwords do not match.',
    }
  }

  const metadata = buildCustomerSignupMetadata({
    fullName: trimmedFullName,
    email: trimmedEmail,
    phone: normalizedPhone,
    username: trimmedUsername,
  })

  const redirectTarget = typeof window !== 'undefined' ? `${window.location.origin}/gc-portal/login?confirmed=1` : undefined

  const { data, error } = await supabase.auth.signUp({
    email: trimmedEmail,
    password,
    options: {
      data: metadata,
      emailRedirectTo: redirectTarget,
    },
  })

  if (error) {
    return {
      success: false,
      message: error.message || 'Unable to create this account.',
    }
  }

  const authUser = data?.user ?? null

  return {
    success: true,
    user: authUser,
    message: 'Check your email for a confirmation link. Once confirmed, sign in with your email and password.',
  }
}

export const resendCustomerConfirmationEmail = async ({ email }) => {
  if (!supabase) {
    return {
      success: false,
      message: 'Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to continue.',
    }
  }

  const trimmedEmail = email?.trim()
  if (!trimmedEmail || !isValidEmail(trimmedEmail)) {
    return {
      success: false,
      message: 'Enter a valid email address before requesting a new confirmation email.',
    }
  }

  const redirectTarget = typeof window !== 'undefined' ? `${window.location.origin}/gc-portal/login?confirmed=1` : undefined

  const { error } = await supabase.auth.resend({
    type: 'signup',
    email: trimmedEmail,
    options: {
      emailRedirectTo: redirectTarget,
    },
  })

  if (error) {
    return {
      success: false,
      message: error.message || 'The confirmation email could not be resent.',
    }
  }

  return {
    success: true,
    message: 'A new confirmation email has been sent. Check your inbox and confirm it before signing in.',
  }
}

export const signInPrototype = async ({ username, password }) => {
  if (!supabase) {
    return {
      success: false,
      message: 'Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to continue.',
    }
  }

  const identifier = username?.trim()
  if (!identifier || !password) {
    return {
      success: false,
      message: 'Enter your email address and password.',
    }
  }

  if (!isValidEmail(identifier)) {
    return {
      success: false,
      message: 'Use your email address and password to sign in.',
    }
  }

  const { data, error } = await supabase.auth.signInWithPassword({
    email: identifier,
    password,
  })

  if (error) {
    const message = error.message || 'The email or password is incorrect.'
    if (/confirm.*email|email.*not.*confirmed/i.test(message)) {
      return {
        success: false,
        message: 'Your email has not been confirmed yet. Check your inbox for the confirmation link or request a new one.',
      }
    }

    return {
      success: false,
      message,
    }
  }

  const { data: profileData, error: profileError } = await supabase
    .from('profiles')
    .select('id, username, role, phone, email')
    .eq('id', data.user.id)
    .maybeSingle()

  if (profileError) {
    console.warn('Profile lookup failed during sign-in; using auth metadata as a fallback:', profileError)
  }

  const fallbackUsername = profileData?.username || data.user.user_metadata?.username || data.user.email?.split('@')[0] || 'customer'
  const fallbackRole = profileData?.role || 'customer'

  return {
    success: true,
    session: {
      id: data.user.id,
      username: fallbackUsername,
      role: fallbackRole,
      email: profileData?.email ?? data.user.email,
      phone: profileData?.phone ?? data.user.user_metadata?.phone ?? null,
      authenticated: true,
      createdAt: data.session?.created_at ?? new Date().toISOString(),
    },
  }
}

export const signInWithUsernameOrPhone = signInPrototype

export const getCurrentSession = async () => {
  if (!supabase) {
    return null
  }

  const {
    data: { session },
    error,
  } = await supabase.auth.getSession()

  if (error || !session) {
    return null
  }

  const { data: profileData, error: profileError } = await supabase
    .from('profiles')
    .select('id, username, role, phone, email')
    .eq('id', session.user.id)
    .maybeSingle()

  if (profileError) {
    console.warn('Profile lookup failed while loading the active session; falling back to auth metadata:', profileError)
  }

  if (!profileData) {
    return {
      id: session.user.id,
      username: session.user.user_metadata?.username || session.user.email?.split('@')[0] || 'customer',
      role: 'customer',
      email: session.user.email,
      phone: session.user.phone ?? null,
      authenticated: true,
      createdAt: session.user.created_at,
    }
  }

  return {
    id: session.user.id,
    username: profileData.username,
    role: profileData.role || 'customer',
    email: profileData.email ?? session.user.email,
    phone: profileData.phone ?? session.user.phone ?? null,
    authenticated: true,
    createdAt: session.user.created_at,
  }
}

export const signOutPrototype = async () => {
  if (!supabase) {
    return { success: false, message: 'Supabase is not configured.' }
  }

  const { error } = await supabase.auth.signOut()

  if (error) {
    return {
      success: false,
      message: error.message,
    }
  }

  return {
    success: true,
    message: 'Signed out.',
  }
}

export const clearPrototypeAccounts = async () => {
  return signOutPrototype()
}
