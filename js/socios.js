/* ============================================================
   HEALFIT — MÓDULO PARTICIPAÇÃO DOS SÓCIOS
   v1.0 — base = valor efetivamente recebido − personais;
   despesas informativas; fechar período (snapshot); histórico
   ============================================================ */
let SOCIOS = [];
let PART_ATUAL = null; // resultado da fn_participacao do período em tela

/* ---------------- CARREGAR ---------------- */
function socPeriodoPadrao() {
  const h = new Date();
  const ini = `${h.getFullYear()}-${String(h.getMonth() + 1).padStart(2, '0')}-01`;
  const fim = new Date(h.getFullYear(), h.getMonth() + 1, 0).toISOString().slice(0, 10);
  const elIni = document.getElementById('soc-ini');
  const elFim = document.getElementById('soc-fim');
  if (!elIni.value) elIni.value = ini;
  if (!elFim.value) elFim.value = fim;
}

async function carregarSocios() {
  socPeriodoPadrao();
  const pIni = document.getElementById('soc-ini').value;
  const pFim = document.getElementById('soc-fim').value;
  document.getElementById('soc-periodo-lbl').textContent = fmt(pIni) + ' — ' + fmt(pFim);

  const [{ data: socios }, { data: part, error: eP }, { data: fech }] = await Promise.all([
    db.from('socios').select('*').is('vigencia_fim', null).order('percentual', { ascending: false }),
    db.rpc('fn_participacao', { p_ini: pIni, p_fim: pFim }),
    db.from('fechamentos').select('*').order('periodo_ini', { ascending: false }).limit(12),
  ]);

  SOCIOS = socios || [];
  PART_ATUAL = (part && part[0]) || null;

  /* ---------- Base de cálculo ---------- */
  if (eP || !PART_ATUAL) {
    document.getElementById('soc-erro').textContent = 'Erro ao calcular: ' + (eP?.message || 'sem dados');
  } else {
    const p = PART_ATUAL;
    document.getElementById('c-bruto').textContent = brl(p.bruto_recebido);
    document.getElementById('c-repasse').textContent = '− ' + brl(p.total_personais);
    document.getElementById('c-base').textContent = brl(p.base_distribuicao);
    document.getElementById('c-despesas').textContent = brl(p.despesas_periodo);
  }

  /* ---------- Barra e legenda ---------- */
  document.getElementById('soc-bar').innerHTML =
    SOCIOS.map((s, i) => `<div style="width:${s.percentual}%;background:${corDe(i)}"></div>`).join('');
  document.getElementById('soc-legend').innerHTML =
    SOCIOS.map((s, i) => `<span><span class="sw" style="background:${corDe(i)}"></span>${esc(s.nome)} · ${Number(s.percentual)}%</span>`).join('');

  /* ---------- Distribuição por sócio ---------- */
  const base = Number(PART_ATUAL?.base_distribuicao || 0);
  document.getElementById('soc-rows').innerHTML = SOCIOS.length
    ? SOCIOS.map((s, i) => `
      <tr>
        <td><div class="aluno-cell"><div class="av" style="background:${corDe(i)}">${ini(s.nome)}</div><div class="nm">${esc(s.nome)}</div></div></td>
        <td><b>${Number(s.percentual)}%</b></td>
        <td style="font-family:'Archivo';font-weight:800;font-size:16px">${brl(base * Number(s.percentual) / 100)}</td>
      </tr>`).join('')
    : '<tr><td colspan="3" class="vazio">Nenhum sócio cadastrado.</td></tr>';

  /* ---------- Histórico de fechamentos ---------- */
  const tbf = document.getElementById('fech-rows');
  if (!fech || !fech.length) {
    tbf.innerHTML = '<tr><td colspan="5" class="vazio">Nenhum período fechado ainda. Use "Fechar período" para gravar o primeiro.</td></tr>';
  } else {
    tbf.innerHTML = fech.map(f => {
      const dist = (f.distribuicao || []).map(d =>
        `${esc(d.socio)} (${Number(d.percentual)}%): <b>${brl(d.valor)}</b>`).join(' · ');
      return `
      <tr>
        <td><b>${fmt(f.periodo_ini)} — ${fmt(f.periodo_fim)}</b></td>
        <td>${brl(f.bruto_recebido)}</td>
        <td>${brl(f.base_distribuicao)}</td>
        <td style="font-size:12.5px">${dist}</td>
        <td><span class="badge b-ok">Fechado</span><div class="pl">${fmt(String(f.created_at).slice(0,10))}</div></td>
      </tr>`;
    }).join('');
  }
}

/* ---------------- FECHAR PERÍODO ---------------- */
async function fecharPeriodo() {
  const pIni = document.getElementById('soc-ini').value;
  const pFim = document.getElementById('soc-fim').value;
  if (!PART_ATUAL) { toast('Aguarde o cálculo carregar.'); return; }

  const p = PART_ATUAL;
  const resumo = (SOCIOS || []).map(s =>
    `${s.nome}: ${brl(Number(p.base_distribuicao) * Number(s.percentual) / 100)}`).join('\n');

  if (!confirm(`FECHAR o período ${fmt(pIni)} — ${fmt(pFim)}?\n\nBase de distribuição: ${brl(p.base_distribuicao)}\n${resumo}\n\nO fechamento grava um registro PERMANENTE para consulta — mudanças futuras de percentuais ou lançamentos não alteram períodos fechados.`)) return;

  const { error } = await db.rpc('fn_fechar_periodo', { p_ini: pIni, p_fim: pFim });
  if (error) {
    toast(error.code === '23505'
      ? 'Este período já foi fechado — veja no histórico.'
      : 'Erro ao fechar: ' + error.message);
    return;
  }
  toast('Período fechado e gravado no histórico ✓');
  carregarSocios();
}

/* ---------------- EDITAR PERCENTUAIS ---------------- */
function abrirSocios() {
  const grid = document.getElementById('ms-grid');
  grid.innerHTML = SOCIOS.map((s, i) => `
    <div><label>Sócio ${i + 1}</label><input id="ms-n${i}" value="${esc(s.nome)}"></div>
    <div><label>Percentual (%)</label><input id="ms-p${i}" type="number" min="0" max="100" step="0.5" value="${Number(s.percentual)}" oninput="socSoma()"></div>`).join('');
  socSoma();
  openModal('m-socios');
}

function socSoma() {
  let soma = 0;
  SOCIOS.forEach((_, i) => { soma += parseFloat(document.getElementById('ms-p' + i)?.value) || 0; });
  const nota = document.getElementById('ms-nota');
  soma = Math.round(soma * 100) / 100;
  nota.textContent = soma === 100
    ? '✓ Soma fechada em 100%.'
    : `A soma está em ${soma}% — precisa fechar em 100%.`;
  nota.style.color = soma === 100 ? 'var(--ok)' : 'var(--late)';
}

async function salvarSocios() {
  let soma = 0;
  const novos = SOCIOS.map((s, i) => {
    const nome = document.getElementById('ms-n' + i).value.trim() || s.nome;
    const pct = parseFloat(document.getElementById('ms-p' + i).value) || 0;
    soma += pct;
    return { id: s.id, nome, percentual: pct };
  });
  if (Math.round(soma * 100) / 100 !== 100) { toast('A soma dos percentuais precisa ser 100%.'); return; }

  for (const n of novos) {
    const { error } = await db.from('socios')
      .update({ nome: n.nome, percentual: n.percentual }).eq('id', n.id);
    if (error) { toast('Erro ao salvar: ' + error.message); return; }
  }
  closeModal('m-socios');
  toast('Percentuais atualizados ✓ (fechamentos anteriores não mudam)');
  carregarSocios();
}
