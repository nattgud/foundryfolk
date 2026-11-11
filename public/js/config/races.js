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
   names   valfritt: rasens egna namn (engelska) på byggnader, resurser och enheter: names: { resource: { sword: 'Bone Blade' }, building: {...}, unit: {...} }.
           Gäller bara visningen (id:n och reglerna är desamma). Översättningar läggs i språkfilen som "resource.sword.demon" (saknas de visas det engelska namnet).
   training valfritt: rasens egen utbildning av en soldat: training: { knight: { inputs: { sword: 1, hell_armor: 1, horse: 1 }, seconds: 30 } }. Utelämnat = units.js.
           Utrustningen måste kunna tillverkas av rasen (en byggnad med race: 'demon' i buildings.js, t.ex. hellforge).
   Menyerna får rasens färger när SPELAREN har rasen. Huvudmenyn ändras aldrig. En ras utan base, accent och colors använder standardfärgerna.
   human är standardrasen (inga egna bilder eller färger) och ska finnas kvar. */
CityBuilder.Config.races = {
  human: { name: 'Human' },

  demon: {
    name: 'Demon',
    base: '#31191c',      // mörk blodröd grundton
    accent: '#e8643c',    // glödande orangeröd
    colors: {},           // t.ex. { line: '#5a2226', text: '#f1e3de' } om en färg inte blir som du vill
    // Demonernas utrustning, byggnader och soldater: samma regler som människornas men egna namn. Knight och sköldbärare tränas dessutom på demonernas egen utrustning
    // (ben- och blodbaserad, tillverkad i Hellforge).
    names: {
      resource: {
        club: 'Bone Club', sword: 'Bone Blade', steel_sword: 'Hellsteel Blade', bow: 'Sinew Bow', leather_armor: 'Hide Armor', horse: 'Nightmare',
      },
      building: {
        swordsmith: 'Blade Pit', bowyer: 'Bonecarver', leatherworker: 'Hide Works', armorsmith: 'Plate Forge', stables: 'Nightmare Pens',
        guard_tower: 'Bone Tower', garrison: 'Dread Garrison',
      },
      unit: {
        clubman: 'Imp', footman: 'Grunt', swordsman: 'Hellblade', shieldbearer: 'Bone Guard', blademaster: 'Blade Fiend', archer: 'Hell Archer', knight: 'Hell Knight',
      },
    },
    training: {
      shieldbearer: { inputs: { bone_shield: 1, leather_armor: 1 }, seconds: 20 },
      knight: { inputs: { sword: 1, hell_armor: 1, horse: 1 }, seconds: 30 },
    },
  },

  // elf: { name: 'Elf', base: '#16241c', accent: '#7fd6a2' },
};

// En soldats utbildning för en ras: rasens egen (races[ras].training) annars den vanliga (units.js)
CityBuilder.Config.trainingOf = (kind, race) => CityBuilder.Config.races?.[race]?.training?.[kind] ?? CityBuilder.Config.units[kind]?.training;
