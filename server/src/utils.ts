import { eq } from "drizzle-orm";
import { FastifyRequest } from "fastify";
import * as psl from "psl";
import { db } from "./db/postgres/postgres.js";
import { sites } from "./db/postgres/schema.js";

// 桌面操作系统集合
const desktopOS = new Set([
  "AIX",
  "macOS",
  "Windows",
  "Linux",
  "FreeBSD",
  "OpenBSD",
  "NetBSD",
  "DragonFly",
  "Solaris",
  "Unix",
  "HP-UX",
  "QNX",
  "BeOS",
  "Haiku",
  "OS/2",
  "ArcaOS",
  "OpenVMS",
  "RISC OS",
  "Plan9",
  "Hurd",
  "GNU",
  "Minix",
  "SerenityOS",
  "GhostBSD",
  "PC-BSD",
  "Arch",
  "CentOS",
  "Debian",
  "Deepin",
  "elementary OS",
  "Fedora",
  "Gentoo",
  "Knoppix",
  "Kubuntu",
  "Linpus",
  "Linspire",
  "Mageia",
  "Mandriva",
  "Manjaro",
  "Mint",
  "PCLinuxOS",
  "RedHat",
  "Sabayon",
  "Slackware",
  "SUSE",
  "Ubuntu",
  "Xubuntu",
  "VectorLinux",
  "Zenwalk",
  "Chrome OS",
  "Android-x86",
  "Fuchsia",
]);

// 移动操作系统集合
const mobileOS = new Set([
  "Android",
  "iOS",
  "watchOS",
  "Windows Phone",
  "Windows Mobile",
  "Windows CE",
  "BlackBerry",
  "Symbian",
  "Palm",
  "Bada",
  "Firefox OS",
  "KaiOS",
  "MeeGo",
  "Maemo",
  "Sailfish",
  "Tizen",
  "WebOS",
  "HarmonyOS",
  "OpenHarmony",
  "RIM Tablet OS",
  "Series40",
  "Ubuntu Touch",
  "Joli",
]);

// 电视操作系统集合
const tvOS = new Set([
  "Chromecast",
  "Chromecast Android",
  "Chromecast Fuchsia",
  "Chromecast Linux",
  "Chromecast SmartSpeaker",
  "NetTV",
]);

// 游戏操作系统集合
const gamingOS = new Set(["PlayStation", "Xbox", "Nintendo"]);

// 嵌入式操作系统集合
const embeddedOS = new Set(["Windows IoT", "Contiki", "Raspbian", "Morph OS", "Pico", "NetRange"]);

// 根据屏幕尺寸和用户代理获取设备类型
export function getDeviceType(screenWidth: number, screenHeight: number, ua: UAParser.IResult): string {
  if (ua.os.name) {
    if (desktopOS.has(ua.os.name)) {
      return "桌面";
    } else if (mobileOS.has(ua.os.name)) {
      return "移动";
    } else if (tvOS.has(ua.os.name)) {
      return "电视";
    } else if (gamingOS.has(ua.os.name)) {
      return "游戏机";
    } else if (embeddedOS.has(ua.os.name)) {
      return "嵌入式";
    }
  }

  const largerDimension = Math.max(screenWidth, screenHeight);
  const smallerDimension = Math.min(screenWidth, screenHeight);
  if (largerDimension > 1024) {
    return "桌面";
  } else if (largerDimension > 768 && smallerDimension > 1024) {
    return "平板";
  }
  return "移动";
}

// 从路径中提取站点ID
export const extractSiteId = (path: string) => {
  // 如果存在查询参数则移除
  const pathWithoutQuery = path.split("?")[0];

  // 处理路由模式:
  // /route/:site
  // /route/:sessionId/:site
  // /route/:userId/:site
  const segments = pathWithoutQuery.split("/").filter(Boolean);
  if (segments.length >= 2) {
    return segments[segments.length - 1];
  }
  return null;
};

// 字符串ID到数字ID查找的缓存，避免重复数据库查询
const siteIdCache = new Map<string, number>();

// 将站点标识符（字符串ID或数字ID）解析为其数字siteId
// 返回数字siteId，如果未找到则返回null
export const resolveNumericSiteId = async (siteIdentifier: string): Promise<number | null> => {
  // 首先检查缓存
  if (siteIdCache.has(siteIdentifier)) {
    return siteIdCache.get(siteIdentifier)!;
  }

  // 在数据库中查找字符串ID
  try {
    const site = await db.select({ siteId: sites.siteId }).from(sites).where(eq(sites.id, siteIdentifier)).limit(1);

    if (site.length > 0) {
      const numericId = site[0].siteId;
      // 缓存结果
      siteIdCache.set(siteIdentifier, numericId);
      return numericId;
    }
  } catch (error) {
    console.error("解析站点ID时出错:", error);
  }

  if (/^\d+$/.test(siteIdentifier)) {
    return parseInt(siteIdentifier, 10);
  }

  return null;
};

// 用数字ID替换URL路径中的站点ID
export const replacePathSiteId = (path: string, numericId: number): string => {
  const [pathPart, queryPart] = path.split("?");
  const segments = pathPart.split("/");

  // 替换最后一个段落（即站点ID）
  if (segments.length >= 2) {
    segments[segments.length - 1] = String(numericId);
  }

  return queryPart ? `${segments.join("/")}?${queryPart}` : segments.join("/");
};

// 通过移除所有子域前缀来规范化域名/主机名
// 接受完整URL或仅主机名
export const normalizeOrigin = (input: string): string => {
  try {
    let hostname: string;

    // 如果输入看起来像URL，则提取主机名；否则视为主机名
    if (input.includes("://")) {
      hostname = new URL(input).hostname;
    } else {
      hostname = input;
    }

    hostname = hostname.toLowerCase();

    // 处理IP地址和localhost - 原样返回
    if (hostname === "localhost" || /^\d+\.\d+\.\d+\.\d+$/.test(hostname)) {
      return hostname;
    }

    // 使用公共后缀列表获取可注册域名
    const parsed = psl.parse(hostname);

    // 如果解析失败或未找到域名，则回退到简单逻辑
    if (parsed.error || !parsed.domain) {
      const parts = hostname.split(".");
      if (parts.length < 2) {
        return hostname;
      }
      // 默认回退：取最后2个部分
      return parts.slice(-2).join(".");
    }

    // 返回可注册域名（域名+公共后缀）
    return parsed.domain;
  } catch {
    // 任何错误的回退：尝试简单的域名提取
    try {
      let hostname = input.includes("://") ? new URL(input).hostname : input;
      hostname = hostname.toLowerCase();

      if (hostname === "localhost" || /^\d+\.\d+\.\d+\.\d+$/.test(hostname)) {
        return hostname;
      }

      const parts = hostname.split(".");
      return parts.length >= 2 ? parts.slice(-2).join(".") : hostname;
    } catch {
      return input;
    }
  }
};

// 获取IP地址的辅助函数
export const getIpAddress = (request: FastifyRequest): string => {
  // 优先级1: Cloudflare头部（已由CF验证）
  const cfConnectingIp = request.headers["cf-connecting-ip"];
  if (cfConnectingIp && typeof cfConnectingIp === "string") {
    return cfConnectingIp.trim();
  }

  // 优先级2: X-Forwarded-For - 只使用第一个IP
  const forwardedFor = request.headers["x-forwarded-for"];
  if (forwardedFor && typeof forwardedFor === "string") {
    const ips = forwardedFor
      .split(",")
      .map(ip => ip.trim())
      .filter(Boolean);
    if (ips.length > 0) {
      // 总是使用第一个IP - 原始客户端
      return ips[0];
    }
  }

  return request.ip;
};