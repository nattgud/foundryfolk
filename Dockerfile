# Välj en lämplig Node.js basimage
FROM node:18-slim

# Sätt arbetsmappen i containern
WORKDIR /app

# Kopiera package.json och package-lock.json för att installera beroenden
COPY package*.json ./ 

# Installera beroenden
RUN npm install --production

# Kopiera resten av källkod (inklusive public mappen)
COPY . . 

# Exponera den port som app.listen använder (eller låt Cloud Run hantera det via ENV_VAR)
EXPOSE 8080

# Starta appen
CMD ["node", "server.js"]