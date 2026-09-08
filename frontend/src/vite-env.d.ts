/// <reference types="vite/client" />

/**
 * Build-time variables Vite inlines into the bundle.
 *
 * Only VITE_-prefixed names are exposed, and they are substituted at BUILD
 * time — there is no runtime lookup, which is why GIT_SHA has to be set before
 * `npm run build` in the Dockerfile rather than passed to the container.
 */
interface ImportMetaEnv {
  /** Git SHA of the commit this bundle was built from; empty in local dev. */
  readonly VITE_GIT_SHA?: string;
  /** Contents of the repo's VERSION file at build time. */
  readonly VITE_APP_VERSION?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
