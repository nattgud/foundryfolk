/* Raser. HÄR lägger du till en ny ras och ställer in dess färger. Inget annat behöver ändras: rasen dyker upp av sig själv i Custom game
   (både som spelarens ras och som fiendernas), och i storyn väljs den med races: { 2: 'demon' } på ett kapitel.

   Ny ras, steg för steg:
     1. Lägg en rad här (nyckeln är rasens id och namnet på bildmappen, t.ex. elf).
     2. Lägg rasens bilder i en undermapp med samma filnamn som originalen: images/buildings/elf/farm.png ersätter images/buildings/farm.png,
        images/units/elf/swordsman.png ersätter images/units/swordsman.png, och så vidare. Saknas en bild används originalet, så en
        ras behöver bara ha de bilder som skiljer sig.
     3. Ställ in menyernas färger nedan (valfritt: utan colors används de vanliga).

   name    visas i Custom game (översätts med t()).
   colors  menyerna i spelet när SPELAREN har rasen (huvudmenyn ändras aldrig). Allt är valfritt: det som saknas behåller standardfärgen.
           Exempel på färgerna i standardutseendet står i kommentaren efter varje rad.
   human är standardrasen (inga egna bilder eller färger) och ska finnas kvar. */
CityBuilder.Config.races = {
  human: { name: 'Human' },

  demon: {
    name: 'Demon',
    colors: {
      bg: '#170d0e',                       // spelets bakgrund                           (standard #14181c)
      panel: 'rgba(34, 17, 19, .93)',      // paneler: resursfältet, byggmenyn, infopanelen, tooltip (rgba(22, 27, 32, .92))
      line: '#5a2226',                     // ramar och linjer                           (#2c343c)
      text: '#f1e3de',                     // text                                       (#e8ecef)
      dim: '#a38580',                      // dämpad text                                (#7b858e)
      accent: '#e8643c',                   // markerad knapp och kant                    (#5fb55f)
      button: '#31191c',                   // vanliga knappar                            (#252d34)
      buttonActive: '#432227',             // knapp medan du trycker                     (#313b44)
      onBg: '#55231a',                     // påslagen knapp (bakgrund)                  (#26402b)
      selected: '#7a2c1c',                 // vald byggnad/knapp (bakgrund)              (#2d5a36)
      glow: 'rgb(232 100 60 / 60%)',       // glöden runt valda knappar                  (rgb(95 181 95 / 55%))
      field: '#1f1012',                    // inmatningsfält och listor                  (#1b2127)
      scroll: '#6a2f2f',                   // rullningslister                            (#3a444d)
      badLine: '#8f6aa8',                  // ram på knappar som inte går att använda    (#b4443d)
      badBg: 'rgb(143 106 168 / 22%)',     // ...och deras ton                           (rgb(180 68 61 / 20%))
      badSolid: '#2a1a32',                 // ...och deras bakgrund                      (#35201f)
      minimapLine: '#5a2226',              // minimapens ram                             (#2d3943)
      minimapBg: '#120808',                // minimapens bakgrund                        (#0d1115)
    },
  },

  // elf: { name: 'Elf', colors: { accent: '#7fd6a2', panel: 'rgba(16, 30, 24, .92)' } },
};
