const STORAGE_KEY = "mario-control-center-config";
const PRESET_KEY = "mario-control-center-presets";
const PLAYER_SKIN_PATH = "../../IMG_20260326_142958.jpg";
const COIN_SKIN_PATH = "../../pixel_art.png";
const GOOMBA_SKIN_PATH = "../../videoframe_14400.png";

const defaults = {
  mode: "world",
  world: "1",
  level: "1",
  randomBiome: "Overworld",
  speed: 1,
  zoom: 0.9,
  lives: 3,
  time: 350,
  fast: false,
  mute: false,
  presetName: "",
};

const elements = {
  frame: document.getElementById("game-frame"),
  status: document.getElementById("game-status"),
  mapMode: document.getElementById("map-mode"),
  world: document.getElementById("world"),
  level: document.getElementById("level"),
  randomBiome: document.getElementById("random-biome"),
  speed: document.getElementById("speed"),
  speedValue: document.getElementById("speed-value"),
  zoom: document.getElementById("zoom"),
  zoomValue: document.getElementById("zoom-value"),
  frameShell: document.querySelector(".game-frame-shell"),
  lives: document.getElementById("lives"),
  time: document.getElementById("time"),
  fast: document.getElementById("toggle-fast"),
  mute: document.getElementById("toggle-mute"),
  playOverlay: document.getElementById("play-overlay"),
  playGame: document.getElementById("play-game"),
  activeMapPill: document.getElementById("active-map-pill"),
  presetPill: document.getElementById("preset-pill"),
  presetName: document.getElementById("preset-name"),
  presetList: document.getElementById("preset-list"),
  customCommand: document.getElementById("custom-command"),
};

let gameWindow = null;
let gameReady = false;
let gameStarted = false;
let gameLocked = false;
let gameLoading = false;
let pendingStart = false;
let syncTimer = null;

function boot() {
  window.launcherFocusGame = lockGameFrame;
  window.unlockGameFrameFromChild = unlockGameFrame;
  window.isGameInputLocked = () => gameLocked;
  bindEvents();
  hydrateFromStoredConfig();
  renderPresetList();
  updateValueLabels();
  applyZoom();
  updateModeState();
  updateURL();
}

function bindEvents() {
  document.getElementById("apply-config").addEventListener("click", applyCurrentConfig);
  document.getElementById("reset-config").addEventListener("click", resetLauncher);
  document.getElementById("copy-link").addEventListener("click", copyShareLink);
  document.getElementById("open-editor").addEventListener("click", () => withGame((game) => game.loadEditor()));
  document.getElementById("teleport").addEventListener("click", teleportToSelection);
  document.getElementById("run-command").addEventListener("click", runCustomCommand);
  document.getElementById("save-preset").addEventListener("click", savePreset);
  document.getElementById("load-preset").addEventListener("click", loadPreset);
  document.getElementById("delete-preset").addEventListener("click", deletePreset);
  document.getElementById("export-preset").addEventListener("click", exportPreset);
  elements.playGame.addEventListener("click", startGameExperience);
  elements.frameShell.addEventListener("click", handleFrameShellClick);
  window.addEventListener("keydown", handleGlobalKeydown);

  document.querySelectorAll("[data-action]").forEach((button) => {
    button.addEventListener("click", () => quickAction(button.dataset.action));
  });

  [
    elements.mapMode,
    elements.world,
    elements.level,
    elements.randomBiome,
    elements.speed,
    elements.zoom,
    elements.lives,
    elements.time,
    elements.fast,
    elements.mute,
    elements.presetName,
  ].forEach((control) => {
    control.addEventListener("input", onConfigInput);
    control.addEventListener("change", onConfigInput);
  });

  elements.frame.addEventListener("load", waitForGame);
}

function onConfigInput() {
  updateValueLabels();
  updateModeState();
  applyZoom();
  persistDraft();
}

function updateValueLabels() {
  elements.speedValue.textContent = `${elements.speed.value}x`;
  elements.zoomValue.textContent = `${Math.round(Number(elements.zoom.value) * 100)}%`;
}

function updateModeState() {
  const random = elements.mapMode.value === "random";
  elements.world.disabled = random;
  elements.level.disabled = random;
  elements.randomBiome.disabled = !random;
}

function waitForGame() {
  if (!elements.frame.getAttribute("src")) return;
  gameWindow = elements.frame.contentWindow;
  elements.status.textContent = "Đang nạp engine...";

  const start = Date.now();
  const interval = window.setInterval(() => {
    const game = elements.frame.contentWindow;
    if (game && typeof game.setMap === "function" && game.player && game.data) {
      window.clearInterval(interval);
      gameWindow = game;
      applyCustomPlayerSkin(game);
      attachEmbeddedFullscreenBridge(game);
      gameReady = true;
      gameLoading = false;
      elements.status.textContent = "Game đã sẵn sàng";
      elements.playGame.disabled = false;
      elements.playGame.textContent = "Play";
      if (pendingStart) {
        pendingStart = false;
        startGameExperience();
      }
      return;
    }

    if (Date.now() - start > 15000) {
      window.clearInterval(interval);
      gameLoading = false;
      pendingStart = false;
      elements.playGame.disabled = false;
      elements.playGame.textContent = "Play";
      elements.status.textContent = "Game nạp chậm, thử reload trang";
    }
  }, 250);
}

function withGame(callback) {
  if (!gameReady || !gameWindow) {
    elements.status.textContent = "Game chưa sẵn sàng";
    return;
  }

  try {
    callback(gameWindow);
  } catch (error) {
    console.error(error);
    elements.status.textContent = "Có lỗi khi áp dụng vào game";
  }
}

function currentConfig() {
  return {
    mode: elements.mapMode.value,
    world: elements.world.value,
    level: elements.level.value,
    randomBiome: elements.randomBiome.value,
    speed: Number(elements.speed.value),
    zoom: Number(elements.zoom.value),
    lives: Number(elements.lives.value),
    time: Number(elements.time.value),
    fast: elements.fast.checked,
    mute: elements.mute.checked,
    presetName: elements.presetName.value.trim(),
  };
}

function applyForm(config) {
  elements.mapMode.value = config.mode;
  elements.world.value = config.world;
  elements.level.value = config.level;
  elements.randomBiome.value = config.randomBiome;
  elements.speed.value = String(config.speed);
  elements.zoom.value = String(config.zoom);
  elements.lives.value = String(config.lives);
  elements.time.value = String(config.time);
  elements.fast.checked = Boolean(config.fast);
  elements.mute.checked = Boolean(config.mute);
  elements.presetName.value = config.presetName || "";
  updateValueLabels();
  updateModeState();
  applyZoom();
}

function applyCurrentConfig() {
  persistDraft(currentConfig());
  updateURL();
  updateDisplayPills();
  if (gameReady) {
    syncConfigToGame();
  } else {
    elements.status.textContent = "Đã lưu cấu hình, game sẽ áp dụng khi bấm Play";
  }
}

function syncConfigToGame() {
  const config = currentConfig();
  persistDraft(config);
  updateURL(config);
  updateDisplayPills(config);

  withGame((game) => {
    const targetMap = config.mode === "random"
      ? ["Random", config.randomBiome]
      : [Number(config.world), Number(config.level)];
    applyTargetMap(game, targetMap);

    // The legacy engine resets player/data while changing maps, so apply the rest shortly after.
    window.clearTimeout(syncTimer);
    syncTimer = window.setTimeout(() => {
      if (!game.data) return;

      game.fastforward(Math.max(0, config.speed - 1));
      game.data.time.amount = config.time;
      if (typeof game.updateDataElement === "function") {
        game.updateDataElement(game.data.time);
      }

      if (typeof game.setLives === "function") {
        game.setLives(config.lives);
      }

      syncBooleanToggle(game, "fastforwarding", config.fast, "toggleFastFWD");

      const muted = game.localStorage && game.localStorage.muted === "true";
      if (game.AudioPlayer && typeof game.AudioPlayer.toggleMute === "function" && muted !== config.mute) {
        game.AudioPlayer.toggleMute();
      }

      elements.status.textContent = "Đã đồng bộ launcher với game";
      if (gameStarted) {
        startThemeAudio(game, config);
      }
    }, 450);
  });
}

function syncBooleanToggle(game, flagName, desiredState, methodName) {
  if (Boolean(game[flagName]) !== desiredState && typeof game[methodName] === "function") {
    game[methodName]();
  }
}

function quickAction(action) {
  withGame((game) => {
    if (action === "powerup") {
      game.playerShroom(game.player);
    } else if (action === "star") {
      game.playerStar(game.player);
    } else if (action === "life") {
      game.gainLife(1);
    } else if (action === "random") {
      game.setMapRandom(elements.randomBiome.value);
    }
  });
}

function teleportToSelection() {
  const world = Number(document.getElementById("teleport-world").value);
  const level = Number(document.getElementById("teleport-level").value);
  withGame((game) => {
    applyTargetMap(game, [world, level]);
  });
  elements.activeMapPill.textContent = `Map: ${world}-${level}`;
}

function runCustomCommand() {
  const command = elements.customCommand.value.trim();
  if (!command) return;

  withGame((game) => {
    const executor = new game.Function(command);
    executor.call(game);
    elements.status.textContent = "Đã chạy lệnh custom";
  });
}

function applyZoom() {
  const zoom = Number(elements.zoom.value);
  elements.frame.style.transform = `scale(${zoom})`;
  elements.frame.style.width = `${100 / zoom}%`;
  elements.frame.style.height = `${560 / zoom}px`;
}

function handleFrameShellClick(event) {
  if (elements.playOverlay && elements.playOverlay.contains(event.target)) return;
  lockGameFrame();
}

function startGameExperience() {
  if (gameReady) {
    gameStarted = true;
    elements.playOverlay.classList.add("hidden");
    lockGameFrame();
    syncConfigToGame();
    withGame((game) => {
      focusGameFrame();
      startThemeAudio(game, currentConfig());
    });
    return;
  }

  if (gameLoading) {
    elements.status.textContent = "Game đang tải...";
    return;
  }

  pendingStart = true;
  gameLoading = true;
  elements.status.textContent = "Đang tải game...";
  elements.playGame.disabled = true;
  elements.playGame.textContent = "Loading...";
  elements.frame.setAttribute("src", elements.frame.dataset.src);
  waitForGame();
}

function focusGameFrame() {
  elements.frameShell.classList.add("active");
  if (elements.frame && typeof elements.frame.focus === "function") {
    elements.frame.focus();
  }
  if (gameWindow && typeof gameWindow.focus === "function") {
    gameWindow.focus();
  }
}

function lockGameFrame() {
  gameLocked = true;
  focusGameFrame();
}

function unlockGameFrame() {
  gameLocked = false;
  elements.frameShell.classList.remove("active");
  if (document.activeElement && typeof document.activeElement.blur === "function") {
    document.activeElement.blur();
  }
}

function handleGlobalKeydown(event) {
  if (!gameLocked) return;

  if (event.key === "Escape") {
    event.preventDefault();
    unlockGameFrame();
    elements.status.textContent = "Đã thoát khóa khung game";
    return;
  }

  const typingTarget = event.target && ["INPUT", "TEXTAREA", "SELECT", "BUTTON"].includes(event.target.tagName);
  if (typingTarget) {
    return;
  }

  const isFrameFocused =
    document.activeElement === elements.frame ||
    document.activeElement === elements.frameShell;

  if (!isFrameFocused) {
    focusGameFrame();
  }
}

function startThemeAudio(game, config) {
  if (!game || !game.AudioPlayer || config.mute) return;
  if (typeof game.AudioPlayer.playTheme === "function") {
    game.AudioPlayer.playTheme();
  } else if (typeof game.AudioPlayer.resumeTheme === "function") {
    game.AudioPlayer.resumeTheme();
  }
}

function applyTargetMap(game, targetMap) {
  if (Array.isArray(targetMap) && targetMap[0] === "Random") {
    game.setMapRandom(targetMap[1]);
    return;
  }

  game.setMap(targetMap);
}

function applyCustomPlayerSkin(game) {
  if (game.__customSkinPatchApplied) return;

  const playerImage = new game.Image();
  const coinImage = new game.Image();
  const goombaImage = new game.Image();
  playerImage.src = PLAYER_SKIN_PATH;
  coinImage.src = COIN_SKIN_PATH;
  goombaImage.src = GOOMBA_SKIN_PATH;

  const originalDrawThingOnCanvas = game.drawThingOnCanvas;
  if (typeof originalDrawThingOnCanvas !== "function") return;

  game.drawThingOnCanvas = function patchedDrawThingOnCanvas(context, me) {
    if (!shouldDrawCustomThing(me, playerImage, coinImage, goombaImage)) {
      return originalDrawThingOnCanvas.call(this, context, me);
    }

    const leftc = me.left;
    const topc = me.top;
    const width = me.unitwidth || (me.width * game.unitsize);
    const height = me.unitheight || (me.height * game.unitsize);
    const scale = me.coin ? 1.7 : (isGoomba(me) ? 1.3 : 1);
    const drawWidth = width * scale;
    const drawHeight = height * scale;
    const drawLeft = me.coin ? leftc - ((drawWidth - width) / 2) : leftc;
    const drawTop = me.coin ? topc - ((drawHeight - height) / 2) : topc;

    if (drawLeft > game.innerWidth || drawLeft + drawWidth < 0 || drawTop > game.innerHeight || drawTop + drawHeight < 0) {
      return;
    }

    const activeImage = me.player ? playerImage : (me.coin ? coinImage : goombaImage);

    context.save();
    if ((me.player || isGoomba(me)) && me.className && me.className.indexOf("flipped") !== -1) {
      context.translate(drawLeft + drawWidth, drawTop);
      context.scale(-1, 1);
      context.drawImage(activeImage, 0, 0, drawWidth, drawHeight);
    } else {
      context.drawImage(activeImage, drawLeft, drawTop, drawWidth, drawHeight);
    }
    context.restore();
  };

  game.__customSkinPatchApplied = true;
}

function shouldDrawCustomThing(me, playerImage, coinImage, goombaImage) {
  return Boolean(
    me &&
    ((me.player && playerImage && playerImage.complete) ||
      (me.coin && coinImage && coinImage.complete) ||
      (isGoomba(me) && goombaImage && goombaImage.complete)) &&
    me.alive !== false &&
    !me.hidden
  );
}

function isGoomba(me) {
  return Boolean(me && me.className && me.className.indexOf("goomba") !== -1);
}

function attachEmbeddedFullscreenBridge(game) {
  if (!game.document || game.__focusBridgeAttached) return;

  game.document.addEventListener("pointerdown", () => {
    if (game.parent && typeof game.parent.launcherFocusGame === "function") {
      game.parent.launcherFocusGame();
    }
  });

  game.document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      if (game.parent && typeof game.parent.unlockGameFrameFromChild === "function") {
        game.parent.unlockGameFrameFromChild();
      }
      return;
    }

    if (!game.parent || typeof game.parent.isGameInputLocked !== "function" || !game.parent.isGameInputLocked()) {
      return;
    }

    const blockedKeys = new Set([
      "ArrowUp",
      "ArrowDown",
      "ArrowLeft",
      "ArrowRight",
      " ",
      "Spacebar",
      "PageUp",
      "PageDown",
      "Home",
      "End",
    ]);

    if (blockedKeys.has(event.key)) {
      event.preventDefault();
    }
  }, true);

  game.addEventListener("blur", () => {
    if (game.parent && typeof game.parent.isGameInputLocked === "function" && game.parent.isGameInputLocked()) {
      setTimeout(() => {
        if (game.parent && typeof game.parent.launcherFocusGame === "function") {
          game.parent.launcherFocusGame();
        }
      }, 0);
    }
  });

  game.__focusBridgeAttached = true;
}

function persistDraft(config = currentConfig()) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
}

function hydrateFromStoredConfig() {
  const fromURL = readConfigFromURL();
  if (fromURL) {
    applyForm({ ...defaults, ...fromURL });
    return;
  }

  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    applyForm(defaults);
    return;
  }

  try {
    applyForm({ ...defaults, ...JSON.parse(raw) });
  } catch {
    applyForm(defaults);
  }
}

function readConfigFromURL() {
  const params = new URLSearchParams(window.location.search);
  if (!params.size) return null;

  return {
    mode: params.get("mode") || defaults.mode,
    world: params.get("world") || defaults.world,
    level: params.get("level") || defaults.level,
    randomBiome: params.get("biome") || defaults.randomBiome,
    speed: Number(params.get("speed") || defaults.speed),
    zoom: Number(params.get("zoom") || defaults.zoom),
    lives: Number(params.get("lives") || defaults.lives),
    time: Number(params.get("time") || defaults.time),
    fast: params.get("fast") === "1",
    mute: params.get("mute") === "1",
    presetName: params.get("preset") || "",
  };
}

function updateURL(config = currentConfig()) {
  const params = new URLSearchParams();
  params.set("mode", config.mode);
  params.set("world", config.world);
  params.set("level", config.level);
  params.set("biome", config.randomBiome);
  params.set("speed", String(config.speed));
  params.set("zoom", String(config.zoom));
  params.set("lives", String(config.lives));
  params.set("time", String(config.time));
  params.set("fast", config.fast ? "1" : "0");
  params.set("mute", config.mute ? "1" : "0");
  if (config.presetName) {
    params.set("preset", config.presetName);
  }
  history.replaceState({}, "", `${window.location.pathname}?${params.toString()}`);
}

function updateDisplayPills(config = currentConfig()) {
  const mapLabel = config.mode === "random"
    ? `Map: Random ${config.randomBiome}`
    : `Map: ${config.world}-${config.level}`;
  elements.activeMapPill.textContent = mapLabel;
  elements.presetPill.textContent = `Preset: ${config.presetName || "mặc định"}`;
}

function getPresets() {
  try {
    return JSON.parse(localStorage.getItem(PRESET_KEY) || "{}");
  } catch {
    return {};
  }
}

function setPresets(presets) {
  localStorage.setItem(PRESET_KEY, JSON.stringify(presets));
}

function renderPresetList() {
  const presets = getPresets();
  const names = Object.keys(presets).sort();
  elements.presetList.innerHTML = names.length
    ? names.map((name) => `<option value="${escapeHTML(name)}">${escapeHTML(name)}</option>`).join("")
    : `<option value="">Chưa có preset</option>`;
}

function savePreset() {
  const name = elements.presetName.value.trim();
  if (!name) {
    elements.status.textContent = "Nhập tên preset trước khi lưu";
    return;
  }

  const presets = getPresets();
  presets[name] = currentConfig();
  setPresets(presets);
  renderPresetList();
  elements.presetList.value = name;
  updateDisplayPills({ ...currentConfig(), presetName: name });
  elements.status.textContent = "Đã lưu preset";
}

function loadPreset() {
  const name = elements.presetList.value;
  const presets = getPresets();
  if (!name || !presets[name]) {
    elements.status.textContent = "Preset không tồn tại";
    return;
  }

  applyForm({ ...defaults, ...presets[name], presetName: name });
  syncConfigToGame();
}

function deletePreset() {
  const name = elements.presetList.value;
  if (!name) return;

  const presets = getPresets();
  delete presets[name];
  setPresets(presets);
  renderPresetList();
  elements.status.textContent = "Đã xoá preset";
}

function exportPreset() {
  const payload = JSON.stringify(currentConfig(), null, 2);
  copyText(payload).then(() => {
    elements.status.textContent = "Đã copy JSON preset";
  }).catch(() => {
    elements.status.textContent = "Không copy được JSON preset";
  });
}

function copyShareLink() {
  updateURL();
  copyText(window.location.href).then(() => {
    elements.status.textContent = "Đã copy link cấu hình";
  }).catch(() => {
    elements.status.textContent = "Không copy được link";
  });
}

function resetLauncher() {
  applyForm(defaults);
  persistDraft(defaults);
  updateURL(defaults);
  updateDisplayPills(defaults);
  elements.status.textContent = "Launcher đã reset";
}

function escapeHTML(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function copyText(value) {
  if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
    return navigator.clipboard.writeText(value);
  }

  return Promise.reject(new Error("Clipboard API unavailable"));
}

boot();
