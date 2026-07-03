/* ============================================================
   HEALFIT — MÓDULO ALUNOS (CRUD + fatura imediata + WhatsApp)
   v1.1 — CPF obrigatório para gerar fatura (exigência Asaas)
   ============================================================ */
let ALUNOS = [];          // cache da lista atual
let PLANOS = [];
let PERSONAIS = [];
let aluFiltro = 'todos';
let aluEditId = null;     // null = novo aluno

/* ---------------- CARREGAR ---------------- */
async function carregarAlunos() {
  const tb = document.getElementById('alunos-rows');
  tb.innerHTML = '<tr><td colspan="6" class="carregando">Carregando…</td></tr>';

  // planos e personais para os selects (carrega junto)
  const [{ data: planos }, { data: personais }, { data: alunos, error }] = await Promise.all([
    db.from('planos').select('*').eq('ativo', true).order('valor'),
    db.from('personais').select('*').eq('ativo', true).order('nome'),
    db.from('vw_alunos_completo').select('*').order('nome'),
  ]);

  if (error) { tb.innerHTML = `<tr><td colspan="6" class="vazio">Erro: ${esc(error.message)}</td></tr>`; return; }
  PLANOS = planos || [];
  PERSONAIS = personais || [];
  ALUNOS = alunos || [];
  renderAlunos();
}

/* ---------------- RENDER ---------------- */
function filtraAlu(f, el) {
  aluFiltro = f;
  document.querySelectorAll('#v-alunos .chip').forEach(c => c.classList.remove('active'));
  el.classList.add('active');
  renderAlunos();
}

function renderAlunos() {
  const q = (document.getElementById('alu-q').value || '').toLowerCase();
  const lista = ALUNOS
    .filter(a => (a.nome || '').toLowerCase().includes(q) || (a.cpf || '').includes(q) || (a.whatsapp || '').includes(q))
    .filter(a => aluFiltro === 'todos' ? true
      : aluFiltro === 'com' ? a.personal_id != null
      : aluFiltro === 'sem' ? a.personal_id == null
      : aluFiltro === 'inativos' ? a.ativo === false : a.ativo !== false)
    .filter(a => aluFiltro === 'inativos' ? true : a.ativo !== false);

  document.getElementById('alunos-sub').textContent =
    `${ALUNOS.filter(a => a.ativo !== false).length} ativos · ${ALUNOS.filter(a => a.ativo === false).length} inativos`;

  const tb = document.getElementById('alunos-rows');
  if (!lista.length) { tb.innerHTML = '<tr><td colspan="6" class="vazio">Nenhum aluno encontrado.</td></tr>'; return; }

  tb.innerHTML = lista.map((a, i) => {
    const total = Number(a.valor_plano) + Number(a.valor_personal || 0);
    const tagPers = a.personal
      ? `<span class="tag-personal">🏋 ${esc(a.personal)}</span>`
      : '<span style="color:var(--muted);font-size:13px">—</span>';
    const situacao = a.ativo === false
      ? '<span class="badge b-off">Inativo</span>'
      : a.forma_cobranca === 'cartao_recorrente'
        ? '<span class="badge b-info">Cartão recorrente</span>'
        : '<span class="badge b-ok">Fatura</span>';
    return `
    <tr>
      <td><div class="aluno-cell"><div class="av" style="background:${corDe(i)}">${ini(a.nome)}</div>
        <div><div class="nm">${esc(a.nome)}</div><div class="pl">${esc(a.whatsapp || a.cpf || '')}</div></div></div></td>
      <td>${esc(a.plano)}<div class="pl">venc. dia ${a.dia_vencimento}</div></td>
      <td>${tagPers}</td>
      <td><b>${brl(total)}</b>${a.valor_personal > 0 ? `<div class="pl">${brl(a.valor_plano)} + ${brl(a.valor_personal)} personal</div>` : ''}</td>
      <td>${situacao}</td>
      <td><div class="acts">
        <button class="icon-btn" title="Gerar fatura agora" onclick="gerarFaturaAluno(${a.id})">⚡</button>
        <button class="icon-btn" title="Editar" onclick="abrirAluno(${a.id})">✎</button>
        <button class="icon-btn del" title="Excluir" onclick="excluirAluno(${a.id})">🗑</button>
      </div></td>
    </tr>`;
  }).join('');
}

/* ---------------- NOVO / EDITAR ---------------- */
function abrirAluno(id) {
  aluEditId = id;
  const a = id ? ALUNOS.find(x => x.id === id) : null;
  document.getElementById('ma-title').textContent = a ? 'Editar aluno' : 'Novo aluno';

  // selects dinâmicos
  document.getElementById('ma-plano').innerHTML =
    PLANOS.map(p => `<option value="${p.id}">${esc(p.nome)} — ${brl(p.valor)}</option>`).join('');
  document.getElementById('ma-pid').innerHTML =
    '<option value="">Sem personal</option>' +
    PERSONAIS.map(p => `<option value="${p.id}">${esc(p.nome)}</option>`).join('');

  document.getElementById('ma-nome').value = a?.nome || '';
  document.getElementById('ma-cpf').value = a?.cpf || '';
  document.getElementById('ma-zap').value = a?.whatsapp || '';
  document.getElementById('ma-email').value = a?.email || '';
  document.getElementById('ma-plano').value = a?.plano_id || (PLANOS[0]?.id ?? '');
  document.getElementById('ma-dia').value = a?.dia_vencimento || 5;
  document.getElementById('ma-pid').value = a?.personal_id || '';
  document.getElementById('ma-pval').value = a?.valor_personal || 0;
  document.getElementById('ma-forma').value = a?.forma_cobranca || 'fatura';
  document.getElementById('ma-cartao').checked = a?.permite_cartao === true;
  document.getElementById('ma-ativo').checked = a ? a.ativo !== false : true;

  maCalc();
  openModal('m-aluno');
}

function maCalc() {
  const planoId = Number(document.getElementById('ma-plano').value);
  const plano = PLANOS.find(p => p.id === planoId);
  const base = Number(plano?.valor || 0);
  const temPers = document.getElementById('ma-pid').value !== '';
  const pv = temPers ? (parseFloat(document.getElementById('ma-pval').value) || 0) : 0;
  document.getElementById('ma-pval').disabled = !temPers;
  if (!temPers) document.getElementById('ma-pval').value = 0;
  document.getElementById('ma-nota').textContent = temPers && pv > 0
    ? `Fatura do aluno: ${brl(base + pv)} — ${brl(base)} academia + ${brl(pv)} personal (repasse automático).`
    : `Fatura do aluno: ${brl(base)} (academia) — sem personal vinculado.`;
}

async function salvarAluno() {
  const nome = document.getElementById('ma-nome').value.trim();
  if (!nome) { toast('Informe o nome do aluno.'); return; }

  const cpf = document.getElementById('ma-cpf').value.trim();
  if (!cpf) {
    if (!confirm('Aluno sem CPF: não será possível gerar cobranças para ele até cadastrar o CPF (exigência do emissor).\n\nSalvar mesmo assim?')) return;
  }

  const pid = document.getElementById('ma-pid').value;
  const registro = {
    nome,
    cpf: cpf || null,
    whatsapp: document.getElementById('ma-zap').value.trim() || null,
    email: document.getElementById('ma-email').value.trim() || null,
    plano_id: Number(document.getElementById('ma-plano').value),
    dia_vencimento: Number(document.getElementById('ma-dia').value),
    personal_id: pid ? Number(pid) : null,
    valor_personal: pid ? (parseFloat(document.getElementById('ma-pval').value) || 0) : 0,
    forma_cobranca: document.getElementById('ma-forma').value,
    permite_cartao: document.getElementById('ma-cartao').checked,
    ativo: document.getElementById('ma-ativo').checked,
  };

  const btn = document.getElementById('ma-salvar');
  btn.disabled = true;

  let error;
  if (aluEditId) ({ error } = await db.from('alunos').update(registro).eq('id', aluEditId));
  else          ({ error } = await db.from('alunos').insert(registro));

  btn.disabled = false;
  if (error) {
    toast(error.code === '23505' ? 'Já existe um aluno com esse CPF.' : 'Erro ao salvar: ' + error.message);
    return;
  }
  closeModal('m-aluno');
  toast(aluEditId ? 'Aluno atualizado ✓ (faturas já emitidas não mudam)' : 'Aluno cadastrado ✓ Use ⚡ para gerar a 1ª fatura.');
  carregarAlunos();
}

/* ---------------- EXCLUIR ---------------- */
async function excluirAluno(id) {
  const a = ALUNOS.find(x => x.id === id);
  if (!a) return;

  // regra de proteção: se tem fatura paga, sugerir inativar em vez de excluir
  const { count } = await db.from('mensalidades')
    .select('id', { count: 'exact', head: true })
    .eq('aluno_id', id).eq('status', 'pago');

  if (count > 0) {
    if (confirm(`${a.nome} tem ${count} pagamento(s) no histórico.\n\nExcluir apagaria esse histórico (afeta fechamentos passados!).\n\nRecomendado: INATIVAR o aluno (para de gerar fatura, histórico preservado).\n\nOK = Inativar | Cancelar = não fazer nada`)) {
      const { error } = await db.from('alunos').update({ ativo: false }).eq('id', id);
      toast(error ? 'Erro: ' + error.message : 'Aluno inativado ✓ — histórico preservado.');
      carregarAlunos();
    }
    return;
  }

  if (!confirm(`Excluir o aluno ${a.nome}?\n\nAs faturas em aberto dele serão apagadas do sistema. (Cobranças já emitidas no Asaas devem ser canceladas por lá, se existirem.)`)) return;
  const { error } = await db.from('alunos').delete().eq('id', id);
  toast(error ? 'Erro: ' + error.message : 'Aluno excluído ✓');
  carregarAlunos();
}

/* ---------------- FATURA IMEDIATA (Edge Function) ---------------- */
async function gerarFaturaAluno(id) {
  const a = ALUNOS.find(x => x.id === id);
  if (!a) return;
  if (a.ativo === false) { toast('Aluno inativo — reative antes de gerar fatura.'); return; }
  if (!a.cpf) { toast('Cadastre o CPF do aluno antes de gerar a fatura (exigência do banco emissor).'); return; }
  if (!confirm(`Gerar a fatura do mês para ${a.nome}?`)) return;

  toast('Gerando fatura no Asaas…');
  const { data, error } = await db.functions.invoke('criar-cobranca-avulsa', {
    body: { aluno_id: id },
  });

  if (error) {
    // tenta extrair a mensagem do corpo (409 = fatura já existe, etc.)
    let msg = error.message;
    try { const body = await error.context?.json?.(); if (body?.erro) msg = body.erro; } catch (_) {}
    toast('Não gerou: ' + msg);
    return;
  }
  if (data?.erro) { toast('Não gerou: ' + data.erro); return; }

  mostrarFatura(a, data.mensalidade);
  carregarAlunos();
}

/* ---------------- RESULTADO: PDF / PIX / WHATSAPP ---------------- */
function mostrarFatura(aluno, m) {
  document.getElementById('mf-aluno').textContent = aluno.nome;
  document.getElementById('mf-info').textContent =
    `${brl(m.valor_total ?? (Number(m.valor_academia) + Number(m.valor_personal)))} · vencimento ${fmt(m.vencimento)}`;

  const links = document.getElementById('mf-links');
  const zap = (aluno.whatsapp || '').replace(/\D/g, '');
  const msg = encodeURIComponent(
    `Olá ${aluno.nome.split(' ')[0]}! 💪 Sua fatura HealFit já está disponível:\n\n` +
    `💰 Valor: ${brl(m.valor_total ?? (Number(m.valor_academia) + Number(m.valor_personal)))}\n` +
    `📅 Vencimento: ${fmt(m.vencimento)}\n\n` +
    `Pague por boleto ou PIX no link:\n${m.url_fatura}\n\nQualquer dúvida é só chamar!`
  );

  links.innerHTML = `
    ${m.url_fatura ? `<a class="btn btn-primary" href="${m.url_fatura}" target="_blank">📄 Abrir fatura / imprimir boleto</a>` : ''}
    ${zap ? `<a class="btn btn-volt" href="https://wa.me/55${zap}?text=${msg}" target="_blank">💬 Enviar no WhatsApp do aluno</a>`
          : '<div class="hint">Aluno sem WhatsApp cadastrado — edite o cadastro para habilitar o envio.</div>'}
    ${m.pix_copia_cola ? `<div class="hint" style="max-width:none">PIX copia-e-cola (clique para copiar):</div>
      <div class="linha-copiavel" onclick="navigator.clipboard.writeText(this.textContent).then(()=>toast('PIX copiado ✓'))">${esc(m.pix_copia_cola)}</div>` : ''}
  `;
  openModal('m-fatura-ok');
}
