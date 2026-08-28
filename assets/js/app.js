(function(){
  "use strict";

  var STORAGE_KEY = "livro-caixa-dados-v2";
  var CURRENT_SCHEMA_VERSION = 2;

  var MONTH_NAMES = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];

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
    // Remove duplicatas se currentKey bater com algum já estático
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
    el.classList.add('show');
    clearTimeout(el._t);
    el._t = setTimeout(function(){ el.classList.remove('show'); }, 1100);
  }

  function persist(){
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function(){
      storageSet(STORAGE_KEY, JSON.stringify(state)).then(function(ok){
        if(ok) flagSave();
      }).catch(function(err){ console.error("Erro ao salvar:", err); });
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
    state.selectedMonth = todayKey;
  }

  function removeMonth(mk) {
    if (confirm("Tem certeza que deseja apagar o mês " + monthLabel(mk) + "?")) {
      var idx = state.months.indexOf(mk);
      if (idx > -1) {
        state.months.splice(idx, 1);
        
        // Remove valores associados no objeto
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
    }
  }

  function render(){
    renderTabs();
    renderPanel();
    renderTable('expenses');
    renderTable('income');
  }

  function renderTabs(){
    var row = document.getElementById('tabsRow');
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

    document.getElementById('statDespesas').textContent = fmtMoney(exp.total);
    document.getElementById('statDespesasCount').textContent = exp.count + (exp.count===1?' item':' itens') + ' em ' + monthLabel(mk);
    document.getElementById('statReceitas').textContent = fmtMoney(inc.total);
    document.getElementById('statReceitasCount').textContent = inc.count + (inc.count===1?' item':' itens') + ' em ' + monthLabel(mk);

    var saldoEl = document.getElementById('statSaldo');
    saldoEl.textContent = fmtMoney(saldo);
    saldoEl.classList.toggle('pos', saldo >= 0);
    saldoEl.classList.toggle('neg', saldo < 0);
    document.getElementById('statSaldoSub').textContent = saldo >= 0 ? 'positivo' : 'negativo';

    document.getElementById('expTotalHead').textContent = fmtMoney(exp.total);
    document.getElementById('incTotalHead').textContent = fmtMoney(inc.total);
  }

  function renderTable(kind){
    var rawList = kind === 'expenses' ? state.expenses : state.income;
    var body = document.getElementById(kind === 'expenses' ? 'expensesBody' : 'incomeBody');
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
      var inputs = body.querySelectorAll('.item-input');
      if(inputs.length) inputs[inputs.length-1].focus();
    }, 30);
  }

  document.getElementById('addExpenseBtn').addEventListener('click', function(){ addRow('expenses'); });
  document.getElementById('addIncomeBtn').addEventListener('click', function(){ addRow('income'); });

  document.getElementById('resetBtn').addEventListener('click', function(){
    if(confirm('Isso vai carregar os dados genéricos de exemplo. Deseja continuar?')){
      state = seedData();
      ensureCurrentMonthSelected();
      persist();
      render();
    }
  });

  document.getElementById('clearBtn').addEventListener('click', function(){
    if(confirm('Certeza de que deseja limpar todos os registros e começar um livro-caixa em branco?')){
      state = emptyData();
      persist();
      render();
    }
  });

  var menuBtn = document.getElementById('menuBtn');
  var navOverlay = document.getElementById('navOverlay');
  var navMensal = document.getElementById('navMensal');
  var navAnual = document.getElementById('navAnual');
  var navAuth = document.getElementById('navAuth');

  var viewMensal = document.getElementById('viewMensal');
  var viewAnual = document.getElementById('viewAnual');
  var viewAuth = document.getElementById('viewAuth');

  function openMenu(){
    navOverlay.classList.add('open');
    menuBtn.setAttribute('aria-expanded', 'true');
  }
  function closeMenu(){
    navOverlay.classList.remove('open');
    menuBtn.setAttribute('aria-expanded', 'false');
  }
  menuBtn.addEventListener('click', function(){
    navOverlay.classList.contains('open') ? closeMenu() : openMenu();
  });
  navOverlay.addEventListener('click', function(e){
    if(e.target === navOverlay) closeMenu();
  });

  var pageTitle = document.getElementById('pageTitle');
  var pageSub = document.getElementById('pageSub');

  function showView(view){
    viewMensal.style.display = 'none';
    viewAnual.style.display = 'none';
    viewAuth.style.display = 'none';

    navMensal.classList.remove('active');
    navAnual.classList.remove('active');
    navAuth.classList.remove('active');

    if(view === 'anual'){
      viewAnual.style.display = 'block';
      navAnual.classList.add('active');
      pageTitle.textContent = 'Resumo anual';
      pageSub.textContent = 'Total de despesas e receitas, separado por ano.';
      renderAnual();
    } else if(view === 'auth'){
      viewAuth.style.display = 'block';
      navAuth.classList.add('active');
      pageTitle.textContent = 'Acessar Conta';
      pageSub.textContent = 'Faça login ou cadastre-se para sincronizar seus dados.';
    } else {
      viewMensal.style.display = 'block';
      navMensal.classList.add('active');
      pageTitle.textContent = 'Controle mensal';
      pageSub.textContent = 'Despesas e receitas, mês a mês. Clique em qualquer campo para editar.';
      render();
    }
    closeMenu();
  }
  navMensal.addEventListener('click', function(){ showView('mensal'); });
  navAnual.addEventListener('click', function(){ showView('anual'); });
  navAuth.addEventListener('click', function(){ showView('auth'); });

  // Lógica de Abas de Autenticação
  var tabLogin = document.getElementById('tabLogin');
  var tabRegister = document.getElementById('tabRegister');
  var formLogin = document.getElementById('formLogin');
  var formRegister = document.getElementById('formRegister');

  tabLogin.addEventListener('click', function(){
    tabLogin.classList.add('active');
    tabRegister.classList.remove('active');
    formLogin.style.display = 'flex';
    formRegister.style.display = 'none';
  });

  tabRegister.addEventListener('click', function(){
    tabRegister.classList.add('active');
    tabLogin.classList.remove('active');
    formRegister.style.display = 'flex';
    formLogin.style.display = 'none';
  });

  formLogin.addEventListener('submit', function(e){
    e.preventDefault();
    alert('Login realizado com sucesso (simulação).');
    showView('mensal');
  });

  formRegister.addEventListener('submit', function(e){
    e.preventDefault();
    alert('Cadastro realizado com sucesso (simulação).');
    showView('mensal');
  });

  var navExport = document.getElementById('navExport');
  var navImport = document.getElementById('navImport');
  var importFile = document.getElementById('importFile');

  navExport.addEventListener('click', function(){
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
      alert('Não foi possível exportar os dados.');
    }
    closeMenu();
  });

  navImport.addEventListener('click', function(){
    importFile.value = '';
    importFile.click();
  });

  importFile.addEventListener('change', function(e){
    var file = e.target.files && e.target.files[0];
    if(!file) return;
    var reader = new FileReader();
    reader.onload = function(ev){
      try{
        var parsed = JSON.parse(ev.target.result);
        var valid = parsed && Array.isArray(parsed.months) && Array.isArray(parsed.expenses) && Array.isArray(parsed.income);
        if(!valid){
          alert('Arquivo inválido. Verifique se é um backup do Saldo Simples.');
          return;
        }
        if(confirm('Isso vai substituir todos os dados atuais pelos dados do arquivo importado. Deseja continuar?')){
          parsed.version = CURRENT_SCHEMA_VERSION;
          state = parsed;
          ensureCurrentMonthSelected();
          persist();
          render();
          closeMenu();
        }
      }catch(err){
        alert('Não foi possível ler o arquivo. Verifique se é um JSON válido.');
      }
    };
    reader.readAsText(file);
  });

  function renderAnual(){
    var container = document.getElementById('anualYears');
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
    document.getElementById('geralDespesas').textContent = fmtMoney(geralDespesas);
    document.getElementById('geralReceitas').textContent = fmtMoney(geralReceitas);
    var gsEl = document.getElementById('geralSaldo');
    gsEl.textContent = fmtMoney(geralSaldo);
    gsEl.classList.toggle('pos', geralSaldo >= 0);
    gsEl.classList.toggle('neg', geralSaldo < 0);
    document.getElementById('geralSaldoSub').textContent = years.length ? (years[0] + (years.length>1 ? ' – ' + years[years.length-1] : '')) : '\u00A0';
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
      persist();
      render();
    }).catch(function(){
      state = seedData();
      ensureCurrentMonthSelected();
      render();
    });
  }

  init();
})();