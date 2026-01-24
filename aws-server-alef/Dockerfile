# Usar uma imagem leve do Node.js
FROM node:18-slim

# Definir diretório de trabalho
WORKDIR /app

# Copiar arquivos de dependências
COPY package*.json ./

# Instalar dependências de produção
RUN npm install --omit=dev

# Copiar o restante do código (respeitando o .dockerignore)
COPY . .

# Expor a porta que a API usa
EXPOSE 3000

# Comando para iniciar a aplicação
CMD ["npm", "start"]
