/* ============================================================
   HEALFIT — MÓDULO DESPESAS
   v1.0 — CRUD + categorias + recorrência mensal + baixa + período
   ============================================================ */
let DESP_LIST = [];
let despFiltro = 'todas';
let despEditId = null;

/* ---------------- CARREGAR ---------------- */
function despPeriodoPadrao() {
  const h = new Date();
  const ini = `${h.getFullYear()}-${String(h.getMonth() + 1).padStart(2, '0')}-01`;
  const fim = new Date(h.getFullYear(), h.getMonth() + 1, 0).toISOString().slice(0, 10);
  const elIni = document.getElementById('desp-ini');
  const elFim = document.getElementById('desp-fim');
  if (!elIni.value) elIni.value = ini;
  if (!elFim.value) elFim.value = fim;
}

async function carregarDespesas() {
  despPeriodoPadrao();
  const pIni = document.getElementById('desp-ini').value;
  const pFim = document.getElementById('desp-fim').value;

  const tb = document.getElementById('desp-rows');
  tb.innerHTML = '<tr><td colspan="6" class="carregando">Carregando…</td></tr>';

  // despesas do período + receita da academia no mesmo período (para o Resultado)
  const [{ data: despesas, error }, { data: pagos }] = await Promise.all([
    db.from('despesas').select('*')
      .gte('vencimento', pIni).lte('vencimento', pFim)
      .order('vencimento', { ascending: true }),
    db.from('mensalidades').select('valor_total, valor_personal')
      .eq('status', 'pago')
      .gte('pago_em', pIni + 'T00:00:00')
      .lte('pago_em', pFim + 'T23:59:59'),
  ]);

  if (error) { tb.innerHTML = `<tr><td colspan="6" class="vazio">Erro: ${esc(error.message)}</td></tr>`; return; }
  DESP_LIST = despesas || [];

  const receitaAcademia = (pagos || []).reduce((s, m) => s + Number(m.valor_total) - Number(m.valor_personal), 0);
  renderDespesas(receitaAcademia);
}

function filtraDesp(f, el) {
  despFiltro = f;
  document.querySelectorAll('#v-despesas .chip').forEach(c => c.classList.remove('active'));
  el.classList.add('active');
  renderDespesas();
}

let despReceitaCache = 0;
function renderDespesas(receitaAcademia) {
  if (receitaAcademia !== undefined) despReceitaCache = receitaAcademia;

  const lista = DESP_LIST.filter(d =>
    despFiltro === 'todas' ? true :
    despFiltro === 'pagas' ? d.status === 'pago' :
    despFiltro === 'apagar' ? d.status === 'a_pagar' :
    despFiltro === 'recorrentes' ? d.recorrente === true : true);

  /* KPIs (sobre o período completo, sem filtro de chip) */
  const total = DESP_LIST.reduce((s, d) => s + Number(d.valor), 0);
  const aPagar = DESP_LIST.filter(d => d.status === 'a_pagar').reduce((s, d) => s + Number(d.valor), 0);
  document.getElementById('dk-total').textContent = brl(total);
  document.getElementById('dk-qtd').textContent = `${DESP_LIST.length} lançamento(s)`;
  document.getElementById('dk-apagar').textContent = brl(aPagar);
  document.getElementById('dk-resultado').textContent = brl(despReceitaCache - total);

  const tb = document.getElementById('desp-rows');
  if (!lista.length) {
    tb.innerHTML = '<tr><td colspan="6" class="vazio">Nenhuma despesa no período/filtro.</td></tr>';
    return;
  }

  tb.innerHTML = lista.map(d => `
    <tr>
      <td><b>${esc(d.descricao)}</b>${d.recorrente ? ' <span class="badge b-info" title="Lançada automaticamente todo mês">↻ recorrente</span>' : ''}</td>
      <td><span class="badge b-off">${esc(d.categoria)}</span></td>
      <td>${fmt(d.vencimento)}</td>
      <td><b>${brl(d.valor)}</b></td>
      <td>${d.status === 'pago'
        ? `<span class="badge b-ok">Pago</span>${d.pago_em ? `<div class="pl">${fmt(String(d.pago_em).slice(0,10))}</div>` : ''}`
        : '<span class="badge b-warn">A pagar</span>'}</td>
      <td><div class="acts">
        ${d.status !== 'pago' ? `<button class="icon-btn" title="Dar baixa (pago)" onclick="baixaDespesa(${d.id})">✔</button>` : ''}
        <button class="icon-btn" title="Editar" onclick="abrirDespesa(${d.id})">✎</button>
        <button class="icon-btn del" title="Excluir" onclick="excluirDespesa(${d.id})">🗑</button>
      </div></td>
    </tr>`).join('');
}

/* ---------------- NOVA / EDITAR ---------------- */
function abrirDespesa(id) {
  despEditId = id;
  const d = id ? DESP_LIST.find(x => x.id === id) : null;
  document.getElementById('md-title').textContent = d ? 'Editar despesa' : 'Nova despesa';
  document.getElementById('md-desc').value = d?.descricao || '';
  document.getElementById('md-cat').value = d?.categoria || 'Fixa';
  document.getElementById('md-valor').value = d ? Number(d.valor).toFixed(2) : '';
  document.getElementById('md-venc').value = d?.vencimento || new Date().toISOString().slice(0, 10);
  document.getElementById('md-rec').checked = d?.recorrente === true;
  openModal('m-despesa');
}

async function salvarDespesa() {
  const descricao = document.getElementById('md-desc').value.trim();
  const valor = parseFloat(document.getElementById('md-valor').value) || 0;
  const vencimento = document.getElementById('md-venc').value;
  if (!descricao) { toast('Informe a descrição.'); return; }
  if (valor <= 0)  { toast('Informe um valor válido.'); return; }
  if (!vencimento) { toast('Informe o vencimento.'); return; }

  const registro = {
    descricao,
    categoria: document.getElementById('md-cat').value,
    valor,
    vencimento,
    recorrente: document.getElementById('md-rec').checked,
  };

  let error;
  if (despEditId) ({ error } = await db.from('despesas').update(registro).eq('id', despEditId));
  else            ({ error } = await db.from('despesas').insert(registro));

  if (error) { toast('Erro ao salvar: ' + error.message); return; }
  closeModal('m-despesa');
  toast(despEditId ? 'Despesa atualizada ✓' : 'Despesa lançada ✓' +
    (registro.recorrente ? ' — será replicada automaticamente todo mês.' : ''));
  carregarDespesas();
}

/* ---------------- BAIXA ---------------- */
async function baixaDespesa(id) {
  const d = DESP_LIST.find(x => x.id === id);
  if (!d) return;
  if (!confirm(`Marcar "${d.descricao}" (${brl(d.valor)}) como paga?`)) return;
  const { error } = await db.from('despesas')
    .update({ status: 'pago', pago_em: new Date().toISOString() }).eq('id', id);
  toast(error ? 'Erro: ' + error.message : 'Despesa baixada ✓');
  carregarDespesas();
}

/* ---------------- EXCLUIR ---------------- */
async function excluirDespesa(id) {
  const d = DESP_LIST.find(x => x.id === id);
  if (!d) return;
  const extra = d.recorrente
    ? '\n\nAtenção: esta despesa é RECORRENTE — excluir este lançamento também interrompe a replicação automática dos próximos meses (os meses anteriores não mudam).'
    : '';
  if (!confirm(`Excluir a despesa "${d.descricao}" (${brl(d.valor)})?${extra}`)) return;
  const { error } = await db.from('despesas').delete().eq('id', id);
  toast(error ? 'Erro: ' + error.message : 'Despesa excluída ✓');
  carregarDespesas();
}
