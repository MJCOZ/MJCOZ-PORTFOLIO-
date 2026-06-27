/* =========================================================
   MJ COZ / Mutaz — frontend
   Loads content from /api/content (or data/content.json as a
   static fallback) and renders every section. Bilingual AR/EN.
   ========================================================= */
(function () {
  "use strict";

  const html = document.documentElement;
  const $ = (s) => document.querySelector(s);

  const FALLBACK = { hero:{title:[]}, stats:[], about:{meta:[],bio:[],tags:[]},
    services:[], projects:[], resume:{experience:[],education:[],skills:[]},
    testimonials:[], contact:{} };

  let content = FALLBACK;
  let lang = "ar";
  let currentFilter = "all";
  let io;

  /* ---------- helpers ---------- */
  const esc = (s) => String(s == null ? "" : s)
    .replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")
    .replace(/"/g,"&quot;").replace(/'/g,"&#39;");
  const t = (obj) => obj ? (obj[lang] != null ? obj[lang] : (obj.ar || obj.en || "")) : "";
  function lightText(hex) {
    const c = String(hex || "#cccccc").replace("#","");
    if (c.length < 6) return false;
    const r=parseInt(c.substr(0,2),16), g=parseInt(c.substr(2,2),16), b=parseInt(c.substr(4,2),16);
    return (0.299*r + 0.587*g + 0.114*b) < 140;
  }

  /* ---------- load content ---------- */
  async function loadContent() {
    for (const url of ["/api/content", "data/content.json"]) {
      try {
        const r = await fetch(url, { cache: "no-store" });
        if (r.ok) return await r.json();
      } catch (e) { /* try next */ }
    }
    return FALLBACK;
  }

  /* ---------- renderers ---------- */
  function renderHero() {
    const h = content.hero || {};
    $("#heroEyebrow").textContent = t(h.eyebrow);
    $("#heroTitle").innerHTML = (h.title || []).map(l =>
      `<span class="line${l.accent ? " line--accent" : ""}">${esc(t(l.text))}</span>`).join("");
    $("#heroLead").textContent = t(h.lead);
  }

  function renderStats() {
    $("#statsGrid").innerHTML = (content.stats || []).map(s => `
      <div class="stat">
        <span class="stat__num" data-count="${esc(s.num)}">0</span><span class="stat__plus">${esc(s.plus || "")}</span>
        <p class="stat__label">${esc(t(s.label))}</p>
      </div>`).join("");
    animateCounters();
  }

  function renderAbout() {
    const a = content.about || {};
    const av = $("#aboutAvatar");
    if (a.logo) {
      av.classList.add("about__avatar--logo");
      av.innerHTML = `<img src="${esc(a.logo)}" alt="${esc(t(a.name))}">`;
    } else {
      av.classList.remove("about__avatar--logo");
      av.textContent = t(a.avatar);
    }
    $("#aboutName").textContent = t(a.name);
    $("#aboutRole").textContent = t(a.role);
    $("#aboutMeta").innerHTML = (a.meta || []).map(m =>
      `<li><span>${esc(t(m.label))}</span> <strong class="${m.status ? "status-open" : ""}">${esc(t(m.value))}</strong></li>`).join("");
    $("#aboutBio").innerHTML = (a.bio || []).map(p => `<p>${esc(t(p))}</p>`).join("");
    $("#aboutTags").innerHTML = (a.tags || []).map(x => `<span>${esc(x)}</span>`).join("");
  }

  function renderServices() {
    $("#servicesGrid").innerHTML = (content.services || []).map(s => `
      <article class="service-card reveal">
        <span class="service-card__num">${esc(s.num || "")}</span>
        <h3>${esc(t(s.title))}</h3>
        <p>${esc(t(s.desc))}</p>
      </article>`).join("");
  }

  const CAT_LABEL = {
    post:     { ar: "بوست", en: "Post" },
    story:    { ar: "ستوري", en: "Story" },
    branding: { ar: "منيو", en: "Menu" }
  };
  function cardHTML(p) {
    const media = p.img
      ? `<img src="${esc(p.img)}" alt="${esc(t(p.title))}" loading="lazy" style="width:100%;height:100%;object-fit:cover">`
      : `<span style="color:${lightText(p.color) ? "#fff" : "#0d0d0d"}">${esc(p.label || "")}</span>`;
    const tag = t(CAT_LABEL[p.category]) || esc(p.category || "");
    return `
      <article class="work-card reveal" data-category="${esc(p.category || "")}">
        <div class="work-card__media" style="background:${esc(p.color || "#ccc")}">
          <span class="work-card__tag">${esc(tag)}</span>
          ${media}
        </div>
        <div class="work-card__body">
          <h3>${esc(t(p.title))}</h3>
          <p>${esc(t(p.desc))}</p>
        </div>
      </article>`;
  }

  // landing: show up to PREVIEW_LIMIT per group; work page: paginate by PAGE_STEP
  const PREVIEW_LIMIT = 4;
  const PAGE_STEP = 9;

  function renderProjects() {
    if ($("#postsGrid")) renderLanding();
    else if ($("#allGrid")) renderWorkPage();
  }

  function fillGroup(gridSel, groupSel, items) {
    const grid = $(gridSel), group = $(groupSel);
    if (!grid) return;
    if (group) group.style.display = items.length ? "" : "none";
    grid.innerHTML = items.slice(0, PREVIEW_LIMIT).map(cardHTML).join("");
    const more = group && group.querySelector(".work-group__more");
    if (more) more.style.display = items.length > PREVIEW_LIMIT ? "" : "none";
  }
  function renderLanding() {
    const byCat = (c) => (content.projects || []).filter(p => p.category === c);
    fillGroup("#postsGrid", "#postsGroup", byCat("post"));
    fillGroup("#storiesGrid", "#storiesGroup", byCat("story"));
    fillGroup("#brandingGrid", "#brandingGroup", byCat("branding"));
  }

  let workFilter = "all";
  let workVisible = PAGE_STEP;
  function renderWorkPage() {
    const grid = $("#allGrid");
    const items = (content.projects || []).filter(p => workFilter === "all" || p.category === workFilter);
    grid.innerHTML = items.slice(0, workVisible).map(cardHTML).join("");
    const btn = $("#showMore"), cnt = $("#showMoreCount");
    if (btn) btn.style.display = items.length > workVisible ? "" : "none";
    if (cnt) cnt.textContent = `${Math.min(workVisible, items.length)} / ${items.length}`;
    observeReveals();
  }

  function timelineItem(it) {
    return `
      <div class="timeline__item reveal">
        <span class="timeline__date">${esc(t(it.date))}</span>
        <h4>${esc(t(it.title))}</h4>
        <p>${esc(t(it.desc))}</p>
      </div>`;
  }
  function renderResume() {
    const r = content.resume || {};
    $("#expList").innerHTML = (r.experience || []).map(timelineItem).join("");
    $("#eduList").innerHTML = (r.education || []).map(timelineItem).join("");
    $("#skillsList").innerHTML = (r.skills || []).map(s => `
      <div class="skill">
        <div class="skill__top"><span>${esc(t(s.name))}</span><span>${esc(s.pct)}%</span></div>
        <div class="skill__bar"><i style="width:${Number(s.pct) || 0}%"></i></div>
      </div>`).join("");
    const cv = $("#cvLink");
    if (r.cvUrl) cv.setAttribute("href", r.cvUrl);
    animateSkills();
  }

  function renderTestimonials() {
    $("#testiGrid").innerHTML = (content.testimonials || []).map(x => `
      <blockquote class="testi reveal">
        <p>${esc(t(x.text))}</p>
        <footer><strong>${esc(t(x.name))}</strong> — <span>${esc(t(x.role))}</span></footer>
      </blockquote>`).join("");
  }

  function renderContact() {
    const c = content.contact || {};
    $("#contactLead").textContent = t(c.lead);
    const rows = [];
    if (c.email) rows.push(`<li><span>EMAIL</span><a href="mailto:${esc(c.email)}">${esc(c.email)}</a></li>`);
    if (c.instagram && c.instagram.url) rows.push(`<li><span>INSTAGRAM</span><a href="${esc(c.instagram.url)}" target="_blank" rel="noopener">${esc(c.instagram.handle || c.instagram.url)}</a></li>`);
    if (c.whatsapp && c.whatsapp.url) rows.push(`<li><span>WHATSAPP</span><a href="${esc(c.whatsapp.url)}" target="_blank" rel="noopener" dir="ltr">${esc(c.whatsapp.display || c.whatsapp.url)}</a></li>`);
    $("#contactList").innerHTML = rows.join("");
  }

  function renderAll() {
    if ($("#heroEyebrow")) { // landing-only sections
      renderHero(); renderStats(); renderAbout(); renderServices();
      renderResume(); renderTestimonials(); renderContact();
    }
    renderProjects();
    markReveals(); observeReveals();
  }

  /* ---------- language ---------- */
  function translateStatic() {
    const isAr = lang === "ar";
    document.querySelectorAll("[data-ar]").forEach(el => {
      const v = el.getAttribute(isAr ? "data-ar" : "data-en");
      if (v !== null) el.textContent = v;
    });
  }
  function setLang(next) {
    lang = next;
    html.lang = lang;
    html.dir = lang === "ar" ? "rtl" : "ltr";
    translateStatic();
    const tg = $("#langToggle"); if (tg) tg.textContent = lang === "ar" ? "EN" : "AR";
    try { localStorage.setItem("mjcoz-lang", lang); } catch (e) {}
    renderAll();
    setupMarquee();
  }

  /* ---------- marquee (fill any width seamlessly) ---------- */
  function setupMarquee() {
    const track = document.querySelector(".marquee__track");
    if (!track) return;
    track.querySelectorAll(".marquee__item--clone").forEach(n => n.remove());
    const base = track.querySelector(".marquee__item");
    if (!base) return;
    const baseW = base.getBoundingClientRect().width;
    if (!baseW) return;
    // each "half" of the track must be at least one viewport wide so the
    // -50% loop never reveals a gap; we then duplicate the half for seamlessness
    const perHalf = Math.max(1, Math.ceil(window.innerWidth / baseW) + 1);
    const frag = document.createDocumentFragment();
    for (let i = 1; i < perHalf * 2; i++) {
      const c = base.cloneNode(true);
      c.classList.add("marquee__item--clone");
      c.setAttribute("aria-hidden", "true");
      frag.appendChild(c);
    }
    track.appendChild(frag);
  }

  /* ---------- work-page filters + show more ---------- */
  function setWorkFilter(cat) {
    workFilter = cat;
    workVisible = PAGE_STEP;
    const bar = $("#filters");
    if (bar) bar.querySelectorAll(".filter").forEach(b => b.classList.toggle("is-active", b.dataset.filter === cat));
    renderWorkPage();
  }

  /* ---------- reveal ---------- */
  function markReveals() {
    document.querySelectorAll(".section__head, .about__card, .about__text, .contact__form, .contact__info")
      .forEach(el => el.classList.add("reveal"));
  }
  function observeReveals() {
    if (!("IntersectionObserver" in window)) {
      document.querySelectorAll(".reveal").forEach(el => el.classList.add("is-visible"));
      return;
    }
    if (!io) io = new IntersectionObserver((entries) => {
      entries.forEach(en => { if (en.isIntersecting) { en.target.classList.add("is-visible"); io.unobserve(en.target); } });
    }, { threshold: 0.12 });
    document.querySelectorAll(".reveal:not(.is-visible)").forEach(el => io.observe(el));
  }

  /* ---------- counters / skill bars ---------- */
  function animateCounters() {
    const counters = document.querySelectorAll(".stat__num[data-count]");
    if (!("IntersectionObserver" in window)) { counters.forEach(c => c.textContent = c.dataset.count); return; }
    const obs = new IntersectionObserver((entries) => {
      entries.forEach(en => {
        if (!en.isIntersecting) return;
        const el = en.target, target = +el.dataset.count || 0;
        let n = 0; const step = Math.max(1, Math.round(target / 40));
        (function tick(){ n += step; if (n >= target) el.textContent = target; else { el.textContent = n; requestAnimationFrame(tick); } })();
        obs.unobserve(el);
      });
    }, { threshold: 0.5 });
    counters.forEach(c => obs.observe(c));
  }
  function animateSkills() {
    const bars = document.querySelectorAll(".skill__bar i");
    if (!("IntersectionObserver" in window)) return;
    const obs = new IntersectionObserver((entries) => {
      entries.forEach(en => {
        if (!en.isIntersecting) return;
        const i = en.target, w = i.style.width; i.style.width = "0";
        requestAnimationFrame(() => { i.style.width = w; });
        obs.unobserve(i);
      });
    }, { threshold: 0.4 });
    bars.forEach(b => obs.observe(b));
  }

  /* ---------- static UI wiring ---------- */
  function wireUI() {
    const tg = $("#langToggle");
    if (tg) tg.addEventListener("click", () => setLang(lang === "ar" ? "en" : "ar"));

    const menuBtn = $("#menuBtn"), navLinks = $("#navLinks");
    if (menuBtn && navLinks) {
      menuBtn.addEventListener("click", () => {
        const open = navLinks.classList.toggle("is-open");
        menuBtn.classList.toggle("is-open", open);
        menuBtn.setAttribute("aria-expanded", open);
      });
      navLinks.querySelectorAll("a").forEach(a => a.addEventListener("click", () => {
        navLinks.classList.remove("is-open"); menuBtn.classList.remove("is-open");
        menuBtn.setAttribute("aria-expanded", "false");
      }));
    }

    let rT; window.addEventListener("resize", () => { clearTimeout(rT); rT = setTimeout(setupMarquee, 200); });
    window.addEventListener("load", setupMarquee);

    const filterBar = $("#filters");
    if (filterBar) filterBar.addEventListener("click", e => {
      const btn = e.target.closest(".filter"); if (!btn) return;
      setWorkFilter(btn.dataset.filter);
    });

    const showMore = $("#showMore");
    if (showMore) showMore.addEventListener("click", () => { workVisible += PAGE_STEP; renderWorkPage(); });

    const form = $("#contactForm"), note = $("#formNote");
    if (form) form.addEventListener("submit", async (e) => {
      const action = form.getAttribute("action") || "";
      const isAr = lang === "ar";
      const fd = new FormData(form);
      const email = (content.contact && content.contact.email) || "mezoo.bk@gmail.com";
      if (action.includes("your-id")) {
        e.preventDefault();
        const subject = encodeURIComponent("Portfolio contact — " + (fd.get("name") || ""));
        const body = encodeURIComponent((fd.get("message") || "") + "\n\n" + (fd.get("email") || ""));
        window.location.href = `mailto:${email}?subject=${subject}&body=${body}`;
        return;
      }
      e.preventDefault();
      try {
        const res = await fetch(action, { method: "POST", body: fd, headers: { Accept: "application/json" } });
        if (!res.ok) throw new Error();
        form.reset();
        showNote(isAr ? "تم الإرسال! سأرد عليك قريباً." : "Sent! I'll get back to you soon.", "ok");
      } catch (_) {
        showNote(isAr ? "تعذّر الإرسال، حاول عبر البريد مباشرة." : "Couldn't send — try email directly.", "err");
      }
      function showNote(msg, kind){ if(!note) return; note.textContent=msg; note.className="form-note "+kind; note.hidden=false; }
    });
  }

  /* ---------- init ---------- */
  (async function init() {
    wireUI();
    content = await loadContent();
    try { lang = localStorage.getItem("mjcoz-lang") || "ar"; } catch (e) { lang = "ar"; }
    // work page: preselect filter from URL hash (#post / #story / #branding)
    if ($("#allGrid")) {
      const h = (location.hash || "").replace("#", "");
      if (["post", "story", "branding"].includes(h)) { workFilter = h; }
    }
    setLang(lang);
    if ($("#allGrid")) setWorkFilter(workFilter); // sync active chip + render
  })();
})();
