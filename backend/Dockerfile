FROM node:22-bookworm-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build && npm prune --omit=dev
ENV NODE_ENV=production
RUN mkdir -p uploads/covers uploads/audio uploads/payments uploads/qr uploads/pdfs
EXPOSE 5005
CMD ["node", "dist/index.js"]
