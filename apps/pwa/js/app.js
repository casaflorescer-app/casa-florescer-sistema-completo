const rooms = [
  { id: "S1", name: "Samara", specialty: "Ginecologia", house: true, status: "busy", patient: "Marina Alves · 15:00", pill: "Em sala", pillLive: true },
  { id: "S2", name: "Thais", specialty: "Obstetrícia", house: true, status: "next", patient: "Helena Costa · 15:20", pill: "A seguir" },
  { id: "S3", name: "Sala 3", specialty: "Locação", house: false, status: "free", patient: "Livre até 16:00", pill: "Livre", pillFree: true },
  { id: "S4", name: "Sala 4", specialty: "Locação", house: false, status: "next", patient: "Paulo Mendes · 15:30", pill: "Locação" },
  { id: "S5", name: "Sala 5", specialty: "Locação", house: false, status: "free", patient: "Livre o restante da tarde", pill: "Livre", pillFree: true },
];

const queue = [
  { name: "Juliana Prado", detail: "S1 · retorno GO", time: "15:10", initials: "JP" },
  { name: "Camila Nunes", detail: "S2 · pré-natal", time: "15:25", initials: "CN" },
  { name: "Rafael Dias", detail: "S4 · locatário", time: "15:30", initials: "RD" },
];

const patients = [
  { name: "Marina Alves", detail: "GO · Samara", initials: "MA" },
  { name: "Helena Costa", detail: "Obstetrícia · Thais", initials: "HC" },
  { name: "Juliana Prado", detail: "GO · retorno", initials: "JP" },
  { name: "Camila Nunes", detail: "Pré-natal", initials: "CN" },
  { name: "Paulo Mendes", detail: "Sala 4", initials: "PM" },
  { name: "Ana Beatriz Lima", detail: "GO · Samara", initials: "AB" },
];

const slots = [
  { time: "14:00", name: "Carla Mota", detail: "Consulta", empty: false },
  { time: "14:30", name: "", detail: "", empty: true },
  { time: "15:00", name: "Marina Alves", detail: "Retorno", empty: false },
  { time: "15:30", name: "", detail: "", empty: true },
  { time: "16:00", name: "Sofia Martins", detail: "Primeira consulta", empty: false },
  { time: "16:30", name: "", detail: "", empty: true },
  { time: "17:00", name: "Encerramento", detail: "Administrativo", empty: false },
];

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => [...document.querySelectorAll(sel)];

let installPrompt = null;

function toast(msg) {
  const el = $("#toast");
  el.textContent = msg;
  el.classList.add("is-on");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.remove("is-on"), 2200);
}

function renderHoje() {
  $("#view-hoje").innerHTML = `
    <h1 class="page-title">Hoje</h1>
    <p class="page-sub">${new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" })}</p>
    <div class="room-list">
      ${rooms
        .map(
          (r) => `
        <article class="room ${r.house ? "is-house" : ""} ${r.status === "busy" ? "is-busy" : ""}">
          <div>
            <div class="meta">${r.id} · ${r.specialty}</div>
            <h3>${r.name}</h3>
          </div>
          <span class="pill ${r.pillLive ? "is-live" : ""} ${r.pillFree ? "is-free" : ""}">${r.pill}</span>
          <div class="patient">${r.patient}</div>
        </article>`
        )
        .join("")}
    </div>
    <h2 class="section-label">Fila da recepção</h2>
    ${queue
      .map(
        (q) => `
      <div class="row">
        <div class="avatar">${q.initials}</div>
        <div class="body"><strong>${q.name}</strong><span>${q.detail}</span></div>
        <time>${q.time}</time>
        <button class="btn-checkin" type="button" data-name="${q.name}">Check-in</button>
      </div>`
      )
      .join("")}
  `;
}

function renderAgenda() {
  $("#view-agenda").innerHTML = `
    <h1 class="page-title">Agenda</h1>
    <p class="page-sub">Uma sala por vez · as outras secretárias veem o mesmo quadro</p>
    <div class="chips" id="room-chips">
      ${rooms
        .map(
          (r, i) =>
            `<button class="chip ${i === 0 ? "is-on" : ""}" type="button" data-room="${r.id}">${r.id} ${r.name}</button>`
        )
        .join("")}
    </div>
    <div class="timeline">
      ${slots
        .map(
          (s) => `
        <div class="slot">
          <time>${s.time}</time>
          <div class="block ${s.empty ? "is-empty" : ""}">${
            s.empty ? "Horário livre" : `<strong>${s.name}</strong><span>${s.detail}</span>`
          }</div>
        </div>`
        )
        .join("")}
    </div>
  `;
}

function renderPacientes(filter = "") {
  const q = filter.trim().toLowerCase();
  const list = patients.filter(
    (p) => !q || p.name.toLowerCase().includes(q) || p.detail.toLowerCase().includes(q)
  );
  $("#view-pacientes").innerHTML = `
    <h1 class="page-title">Pacientes</h1>
    <p class="page-sub">Cadastro da casa · prontuário não aparece aqui</p>
    <div class="search">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3-3"/></svg>
      <input id="patient-q" type="search" placeholder="Nome ou especialidade" value="${filter.replace(/"/g, "&quot;")}" />
    </div>
    ${list
      .map(
        (p) => `
      <div class="row">
        <div class="avatar">${p.initials}</div>
        <div class="body"><strong>${p.name}</strong><span>${p.detail}</span></div>
      </div>`
      )
      .join("")}
  `;
  const input = $("#patient-q");
  if (input) {
    input.addEventListener("input", () => renderPacientes(input.value));
  }
}

function renderMais() {
  const standalone =
    window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone;
  $("#view-mais").innerHTML = `
    <h1 class="page-title">Mais</h1>
    <p class="page-sub">Instalação e atalhos da recepção</p>
    <div class="menu-card">
      ${
        standalone
          ? ""
          : `<button class="menu-item install-only" id="btn-install" type="button">Instalar no celular <span class="chev">›</span></button>`
      }
      <button class="menu-item" id="btn-copa" type="button">Estoque da copa <span class="chev">›</span></button>
      <button class="menu-item" id="btn-logout" type="button">Sair <span class="chev">›</span></button>
    </div>
    ${
      standalone
        ? ""
        : `<div class="ios-hint">
            No iPhone: toque em Compartilhar e depois em <strong>Adicionar à Tela de Início</strong>.
            No Android: use o botão Instalar ou o menu do Chrome.
          </div>`
    }
  `;

  $("#btn-copa")?.addEventListener("click", () => toast("Copa entra no próximo ciclo · saldo simples, sem lote"));
  $("#btn-logout")?.addEventListener("click", logout);
  $("#btn-install")?.addEventListener("click", async () => {
    if (installPrompt) {
      installPrompt.prompt();
      await installPrompt.userChoice;
      installPrompt = null;
      toast("Atalho criado na tela inicial");
      return;
    }
    toast("No iPhone: Compartilhar → Adicionar à Tela de Início");
  });
}

function showView(name) {
  $$(".view").forEach((v) => v.classList.toggle("is-on", v.id === `view-${name}`));
  $$(".tab").forEach((t) => t.classList.toggle("is-on", t.dataset.view === name));
  location.hash = name;
  if (name === "hoje") renderHoje();
  if (name === "agenda") renderAgenda();
  if (name === "pacientes") renderPacientes();
  if (name === "mais") renderMais();
}

function enterApp() {
  $("#screen-login").classList.remove("is-on");
  $("#screen-app").classList.add("is-on");
  sessionStorage.setItem("florescer.session", "1");
  const initial = (location.hash || "#hoje").replace("#", "");
  showView(["hoje", "agenda", "pacientes", "mais"].includes(initial) ? initial : "hoje");
}

function logout() {
  sessionStorage.removeItem("florescer.session");
  $("#screen-app").classList.remove("is-on");
  $("#screen-login").classList.add("is-on");
}

function boot() {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    installPrompt = e;
  });

  setTimeout(() => {
    $("#splash").classList.add("is-gone");
    if (sessionStorage.getItem("florescer.session")) enterApp();
    else $("#screen-login").classList.add("is-on");
  }, 900);

  $("#btn-login").addEventListener("click", () => {
    const login = ($("#email").value || "").trim().toLowerCase();
    const password = $("#password").value || "";
    const ok =
      password === "florescer" &&
      (login === "secretaria@florescer.clinica" ||
        login === "medica@florescer.clinica" ||
        login === "admin@florescer.clinica" ||
        login === "paciente@florescer.clinica");
    if (!ok) {
      toast("Login ou senha inválidos");
      return;
    }
    enterApp();
  });
  $("#link-criar")?.addEventListener("click", (e) => {
    e.preventDefault();
    toast("Criar conta é só para pacientes. A recepção confirma o cadastro.");
  });
  $("#password").addEventListener("keydown", (e) => {
    if (e.key === "Enter") enterApp();
  });

  $$(".tab").forEach((tab) => {
    tab.addEventListener("click", () => showView(tab.dataset.view));
  });

  document.addEventListener("click", (e) => {
    const btn = e.target.closest(".btn-checkin");
    if (btn) toast(`Check-in de ${btn.dataset.name}`);
    const chip = e.target.closest(".chip");
    if (chip) {
      $$(".chip").forEach((c) => c.classList.remove("is-on"));
      chip.classList.add("is-on");
    }
  });

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./sw.js");
  }
}

boot();
