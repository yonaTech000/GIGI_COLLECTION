export const hiddenDashboardRoute = '/gc-portal'
export const authLoginRoute = `${hiddenDashboardRoute}/login`
export const authSignupRoute = `${hiddenDashboardRoute}/signup`
export const authOtpRoute = `${hiddenDashboardRoute}/verify-otp`
export const authForgotPasswordRoute = `${hiddenDashboardRoute}/forgot-password`

export const authPublicRoutes = [
  `${hiddenDashboardRoute}/setup`,
  authLoginRoute,
  authSignupRoute,
  authOtpRoute,
  authForgotPasswordRoute,
]

export const isPublicAuthRoute = (path) => {
  const normalizedPath = path || '/'
  return normalizedPath === hiddenDashboardRoute || normalizedPath === `${hiddenDashboardRoute}/` || authPublicRoutes.includes(normalizedPath)
}

export const getAuthRouteSwap = (path) => {
  if (path === authSignupRoute || path === authOtpRoute) {
    return authLoginRoute
  }

  return authSignupRoute
}
