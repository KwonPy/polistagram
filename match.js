// 상대 경로로 두면, 이 페이지가 열린 주소를 그대로 기준으로 삼는다.
// 로컬(vercel dev)이든 배포된 주소든 따로 안 바꿔도 된다.
const API_URL = "/api/match";
const STORAGE_KEY = "polistagram_profile";

const statusEl = document.getElementById("status");
const tabsEl = document.getElementById("tabs");
const feedEl = document.getElementById("feed");

let allMatches = [];
let activeTopic = "전체";
let currentProfile = null; // 카드뉴스의 hook 문구("왜 나에게 떴는지")에 관심사를 넣어주려고 기억해둔다.

function renderTabs() {
  const topics = ["전체", ...new Set(allMatches.flatMap((m) => m.topics))];
  tabsEl.innerHTML = "";
  for (const topic of topics) {
    const btn = document.createElement("button");
    btn.className = "tab" + (topic === activeTopic ? " active" : "");
    btn.textContent = topic;
    btn.addEventListener("click", () => {
      activeTopic = topic;
      renderTabs();
      renderFeed();
    });
    tabsEl.appendChild(btn);
  }
}

// 첫 카드는 매거진 커버처럼 크게, 나머지는 아이콘+텍스트를 가로로 배치한 컴팩트한
// 행으로 보여준다 (2026-09-27, 4색 배경 대신 콘텐츠 자체로 카드를 구별하는 방향).
function renderFeed() {
  const filtered =
    activeTopic === "전체"
      ? allMatches
      : allMatches.filter((m) => m.topics.includes(activeTopic));

  feedEl.innerHTML = "";
  filtered.forEach((match, index) => {
    const { personalizedSignal, title, personalizedLine, tags, iconSlug, cardCount } = buildFeedCard(
      match,
      currentProfile
    );
    const isCover = index === 0;

    const card = document.createElement("button");
    card.type = "button";
    card.className = "card " + (isCover ? "card--cover" : "card--compact");
    card.addEventListener("click", () => openCards(match));

    const signalHtml = personalizedSignal
      ? `<span class="card-pill">${iconMarkup("sparkle", 13)}${personalizedSignal}</span>`
      : "";
    const tagsHtml = `<div class="card-tags">${tags.map((t) => `<span class="card-tag">#${t}</span>`).join("")}</div>`;
    // 예전엔 "···"와 화살표 아이콘이 있었는데 둘 다 눌러도 아무 일도 없는 장식이었다.
    // 대신 실제 정보(스토리 카드가 몇 장인지)를 보여준다.
    const countHtml = `<span class="card-count">${cardCount}장</span>`;

    card.innerHTML = isCover
      ? `
        <div class="card-top">
          <div class="brand"><span class="brand-mark"></span><span class="brand-name">polistagram</span></div>
          ${countHtml}
        </div>
        ${signalHtml}
        <p class="card-title">${title}</p>
        <p class="card-line">${personalizedLine}</p>
        <div class="card-icon">${phosphorIcon(iconSlug, 64)}</div>
        ${tagsHtml}
      `
      : `
        <div class="card-thumb">${phosphorIcon(iconSlug, 30)}</div>
        <div class="card-compact-body">
          ${signalHtml}
          <p class="card-title">${title}</p>
          <p class="card-line">${personalizedLine}</p>
          <div class="card-compact-foot">${tagsHtml}${countHtml}</div>
        </div>
      `;
    feedEl.appendChild(card);
  });
}

// --- 카드뉴스(Story View) 오버레이 ---
// 아이콘 SVG 모음. 24x24, 같은 선 굵기(1.8)로 통일해서 아이콘끼리 톤이 어긋나지 않게 한다.
// 이모지를 안 쓰는 이유: 기기·폰트마다 다르게 보이고 색을 디자인 시스템에 맞출 수 없다.
const ICON_SVGS = {
  target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.2" fill="currentColor" stroke="none"/>',
  refreshCw: '<path d="M20 11a8 8 0 00-14.9-3"/><path d="M4 13a8 8 0 0014.9 3"/><path d="M20 4v5h-5"/><path d="M4 20v-5h5"/>',
  trendingUp: '<polyline points="3 17 9 11 13 15 21 6"/><polyline points="14 6 21 6 21 13"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><line x1="3" y1="10" x2="21" y2="10"/><line x1="8" y1="3" x2="8" y2="7"/><line x1="16" y1="3" x2="16" y2="7"/>',
  externalLink: '<path d="M14 4h6v6"/><path d="M20 4l-9 9"/><path d="M19 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h6"/>',
  loan: '<circle cx="12" cy="12" r="9"/><line x1="8" y1="16" x2="16" y2="8"/><circle cx="9" cy="9" r="1.3" fill="currentColor" stroke="none"/><circle cx="15" cy="15" r="1.3" fill="currentColor" stroke="none"/>',
  house: '<path d="M4 11l8-7 8 7"/><path d="M6 10v9a1 1 0 001 1h10a1 1 0 001-1v-9"/><path d="M10 20v-6h4v6"/>',
  piggyBank: '<ellipse cx="12" cy="13" rx="8" ry="5"/><line x1="9" y1="10" x2="11" y2="10"/><circle cx="16" cy="12" r="0.8" fill="currentColor" stroke="none"/><line x1="9" y1="18" x2="9" y2="20"/><line x1="15" y1="18" x2="15" y2="20"/>',
  chartLine: '<line x1="4" y1="20" x2="4" y2="12"/><line x1="10" y1="20" x2="10" y2="8"/><line x1="16" y1="20" x2="16" y2="14"/><line x1="20" y1="20" x2="20" y2="4"/>',
  shield: '<path d="M12 3l7 3v6c0 5-3 8-7 9-4-1-7-4-7-9V6l7-3z"/><polyline points="9 12 11 14 15 10"/>',
  briefcase: '<rect x="3" y="8" width="18" height="12" rx="2"/><path d="M8 8V6a2 2 0 012-2h4a2 2 0 012 2v2"/><line x1="3" y1="13" x2="21" y2="13"/>',
  badgeCheck: '<circle cx="12" cy="12" r="9"/><polyline points="8 12 11 15 16 9"/>',
  document: '<path d="M7 3h7l5 5v13a1 1 0 01-1 1H7a1 1 0 01-1-1V4a1 1 0 011-1z"/><polyline points="14 3 14 8 19 8"/><line x1="9" y1="13" x2="15" y2="13"/><line x1="9" y1="17" x2="15" y2="17"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 20c0-4.4 3.6-7 8-7s8 2.6 8 7"/>',
  gift: '<rect x="3" y="8" width="18" height="13" rx="2"/><path d="M12 8v13"/><path d="M3 12h18"/><path d="M7.5 8a2.5 2.5 0 010-5C9.5 3 12 5 12 8"/><path d="M16.5 8a2.5 2.5 0 000-5C14.5 3 12 5 12 8"/>',
  check: '<polyline points="4 12 9 17 20 6"/>',
  lightbulb: '<path d="M9 18h6"/><path d="M10 22h4"/><path d="M12 2a7 7 0 00-4 12.7c.6.5 1 1.3 1 2.3h6c0-1 .4-1.8 1-2.3A7 7 0 0012 2z"/>',
  search: '<circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>',
  more: '<circle cx="5" cy="12" r="1.4" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none"/><circle cx="19" cy="12" r="1.4" fill="currentColor" stroke="none"/>',
  sparkle: '<path d="M12 2l1.8 5.2L19 9l-5.2 1.8L12 16l-1.8-5.2L5 9l5.2-1.8z"/>',
  arrowRight: '<line x1="4" y1="12" x2="20" y2="12"/><polyline points="14 6 20 12 14 18"/>',
  arrowDown: '<line x1="12" y1="4" x2="12" y2="20"/><polyline points="6 14 12 20 18 14"/>',
};

function iconMarkup(key, size) {
  const inner = ICON_SVGS[key] || ICON_SVGS.document;
  const px = size || 22;
  return `<svg width="${px}" height="${px}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`;
}

// My Feed 주제 아이콘 — Phosphor Icons(MIT, unpkg CDN에서 정적 SVG로 내려받음) duotone
// 스타일. Gemini 호출이 없어서 할당량 문제가 없고, fill="currentColor"라 CSS color만
// 바꾸면 브랜드 톤에 맞출 수 있다 (2026-09-27, 기존 8개 PNG 대체 — ICON_SVGS와 viewBox가
// 달라서 별도 헬퍼로 둔다).
const PHOSPHOR_ICONS = {
  loan: '<path d="M16,152H48v56H16a8,8,0,0,1-8-8V160A8,8,0,0,1,16,152ZM204,56a28,28,0,0,0-12,2.71h0A28,28,0,1,0,176,85.29h0A28,28,0,1,0,204,56Z" opacity="0.2"/><path d="M230.33,141.06a24.43,24.43,0,0,0-21.24-4.23l-41.84,9.62A28,28,0,0,0,140,112H89.94a31.82,31.82,0,0,0-22.63,9.37L44.69,144H16A16,16,0,0,0,0,160v40a16,16,0,0,0,16,16H120a7.93,7.93,0,0,0,1.94-.24l64-16a6.94,6.94,0,0,0,1.19-.4L226,182.82l.44-.2a24.6,24.6,0,0,0,3.93-41.56ZM16,160H40v40H16Zm203.43,8.21-38,16.18L119,200H56V155.31l22.63-22.62A15.86,15.86,0,0,1,89.94,128H140a12,12,0,0,1,0,24H112a8,8,0,0,0,0,16h32a8.32,8.32,0,0,0,1.79-.2l67-15.41.31-.08a8.6,8.6,0,0,1,6.3,15.9ZM164,96a36,36,0,0,0,5.9-.48,36,36,0,1,0,28.22-47A36,36,0,1,0,164,96Zm60-12a20,20,0,1,1-20-20A20,20,0,0,1,224,84ZM164,40a20,20,0,0,1,19.25,14.61,36,36,0,0,0-15,24.93A20.42,20.42,0,0,1,164,80a20,20,0,0,1,0-40Z"/>',
  housing: '<path d="M216,120v96H152V152H104v64H40V120a8,8,0,0,1,2.34-5.66l80-80a8,8,0,0,1,11.32,0l80,80A8,8,0,0,1,216,120Z" opacity="0.2"/><path d="M219.31,108.68l-80-80a16,16,0,0,0-22.62,0l-80,80A15.87,15.87,0,0,0,32,120v96a8,8,0,0,0,8,8h64a8,8,0,0,0,8-8V160h32v56a8,8,0,0,0,8,8h64a8,8,0,0,0,8-8V120A15.87,15.87,0,0,0,219.31,108.68ZM208,208H160V152a8,8,0,0,0-8-8H104a8,8,0,0,0-8,8v56H48V120l80-80,80,80Z"/>',
  savings: '<path d="M240,112v32a16,16,0,0,1-16,16h-8l-18.1,50.69a8,8,0,0,1-7.54,5.31H177.64a8,8,0,0,1-7.54-5.31L166.29,200H97.71L93.9,210.69A8,8,0,0,1,86.36,216H73.64a8,8,0,0,1-7.54-5.31L53,174a79.7,79.7,0,0,1-21-54h0a80,80,0,0,1,80-80h32a80,80,0,0,1,73.44,48.22,82.22,82.22,0,0,1,2.9,7.78H224A16,16,0,0,1,240,112Z" opacity="0.2"/><path d="M192,116a12,12,0,1,1-12-12A12,12,0,0,1,192,116ZM152,64H112a8,8,0,0,0,0,16h40a8,8,0,0,0,0-16Zm96,48v32a24,24,0,0,1-24,24h-2.36l-16.21,45.38A16,16,0,0,1,190.36,224H177.64a16,16,0,0,1-15.07-10.62L160.65,208h-57.3l-1.92,5.38A16,16,0,0,1,86.36,224H73.64a16,16,0,0,1-15.07-10.62L46,178.22a87.69,87.69,0,0,1-21.44-48.38A16,16,0,0,0,16,144a8,8,0,0,1-16,0,32,32,0,0,1,24.28-31A88.12,88.12,0,0,1,112,32H216a8,8,0,0,1,0,16H194.61a87.93,87.93,0,0,1,30.17,37c.43,1,.85,2,1.25,3A24,24,0,0,1,248,112Zm-16,0a8,8,0,0,0-8-8h-3.66a8,8,0,0,1-7.64-5.6A71.9,71.9,0,0,0,144,48H112A72,72,0,0,0,58.91,168.64a8,8,0,0,1,1.64,2.71L73.64,208H86.36l3.82-10.69A8,8,0,0,1,97.71,192h68.58a8,8,0,0,1,7.53,5.31L177.64,208h12.72l18.11-50.69A8,8,0,0,1,216,152h8a8,8,0,0,0,8-8Z"/>',
  invest: '<path d="M232,56v64L168,56Z" opacity="0.2"/><path d="M232,48H168a8,8,0,0,0-5.66,13.66L188.69,88,136,140.69l-34.34-34.35a8,8,0,0,0-11.32,0l-72,72a8,8,0,0,0,11.32,11.32L96,123.31l34.34,34.35a8,8,0,0,0,11.32,0L200,99.31l26.34,26.35A8,8,0,0,0,240,120V56A8,8,0,0,0,232,48Zm-8,52.69L187.31,64H224Z"/>',
  insurance: '<path d="M216,56v56c0,96-88,120-88,120S40,208,40,112V56a8,8,0,0,1,8-8H208A8,8,0,0,1,216,56Z" opacity="0.2"/><path d="M208,40H48A16,16,0,0,0,32,56v56c0,52.72,25.52,84.67,46.93,102.19,23.06,18.86,46,25.26,47,25.53a8,8,0,0,0,4.2,0c1-.27,23.91-6.67,47-25.53C198.48,196.67,224,164.72,224,112V56A16,16,0,0,0,208,40Zm0,72c0,37.07-13.66,67.16-40.6,89.42A129.3,129.3,0,0,1,128,223.62a128.25,128.25,0,0,1-38.92-21.81C61.82,179.51,48,149.3,48,112l0-56,160,0ZM82.34,141.66a8,8,0,0,1,11.32-11.32L112,148.69l50.34-50.35a8,8,0,0,1,11.32,11.32l-56,56a8,8,0,0,1-11.32,0Z"/>',
  business: '<path d="M224,96v16a32,32,0,0,1-64,0V96H96v16a32,32,0,0,1-64,0V96L46.34,45.8A8,8,0,0,1,54,40H202a8,8,0,0,1,7.69,5.8Z" opacity="0.2"/><path d="M231.69,93.81,217.35,43.6A16.07,16.07,0,0,0,202,32H54A16.07,16.07,0,0,0,38.65,43.6L24.31,93.81A7.94,7.94,0,0,0,24,96v16a40,40,0,0,0,16,32v72a8,8,0,0,0,8,8H208a8,8,0,0,0,8-8V144a40,40,0,0,0,16-32V96A7.94,7.94,0,0,0,231.69,93.81ZM54,48H202l11.42,40H42.61Zm98,56v8a24,24,0,0,1-48,0v-8ZM51.06,132.2A24,24,0,0,1,40,112v-8H88v8a24,24,0,0,1-35.12,21.26A7.88,7.88,0,0,0,51.06,132.2ZM200,208H56V151.2a40.57,40.57,0,0,0,8,.8,40,40,0,0,0,32-16,40,40,0,0,0,64,0,40,40,0,0,0,32,16,40.57,40.57,0,0,0,8-.8Zm16-96a24,24,0,0,1-11.07,20.2,8.08,8.08,0,0,0-1.8,1.05A24,24,0,0,1,168,112v-8h48Z"/>',
  job: '<path d="M224,118.31V200a8,8,0,0,1-8,8H40a8,8,0,0,1-8-8V118.31h0A191.14,191.14,0,0,0,128,144,191.08,191.08,0,0,0,224,118.31Z" opacity="0.2"/><path d="M104,112a8,8,0,0,1,8-8h32a8,8,0,0,1,0,16H112A8,8,0,0,1,104,112ZM232,72V200a16,16,0,0,1-16,16H40a16,16,0,0,1-16-16V72A16,16,0,0,1,40,56H80V48a24,24,0,0,1,24-24h48a24,24,0,0,1,24,24v8h40A16,16,0,0,1,232,72ZM96,56h64V48a8,8,0,0,0-8-8H104a8,8,0,0,0-8,8ZM40,72v41.62A184.07,184.07,0,0,0,128,136a184,184,0,0,0,88-22.39V72ZM216,200V131.63A200.25,200.25,0,0,1,128,152a200.19,200.19,0,0,1-88-20.36V200H216Z"/>',
  etc: '<path d="M208,88H152V32Z" opacity="0.2"/><path d="M213.66,82.34l-56-56A8,8,0,0,0,152,24H56A16,16,0,0,0,40,40V216a16,16,0,0,0,16,16H200a16,16,0,0,0,16-16V88A8,8,0,0,0,213.66,82.34ZM160,51.31,188.69,80H160ZM200,216H56V40h88V88a8,8,0,0,0,8,8h48V216Zm-32-80a8,8,0,0,1-8,8H96a8,8,0,0,1,0-16h64A8,8,0,0,1,168,136Zm0,32a8,8,0,0,1-8,8H96a8,8,0,0,1,0-16h64A8,8,0,0,1,168,168Z"/>',
};

function phosphorIcon(key, size) {
  const inner = PHOSPHOR_ICONS[key] || PHOSPHOR_ICONS.etc;
  const px = size || 40;
  return `<svg class="phosphor-icon" width="${px}" height="${px}" viewBox="0 0 256 256" fill="currentColor">${inner}</svg>`;
}

// 정책 주제(topics)에 따라 아이콘 히어로에 넣을 아이콘만 바뀐다 — "고정 디자인 시스템 +
// 가변 시각 콘텐츠" 구조: 카드 레이아웃/색은 card_type이 정하고, 아이콘만 주제가 정한다.
const TOPIC_ICON = {
  "대출": "loan",
  "주거·전세": "house",
  "저축·자산형성": "piggyBank",
  "투자·주식": "chartLine",
  "보험": "shield",
  "창업·사업자금": "briefcase",
  "취업·채용": "badgeCheck",
  "기타": "document",
};

// My Feed 카드 아이콘 — 주제(topics[0])별로 PHOSPHOR_ICONS의 어느 키를 쓸지 정한다.
// 예전엔 Fluent Emoji 3D PNG를 썼는데(에셋은 assets/icons/에 남아있지만 더 안 쓴다),
// Story View 아이콘과 톤이 안 맞고 기사 내용과 무관하게 항상 똑같아 보인다는 지적이
// 있어서 Phosphor Icons(정적 SVG, 인라인)로 교체했다 (2026-09-27).
const TOPIC_ICON_SLUG = {
  "대출": "loan",
  "주거·전세": "housing",
  "저축·자산형성": "savings",
  "투자·주식": "invest",
  "보험": "insurance",
  "창업·사업자금": "business",
  "취업·채용": "job",
  "기타": "etc",
};

// 제목 안에서 화면에 실제로 보이는 첫 해시태그를 찾아 브랜드 색으로 강조한다. 예전엔
// topics[0]을 썼는데, topics 배열 순서는 분류 프롬프트가 정하지 않아 사실상 무작위였고
// 그 값이 화면에 보이지도 않았다 — 이제 실제로 보이는 태그와 강조색을 맞춘다
// (2026-09-27). 못 찾으면 그냥 평문으로 보여준다.
function highlightKeyword(text, keyword) {
  if (!keyword || !text.includes(keyword)) return text;
  return text.replace(keyword, `<span class="hl">${keyword}</span>`);
}

// personalized_signal이 코드 폴백("나에게 관련 있어요")으로 뜰 때, 왜 관련 있는지
// 실제 근거를 한 줄로 만든다. buildStoryCards의 hook 카드가 만드는 근거 문장과 같은
// 재료(관심사 겹침/지역/직업군)를 쓴다 — "관련 있다"고만 하고 이유를 안 보여준다는
// 피드백(2026-09-28)에 따라, 목록 카드에서도 이유가 바로 보이게 한다.
function buildRelevanceReason(match, profile, overlap) {
  if (!profile) return null;
  if (overlap.length > 0) {
    return `관심 분야로 등록하신 '${overlap.join(", ")}'${josaWaGwa(overlap[overlap.length - 1])} 관련 있어요`;
  }
  const regionHit = Boolean(match.region_scope && profile.region && match.region_scope.includes(profile.region));
  if (regionHit) return `${profile.region} 지역에 해당하는 정책이에요`;
  const occupationHit = Boolean(
    match.audience_groups && profile.occupation_type && match.audience_groups.includes(profile.occupation_type)
  );
  if (occupationHit) return `'${profile.occupation_type}'인 분들을 위한 정책이에요`;
  return null;
}

// app/feed_card_generator.py가 만든 티저 문구(Gemini 생성)가 있으면 그걸 쓰고, 없으면
// (아직 생성 전인 새 기사) 기존 2/3계층 필드로 대체 표시한다. personal_relevance 값
// 자체는 노출하지 않는다.
function buildFeedCard(match, profile) {
  const overlap = profile ? match.topics.filter((t) => profile.interests?.includes(t)) : [];
  const isDirect = match.personal_relevance === "direct";
  const isFallbackSignal = isDirect && overlap.length > 0 && !match.feed_personalized_signal;

  const personalizedSignal =
    match.feed_personalized_signal || (isDirect && overlap.length > 0 ? "나에게 관련 있어요" : null);

  const tags = (match.feed_tags.length ? match.feed_tags : match.topics.slice(0, 2)).slice(0, 2);
  const rawTitle = match.feed_title || match.one_line_summary;
  const title = highlightKeyword(rawTitle, tags[0]);

  // summary_easy는 3~5문장짜리 긴 설명이라 폴백으로 쓰면 목록 카드가 줄글처럼 보인다.
  // one_line_summary(2계층에서 이미 한 문장으로 요약된 필드)로 폴백해야 짧게 유지된다.
  // personalizedSignal이 코드 폴백일 때는(LLM이 문구를 안 만든 경우) one_line_summary
  // 대신 실제 매칭 근거(buildRelevanceReason)를 먼저 써서 "왜 관련 있는지"가 보이게 한다.
  const personalizedLine =
    match.feed_personalized_line ||
    (isFallbackSignal ? buildRelevanceReason(match, profile, overlap) : null) ||
    match.one_line_summary ||
    "";

  const iconSlug = TOPIC_ICON_SLUG[match.topics[0]] || "etc";
  // 카드를 열면 스토리 카드가 몇 장인지 미리 보여준다 — 실제 카드가 아직 없으면(신규
  // 기사) 합성 경로(buildStoryCards)가 만들 카드 수를 그대로 계산한다. 이 함수는
  // openCards()도 똑같이 쓰는 함수라 두 곳의 숫자가 항상 일치한다.
  const cardCount = match.story_cards.length || buildStoryCards(match, profile).length;

  return { personalizedSignal, title, personalizedLine, tags, iconSlug, cardCount };
}

// "저축·자산형성" 처럼 받침 있는 단어 뒤엔 "과", 받침 없으면 "와" — 조사를 자동으로 고른다.
function josaWaGwa(word) {
  const code = word.charCodeAt(word.length - 1);
  if (code < 0xac00 || code > 0xd7a3) return "와"; // 한글 음절이 아니면 기본값
  return (code - 0xac00) % 28 === 0 ? "와" : "과";
}

// doc_type(2계층 분류)을 사람이 읽는 "무엇이 달라지는지" 한 줄로 바꾼다.
const CHANGE_LABEL_BY_DOC_TYPE = {
  support_program: "새로운 지원 프로그램이 생겨요",
  rule_change: "제도·규정이 바뀌어요",
  plan: "이런 방향으로 계획이 발표됐어요",
  info: "이런 소식이 있어요",
  admin: "행정 절차에 변화가 있어요",
};

function infoRow(icon, label, value) {
  return `
    <div class="info-row">
      <span class="info-icon">${iconMarkup(icon, 18)}</span>
      <div>
        <p class="info-label">${label}</p>
        <p class="info-value">${value}</p>
      </div>
    </div>
  `;
}

// --- 카드 다이어그램 헬퍼 (2026-09-26, Figma 레퍼런스 반영) ---
// 원문에 없는 사실은 지어내지 않는다 — 이미 있는 필드(target/benefit/key_dates 등)를
// 다른 모양(리스트/타임라인/비교박스)으로 배치만 바꾼다.

// "." 기준으로 첫 문장만 뽑는다. summary_easy는 3~5문장이라, 카드 리드 문구로 쓰기엔
// 첫 문장 정도가 적당하다.
function firstSentence(text) {
  if (!text) return "";
  const idx = text.indexOf(".");
  return idx === -1 ? text : text.slice(0, idx + 1);
}

// "저축, 대출, 보증 지원" 같은 문장을 쉼표/가운뎃점/슬래시/"및" 기준으로 쪼갠다.
// 실제로 여러 항목일 때만(길이 > 1) 리스트로 쓰고, 한 덩어리 문장이면 빈 배열을
// 반환해서 호출부가 기존 방식(요약 박스)으로 대체하게 한다.
function splitToItems(text, max = 3) {
  if (!text) return [];
  const parts = text
    .split(/[,、·/]|\s및\s|\s그리고\s/)
    .map((s) => s.trim())
    .filter(Boolean);
  return parts.length > 1 ? parts.slice(0, max) : [];
}

// intro 카드: 혜택 문구가 여러 항목이면 아이콘 리스트로, 아니면 기존 요약 박스로.
// 예전에는 여기에 아무 정보도 없는 장식용 원형 아이콘(icon-hero)을 넣었는데
// (2026-09-27, 사용자 피드백으로 제거) — 내용이 짧은 카드일수록 "디자인에 맞추려고
// 채워넣은 빈 자리"처럼 보인다는 지적이 있었다. 정보가 있는 요소만 남긴다.
function buildIntroBody(match) {
  const items = match.benefit ? splitToItems(match.benefit) : [];

  if (items.length > 0) {
    const rows = items
      .map(
        (t) => `
          <div class="item-row">
            <span class="item-icon">${iconMarkup("check", 16)}</span>
            <span>${t}</span>
          </div>
        `
      )
      .join("");
    return { lead: firstSentence(match.summary_easy), bodyHtml: `<div class="item-list">${rows}</div>` };
  }

  // summary_easy 전체를 아래 박스에 그대로 보여줄 거라, 위쪽 리드 문구에 첫 문장을
  // 또 넣으면 같은 문장이 두 번 보인다 (change 카드에서 발견된 것과 같은 문제).
  // 이 경우엔 리드를 비우고 박스 하나로만 보여준다.
  return {
    lead: "",
    bodyHtml: `
      <div class="summary-box">
        <p class="summary-label">${iconMarkup("document", 14)}한 줄 요약</p>
        <p class="summary-text">${match.summary_easy || "아직 쉬운 설명이 준비되지 않았어요."}</p>
      </div>
    `,
  };
}

// change 카드: 원문에 실제 "기존에는 ~였으나" 같은 대조 표현이 있을 때만(card.beforeText/
// afterText, app/card_generator.py가 판단) Before/After 비교박스를 보여준다. 그런 대조가
// 없으면(예: 완전히 새로 생기는 지원사업) 없는 "기존"을 지어내지 않고, 변화 내용을 그냥
// 나열한다 (2026-09-28, 사용자 피드백 — 이전엔 doc_type별 뻔한 채움 문구로 모든 기사에
// 강제로 비교박스를 씌웠었다).
function buildChangeDiagram(match, card) {
  const bars = (heights) => heights.map((h) => `<span style="height:${h}px"></span>`).join("");

  if (card?.beforeText && card?.afterText) {
    return `
      <div class="compare-stack">
        <div class="compare-box before">
          <span class="compare-tag before">기존</span>
          <p>${card.beforeText}</p>
          <div class="compare-bars">${bars([8, 12, 10])}</div>
        </div>
        <span class="compare-arrow">${iconMarkup("arrowDown", 20)}</span>
        <div class="compare-box after">
          <span class="compare-tag after">변경</span>
          <p>${card.afterText}</p>
          <div class="compare-bars">${bars([14, 20, 26])}</div>
        </div>
      </div>
    `;
  }

  // 대조 표현이 없는 경우: card.changeText(LLM이 쓴 copy, 아직 태그 없는 원문) 또는
  // one_line_summary를 항목으로 쪼갤 수 있으면 체크리스트로, 아니면 요약 박스
  // 하나로 보여준다. **먼저 쪼갠 뒤에** 하이라이트를 입힌다 — 반대로 하면(먼저
  // <span> 태그를 씌운 뒤 쪼개면) 태그 안의 "/"에서 잘려 태그가 깨진다.
  const text = card?.changeText || match.one_line_summary || "";
  const items = splitToItems(text, 4);
  if (items.length > 0) {
    const rows = items
      .map(
        (t) =>
          `<div class="item-row"><span class="item-icon">${iconMarkup("check", 16)}</span><span>${wrapHighlight(t, card?.changeHighlight)}</span></div>`
      )
      .join("");
    return `<div class="item-list">${rows}</div>`;
  }
  return `
    <div class="summary-box">
      <p class="summary-label">${iconMarkup("refreshCw", 14)}달라지는 점</p>
      <p class="summary-text">${wrapHighlight(text, card?.changeHighlight) || "아직 상세 내용이 준비되지 않았어요."}</p>
    </div>
  `;
}

// impact 카드: 대상이 여러 항목이면 01/02/03 번호 리스트로, 혜택은 노란 팁 박스로.
function buildImpactDiagram(match) {
  const targets = match.target ? splitToItems(match.target) : [];
  let rowsHtml = "";
  if (targets.length > 0) {
    rowsHtml = `<div class="item-list">${targets
      .map(
        (t, i) => `
          <div class="numbered-row">
            <span class="num-badge">0${i + 1}</span>
            <span>${t}</span>
          </div>
        `
      )
      .join("")}</div>`;
  } else if (match.target) {
    rowsHtml = `<div class="info-box">${infoRow("user", "지원 대상", match.target)}</div>`;
  }

  // match.benefit이 없으면 팁 박스를 만들지 않는다 — 카드 자신의 문구(card.lead)는
  // 이미 위쪽 .story-lead로 보이고 있어서, 여기 또 넣으면 같은 문장이 두 번 보인다.
  const tip = match.benefit
    ? `
      <div class="tip-box">
        <p class="tip-label">${iconMarkup("lightbulb", 14)}핵심 혜택</p>
        <p class="tip-text">${match.benefit}</p>
      </div>
    `
    : "";

  return `${rowsHtml}${tip}`;
}

// schedule 카드: 아이콘 행 대신 세로 타임라인. 있는 필드만 순서대로 늘어놓는다.
function buildScheduleDiagram(match) {
  const items = [];
  const keyDates = match.key_dates ?? [];
  if (keyDates.length > 0) items.push({ label: "시행일", value: keyDates.join(" · ") });
  if (match.how_to_apply) items.push({ label: "신청 방법", value: match.how_to_apply });
  if (match.target) items.push({ label: "신청 대상", value: match.target });
  if (match.deadline) items.push({ label: "마감", value: match.deadline });

  // 일정 관련 구조화 필드가 하나도 없으면 빈 문자열을 반환한다 — 호출부(applyDiagrams)가
  // 이 경우 기존 bodyHtml(실제 카드라면 buildCardsFromReal이 이미 만들어둔 정보 패널)을
  // 그대로 남겨두고 덮어쓰지 않는다.
  const bodyHtml = items.length
    ? `<div class="timeline">${items
        .map(
          (it) => `
            <div class="timeline-item">
              <span class="timeline-dot"></span>
              <p class="timeline-label">${it.label}</p>
              <p class="timeline-value">${it.value}</p>
            </div>
          `
        )
        .join("")}</div>`
    : "";

  return { bodyHtml, ctaLink: match.source_url, ctaLabel: "자세한 내용 보러가기" };
}

// hook 카드 하단 해시태그 줄 (레퍼런스의 #청년금융 #자산형성 처럼).
function buildHashtagRow(match) {
  const tags = (match.feed_tags?.length ? match.feed_tags : match.topics).slice(0, 2);
  return `<div class="hashtag-row">${tags.map((t) => `<span class="hashtag">#${t}</span>`).join("")}</div>`;
}

// buildStoryCards(합성)/buildCardsFromReal(실제 LLM 카드) 양쪽 모두, 카드 타입별로
// 같은 다이어그램을 입힌다 — 카드 문구 출처가 달라도 시각 레이아웃은 하나로 통일된다.
function applyDiagrams(cards, match) {
  for (const card of cards) {
    if (card.type === "hook") {
      card.bodyHtml = (card.bodyHtml || "") + buildHashtagRow(match);
    } else if (card.type === "change") {
      card.bodyHtml = buildChangeDiagram(match, card);
    } else if (card.type === "impact") {
      card.bodyHtml = buildImpactDiagram(match);
    } else if (card.type === "schedule") {
      const sched = buildScheduleDiagram(match);
      // 구조화된 일정 필드가 없으면 sched.bodyHtml이 빈 문자열이다 — 이때는 실제 카드라면
      // buildCardsFromReal이 이미 만들어둔 정보 패널(card.bodyHtml)을 그대로 둔다.
      if (sched.bodyHtml) card.bodyHtml = sched.bodyHtml;
      card.ctaLink = sched.ctaLink;
      card.ctaLabel = sched.ctaLabel;
    }
  }
  return cards;
}

// 지금은 app/detail_collector.py가 만든 카드 문구(Gemini 생성)가 없어서,
// docs/card-content-design.md 4절의 card_type 구성을 그대로 따르되
// 문구는 이미 있는 실제 필드(one_line_summary, summary_easy, target 등)로 합성한다.
// 나중에 카드 전용 LLM 생성 결과(articles_cards 시트)가 생기면 이 함수만
// "시트에서 읽어오기"로 바뀌면 된다. personal_relevance 같은 내부 분류값은
// 카드 문구에 그대로 노출하지 않는다.
//
// 카드마다 { type, badgeIcon, badgeLabel, headline, lead, bodyHtml, ctaLink, caption }
// 형태로 반환한다 — 레이아웃(openCards)과 콘텐츠(이 함수)를 분리해서, 카드 종류가
// 늘어나거나 문구 소스가 바뀌어도 렌더링 쪽은 그대로 쓸 수 있게 한다.
function buildStoryCards(match, profile) {
  const cards = [];
  const isDirect = match.personal_relevance === "direct";
  const overlap = profile ? match.topics.filter((t) => profile.interests?.includes(t)) : [];
  const regionHit = Boolean(match.region_scope && profile?.region && match.region_scope.includes(profile.region));
  const occupationHit = Boolean(
    match.audience_groups && profile?.occupation_type && match.audience_groups.includes(profile.occupation_type)
  );

  // 1. 개인화 Hook — direct이고 관심사가 실제로 겹칠 때만 보여준다. 약하게 겹치면 생략하고
  // 바로 정책 소개부터 시작한다.
  if (isDirect && overlap.length > 0) {
    const reasons = [`관심 분야로 등록하신 ${overlap.join(", ")}${josaWaGwa(overlap[overlap.length - 1])} 관련 있어요`];
    if (regionHit) reasons.push(`${profile.region} 지역에 해당하는 정책이에요`);
    if (occupationHit) reasons.push(`'${profile.occupation_type}'인 분들을 위한 정책이에요`);
    if (match.deadline) reasons.push("아직 신청 가능한 기간이 남아있어요");

    cards.push({
      type: "hook",
      badgeIcon: "target",
      badgeLabel: "당신에게 관련된 정책이에요",
      headline: `왜 이 정책이<br><span class="hl">나에게</span> 떴을까요?`,
      lead: `관심 분야로 등록하신 '${overlap.join(", ")}'${josaWaGwa(overlap[overlap.length - 1])} 관련된 정책이에요.`,
      bodyHtml: `
        <div class="chip-row">
          ${overlap.map((t) => `<span class="chip">${iconMarkup(TOPIC_ICON[t] || "document", 13)}${t}</span>`).join("")}
        </div>
        <div class="info-box">
          <p class="checklist-title">${iconMarkup("lightbulb", 16)}이런 점이 관련 있어요</p>
          <ul class="checklist">
            ${reasons.map((r) => `<li>${iconMarkup("check", 15)}${r}</li>`).join("")}
          </ul>
        </div>
      `,
    });
  }

  // 2. 정책 소개
  const introBody = buildIntroBody(match);
  cards.push({
    type: "intro",
    badgeIcon: "document",
    badgeLabel: "정책 소개",
    headline: match.one_line_summary,
    lead: introBody.lead,
    bodyHtml: introBody.bodyHtml,
  });

  // 3. 주요 변화 — 개인화 여부와 무관하게, 정책 자체가 무엇을 바꾸는지.
  // lead를 따로 넣지 않는다 — 아래 buildChangeDiagram이 match.one_line_summary를
  // 비교박스 "변경" 칸에 그대로 보여주므로, 여기 또 넣으면 같은 문장이 두 번 보인다.
  cards.push({
    type: "change",
    badgeIcon: "refreshCw",
    badgeLabel: "주요 변화",
    headline: CHANGE_LABEL_BY_DOC_TYPE[match.doc_type] || "이런 점이 달라져요",
  });

  // 4. 개인적 영향 — target/benefit 원문 근거가 있을 때만. 없으면 지어내지 않고 생략한다.
  if (match.target || match.benefit) {
    const rows = [];
    if (match.target) rows.push(infoRow("user", "지원 대상", match.target));
    if (match.benefit) rows.push(infoRow("gift", "주요 혜택", match.benefit));
    cards.push({
      type: "impact",
      badgeIcon: "trendingUp",
      badgeLabel: "누가, 어떤 혜택을 받나요?",
      headline: `이런 분들이<br>혜택을 받을 수 있어요`,
      bodyHtml: `<div class="info-box">${rows.join("")}</div>`,
    });
  }

  // 5. 일정/신청정보 — 신청 방법은 원문에서 확인된 경우에만 보여준다 (schema.md 4절 규칙).
  const keyDates = match.key_dates ?? [];
  const scheduleLines = [...keyDates, match.deadline ? `마감 ${match.deadline}` : null].filter(Boolean);
  if (scheduleLines.length > 0 || match.how_to_apply) {
    const rows = [];
    if (scheduleLines.length > 0) rows.push(infoRow("calendar", "주요 일정", scheduleLines.join(" · ")));
    if (match.how_to_apply) rows.push(infoRow("document", "신청 방법", match.how_to_apply));
    cards.push({
      type: "schedule",
      badgeIcon: "calendar",
      badgeLabel: "신청 방법과 주요 일정",
      headline: `지금 확인하고<br>신청해보세요`,
      bodyHtml: `<div class="info-box">${rows.join("")}</div>`,
    });
  }

  return attachSourceCta(applyDiagrams(cards, match), match);
}

// 예전에는 "원문 보기"만을 위한 카드(source)를 마지막에 따로 한 장 더 붙였는데,
// schedule 카드의 "자세한 내용 보러가기" 버튼과 하는 일이 완전히 겹쳐서 카드 수만
// 늘리는 중복 페이지였다 (2026-09-27, 사용자 피드백으로 제거). 이제 마지막 카드에
// 원문 링크가 없을 때만(= schedule 카드가 아예 없었던 기사) 이 버튼을 붙여서, 어떤
// 경우에도 원문을 보러 갈 방법 자체는 사라지지 않게 한다.
function attachSourceCta(cards, match) {
  const last = cards[cards.length - 1];
  if (last && !last.ctaLink) {
    last.ctaLink = match.source_url;
    last.ctaLabel = last.ctaLabel || "원문 보러가기";
  }
  if (last && !last.caption) {
    last.caption = `출처: 금융위원회 보도자료${match.published_at ? " · " + match.published_at : ""}`;
  }
  return cards;
}

// app/card_generator.py가 만든 실제 카드(article_id당 1번 캐싱)를 화면 카드 형태로
// 바꾼다. 실제 타입(hook/policy/change/impact/timing)을 지금 쓰는
// CSS 카드 타입(hook/intro/change/impact/schedule)에 매핑한다.
//
// summary/key_change/personal_reason/key_info는 지금 스펙 이전 버전의
// card_generator.py가 Google Sheets(articles_cards)에 이미 저장해둔 값이다 (2026-09-27
// 발견 — 이 별칭이 없으면 전부 REAL_CARD_MAP.policy로 폴백해서 change/impact/schedule
// 카드가 전부 "정책 소개"처럼 밋밋하게만 보였다). 시트를 다시 생성하지 않고 이 매핑만
// 넓혀서 기존 데이터도 올바른 다이어그램으로 보이게 한다.
const REAL_CARD_MAP = {
  hook: { cssType: "hook", icon: "target", badge: "당신에게 관련된 정책이에요" },
  policy: { cssType: "intro", icon: "document", badge: "정책 소개" },
  summary: { cssType: "intro", icon: "document", badge: "정책 소개" },
  change: { cssType: "change", icon: "refreshCw", badge: "주요 변화" },
  key_change: { cssType: "change", icon: "refreshCw", badge: "주요 변화" },
  impact: { cssType: "impact", icon: "trendingUp", badge: "개인적 영향" },
  personal_reason: { cssType: "impact", icon: "trendingUp", badge: "개인적 영향" },
  timing: { cssType: "schedule", icon: "calendar", badge: "신청 방법과 주요 일정" },
  key_info: { cssType: "schedule", icon: "calendar", badge: "신청 방법과 주요 일정" },
};

// highlight(강조 구절)가 headline 안에 있으면 색을 입히고, 없으면 그냥 둔다.
function wrapHighlight(text, highlight) {
  if (!highlight || !text.includes(highlight)) return text;
  return text.replace(highlight, `<span class="hl">${highlight}</span>`);
}

// "달라지는 점 ① 1차 가입자 제한"처럼 headline 안에 동그라미 번호(①②③...)가 있으면
// 그 앞부분("달라지는 점")은 버리고, 번호를 큰 배지로 뽑아내 편집 디자인 느낌을 낸다.
// 없으면 null — 그냥 평범한 headline으로 보여준다.
const CIRCLED_DIGITS = "①②③④⑤⑥⑦⑧⑨⑩";
function splitCircledNumber(headline) {
  for (const ch of CIRCLED_DIGITS) {
    const idx = headline.indexOf(ch);
    if (idx === -1) continue;
    return { number: ch, rest: headline.slice(idx + 1).trim() };
  }
  return null;
}

function buildCardsFromReal(match) {
  const cards = match.story_cards.map((item) => {
    const cardMap = REAL_CARD_MAP[item.type] || REAL_CARD_MAP.policy;
    // highlight는 headline 또는 copy 어느 쪽에 들어있을지 몰라서 둘 다 시도한다.
    let headline = wrapHighlight(item.headline, item.highlight);
    const lead = headline === item.headline ? wrapHighlight(item.copy, item.highlight) : item.copy;
    // 이 카드 번호에 연결된 용어풀이만 골라낸다 (app/card_generator.py의 term_explanations).
    const terms = (match.term_explanations ?? []).filter((t) => t.card_number === item.card_number);

    let bodyHtml = "";
    let numberBadge = "";
    if (cardMap.cssType === "change") {
      // "주요 변화" 카드는 편집 매거진처럼 번호를 큰 배지로 분리한다.
      const split = splitCircledNumber(item.headline);
      if (split) {
        numberBadge = `<span class="change-number">${split.number}</span>`;
        headline = wrapHighlight(split.rest, item.highlight);
      }
    } else if (cardMap.cssType === "impact" && item.highlight && /[0-9%]/.test(item.highlight)) {
      // "개인적 영향" 카드는 숫자·비율 강조 문구가 있으면 큰 스탯으로 별도 표시한다.
      bodyHtml = `<p class="stat-display">${item.highlight}</p>`;
    } else if (cardMap.cssType === "schedule") {
      // "일정/신청방법" 카드는 본문을 테두리 있는 정보 패널로 감싸 구분한다.
      bodyHtml = `<div class="info-panel">${lead}</div>`;
    }

    // change 타입은 뒤에서 applyDiagrams가 이 카드의 문구를 읽어 비교박스 또는 나열형
    // 리스트를 만든다 — changeText/changeHighlight/beforeText/afterText로 따로 들고
    // 있다가 그때 쓴다. **lead(이미 wrapHighlight로 <span> 태그가 섞인 HTML 문자열)를
    // 넘기면 안 된다** — buildChangeDiagram이 나열형일 때 텍스트를 쉼표 등으로 다시
    // 쪼개는데, HTML 태그 안의 "/"(`</span>`)에서 잘려 태그가 깨진다(2026-09-28에
    // 실제로 발견한 버그). 그래서 원문 그대로인 item.copy/item.highlight를 넘기고,
    // 하이라이트는 쪼갠 뒤에 조각별로 입힌다. before/after는 원문에 실제 대조 표현이
    // 있을 때만 app/card_generator.py가 채우고, 없으면 둘 다 null이다.
    const changeText = cardMap.cssType === "change" ? item.copy : undefined;
    const changeHighlight = cardMap.cssType === "change" ? item.highlight : undefined;
    const beforeText = cardMap.cssType === "change" ? item.before : undefined;
    const afterText = cardMap.cssType === "change" ? item.after : undefined;

    return {
      type: cardMap.cssType,
      badgeIcon: cardMap.icon,
      badgeLabel: cardMap.badge,
      numberBadge,
      headline,
      // schedule/change는 이미 다른 곳(info-panel/비교박스)에 본문을 넣으니 lead를
      // 중복 출력하지 않는다 (2026-09-27, change 카드에서 리드 문구와 "변경" 박스에
      // 똑같은 문장이 두 번 보이던 문제를 사용자가 지적해서 고쳤다).
      lead: ["schedule", "change"].includes(cardMap.cssType) ? "" : lead,
      changeText,
      changeHighlight,
      beforeText,
      afterText,
      bodyHtml,
      terms,
    };
  });
  return attachSourceCta(applyDiagrams(cards, match), match);
}

const cardsOverlay = document.getElementById("cardsOverlay");
const cardsTrack = document.getElementById("cardsTrack");
const cardsDots = document.getElementById("cardsDotsBottom");
const cardsCounter = document.getElementById("cardsCounter");
const cardsClose = document.getElementById("cardsClose");
let cardsTotal = 1;
let lastFocusedEl = null; // 오버레이를 닫을 때 포커스를 원래 누르던 카드로 되돌리려고 기억해둔다.

function openCards(match) {
  // app/card_generator.py가 이미 만들어둔 실제 카드가 있으면 그걸 쓰고,
  // 아직 없으면(할당량/미실행) 기존 필드 조합으로 즉석 합성한다.
  const cards = match.story_cards.length ? buildCardsFromReal(match) : buildStoryCards(match, currentProfile);
  cardsTotal = cards.length;

  cardsTrack.innerHTML = cards
    .map(
      (card, i) => `
        <div class="story-card ${card.type}">
          <span class="story-badge">${iconMarkup(card.badgeIcon, 14)}${card.badgeLabel}</span>
          ${card.numberBadge || ""}
          <p class="story-headline">${card.headline}</p>
          ${card.lead ? `<p class="story-lead">${card.lead}</p>` : ""}
          ${card.bodyHtml || ""}
          ${card.ctaLink ? `<a class="cta-button" href="${card.ctaLink}" target="_blank" rel="noopener">${iconMarkup("externalLink", 18)}${card.ctaLabel || "원문 보러가기"}</a>` : ""}
          ${card.caption ? `<p class="source-caption">${card.caption}</p>` : ""}
          ${
            card.terms && card.terms.length
              ? `
                <div class="term-box">
                  ${card.terms
                    .map(
                      (t) => `
                        <div class="term-entry">
                          <p class="term-word">${iconMarkup("search", 13)}${t.term}</p>
                          <p class="term-desc">${t.explanation}</p>
                        </div>
                      `
                    )
                    .join("")}
                </div>
              `
              : ""
          }
        </div>
      `
    )
    .join("");

  cardsDots.innerHTML = cards
    .map((_, i) => `<span class="dot${i === 0 ? " active" : ""}"></span>`)
    .join("");
  cardsCounter.textContent = `1/${cardsTotal}`;

  lastFocusedEl = document.activeElement;
  cardsOverlay.classList.add("open");
  cardsTrack.scrollLeft = 0;
  // 모달을 열었으면 포커스도 모달 안으로 들어가야 한다 — 안 그러면 키보드/스크린리더
  // 사용자는 뒤에 깔린 피드에 포커스가 남아있는 채로 "떠 있는" 화면을 마주하게 된다.
  cardsClose.focus();
}

function closeCards() {
  cardsOverlay.classList.remove("open");
  // 열 때 기억해둔 트리거(카드 버튼)로 포커스를 되돌려서, 방금 있던 자리로 자연스럽게 이어진다.
  lastFocusedEl?.focus();
}

cardsClose.addEventListener("click", closeCards);
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && cardsOverlay.classList.contains("open")) {
    closeCards();
  }
});

// 스와이프/탭으로 카드가 넘어갈 때마다, 지금 몇 번째 카드인지 점과 카운터를 갱신한다.
cardsTrack.addEventListener("scroll", () => {
  const index = Math.round(cardsTrack.scrollLeft / cardsTrack.clientWidth);
  const dots = cardsDots.querySelectorAll(".dot");
  dots.forEach((dot, i) => dot.classList.toggle("active", i === index));
  cardsCounter.textContent = `${index + 1}/${cardsTotal}`;
});

// 탭으로도 카드를 넘긴다 — 화면 왼쪽 1/4을 누르면 이전, 나머지 오른쪽을 누르면 다음.
// 마지막 카드의 "원문 보러가기" 버튼은 그대로 클릭되게 링크 클릭은 걸러낸다.
// (스와이프 드래그는 터치 스크롤로 처리되고, 드래그 끝에는 click이 발생하지 않아서
// 이 리스너와 서로 부딪히지 않는다.)
cardsTrack.addEventListener("click", (e) => {
  if (e.target.closest("a")) return;
  const rect = cardsTrack.getBoundingClientRect();
  const ratio = (e.clientX - rect.left) / rect.width;
  const direction = ratio < 0.25 ? -1 : 1;
  cardsTrack.scrollBy({ left: direction * cardsTrack.clientWidth, behavior: "smooth" });
});

async function loadMatches() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (!saved) {
    statusEl.textContent = "저장된 프로필이 없어요. 먼저 프로필을 입력해주세요.";
    statusEl.innerHTML += ' <a href="index.html">프로필 입력하러 가기</a>';
    return;
  }

  const profile = JSON.parse(saved);
  currentProfile = profile;

  try {
    const response = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(profile),
    });

    if (!response.ok) {
      throw new Error(`서버 응답 오류: ${response.status}`);
    }

    allMatches = await response.json();

    if (allMatches.length === 0) {
      statusEl.textContent = "지금 조건에 맞는 정책이 없어요.";
      return;
    }

    statusEl.hidden = true;
    renderTabs();
    renderFeed();
  } catch (err) {
    console.error("[polistagram] 매칭 결과를 불러오지 못했습니다.", err);
    statusEl.textContent =
      "매칭 결과를 불러오지 못했어요. 백엔드 서버(uvicorn)가 실행 중인지 확인해주세요.";
  }
}

loadMatches();
