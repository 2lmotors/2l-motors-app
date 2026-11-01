// =========================================================================
// MOTEUR INTERNATIONALISATION (i18n) MOTORS 2L AVEC DICTIONNAIRES EMBARQUÉS
// =========================================================================

const DEFAULT_FR = {
  brand: {
    title: "MOTORS 2L",
    subtitle: "Service & Réparations",
    tagline: "Auto Repair • Performance • Maintenance",
    adminTagline: "Auto Repair • Performance • Administration",
    caption: "2LMOTORS SERVICE & RÉPARATION"
  },
  nav: {
    generalChannel: "Canal Général",
    generalSub: "Discussion publique",
    aiAssistant: "Assistant IA 2L",
    aiSub: "Diagnostic & Devis 24/7",
    chat: "Chat",
    media: "Médiathèque",
    admin: "Admin",
    logout: "Déconnexion",
    exit: "Quitter",
    refresh: "Rafraîchir",
    backToChat: "Retour au Chat"
  },
  auth: {
    welcomeBack: "Bon retour",
    loginToContinue: "Connectez-vous à votre compte pour continuer",
    createAccount: "Créer un compte",
    joinCustomerPortal: "Rejoignez le portail client Motors 2L",
    email: "Email",
    emailPlaceholder: "vous@exemple.com",
    phone: "Téléphone",
    phonePlaceholder: "+33 6 12 34 56 78",
    username: "Nom d'utilisateur",
    usernamePlaceholder: "MonPseudo",
    address: "Adresse postale",
    addressPlaceholder: "10 rue des Moteurs, 75000 Paris",
    password: "Mot de passe",
    passwordPlaceholder: "••••••••••••",
    passwordMinChars: "Min. 6 caractères",
    logIn: "Se connecter",
    signUp: "S'inscrire",
    directAdmin: "Accès Direct Admin",
    dontHaveAccount: "Vous n'avez pas de compte ?",
    alreadyHaveAccount: "Vous avez déjà un compte ?",
    termsNotice: "En continuant, vous acceptez nos",
    terms: "Conditions • Politique de confidentialité",
    processing: "Traitement en cours...",
    creating: "Création..."
  },
  chat: {
    generalHeader: "Canal Général 2LMotors",
    generalDesc: "Tout le monde peut communiquer",
    privateWith: "Salon privé avec",
    privateDesc: "Discussion confidentielle",
    aiHeader: "Assistant IA — Motors 2L",
    aiStatus: "● En ligne (Réponse instantanée)",
    noMessagesGeneral: "Aucun message pour l'instant. Soyez le premier à écrire !",
    noMessagesAi: "Posez une question mécanique ou demandez un diagnostic à l'Assistant IA !",
    noMessagesPrivate: "Salon privé ouvert. Discutez en toute confidentialité.",
    writeMessagePlaceholder: "Écrire un message...",
    recordingVoicePlaceholder: "Enregistrement vocal en cours...",
    send: "Envoyer",
    voiceRecording: "Enregistrement vocal",
    cancel: "Annuler",
    download: "Télécharger",
    read: "LU",
    typingOne: "est en train d'écrire...",
    typingTwo: "et",
    typingMany: "Plusieurs personnes écrivent...",
    videoCall: "Appel Vidéo Live",
    alertAdmin: "Alerter l'admin",
    emptyMedia: "Aucun fichier partagé pour le moment."
  },
  sidebar: {
    onlineParticipants: "Participants en ligne",
    noOneOnline: "Aucun utilisateur en ligne",
    member: "Membre",
    admin: "Admin",
    busy: "Occupé"
  },
  admin: {
    title: "Panel Administration",
    statsLive: "Stats Live",
    liveStatsTitle: "Statistiques en direct",
    registered: "Inscrits",
    active: "Actifs",
    admins: "Admins",
    messagesTotal: "Messages Total",
    messagesToday: "Messages aujourd'hui",
    selectParticipant: "Sélectionner un participant dans la liste :",
    choosePlaceholder: "-- Choisir un participant --",
    selectPrompt: "Veuillez choisir un participant ci-dessus pour afficher et gérer son profil complet.",
    accountActive: "Compte Actif",
    accountInactive: "Compte Inactif",
    phoneLabel: "Téléphone :",
    addressLabel: "Adresse :",
    registeredAt: "Inscrit le :",
    messagesSent: "Messages envoyés :",
    liveGps: "Géolocalisation en direct :",
    openGoogleMaps: "Localiser sur Google Maps",
    notReported: "Non renseigné",
    offlineGps: "Position non disponible (hors ligne)",
    demoteUser: "Rétrograder Membre",
    promoteAdmin: "Promouvoir Admin",
    deactivateAccount: "Désactiver le compte",
    activateAccount: "Activer le compte",
    deleteUser: "Supprimer"
  },
  alertModal: {
    title: "Alerter l'Administrateur",
    subtitle: "Envoyez une alerte prioritaire directe",
    desc: "Si l'administrateur n'est pas en ligne, laissez-lui un message urgent ou une demande de rappel :",
    placeholder: "Ex: Demande urgente de devis pour ma révision, merci de me recontacter...",
    sendAlert: "Envoyer l'alerte"
  },
  videoCall: {
    callingWith: "Appel Vidéo Live avec",
    callingWaiting: "Appel en cours... En attente",
    liveConnected: "🟢 En direct",
    you: "Vous (Moi)",
    interlocutor: "Interlocuteur",
    hangUp: "Raccrocher",
    incomingCall: "Appel Vidéo Entrant",
    incomingDesc: "souhaite démarrer un appel live avec vous.",
    accept: "Accepter",
    decline: "Refuser"
  }
};

const DEFAULT_EN = {
  brand: {
    title: "MOTORS 2L",
    subtitle: "Service & Repair",
    tagline: "Auto Repair • Performance • Maintenance",
    adminTagline: "Auto Repair • Performance • Administration",
    caption: "2LMOTORS SERVICE & REPAIR"
  },
  nav: {
    generalChannel: "General Channel",
    generalSub: "Public chat",
    aiAssistant: "2L AI Assistant",
    aiSub: "Diagnostic & Quotes 24/7",
    chat: "Chat",
    media: "Media Library",
    admin: "Admin",
    logout: "Logout",
    exit: "Exit",
    refresh: "Refresh",
    backToChat: "Back to Chat"
  },
  auth: {
    welcomeBack: "Welcome Back",
    loginToContinue: "Log in to your account to continue",
    createAccount: "Create Account",
    joinCustomerPortal: "Join Motors 2L customer portal",
    email: "Email",
    emailPlaceholder: "you@example.com",
    phone: "Phone",
    phonePlaceholder: "+1 (___) ___-____",
    username: "Username",
    usernamePlaceholder: "JohnDoe",
    address: "Postal Address",
    addressPlaceholder: "123 Performance St, City",
    password: "Password",
    passwordPlaceholder: "••••••••••••",
    passwordMinChars: "Min. 6 characters",
    logIn: "Log In",
    signUp: "Sign Up",
    directAdmin: "Direct Admin Access",
    dontHaveAccount: "Don't have an account?",
    alreadyHaveAccount: "Already have an account?",
    termsNotice: "By continuing, you agree to our",
    terms: "Terms • Privacy Policy",
    processing: "Processing...",
    creating: "Creating..."
  },
  chat: {
    generalHeader: "Motors 2L General Channel",
    generalDesc: "Everyone can communicate",
    privateWith: "Private Room with",
    privateDesc: "Confidential discussion",
    aiHeader: "AI Assistant — Motors 2L",
    aiStatus: "● Online (Instant Response)",
    noMessagesGeneral: "No messages yet. Be the first to write!",
    noMessagesAi: "Ask any automotive question or request diagnostic support!",
    noMessagesPrivate: "Private room open. Chat in complete privacy.",
    writeMessagePlaceholder: "Write a message...",
    recordingVoicePlaceholder: "Recording voice message...",
    send: "Send",
    voiceRecording: "Voice recording",
    cancel: "Cancel",
    download: "Download",
    read: "READ",
    typingOne: "is typing...",
    typingTwo: "and",
    typingMany: "Several people are typing...",
    videoCall: "Live Video Call",
    alertAdmin: "Alert Admin",
    emptyMedia: "No media shared yet."
  },
  sidebar: {
    onlineParticipants: "Online Participants",
    noOneOnline: "No users online",
    member: "Member",
    admin: "Admin",
    busy: "Busy"
  },
  admin: {
    title: "Administration Panel",
    statsLive: "Live Stats",
    liveStatsTitle: "Live Dashboard",
    registered: "Registered",
    active: "Active",
    admins: "Admins",
    messagesTotal: "Total Messages",
    messagesToday: "Messages Today",
    selectParticipant: "Select a participant from the list:",
    choosePlaceholder: "-- Choose a participant --",
    selectPrompt: "Please choose a participant above to display and manage full profile.",
    accountActive: "Active Account",
    accountInactive: "Inactive Account",
    phoneLabel: "Phone:",
    addressLabel: "Address:",
    registeredAt: "Registered on:",
    messagesSent: "Messages sent:",
    liveGps: "Live Geolocation:",
    openGoogleMaps: "Locate on Google Maps",
    notReported: "Not reported",
    offlineGps: "Position not available (offline)",
    demoteUser: "Demote to Member",
    promoteAdmin: "Promote to Admin",
    deactivateAccount: "Deactivate Account",
    activateAccount: "Activate Account",
    deleteUser: "Delete"
  },
  alertModal: {
    title: "Alert Administrator",
    subtitle: "Send a direct priority alert",
    desc: "If the administrator is offline, leave an urgent message or callback request:",
    placeholder: "Ex: Urgent quote request for maintenance, please call me back...",
    sendAlert: "Send Alert"
  },
  videoCall: {
    callingWith: "Live Video Call with",
    callingWaiting: "Calling... Waiting for answer",
    liveConnected: "🟢 Live",
    you: "You (Me)",
    interlocutor: "Caller",
    hangUp: "Hang Up",
    incomingCall: "Incoming Video Call",
    incomingDesc: "wants to start a live video call with you.",
    accept: "Accept",
    decline: "Decline"
  }
};

export const i18nManager = {
  currentLang: localStorage.getItem('2lmotors_lang') || 'fr',
  translations: {
    fr: DEFAULT_FR,
    en: DEFAULT_EN
  },

  async init(initialLang) {
    if (initialLang) this.currentLang = initialLang;
    const stored = localStorage.getItem('2lmotors_lang');
    if (stored) this.currentLang = stored;
    // Tente également de charger une version externe actualisée si présente
    this.fetchJsonAsync(this.currentLang);
  },

  async fetchJsonAsync(lang) {
    try {
      const res = await fetch(`/i18n/${lang}.json?v=${Date.now()}`);
      if (res.ok) {
        const data = await res.json();
        this.translations[lang] = data;
      }
    } catch(e) {}
  },

  async setLanguage(lang) {
    this.currentLang = lang;
    localStorage.setItem('2lmotors_lang', lang);
    await this.fetchJsonAsync(lang);
  },

  t(path) {
    const dict = this.translations[this.currentLang] || this.translations['fr'] || {};
    const keys = path.split('.');
    let val = dict;
    for (const k of keys) {
      if (val && typeof val === 'object' && k in val) {
        val = val[k];
      } else {
        // Si non trouvé dans la langue courante, fallback immédiat sur le français
        let fallbackVal = this.translations['fr'];
        for (const fk of keys) {
          if (fallbackVal && typeof fallbackVal === 'object' && fk in fallbackVal) {
            fallbackVal = fallbackVal[fk];
          } else {
            return path;
          }
        }
        return fallbackVal;
      }
    }
    return val;
  }
};
