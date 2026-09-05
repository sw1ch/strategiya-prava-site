(function () {
  "use strict";
  var SUPABASE_URL = "https://rttvkincawnxacufpnji.supabase.co";
  var SUPABASE_KEY = "sb_publishable_K_jirLIYBFT3SUWJAoz1Dg_6AV8vyHj";
  var REMEMBER_KEY = "sp.remember";
  function wantsRemember() {
    try { return localStorage.getItem(REMEMBER_KEY) !== "0"; }
    catch (e) { return true; }
  }
  function setRemember(on) {
    try { localStorage.setItem(REMEMBER_KEY, on ? "1" : "0"); } catch (e) {}
  }
  var authStorage = {
    getItem: function (k) {
      try { return (wantsRemember() ? localStorage : sessionStorage).getItem(k); }
      catch (e) { return null; }
    },
    setItem: function (k, v) {
      try { (wantsRemember() ? localStorage : sessionStorage).setItem(k, v); }
      catch (e) {}
    },
    removeItem: function (k) {
      try { localStorage.removeItem(k); sessionStorage.removeItem(k); } catch (e) {}
    }
  };
  var sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, storage: authStorage }
  });
  var $ = function (s) { return document.querySelector(s); };
  var el = {
    auth: $("#auth"), top: $("#lk-top"), tabs: $("#tabs"), app: $("#app"),
    loginForm: $("#login-form"), mail: $("#a-mail"), pass: $("#a-pass"),
    aSubmit: $("#a-submit"), aStatus: $("#a-status"),
    signupForm: $("#signup-form"), sSubmit: $("#s-submit"), sStatus: $("#s-status"),
    whoName: $("#who-name"), whoRole: $("#who-role"), whoMono: $("#who-mono"),
    profileBtn: $("#profile-btn"),
    caseBody: $("#case-body"), caseUpdated: $("#case-updated"), caseHead: $("#case-head"),
    chatLog: $("#chat-log"), composer: $("#composer"), msg: $("#msg"), send: $("#send"),
    chatSub: $("#chat-sub"), toast: $("#toast"),
    clip: $("#clip"), chatFile: $("#chat-file"),
    paneCase: $("#pane-case"), paneChat: $("#pane-chat")
  };
  var me = null;        // строка из profiles
  var current = null;   // текущее дело
  var channel = null;   // подписка на переписку
  var seen = Object.create(null);   // идентификаторы уже нарисованных сообщений
  var docsById = Object.create(null); // документ по id — чтобы вложение в переписке знало свой путь
  var unread = Object.create(null); // id дела → сколько входящих не прочитано
  function isStaff() { return !!me && me.role !== "client"; }
  function isOwner() { return !!me && me.role === "lawyer"; }
  function can(key) {
    if (isOwner()) return true;
    return !!(me && me.perms && me.perms[key] === true);
  }
  var ROLE_LABEL = { lawyer: "юрист", assistant: "помощник", client: "доверитель" };
  function initials(name) {
    var words = String(name || "").split(/\s+/);
    var clean = [];
    for (var i = 0; i < words.length; i++) {
      var w = words[i].replace(/[^0-9A-Za-zА-Яа-яЁё]/g, "");
      if (w) clean.push(w);
    }
    if (!clean.length) return "—";
    if (clean.length === 1) return clean[0].slice(0, 2).toUpperCase();
    return (clean[0].charAt(0) + clean[1].charAt(0)).toUpperCase();
  }
  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }
  var toastTimer = 0;
  function toast(text, isError) {
    el.toast.textContent = text;
    el.toast.className = "toast is-on" + (isError ? " toast--err" : "");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.toast.className = "toast"; }, 4200);
  }
  var fmtTime = new Intl.DateTimeFormat("ru-RU", { hour: "2-digit", minute: "2-digit" });
  var fmtDay = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long" });
  var fmtDayYear = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", year: "numeric" });
  function dayLabel(d) {
    var today = new Date();
    var y = new Date(); y.setDate(today.getDate() - 1);
    if (d.toDateString() === today.toDateString()) return "Сегодня";
    if (d.toDateString() === y.toDateString()) return "Вчера";
    return d.getFullYear() === today.getFullYear() ? fmtDay.format(d) : fmtDayYear.format(d);
  }
  function humanSize(n) {
    if (!n && n !== 0) return "";
    if (n < 1024) return n + " Б";
    if (n < 1024 * 1024) return Math.round(n / 1024) + " КБ";
    return (n / 1048576).toFixed(1).replace(".", ",") + " МБ";
  }
  function extOf(name) {
    var m = /\.([a-z0-9]{1,5})$/i.exec(name || "");
    return m ? m[1].toUpperCase().slice(0, 4) : "ФАЙЛ";
  }
  var STATUS = {
    "new":     "Принято в работу",
    "in_work": "В работе",
    "court":   "В суде",
    "done":    "Работа выполнена",
    "closed":  "Дело закрыто"
  };
  function showAuth() {
    var wk = document.getElementById("wk");
    if (wk) wk.hidden = true;
    el.auth.hidden = false;
    el.top.hidden = true;
    el.tabs.hidden = true;
    el.app.hidden = true;
    setTimeout(function () { el.mail.focus(); }, 60);
  }
  function showApp() {
    el.auth.hidden = true;
    el.top.hidden = false;
    el.tabs.hidden = false;
    el.app.hidden = false;
    applyTabs();
  }
  var activePane = "case";
  function applyTabs() {
    var narrow = window.matchMedia("(max-width: 900px)").matches;
    el.paneCase.hidden = narrow && activePane !== "case";
    el.paneChat.hidden = narrow && activePane !== "chat";
  }
  Array.prototype.forEach.call(el.tabs.querySelectorAll("button"), function (b) {
    b.addEventListener("click", function () {
      activePane = b.dataset.pane;
      Array.prototype.forEach.call(el.tabs.querySelectorAll("button"), function (x) {
        x.setAttribute("aria-selected", String(x === b));
      });
      applyTabs();
      if (activePane === "chat") {
        scrollChat(false);
        if (current) markRead(current.id);
      }
    });
  });
  window.addEventListener("resize", applyTabs, { passive: true });
  var LOGIN_DOMAIN = "lk.strategydefense.ru";
  function phoneDigits(v) {
    var d = String(v || "").replace(/\D/g, "");
    if (d.length === 11 && d.charAt(0) === "8") d = "7" + d.slice(1);
    if (d.length === 10) d = "7" + d;
    return d;
  }
  function normalizeLogin(v) {
    v = String(v || "").trim().toLowerCase();
    if (!v) return v;
    if (v.indexOf("@") !== -1) return v;              // почта — как есть
    var d = v.replace(/\D/g, "");
    if (d.length >= 10) return phoneDigits(v) + "@" + LOGIN_DOMAIN;   // телефон
    return v + "@" + LOGIN_DOMAIN;                    // короткий логин
  }
  function bad(input, on) {
    var f = input.closest(".field");
    if (!f) return;
    if (on) f.setAttribute("data-invalid", "true");
    else f.removeAttribute("data-invalid");
  }
  function isMail(v) { return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v); }
  function whoName(p) {
    if (!p) return "";
    if (p.entity_type === "company" && p.org_name) {
      return p.org_name + (p.full_name ? " · " + p.full_name : "");
    }
    return p.full_name || "без имени";
  }
  function requisites(p) {
    if (!p || !isStaff() || p.entity_type !== "company") return "";
    var rows = [];
    if (p.org_name) rows.push(["Организация", p.org_name]);
    if (p.inn) rows.push(["ИНН", p.inn]);
    if (p.ogrn) rows.push([p.ogrn.length === 15 ? "ОГРНИП" : "ОГРН", p.ogrn]);
    if (p.contact_position) rows.push(["Подписант", p.contact_position]);
    if (!rows.length) return "";
    return '<dl class="requisites">' +
      rows.map(function (r) {
        return '<dt>' + esc(r[0]) + '</dt><dd>' + esc(r[1]) + '</dd>';
      }).join("") + '</dl>';
  }
  function authError(err) {
    var m = String(err && err.message || "");
    if (/invalid login/i.test(m)) return "Почта или пароль не подошли. Проверьте раскладку и заглавные буквы.";
    if (/email not confirmed/i.test(m)) return "Почта ещё не подтверждена. Откройте ссылку из письма.";
    if (/already registered|already exists/i.test(m)) return "Такая почта уже занята. Попробуйте войти.";
    if (/password.*(6|short|length)/i.test(m)) return "Пароль слишком короткий — нужно хотя бы шесть знаков.";
    if (/rate|too many/i.test(m)) return "Слишком много попыток подряд. Подождите минуту.";
    if (/failed to fetch|network/i.test(m)) return "Нет связи с сервером. Проверьте интернет.";
    return "Не получилось. Позвоните 8 (964) 733-00-46.";
  }
  var authTabs = document.querySelectorAll(".authtabs button");
  Array.prototype.forEach.call(authTabs, function (b) {
    b.addEventListener("click", function () {
      var signup = b.dataset.mode === "signup";
      Array.prototype.forEach.call(authTabs, function (x) {
        x.setAttribute("aria-selected", String(x === b));
      });
      el.loginForm.hidden = signup;
      el.signupForm.hidden = !signup;
      $("#auth-title").textContent = signup ? "Регистрация" : "Личный кабинет";
      $("#auth-sub").textContent = signup
        ? "Заведём кабинет — дело в нём появится после консультации"
        : "Этап дела, переписка с юристом и документы";
      setTimeout(function () {
        var f = signup ? $("#s-name") : el.mail;
        if (f) f.focus({ preventScroll: true });
      }, 60);
    });
  });
  el.loginForm.addEventListener("submit", function (e) {
    e.preventDefault();
    el.aStatus.className = "form__status";
    var raw = el.mail.value.trim();
    var pass = el.pass.value;
    var wrong = false;
    var loginBad = raw.length < 2 || (raw.indexOf("@") >= 0 && !isMail(raw));
    bad(el.mail, loginBad); wrong = wrong || loginBad;
    bad(el.pass, !pass);   wrong = wrong || !pass;
    if (wrong) return;
    var rem = document.getElementById("a-remember");
    setRemember(!rem || rem.checked);
    el.aSubmit.setAttribute("aria-disabled", "true");
    el.aSubmit.textContent = "Проверяем…";
    sb.auth.signInWithPassword({ email: normalizeLogin(raw), password: pass })
      .then(function (res) {
        if (res.error) throw res.error;
        return boot();
      })
      .catch(function (err) {
        el.aStatus.className = "form__status is-err";
        el.aStatus.textContent = authError(err);
      })
      .then(function () {
        el.aSubmit.removeAttribute("aria-disabled");
        el.aSubmit.textContent = "Войти";
      });
  });
  function goToLogin(value) {
    var tab = document.querySelector('.authtabs button[data-mode="login"]');
    if (tab) tab.click();
    el.mail.value = value;
    el.mail.focus();
  }
  var LEAD_KEY = "sp.lead";
  var LEAD_TTL = 24 * 3600 * 1000;
  function readLead() {
    try {
      var raw = localStorage.getItem(LEAD_KEY);
      if (!raw) return null;
      var o = JSON.parse(raw);
      if (!o || !o.message) return null;
      if (Date.now() - (o.at || 0) > LEAD_TTL) { clearLead(); return null; }
      return o;
    } catch (err) { return null; }
  }
  function clearLead() {
    try { localStorage.removeItem(LEAD_KEY); } catch (err) {}
  }
  function sendLead() {
    var lead = readLead();
    if (!lead || !me || isStaff()) return Promise.resolve();
    var known = lead.topic && lead.topic.indexOf("Не знаю") !== 0;
    var title = (known ? lead.topic + " — " : "") + lead.message.replace(/\s+/g, " ").slice(0, 90);
    return sb.from("case_requests").insert({
      client_id: me.id,
      title: title.slice(0, 160),
      category: known ? lead.topic : null,
      story: lead.message
    }).then(function (r) {
      if (r.error) {
        console.warn("обращение не отправилось:", r.error.message);
        toast("Обращение не ушло. Опишите дело кнопкой ниже.", true);
        return;
      }
      clearLead();
      toast("Обращение отправлено юристу. Ответ придёт сюда.");
    });
  }
  function prefillFromLead() {
    var lead = readLead();
    if (!lead) return;
    var tab = document.querySelector('.authtabs button[data-mode="signup"]');
    if (tab) tab.click();
    var nm = $("#s-name"), ph = $("#s-phone"), ml = $("#s-mail");
    if (nm && !nm.value) nm.value = lead.name || "";
    if (ph && !ph.value) ph.value = lead.phone || "";
    if (ml && !ml.value) ml.value = lead.email || "";
    if (!document.getElementById("lead-note")) {
      var note = document.createElement("p");
      note.className = "leadnote";
      note.id = "lead-note";
      note.textContent = "Ваше обращение сохранено. Оно уйдёт юристу сразу после регистрации — " +
        "ответ и документы будут приходить сюда.";
      el.signupForm.insertBefore(note, el.signupForm.firstChild);
    }
  }
  var sPhone = $("#s-phone");
  var takenNote = $("#s-phone-taken");
  var takenSeq = 0;
  var takenTimer = null;
  function clearTaken() {
    if (!takenNote) return;
    takenNote.hidden = true;
    var f = sPhone.closest(".field");
    if (f) f.classList.remove("is-taken");
  }
  function askTaken() {
    if (!sPhone || !takenNote) return;
    clearTaken();
    if (phoneDigits(sPhone.value).length !== 11) return;
    var seq = ++takenSeq;
    fetch(SUPABASE_URL + "/functions/v1/signup", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        Authorization: "Bearer " + SUPABASE_KEY
      },
      body: JSON.stringify({ check: sPhone.value })
    })
      .then(function (r) { return r.json(); })
      .then(function (j) {
        if (seq !== takenSeq) return;      // ответ на предыдущий номер, он устарел
        if (!j || j.taken !== true) return;
        var f = sPhone.closest(".field");
        if (f) f.classList.add("is-taken");
        takenNote.hidden = false;
      })
      .catch(function () {});
  }
  if (sPhone && takenNote) {
    sPhone.addEventListener("input", function () {
      clearTaken();
      if (takenTimer) clearTimeout(takenTimer);
      takenTimer = setTimeout(askTaken, 500);
    });
    sPhone.addEventListener("blur", askTaken);
    var takenLink = $("#taken-to-login");
    if (takenLink) {
      takenLink.addEventListener("click", function () { goToLogin(sPhone.value.trim()); });
    }
  }
  function entityKind() {
    var picked = document.querySelector('#signup-form input[name="s-entity"]:checked');
    return picked ? picked.value : "person";
  }
  function syncEntity() {
    var company = entityKind() === "company";
    var box = $("#s-company");
    var hint = $("#s-name-hint");
    if (box) box.hidden = !company;
    if (hint) hint.hidden = !company;
    if (!company && box) {
      Array.prototype.forEach.call(box.querySelectorAll("input"), function (i) { bad(i, false); });
    }
  }
  Array.prototype.forEach.call(
    document.querySelectorAll('#signup-form input[name="s-entity"]'),
    function (r) { r.addEventListener("change", syncEntity); });
  syncEntity();
  el.signupForm.addEventListener("submit", function (e) {
    e.preventDefault();
    el.sStatus.className = "form__status";
    var name = $("#s-name"), phone = $("#s-phone"), mail = $("#s-mail"),
        pass = $("#s-pass"), agree = $("#s-agree"),
        msgrKind = $("#s-msgr-kind"), msgr = $("#s-msgr"),
        rem = $("#s-remember");
    var wrong = false;
    var nameBad = name.value.trim().length < 2;
    bad(name, nameBad); wrong = wrong || nameBad;
    var digits = phoneDigits(phone.value);
    var phoneBad = digits.length !== 11;
    bad(phone, phoneBad); wrong = wrong || phoneBad;
    var mailBad = mail.value.trim() !== "" && !isMail(mail.value.trim());
    bad(mail, mailBad); wrong = wrong || mailBad;
    var passBad = pass.value.length < 6;
    bad(pass, passBad); wrong = wrong || passBad;
    var agreeBad = !agree.checked;
    bad(agree, agreeBad); wrong = wrong || agreeBad;
    var entity = entityKind();
    var org = $("#s-org"), inn = $("#s-inn"), ogrn = $("#s-ogrn"), position = $("#s-position");
    if (entity === "company") {
      var orgBad = org.value.trim().length < 2;
      bad(org, orgBad); wrong = wrong || orgBad;
      var innDigits = inn.value.replace(/\D/g, "");
      var innBad = innDigits.length !== 10 && innDigits.length !== 12;
      bad(inn, innBad); wrong = wrong || innBad;
      var ogrnDigits = ogrn.value.replace(/\D/g, "");
      var ogrnBad = ogrnDigits.length !== 13 && ogrnDigits.length !== 15;
      bad(ogrn, ogrnBad); wrong = wrong || ogrnBad;
    }
    if (wrong) return;
    setRemember(!rem || rem.checked);
    el.sSubmit.setAttribute("aria-disabled", "true");
    el.sSubmit.textContent = "Заводим кабинет…";
    var login = digits + "@" + LOGIN_DOMAIN;
    var contact = msgr.value.trim()
      ? msgrKind.value + ": " + msgr.value.trim()
      : msgrKind.value;
    fetch(SUPABASE_URL + "/functions/v1/signup", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        Authorization: "Bearer " + SUPABASE_KEY
      },
      body: JSON.stringify({
        name: name.value.trim(),
        phone: phone.value.trim(),
        password: pass.value,
        messenger: contact,
        email: mail.value.trim(),
        entity: entity,
        org_name: entity === "company" ? org.value.trim() : "",
        inn: entity === "company" ? inn.value.trim() : "",
        ogrn: entity === "company" ? ogrn.value.trim() : "",
        position: entity === "company" ? position.value.trim() : "",
        website: ""            // ловушка для роботов, человек её не видит
      })
    })
      .then(function (r) {
        return r.json().catch(function () { return {}; }).then(function (j) {
          if (!r.ok) {
            var e = new Error(j.error || ("HTTP " + r.status));
            e.code = j.error;
            throw e;
          }
          return j;
        });
      })
      .then(function () {
        return sb.auth.signInWithPassword({ email: login, password: pass.value });
      })
      .then(function (r) {
        if (r.error) throw r.error;
        return boot();
      })
      .catch(function (err) {
        el.sStatus.className = "form__status is-err";
        var code = err && err.code;
        if (code === "exists") {
          el.sStatus.innerHTML =
            'На этот номер кабинет уже заведён. ' +
            '<button type="button" class="linklike" id="to-login">Войти по нему</button>.';
          var toLogin = document.getElementById("to-login");
          if (toLogin) {
            toLogin.addEventListener("click", function () { goToLogin(phone.value.trim()); });
          }
          el.sSubmit.removeAttribute("aria-disabled");
          el.sSubmit.textContent = "Зарегистрироваться";
          return;
        }
        el.sStatus.textContent =
          code === "rate"   ? "Слишком много регистраций подряд. Попробуйте через час или позвоните." :
          code === "phone"  ? "Проверьте номер — нужны все 11 цифр." :
          code === "password" ? "Пароль должен быть не короче шести знаков." :
          code === "org_name" ? "Напишите название организации так, как оно указано в документах." :
          code === "inn"    ? "ИНН — это 10 цифр у юридического лица и 12 у ИП." :
          code === "ogrn"   ? "ОГРН — 13 цифр, ОГРНИП — 15." :
          authError(err);
      })
      .then(function () {
        el.sSubmit.removeAttribute("aria-disabled");
        el.sSubmit.textContent = "Зарегистрироваться";
      });
  });
  Array.prototype.forEach.call(
    document.querySelectorAll("#login-form input, #signup-form input"),
    function (i) {
      i.addEventListener("input", function () { bad(i, false); });
      i.addEventListener("change", function () { bad(i, false); });
    });
  function signOutToSite() {
    if (channel) { sb.removeChannel(channel); channel = null; }
    sb.auth.signOut()
      .then(function () { window.location.href = "../index.html"; })
      .catch(function () { window.location.href = "../index.html"; });
  }
  var lastFail = 0;
  window.addEventListener("unhandledrejection", function (e) {
    console.warn("необработанный отказ:", e.reason);
    var now = Date.now();
    if (now - lastFail < 5000) return;
    lastFail = now;
    toast("Не получилось связаться с сервером. Проверьте связь и повторите.", true);
  });
  function boot() {
    return sb.auth.getUser().then(function (r) {
      if (r.error || !r.data.user) { showAuth(); return; }
      return sb.from("profiles").select("*").eq("id", r.data.user.id).maybeSingle()
        .then(function (p) {
          if (p.error) throw p.error;
          me = p.data || { id: r.data.user.id, full_name: "", role: "client" };
          try {
            localStorage.setItem("sp-audience",
              me.entity_type === "company" ? "company" : "person");
          } catch (err) { /* приватный режим — не беда, просто не запомним */ }
          var shown = me.full_name || r.data.user.email;
          el.whoName.textContent = shown;
          el.whoRole.textContent = ROLE_LABEL[me.role] || "доверитель";
          if (el.whoMono) el.whoMono.textContent = initials(shown);
          showApp();
          return sendLead().then(loadCases);
        });
    }).catch(function (err) {
      console.warn(err);
      toast("Не удалось загрузить кабинет. Обновите страницу.", true);
    });
  }
  var everyone = {};     // id профиля → имя, нужно юристу для списка дел
  var allCases = [];
  function loadCases() {
    var q = [sb.from("cases").select("*").order("updated_at", { ascending: false })];
    if (isStaff()) {
      q.push(sb.from("profiles")
        .select("id,full_name,role,entity_type,org_name,inn,ogrn,contact_position," +
                "phone,messenger,email,archived_at," +
                "contract_no,public_title,staff_rank,perms,last_seen_at"));
    }
    return Promise.all(q).then(function (r) {
      if (r[0].error) throw r[0].error;
      allCases = r[0].data || [];
      if (r[1] && r[1].data) {
        r[1].data.forEach(function (p) { everyone[p.id] = p; });
      }
      if (isStaff() && window.SPWorkspace) {
        refreshUnread();
        subscribe();
        return window.SPWorkspace.start(api);
      }
      if (!allCases.length) {
        return loadRequests().then(renderNoCase);
      }
      refreshUnread();
      subscribe();
      if (!isStaff() && allCases.length === 1) return openCase(allCases[0]);
      renderCaseList();
    });
  }
  function refreshUnread() {
    return sb.from("messages").select("case_id")
      .is("read_at", null).neq("sender_id", me.id)
      .then(function (r) {
        unread = Object.create(null);
        (r.data || []).forEach(function (m) {
          unread[m.case_id] = (unread[m.case_id] || 0) + 1;
        });
        paintUnread();
      })
      .catch(function () { /* счётчик — удобство, из-за него кабинет падать не должен */ });
  }
  function totalUnread() {
    var n = 0;
    for (var k in unread) n += unread[k];
    return n;
  }
  function paintUnread() {
    Array.prototype.forEach.call(document.querySelectorAll(".caserow"), function (row) {
      var n = unread[row.dataset.id] || 0;
      var b = row.querySelector(".unread");
      if (n > 0) {
        if (!b) {
          b = document.createElement("span");
          b.className = "unread";
          row.querySelector(".caserow__top").appendChild(b);
        }
        b.textContent = n > 99 ? "99+" : String(n);
        row.classList.add("caserow--unread");
      } else {
        if (b) b.remove();
        row.classList.remove("caserow--unread");
      }
    });
    var tab = el.tabs.querySelector('button[data-pane="chat"]');
    if (tab) {
      var n = current ? (unread[current.id] || 0) : totalUnread();
      var tb = tab.querySelector(".unread");
      if (n > 0) {
        if (!tb) { tb = document.createElement("span"); tb.className = "unread"; tab.appendChild(tb); }
        tb.textContent = n > 99 ? "99+" : String(n);
      } else if (tb) tb.remove();
    }
    var t = totalUnread();
    document.title = (t > 0 ? "(" + t + ") " : "") + "Личный кабинет — Стратегия Права";
  }
  function markRead(caseId) {
    if (!caseId || !unread[caseId]) return Promise.resolve();
    return sb.from("messages")
      .update({ read_at: new Date().toISOString() })
      .eq("case_id", caseId).is("read_at", null).neq("sender_id", me.id)
      .then(function () {
        delete unread[caseId];
        paintUnread();
      })
      .catch(function () {});
  }
  function chatVisible() {
    return !el.paneChat.hidden && !document.hidden;
  }
  function renderNoCase() {
    el.caseHead.textContent = isStaff() ? "Дела" : "Ваше дело";
    el.caseUpdated.textContent = "";
    el.caseBody.innerHTML =
      '<div class="empty">' +
        '<svg><use href="#i-folder"/></svg>' +
        '<b>' + (isStaff() ? "Дел пока нет" : "Дело ещё не заведено") + '</b>' +
        '<span>' + (isStaff()
          ? "Заведите первое дело — доверитель увидит его у себя сразу."
          : "Опишите своё дело — юрист посмотрит и заведёт его.") +
        '</span>' +
        (isStaff()
          ? '<button class="btn btn--primary" id="new-case">Новое дело</button>'
          : '<button class="btn btn--primary" id="ask-case">Описать своё дело</button>') +
      '</div>' + myRequestsMarkup();
    closeChat("Дело ещё не заведено — переписка откроется вместе с ним");
    var b = document.getElementById("new-case");
    if (b) b.addEventListener("click", newCaseForm);
    var a = document.getElementById("ask-case");
    if (a) a.addEventListener("click", requestForm);
  }
  var myRequests = [];
  function loadRequests() {
    return sb.from("case_requests").select("*").order("created_at", { ascending: false })
      .then(function (r) { myRequests = (r.error ? [] : (r.data || [])); });
  }
  var REQ_WORDS = { "new": "на рассмотрении", accepted: "принята — дело заведено", declined: "отклонена" };
  function myRequestsMarkup() {
    if (isStaff() || !myRequests.length) return "";
    return '<h4 class="lk-h3">Ваши обращения</h4><ul class="appts">' +
      myRequests.map(function (q) {
        return '<li class="appt is-' + (q.status === "new" ? "pending" : q.status) + '">' +
          '<div><b>' + esc(q.title) + '</b><span>' + REQ_WORDS[q.status] + ' · ' +
          fmtDayYear.format(new Date(q.created_at)) + '</span></div></li>';
      }).join("") + '</ul>';
  }
  function requestForm() {
    var box = document.createElement("div");
    box.className = "modal";
    box.setAttribute("role", "dialog");
    box.setAttribute("aria-modal", "true");
    box.setAttribute("aria-label", "Описание дела");
    box.innerHTML =
      '<form class="modal__card modal__card--wide">' +
        '<h3>Опишите своё дело</h3>' +
        '<p class="modal__lead">Чем подробнее, тем точнее будет ответ. ' +
          'Обязательны только название и описание — остальное по желанию.</p>' +
        '<label class="mfield"><span>Коротко о деле</span>' +
          '<input id="rq-title" type="text" maxlength="160" required></label>' +
        '<div class="frow">' +
          '<label class="mfield"><span>Направление</span>' +
            '<select id="rq-cat">' +
              '<option value="">не знаю</option>' +
              '<option>Семейное право</option><option>Жилищные споры</option>' +
              '<option>Трудовые споры</option><option>Права потребителей</option>' +
              '<option>Военное право</option><option>Наследство</option>' +
              '<option>Взыскание долгов</option><option>Другое</option>' +
            '</select></label>' +
          '<label class="mfield"><span>Есть ли срок</span>' +
            '<input id="rq-deadline" type="text" maxlength="120"></label>' +
        '</div>' +
        '<label class="mfield"><span>Что произошло</span>' +
          '<textarea id="rq-story" rows="6" maxlength="8000" required></textarea></label>' +
        '<div class="frow">' +
          '<label class="mfield"><span>Чего хотите добиться</span>' +
            '<input id="rq-goal" type="text" maxlength="300"></label>' +
          '<label class="mfield"><span>Вторая сторона</span>' +
            '<input id="rq-opp" type="text" maxlength="200"></label>' +
        '</div>' +
        '<label class="mfield"><span>Документы</span>' +
          '<input id="rq-files" type="file" multiple ' +
          'accept=".pdf,.jpg,.jpeg,.png,.heic,.doc,.docx,.xls,.xlsx,.txt,image/*,application/pdf"></label>' +
        '<p class="form__status" id="rq-status" role="status" aria-live="polite"></p>' +
        '<div class="modal__acts">' +
          '<button type="button" class="btn btn--ghost btn--sm" id="rq-cancel">Отмена</button>' +
          '<button type="submit" class="btn btn--primary btn--sm" id="rq-go">Отправить юристу</button>' +
        '</div>' +
      '</form>';
    document.body.appendChild(box);
    box.querySelector("#rq-title").focus();
    function close() { box.remove(); document.removeEventListener("keydown", onKey); }
    function onKey(e) { if (e.key === "Escape") close(); }
    box.querySelector("#rq-cancel").addEventListener("click", close);
    box.addEventListener("mousedown", function (e) { if (e.target === box) close(); });
    document.addEventListener("keydown", onKey);
    box.querySelector("form").addEventListener("submit", function (e) {
      e.preventDefault();
      var st = box.querySelector("#rq-status");
      var go = box.querySelector("#rq-go");
      var title = box.querySelector("#rq-title").value.trim();
      var story = box.querySelector("#rq-story").value.trim();
      if (title.length < 2 || story.length < 10) {
        st.className = "form__status is-bad";
        st.textContent = "Заполните название и опишите, что произошло.";
        return;
      }
      var files = Array.prototype.slice.call(box.querySelector("#rq-files").files || []);
      var big = files.filter(function (f) { return f.size > MAX_FILE; });
      if (big.length) {
        st.className = "form__status is-bad";
        st.textContent = "Файл «" + big[0].name + "» больше 25 МБ.";
        return;
      }
      go.disabled = true;
      st.className = "form__status";
      st.textContent = "Отправляем…";
      sb.from("case_requests").insert({
        client_id: me.id,
        title: title,
        category: box.querySelector("#rq-cat").value || null,
        story: story,
        goal: box.querySelector("#rq-goal").value.trim() || null,
        opponent: box.querySelector("#rq-opp").value.trim() || null,
        deadline: box.querySelector("#rq-deadline").value.trim() || null
      }).select().single().then(function (r) {
        if (r.error) throw r.error;
        var reqId = r.data.id;
        return Promise.all(files.map(function (f) {
          var safe = f.name.replace(/[^\w.\-]+/g, "_").slice(-80);
          var path = reqId + "/" + Date.now() + "-" + safe;
          return sb.storage.from("case-docs").upload(path, f, {
            contentType: f.type || "application/octet-stream"
          }).then(function (u) {
            if (u.error) throw u.error;
            return sb.from("documents").insert({
              request_id: reqId, uploaded_by: me.id, name: f.name,
              path: path, size_bytes: f.size, mime: f.type || null
            });
          });
        }));
      }).then(function () {
        close();
        toast("Обращение отправлено. Юрист посмотрит и заведёт дело.");
        return loadRequests().then(renderNoCase);
      }).catch(function (err) {
        go.disabled = false;
        st.className = "form__status is-bad";
        st.textContent = "Не отправилось. Попробуйте ещё раз.";
        console.warn(err);
      });
    });
  }
  function closeChat(reason) {
    el.chatLog.innerHTML = '<div class="empty"><svg><use href="#i-chat"/></svg>' +
      '<b>Дело не выбрано</b><span>' + esc(reason) + '</span></div>';
    el.chatSub.textContent = reason;
    el.msg.disabled = true;
    el.send.disabled = true;
    if (el.clip) el.clip.setAttribute("aria-disabled", "true");
  }
  function statusBadge(c) {
    return '<span class="badge badge--' + esc(c.status) + '">' +
           esc(STATUS[c.status] || c.status) + '</span>';
  }
  function renderCaseList() {
    current = null;
    el.caseHead.textContent = isStaff() ? "Дела" : "Ваши дела";
    el.caseUpdated.textContent = allCases.length + " " +
      (allCases.length % 10 === 1 && allCases.length % 100 !== 11 ? "дело" :
       [2,3,4].indexOf(allCases.length % 10) >= 0 && [12,13,14].indexOf(allCases.length % 100) < 0 ? "дела" : "дел");
    el.caseBody.innerHTML =
      (isStaff()
        ? '<button class="btn btn--primary btn--block" id="new-case" style="margin-bottom:18px">Новое дело</button>'
        : '<button class="btn btn--ghost btn--block" id="ask-case" style="margin-bottom:18px">Описать ещё одно дело</button>') +
      allCases.map(function (c) {
        var who = everyone[c.client_id];
        return '<button class="caserow" data-id="' + esc(c.id) + '">' +
          '<span class="caserow__top">' +
            '<span class="caserow__no">' + esc(c.number) + '</span>' + statusBadge(c) +
          '</span>' +
          '<span class="caserow__title">' + esc(c.title) + '</span>' +
          (who ? '<span class="caserow__who">' + esc(whoName(who)) + '</span>' : '') +
        '</button>';
      }).join("");
    Array.prototype.forEach.call(el.caseBody.querySelectorAll(".caserow"), function (b) {
      b.addEventListener("click", function () {
        var c = allCases.filter(function (x) { return x.id === b.dataset.id; })[0];
        if (c) openCase(c);
      });
    });
    var nb = document.getElementById("new-case");
    if (nb) nb.addEventListener("click", newCaseForm);
    var ask = document.getElementById("ask-case");
    if (ask) ask.addEventListener("click", requestForm);
    paintUnread();
    closeChat("Выберите дело слева");
  }
  function openCase(c) {
    current = c;
    seen = Object.create(null);
    var pre = isStaff() ? Promise.resolve() : Promise.all([loadMoney(c.id), loadAppts()]);
    return pre.then(function () {
      renderCase();
      return Promise.all([loadDocs(), loadMessages()]).then(subscribe);
    });
  }
  function refreshCase() {
    renderCase();
    return loadDocs();
  }
  function renderCase() {
    var c = current;
    if (isStaff() && window.SPWorkspace) {
      armComposer(c, everyone[c.client_id]);
      return;
    }
    el.caseHead.textContent = isStaff() ? "Дело" : "Ваше дело";
    var upd = new Date(c.updated_at);
    el.caseUpdated.textContent = "Обновлено " + dayLabel(upd).toLowerCase() + " в " + fmtTime.format(upd);
    var showBack = isStaff() || allCases.length > 1;
    var who = everyone[c.client_id];
    var next = c.next_step
      ? '<dl class="nextstep"><dt>Следующий шаг</dt><dd>' + esc(c.next_step) +
        (c.next_date ? '<time>' + fmtDayYear.format(new Date(c.next_date + "T00:00:00")) + '</time>' : '') +
        '</dd></dl>'
      : "";
    el.caseBody.innerHTML =
      (showBack ? '<button class="backlink" id="back">← Все дела</button>' : '') +
      '<article class="casecard">' +
        '<p class="casecard__no">' + esc(c.number) +
          (who && isStaff() ? ' · ' + esc(whoName(who)) : '') + '</p>' +
        '<h3 class="casecard__title">' + esc(c.title) + '</h3>' +
        statusBadge(c) +
        (c.stage ? '<p style="margin-top:14px;font-size:15px;color:var(--body);line-height:1.55">' + esc(c.stage) + '</p>' : '') +
        next +
        requisites(who) +
      '</article>' +
      (isStaff() ? editorMarkup(c) : '') +
      (isStaff() ? '' : moneyBlockClient(c) + apptsBlock()) +
      '<h4 class="lk-h3">Документы</h4>' +
      '<div id="docs-wrap"></div>' +
      (isStaff() ? '' :
        '<div class="askmore">' +
          '<button type="button" class="btn btn--ghost btn--sm" id="ask-case">Описать ещё одно дело</button>' +
        '</div>');
    var back = document.getElementById("back");
    if (back) back.addEventListener("click", renderCaseList);
    if (isStaff()) wireEditor(c);
    var bookBtn = document.getElementById("book-open");
    if (bookBtn) bookBtn.addEventListener("click", bookingForm);
    var askBtn = document.getElementById("ask-case");
    if (askBtn) askBtn.addEventListener("click", requestForm);
    el.caseBody.querySelectorAll("[data-cancel]").forEach(function (b) {
      b.addEventListener("click", function () {
        sb.from("appointments").update({ status: "cancelled" }).eq("id", b.dataset.cancel)
          .then(function (r) {
            if (r.error) { toast("Не удалось отменить: " + r.error.message, true); return; }
            toast("Запись отменена");
            return loadAppts().then(refreshCase);
          });
      });
    });
    armComposer(c, who);
  }
  function armComposer(c, who) {
    el.msg.disabled = false;
    if (el.clip) el.clip.removeAttribute("aria-disabled");
    el.send.disabled = el.msg.value.trim().length === 0;
    el.msg.placeholder = "Напишите сообщение…";
    el.chatSub.textContent = c.number + (who && isStaff() ? " · " + (who.full_name || "") : "") +
      " · отвечаем в рабочее время, срочное — по телефону";
  }
  var myPayments = [];
  var myAppts = [];
  function loadMoney(caseId) {
    return sb.from("payments").select("*").eq("case_id", caseId)
      .order("at", { ascending: false })
      .then(function (r) {
        myPayments = (r.error ? [] : (r.data || []));
      });
  }
  function loadAppts() {
    var since = new Date(Date.now() - 7 * 86400000).toISOString();
    return sb.from("appointments").select("*").gte("starts_at", since)
      .order("starts_at", { ascending: true })
      .then(function (r) {
        myAppts = (r.error ? [] : (r.data || []));
      });
  }
  var fmtRub = new Intl.NumberFormat("ru-RU", {
    style: "currency", currency: "RUB", maximumFractionDigits: 0
  });
  function moneyBlockClient(c) {
    var total = Number(c.amount || 0);
    if (!total && !myPayments.length) return "";
    var paid = myPayments.reduce(function (s2, p) { return s2 + Number(p.amount || 0); }, 0);
    var left = total - paid;
    return '<h4 class="lk-h3">Оплата</h4>' +
      '<div class="paycard">' +
        (total ? '<p><span>По договору</span><b>' + fmtRub.format(total) + '</b></p>' : '') +
        '<p><span>Получено</span><b>' + (paid ? fmtRub.format(paid) : "—") + '</b></p>' +
        (total
          ? '<p><span>Остаток</span><b class="' + (left > 0 ? "is-warn" : "is-ok") + '">' +
            (left > 0 ? fmtRub.format(left) : "рассчитано полностью") + '</b></p>'
          : '') +
        '<p class="paycard__note">Государственная пошлина и расходы на экспертизы ' +
          'в стоимость услуг не входят.</p>' +
      '</div>';
  }
  var APPT_WORDS = {
    pending: "ждёт подтверждения",
    confirmed: "подтверждена",
    declined: "отклонена",
    cancelled: "отменена"
  };
  var FORMAT_WORDS = { office: "в офисе", video: "видеосвязь", phone: "по телефону" };
  function apptsBlock() {
    var live = myAppts.filter(function (a) { return a.status !== "declined" && a.status !== "cancelled"; });
    var rows = live.map(function (a) {
      var d = new Date(a.starts_at);
      var soon = d.getTime() - Date.now() > 2 * 3600000;
      return '<li class="appt is-' + a.status + '">' +
        '<div><b>' + fmtDayYear.format(d) + ', ' + fmtTime.format(d) + '</b>' +
          '<span>' + APPT_WORDS[a.status] +
            (a.format ? " · " + FORMAT_WORDS[a.format] : "") + '</span></div>' +
        (soon ? '<button type="button" class="linklike" data-cancel="' + a.id + '">Отменить</button>' : '') +
      '</li>';
    }).join("");
    return '<h4 class="lk-h3">Встречи</h4>' +
      (rows ? '<ul class="appts">' + rows + '</ul>'
            : '<p class="lk-empty">Встреч не назначено.</p>') +
      '<button type="button" class="btn btn--ghost btn--sm" id="book-open">Записаться на приём</button>';
  }
  function bookingForm() {
    var box = document.createElement("div");
    box.className = "modal";
    box.setAttribute("role", "dialog");
    box.setAttribute("aria-modal", "true");
    box.setAttribute("aria-label", "Запись на приём");
    box.innerHTML =
      '<div class="modal__card">' +
        '<h3>Записаться на приём</h3>' +
        '<p class="modal__lead">Выберите свободное время. Юрист подтвердит запись — ' +
          'вы увидите это в разделе «Встречи». Записаться и отменить можно не позже ' +
          'чем за два часа до начала.</p>' +
        '<div id="bk-list"><p class="lk-empty">Загружаем свободное время…</p></div>' +
        '<label class="mfield"><span>С чем придёте (необязательно)</span>' +
          '<input id="bk-topic" type="text" maxlength="160" placeholder="Раздел имущества"></label>' +
        '<p class="form__status" id="bk-status" role="status" aria-live="polite"></p>' +
        '<div class="modal__acts">' +
          '<button type="button" class="btn btn--ghost btn--sm" id="bk-cancel">Закрыть</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(box);
    function close() {
      box.remove();
      document.removeEventListener("keydown", onKey);
    }
    function onKey(e) { if (e.key === "Escape") close(); }
    box.querySelector("#bk-cancel").addEventListener("click", close);
    box.addEventListener("mousedown", function (e) { if (e.target === box) close(); });
    document.addEventListener("keydown", onKey);
    var from = new Date().toISOString();
    var to = new Date(Date.now() + 14 * 86400000).toISOString();
    sb.rpc("free_slots", { p_from: from, p_to: to }).then(function (r) {
      var list = box.querySelector("#bk-list");
      if (r.error) {
        list.innerHTML = '<p class="lk-empty">Не удалось загрузить свободное время.</p>';
        return;
      }
      var slots = r.data || [];
      if (!slots.length) {
        list.innerHTML = '<p class="lk-empty">Свободного времени на ближайшие две недели нет. ' +
          'Напишите в переписке — подберём время.</p>';
        return;
      }
      var byDay = {};
      slots.forEach(function (sl) {
        var d = new Date(sl.starts_at);
        var key = d.toDateString();
        (byDay[key] = byDay[key] || []).push(sl);
      });
      list.innerHTML = Object.keys(byDay).map(function (key) {
        var day = new Date(byDay[key][0].starts_at);
        return '<div class="bkday"><h5>' + fmtDayYear.format(day) + '</h5><div class="bkslots">' +
          byDay[key].map(function (sl) {
            return '<button type="button" class="bkslot" data-s="' + sl.starts_at +
                   '" data-e="' + sl.ends_at + '">' + fmtTime.format(new Date(sl.starts_at)) + '</button>';
          }).join("") + '</div></div>';
      }).join("");
    });
    box.addEventListener("click", function (e) {
      var b = e.target.closest(".bkslot");
      if (!b) return;
      var st = box.querySelector("#bk-status");
      st.className = "form__status";
      st.textContent = "Записываем…";
      sb.from("appointments").insert({
        client_id: me.id,
        case_id: current ? current.id : null,
        starts_at: b.dataset.s,
        ends_at: b.dataset.e,
        topic: box.querySelector("#bk-topic").value.trim() || null,
        created_by: me.id
      }).then(function (r) {
        if (r.error) {
          st.className = "form__status is-bad";
          st.textContent = String(r.error.code) === "23P01"
            ? "Это время только что заняли. Выберите другое."
            : "Не получилось записаться. Попробуйте другое время.";
          return;
        }
        close();
        toast("Заявка отправлена. Юрист подтвердит время.");
        return loadAppts().then(refreshCase);
      });
    });
  }
  var OFFICE = null;   // строка settings, грузится один раз
  function loadOffice() {
    if (OFFICE) return Promise.resolve(OFFICE);
    return sb.from("settings").select("*").eq("id", 1).maybeSingle().then(function (r) {
      OFFICE = (r.error ? null : r.data) || { work_hours: "", address: "", phone: "", email: "" };
      return OFFICE;
    });
  }
  function profileForm() {
    var box = document.createElement("div");
    box.className = "modal";
    box.setAttribute("role", "dialog");
    box.setAttribute("aria-modal", "true");
    box.setAttribute("aria-label", "Профиль");
    box.innerHTML = '<div class="modal__card"><p class="lk-empty">Загружаем…</p></div>';
    document.body.appendChild(box);
    function close() { box.remove(); document.removeEventListener("keydown", onKey); }
    function onKey(e) { if (e.key === "Escape") close(); }
    box.addEventListener("mousedown", function (e) { if (e.target === box) close(); });
    document.addEventListener("keydown", onKey);
    loadOffice().then(function () {
      box.innerHTML =
        '<div class="modal__card modal__card--wide">' +
          '<h3>Профиль</h3>' +
          '<div class="prof">' +
            '<div class="frow">' +
              '<label class="mfield"><span>Имя</span>' +
                '<input id="me-name" type="text" maxlength="120" value="' + esc(me.full_name || "") + '"></label>' +
              '<label class="mfield"><span>Телефон</span>' +
                '<input id="me-phone" type="tel" value="' + esc(me.phone || "") + '"></label>' +
            '</div>' +
            '<div class="frow">' +
              '<label class="mfield"><span>Почта</span>' +
                '<input id="me-mail" type="email" value="' + esc(me.email || "") + '"></label>' +
              '<label class="mfield"><span>Мессенджер</span>' +
                '<input id="me-msgr" type="text" value="' + esc(me.messenger || "") + '"></label>' +
            '</div>' +
          '</div>' +
          (isStaff()
            ? '<h4 class="prof__h">Контора</h4>' +
              '<div class="prof">' +
                '<div class="frow">' +
                  '<label class="mfield"><span>Часы приёма</span>' +
                    '<input id="of-hours" type="text" value="' + esc(OFFICE.work_hours || "") + '"></label>' +
                  '<label class="mfield"><span>Телефон конторы</span>' +
                    '<input id="of-phone" type="tel" value="' + esc(OFFICE.phone || "") + '"></label>' +
                '</div>' +
                '<div class="frow">' +
                  '<label class="mfield"><span>Адрес</span>' +
                    '<input id="of-addr" type="text" value="' + esc(OFFICE.address || "") + '"></label>' +
                  '<label class="mfield"><span>Почта конторы</span>' +
                    '<input id="of-mail" type="email" value="' + esc(OFFICE.email || "") + '"></label>' +
                '</div>' +
              '</div>'
            : "") +
          '<div class="prof__acts">' +
            (me.role !== "assistant" || can("pwd")
              ? '<button type="button" class="btn btn--ghost btn--sm" id="me-pass">Изменить пароль</button>'
              : '') +
            '<button type="button" class="btn btn--dim btn--sm" id="me-out">Выйти из кабинета</button>' +
            '<button type="button" class="btn btn--primary btn--sm" id="me-close">Готово</button>' +
          '</div>' +
        '</div>';
      box.querySelector("#me-close").addEventListener("click", close);
      box.querySelector("#me-out").addEventListener("click", signOutToSite);
      var passBtn = box.querySelector("#me-pass");
      if (passBtn) passBtn.addEventListener("click", function () {
        close();
        passwordForm();
      });
      [["me-name", "full_name"], ["me-phone", "phone"], ["me-mail", "email"], ["me-msgr", "messenger"]]
        .forEach(function (pair) {
          var input = box.querySelector("#" + pair[0]);
          input.addEventListener("change", function () {
            var val = input.value.trim() || null;
            if (me[pair[1]] === val) return;
            var was = me[pair[1]];
            me[pair[1]] = val;
            var patch = {}; patch[pair[1]] = val;
            sb.from("profiles").update(patch).eq("id", me.id).then(function (r) {
              if (r.error) {
                me[pair[1]] = was; input.value = was || "";
                toast("Не сохранилось: " + r.error.message, true);
                return;
              }
              if (pair[1] === "full_name") el.whoName.textContent = val || "";
            });
          });
        });
      if (isStaff()) {
        [["of-hours", "work_hours"], ["of-phone", "phone"], ["of-addr", "address"], ["of-mail", "email"]]
          .forEach(function (pair) {
            var input = box.querySelector("#" + pair[0]);
            input.addEventListener("change", function () {
              var val = input.value.trim();
              if (OFFICE[pair[1]] === val) return;
              OFFICE[pair[1]] = val;
              var patch = {}; patch[pair[1]] = val; patch.updated_at = new Date().toISOString();
              sb.from("settings").update(patch).eq("id", 1).then(function (r) {
                if (r.error) toast("Не сохранилось: " + r.error.message, true);
              });
            });
          });
      }
    });
  }
  function passwordForm() {
    var box = document.createElement("div");
    box.className = "modal";
    box.setAttribute("role", "dialog");
    box.setAttribute("aria-modal", "true");
    box.setAttribute("aria-label", "Смена пароля");
    box.innerHTML =
      '<form class="modal__card">' +
        '<h3>Смена пароля</h3>' +
        '<label class="mfield"><span>Текущий пароль</span>' +
          '<input id="pw-old" type="password" autocomplete="current-password" required></label>' +
        '<label class="mfield"><span>Новый пароль</span>' +
          '<input id="pw-new" type="password" autocomplete="new-password" minlength="6" required ' +
          'placeholder="Не короче 6 знаков"></label>' +
        '<label class="mfield"><span>Ещё раз</span>' +
          '<input id="pw-new2" type="password" autocomplete="new-password" minlength="6" required></label>' +
        '<p class="form__status" id="pw-status" role="status" aria-live="polite"></p>' +
        '<div class="modal__acts">' +
          '<button type="button" class="btn btn--ghost btn--sm" id="pw-cancel">Отмена</button>' +
          '<button type="submit" class="btn btn--primary btn--sm" id="pw-go">Сменить</button>' +
        '</div>' +
      '</form>';
    document.body.appendChild(box);
    box.querySelector("#pw-old").focus();
    function close() {
      box.remove();
      document.removeEventListener("keydown", onKey);
    }
    function onKey(e) { if (e.key === "Escape") close(); }
    box.querySelector("#pw-cancel").addEventListener("click", close);
    box.addEventListener("mousedown", function (e) { if (e.target === box) close(); });
    document.addEventListener("keydown", onKey);
    box.querySelector("form").addEventListener("submit", function (e) {
      e.preventDefault();
      var st = box.querySelector("#pw-status");
      var go = box.querySelector("#pw-go");
      var oldp = box.querySelector("#pw-old").value;
      var np = box.querySelector("#pw-new").value;
      var np2 = box.querySelector("#pw-new2").value;
      st.className = "form__status";
      if (np.length < 6) { st.className = "form__status is-bad"; st.textContent = "Новый пароль короче шести знаков."; return; }
      if (np !== np2) { st.className = "form__status is-bad"; st.textContent = "Новые пароли не совпадают."; return; }
      if (np === oldp) { st.className = "form__status is-bad"; st.textContent = "Новый пароль совпадает со старым."; return; }
      st.textContent = "Меняем…";
      go.disabled = true;
      sb.auth.getUser().then(function (u) {
        var mail = u.data && u.data.user && u.data.user.email;
        if (!mail) throw new Error("нет учётной записи");
        return sb.auth.signInWithPassword({ email: mail, password: oldp });
      }).then(function (r) {
        if (r.error) {
          st.className = "form__status is-bad";
          st.textContent = "Текущий пароль не подошёл.";
          go.disabled = false;
          return null;
        }
        return sb.auth.updateUser({ password: np });
      }).then(function (r) {
        if (!r) return;
        go.disabled = false;
        if (r.error) {
          st.className = "form__status is-bad";
          st.textContent = "Не удалось сменить: " + r.error.message;
          return;
        }
        close();
        toast("Пароль изменён");
      }).catch(function (err) {
        go.disabled = false;
        st.className = "form__status is-bad";
        st.textContent = "Не получилось. Попробуйте позже.";
        console.warn(err);
      });
    });
  }
  function statusOptions(sel) {
    return Object.keys(STATUS).map(function (k) {
      return '<option value="' + k + '"' + (k === sel ? " selected" : "") + '>' + STATUS[k] + '</option>';
    }).join("");
  }
  function editorMarkup(c) {
    return '<details class="editor"><summary>Изменить дело</summary><div class="editor__body">' +
      '<div class="field"><label for="e-status">Состояние</label>' +
        '<select id="e-status">' + statusOptions(c.status) + '</select></div>' +
      '<div class="field"><label for="e-stage">Что сейчас происходит</label>' +
        '<textarea id="e-stage" rows="3">' + esc(c.stage || "") + '</textarea></div>' +
      '<div class="field"><label for="e-next">Следующий шаг</label>' +
        '<input id="e-next" type="text" value="' + esc(c.next_step || "") + '"></div>' +
      '<div class="field"><label for="e-date">Дата шага</label>' +
        '<input id="e-date" type="date" value="' + esc(c.next_date || "") + '"></div>' +
      '<button class="btn btn--primary btn--block" id="e-save" style="margin-top:16px">Сохранить</button>' +
      '</div></details>';
  }
  function wireEditor(c) {
    var save = document.getElementById("e-save");
    if (!save) return;
    save.addEventListener("click", function () {
      save.setAttribute("aria-disabled", "true");
      save.textContent = "Сохраняем…";
      var patch = {
        status: document.getElementById("e-status").value,
        stage: document.getElementById("e-stage").value.trim(),
        next_step: document.getElementById("e-next").value.trim() || null,
        next_date: document.getElementById("e-date").value || null
      };
      sb.from("cases").update(patch).eq("id", c.id).select().single()
        .then(function (r) {
          if (r.error) throw r.error;
          current = r.data;
          allCases = allCases.map(function (x) { return x.id === r.data.id ? r.data : x; });
          renderCase();
          return Promise.all([loadDocs()]);
        })
        .then(function () { toast("Дело обновлено. Доверитель уже видит изменения."); })
        .catch(function (err) {
          console.warn(err);
          toast("Сохранить не получилось. Попробуйте ещё раз.", true);
          save.removeAttribute("aria-disabled");
          save.textContent = "Сохранить";
        });
    });
  }
  function newCaseForm() {
    var clients = Object.keys(everyone)
      .map(function (k) { return everyone[k]; })
      .filter(function (p) { return p.role === "client"; });
    if (!clients.length) {
      toast("Нет ни одного доверителя. Сначала он должен зарегистрироваться.", true);
      return;
    }
    el.caseBody.innerHTML =
      '<button class="backlink" id="back">← Все дела</button>' +
      '<h3 style="font-size:1.2rem;margin-bottom:16px">Новое дело</h3>' +
      '<div class="field"><label for="n-client">Доверитель</label><select id="n-client">' +
        clients.map(function (p) {
          return '<option value="' + esc(p.id) + '">' + esc(p.full_name || "без имени") + '</option>';
        }).join("") + '</select></div>' +
      '<div class="field" style="margin-top:12px"><label for="n-title">Суть дела</label>' +
        '<input id="n-title" type="text" placeholder="Обжалование заключения ВВК"></div>' +
      '<div class="field" style="margin-top:12px"><label for="n-cat">Направление</label>' +
        '<input id="n-cat" type="text" placeholder="Военное право"></div>' +
      '<div class="field" style="margin-top:12px"><label for="n-stage">Что сейчас происходит</label>' +
        '<textarea id="n-stage" rows="3" placeholder="Изучаем документы"></textarea></div>' +
      '<button class="btn btn--primary btn--block" id="n-save" style="margin-top:18px">Завести дело</button>';
    document.getElementById("back").addEventListener("click", renderCaseList);
    document.getElementById("n-save").addEventListener("click", function () {
      var title = document.getElementById("n-title").value.trim();
      if (title.length < 3) { toast("Опишите суть дела — хотя бы парой слов.", true); return; }
      var year = new Date().getFullYear();
      var maxN = allCases.reduce(function (m, c) {
        var mm = /-(\d+)$/.exec(c.number || "");
        return mm ? Math.max(m, parseInt(mm[1], 10)) : m;
      }, 0);
      var number = "СП-" + year + "-" + String(maxN + 1).padStart(3, "0");
      sb.from("cases").insert({
        client_id: document.getElementById("n-client").value,
        lawyer_id: me.id,
        number: number,
        title: title,
        category: document.getElementById("n-cat").value.trim(),
        stage: document.getElementById("n-stage").value.trim(),
        status: "new"
      }).select().single()
        .then(function (r) {
          if (r.error) throw r.error;
          allCases.unshift(r.data);
          toast("Дело " + number + " заведено.");
          return openCase(r.data);
        })
        .catch(function (err) {
          console.warn(err);
          toast("Завести дело не получилось.", true);
        });
    });
  }
  function loadDocs() {
    if (!current) return Promise.resolve();
    return sb.from("documents").select("*").eq("case_id", current.id)
      .order("created_at", { ascending: false })
      .then(function (r) {
        var wrap = document.getElementById("docs-wrap");
        if (!wrap) return;
        if (r.error) { wrap.innerHTML = '<p style="font-size:14px;color:var(--faint)">Не удалось загрузить документы.</p>'; return; }
        var rows = r.data || [];
        rows.forEach(function (d) { docsById[d.id] = d; });
        if (!rows.length) {
          wrap.innerHTML = '<p style="font-size:14px;color:var(--muted)">Пока пусто. ' +
            'Готовые документы появятся здесь, а прислать своё можно скрепкой в переписке.</p>';
          return;
        }
        function docCard(d) {
          return '<div class="doc">' +
            '<span class="doc__ico">' + esc(extOf(d.name)) + '</span>' +
            '<div><div class="doc__name">' + esc(d.name) + '</div>' +
            '<div class="doc__meta">' + fmtDayYear.format(new Date(d.created_at)) +
            (d.size_bytes ? " · " + humanSize(d.size_bytes) : "") + '</div></div>' +
            '<button class="doc__get" data-path="' + esc(d.path) + '" data-name="' + esc(d.name) + '" ' +
            'aria-label="Скачать ' + esc(d.name) + '"><svg width="17" height="17"><use href="#i-dl"/></svg></button>' +
          '</div>';
        }
        var fromClient = rows.filter(function (d) { return d.uploaded_by === current.client_id; });
        var fromUs     = rows.filter(function (d) { return d.uploaded_by !== current.client_id; });
        function group(title, list) {
          if (!list.length) return "";
          return '<div class="docgroup"><h5>' + title + ' <i>' + list.length + '</i></h5>' +
                 list.map(docCard).join("") + '</div>';
        }
        wrap.innerHTML =
          group(isStaff() ? "От доверителя" : "Ваши", fromClient) +
          group(isStaff() ? "Наши" : "От юриста", fromUs);
        Array.prototype.forEach.call(wrap.querySelectorAll(".doc__get"), function (b) {
          b.addEventListener("click", function () { download(b.dataset.path, b.dataset.name); });
        });
      });
  }
  function download(path, name) {
    sb.storage.from("case-docs").createSignedUrl(path, 60, { download: name })
      .then(function (r) {
        if (r.error || !r.data) throw r.error || new Error("нет ссылки");
        window.open(r.data.signedUrl, "_blank", "noopener");
      })
      .catch(function () { toast("Не удалось открыть файл. Попробуйте ещё раз.", true); });
  }
  var MAX_FILE = 25 * 1024 * 1024;
  function sendFile(file) {
    if (!current || !file) return;
    if (file.size > MAX_FILE) {
      toast("Файл больше 25 МБ. Пришлите частями или в Telegram.", true);
      return;
    }
    var draft = {
      body: file.name, sender_id: me.id, created_at: new Date().toISOString(),
      pending: true, document_id: "pending"
    };
    var node = addMessage(draft, true);
    scrollChat(true);
    var safe = file.name.replace(/[^\w.\-]+/g, "_").slice(-80);
    var path = current.id + "/" + Date.now() + "-" + safe;
    sb.storage.from("case-docs").upload(path, file, {
      contentType: file.type || "application/octet-stream"
    })
      .then(function (r) {
        if (r.error) throw r.error;
        return sb.from("documents").insert({
          case_id: current.id, uploaded_by: me.id, name: file.name,
          path: path, size_bytes: file.size, mime: file.type || null
        }).select().single();
      })
      .then(function (r) {
        if (r.error) throw r.error;
        docsById[r.data.id] = r.data;
        loadDocs();
        return sb.from("messages").insert({
          case_id: current.id, sender_id: me.id,
          body: file.name, document_id: r.data.id
        }).select().single();
      })
      .then(function (r) {
        if (r.error) throw r.error;
        if (node) {
          node.classList.remove("msg--pending");
          node.dataset.id = r.data.id;
          seen[r.data.id] = true;
          node.dataset.doc = r.data.document_id;
          var t = node.querySelector(".filecard__meta");
          if (t) t.textContent = humanSize(file.size);
        }
        return loadDocs();
      })
      .catch(function (err) {
        console.warn(err);
        if (node) {
          var t = node.querySelector(".filecard__meta");
          if (t) t.textContent = "не отправлено";
        }
        var m = String(err && err.message || "");
        toast(/mime|not supported/i.test(m)
          ? "Такой тип файла не принимается. PDF, фото или Word."
          : "Отправить файл не получилось. Попробуйте ещё раз.", true);
      });
  }
  if (el.clip && el.chatFile) {
    el.clip.addEventListener("click", function () { el.chatFile.click(); });
    el.chatFile.addEventListener("change", function () {
      if (el.chatFile.files && el.chatFile.files[0]) sendFile(el.chatFile.files[0]);
      el.chatFile.value = "";
    });
  }
  ["dragenter", "dragover"].forEach(function (ev) {
    el.chatLog.addEventListener(ev, function (e) {
      if (!current) return;
      e.preventDefault();
      el.chatLog.classList.add("is-drop");
    });
  });
  ["dragleave", "drop"].forEach(function (ev) {
    el.chatLog.addEventListener(ev, function (e) {
      e.preventDefault();
      el.chatLog.classList.remove("is-drop");
    });
  });
  el.chatLog.addEventListener("drop", function (e) {
    if (e.dataTransfer && e.dataTransfer.files[0]) sendFile(e.dataTransfer.files[0]);
  });
  function loadMessages() {
    if (!current) return Promise.resolve();
    return sb.from("messages").select("*").eq("case_id", current.id)
      .order("created_at", { ascending: true }).limit(500)
      .then(function (r) {
        el.chatLog.innerHTML = "";
        seen = Object.create(null);
        if (r.error) {
          el.chatLog.innerHTML = '<div class="empty"><b>Переписка не загрузилась</b>' +
            '<span>Обновите страницу. Если не помогает — позвоните юристу.</span></div>';
          return;
        }
        var rows = r.data || [];
        if (!rows.length) {
          el.chatLog.innerHTML =
            '<div class="empty">' +
              '<svg><use href="#i-chat"/></svg>' +
              '<b>Переписки пока нет</b>' +
              '<span>Напишите первым: что случилось, какие сроки поджимают, ' +
              'какие документы у вас на руках.</span>' +
            '</div>';
          return;
        }
        var firstNew = -1;
        for (var i = 0; i < rows.length; i++) {
          if (!rows[i].read_at && rows[i].sender_id !== me.id) { firstNew = i; break; }
        }
        var lastDay = "";
        rows.forEach(function (m, i) {
          var d = new Date(m.created_at);
          var label = dayLabel(d);
          if (label !== lastDay) { addDay(label); lastDay = label; }
          if (i === firstNew) addDay("Непрочитанные", true);
          addMessage(m, false);
        });
        var mark = el.chatLog.querySelector(".day--new");
        if (mark) mark.scrollIntoView({ block: "center" });
        else scrollChat(false);
        if (chatVisible()) markRead(current.id);
      });
  }
  function addDay(label, isNew) {
    var s = document.createElement("span");
    s.className = "day" + (isNew ? " day--new" : "");
    s.textContent = label;
    el.chatLog.appendChild(s);
  }
  function addMessage(m, animate) {
    if (m.id && seen[m.id]) return;
    if (m.id) seen[m.id] = true;
    var empty = el.chatLog.querySelector(".empty");
    if (empty) el.chatLog.innerHTML = "";
    var mine = m.sender_id === (me && me.id);
    var div = document.createElement("div");
    div.className = "msg " + (mine ? "msg--me" : "msg--them") + (m.pending ? " msg--pending" : "");
    if (m.id) div.dataset.id = m.id;
    if (!animate) div.style.animation = "none";
    if (m.document_id) {
      div.classList.add("msg--file");
      if (m.document_id !== "pending") div.dataset.doc = m.document_id;
      var doc = docsById[m.document_id];
      var meta = m.pending ? "отправляется…"
        : [doc && doc.size_bytes ? humanSize(doc.size_bytes) : "",
           fmtTime.format(new Date(m.created_at))].filter(Boolean).join(" · ");
      div.innerHTML =
        '<div class="filecard">' +
          '<span class="filecard__ico">' + esc(extOf(m.body)) + '</span>' +
          '<div><div class="filecard__name">' + esc(m.body) + '</div>' +
          '<div class="filecard__meta">' + esc(meta) + '</div></div>' +
          '<button type="button" class="filecard__get" aria-label="Скачать ' + esc(m.body) + '">' +
            '<svg width="17" height="17"><use href="#i-dl"/></svg></button>' +
        '</div>';
      div.querySelector(".filecard__get").addEventListener("click", function () {
        var d = docsById[div.dataset.doc];
        if (d) download(d.path, d.name);
        else toast("Файл ещё готовится — повторите через миг.", true);
      });
    } else {
      div.textContent = m.body;
      var t = document.createElement("span");
      t.className = "msg__time";
      t.textContent = m.pending ? "отправляется…" : fmtTime.format(new Date(m.created_at));
      div.appendChild(t);
    }
    el.chatLog.appendChild(div);
    return div;
  }
  function scrollChat(smooth) {
    el.chatLog.scrollTo({ top: el.chatLog.scrollHeight, behavior: smooth ? "smooth" : "auto" });
  }
  function autoGrow() {
    el.msg.style.height = "auto";
    el.msg.style.height = Math.min(el.msg.scrollHeight, 160) + "px";
    el.send.disabled = el.msg.value.trim().length === 0;
  }
  el.msg.addEventListener("input", autoGrow);
  el.msg.addEventListener("keydown", function (e) {
    if (e.key === "Enter" && !e.shiftKey && window.matchMedia("(hover: hover)").matches) {
      e.preventDefault();
      el.composer.requestSubmit();
    }
  });
  el.composer.addEventListener("submit", function (e) {
    e.preventDefault();
    var body = el.msg.value.trim();
    if (!body || !current) return;
    el.msg.value = "";
    autoGrow();
    var draft = { body: body, sender_id: me.id, created_at: new Date().toISOString(), pending: true };
    var node = addMessage(draft, true);
    scrollChat(true);
    sb.from("messages").insert({ case_id: current.id, sender_id: me.id, body: body })
      .select().single()
      .then(function (r) {
        if (r.error) throw r.error;
        if (node) {
          node.classList.remove("msg--pending");
          node.dataset.id = r.data.id;
          seen[r.data.id] = true;
          var t = node.querySelector(".msg__time");
          if (t) t.textContent = fmtTime.format(new Date(r.data.created_at));
        }
      })
      .catch(function (err) {
        console.warn(err);
        if (node) {
          node.classList.add("msg--pending");
          var t = node.querySelector(".msg__time");
          if (t) t.textContent = "не отправлено";
        }
        toast("Сообщение не ушло. Проверьте связь и повторите.", true);
      });
  });
  function subscribe() {
    if (channel) return;   // подписка одна на весь сеанс
    channel = sb.channel("messages-live")
      .on("postgres_changes", {
        event: "INSERT", schema: "public", table: "messages"
      }, function (payload) {
        var m = payload.new;
        if (m.sender_id === me.id) return;          // своё уже нарисовано
        var open = current && m.case_id === current.id;
        if (open) {
          var atBottom = el.chatLog.scrollHeight - el.chatLog.scrollTop - el.chatLog.clientHeight < 90;
          addMessage(m, true);
          if (m.document_id) loadDocs();
          if (chatVisible()) {
            sb.from("messages").update({ read_at: new Date().toISOString() })
              .eq("id", m.id).then(function () {});
            if (atBottom) scrollChat(true);
            else toast("Новое сообщение ниже");
          } else {
            unread[m.case_id] = (unread[m.case_id] || 0) + 1;
            paintUnread();
          }
        } else {
          unread[m.case_id] = (unread[m.case_id] || 0) + 1;
          paintUnread();
          toast("Новое сообщение по другому делу");
        }
      })
      .subscribe();
  }
  if (el.profileBtn) el.profileBtn.addEventListener("click", profileForm);
  var api = {
    sb: sb,
    esc: esc,
    toast: toast,
    isStaff: isStaff,
    isOwner: isOwner,
    can: can,
    fmtTime: fmtTime,
    fmtDay: fmtDay,
    fmtDayYear: fmtDayYear,
    dayLabel: dayLabel,
    humanSize: humanSize,
    whoName: whoName,
    requisites: requisites,
    me: function () { return me; },
    cases: function () { return allCases; },
    people: function () { return everyone; },
    unread: function () { return unread; },
    reload: loadCases,
    openCase: openCase,
    loadDocs: loadDocs,
    currentCaseId: function () { return current ? current.id : null; },
    chatNode: function () { return document.querySelector(".chat"); }
  };
  window.SPCabinet = api;
  sb.auth.getSession().then(function (r) {
    if (r.data && r.data.session) boot();
    else { showAuth(); prefillFromLead(); }
  }).catch(function () { showAuth(); prefillFromLead(); });
  document.addEventListener("visibilitychange", function () {
    if (!document.hidden && current && chatVisible()) markRead(current.id);
  });
  sb.auth.onAuthStateChange(function (event) {
    if (event === "SIGNED_OUT") showAuth();
  });
})();