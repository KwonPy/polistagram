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
    const card = document.createElement("button");
    card.type = "button";
    card.className = "card " + match.personal_relevance;
    card.addEventListener("click", () => openCards(match));

    const topTag = match.topics[0] ?? "정책";
    const deadlineText = match.deadline ? `~${match.deadline} 신청 가능` : "상시";

    card.innerHTML = `
      <div class="card-top">
        <span class="tag">#${topTag}</span>
      </div>
      <p class="card-title">${match.one_line_summary}</p>
      <p class="card-summary">${match.summary_easy ?? ""}</p>
      <div class="card-footer">
        <span>${match.benefit ?? ""}</span>
        <span>${deadlineText}</span>
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

function pickTopicIcon(match) {
  return TOPIC_ICON[match.topics[0]] || "document";
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
  cards.push({
    type: "intro",
    badgeIcon: "document",
    badgeLabel: "정책 소개",
    headline: match.one_line_summary,
    bodyHtml: `
      <div class="icon-hero">${iconMarkup(pickTopicIcon(match), 42)}</div>
      <div class="summary-box">
        <p class="summary-label">${iconMarkup("document", 14)}한 줄 요약</p>
        <p class="summary-text">${match.summary_easy || "아직 쉬운 설명이 준비되지 않았어요."}</p>
      </div>
    `,
  });

  // 3. 주요 변화 — 개인화 여부와 무관하게, 정책 자체가 무엇을 바꾸는지
  cards.push({
    type: "change",
    badgeIcon: "refreshCw",
    badgeLabel: "주요 변화",
    headline: CHANGE_LABEL_BY_DOC_TYPE[match.doc_type] || "이런 점이 달라져요",
    lead: match.one_line_summary,
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

  // 6. 출처 — LLM이 만들지 않는다. 원문 링크는 코드가 그대로 붙인다 (설계 문서 4절).
  cards.push({
    type: "source",
    badgeIcon: "externalLink",
    badgeLabel: "원문 보기",
    headline: `정책 원문에서<br>자세히 확인하세요`,
    ctaLink: match.source_url,
    caption: `출처: 금융위원회 보도자료${match.published_at ? " · " + match.published_at : ""}`,
  });

  return cards;
}

const cardsOverlay = document.getElementById("cardsOverlay");
const cardsTrack = document.getElementById("cardsTrack");
const cardsDots = document.getElementById("cardsDotsBottom");
const cardsCounter = document.getElementById("cardsCounter");
const cardsClose = document.getElementById("cardsClose");
let cardsTotal = 1;

function openCards(match) {
  const cards = buildStoryCards(match, currentProfile);
  cardsTotal = cards.length;

  cardsTrack.innerHTML = cards
    .map(
      (card) => `
        <div class="story-card ${card.type}">
          <span class="story-badge">${iconMarkup(card.badgeIcon, 14)}${card.badgeLabel}</span>
          <p class="story-headline">${card.headline}</p>
          ${card.lead ? `<p class="story-lead">${card.lead}</p>` : ""}
          ${card.bodyHtml || ""}
          ${card.ctaLink ? `<a class="cta-button" href="${card.ctaLink}" target="_blank" rel="noopener">${iconMarkup("externalLink", 18)}원문 보러가기</a>` : ""}
          ${card.caption ? `<p class="source-caption">${card.caption}</p>` : ""}
        </div>
      `
    )
    .join("");

  cardsDots.innerHTML = cards
    .map((_, i) => `<span class="dot${i === 0 ? " active" : ""}"></span>`)
    .join("");
  cardsCounter.textContent = `1/${cardsTotal}`;

  cardsOverlay.classList.add("open");
  cardsTrack.scrollLeft = 0;
}

function closeCards() {
  cardsOverlay.classList.remove("open");
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
