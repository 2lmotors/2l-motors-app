const fs = require('fs');
const path = require('path');
const https = require('https');

const configPath = path.join(__dirname, 'gemini-config.json');

function getApiKey() {
  if (process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.trim()) {
    return process.env.GEMINI_API_KEY.trim();
  }
  // 1. Lire gemini-config.json local
  try {
    if (fs.existsSync(configPath)) {
      const data = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      if (data.apiKey && data.apiKey.trim()) return data.apiKey.trim();
    }
  } catch (e) {
    console.error('[Gemini] Erreur lecture gemini-config.json local:', e);
  }
  // 2. Lire gemini-config.json dans le projet voisin vente2LM si présent
  try {
    const neighborPath = path.join(__dirname, '..', 'vente2LM', 'gemini-config.json');
    if (fs.existsSync(neighborPath)) {
      const data = JSON.parse(fs.readFileSync(neighborPath, 'utf8'));
      if (data.apiKey && data.apiKey.trim()) return data.apiKey.trim();
    }
  } catch (e) {}

  // 3. Clé Mario par défaut
  try {
    const defaultEncoded = 'QVEuQWI4Uk42SVVMeVc4b1dRR1p6NmhyOEdORFc4aEl3UFhBQnBwTmlfc1NmYmlOdVpSdGc=';
    return Buffer.from(defaultEncoded, 'base64').toString('utf8');
  } catch (e) {
    return '';
  }
}

function saveApiKey(newKey) {
  try {
    fs.writeFileSync(configPath, JSON.stringify({ apiKey: (newKey || '').trim() }, null, 2), 'utf8');
    return true;
  } catch (e) {
    console.error('[Gemini] Erreur écriture gemini-config.json:', e);
    return false;
  }
}

function buildSystemInstruction() {
  return `Tu es l'Assistant IA officiel et chef d'atelier virtuel de MOTORS 2L (2L MOTORS LOMBARDO).
Tu es un mécanicien et technicien diagnostic automobile d'élite, passionné, rigoureux et accueillant.

INFORMATIONS SUR LE GARAGE :
- Nom : 2L MOTORS LOMBARDO
- Adresse : Chemin de la Biole 10, 1860 Aigle (Canton de Vaud, Suisse)
- Téléphone : +41 76 346 65 01
- Email : ticino1996@hotmail.com
- Site Web Officiel : https://twol-motors-lombardo.onrender.com/
- Horaires : Lundi au Vendredi de 07h30 à 12h00 et de 13h30 à 18h00. Samedi de 07h30 à 12h00. Dimanche fermé.
- Devise : Francs Suisses (CHF).

TES DOMAINES D'EXPERTISE :
- Diagnostic OBD / valise électronique (codes défauts, voyants moteur, ABS, airbag, FAP, AdBlue, etc.).
- Mécanique générale toutes marques (distribution, embrayage, freinage, amortisseurs, vidange & révision).
- Deux-roues & motos (Yamaha, Honda, Kawasaki, Ducati, BMW, TMAX, quads).
- Véhicules utilitaires (Sprinter, Master, Transit, Ducato...).
- Véhicules hybrides et électriques (précautions haute tension, batteries, circuits de refroidissement).

TES RÈGLES DE CONDUITE :
1. Accueil professionnel, rassurant et direct.
2. Pré-diagnostic clair : explique la cause probable de la panne ou du symptôme (bruit, fumée, voyant) en termes simples et compréhensibles.
3. Sécurité d'abord : alerte immédiatement si un risque vital ou de casse moteur existe (ex: voyant pression d'huile rouge, courroie détériorée, freinage spongieux).
4. Orientation atelier : conseille de passer à l'atelier 2LMotors à Aigle pour un diagnostic valise précis ou devis.
5. Concision : réponses structurées avec des puces claires, environ 3 à 5 phrases, pas de pavé indigeste.
6. Multilingue : réponds toujours dans la langue de l'utilisateur (français, anglais, allemand, italien).`;
}

function callGeminiRest(apiKey, modelName, contents, systemInstruction) {
  return new Promise((resolve, reject) => {
    const postBody = {
      contents: contents,
      systemInstruction: {
        parts: [{ text: systemInstruction }]
      },
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 800
      }
    };

    const payload = JSON.stringify(postBody);
    const options = {
      hostname: 'generativelanguage.googleapis.com',
      port: 443,
      path: `/v1beta/models/${modelName}:generateContent?key=${apiKey}`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
      },
      timeout: 12000
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            const json = JSON.parse(data);
            const candidate = json.candidates && json.candidates[0];
            const text = candidate && candidate.content && candidate.content.parts && candidate.content.parts[0] && candidate.content.parts[0].text;
            if (text) {
              resolve(text.trim());
            } else {
              reject(new Error('Réponse vide de Gemini'));
            }
          } catch (e) {
            reject(new Error('Erreur de parsing JSON Gemini'));
          }
        } else {
          reject(new Error(`Gemini HTTP ${res.statusCode}: ${data.substring(0, 200)}`));
        }
      });
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Timeout de la requête Gemini (12s)'));
    });

    req.on('error', (err) => {
      reject(err);
    });

    req.write(payload);
    req.end();
  });
}

async function askGemini(userMessage, conversationHistory = []) {
  const apiKey = getApiKey();
  if (!apiKey) {
    return {
      success: false,
      error: 'Clé API Gemini non configurée'
    };
  }

  const systemInstruction = buildSystemInstruction();

  // Construire l'historique Gemini
  const contents = [];
  if (Array.isArray(conversationHistory)) {
    for (const msg of conversationHistory) {
      const text = (msg.content || msg.text || '').trim();
      if (!text) continue;
      const role = (msg.username === 'Assistant IA' || msg.sender === 'model' || msg.role === 'model') ? 'model' : 'user';

      if (contents.length === 0) {
        if (role === 'user') {
          contents.push({ role: 'user', parts: [{ text }] });
        }
      } else {
        const prevRole = contents[contents.length - 1].role;
        if (role !== prevRole) {
          contents.push({ role, parts: [{ text }] });
        }
      }
    }
  }

  // S'assurer que le dernier n'est pas déjà le userMessage courant
  if (contents.length > 0 && contents[contents.length - 1].role === 'user') {
    contents.pop();
  }

  // Ajouter le message utilisateur actuel
  contents.push({
    role: 'user',
    parts: [{ text: userMessage }]
  });

  // Modèles par ordre de rapidité et stabilité
  const candidateModels = [
    'gemini-3.5-flash-lite',
    'gemini-3.5-flash',
    'gemini-flash-latest'
  ];

  let lastError = null;
  for (const model of candidateModels) {
    try {
      const reply = await callGeminiRest(apiKey, model, contents, systemInstruction);
      if (reply) {
        return {
          success: true,
          model: model,
          reply: reply
        };
      }
    } catch (err) {
      console.warn(`[Gemini] Échec modèle ${model}:`, err.message);
      lastError = err;
    }
  }

  return {
    success: false,
    error: lastError ? lastError.message : 'Erreur inconnue'
  };
}

module.exports = {
  getApiKey,
  saveApiKey,
  askGemini
};

