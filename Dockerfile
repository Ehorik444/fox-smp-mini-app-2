# ===== Base image =====
FROM node:18-alpine

# ===== Create app directory =====
WORKDIR /app

# ===== Install dependencies =====
COPY package*.json ./
RUN npm install --production

# ===== Copy source code =====
COPY . .

# ===== Environment =====
ENV NODE_ENV=production

# ===== Start bot =====
CMD ["node", "src/bot.js"]
