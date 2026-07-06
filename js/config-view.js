/* ============================================================
   HEALFIT — MÓDULO CONFIGURAÇÕES
   v1.1 — rótulo da pausa explícito com status colorido
   ============================================================ */
let PLANOS_CFG = [];
let planoEditId = null;

/* ---------------- CARREGAR ---------------- */
async function carregarConfig() {
  const tb = document.getElementById('planos-rows');
  tb.innerHTML = '<tr><td colspan="5" class="carregando">Carregando…</td></tr>';

  const [{ data: planos, error }, { data: cfg }, { data: contagens }] = await Promise.all([
    db.from('planos').select('*').order('valor'),
    db.from('config').select('*'),
    db.from('alunos').select('plano_id').eq('ativo', true),
  ]);

  if (error) { tb.innerHTML = `<tr><td colspan="5" class="vazio">Erro: ${esc(error.message)}</td></tr>`; return; }
  PLANOS_CFG = planos || [];

  /* ---------- Planos ---------- */
  const qtdPor = {};
  (contagens || []).forEach(a => { qtdPor[a.plano_id] = (qtdPor[a.plano_id] || 0) + 1; });

  tb.innerHTML = PLANOS_CFG.length ? PLANOS_CFG.map(p => `
    <tr>
      <td><b>${esc(p.nome)}</b>${p.ativo === false ? ' <span class="badge b-off">Inativo</span>' : ''}</td>
      <td><b>${brl(p.valor)}</b></td>
      <td>${p.periodicidade_meses === 1 ? 'Mensal' : 'A cada ' + p.periodicidade_meses + ' meses'}</td>
      <td>${qtdPor[p.id] || 0} aluno(s)</td>
      <td><div class="acts">
        <button class="icon-btn" title="Editar" onclick="abrirPlano(${p.id})">✎</button>
        <button class="icon-btn del" title="Excluir" onclick="excluirPlano(${p.id})">🗑</button>
      </div></td>
    </tr>`).join('') : '<tr><td colspan="5" class="vazio">Nenhum plano cadastrado.</td></tr>';

  /* ---------- Controles da geração ---------- */
  const mapa = {};
  (cfg || []).forEach(c => { mapa[c.chave] = c.valor; });
  document.getElementById('cfg-pausa').checked = mapa['geracao_faturas_pausada'] === 'true';
  document.getElementById('cfg-dias').value = mapa['dias_antes_vencimento_gerar'] || '10';
  const lbl = document.getElementById('cfg-pausa-lbl');
  if (mapa['geracao_faturas_pausada'] === 'true') {
    lbl.textContent = 'Status atual: PAUSADA — o cron diário NÃO emite novas faturas.';
    lbl.style.color = 'var(--late)';
  } else {
    lbl.textContent = 'Status atual: ATIVA — faturas são emitidas automaticamente todos os dias, respeitando a antecedência abaixo.';
    lbl.style.color = 'var(--ok)';
  }
}

/* ---------------- CONTROLES DA GERAÇÃO ---------------- */
async function salvarPausa() {
  const pausado = document.getElementById('cfg-pausa').checked;
  if (pausado && !confirm('PAUSAR a geração automática de faturas?\n\nEnquanto pausada, nenhum aluno recebe cobrança nova (as já emitidas continuam válidas).')) {
    document.getElementById('cfg-pausa').checked = false;
    return;
  }
  const { error } = await db.from('config')
    .update({ valor: String(pausado), updated_at: new Date().toISOString() })
    .eq('chave', 'geracao_faturas_pausada');
  toast(error ? 'Erro: ' + error.message : (pausado ? 'Geração pausada ⏸' : 'Geração reativada ▶'));
  carregarConfig();
}

async function salvarDias() {
  const dias = parseInt(document.getElementById('cfg-dias').value) || 10;
  if (dias < 1 || dias > 30) { toast('Use um valor entre 1 e 30 dias.'); return; }
  const { error } = await db.from('config')
    .update({ valor: String(dias), updated_at: new Date().toISOString() })
    .eq('chave', 'dias_antes_vencimento_gerar');
  toast(error ? 'Erro: ' + error.message : `Faturas passam a ser geradas ${dias} dia(s) antes do vencimento ✓`);
}

/* ---------------- PLANOS: NOVO / EDITAR ---------------- */
function abrirPlano(id) {
  planoEditId = id;
  const p = id ? PLANOS_CFG.find(x => x.id === id) : null;
  document.getElementById('mpl-title').textContent = p ? 'Editar plano' : 'Novo plano';
  document.getElementById('mpl-nome').value = p?.nome || '';
  document.getElementById('mpl-valor').value = p ? Number(p.valor).toFixed(2) : '';
  document.getElementById('mpl-per').value = p?.periodicidade_meses || 1;
  document.getElementById('mpl-ativo').checked = p ? p.ativo !== false : true;
  openModal('m-plano');
}

async function salvarPlano() {
  const nome = document.getElementById('mpl-nome').value.trim();
  const valor = parseFloat(document.getElementById('mpl-valor').value) || 0;
  if (!nome) { toast('Informe o nome do plano.'); return; }
  if (valor <= 0) { toast('Informe um valor válido.'); return; }

  const registro = {
    nome,
    valor,
    periodicidade_meses: parseInt(document.getElementById('mpl-per').value) || 1,
    ativo: document.getElementById('mpl-ativo').checked,
  };

  let error;
  if (planoEditId) ({ error } = await db.from('planos').update(registro).eq('id', planoEditId));
  else             ({ error } = await db.from('planos').insert(registro));

  if (error) { toast('Erro ao salvar: ' + error.message); return; }
  closeModal('m-plano');
  toast(planoEditId
    ? 'Plano atualizado ✓ — novas faturas usam o valor novo; as já emitidas não mudam.'
    : 'Plano criado ✓');
  carregarConfig();
}

/* ---------------- PLANOS: EXCLUIR ---------------- */
async function excluirPlano(id) {
  const p = PLANOS_CFG.find(x => x.id === id);
  if (!p) return;

  const { count } = await db.from('alunos')
    .select('id', { count: 'exact', head: true }).eq('plano_id', id);

  if (count > 0) {
    alert(`O plano "${p.nome}" tem ${count} aluno(s) vinculado(s) (ativos ou inativos).\n\nMova os alunos para outro plano antes de excluir — ou apenas INATIVE o plano (✎ → desmarcar "ativo"): ele some das opções de cadastro, mas os alunos atuais continuam nele.`);
    return;
  }
  if (!confirm(`Excluir o plano "${p.nome}"?`)) return;
  const { error } = await db.from('planos').delete().eq('id', id);
  toast(error ? 'Erro: ' + error.message : 'Plano excluído ✓');
  carregarConfig();
}
