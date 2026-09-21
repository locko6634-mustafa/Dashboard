FROM node:22-alpine AS builder

WORKDIR /app

RUN apk add --no-cache openssl python3 make g++

COPY package.json ./
RUN npm install

COPY prisma ./prisma
RUN npx prisma generate

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:22-alpine AS runner

WORKDIR /app

RUN apk add --no-cache openssl

ENV NODE_ENV=production
ENV PORT=3000

COPY package.json ./
RUN npm install --omit=dev --omit=peer

COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/dist ./dist

# Copy public frontend assets
COPY ../*.html ./public/
COPY ../*.js ./public/
COPY ../*.css ./public/

EXPOSE 3000

CMD ["node", "dist/server.js"]
