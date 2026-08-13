"use strict";

const PRESETS = [
  { group: "WEB", id: "web-640", label: "WEB用・軽量", suffix: "WEB", width: 640, height: null },
  { group: "SNS", id: "google", label: "Googleマップ", suffix: "Googleマップ", width: 1200, height: 1200 },
  { group: "SNS", id: "x-square", label: "X・正方形", suffix: "X正方形", width: 1200, height: 1200 },
  { group: "SNS", id: "x-wide", label: "X・横型", suffix: "X横型", width: 1200, height: 675 },
  { group: "SNS", id: "line", label: "LINE", suffix: "LINE", width: 1040, height: 1040 },
  { group: "画面", id: "monitor", label: "モニター", suffix: "モニター", width: 1920, height: 1080 },
  { group: "印刷", id: "a4-p", label: "A4・縦", suffix: "A4縦", width: 2480, height: 3508 },
  { group: "印刷", id: "a4-l", label: "A4・横", suffix: "A4横", width: 3508, height: 2480 },
  { group: "印刷", id: "a3-p", label: "A3・縦", suffix: "A3縦", width: 3508, height: 4961 },
  { group: "印刷", id: "a3-l", label: "A3・横", suffix: "A3横", width: 4961, height: 3508 },
  { group: "その他", id: "custom", label: "任意サイズ", suffix: "任意サイズ", width: 1200, height: 1200 },
];

const FITS = [
  { id: "contain", label: "余白を追加", description: "画像を切らずに全体を残す" },
  { id: "cover", label: "トリミング", description: "残したい位置を選んで画面いっぱいにする" },
  { id: "stretch", label: "引き伸ばす", description: "縦横比を変えて指定サイズに合わせる" },
];

const CROP_POSITIONS = [
  { id: "top", label: "上を残す", description: "タイトル・上部の文字を優先" },
  { id: "center", label: "中央を残す", description: "キャラ・中央の内容を優先" },
  { id: "bottom", label: "下を残す", description: "日付・下部の文字を優先" },
];

const state = { presetIds: ["google"], fit: "contain", cropPosition: "center", items: [], busy: false };
const $ = (id) => document.getElementById(id);

function escapeHtml(value) {
  return String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function safeBaseName(name) {
  const base = name.replace(/\.[^.]+$/, "").normalize("NFKC");
  return base.replace(/[\\/:*?"<>|]+/g, "_").replace(/\s+/g, "_").slice(0, 80) || "image";
}

function formatBytes(value) {
  return value < 1048576 ? `${Math.max(1, Math.round(value / 1024))} KB` : `${(value / 1048576).toFixed(1)} MB`;
}

function getPreset(id) {
  return PRESETS.find((preset) => preset.id === id) || PRESETS[0];
}

function dimensions(presetId, source = null) {
  const preset = getPreset(presetId);
  if (presetId === "web-640") {
    const sourceWidth = source?.naturalWidth || source?.width;
    const sourceHeight = source?.naturalHeight || source?.height;
    return {
      width: 640,
      height: sourceWidth && sourceHeight ? Math.max(1, Math.round(sourceHeight * 640 / sourceWidth)) : null,
      preset,
    };
  }
  if (presetId !== "custom") return { width: preset.width, height: preset.height, preset };
  return {
    width: Math.max(1, Math.min(12000, Number($("customWidth").value) || 1)),
    height: Math.max(1, Math.min(12000, Number($("customHeight").value) || 1)),
    preset,
  };
}

function targetFormat(presetId) {
  if (presetId === "web-640") return { format: "jpeg", quality: 0.85, extension: "jpg" };
  const format = $("format").value;
  return { format, quality: Number($("quality").value) / 100, extension: format === "png" ? "png" : "jpg" };
}

function syncFormatControls() {
  const jpeg = $("format").value === "jpeg";
  if (jpeg) $("transparent").checked = false;
  $("transparent").disabled = jpeg;
  $("transparentRow").classList.toggle("disabled", jpeg);
  $("qualityRow").hidden = !jpeg;
}

function toggleGlobalPreset(presetId) {
  const selected = state.presetIds.includes(presetId);
  if (selected && state.presetIds.length === 1) {
    setStatus("出力用途を1つ以上選択してください");
    return;
  }
  state.presetIds = selected
    ? state.presetIds.filter((id) => id !== presetId)
    : [...state.presetIds, presetId];
  state.items.forEach((item) => { item.presetIds = [...state.presetIds]; });
  renderPresets();
  renderFiles();
  updateSummary();
}

function renderPresets() {
  const groups = [...new Set(PRESETS.map((item) => item.group))];
  $("presetList").innerHTML = groups.map((group) => `
    <div class="preset-group">
      <h4>${group}</h4>
      <div class="preset-grid">
        ${PRESETS.filter((item) => item.group === group).map((item) => {
          const selected = state.presetIds.includes(item.id);
          const size = item.id === "custom" ? "幅・高さを指定" : item.id === "web-640" ? "横640px・高さ自動" : `${item.width} × ${item.height}`;
          return `<button type="button" class="preset-card ${selected ? "selected" : ""}" data-preset="${item.id}" aria-pressed="${selected}">
            <span class="preset-check">✓</span><strong>${item.label}</strong><small>${size}</small>
          </button>`;
        }).join("")}
      </div>
    </div>`).join("");
  $("customSize").hidden = !state.presetIds.includes("custom");
  document.querySelectorAll("[data-preset]").forEach((button) => button.addEventListener("click", () => toggleGlobalPreset(button.dataset.preset)));
}

function renderFits() {
  const fitOptions = FITS.map((item) => `
    <label class="fit-option ${state.fit === item.id ? "selected" : ""}">
      <input type="radio" name="fit" value="${item.id}" ${state.fit === item.id ? "checked" : ""}>
      <span class="fit-icon ${item.id}"><i></i></span>
      <span><strong>${item.label}</strong><small>${item.description}</small></span>
      ${item.id === "stretch" ? "<em>非推奨</em>" : ""}
    </label>`).join("");
  const cropPositionOptions = state.fit === "cover" ? `
    <fieldset class="crop-position">
      <legend>残す位置</legend>
      <div class="crop-position-grid">
        ${CROP_POSITIONS.map((item) => `
          <label class="crop-position-option ${state.cropPosition === item.id ? "selected" : ""}">
            <input type="radio" name="cropPosition" value="${item.id}" ${state.cropPosition === item.id ? "checked" : ""}>
            <span class="crop-position-icon ${item.id}"><i></i></span>
            <strong>${item.label}</strong>
            <small>${item.description}</small>
          </label>`).join("")}
      </div>
    </fieldset>` : "";
  $("fitList").innerHTML = fitOptions + cropPositionOptions;
  document.querySelectorAll('input[name="fit"]').forEach((radio) => radio.addEventListener("change", () => {
    state.fit = radio.value;
    renderFits();
    updateSummary();
  }));
  document.querySelectorAll('input[name="cropPosition"]').forEach((radio) => radio.addEventListener("change", () => {
    state.cropPosition = radio.value;
    renderFits();
    updateSummary();
  }));
}

function updateSummary() {
  const selected = state.presetIds.map(getPreset);
  $("summaryPreset").childNodes[0].nodeValue = `${selected.length}用途を選択中`;
  $("summarySize").textContent = selected.map((preset) => {
    const { width, height } = dimensions(preset.id);
    return preset.id === "web-640" ? `${preset.label} 横640px` : `${preset.label} ${width}×${height}`;
  }).join(" ／ ");
  const cropPosition = CROP_POSITIONS.find((item) => item.id === state.cropPosition);
  const fitSummary = state.fit === "cover"
    ? `${FITS.find((item) => item.id === state.fit).label}（${cropPosition.label}）`
    : FITS.find((item) => item.id === state.fit).label;
  $("summaryDetails").textContent = `${fitSummary} ・ ${$("format").value.toUpperCase()}`;
  const first = dimensions(state.presetIds[0]);
  $("ratioPreview").style.aspectRatio = first.height ? `${first.width} / ${first.height}` : "4 / 3";
}

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => resolve({
      id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
      file,
      url,
      width: image.naturalWidth,
      height: image.naturalHeight,
      outputName: safeBaseName(file.name),
      presetIds: [...state.presetIds],
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
    setStatus(`${loaded.length}枚追加しました。画像ごとに出力用途を変更できます`);
  } catch (error) {
    setStatus(error.message);
  }
}

function itemTargetCount(item) {
  return item.presetIds.length;
}

function renderItemPresets(item) {
  return PRESETS.map((preset) => `
    <label class="item-preset ${item.presetIds.includes(preset.id) ? "selected" : ""}">
      <input type="checkbox" value="${preset.id}" ${item.presetIds.includes(preset.id) ? "checked" : ""}>
      <span>${preset.label}</span>
    </label>`).join("");
}

function renderFiles() {
  $("fileArea").hidden = state.items.length === 0;
  const total = state.items.reduce((sum, item) => sum + itemTargetCount(item), 0);
  $("downloadAll").disabled = total === 0 || state.busy;
  $("downloadAll").innerHTML = `<span>↓</span>${state.busy ? "変換中…" : total > 1 ? `${total}点をZIPで保存` : "変換して保存"}`;
  $("fileList").innerHTML = state.items.map((item) => `
    <article class="file-item" data-id="${item.id}">
      <div class="file-main">
        <img src="${item.url}" alt="">
        <div class="file-info">
          <input value="${escapeHtml(item.outputName)}" aria-label="出力ファイル名">
          <small>${item.width} × ${item.height}px ・ ${formatBytes(item.file.size)}</small>
          <b>${itemTargetCount(item)}用途を出力</b>
        </div>
        <button type="button" class="icon-button save-one" aria-label="この画像を保存">↓</button>
        <button type="button" class="icon-button remove" aria-label="削除">×</button>
      </div>
      <details class="item-settings">
        <summary>この画像の出力用途を変更</summary>
        <div class="item-preset-grid">${renderItemPresets(item)}</div>
      </details>
    </article>`).join("");

  document.querySelectorAll(".file-item").forEach((row) => {
    const item = state.items.find((candidate) => candidate.id === row.dataset.id);
    row.querySelector(".file-info input").addEventListener("input", (event) => { item.outputName = event.target.value; });
    row.querySelector(".save-one").addEventListener("click", () => downloadOne(item));
    row.querySelector(".remove").addEventListener("click", () => {
      URL.revokeObjectURL(item.url);
      state.items = state.items.filter((candidate) => candidate.id !== item.id);
      renderFiles();
    });
    row.querySelectorAll('.item-preset input[type="checkbox"]').forEach((checkbox) => checkbox.addEventListener("change", () => {
      if (!checkbox.checked && item.presetIds.length === 1) {
        checkbox.checked = true;
        setStatus("画像ごとに出力用途を1つ以上選択してください");
        return;
      }
      item.presetIds = checkbox.checked
        ? [...item.presetIds, checkbox.value]
        : item.presetIds.filter((id) => id !== checkbox.value);
      const wasOpen = row.querySelector("details").open;
      renderFiles();
      if (wasOpen) document.querySelector(`.file-item[data-id="${item.id}"] details`).open = true;
    }));
  });
}

function renderBlob(item, presetId) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      const { width, height } = dimensions(presetId, image);
      const { format, quality } = targetFormat(presetId);
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

      if (presetId === "web-640" || state.fit === "stretch") {
        context.drawImage(image, 0, 0, width, height);
      } else {
        const scale = state.fit === "contain"
          ? Math.min(width / image.naturalWidth, height / image.naturalHeight)
          : Math.max(width / image.naturalWidth, height / image.naturalHeight);
        const drawWidth = image.naturalWidth * scale;
        const drawHeight = image.naturalHeight * scale;
        const drawX = (width - drawWidth) / 2;
        let drawY = (height - drawHeight) / 2;
        if (state.fit === "cover" && state.cropPosition === "top") drawY = 0;
        if (state.fit === "cover" && state.cropPosition === "bottom") drawY = height - drawHeight;
        context.drawImage(image, drawX, drawY, drawWidth, drawHeight);
      }

      canvas.toBlob(
        (blob) => blob ? resolve(blob) : reject(new Error("画像を書き出せませんでした")),
        format === "png" ? "image/png" : "image/jpeg",
        quality,
      );
    };
    image.onerror = () => reject(new Error("画像を読み込めませんでした"));
    image.src = item.url;
  });
}

function outputFilename(item, presetId) {
  const preset = getPreset(presetId);
  const { extension } = targetFormat(presetId);
  return `${safeBaseName(item.outputName)}_${safeBaseName(preset.suffix)}.${extension}`;
}

function uniqueZipName(filename, usedNames) {
  let candidate = filename;
  let count = 2;
  const dot = filename.lastIndexOf(".");
  const stem = dot >= 0 ? filename.slice(0, dot) : filename;
  const extension = dot >= 0 ? filename.slice(dot) : "";
  while (usedNames.has(candidate)) candidate = `${stem}_${count++}${extension}`;
  usedNames.add(candidate);
  return candidate;
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
  if (state.busy || !item.presetIds.length) return;
  setBusy(true);
  try {
    if (item.presetIds.length === 1) {
      const presetId = item.presetIds[0];
      triggerDownload(await renderBlob(item, presetId), outputFilename(item, presetId));
      setStatus(`${getPreset(presetId).label}用の画像を保存しました`);
    } else {
      if (typeof JSZip === "undefined") throw new Error("jszip.min.jsを読み込めませんでした");
      const zip = new JSZip();
      const usedNames = new Set();
      for (let index = 0; index < item.presetIds.length; index += 1) {
        const presetId = item.presetIds[index];
        setStatus(`${index + 1} / ${item.presetIds.length}点を変換しています…`);
        zip.file(uniqueZipName(outputFilename(item, presetId), usedNames), await renderBlob(item, presetId));
      }
      triggerDownload(await zip.generateAsync({ type: "blob" }), `${safeBaseName(item.outputName)}_用途別.zip`);
      setStatus(`${item.presetIds.length}用途をZIPにまとめて保存しました`);
    }
  } catch (error) {
    setStatus(error.message);
  } finally {
    setBusy(false);
  }
}

async function downloadAll() {
  const targets = state.items.flatMap((item) => item.presetIds.map((presetId) => ({ item, presetId })));
  if (!targets.length || state.busy) return;
  if (targets.length === 1) return downloadOne(targets[0].item);
  setBusy(true);
  try {
    if (typeof JSZip === "undefined") throw new Error("jszip.min.jsを読み込めませんでした");
    const zip = new JSZip();
    const usedNames = new Set();
    for (let index = 0; index < targets.length; index += 1) {
      const { item, presetId } = targets[index];
      setStatus(`${index + 1} / ${targets.length}点を変換しています…`);
      zip.file(uniqueZipName(outputFilename(item, presetId), usedNames), await renderBlob(item, presetId));
    }
    triggerDownload(await zip.generateAsync({ type: "blob" }), "resized_用途別まとめ.zip");
    setStatus(`${targets.length}点をZIPにまとめて保存しました`);
  } catch (error) {
    setStatus(error.message);
  } finally {
    setBusy(false);
  }
}

function setBusy(value) {
  state.busy = value;
  renderFiles();
}

function setStatus(message) {
  $("status").textContent = message;
}

function clearAll() {
  state.items.forEach((item) => URL.revokeObjectURL(item.url));
  state.items = [];
  renderFiles();
  setStatus("画像をすべて削除しました");
}

function setup() {
  renderPresets();
  renderFits();
  syncFormatControls();
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
  $("quality").addEventListener("input", (event) => {
    $("qualityValue").textContent = `${event.target.value}%`;
    updateSummary();
  });
  $("format").addEventListener("change", () => {
    syncFormatControls();
    updateSummary();
  });
}

window.addEventListener("beforeunload", () => state.items.forEach((item) => URL.revokeObjectURL(item.url)));
setup();
