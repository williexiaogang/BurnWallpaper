/**
 * 應用版本信息。數值由 vite.config.ts 在構建時注入：
 * - `APP_VERSION`：讀 package.json 的 version，不用手動同步
 * - `APP_BUILD_STAMP`：構建時刻（yyyyMMdd.HHmm），作為版本號的一部分，
 *   每次打包都有唯一標識，日誌/排障時能對上「用戶跑的是哪個包」
 */
export const APP_VERSION: string = typeof __APP_VERSION__ === "string" ? __APP_VERSION__ : "0.0.0";
export const APP_BUILD_STAMP: string = typeof __APP_BUILD_STAMP__ === "string" ? __APP_BUILD_STAMP__ : "unknown";

/** 展示用完整版本號，如 `v0.1.0+build.20261117.0042`。 */
export const APP_VERSION_LABEL = `v${APP_VERSION}+build.${APP_BUILD_STAMP}`;
