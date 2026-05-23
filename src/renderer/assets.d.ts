// Ambient declarations for static assets imported as URLs (handled by Vite).
// This file must stay a global script (no top-level import/export).
declare module '*.wav' {
  const src: string
  export default src
}
declare module '*.png' {
  const src: string
  export default src
}
