# Usar uma imagem Node.js
FROM node:18-slim

WORKDIR /app

# Copiar arquivos de dependências
COPY package*.json ./
COPY tsconfig.json ./

# Instalar TODAS as dependências (para poder compilar o typescript)
RUN npm install

# Copiar o código fonte (respeitando o .dockerignore)
COPY . .

# Fazer a Build
RUN npm run build

# Limpar devDependencies para reduzir a imagem final e manter apenas de produção
RUN npm prune --omit=dev

# Expor a porta 3000 que a CORE API usa
EXPOSE 3000

# Executar do Build Gerado (dist)
CMD ["npm", "start"]
