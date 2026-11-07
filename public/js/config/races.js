/* Raser. HÄR lägger du till en ny ras och ställer in dess färger. Inget annat behöver ändras: rasen dyker upp av sig själv i Custom game
   (både som spelarens ras och som fiendernas), och i storyn väljs den med races: { 2: 'demon' } på ett kapitel.

   Ny ras, steg för steg:
     1. Lägg en rad här (nyckeln är rasens id och namnet på bildmappen, t.ex. elf).
     2. Lägg rasens bilder i en undermapp med samma filnamn som originalen: images/buildings/elf/farm.png ersätter images/buildings/farm.png,
        images/units/elf/swordsman.png ersätter images/units/swordsman.png, och så vidare. Saknas en bild används originalet, så en
        ras behöver bara ha de bilder som skiljer sig.
     3. Ställ in menyernas färger nedan (valfritt: utan colors används de vanliga).

   name    visas i Custom game (översätts med t()).
   base    en mörk grundton: bakgrund, paneler, knappar och fält blandas fram ur den. (standard #252d34)
   accent  accentfärgen: markerade och valda knappar, glöd och linjer blandas fram ur den. (standard #5fb55f)
   colors  valfritt: skriv över en enskild färg exakt, t.ex. colors: { line: '#5a2226' }. Det som anges här går före det som räknas fram
           ur base och accent. Alla namn: bg panel line text dim accent button buttonActive onBg selected glow field scroll badLine badBg
           badSolid minimapLine minimapBg (se UI.raceColors i js/ui.js för vad var och en blir och hur de räknas fram).
   Menyerna får rasens färger när SPELAREN har rasen. Huvudmenyn ändras aldrig. En ras utan base, accent och colors använder standardfärgerna.
   human är standardrasen (inga egna bilder eller färger) och ska finnas kvar. */
CityBuilder.Config.races = {
  human: { name: 'Human' },

  demon: {
    name: 'Demon',
    base: '#31191c',      // mörk blodröd grundton
    accent: '#e8643c',    // glödande orangeröd
    colors: {},           // t.ex. { line: '#5a2226', text: '#f1e3de' } om en färg inte blir som du vill
  },

  // elf: { name: 'Elf', base: '#16241c', accent: '#7fd6a2' },
};
