/* ============================================================
   HEALFIT — CONFIGURAÇÃO DE AMBIENTE
   Na virada para produção (Fase 6), só este arquivo muda.
   ============================================================ */
const HF_CONFIG = {
  SUPABASE_URL:  'https://annalgynpcuaoexjjrmy.supabase.co',
  SUPABASE_ANON: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFubmFsZ3lucGN1YW9leGpqcm15Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODMwNTMyMDIsImV4cCI6MjA5ODYyOTIwMn0.DiE-H1O750JPdjx2qaovmBDqasFWPEQObtAG5NpGsg4',
  AMBIENTE: 'sandbox',            // 'sandbox' | 'producao'
  DOMINIO_LOGIN: 'healfit.local', // usuário "healfit" vira healfit@healfit.local
};
