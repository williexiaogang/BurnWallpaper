/// <reference types="vite/client" />

/** 由 vite.config.ts 的 define 注入：版本號（package.json）與構建時間戳（yyyyMMdd.HHmm）。 */
declare const __APP_VERSION__: string;
declare const __APP_BUILD_STAMP__: string;
