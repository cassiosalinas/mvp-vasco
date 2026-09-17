// assets/fan-site.js
//
// "Login" compartilhado do ShopVasco / Sócio Torcedor — sem senha, é uma
// consulta real ao contato no HubSpot por e-mail ({action:'lookup_fan'} em
// hubspot-admin.js), usada só pra saudar o torcedor e mostrar o preço
// estimado do ingresso por nível de sócio. O preço final é sempre recalculado
// no servidor (stripe-checkout.js) — nada aqui é fonte de verdade de preço.

const FAN_BACKEND = '/.netlify/functions/hubspot-admin';
const TIER_LABELS = { basico: 'Não-sócio', bronze: 'Sócio Bronze', prata: 'Sócio Prata', ouro: 'Sócio Ouro', platina: 'Sócio Platina' };
const TIER_TICKET_PRICE_BRL = { basico: 80, bronze: 65, prata: 50, ouro: 30, platina: 15 };

let currentFan = null;

function getStoredFanEmail() {
  try { return localStorage.getItem('vasco_fan_email') || ''; } catch (e) { return ''; }
}
function setStoredFanEmail(email) {
  try { email ? localStorage.setItem('vasco_fan_email', email) : localStorage.removeItem('vasco_fan_email'); } catch (e) {}
}
function fanTier() {
  if (!currentFan || !currentFan.found) return null;
  return currentFan.eSocioTorcedor === 'sim' ? currentFan.nivelSocio : 'basico';
}

async function lookupFan(email) {
  const r = await fetch(FAN_BACKEND, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'lookup_fan', email }),
  });
  const d = await r.json();
  if (!r.ok || !d.ok) throw new Error(d.error || 'Falha ao consultar o torcedor no HubSpot.');
  return d;
}

function renderLoginBar() {
  const bar = document.getElementById('login-bar');
  if (!bar) return;
  if (currentFan && currentFan.found) {
    const tier = fanTier();
    const initials = ((currentFan.firstname || '?')[0] + ((currentFan.lastname || '')[0] || '')).toUpperCase();
    bar.innerHTML = `
      <div class="fan-avatar">${initials}</div>
      <div>
        <div class="login-name">${currentFan.firstname || ''} ${currentFan.lastname || ''}</div>
        <div class="login-sub"><span class="tier-pill tier-${tier}">${TIER_LABELS[tier]}</span> · ${(currentFan.pontosLoyalty || 0).toLocaleString('pt-BR')} pontos de fidelidade</div>
      </div>
      <span class="logout-link" onclick="fanLogout()">Sair</span>`;
  } else {
    bar.innerHTML = `
      <div class="login-form">
        <input type="email" id="login-email" placeholder="seuemail@exemplo.com (torcedor cadastrado no clube)" value="${getStoredFanEmail()}">
        <button class="login-btn" id="login-btn" onclick="fanLogin()">Entrar</button>
      </div>`;
  }
}

async function fanLogin() {
  const input = document.getElementById('login-email');
  const btn = document.getElementById('login-btn');
  const email = (input.value || '').trim();
  if (!email) return;
  btn.disabled = true;
  btn.textContent = 'Consultando…';
  try {
    const d = await lookupFan(email);
    if (!d.found) {
      btn.disabled = false;
      btn.textContent = 'Entrar';
      alert('Torcedor não encontrado no CRM do clube. Tente rafael.colina@vasco-demo.example.com ou outro e-mail da base.');
      return;
    }
    currentFan = d;
    setStoredFanEmail(email);
    renderLoginBar();
    if (typeof onFanLogin === 'function') onFanLogin();
  } catch (e) {
    btn.disabled = false;
    btn.textContent = 'Entrar';
    alert(e.message);
  }
}

function fanLogout() {
  currentFan = null;
  setStoredFanEmail('');
  renderLoginBar();
  if (typeof onFanLogout === 'function') onFanLogout();
}

async function initFanLogin() {
  renderLoginBar();
  const stored = getStoredFanEmail();
  if (!stored) return;
  try {
    const d = await lookupFan(stored);
    if (d.found) {
      currentFan = d;
      renderLoginBar();
      if (typeof onFanLogin === 'function') onFanLogin();
    }
  } catch (e) { /* silencioso — usuário só vê a barra de login vazia */ }
}

// ---- Catálogo de recompensas Minu (dados reais — Nuvem Minu, set/2026) ----
// Compartilhado entre ShopVasco, Sócio Torcedor e Museu Virtual — mesma
// "vantagem de sócio" visível nos três lugares, não só escondida numa
// página. name/brand/cat/gmv vêm direto da planilha de parceiros da Minu;
// pointsCost é a conversão local pro sistema de pontos do clube (10 pontos
// = R$1, mesma ordem de grandeza do pontos_loyalty já usado no CRM).
// "logo" é o logo real de cada marca (Wikimedia Commons — clube tem contrato
// real com a Minu, então usar as marcas de verdade aqui não é problema,
// diferente de uma demo especulativa); "icon" é o desenho de fallback (usado
// só se o logo falhar ao carregar, ou pra AACD, que não tem logo hospedado
// lá) numa cor de identificação por parceiro.
const MINU_REWARDS = [
  { brand: 'Uber', cat: 'Transporte', name: 'Desconto de R$30 para uma viagem no app Uber', gmv: 30, icon: 'car', color: '#1fae64', logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/58/Uber_logo_2018.svg/250px-Uber_logo_2018.svg.png' },
  { brand: 'Zé Delivery', cat: 'Alimentação', name: 'Cupom de R$50 para usar no Zé Delivery', gmv: 50, icon: 'drink', color: '#ffd400', logo: 'https://upload.wikimedia.org/wikipedia/commons/1/19/Z%C3%A9_Delivery_logo.png' },
  { brand: 'Outback', cat: 'Alimentação', name: 'Cartão-presente de R$100 para usar no Outback', gmv: 100, icon: 'fork', color: '#c0392b', logo: 'https://upload.wikimedia.org/wikipedia/pt/2/27/Outback_Steakhouse.png' },
  { brand: 'Netshoes', cat: 'Compras', name: 'Desconto de R$100 na loja virtual (compras acima de R$600)', gmv: 100, icon: 'shoe', color: '#ff7a00', logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/7/7c/Netshoes_2024.svg/250px-Netshoes_2024.svg.png' },
  { brand: 'Asics', cat: 'Compras', name: 'Crédito de R$50 para compras de produtos ASICS', gmv: 50, icon: 'shoe', color: '#3d5a99', logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/b/b1/Asics_Logo.svg/250px-Asics_Logo.svg.png' },
  { brand: 'Decathlon', cat: 'Compras', name: 'Cartão-presente de R$70', gmv: 70, icon: 'dumbbell', color: '#0082c3', logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/b/bc/Decathlon_-_logo_%28France%2C_2024%29.svg/250px-Decathlon_-_logo_%28France%2C_2024%29.svg.png' },
  { brand: 'Havaianas', cat: 'Compras', name: 'Cartão-presente de R$50', gmv: 50, icon: 'sandal', color: '#00a19a', logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/b/b1/Logotipo_da_Havaianas.svg/250px-Logotipo_da_Havaianas.svg.png' },
  { brand: 'Xbox Cash', cat: 'Games', name: 'Cartão-presente Xbox Cash de R$50', gmv: 50, icon: 'controller', color: '#107c10', logo: 'https://upload.wikimedia.org/wikipedia/pt/thumb/7/75/XBOX_logo_%282026%29.png/250px-XBOX_logo_%282026%29.png' },
  { brand: 'Sony Playstation', cat: 'Games', name: 'Cartão-presente PlayStation de R$60', gmv: 60, icon: 'controller', color: '#2e6fd9', logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/5c/PlayStation_logo_and_wordmark.svg/250px-PlayStation_logo_and_wordmark.svg.png' },
  { brand: 'Cinemark', cat: 'Entretenimento', name: '2 Ingressos de Cinema 2D', gmv: 80, icon: 'film', color: '#e4002b', logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/cd/Cinemark_Logo.svg/250px-Cinemark_Logo.svg.png' },
  { brand: 'Deezer', cat: 'Entretenimento', name: 'Deezer Premium — Assinatura Mensal', gmv: 24, icon: 'music', color: '#a238ff', logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/7/75/Deezer_logo%2C_2023.svg/250px-Deezer_logo%2C_2023.svg.png' },
  { brand: 'Petz', cat: 'Pets', name: 'Cartão-presente de R$30', gmv: 30, icon: 'paw', color: '#f39200', logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c4/Logotipo_da_Petz_%282023%29.svg/330px-Logotipo_da_Petz_%282023%29.svg.png' },
  { brand: 'Riachuelo', cat: 'Compras', name: 'Cartão-presente de R$50', gmv: 50, icon: 'hanger', color: '#ee2737', logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/55/Logotipo_da_Riachuelo_%282026%29.svg/250px-Logotipo_da_Riachuelo_%282026%29.svg.png' },
  { brand: 'AACD', cat: 'Solidariedade', name: 'Doação para os projetos da AACD', gmv: 1, icon: 'heart', color: '#ff5c72' },
];

const REWARD_ICON_PATHS = {
  car: '<path d="M20 60 L26 40 Q30 34 40 34 H60 Q70 34 74 40 L80 60"/><rect x="14" y="58" width="72" height="16" rx="4"/><circle cx="30" cy="76" r="7"/><circle cx="70" cy="76" r="7"/>',
  drink: '<path d="M42 18 H58 V30 L66 42 V85 A6 6 0 0160 91 H40 A6 6 0 0134 85 V42 L42 30 Z"/><line x1="34" y1="55" x2="66" y2="55"/>',
  fork: '<path d="M30 15 V85 M25 15 V35 A5 5 0 0030 40 A5 5 0 0035 35 V15"/><path d="M70 15 Q60 25 60 40 Q60 50 70 55 V85"/>',
  shoe: '<path d="M15 70 Q15 55 30 52 L55 45 Q65 42 72 48 L82 58 Q86 62 86 68 V75 H15 Z"/><path d="M30 52 L35 65 M45 49 L50 63"/>',
  dumbbell: '<rect x="10" y="42" width="12" height="16" rx="2"/><rect x="78" y="42" width="12" height="16" rx="2"/><line x1="22" y1="50" x2="78" y2="50" stroke-width="5"/>',
  sandal: '<path d="M20 55 Q20 40 50 40 Q80 40 80 55 Q80 75 60 78 H30 Q20 75 20 55 Z"/><path d="M50 40 V20 M50 20 L38 30 M50 20 L62 30"/>',
  controller: '<rect x="14" y="38" width="72" height="36" rx="16"/><circle cx="32" cy="56" r="3.5" fill="currentColor" stroke="none"/><circle cx="24" cy="56" r="3.5" fill="currentColor" stroke="none"/><circle cx="28" cy="52" r="3.5" fill="currentColor" stroke="none"/><circle cx="28" cy="60" r="3.5" fill="currentColor" stroke="none"/><circle cx="68" cy="50" r="3.5" fill="currentColor" stroke="none"/><circle cx="76" cy="58" r="3.5" fill="currentColor" stroke="none"/><circle cx="60" cy="58" r="3.5" fill="currentColor" stroke="none"/><circle cx="68" cy="66" r="3.5" fill="currentColor" stroke="none"/>',
  film: '<rect x="18" y="25" width="64" height="50" rx="4"/><circle cx="30" cy="35" r="3" fill="currentColor" stroke="none"/><circle cx="30" cy="65" r="3" fill="currentColor" stroke="none"/><circle cx="70" cy="35" r="3" fill="currentColor" stroke="none"/><circle cx="70" cy="65" r="3" fill="currentColor" stroke="none"/><line x1="42" y1="25" x2="42" y2="75"/><line x1="58" y1="25" x2="58" y2="75"/>',
  music: '<circle cx="30" cy="72" r="9"/><circle cx="68" cy="65" r="9"/><path d="M39 72 V25 L77 18 V65"/>',
  paw: '<circle cx="50" cy="65" r="15"/><circle cx="26" cy="42" r="9"/><circle cx="74" cy="42" r="9"/><circle cx="37" cy="26" r="8"/><circle cx="63" cy="26" r="8"/>',
  hanger: '<circle cx="50" cy="20" r="5"/><path d="M50 25 V33 M18 68 L50 33 L82 68 H18 Z"/>',
  heart: '<path d="M50 82 C18 58 13 38 29 27 C40 19 50 27 50 34 C50 27 60 19 71 27 C87 38 82 58 50 82 Z"/>',
};
function rewardIconSvg(iconName, color){
  const path = REWARD_ICON_PATHS[iconName] || REWARD_ICON_PATHS.heart;
  return `<svg viewBox="0 0 100 100" fill="none" stroke="${color}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" style="color:${color};">${path}</svg>`;
}

// Logo real (marca do parceiro Minu de verdade — clube tem contrato, sem
// problema nenhum em mostrar) num fundo claro pra ficar legível; se falhar
// ao carregar, cai pro ícone desenhado com a cor da marca, sem quebrar o card.
function onRewardLogoError(imgEl, index){
  const r = MINU_REWARDS[index];
  imgEl.closest('.reward-icon').outerHTML = `<div class="reward-icon" style="background:${r.color}1a; border-color:${r.color}44;">${rewardIconSvg(r.icon, r.color)}</div>`;
}
function rewardMedia(r, i){
  if(r.logo){
    return `<div class="reward-icon reward-icon-logo"><img src="${r.logo}" alt="${r.brand}" loading="lazy" onerror="onRewardLogoError(this, ${i})"></div>`;
  }
  return `<div class="reward-icon" style="background:${r.color}1a; border-color:${r.color}44;">${rewardIconSvg(r.icon, r.color)}</div>`;
}

// targetId é opcional — default 'reward-grid', mas dá pra ter mais de uma
// grade na mesma página (não usado hoje, mas mantém flexível).
function renderRewards(targetId) {
  const el = document.getElementById(targetId || 'reward-grid');
  if (!el) return;
  el.innerHTML = MINU_REWARDS.map((r, i) => {
    const pts = r.gmv * 10;
    return `
    <div class="reward-card">
      ${rewardMedia(r, i)}
      <div class="reward-top">
        <span class="reward-brand">${r.brand}</span>
        <span class="reward-real-badge">🟢 catálogo real</span>
      </div>
      <div class="reward-cat">${r.cat}</div>
      <div class="reward-name">${r.name}</div>
      <div class="reward-cost">${pts.toLocaleString('pt-BR')}<small> pontos</small></div>
      <button class="reward-redeem" onclick="resgatar(${i})">Resgatar</button>
    </div>`;
  }).join('');
}

// Resgate — desconta pontos de verdade do pontos_loyalty do torcedor no
// HubSpot ({action:'redeem_reward'}), na mesma taxa de conversão mostrada
// no card (10 pontos = R$1 de gmv). Só depois do débito real confirmado é
// que o voucher (código local, gerado na hora — a Minu não tem API de
// emissão de voucher pra essa demo) é mostrado.
function generateVoucherCode(){
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = 'MINU-';
  for(let i = 0; i < 8; i++){
    if(i === 4) code += '-';
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}
function closeVoucherModal(){
  document.querySelector('.voucher-overlay')?.remove();
}
function showRewardMessage(html){
  closeVoucherModal();
  const overlay = document.createElement('div');
  overlay.className = 'voucher-overlay';
  overlay.onclick = (e) => { if(e.target === overlay) closeVoucherModal(); };
  overlay.innerHTML = `<div class="voucher-modal">${html}</div>`;
  document.body.appendChild(overlay);
}
function showRewardError(message){
  showRewardMessage(`
    <div class="voucher-check" style="background:rgba(226,35,26,.16); border-color:rgba(226,35,26,.4); color:#ff8c85;">✕</div>
    <div class="voucher-title">Não foi possível resgatar</div>
    <div class="voucher-note" style="margin-bottom:22px;">${message}</div>
    <button class="fan-btn" onclick="closeVoucherModal()">Fechar</button>`);
}
async function resgatar(i){
  const r = MINU_REWARDS[i];
  const cost = r.gmv * 10;

  if(!(currentFan && currentFan.found)){
    showRewardError('Faça login com seu e-mail de sócio-torcedor no topo da página pra resgatar com seus pontos de fidelidade.');
    return;
  }
  if((currentFan.pontosLoyalty || 0) < cost){
    showRewardError(`Você tem <b style="color:var(--paper);">${(currentFan.pontosLoyalty || 0).toLocaleString('pt-BR')} pontos</b> — esse resgate custa <b style="color:var(--paper);">${cost.toLocaleString('pt-BR')} pontos</b>.`);
    return;
  }

  const btn = document.querySelectorAll('.reward-redeem')[i];
  const original = btn ? btn.textContent : '';
  if(btn){ btn.disabled = true; btn.textContent = 'Resgatando…'; }

  try{
    const res = await fetch(FAN_BACKEND, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'redeem_reward', email: currentFan.email, points: cost, reward_name: r.name }),
    });
    const d = await res.json();
    if(!res.ok || !d.ok) throw new Error(d.error || 'Falha ao debitar pontos no HubSpot.');

    currentFan.pontosLoyalty = d.newTotal;
    renderLoginBar();

    const code = generateVoucherCode();
    const validUntil = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toLocaleDateString('pt-BR');
    showRewardMessage(`
      <div class="voucher-check">✓</div>
      <div class="voucher-title">Voucher gerado!</div>
      <div class="voucher-logo-wrap">${rewardMedia(r, i)}</div>
      <div class="voucher-brand">${r.brand}</div>
      <div class="voucher-reward">${r.name}</div>
      <div class="voucher-code-label">Seu código de resgate</div>
      <div class="voucher-code">${code}</div>
      <div class="voucher-note">-${cost.toLocaleString('pt-BR')} pontos gravados de verdade no HubSpot · saldo atual: <b style="color:var(--paper);">${d.newTotal.toLocaleString('pt-BR')} pontos</b><br>Válido até ${validUntil} · apresente esse código no app ou site do parceiro</div>
      <button class="fan-btn" onclick="closeVoucherModal()">Fechar</button>`);
  }catch(e){
    showRewardError(e.message);
  }finally{
    if(btn){ btn.disabled = false; btn.textContent = original; }
  }
}
