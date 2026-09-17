// Gate the dashboard behind the login screen when the server requires a
// password. Runs on every route, on the client only (the SPA is ssr: false).
export default defineNuxtRouteMiddleware(async (to) => {
  const { required, authenticated, loaded, refresh } = useAuth()

  // Ask the backend once per page load; the answer cannot change underneath us.
  if (!loaded.value) {
    await refresh()
  }

  if (required.value && !authenticated.value && to.path !== '/login') {
    return navigateTo('/login')
  }

  // Already signed in (or no password configured): the login page is pointless.
  if (to.path === '/login' && (!required.value || authenticated.value)) {
    return navigateTo('/')
  }
})
