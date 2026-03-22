// Stubs for Node.js builtins that get pulled in by the filesystem adapter.
// The blog only uses the virtual adapter so these are never called.
const noop = () => {}
export const readdir = noop
export const readFile = noop
export const writeFile = noop
export const unlink = noop
export const mkdir = noop
export const join = noop
export const extname = noop
export const basename = noop
export const resolve = noop
export const existsSync = () => false
export default {}
