// PR 414 follow-up (CN-013 go-live gate phase 2) — the devices and the networks of the gate runs. Each device is a
// Playwright context descriptor (screen, pixel ratio, touch, user agent) plus a CPU slow-down for Chrome DevTools; each
// network a DevTools throttling profile (Network.emulateNetworkConditions: bytes per second and round-trip latency).
// The numbers are Chrome DevTools' own presets (Slow 3G, Fast 3G, Fast 4G) and an office wifi; they shape the browser
// only, never the shop. Most of the owner's orders come from phones, so most scenarios take a phone.

const UA_ANDROID = (model) => `Mozilla/5.0 (Linux; Android 13; ${model}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36`;
const UA_IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
const UA_IPAD = "Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
const UA_DESKTOP = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";

/** `kind` phone | tablet | desktop (the report's phone-vs-desktop split counts a tablet with the phones' touch screens). */
export const DEVICES = {
  "android-low": { label: "Low-end Android (360×640, 4× slower CPU)", kind: "phone", cpu: 4, context: { viewport: { width: 360, height: 640 }, screen: { width: 360, height: 640 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: UA_ANDROID("SM-A055F") } },
  "android-mid": { label: "Mid Android (393×873)", kind: "phone", cpu: 2, context: { viewport: { width: 393, height: 873 }, screen: { width: 393, height: 873 }, deviceScaleFactor: 2.75, isMobile: true, hasTouch: true, userAgent: UA_ANDROID("23021RAA2Y") } },
  iphone: { label: "iPhone 13/14 (390×844)", kind: "phone", cpu: 1, context: { viewport: { width: 390, height: 844 }, screen: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, userAgent: UA_IPHONE } },
  "iphone-se": { label: "iPhone SE (375×667)", kind: "phone", cpu: 1, context: { viewport: { width: 375, height: 667 }, screen: { width: 375, height: 667 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: UA_IPHONE } },
  tablet: { label: "Tablet (820×1180)", kind: "tablet", cpu: 1, context: { viewport: { width: 820, height: 1180 }, screen: { width: 820, height: 1180 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: UA_IPAD } },
  "desktop-1366": { label: "Desktop 1366×768", kind: "desktop", cpu: 1, context: { viewport: { width: 1366, height: 768 }, screen: { width: 1366, height: 768 }, deviceScaleFactor: 1, isMobile: false, hasTouch: false, userAgent: UA_DESKTOP } },
  "desktop-1920": { label: "Desktop 1920×1080", kind: "desktop", cpu: 1, context: { viewport: { width: 1920, height: 1080 }, screen: { width: 1920, height: 1080 }, deviceScaleFactor: 1, isMobile: false, hasTouch: false, userAgent: UA_DESKTOP } },
};

const kbps = (k) => Math.round((k * 1000) / 8);

/**
 * DevTools' presets: `latencyMs` is the round trip added to every request; down/up in bytes per second. `budget`: the
 * Lighthouse budget (lighthouserc.json) is set for a mobile on a fast connection, so its flags count on 4G and wifi;
 * on 3G the timings are reported and flagged as information only.
 */
export const NETWORKS = {
  "slow-3g": { label: "Slow 3G", latencyMs: 2000, down: kbps(400), up: kbps(400), budget: false },
  "fast-3g": { label: "Fast 3G", latencyMs: 563, down: kbps(1440), up: kbps(675), budget: false },
  "4g": { label: "4G", latencyMs: 165, down: kbps(8100), up: kbps(1350), budget: true },
  wifi: { label: "Wifi", latencyMs: 10, down: kbps(30000), up: kbps(15000), budget: true },
};

/** The device (an unknown id is a mistake in the scenario list, so it throws). */
export function deviceOf(id) {
  const d = DEVICES[id];
  if (!d) throw new Error(`no device profile "${id}"`);
  return d;
}

export function networkOf(id) {
  const n = NETWORKS[id];
  if (!n) throw new Error(`no network profile "${id}"`);
  return n;
}

/** phone | desktop, for the timings table (a tablet is a touch screen: it goes with the phones). */
export const classOf = (deviceId) => (deviceOf(deviceId).kind === "desktop" ? "desktop" : "phone");

/**
 * Shapes one page's browser through Chrome DevTools: the network (and offline when asked) and the CPU. Returns the
 * session, so a scenario can drop the network mid-checkout (`offline(session, true)`) and bring it back.
 */
export async function throttle(page, deviceId, networkId) {
  const d = deviceOf(deviceId);
  const n = networkOf(networkId);
  const session = await page.context().newCDPSession(page);
  await session.send("Network.enable");
  await session.send("Network.emulateNetworkConditions", { offline: false, latency: n.latencyMs, downloadThroughput: n.down, uploadThroughput: n.up });
  if (d.cpu > 1) await session.send("Emulation.setCPUThrottlingRate", { rate: d.cpu });
  session.__gateNetwork = n;
  return session;
}

/** The network down (true) or back as it was (false). */
export async function offline(session, on) {
  const n = session.__gateNetwork ?? NETWORKS.wifi;
  await session.send("Network.emulateNetworkConditions", { offline: !!on, latency: n.latencyMs, downloadThroughput: n.down, uploadThroughput: n.up });
}

/** The Playwright context options of a device (a copy: the caller may add cookies or a locale). */
export const contextOf = (deviceId) => structuredClone(deviceOf(deviceId).context);

/** How much longer a step may take on this network and device than on wifi (the waits of the run scale with it). */
export function slowFactor(deviceId, networkId) {
  const n = networkOf(networkId);
  return Math.max(1, Math.round((n.latencyMs / 165 + 8100 / Math.max(1, (n.down * 8) / 1000)) / 2)) * Math.max(1, deviceOf(deviceId).cpu / 2);
}
