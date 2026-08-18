const SAVE_KEY = "meetcap_saved_ads_v1";

let DATA = null;
const filters = { brands: new Set(), mediaType: "all", tier: "all" };

function daysSince(dateStr) {
  if (!dateStr) return null;
  const start = new Date(dateStr + "T00:00:00+09:00");
  const now = new Date();
  return Math.max(0, Math.floor((now - start) / 86400000));
}

function getSaved() {
  try {
    return JSON.parse(localStorage.getItem(SAVE_KEY) || "[]");
  } catch {
    return [];
  }
}
function setSaved(list) {
  localStorage.setItem(SAVE_KEY, JSON.stringify(list));
}
function isSaved(libraryId) {
  return getSaved().some((a) => a.library_id === libraryId);
}
function toggleSave(ad, btnEl) {
  let list = getSaved();
  const idx = list.findIndex((a) => a.library_id === ad.library_id);
  if (idx >= 0) {
    list.splice(idx, 1);
    btnEl.classList.remove("saved");
    btnEl.textContent = "♡";
  } else {
    list.unshift(ad);
    btnEl.classList.add("saved");
    btnEl.textContent = "♥";
  }
  setSaved(list);
  if (document.getElementById("panel-saved").classList.contains("active")) {
    renderSavedTab();
  }
}

function escapeAttr(s) {
  return String(s || "").replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}

function mediaMarkup(ad) {
  if (ad.media_type === "video" && ad.media_url) {
    return `<video src="${escapeAttr(ad.media_url)}" ${ad.poster_url ? `poster="${escapeAttr(ad.poster_url)}"` : ""}
              muted loop playsinline controls preload="metadata"
              data-fallback-link="${escapeAttr(ad.permalink)}"></video>`;
  }
  if (ad.media_type === "image" && ad.media_url) {
    return `<img src="${escapeAttr(ad.media_url)}" loading="lazy" alt="${escapeAttr(ad.brand)} 광고"
              data-fallback-link="${escapeAttr(ad.permalink)}" />`;
  }
  return mediaFallbackNode(ad.permalink).outerHTML;
}

function mediaFallbackNode(permalink) {
  const div = document.createElement("div");
  div.className = "media-fallback";
  const msg = document.createElement("div");
  msg.textContent = "미리보기를 불러올 수 없어요";
  const a = document.createElement("a");
  a.href = permalink;
  a.target = "_blank";
  a.rel = "noopener";
  a.textContent = "메타 광고 라이브러리에서 보기";
  div.appendChild(msg);
  div.appendChild(a);
  return div;
}

function attachMediaFallbacks(container) {
  container.querySelectorAll("video[data-fallback-link], img[data-fallback-link]").forEach((el) => {
    el.addEventListener("error", () => {
      const link = el.dataset.fallbackLink;
      el.replaceWith(mediaFallbackNode(link));
    });
  });
}

function tierOfBrand(brandName) {
  const b = DATA.brands.find((x) => x.name === brandName);
  return b ? b.tier : "C";
}

function cardMarkup(ad) {
  const d = daysSince(ad.start_date);
  const saved = isSaved(ad.library_id);
  const tier = tierOfBrand(ad.brand);
  return `
    <div class="ad-card" data-id="${ad.library_id}">
      <div class="media-wrap">
        <span class="tier-badge tier-${tier}">${tier}</span>
        <button class="save-btn ${saved ? "saved" : ""}" data-id="${ad.library_id}">${saved ? "♥" : "♡"}</button>
        ${mediaMarkup(ad)}
      </div>
      <div class="info">
        <div class="brand-name">${ad.brand || ""}</div>
        <div class="meta-row">
          <span class="media-type-tag">${ad.media_type === "video" ? "영상" : "이미지"}</span>
          <span class="dot">·</span>
          <span>${ad.start_date ? (d === 0 ? "오늘 시작" : d + "일째") : "날짜 미상"}</span>
        </div>
        <div class="info-spacer"></div>
        <a class="meta-link-btn" href="${ad.permalink}" target="_blank" rel="noopener">메타에서 보기 <span class="arrow">↗</span></a>
      </div>
    </div>`;
}

function renderFeed(containerId, ads) {
  const el = document.getElementById(containerId);
  el.innerHTML = ads.map(cardMarkup).join("");
  el.querySelectorAll(".save-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.dataset.id;
      const ad = ads.find((a) => a.library_id === id);
      toggleSave(ad, btn);
    });
  });
  attachMediaFallbacks(el);
}

function applyFilters(ads) {
  return ads.filter((ad) => {
    if (filters.mediaType !== "all" && ad.media_type !== filters.mediaType) return false;
    if (filters.tier !== "all" && tierOfBrand(ad.brand) !== filters.tier) return false;
    if (filters.brands.size > 0 && !filters.brands.has(ad.brand)) return false;
    return true;
  });
}

function isFilterActive() {
  return filters.mediaType !== "all" || filters.tier !== "all" || filters.brands.size > 0;
}

function renderFilteredFeeds() {
  const newAds = applyFilters(DATA.feed_new_today);
  const allAds = applyFilters(DATA.feed_all);
  document.querySelector("#panel-new .empty-msg").style.display = newAds.length ? "none" : "block";
  renderFeed("feed-new", newAds);
  renderFeed("feed-all", allAds);
  document.getElementById("filter-reset").style.display = isFilterActive() ? "inline-block" : "none";
}

function buildBrandChips() {
  const el = document.getElementById("brand-chips");
  el.innerHTML = DATA.brands.map((b) => `
    <button class="brand-chip" data-name="${escapeAttr(b.name)}">
      ${b.name} <span class="count">${b.total_count}</span>
    </button>`).join("");
  el.querySelectorAll(".brand-chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      const name = chip.dataset.name;
      if (filters.brands.has(name)) {
        filters.brands.delete(name);
        chip.classList.remove("active");
      } else {
        filters.brands.add(name);
        chip.classList.add("active");
      }
      renderFilteredFeeds();
    });
  });
}

function setupFilters() {
  document.querySelectorAll("#seg-media .seg-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("#seg-media .seg-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      filters.mediaType = btn.dataset.val;
      renderFilteredFeeds();
    });
  });
  document.querySelectorAll("#seg-tier .seg-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("#seg-tier .seg-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      filters.tier = btn.dataset.val;
      renderFilteredFeeds();
    });
  });
  document.getElementById("filter-reset").addEventListener("click", () => {
    filters.brands.clear();
    filters.mediaType = "all";
    filters.tier = "all";
    document.querySelectorAll(".seg-btn").forEach((b) => b.classList.toggle("active", b.dataset.val === "all"));
    document.querySelectorAll(".brand-chip").forEach((c) => c.classList.remove("active"));
    renderFilteredFeeds();
  });
  document.getElementById("tier-info-btn").addEventListener("click", showTierInfoModal);
  document.getElementById("tier-info-btn-2").addEventListener("click", showTierInfoModal);
}

function showTierInfoModal() {
  const modal = document.getElementById("brand-modal");
  const content = document.getElementById("modal-content");
  content.innerHTML = `
    <h2>등급은 어떻게 매겨지나요?</h2>
    <div class="sub">메타는 한국 상업광고의 실제 지출액을 공개하지 않아요. 그래서 "얼마 썼다" 대신 "워치리스트 안에서 지금 얼마나 세게 밀고 있나"를 상대 등급으로 보여줍니다.</div>
    <div class="formula-box">
      화력 지수 = 활성 광고 수 + (오늘 신규 소재 수 × <code>3</code>)<br/>
      → 이 지수로 워치리스트 26개 브랜드를 줄 세운 <b>상대 순위</b>가 등급입니다.
    </div>
    <div class="tier-legend">
      <div class="tier-legend-row"><span class="tier-badge tier-S">S</span><div class="desc">상위 15% <span class="pct">— 지금 가장 세게 미는 브랜드</span></div></div>
      <div class="tier-legend-row"><span class="tier-badge tier-A">A</span><div class="desc">상위 15~40% <span class="pct">— 꾸준히 활발</span></div></div>
      <div class="tier-legend-row"><span class="tier-badge tier-B">B</span><div class="desc">상위 40~75% <span class="pct">— 평균 수준</span></div></div>
      <div class="tier-legend-row"><span class="tier-badge tier-C">C</span><div class="desc">하위 25% <span class="pct">— 광고 활동이 적음</span></div></div>
    </div>
    <div class="sub">⚠️ 실제 원화 지출액이 아니라 <b>워치리스트 내부에서의 상대적 순위</b>입니다. 워치리스트 브랜드가 바뀌면 등급 기준선도 같이 움직여요.</div>
  `;
  modal.classList.remove("hidden");
}

function renderSavedTab() {
  const saved = getSaved();
  document.getElementById("saved-empty").style.display = saved.length ? "none" : "block";
  renderFeed("feed-saved", saved);
}

function sparklineSVG(history) {
  if (!history.length) return "";
  const w = 400, h = 60, pad = 4;
  const vals = history.map((h) => h.total_count);
  const max = Math.max(...vals, 1);
  const min = Math.min(...vals, 0);
  const range = Math.max(max - min, 1);
  const step = (w - pad * 2) / Math.max(vals.length - 1, 1);
  const pts = vals.map((v, i) => {
    const x = pad + i * step;
    const y = h - pad - ((v - min) / range) * (h - pad * 2);
    return `${x},${y}`;
  }).join(" ");
  return `<svg viewBox="0 0 ${w} ${h}" width="100%" height="${h}" preserveAspectRatio="none">
      <polyline points="${pts}" fill="none" stroke="#ff5c72" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>
    </svg>`;
}

function openBrandModal(brand) {
  const modal = document.getElementById("brand-modal");
  const content = document.getElementById("modal-content");
  const oldest = brand.oldest_active_ad;
  const oldestDays = oldest ? daysSince(oldest.start_date) : null;
  content.innerHTML = `
    <h2>${brand.name} <span class="tier-badge tier-${brand.tier}" style="position:static;display:inline-block;vertical-align:middle;">${brand.tier}</span></h2>
    <div class="sub">현재 활성 광고 ${brand.total_count}개 · 화력 지수 ${brand.heat_score}</div>
    <div class="sparkline-wrap">${sparklineSVG(brand.history)}</div>
    <div class="stat-grid">
      <div class="stat-box"><div class="label">전일 대비</div><div class="value">${brand.delta_total == null ? "-" : (brand.delta_total > 0 ? "+" : "") + brand.delta_total}</div></div>
      <div class="stat-box"><div class="label">오늘 신규 소재</div><div class="value">${brand.new_ads}개</div></div>
      <div class="stat-box"><div class="label">영상 / 이미지</div><div class="value">${brand.video_count} / ${brand.image_count}</div></div>
      <div class="stat-box"><div class="label">최장수 소재</div><div class="value">${oldestDays != null ? oldestDays + "일째" : "-"}</div></div>
    </div>
    ${oldest ? `<div class="card-feed">${cardMarkup({ ...oldest, brand: brand.name })}</div>` : ""}
  `;
  content.querySelectorAll(".save-btn").forEach((btn) => {
    btn.addEventListener("click", () => toggleSave(oldest ? { ...oldest, brand: brand.name } : null, btn));
  });
  attachMediaFallbacks(content);
  modal.classList.remove("hidden");
}

function renderRanking() {
  const el = document.getElementById("ranking-list");
  el.innerHTML = DATA.brands.map((b, i) => {
    let deltaClass = "delta-flat", deltaText = "-";
    if (b.delta_total != null) {
      if (b.delta_total > 0) { deltaClass = "delta-up"; deltaText = "+" + b.delta_total; }
      else if (b.delta_total < 0) { deltaClass = "delta-down"; deltaText = String(b.delta_total); }
      else { deltaText = "0"; }
    }
    return `
      <div class="rank-row" data-name="${b.name}">
        <div class="rank-num">${i + 1}</div>
        <span class="tier-badge tier-${b.tier}" style="position:static;">${b.tier}</span>
        <div class="rank-name">${b.name}</div>
        <div class="rank-score">활성 ${b.total_count}${b.new_ads ? ` · 🆕${b.new_ads}` : ""}</div>
        <div class="rank-delta ${deltaClass}">${deltaText}</div>
      </div>`;
  }).join("");
  el.querySelectorAll(".rank-row").forEach((row) => {
    row.addEventListener("click", () => {
      const brand = DATA.brands.find((b) => b.name === row.dataset.name);
      openBrandModal(brand);
    });
  });
}

function setupTabs() {
  document.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
      document.querySelectorAll(".panel").forEach((p) => p.classList.remove("active"));
      btn.classList.add("active");
      document.getElementById("panel-" + btn.dataset.tab).classList.add("active");
      if (btn.dataset.tab === "saved") renderSavedTab();
      document.getElementById("filter-bar").classList.toggle(
        "visible", btn.dataset.tab === "new" || btn.dataset.tab === "feed"
      );
    });
  });
  document.getElementById("modal-close").addEventListener("click", () => {
    document.getElementById("brand-modal").classList.add("hidden");
  });
  document.getElementById("brand-modal").addEventListener("click", (e) => {
    if (e.target.id === "brand-modal") e.target.classList.add("hidden");
  });
}

async function init() {
  setupTabs();
  const res = await fetch("data.json?t=" + Date.now());
  DATA = await res.json();

  document.getElementById("meta-info").textContent =
    `${DATA.generated_from_date} 기준` + (DATA.prev_date ? ` (전일 ${DATA.prev_date} 대비)` : " (첫 수집일)");

  buildBrandChips();
  setupFilters();
  renderFilteredFeeds();
  renderFeed("feed-hof", DATA.hall_of_fame);
  renderRanking();

  // 오늘 신규/전체 피드가 기본 탭이라 필터 바를 처음부터 보여준다
  document.getElementById("filter-bar").classList.add("visible");
}

init();
