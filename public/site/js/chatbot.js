// Chatbot Interactif 2L MOTORS LOMBARDO avec IA Google Gemini & Module Vocal
const chatHistory = [];

let chatState = {
  step: 'INITIAL',
  flow: null, // 'QUOTE' ou 'SAV'
  data: {
    serviceId: null,
    serviceTitle: '',
    immatriculation: '',
    description: '',
    urgence: 'normale',
    date: ''
  }
};

// --- MODULE VOCAL & SYNTHÈSE (TTS & STT) ---
let isVoiceOutputEnabled = localStorage.getItem('leo_voice_output') !== 'false';
let recognitionInstance = null;
let isListening = false;
let maleFrenchVoice = null;

function findMaleFrenchVoice() {
  if (!('speechSynthesis' in window)) return null;
  const voices = window.speechSynthesis.getVoices();
  if (!voices || voices.length === 0) return null;

  const frenchVoices = voices.filter(v => v.lang && (v.lang.startsWith('fr') || v.lang.includes('FR') || v.lang.includes('CH')));
  
  // Prénoms et mots-clés de voix masculines courantes
  const maleKeywords = ['guillaume', 'paul', 'claude', 'henri', 'thomas', 'nicolas', 'alain', 'bruno', 'antoine', 'pierre', 'mathieu', 'male', 'homme'];
  const femaleKeywords = ['hortense', 'julie', 'virginie', 'denise', 'audrey', 'celine', 'corinne', 'female', 'femme', 'elsa', 'chloe', 'lea', 'brigitte'];

  // 1. Voix masculine suisse (fr-CH)
  const swissMale = frenchVoices.find(v => (v.lang === 'fr-CH' || v.name.toLowerCase().includes('switzerland')) && 
    maleKeywords.some(m => v.name.toLowerCase().includes(m)));
  if (swissMale) return swissMale;

  // 2. Voix masculine française explicite
  const frenchMale = frenchVoices.find(v => maleKeywords.some(m => v.name.toLowerCase().includes(m)));
  if (frenchMale) return frenchMale;

  // 3. Voix française non explicitement féminine
  const notFemale = frenchVoices.find(v => !femaleKeywords.some(f => v.name.toLowerCase().includes(f)));
  if (notFemale) return notFemale;

  return frenchVoices[0] || null;
}

function initVoices() {
  if (!('speechSynthesis' in window)) return;
  const loadVoices = () => {
    maleFrenchVoice = findMaleFrenchVoice();
  };
  loadVoices();
  if (window.speechSynthesis.onvoiceschanged !== undefined) {
    window.speechSynthesis.onvoiceschanged = loadVoices;
  }
}
initVoices();

function updateVoiceToggleUI() {
  const btn = document.getElementById('voiceToggleBtn');
  if (!btn) return;
  btn.textContent = isVoiceOutputEnabled ? '🔊' : '🔇';
  btn.title = isVoiceOutputEnabled ? 'Voix de Léo activée (cliquez pour couper)' : 'Voix de Léo coupée (cliquez pour activer)';
  btn.style.opacity = isVoiceOutputEnabled ? '1' : '0.55';
}

function toggleVoiceOutput() {
  isVoiceOutputEnabled = !isVoiceOutputEnabled;
  localStorage.setItem('leo_voice_output', isVoiceOutputEnabled ? 'true' : 'false');
  updateVoiceToggleUI();
  if (!isVoiceOutputEnabled && 'speechSynthesis' in window) {
    window.speechSynthesis.cancel();
  }
}

function cleanTextForSpeech(str) {
  if (!str) return '';
  return str
    .replace(/<[^>]*>?/gm, ' ')
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/CHF/gi, 'francs suisses')
    .replace(/\+41/g, 'plus 41')
    .replace(/•/g, ', ')
    .replace(/&bull;/g, ', ')
    .replace(/\s+/g, ' ')
    .trim();
}

function speakLeoMessage(rawText) {
  if (!isVoiceOutputEnabled || !('speechSynthesis' in window)) return;
  const clean = cleanTextForSpeech(rawText);
  if (!clean) return;

  try {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(clean);
    utterance.lang = 'fr-CH';
    
    // Sélection de la voix d'homme
    if (!maleFrenchVoice) {
      maleFrenchVoice = findMaleFrenchVoice();
    }
    if (maleFrenchVoice) {
      utterance.voice = maleFrenchVoice;
    }
    
    // Tonalité masculine posée et naturelle (pitch 0.85 = plus grave / viril)
    utterance.pitch = 0.85;
    utterance.rate = 1.0;
    window.speechSynthesis.speak(utterance);
  } catch (err) {
    console.warn('Erreur synthèse vocale:', err);
  }
}

function toggleSpeechRecognition() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    alert("La reconnaissance vocale n'est pas supportée par votre navigateur (veuillez utiliser Chrome, Edge ou Safari).");
    return;
  }

  if (isListening && recognitionInstance) {
    recognitionInstance.stop();
    return;
  }

  if (!recognitionInstance) {
    recognitionInstance = new SpeechRecognition();
    recognitionInstance.lang = 'fr-FR';
    recognitionInstance.continuous = false;
    recognitionInstance.interimResults = true;

    recognitionInstance.onstart = () => {
      isListening = true;
      const micBtn = document.getElementById('micBtn');
      const bar = document.getElementById('voiceStatusBar');
      if (micBtn) micBtn.classList.add('listening');
      if (bar) bar.style.display = 'flex';
      const input = document.getElementById('chatInput');
      if (input) input.placeholder = "Parlez maintenant...";
    };

    recognitionInstance.onresult = (event) => {
      let text = '';
      for (let i = event.resultIndex; i < event.results.length; ++i) {
        text += event.results[i][0].transcript;
      }
      const input = document.getElementById('chatInput');
      if (input && text) {
        input.value = text;
      }
    };

    recognitionInstance.onerror = (event) => {
      console.warn('Erreur micro:', event.error);
      isListening = false;
      const micBtn = document.getElementById('micBtn');
      const bar = document.getElementById('voiceStatusBar');
      if (micBtn) micBtn.classList.remove('listening');
      if (bar) bar.style.display = 'none';
      const input = document.getElementById('chatInput');
      if (input) input.placeholder = "Écrivez ou dictez votre panne...";
    };

    recognitionInstance.onend = () => {
      isListening = false;
      const micBtn = document.getElementById('micBtn');
      const bar = document.getElementById('voiceStatusBar');
      if (micBtn) micBtn.classList.remove('listening');
      if (bar) bar.style.display = 'none';
      const input = document.getElementById('chatInput');
      if (input) {
        input.placeholder = "Écrivez ou dictez votre panne...";
        if (input.value.trim().length > 1) {
          setTimeout(() => {
            sendChatMessage();
          }, 450);
        }
      }
    };
  }

  try {
    recognitionInstance.start();
  } catch (e) {
    console.warn('Erreur démarrage micro:', e);
  }
}

function scrollChatToBottom() {
  const container = document.getElementById('chatMessages');
  if (!container) return;
  container.scrollTop = container.scrollHeight;
  setTimeout(() => {
    container.scrollTop = container.scrollHeight;
  }, 50);
  setTimeout(() => {
    container.scrollTop = container.scrollHeight;
  }, 200);
}

function toggleChatBot() {
  const widget = document.getElementById('chatWidget');
  if (!widget) return;
  if (widget.style.display === 'flex') {
    widget.style.display = 'none';
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
  } else {
    widget.style.display = 'flex';
    updateVoiceToggleUI();
    const msgs = document.getElementById('chatMessages');
    if (msgs.children.length === 0) {
      greetUser();
    } else {
      scrollChatToBottom();
    }
    const input = document.getElementById('chatInput');
    if (input) input.focus();
  }
}

function openChatBot(mode) {
  const widget = document.getElementById('chatWidget');
  if (widget) {
    widget.style.display = 'flex';
    updateVoiceToggleUI();
    const msgs = document.getElementById('chatMessages');
    if (msgs.children.length === 0) {
      greetUser();
    } else {
      scrollChatToBottom();
    }
  }
  if (mode === 'devis') {
    startQuoteFlow();
  } else if (mode === 'sav') {
    startSavFlow();
  }
}

function addBotMessage(text, quickActions = []) {
  const container = document.getElementById('chatMessages');
  if (!container) return;

  const plainText = text.replace(/<[^>]*>?/gm, '');
  chatHistory.push({ sender: 'bot', text: plainText });

  const msgDiv = document.createElement('div');
  msgDiv.className = 'chat-msg bot';
  msgDiv.innerHTML = `
    <div>${text}</div>
    <div style="margin-top: 0.35rem;">
      <button class="voice-msg-btn" onclick="speakLeoMessage(this.parentElement.previousElementSibling.innerText)" title="Réécouter à voix haute">
        🔊 Écouter
      </button>
    </div>
  `;

  if (quickActions.length > 0) {
    const actionsDiv = document.createElement('div');
    actionsDiv.className = 'chat-quick-actions';
    quickActions.forEach(act => {
      const btn = document.createElement('button');
      btn.className = 'chat-btn-action';
      btn.textContent = act.label;
      btn.onclick = act.action;
      actionsDiv.appendChild(btn);
    });
    msgDiv.appendChild(actionsDiv);
  }

  container.appendChild(msgDiv);
  scrollChatToBottom();

  // Lecture vocale automatique de Léo
  speakLeoMessage(text);
}

function addUserMessage(text) {
  const container = document.getElementById('chatMessages');
  if (!container) return;

  chatHistory.push({ sender: 'user', text });

  const msgDiv = document.createElement('div');
  msgDiv.className = 'chat-msg user';
  msgDiv.textContent = text;
  container.appendChild(msgDiv);
  scrollChatToBottom();
}

function greetUser() {
  const name = currentUser ? `Bonjour ${currentUser.prenom}` : 'Bonjour et bienvenue chez 2L MOTORS LOMBARDO';
  addBotMessage(
    `${name} ! 👨‍🔧<br>Je suis <strong>Léo</strong>, votre mécanicien conseil virtuel. Que puis-je faire pour vous aujourd'hui ?`,
    [
      { label: '📋 Demander un devis', action: () => startQuoteFlow() },
      { label: '🛠️ Service Après-Vente (SAV)', action: () => startSavFlow() },
      { label: '🕒 Horaires & Adresse', action: () => showContactInfo() }
    ]
  );
}

function showContactInfo() {
  addUserMessage("Horaires & Coordonnées");
  addBotMessage(
    "📍 <strong>2L MOTORS LOMBARDO</strong><br>Chemin de la Biole 10, 1860 Aigle (Suisse)<br>📞 <strong>+41 76 346 65 01</strong><br>✉️ ticino1996@hotmail.com<br><br>🕒 <strong>Horaires d'ouverture :</strong><br>• Lun - Ven : 07h30 - 12h00 &bull; 13h30 - 18h00<br>• Samedi : 07h30 - 12h00",
    [
      { label: '📋 Demander un devis', action: () => startQuoteFlow() },
      { label: '🛠️ Signaler un problème SAV', action: () => startSavFlow() }
    ]
  );
}

// Flow Devis
function startQuoteFlow() {
  addUserMessage("Je souhaite demander un devis de réparation");
  chatState.flow = 'QUOTE';
  chatState.step = 'ASK_SERVICE_TYPE';

  addBotMessage(
    "Quel type d'intervention concerne votre véhicule ?",
    [
      { label: '🔧 Révision / Vidange', action: () => chooseServiceType('Révision / Vidange') },
      { label: '🛑 Freins (Plaquettes/Disques)', action: () => chooseServiceType('Freinage') },
      { label: '⚙️ Distribution / Moteur', action: () => chooseServiceType('Distribution') },
      { label: '❄️ Climatisation', action: () => chooseServiceType('Climatisation') },
      { label: '⚠️ Recherche de panne / Autre', action: () => chooseServiceType('Panne spécifique') }
    ]
  );
}

function startChatWithService(serviceId, serviceTitle) {
  openChatBot();
  chatState.flow = 'QUOTE';
  chatState.data.serviceId = serviceId;
  chatState.data.serviceTitle = serviceTitle;
  
  addUserMessage(`Je souhaite un devis pour : ${serviceTitle}`);
  chatState.step = 'ASK_PLATE';
  
  setTimeout(() => {
    addBotMessage(`Très bon choix ! Pour préparer votre devis pour <strong>${serviceTitle}</strong>, quelle est l'<strong>immatriculation</strong> de votre véhicule (ex: AB-123-CD) ou sa marque et son modèle ?`);
  }, 400);
}

function chooseServiceType(type) {
  addUserMessage(type);
  chatState.data.serviceTitle = type;
  chatState.step = 'ASK_PLATE';
  addBotMessage(`C'est noté pour la catégorie <strong>${type}</strong>.<br>Pouvez-vous me donner l'<strong>immatriculation</strong> de votre véhicule (ex: AB-123-CD) ou sa marque et son modèle ?`);
}

// Flow SAV
function startSavFlow() {
  addUserMessage("J'ai une demande pour le Service Après-Vente");
  chatState.flow = 'SAV';
  chatState.step = 'SAV_ASK_DETAILS';
  addBotMessage("Nous accordons la plus grande importance à votre satisfaction. Décrivez-moi le problème constaté sur votre véhicule après réparation :");
}

// Gestion des messages tapés par l'utilisateur
async function sendChatMessage() {
  const input = document.getElementById('chatInput');
  const text = input.value.trim();
  if (!text) return;
  input.value = '';

  addUserMessage(text);

  // Traitement selon étape
  if (chatState.flow === 'QUOTE') {
    if (chatState.step === 'ASK_PLATE') {
      chatState.data.immatriculation = text;
      chatState.step = 'ASK_DESCRIPTION';
      addBotMessage("Merci ! Précisez brièvement les détails ou symptômes éventuels (ex: bruit, kilométrage, voyant, date souhaitée...) :");
    } 
    else if (chatState.step === 'ASK_DESCRIPTION') {
      chatState.data.description = text;
      await finalizeQuote();
    }
  } 
  else if (chatState.flow === 'SAV') {
    if (chatState.step === 'SAV_ASK_DETAILS') {
      chatState.data.description = text;
      await finalizeSav();
    }
  } 
  else {
    // Message libre : transmission au chef d'atelier IA Google Gemini
    const typingId = 'typing-' + Date.now();
    const container = document.getElementById('chatMessages');
    if (container) {
      const typingDiv = document.createElement('div');
      typingDiv.id = typingId;
      typingDiv.className = 'chat-msg bot';
      typingDiv.innerHTML = `<span style="color: #94a3b8; font-style: italic;">Léo analyse votre demande... 🔧</span>`;
      container.appendChild(typingDiv);
      scrollChatToBottom();
    }

    try {
      const priorHistory = chatHistory.slice(0, -1);
      const res = await fetch('/api/chat/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, history: priorHistory })
      });
      const data = await res.json();

      // Supprimer indicateur de frappe
      const typingEl = document.getElementById(typingId);
      if (typingEl) typingEl.remove();

      const formattedReply = (data.reply || "Je suis à votre écoute pour toute question technique ou demande de devis.")
        .replace(/\n\n/g, '<br><br>')
        .replace(/\n/g, '<br>')
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');

      addBotMessage(formattedReply, [
        { label: '📋 Demander un devis', action: () => startQuoteFlow() },
        { label: '🛠️ Question SAV', action: () => startSavFlow() },
        { label: '📍 Contact & Horaires', action: () => showContactInfo() }
      ]);
    } catch (err) {
      const typingEl = document.getElementById(typingId);
      if (typingEl) typingEl.remove();
      addBotMessage("Une petite erreur est survenue lors de l'analyse. Que souhaitez-vous faire ?", [
        { label: '📋 Faire un devis', action: () => startQuoteFlow() },
        { label: '🛠️ Ticket SAV', action: () => startSavFlow() }
      ]);
    }
  }
}

async function finalizeQuote() {
  addBotMessage("⏳ Enregistrement de votre demande de devis en cours...");

  // Vérifier si connecté
  if (!currentUser) {
    // Sauvegarde temporaire en local pour la récupérer après connexion
    sessionStorage.setItem('pendingQuote', JSON.stringify(chatState.data));

    setTimeout(() => {
      addBotMessage(
        `Votre demande de devis pour votre véhicule (<strong>${chatState.data.immatriculation}</strong>) est prête !<br><br>` +
        `Pour que notre atelier 2L Motors puisse chiffrer votre intervention et vous envoyer la proposition, <strong>vous devez vous inscrire ou vous connecter</strong>.`,
        [
          { label: '🔑 Créer mon compte / Me connecter', action: () => window.location.href = '/login.html' }
        ]
      );
    }, 600);
    return;
  }

  // Si connecté, on crée le devis directement
  try {
    const res = await fetch('/api/quotes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        service_id: chatState.data.serviceId,
        immatriculation: chatState.data.immatriculation,
        description_panne: `${chatState.data.serviceTitle ? chatState.data.serviceTitle + ' : ' : ''}${chatState.data.description}`,
        urgence: chatState.data.urgence
      })
    });
    const result = await res.json();
    if (res.ok) {
      addBotMessage(
        `✅ <strong>Parfait ! Votre devis #${result.quoteId} est enregistré !</strong><br>` +
        `L'équipe 2L MOTORS LOMBARDO étudie votre demande. Vous pouvez suivre l'avancement en direct sur votre espace client.`,
        [
          { label: 'Voir mon espace client', action: () => window.location.href = '/dashboard.html' }
        ]
      );
    } else {
      addBotMessage(`⚠️ ${result.error || 'Erreur lors de l’envoi du devis.'}`);
    }
  } catch (err) {
    addBotMessage("Une erreur réseau est survenue. Veuillez réessayer.");
  }
}

async function finalizeSav() {
  addBotMessage("⏳ Prise en charge de votre dossier SAV...");

  if (!currentUser) {
    addBotMessage(
      `Pour traiter votre réclamation SAV avec le dossier de votre véhicule, veuillez vous connecter ou créer un compte.`,
      [
        { label: '🔑 Me connecter / M’inscrire', action: () => window.location.href = '/login.html' }
      ]
    );
    return;
  }

  try {
    const res = await fetch('/api/sav', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        titre: 'Demande SAV transmise via le Chatbot',
        description: chatState.data.description,
        priorite: 'urgente'
      })
    });
    const result = await res.json();
    if (res.ok) {
      addBotMessage(
        `✅ <strong>Dossier SAV #${result.ticketId} ouvert avec succès !</strong><br>` +
        `Notre chef d'atelier examine votre signalement en priorité. Vous recevrez une réponse directement sur votre espace client.`,
        [
          { label: 'Accéder à mes dossiers SAV', action: () => window.location.href = '/dashboard.html' }
        ]
      );
    } else {
      addBotMessage(`⚠️ ${result.error || 'Erreur lors de la création du ticket SAV.'}`);
    }
  } catch (err) {
    addBotMessage("Une erreur réseau est survenue. Veuillez réessayer.");
  }
}

