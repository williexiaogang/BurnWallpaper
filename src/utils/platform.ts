export const isMacOS = navigator.userAgent.includes("Mac");
export const isWindows = navigator.userAgent.includes("Windows");

const systemName = isMacOS ? "macOS" : isWindows ? "Windows" : "系统";

export const platformCopy = {
  credentialStore: isMacOS ? "macOS 钥匙串" : isWindows ? "Windows 凭据管理器" : "系统凭据",
  loginIntro: `登录 ${systemName} 就自动开工，醒来就是新壁纸。`,
  loginHint: `登录 ${systemName} 后自动运行`,
};
