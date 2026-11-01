FROM node:20-alpine

WORKDIR /app

# Outils nécessaires à la compilation des modules SQLite natifs
RUN apk add --no-cache python3 make g++

# Dépendances npm
COPY package*.json ./
RUN npm install --omit=dev

# Copie de l'application
COPY . .

# Port standard Render
ENV PORT=3000
ENV NODE_ENV=production

EXPOSE 3000

CMD ["node", "server.js"]
