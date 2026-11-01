FROM node:20-bookworm-slim

WORKDIR /app

# Outils de compilation pour les modules SQLite natifs sous Linux
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

# Dépendances npm
COPY package*.json ./
RUN npm install --omit=dev

# Copie du projet
COPY . .

# Port standard Render
ENV PORT=3000
ENV NODE_ENV=production

EXPOSE 3000

CMD ["node", "server.js"]
