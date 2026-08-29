(function(){
  "use strict";

  var STORAGE_KEY = "livro-caixa-dados-v2";
  var CURRENT_SCHEMA_VERSION = 2;
  var MONTH_NAMES = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];

  var currentUser = null;

  function getTodayMonthKey() {
    var now = new Date();
    var y = now.getFullYear();
    var m = now.getMonth() + 1;
    return y + "-" + (m < 10 ? "0" + m : "" + m);
  }

  function monthLabel(key){
    var parts = key.split("-");
    var y = parts[0], m = parseInt(parts[1],10)-1;
    return MONTH_NAMES[m] + "/" + y;
  }

  function monthShort(key){
    var parts = key.split("-");
    var m = parseInt(parts[1],10)-1;
    return MONTH_NAMES[m].slice(0,3) + "/" + parts[0].slice(2);
  }

  function seedData(){
    var currentKey = getTodayMonthKey();
    var months = [
      currentKey, "2026-09", "2026-10", "2026-11", "2026-12",
      "2027-01", "2027-02", "2027-03"
    ];
    months = months.filter(function(v, i, a) { return a.indexOf(v) === i; }).sort();

    var expenses = [
      { id:"e1", day:5, item:"Aluguel e Condomínio", values:{"2026-08":1200,"2026-09":1200,"2026-10":1200,"2026-11":1200,"2026-12":1200,"2027-01":1200,"2027-02":1200,"2027-03":1200} },
      { id:"e2", day:10, item:"Energia e Água", values:{"2026-08":250,"2026-09":280,"2026-10":240,"2026-11":260,"2026-12":300,"2027-01":290,"2027-02":270,"2027-03":250} },
      { id:"e3", day:12, item:"Internet e Celular", values:{"2026-08":120,"2026-09":120,"2026-10":120,"2026-11":120,"2026-12":120,"2027-01":120,"2027-02":120,"2027-03":120} },
      { id:"e4", day:15, item:"Supermercado", values:{"2026-08":850,"2026-09":900,"2026-10":820,"2026-11":880,"2026-12":1100,"2027-01":800,"2027-02":850,"2027-03":870} },
      { id:"e5", day:20, item:"Cartão de Crédito", values:{"2026-08":450,"2026-09":620,"2026-10":380,"2026-11":510,"2026-12":890,"2027-01":400,"2027-02":430,"2027-03":490} }
    ];
    var income = [
      { id:"r1", day:5, item:"Salário", values:{"2026-08":3500,"2026-09":3500,"2026-10":3500,"2026-11":3500,"2026-12":3500,"2027-01":3500,"2027-02":3500,"2027-03":3500} },
      { id:"r2", day:15, item:"Serviços Extra / Freelance", values:{"2026-08":600,"2026-09":450,"2026-10":800,"2026-11":300,"2026-12":1200,"2027-01":500,"2027-02":650,"2027-03":400} },
      { id:"r3", day:25, item:"Rendimentos / Outros", values:{"2026-08":150,"2026-09":150,"2026-10":160,"2026-11":155,"2026-12":170,"2027-01":165,"2027-02":175,"2027-03":180} }
    ];
    return { version: CURRENT_SCHEMA_VERSION, months: months, selectedMonth: currentKey, expenses: expenses, income: income, nextId: 100 };
  }

  function emptyData(){
    var currentKey = getTodayMonthKey();
    return { version: CURRENT_SCHEMA_VERSION, months: [currentKey], selectedMonth: currentKey, expenses: [], income: [], nextId: 1 };
  }

  var state = null;
  var saveTimer = null;

  var hasNativeStorage = (typeof window.storage !== 'undefined' && window.storage && typeof window.storage.get === 'function');

  function storageGet(key){
    if(hasNativeStorage){
      return window.storage.get(key, false)
        .then(function(res){ return res ? res.value : null; })
        .catch(function(){ return null; });
    }
    try{
      return Promise.resolve(window.localStorage.getItem(key));
    }catch(e){
      return Promise.resolve(null);
    }
  }

  function storageSet(key, value){
    if(hasNativeStorage){
      return window.storage.set(key, value, false)
        .then(function(res){ return !!res; })
        .catch(function(){ return false; });
    }
    try{
      window.localStorage.setItem(key, value);
      return Promise.resolve(true);
    }catch(e){
      return Promise.resolve(false);
    }
  }

  function nextMonthKey(key){
    var parts = key.split("-");
    var y = parseInt(parts[0],10), m = parseInt(parts[1],10);
    m += 1;
    if(m > 12){ m = 1; y += 1; }
    return y + "-" + (m < 10 ? "0"+m : ""+m);
  }

  function fmtMoney(v){
    return (v||0).toLocaleString('pt-BR', { style:'currency', currency:'BRL' });
  }

  function flagSave(){
    var el = document.getElementById('saveFlag');
    if(el) {
      el.classList.add('show');
      clearTimeout(el._t);
      el._t = setTimeout(function(){ el.classList.remove('show'); }, 1100);
    }
  }

  // --- TOASTS ---
  var toastStack = document.getElementById('toastStack');

  function showToast(message, type, duration){
    if(!toastStack){ return; }
    type = type || 'info';
    duration = duration || 4200;
    var el = document.createElement('div');
    el.className = 'toast ' + type;
    el.textContent = message;
    el.title = 'Clique para fechar';
    el.addEventListener('click', function(){ dismissToast(el); });
    toastStack.appendChild(el);
    requestAnimationFrame(function(){ el.classList.add('show'); });
    el._timer = setTimeout(function(){ dismissToast(el); }, duration);
    return el;
  }

  function dismissToast(el){
    if(!el || !el.parentNode) return;
    clearTimeout(el._timer);
    el.classList.remove('show');
    setTimeout(function(){ if(el.parentNode) el.parentNode.removeChild(el); }, 220);
  }

  // --- MODAL ---
  var modalOverlay = document.getElementById('modalOverlay');
  var modalTitleEl = document.getElementById('modalTitle');
  var modalMessageEl = document.getElementById('modalMessage');
  var modalActionsEl = document.getElementById('modalActions');
  var modalResolve = null;

  function closeModalWith(result){
    if(modalOverlay) modalOverlay.classList.remove('open');
    if(modalResolve){
      var resolve = modalResolve;
      modalResolve = null;
      resolve(result);
    }
  }

  if(modalOverlay){
    modalOverlay.addEventListener('click', function(e){
      if(e.target === modalOverlay) closeModalWith(false);
    });
  }
  document.addEventListener('keydown', function(e){
    if(e.key === 'Escape' && modalOverlay && modalOverlay.classList.contains('open')){
      closeModalWith(false);
    }
  });

  function showConfirm(message, opts){
    opts = opts || {};
    return new Promise(function(resolve){
      if(!modalOverlay){ resolve(window.confirm(message)); return; }
      modalResolve = resolve;
      if(modalTitleEl) modalTitleEl.textContent = opts.title || 'Confirmar';
      if(modalMessageEl) modalMessageEl.textContent = message;
      if(modalActionsEl){
        modalActionsEl.innerHTML = '';

        var cancelBtn = document.createElement('button');
        cancelBtn.type = 'button';
        cancelBtn.className = 'modal-btn secondary';
        cancelBtn.textContent = opts.cancelLabel || 'Cancelar';
        cancelBtn.addEventListener('click', function(){ closeModalWith(false); });

        var confirmBtn = document.createElement('button');
        confirmBtn.type = 'button';
        confirmBtn.className = 'modal-btn ' + (opts.danger ? 'danger' : 'primary');
        confirmBtn.textContent = opts.confirmLabel || 'Confirmar';
        confirmBtn.addEventListener('click', function(){ closeModalWith(true); });

        modalActionsEl.appendChild(cancelBtn);
        modalActionsEl.appendChild(confirmBtn);
      }
      modalOverlay.classList.add('open');
    });
  }

  // --- BOTÕES COM CARREGAMENTO ---
  function setBtnLoading(btn, loading, loadingLabel){
    if(!btn) return;
    var spinner = btn.querySelector('.btn-spinner');
    var label = btn.querySelector('.btn-label');
    btn.disabled = loading;
    if(spinner) spinner.hidden = !loading;
    if(label){
      if(loading){
        if(label.dataset.originalText === undefined) label.dataset.originalText = label.textContent;
        if(loadingLabel) label.textContent = loadingLabel;
      } else if(label.dataset.originalText !== undefined){
        label.textContent = label.dataset.originalText;
      }
    }
  }

  // --- MODO CLARO / ESCURO ---
  var THEME_STORAGE_KEY = 'saldo_theme';

  function getCurrentTheme(){
    return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
  }

  function applyTheme(theme){
    document.documentElement.setAttribute('data-theme', theme);
    try{ localStorage.setItem(THEME_STORAGE_KEY, theme); }catch(e){}

    var metaThemeColor = document.getElementById('themeColorMeta');
    if (metaThemeColor) {
      metaThemeColor.setAttribute('content', theme === 'dark' ? '#1a2421' : '#f8fafc');
    }

    var toggles = document.querySelectorAll('.theme-toggle-btn');
    for(var i = 0; i < toggles.length; i++){
      toggles[i].setAttribute('aria-pressed', theme === 'dark' ? 'true' : 'false');
      var label = toggles[i].querySelector('.theme-toggle-label');
      if(label) label.textContent = theme === 'dark' ? 'Modo claro' : 'Modo escuro';
    }
  }

  var themeToggleBtns = document.querySelectorAll('.theme-toggle-btn');
  for(var ttIdx = 0; ttIdx < themeToggleBtns.length; ttIdx++){
    themeToggleBtns[ttIdx].addEventListener('click', function(){
      applyTheme(getCurrentTheme() === 'dark' ? 'light' : 'dark');
    });
  }
  
  var currentSavedTheme = getCurrentTheme();
  applyTheme(currentSavedTheme);

  // --- INTEGRAÇÃO COM A NUVEM ---
  var lastCloudErrorToastAt = 0;

  function saveToCloud() {
    if (!currentUser || !currentUser.token) return;
    fetch('/api/sync', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': currentUser.token
      },
      body: JSON.stringify(state)
    }).then(function(res){
      if(!res.ok) throw new Error('sync-failed');
    }).catch(function(err){
      console.error("Erro ao salvar na nuvem:", err);
      var now = Date.now();
      if(now - lastCloudErrorToastAt > 10000){
        lastCloudErrorToastAt = now;
        showToast('Não foi possível sincronizar com a nuvem agora. Suas alterações continuam salvas neste dispositivo.', 'error');
      }
    });
  }

  function loadFromCloud() {
    if (!currentUser || !currentUser.token) {
      return Promise.resolve(false);
    }
    return fetch('/api/sync', {
      method: 'GET',
      headers: {
        'Authorization': currentUser.token
      }
    }).then(function(res){
      if(res.status === 401 || res.status === 403) {
        localStorage.removeItem('saldo_token');
        localStorage.removeItem('saldo_user_name');
        localStorage.removeItem('saldo_user_first_name');
        currentUser = null;
        updateAccountUI();
        showToast('Sua sessão expirou. Faça login novamente para sincronizar.', 'error');
        return null;
      }
      if(res.ok) return res.json();
      return null;
    }).then(function(cloudData){
      if(cloudData){
        state = cloudData;
        ensureCurrentMonthSelected();
        render();
        return true;
      }
      return false;
    }).catch(function(err){
      console.error("Erro ao carregar dados da nuvem:", err);
      return false;
    });
  }

  function persist(){
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function(){
      storageSet(STORAGE_KEY, JSON.stringify(state)).then(function(ok){
        if(ok) flagSave();
      }).catch(function(err){ console.error("Erro ao salvar localmente:", err); });

      if (currentUser && currentUser.token) {
        saveToCloud();
      }
    }, 250);
  }

  function sumMonth(list, monthKey){
    var total = 0, count = 0;
    for(var i=0;i<list.length;i++){
      var v = list[i].values[monthKey];
      if(typeof v === 'number' && !isNaN(v)){ total += v; count++; }
    }
    return { total: total, count: count };
  }

  function ensureCurrentMonthSelected() {
    var todayKey = getTodayMonthKey();
    if (!state.months || state.months.length === 0) {
      state.months = [todayKey];
    }
    if (state.months.indexOf(todayKey) === -1) {
      state.months.push(todayKey);
      state.months.sort();
    }
    if (!state.selectedMonth) {
      state.selectedMonth = todayKey;
    }
  }

  function removeMonth(mk) {
    showConfirm("Tem certeza que deseja apagar o mês " + monthLabel(mk) + "?", { title: 'Apagar mês', confirmLabel: 'Apagar', danger: true }).then(function(ok){
      if(!ok) return;
      var idx = state.months.indexOf(mk);
      if (idx > -1) {
        state.months.splice(idx, 1);
        state.expenses.forEach(function(e) { delete e.values[mk]; });
        state.income.forEach(function(i) { delete i.values[mk]; });

        if (state.months.length === 0) {
          var todayKey = getTodayMonthKey();
          state.months.push(todayKey);
          state.selectedMonth = todayKey;
        } else if (state.selectedMonth === mk) {
          state.selectedMonth = state.months[Math.max(0, idx - 1)];
        }
        persist();
        render();
      }
    });
  }

  function render(){
    renderTabs();
    renderPanel();
    renderTable('expenses');
    renderTable('income');
  }

  function renderTabs(){
    var row = document.getElementById('tabsRow');
    if(!row) return;
    row.innerHTML = "";

    state.months.forEach(function(mk){
      var btn = document.createElement('button');
      btn.className = 'tab' + (mk === state.selectedMonth ? ' active' : '');
      btn.title = monthLabel(mk);

      var labelSpan = document.createElement('span');
      labelSpan.textContent = monthShort(mk);
      btn.appendChild(labelSpan);

      var closeBtn = document.createElement('span');
      closeBtn.className = 'tab-close';
      closeBtn.innerHTML = '&times;';
      closeBtn.title = 'Apagar mês';
      closeBtn.addEventListener('click', function(e){
        e.stopPropagation();
        removeMonth(mk);
      });
      btn.appendChild(closeBtn);

      btn.addEventListener('click', function(){
        state.selectedMonth = mk;
        render();
      });
      row.appendChild(btn);
    });

    var addBtn = document.createElement('button');
    addBtn.className = 'tab-add';
    addBtn.textContent = '+';
    addBtn.title = 'Adicionar próximo mês';
    addBtn.addEventListener('click', function(){
      var last = state.months[state.months.length-1];
      var nk = nextMonthKey(last);
      if(state.months.indexOf(nk) === -1){
        state.months.push(nk);
        state.selectedMonth = nk;
        persist();
        render();
      }
    });
    row.appendChild(addBtn);
  }

  function renderPanel(){
    var mk = state.selectedMonth;
    var exp = sumMonth(state.expenses, mk);
    var inc = sumMonth(state.income, mk);
    var saldo = inc.total - exp.total;

    var elExp = document.getElementById('statDespesas');
    if(elExp) elExp.textContent = fmtMoney(exp.total);

    var elExpCount = document.getElementById('statDespesasCount');
    if(elExpCount) elExpCount.textContent = exp.count + (exp.count===1?' item':' itens') + ' em ' + monthLabel(mk);

    var elInc = document.getElementById('statReceitas');
    if(elInc) elInc.textContent = fmtMoney(inc.total);

    var elIncCount = document.getElementById('statReceitasCount');
    if(elIncCount) elIncCount.textContent = inc.count + (inc.count===1?' item':' itens') + ' em ' + monthLabel(mk);

    var saldoEl = document.getElementById('statSaldo');
    if(saldoEl) {
      saldoEl.textContent = fmtMoney(saldo);
      saldoEl.classList.toggle('pos', saldo >= 0);
      saldoEl.classList.toggle('neg', saldo < 0);
    }

    var elSub = document.getElementById('statSaldoSub');
    if(elSub) elSub.textContent = saldo >= 0 ? 'positivo' : 'negativo';

    var elExpHead = document.getElementById('expTotalHead');
    if(elExpHead) elExpHead.textContent = fmtMoney(exp.total);

    var elIncHead = document.getElementById('incTotalHead');
    if(elIncHead) elIncHead.textContent = fmtMoney(inc.total);
  }

  function renderTable(kind){
    var rawList = kind === 'expenses' ? state.expenses : state.income;
    var body = document.getElementById(kind === 'expenses' ? 'expensesBody' : 'incomeBody');
    if(!body) return;
    body.innerHTML = "";

    var list = rawList.slice().sort(function(a, b){
      var da = (a.day === null || a.day === undefined || isNaN(a.day)) ? 999 : a.day;
      var db = (b.day === null || b.day === undefined || isNaN(b.day)) ? 999 : b.day;
      return da - db;
    });

    if(list.length === 0){
      var tr = document.createElement('tr');
      var td = document.createElement('td');
      td.colSpan = 4;
      td.className = 'empty-note';
      td.textContent = 'Nenhum item ainda.';
      tr.appendChild(td);
      body.appendChild(tr);
      return;
    }

    list.forEach(function(row){
      var tr = document.createElement('tr');

      var tdDay = document.createElement('td');
      var dayInput = document.createElement('input');
      dayInput.type = 'number';
      dayInput.min = 1; dayInput.max = 31;
      dayInput.className = 'cell-input day-input';
      dayInput.placeholder = '—';
      dayInput.value = (row.day === null || row.day === undefined) ? '' : row.day;
      dayInput.addEventListener('change', function(){
        var v = parseInt(dayInput.value,10);
        row.day = isNaN(v) ? null : Math.max(1, Math.min(31, v));
        persist();
        renderTable(kind);
      });
      tdDay.appendChild(dayInput);

      var tdItem = document.createElement('td');
      var itemInput = document.createElement('input');
      itemInput.type = 'text';
      itemInput.className = 'cell-input item-input';
      itemInput.placeholder = 'nome do item';
      itemInput.value = row.item || '';
      itemInput.addEventListener('change', function(){
        row.item = itemInput.value;
        persist();
      });
      tdItem.appendChild(itemInput);

      var tdVal = document.createElement('td');
      var valInput = document.createElement('input');
      valInput.type = 'number';
      valInput.step = '0.01';
      valInput.className = 'cell-input value-input';
      valInput.placeholder = 'R$ —';
      var curVal = row.values[state.selectedMonth];
      valInput.value = (typeof curVal === 'number' && !isNaN(curVal)) ? curVal : '';
      valInput.addEventListener('change', function(){
        var v = parseFloat(valInput.value);
        if(isNaN(v) || valInput.value === ''){
          delete row.values[state.selectedMonth];
        } else {
          row.values[state.selectedMonth] = v;
        }
        persist();
        renderPanel();
      });
      tdVal.appendChild(valInput);

      var tdDel = document.createElement('td');
      var delBtn = document.createElement('button');
      delBtn.className = 'row-del';
      delBtn.title = 'Remover item';
      delBtn.textContent = '×';
      delBtn.addEventListener('click', function(){
        var targetArray = kind === 'expenses' ? state.expenses : state.income;
        var idx = targetArray.indexOf(row);
        if(idx > -1) {
          targetArray.splice(idx, 1);
        }
        persist();
        render();
      });
      tdDel.appendChild(delBtn);

      tr.appendChild(tdDay);
      tr.appendChild(tdItem);
      tr.appendChild(tdVal);
      tr.appendChild(tdDel);
      body.appendChild(tr);
    });
  }

  function addRow(kind){
    var list = kind === 'expenses' ? state.expenses : state.income;
    var id = (kind === 'expenses' ? 'e' : 'r') + (state.nextId++);
    list.push({ id:id, day:null, item:'', values:{} });
    persist();
    render();
    setTimeout(function(){
      var body = document.getElementById(kind === 'expenses' ? 'expensesBody' : 'incomeBody');
      if(body) {
        var inputs = body.querySelectorAll('.item-input');
        if(inputs.length) inputs[inputs.length-1].focus();
      }
    }, 30);
  }

  var btnAddExpense = document.getElementById('addExpenseBtn');
  if(btnAddExpense) btnAddExpense.addEventListener('click', function(){ addRow('expenses'); });

  var btnAddIncome = document.getElementById('addIncomeBtn');
  if(btnAddIncome) btnAddIncome.addEventListener('click', function(){ addRow('income'); });

  var btnReset = document.getElementById('resetBtn');
  if(btnReset) {
    btnReset.addEventListener('click', function(){
      showConfirm('Isso vai carregar os dados genéricos de exemplo. Deseja continuar?', { title: 'Carregar exemplo', confirmLabel: 'Carregar' }).then(function(ok){
        if(!ok) return;
        state = seedData();
        ensureCurrentMonthSelected();
        persist();
        render();
      });
    });
  }

  var btnClear = document.getElementById('clearBtn');
  if(btnClear) {
    btnClear.addEventListener('click', function(){
      showConfirm('Certeza de que deseja limpar todos os registros e começar um livro-caixa em branco?', { title: 'Limpar tudo', confirmLabel: 'Limpar', danger: true }).then(function(ok){
        if(!ok) return;
        state = emptyData();
        persist();
        render();
      });
    });
  }

  var viewTriggers = document.querySelectorAll('.view-trigger');
  var contaTabBtn = document.getElementById('contaTabBtn');
  var sheetOverlay = document.getElementById('sheetOverlay');

  var viewMensal = document.getElementById('viewMensal');
  var viewAnual = document.getElementById('viewAnual');
  var viewAuth = document.getElementById('viewAuth');

  function openSheet(){
    if(sheetOverlay) sheetOverlay.classList.add('open');
  }
  function closeSheet(){
    if(sheetOverlay) sheetOverlay.classList.remove('open');
  }
  if(contaTabBtn){
    contaTabBtn.addEventListener('click', function(){
      if(sheetOverlay) {
        sheetOverlay.classList.contains('open') ? closeSheet() : openSheet();
      }
    });
  }
  if(sheetOverlay){
    sheetOverlay.addEventListener('click', function(e){
      if(e.target === sheetOverlay) closeSheet();
    });
  }

  var pageTitle = document.getElementById('pageTitle');
  var pageSub = document.getElementById('pageSub');

function showView(view){
    if(viewMensal) viewMensal.style.display = 'none';
    if(viewAnual) viewAnual.style.display = 'none';
    if(viewAuth) viewAuth.style.display = 'none';

    var topBar = document.querySelector('.top-bar');
    var footerEl = document.querySelector('footer') || document.querySelector('.app-footer') || document.querySelector('.footer');

    // Esconde o rodapé e o cabeçalho superior na tela de autenticação
    if (footerEl) {
      footerEl.style.display = (view === 'auth') ? 'none' : '';
    }
    if (topBar) {
      topBar.style.display = (view === 'auth') ? 'none' : '';
    }

    for(var vi = 0; vi < viewTriggers.length; vi++){ viewTriggers[vi].classList.remove('active'); }
    if(contaTabBtn) contaTabBtn.classList.remove('active');

    function activateTriggers(v){
      for(var i = 0; i < viewTriggers.length; i++){
        if(viewTriggers[i].getAttribute('data-view') === v) viewTriggers[i].classList.add('active');
      }
    }

    if(view === 'anual'){
      if(viewAnual) viewAnual.style.display = 'block';
      activateTriggers('anual');
      if(pageTitle) pageTitle.textContent = 'Resumo anual';
      if(pageSub) pageSub.textContent = 'Total de despesas e receitas, separado por ano.';
      renderAnual();
    } else if(view === 'auth'){
      if(viewAuth) viewAuth.style.display = 'block';
      activateTriggers('auth');
      if(contaTabBtn) contaTabBtn.classList.add('active');
      
      var authSub = document.getElementById('authCardSub');
      if(authSub) {
        authSub.textContent = currentUser ? ('Conectado como ' + currentUser.name) : 'Faça login ou cadastre-se para sincronizar seus dados.';
      }
    } else {
      if(viewMensal) viewMensal.style.display = 'block';
      activateTriggers('mensal');
      if(pageTitle) pageTitle.textContent = 'Controle mensal';
      if(pageSub) pageSub.textContent = 'Despesas e receitas, mês a mês. Clique em qualquer campo para editar.';
      render();
    }
    closeSheet();

    // Rola a página para o topo ao trocar de tela
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  for(var vt = 0; vt < viewTriggers.length; vt++){
    (function(btn){
      btn.addEventListener('click', function(){ showView(btn.getAttribute('data-view')); });
    })(viewTriggers[vt]);
  }

  // --- AUTENTICAÇÃO E FORMULÁRIOS ---
  var tabLogin = document.getElementById('tabLogin');
  var tabRegister = document.getElementById('tabRegister');
  var formLogin = document.getElementById('formLogin');
  var formRegister = document.getElementById('formRegister');

  if(tabLogin) {
    tabLogin.addEventListener('click', function(){
      tabLogin.classList.add('active');
      if(tabRegister) tabRegister.classList.remove('active');
      if(formLogin) formLogin.style.display = 'flex';
      if(formRegister) formRegister.style.display = 'none';
    });
  }

  if(tabRegister) {
    tabRegister.addEventListener('click', function(){
      tabRegister.classList.add('active');
      if(tabLogin) tabLogin.classList.remove('active');
      if(formRegister) formRegister.style.display = 'flex';
      if(formLogin) formLogin.style.display = 'none';
    });
  }

  if(formLogin) {
    formLogin.addEventListener('submit', function(e){
      e.preventDefault();
      var loginSubmitBtn = document.getElementById('loginSubmitBtn');
      var inputs = formLogin.querySelectorAll('input');
      var email = inputs[0].value;
      var password = inputs[1].value;

      setBtnLoading(loginSubmitBtn, true, 'Entrando...');

      fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email, password: password })
      })
      .then(function(res){ 
        return res.json().catch(function(){ 
          throw new Error('Resposta do servidor inválida'); 
        }); 
      })
      .then(function(data){
        if(data.success) {
          currentUser = { token: data.token, name: data.name, firstName: data.firstName || (data.name || '').split(' ')[0] };
          localStorage.setItem('saldo_token', data.token);
          localStorage.setItem('saldo_user_name', currentUser.name);
          localStorage.setItem('saldo_user_first_name', currentUser.firstName);
          updateAccountUI();
          showToast('Login efetuado com sucesso!', 'success');
          setBtnLoading(loginSubmitBtn, true, 'Sincronizando...');
          return loadFromCloud().then(function(){
            showView('mensal');
          });
        } else {
          showToast(data.error || 'Falha no login', 'error');
        }
      })
      .catch(function(err){
        showToast(err.message === 'Resposta do servidor inválida' ? 'Erro interno no servidor (500).' : 'Erro ao conectar ao servidor.', 'error');
      })
      .finally(function(){
        setBtnLoading(loginSubmitBtn, false);
      });
    });
  }

  if(formRegister) {
    formRegister.addEventListener('submit', function(e){
      e.preventDefault();
      var registerSubmitBtn = document.getElementById('registerSubmitBtn');
      var firstNameInput = document.getElementById('regFirstName');
      var lastNameInput = document.getElementById('regLastName');
      var firstName = (firstNameInput ? firstNameInput.value : '').trim();
      var lastName = (lastNameInput ? lastNameInput.value : '').trim();
      var name = (firstName + ' ' + lastName).trim();
      var email = document.getElementById('regEmail').value;
      var password = document.getElementById('regPassword').value;

      setBtnLoading(registerSubmitBtn, true, 'Criando conta...');

      fetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name, firstName: firstName, lastName: lastName, email: email, password: password })
      })
      .then(function(res){ 
        return res.json().catch(function(){ 
          throw new Error('Resposta do servidor inválida'); 
        }); 
      })
      .then(function(data){
        if(data.success) {
          currentUser = { token: data.token, name: data.name || name, firstName: data.firstName || firstName };
          localStorage.setItem('saldo_token', data.token);
          localStorage.setItem('saldo_user_name', currentUser.name);
          localStorage.setItem('saldo_user_first_name', currentUser.firstName);
          showToast('Cadastro realizado com sucesso!', 'success');
          saveToCloud();
          updateAccountUI();
          showView('mensal');
        } else {
          showToast(data.error || 'Falha no cadastro', 'error');
        }
      })
      .catch(function(err){
        showToast(err.message === 'Resposta do servidor inválida' ? 'Erro interno no servidor (500).' : 'Erro ao conectar ao servidor.', 'error');
      })
      .finally(function(){
        setBtnLoading(registerSubmitBtn, false);
      });
    });
  }

  function updateAccountUI(){
    var loggedIn = !!(currentUser && currentUser.token);
    var displayName = loggedIn ? (currentUser.firstName || (currentUser.name || '').split(' ')[0] || 'Conta') : '';

    var entryBtns = document.querySelectorAll('.auth-entry-btn');
    for(var i = 0; i < entryBtns.length; i++){
      entryBtns[i].style.display = loggedIn ? 'none' : 'flex';
    }

    var loggedBtns = document.querySelectorAll('.account-logged-btn');
    for(var j = 0; j < loggedBtns.length; j++){
      loggedBtns[j].style.display = loggedIn ? 'flex' : 'none';
      var nameEl = loggedBtns[j].querySelector('.account-logged-name');
      if(nameEl) nameEl.textContent = displayName;
    }
  }

  function doLogout(){
    currentUser = null;
    localStorage.removeItem('saldo_token');
    localStorage.removeItem('saldo_user_name');
    localStorage.removeItem('saldo_user_first_name');
    updateAccountUI();
    closeSheet();
    showView('mensal');
  }

  var logoutBtns = document.querySelectorAll('.account-logout-btn');
  for(var lb = 0; lb < logoutBtns.length; lb++){
    logoutBtns[lb].addEventListener('click', doLogout);
  }

  var navExportBtns = document.querySelectorAll('.action-export');
  var navImportBtns = document.querySelectorAll('.action-import');
  var importFile = document.getElementById('importFile');

  function doExport(){
    try{
      var dataStr = JSON.stringify(state, null, 2);
      var blob = new Blob([dataStr], { type: 'application/json' });
      var url = URL.createObjectURL(blob);
      var now = new Date();
      var pad = function(n){ return n < 10 ? '0'+n : ''+n; };
      var stamp = now.getFullYear() + '-' + pad(now.getMonth()+1) + '-' + pad(now.getDate());
      var a = document.createElement('a');
      a.href = url;
      a.download = 'saldo-simples-backup-' + stamp + '.json';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(function(){ URL.revokeObjectURL(url); }, 500);
    }catch(err){
      showToast('Não foi possível exportar os dados.', 'error');
    }
    closeSheet();
  }
  for(var ei = 0; ei < navExportBtns.length; ei++){
    navExportBtns[ei].addEventListener('click', doExport);
  }

  if(navImportBtns.length && importFile) {
    for(var ii = 0; ii < navImportBtns.length; ii++){
      navImportBtns[ii].addEventListener('click', function(){
        importFile.value = '';
        importFile.click();
      });
    }

    importFile.addEventListener('change', function(e){
      var file = e.target.files && e.target.files[0];
      if(!file) return;
      var reader = new FileReader();
      reader.onload = function(ev){
        try{
          var parsed = JSON.parse(ev.target.result);
          var valid = parsed && Array.isArray(parsed.months) && Array.isArray(parsed.expenses) && Array.isArray(parsed.income);
          if(!valid){
            showToast('Arquivo inválido. Verifique se é um backup do Saldo Simples.', 'error');
            return;
          }
          showConfirm('Isso vai substituir todos os dados atuais pelos dados do arquivo importado. Deseja continuar?', { title: 'Importar backup', confirmLabel: 'Importar', danger: true }).then(function(ok){
            if(!ok) return;
            parsed.version = CURRENT_SCHEMA_VERSION;
            state = parsed;
            ensureCurrentMonthSelected();
            persist();
            render();
            closeSheet();
          });
        }catch(err){
          showToast('Não foi possível ler o arquivo. Verifique se é um JSON válido.', 'error');
        }
      };
      reader.readAsText(file);
    });
  }

  function renderAnual(){
    var container = document.getElementById('anualYears');
    if(!container) return;
    container.innerHTML = "";

    var years = [];
    state.months.forEach(function(mk){
      var y = mk.slice(0,4);
      if(years.indexOf(y) === -1) years.push(y);
    });
    years.sort();

    if(years.length === 0){
      container.innerHTML = '<div class="anual-empty">Nenhum mês cadastrado ainda.</div>';
    }

    var geralDespesas = 0, geralReceitas = 0;

    years.forEach(function(year){
      var monthsInYear = state.months.filter(function(mk){ return mk.slice(0,4) === year; });

      var expItems = sumItemsByYear(state.expenses, monthsInYear);
      var incItems = sumItemsByYear(state.income, monthsInYear);
      var expTotal = expItems.reduce(function(s,i){ return s+i.total; }, 0);
      var incTotal = incItems.reduce(function(s,i){ return s+i.total; }, 0);
      var saldo = incTotal - expTotal;

      geralDespesas += expTotal;
      geralReceitas += incTotal;

      var card = document.createElement('div');
      card.className = 'year-card';

      var head = document.createElement('div');
      head.className = 'year-head';
      head.innerHTML =
        '<h3 class="year-title">' + year + '</h3>' +
        '<span class="year-saldo ' + (saldo >= 0 ? 'pos' : 'neg') + '">' + fmtMoney(saldo) + '</span>';
      card.appendChild(head);

      var stats = document.createElement('div');
      stats.className = 'year-stats';
      stats.innerHTML =
        '<div class="year-stat despesas"><p class="stat-label">Despesas</p><p class="stat-value">' + fmtMoney(expTotal) + '</p></div>' +
        '<div class="year-stat receitas"><p class="stat-label">Receitas</p><p class="stat-value">' + fmtMoney(incTotal) + '</p></div>';
      card.appendChild(stats);

      var breakdown = document.createElement('div');
      breakdown.className = 'year-breakdown';
      breakdown.appendChild(buildBreakdownCol('Despesas por item', expItems));
      breakdown.appendChild(buildBreakdownCol('Receitas por item', incItems));
      card.appendChild(breakdown);

      container.appendChild(card);
    });

    var geralSaldo = geralReceitas - geralDespesas;
    var elGeralExp = document.getElementById('geralDespesas');
    if(elGeralExp) elGeralExp.textContent = fmtMoney(geralDespesas);

    var elGeralInc = document.getElementById('geralReceitas');
    if(elGeralInc) elGeralInc.textContent = fmtMoney(geralReceitas);

    var gsEl = document.getElementById('geralSaldo');
    if(gsEl) {
      gsEl.textContent = fmtMoney(geralSaldo);
      gsEl.classList.toggle('pos', geralSaldo >= 0);
      gsEl.classList.toggle('neg', geralSaldo < 0);
    }

    var elGeralSub = document.getElementById('geralSaldoSub');
    if(elGeralSub) elGeralSub.textContent = years.length ? (years[0] + (years.length>1 ? ' – ' + years[years.length-1] : '')) : '\u00A0';
  }

  function sumItemsByYear(list, monthsInYear){
    var out = [];
    list.forEach(function(row){
      var total = 0;
      monthsInYear.forEach(function(mk){
        var v = row.values[mk];
        if(typeof v === 'number' && !isNaN(v)) total += v;
      });
      if(total !== 0){
        out.push({ item: row.item || '(sem nome)', total: total });
      }
    });
    out.sort(function(a,b){ return b.total - a.total; });
    return out;
  }

  function buildBreakdownCol(title, items){
    var col = document.createElement('div');
    col.className = 'year-breakdown-col';
    var h = document.createElement('p');
    h.className = 'year-breakdown-title';
    h.textContent = title;
    col.appendChild(h);
    if(items.length === 0){
      var empty = document.createElement('p');
      empty.className = 'year-breakdown-empty';
      empty.textContent = 'sem valores neste ano';
      col.appendChild(empty);
    } else {
      items.forEach(function(it){
        var row = document.createElement('div');
        row.className = 'year-item-row';
        row.innerHTML = '<span class="yi-name">' + escapeHtml(it.item) + '</span><span class="yi-val">' + fmtMoney(it.total) + '</span>';
        col.appendChild(row);
      });
    }
    return col;
  }

  function escapeHtml(str){
    var div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function init(){
    var savedToken = localStorage.getItem('saldo_token');
    var savedName = localStorage.getItem('saldo_user_name');
    var savedFirstName = localStorage.getItem('saldo_user_first_name');
    if (savedToken) {
      currentUser = { token: savedToken, name: savedName, firstName: savedFirstName || (savedName || '').split(' ')[0] };
    }
    updateAccountUI();

    storageGet(STORAGE_KEY).then(function(value){
      if(value){
        try{
          var parsed = JSON.parse(value);
          if (parsed && parsed.version === CURRENT_SCHEMA_VERSION && parsed.months) {
            state = parsed;
          } else {
            state = seedData();
          }
        }catch(e){
          state = seedData();
        }
      } else {
        state = seedData();
      }
      ensureCurrentMonthSelected();

      if (currentUser && currentUser.token) {
        loadFromCloud().then(function(loaded){
          if (!loaded) {
            persist();
            render();
          }
        });
      } else {
        persist();
        render();
      }
    }).catch(function(){
      state = seedData();
      ensureCurrentMonthSelected();
      render();
    });
  }

  init();
})();