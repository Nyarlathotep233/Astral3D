new_tab("about:blank")

source = r"""
(() => {
  const descriptor = Object.getOwnPropertyDescriptor(
    HTMLImageElement.prototype,
    "src"
  );
  const base = `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256">
    <rect width="256" height="256" fill="#245a72"/>
    <path d="M0 64h256M0 128h256M0 192h256M64 0v256M128 0v256M192 0v256"
      stroke="#4b8c74" stroke-width="5"/>
    <circle cx="128" cy="128" r="62" fill="#6c8f55"/>
  </svg>`;
  const label = `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256">
    <rect width="256" height="256" fill="none"/>
    <text x="128" y="140" text-anchor="middle" font-size="34"
      font-family="sans-serif" fill="white" stroke="#18323f" stroke-width="2">GIS</text>
  </svg>`;

  window.__gisTileUrls = [];
  window.__allFetchUrls = [];
  window.__gisErrors = [];
  const originalConsoleError = console.error.bind(console);
  console.error = (...args) => {
    window.__gisErrors.push(args.map(value => String(value)).join(" "));
    originalConsoleError(...args);
  };
  addEventListener("error", event => {
    window.__gisErrors.push(String(event.error || event.message));
  });
  addEventListener("unhandledrejection", event => {
    window.__gisErrors.push(String(event.reason));
  });
  const originalFetch = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const url = String(typeof input === "string" ? input : input.url);
    window.__allFetchUrls.push(url);
    if (url.includes("tianditu.gov.cn")) {
      window.__gisTileUrls.push(url);
      const canvas = new OffscreenCanvas(256, 256);
      const context = canvas.getContext("2d");
      if (url.includes("/cva_w/")) {
        context.fillStyle = "rgba(24, 50, 63, 0.65)";
        context.fillRect(90, 105, 76, 46);
        context.fillStyle = "white";
        context.font = "34px sans-serif";
        context.fillText("GIS", 100, 140);
      } else {
        context.fillStyle = "#245a72";
        context.fillRect(0, 0, 256, 256);
        context.strokeStyle = "#4b8c74";
        context.lineWidth = 5;
        for (const value of [64, 128, 192]) {
          context.beginPath();
          context.moveTo(value, 0);
          context.lineTo(value, 256);
          context.moveTo(0, value);
          context.lineTo(256, value);
          context.stroke();
        }
        context.fillStyle = "#6c8f55";
        context.beginPath();
        context.arc(128, 128, 62, 0, Math.PI * 2);
        context.fill();
      }
      const blob = await canvas.convertToBlob({ type: "image/png" });
      return new Response(blob, {
        status: 200,
        headers: { "Content-Type": "image/png" }
      });
    }
    return originalFetch(input, init);
  };
  Object.defineProperty(HTMLImageElement.prototype, "src", {
    configurable: true,
    enumerable: descriptor.enumerable,
    get: descriptor.get,
    set(value) {
      const url = String(value);
      if (url.includes("tianditu.gov.cn")) {
        window.__gisTileUrls.push(url);
        const svg = url.includes("/cva_w/") ? label : base;
        value = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
      }
      return descriptor.set.call(this, value);
    }
  });
})();
"""

cdp("Page.addScriptToEvaluateOnNewDocument", source=source)
goto_url("https://localhost:8090/#/preview/gis-browser-smoke")
wait_for_load()
time.sleep(8)
print(page_info())

state = js("""
({
  gisEnabled: window.viewer?.modules?.gisLayer?.enabled,
  standardControlsEnabled: window.viewer?.modules?.controls?.enabled,
  globeControlsEnabled: window.viewer?.modules?.gisLayer?.controls?.enabled,
  tileGroupInScene:
    window.viewer?.modules?.gisLayer?.tiles?.group?.parent === window.viewer?.scene,
  tileGroupRenderOrder:
    window.viewer?.modules?.gisLayer?.tiles?.group?.renderOrder,
  atmosphereInScene:
    window.viewer?.modules?.gisLayer?.atmosphereGroup?.parent === window.viewer?.scene,
  atmosphereChildren:
    window.viewer?.modules?.gisLayer?.atmosphereGroup?.children.map(child =>
      child.material?.name
    ),
  atmosphereLutsUseGeneratorType: (() => {
    const generator = window.viewer?.modules?.gisLayer?.atmosphereGenerator;
    return [
      generator?.textures?.scatteringTexture,
      generator?.textures?.higherOrderScatteringTexture
    ].every(texture => texture?.type === generator?.type);
  })(),
  localStarsUrl: window.__allFetchUrls.find(url =>
    url.includes("/resource/gis/stars.bin")
  ),
  forbiddenRuntimeRequests: window.__allFetchUrls.filter(url =>
    /media[.]githubusercontent[.]com|google|cesium/i.test(url)
  ),
  tileUrlCount: window.__gisTileUrls.length,
  tileHosts: [...new Set(window.__gisTileUrls.map(url => new URL(url).hostname))],
  tileLayers: [...new Set(window.__gisTileUrls.map(url =>
    url.includes("/cva_w/") ? "cva_w" : "img_w"
  ))],
  errorCount: window.__gisErrors.length,
  errors: window.__gisErrors.slice(0, 5),
  renderCalls: window.viewer?.renderer?.info?.render?.calls,
  triangles: window.viewer?.renderer?.info?.render?.triangles,
  cameraPosition: window.viewer?.camera?.position?.toArray(),
  centerGeodetic: window.viewer?.modules?.gisLayer?.screenToGeodetic(
    window.viewer.container.offsetWidth / 2,
    window.viewer.container.offsetHeight / 2
  ),
  viewCubeDisplay: document.querySelector("#astral-viewer-helper")
    ? getComputedStyle(document.querySelector("#astral-viewer-helper")).display
    : "absent",
  resources: performance.getEntriesByType("resource")
    .map(entry => entry.name)
    .filter(url => url.startsWith("http") && !url.startsWith("https://localhost:8090"))
})
""")
print(state)
assert state["tileGroupRenderOrder"] == -1
assert state["atmosphereInScene"] is True
assert "SkyMaterial" in state["atmosphereChildren"]
assert "StarsMaterial" in state["atmosphereChildren"]
assert state["atmosphereLutsUseGeneratorType"] is True
assert state["localStarsUrl"].startswith("https://localhost:8090/")
assert state["forbiddenRuntimeRequests"] == []
assert not any("media.githubusercontent.com" in url for url in state["resources"])
assert state["errorCount"] == 0

canvas = js("""
(() => {
  const canvas = [...document.querySelectorAll("canvas")]
    .sort((a, b) => b.clientWidth * b.clientHeight - a.clientWidth * a.clientHeight)[0];
  const rect = canvas.getBoundingClientRect();
  return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
})()
""")
x = canvas["x"] + canvas["width"] * 0.5
y = canvas["y"] + canvas["height"] * 0.5
before = js("window.viewer.camera.position.toArray()")
cdp("Input.dispatchMouseEvent", type="mousePressed", x=x, y=y, button="left", clickCount=1)
cdp("Input.dispatchMouseEvent", type="mouseMoved", x=x + 180, y=y + 60, button="left", buttons=1)
cdp("Input.dispatchMouseEvent", type="mouseReleased", x=x + 180, y=y + 60, button="left", clickCount=1)
time.sleep(1)
after = js("window.viewer.camera.position.toArray()")
print({"cameraBefore": before, "cameraAfter": after})
print(capture_screenshot("C:/Users/80967/AppData/Local/Temp/astral-gis-smoke.png", max_dim=1800))

active_tab = current_tab()
for tab in list_tabs(include_chrome=False):
  if "localhost:8090" in tab["url"] and tab["targetId"] != active_tab["targetId"]:
    close_tab(tab)
close_tab(active_tab)
