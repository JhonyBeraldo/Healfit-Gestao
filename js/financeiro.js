/* ============================================================
   HEALFIT — MÓDULO FINANCEIRO
   v1.3 — faturas pagas ganham botão 🔗 para o comprovante; recibo inclui o link da página
   ============================================================ */
let FIN_LIST = [];
let finFiltro = 'todos';
let finFatSel = null; // fatura selecionada nos modais

/* ---------------- CARREGAR ---------------- */
function finPeriodoPadrao() {
  const h = new Date();
  const ini = `${h.getFullYear()}-${String(h.getMonth() + 1).padStart(2, '0')}-01`;
  const fim = new Date(h.getFullYear(), h.getMonth() + 1, 0).toISOString().slice(0, 10);
  const elIni = document.getElementById('fin-ini');
  const elFim = document.getElementById('fin-fim');
  if (!elIni.value) elIni.value = ini;
  if (!elFim.value) elFim.value = fim;
}

async function carregarFinanceiro() {
  finPeriodoPadrao();
  const pIni = document.getElementById('fin-ini').value;
  const pFim = document.getElementById('fin-fim').value;

  const tb = document.getElementById('fin-rows');
  tb.innerHTML = '<tr><td colspan="8" class="carregando">Carregando…</td></tr>';

  const { data, error } = await db.from('vw_financeiro')
    .select('*')
    .gte('vencimento', pIni)
    .lte('vencimento', pFim)
    .order('vencimento', { ascending: true });

  if (error) { tb.innerHTML = `<tr><td colspan="8" class="vazio">Erro: ${esc(error.message)}</td></tr>`; return; }
  FIN_LIST = data || [];
  renderFinanceiro();
}

function filtraFin(f, el) {
  finFiltro = f;
  document.querySelectorAll('#v-financeiro .chip').forEach(c => c.classList.remove('active'));
  el.classList.add('active');
  renderFinanceiro();
}

function renderFinanceiro() {
  const q = (document.getElementById('fin-q').value || '').toLowerCase();
  const lista = FIN_LIST
    .filter(m => (m.aluno || '').toLowerCase().includes(q))
    .filter(m => finFiltro === 'todos' ? m.status !== 'cancelado' : m.status === finFiltro);

  /* KPIs do período (sobre a lista completa do período, sem busca) */
  const soma = st => FIN_LIST.filter(m => m.status === st).reduce((s, m) => s + Number(m.valor_total), 0);
  document.getElementById('fk-recebido').textContent = brl(soma('pago'));
  document.getElementById('fk-areceber').textContent = brl(soma('pendente'));
  document.getElementById('fk-atrasado').textContent = brl(soma('atrasado'));
  document.getElementById('fk-cancelado').textContent = brl(soma('cancelado'));

  const tb = document.getElementById('fin-rows');
  if (!lista.length) {
    tb.innerHTML = '<tr><td colspan="8" class="vazio">Nenhuma fatura no período/filtro selecionado.</td></tr>';
    return;
  }

  tb.innerHTML = lista.map((m, i) => {
    const acoes = [];
    if (m.status === 'pendente' || m.status === 'atrasado') {
      acoes.push(`<button class="icon-btn" title="Ver fatura / enviar" onclick="finAbrirFatura(${m.id})">📄</button>`);
      acoes.push(`<button class="icon-btn" title="Alterar vencimento" onclick="finEditarVenc(${m.id})">✎</button>`);
      acoes.push(`<button class="icon-btn" title="Baixa manual (pagou na recepção)" onclick="finBaixaManual(${m.id})">✔</button>`);
      acoes.push(`<button class="icon-btn del" title="Cancelar fatura" onclick="finCancelar(${m.id})">🗑</button>`);
    } else if (m.status === 'pago') {
      if (m.token_publico) acoes.push(`<a class="icon-btn" title="Abrir comprovante (página HealFit)" href="${HF_CONFIG.PAGINA_FATURA}?t=${m.token_publico}" target="_blank" style="text-decoration:none">🔗</a>`);
      acoes.push(`<button class="icon-btn" title="Enviar recibo no WhatsApp" onclick="finRecibo(${m.id})">🧾</button>`);
    }
    return `
    <tr>
      <td><div class="aluno-cell"><div class="av" style="background:${corDe(i)}">${ini(m.aluno)}</div>
        <div><div class="nm">${esc(m.aluno)}</div><div class="pl">#MEN-${String(m.competencia).slice(0,7).replace('-','')}-${String(m.id).padStart(4,'0')}</div></div></div></td>
      <td>${fmt(m.vencimento)}</td>
      <td>${brl(m.valor_academia)}</td>
      <td>${Number(m.valor_personal) > 0 ? brl(m.valor_personal) + `<div class="pl">${esc(m.personal || '')}</div>` : '—'}</td>
      <td><b>${brl(m.valor_total)}</b></td>
      <td>${m.forma_pagamento ? esc(m.forma_pagamento).toUpperCase() : '—'}</td>
      <td>${stBadge(m.status)}${m.pago_em ? `<div class="pl">${fmt(String(m.pago_em).slice(0,10))}</div>` : ''}</td>
      <td><div class="acts">${acoes.join('')}</div></td>
    </tr>`;
  }).join('');
}

/* ---------------- REABRIR FATURA (reusa o modal dos alunos) ---------------- */
async function finAbrirFatura(id) {
  const m = FIN_LIST.find(x => x.id === id);
  if (!m) return;
  const { data: aluno } = await db.from('alunos').select('nome, whatsapp').eq('id', m.aluno_id).single();
  mostrarFatura(aluno || { nome: m.aluno, whatsapp: null }, m);
}

/* ---------------- ALTERAR VENCIMENTO ---------------- */
function finEditarVenc(id) {
  finFatSel = FIN_LIST.find(x => x.id === id);
  if (!finFatSel) return;
  document.getElementById('mv-aluno').value = `${finFatSel.aluno} — ${brl(finFatSel.valor_total)}`;
  document.getElementById('mv-venc').value = finFatSel.vencimento;
  openModal('m-venc');
}

async function finSalvarVenc() {
  const novo = document.getElementById('mv-venc').value;
  if (!novo) { toast('Escolha a nova data.'); return; }
  const btn = document.getElementById('mv-salvar');
  btn.disabled = true; toast('Reemitindo boleto com a nova data…');

  const { data, error } = await db.functions.invoke('gerenciar-fatura', {
    body: { acao: 'vencimento', mensalidade_id: finFatSel.id, novo_vencimento: novo },
  });
  btn.disabled = false;
  if (error || data?.erro) {
    let msg = data?.erro || error.message;
    try { const b = await error?.context?.json?.(); if (b?.erro) msg = b.erro; } catch (_) {}
    toast('Não alterou: ' + msg); return;
  }
  closeModal('m-venc');
  toast(data.msg || 'Vencimento alterado ✓');
  carregarFinanceiro();
}

/* ---------------- BAIXA MANUAL ---------------- */
function finBaixaManual(id) {
  finFatSel = FIN_LIST.find(x => x.id === id);
  if (!finFatSel) return;
  document.getElementById('mb-aluno').value = `${finFatSel.aluno} — fatura de ${brl(finFatSel.valor_total)}`;
  document.getElementById('mb-valor').value = Number(finFatSel.valor_total).toFixed(2);
  document.getElementById('mb-obs').value = '';
  document.getElementById('mb-aviso').style.display = 'none';
  openModal('m-baixa');
}

function finBaixaConferir() {
  const v = parseFloat(document.getElementById('mb-valor').value) || 0;
  const aviso = document.getElementById('mb-aviso');
  const vp = Number(finFatSel?.valor_personal || 0);
  if (vp > 0 && v < vp) {
    aviso.textContent = `⚠ Atenção: o valor pago (${brl(v)}) é MENOR que a parte do personal (${brl(vp)}). O repasse ao personal continua sendo ${brl(vp)} — o desconto sai da parte da academia.`;
    aviso.style.display = 'block';
  } else if (v !== Number(finFatSel?.valor_total)) {
    aviso.textContent = `Valor diferente da fatura (${brl(finFatSel.valor_total)}). Informe o motivo na observação — fica registrado para auditoria.`;
    aviso.style.display = 'block';
  } else {
    aviso.style.display = 'none';
  }
}

async function finSalvarBaixa() {
  const valor = parseFloat(document.getElementById('mb-valor').value) || 0;
  const obs = document.getElementById('mb-obs').value.trim();
  if (valor <= 0) { toast('Informe o valor recebido.'); return; }
  if (valor !== Number(finFatSel.valor_total) && !obs) {
    toast('Valor diferente da fatura: a observação é obrigatória.'); return;
  }
  if (!confirm(`Confirmar baixa manual de ${brl(valor)} para ${finFatSel.aluno}?\n\nO boleto/PIX será CANCELADO no Asaas (não poderá mais ser pago).`)) return;

  const btn = document.getElementById('mb-salvar');
  btn.disabled = true; toast('Registrando baixa…');

  const { data, error } = await db.functions.invoke('gerenciar-fatura', {
    body: { acao: 'baixa', mensalidade_id: finFatSel.id, valor_pago: valor, observacao: obs },
  });
  btn.disabled = false;
  if (error || data?.erro) {
    let msg = data?.erro || error.message;
    try { const b = await error?.context?.json?.(); if (b?.erro) msg = b.erro; } catch (_) {}
    toast('Não baixou: ' + msg); return;
  }
  closeModal('m-baixa');
  toast(data.msg || 'Baixa registrada ✓');
  carregarFinanceiro();
}

/* ---------------- CANCELAR ---------------- */
async function finCancelar(id) {
  const m = FIN_LIST.find(x => x.id === id);
  if (!m) return;
  if (!confirm(`Cancelar a fatura de ${m.aluno} (${brl(m.valor_total)})?\n\nO boleto/PIX deixa de ser pagável no Asaas. Para cobrar de novo, gere uma nova fatura pelo ⚡ na tela de Alunos.`)) return;

  toast('Cancelando no Asaas…');
  const { data, error } = await db.functions.invoke('gerenciar-fatura', {
    body: { acao: 'cancelar', mensalidade_id: id },
  });
  if (error || data?.erro) {
    let msg = data?.erro || error.message;
    try { const b = await error?.context?.json?.(); if (b?.erro) msg = b.erro; } catch (_) {}
    toast('Não cancelou: ' + msg); return;
  }
  toast(data.msg || 'Fatura cancelada ✓');
  carregarFinanceiro();
}

/* ---------------- RECIBO (WhatsApp) ---------------- */
async function finRecibo(id) {
  const m = FIN_LIST.find(x => x.id === id);
  if (!m) return;
  const { data: aluno } = await db.from('alunos').select('nome, whatsapp').eq('id', m.aluno_id).single();
  const zap = (aluno?.whatsapp || '').replace(/\D/g, '');
  if (!zap) { toast('Aluno sem WhatsApp cadastrado.'); return; }

  // Valor EFETIVAMENTE recebido: busca o pagamento registrado (baixa manual
  // pode ter valor diferente da fatura). Fallback: valor total da fatura.
  const { data: pg } = await db.from('pagamentos')
    .select('valor, pago_em')
    .eq('mensalidade_id', m.id)
    .order('pago_em', { ascending: false })
    .limit(1)
    .maybeSingle();
  const valorRecebido = Number(pg?.valor ?? m.valor_total);
  const dataPagto = pg?.pago_em ?? m.pago_em;

  const comp = String(m.competencia).slice(0, 7).split('-').reverse().join('/');
  const linkComprovante = m.token_publico ? `\n\nComprovante: ${HF_CONFIG.PAGINA_FATURA}?t=${m.token_publico}` : '';
  const msg = encodeURIComponent(
    `*HEALFIT ACADEMIA - RECIBO*\n\n` +
    `Olá, ${m.aluno.split(' ')[0]}!\n` +
    `Confirmamos o recebimento de *${brl(valorRecebido)}* referente à mensalidade ${comp}.\n` +
    `Data do pagamento: ${fmt(String(dataPagto).slice(0, 10))}` +
    linkComprovante +
    `\n\nObrigado e bons treinos!`
  );
  window.open(`https://wa.me/55${zap}?text=${msg}`, '_blank');
}
