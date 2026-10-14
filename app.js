"use strict";

const PRESETS = [
  { group: "WEB", id: "web-640", label: "WEB用・軽量", suffix: "WEB", width: 640, height: null },
  { group: "SNS", id: "google", label: "Googleマップ", suffix: "Googleマップ", width: 1200, height: 1200 },
  { group: "SNS", id: "x-square", label: "X・正方形", suffix: "X正方形", width: 1200, height: 1200 },
  { group: "SNS", id: "x-wide", label: "X・横型", suffix: "X横型", width: 1200, height: 675 },
  { group: "SNS", id: "line", label: "LINE", suffix: "LINE", width: 1040, height: 1040 },
  { group: "画面", id: "monitor", label: "モニター・横", suffix: "モニター横", width: 1920, height: 1080 },
  { group: "画面", id: "monitor-p", label: "モニター・縦", suffix: "モニター縦", width: 1080, height: 1920 },
  { group: "印刷", id: "a4-p", label: "A4・縦", suffix: "A4縦", width: 2480, height: 3508 },
  { group: "印刷", id: "a4-l", label: "A4・横", suffix: "A4横", width: 3508, height: 2480 },
  { group: "印刷", id: "a3-p", label: "A3・縦", suffix: "A3縦", width: 3508, height: 4961 },
  { group: "印刷", id: "a3-l", label: "A3・横", suffix: "A3横", width: 4961, height: 3508 },
  { group: "その他", id: "custom", label: "任意サイズ", suffix: "任意サイズ", width: 1200, height: 1200 },
];

const FITS = [
  { id: "contain", label: "余白を残す", description: "画像を切らずに全体を残す" },
  { id: "bands", label: "帯を追加", description: "画像の比率を維持して余白をデザイン化する" },
  { id: "cover", label: "トリミング", description: "残したい位置を選んで画面いっぱいにする" },
  { id: "stretch", label: "引き伸ばす", description: "縦横比を変えて指定サイズに合わせる" },
];

const CROP_POSITIONS = [
  { id: "top", label: "上を残す", description: "タイトル・上部の文字を優先" },
  { id: "center", label: "中央を残す", description: "キャラ・中央の内容を優先" },
  { id: "bottom", label: "下を残す", description: "日付・下部の文字を優先" },
];

const state = {
  presetIds: ["google"],
  fit: "contain",
  cropPosition: "center",
  cropEditor: null,
  items: [],
  busy: false,
  band: { design: "auto", colorMode: "auto", color: "#66a9ed", secondary: "#85d6cc", tone: "bright", frame: true, rotation: "sequence", candidates: ["satin", "pearl", "paper", "bright-geometry"] },
  previewRevision: 0,
};
const $ = (id) => document.getElementById(id);

function escapeHtml(value) {
  return String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function safeBaseName(name) {
  const base = name.replace(/\.[^.]+$/, "").normalize("NFKC");
  return base.replace(/[\\/:*?"<>|]+/g, "-").replace(/[\s_]+/g, "-").slice(0, 80) || "image";
}

function formatBytes(value) {
  return value < 1048576 ? `${Math.max(1, Math.round(value / 1024))} KB` : `${(value / 1048576).toFixed(1)} MB`;
}

function getPreset(id) {
  return PRESETS.find((preset) => preset.id === id) || PRESETS[0];
}

function clamp(value, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value));
}

function commonCropFocus() {
  if (state.cropPosition === "top") return { x: 0.5, y: 0 };
  if (state.cropPosition === "bottom") return { x: 0.5, y: 1 };
  return { x: 0.5, y: 0.5 };
}

function cropFocusForItem(item) {
  return item.cropFocus || commonCropFocus();
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
  renderBandControls();
  document.querySelectorAll('input[name="fit"]').forEach((radio) => radio.addEventListener("change", () => {
    state.fit = radio.value;
    renderFits();
    renderFiles();
    updateSummary();
  }));
  document.querySelectorAll('input[name="cropPosition"]').forEach((radio) => radio.addEventListener("change", () => {
    state.cropPosition = radio.value;
    renderFits();
    renderFiles();
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
      cropFocus: null,
      bandOverride: null,
      bandRandom: Math.random(),
      bandPalette: null,
    });
    image.onerror = () => { URL.revokeObjectURL(url); reject(new Error(`${file.name}を読み込めませんでした`)); };
    image.src = url;
  });
}

async function addFiles(fileList) {
  if (state.busy) return setStatus("保存中です。完了後に画像を追加してください");
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
      ${state.fit === "cover" ? `
        <div class="item-crop-adjust">
          <span>${item.cropFocus ? "画像ごとの任意位置を使用中" : `共通設定：${CROP_POSITIONS.find((position) => position.id === state.cropPosition).label}`}</span>
          ${item.cropFocus ? '<button type="button" class="clear-crop">解除</button>' : ""}
          <button type="button" class="adjust-crop">位置を微調整</button>
        </div>` : ""}
      ${state.fit === "bands" ? `<label class="item-band-setting">この画像の帯<select class="item-band"><option value="">一括設定を使用</option><option value="auto" ${item.bandOverride === "auto" ? "selected" : ""}>自動選択</option>${BAND_DESIGNS.map(d=>`<option value="${d.id}" ${item.bandOverride===d.id?"selected":""}>${d.label}</option>`).join("")}</select></label>` : ""}
      <details class="output-previews" open><summary>仕上がりプレビュー（${item.presetIds.length}用途）</summary><div class="preview-grid">${item.presetIds.map(id=>`<figure><img data-preview="${id}" alt="${escapeHtml(getPreset(id).label)}の仕上がり"><figcaption>${getPreset(id).label}<span class="preview-design"></span></figcaption></figure>`).join("")}</div></details>
    </article>`).join("");

  document.querySelectorAll(".file-item").forEach((row) => {
    const item = state.items.find((candidate) => candidate.id === row.dataset.id);
    row.querySelector(".file-info input").addEventListener("input", (event) => { item.outputName = event.target.value; });
    row.querySelector(".item-band")?.addEventListener("change", event => { item.bandOverride = event.target.value || null; renderFiles(); });
    row.querySelector(".save-one").addEventListener("click", () => downloadOne(item));
    row.querySelector(".adjust-crop")?.addEventListener("click", () => openCropEditor(item));
    row.querySelector(".clear-crop")?.addEventListener("click", () => {
      item.cropFocus = null;
      renderFiles();
      setStatus("画像ごとの微調整を解除し、共通設定へ戻しました");
    });
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
  schedulePreviews();
  if (state.busy) document.querySelectorAll("input, select, button").forEach(el => { if (!el.disabled) { el.dataset.busyDisabled = "1"; el.disabled = true; } });
}

function updateCropMarker() {
  if (!state.cropEditor) return;
  $("cropMarker").style.left = `${state.cropEditor.x * 100}%`;
  $("cropMarker").style.top = `${state.cropEditor.y * 100}%`;
}

function setCropEditorFocus(x, y) {
  if (!state.cropEditor) return;
  state.cropEditor.x = clamp(x);
  state.cropEditor.y = clamp(y);
  updateCropMarker();
}

function setCropEditorFocusFromPointer(event) {
  const rect = $("cropEditorImage").getBoundingClientRect();
  if (!rect.width || !rect.height) return;
  setCropEditorFocus(
    (event.clientX - rect.left) / rect.width,
    (event.clientY - rect.top) / rect.height,
  );
}

function openCropEditor(item) {
  const focus = cropFocusForItem(item);
  state.cropEditor = { itemId: item.id, x: focus.x, y: focus.y };
  $("cropEditorName").textContent = item.outputName;
  $("cropEditorImage").src = item.url;
  $("cropEditor").hidden = false;
  document.body.classList.add("modal-open");
  updateCropMarker();
}

function closeCropEditor() {
  $("cropEditor").hidden = true;
  $("cropEditorImage").removeAttribute("src");
  document.body.classList.remove("modal-open");
  state.cropEditor = null;
}

function saveCropEditor() {
  if (!state.cropEditor) return;
  const item = state.items.find((candidate) => candidate.id === state.cropEditor.itemId);
  if (item) item.cropFocus = { x: state.cropEditor.x, y: state.cropEditor.y };
  closeCropEditor();
  renderFiles();
  setStatus("この画像のトリミング位置を保存しました");
}

function resetCropEditor() {
  if (!state.cropEditor) return;
  const item = state.items.find((candidate) => candidate.id === state.cropEditor.itemId);
  if (item) item.cropFocus = null;
  closeCropEditor();
  renderFiles();
  setStatus("共通のトリミング位置へ戻しました");
}

async function renderBlob(item, presetId) {
  await BAND_TEXTURE_READY;
  const fit = state.fit;
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

      if (presetId === "web-640" || fit === "stretch") {
        context.drawImage(image, 0, 0, width, height);
      } else {
        const scale = (fit === "contain" || fit === "bands")
          ? Math.min(width / image.naturalWidth, height / image.naturalHeight)
          : Math.max(width / image.naturalWidth, height / image.naturalHeight);
        const drawWidth = image.naturalWidth * scale;
        const drawHeight = image.naturalHeight * scale;
        const focus = fit === "cover" ? cropFocusForItem(item) : { x: 0.5, y: 0.5 };
        const drawX = fit === "cover"
          ? clamp(width / 2 - drawWidth * focus.x, width - drawWidth, 0)
          : (width - drawWidth) / 2;
        const drawY = fit === "cover"
          ? clamp(height / 2 - drawHeight * focus.y, height - drawHeight, 0)
          : (height - drawHeight) / 2;
        if (fit === "bands") {
          const settings = resolveBandSettings(item, image, width, height);
          drawDesignBands(context, image, width, height, settings);
        }
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
  return `${safeBaseName(item.outputName)}-${safeBaseName(preset.suffix)}.${extension}`;
}

function uniqueZipName(filename, usedNames) {
  let candidate = filename;
  let count = 2;
  const dot = filename.lastIndexOf(".");
  const stem = dot >= 0 ? filename.slice(0, dot) : filename;
  const extension = dot >= 0 ? filename.slice(dot) : "";
  while (usedNames.has(candidate)) candidate = `${stem}-${count++}${extension}`;
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
      triggerDownload(await zip.generateAsync({ type: "blob" }), `${safeBaseName(item.outputName)}-用途別.zip`);
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
    triggerDownload(await zip.generateAsync({ type: "blob" }), "resized-用途別まとめ.zip");
    setStatus(`${targets.length}点をZIPにまとめて保存しました`);
  } catch (error) {
    setStatus(error.message);
  } finally {
    setBusy(false);
  }
}

function setBusy(value) {
  state.busy = value;
  if (!value) document.querySelectorAll("[data-busy-disabled]").forEach(el => { el.disabled = false; delete el.dataset.busyDisabled; });
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
  $("customWidth").addEventListener("input", refreshOutput);
  $("customHeight").addEventListener("input", refreshOutput);
  $("background").addEventListener("input", (event) => { $("colorValue").textContent = event.target.value.toUpperCase(); refreshOutput(); });
  $("quality").addEventListener("input", (event) => {
    $("qualityValue").textContent = `${event.target.value}%`;
    refreshOutput();
  });
  $("format").addEventListener("change", () => {
    syncFormatControls();
    refreshOutput();
  });

  $("transparent").addEventListener("change", refreshOutput);

  const cropStage = $("cropStage");
  let cropDragging = false;
  cropStage.addEventListener("pointerdown", (event) => {
    cropDragging = true;
    cropStage.setPointerCapture?.(event.pointerId);
    setCropEditorFocusFromPointer(event);
  });
  cropStage.addEventListener("pointermove", (event) => {
    if (cropDragging) setCropEditorFocusFromPointer(event);
  });
  cropStage.addEventListener("pointerup", () => { cropDragging = false; });
  cropStage.addEventListener("pointercancel", () => { cropDragging = false; });
  document.querySelectorAll("[data-crop-quick]").forEach((button) => button.addEventListener("click", () => {
    if (button.dataset.cropQuick === "top") setCropEditorFocus(0.5, 0);
    if (button.dataset.cropQuick === "center") setCropEditorFocus(0.5, 0.5);
    if (button.dataset.cropQuick === "bottom") setCropEditorFocus(0.5, 1);
  }));
  $("cropEditorSave").addEventListener("click", saveCropEditor);
  $("cropEditorReset").addEventListener("click", resetCropEditor);
  $("cropEditorCancel").addEventListener("click", closeCropEditor);
  $("cropEditorClose").addEventListener("click", closeCropEditor);
  $("cropEditor").addEventListener("click", (event) => {
    if (event.target === $("cropEditor")) closeCropEditor();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !$("cropEditor").hidden) closeCropEditor();
  });
}

window.addEventListener("beforeunload", () => state.items.forEach((item) => URL.revokeObjectURL(item.url)));

function refreshOutput() { updateSummary(); schedulePreviews(); }
function renderBandControls() {
  const host=$("bandSettings");host.hidden=state.fit!=="bands";
  if(host.hidden)return;
  host.innerHTML=`<h4>帯追加設定</h4><div class="setting-grid">
    <label>帯デザイン<select id="bandDesign"><option value="auto">自動選択</option>${BAND_DESIGNS.map(d=>`<option value="${d.id}">${d.label}</option>`).join('')}</select></label>
    <label>帯カラー<select id="bandColorMode"><option value="auto">元画像から自動取得</option><option value="manual">手動カラー指定</option></select></label>
    <div id="bandManualRow" class="manual-colors"><label>主色<input id="bandColor" type="color" value="${state.band.color}"></label><label>アクセント色<input id="bandSecondary" type="color" value="${state.band.secondary}"></label></div>
    <label>明るさ（自動カラー）<select id="bandTone"><option value="bright">明るめ</option><option value="normal">標準</option><option value="calm">落ち着いた</option></select></label>
    <label>複数画像処理<select id="bandRotation"><option value="common">共通</option><option value="sequence">順番切替</option><option value="random">ランダム</option></select></label>
    </div><label class="band-frame-toggle"><input id="bandFrame" type="checkbox" ${state.band.frame?"checked":""}>画像との境界に明るいラインを入れる</label>
    <div class="texture-gallery" aria-label="テクスチャ見本">${BAND_DESIGNS.filter(d=>d.texture).map(d=>`<button type="button" data-texture="${d.id}" title="${d.label}を全画像の共通デザインにする"><img src="data:image/svg+xml;charset=utf-8,${escapeHtml(encodeURIComponent(BAND_TEXTURE_SOURCES[d.id]))}" alt=""><span>${d.label}</span></button>`).join("")}</div>
    <fieldset id="bandCandidates"><legend>ローテーション対象（上から順に使用）</legend><div class="band-candidates">${BAND_DESIGNS.map(d=>`<label><input type="checkbox" value="${d.id}" ${state.band.candidates.includes(d.id)?'checked':''}>${d.label}</label>`).join('')}</div></fieldset>
    <p class="band-note" id="bandHelp"></p><p class="band-note">帯は余白だけに追加します。PNGの透明余白設定より帯を優先します。画像内の透明部分は保存設定に従います。</p>`;
  $("bandDesign").value=state.band.design;$("bandColorMode").value=state.band.colorMode;$("bandRotation").value=state.band.rotation;$("bandTone").value=state.band.tone;
  function sync() {
    $("bandManualRow").hidden=state.band.colorMode!=="manual";
    $("bandTone").disabled=state.band.colorMode==="manual";
    $("bandCandidates").hidden=state.band.rotation==='common';
    $("bandDesign").disabled=state.band.rotation!=='common';
    $("bandHelp").textContent=state.band.rotation==='common'?'選択した帯デザインを全画像へ適用します。自動選択の場合は各画像に適した帯を判定します。':'チェックした候補を画像の追加順に適用します。ランダムの結果は保存時にも維持します。帯デザインの自動選択は「共通」で利用できます。';
  }
  for(const [id,key] of [['bandDesign','design'],['bandColorMode','colorMode'],['bandRotation','rotation'],['bandColor','color'],['bandSecondary','secondary'],['bandTone','tone']]) {
    $(id).addEventListener('change',e=>{state.band[key]=e.target.value;sync();renderFiles();updateSummary();});
  }
  $("bandFrame").addEventListener("change",event=>{state.band.frame=event.target.checked;renderFiles();});
  host.querySelectorAll("[data-texture]").forEach(button=>button.addEventListener("click",()=>{state.band.design=button.dataset.texture;state.band.rotation="common";renderBandControls();renderFiles();updateSummary();}));
  $("bandCandidates").querySelectorAll('input').forEach(el=>el.addEventListener('change',()=>{
    const selected=[...$("bandCandidates").querySelectorAll('input:checked')].map(c=>c.value);
    if(!selected.length){el.checked=true;setStatus('帯デザインを1種類以上選択してください');return;}
    state.band.candidates=selected;renderFiles();
  }));sync();
}
let previewTimer;
const previewUrls=new Set();
function schedulePreviews() {
  const revision=++state.previewRevision;
  clearTimeout(previewTimer);
  // Remove references before releasing previous blob URLs.
  document.querySelectorAll('[data-preview]').forEach(el=>el.removeAttribute('src'));
  previewUrls.forEach(url=>URL.revokeObjectURL(url));previewUrls.clear();
  previewTimer=setTimeout(()=>renderOutputPreviews(revision),100);
}
async function renderOutputPreviews(revision) {
  for(const item of state.items)for(const presetId of item.presetIds) {
    if(revision!==state.previewRevision)return;
    const row=document.querySelector(`.file-item[data-id="${item.id}"]`);
    const element=row?.querySelector(`[data-preview="${presetId}"]`);
    if(!element)continue;
    try {
      // Preview uses the same full-resolution encoder as downloads, including JPEG quality.
      const blob=await renderBlob(item,presetId);
      if(revision!==state.previewRevision)return;
      const url=URL.createObjectURL(blob);previewUrls.add(url);element.src=url;
      const caption=element.parentElement.querySelector('.preview-design');
      if(state.fit==='bands' && presetId!=='web-640') {
        const source={naturalWidth:item.width,naturalHeight:item.height};
        const {width,height}=dimensions(presetId,source);
        const settings=resolveBandSettings(item,source,width,height);
        caption.textContent=bandMargins(settings.rect,width,height).length ? `帯：${BAND_DESIGNS.find(d=>d.id===settings.design).label} ${settings.color.toUpperCase()} / ${settings.secondary.toUpperCase()}${item.bandOverride?'（個別指定）':''}` : '余白なし';
      } else caption.textContent=presetId==='web-640'?'高さ自動・JPG 85%':'';
    } catch(error) {if(revision===state.previewRevision)element.alt=`プレビュー失敗：${error.message}`;}
  }
}

setup();
