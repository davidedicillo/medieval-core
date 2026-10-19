FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY services ./services
COPY packages ./packages
COPY examples ./examples
COPY docs ./docs
COPY llms.txt README.md ROADMAP.md CONTRIBUTING.md SECURITY.md ./
COPY ios/README.md ./ios/README.md
COPY game-service/README.md ./game-service/README.md
COPY game-service/docs ./game-service/docs
COPY ios/Art/Generated/Logo/medieval-logo-transparent-v1.png ./ios/Art/Generated/Logo/medieval-logo-transparent-v1.png
RUN mkdir -p .runtime/platform && chown -R node:node .runtime
ENV NODE_ENV=production HOST=0.0.0.0 PORT=5183
USER node
EXPOSE 5183
HEALTHCHECK --interval=30s --timeout=5s CMD node -e "fetch('http://127.0.0.1:5183/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["npm", "run", "platform"]
