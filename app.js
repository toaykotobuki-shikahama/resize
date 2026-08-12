"use strict";

const PRESETS = [
  { group: "SNS", id: "google", label: "Googleマップ", width: 1200, height: 1200 },
  { group: "SNS", id: "x-square", label: "X・正方形", width: 1200, height: 1200 },
  { group: "SNS", id: "x-wide", label: "X・横型", width: 1200, height: 675 },
  { group: "SNS", id: "line", label: "LINE", width: 1040, height: 1040 },
  { group: "画面", id: "monitor", label: "モニター", width: 1920, height: 1080 },
  { group: "印刷", id: "a4-p", label: "A4・縦", width: 2480, height: 3508 },
  { group: "印刷", id: "a4-l", label: "A4・横", width: 3508, height: 2480 },
  { group: "印刷", id: "a3-p", label: "A3・縦", width: 3508, height: 4961 },
  { group: "印刷", id: "a3-l", label: "A3・横", width: 4961, height: 3508 },
  { group: "その他", id: "custom", label: "任意サイズ", width: 1200, height: 1200 },
];

const FITS = [
  { id: "contain", label: "余白を追加", description: "画像を切らずに全体を残す" },
  { id: "cover", label: "中央でトリミング", description: "余白なしで画面いっぱいにする" },
  { id: "stretch", label: "引き伸ばす", description: "縦横比を変えて指定サイズに合わせる" },
];

const state = { presetId: "google", fit: "contain", items: [], busy: false };
const $ = (id) => document.getElementById(id);

function safeBaseName(name) {
  const base = name.replace(/\.[^.]+$/, "").normalize("NFKC");
  return base.replace(/[\\/:*?"<>|]+/g, "_").replace(/\s+/g, "_").slice(0, 80) || "image";
}

function formatBytes(value) {
  return value < 1048576 ? `${Math.max(1, Math.round(value / 1024))} KB` : `${(value / 1048576).toFixed(1)} MB`;
}

function dimensions() {
  const preset = PRESETS.find((item) => item.id === state.presetId) || PRESETS[0];
  if (state.presetId !== "custom") return { width: preset.width, height: preset.height, preset };
  return {
    width: Math.max(1, Math.min(12000, Number($("customWidth").value) || 1)),
    height: Math.max(1, Math.min(12000, Number($("customHeight").value) || 1)),
    preset,
  };
}

function renderPresets() {
  const groups = [...new Set(PRESETS.map((item) => item.group))];
  $("presetList").innerHTML = groups.map((group) => `
    <div class="preset-group">
      <h4>${group}</h4>
      <div class="preset-grid">
        ${PRESETS.filter((item) => item.group === group).map((item) => `
          <button type="button" class="preset-card ${state.presetId === item.id ? "selected" : ""}" data-preset="${item.id}" aria-pressed="${state.presetId === item.id}">
            <span class="preset-check">✓</span><strong>${item.label}</strong>
            <small>${item.id === "custom" ? "幅・高さを指定" : `${item.width} × ${item.height}`}</small>
          </button>`).join("")}
      </div>
    </div>`).join("");

  document.querySelectorAll("[data-preset]").forEach((button) => button.addEventListener("click", () => {
    state.presetId = button.dataset.preset;
    $("customSize").hidden = state.presetId !== "custom";
    renderPresets();
    updateSummary();
  }));
}

function renderFits() {
  $("fitList").innerHTML = FITS.map((item) => `
    <label class="fit-option ${state.fit === item.id ? "selected" : ""}">
      <input type="radio" name="fit" value="${item.id}" ${state.fit === item.id ? "checked" : ""}>
      <span class="fit-icon ${item.id}"><i></i></span>
      <span><strong>${item.label}</strong><small>${item.description}</small></span>
      ${item.id === "stretch" ? "<em>非推奨</em>" : ""}
    </label>`).join("");
  document.querySelectorAll('input[name="fit"]').forEach((radio) => radio.addEventListener("change", () => {
    state.fit = radio.value;
    renderFits();
    updateSummary();
  }));
}

function updateSummary() {
  const { width, height, preset } = dimensions();
  const format = $("format").value;
  $("summaryPreset").childNodes[0].nodeValue = preset.label;
  $("summarySize").textContent = `${width} × ${height}px`;
  $("summaryDetails").textContent = `${FITS.find((item) => item.id === state.fit).label} ・ ${format.toUpperCase()}`;
  $("ratioPreview").style.aspectRatio = `${width} / ${height}`;
}

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => resolve({
      id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
      file, url, width: image.naturalWidth, height: image.naturalHeight,
      outputName: `${safeBaseName(file.name)}_${String(state.items.length + 1).padStart(2, "0")}`,
    });
    image.onerror = () => { URL.revokeObjectURL(url); reject(new Error(`${file.name}を読み込めませんでした`)); };
    image.src = url;
  });
}

async function addFiles(fileList) {
  const files = [...fileList].filter((file) => file.type.startsWith("image/"));
  if (!files.length) return setStatus("画像ファイルを選択してください");
  try {
    const loaded = [];
    for (const file of files) loaded.push(await loadImage(file));
    state.items.push(...loaded);
    renderFiles();
    setStatus(`${loaded.length}枚追加しました`);
  } catch (error) { setStatus(error.message); }
}

function renderFiles() {
  $("fileArea").hidden = state.items.length === 0;
  $("downloadAll").disabled = state.items.length === 0 || state.busy;
  $("downloadAll").innerHTML = `<span>↓</span>${state.busy ? "変換中…" : state.items.length > 1 ? `${state.items.length}枚をZIPで保存` : "変換して保存"}`;
  $("fileList").innerHTML = state.items.map((item) => `
    <article class="file-item" data-id="${item.id}">
      <img src="${item.url}" alt="">
      <div><input value="${item.outputName.replace(/&/g, "&amp;").replace(/"/g, "&quot;")}" aria-label="出力ファイル名"><small>${item.width} × ${item.height}px ・ ${formatBytes(item.file.size)}</small></div>
      <button type="button" class="icon-button save-one" aria-label="個別保存">↓</button>
      <button type="button" class="icon-button remove" aria-label="削除">×</button>
    </article>`).join("");

  document.querySelectorAll(".file-item").forEach((row) => {
    const item = state.items.find((candidate) => candidate.id === row.dataset.id);
    row.querySelector("input").addEventListener("input", (event) => { item.outputName = event.target.value; });
    row.querySelector(".save-one").addEventListener("click", () => downloadOne(item));
    row.querySelector(".remove").addEventListener("click", () => {
      URL.revokeObjectURL(item.url);
      state.items = state.items.filter((candidate) => candidate.id !== item.id);
      renderFiles();
    });
  });
}

function renderBlob(item) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      const { width, height } = dimensions();
      const format = $("format").value;
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d", { alpha: format === "png" });
      if (!context) return reject(new Error("Canvasを初期化できませんでした"));

      const transparent = format === "png" && $("transparent").checked;
      if (!transparent) {
        context.fillStyle = $("background").value;
        context.fillRect(0, 0, width, height);
      }
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = "high";

      if (state.fit === "stretch") {
        context.drawImage(image, 0, 0, width, height);
      } else {
        const scale = state.fit === "contain"
          ? Math.min(width / image.naturalWidth, height / image.naturalHeight)
          : Math.max(width / image.naturalWidth, height / image.naturalHeight);
        const drawWidth = image.naturalWidth * scale;
        const drawHeight = image.naturalHeight * scale;
        context.drawImage(image, (width - drawWidth) / 2, (height - drawHeight) / 2, drawWidth, drawHeight);
      }

      canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("画像を書き出せませんでした")), format === "png" ? "image/png" : "image/jpeg", Number($("quality").value) / 100);
    };
    image.onerror = () => reject(new Error("画像を読み込めませんでした"));
    image.src = item.url;
  });
}

function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function downloadOne(item) {
  if (state.busy) return;
  setBusy(true);
  try {
    const blob = await renderBlob(item);
    triggerDownload(blob, `${safeBaseName(item.outputName)}.${$("format").value === "png" ? "png" : "jpg"}`);
    setStatus(`${item.file.name}を保存しました`);
  } catch (error) { setStatus(error.message); }
  finally { setBusy(false); }
}

async function downloadAll() {
  if (!state.items.length || state.busy) return;
  if (state.items.length === 1) return downloadOne(state.items[0]);
  setBusy(true);
  try {
    const zip = new JSZip();
    const extension = $("format").value === "png" ? "png" : "jpg";
    for (let index = 0; index < state.items.length; index += 1) {
      setStatus(`${index + 1} / ${state.items.length}枚を変換しています…`);
      zip.file(`${safeBaseName(state.items[index].outputName)}.${extension}`, await renderBlob(state.items[index]));
    }
    const { width, height, preset } = dimensions();
    triggerDownload(await zip.generateAsync({ type: "blob" }), `resized_${preset.id}_${width}x${height}.zip`);
    setStatus(`${state.items.length}枚をZIPにまとめて保存しました`);
  } catch (error) { setStatus(error.message); }
  finally { setBusy(false); }
}

function setBusy(value) { state.busy = value; renderFiles(); }
function setStatus(message) { $("status").textContent = message; }

function clearAll() {
  state.items.forEach((item) => URL.revokeObjectURL(item.url));
  state.items = [];
  renderFiles();
  setStatus("画像をすべて削除しました");
}

function setup() {
  renderPresets();
  renderFits();
  updateSummary();
  renderFiles();

  const dropZone = $("dropZone");
  dropZone.addEventListener("click", () => $("fileInput").click());
  dropZone.addEventListener("keydown", (event) => { if (event.key === "Enter" || event.key === " ") $("fileInput").click(); });
  dropZone.addEventListener("dragover", (event) => { event.preventDefault(); dropZone.classList.add("dragging"); });
  dropZone.addEventListener("dragleave", () => dropZone.classList.remove("dragging"));
  dropZone.addEventListener("drop", (event) => { event.preventDefault(); dropZone.classList.remove("dragging"); addFiles(event.dataTransfer.files); });
  $("fileInput").addEventListener("change", (event) => { addFiles(event.target.files); event.target.value = ""; });
  $("clearAll").addEventListener("click", clearAll);
  $("downloadAll").addEventListener("click", downloadAll);
  $("customWidth").addEventListener("input", updateSummary);
  $("customHeight").addEventListener("input", updateSummary);
  $("background").addEventListener("input", (event) => { $("colorValue").textContent = event.target.value.toUpperCase(); });
  $("quality").addEventListener("input", (event) => { $("qualityValue").textContent = `${event.target.value}%`; });
  $("format").addEventListener("change", (event) => {
    const jpeg = event.target.value === "jpeg";
    if (jpeg) $("transparent").checked = false;
    $("transparent").disabled = jpeg;
    $("transparentRow").classList.toggle("disabled", jpeg);
    $("qualityRow").hidden = !jpeg;
    updateSummary();
  });
}

window.addEventListener("beforeunload", () => state.items.forEach((item) => URL.revokeObjectURL(item.url)));
setup();
