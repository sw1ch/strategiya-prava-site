(function () {
  "use strict";
  var A = null;          // то, что отдал кабинет
  var root = null;       // корень рабочего места
  var view = null;       // область, которую перерисовываем
  var section = "board"; // board | people | cal
  var openId = null;     // открытое дело
  var seq = 0;
  var q = "";            // строка поиска
  var urgentOnly = false; // доска показывает только срочные
  var STAGES = [
    { key: "lead",     label: "Обращение",             client: "Приняли обращение",
      hint: "Написал или позвонил, сути ещё не знаем" },
    { key: "consult",  label: "Консультация",          client: "Изучаем документы",
      hint: "Изучаем документы, оцениваем перспективу" },
    { key: "contract", label: "Договор и предоплата",   client: "Готовим договор",
      hint: "Условия согласованы, ждём подписи и денег" },
    { key: "docs",     label: "Подготовка документов",  client: "Готовим документы по делу",
      hint: "Пишем иск, претензию, жалобу" },
    { key: "work",     label: "Ведём дело",             client: "Ведём дело",
      hint: "Суд, переговоры, представительство" },
    { key: "settle",   label: "Расчёт и закрытие",      client: "Завершаем дело",
      hint: "Итог достигнут, остался расчёт" }
  ];
  var OUTCOMES = [
    { key: "done",    label: "Завершено",  client: "Дело завершено",     tone: "ok" },
    { key: "refused", label: "Отказались", client: "Работу не ведём",    tone: "off" }
  ];
  function stageOf(key) {
    var all = STAGES.concat(OUTCOMES);
    for (var i = 0; i < all.length; i++) if (all[i].key === key) return all[i];
    return { key: key, label: key, hint: "" };
  }
  var fmtMoney = new Intl.NumberFormat("ru-RU", {
    style: "currency", currency: "RUB", maximumFractionDigits: 0
  });
  var fmtDT = new Intl.DateTimeFormat("ru-RU", {
    day: "numeric", month: "short", hour: "2-digit", minute: "2-digit"
  });
  function money(v) {
    var n = Number(v);
    return isFinite(n) && n > 0 ? fmtMoney.format(n) : "";
  }
  function esc(s) { return A.esc(s); }
  function node(html) {
    var t = document.createElement("template");
    t.innerHTML = html.trim();
    return t.content.firstElementChild;
  }
  function dueInfo(due) {
    if (!due) return { text: "", tone: "" };
    var d = new Date(due), now = new Date();
    var ms = d - now;
    var day = 86400000;
    var text = fmtDT.format(d);
    if (ms < 0) return { text: "просрочено · " + text, tone: "bad" };
    if (ms < day) return { text: "сегодня · " + text, tone: "warn" };
    if (ms < 2 * day) return { text: "завтра · " + text, tone: "warn" };
    return { text: text, tone: "" };
  }
  function personName(id) {
    var p = A.people()[id];
    if (p) return A.whoName(p);
    return A.can("pdata") ? "—" : "имя скрыто";
  }
  var tasks = [];        // все незакрытые задачи (для сводки и карточек)
  var payments = {};     // id дела → массив оплат
  var notes = {};        // id дела → массив заметок
  function loadTasks() {
    return A.sb.from("tasks").select("*")
      .order("due_at", { ascending: true, nullsFirst: false })
      .then(function (r) {
        if (r.error) { console.warn(r.error); return; }
        tasks = r.data || [];
      });
  }
  function tasksOf(caseId) {
    return tasks.filter(function (t) { return t.case_id === caseId; });
  }
  function nextTask(caseId) {
    var mine = tasksOf(caseId).filter(function (t) { return t.due_at && !t.done_at; });
    if (!mine.length) return null;
    return mine.reduce(function (a, b) {
      return new Date(a.due_at) <= new Date(b.due_at) ? a : b;
    });
  }
  function loadPayments(caseId) {
    return A.sb.from("payments").select("*").eq("case_id", caseId)
      .order("at", { ascending: false })
      .then(function (r) {
        if (r.error) { console.warn(r.error); return []; }
        payments[caseId] = r.data || [];
        return payments[caseId];
      });
  }
  function paidOf(caseId) {
    return (payments[caseId] || []).reduce(function (s, p) {
      return s + Number(p.amount || 0);
    }, 0);
  }
  var RAIL = [
    { key: "board",  label: "Дела",       icon: "i-folder", need: "cases" },
    { key: "people", label: "Доверители", icon: "i-chat",   need: "pdata" },
    { key: "cal",    label: "Календарь",  icon: "i-file" },
    { key: "arch",   label: "Архив",      icon: "i-dl",     need: "archive" },
    { key: "staff",  label: "Сотрудники", icon: "i-people", owner: true }
  ];
  function railItems() {
    return RAIL.filter(function (r) {
      if (r.owner && !A.isOwner()) return false;
      if (r.need && !A.can(r.need)) return false;
      return true;
    });
  }
  var PD_NOTE =
    "*Администрация доводит до сведения: при исполнении должностных обязанностей " +
    "сотрудник обязан обеспечивать конфиденциальность персональных данных в " +
    "соответствии с ФЗ № 152-ФЗ. Разглашение персональных данных влечёт " +
    "дисциплинарную, административную и уголовную ответственность " +
    "(ст. 13.14 КоАП РФ, ст. 137 УК РФ).";
  function buildShell() {
    var app = document.getElementById("app");
    var tabs = document.getElementById("tabs");
    if (tabs) tabs.hidden = true;
    if (app) app.hidden = true;
    root = node(
      '<div class="wk" id="wk">' +
        '<nav class="wk__rail" aria-label="Разделы">' +
          railItems().map(function (r) {
            return '<button type="button" class="wk__tab" data-sec="' + r.key + '">' +
                     '<svg width="17" height="17" aria-hidden="true"><use href="#' + r.icon + '"/></svg>' +
                     '<span>' + r.label + '</span>' +
                   '</button>';
          }).join("") +
          '<div class="wk__rail-foot" id="wk-today"></div>' +
          (A.isOwner() ? "" : '<div class="wk__shiftbox" id="wk-shift"></div>') +
          '<button type="button" class="wk__tab wk__pin" id="wk-pin" aria-pressed="false">' +
            '<svg width="17" height="17" aria-hidden="true"><use href="#i-pin"/></svg>' +
            '<span id="wk-pin-label">Закрепить</span>' +
          '</button>' +
        '</nav>' +
        '<div class="wk__main">' +
          (A.isOwner() ? ""
            : '<div class="wk__pd" id="wk-pd"><p>' + esc(PD_NOTE) + '</p>' +
              '<button type="button" class="wk__pd-more" id="wk-pd-more" ' +
                'aria-expanded="false">развернуть</button></div>') +
          '<div class="wk__view" id="wk-view"></div>' +
        '</div>' +
      '</div>'
    );
    if (!A.isOwner()) root.classList.add("wk--helper");
    document.body.insertBefore(root, document.getElementById("toast"));
    view = root.querySelector("#wk-view");
    window.addEventListener("pointermove", onDragMove);
    window.addEventListener("pointerup", onDragUp);
    window.addEventListener("pointercancel", onDragUp);
    var PIN_KEY = "sp.rail.pinned";
    function setPinned(on) {
      root.classList.toggle("is-pinned", on);
      var btn = root.querySelector("#wk-pin");
      btn.setAttribute("aria-pressed", String(on));
      btn.title = on ? "Открепить панель" : "Закрепить панель";
      root.querySelector("#wk-pin-label").textContent = on ? "Открепить" : "Закрепить";
      try { localStorage.setItem(PIN_KEY, on ? "1" : "0"); } catch (err) {}
    }
    var pinned = false;
    try { pinned = localStorage.getItem(PIN_KEY) === "1"; } catch (err) {}
    setPinned(pinned);
    var more = root.querySelector("#wk-pd-more");
    if (more) more.addEventListener("click", function () {
      var box = root.querySelector("#wk-pd");
      var on = box.classList.toggle("is-open");
      more.setAttribute("aria-expanded", String(on));
      more.textContent = on ? "свернуть" : "развернуть";
    });
    root.querySelector("#wk-pin").addEventListener("click", function (e) {
      e.stopPropagation();
      setPinned(!root.classList.contains("is-pinned"));
    });
    root.querySelector(".wk__rail").addEventListener("click", function (e) {
      var b = e.target.closest(".wk__tab");
      if (!b || !b.dataset.sec) return;
      section = b.dataset.sec;
      openId = null;
      openPerson = null;
      urgentOnly = false;
      render();
    });
  }
  function parkChat() {
    var chat = A.chatNode();
    var home = document.getElementById("pane-chat");
    if (chat && home && chat.parentElement !== home) home.appendChild(chat);
  }
  function goUrgent() {
    var list = A.cases().filter(function (c) { return c.urgent && !c.archived_at; });
    if (!list.length) return;
    section = "board";
    if (list.length === 1) {
      urgentOnly = false;
      markRail();
      openDeal(list[0].id);
      return;
    }
    urgentOnly = true;
    openId = null;
    openPerson = null;
    render();
  }
  function markRail() {
    Array.prototype.forEach.call(root.querySelectorAll(".wk__tab"), function (b) {
      b.setAttribute("aria-current", String(b.dataset.sec === section));
    });
  }
  function renderToday() {
    var box = root.querySelector("#wk-today");
    var now = Date.now();
    var over = 0, today = 0;
    tasks.forEach(function (t) {
      if (!t.due_at || t.done_at) return;
      var d = new Date(t.due_at).getTime();
      if (d < now) over++;
      else if (d - now < 86400000) today++;
    });
    var fire = A.cases().filter(function (c) { return c.urgent && !c.archived_at; }).length;
    if (!fire && !over && !today) {
      box.innerHTML = '<p class="wk__calm"><i>·</i><span>Срочного нет</span></p>';
      return;
    }
    box.innerHTML =
      (fire ? '<button type="button" class="wk__due wk__due--fire" id="wk-fire">' +
                '<i>' + fire + '</i><span>срочных</span></button>' : "") +
      (over ? '<p class="wk__due wk__due--bad"><i>' + over + '</i><span>просрочено</span></p>' : "") +
      (today ? '<p class="wk__due wk__due--warn"><i>' + today + '</i><span>на сегодня</span></p>' : "");
    var fireBtn = box.querySelector("#wk-fire");
    if (fireBtn) fireBtn.addEventListener("click", goUrgent);
  }
  var requests = [];
  function loadRequests() {
    return A.sb.from("case_requests").select("*").eq("status", "new")
      .order("created_at", { ascending: false })
      .then(function (r) { requests = (r.error ? [] : (r.data || [])); });
  }
  function requestsMarkup() {
    if (!requests.length) return "";
    return '<section class="blk blk--reqs">' +
      '<header class="blk__head"><h3>Обращения</h3></header>' +
      '<ul class="reqs">' + requests.map(function (q) {
        return '<li class="req">' +
          '<div><b>' + esc(q.title) + '</b>' +
            '<span>' + esc(personName(q.client_id)) + ' · ' +
              fmtDT.format(new Date(q.created_at)) +
              (q.category ? ' · ' + esc(q.category) : "") + '</span>' +
            '<span class="req__t">' + esc(String(q.story).slice(0, 220)) +
              (String(q.story).length > 220 ? "…" : "") + '</span>' +
          '</div>' +
          '<div class="req__acts">' +
            '<button type="button" class="btn btn--primary btn--sm" data-take="' + q.id + '">Взять в работу</button>' +
            '<button type="button" class="btn btn--ghost btn--sm" data-reject="' + q.id + '">Отклонить</button>' +
          '</div>' +
        '</li>';
      }).join("") + '</ul></section>';
  }
  function matches(c) {
    if (!q) return true;
    var hay = [c.title, c.number, c.category, personName(c.client_id)].join(" ").toLowerCase();
    return hay.indexOf(q.toLowerCase()) !== -1;
  }
  function cardMarkup(c) {
    var t = nextTask(c.id);
    var due = t ? dueInfo(t.due_at) : { text: "", tone: "" };
    var sum = money(c.amount);
    var un = A.unread()[c.id] || 0;
    return '' +
      '<article class="dcard' + (c.urgent ? " is-urgent" : "") + '" data-id="' + c.id + '" tabindex="0">' +
        '<p class="dcard__who">' +
          (c.urgent ? '<span class="dcard__fire" title="Срочное">СРОЧНО</span>' : "") +
          esc(personName(c.client_id)) +
          (un ? '<span class="dcard__un" title="Непрочитанные сообщения">' + un + '</span>' : "") +
        '</p>' +
        '<h4 class="dcard__title">' + esc(c.title || "Без названия") + '</h4>' +
        (c.category ? '<p class="dcard__cat">' + esc(c.category) + '</p>' : "") +
        '<footer class="dcard__foot">' +
          (!A.can("money") ? ""
            : sum ? '<b class="dcard__sum">' + sum + '</b>'
            : '<span class="dcard__nosum">сумма не задана</span>') +
          (t ? '<span class="dcard__due ' + (due.tone ? "is-" + due.tone : "") + '">' +
                 esc(t.title) + ' · ' + esc(due.text) + '</span>' : "") +
        '</footer>' +
      '</article>';
  }
  function renderBoard() {
    parkChat();
    var all = A.cases()
      .filter(function (c) { return !c.archived_at; })
      .filter(function (c) { return !urgentOnly || c.urgent; })
      .filter(matches);
    var live = STAGES.map(function (st) {
      var list = all.filter(function (c) { return (c.pipeline || "lead") === st.key; });
      var sum = list.reduce(function (s, c) { return s + Number(c.amount || 0); }, 0);
      return '' +
        '<section class="col" data-stage="' + st.key + '">' +
          '<header class="col__head">' +
            '<b>' + st.label + '</b>' +
            '<span class="col__n">' + list.length + '</span>' +
            (sum ? '<i class="col__sum">' + money(sum) + '</i>' : '') +
          '</header>' +
          '<div class="col__body" data-drop="' + st.key + '">' +
            (list.length ? list.map(cardMarkup).join("")
                         : '<p class="col__empty">' + esc(st.hint) + '</p>') +
          '</div>' +
        '</section>';
    }).join("");
    var closed = OUTCOMES.map(function (o) {
      var list = all.filter(function (c) { return c.pipeline === o.key; });
      return '' +
        '<section class="col col--' + o.tone + '" data-stage="' + o.key + '">' +
          '<header class="col__head"><b>' + o.label + '</b>' +
            '<span class="col__n">' + list.length + '</span></header>' +
          '<div class="col__body" data-drop="' + o.key + '">' +
            list.map(cardMarkup).join("") +
          '</div>' +
        '</section>';
    }).join("");
    view.innerHTML =
      '<header class="wk__head">' +
        '<div><h2>Дела</h2>' +
          (urgentOnly
            ? '<p class="wk__filter">только срочные · ' +
              '<button type="button" id="wk-allcases">показать все</button></p>'
            : '') +
          '<p>' + all.length + (urgentOnly ? ' срочных' : ' в работе') +
          (!A.can("stage") ? ""
            : ' · ' + (window.matchMedia("(max-width: 900px)").matches
                ? 'подержите карточку, чтобы перенести'
                : 'перетащите карточку, чтобы сменить стадию')) + '</p></div>' +
        '<div class="wk__acts">' +
          '<input class="wk__search" id="wk-q" type="search" placeholder="Поиск: дело, доверитель, номер" value="' + esc(q) + '">' +
          (A.can("stage")
            ? '<button class="btn btn--primary btn--sm" id="wk-new" type="button">Новое дело</button>'
            : "") +
        '</div>' +
      '</header>' +
      requestsMarkup() +
      '<div class="board">' + live + '<div class="board__closed">' + closed + '</div></div>';
    wireBoard();
  }
  function wireBoard() {
    var board = view.querySelector(".board");
    var search = view.querySelector("#wk-q");
    var timer = 0;
    search.addEventListener("input", function () {
      clearTimeout(timer);
      timer = setTimeout(function () {
        q = search.value.trim();
        var pos = search.selectionStart;
        renderBoard();
        var s2 = view.querySelector("#wk-q");
        s2.focus();
        try { s2.setSelectionRange(pos, pos); } catch (e) {}
      }, 200);
    });
    var newBtn = view.querySelector("#wk-new");
    if (newBtn) newBtn.addEventListener("click", newCase);
    var allBtn = view.querySelector("#wk-allcases");
    if (allBtn) allBtn.addEventListener("click", function () {
      urgentOnly = false;
      renderBoard();
    });
    var reqBox = view.querySelector(".reqs");
    if (reqBox) reqBox.addEventListener("click", function (e) {
      var take = e.target.closest("[data-take]");
      var drop = e.target.closest("[data-reject]");
      if (take) {
        A.sb.rpc("accept_case_request", { p_request: take.dataset.take }).then(function (r) {
          if (r.error) { A.toast("Не получилось: " + r.error.message, true); return; }
          A.toast("Дело заведено, обращение легло первым сообщением");
          return loadRequests().then(A.reload);
        });
        return;
      }
      if (drop) {
        A.sb.from("case_requests")
          .update({ status: "declined", decided_at: new Date().toISOString() })
          .eq("id", drop.dataset.reject).then(function (r) {
            if (r.error) { A.toast("Не получилось: " + r.error.message, true); return; }
            return loadRequests().then(renderBoard);
          });
      }
    });
    board.addEventListener("click", function (e) {
      if (dragMoved) return;
      var card = e.target.closest(".dcard");
      if (card) openDeal(card.dataset.id);
    });
    board.addEventListener("keydown", function (e) {
      var card = e.target.closest(".dcard");
      if (card && (e.key === "Enter" || e.key === " ")) {
        e.preventDefault();
        openDeal(card.dataset.id);
      }
    });
    wireDrag(board);
  }
  var HOLD_MS = 320;
  var drag = null;
  var dragMoved = false;
  function wireDrag(board) {
    if (!A.can("stage")) return;
    board.addEventListener("pointerdown", function (e) {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      var card = e.target.closest(".dcard");
      if (!card) return;
      drag = {
        id: card.dataset.id, card: card,
        x0: e.clientX, y0: e.clientY, ghost: null,
        touch: e.pointerType === "touch", ready: e.pointerType !== "touch", timer: 0
      };
      dragMoved = false;
      if (drag.touch) {
        drag.timer = setTimeout(function () {
          if (drag) { drag.ready = true; makeGhost(drag.x0, drag.y0); }
        }, HOLD_MS);
      }
    });
    board.addEventListener("touchmove", function (e) {
      if (drag && drag.ghost) e.preventDefault();
    }, { passive: false });
  }
  function makeGhost(x, y) {
    var r = drag.card.getBoundingClientRect();
    drag.ghost = drag.card.cloneNode(true);
    drag.ghost.classList.add("dcard--ghost");
    drag.ghost.style.width = r.width + "px";
    drag.ghost.style.left = r.left + "px";
    drag.ghost.style.top = r.top + "px";
    drag.gx = r.left; drag.gy = r.top;
    document.body.appendChild(drag.ghost);
    drag.card.classList.add("is-drag");
    dragMoved = true;
    document.body.classList.add("is-dragging");
  }
  function onDragMove(e) {
    if (!drag) return;
    var dx = e.clientX - drag.x0, dy = e.clientY - drag.y0;
    if (drag.touch && !drag.ready) {
      if (Math.abs(dx) + Math.abs(dy) > 8) {
        clearTimeout(drag.timer);
        drag = null;
      }
      return;
    }
    if (!drag.ghost) {
      if (Math.abs(dx) + Math.abs(dy) < 6) return;
      makeGhost(drag.x0, drag.y0);
    }
    drag.ghost.style.transform = "translate(" + dx + "px," + dy + "px)";
    drag.ghost.style.display = "none";
    var under = document.elementFromPoint(e.clientX, e.clientY);
    drag.ghost.style.display = "";
    var col = under && under.closest("[data-drop]");
    Array.prototype.forEach.call(document.querySelectorAll(".col__body"),
      function (b) { b.classList.toggle("is-over", b === col); });
  }
  function onDragUp(e) {
    if (!drag) return;
    var d = drag; drag = null;
    clearTimeout(d.timer);
    Array.prototype.forEach.call(document.querySelectorAll(".col__body"),
      function (b) { b.classList.remove("is-over"); });
    document.body.classList.remove("is-dragging");
    if (!d.ghost) return;                 // просто нажатие — откроет обработчик click
    d.ghost.style.display = "none";
    var under = document.elementFromPoint(e.clientX, e.clientY);
    d.ghost.remove();
    d.card.classList.remove("is-drag");
    var col = under && under.closest("[data-drop]");
    if (col) setStage(d.id, col.dataset.drop);
    setTimeout(function () { dragMoved = false; }, 0);
  }
  function setStage(id, stage) {
    var list = A.cases();
    var c = null;
    for (var i = 0; i < list.length; i++) if (list[i].id === id) c = list[i];
    if (!c || c.pipeline === stage) return Promise.resolve();
    var was = c.pipeline, wasStage = c.stage;
    var patch = { pipeline: stage, updated_at: new Date().toISOString() };
    var human = stageOf(stage).client;
    if (human) patch.stage = human;
    if (stage === "done" || stage === "refused") patch.closed_at = new Date().toISOString();
    else patch.closed_at = null;
    c.pipeline = stage;
    if (human) c.stage = human;
    if (section === "board" && !openId) renderBoard(); else render();
    return saveCase(id, patch).then(function (res) {
      if (!res.ok) {
        c.pipeline = was;
        c.stage = wasStage;
        if (section === "board" && !openId) renderBoard(); else render();
        A.toast("Стадия не сохранилась: " + res.why, true);
        return;
      }
      A.toast("Стадия: " + stageOf(stage).label);
    });
  }
  function saveCase(id, patch) {
    return A.sb.from("cases").update(patch).eq("id", id).select("id")
      .then(function (r) {
        if (r.error) return { ok: false, why: r.error.message };
        if (!r.data || !r.data.length) {
          return { ok: false, why: "у вас нет прав на это действие" };
        }
        return { ok: true };
      });
  }
  function caseById(id) {
    var list = A.cases();
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }
  function openDeal(id) {
    openId = id;
    seq++;
    var mine = seq;
    var c = caseById(id);
    if (!c) { openId = null; render(); return; }
    Promise.all([loadPayments(id), loadEvents(id)]).then(function () {
      if (mine !== seq) return;          // успели уйти на другой экран
      renderDeal();
      return A.openCase(c);
    }).catch(function (err) {
      console.warn("дело открылось не полностью:", err);
      A.toast("Дело открылось не полностью. Обновите страницу.", true);
    });
  }
  function moneyBlock(c) {
    if (!A.can("money")) return "";
    var paid = paidOf(c.id);
    var total = Number(c.amount || 0);
    var left = total - paid;
    var rows = (payments[c.id] || []).map(function (p) {
      var kind = p.kind === "prepay" ? "предоплата" : p.kind === "final" ? "остаток" : "оплата";
      return '<li><b>' + money(p.amount) + '</b><span>' + kind + ' · ' +
             esc(new Date(p.at).toLocaleDateString("ru-RU")) + '</span>' +
             '<button type="button" class="lnk lnk--del" data-pay="' + p.id + '">убрать</button></li>';
    }).join("");
    return '' +
      '<section class="blk">' +
        '<header class="blk__head"><h3>Деньги</h3></header>' +
        '<div class="mrow">' +
          '<p class="mtot">' +
            '<span>По договору</span><b>' + (total ? money(total) : "не задана") + '</b>' +
            '<span>Получено</span><b>' + (paid ? money(paid) : "—") + '</b>' +
            (total ? '<span>Остаток</span><b class="' + (left > 0 ? "is-warn" : "is-ok") + '">' +
                     (left > 0 ? money(left) : "рассчитано полностью") + '</b>' : "") +
          '</p>' +
        '</div>' +
        (rows ? '<ul class="paylist">' + rows + '</ul>' : "") +
        '<form class="payadd" id="pay-add">' +
          '<input type="number" min="1" inputmode="numeric" placeholder="Сумма" required>' +
          '<select aria-label="Вид оплаты">' +
            '<option value="prepay">предоплата</option>' +
            '<option value="final">остаток</option>' +
            '<option value="other">иное</option>' +
          '</select>' +
          '<button class="btn btn--ghost btn--sm" type="submit">Записать оплату</button>' +
        '</form>' +
      '</section>';
  }
  function tasksBlock(c) {
    var list = tasksOf(c.id);
    var open = list.filter(function (t) { return !t.done_at; });
    var done = list.filter(function (t) { return t.done_at; })
      .sort(function (a, b) { return new Date(b.done_at) - new Date(a.done_at); })
      .slice(0, 8);
    var rows = open.map(function (t) {
      var d = dueInfo(t.due_at);
      return '<li class="task">' +
        '<button type="button" class="task__tick" data-done="' + t.id + '" aria-label="Отметить выполненной"></button>' +
        '<span class="task__t">' + esc(t.title) + '</span>' +
        (d.text ? '<span class="task__due ' + (d.tone ? "is-" + d.tone : "") + '">' + esc(d.text) + '</span>' : "") +
      '</li>';
    }).join("") +
    done.map(function (t) {
      return '<li class="task is-done">' +
        '<span class="task__tick task__tick--on" aria-hidden="true">✓</span>' +
        '<span class="task__t">' + esc(t.title) + '</span>' +
        '<span class="task__due">' + fmtDT.format(new Date(t.done_at)) + '</span>' +
      '</li>';
    }).join("");
    return '' +
      '<section class="blk">' +
        '<header class="blk__head"><h3>Задачи</h3></header>' +
        (rows ? '<ul class="tasks">' + rows + '</ul>' : "") +
        (!A.can("stage") ? (rows ? "" : '<p class="blk__empty">Задач нет</p>') : "") +
        (!A.can("stage") ? "" :
        '<form class="taskadd" id="task-add">' +
          '<input type="text" maxlength="200" placeholder="Что сделать" required>' +
          '<input type="datetime-local" aria-label="Срок">' +
          '<button class="btn btn--ghost btn--sm" type="submit">Добавить</button>' +
        '</form>') +
      '</section>';
  }
  function factsBlock(c) {
    var p = A.people()[c.client_id];
    var ro = A.can("stage") ? "" : " readonly";
    var cur = c.pipeline || "lead";
    var opts = STAGES.concat(OUTCOMES).map(function (st) {
      return '<option value="' + st.key + '"' + (st.key === cur ? " selected" : "") + '>' +
             st.label + '</option>';
    }).join("");
    return '' +
      '<section class="blk">' +
        '<header class="blk__head"><h3>Дело</h3></header>' +
        '<div class="frow' + (A.can("money") ? " frow--wide" : "") + '">' +
          '<label class="mfield"><span>Название</span>' +
            '<input id="d-title" type="text" maxlength="160"' + ro + ' value="' + esc(c.title || "") + '"></label>' +
          (A.can("money")
            ? '<label class="mfield"><span>Стоимость по договору, ₽</span>' +
                '<input id="d-amount" type="number" min="0" inputmode="numeric"' + ro + ' value="' +
                  (Number(c.amount || 0) ? Number(c.amount) : "") + '"></label>'
            : "") +
        '</div>' +
        '<div class="frow frow--three">' +
          '<label class="mfield"><span>Стадия</span>' +
            '<select id="d-pipeline"' + (A.can("stage") ? "" : " disabled") + '>' +
              opts + '</select></label>' +
          '<label class="mfield"><span>Направление</span>' +
            '<input id="d-cat" type="text" maxlength="80"' + ro + ' value="' + esc(c.category || "") + '"></label>' +
          '<label class="mfield"><span>Следующий шаг</span>' +
            '<input id="d-next" type="text" maxlength="160"' + ro + ' value="' + esc(c.next_step || "") + '"></label>' +
        '</div>' +
        (p ? '<p class="blk__who">' + esc(A.whoName(p)) +
             (p.phone ? ' · ' + esc(p.phone) : "") + '</p>' : "") +
      '</section>';
  }
  var events = {};
  var fmtLog = new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit"
  });
  function loadEvents(caseId) {
    return A.sb.from("case_events").select("*").eq("case_id", caseId)
      .order("at", { ascending: true })
      .then(function (r) {
        events[caseId] = (r.error ? [] : (r.data || []));
        return events[caseId];
      });
  }
  function logBlock(c) {
    var list = events[c.id] || [];
    return '<section class="blk">' +
      '<header class="blk__head"><h3>Порядок выполнения работ</h3></header>' +
      (list.length
        ? '<ol class="wlog">' + list.map(function (e) {
            return '<li>' +
              '<time>' + esc(fmtLog.format(new Date(e.at))) + '</time>' +
              '<b>' + esc(e.title) + '</b>' +
              (e.note ? '<span>' + esc(e.note) + '</span>' : "") +
            '</li>';
          }).join("") + '</ol>'
        : '<p class="blk__empty">Пока пусто — записи появятся сами, как только по делу что-нибудь произойдёт.</p>') +
    '</section>';
  }
  function docsBlock() {
    if (!A.can("docs")) return "";
    return '<section class="blk">' +
      '<header class="blk__head"><h3>Документы</h3></header>' +
      '<div id="docs-wrap"></div>' +
    '</section>';
  }
  function notesMarkup(key) {
    var list = notes[key] || [];
    return '<div class="notes">' +
      '<form class="noteadd" id="note-add">' +
        '<textarea rows="2" maxlength="8000" placeholder="Заметка для себя — доверитель её не увидит"></textarea>' +
        '<button class="btn btn--ghost btn--sm" type="submit">Записать</button>' +
      '</form>' +
      (list.length
        ? '<ul class="notelist">' + list.map(function (n) {
            return '<li><p>' + esc(n.body).replace(/\n/g, "<br>") + '</p>' +
                   '<span>' + esc(personName(n.author_id)) + ' · ' +
                   fmtDT.format(new Date(n.created_at)) +
                   '<button type="button" class="lnk lnk--del" data-notedel="' + n.id + '">убрать</button>' +
                   '</span></li>';
          }).join("") + '</ul>'
        : '<p class="blk__empty">Заметок нет</p>') +
    '</div>';
  }
  function renderDeal() {
    parkChat();
    var c = caseById(openId);
    if (!c) { openId = null; render(); return; }
    view.innerHTML =
      '<header class="wk__head wk__head--deal">' +
        '<button type="button" class="wk__back" id="d-back">' +
          '<svg width="15" height="15" aria-hidden="true"><use href="#i-back"/></svg> Все дела</button>' +
        '<div><h2>' + esc(c.title || "Без названия") + '</h2>' +
          '<p>' + esc(personName(c.client_id)) +
            (c.number && A.can("case_no") ? ' · ' + esc(c.number) : "") + '</p></div>' +
        (A.can("urgent")
          ? '<label class="urgent" title="Горит красным на доске">' +
              '<input type="checkbox" id="d-urgent"' + (c.urgent ? " checked" : "") + '>' +
              '<span>Срочное</span></label>'
          : (c.urgent ? '<span class="urgent is-locked" title="Пометил руководитель">' +
                          '<b>СРОЧНО</b></span>' : "")) +
        (A.can("archive")
          ? '<button type="button" class="btn btn--dim btn--sm" id="d-arch">В архив</button>'
          : "") +
      '</header>' +
      '<div class="deal">' +
        '<div class="deal__left">' + factsBlock(c) + moneyBlock(c) + tasksBlock(c) +
          docsBlock() + logBlock(c) + '</div>' +
        '<div class="deal__right">' +
          (A.can("chat")
            ? '<div class="deal__slot" id="d-chat"></div>'
            : '<div class="deal__slot"><div class="soon"><p>Переписка с доверителем ' +
              'вам не открыта. Если она нужна для работы — попросите доступ ' +
              'у руководителя.</p></div></div>') +
        '</div>' +
      '</div>';
    var chat = A.can("chat") ? A.chatNode() : null;
    var slot = view.querySelector("#d-chat");
    if (chat && slot) slot.appendChild(chat);
    mountQuick();
    if (A.loadDocs && A.currentCaseId && A.currentCaseId() === c.id) A.loadDocs();
    wireDeal(c);
  }
  function wireDeal(c) {
    var deal = view.querySelector(".deal");
    view.querySelector("#d-back").addEventListener("click", function () {
      openId = null; render();
    });
    var pipeSel = view.querySelector("#d-pipeline");
    if (pipeSel && !pipeSel.disabled) pipeSel.addEventListener("change", function (e) {
      setStage(c.id, e.target.value);
    });
    var archBtn = view.querySelector("#d-arch");
    if (archBtn) archBtn.addEventListener("click", function () {
      archiveCase(c.id, true);
    });
    var urgBox = view.querySelector("#d-urgent");
    if (urgBox) urgBox.addEventListener("change", function (e) {
      var on = e.target.checked, was = c.urgent;
      c.urgent = on;
      renderToday();
      saveCase(c.id, { urgent: on }).then(function (res) {
        if (!res.ok) {
          c.urgent = was; e.target.checked = was;
          renderToday();
          A.toast("Не сохранилось: " + res.why, true);
        }
      });
    });
    ["d-title:title", "d-cat:category", "d-next:next_step", "d-amount:amount"]
      .forEach(function (pair) {
        var parts = pair.split(":");
        var input = view.querySelector("#" + parts[0]);
        if (!input) return;
        input.addEventListener("change", function () {
          var val = input.value.trim();
          if (parts[1] === "amount") val = val === "" ? null : Number(val);
          if (c[parts[1]] === val) return;
          var was = c[parts[1]];
          c[parts[1]] = val;
          A.sb.from("cases")
            .update((function () { var o = {}; o[parts[1]] = val; o.updated_at = new Date().toISOString(); return o; })())
            .eq("id", c.id)
            .then(function (r) {
              if (r.error) {
                c[parts[1]] = was;
                input.value = was == null ? "" : was;
                A.toast("Не сохранилось: " + r.error.message, true);
              } else if (parts[1] === "amount") {
                renderDeal();
              }
            });
        });
      });
    var payAdd = view.querySelector("#pay-add");
    if (payAdd) payAdd.addEventListener("submit", function (e) {
      e.preventDefault();
      var sum = Number(payAdd.querySelector("input").value);
      var kind = payAdd.querySelector("select").value;
      if (!(sum > 0)) return;
      A.sb.from("payments").insert({
        case_id: c.id, amount: sum, kind: kind, created_by: A.me().id
      }).then(function (r) {
        if (r.error) { A.toast("Оплата не записалась: " + r.error.message, true); return; }
        return Promise.all([loadPayments(c.id), loadEvents(c.id)]).then(renderDeal);
      });
    });
    deal.addEventListener("click", function (e) {
      var del = e.target.closest("[data-pay]");
      if (!del) return;
      A.sb.from("payments").delete().eq("id", del.dataset.pay).then(function (r) {
        if (r.error) { A.toast("Не удалось убрать: " + r.error.message, true); return; }
        return loadPayments(c.id).then(renderDeal);
      });
    });
    var taskAdd = view.querySelector("#task-add");
    if (taskAdd) taskAdd.addEventListener("submit", function (e) {
      e.preventDefault();
      var title = taskAdd.querySelector('input[type="text"]').value.trim();
      var due = taskAdd.querySelector('input[type="datetime-local"]').value;
      if (!title) return;
      A.sb.from("tasks").insert({
        case_id: c.id, title: title,
        due_at: due ? new Date(due).toISOString() : null,
        created_by: A.me().id, assigned_to: A.me().id
      }).then(function (r) {
        if (r.error) { A.toast("Задача не добавилась: " + r.error.message, true); return; }
        return Promise.all([loadTasks(), loadEvents(c.id)])
          .then(function () { renderDeal(); renderToday(); });
      });
    });
    deal.addEventListener("click", function (e) {
      var tick = e.target.closest("[data-done]");
      if (!tick) return;
      A.sb.from("tasks").update({ done_at: new Date().toISOString() })
        .eq("id", tick.dataset.done).then(function (r) {
          if (r.error) { A.toast("Не отметилось: " + r.error.message, true); return; }
          return Promise.all([loadTasks(), loadEvents(c.id)])
            .then(function () { renderDeal(); renderToday(); });
        });
    });
  }
  function loadClientNotes(clientId) {
    return A.sb.from("notes").select("*").eq("client_id", clientId)
      .order("created_at", { ascending: false })
      .then(function (r) {
        notes[clientId] = (r.error ? [] : (r.data || []));
        return notes[clientId];
      });
  }
  function refreshNotes(clientId, slot) {
    slot.innerHTML = notesMarkup(clientId);
    wireNoteForm(clientId, slot);
  }
  function wireNoteForm(clientId, slot) {
    var noteAdd = slot.querySelector("#note-add");
    if (!noteAdd) return;
    noteAdd.addEventListener("submit", function (e) {
      e.preventDefault();
      var ta = noteAdd.querySelector("textarea");
      var body = ta.value.trim();
      if (!body) return;
      A.sb.from("notes").insert({ client_id: clientId, author_id: A.me().id, body: body })
        .then(function (r) {
          if (r.error) { A.toast("Заметка не записалась: " + r.error.message, true); return; }
          ta.value = "";
          return loadClientNotes(clientId).then(function () { refreshNotes(clientId, slot); });
        });
    });
  }
  function wireNotes(clientId, slotSel) {
    var slot = view.querySelector(slotSel);
    if (!slot) return;
    wireNoteForm(clientId, slot);
    slot.addEventListener("click", function (e) {
      var del = e.target.closest("[data-notedel]");
      if (!del) return;
      A.sb.from("notes").delete().eq("id", del.dataset.notedel).then(function (r) {
        if (r.error) { A.toast("Не убралось: " + r.error.message, true); return; }
        return loadClientNotes(clientId).then(function () { refreshNotes(clientId, slot); });
      });
    });
  }
  function newCase() {
    var people = A.people();
    var opts = Object.keys(people)
      .filter(function (id) { return people[id].role === "client"; })
      .map(function (id) {
        return '<option value="' + id + '">' + esc(A.whoName(people[id])) + '</option>';
      }).join("");
    if (!opts) {
      A.toast("Сначала заведите доверителя", true);
      return;
    }
    var box = node(
      '<div class="modal" role="dialog" aria-modal="true" aria-label="Новое дело">' +
        '<form class="modal__card">' +
          '<h3>Новое дело</h3>' +
          '<label class="mfield"><span>Доверитель</span><select id="n-who">' + opts + '</select></label>' +
          '<label class="mfield"><span>Название</span>' +
            '<input id="n-title" type="text" maxlength="160" required></label>' +
          '<label class="mfield"><span>Направление</span>' +
            '<input id="n-cat" type="text" maxlength="80"></label>' +
          '<div class="modal__acts">' +
            '<button type="button" class="btn btn--ghost btn--sm" id="n-cancel">Отмена</button>' +
            '<button type="submit" class="btn btn--primary btn--sm">Завести</button>' +
          '</div>' +
        '</form>' +
      '</div>'
    );
    document.body.appendChild(box);
    box.querySelector("#n-title").focus();
    var close = closable(box, "#n-cancel");
    box.querySelector("form").addEventListener("submit", function (e) {
      e.preventDefault();
      var title = box.querySelector("#n-title").value.trim();
      if (!title) return;
      A.sb.from("cases").insert({
        client_id: box.querySelector("#n-who").value,
        lawyer_id: A.me().id,
        title: title,
        category: box.querySelector("#n-cat").value.trim(),
        number: "Д-" + String(Date.now()).slice(-6),
        pipeline: "lead",
        stage: "Приняли обращение"
      }).then(function (r) {
        if (r.error) { A.toast("Дело не завелось: " + r.error.message, true); return; }
        close();
        return A.reload();
      });
    });
  }
  function archiveCase(id, on) {
    var c = caseById(id);
    if (!c) return;
    var when = on ? new Date().toISOString() : null;
    saveCase(id, { archived_at: when }).then(function (res) {
      if (!res.ok) { A.toast("Не получилось: " + res.why, true); return; }
      c.archived_at = when;
      openId = null;
      A.toast(on ? "Дело в архиве" : "Дело возвращено");
      render();
    });
  }
  function archivePerson(id, on) {
    var p = A.people()[id];
    if (!p) return;
    var when = on ? new Date().toISOString() : null;
    A.sb.from("profiles").update({ archived_at: when }).eq("id", id).then(function (r) {
      if (r.error) { A.toast("Не получилось: " + r.error.message, true); return; }
      p.archived_at = when;
      openPerson = null;
      A.toast(on ? "Доверитель в архиве" : "Доверитель возвращён");
      render();
    });
  }
  function askDelete(what, detail, onYes) {
    var box = node(
      '<div class="modal" role="dialog" aria-modal="true" aria-label="Удаление">' +
        '<div class="modal__card">' +
          '<h3>Удалить насовсем?</h3>' +
          '<p class="modal__lead">' + esc(what) + '</p>' +
          '<p class="modal__warn">' + esc(detail) + ' Вернуть будет нельзя.</p>' +
          '<div class="modal__acts">' +
            '<button type="button" class="btn btn--ghost btn--sm" id="ad-no">Отмена</button>' +
            '<button type="button" class="btn btn--danger btn--sm" id="ad-yes">Удалить</button>' +
          '</div>' +
        '</div>' +
      '</div>'
    );
    document.body.appendChild(box);
    var close = closable(box, "#ad-no");
    box.querySelector("#ad-yes").addEventListener("click", function () {
      close();
      onYes();
    });
  }
  function renderArch() {
    parkChat();
    var all = A.cases();
    var deadCases = all.filter(function (c) { return c.archived_at; });
    var people = A.people();
    var deadPeople = Object.keys(people).map(function (k) { return people[k]; })
      .filter(function (p) { return p.role === "client" && p.archived_at; });
    view.innerHTML =
      '<header class="wk__head"><div><h2>Архив</h2>' +
        '<p>Убранное с глаз. Переписка и документы целы — дело можно вернуть</p></div></header>' +
      '<div class="archwrap">' +
      '<section class="blk">' +
        '<header class="blk__head"><h3>Дела</h3></header>' +
        (deadCases.length
          ? '<ul class="archlist">' + deadCases.map(function (c) {
              return '<li><div><b>' + esc(c.title || "Без названия") + '</b>' +
                '<span>' + esc(personName(c.client_id)) + '</span></div>' +
                '<button type="button" class="btn btn--ghost btn--sm" data-uncase="' + c.id + '">Вернуть</button>' +
                '<button type="button" class="lnk lnk--del" data-delcase="' + c.id + '">удалить насовсем</button>' +
              '</li>';
            }).join("") + '</ul>'
          : '<p class="blk__empty">Пусто</p>') +
      '</section>' +
      '<section class="blk">' +
        '<header class="blk__head"><h3>Доверители</h3></header>' +
        (deadPeople.length
          ? '<ul class="archlist">' + deadPeople.map(function (p) {
              return '<li><div><b>' + esc(A.whoName(p)) + '</b>' +
                '<span>' + esc(p.phone || "") + '</span></div>' +
                '<button type="button" class="btn btn--ghost btn--sm" data-unp="' + p.id + '">Вернуть</button>' +
                '<button type="button" class="lnk lnk--del" data-delp="' + p.id + '">удалить насовсем</button>' +
              '</li>';
            }).join("") + '</ul>'
          : '<p class="blk__empty">Пусто</p>') +
        '<p class="blk__note">Стирание уносит вход, все дела, переписку и документы. ' +
          'Вернуть будет нечем.</p>' +
      '</section>' +
      '</div>';
    view.querySelector(".archwrap").addEventListener("click", onArchClick);
  }
  function onArchClick(e) {
    var un = e.target.closest("[data-uncase]");
    if (un) return archiveCase(un.dataset.uncase, false);
    var unp = e.target.closest("[data-unp]");
    if (unp) return archivePerson(unp.dataset.unp, false);
    var delp = e.target.closest("[data-delp]");
    if (delp) {
      var who = A.people()[delp.dataset.delp];
      askDelete(
        "Доверитель «" + (who ? A.whoName(who) : "") + "»",
        "Уйдут вход в кабинет, все его дела, переписка, документы и оплаты.",
        function () {
          A.sb.rpc("delete_client", { p_client: delp.dataset.delp }).then(function (r) {
            if (r.error) { A.toast("Не удалилось: " + r.error.message, true); return; }
            A.toast("Доверитель удалён");
            return A.reload();
          });
        }
      );
      return;
    }
    var del = e.target.closest("[data-delcase]");
    if (!del) return;
    var c = caseById(del.dataset.delcase);
    askDelete(
      "Дело «" + (c && c.title ? c.title : "без названия") + "»",
      "Вместе с ним уйдут переписка, документы, задачи и оплаты по этому делу.",
      function () {
        A.sb.from("cases").delete().eq("id", del.dataset.delcase).then(function (r) {
          if (r.error) { A.toast("Не удалилось: " + r.error.message, true); return; }
          A.toast("Дело удалено");
          return A.reload();
        });
      }
    );
  }
  var quick = [];
  function loadQuick() {
    return A.sb.from("quick_replies").select("*").order("sort", { ascending: true })
      .then(function (r) {
        if (r.error) { console.warn(r.error); return; }
        quick = r.data || [];
      });
  }
  function quickMarkup() {
    return quick.map(function (q) {
      return '<button type="button" class="qchip" data-q="' + q.id + '" title="' +
             esc(q.body) + '">' + esc(q.label) +
             '<span class="qchip__x" data-qdel="' + q.id + '" title="Убрать заготовку">×</span></button>';
    }).join("") +
    '<button type="button" class="qchip qchip--add" id="q-add" title="Своя заготовка">+ заготовка</button>';
  }
  function mountQuick() {
    var chat = A.chatNode();
    if (!chat) return;
    var composer = chat.querySelector("#composer");
    if (!composer) return;
    var bar = chat.querySelector(".quickbar");
    if (!bar) {
      bar = document.createElement("div");
      bar.className = "quickbar";
      composer.parentNode.insertBefore(bar, composer);
      bar.addEventListener("click", onQuickClick);
    }
    bar.innerHTML = quickMarkup();
  }
  function onQuickClick(e) {
    var del = e.target.closest("[data-qdel]");
    if (del) {
      e.stopPropagation();
      A.sb.from("quick_replies").delete().eq("id", del.dataset.qdel).then(function (r) {
        if (r.error) { A.toast("Не убралось: " + r.error.message, true); return; }
        return loadQuick().then(mountQuick);
      });
      return;
    }
    if (e.target.closest("#q-add")) { newQuick(); return; }
    var chip = e.target.closest("[data-q]");
    if (!chip) return;
    var item = null;
    quick.forEach(function (q) { if (q.id === chip.dataset.q) item = q; });
    if (!item) return;
    var msg = document.getElementById("msg");
    if (!msg) return;
    msg.value = msg.value ? msg.value.replace(/\s*$/, "") + "\n" + item.body : item.body;
    msg.focus();
    msg.dispatchEvent(new Event("input", { bubbles: true }));
  }
  function newQuick() {
    var box = node(
      '<div class="modal" role="dialog" aria-modal="true" aria-label="Заготовка ответа">' +
        '<form class="modal__card">' +
          '<h3>Своя заготовка</h3>' +
          '<label class="mfield"><span>Подпись на кнопке</span>' +
            '<input id="q-label" type="text" maxlength="40" required placeholder="Приняли документы"></label>' +
          '<label class="mfield"><span>Текст ответа</span>' +
            '<textarea id="q-body" rows="4" maxlength="2000" required ' +
            'placeholder="Документы получили, изучаем. Ответим в течение рабочего дня."></textarea></label>' +
          '<div class="modal__acts">' +
            '<button type="button" class="btn btn--ghost btn--sm" id="q-cancel">Отмена</button>' +
            '<button type="submit" class="btn btn--primary btn--sm">Сохранить</button>' +
          '</div>' +
        '</form>' +
      '</div>'
    );
    document.body.appendChild(box);
    box.querySelector("#q-label").focus();
    closable(box, "#q-cancel");
    box.querySelector("form").addEventListener("submit", function (e) {
      e.preventDefault();
      var label = box.querySelector("#q-label").value.trim();
      var body = box.querySelector("#q-body").value.trim();
      if (!label || !body) return;
      A.sb.from("quick_replies").insert({
        owner_id: A.me().id, label: label, body: body, sort: quick.length + 1
      }).then(function (r) {
        if (r.error) { A.toast("Не сохранилось: " + r.error.message, true); return; }
        box.remove();
        return loadQuick().then(mountQuick);
      });
    });
  }
  function closable(box, cancelSel) {
    function close() {
      box.remove();
      document.removeEventListener("keydown", onKey);
    }
    function onKey(e) { if (e.key === "Escape") close(); }
    if (cancelSel) box.querySelector(cancelSel).addEventListener("click", close);
    box.addEventListener("mousedown", function (e) { if (e.target === box) close(); });
    document.addEventListener("keydown", onKey);
    return close;
  }
  var peopleQ = "";
  var openPerson = null;
  function clientList() {
    var all = A.people();
    return Object.keys(all)
      .map(function (id) { return all[id]; })
      .filter(function (p) { return p.role === "client" && !p.archived_at; })
      .filter(function (p) {
        if (!peopleQ) return true;
        var hay = [p.full_name, p.org_name, p.phone, p.email].join(" ").toLowerCase();
        return hay.indexOf(peopleQ.toLowerCase()) !== -1;
      })
      .sort(function (a, b) {
        return String(A.whoName(a)).localeCompare(String(A.whoName(b)), "ru");
      });
  }
  function casesOf(clientId) {
    return A.cases().filter(function (c) { return c.client_id === clientId; });
  }
  function renderPeople() {
    parkChat();
    if (openPerson) return renderPerson();
    var list = clientList();
    view.innerHTML =
      '<header class="wk__head">' +
        '<div><h2>Доверители</h2><p>' + list.length + ' в базе</p></div>' +
        '<div class="wk__acts">' +
          '<input class="wk__search" id="p-q" type="search" placeholder="Имя, организация, телефон" value="' + esc(peopleQ) + '">' +
          '<button class="btn btn--primary btn--sm" id="p-new" type="button">Завести доверителя</button>' +
        '</div>' +
      '</header>' +
      (list.length
        ? '<div class="plist">' + list.map(function (p) {
            var n = casesOf(p.id).length;
            return '<button type="button" class="prow" data-p="' + p.id + '">' +
              '<span class="prow__n">' + esc(A.whoName(p)) + '</span>' +
              '<span class="prow__c">' + (p.entity_type === "company" ? "ИП или юрлицо" : "частное лицо") + '</span>' +
              '<span class="prow__t">' + esc(p.phone || "телефон не указан") + '</span>' +
              '<span class="prow__d">' + (n ? n + (n === 1 ? " дело" : n < 5 ? " дела" : " дел") : "дел нет") + '</span>' +
            '</button>';
          }).join("") + '</div>'
        : '<div class="soon"><p>Пока никого. Заведите доверителя — кабинет выдаст логин и пароль, ' +
          'которые можно передать человеку.</p></div>');
    var q1 = view.querySelector("#p-q");
    var t = 0;
    q1.addEventListener("input", function () {
      clearTimeout(t);
      t = setTimeout(function () {
        peopleQ = q1.value.trim();
        var pos = q1.selectionStart;
        renderPeople();
        var q2 = view.querySelector("#p-q");
        q2.focus();
        try { q2.setSelectionRange(pos, pos); } catch (e) {}
      }, 200);
    });
    view.querySelector("#p-new").addEventListener("click", newClient);
    var pl = view.querySelector(".plist");
    if (pl) pl.addEventListener("click", function (e) {
      var row = e.target.closest("[data-p]");
      if (row) { openPerson = row.dataset.p; seq++; renderPeople(); }
    });
  }
  function renderPerson() {
    var p = A.people()[openPerson];
    if (!p) { openPerson = null; return renderPeople(); }
    var mine = casesOf(p.id).filter(function (c) { return !c.archived_at; });
    view.innerHTML =
      '<header class="wk__head wk__head--deal">' +
        '<button type="button" class="wk__back" id="p-back">' +
          '<svg width="15" height="15" aria-hidden="true"><use href="#i-back"/></svg> Все доверители</button>' +
        '<div><h2>' + esc(A.whoName(p)) + '</h2>' +
          '<p>' + (p.entity_type === "company" ? "ИП или юридическое лицо" : "частное лицо") + '</p></div>' +
        '<button type="button" class="btn btn--dim btn--sm" id="p-arch">В архив</button>' +
      '</header>' +
      '<div class="deal">' +
        '<div class="deal__left">' +
          '<section class="blk">' +
            '<header class="blk__head"><h3>Связь</h3></header>' +
            '<div class="frow">' +
              '<label class="mfield"><span>Телефон</span>' +
                '<input id="pf-phone" type="tel" value="' + esc(p.phone || "") + '"></label>' +
              '<label class="mfield"><span>Мессенджер</span>' +
                '<input id="pf-msgr" type="text" value="' + esc(p.messenger || "") + '"></label>' +
            '</div>' +
            '<div class="frow">' +
              '<label class="mfield"><span>Почта</span>' +
                '<input id="pf-mail" type="email" value="' + esc(p.email || "") + '"></label>' +
              '<label class="mfield"><span>Имя</span>' +
                '<input id="pf-name" type="text" value="' + esc(p.full_name || "") + '"></label>' +
            '</div>' +
          '</section>' +
          (p.entity_type === "company"
            ? '<section class="blk"><header class="blk__head"><h3>Реквизиты</h3></header>' +
                '<div class="frow">' +
                  '<label class="mfield"><span>Организация</span>' +
                    '<input id="pf-org" type="text" value="' + esc(p.org_name || "") + '"></label>' +
                  '<label class="mfield"><span>Должность подписанта</span>' +
                    '<input id="pf-pos" type="text" value="' + esc(p.contact_position || "") + '"></label>' +
                '</div>' +
                '<div class="frow">' +
                  '<label class="mfield"><span>ИНН</span>' +
                    '<input id="pf-inn" type="text" inputmode="numeric" value="' + esc(p.inn || "") + '"></label>' +
                  '<label class="mfield"><span>ОГРН</span>' +
                    '<input id="pf-ogrn" type="text" inputmode="numeric" value="' + esc(p.ogrn || "") + '"></label>' +
                '</div>' +
              '</section>'
            : "") +
        '</div>' +
        '<div class="deal__left">' +
          '<section class="blk">' +
            '<header class="blk__head"><h3>Дела</h3></header>' +
            (mine.length
              ? '<ul class="pcases">' + mine.map(function (c) {
                  return '<li><button type="button" data-case="' + c.id + '">' +
                    '<b>' + esc(c.title || "Без названия") + '</b>' +
                    '<span>' + esc(stageOf(c.pipeline || "lead").label) + '</span></button></li>';
                }).join("") + '</ul>'
              : '<p class="blk__empty">Дел нет</p>') +
          '</section>' +
          '<section class="blk">' +
            '<header class="blk__head"><h3>Заметки</h3></header>' +
            '<div id="p-notes"></div>' +
          '</section>' +
        '</div>' +
      '</div>';
    var who = seq;
    loadClientNotes(p.id).then(function () {
      if (who !== seq) return;
      var slot = view.querySelector("#p-notes");
      if (!slot) return;                       // успели уйти на другой экран
      slot.innerHTML = notesMarkup(p.id);
      wireNotes(p.id, "#p-notes");
    });
    view.querySelector("#p-back").addEventListener("click", function () {
      openPerson = null; renderPeople();
    });
    view.querySelector("#p-arch").addEventListener("click", function () {
      archivePerson(p.id, true);
    });
    var deal = view.querySelector(".deal");
    deal.addEventListener("click", function (e) {
      var b = e.target.closest("[data-case]");
      if (!b) return;
      section = "board";
      openPerson = null;
      openDeal(b.dataset.case);
      markRail();
    });
    [["pf-phone", "phone"], ["pf-msgr", "messenger"], ["pf-mail", "email"], ["pf-name", "full_name"],
     ["pf-org", "org_name"], ["pf-pos", "contact_position"], ["pf-inn", "inn"], ["pf-ogrn", "ogrn"]]
      .forEach(function (pair) {
        var input = view.querySelector("#" + pair[0]);
        if (!input) return;
        input.addEventListener("change", function () {
          var val = input.value.trim() || null;
          var was = p[pair[1]];
          if (was === val) return;
          p[pair[1]] = val;
          var patch = {}; patch[pair[1]] = val;
          A.sb.from("profiles").update(patch).eq("id", p.id).then(function (r) {
            if (r.error) {
              p[pair[1]] = was;
              input.value = was || "";
              A.toast("Не сохранилось: " + r.error.message, true);
            }
          });
        });
      });
  }
  function newClient() {
    var box = node(
      '<div class="modal" role="dialog" aria-modal="true" aria-label="Новый доверитель">' +
        '<form class="modal__card">' +
          '<h3>Завести доверителя</h3>' +
          '<p class="modal__lead">Для тех, кто обратился по телефону.</p>' +
          '<div class="segbar">' +
            '<label><input type="radio" name="nc-kind" value="person" checked> Частное лицо</label>' +
            '<label><input type="radio" name="nc-kind" value="company"> ИП или юрлицо</label>' +
          '</div>' +
          '<label class="mfield"><span>Имя и фамилия</span>' +
            '<input id="nc-name" type="text" maxlength="120" required></label>' +
          '<label class="mfield"><span>Телефон</span>' +
            '<input id="nc-phone" type="tel" required></label>' +
          '<label class="mfield"><span>Первый пароль</span>' +
            '<span class="pwrow">' +
              '<input id="nc-pass" type="text" minlength="6" maxlength="40" required ' +
                'autocomplete="off" spellcheck="false">' +
              '<button type="button" class="btn btn--ghost btn--sm" id="nc-gen">Придумать</button>' +
            '</span></label>' +
          '<div id="nc-company" hidden>' +
            '<label class="mfield"><span>Организация</span>' +
              '<input id="nc-org" type="text" maxlength="200"></label>' +
            '<div class="frow">' +
              '<label class="mfield"><span>ИНН</span><input id="nc-inn" type="text" inputmode="numeric"></label>' +
              '<label class="mfield"><span>ОГРН</span><input id="nc-ogrn" type="text" inputmode="numeric"></label>' +
            '</div>' +
          '</div>' +
          '<p class="form__status" id="nc-status" role="status" aria-live="polite"></p>' +
          '<div class="modal__acts">' +
            '<button type="button" class="btn btn--ghost btn--sm" id="nc-cancel">Отмена</button>' +
            '<button type="submit" class="btn btn--primary btn--sm" id="nc-go">Завести</button>' +
          '</div>' +
        '</form>' +
      '</div>'
    );
    document.body.appendChild(box);
    box.querySelector("#nc-name").focus();
    var close = closable(box, "#nc-cancel");
    function suggest() {
      var abc = "abcdefghijkmnpqrstuvwxyz23456789";
      var bytes = new Uint8Array(8);
      (window.crypto || window.msCrypto).getRandomValues(bytes);
      var out = "";
      for (var i = 0; i < bytes.length; i++) out += abc[bytes[i] % abc.length];
      box.querySelector("#nc-pass").value = out;
    }
    box.querySelector("#nc-gen").addEventListener("click", suggest);
    suggest();
    Array.prototype.forEach.call(box.querySelectorAll('input[name="nc-kind"]'), function (r) {
      r.addEventListener("change", function () {
        box.querySelector("#nc-company").hidden = box.querySelector('input[name="nc-kind"]:checked').value !== "company";
      });
    });
    box.querySelector("form").addEventListener("submit", function (e) {
      e.preventDefault();
      var st = box.querySelector("#nc-status");
      var go = box.querySelector("#nc-go");
      var kind = box.querySelector('input[name="nc-kind"]:checked').value;
      var payload = {
        action: "create_client",
        name: box.querySelector("#nc-name").value.trim(),
        phone: box.querySelector("#nc-phone").value.trim(),
        entity: kind,
        password: box.querySelector("#nc-pass").value,
        org_name: kind === "company" ? box.querySelector("#nc-org").value.trim() : "",
        inn: kind === "company" ? box.querySelector("#nc-inn").value.trim() : "",
        ogrn: kind === "company" ? box.querySelector("#nc-ogrn").value.trim() : ""
      };
      st.textContent = "Заводим…";
      st.className = "form__status";
      go.disabled = true;
      A.sb.functions.invoke("staff", { body: payload }).then(function (r) {
        go.disabled = false;
        var err = r.error;
        var data = r.data;
        if (err || !data || !data.ok) {
          var code = (data && data.error) || "server";
          st.className = "form__status is-bad";
          st.textContent =
            code === "exists" ? "На этот номер кабинет уже заведён."
            : code === "phone" ? "Проверьте номер: нужны 11 цифр."
            : code === "name" ? "Укажите имя."
            : code === "password" ? "Пароль короче шести знаков."
            : code === "forbidden" ? "Нет прав. Войдите как сотрудник."
            : "Не получилось. Попробуйте ещё раз.";
          return;
        }
        close();
        showCreds(data.login, data.password);
        return A.reload();
      });
    });
  }
  function showCreds(login, password) {
    var box = node(
      '<div class="modal" role="dialog" aria-modal="true" aria-label="Данные для входа">' +
        '<div class="modal__card">' +
          '<h3>Вход заведён</h3>' +
          '<p class="modal__lead">Передайте эти данные доверителю. Пароль показывается ' +
            'один раз и нигде не хранится — если потеряется, придётся задать новый.</p>' +
          '<div class="creds">' +
            '<div><span>Логин</span><b id="cr-l">' + esc(login) + '</b></div>' +
            '<div><span>Пароль</span><b id="cr-p">' + esc(password) + '</b></div>' +
          '</div>' +
          '<div class="modal__acts">' +
            '<button type="button" class="btn btn--ghost btn--sm" id="cr-copy">Скопировать</button>' +
            '<button type="button" class="btn btn--primary btn--sm" id="cr-ok">Записал</button>' +
          '</div>' +
        '</div>' +
      '</div>'
    );
    document.body.appendChild(box);
    box.querySelector("#cr-ok").addEventListener("click", function () { box.remove(); });
    box.querySelector("#cr-copy").addEventListener("click", function () {
      var text = "Кабинет: логин " + login + ", пароль " + password;
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(
          function () { A.toast("Скопировано"); },
          function () { A.toast("Скопировать не вышло — перепишите вручную", true); }
        );
      } else {
        A.toast("Скопировать не вышло — перепишите вручную", true);
      }
    });
  }
  var DAY_FROM = 7, DAY_TO = 22;          // границы сетки, часы
  var weekStart = null;                   // понедельник показываемой недели
  var windows = [];
  var appts = [];
  var fmtDayShort = new Intl.DateTimeFormat("ru-RU", { weekday: "short", day: "numeric", month: "short" });
  var fmtWeekEnd = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", year: "numeric" });
  var fmtWeekStart = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long" });
  var fmtHM = new Intl.DateTimeFormat("ru-RU", { hour: "2-digit", minute: "2-digit" });
  function startOfWeek(d) {
    var x = new Date(d);
    x.setHours(0, 0, 0, 0);
    var shift = (x.getDay() + 6) % 7;
    x.setDate(x.getDate() - shift);
    return x;
  }
  function addDays(d, n) {
    var x = new Date(d);
    x.setDate(x.getDate() + n);
    return x;
  }
  function localToISO(dateStr, hhmm) {
    return new Date(dateStr + "T" + hhmm).toISOString();
  }
  function loadCal() {
    if (!weekStart) weekStart = startOfWeek(new Date());
    var from = weekStart.toISOString();
    var to = addDays(weekStart, 7).toISOString();
    return Promise.all([
      A.sb.from("work_windows").select("*").gte("starts_at", from).lt("starts_at", to)
        .order("starts_at", { ascending: true }),
      A.sb.from("appointments").select("*").gte("starts_at", from).lt("starts_at", to)
        .order("starts_at", { ascending: true }),
      A.sb.from("appointments").select("*").eq("status", "pending")
        .order("starts_at", { ascending: true })
    ]).then(function (r) {
      if (r[0].error || r[1].error) {
        console.warn(r[0].error || r[1].error);
        A.toast("Календарь не загрузился", true);
        return;
      }
      windows = r[0].data || [];
      appts = r[1].data || [];
      pending = (r[2] && r[2].data) || [];
    });
  }
  var pending = [];
  function pctTop(d) {
    var mins = d.getHours() * 60 + d.getMinutes() - DAY_FROM * 60;
    return Math.max(0, mins / ((DAY_TO - DAY_FROM) * 60) * 100);
  }
  function pctHeight(a, b) {
    var mins = (b - a) / 60000;
    return Math.max(2, mins / ((DAY_TO - DAY_FROM) * 60) * 100);
  }
  var APPT_LABEL = {
    pending: "ждёт подтверждения", confirmed: "подтверждено",
    declined: "отклонено", cancelled: "отменено"
  };
  function renderCal() {
    parkChat();
    var today = new Date();
    var days = [];
    for (var i = 0; i < 7; i++) days.push(addDays(weekStart, i));
    var hours = "";
    for (var h = DAY_FROM; h < DAY_TO; h++) {
      hours += '<div class="cal__h">' + (h < 10 ? "0" + h : h) + ':00</div>';
    }
    var cols = days.map(function (d, i) {
      var dayStart = new Date(d); dayStart.setHours(0, 0, 0, 0);
      var dayEnd = addDays(dayStart, 1);
      var isToday = dayStart.toDateString() === today.toDateString();
      var wins = windows.filter(function (w) {
        var st = new Date(w.starts_at);
        return st >= dayStart && st < dayEnd;
      }).map(function (w) {
        var a = new Date(w.starts_at), b = new Date(w.ends_at);
        var mineWin = w.lawyer_id === A.me().id;
        return '<div class="cal__win ' + (mineWin ? "is-mine" : "is-other") +
               '" style="top:' + pctTop(a).toFixed(2) + '%;height:' +
               pctHeight(a, b).toFixed(2) + '%" data-win="' + w.id + '">' +
                 '<span>' + fmtHM.format(a) + '–' + fmtHM.format(b) + ' · по ' + w.slot_minutes + ' мин' +
                   (mineWin ? "" : ' · ' + esc(personName(w.lawyer_id))) + '</span>' +
                 (mineWin || A.isOwner()
                   ? '<button type="button" class="cal__x" data-windel="' + w.id + '" title="Убрать окно">×</button>'
                   : "") +
               '</div>';
      }).join("");
      var evs = appts.filter(function (p) {
        var st = new Date(p.starts_at);
        return st >= dayStart && st < dayEnd && p.status !== "cancelled" && p.status !== "declined";
      }).map(function (p) {
        var a = new Date(p.starts_at), b = new Date(p.ends_at);
        return '<div class="cal__ap is-' + p.status + '" style="top:' + pctTop(a).toFixed(2) +
               '%;height:' + pctHeight(a, b).toFixed(2) + '%" data-ap="' + p.id + '">' +
                 '<b>' + fmtHM.format(a) + '</b> ' + esc(personName(p.client_id)) +
               '</div>';
      }).join("");
      return '<div class="cal__col' + (isToday ? " is-today" : "") + '" data-day="' + i + '">' +
               '<header class="cal__dh">' + esc(fmtDayShort.format(d)) + '</header>' +
               '<div class="cal__grid" data-dayidx="' + i + '">' + wins + evs + '</div>' +
             '</div>';
    }).join("");
    var reqs = pending.map(function (p) {
      var a = new Date(p.starts_at), b = new Date(p.ends_at);
      return '<li class="req">' +
        '<div><b>' + esc(personName(p.client_id)) + '</b>' +
          '<span>' + esc(fmtDayShort.format(a)) + ' · ' + fmtHM.format(a) + '–' + fmtHM.format(b) + '</span>' +
          (p.topic ? '<span class="req__t">' + esc(p.topic) + '</span>' : "") + '</div>' +
        '<div class="req__acts">' +
          '<select data-fmt="' + p.id + '" aria-label="Формат встречи">' +
            '<option value="">формат…</option>' +
            '<option value="office">в офисе</option>' +
            '<option value="video">видеосвязь</option>' +
            '<option value="phone">по телефону</option>' +
          '</select>' +
          '<button type="button" class="btn btn--primary btn--sm" data-ok="' + p.id + '">Подтвердить</button>' +
          '<button type="button" class="btn btn--ghost btn--sm" data-no="' + p.id + '">Отклонить</button>' +
        '</div>' +
      '</li>';
    }).join("");
    view.innerHTML =
      '<header class="wk__head">' +
        '<div><h2>Календарь</h2><p>' +
          esc(fmtWeekStart.format(weekStart)) + ' — ' + esc(fmtWeekEnd.format(addDays(weekStart, 6))) +
          '</p></div>' +
        '<div class="wk__acts">' +
          '<button class="btn btn--ghost btn--sm" id="cal-prev" type="button">← неделя</button>' +
          '<button class="btn btn--ghost btn--sm" id="cal-now" type="button">Сегодня</button>' +
          '<button class="btn btn--ghost btn--sm" id="cal-next" type="button">неделя →</button>' +
          '<button class="btn btn--primary btn--sm" id="cal-add" type="button">Открыть окно</button>' +
        '</div>' +
      '</header>' +
      (reqs ? '<section class="blk blk--reqs"><header class="blk__head"><h3>Заявки на приём</h3></header>' +
              '<ul class="reqs">' + reqs + '</ul></section>' : "") +
      '<div class="cal">' +
        '<div class="cal__hours"><header class="cal__dh"></header><div class="cal__hlist">' + hours + '</div></div>' +
        cols +
      '</div>';
    wireCal();
  }
  function wireCal() {
    view.querySelector("#cal-prev").addEventListener("click", function () {
      weekStart = addDays(weekStart, -7); loadCal().then(renderCal);
    });
    view.querySelector("#cal-next").addEventListener("click", function () {
      weekStart = addDays(weekStart, 7); loadCal().then(renderCal);
    });
    view.querySelector("#cal-now").addEventListener("click", function () {
      weekStart = startOfWeek(new Date()); loadCal().then(renderCal);
    });
    view.querySelector("#cal-add").addEventListener("click", function () { windowForm(null, null); });
    var cal = view.querySelector(".cal");
    cal.addEventListener("click", function (e) {
      var del = e.target.closest("[data-windel]");
      if (del) {
        e.stopPropagation();
        A.sb.from("work_windows").delete().eq("id", del.dataset.windel).then(function (r) {
          if (r.error) { A.toast("Окно не убралось: " + r.error.message, true); return; }
          return loadCal().then(renderCal);
        });
        return;
      }
      var grid = e.target.closest(".cal__grid");
      if (!grid || e.target.closest(".cal__win") || e.target.closest(".cal__ap")) return;
      var r0 = grid.getBoundingClientRect();
      var frac = (e.clientY - r0.top) / r0.height;
      var hour = Math.floor(DAY_FROM + frac * (DAY_TO - DAY_FROM));
      windowForm(addDays(weekStart, Number(grid.dataset.dayidx)), hour);
    });
    var reqs = view.querySelector(".reqs");
    if (reqs) reqs.addEventListener("click", function (e) {
      var ok = e.target.closest("[data-ok]");
      var no = e.target.closest("[data-no]");
      if (!ok && !no) return;
      var id = (ok || no).dataset.ok || (ok || no).dataset.no;
      var patch = { status: ok ? "confirmed" : "declined", decided_at: new Date().toISOString() };
      if (ok) {
        var sel = reqs.querySelector('[data-fmt="' + id + '"]');
        if (sel && sel.value) patch.format = sel.value;
        patch.lawyer_id = A.me().id;
      }
      A.sb.from("appointments").update(patch).eq("id", id).then(function (r) {
        if (r.error) { A.toast("Не сохранилось: " + r.error.message, true); return; }
        A.toast(ok ? "Приём подтверждён" : "Заявка отклонена");
        return loadCal().then(renderCal);
      });
    });
  }
  function windowForm(day, hour) {
    var d = day || new Date();
    var iso = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
    var h0 = hour == null ? 10 : hour;
    var h1 = Math.min(DAY_TO, h0 + 3);
    var box = node(
      '<div class="modal" role="dialog" aria-modal="true" aria-label="Рабочее окно">' +
        '<form class="modal__card">' +
          '<h3>Открыть окно для записи</h3>' +
          '<p class="modal__lead">Доверитель увидит свободные куски этого окна и сможет занять один. ' +
            'Время подтверждаете вы.</p>' +
          '<label class="mfield"><span>День</span>' +
            '<input id="w-date" type="date" required value="' + iso + '"></label>' +
          '<div class="frow">' +
            '<label class="mfield"><span>С</span>' +
              '<input id="w-from" type="time" required step="900" value="' + (h0 < 10 ? "0" + h0 : h0) + ':00"></label>' +
            '<label class="mfield"><span>До</span>' +
              '<input id="w-to" type="time" required step="900" value="' + (h1 < 10 ? "0" + h1 : h1) + ':00"></label>' +
          '</div>' +
          '<label class="mfield"><span>Длина приёма</span>' +
            '<select id="w-slot">' +
              '<option value="30">30 минут</option>' +
              '<option value="60" selected>1 час</option>' +
              '<option value="90">1,5 часа</option>' +
              '<option value="120">2 часа</option>' +
            '</select></label>' +
          '<p class="form__status" id="w-status" role="status" aria-live="polite"></p>' +
          '<div class="modal__acts">' +
            '<button type="button" class="btn btn--ghost btn--sm" id="w-cancel">Отмена</button>' +
            '<button type="submit" class="btn btn--primary btn--sm">Открыть</button>' +
          '</div>' +
        '</form>' +
      '</div>'
    );
    document.body.appendChild(box);
    var close = closable(box, "#w-cancel");
    box.querySelector("form").addEventListener("submit", function (e) {
      e.preventDefault();
      var st = box.querySelector("#w-status");
      var date = box.querySelector("#w-date").value;
      var from = box.querySelector("#w-from").value;
      var to = box.querySelector("#w-to").value;
      var slot = Number(box.querySelector("#w-slot").value);
      if (!date || !from || !to) return;
      if (to <= from) {
        st.className = "form__status is-bad";
        st.textContent = "Конец окна должен быть позже начала.";
        return;
      }
      A.sb.from("work_windows").insert({
        lawyer_id: A.me().id,
        starts_at: localToISO(date, from),
        ends_at: localToISO(date, to),
        slot_minutes: slot
      }).then(function (r) {
        if (r.error) {
          st.className = "form__status is-bad";
          st.textContent = "Не открылось: " + r.error.message;
          return;
        }
        close();
        return loadCal().then(renderCal);
      });
    });
  }
  function renderSoon(title, text) {
    parkChat();
    view.innerHTML =
      '<header class="wk__head"><div><h2>' + title + '</h2></div></header>' +
      '<div class="soon"><p>' + text + '</p></div>';
  }
  var RANKS = [
    { key: "assistant", n: 1, label: "Помощник юриста" },
    { key: "junior",    n: 2, label: "Младший юрист" },
    { key: "lawyer",    n: 3, label: "Юрист" },
    { key: "intern",    n: 4, label: "Практикант" }
  ];
  var PERMS = [
    { key: "case_no", n: 1, label: "Номер дела",
      hint: "Показывать внутренний номер в карточке", soft: true },
    { key: "pdata",   n: 2, label: "Персональные данные доверителя",
      hint: "Имя, телефон, почта, реквизиты" },
    { key: "chat",    n: 3, label: "Переписка с доверителем",
      hint: "Читать и писать сообщения по делу" },
    { key: "money",   n: 4, label: "Суммы к оплате и предоплате",
      hint: "Видеть и вести расчёты" },
    { key: "docs",    n: 5, label: "Документы",
      hint: "Открывать и загружать файлы по делу" },
    { key: "archive", n: 6, label: "Архив: смотреть и убирать",
      hint: "Видеть закрытые дела и самому убирать дело в архив" },
    { key: "pwd",     n: 7, label: "Смена своего логина и пароля",
      hint: "Менять пароль самостоятельно", soft: true },
    { key: "cases",   n: 8, label: "Видеть дела и задачи",
      hint: "Без него кабинет пуст: ни доски, ни карточек" },
    { key: "stage",   n: 9, label: "Вести дело",
      hint: "Двигать по стадиям, править карточку, вести задачи" },
    { key: "urgent",  n: 10, label: "Помечать дело срочным",
      hint: "Зажигать красный огонёк на доске" }
  ];
  var openStaff = null;   // открытая карточка сотрудника
  var sessions = [];      // смены за последние 90 дней
  var slog = [];          // журнал действий за те же 90 дней
  function rankOf(key) {
    for (var i = 0; i < RANKS.length; i++) if (RANKS[i].key === key) return RANKS[i];
    return RANKS[0];
  }
  function hoursMins(ms) {
    var m = Math.round(ms / 60000);
    var h = Math.floor(m / 60);
    m = m % 60;
    if (!h && !m) return "—";
    return (h ? h + " ч " : "") + (m ? m + " мин" : "");
  }
  function clockText(ms) {
    var s = Math.max(0, Math.floor(ms / 1000));
    var h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
    s = s % 60;
    return (h < 10 ? "0" + h : h) + ":" + (m < 10 ? "0" + m : m) + ":" + (s < 10 ? "0" + s : s);
  }
  var ONLINE_MS = 3 * 60 * 1000;
  function isOnline(p) {
    if (!p || !p.last_seen_at) return false;
    return Date.now() - new Date(p.last_seen_at).getTime() < ONLINE_MS;
  }
  function staffList() {
    var all = A.people();
    return Object.keys(all)
      .map(function (id) { return all[id]; })
      .filter(function (p) { return p.role === "assistant"; })
      .sort(function (a, b) {
        if (!!a.archived_at !== !!b.archived_at) return a.archived_at ? 1 : -1;
        return String(A.whoName(a)).localeCompare(String(A.whoName(b)), "ru");
      });
  }
  function loadStaff() {
    var since = new Date(Date.now() - 90 * 86400000).toISOString();
    return Promise.all([
      A.sb.from("work_sessions").select("staff_id,started_at,ended_at").gte("started_at", since),
      A.sb.from("staff_log").select("staff_id,at,action,detail,case_id")
        .gte("at", since).order("at", { ascending: false }).limit(2000)
    ]).then(function (r) {
      sessions = r[0].error ? [] : (r[0].data || []);
      slog = r[1].error ? [] : (r[1].data || []);
      if (r[0].error || r[1].error) A.toast("Статистика не загрузилась", true);
    });
  }
  function statOf(id) {
    var now = Date.now();
    var weekAgo = now - 7 * 86400000;
    var total = 0, week = 0, open = null;
    sessions.forEach(function (s) {
      if (s.staff_id !== id) return;
      var a = new Date(s.started_at).getTime();
      var b = s.ended_at ? new Date(s.ended_at).getTime() : now;
      if (!s.ended_at) open = a;
      total += Math.max(0, b - a);
      week += Math.max(0, b - Math.max(a, weekAgo));
    });
    var seen = {}, moves = 0;
    slog.forEach(function (r) {
      if (r.staff_id !== id || r.action !== "Стадия изменена") return;
      moves++;
      if (r.case_id) seen[r.case_id] = 1;
    });
    return { total: total, week: week, open: open, cases: Object.keys(seen).length, moves: moves };
  }
  function logOf(id, limit) {
    return slog.filter(function (r) { return r.staff_id === id; }).slice(0, limit || 20);
  }
  function renderStaff() {
    parkChat();
    if (openStaff) return renderStaffCard();
    var list = staffList();
    var live = list.filter(function (p) { return !p.archived_at; });
    view.innerHTML =
      '<header class="wk__head">' +
        '<div><h2>Сотрудники</h2><p>' + live.length +
          (live.length === 1 ? " человек" : live.length >= 2 && live.length <= 4 ? " человека" : " человек") +
          ' в штате</p></div>' +
      '</header>' +
      '<section class="blk">' +
        '<header class="blk__head"><h3>Статистика работы</h3>' +
          '<span class="blk__note">за 90 дней</span></header>' +
        (list.length
          ? '<div class="slist">' +
              '<div class="srow srow--head">' +
                '<span>Сотрудник</span><span>Должность</span><span>За неделю</span>' +
                '<span>Всего</span><span>Дел перенесено</span>' +
              '</div>' +
              list.map(function (p) {
                var s = statOf(p.id);
                return '<button type="button" class="srow' + (p.archived_at ? " is-off" : "") +
                         '" data-s="' + p.id + '">' +
                  '<span class="srow__n">' +
                    '<i class="dot' + (isOnline(p) ? " is-on" : "") + '" aria-hidden="true"></i>' +
                    esc(A.whoName(p)) +
                    (p.archived_at ? ' <em>уволен</em>' : "") +
                  '</span>' +
                  '<span>' + esc(rankOf(p.staff_rank).label) + '</span>' +
                  '<span class="srow__wk">' + hoursMins(s.week) +
                    (s.open ? '<b class="live">смена идёт</b>' : "") + '</span>' +
                  '<span>' + hoursMins(s.total) + '</span>' +
                  '<span>' + (s.cases || "—") +
                    (s.moves > s.cases ? ' <i>· ' + s.moves + ' переносов</i>' : "") + '</span>' +
                '</button>';
              }).join("") +
            '</div>'
          : '<p class="blk__empty">Сотрудников пока нет.</p>') +
      '</section>' +
      '<div class="wk__under">' +
        '<button class="btn btn--primary btn--sm" id="s-new" type="button">Добавить сотрудника</button>' +
      '</div>';
    view.querySelector("#s-new").addEventListener("click", newStaff);
    var sl = view.querySelector(".slist");
    if (sl) sl.addEventListener("click", function (e) {
      var row = e.target.closest("[data-s]");
      if (row) { openStaff = row.dataset.s; seq++; renderStaff(); }
    });
  }
  function renderStaffCard() {
    var p = A.people()[openStaff];
    if (!p) { openStaff = null; return renderStaff(); }
    var s = statOf(p.id);
    var perms = p.perms || {};
    var log = logOf(p.id, 20);
    view.innerHTML =
      '<header class="wk__head wk__head--deal">' +
        '<button type="button" class="wk__back" id="s-back">' +
          '<svg width="15" height="15" aria-hidden="true"><use href="#i-back"/></svg> Все сотрудники</button>' +
        '<div><h2>' + esc(A.whoName(p)) + '</h2>' +
          '<p><i class="dot' + (isOnline(p) ? " is-on" : "") + '" aria-hidden="true"></i>' +
            (isOnline(p) ? "в сети" : "не в сети") +
            (s.open ? " · смена идёт" : "") + '</p></div>' +
        (p.archived_at
          ? '<button type="button" class="btn btn--dim btn--sm" id="s-back-to-work">Вернуть в штат</button>'
          : '<button type="button" class="btn btn--dim btn--sm" id="s-fire">Уволить</button>') +
      '</header>' +
      '<div class="deal">' +
        '<div class="deal__left">' +
          '<section class="blk">' +
            '<header class="blk__head"><h3>Карточка</h3></header>' +
            '<div class="frow">' +
              '<label class="mfield"><span>Фамилия, имя, отчество</span>' +
                '<input id="sf-name" type="text" maxlength="120" value="' + esc(p.full_name || "") + '"></label>' +
              '<label class="mfield"><span>Номер телефона</span>' +
                '<input id="sf-phone" type="tel" value="' + esc(p.phone || "") + '"></label>' +
            '</div>' +
            '<div class="frow">' +
              '<label class="mfield"><span>Номер договора</span>' +
                '<input id="sf-contract" type="text" maxlength="60" value="' + esc(p.contract_no || "") + '"></label>' +
              '<label class="mfield"><span>Должность</span>' +
                '<select id="sf-rank">' +
                  RANKS.map(function (r) {
                    return '<option value="' + r.key + '"' +
                      (r.key === (p.staff_rank || "assistant") ? " selected" : "") + '>' +
                      r.n + ' — ' + r.label + '</option>';
                  }).join("") +
                '</select></label>' +
            '</div>' +
            '<label class="mfield"><span>Статус, который видят доверители</span>' +
              '<input id="sf-title" type="text" maxlength="120" placeholder="Юрист — Петров Сергей" ' +
                'value="' + esc(p.public_title || "") + '"></label>' +
            '<p class="mfield__hint">Эту подпись доверитель видит в переписке и в карточке дела. ' +
              'Внутренняя должность ему не показывается.</p>' +
          '</section>' +
          '<section class="blk">' +
            '<header class="blk__head"><h3>Доступ</h3>' +
              '<span class="blk__note">включено — видит</span></header>' +
            '<div class="perms" id="s-perms">' +
              PERMS.map(function (x) {
                return '<label class="perm' + (x.soft ? " perm--soft" : "") + '">' +
                  '<input type="checkbox" data-perm="' + x.key + '"' +
                    (perms[x.key] === true ? " checked" : "") + '>' +
                  '<span class="perm__sw" aria-hidden="true"></span>' +
                  '<span class="perm__t"><b>' + x.n + '. ' + esc(x.label) + '</b>' +
                    '<i>' + esc(x.hint) + (x.soft ? " · только прячет" : "") + '</i></span>' +
                '</label>';
              }).join("") +
            '</div>' +
            '<p class="mfield__hint">Все пункты, кроме отмеченных точкой, закрыты в самой базе: ' +
              'без галочки данные не отдаются вовсе и действие не проходит. Точкой отмечены ' +
              'пункты 1 и 7 — они только убирают лишнее с экрана, но не запрещают. ' +
              'Пункт 8 — основной: без него кабинет сотрудника пуст.</p>' +
          '</section>' +
          '<section class="blk">' +
            '<header class="blk__head"><h3>Вход</h3></header>' +
            '<div class="frow">' +
              '<label class="mfield"><span>Логин</span>' +
                '<input id="sf-login" type="text" readonly value="' +
                  esc(String(p.phone || "").replace(/\D/g, "")) + '"></label>' +
              '<label class="mfield"><span>Новый пароль</span>' +
                '<span class="pwrow">' +
                  '<input id="sf-pass" type="text" minlength="6" maxlength="40" autocomplete="off" ' +
                    'spellcheck="false" placeholder="не задан">' +
                  '<button type="button" class="btn btn--ghost btn--sm" id="sf-gen">Придумать</button>' +
                '</span></label>' +
            '</div>' +
            '<div class="wk__under">' +
              '<button type="button" class="btn btn--dim btn--sm" id="sf-setpass">Задать пароль</button>' +
            '</div>' +
            '<p class="mfield__hint">Логин — цифры номера телефона. Пароль в базе не хранится: ' +
              'его нельзя подсмотреть, можно только задать новый и продиктовать.</p>' +
          '</section>' +
        '</div>' +
        '<div class="deal__left">' +
          '<section class="blk">' +
            '<header class="blk__head"><h3>Работа</h3>' +
              '<span class="blk__note">за 90 дней</span></header>' +
            '<div class="stats">' +
              '<div><b>' + hoursMins(s.week) + '</b><span>за неделю</span></div>' +
              '<div><b>' + hoursMins(s.total) + '</b><span>всего</span></div>' +
              '<div><b>' + (s.cases || 0) + '</b><span>дел перенесено</span></div>' +
              '<div><b>' + (s.moves || 0) + '</b><span>переносов</span></div>' +
            '</div>' +
          '</section>' +
          '<section class="blk">' +
            '<header class="blk__head"><h3>Лог действий</h3>' +
              '<span class="blk__note">последние ' + log.length + '</span></header>' +
            (log.length
              ? '<ul class="slog">' + log.map(function (r) {
                  var d = new Date(r.at);
                  return '<li><time>' + A.fmtDay.format(d) + ', ' + A.fmtTime.format(d) + '</time>' +
                    '<b>' + esc(r.action) + '</b>' +
                    (r.detail ? '<i>' + esc(r.detail) + '</i>' : "") + '</li>';
                }).join("") + '</ul>'
              : '<p class="blk__empty">Действий пока нет.</p>') +
          '</section>' +
        '</div>' +
      '</div>';
    view.querySelector("#s-back").addEventListener("click", function () {
      openStaff = null; renderStaff();
    });
    [["sf-name", "full_name"], ["sf-phone", "phone"],
     ["sf-contract", "contract_no"], ["sf-title", "public_title"]]
      .forEach(function (pair) {
        var input = view.querySelector("#" + pair[0]);
        if (!input) return;
        input.addEventListener("change", function () {
          var val = input.value.trim() || null;
          var was = p[pair[1]];
          if (was === val) return;
          p[pair[1]] = val;
          var patch = {}; patch[pair[1]] = val;
          A.sb.from("profiles").update(patch).eq("id", p.id).then(function (r) {
            if (r.error) {
              p[pair[1]] = was;
              input.value = was || "";
              A.toast("Не сохранилось: " + r.error.message, true);
              return;
            }
            if (pair[1] === "phone") {
              view.querySelector("#sf-login").value = String(val || "").replace(/\D/g, "");
              A.toast("Телефон в карточке изменён. Логин для входа остался прежним.");
            }
          });
        });
      });
    view.querySelector("#sf-rank").addEventListener("change", function () {
      var sel = view.querySelector("#sf-rank");
      var was = p.staff_rank;
      p.staff_rank = sel.value;
      A.sb.from("profiles").update({ staff_rank: sel.value }).eq("id", p.id).then(function (r) {
        if (r.error) {
          p.staff_rank = was;
          sel.value = was || "assistant";
          A.toast("Должность не сохранилась: " + r.error.message, true);
        }
      });
    });
    view.querySelector("#s-perms").addEventListener("change", function (e) {
      var box = e.target.closest("[data-perm]");
      if (!box) return;
      var key = box.dataset.perm;
      var on = box.checked;
      var was = p.perms || {};
      var next = {};
      Object.keys(was).forEach(function (k) { next[k] = was[k]; });
      next[key] = on;
      p.perms = next;
      A.sb.from("profiles").update({ perms: next }).eq("id", p.id).then(function (r) {
        if (r.error) {
          p.perms = was;
          box.checked = !on;
          A.toast("Доступ не сохранился: " + r.error.message, true);
        }
      });
    });
    view.querySelector("#sf-gen").addEventListener("click", function () {
      view.querySelector("#sf-pass").value = makePass();
    });
    view.querySelector("#sf-setpass").addEventListener("click", function () {
      var input = view.querySelector("#sf-pass");
      var pass = input.value.trim();
      if (pass.length < 6) { A.toast("Пароль короче шести знаков", true); input.focus(); return; }
      var btn = view.querySelector("#sf-setpass");
      btn.disabled = true;
      A.sb.rpc("set_staff_password", { p_staff: p.id, p_password: pass }).then(function (r) {
        btn.disabled = false;
        if (r.error) { A.toast("Не задалось: " + r.error.message, true); return; }
        input.value = "";
        showCreds(String(p.phone || "").replace(/\D/g, ""), pass);
      });
    });
    var fire = view.querySelector("#s-fire");
    if (fire) fire.addEventListener("click", function () { askFire(p); });
    var back = view.querySelector("#s-back-to-work");
    if (back) back.addEventListener("click", function () { setFired(p, false); });
  }
  function askFire(p) {
    var box = node(
      '<div class="modal" role="dialog" aria-modal="true" aria-label="Увольнение">' +
        '<div class="modal__card">' +
          '<h3>Уволить сотрудника?</h3>' +
          '<p class="modal__lead">' + esc(A.whoName(p)) + '</p>' +
          '<p class="modal__warn">Все доступы будут сняты, карточка уйдёт из штата. ' +
            'Журнал действий сохранится. Чтобы закрыть и вход, задайте новый пароль.</p>' +
          '<div class="modal__acts">' +
            '<button type="button" class="btn btn--ghost btn--sm" id="fr-no">Отмена</button>' +
            '<button type="button" class="btn btn--danger btn--sm" id="fr-yes">Уволить</button>' +
          '</div>' +
        '</div>' +
      '</div>'
    );
    document.body.appendChild(box);
    var close = closable(box, "#fr-no");
    box.querySelector("#fr-yes").addEventListener("click", function () {
      close();
      setFired(p, true);
    });
  }
  function setFired(p, on) {
    var patch = { archived_at: on ? new Date().toISOString() : null };
    if (on) patch.perms = {};
    A.sb.from("profiles").update(patch).eq("id", p.id).then(function (r) {
      if (r.error) { A.toast("Не сохранилось: " + r.error.message, true); return; }
      p.archived_at = patch.archived_at;
      if (on) p.perms = {};
      A.toast(on ? "Уволен" : "Вернули в штат");
      renderStaffCard();
    });
  }
  function makePass(len) {
    var abc = "abcdefghijkmnpqrstuvwxyz23456789";
    var bytes = new Uint8Array(len || 8);
    (window.crypto || window.msCrypto).getRandomValues(bytes);
    var out = "";
    for (var i = 0; i < bytes.length; i++) out += abc[bytes[i] % abc.length];
    return out;
  }
  function newStaff() {
    var box = node(
      '<div class="modal" role="dialog" aria-modal="true" aria-label="Новый сотрудник">' +
        '<form class="modal__card">' +
          '<h3>Добавить сотрудника</h3>' +
          '<p class="modal__lead">Кабинет заведёт вход. Доступы можно будет ' +
            'открыть или закрыть в карточке в любой момент.</p>' +
          '<div class="frow">' +
            '<label class="mfield"><span>Фамилия, имя, отчество</span>' +
              '<input id="ns-name" type="text" maxlength="120" required></label>' +
            '<label class="mfield"><span>Номер телефона</span>' +
              '<input id="ns-phone" type="tel" required placeholder="+7 (___) ___-__-__"></label>' +
          '</div>' +
          '<div class="frow">' +
            '<label class="mfield"><span>Номер договора</span>' +
              '<input id="ns-contract" type="text" maxlength="60"></label>' +
            '<label class="mfield"><span>Должность</span>' +
              '<select id="ns-rank">' +
                RANKS.map(function (r) {
                  return '<option value="' + r.key + '">' + r.n + ' — ' + r.label + '</option>';
                }).join("") +
              '</select></label>' +
          '</div>' +
          '<label class="mfield"><span>Статус, который видят доверители</span>' +
            '<input id="ns-title" type="text" maxlength="120" placeholder="Юрист — Петров Сергей"></label>' +
          '<label class="mfield"><span>Первый пароль</span>' +
            '<span class="pwrow">' +
              '<input id="ns-pass" type="text" minlength="6" maxlength="40" required ' +
                'autocomplete="off" spellcheck="false">' +
              '<button type="button" class="btn btn--ghost btn--sm" id="ns-gen">Придумать</button>' +
            '</span></label>' +
          '<p class="form__status" id="ns-status" role="status" aria-live="polite"></p>' +
          '<div class="modal__acts">' +
            '<button type="button" class="btn btn--ghost btn--sm" id="ns-cancel">Отмена</button>' +
            '<button type="submit" class="btn btn--primary btn--sm" id="ns-go">Добавить</button>' +
          '</div>' +
        '</form>' +
      '</div>'
    );
    document.body.appendChild(box);
    box.querySelector("#ns-name").focus();
    var close = closable(box, "#ns-cancel");
    box.querySelector("#ns-pass").value = makePass();
    box.querySelector("#ns-gen").addEventListener("click", function () {
      box.querySelector("#ns-pass").value = makePass();
    });
    box.querySelector("form").addEventListener("submit", function (e) {
      e.preventDefault();
      var st = box.querySelector("#ns-status");
      var go = box.querySelector("#ns-go");
      var pass = box.querySelector("#ns-pass").value;
      st.className = "form__status";
      st.textContent = "Заводим…";
      go.disabled = true;
      A.sb.rpc("create_staff", {
        p_name: box.querySelector("#ns-name").value.trim(),
        p_phone: box.querySelector("#ns-phone").value.trim(),
        p_password: pass,
        p_contract: box.querySelector("#ns-contract").value.trim(),
        p_title: box.querySelector("#ns-title").value.trim(),
        p_rank: box.querySelector("#ns-rank").value,
        p_perms: {}
      }).then(function (r) {
        go.disabled = false;
        if (r.error) {
          st.className = "form__status is-bad";
          st.textContent = r.error.message || "Не получилось. Попробуйте ещё раз.";
          return;
        }
        close();
        showCreds(r.data, pass);
        return A.reload();
      });
    });
  }
  var shift = null;      // открытая смена или null
  var shiftTimer = 0;
  function loadShift() {
    if (!A.me()) return Promise.resolve();
    return A.sb.from("work_sessions").select("id,started_at")
      .eq("staff_id", A.me().id).is("ended_at", null)
      .order("started_at", { ascending: false }).limit(1)
      .then(function (r) {
        shift = (!r.error && r.data && r.data[0]) || null;
      });
  }
  function paintShift() {
    var box = root && root.querySelector("#wk-shift");
    if (!box) return;
    if (!shift) {
      box.innerHTML =
        '<button type="button" class="wk__shift" id="wk-shift-go">' +
          '<svg width="16" height="16" aria-hidden="true"><use href="#i-clock"/></svg>' +
          '<span>Приступить к работе</span></button>';
      box.querySelector("#wk-shift-go").addEventListener("click", startShift);
      return;
    }
    var began = new Date(shift.started_at).getTime();
    box.innerHTML =
      '<button type="button" class="wk__shift is-on" id="wk-shift-stop" ' +
        'title="Закончить работу">' +
        '<svg width="16" height="16" aria-hidden="true"><use href="#i-clock"/></svg>' +
        '<span><b id="wk-shift-t">' + clockText(Date.now() - began) + '</b>' +
        '<i>Закончить</i></span></button>';
    box.querySelector("#wk-shift-stop").addEventListener("click", stopShift);
  }
  function tickShift() {
    clearInterval(shiftTimer);
    if (!shift) return;
    var began = new Date(shift.started_at).getTime();
    shiftTimer = setInterval(function () {
      var t = root && root.querySelector("#wk-shift-t");
      if (!t) { clearInterval(shiftTimer); return; }
      t.textContent = clockText(Date.now() - began);
    }, 1000);
  }
  function startShift() {
    return A.sb.from("work_sessions")
      .insert({ staff_id: A.me().id }).select("id,started_at").maybeSingle()
      .then(function (r) {
        if (r.error) {
          return loadShift().then(function () {
            paintShift(); tickShift();
            A.toast(shift ? "Смена уже идёт" : "Не начлось: " + r.error.message, !shift);
          });
        }
        shift = r.data;
        paintShift();
        tickShift();
        A.toast("Смена началась");
      });
  }
  function stopShift() {
    if (!shift) return Promise.resolve();
    var id = shift.id;
    var began = new Date(shift.started_at).getTime();
    return A.sb.from("work_sessions")
      .update({ ended_at: new Date().toISOString() }).eq("id", id)
      .then(function (r) {
        if (r.error) { A.toast("Не закрылось: " + r.error.message, true); return; }
        shift = null;
        clearInterval(shiftTimer);
        paintShift();
        A.toast("Смена закончена, " + hoursMins(Date.now() - began));
      });
  }
  function beat() {
    if (document.hidden) return;
    A.sb.rpc("heartbeat").then(function () {}, function () {});
  }
  function render() {
    seq++;
    var allowed = railItems();
    if (!allowed.length) {
      markRail();
      renderToday();
      parkChat();
      view.innerHTML =
        '<header class="wk__head"><div><h2>Доступ не открыт</h2></div></header>' +
        '<div class="soon"><p>Руководитель ещё не открыл вам ни одного раздела. ' +
        'Пока доступ не выдан, дела и переписка не показываются — это не сбой ' +
        'кабинета. Обратитесь к руководителю.</p></div>';
      return;
    }
    var open = allowed.some(function (r) { return r.key === section; });
    if (!open) section = allowed[0].key;
    markRail();
    renderToday();
    if (section === "board") {
      if (openId) renderDeal(); else renderBoard();
      return;
    }
    if (section === "people") { renderPeople(); return; }
    if (section === "arch") { renderArch(); return; }
    if (section === "staff") {
      renderSoon("Сотрудники", "Считаем рабочее время…");
      var who = seq;
      loadStaff().then(function () { if (who === seq) renderStaff(); });
      return;
    }
    renderSoon("Календарь", "Загружаем расписание…");
    var mine = seq;
    loadCal().then(function () { if (mine === seq) renderCal(); });
  }
  window.SPWorkspace = {
    start: function (api) {
      A = api;
      if (!root) buildShell();
      beat();
      setInterval(beat, 60000);
      return Promise.all([loadTasks(), loadQuick(), loadRequests(), loadShift()])
        .then(function () { paintShift(); tickShift(); })
        .then(render);
    }
  };
})();