import { createApp } from 'https://unpkg.com/vue@3/dist/vue.esm-browser.js';
import { i18nManager } from './i18n.js';

createApp({
  data() {
    return {
      appState: 'loading',
      currentLang: i18nManager.currentLang,
      currentUser: null,
      messages: [],
      newMessage: '',
      onlineUsers: [],
      typingUsers: [],
      typingTimer: null,
      isTyping: false,
      socket: null,
      toasts: [],
      unreadCount: 0,
      isWindowFocused: true,
      autoScroll: true,
      notifPermission: 'default',
      sidebarOpen: false,
      pendingMedia: null,
      isUploading: false,
      lightboxUrl: null,
      showMedia: false,
      mediaFiles: [],
      userLocations: {},
      geoWatchId: null,

      activeRoom: 'general',
      activePrivateUser: null,
      roomMessagesCache: {},

      // Alerte Admin Hors-Ligne & Affichage Central 10s
      showOfflineAlertModal: false,
      offlineAlertMessage: '',
      centerAlert: null,
      centerAlertTimer: null,
      centerAlertQueue: [],
      handledAlertIds: new Set(),

      // Modal Téléchargements Applications & Zoom QR Code
      showDownloadsModal: false,
      showQrZoom: false,

      // Audio recording
      isRecordingVoice: false,
      mediaRecorder: null,
      audioChunks: [],
      recordingDuration: 0,
      recordingTimer: null,

      // Emoji picker
      showEmojiPicker: false,
      emojis: [
        '😀','😂','😍','😎','🤝','👍','👎','👏','🔥','🚗',
        '🚘','🏎️','🛠️','🔧','🛞','⛽','🚀','⚠️','✅','❌',
        '💯','✨','🎉','💪','💬','📞','📍','📸','🚨','🤖'
      ],

      // Live Video Call (WebRTC)
      callState: 'idle',
      incomingCallData: null,
      localStream: null,
      remoteStream: null,
      peerConnection: null,
      currentCameraFacing: 'user',
      isRecordingCall: false,
      callRecorder: null,
      callRecordedChunks: [],
      callRecordDuration: 0,
      callRecordTimer: null,

      // Gestion Salon Privé Multi-Membres (Admin uniquement, max 4)
      currentRoomMembers: [],
      showAddMemberModal: false,
      availableRoomUsers: [],
      selectedAddUserId: '',
      isLoadingAddMember: false,

      // Live Vidéo Multi-participants (WebRTC Mesh jusqu'à 4 simultanés & Contrôles Admin)
      remotePeers: {}, // peerId => { id, username, avatar_color, stream, peerConnection }
      remoteVideoEls: {}, // Stockage direct des éléments DOM vidéo distants pour Vue 3
      pendingCandidatesMap: {}, // File d'attente ICE par pair pour éviter les pertes sur mobile
      activeLiveRoomId: null,
      adminLiveStandby: false,
      standbyLiveRoomId: null,
      standbyParticipantsCount: 0,
      showInviteLiveModal: false,
      availableLiveUsers: [],
      selectedInviteLiveUserId: '',
      showAdminLiveDropdown: false,
      ringtoneInterval: null,
      ringtoneAudioCtx: null,

      // Inactivité de 15 minutes dans le chat & Compte à rebours de déconnexion (15 secondes)
      inactivityTimer: null,
      inactivityWarning: false,
      inactivityCountdown: 15,
      inactivityCountdownInterval: null,
      lastActivityTimestamp: Date.now(),
      inactivityTimeoutMs: 15 * 60 * 1000, // 15 minutes d'inactivité avant alerte

      // Options menu & Contrôles d'écoute des messages
      activeMessageMenuId: null,
      menuOpenUpwards: false,
      playingMsgId: null,
      playingAudioEl: null,
      activeAudioSpeed: 1,
      isHoldingVoice: false,
      holdingMsgId: null,
      speakingMsgId: null,
      mediaPermissionsGranted: false,
      isHttps: window.location.protocol === 'https:' || window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1',
      recordedMimeType: null,

      // Maintien actif smartphone & Screen Wake Lock
      wakeLockActive: false,
      wakeLockSentinel: null,
      wakeLockWanted: true,
      rtcConfig: {
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' },
          { urls: 'stun:stun2.l.google.com:19302' },
          { urls: 'stun:stun3.l.google.com:19302' },
          { urls: 'stun:stun4.l.google.com:19302' }
        ],
        iceCandidatePoolSize: 10
      }
    };
  },

  computed: {
    typingText() {
      if (this.typingUsers.length === 0) return '';
      if (this.typingUsers.length === 1) return `${this.typingUsers[0]} est en train d'écrire...`;
      if (this.typingUsers.length === 2) return `${this.typingUsers[0]} et ${this.typingUsers[1]} écrivent...`;
      return `Plusieurs personnes écrivent...`;
    },

    remotePeersList() {
      return Object.values(this.remotePeers);
    },

    totalLiveParticipants() {
      const count = this.remotePeersList.length;
      if (count > 0) {
        return Math.min(4, 1 + count);
      }
      return 2;
    },

    canStartLiveVideo() {
      if (this.activeRoom === 'general' || this.activeRoom.startsWith('ai_') || !this.currentUser) return false;
      if (this.activeRoom.startsWith('private_')) return true;
      return this.currentUser.role === 'admin' || (this.activePrivateUser && this.activePrivateUser.role === 'admin');
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
      this.currentUser = data.user;
    } catch {
      window.location.href = '/login.html';
      return;
    }

    await i18nManager.init();
    this.currentLang = i18nManager.currentLang;
    this.appState = 'ready';

    if ('Notification' in window) {
      Notification.requestPermission().then(p => { this.notifPermission = p; });
    }

    window.addEventListener('focus', () => {
      this.isWindowFocused = true;
      this.unreadCount = 0;
      document.title = 'MOTORS 2L - Chat';
    });
    window.addEventListener('blur', () => { this.isWindowFocused = false; });

    const checkMobile = () => {
      const btn = document.getElementById('sidebar-toggle');
      if (btn) btn.style.display = window.innerWidth <= 768 ? 'inline-flex' : 'none';
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);

    // Ferme le menu flottant d'options et le menu admin live lors d'un clic extérieur
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.msg-floating-menu') && !e.target.closest('.mockup3-msg-menu-btn')) {
        this.activeMessageMenuId = null;
      }
      if (!e.target.closest('.admin-live-dropdown-wrap')) {
        this.showAdminLiveDropdown = false;
      }
    });

    // Gestion du maintien actif et de la reprise de veille du smartphone
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        console.log('[Mobile] Sortie de veille / retour au premier plan');
        if (this.socket) {
          if (!this.socket.connected) {
            console.log('[Mobile] Reconnexion immédiate du socket...');
            this.socket.connect();
          } else if (this.activeRoom) {
            this.socket.emit('switch room', { roomId: this.activeRoom });
          }
        }
        if (this.wakeLockWanted) {
          this.requestWakeLock(false);
        }
      }
    });

    window.addEventListener('pageshow', () => {
      if (this.socket && !this.socket.connected) {
        this.socket.connect();
      }
      if (this.wakeLockWanted) {
        this.requestWakeLock(false);
      }
    });

    // Activer le maintien éveillé au premier geste de l'utilisateur
    const enableWakeLockOnGesture = () => {
      if (this.wakeLockWanted && !this.wakeLockActive) {
        this.requestWakeLock(false);
      }
    };
    window.addEventListener('touchstart', enableWakeLockOnGesture, { passive: true });
    window.addEventListener('click', enableWakeLockOnGesture, { passive: true });

    await this.$nextTick();
    this.connectSocket();
    if (this.currentUser && this.currentUser.role === 'admin') {
      this.checkPendingAdminAlerts();
    }
    this.startGeolocation();
    this.requestMediaPermissions();
    this.requestWakeLock(false);
    this.initInactivityDetector();
  },

  beforeUnmount() {
    this.stopRingtone();
    if (this.socket) this.socket.disconnect();
    this.stopGeolocation();
    this.endCall();
    this.releaseWakeLock(false);
  },

  methods: {
    // Screen Wake Lock & Maintien actif smartphone en veille
    async requestWakeLock(interactive = false) {
      if (!('wakeLock' in navigator)) {
        if (interactive) {
          this.showToast('info', 'Maintien actif', 'Votre navigateur gère la connexion en arrière-plan.');
        }
        return;
      }
      try {
        if (this.wakeLockSentinel) {
          try { await this.wakeLockSentinel.release(); } catch {}
          this.wakeLockSentinel = null;
        }
        this.wakeLockSentinel = await navigator.wakeLock.request('screen');
        this.wakeLockActive = true;
        this.wakeLockWanted = true;

        this.wakeLockSentinel.addEventListener('release', () => {
          this.wakeLockActive = false;
          if (this.wakeLockWanted && document.visibilityState === 'visible') {
            setTimeout(() => this.requestWakeLock(false), 1200);
          }
        });

        if (interactive) {
          this.showToast('success', '⚡ Maintien actif activé', 'Votre smartphone reste allumé et connecté.');
        }
      } catch (err) {
        console.warn('[WakeLock] Non activé:', err);
        this.wakeLockActive = false;
        if (interactive) {
          this.showToast('warn', 'Maintien actif', 'Activation limitée par le système ou le niveau de batterie.');
        }
      }
    },

    async releaseWakeLock(interactive = false) {
      this.wakeLockWanted = false;
      if (this.wakeLockSentinel) {
        try { await this.wakeLockSentinel.release(); } catch {}
        this.wakeLockSentinel = null;
      }
      this.wakeLockActive = false;
      if (interactive) {
        this.showToast('info', 'Maintien actif désactivé', 'Le smartphone peut se mettre en veille normalement.');
      }
    },

    async toggleWakeLock(interactive = true) {
      if (this.wakeLockActive) {
        await this.releaseWakeLock(interactive);
      } else {
        await this.requestWakeLock(interactive);
      }
    },

    // Demande explicite et totale d'autorisation Micro et Caméra
    async requestMediaPermissions(interactive = false) {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        if (window.location.protocol === 'http:' && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
          if (interactive) {
            this.switchToHttps();
          }
          return;
        }
        if (interactive) {
          this.showToast('error', 'Micro et Caméra non supportés ou bloqués par le protocole.');
        }
        return;
      }

      try {
        // Demande d'accès simultané Micro et Caméra
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true
          },
          video: {
            facingMode: 'user',
            width: { ideal: 1280 },
            height: { ideal: 720 }
          }
        });
        stream.getTracks().forEach(t => t.stop());
        this.mediaPermissionsGranted = true;
        if (interactive) this.showToast('success', '✅ Micro et Caméra autorisés avec succès !');
      } catch (err) {
        console.warn('[Media] Tentative audio seul...', err);
        try {
          const audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
          audioStream.getTracks().forEach(t => t.stop());
          this.mediaPermissionsGranted = true;
          if (interactive) this.showToast('success', '✅ Microphone autorisé avec succès !');
        } catch (audioErr) {
          console.warn('[Media] Autorisations refusées:', audioErr);
          if (interactive) {
            this.showToast('error', 'Accès micro/caméra refusé dans les paramètres du navigateur.');
          }
        }
      }
    },

    switchToHttps() {
      const port = 3443;
      const targetUrl = `https://${window.location.hostname}:${port}${window.location.pathname}`;
      window.location.href = targetUrl;
    },
    t(key) {
      return i18nManager.t(key);
    },

    async switchLang(lang) {
      await i18nManager.setLanguage(lang);
      this.currentLang = lang;
    },

    connectSocket() {
            this.socket = io({
        reconnection: true,
        reconnectionAttempts: Infinity,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        timeout: 20000,
        transports: ['websocket', 'polling']
      });

      this.socket.io.on('reconnect', () => {
        console.log('[Socket] Reconnecté avec succès');
        if (this.activeRoom) {
          this.socket.emit('switch room', { roomId: this.activeRoom });
        }
      });

      this.socket.on('connect', () => {
        console.log('[Socket] Connecté');
      });

      this.socket.on('device_conflict', (data) => {
        alert(data.error || 'Ce compte est déjà connecté sur un autre appareil.');
        window.location.href = '/login.html?error=already_connected';
      });

      this.socket.on('device_replaced', (data) => {
        alert(data.message || 'Votre session a été reprise sur un autre appareil.');
        window.location.href = '/login.html?reason=replaced';
      });

      this.socket.on('disconnect', () => {
        this.showToast('error', 'Connexion perdue', 'Reconnexion...');
      });

      this.socket.on('chat history', (payload) => {
        if (payload) {
          this.roomMessagesCache[payload.roomId] = payload.messages || [];
          if (payload.roomId === this.activeRoom) {
            this.messages = payload.messages || [];
            this.$nextTick(() => this.scrollToBottom(true));
          }
        }
      });

      this.socket.on('chat message', (msg) => {
        if (!this.roomMessagesCache[msg.room_id]) {
          this.roomMessagesCache[msg.room_id] = [];
        }
        if (!this.roomMessagesCache[msg.room_id].some(m => m.id === msg.id)) {
          this.roomMessagesCache[msg.room_id].push(msg);
        }

        if (msg.room_id === this.activeRoom) {
          if (!this.messages.some(m => m.id === msg.id)) {
            this.messages.push(msg);
          }
          this.$nextTick(() => {
            if (this.autoScroll) this.scrollToBottom();
          });
        }

        if (!this.currentUser || msg.user_id !== this.currentUser.id) {
          let previewText = msg.content || (msg.media_type === 'audio' ? '🎤 Message vocal' : '📎 Média');
          if (previewText.length > 50) previewText = previewText.slice(0, 50) + '...';

          if (!this.isWindowFocused || msg.room_id !== this.activeRoom) {
            this.unreadCount++;
            document.title = `(${this.unreadCount}) MOTORS 2L`;
            this.sendBrowserNotif(msg.username, previewText);
            this.playSound();
          }
          this.showToast('info', msg.username, previewText);
        }
      });

      this.socket.on('admin offline alert', (data) => {
        // Afficher l'alerte au centre du chat pendant 10s
        this.triggerCenterAlert(data.fromUser, data.message, { badge: 'Direct' });
        if (this.currentUser && this.currentUser.role === 'admin') {
          this.showToast('warn', `🚨 Alerte Urgente de ${data.fromUser}`, data.message);
        }
      });

      this.socket.on('admin pending alerts', (data) => {
        if (data && data.alerts && data.alerts.length > 0) {
          this.handlePendingAdminAlerts(data.alerts);
        }
      });

      this.socket.on('online users', (users) => {
        this.onlineUsers = users;
      });

      this.socket.on('user joined', (data) => {
        this.showToast('success', `${data.username} a rejoint`);
      });

      this.socket.on('user left', (data) => {
        this.showToast('info', `${data.username} est parti`);
      });

      this.socket.on('typing', (data) => {
        if (this.currentUser && data.username === this.currentUser.username) return;
        if (data.roomId !== this.activeRoom) return;
        if (!this.typingUsers.includes(data.username)) this.typingUsers.push(data.username);
        clearTimeout(this[`_typingTimer_${data.username}`]);
        this[`_typingTimer_${data.username}`] = setTimeout(() => {
          this.typingUsers = this.typingUsers.filter(u => u !== data.username);
        }, 3000);
      });

      this.socket.on('stop typing', (data) => {
        if (data.roomId === this.activeRoom) {
          this.typingUsers = this.typingUsers.filter(u => u !== data.username);
        }
      });

      this.socket.on('location update', (data) => {
        this.userLocations[data.userId] = {
          lat: data.lat,
          lng: data.lng,
          accuracy: data.accuracy,
          updated_at: data.updated_at
        };
      });

      this.socket.on('location remove', (data) => {
        delete this.userLocations[data.userId];
      });

      this.socket.on('incoming-call', (data) => {
        this.incomingCallData = data;
        this.callState = 'incoming';
        this.startRingtone(true); // Fait sonner et vibrer le smartphone en continu
        this.sendBrowserNotif('Appel Vidéo Entrant', `${data.callerName} vous appelle en direct`, {
          tag: 'video-call',
          renotify: true,
          requireInteraction: true,
          vibrate: [1000, 400, 1000, 400, 1000]
        });
      });

      this.socket.on('call-accepted', async (data) => {
        this.stopRingtone();
        if (this.peerConnection && data.signalData) {
          await this.peerConnection.setRemoteDescription(new RTCSessionDescription(data.signalData));
          this.callState = 'connected';
        }
      });

      this.socket.on('ice-candidate', async (data) => {
        if (this.peerConnection && data.candidate) {
          try {
            await this.peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
          } catch(e) {}
        }
      });

      this.socket.on('call-ended', () => {
        this.showToast('info', 'Appel terminé', 'Interlocuteur déconnecté.');
        this.cleanupCall();
      });

      // --- Événements WebRTC Live Vidéo (Multi-participants jusqu'à 4 & Contrôles Admin) ---
      this.socket.on('live-session-ready', async (data) => {
        this.stopRingtone();
        this.activeLiveRoomId = data.roomId;
        this.callState = 'connected';
        this.adminLiveStandby = false;

        // Établir les connexions Mesh avec les pairs existants
        if (data.existingPeers && data.existingPeers.length > 0) {
          for (const peer of data.existingPeers) {
            await this.createMeshPeerConnection(peer.id, peer.username, peer.avatar_color, true);
          }
        }
      });

      this.socket.on('user-joined-live', (data) => {
        this.showToast('info', 'Live Vidéo', `${data.user.username} a rejoint le live (${data.totalParticipants}/4).`);
        if (!this.remotePeers[data.user.id]) {
          this.remotePeers = {
            ...this.remotePeers,
            [data.user.id]: {
              id: data.user.id,
              username: data.user.username,
              avatar_color: data.user.avatar_color,
              stream: null,
              hasStream: false,
              peerConnection: null
            }
          };
        }
      });

      this.socket.on('peer-signal', async (data) => {
        if (data.isOffer) {
          const pc = await this.createMeshPeerConnection(data.fromUserId, data.fromUsername, data.fromAvatar, false);
          await pc.setRemoteDescription(new RTCSessionDescription(data.signalData));

          // Traiter les candidats ICE en attente
          const pending = this.pendingCandidatesMap[data.fromUserId] || [];
          for (const cand of pending) {
            try { await pc.addIceCandidate(new RTCIceCandidate(cand)); } catch(e) {}
          }
          this.pendingCandidatesMap[data.fromUserId] = [];

          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          this.socket.emit('peer-signal', {
            targetUserId: data.fromUserId,
            signalData: answer,
            isOffer: false
          });
        } else {
          const peer = this.remotePeers[data.fromUserId];
          if (peer && peer.peerConnection) {
            await peer.peerConnection.setRemoteDescription(new RTCSessionDescription(data.signalData));
            const pending = this.pendingCandidatesMap[data.fromUserId] || [];
            for (const cand of pending) {
              try { await peer.peerConnection.addIceCandidate(new RTCIceCandidate(cand)); } catch(e) {}
            }
            this.pendingCandidatesMap[data.fromUserId] = [];
          }
        }
      });

      this.socket.on('peer-ice-candidate', async (data) => {
        const fromId = data.fromUserId;
        const peer = this.remotePeers[fromId];
        if (peer && peer.peerConnection) {
          const pc = peer.peerConnection;
          if (pc.remoteDescription && pc.remoteDescription.type) {
            try {
              await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
            } catch(e) {}
            return;
          }
        }
        if (!this.pendingCandidatesMap[fromId]) {
          this.pendingCandidatesMap[fromId] = [];
        }
        this.pendingCandidatesMap[fromId].push(data.candidate);
      });

      this.socket.on('admin-left-live-temp', (data) => {
        this.showToast('warn', 'Live Vidéo', data.message || "L'administrateur s'est absenté temporairement. Le live continue.");
        // Retirer le flux admin sans couper le live des autres
        for (const peerId in this.remotePeers) {
          if (this.remotePeers[peerId].role === 'admin') {
            if (this.remotePeers[peerId].peerConnection) this.remotePeers[peerId].peerConnection.close();
            delete this.remotePeers[peerId];
            delete this.remoteVideoEls[peerId];
          }
        }
        this.remotePeers = { ...this.remotePeers };
      });

      this.socket.on('admin-live-standby', (data) => {
        this.adminLiveStandby = true;
        this.standbyLiveRoomId = data.roomId;
        this.standbyParticipantsCount = data.participantsCount;
        this.cleanupCallModalOnly();
        this.switchToGeneral();
        this.showToast('info', 'Live en attente', 'Vous vous êtes absenté du live. Les participants restent connectés.');
      });

      this.socket.on('admin-rejoined-live', (data) => {
        this.showToast('success', 'Live Vidéo', `${data.user.username} (Administrateur) a réintégré le direct.`);
      });

      this.socket.on('live-ended-by-admin', (data) => {
        this.showToast('info', 'Live terminé', data.message || "L'administrateur a mis fin au live vidéo.");
        this.adminLiveStandby = false;
        this.standbyLiveRoomId = null;
        this.cleanupCall();
      });

      this.socket.on('user-left-live', (data) => {
        this.showToast('info', 'Live Vidéo', `${data.username} a quitté le live.`);
        if (this.remotePeers[data.userId]) {
          if (this.remotePeers[data.userId].peerConnection) {
            this.remotePeers[data.userId].peerConnection.close();
          }
          delete this.remotePeers[data.userId];
          delete this.remoteVideoEls[data.userId];
          this.remotePeers = { ...this.remotePeers };
        }
        // Si c'était un appel et que l'autre ou tous les autres sont partis
        if (data.totalParticipants <= 1 && !this.adminLiveStandby) {
          this.showToast('info', 'Live terminé', 'Tous les participants ont quitté le direct.');
          this.cleanupCall();
        }
      });

      this.socket.on('call-error', (data) => {
        this.showToast('error', 'Erreur Appel', data.message);
      });

      this.socket.on('private-room-member-added', (data) => {
        if (data.roomId === this.activeRoom) {
          this.currentRoomMembers = data.members;
        }
        this.showToast('info', 'Salon privé', `${data.addedUser.username} a été ajouté au salon privé (${data.memberCount}/4).`);
      });

      this.socket.on('added-to-private-room', (data) => {
        this.showToast('success', 'Nouveau salon privé', `L'administrateur ${data.addedBy} vous a ajouté à un salon privé.`);
      });
    },

    switchToGeneral() {
      this.activeRoom = 'general';
      this.activePrivateUser = null;
      this.messages = this.roomMessagesCache['general'] || [];
      this.sidebarOpen = false; // Ferme le menu latéral sur mobile
      if (this.socket) this.socket.emit('switch room', { roomId: 'general' });
    },

    openAiChat() {
      if (!this.currentUser) return;
      const roomId = `ai_${this.currentUser.id}`;
      this.activeRoom = roomId;
      this.activePrivateUser = { id: 999999, username: 'Assistant IA', role: 'admin', isAi: true };
      this.messages = this.roomMessagesCache[roomId] || [];
      this.sidebarOpen = false; // Ferme le menu latéral sur mobile
      if (this.socket) {
        this.socket.emit('switch room', { roomId });
      }
      this.$nextTick(() => {
        if (this.$refs.chatInput) this.$refs.chatInput.focus();
      });
    },

    openPrivateChat(targetUser) {
      if (!this.currentUser || targetUser.id === this.currentUser.id) return;
      const isAdminInvolved = this.currentUser.role === 'admin' || targetUser.role === 'admin';
      if (!isAdminInvolved) {
        this.showToast('warn', 'Chat privé restreint', 'Les salons privés se font avec un administrateur.');
        return;
      }

      const minId = Math.min(this.currentUser.id, targetUser.id);
      const maxId = Math.max(this.currentUser.id, targetUser.id);
      const roomId = `private_${minId}_${maxId}`;

      this.activeRoom = roomId;
      this.activePrivateUser = targetUser;
      this.messages = this.roomMessagesCache[roomId] || [];
      this.sidebarOpen = false; // Ferme le menu latéral sur mobile
      if (this.socket) this.socket.emit('switch room', { roomId });
      this.loadPrivateRoomDetails(roomId);
    },

    sendMessage() {
      const content = this.newMessage.trim();
      if (!content && !this.pendingMedia || !this.socket) return;

      const payload = {
        content,
        roomId: this.activeRoom
      };

      if (this.pendingMedia) {
        payload.media_url = this.pendingMedia.url;
        payload.media_type = this.pendingMedia.type;
      }

      this.socket.emit('chat message', payload);
      this.newMessage = '';
      this.pendingMedia = null;
      this.showEmojiPicker = false;
      this.stopTyping();
      this.$nextTick(() => {
        if (this.$refs.chatInput) this.$refs.chatInput.focus();
        if (this.$refs.fileInput) this.$refs.fileInput.value = '';
      });
    },

    insertEmoji(emoji) {
      this.newMessage += emoji;
      this.showEmojiPicker = false;
      if (this.$refs.chatInput) this.$refs.chatInput.focus();
    },

    async sendAdminOfflineAlert() {
      if (!this.offlineAlertMessage.trim()) return;
      try {
        const res = await fetch('/api/alert-admin', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: this.offlineAlertMessage })
        });
        const data = await res.json();
        if (res.ok) {
          this.showToast('success', 'Alerte transmise', 'L\'administrateur recevra votre message en priorité.');
          const sentMsg = this.offlineAlertMessage;
          this.offlineAlertMessage = '';
          this.showOfflineAlertModal = false;
          // Affichage direct sur son propre écran également au milieu pendant 10s
          this.triggerCenterAlert(this.currentUser ? this.currentUser.username : 'Vous', sentMsg);
        } else {
          this.showToast('error', 'Erreur', data.error);
        }
      } catch {
        this.showToast('error', 'Erreur réseau');
      }
    },

    async checkPendingAdminAlerts() {
      if (!this.currentUser || this.currentUser.role !== 'admin') return;
      try {
        const res = await fetch('/api/admin/pending-alerts');
        const data = await res.json();
        if (res.ok && data.alerts && data.alerts.length > 0) {
          this.handlePendingAdminAlerts(data.alerts);
        }
      } catch(err) {
        console.error('[Admin] Erreur checkPendingAdminAlerts:', err);
      }
    },

    handlePendingAdminAlerts(alerts) {
      if (!alerts || !alerts.length) return;
      const unhandled = alerts.filter(a => !this.handledAlertIds.has(a.id));
      if (!unhandled.length) return;

      unhandled.forEach(a => this.handledAlertIds.add(a.id));

      // Notification sonore et vibration smartphone
      this.playSound();
      if (navigator.vibrate) {
        try { navigator.vibrate([300, 150, 300, 150, 500]); } catch(e) {}
      }

      // Notifications système
      unhandled.forEach(a => {
        this.sendBrowserNotif(`🚨 Alerte de ${a.from_username}`, a.message);
      });

      // Toast d'alerte
      if (unhandled.length === 1) {
        this.showToast('warn', `🚨 Alerte reçue de ${unhandled[0].from_username}`, unhandled[0].message);
      } else {
        this.showToast('warn', `🚨 ${unhandled.length} alertes reçues en attente`, 'Des utilisateurs vous ont envoyé des alertes.');
      }

      // Enfilement et affichage 10 secondes au milieu du chat
      unhandled.forEach((alert, idx) => {
        const timeStr = alert.created_at ? this.formatAlertShortTime(alert.created_at) : '';
        const badgeStr = unhandled.length > 1 ? `Alerte ${idx + 1}/${unhandled.length}` : 'Reçue en votre absence';
        this.queueCenterAlert({
          fromUser: alert.from_username,
          message: alert.message,
          badge: badgeStr,
          time: timeStr
        });
      });
    },

    queueCenterAlert(alertData) {
      if (!this.centerAlert) {
        this.triggerCenterAlert(alertData.fromUser, alertData.message, alertData);
      } else {
        if (!this.centerAlertQueue) this.centerAlertQueue = [];
        this.centerAlertQueue.push(alertData);
      }
    },

    formatAlertShortTime(dateStr) {
      if (!dateStr) return '';
      try {
        const d = new Date(dateStr.replace(' ', 'T'));
        if (isNaN(d.getTime())) return dateStr;
        return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      } catch {
        return dateStr;
      }
    },

    triggerCenterAlert(fromUser, message, meta = {}) {
      if (this.centerAlertTimer) {
        clearInterval(this.centerAlertTimer);
        this.centerAlertTimer = null;
      }
      this.centerAlert = {
        fromUser: fromUser || 'Utilisateur',
        message: message || '',
        badge: meta.badge || null,
        time: meta.time || null,
        countdown: 10
      };
      this.playSound();
      if (navigator.vibrate) {
        try { navigator.vibrate([250, 100, 250, 100, 400]); } catch(e) {}
      }
      this.centerAlertTimer = setInterval(() => {
        if (this.centerAlert && this.centerAlert.countdown > 1) {
          this.centerAlert.countdown--;
        } else {
          this.dismissCenterAlert();
        }
      }, 1000);
    },

    dismissCenterAlert() {
      if (this.centerAlertTimer) {
        clearInterval(this.centerAlertTimer);
        this.centerAlertTimer = null;
      }
      this.centerAlert = null;

      // Si d'autres alertes sont en file d'attente, afficher la suivante pendant 10s
      if (this.centerAlertQueue && this.centerAlertQueue.length > 0) {
        const next = this.centerAlertQueue.shift();
        setTimeout(() => {
          this.triggerCenterAlert(next.fromUser, next.message, next);
        }, 300);
      }
    },

    async toggleVoiceRecording() {
      if (this.isRecordingVoice) {
        this.stopVoiceRecording();
      } else {
        await this.startVoiceRecording();
      }
    },

    async startVoiceRecording() {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        if (window.location.protocol === 'http:' && window.location.hostname !== 'localhost') {
          this.switchToHttps();
          return;
        }
        this.showToast('error', 'Micro non disponible. Passez en HTTPS.');
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true
          }
        });
        this.audioChunks = [];

        // Support universel formats audio (iOS mp4/aac, Chrome/Firefox webm)
        let mimeType = 'audio/webm';
        if (window.MediaRecorder) {
          if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
            mimeType = 'audio/webm;codecs=opus';
          } else if (MediaRecorder.isTypeSupported('audio/mp4')) {
            mimeType = 'audio/mp4';
          } else if (MediaRecorder.isTypeSupported('audio/aac')) {
            mimeType = 'audio/aac';
          } else if (MediaRecorder.isTypeSupported('audio/ogg')) {
            mimeType = 'audio/ogg';
          }
        }
        this.recordedMimeType = mimeType;

        this.mediaRecorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
        this.mediaRecorder.ondataavailable = (e) => {
          if (e.data && e.data.size > 0) this.audioChunks.push(e.data);
        };
        this.mediaRecorder.onstop = async () => {
          stream.getTracks().forEach(t => t.stop());
          const blobType = this.recordedMimeType || 'audio/webm';
          const audioBlob = new Blob(this.audioChunks, { type: blobType });
          if (audioBlob.size > 0) await this.uploadAudioBlob(audioBlob);
        };
        this.mediaRecorder.start();
        this.isRecordingVoice = true;
        this.recordingDuration = 0;
        this.recordingTimer = setInterval(() => { this.recordingDuration++; }, 1000);
      } catch (err) {
        console.error('[Voice] Erreur:', err);
        this.showToast('error', 'Accès micro refusé. Autorisez le micro.');
      }
    },

    stopVoiceRecording() {
      if (this.mediaRecorder && this.isRecordingVoice) {
        this.mediaRecorder.stop();
        this.isRecordingVoice = false;
        clearInterval(this.recordingTimer);
      }
    },

    cancelVoiceRecording() {
      if (this.mediaRecorder && this.isRecordingVoice) {
        this.audioChunks = [];
        this.mediaRecorder.stop();
        this.isRecordingVoice = false;
        clearInterval(this.recordingTimer);
      }
    },

    async uploadAudioBlob(blob) {
      this.isUploading = true;
      const ext = blob.type.includes('mp4') || blob.type.includes('aac') ? 'm4a' : 'webm';
      const formData = new FormData();
      formData.append('file', blob, `vocal_${Date.now()}.${ext}`);
      try {
        const res = await fetch('/api/upload', { method: 'POST', body: formData });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        if (this.socket) {
          this.socket.emit('chat message', {
            content: '',
            media_url: data.url,
            media_type: 'audio',
            roomId: this.activeRoom
          });
        }
        this.showToast('success', 'Message vocal envoyé !');
      } catch (err) {
        this.showToast('error', 'Erreur envoi vocal', err.message);
      } finally {
        this.isUploading = false;
      }
    },

    // --- CONTRÔLES D'ÉCOUTE & MENU FLOTTANT DE LA DISCUSSION ---

    toggleMessageMenu(msg, event) {
      if (this.activeMessageMenuId === msg.id) {
        this.activeMessageMenuId = null;
        return;
      }
      this.activeMessageMenuId = msg.id;

      // Calcul dynamique pour que le menu s'ouvre toujours vers l'intérieur sans déborder
      if (event && event.currentTarget) {
        const rect = event.currentTarget.getBoundingClientRect();
        const spaceBelow = window.innerHeight - rect.bottom;
        this.menuOpenUpwards = spaceBelow < 220;
      }
    },

    playAudioMessage(msg, speed = 1) {
      const el = this.$refs['audio_' + msg.id];
      const audioEl = Array.isArray(el) ? el[0] : el;
      if (!audioEl) return;

      if (this.playingAudioEl && this.playingAudioEl !== audioEl) {
        this.playingAudioEl.pause();
      }

      const rate = speed || this.activeAudioSpeed || 1;
      audioEl.playbackRate = rate;
      this.activeAudioSpeed = rate;

      audioEl.play().then(() => {
        this.playingMsgId = msg.id;
        this.playingAudioEl = audioEl;
      }).catch(err => {
        console.warn('[Audio] Erreur lecture:', err);
      });
      this.activeMessageMenuId = null;
    },

    pauseAudioMessage(msg) {
      const el = this.$refs['audio_' + msg.id];
      const audioEl = Array.isArray(el) ? el[0] : el;
      if (audioEl) {
        audioEl.pause();
      }
      if (this.playingMsgId === msg.id) {
        this.playingMsgId = null;
      }
      this.activeMessageMenuId = null;
    },

    setAudioSpeed(msg, speed) {
      const el = this.$refs['audio_' + msg.id];
      const audioEl = Array.isArray(el) ? el[0] : el;
      this.activeAudioSpeed = speed;
      if (audioEl) {
        audioEl.playbackRate = speed;
        if (audioEl.paused) {
          audioEl.play().catch(() => {});
          this.playingMsgId = msg.id;
          this.playingAudioEl = audioEl;
        }
      }
      this.activeMessageMenuId = null;
    },

    // Écoute rapide X2 en maintenant appuyé sur le message vocal
    onVoiceHoldStart(msg, event) {
      const el = this.$refs['audio_' + msg.id];
      const audioEl = Array.isArray(el) ? el[0] : el;
      if (!audioEl) return;

      this.isHoldingVoice = true;
      this.holdingMsgId = msg.id;
      audioEl.playbackRate = 2.0;

      if (audioEl.paused) {
        audioEl.play().catch(() => {});
        this.playingMsgId = msg.id;
        this.playingAudioEl = audioEl;
      }
    },

    // Relâchement : retour à vitesse normale
    onVoiceHoldEnd(msg, event) {
      if (!this.isHoldingVoice) return;
      this.isHoldingVoice = false;
      this.holdingMsgId = null;

      const el = this.$refs['audio_' + msg.id];
      const audioEl = Array.isArray(el) ? el[0] : el;
      if (audioEl) {
        audioEl.playbackRate = 1.0;
        this.activeAudioSpeed = 1.0;
      }
    },

    onAudioEnded(msg) {
      if (this.playingMsgId === msg.id) {
        this.playingMsgId = null;
      }
      this.isHoldingVoice = false;
      this.holdingMsgId = null;
      this.activeAudioSpeed = 1.0;
    },

    onAudioPause(msg) {
      if (this.playingMsgId === msg.id && !this.isHoldingVoice) {
        this.playingMsgId = null;
      }
    },

    readTextMessage(msg) {
      if (!('speechSynthesis' in window)) {
        this.showToast('error', 'Synthèse vocale non supportée');
        return;
      }
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(msg.content);
      utterance.lang = this.currentLang === 'en' ? 'en-US' : 'fr-FR';
      utterance.rate = 1.0;
      this.speakingMsgId = msg.id;
      utterance.onend = () => { this.speakingMsgId = null; };
      utterance.onerror = () => { this.speakingMsgId = null; };
      window.speechSynthesis.speak(utterance);
      this.activeMessageMenuId = null;
    },

    pauseTextMessage(msg) {
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
      this.speakingMsgId = null;
      this.activeMessageMenuId = null;
    },

    downloadMediaMessage(msg) {
      if (!msg || !msg.media_url) return;
      this.activeMessageMenuId = null;

      try {
        const link = document.createElement('a');
        link.href = msg.media_url;
        const ext = msg.media_type === 'audio' ? '.webm' : (msg.media_type === 'video' ? '.mp4' : '.jpg');
        const filename = msg.media_url.split('/').pop() || `motors2l-${Date.now()}${ext}`;
        link.download = filename;
        link.setAttribute('download', filename);
        link.setAttribute('target', '_blank');
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        this.showToast('success', 'Téléchargement', 'Fichier téléchargé avec succès.');
      } catch (err) {
        console.error('Erreur téléchargement média:', err);
        window.open(msg.media_url, '_blank');
      }
    },

    async deleteMessageFromMyHistory(msg) {
      if (!msg || !msg.id) return;
      this.activeMessageMenuId = null;

      // Arrêt immédiat de la lecture audio / vocale si en cours
      if (this.playingMsgId === msg.id) {
        this.pauseAudioMessage(msg);
      }
      if (this.speakingMsgId === msg.id) {
        this.pauseTextMessage(msg);
      }

      // 1. Suppression visuelle instantanée pour cet utilisateur
      this.messages = this.messages.filter(m => m.id !== msg.id);
      if (this.roomMessagesCache[this.activeRoom]) {
        this.roomMessagesCache[this.activeRoom] = this.roomMessagesCache[this.activeRoom].filter(m => m.id !== msg.id);
      }

      // 2. Sauvegarde côté serveur pour exclure ce message lors des prochaines reconnexions
      try {
        const res = await fetch(`/api/messages/${msg.id}/hide-for-me`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' }
        });
        const data = await res.json();
        if (res.ok) {
          this.showToast('info', 'Message effacé', 'Ce message a été retiré de votre historique.');
        }
      } catch(err) {
        console.warn('Erreur masquage message:', err);
      }
    },

    async clearMyRoomHistory(roomId) {
      this.activeMessageMenuId = null;
      const targetRoom = roomId || this.activeRoom || 'general';
      const roomLabel = targetRoom === 'general' ? 'le canal Général (Chat ALL)' : 'cette discussion';

      const ok = confirm(`Voulez-vous vraiment vider tout votre historique pour ${roomLabel} ?\n\n(Les messages précédents seront effacés pour vous uniquement, sans impacter les autres participants)`);
      if (!ok) return;

      // Arrêt de toute lecture en cours
      if (this.playingAudioEl) {
        this.playingAudioEl.pause();
        this.playingMsgId = null;
      }
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
        this.speakingMsgId = null;
      }

      // 1. Vidage visuel instantané pour cet utilisateur
      this.messages = [];
      this.roomMessagesCache[targetRoom] = [];

      // 2. Sauvegarde côté serveur
      try {
        const res = await fetch('/api/messages/clear-my-history', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ roomId: targetRoom })
        });
        const data = await res.json();
        if (res.ok) {
          this.showToast('success', 'Historique vidé', 'Votre historique personnel a été entièrement effacé.');
        } else {
          this.showToast('error', 'Erreur', data.error || 'Impossible de vider l\'historique.');
        }
      } catch(err) {
        console.warn('Erreur vidage historique:', err);
        this.showToast('error', 'Erreur réseau');
      }
    },

    // --- Salons Privés & Ajout de membres (Admin uniquement, max 4) ---
    async loadPrivateRoomDetails(roomId) {
      if (!roomId || !roomId.startsWith('private_')) return;
      try {
        const res = await fetch(`/api/private-rooms/details/${encodeURIComponent(roomId)}`);
        const data = await res.json();
        if (res.ok && data.members) {
          this.currentRoomMembers = data.members;
        }
      } catch(e) {
        console.warn('Erreur chargement détails salon privé:', e);
      }
    },

    openDownloadsModal() {
      this.sidebarOpen = false;
      this.showDownloadsModal = true;
    },

    async openAddMemberModal() {
      if (!this.currentUser || this.currentUser.role !== 'admin') return;
      if (this.currentRoomMembers.length >= 4) {
        this.showToast('warn', 'Limite atteinte', 'Ce salon privé compte déjà 4 membres maximum.');
        return;
      }
      try {
        const res = await fetch(`/api/private-rooms/available-users/${encodeURIComponent(this.activeRoom)}`);
        const data = await res.json();
        if (res.ok && data.availableUsers) {
          this.availableRoomUsers = data.availableUsers;
          this.selectedAddUserId = '';
          this.showAddMemberModal = true;
        } else {
          this.showToast('error', 'Erreur', data.error || 'Impossible de récupérer la liste des membres.');
        }
      } catch(e) {
        this.showToast('error', 'Erreur', 'Erreur réseau');
      }
    },

    async confirmAddMember() {
      if (!this.selectedAddUserId || !this.activeRoom) return;
      this.isLoadingAddMember = true;
      try {
        const res = await fetch('/api/private-rooms/add-member', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ roomId: this.activeRoom, userId: Number(this.selectedAddUserId) })
        });
        const data = await res.json();
        if (res.ok && data.success) {
          this.showToast('success', 'Membre ajouté', data.message);
          this.showAddMemberModal = false;
          await this.loadPrivateRoomDetails(this.activeRoom);
        } else {
          this.showToast('error', 'Erreur', data.error || "Impossible d'ajouter ce membre.");
        }
      } catch(e) {
        this.showToast('error', 'Erreur', 'Erreur réseau');
      } finally {
        this.isLoadingAddMember = false;
      }
    },

    // Acquisition sécurisée et résiliente caméra/micro avec fallbacks smartphones
    async getMediaStreamSafe(facing = 'user') {
      try {
        return await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: facing },
            width: { ideal: 1280, max: 1920 },
            height: { ideal: 720, max: 1080 }
          },
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true
          }
        });
      } catch (err1) {
        console.warn('[Media] Fallback souple...', err1);
        try {
          return await navigator.mediaDevices.getUserMedia({
            video: { facingMode: facing },
            audio: true
          });
        } catch (err2) {
          console.warn('[Media] Fallback basique...', err2);
          return await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: true
          });
        }
      }
    },

    // --- WebRTC Live Vidéo (Multi-participants jusqu'à 4 & Contrôles Admin) ---
    async startVideoCall() {
      if (!this.canStartLiveVideo) return;
      const roomId = this.activeRoom;
      this.activeLiveRoomId = roomId;
      this.callState = 'calling';

      // Faire sonner et vibrer l'appel en cours (tonalité d'acheminement)
      this.startRingtone(false);

      // Si salon privé ou utilisateur sélectionné, préparer l'affichage en avance sur l'écran
      if (this.activePrivateUser) {
        this.remotePeers = {
          ...this.remotePeers,
          [this.activePrivateUser.id]: {
            id: this.activePrivateUser.id,
            username: this.activePrivateUser.username,
            avatar_color: this.activePrivateUser.avatar_color || '#3b82f6',
            stream: null,
            hasStream: false,
            peerConnection: null
          }
        };
      }

      try {
        this.localStream = await this.getMediaStreamSafe(this.currentCameraFacing || 'user');

        this.$nextTick(() => {
          if (this.$refs.localVideo) {
            this.$refs.localVideo.srcObject = this.localStream;
            this.$refs.localVideo.muted = true;
            this.$refs.localVideo.playsInline = true;
            this.$refs.localVideo.setAttribute('playsinline', '');
            this.$refs.localVideo.setAttribute('webkit-playsinline', '');
            this.$refs.localVideo.play().catch(() => {});
          }
        });

        // Joindre la session live sur le serveur (enforce <= 4)
        if (this.socket) {
          this.socket.emit('start-live-call', { roomId });
          // Si on est dans un chat privé, faire sonner l'autre interlocuteur
          if (this.activePrivateUser) {
            this.socket.emit('call-user', {
              roomId,
              targetUserId: this.activePrivateUser.id,
              callerName: this.currentUser.username,
              callerAvatar: this.currentUser.avatar_color
            });
          }
        }
      } catch(err) {
        console.error('Erreur démarrage live:', err);
        this.showToast('error', 'Erreur caméra/micro', 'Veuillez vérifier les autorisations dans les réglages du smartphone.');
        this.cleanupCall();
      }
    },

    async acceptIncomingCall() {
      this.stopRingtone();
      if (!this.incomingCallData) return;
      const roomId = this.incomingCallData.roomId || this.activeRoom;
      this.activeLiveRoomId = roomId;
      this.callState = 'connected';

      if (this.incomingCallData.callerId) {
        const cid = this.incomingCallData.callerId;
        this.remotePeers = {
          ...this.remotePeers,
          [cid]: {
            id: cid,
            username: this.incomingCallData.callerName || `Membre #${cid}`,
            avatar_color: this.incomingCallData.callerAvatar || '#3b82f6',
            stream: null,
            hasStream: false,
            peerConnection: null
          }
        };
      }

      try {
        this.localStream = await this.getMediaStreamSafe(this.currentCameraFacing || 'user');

        this.$nextTick(() => {
          if (this.$refs.localVideo) {
            this.$refs.localVideo.srcObject = this.localStream;
            this.$refs.localVideo.muted = true;
            this.$refs.localVideo.playsInline = true;
            this.$refs.localVideo.setAttribute('playsinline', '');
            this.$refs.localVideo.setAttribute('webkit-playsinline', '');
            this.$refs.localVideo.play().catch(() => {});
          }
        });

        if (this.socket) {
          this.socket.emit('start-live-call', { roomId });
        }
      } catch(err) {
        console.error('Erreur acceptation appel live:', err);
        this.showToast('error', 'Erreur caméra/micro');
        this.leaveLiveCall();
      }
    },

    declineIncomingCall() {
      this.stopRingtone();
      if (this.incomingCallData && this.socket) {
        this.socket.emit('leave-live-call', { roomId: this.incomingCallData.roomId });
      }
      this.cleanupCall();
    },

    bindRemoteVideo(el, peer) {
      if (!el || !peer) return;
      this.remoteVideoEls[peer.id] = el;
      if (peer.stream && el.srcObject !== peer.stream) {
        el.srcObject = peer.stream;
        el.muted = false;
        el.playsInline = true;
        el.setAttribute('playsinline', '');
        el.setAttribute('webkit-playsinline', '');
        const p = el.play();
        if (p && typeof p.catch === 'function') {
          p.catch(e => console.warn('[Video] Play note:', e));
        }
      }
    },

    attachStreamToPeerVideo(peerId, stream) {
      if (!stream) return;
      const el = this.remoteVideoEls[peerId];
      if (el) {
        if (el.srcObject !== stream) {
          el.srcObject = stream;
        }
        el.muted = false;
        el.playsInline = true;
        el.setAttribute('playsinline', '');
        el.setAttribute('webkit-playsinline', '');
        const p = el.play();
        if (p && typeof p.catch === 'function') {
          p.catch(() => {});
        }
      }

      const refEl = this.$refs['remoteVideo_' + peerId];
      const domEl = Array.isArray(refEl) ? refEl[0] : refEl;
      if (domEl && domEl.srcObject !== stream) {
        domEl.srcObject = stream;
        domEl.muted = false;
        domEl.playsInline = true;
        domEl.play().catch(() => {});
      }

      if (this.$refs.remoteVideo && this.$refs.remoteVideo.srcObject !== stream) {
        this.$refs.remoteVideo.srcObject = stream;
        this.$refs.remoteVideo.muted = false;
        this.$refs.remoteVideo.playsInline = true;
        this.$refs.remoteVideo.play().catch(() => {});
      }
    },

    async createMeshPeerConnection(peerId, peerUsername, peerAvatar, isInitiator) {
      if (this.remotePeers[peerId] && this.remotePeers[peerId].peerConnection) {
        return this.remotePeers[peerId].peerConnection;
      }

      const pc = new RTCPeerConnection(this.rtcConfig);

      if (this.localStream) {
        this.localStream.getTracks().forEach(track => {
          pc.addTrack(track, this.localStream);
        });
      }

      const existingPeer = this.remotePeers[peerId];
      this.remotePeers = {
        ...this.remotePeers,
        [peerId]: {
          id: peerId,
          username: peerUsername || (existingPeer ? existingPeer.username : `Membre #${peerId}`),
          avatar_color: peerAvatar || (existingPeer ? existingPeer.avatar_color : '#3b82f6'),
          stream: existingPeer ? existingPeer.stream : null,
          hasStream: existingPeer ? existingPeer.hasStream : false,
          peerConnection: pc
        }
      };

      pc.ontrack = (event) => {
        const stream = event.streams[0];
        console.log('[WebRTC] Flux distant reçu pour le pair:', peerId, stream);
        if (this.remotePeers[peerId]) {
          this.remotePeers[peerId].stream = stream;
          this.remotePeers[peerId].hasStream = true;
        }
        this.remoteStream = stream;
        this.remotePeers = { ...this.remotePeers };

        this.$nextTick(() => {
          this.attachStreamToPeerVideo(peerId, stream);
        });
      };

      pc.onicecandidate = (event) => {
        if (event.candidate && this.socket) {
          this.socket.emit('peer-ice-candidate', {
            targetUserId: peerId,
            candidate: event.candidate
          });
        }
      };

      if (isInitiator) {
        try {
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          if (this.socket) {
            this.socket.emit('peer-signal', {
              targetUserId: peerId,
              signalData: offer,
              isOffer: true
            });
          }
        } catch(e) {
          console.error('Erreur createOffer peer', peerId, e);
        }
      }

      return pc;
    },

    openInviteLiveModal() {
      if (!this.currentUser || this.currentUser.role !== 'admin') return;
      if (this.totalLiveParticipants >= 4) {
        this.showToast('warn', 'Limite atteinte', 'Le live vidéo a atteint le maximum de 4 participants simultanés.');
        return;
      }
      const connectedPeersIds = new Set([this.currentUser.id, ...Object.keys(this.remotePeers).map(Number)]);
      this.availableLiveUsers = this.onlineUsers.filter(u => !connectedPeersIds.has(u.id));
      this.selectedInviteLiveUserId = '';
      this.showInviteLiveModal = true;
    },

    confirmInviteMemberToLive() {
      if (!this.selectedInviteLiveUserId) return;
      const targetUserId = Number(this.selectedInviteLiveUserId);
      const roomId = this.activeLiveRoomId || this.activeRoom;
      if (this.socket) {
        this.socket.emit('invite-member-to-live', {
          roomId,
          targetUserId
        });
        this.showToast('info', 'Invitation envoyée', 'En attente de connexion du participant...');
      }
      this.showInviteLiveModal = false;
    },

    adminLeaveLiveTemp() {
      if (!this.currentUser || this.currentUser.role !== 'admin') return;
      const roomId = this.activeLiveRoomId || this.activeRoom;
      if (this.socket) {
        this.socket.emit('admin-leave-live-temp', { roomId });
      }
      this.adminLiveStandby = true;
      this.standbyLiveRoomId = roomId;
      this.cleanupCallModalOnly();
      this.switchToGeneral();
      this.showToast('info', 'Live en attente', 'Vous vous êtes absenté temporairement. Le live continue pour les participants.');
    },

    async adminRejoinLive() {
      if (!this.currentUser || this.currentUser.role !== 'admin' || !this.standbyLiveRoomId) return;
      const roomId = this.standbyLiveRoomId;
      this.activeLiveRoomId = roomId;
      this.callState = 'calling';

      try {
        this.localStream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: 1280 },
            height: { ideal: 720 },
            facingMode: 'user'
          },
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true
          }
        });

        this.$nextTick(() => {
          if (this.$refs.localVideo) {
            this.$refs.localVideo.srcObject = this.localStream;
            this.$refs.localVideo.play().catch(() => {});
          }
        });

        if (this.socket) {
          this.socket.emit('admin-rejoin-live', { roomId });
        }
        this.adminLiveStandby = false;
      } catch(err) {
        this.showToast('error', 'Erreur caméra/micro');
        this.callState = 'idle';
      }
    },

    endLiveForAll() {
      const roomId = this.activeLiveRoomId || this.standbyLiveRoomId || this.activeRoom;
      if (this.socket) {
        this.socket.emit('end-live-for-all', { roomId });
      }
      this.adminLiveStandby = false;
      this.standbyLiveRoomId = null;
      this.cleanupCall();
      this.showToast('info', 'Live terminé', 'Vous avez mis fin au live vidéo pour tout le monde.');
    },

    leaveLiveCall() {
      const roomId = this.activeLiveRoomId || this.activeRoom;
      if (this.socket) {
        this.socket.emit('leave-live-call', { roomId });
      }
      this.cleanupCall();
    },

    endCall() {
      if (this.currentUser && this.currentUser.role === 'admin') {
        this.endLiveForAll();
      } else {
        this.leaveLiveCall();
      }
    },

    cleanupCallModalOnly() {
      this.stopRingtone();
      if (this.isRecordingCall) {
        this.stopCallRecording();
      }
      if (this.localStream) {
        this.localStream.getTracks().forEach(t => t.stop());
        this.localStream = null;
      }
      for (const peerId in this.remotePeers) {
        if (this.remotePeers[peerId].peerConnection) {
          try { this.remotePeers[peerId].peerConnection.close(); } catch(e) {}
        }
      }
      this.remotePeers = {};
      this.remoteVideoEls = {};
      if (this.peerConnection) {
        try { this.peerConnection.close(); } catch(e) {}
        this.peerConnection = null;
      }
      this.callState = 'idle';
      this.incomingCallData = null;
    },

    cleanupCall() {
      this.cleanupCallModalOnly();
      this.activeLiveRoomId = null;
      this.currentCameraFacing = 'user';
      this.remoteVideoEls = {};
      this.pendingCandidatesMap = {};
      // RETOUR DIRECT DANS LE CHAT ALL (CANAL GÉNÉRAL)
      this.switchToGeneral();
    },

    // Bascule Caméra Avant / Arrière pendant le live vidéo (iPhone iOS Safari & Android)
    async switchCamera() {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        this.showToast('error', 'Caméra non supportée');
        return;
      }

      const nextFacing = this.currentCameraFacing === 'user' ? 'environment' : 'user';

      // 1. Libérer immédiatement le capteur matériel de la caméra précédente
      // (Indispensable sur iPhone / Android pour pouvoir ouvrir l'autre caméra)
      let oldVideoTrack = null;
      if (this.localStream) {
        oldVideoTrack = this.localStream.getVideoTracks()[0];
        if (oldVideoTrack) {
          oldVideoTrack.stop();
          this.localStream.removeTrack(oldVideoTrack);
        }
      }

      let newStream = null;

      // Stratégie A : facingMode exact ou ideal
      try {
        newStream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: nextFacing },
            width: { ideal: 1280 },
            height: { ideal: 720 }
          }
        });
      } catch (errA) {
        console.warn('[Camera] Stratégie A échouée, essai stratégie B (exact)...', errA);
        try {
          newStream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: { exact: nextFacing } }
          });
        } catch (errB) {
          console.warn('[Camera] Stratégie B échouée, essai énumération des capteurs...', errB);
          try {
            // Stratégie C : Sélection explicite par ID de capteur
            const devices = await navigator.mediaDevices.enumerateDevices();
            const videoDevices = devices.filter(d => d.kind === 'videoinput');
            if (videoDevices.length > 1) {
              const currentDeviceId = oldVideoTrack && oldVideoTrack.getSettings ? oldVideoTrack.getSettings().deviceId : null;
              // Choisir un autre périphérique vidéo
              const otherDevice = videoDevices.find(d => d.deviceId && d.deviceId !== currentDeviceId) || videoDevices[1];
              if (otherDevice) {
                newStream = await navigator.mediaDevices.getUserMedia({
                  video: { deviceId: { exact: otherDevice.deviceId } }
                });
              }
            }
          } catch (errC) {
            console.warn('[Camera] Stratégie C échouée:', errC);
          }
        }
      }

      // Si échec de bascule, restaurer la caméra précédente
      if (!newStream || newStream.getVideoTracks().length === 0) {
        console.warn('[Camera] Restauration caméra précédente...');
        try {
          newStream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: this.currentCameraFacing }
          });
        } catch (errRestore) {
          this.showToast('error', 'Erreur caméra', 'Impossible de réactiver la caméra.');
          return;
        }
      }

      const newVideoTrack = newStream.getVideoTracks()[0];
      if (!newVideoTrack) return;

      // Rattacher la nouvelle piste au flux local
      if (!this.localStream) {
        this.localStream = new MediaStream();
      }
      this.localStream.addTrack(newVideoTrack);

      // Mettre à jour la vidéo WebRTC chez l'interlocuteur en direct sans couper l'appel
      if (this.peerConnection) {
        const senders = this.peerConnection.getSenders();
        const videoSender = senders.find(s => s.track && s.track.kind === 'video');
        if (videoSender) {
          await videoSender.replaceTrack(newVideoTrack);
        } else {
          this.peerConnection.addTrack(newVideoTrack, this.localStream);
        }
      }
      for (const peerId in this.remotePeers) {
        const p = this.remotePeers[peerId];
        if (p && p.peerConnection) {
          const senders = p.peerConnection.getSenders();
          const videoSender = senders.find(s => s.track && s.track.kind === 'video');
          if (videoSender) {
            await videoSender.replaceTrack(newVideoTrack);
          } else {
            p.peerConnection.addTrack(newVideoTrack, this.localStream);
          }
        }
      }

      // Mettre à jour la vidéo locale à l'écran
      this.$nextTick(() => {
        if (this.$refs.localVideo) {
          this.$refs.localVideo.srcObject = this.localStream;
          this.$refs.localVideo.play().catch(() => {});
        }
      });

      this.currentCameraFacing = nextFacing;
      const label = nextFacing === 'environment' ? '📷 Caméra arrière (Extérieure)' : '🤳 Caméra avant (Selfie)';
      this.showToast('success', 'Caméra changée', label);
    },

    // Contrôles Enregistrement Live Vidéo (Administrateur)
    toggleCallRecording() {
      if (this.isRecordingCall) {
        this.stopCallRecording();
      } else {
        this.startCallRecording();
      }
    },

    startCallRecording() {
      if (this.isRecordingCall) return;

      let streamToRecord = null;

      try {
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const dest = audioCtx.createMediaStreamDestination();

        // Mixage audio : Micro local + Voix interlocuteur
        if (this.localStream && this.localStream.getAudioTracks().length > 0) {
          try {
            const localSource = audioCtx.createMediaStreamSource(this.localStream);
            localSource.connect(dest);
          } catch(e) {}
        }
        if (this.remoteStream && this.remoteStream.getAudioTracks().length > 0) {
          try {
            const remoteSource = audioCtx.createMediaStreamSource(this.remoteStream);
            remoteSource.connect(dest);
          } catch(e) {}
        }
        for (const peerId in this.remotePeers) {
          const p = this.remotePeers[peerId];
          if (p && p.stream && p.stream.getAudioTracks().length > 0) {
            try {
              const remoteSource = audioCtx.createMediaStreamSource(p.stream);
              remoteSource.connect(dest);
            } catch(e) {}
          }
        }

        streamToRecord = new MediaStream();
        // Vidéo principale (priorité à la vidéo de l'interlocuteur distant, sinon locale)
        const videoTrack = (this.remoteStream && this.remoteStream.getVideoTracks()[0]) || (this.localStream && this.localStream.getVideoTracks()[0]);
        if (videoTrack) streamToRecord.addTrack(videoTrack);

        // Ajouter les pistes audio mixées
        dest.stream.getAudioTracks().forEach(t => streamToRecord.addTrack(t));
      } catch (e) {
        console.warn('[Record] Fallback stream:', e);
        streamToRecord = this.remoteStream || this.localStream;
      }

      if (!streamToRecord || streamToRecord.getTracks().length === 0) {
        this.showToast('error', 'Enregistrement impossible', 'Aucun flux vidéo disponible.');
        return;
      }

      // Sélection du format vidéo supporté
      let mimeType = 'video/webm;codecs=vp8,opus';
      if (window.MediaRecorder) {
        if (MediaRecorder.isTypeSupported('video/webm;codecs=vp8,opus')) {
          mimeType = 'video/webm;codecs=vp8,opus';
        } else if (MediaRecorder.isTypeSupported('video/mp4')) {
          mimeType = 'video/mp4';
        } else if (MediaRecorder.isTypeSupported('video/webm')) {
          mimeType = 'video/webm';
        }
      }

      try {
        this.callRecordedChunks = [];
        this.callRecorder = new MediaRecorder(streamToRecord, mimeType ? { mimeType } : undefined);
        this.callRecorder.ondataavailable = (event) => {
          if (event.data && event.data.size > 0) {
            this.callRecordedChunks.push(event.data);
          }
        };

        this.callRecorder.onstop = async () => {
          const blobType = mimeType || 'video/webm';
          const recordedBlob = new Blob(this.callRecordedChunks, { type: blobType });
          if (recordedBlob.size > 0) {
            await this.saveCallRecording(recordedBlob);
          }
        };

        this.callRecorder.start(1000);
        this.isRecordingCall = true;
        this.callRecordDuration = 0;
        this.callRecordTimer = setInterval(() => { this.callRecordDuration++; }, 1000);
        this.showToast('warn', '🔴 Enregistrement démarré', 'Le live vidéo est en cours d\'enregistrement.');
      } catch (err) {
        console.error('[Record] Erreur initialisation enregistreur:', err);
        this.showToast('error', 'Erreur enregistrement', err.message);
      }
    },

    stopCallRecording() {
      if (this.callRecorder && this.isRecordingCall) {
        this.callRecorder.stop();
        this.isRecordingCall = false;
        clearInterval(this.callRecordTimer);
        this.callRecordTimer = null;
        this.showToast('info', 'Enregistrement terminé', 'Sauvegarde du fichier en cours...');
      }
    },

    async saveCallRecording(blob) {
      const isMp4 = blob.type.includes('mp4');
      const ext = isMp4 ? 'mp4' : 'webm';
      const targetName = this.activePrivateUser ? this.activePrivateUser.username : 'live';
      const filename = `live_2lmotors_${targetName}_${Date.now()}.${ext}`;

      // 1. Téléchargement direct automatique pour l'administrateur
      try {
        const downloadUrl = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = downloadUrl;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        setTimeout(() => {
          document.body.removeChild(a);
          URL.revokeObjectURL(downloadUrl);
        }, 1200);
      } catch (e) {
        console.warn('[Record] Erreur téléchargement:', e);
      }

      // 2. Sauvegarde automatique dans la médiathèque et diffusion dans le salon
      try {
        const formData = new FormData();
        formData.append('file', blob, filename);
        const res = await fetch('/api/upload', { method: 'POST', body: formData });
        const data = await res.json();
        if (res.ok && data.url) {
          if (this.socket && this.activeRoom) {
            this.socket.emit('chat message', {
              content: '📹 Enregistrement vidéo du live',
              media_url: data.url,
              media_type: 'video',
              roomId: this.activeRoom
            });
          }
          this.showToast('success', 'Enregistrement sauvegardé !', 'Disponible dans vos téléchargements et la médiathèque.');
        }
      } catch (err) {
        console.warn('[Record] Erreur upload serveur:', err);
      }
    },

    formatRecordDuration(sec) {
      const m = Math.floor(sec / 60).toString().padStart(2, '0');
      const s = (sec % 60).toString().padStart(2, '0');
      return `${m}:${s}`;
    },

    async handleFileUpload(event) {
      const file = event.target.files[0];
      if (!file) return;
      this.isUploading = true;
      const formData = new FormData();
      formData.append('file', file);
      try {
        const res = await fetch('/api/upload', { method: 'POST', body: formData });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        this.pendingMedia = { url: data.url, type: data.type };
        this.showToast('success', 'Fichier prêt ! Cliquez sur Envoyer');
      } catch (err) {
        this.showToast('error', 'Erreur upload', err.message);
      } finally {
        this.isUploading = false;
      }
    },

    removePendingMedia() {
      this.pendingMedia = null;
      if (this.$refs.fileInput) this.$refs.fileInput.value = '';
    },

    openLightbox(url) {
      this.lightboxUrl = url;
    },

    onInputTyping() {
      if (!this.socket) return;
      if (!this.isTyping) {
        this.isTyping = true;
        this.socket.emit('typing', { roomId: this.activeRoom });
      }
      clearTimeout(this.typingTimer);
      this.typingTimer = setTimeout(() => this.stopTyping(), 2000);
    },

    stopTyping() {
      if (this.isTyping && this.socket) {
        this.isTyping = false;
        this.socket.emit('stop typing', { roomId: this.activeRoom });
      }
      clearTimeout(this.typingTimer);
    },

    async loadMediaFiles() {
      try {
        const res = await fetch('/api/media');
        const data = await res.json();
        if (res.ok) this.mediaFiles = data.files;
      } catch {}
    },

    toggleMediaView() {
      this.showMedia = !this.showMedia;
      if (this.showMedia) this.loadMediaFiles();
    },

    async deleteMediaFromMyLibrary(file) {
      if (!file || !file.id) return;
      const ok = confirm('Retirer ce média de votre médiathèque personnelle ?\n\n(Il restera visible pour les autres utilisateurs)');
      if (!ok) return;

      // 1. Retrait instantané de la liste des médias affichés
      this.mediaFiles = this.mediaFiles.filter(m => m.id !== file.id);

      // 2. Retrait également du fil de discussion s'il y est présent
      this.messages = this.messages.filter(m => m.id !== file.id);
      if (this.roomMessagesCache[this.activeRoom]) {
        this.roomMessagesCache[this.activeRoom] = this.roomMessagesCache[this.activeRoom].filter(m => m.id !== file.id);
      }

      // 3. Sauvegarde côté serveur pour exclure définitivement ce fichier pour cet utilisateur
      try {
        const res = await fetch(`/api/messages/${file.id}/hide-for-me`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' }
        });
        const data = await res.json();
        if (res.ok) {
          this.showToast('info', 'Média retiré', 'Ce média a été retiré de votre médiathèque.');
        }
      } catch(err) {
        console.warn('Erreur retrait média:', err);
      }
    },

    async clearMyMediaLibrary() {
      if (!this.mediaFiles || this.mediaFiles.length === 0) return;
      const ok = confirm('Voulez-vous vraiment vider TOUTE votre médiathèque personnelle ?\n\n(Ces fichiers seront effacés pour vous uniquement, sans affecter les autres participants)');
      if (!ok) return;

      // 1. Vidage instantané
      this.mediaFiles = [];

      // 2. Sauvegarde côté serveur
      try {
        const res = await fetch('/api/media/clear-my-media', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' }
        });
        const data = await res.json();
        if (res.ok) {
          this.showToast('success', 'Médiathèque vidée', 'Votre médiathèque personnelle a été entièrement vidée.');
        } else {
          this.showToast('error', 'Erreur', data.error || 'Erreur vidage');
        }
      } catch(err) {
        console.warn('Erreur vidage médiathèque:', err);
        this.showToast('error', 'Erreur réseau');
      }
    },

    startGeolocation() {
      if (!('geolocation' in navigator)) return;
      this.geoWatchId = navigator.geolocation.watchPosition(
        (pos) => {
          if (this.socket) {
            this.socket.emit('location update', {
              lat: pos.coords.latitude,
              lng: pos.coords.longitude,
              accuracy: pos.coords.accuracy
            });
          }
        },
        null,
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 15000 }
      );
    },

    stopGeolocation() {
      if (this.geoWatchId !== null) {
        navigator.geolocation.clearWatch(this.geoWatchId);
        this.geoWatchId = null;
      }
    },

    getMapsLink(userId) {
      const loc = this.userLocations[userId];
      if (!loc) return null;
      return `https://www.google.com/maps?q=${loc.lat},${loc.lng}&z=16`;
    },

    // Détection d'Inactivité & Compte à rebours de déconnexion (15 secondes)
    initInactivityDetector() {
      const activityEvents = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll', 'click'];
      const onUserActivity = () => {
        const now = Date.now();
        // Si l'alerte n'est pas déjà affichée, debouncer la réinitialisation du timer
        if (!this.inactivityWarning) {
          if (now - this.lastActivityTimestamp > 2000) {
            this.lastActivityTimestamp = now;
            this.resetInactivityTimer();
          }
        }
      };

      activityEvents.forEach(evt => {
        window.addEventListener(evt, onUserActivity, { passive: true });
      });

      this.resetInactivityTimer();
    },

    resetInactivityTimer() {
      if (this.inactivityTimer) clearTimeout(this.inactivityTimer);

      // Si l'utilisateur est en plein appel vidéo ou enregistrement audio, ne pas le déconnecter
      if (this.callState === 'connected' || this.isRecordingVoice || this.isRecordingCall) {
        return;
      }

      this.inactivityTimer = setTimeout(() => {
        this.triggerInactivityWarning();
      }, this.inactivityTimeoutMs);
    },

    triggerInactivityWarning() {
      // Vérification finale : si l'utilisateur est en direct, prolonger
      if (this.callState === 'connected' || this.isRecordingVoice || this.isRecordingCall) {
        this.resetInactivityTimer();
        return;
      }

      this.inactivityWarning = true;
      this.inactivityCountdown = 15;

      // 1. Message personnel dans son chat
      const warningMsg = {
        id: 'inactivity_notice_' + Date.now(),
        user_id: 0,
        username: 'SYSTÈME',
        content: '⚠️ Attention : En raison d\'une inactivité de 15 minutes dans le chat, vous serez automatiquement déconnecté dans 15 secondes.',
        created_at: new Date().toISOString(),
        is_system: true
      };
      this.messages.push(warningMsg);
      this.$nextTick(() => this.scrollToBottom(true));

      // 2. Alerte sonore et toast
      this.playSound();
      this.showToast('warn', 'Inactivité de 15 min', 'Vous serez déconnecté dans 15 secondes.');

      // 3. Compte à rebours de 15 secondes
      if (this.inactivityCountdownInterval) clearInterval(this.inactivityCountdownInterval);
      this.inactivityCountdownInterval = setInterval(() => {
        this.inactivityCountdown--;
        if (this.inactivityCountdown <= 0) {
          clearInterval(this.inactivityCountdownInterval);
          this.inactivityCountdownInterval = null;
          this.inactivityWarning = false;
          // Déconnexion finale à la fin du compte à rebours
          this.logoutForInactivity();
        }
      }, 1000);
    },

    stayConnected() {
      if (this.inactivityCountdownInterval) {
        clearInterval(this.inactivityCountdownInterval);
        this.inactivityCountdownInterval = null;
      }
      this.inactivityWarning = false;
      this.inactivityCountdown = 15;
      this.lastActivityTimestamp = Date.now();
      this.resetInactivityTimer();

      // Message personnel de confirmation dans le chat
      this.messages.push({
        id: 'inactivity_stay_' + Date.now(),
        user_id: 0,
        username: 'SYSTÈME',
        content: '✅ Session maintenue active. Bon échange sur 2LMotors !',
        created_at: new Date().toISOString(),
        is_system: true
      });
      this.$nextTick(() => this.scrollToBottom(true));
      this.showToast('success', 'Session active', 'Votre session a été prolongée.');
    },

    async logoutForInactivity() {
      try {
        await fetch('/api/auth/logout', { method: 'POST' });
      } finally {
        window.location.href = '/login.html?reason=inactivity';
      }
    },

    async logout() {
      try {
        await fetch('/api/auth/logout', { method: 'POST' });
      } finally {
        window.location.href = '/login.html';
      }
    },

    handleScroll() {
      const container = this.$refs.messagesContainer;
      if (!container) return;
      this.autoScroll = container.scrollHeight - container.scrollTop - container.clientHeight < 100;
    },

    scrollToBottom(force = false) {
      const container = this.$refs.messagesContainer;
      if (!container) return;
      if (force || this.autoScroll) container.scrollTop = container.scrollHeight;
    },

    clearNotifBadge() {
      this.unreadCount = 0;
      document.title = 'MOTORS 2L - Chat';
    },

    sendBrowserNotif(title, body) {
      if (this.notifPermission === 'granted' && !this.isWindowFocused) {
        new Notification(`MOTORS 2L: ${title}`, {
          body,
          icon: '/logo/1000087306.jpg'
        });
      }
    },

    playSound() {
      try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.setValueAtTime(750, ctx.currentTime);
        gain.gain.setValueAtTime(0.08, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
        osc.start();
        osc.stop(ctx.currentTime + 0.25);
      } catch {}
    },

    // --- Sonnerie Téléphonique Réaliste & Vibration Continue pour Smartphone ---
    startRingtone(isIncoming = true) {
      this.stopRingtone();

      // Première vibration & sonnerie immédiates
      this.playRingToneCycle(isIncoming);

      // Boucle de répétition continue (2.5s pour appel entrant, 3.5s pour sortant)
      const intervalMs = isIncoming ? 2500 : 3500;
      this.ringtoneInterval = setInterval(() => {
        if (this.callState !== 'incoming' && this.callState !== 'calling') {
          this.stopRingtone();
          return;
        }
        this.playRingToneCycle(isIncoming);
      }, intervalMs);
    },

    playRingToneCycle(isIncoming = true) {
      // 1. VIBRATION SMARTPHONE (Android & Web Vibration API)
      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        try {
          if (isIncoming) {
            // Séquence d'appel vibrant puissante et répétée
            navigator.vibrate([1000, 300, 900, 300]);
          } else {
            // Pulsation haptique discrète pour l'appelant
            navigator.vibrate([100]);
          }
        } catch (e) {}
      }

      // 2. SONNERIE TÉLÉPHONIQUE (Web Audio API synthétisée haute qualité)
      try {
        const AudioCtxClass = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtxClass) return;

        if (!this.ringtoneAudioCtx || this.ringtoneAudioCtx.state === 'closed') {
          this.ringtoneAudioCtx = new AudioCtxClass();
        }
        const ctx = this.ringtoneAudioCtx;
        if (ctx.state === 'suspended') {
          ctx.resume().catch(() => {});
        }

        const now = ctx.currentTime;

        if (isIncoming) {
          // Sonnerie appel entrant : double tonalité harmonieuse "Drrring... Drrring..."
          this.createDualTone(ctx, now, 0.4, 784, 1046, 0.25);
          this.createDualTone(ctx, now + 0.5, 0.4, 784, 1046, 0.25);
        } else {
          // Tonalité d'appel sortant "Tuuuut"
          this.createDualTone(ctx, now, 1.2, 440, 480, 0.12);
        }
      } catch (err) {
        console.warn('[Ringtone] Erreur audio:', err);
      }
    },

    createDualTone(ctx, startTime, duration, freq1, freq2, maxGain = 0.2) {
      try {
        const gainNode = ctx.createGain();
        gainNode.connect(ctx.destination);

        gainNode.gain.setValueAtTime(0.001, startTime);
        gainNode.gain.exponentialRampToValueAtTime(maxGain, startTime + 0.04);
        gainNode.gain.setValueAtTime(maxGain, startTime + duration - 0.05);
        gainNode.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

        const osc1 = ctx.createOscillator();
        osc1.type = 'sine';
        osc1.frequency.setValueAtTime(freq1, startTime);
        osc1.connect(gainNode);
        osc1.start(startTime);
        osc1.stop(startTime + duration);

        const osc2 = ctx.createOscillator();
        osc2.type = 'triangle';
        osc2.frequency.setValueAtTime(freq2, startTime);
        osc2.connect(gainNode);
        osc2.start(startTime);
        osc2.stop(startTime + duration);
      } catch (e) {}
    },

    stopRingtone() {
      if (this.ringtoneInterval) {
        clearInterval(this.ringtoneInterval);
        this.ringtoneInterval = null;
      }
      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        try {
          navigator.vibrate(0);
        } catch (e) {}
      }
      if (this.ringtoneAudioCtx) {
        try {
          if (this.ringtoneAudioCtx.state !== 'closed') {
            this.ringtoneAudioCtx.close().catch(() => {});
          }
        } catch (e) {}
        this.ringtoneAudioCtx = null;
      }
    },

    showToast(type, title, text = '') {
      const icons = { success: '✅', error: '❌', info: '💬', warn: '🚨' };
      const toast = { id: Date.now() + Math.random(), type, title, text, icon: icons[type] || '🔔', removing: false };
      this.toasts.push(toast);
      setTimeout(() => {
        toast.removing = true;
        setTimeout(() => {
          this.toasts = this.toasts.filter(t => t.id !== toast.id);
        }, 320);
      }, 3500);
    },

    formatMessageContent(text) {
      if (!text) return '';
      // 1. Échappement HTML sécurisé
      let safe = text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');

      // 2. Gras Markdown: **texte**
      safe = safe.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');

      // 3. Italique Markdown: *texte* ou _texte_
      safe = safe.replace(/\*(.*?)\*/g, '<em>$1</em>');
      safe = safe.replace(/_(.*?)_/g, '<em>$1</em>');

      // 4. Listes avec puces: "- " ou "* "
      safe = safe.replace(/(?:^|\n)[-*]\s+(.*?)(?=\n|$)/g, '<br>• $1');

      // 5. Retours à la ligne
      safe = safe.replace(/\n/g, '<br>');

      return safe;
    },
    getInitials(name) {
      if (!name) return '??';
      return name.slice(0, 2).toUpperCase();
    },

    formatTime(dateStr) {
      if (!dateStr) return '';
      const d = new Date(dateStr);
      return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    }
  }
}).mount('#app');






