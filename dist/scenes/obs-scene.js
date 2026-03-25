const BASE_WIDTH = 2560;
const BASE_HEIGHT = 1440;

function applySceneScale() {
  const scale = Math.min(window.innerWidth / BASE_WIDTH, window.innerHeight / BASE_HEIGHT);
  document.documentElement.style.setProperty("--scene-scale", scale.toFixed(5));
}

applySceneScale();
window.addEventListener("resize", applySceneScale, { passive: true });
