// Where the console's own files are served from: the folder above this
// version's console.js (console/<version>/), where scripts/build.js puts
// vendor/. Read while the bundle first runs, the only time currentScript is it.
export const VENDOR = (() => {
  try { return new URL('../vendor', document.currentScript?.src ?? location.href).href } catch { return '/console/vendor' }
})()
