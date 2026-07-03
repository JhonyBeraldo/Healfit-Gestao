/* ============================================================
   HEALFIT — DASHBOARD
   ============================================================ */
async function carregarDashboard() {
  const hoje = new Date();
  const iniMes = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-01`;
  const fimMes = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0).toISOString().slice(0, 10);

  // KPIs: pagos no mês corrente (por data de pagamento)
  const { data: pagos, error: e1 } = await db.from('mensalidades')
    .select('valor_total, valor_personal')
    .eq('status', 'pago')
    .gte('pago_em', iniMes + 'T00:00:00')
    .lte('pago_em', fimMes + 'T23:59:59');

  if (!e1) {
    const bruto = (pagos || []).reduce((s, m) => s + Number(m.valor_total), 0);
    const repasse = (pagos || []).reduce((s, m) => s + Number(m.valor_personal), 0);
    document.getElementById('k-bruto').textContent = brl(bruto);
    document.getElementById('k-academia').textContent = brl(bruto - repasse);
    document.getElementById('k-repasse').textContent = brl(repasse);
  }

  // Atrasados (todos)
  const { data: atrasados } = await db.from('mensalidades')
    .select('valor_total').eq('status', 'atrasado');
  const totAtraso = (atrasados || []).reduce((s, m) => s + Number(m.valor_total), 0);
  document.getElementById('k-atraso').textContent = brl(totAtraso);
  document.getElementById('k-atraso-qtd').textContent = `${(atrasados || []).length} fatura(s) vencida(s)`;

  // Vencimentos próximos + atrasos
  const { data: lista, error: e2 } = await db.from('vw_financeiro')
    .select('aluno, vencimento, valor_total, status')
    .in('status', ['pendente', 'atrasado'])
    .order('vencimento', { ascending: true })
    .limit(8);

  const tb = document.getElementById('dash-rows');
  if (e2) { tb.innerHTML = `<tr><td colspan="4" class="vazio">Erro ao carregar: ${esc(e2.message)}</td></tr>`; return; }
  if (!lista || !lista.length) {
    tb.innerHTML = '<tr><td colspan="4" class="vazio">Nenhuma fatura pendente ou atrasada. 🎉</td></tr>'; return;
  }
  tb.innerHTML = lista.map((m, i) => `
    <tr>
      <td><div class="aluno-cell"><div class="av" style="background:${corDe(i)}">${ini(m.aluno)}</div><div class="nm">${esc(m.aluno)}</div></div></td>
      <td>${fmt(m.vencimento)}</td>
      <td><b>${brl(m.valor_total)}</b></td>
      <td>${stBadge(m.status)}</td>
    </tr>`).join('');
}
