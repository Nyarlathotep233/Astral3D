import http from "node:http";

const scene = {
  id: "gis-browser-smoke",
  sceneType: "其他",
  sceneName: "GIS 浏览器验证",
  sceneIntroduction: "",
  sceneVersion: 1,
  projectType: 1,
  coverPicture: "",
  hasDrawing: 0,
  zip: "",
  zipSize: "0KB",
  gisConfig: JSON.stringify({
    tiandituToken: "browser-smoke-token",
    initialView: {
      longitude: 104,
      latitude: 35,
      altitude: 20_000_000,
    },
  }),
};

const server = http.createServer((request, response) => {
  response.setHeader("Content-Type", "application/json; charset=utf-8");

  if (request.url === "/api/editor3d/scenes/get/gis-browser-smoke") {
    response.end(JSON.stringify({ code: 200, result: scene, message: "ok" }));
    return;
  }

  response.end(JSON.stringify({
    code: 200,
    result: { items: [], pages: 0, total: 0 },
    message: "ok",
  }));
});

server.listen(8080, "127.0.0.1", () => {
  console.log("GIS browser smoke backend listening on http://127.0.0.1:8080");
});
