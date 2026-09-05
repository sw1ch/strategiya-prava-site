(function () {
  "use strict";
  var LEAD_KEY = "sp.lead";
  var $  = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var header = $("#header");
  var lastStuck = null;
  function onScroll() {
    var stuck = window.scrollY > 12;
    if (stuck !== lastStuck) {
      header.classList.toggle("is-stuck", stuck);
      lastStuck = stuck;
    }
  }
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();
  var burger = $("#burger");
  var menu = $("#mobile-menu");
  function setMenu(open) {
    burger.setAttribute("aria-expanded", String(open));
    if (open) menu.hidden = false;
    requestAnimationFrame(function () { menu.classList.toggle("is-open", open); });
    document.body.classList.toggle("is-locked", open);
    if (!open) {
      setTimeout(function () { if (!menu.classList.contains("is-open")) menu.hidden = true; }, 300);
    }
  }
  burger.addEventListener("click", function () {
    setMenu(burger.getAttribute("aria-expanded") !== "true");
  });
  $$("#mobile-menu a").forEach(function (a) {
    a.addEventListener("click", function () { setMenu(false); });
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && burger.getAttribute("aria-expanded") === "true") {
      setMenu(false);
      burger.focus();
    }
  });
  var reveals = $$(".reveal");
  if (reduced || !("IntersectionObserver" in window)) {
    reveals.forEach(function (el) { el.classList.add("is-in"); });
  } else {
    var revealIO = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) {
          en.target.classList.add("is-in");
          revealIO.unobserve(en.target);
        }
      });
    }, { rootMargin: "0px 0px -8% 0px", threshold: 0.06 });
    reveals.forEach(function (el) { revealIO.observe(el); });
  }
  var navLinks = {};
  var sections = [];
  $$('.nav__link[href^="#"]').forEach(function (a) {
    var id = a.getAttribute("href").slice(1);
    var el = id && document.getElementById(id);
    if (!el) return;
    navLinks[id] = a;
    sections.push(el);
  });
  if ("IntersectionObserver" in window && sections.length) {
    var current = null;
    var navIO = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        var id = en.target.id;
        if (id === current) return;
        if (current && navLinks[current]) navLinks[current].classList.remove("is-current");
        if (navLinks[id]) navLinks[id].classList.add("is-current");
        current = id;
      });
    }, { rootMargin: "-45% 0px -50% 0px" });
    sections.forEach(function (s) { navIO.observe(s); });
  }
  var ticker = $("#ticker");
  if (ticker && !reduced) {
    var words = [
      "алименты", "раздел имущества", "обжалование ВВК", "возврат денег",
      "споры с УК", "незаконное увольнение", "выплаты военнослужащим",
      "определение места жительства детей"
    ];
    var wi = 0, ci = words[0].length, typing = false;
    function tick() {
      if (typing) {
        ci++;
      } else {
        ci--;
        if (ci <= 0) { ci = 0; typing = true; wi = (wi + 1) % words.length; }
      }
      var word = words[wi];
      if (ci > word.length) ci = word.length;
      ticker.textContent = word.slice(0, ci) || "\u00a0";
      if (typing && ci >= word.length) {
        typing = false;                 // допечатали: держим паузу, потом стираем
        setTimeout(tick, 2200);
        return;
      }
      setTimeout(tick, typing ? 55 : 26);
    }
    setTimeout(tick, 2200);
  }
  if (window.matchMedia("(hover: hover)").matches) {
    $$(".tile").forEach(function (tile) {
      tile.addEventListener("pointermove", function (e) {
        var r = tile.getBoundingClientRect();
        tile.style.setProperty("--mx", (e.clientX - r.left) + "px");
        tile.style.setProperty("--my", (e.clientY - r.top) + "px");
      }, { passive: true });
    });
  }
  var form = $("#lead-form");
  var status = $("#lead-status");
  var submit = $("#lead-submit");
  function fieldOf(input) { return input.closest(".field"); }
  function markInvalid(input, bad) {
    var f = fieldOf(input);
    if (!f) return;
    if (bad) f.setAttribute("data-invalid", "true");
    else f.removeAttribute("data-invalid");
    input.setAttribute("aria-invalid", bad ? "true" : "false");
  }
  function digits(s) { return (s || "").replace(/\D/g, ""); }
  function validate() {
    var bad = [];
    var name = $("#f-name"), phone = $("#f-phone"), mail = $("#f-mail"),
        text = $("#f-text"), agree = $("#f-agree");
    var nameBad = name.value.trim().length < 2;
    markInvalid(name, nameBad); if (nameBad) bad.push(name);
    var hasPhone = digits(phone.value).length >= 10;
    var hasMail = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(mail.value.trim());
    var phoneBad = phone.value.trim() !== "" && !hasPhone;
    markInvalid(phone, phoneBad); if (phoneBad) bad.push(phone);
    var mailBad = mail.value.trim() !== "" && !hasMail;
    markInvalid(mail, mailBad); if (mailBad) bad.push(mail);
    if (!hasPhone && !hasMail && !phoneBad && !mailBad) {
      markInvalid(phone, true);
      fieldOf(phone).querySelector(".field__error").textContent =
        "Оставьте телефон или почту — иначе мы не сможем ответить.";
      bad.push(phone);
    }
    var textBad = text.value.trim().length < 10;
    markInvalid(text, textBad); if (textBad) bad.push(text);
    var agreeBad = !agree.checked;
    markInvalid(agree, agreeBad); if (agreeBad) bad.push(agree);
    return bad;
  }
  if (form) {
    $$("#lead-form input, #lead-form textarea").forEach(function (el) {
      el.addEventListener("input", function () { markInvalid(el, false); });
      el.addEventListener("change", function () { markInvalid(el, false); });
    });
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      status.className = "form__status";
      status.textContent = "";
      var bad = validate();
      if (bad.length) {
        bad[0].focus();
        status.className = "form__status is-err";
        status.textContent = "Проверьте отмеченные поля.";
        return;
      }
      var lead = {
        name: $("#f-name").value.trim(),
        phone: $("#f-phone").value.trim(),
        email: $("#f-mail").value.trim(),
        topic: $("#f-topic").value,
        message: $("#f-text").value.trim(),
        at: Date.now()
      };
      try {
        localStorage.setItem(LEAD_KEY, JSON.stringify(lead));
      } catch (err) {
        status.className = "form__status is-err";
        status.innerHTML = "Браузер запретил сохранить обращение (приватный режим). " +
          'Позвоните — <a href="tel:+79647330046" style="color:inherit;text-decoration:underline">8 (964) 733-00-46</a>.';
        return;
      }
      form.hidden = true;
      var done = document.createElement("div");
      done.className = "leaddone";
      done.innerHTML =
        '<h3>Обращение сохранено</h3>' +
        '<p>Остался один шаг: заведите кабинет. Обращение уйдёт юристу сразу ' +
        'после этого, а ответ и документы будут приходить туда же — не в почту ' +
        'и не в мессенджер.</p>' +
        '<p class="leaddone__acts">' +
          '<a class="btn btn--primary" href="lk/index.html?lead=1">Завести кабинет и отправить</a>' +
          '<a class="btn btn--ghost" href="lk/index.html?lead=1">У меня уже есть кабинет</a>' +
        '</p>' +
        '<p class="leaddone__note">Если кабинет заводить не хотите — позвоните ' +
        '<a href="tel:+79647330046">8 (964) 733-00-46</a>, обращение примем по телефону.</p>';
      form.parentNode.insertBefore(done, form.nextSibling);
      done.scrollIntoView({ block: "center", behavior: "smooth" });
    });
  }
  var AUDIENCE_KEY = "sp-audience";
  function readAudience() {
    try { return localStorage.getItem(AUDIENCE_KEY); } catch (err) { return null; }
  }
  function rememberAudience(value) {
    try { localStorage.setItem(AUDIENCE_KEY, value); } catch (err) {}
  }
  $$("[data-audience]").forEach(function (el) {
    el.addEventListener("click", function () {
      rememberAudience(el.getAttribute("data-audience"));
    });
  });
  var pick = $("#pick");
  if (pick && !readAudience() && !location.hash) {
    var pickCard = $(".pick__card", pick);
    var pickOpener = null;
    var pickFocusable = function () {
      return $$("a[href], button", pickCard);
    };
    var closePick = function () {
      pick.classList.remove("is-open");
      document.removeEventListener("keydown", onPickKey, true);
      document.body.classList.remove("is-locked");
      setTimeout(function () {
        if (!pick.classList.contains("is-open")) pick.hidden = true;
      }, 340);
      if (pickOpener && pickOpener.focus) pickOpener.focus();
    };
    var onPickKey = function (e) {
      if (e.key === "Escape") { e.preventDefault(); closePick(); return; }
      if (e.key !== "Tab") return;
      var list = pickFocusable();
      if (!list.length) return;
      var first = list[0], last = list[list.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    $$("[data-pick-close]", pick).forEach(function (el) {
      el.addEventListener("click", closePick);
    });
    var openPick = function () {
      if (readAudience()) return;              // мог успеть нажать переключатель
      pickOpener = document.activeElement;
      pick.hidden = false;
      document.body.classList.add("is-locked");
      void pick.offsetWidth;
      pick.classList.add("is-open");
      var list = pickFocusable();
      var target = list[1] || list[0];
      if (target) target.focus({ preventScroll: true });
      document.addEventListener("keydown", onPickKey, true);
    };
    var schedulePick = function () {
      if (document.visibilityState !== "visible") {
        document.addEventListener("visibilitychange", schedulePick, { once: true });
        return;
      }
      setTimeout(openPick, reduced ? 0 : 700);
    };
    schedulePick();
  }
  var canvas = $("#scales");
  function stageVisible() {
    return !!canvas && canvas.getBoundingClientRect().width > 0;
  }
  function startScales() {
    if (!canvas || !stageVisible()) return false;
    var stage = canvas.parentElement;
    var ok = false;
    if (typeof window.initScales === "function") {
      try { ok = window.initScales(canvas) !== false; }
      catch (err) {
        console.warn("scales:", err);
        ok = false;
      }
    }
    return ok;
  }
  function whenQuiet(run) {
    var done = false;
    function once() { if (!done) { done = true; run(); } }
    function go() {
      requestAnimationFrame(function () { requestAnimationFrame(once); });
      setTimeout(once, 1200);
    }
    if (document.readyState === "complete") setTimeout(go, 120);
    else window.addEventListener("load", function () { setTimeout(go, 120); }, { once: true });
  }
  if (canvas && stageVisible()) {
    whenQuiet(startScales);
  } else if (canvas) {
    var lateTimer = 0;
    window.addEventListener("resize", function once() {
      clearTimeout(lateTimer);
      lateTimer = setTimeout(function () {
        if (!stageVisible() || typeof window.initScales !== "function") return;
        window.removeEventListener("resize", once);
        try {
          if (window.initScales(canvas) === false) {
            canvas.parentElement.classList.add("is-fallback");
          }
        } catch (err) { console.warn("scales:", err); }
      }, 200);
    }, { passive: true });
  }
})();