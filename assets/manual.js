/* =========================
   Global State
========================= */
let currentLang = "zh";
let currentQuery = "";
let manualData = null;
let searchIndex = [];

let currentSectionId = null;      // 目前顯示的小節（用於左側高亮）
const tocOpenState = new Set();   // 記錄展開的 chapter/group key

/* =========================
   Init / Fetch
========================= */
fetch("./assets/manual.json")
  .then(r => {
    if (!r.ok) throw new Error(`manual.json 載入失敗：${r.status} ${r.statusText}`);
    return r.json();
  })
  .then(data => {
    manualData = data;
    init();
  })
  .catch(err => {
    console.error(err);
    const doc = document.getElementById("doc");
    if (doc) doc.innerHTML = `<p style="color:#b91c1c;">${err.message}</p>`;
  });

function init() {
  renderMeta();
  buildSearchIndex();
  setupLightbox();
  bindEvents();

  // 根據網址 hash 定位（#sec-01 或 #ch-01/sec-01）
  const found = findSectionByHash(location.hash);

  if (found) {
    openTo(found.ch, found.g, found.sec);
    renderSection(found.sec);
  } else {
    // 預設：第一個章節的第一個 group 的第一個 section
    const ch0 = manualData.chapters?.[0];
    const g0 = getGroupsFromChapter(ch0)?.[0];
    const sec0 = g0?.sections?.[0];

    if (ch0 && g0 && sec0) {
      openTo(ch0, g0, sec0);
      renderSection(sec0);
    } else {
      // 防呆：資料結構異常時顯示訊息
      const doc = document.getElementById("doc");
      if (doc) doc.innerHTML = `<p style="color:#b91c1c;">manual.json 結構不完整，請檢查 chapters/groups/sections</p>`;
    }
  }

  renderTOC();
}

/* =========================
   Header / Meta
========================= */
function renderMeta() {
  const metaEl = document.getElementById("meta");

  if (!manualData?.meta) {
    console.error("manualData 缺少 meta", manualData);
    metaEl.textContent = "Meta 資訊缺失（請檢查 manual.json）";
    return;
  }

  metaEl.textContent = `${manualData.meta.product} / ${manualData.meta.version}`;
}

/* =========================
   Data Helpers (3-level compatible)
========================= */
// 取得章節底下的 groups（相容：若沒有 groups，就把 sections 包成一個預設 group）
function getGroupsFromChapter(ch) {
  if (!ch) return [];

  // 3層：ch.groups 已存在
  if (Array.isArray(ch.groups)) return ch.groups;

  // 2層相容：把 ch.sections 當作一個預設 group
  if (Array.isArray(ch.sections)) {
    return [{
      id: `${ch.id || "ch"}-grp-default`,
      title: { zh: "未分類", en: "General" },
      sections: ch.sections
    }];
  }

  return [];
}

// 找到 sectionId 對應的小節，同時回傳它所在的 chapter/group（用來自動展開）
function findSectionById(sectionId) {
  if (!sectionId) return null;

  for (const ch of (manualData.chapters || [])) {
    const groups = getGroupsFromChapter(ch);
    for (const g of groups) {
      for (const sec of (g.sections || [])) {
        if (sec.id === sectionId) return { ch, g, sec };
      }
    }
  }
  return null;
}

// 支援：#sec-01 或 #ch-01/sec-01
function findSectionByHash(hash) {
  const h = (hash || "").replace("#", "").trim();
  if (!h) return null;

  const parts = h.split("/");
  const sectionId = parts.length === 2 ? parts[1] : parts[0];
  return findSectionById(sectionId);
}

// 展開到指定 ch/g/sec（只改 open state，不做 render）
function openTo(ch, g, sec) {
  if (!ch || !g || !sec) return;

  tocOpenState.add(`ch:${ch.id}`);
  tocOpenState.add(`g:${ch.id}/${g.id}`);
  currentSectionId = sec.id;
}

/* =========================
   TOC (Accordion 3-level)
========================= */
function renderTOC() {
  const toc = document.getElementById("toc");
  toc.innerHTML = "";

  (manualData.chapters || []).forEach(ch => {
    const chapterKey = `ch:${ch.id}`;

    const chapterWrap = document.createElement("div");
    chapterWrap.className = "toc-chapter";

    // Chapter toggle
    const chBtn = document.createElement("button");
    chBtn.className = "toc-toggle";
    chBtn.textContent = ch.title?.[currentLang] || "";

    const chPanel = document.createElement("div");
    chPanel.className = "toc-panel";
    chPanel.style.display = tocOpenState.has(chapterKey) ? "" : "none";

    chBtn.onclick = () => {
      const open = chPanel.style.display === "none";
      chPanel.style.display = open ? "" : "none";
      if (open) tocOpenState.add(chapterKey);
      else tocOpenState.delete(chapterKey);
    };

    // Groups
    const groups = getGroupsFromChapter(ch);

    groups.forEach(g => {
      const groupKey = `g:${ch.id}/${g.id}`;

      const gWrap = document.createElement("div");
      gWrap.className = "toc-group";

      const gBtn = document.createElement("button");
      gBtn.className = "toc-group-title";
      gBtn.textContent = g.title?.[currentLang] || "";

      const gPanel = document.createElement("div");
      gPanel.className = "toc-group-panel";
      gPanel.style.display = tocOpenState.has(groupKey) ? "" : "none";

      gBtn.onclick = () => {
        const open = gPanel.style.display === "none";
        gPanel.style.display = open ? "" : "none";
        if (open) tocOpenState.add(groupKey);
        else tocOpenState.delete(groupKey);
      };

      // Sections
      (g.sections || []).forEach(sec => {
        const sBtn = document.createElement("button");
        sBtn.className = "toc-item";
        sBtn.textContent = sec.title?.[currentLang] || "";

        if (currentSectionId && sec.id === currentSectionId) {
          sBtn.classList.add("active");
        }

        sBtn.onclick = () => {
          // 保持展開 + 高亮
          openTo(ch, g, sec);

          renderSection(sec);
          renderTOC(); // 重新渲染以更新 active
        };

        gPanel.appendChild(sBtn);
      });

      gWrap.appendChild(gBtn);
      gWrap.appendChild(gPanel);
      chPanel.appendChild(gWrap);
    });

    chapterWrap.appendChild(chBtn);
    chapterWrap.appendChild(chPanel);
    toc.appendChild(chapterWrap);
  });
}

/* =========================
   Content Render
========================= */
function renderSection(section) {
  if (!section) return;

  currentSectionId = section.id || null;

  // 更新網址 hash，方便分享定位
  if (section.id) history.replaceState(null, "", `#${section.id}`);

  const doc = document.getElementById("doc");
  doc.innerHTML = `<h2>${section.title?.[currentLang] || ""}</h2>`;

  (section.blocks || []).forEach(block => {
    if (block.type === "text") {
      const el = document.createElement("div");
      el.className = "block-text";
      el.innerHTML = highlightHtml(block?.[currentLang] || "", currentQuery);
      doc.appendChild(el);
    }

    if (block.type === "image") {
      const fig = document.createElement("figure");
      fig.className = `block-image size-${block.size || "md"}`;

      const img = document.createElement("img");
      img.src = block.src;
      fig.appendChild(img);

      const cap = document.createElement("figcaption");
      cap.textContent = block.caption?.[currentLang] || "";
      fig.appendChild(cap);

      doc.appendChild(fig);
    }

    if (block.type === "table") {
      const wrap = document.createElement("div");
      wrap.className = "block-table";

      const table = document.createElement("table");

      const thead = document.createElement("thead");
      const trh = document.createElement("tr");
      (block.headers?.[currentLang] || []).forEach(h => {
        const th = document.createElement("th");
        th.textContent = h;
        trh.appendChild(th);
      });
      thead.appendChild(trh);
      table.appendChild(thead);

      const tbody = document.createElement("tbody");
      (block.rows?.[currentLang] || []).forEach(row => {
        const tr = document.createElement("tr");
        (row || []).forEach(cell => {
          const td = document.createElement("td");
          td.innerHTML = highlightHtml(cell || "", currentQuery);
          tr.appendChild(td);
        });
        tbody.appendChild(tr);
      });

      table.appendChild(tbody);
      wrap.appendChild(table);
      doc.appendChild(wrap);
    }
  });
}

/* =========================
   Search
========================= */
function buildSearchIndex() {
  searchIndex = [];

  (manualData.chapters || []).forEach(ch => {
    const groups = getGroupsFromChapter(ch);

    groups.forEach(g => {
      (g.sections || []).forEach(sec => {
        let text = "";

        // 標題（章/分類/小節）
        text += (ch.title?.[currentLang] || "") + " ";
        text += (g.title?.[currentLang] || "") + " ";
        text += (sec.title?.[currentLang] || "") + " ";

        // 內容 blocks
        (sec.blocks || []).forEach(b => {
          if (b.type === "text") text += (b?.[currentLang] || "") + " ";

          if (b.type === "table") {
            (b.headers?.[currentLang] || []).forEach(h => text += h + " ");
            (b.rows?.[currentLang] || []).forEach(r =>
              (r || []).forEach(c => text += (c || "") + " ")
            );
          }
        });

        searchIndex.push({
          chapter: ch,
          group: g,
          section: sec,
          text: text.toLowerCase()
        });
      });
    });
  });
}

function renderSearchResults(results) {
  const toc = document.getElementById("toc");
  toc.innerHTML = "";

  if (!results.length) {
    toc.innerHTML = "<p>找不到符合的內容</p>";
    return;
  }

  results.forEach(item => {
    const btn = document.createElement("button");
    btn.className = "toc-item"; // 讓搜尋結果也有一致樣式
    btn.textContent =
      `${item.chapter.title?.[currentLang] || ""} / ${item.group.title?.[currentLang] || ""} / ${item.section.title?.[currentLang] || ""}`;

    btn.onclick = () => {
      // 自動展開到該位置 + 高亮
      openTo(item.chapter, item.group, item.section);

      renderSection(item.section);
      renderTOC();               // 回到 Accordion 並顯示 active
      scrollToFirstHighlight();  // 捲到第一個高亮
    };

    toc.appendChild(btn);
  });
}

/* =========================
   Events
========================= */
function bindEvents() {
  // Language switch
  document.querySelectorAll(".lang-switch button").forEach(btn => {
    btn.onclick = () => {
      currentLang = btn.dataset.lang;

      document
        .querySelectorAll(".lang-switch button")
        .forEach(b => b.classList.remove("active"));
      btn.classList.add("active");

      // 重建索引（因為搜尋內容換語言）
      buildSearchIndex();

      // TOC 依語言更新
      renderTOC();

      // 右側內容也要跟著換語言（若目前有選到 section）
      const found = currentSectionId ? findSectionById(currentSectionId) : null;
      if (found) renderSection(found.sec);
    };
  });

  // Search
  document.getElementById("searchInput")
    .addEventListener("input", e => {
      const q = e.target.value.trim().toLowerCase();
      currentQuery = q;

      if (!q) {
        renderTOC();
        return;
      }

      renderSearchResults(
        searchIndex.filter(item => item.text.includes(q))
      );
    });

  // 使用者手動修改 hash 或瀏覽器上一頁/下一頁時，跟著切換章節 + 自動展開
  window.addEventListener("hashchange", () => {
    const found = findSectionByHash(location.hash);
    if (!found) return;

    openTo(found.ch, found.g, found.sec);
    renderSection(found.sec);
    renderTOC();
  });
}

/* =========================
   Lightbox
========================= */
function setupLightbox() {
  const box = document.getElementById("lightbox");
  const img = document.getElementById("lightboxImg");
  const cap = document.getElementById("lightboxCap");

  const close = () => {
    box.classList.add("hidden");
    img.src = "";
    cap.textContent = "";
  };

  box.querySelector(".lightbox-backdrop").onclick = close;
  document.getElementById("lightboxClose").onclick = close;

  document.addEventListener("keydown", e => {
    if (e.key === "Escape") close();
  });

  // 事件委派：點到文件內任何 .block-image img 都能放大
  document.addEventListener("click", e => {
    const target = e.target;
    if (!(target instanceof HTMLImageElement)) return;
    if (!target.closest(".block-image")) return;

    img.src = target.src;
    const figcap = target.closest("figure")?.querySelector("figcaption");
    cap.textContent = figcap?.textContent || "";

    box.classList.remove("hidden");
  });
}

/* =========================
   Utils
========================= */
function escapeHtml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

// 將 query 在純文字中高亮（回傳 HTML 字串）
function highlightHtml(text, query) {
  const safe = escapeHtml(text);
  const q = (query || "").trim();
  if (!q) return safe;

  // Escape regex special chars
  const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(escaped, "gi");

  return safe.replace(re, (m) => `<mark>${m}</mark>`);
}

function scrollToFirstHighlight() {
  requestAnimationFrame(() => {
    const first = document.querySelector("#doc mark");
    if (!first) return;

    first.scrollIntoView({
      behavior: "smooth",
      block: "center"
    });
  });
}
