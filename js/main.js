/* =========================================================
   MJ COZ — interactions
   ========================================================= */
(function () {
  "use strict";

  const html = document.documentElement;

  /* ---------- 1. Render projects ---------- */
  const grid = document.getElementById("workGrid");
  function lightText(hex) {
    // returns true if text on this bg should be light
    const c = hex.replace("#", "");
    const r = parseInt(c.substr(0,2),16), g = parseInt(c.substr(2,2),16), b = parseInt(c.substr(4,2),16);
    return (0.299*r + 0.587*g + 0.114*b) < 140;
  }
  function renderProjects(lang) {
    if (!grid) return;
    grid.innerHTML = PROJECTS.map(p => {
      const media = p.img
        ? `<img src="${p.img}" alt="${p.title[lang]}" loading="lazy" style="width:100%;height:100%;object-fit:cover">`
        : `<span style="color:${lightText(p.color) ? "#fff" : "#0d0d0d"}">${p.label}</span>`;
      return `
        <article class="work-card reveal" data-category="${p.category}">
          <div class="work-card__media" style="background:${p.color}">
            <span class="work-card__tag">${p.category}</span>
            ${media}
          </div>
          <div class="work-card__body">
            <h3>${p.title[lang]}</h3>
            <p>${p.desc[lang]}</p>
          </div>
        </article>`;
    }).join("");
    observeReveals();
  }

  /* ---------- 2. Language toggle (AR / EN) ---------- */
  const langToggle = document.getElementById("langToggle");
  function setLang(lang) {
    const isAr = lang === "ar";
    html.lang = lang;
    html.dir = isAr ? "rtl" : "ltr";
    document.querySelectorAll("[data-ar]").forEach(el => {
      const val = el.getAttribute(isAr ? "data-ar" : "data-en");
      if (val !== null) el.textContent = val;
    });
    if (langToggle) langToggle.textContent = isAr ? "EN" : "AR";
    try { localStorage.setItem("mjcoz-lang", lang); } catch (e) {}
    renderProjects(lang);
    applyFilter(currentFilter);
  }
  if (langToggle) {
    langToggle.addEventListener("click", () => {
      setLang(html.lang === "ar" ? "en" : "ar");
    });
  }

  /* ---------- 3. Mobile menu ---------- */
  const menuBtn = document.getElementById("menuBtn");
  const navLinks = document.getElementById("navLinks");
  if (menuBtn && navLinks) {
    menuBtn.addEventListener("click", () => {
      const open = navLinks.classList.toggle("is-open");
      menuBtn.classList.toggle("is-open", open);
      menuBtn.setAttribute("aria-expanded", open);
    });
    navLinks.querySelectorAll("a").forEach(a =>
      a.addEventListener("click", () => {
        navLinks.classList.remove("is-open");
        menuBtn.classList.remove("is-open");
        menuBtn.setAttribute("aria-expanded", "false");
      })
    );
  }

  /* ---------- 4. Portfolio filters ---------- */
  let currentFilter = "all";
  const filterBar = document.getElementById("filters");
  function applyFilter(cat) {
    currentFilter = cat;
    document.querySelectorAll(".work-card").forEach(card => {
      const show = cat === "all" || card.dataset.category === cat;
      card.classList.toggle("is-hidden", !show);
    });
  }
  if (filterBar) {
    filterBar.addEventListener("click", e => {
      const btn = e.target.closest(".filter");
      if (!btn) return;
      filterBar.querySelectorAll(".filter").forEach(b => b.classList.remove("is-active"));
      btn.classList.add("is-active");
      applyFilter(btn.dataset.filter);
    });
  }

  /* ---------- 5. Scroll reveal ---------- */
  let io;
  function observeReveals() {
    if (!("IntersectionObserver" in window)) {
      document.querySelectorAll(".reveal").forEach(el => el.classList.add("is-visible"));
      return;
    }
    if (!io) {
      io = new IntersectionObserver((entries) => {
        entries.forEach(en => {
          if (en.isIntersecting) { en.target.classList.add("is-visible"); io.unobserve(en.target); }
        });
      }, { threshold: 0.12 });
    }
    document.querySelectorAll(".reveal:not(.is-visible)").forEach(el => io.observe(el));
  }
  // mark common blocks for reveal
  document.querySelectorAll(".section__head, .about__card, .about__text, .service-card, .timeline__item, .testi, .contact__form, .contact__info")
    .forEach(el => el.classList.add("reveal"));

  /* ---------- 6. Animated counters ---------- */
  const counters = document.querySelectorAll(".stat__num[data-count]");
  if ("IntersectionObserver" in window && counters.length) {
    const cObs = new IntersectionObserver((entries) => {
      entries.forEach(en => {
        if (!en.isIntersecting) return;
        const el = en.target, target = +el.dataset.count;
        let n = 0;
        const step = Math.max(1, Math.round(target / 40));
        const tick = () => {
          n += step;
          if (n >= target) { el.textContent = target; }
          else { el.textContent = n; requestAnimationFrame(tick); }
        };
        tick();
        cObs.unobserve(el);
      });
    }, { threshold: 0.5 });
    counters.forEach(c => cObs.observe(c));
  }

  /* ---------- 7. Animate skill bars on view ---------- */
  const bars = document.querySelectorAll(".skill__bar i");
  if ("IntersectionObserver" in window && bars.length) {
    const sObs = new IntersectionObserver((entries) => {
      entries.forEach(en => {
        if (!en.isIntersecting) return;
        const i = en.target;
        const w = i.style.width; i.style.width = "0";
        requestAnimationFrame(() => { i.style.width = w; });
        sObs.unobserve(i);
      });
    }, { threshold: 0.4 });
    bars.forEach(b => sObs.observe(b));
  }

  /* ---------- 8. Contact form (graceful) ---------- */
  const form = document.getElementById("contactForm");
  const note = document.getElementById("formNote");
  if (form) {
    form.addEventListener("submit", async (e) => {
      // If Formspree endpoint not configured, fall back to mailto
      const action = form.getAttribute("action") || "";
      const isAr = html.lang === "ar";
      if (action.includes("your-id")) {
        e.preventDefault();
        const fd = new FormData(form);
        const subject = encodeURIComponent("Portfolio contact — " + (fd.get("name") || ""));
        const body = encodeURIComponent((fd.get("message") || "") + "\n\n" + (fd.get("email") || ""));
        window.location.href = `mailto:mezoo.bk@gmail.com?subject=${subject}&body=${body}`;
        return;
      }
      e.preventDefault();
      try {
        const res = await fetch(action, { method: "POST", body: new FormData(form), headers: { Accept: "application/json" } });
        if (res.ok) {
          form.reset();
          showNote(isAr ? "تم الإرسال! سأرد عليك قريباً." : "Sent! I'll get back to you soon.", "ok");
        } else throw new Error();
      } catch (_) {
        showNote(isAr ? "تعذّر الإرسال، حاول عبر البريد مباشرة." : "Couldn't send — try email directly.", "err");
      }
    });
  }
  function showNote(msg, kind) {
    if (!note) return;
    note.textContent = msg; note.className = "form-note " + kind; note.hidden = false;
  }

  /* ---------- 9. Init ---------- */
  let saved = "ar";
  try { saved = localStorage.getItem("mjcoz-lang") || "ar"; } catch (e) {}
  setLang(saved);
})();
