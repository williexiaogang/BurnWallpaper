export const isMacOS = navigator.userAgent.includes("Mac");
export const isWindows = navigator.userAgent.includes("Windows");

export const platformCopy = {
  credentialStore: isMacOS ? "macOS 钥匙串" : isWindows ? "Windows 凭据管理器" : "系统凭据",
};

