/* Storymode, "The Gentle Turning": berättelsen som data. Allt spelaren läser skrivs här som engelsk text, och texten är själva
   översättningsnyckeln (se lang/lang.js): när ett kapitel är klart läggs dess texter in i alla språkfiler, precis som övriga texter.
   Text som ska översättas får alltså inte byggas ihop av delar (bynamnet är en variabel: {village}).

   OBS: prologen och brev 1-4 är godkända. Resten (brev 5-21, dialoger, epilog, kapitelnamnen 15-17) är PÅHITTAD
   MOCKDATA som tekniken testas med, och ska skrivas om innan storyn släpps.

   seed:      körningsfröet för alla kapitel: samma kapitel ger alltid samma karta (se Levels.storyInfo)
   speakers:  vem som talar i en dialog: { id: { name, color } }
   unlock:    byggnad -> kapitlet den blir byggbar i (byggnader som inte står här finns från kapitel 1). Storyn har egen tabell.
   prologue, epilogue: stycken som visas i läsvyn.
   music:     egen musik i stället för den vanliga: { prologue, epilogue } är en fil eller en lista (null = den vanliga musiken)
               och spelas medan prologen och epilogen läses. Ett kapitel kan ha eget music-fält på samma sätt, som spelas hela kapitlet.
   chapters:  ett per bana, i ordning. Alla fält utom name är valfria:
     name         kapitlets namn
     music        egen musik hela kapitlet (en fil eller en lista), t.ex. 'music/chapter9.mp3'
     letter       { lines: [stycken], throne } från kungen, visas före banan (throne: signaturen är "In service of the throne")
     dialogue     [{ who, text }] tryckt dialog som visas efter brevet
     lifted       dialog som visas när dimman lyfter (Eye of Shades förstörd)
     after        dialog som visas när kapitlet är klart
     goals        målen som på banorna ({ type, resource | id, amount }), men { resource, more: n } betyder n fler än man börjar med.
                  Utan goals räknas målen fram som på en vanlig bana. Med end: 'hq' är fiendens HQ det enda målet.
     rivals, ai   antal fiender (0 om inget anges) och deras styrka som en banas nummer; races: { spelare: ras } (se Players.race)
     start        { buildings: [id] }: färdiga byggnader runt HQ vid starten (inga bärare)
     eye, fog     eye: Eye of Shades står närmare fienden än något annat; fog: konstant dimma tills den förstörs
     end          'hq': kapitlet är klart när fiendens HQ förstörs
     events       [{ at (sekunder), tell: dialog | weather: 'storm' | tornado: radie | super: radie | meteors: sekunder }]
     meteorProof  enhetstyper som meteorer inte skadar */
(function (CityBuilder) {
  'use strict';

  const letter = (lines, throne) => ({ lines, throne: !!throne });
  const say = (who, text) => ({ who, text });
  const more = (resource, n) => ({ resource, more: n });
  const own = ['woodcutter', 'quarry', 'sawmill'];   // produktionsbyggnaderna från de första målen står redo i senare kapitel

  CityBuilder.Config.story = {
    title: 'The Gentle Turning',
    village: 'Thunebrook',
    seed: 1861,
    music: { prologue: null, epilogue: null },   // t.ex. prologue: 'music/prologue.mp3'
    speakers: {
      thordram: { name: 'Thordram', color: '#c9a45c' },
      albertha: { name: 'Albertha', color: '#b78bd6' },
      mordrath: { name: 'Mordrath', color: '#d9534f' },
      baelthar: { name: 'Baelthar', color: '#d9534f' },
      onden: { name: 'Onden', color: '#e0402f' },
      reeve: { name: 'You', color: '#8fc1ad' },
    },
    greeting: 'To the Reeve of {village},',
    signature: { realm: 'In service of the realm', throne: 'In service of the throne', name: 'Maegnius, King of Farael' },

    unlock: {
      woodcutter: 1, quarry: 1, sawmill: 1, warehouse: 1,
      berry_gatherer: 2, gatherer: 2, well: 2, hunters_cottage: 2, herb_gatherer: 2, fishing_hut: 2,
      clay_pit: 3, charcoal_burner: 3, farm: 3, planter: 3, brickworks: 3, watchtower: 3,
      mill: 4, bakery: 4, coal_mine: 4, mine: 4, iron_mine: 4, iron_smelter: 4, toolsmith: 4,
      apple_gatherer: 5, mushroom_gatherer: 5, sand_collector: 5, kitchen: 5, gold_mine: 5, gold_smelter: 5, mint: 5,
      leatherworker: 6, alchemist: 6, large_warehouse: 6, limestone_quarry: 6,
      enchanter: 7, crystal_gatherer: 7, moonstone_gatherer: 7, relic_hunter: 7, fallen_star_collector: 7,
      market: 8, glassworks: 8, great_depot: 8,
      wall: 9, guard_tower: 9, bowyer: 9, stables: 9,
      garrison: 10, swordsmith: 10, armorsmith: 10, steelworks: 10,
      copper_mine: 12, tin_mine: 12, copper_smelter: 12, tin_smelter: 12, bronze_foundry: 12,
      rock_crusher: 13, salt_mine: 13, sulfur_mine: 13, silver_mine: 13, silver_smelter: 13, gemstone_mine: 13,
      shrine: 14,
      monument: 999,   // vinstbyggnaden i Free Realm används inte i storyn
    },

    prologue: [
      'Farael is a kingdom of farms and forests, of quiet villages and old roads. Its king, Maegnius, is a just man, loved by his people.',
      'Magic runs through the land, in its springs, its stones and the hands of those who learn it.',
      'But the dark is older still. It has stirred since before the first village was raised, patient and hungry.',
      'It is bound by an old Rule. None remember who made it.',
      'The dark may whisper. It may tempt, and it may test. But it may never command.',
      'Whispers are permitted. Hands are not.',
      'You are the Reeve of a small village at the edge of the realm. No hero, no soldier, only someone with good land, honest work and a quiet life you mean to keep.',
      'Then a letter arrives.',
    ],

    chapters: [
      { name: 'The Summons', goals: [more('wood', 30), more('stone', 30)],
        letter: letter(['Demons are attacking Farael and burning our border villages. I cannot ask you to take up a sword, only an axe. Send me thirty timber and thirty stone, quickly.']) },
      { name: 'Meals for many', start: { buildings: own }, goals: [more('berries', 25), more('fish', 25)],
        letter: letter(['My thanks, Reeve. Your wagons have reached the camps, and the men speak your name. Now they need food. Send berries and fish, as much as you can find.']) },
      { name: 'Walls of Brick', start: { buildings: [...own, 'berry_gatherer', 'fishing_hut'] }, goals: [more('brick', 25), more('plank', 25)],
        letter: letter(['Reeve, the camps are fed, thanks to you. The passes must now be walled before the demons return. Could you send brick and planks? I know how much I ask.']) },
      { name: 'The Iron Debt', start: { buildings: [...own, 'brickworks', 'clay_pit'] }, goals: [more('iron', 20), more('axe', 6)],
        letter: letter(['Reeve, war is costly. The smiths need iron and tools, so send them. My counsellors, Thordram and Albertha, will see to your needs.'], true),
        dialogue: [
          say('thordram', 'The king asks for iron. Iron is what we shall give him.'),
          say('albertha', 'Do not mind his manner, Reeve. Thordram counts things. I count people, and I would say you are doing well.'),
          say('thordram', 'The iron will find its use, whichever way the war turns.'),
        ] },
      { name: 'Gold for the Crown', eye: true, start: { buildings: [...own, 'mine', 'iron_smelter'] }, goals: [more('gold', 12), more('coins', 40)],
        letter: letter(['The crown must pay its soldiers. Gold, Reeve, and coin. My counsellors will place an Eye of Shades at the border; it will shield you from the demons.'], true),
        dialogue: [
          say('albertha', 'The Eye watches the border so that you need not. Is that not a comfort?'),
          say('thordram', 'It watches. What it sees, it keeps.'),
        ] },
      { name: 'Draughts of Courage', eye: true, goals: [more('potion', 8), more('leather_armor', 6)],
        letter: letter(['Send draughts for the men. Courage is brewed, Reeve, and I have none to spare.'], true) },
      { name: 'Relics and Starlight', eye: true, goals: [more('ancient_relic', 2), more('fallen_star', 2)],
        letter: letter(['The old magic sleeps in relics and fallen stars. Find them. I will not ask twice.'], true),
        dialogue: [say('thordram', 'Relics remember. It is their only fault.')] },
      { name: 'The Roads Are Not Safe', eye: true, goals: [{ key: 'x:carriers', type: 'carriers', amount: 60 }, more('steel', 10)],
        letter: letter(['My roads are not safe and my wagons do not arrive. Build yours, Reeve, and build them well.'], true) },
      { name: 'The Border at Numbjar', eye: true, rivals: 1, ai: 12, end: 'hq',
        letter: letter(['Numbjar has closed its gates against us. Take their border fortress, Reeve. Do it in my name.'], true) },
      { name: 'The Border at Vedahast', eye: true, rivals: 1, ai: 16, end: 'hq',
        letter: letter(['Vedahast now. They sent no answer to my letters, and silence is an answer.'], true) },
      { name: 'The Eye Closes', eye: true, fog: true, rivals: 1, ai: 20, races: { 2: 'demon' }, end: 'hq',
        letter: letter(['The fog is the demons. Hold, Reeve. Hold until it lifts.'], true),
        dialogue: [say('albertha', 'You must not leave the Eye. Whatever you hear, you must not.')],
        events: [{ at: 240, tell: [say('thordram', 'The siege tightens. How inconvenient.')] }],
        lifted: [
          say('baelthar', 'The Eye is gone, and so is the mask. I am Baelthar.'),
          say('mordrath', 'And I am Mordrath. We thank you, Reeve. You have been of great use.'),
        ] },
      { name: 'Ashes', rivals: 1, ai: 24, races: { 2: 'demon' }, end: 'hq',
        letter: letter(['The villages are ash. I have a name for the one who did this. Onden.'], true),
        dialogue: [say('onden', 'You have kept my house tidy, Reeve. I thank you.')] },
      { name: 'Embers', rivals: 1, ai: 28, races: { 2: 'demon' }, end: 'hq', letter: letter(['Embers remain. Put them out.'], true) },
      { name: 'The Book Opens', letter: letter(['There is a book in the north. Bring it to me.'], true) },
      { name: 'Outposts I', rivals: 1, ai: 30, races: { 2: 'demon' }, end: 'hq', letter: letter(['The first outpost. Take it.'], true) },
      { name: 'Outposts II', rivals: 1, ai: 34, races: { 2: 'demon' }, end: 'hq', letter: letter(['The second outpost. Take it.'], true) },
      { name: 'Outposts III', rivals: 1, ai: 38, races: { 2: 'demon' }, end: 'hq', letter: letter(['The third outpost. Take it.'], true) },
      { name: 'The Outer Fortress', rivals: 1, ai: 45, races: { 2: 'demon' }, end: 'hq', letter: letter(['The outer fortress falls today, or you do.'], true) },
      { name: 'The Vault', rivals: 1, ai: 50, races: { 2: 'demon' }, end: 'hq', letter: letter(['What is in the vault is mine.'], true) },
      { name: 'The March', rivals: 1, ai: 55, end: 'hq',
        dialogue: [say('reeve', 'They march on me as though I had burned their homes. I wish I could tell them who did.')] },
      { name: 'Onden', rivals: 1, ai: 70, races: { 2: 'demon' }, end: 'hq', meteorProof: ['knight'],
        dialogue: [say('onden', 'Come, Reeve. Let us see what a quiet life is worth.')],
        events: [
          { at: 90, weather: 'storm' },
          { at: 300, tornado: 6 },
          { at: 540, super: 8 },
          { at: 780, meteors: 60 },
        ] },
    ],

    epilogue: [
      'The dark was bound by an old Rule, and the Rule held: it never commanded, it only whispered.',
      'The kingdoms learned the truth too late to thank you, and you went home to your village.',
    ],
  };
})(window.CityBuilder);
