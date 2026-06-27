/* =========================================================
   Admin panel — edit content.json via the API.
   ========================================================= */
(function () {
  "use strict";

  const TOKEN_KEY = "mjcoz-admin-token";
  let token = localStorage.getItem(TOKEN_KEY) || "";
  let data = {};
  const readers = {}; // section -> () => value

  /* ---------- tiny DOM helper ---------- */
  function el(tag, props, kids) {
    const n = document.createElement(tag);
    if (props) for (const k in props) {
      if (k === "class") n.className = props[k];
      else if (k === "html") n.innerHTML = props[k];
      else if (k === "text") n.textContent = props[k];
      else if (k.startsWith("on")) n.addEventListener(k.slice(2), props[k]);
      else if (props[k] != null && props[k] !== false) n.setAttribute(k, props[k]);
    }
    (kids || []).forEach(c => c && n.appendChild(typeof c === "string" ? document.createTextNode(c) : c));
    return n;
  }

  /* ---------- field builders → {el, read} ---------- */
  function biField(value, textarea) {
    value = value || {};
    const tag = textarea ? "textarea" : "input";
    const ar = el(tag, { value: "" }); ar.value = value.ar || "";
    const en = el(tag, { value: "", dir: "ltr" }); en.value = value.en || "";
    const wrap = el("div", { class: "bi" }, [
      el("div", {}, [el("span", { class: "lng", text: "عربي" }), ar]),
      el("div", {}, [el("span", { class: "lng", text: "English" }), en])
    ]);
    return { el: wrap, read: () => ({ ar: ar.value, en: en.value }) };
  }
  function textField(value, opts) {
    opts = opts || {};
    const i = el("input", { value: "", dir: opts.dir || null, type: opts.type || "text", placeholder: opts.ph || "" });
    i.value = value == null ? "" : value;
    return { el: i, read: () => opts.type === "number" ? Number(i.value) : i.value };
  }
  function checkField(value, label) {
    const c = el("input", { type: "checkbox" }); c.checked = !!value;
    const w = el("label", { class: "check" }, [c, label || "مميّز"]);
    return { el: w, read: () => c.checked };
  }
  function selectField(value, options) {
    const s = el("select");
    options.forEach(o => { const op = el("option", { value: o.v }, [o.t]); if (o.v === value) op.selected = true; s.appendChild(op); });
    return { el: s, read: () => s.value };
  }
  function colorField(value) {
    value = value || "#cccccc";
    const sw = el("span", { class: "swatch" }); sw.style.background = value;
    const picker = el("input", { type: "color" }); try { picker.value = value; } catch (e) {}
    const txt = el("input", { value: value, dir: "ltr" });
    function sync(v) { sw.style.background = v; }
    picker.addEventListener("input", () => { txt.value = picker.value; sync(picker.value); });
    txt.addEventListener("input", () => { try { picker.value = txt.value; } catch (e) {} sync(txt.value); });
    return { el: el("div", { class: "color-field" }, [picker, txt, sw]), read: () => txt.value };
  }
  function imageField(value) {
    const preview = (v) => (!v || /^(https?:)?\//.test(v)) ? v : "/" + v; // resolve from site root
    const path = el("input", { value: value || "", dir: "ltr", placeholder: "assets/... أو ارفع صورة" });
    const file = el("input", { type: "file", accept: "image/*" });
    const status = el("p", { class: "upload-status" });
    const thumb = el("img", { class: "thumb", alt: "" });
    if (value) thumb.src = preview(value);
    path.addEventListener("input", () => { if (path.value) thumb.src = preview(path.value); });
    file.addEventListener("change", async () => {
      if (!file.files[0]) return;
      status.textContent = "جارٍ الرفع…";
      const fd = new FormData(); fd.append("image", file.files[0]);
      try {
        const r = await fetch("/api/upload", { method: "POST", headers: { Authorization: "Bearer " + token }, body: fd });
        if (r.status === 401) return forceLogout();
        const j = await r.json();
        if (!r.ok) throw new Error(j.error || "فشل الرفع");
        path.value = j.path; thumb.src = j.path; status.textContent = "تم الرفع ✓";
      } catch (e) { status.textContent = "خطأ: " + e.message; }
    });
    const col = el("div", { class: "col" }, [path, file, status]);
    return { el: el("div", { class: "img-field" }, [thumb, col]), read: () => path.value };
  }

  function fieldFor(kind, value, extra) {
    switch (kind) {
      case "bi":     return biField(value, false);
      case "bitext": return biField(value, true);
      case "num":    return textField(value, { type: "number" });
      case "check":  return checkField(value, extra && extra.label);
      case "select": return selectField(value, extra.options);
      case "color":  return colorField(value);
      case "image":  return imageField(value);
      default:       return textField(value, extra || {});
    }
  }

  /* ---------- object editor (keyed fields) ---------- */
  function objectEditor(spec, obj) {
    obj = obj || {};
    const box = el("div");
    const parts = [];
    spec.forEach(f => {
      const fld = fieldFor(f.kind, obj[f.key], f);
      box.appendChild(el("div", { class: "field" }, [el("label", { text: f.label }), fld.el]));
      parts.push({ key: f.key, fld });
    });
    return { el: box, read: () => { const o = {}; parts.forEach(p => o[p.key] = p.fld.read()); return o; } };
  }

  /* ---------- list editor (repeatable rows) ----------
     spec: array of {key,kind,label,...}. If a spec entry has key===null,
     the row value IS that single field's value (used for bilingual lists). */
  function listEditor(spec, arr, rowTitle) {
    arr = Array.isArray(arr) ? arr : [];
    const list = el("div");
    const rows = [];

    function addRow(item) {
      const single = spec.length === 1 && spec[0].key === null;
      const parts = [];
      const body = el("div");
      spec.forEach(f => {
        const val = single ? item : (item || {})[f.key];
        const fld = fieldFor(f.kind, val, f);
        body.appendChild(el("div", { class: "field" }, [f.label ? el("label", { text: f.label }) : null, fld.el].filter(Boolean)));
        parts.push({ key: f.key, fld });
      });
      const del = el("button", { class: "btn btn--sm btn--danger", type: "button", onclick: () => { list.removeChild(row); const i = rows.indexOf(rec); if (i > -1) rows.splice(i, 1); renumber(); } }, ["حذف"]);
      const head = el("div", { class: "row__head" }, [el("strong", { text: rowTitle || "عنصر" }), del]);
      const row = el("div", { class: "row" }, [head, body]);
      const rec = { row, read: () => single ? parts[0].fld.read() : (() => { const o = {}; parts.forEach(p => o[p.key] = p.fld.read()); return o; })() };
      rows.push(rec); list.appendChild(row); renumber();
    }
    function renumber() { [...list.querySelectorAll(".row__head strong")].forEach((s, i) => s.textContent = `${rowTitle || "عنصر"} ${i + 1}`); }

    arr.forEach(addRow);
    const addBtn = el("button", { class: "btn btn--sm add-row", type: "button", onclick: () => addRow(spec.length === 1 && spec[0].key === null ? { ar: "", en: "" } : {}) }, ["+ إضافة"]);
    return { el: el("div", {}, [list, addBtn]), read: () => rows.map(r => r.read()) };
  }

  /* ---------- panel wrapper ---------- */
  function panel(title, ...editors) {
    const body = el("div", { class: "panel__body" });
    editors.forEach(e => body.appendChild(e));
    const head = el("div", { class: "panel__head", onclick: () => p.classList.toggle("is-open") }, [
      el("h2", { text: title }), el("span", { class: "panel__toggle", text: "▾" })
    ]);
    const p = el("div", { class: "panel" }, [head, body]);
    return p;
  }
  function subhead(t) { return el("h3", { text: t, class: "field", style: "font-family:var(--mono);margin-top:8px" }); }

  /* ---------- build the whole editor ---------- */
  function buildEditor() {
    const root = document.getElementById("editor");
    root.innerHTML = "";

    // HERO
    const heroObj = objectEditor([
      { key: "eyebrow", kind: "bi",     label: "السطر التمهيدي" },
      { key: "lead",    kind: "bitext", label: "الوصف الرئيسي" }
    ], data.hero || {});
    const heroTitle = listEditor([
      { key: "text",   kind: "bi",    label: "نص السطر" },
      { key: "accent", kind: "check", label: "تمييز (لون مفرّغ)" }
    ], (data.hero || {}).title, "سطر العنوان");
    readers.hero = () => Object.assign(heroObj.read(), { title: heroTitle.read() });
    root.appendChild(panel("الواجهة (Hero)", heroObj.el, subhead("أسطر العنوان الكبير"), heroTitle.el));

    // STATS
    const stats = listEditor([
      { key: "num",   kind: "num",  label: "الرقم" },
      { key: "plus",  kind: "text", label: "اللاحقة (+ / M+)" },
      { key: "label", kind: "bi",   label: "التسمية" }
    ], data.stats, "إحصائية");
    readers.stats = stats.read;
    root.appendChild(panel("الإحصائيات", stats.el));

    // ABOUT
    const aboutObj = objectEditor([
      { key: "name",   kind: "bi",    label: "الاسم" },
      { key: "role",   kind: "bi",    label: "المسمى المهني" },
      { key: "photo",  kind: "image", label: "صورتك الشخصية (الأولوية في العرض)" },
      { key: "logo",   kind: "image", label: "الشعار (يظهر لو لا توجد صورة)" },
      { key: "avatar", kind: "bi",    label: "أحرف الأفاتار (تظهر لو لا صورة ولا شعار)" }
    ], data.about || {});
    const meta = listEditor([
      { key: "label",  kind: "bi",    label: "التسمية" },
      { key: "value",  kind: "bi",    label: "القيمة" },
      { key: "status", kind: "check", label: "إبراز (أخضر)" }
    ], (data.about || {}).meta, "معلومة");
    const bio = listEditor([{ key: null, kind: "bitext", label: "فقرة" }], (data.about || {}).bio, "فقرة");
    const tags = textField(((data.about || {}).tags || []).join("، "), { ph: "افصل بفاصلة" });
    readers.about = () => Object.assign(aboutObj.read(), {
      meta: meta.read(), bio: bio.read(),
      tags: tags.read().split(/[،,]/).map(s => s.trim()).filter(Boolean)
    });
    root.appendChild(panel("من أنا", aboutObj.el, subhead("معلومات سريعة"), meta.el,
      subhead("النبذة"), bio.el, subhead("الأدوات (Tags)"), el("div", { class: "field" }, [tags.el])));

    // SERVICES
    const services = listEditor([
      { key: "num",   kind: "text",   label: "الرمز (A/B/C)" },
      { key: "title", kind: "bi",     label: "العنوان" },
      { key: "desc",  kind: "bitext", label: "الوصف" }
    ], data.services, "خدمة");
    readers.services = services.read;
    root.appendChild(panel("الخدمات", services.el));

    // PROJECTS
    const projects = listEditor([
      { key: "title",    kind: "bi",     label: "العنوان" },
      { key: "desc",     kind: "bitext", label: "الوصف" },
      { key: "category", kind: "select", label: "التصنيف", options: [
        { v: "branding", t: "المنيو" }, { v: "post", t: "بوست" }, { v: "story", t: "ستوري" } ] },
      { key: "label",    kind: "text",   label: "اسم مختصر (يظهر لو بلا صورة)" },
      { key: "color",    kind: "color",  label: "لون الخلفية" },
      { key: "img",      kind: "image",  label: "الصورة" }
    ], data.projects, "عمل");
    readers.projects = () => projects.read().map((p, i) => Object.assign({ id: (data.projects && data.projects[i] && data.projects[i].id) || "p" + Date.now() + i }, p));
    root.appendChild(panel("الأعمال (إضافة / حذف / تعديل)", projects.el));

    // RESUME
    const cv = textField((data.resume || {}).cvUrl, { dir: "ltr", ph: "assets/cv.pdf" });
    const exp = listEditor([
      { key: "date",  kind: "bi",     label: "الفترة" },
      { key: "title", kind: "bi",     label: "المسمى" },
      { key: "desc",  kind: "bitext", label: "الوصف" }
    ], (data.resume || {}).experience, "خبرة");
    const edu = listEditor([
      { key: "date",  kind: "bi",     label: "الفترة" },
      { key: "title", kind: "bi",     label: "الشهادة" },
      { key: "desc",  kind: "bitext", label: "الوصف" }
    ], (data.resume || {}).education, "مؤهل");
    const skills = listEditor([
      { key: "name", kind: "bi",  label: "المهارة" },
      { key: "pct",  kind: "num", label: "النسبة %" }
    ], (data.resume || {}).skills, "مهارة");
    readers.resume = () => ({ cvUrl: cv.read(), experience: exp.read(), education: edu.read(), skills: skills.read() });
    root.appendChild(panel("السيرة الذاتية", el("div", { class: "field" }, [el("label", { text: "رابط ملف PDF" }), cv.el]),
      subhead("الخبرات"), exp.el, subhead("التعليم"), edu.el, subhead("المهارات"), skills.el));

    // TESTIMONIALS
    const testi = listEditor([
      { key: "text", kind: "bitext", label: "الرأي" },
      { key: "name", kind: "bi",     label: "الاسم" },
      { key: "role", kind: "bi",     label: "الصفة" }
    ], data.testimonials, "رأي");
    readers.testimonials = testi.read;
    root.appendChild(panel("آراء العملاء", testi.el));

    // CONTACT
    const cLead = biField((data.contact || {}).lead, true);
    const cEmail = textField((data.contact || {}).email, { dir: "ltr" });
    const igH = textField(((data.contact || {}).instagram || {}).handle, { dir: "ltr", ph: "@user" });
    const igU = textField(((data.contact || {}).instagram || {}).url, { dir: "ltr", ph: "https://instagram.com/..." });
    const waD = textField(((data.contact || {}).whatsapp || {}).display, { dir: "ltr", ph: "+966 ..." });
    const waU = textField(((data.contact || {}).whatsapp || {}).url, { dir: "ltr", ph: "https://wa.me/966..." });
    readers.contact = () => ({
      lead: cLead.read(), email: cEmail.read(),
      instagram: { handle: igH.read(), url: igU.read() },
      whatsapp: { display: waD.read(), url: waU.read() }
    });
    root.appendChild(panel("التواصل",
      el("div", { class: "field" }, [el("label", { text: "نص الدعوة" }), cLead.el]),
      el("div", { class: "field" }, [el("label", { text: "البريد الإلكتروني" }), cEmail.el]),
      subhead("إنستغرام"), el("div", { class: "inline" }, [igH.el, igU.el]),
      subhead("واتساب"), el("div", { class: "inline" }, [waD.el, waU.el])
    ));

    // open the first panel by default
    const first = root.querySelector(".panel"); if (first) first.classList.add("is-open");
  }

  function collect() {
    return {
      hero: readers.hero(), stats: readers.stats(), about: readers.about(),
      services: readers.services(), projects: readers.projects(), resume: readers.resume(),
      testimonials: readers.testimonials(), contact: readers.contact()
    };
  }

  /* ---------- save ---------- */
  async function save() {
    const note = document.getElementById("saveNote");
    const payload = collect();
    try {
      const r = await fetch("/api/content", {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
        body: JSON.stringify(payload)
      });
      if (r.status === 401) return forceLogout();
      if (!r.ok) throw new Error((await r.json()).error || "فشل الحفظ");
      data = payload;
      showNote("تم الحفظ بنجاح ✓ — حدّث الموقع لرؤية التغييرات.", "ok");
    } catch (e) { showNote("خطأ: " + e.message, "err"); }
  }
  function showNote(msg, kind) {
    const n = document.getElementById("saveNote");
    n.textContent = msg; n.className = "save-note " + kind; n.hidden = false;
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  /* ---------- auth flow ---------- */
  async function loadAndShow() {
    const r = await fetch("/api/content", { cache: "no-store" });
    data = await r.json();
    buildEditor();
    document.getElementById("login").hidden = true;
    document.getElementById("app").hidden = false;
  }
  function forceLogout() {
    token = ""; localStorage.removeItem(TOKEN_KEY);
    document.getElementById("app").hidden = true;
    document.getElementById("login").hidden = false;
    const e = document.getElementById("loginErr"); e.textContent = "انتهت الجلسة، سجّل الدخول مجدداً."; e.hidden = false;
  }

  document.getElementById("loginForm").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const errEl = document.getElementById("loginErr"); errEl.hidden = true;
    const password = document.getElementById("password").value;
    try {
      const r = await fetch("/api/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password }) });
      if (!r.ok) throw new Error("كلمة المرور غير صحيحة");
      token = (await r.json()).token;
      localStorage.setItem(TOKEN_KEY, token);
      await loadAndShow();
    } catch (e) { errEl.textContent = e.message; errEl.hidden = false; }
  });

  document.getElementById("saveBtn").addEventListener("click", save);
  document.getElementById("logoutBtn").addEventListener("click", forceLogout);

  // auto-resume session
  if (token) loadAndShow().catch(() => forceLogout());
})();
