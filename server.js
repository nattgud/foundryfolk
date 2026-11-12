const express = require('express');
const path = require('path');

try { console.log(`raceimages.js: ${require('./tools/racemanifest.js')()} bilder`); } catch (error) { console.warn('racemanifest:', error.message); }   // håller listan över rasbilder aktuell (se tools/racemanifest.js)

const app = express();
const PORT = process.env.PORT || 8080; // Standardport för många hostingmiljöer (t.ex. Cloud Run)

// Konfigurerar Express att tjäna statiska filer från 'public' mappen
app.use(express.static(path.join(__dirname, 'public')));

// Om någon går till roten (/) ska index.html serveras.
// Eftersom vi använder express.static, kan vi ofta bara behöva: app.get('/', (req, res) => { res.sendFile(path.join(__dirname, 'public', 'index.html')); });
// Men oftast räcker express.static för att hantera detta om index.html finns i 'public'.

app.listen(PORT, () => {
  console.log(`Node.js Webserver körs på port ${PORT}`);
  console.log(`Server redo att hantera requests. Kontrollera din deployment-konfiguration.`);
});