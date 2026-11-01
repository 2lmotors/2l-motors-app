let clientVehicles = [];
let clientServices = [];

document.addEventListener('DOMContentLoaded', async () => {
  await initClientDashboard();
});

function openModal(id, preselectedServiceId) {
  const modal = document.getElementById(id);
  if (!modal) return;
  modal.style.display = 'flex';

  if (id === 'modalQuote' && preselectedServiceId) {
    const cb = document.querySelector(`.service-checkbox[value="${preselectedServiceId}"]`);
    if (cb && !cb.checked) {
      cb.checked = true;
      recalculateQuoteTotal(cb);
    }
  }
}

function closeModal(id) {
  document.getElementById(id).style.display = 'none';
}

async function initClientDashboard() {
  try {
    const res = await fetch('/api/auth/me');
    const data = await res.json();
    if (!data.loggedIn) {
      window.location.href = '/login.html';
      return;
    }

    if (data.user.role === 'admin') {
      window.location.href = '/admin.html';
      return;
    }

    document.getElementById('userGreeting').textContent = `Bonjour, ${data.user.prenom} ${data.user.nom}`;

    await loadServicesSelect();
    await loadVehicles();
    await loadQuotes();
    await loadSav();

    // Vérifier si un devis en attente était stocké dans sessionStorage (par le chatbot avant inscription)
    checkPendingQuote();
  } catch (err) {
    console.error(err);
  }
}

async function loadServicesSelect() {
  try {
    const res = await fetch('/api/services');
    clientServices = await res.json();
    const container = document.getElementById('servicesCheckboxesContainer');
    if (!container) return;

    if (clientServices.length === 0) {
      container.innerHTML = '<div style="color: #94a3b8; font-size: 0.85rem;">Aucun forfait disponible.</div>';
      return;
    }

    container.innerHTML = clientServices.map(s => `
      <label class="service-check-item" id="service-item-${s.id}">
        <div class="service-check-left">
          <input type="checkbox" class="service-checkbox" value="${s.id}" data-price="${s.prix_indicatif}" onchange="recalculateQuoteTotal(this)">
          <div class="service-check-info">
            <span class="service-check-title">${s.titre}</span>
            <span class="service-check-category">${s.categorie}${s.duree_estimee ? ' &bull; ' + s.duree_estimee : ''}</span>
          </div>
        </div>
        <div class="service-check-price">+ ${s.prix_indicatif.toFixed(2)} CHF</div>
      </label>
    `).join('');
  } catch (err) {
    console.error(err);
  }
}

function recalculateQuoteTotal(triggerCheckbox) {
  if (triggerCheckbox) {
    const parentLabel = triggerCheckbox.closest('.service-check-item');
    if (parentLabel) {
      if (triggerCheckbox.checked) {
        parentLabel.classList.add('selected');
      } else {
        parentLabel.classList.remove('selected');
      }
    }
  }

  const checkboxes = document.querySelectorAll('.service-checkbox:checked');
  let total = 0;
  checkboxes.forEach(cb => {
    const price = parseFloat(cb.getAttribute('data-price')) || 0;
    total += price;
  });

  const totalEl = document.getElementById('quoteTotalAmount');
  if (totalEl) {
    totalEl.textContent = total.toFixed(2);
  }

  const countEl = document.getElementById('selectedServicesCount');
  if (countEl) {
    const count = checkboxes.length;
    countEl.textContent = count === 0 
      ? '0 prestation sélectionnée' 
      : `${count} prestation${count > 1 ? 's' : ''} sélectionnée${count > 1 ? 's' : ''}`;
  }
}

async function loadVehicles() {
  try {
    const res = await fetch('/api/vehicles');
    clientVehicles = await res.json();
    const container = document.getElementById('vehiclesList');
    const quoteSelect = document.getElementById('quoteVehicleSelect');

    if (quoteSelect) quoteSelect.innerHTML = '<option value="">-- Sélectionner dans ma liste --</option>';

    if (clientVehicles.length === 0) {
      container.innerHTML = `
        <div style="background: rgba(15, 23, 42, 0.4); padding: 1.5rem; border-radius: 8px; text-align: center;">
          <p style="color: var(--text-muted); margin-bottom: 0.75rem;">Aucun véhicule enregistré pour le moment.</p>
          <button onclick="openModal('modalVehicle')" class="btn btn-outline btn-sm">+ Ajouter mon premier véhicule</button>
        </div>
      `;
      return;
    }

    container.innerHTML = clientVehicles.map(v => `
      <div class="vehicle-card">
        <div>
          <strong style="font-size: 1.1rem; color: #f8fafc;">${v.marque} ${v.modele}</strong>
          <span style="margin-left: 0.5rem; font-size: 0.85rem; color: #94a3b8;">${v.annee ? '(' + v.annee + ')' : ''}</span>
          <div style="margin-top: 0.25rem;">
            <span class="badge badge-info">${v.immatriculation}</span>
            ${v.kilometrage ? `<span style="font-size: 0.85rem; color: #94a3b8; margin-left: 0.5rem;">${v.kilometrage.toLocaleString()} km</span>` : ''}
          </div>
        </div>
      </div>
    `).join('');

    if (quoteSelect) {
      clientVehicles.forEach(v => {
        const opt = document.createElement('option');
        opt.value = v.id;
        opt.textContent = `${v.marque} ${v.modele} (${v.immatriculation})`;
        quoteSelect.appendChild(opt);
      });
    }

  } catch (err) {
    console.error(err);
  }
}

async function loadQuotes() {
  try {
    const res = await fetch('/api/quotes');
    const quotes = await res.json();
    const tbody = document.getElementById('quotesTableBody');

    if (quotes.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; color: var(--text-muted); padding: 2rem;">Vous n’avez aucune demande de devis active.</td></tr>';
      return;
    }

    tbody.innerHTML = quotes.map(q => {
      let actions = '-';
      if (q.statut === 'chiffre') {
        actions = `
          <button class="btn btn-success btn-sm" onclick="respondQuote(${q.id}, 'accepte')">Valider</button>
          <button class="btn btn-outline btn-sm" onclick="respondQuote(${q.id}, 'refuse')" style="color:#fb7185; margin-left:4px;">Refuser</button>
        `;
      }

      return `
        <tr>
          <td>${new Date(q.created_at).toLocaleDateString('fr-FR')}</td>
          <td><strong>${q.immatriculation || (q.vehicule_marque ? q.vehicule_marque + ' ' + q.vehicule_modele : 'Non précisé')}</strong></td>
          <td><strong>${q.service_titre || 'Réparation personnalisée'}</strong><br><small style="color:#94a3b8;">${q.description_panne}</small></td>
          <td>${renderBadge(q.statut)}</td>
          <td><strong style="color: #38bdf8;">${q.montant_estime ? q.montant_estime.toFixed(2) + ' CHF' : 'En chiffrage...'}</strong></td>
          <td><small>${q.commentaires_garage || 'En attente d’étude atelier'}</small></td>
          <td>${actions}</td>
        </tr>
      `;
    }).join('');

  } catch (err) {
    console.error(err);
  }
}

async function loadSav() {
  try {
    const res = await fetch('/api/sav');
    const tickets = await res.json();
    const tbody = document.getElementById('savTableBody');

    if (tickets.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: var(--text-muted); padding: 2rem;">Aucun dossier SAV ouvert. Tout va bien !</td></tr>';
      return;
    }

    tbody.innerHTML = tickets.map(t => `
      <tr>
        <td>${new Date(t.created_at).toLocaleDateString('fr-FR')}</td>
        <td><strong>${t.titre}</strong></td>
        <td><small>${t.description}</small></td>
        <td>${renderBadge(t.statut)}</td>
        <td>${t.reponse_garage ? `<div style="color: #34d399; background: rgba(16, 185, 129, 0.1); padding: 0.5rem; border-radius: 6px;">${t.reponse_garage}</div>` : '<span style="color:#94a3b8;">Attente retour atelier</span>'}</td>
      </tr>
    `).join('');
  } catch (err) {
    console.error(err);
  }
}

function renderBadge(statut) {
  switch(statut) {
    case 'en_attente': return '<span class="badge badge-warning">En attente</span>';
    case 'chiffre': return '<span class="badge badge-info">Chiffré</span>';
    case 'accepte': return '<span class="badge badge-success">Accepté</span>';
    case 'termine': return '<span class="badge badge-success">Terminé</span>';
    case 'refuse': return '<span class="badge badge-danger">Refusé</span>';
    case 'ouvert': return '<span class="badge badge-warning">Ouvert</span>';
    case 'en_cours': return '<span class="badge badge-info">En cours</span>';
    case 'resolu': return '<span class="badge badge-success">Résolu</span>';
    default: return `<span class="badge">${statut}</span>`;
  }
}

async function respondQuote(quoteId, action) {
  if (!confirm(`Confirmez-vous vouloir ${action === 'accepte' ? 'valider' : 'refuser'} ce devis ?`)) return;

  try {
    const res = await fetch(`/api/quotes/${quoteId}/client-action`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action })
    });
    if (res.ok) {
      loadQuotes();
    }
  } catch (err) {
    alert("Erreur lors de l'action.");
  }
}

async function submitNewVehicle(e) {
  e.preventDefault();
  const immatriculation = document.getElementById('vehImmat').value;
  const marque = document.getElementById('vehMarque').value;
  const modele = document.getElementById('vehModele').value;
  const annee = document.getElementById('vehAnnee').value;
  const kilometrage = document.getElementById('vehKm').value;

  try {
    const res = await fetch('/api/vehicles', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ immatriculation, marque, modele, annee, kilometrage })
    });
    if (res.ok) {
      closeModal('modalVehicle');
      loadVehicles();
    }
  } catch (err) {
    alert("Erreur lors de l'ajout du véhicule.");
  }
}

async function submitNewQuote(e) {
  e.preventDefault();
  const vehicle_id = document.getElementById('quoteVehicleSelect').value;
  const description_panne = document.getElementById('quoteDescription').value;
  const urgence = document.getElementById('quoteUrgence').value;
  const date_souhaitee = document.getElementById('quoteDate').value;

  // Récupérer toutes les prestations cochées
  const checkedBoxes = document.querySelectorAll('.service-checkbox:checked');
  const service_ids = Array.from(checkedBoxes).map(cb => parseInt(cb.value));

  if (service_ids.length === 0 && !description_panne.trim()) {
    alert("Veuillez cocher au moins une prestation ou décrire votre demande.");
    return;
  }

  try {
    const res = await fetch('/api/quotes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ vehicle_id, service_ids, description_panne, urgence, date_souhaitee })
    });
    const result = await res.json();
    if (res.ok) {
      // Réinitialiser le formulaire
      document.getElementById('quoteDescription').value = '';
      checkedBoxes.forEach(cb => {
        cb.checked = false;
        const parent = cb.closest('.service-check-item');
        if (parent) parent.classList.remove('selected');
      });
      recalculateQuoteTotal();

      closeModal('modalQuote');
      loadQuotes();
    } else {
      alert(result.error || "Erreur création devis.");
    }
  } catch (err) {
    alert("Erreur de connexion au serveur.");
  }
}

async function submitNewSav(e) {
  e.preventDefault();
  const titre = document.getElementById('savTitre').value;
  const description = document.getElementById('savDescription').value;
  const priorite = document.getElementById('savPriorite').value;

  try {
    const res = await fetch('/api/sav', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ titre, description, priorite })
    });
    if (res.ok) {
      closeModal('modalSav');
      loadSav();
    }
  } catch (err) {
    alert("Erreur création ticket SAV.");
  }
}

async function checkPendingQuote() {
  const pending = sessionStorage.getItem('pendingQuote');
  if (pending) {
    try {
      const data = JSON.parse(pending);
      sessionStorage.removeItem('pendingQuote');
      await fetch('/api/quotes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          service_id: data.serviceId,
          immatriculation: data.immatriculation,
          description_panne: `${data.serviceTitle ? data.serviceTitle + ' : ' : ''}${data.description}`
        })
      });
      loadQuotes();
    } catch (e) {
      console.error(e);
    }
  }
}

async function handleLogout() {
  await fetch('/api/auth/logout', { method: 'POST' });
  window.location.href = '/';
}

