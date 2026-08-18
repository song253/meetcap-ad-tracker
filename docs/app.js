const SAVE_KEY = "meetcap_saved_ads_v1";
// "+ 브랜드 제안"은 이 Cloudflare Worker로만 보낸다. 진짜 디스코드 웹훅은 Worker 안의
// 서버 secret으로만 존재하고 여기(브라우저 코드)엔 절대 없음 — 여기 있는 건 그냥
// "메시지 하나만 중계해주는" 공개 엔드포인트라 노출돼도 문제 없음.
const SUGGEST_ENDPOINT = "https://meetcap-brand-suggest.skyblock0902.workers.dev";

let DATA = null;
const filters = { brands: new Set(), mediaType: "all", tier: "all" };

const ICON_PATHS = {
  heart: '<path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.29 1.51 4.04 3 5.5l7 7Z"/>',
  image: '<rect width="18" height="18" x="3" y="3" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/>',
  video: '<path d="m16 13 5.223 3.482a.5.5 0 0 0 .777-.416V7.87a.5.5 0 0 0-.752-.432L16 10.5"/><rect x="2" y="6" width="14" height="12" rx="2"/>',
  externalLink: '<path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
  chevronUp: '<path d="m18 15-6-6-6 6"/>',
  chevronDown: '<path d="m6 9 6 6 6-6"/>',
  minus: '<path d="M5 12h14"/>',
};

function icon(name, size = 14) {
  const p = ICON_PATHS[name] || "";
  return `<svg class="icon" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${p}</svg>`;
}

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
  } else {
    list.unshift(ad);
    btnEl.classList.add("saved");
  }
  btnEl.innerHTML = icon("heart", 15);
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
  div.innerHTML = icon("image", 26);
  const msg = document.createElement("div");
  msg.textContent = "미리보기를 불러올 수 없어요";
  const a = document.createElement("a");
  a.href = permalink;
  a.target = "_blank";
  a.rel = "noopener";
  a.innerHTML = `메타에서 보기 ${icon("externalLink", 12)}`;
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
  const mediaIcon = ad.media_type === "video" ? icon("video", 12) : icon("image", 12);
  return `
    <div class="ad-card" data-id="${ad.library_id}">
      <div class="media-wrap">
        <span class="tier-badge tier-${tier}">${tier}</span>
        <button class="save-btn ${saved ? "saved" : ""}" data-id="${ad.library_id}">${icon("heart", 15)}</button>
        ${mediaMarkup(ad)}
      </div>
      <div class="info">
        <div class="brand-name">${ad.brand || ""}</div>
        <div class="meta-row">
          <span class="media-type-tag">${mediaIcon}${ad.media_type === "video" ? "영상" : "이미지"}</span>
          <span class="dot">·</span>
          <span>${ad.start_date ? (d === 0 ? "오늘 시작" : d + "일째") : "날짜 미상"}</span>
        </div>
        <div class="info-spacer"></div>
        <a class="meta-link-btn" href="${ad.permalink}" target="_blank" rel="noopener">메타에서 보기 ${icon("externalLink", 12)}</a>
      </div>
    </div>`;
}

const PAGE_SIZE = 24;
const pageState = {};

function renderFeed(containerId, ads, opts = {}) {
  const paginate = opts.paginate !== false;
  const el = document.getElementById(containerId);
  const moreEl = document.getElementById(containerId + "-more");

  if (paginate && (opts.reset || !(containerId in pageState))) {
    pageState[containerId] = PAGE_SIZE;
  }
  const visibleCount = paginate ? pageState[containerId] : ads.length;
  const visible = ads.slice(0, visibleCount);

  el.innerHTML = visible.map(cardMarkup).join("");
  el.querySelectorAll(".save-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.dataset.id;
      const ad = visible.find((a) => a.library_id === id);
      toggleSave(ad, btn);
    });
  });
  attachMediaFallbacks(el);

  if (moreEl) {
    const remaining = ads.length - visible.length;
    if (paginate && remaining > 0) {
      moreEl.innerHTML = `<button class="load-more-btn">더보기 <span class="remaining">${remaining}개 더</span></button>`;
      moreEl.querySelector(".load-more-btn").addEventListener("click", () => {
        pageState[containerId] += PAGE_SIZE;
        renderFeed(containerId, ads, { paginate: true });
      });
    } else {
      moreEl.innerHTML = "";
    }
  }
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
  renderFeed("feed-new", newAds, { reset: true });
  renderFeed("feed-all", allAds, { reset: true });
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
  document.getElementById("add-brand-btn").addEventListener("click", showProposeBrandModal);
}

function showProposeBrandModal() {
  const modal = document.getElementById("brand-modal");
  const content = document.getElementById("modal-content");
  content.innerHTML = `
    <h2>새 브랜드 제안</h2>
    <div class="sub">브랜드명(또는 인스타/메타 핸들)을 입력하면 팀 디스코드로 전달돼요. 확인 후 워치리스트에 추가됩니다 — 바로 대시보드에 반영되진 않아요.</div>
    <form class="propose-form" id="propose-form">
      <input type="text" id="propose-input" placeholder="예: 무센트" maxlength="80" autocomplete="off" />
      <div class="propose-status" id="propose-status"></div>
      <div class="actions">
        <button type="button" class="btn-secondary" id="propose-cancel">취소</button>
        <button type="submit" class="btn-primary" id="propose-submit">제안 보내기</button>
      </div>
    </form>
  `;
  modal.classList.remove("hidden");

  const input = document.getElementById("propose-input");
  const statusEl = document.getElementById("propose-status");
  const submitBtn = document.getElementById("propose-submit");
  input.focus();

  document.getElementById("propose-cancel").addEventListener("click", () => {
    modal.classList.add("hidden");
  });

  document.getElementById("propose-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const name = input.value.trim();
    if (!name) return;

    submitBtn.disabled = true;
    input.disabled = true;
    statusEl.textContent = "보내는 중...";
    statusEl.className = "propose-status";

    try {
      const res = await fetch(SUGGEST_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) throw new Error("bad response");
      statusEl.textContent = "제안 완료! 확인 후 추가할게요.";
      statusEl.className = "propose-status ok";
      setTimeout(() => modal.classList.add("hidden"), 1200);
    } catch {
      statusEl.textContent = "전송 실패 — 잠시 후 다시 시도해주세요.";
      statusEl.className = "propose-status err";
      submitBtn.disabled = false;
      input.disabled = false;
    }
  });
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
  renderFeed("feed-saved", saved, { reset: true });
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
      <polyline points="${pts}" fill="none" stroke="#fb3a5d" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>
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
    let deltaClass = "delta-flat", deltaIcon = "", deltaText = "-";
    if (b.delta_total != null) {
      if (b.delta_total > 0) { deltaClass = "delta-up"; deltaIcon = icon("chevronUp", 12); deltaText = String(b.delta_total); }
      else if (b.delta_total < 0) { deltaClass = "delta-down"; deltaIcon = icon("chevronDown", 12); deltaText = String(Math.abs(b.delta_total)); }
      else { deltaIcon = icon("minus", 12); deltaText = "0"; }
    }
    const newBadge = b.new_ads ? `<span class="rank-new-badge">+${b.new_ads} 신규</span>` : "";
    return `
      <div class="rank-row" data-name="${b.name}">
        <div class="rank-num">${i + 1}</div>
        <span class="tier-badge tier-${b.tier}" style="position:static;">${b.tier}</span>
        <div class="rank-name">${b.name}${newBadge}</div>
        <div class="rank-score">활성 ${b.total_count}</div>
        <div class="rank-delta ${deltaClass}">${deltaIcon}${deltaText}</div>
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

function makeDragScrollable(el) {
  if (!el) return;
  el.classList.add("no-scrollbar");
  const DRAG_THRESHOLD = 10; // 이 픽셀을 넘게 움직여야 "드래그"로 인정 (그냥 클릭할 때의 손떨림은 무시)
  let isDown = false;
  let startX = 0;
  let startScroll = 0;
  let dragging = false;

  el.addEventListener("mousedown", (e) => {
    isDown = true;
    dragging = false;
    startX = e.clientX;
    startScroll = el.scrollLeft;
  });
  window.addEventListener("mouseup", () => {
    isDown = false;
    el.classList.remove("dragging");
  });
  el.addEventListener("mouseleave", () => {
    isDown = false;
    el.classList.remove("dragging");
  });
  el.addEventListener("mousemove", (e) => {
    if (!isDown) return;
    const dx = e.clientX - startX;
    if (!dragging) {
      if (Math.abs(dx) < DRAG_THRESHOLD) return; // 아직 클릭인지 드래그인지 애매한 구간 - 아무것도 안 함
      dragging = true;
      el.classList.add("dragging");
    }
    e.preventDefault();
    el.scrollLeft = startScroll - dx;
  });
  // 실제로 드래그가 일어났을 때만 그 뒤에 딸려오는 클릭을 무시 (칩 오작동 방지)
  el.addEventListener(
    "click",
    (e) => {
      if (dragging) {
        e.stopPropagation();
        e.preventDefault();
      }
    },
    true
  );
}

async function init() {
  setupTabs();
  makeDragScrollable(document.getElementById("brand-chips"));
  makeDragScrollable(document.getElementById("tabs"));
  const res = await fetch("data.json?t=" + Date.now());
  DATA = await res.json();

  document.getElementById("meta-info").textContent =
    `${DATA.generated_from_date} 기준` + (DATA.prev_date ? ` (전일 ${DATA.prev_date} 대비)` : " (첫 수집일)");

  buildBrandChips();
  setupFilters();
  renderFilteredFeeds();
  renderFeed("feed-hof", DATA.hall_of_fame, { paginate: false });
  renderRanking();

  // 오늘 신규/전체 피드가 기본 탭이라 필터 바를 처음부터 보여준다
  document.getElementById("filter-bar").classList.add("visible");
}

init();
