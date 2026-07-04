/* ============================================================
   HEALFIT — APP: conexão, login, sessão, navegação, helpers
   ============================================================ */
const db = supabase.createClient(HF_CONFIG.SUPABASE_URL, HF_CONFIG.SUPABASE_ANON);

/* ---------------- HELPERS GLOBAIS ---------------- */
const brl  = v => 'R$ ' + Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
const fmt  = d => { if (!d) return '—'; const [a, m, dd] = String(d).slice(0, 10).split('-'); return `${dd}/${m}/${a}`; };
const ini  = n => String(n || 'HF').trim().split(/\s+/).map(p => p[0]).slice(0, 2).join('').toUpperCase();
const cores = ['#17b06b', '#0d6e8f', '#8a4bd6', '#d97a2b', '#c73e6b', '#2b6bd9', '#5f8a1c'];
const corDe = i => cores[i % cores.length];
const stBadge = s => s === 'pago' ? '<span class="badge b-ok">Pago</span>'
  : s === 'pendente' ? '<span class="badge b-warn">Pendente</span>'
  : s === 'atrasado' ? '<span class="badge b-late">Atrasado</span>'
  : s === 'cancelado' ? '<span class="badge b-off">Cancelado</span>'
  : `<span class="badge b-warn">${s}</span>`;
const esc = s => String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

let tt;
function toast(msg) {
  document.getElementById('toast-msg').textContent = msg;
  const t = document.getElementById('toast');
  t.classList.add('show');
  clearTimeout(tt);
  tt = setTimeout(() => t.classList.remove('show'), 3400);
}
function openModal(id) { document.getElementById(id).classList.add('open'); }
function closeModal(id) { document.getElementById(id).classList.remove('open'); }

/* ---------------- LOGIN / SESSÃO ---------------- */
async function fazerLogin() {
  const btn = document.getElementById('lg-btn');
  const erro = document.getElementById('lg-erro');
  erro.style.display = 'none';
  btn.disabled = true; btn.textContent = 'ENTRANDO…';

  const user = document.getElementById('lg-user').value.trim();
  const pass = document.getElementById('lg-pass').value;
  if (!user || !pass) {
    erro.textContent = 'Preencha usuário e senha.'; erro.style.display = 'block';
    btn.disabled = false; btn.textContent = 'ENTRAR'; return;
  }
  const email = user.includes('@') ? user : `${user}@${HF_CONFIG.DOMINIO_LOGIN}`;
  const { error } = await db.auth.signInWithPassword({ email, password: pass });
  if (error) {
    erro.textContent = 'Usuário ou senha incorretos.'; erro.style.display = 'block';
    btn.disabled = false; btn.textContent = 'ENTRAR'; return;
  }
  entrar();
}

async function sair() {
  await db.auth.signOut();
  location.reload();
}

async function boot() {
  document.getElementById('lg-pass').addEventListener('keydown', e => { if (e.key === 'Enter') fazerLogin(); });
  const { data: { session } } = await db.auth.getSession();
  if (session) entrar();
}

async function entrar() {
  document.getElementById('tela-login').style.display = 'none';
  document.getElementById('app').style.display = 'block';

  const { data: { user } } = await db.auth.getUser();
  const nome = user?.user_metadata?.nome || (user?.email || 'HealFit').split('@')[0];
  const hora = new Date().getHours();
  const saud = hora < 12 ? 'Bom dia' : hora < 18 ? 'Boa tarde' : 'Boa noite';
  document.getElementById('saudacao').textContent = `${saud}, ${nome} 👊`;
  document.getElementById('user-nome').textContent = nome;
  document.getElementById('user-ini').textContent = ini(nome);
  document.getElementById('data-hoje').textContent =
    new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });

  carregarDashboard();
}

/* ---------------- NAVEGAÇÃO ---------------- */
function go(v, el) {
  document.querySelectorAll('.view').forEach(x => x.classList.remove('active'));
  document.getElementById('v-' + v).classList.add('active');
  document.querySelectorAll('.nav-item').forEach(x => x.classList.remove('active'));
  el.classList.add('active');

  // cada módulo carrega seus dados ao abrir
  if (v === 'dashboard' && typeof carregarDashboard === 'function') carregarDashboard();
  if (v === 'alunos'    && typeof carregarAlunos    === 'function') carregarAlunos();
  if (v === 'personais' && typeof carregarPersonais === 'function') carregarPersonais();
  if (v === 'financeiro' && typeof carregarFinanceiro === 'function') carregarFinanceiro();
  if (v === 'despesas'   && typeof carregarDespesas   === 'function') carregarDespesas();
}

boot();
