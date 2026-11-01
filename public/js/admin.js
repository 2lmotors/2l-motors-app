import { createApp } from 'https://unpkg.com/vue@3/dist/vue.esm-browser.js';
import { i18nManager } from './i18n.js';

createApp({
  data() {
    return {
      appState: 'loading',
      currentLang: i18nManager.currentLang,
      currentUser: null,
      users: [],
      stats: null,
      toasts: [],
      locations: {},
      socket: null,

      // Menu Déroulant participant
      selectedUserId: null,

      // Menu Flottant statistiques & Boîte flottante des alertes
      showFloatingStats: false,
      showFloatingAlerts: false,
      alerts: []
    };
  },

  computed: {
    chosenUser() {
      if (!this.selectedUserId) return null;
      return this.users.find(u => u.id === this.selectedUserId) || null;
    }
  },

  async mounted() {
    try {
      const res = await fetch('/api/auth/me');
      const data = await res.json();
      if (!res.ok || !data.user) {
        window.location.href = '/login.html';
        return;
      }
      if (data.user.role !== 'admin') {
        window.location.href = '/index.html';
        return;
      }
      this.currentUser = data.user;
    } catch {
      window.location.href = '/login.html';
      return;
    }

    await i18nManager.init();
    this.currentLang = i18nManager.currentLang;
    this.appState = 'ready';
    await this.loadData();
    await this.loadLocations();
    await this.loadAlerts();

    // Sélectionner automatiquement le 1er membre si disponible
    if (this.users.length > 0) {
      const firstMember = this.users.find(u => u.id !== this.currentUser.id) || this.users[0];
      this.selectedUserId = firstMember.id;
    }

    if (typeof io !== 'undefined') {
      this.socket = io();
      this.socket.on('location update', (data) => {
        this.locations[data.userId] = {
          lat: data.lat,
          lng: data.lng,
          accuracy: data.accuracy,
          updated_at: data.updated_at
        };
      });
      this.socket.on('location remove', (data) => {
        delete this.locations[data.userId];
      });
      this.socket.on('admin offline alert', (data) => {
        this.alerts.unshift({
          id: data.id || Date.now(),
          from_username: data.fromUser,
          message: data.message,
          created_at: data.createdAt || new Date().toISOString()
        });
        this.showToast('warn', `🚨 Nouvelle alerte de ${data.fromUser}`, data.message);
      });
      this.socket.on('admin pending alerts', (data) => {
        if (!data || !data.alerts || !data.alerts.length) return;
        data.alerts.forEach(a => {
          this.showToast('warn', `🚨 Alerte en attente de ${a.from_username}`, a.message);
        });
        this.loadAlerts();
      });
    }
  },

  beforeUnmount() {
    if (this.socket) this.socket.disconnect();
  },

  methods: {
    t(key) {
      return i18nManager.t(key);
    },

    async switchLang(lang) {
      await i18nManager.setLanguage(lang);
      this.currentLang = lang;
    },

    async loadData() {
      await Promise.all([this.loadUsers(), this.loadStats()]);
    },

    async loadUsers() {
      try {
        const res = await fetch('/api/admin/users');
        const data = await res.json();
        if (res.ok) {
          this.users = data.users;
        } else {
          this.showToast('error', 'Erreur', data.error);
        }
      } catch {
        this.showToast('error', 'Erreur réseau');
      }
    },

    async loadStats() {
      try {
        const res = await fetch('/api/admin/stats');
        const data = await res.json();
        if (res.ok) {
          this.stats = data.stats;
        }
      } catch {}
    },

    async resetStats() {
      const confirmMsg = this.t('admin.resetConfirm') || 'Voulez-vous vraiment remettre à zéro toutes les statistiques et les messages ?';
      if (!confirm(confirmMsg)) return;

      try {
        const res = await fetch('/api/admin/stats/reset', { method: 'POST' });
        const data = await res.json();
        if (res.ok) {
          this.showToast('success', 'Statistiques remises à zéro', 'Tous les compteurs et messages sont réinitialisés.');
          await this.loadData();
        } else {
          this.showToast('error', 'Erreur', data.error || 'Erreur lors de la remise à zéro');
        }
      } catch (err) {
        this.showToast('error', 'Erreur réseau');
      }
    },

    async loadLocations() {
      try {
        const res = await fetch('/api/admin/locations');
        const data = await res.json();
        if (res.ok && data.locations) {
          this.locations = data.locations;
        }
      } catch {}
    },

    onSelectUser() {
      // User selection handled by computed chosenUser
    },

    getUserLocation(userId) {
      return this.locations[userId] || null;
    },

    async toggleRole(user) {
      const newRole = user.role === 'admin' ? 'user' : 'admin';
      const action = newRole === 'admin' ? 'promouvoir admin' : 'rétrograder en membre';
      if (!confirm(`Voulez-vous ${action} "${user.username}" ?`)) return;

      try {
        const res = await fetch(`/api/admin/users/${user.id}/role`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ role: newRole })
        });
        const data = await res.json();
        if (res.ok) {
          user.role = newRole;
          this.showToast('success', 'Rôle mis à jour', `${user.username} → ${newRole}`);
          await this.loadStats();
        } else {
          this.showToast('error', 'Erreur', data.error);
        }
      } catch {
        this.showToast('error', 'Erreur réseau');
      }
    },

    async toggleStatus(user) {
      const newStatus = !user.is_active;
      const action = newStatus ? 'activer' : 'désactiver';
      if (!confirm(`Voulez-vous ${action} le compte de "${user.username}" ?`)) return;

      try {
        const res = await fetch(`/api/admin/users/${user.id}/status`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ is_active: newStatus })
        });
        const data = await res.json();
        if (res.ok) {
          user.is_active = newStatus ? 1 : 0;
          this.showToast('success', 'Statut mis à jour', `${user.username} → ${newStatus ? 'Actif' : 'Inactif'}`);
        } else {
          this.showToast('error', 'Erreur', data.error);
        }
      } catch {
        this.showToast('error', 'Erreur réseau');
      }
    },

    async deleteUser(user) {
      if (!confirm(`⚠️ Supprimer définitivement "${user.username}" ?\n\nCette action est irréversible.`)) return;

      try {
        const res = await fetch(`/api/admin/users/${user.id}`, { method: 'DELETE' });
        const data = await res.json();
        if (res.ok) {
          this.users = this.users.filter(u => u.id !== user.id);
          this.showToast('success', 'Utilisateur supprimé', user.username);
          if (this.selectedUserId === user.id) this.selectedUserId = null;
          await this.loadStats();
        } else {
          this.showToast('error', 'Erreur', data.error);
        }
      } catch {
        this.showToast('error', 'Erreur réseau');
      }
    },

    async logout() {
      try {
        await fetch('/api/auth/logout', { method: 'POST' });
      } finally {
        window.location.href = '/login.html';
      }
    },

    showToast(type, title, text = '') {
      const icons = { success: '✅', error: '❌', info: 'ℹ️', warn: '⚠️' };
      const toast = { id: Date.now() + Math.random(), type, title, text, icon: icons[type] || '🔔', removing: false };
      this.toasts.push(toast);
      setTimeout(() => {
        toast.removing = true;
        setTimeout(() => {
          this.toasts = this.toasts.filter(t => t.id !== toast.id);
        }, 320);
      }, 3500);
    },

    getInitials(name) {
      if (!name) return '??';
      return name.slice(0, 2).toUpperCase();
    },

    formatDate(dateStr) {
      if (!dateStr) return '—';
      const d = new Date(dateStr);
      return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' }) + ' ' +
             d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    },

    async loadAlerts() {
      try {
        const res = await fetch('/api/admin/alerts');
        const data = await res.json();
        if (res.ok && data.alerts) {
          this.alerts = data.alerts;
        }
      } catch {}
    },

    async deleteSingleAlert(alertId) {
      if (!confirm('Supprimer ce message d\'alerte ?')) return;
      try {
        const res = await fetch(`/api/admin/alerts/${alertId}`, { method: 'DELETE' });
        const data = await res.json();
        if (res.ok) {
          this.alerts = this.alerts.filter(a => a.id !== alertId);
          this.showToast('success', 'Message effacé');
        } else {
          this.showToast('error', 'Erreur', data.error);
        }
      } catch {
        this.showToast('error', 'Erreur réseau');
      }
    },

    async clearAllAlerts() {
      if (!confirm('⚠️ Voulez-vous vraiment effacer TOUTES les alertes et messages reçus ?\n\nCette action est irréversible.')) return;
      try {
        const res = await fetch('/api/admin/alerts', { method: 'DELETE' });
        const data = await res.json();
        if (res.ok) {
          this.alerts = [];
          this.showToast('success', 'Alertes effacées', 'Tous les messages ont été supprimés.');
        } else {
          this.showToast('error', 'Erreur', data.error);
        }
      } catch {
        this.showToast('error', 'Erreur réseau');
      }
    },

    formatAlertDate(dateStr) {
      if (!dateStr) return '—';
      const d = new Date(dateStr);
      return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' }) + ' à ' +
             d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    }
  }
}).mount('#app');

