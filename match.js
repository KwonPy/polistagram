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

function renderFeed() {
  const filtered =
    activeTopic === "전체"
      ? allMatches
      : allMatches.filter((m) => m.topics.includes(activeTopic));

  feedEl.innerHTML = "";
  for (const match of filtered) {
    const { theme, personalizedSignal, title, personalizedLine, tags, iconSlug } = buildFeedCard(
      match,
      currentProfile
    );

    const card = document.createElement("button");
    card.type = "button";
    card.className = "card";
    card.style.background = theme.bg;
    card.addEventListener("click", () => openCards(match));

    card.innerHTML = `
      <div class="card-top">
        <div class="brand">
          <span class="brand-mark"></span>
          <span class="brand-name">polistagram</span>
        </div>
        <span class="card-more" aria-hidden="true">${iconMarkup("more", 18)}</span>
      </div>
      ${
        personalizedSignal
          ? `<span class="card-pill" style="background:${theme.pillBg};color:${theme.pillText}">${iconMarkup("sparkle", 13)}${personalizedSignal}</span>`
          : ""
      }
      <p class="card-title">${title}</p>
      <div class="card-body-row">
        <p class="card-line">${personalizedLine}</p>
        <span class="card-arrow" style="color:${theme.hl}">${iconMarkup("arrowRight", 18)}</span>
      </div>
      <img class="card-icon" src="/assets/icons/${iconSlug}.png" alt="" />
      <div class="card-tags">
        ${tags.map((t) => `<span class="card-tag">#${t}</span>`).join("")}
      </div>
    `;
    feedEl.appendChild(card);
  }
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

// My Feed 카드 배경 이미지 — scripts/generate_topic_icons.py로 만들려던 자리인데
// Gemini 이미지 생성 모델은 무료 티어 할당량이 0이라(2026-09-26 확인), 대신
// Microsoft Fluent Emoji 3D(MIT 라이선스, 무료)를 내려받아 assets/icons/에 넣었다.
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

// 레퍼런스(ref.png)의 4가지 파스텔 톤 카드를 재현한 색 팔레트. 정책 주제에 따라
// 하나를 고른다 — card_type(Story View)과 마찬가지로 "고정 팔레트 + 가변 선택".
const FEED_THEMES = {
  blue: { bg: "linear-gradient(160deg, #eaf2fb 0%, #dbe9f8 100%)", pillBg: "#dbeafe", pillText: "#1e3a8a", hl: "#1e3a8a" },
  green: { bg: "linear-gradient(160deg, #eafaf0 0%, #ddf3e4 100%)", pillBg: "#d1fae5", pillText: "#047857", hl: "#059669" },
  purple: { bg: "linear-gradient(160deg, #f3f0fb 0%, #ece6f8 100%)", pillBg: "#ede9fe", pillText: "#6d28d9", hl: "#7c3aed" },
  orange: { bg: "linear-gradient(160deg, #fff7ec 0%, #ffedd5 100%)", pillBg: "#ffedd5", pillText: "#c2410c", hl: "#ea580c" },
};
const TOPIC_THEME = {
  "저축·자산형성": "blue",
  "취업·채용": "blue",
  "주거·전세": "green",
  "대출": "green",
  "보험": "purple",
  "기타": "purple",
  "투자·주식": "orange",
  "창업·사업자금": "orange",
};

function pickFeedTheme(match) {
  return FEED_THEMES[TOPIC_THEME[match.topics[0]] || "blue"];
}

// 제목 안에서 주제 키워드를 찾아 테마 색으로 강조한다 (레퍼런스처럼 "대출 제도"만
// 파랗게 되는 효과). 못 찾으면 그냥 평문으로 보여준다 — 억지로 아무 단어나 감싸지 않는다.
function highlightKeyword(text, keyword, color) {
  if (!keyword || !text.includes(keyword)) return text;
  return text.replace(keyword, `<span style="color:${color}">${keyword}</span>`);
}

// 지금은 app/feed_card_generator.py가 만든 티저 문구(Gemini 생성)가 아직 없을 수 있어서
// (할당량 문제로 아직 한 번도 안 돌렸다), 있으면 그걸 쓰고 없으면 기존 2/3계층 필드로
// 대체 표시한다. personal_relevance 값 자체는 노출하지 않는다.
function buildFeedCard(match, profile) {
  const theme = pickFeedTheme(match);
  const overlap = profile ? match.topics.filter((t) => profile.interests?.includes(t)) : [];
  const isDirect = match.personal_relevance === "direct";

  const personalizedSignal =
    match.feed_personalized_signal || (isDirect && overlap.length > 0 ? "나에게 관련 있어요" : null);

  const rawTitle = match.feed_title || match.one_line_summary;
  const keyword = match.topics[0];
  const title = highlightKeyword(rawTitle, keyword, theme.hl);

  // summary_easy는 3~5문장짜리 긴 설명이라 폴백으로 쓰면 목록 카드가 줄글처럼 보인다.
  // one_line_summary(2계층에서 이미 한 문장으로 요약된 필드)로 폴백해야 짧게 유지된다.
  const personalizedLine = match.feed_personalized_line || match.one_line_summary || "";

  const tags = (match.feed_tags.length ? match.feed_tags : match.topics.slice(0, 2)).slice(0, 2);
  const iconSlug = TOPIC_ICON_SLUG[keyword] || "etc";

  return { theme, personalizedSignal, title, personalizedLine, tags, iconSlug };
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

// change 카드: "기존 -> 변경" Before/After 비교 박스. before는 doc_type별 일반적인
// 전환 문구(구체적 수치·조건을 지어내지 않는 범용 표현)이고, after는 실제 원문 요약이다.
const BEFORE_LABEL_BY_DOC_TYPE = {
  support_program: "이전에는 없던 지원이에요",
  rule_change: "지금까지 적용되던 제도예요",
  plan: "아직 계획 단계였어요",
  info: "이런 소식이 알려지기 전이에요",
  admin: "기존 행정 절차가 적용되고 있었어요",
};
function buildChangeDiagram(match, card) {
  const before = BEFORE_LABEL_BY_DOC_TYPE[match.doc_type] || "기존에는 달랐어요";
  // 카드 자신의 문구(card.changeText = LLM이 쓴 copy)가 있으면 그걸 쓴다 — 한 기사에
  // change 타입 카드가 여러 장(예: key_change가 2장)이어도 서로 다른 "변경" 내용이
  // 보이게 하기 위함. 카드 없이 합성한 경로(buildStoryCards)는 match.one_line_summary로
  // 대체한다. card.lead가 아니라 card.changeText를 읽는 이유: lead는 이 카드가 화면에
  // 이미 한 번 보여준 값이라 (또는 중복을 막으려고 비워둔 값이라), 여기서 그대로
  // 다시 쓰면 같은 문장이 두 번 보이거나 꼬인다.
  const after = card?.changeText || match.one_line_summary || "";
  const bars = (heights) => heights.map((h) => `<span style="height:${h}px"></span>`).join("");

  return `
    <div class="compare-stack">
      <div class="compare-box before">
        <span class="compare-tag before">기존</span>
        <p>${before}</p>
        <div class="compare-bars">${bars([8, 12, 10])}</div>
      </div>
      <span class="compare-arrow">${iconMarkup("arrowDown", 20)}</span>
      <div class="compare-box after">
        <span class="compare-tag after">변경</span>
        <p>${after}</p>
        <div class="compare-bars">${bars([14, 20, 26])}</div>
      </div>
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

    // change 타입은 뒤에서 applyDiagrams가 비교박스(Before/After) 안에 이 카드의 문구를
    // 넣는다 — changeText로 따로 들고 있다가 그때 쓴다. 화면에 쓰이는 lead 자체를
    // 그대로 넘기면, 비교박스가 나중에 값을 읽을 카드 객체가 이미 변형된 뒤라 꼬인다.
    const changeText = cardMap.cssType === "change" ? lead : undefined;

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
