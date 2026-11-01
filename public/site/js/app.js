// Gestion globale de la vitrine et des tarifs
let allServices = [];
let currentUser = null;

document.addEventListener('DOMContentLoaded', async () => {
  await checkAuthStatus();
  await loadServices();
});

async function checkAuthStatus() {
  try {
    const res = await fetch('/api/auth/me');
    const data = await res.json();
    const navSlot = document.getElementById('auth-nav-slot');

    if (data.loggedIn) {
      currentUser = data.user;
      const targetPage = currentUser.role === 'admin' ? '/admin.html' : '/dashboard.html';
      const label = currentUser.role === 'admin' ? '⚙️ Atelier (Admin)' : `👤 ${currentUser.prenom}`;
      navSlot.innerHTML = `
        <a href="${targetPage}" class="btn btn-primary btn-sm">${label}</a>
      `;
    } else {
      currentUser = null;
      navSlot.innerHTML = `
        <a href="/login.html" class="btn btn-outline btn-sm">Se connecter / S'inscrire</a>
      `;
    }
  } catch (err) {
    console.error('Erreur vérification auth:', err);
  }
}

async function loadServices() {
  try {
    const res = await fetch('/api/services');
    allServices = await res.json();
    renderCategories(allServices);
    renderServices(allServices);
  } catch (err) {
    console.error('Erreur chargement des tarifs:', err);
  }
}

function renderCategories(services) {
  const categories = ['all', ...new Set(services.map(s => s.categorie))];
  const filterContainer = document.getElementById('service-filters');
  if (!filterContainer) return;

  filterContainer.innerHTML = categories.map(cat => `
    <button class="filter-btn ${cat === 'all' ? 'active' : ''}" onclick="filterCategory('${cat}', this)">
      ${cat === 'all' ? 'Toutes les prestations' : cat}
    </button>
  `).join('');
}

function filterCategory(cat, btn) {
  document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');

  if (cat === 'all') {
    renderServices(allServices);
  } else {
    const filtered = allServices.filter(s => s.categorie === cat);
    renderServices(filtered);
  }
}

function renderServices(services) {
  const container = document.getElementById('services-container');
  if (!container) return;

  if (services.length === 0) {
    container.innerHTML = '<p style="text-align:center; grid-column: 1/-1;">Aucune prestation trouvée.</p>';
    return;
  }

  container.innerHTML = services.map(s => `
    <div class="service-card">
      <div>
        <div class="service-badge">${s.categorie}</div>
        <h3 class="service-title">${s.titre}</h3>
        <p class="service-desc">${s.description}</p>
        ${s.inclus ? `<div class="service-inclus"><strong>Comprend :</strong> ${s.inclus}</div>` : ''}
      </div>
      <div>
        <div class="service-footer">
          <div>
            <div style="font-size: 0.75rem; color: #94a3b8;">À PARTIR DE</div>
            <div class="service-price">${s.prix_indicatif.toFixed(2)} <span style="font-size: 1rem; color: #38bdf8;">CHF</span></div>
          </div>
          <button class="btn btn-primary btn-sm" onclick="selectServiceForQuote(${s.id}, '${escapeJs(s.titre)}')">
            Demander ce devis
          </button>
        </div>
      </div>
    </div>
  `).join('');
}

function escapeJs(str) {
  return (str || '').replace(/'/g, "\\'").replace(/"/g, '\\"');
}

function selectServiceForQuote(serviceId, serviceTitle) {
  // Ouvre le chatbot et prépare la demande sur ce forfait
  if (typeof startChatWithService === 'function') {
    startChatWithService(serviceId, serviceTitle);
  } else {
    window.location.href = '/login.html';
  }
}

// Navigation mobile fluide
function toggleMobileMenu() {
  const nav = document.getElementById('navLinks');
  const btn = document.getElementById('mobileMenuBtn');
  if (!nav || !btn) return;
  const isOpen = nav.classList.toggle('open');
  btn.classList.toggle('open', isOpen);
  btn.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
}

function closeMobileMenu() {
  const nav = document.getElementById('navLinks');
  const btn = document.getElementById('mobileMenuBtn');
  if (nav) nav.classList.remove('open');
  if (btn) {
    btn.classList.remove('open');
    btn.setAttribute('aria-expanded', 'false');
  }
}

