// Types for importing assets (images, stylesheets) the way Vite handles them
/// <reference types="vite/client" />

// Set when the app is built (vite.config.ts): the version, the commit's short hash and the day, as YYYY-MM-DD
declare const __APP_VERSION__: string;
declare const __APP_COMMIT__: string;
declare const __APP_BUILT__: string;
