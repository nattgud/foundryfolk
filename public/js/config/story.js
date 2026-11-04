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
     start        { buildings: [...] }: färdiga byggnader vid starten (inga bärare). Varje post är { type, dx, dy } (exakt plats, rutor från HQ)
                  eller bara ett id (automatisk plats runt HQ). Placera dem i spelet och kör CityBuilder.Story.layout() i konsolen för färdiga rader.
     eye, fog     eye: true = Eye of Shades står närmare fienden än något annat, eye: { dx, dy } = på en bestämd plats; fog: konstant dimma tills den förstörs
     end          'hq': kapitlet är klart när fiendens HQ förstörs
     events       [{ at (sekunder), tell: dialog | weather: 'storm' | tornado: radie | super: radie | meteors: sekunder }]
     meteorProof  enhetstyper som meteorer inte skadar */
(function (CityBuilder) {
  'use strict';

  const letter = (lines, throne) => ({ lines, throne: !!throne });
  const say = (who, text) => ({ who, text });
  const more = (resource, n) => ({ resource, more: n });

  CityBuilder.Config.story = {
    title: 'The Gentle Turning',
    village: 'Thunebrook',
    seed: 1861,
    music: { prologue: null, epilogue: null },   // t.ex. prologue: 'music/prologue.mp3'
    speakers: {   // voice: { pitch ×, dark (lowpass ×), stretch (längre ljud, långsammare text), slide (tonen sjunker), detune (cent, en andra ostämd röst) }
      thordram: { name: 'Thordram', color: '#c9a45c', voice: { pitch: 0.75 } },
      albertha: { name: 'Albertha', color: '#b78bd6', voice: { pitch: 1.25 } },
      mordrath: { name: 'Mordrath', color: '#d9534f', voice: { pitch: 0.6, dark: 0.65, stretch: 2.4, slide: 0.22, detune: -45 } },
      baelthar: { name: 'Baelthar', color: '#d9534f', voice: { pitch: 0.8, dark: 0.8, stretch: 2.4, slide: 0.22, detune: 70 } },
      onden: { name: 'Onden', color: '#e0402f', voice: { pitch: 0.42, dark: 0.5, stretch: 3.2, slide: 0.3, detune: -60 } },
      reeve: { name: 'You', color: '#8fc1ad' },
    },
    // Rösten i dialogerna (systems/voice.js). Ett [tonläge] i en replik, t.ex. '[angry]Nej!', byter tonläge från den platsen (tills nästa tagg).
    // wave, pitch (Hz), vary (% slumpad variation), every (ljud var N:e tecken), dur (ms), volume (%), speed (ms per tecken), cutoff (Hz), byLetter (tonhöjd följer bokstaven 0/1),
    // noise (% luft), voice (% röstklang), vibrato (%). Tonläge: pitch ×, vary ×, speed ×, volume ×, slope (tonhöjdens lutning över meningen).
    voice: {
      wave: 'sawtooth', pitch: 314, vary: 31, every: 2, dur: 102, volume: 40, speed: 35, cutoff: 3450, byLetter: 1, noise: 23, voice: 100, vibrato: 97,
      moods: {
        calm: { pitch: 1, vary: 1, speed: 1.15, volume: 1, slope: 0 },
        happy: { pitch: 1.2, vary: 1.4, speed: 0.85, volume: 1.1, slope: 0.1 },
        angry: { pitch: 0.85, vary: 0.8, speed: 1.6, volume: 1.75, slope: -0.1 },
        sad: { pitch: 1, vary: 0.35, speed: 2, volume: 0.65, slope: -0.25 },
        question: { pitch: 1, vary: 1, speed: 1, volume: 1, slope: 0.4 },
        whisper: { pitch: 1.05, vary: 0.2, speed: 2, volume: 0.45, slope: 0 },
        scared: { pitch: 1.3, vary: 2.95, speed: 0.8, volume: 1, slope: 0.15 },
      },
    },
    greeting: 'To the Reeve of {village},',
    signature: { realm: 'In service of the realm', throne: 'In service of the throne', name: 'Maegnius, King of Farael' },

    unlock: {
      woodcutter: 1, quarry: 1, sawmill: 1, warehouse: 1,
      berry_gatherer: 2, gatherer: 2, well: 2, hunters_cottage: 2, herb_gatherer: 2, fishing_hut: 2,
      clay_pit: 3, charcoal_burner: 3, farm: 3, planter: 3, brickworks: 3, watchtower: 3,
      mill: 4, bakery: 4, coal_mine: 4, mine: 4, iron_mine: 4, iron_smelter: 4, toolsmith: 4, rock_crusher: 4,
      apple_gatherer: 5, mushroom_gatherer: 5, sand_collector: 5, kitchen: 5, gold_mine: 5, gold_smelter: 5, mint: 5, copper_mine: 5, tin_mine: 5, copper_smelter: 5, tin_smelter: 5, bronze_foundry: 5, silver_mine: 5, silver_smelter: 5,
      leatherworker: 6, alchemist: 6, large_warehouse: 6, limestone_quarry: 6, crystal_gatherer: 6, glassworks: 6, salt_mine: 6,
      enchanter: 7, moonstone_gatherer: 7, relic_hunter: 7, fallen_star_collector: 7,
      market: 8, great_depot: 8, steelworks: 8,
      wall: 9, guard_tower: 9, bowyer: 9, stables: 9, garrison: 9,
      swordsmith: 10, armorsmith: 10,
      sulfur_mine: 13, gemstone_mine: 13,
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
    //  Voice emotions: calm, happy, angry, sad, question, whisper, scared
    chapters: [
      { name: 'The Summons', goals: [more('wood', 30), more('stone', 30)],
        letter: letter(['Demons are attacking Farael and burning our border villages. I cannot ask you to take up a sword, only an axe. Send me thirty timber and thirty stone, quickly.']) },
      { name: 'Meals for many', start: { buildings: [
          { type: 'woodcutter', dx: -2, dy: -3 },
          { type: 'sawmill', dx: -1, dy: -2 },
          { type: 'quarry', dx: 3, dy: 4 },
        ] }, goals: [more('berries', 25), more('fish', 25)],
        letter: letter(['My thanks, Reeve. Your wagons have reached the camps, and the men speak your name. Now they need food. Send berries and fish, as much as you can find.']) },
      { name: 'Walls of Brick', start: { buildings: [
          { type: 'quarry', dx: 6, dy: -1 },
          { type: 'hunters_cottage', dx: 2, dy: 2 },
          { type: 'sawmill', dx: -1, dy: 3 },
          { type: 'berry_gatherer', dx: 4, dy: 3 },
          { type: 'woodcutter', dx: -1, dy: 5 },
        ] }, goals: [more('brick', 25), more('plank', 25)],
        letter: letter(['Reeve, the camps are fed, thanks to you. The passes must now be walled before the demons return. Could you send brick and planks? I know I ask a lot of you.']) },
      { name: 'The Iron Debt', start: { buildings: [
          { type: 'quarry', dx: 4, dy: 4 },
          { type: 'sawmill', dx: 2, dy: 7 },
          { type: 'woodcutter', dx: 4, dy: 8 },
        ] }, goals: [more('iron', 20), more('axe', 6)],
        letter: letter(['Reeve, war is costly. The smiths need you to deliver iron and tools. My counsellors, Thordram and Albertha, will help you see to it.'], true),
        dialogue: [
          say('thordram', '[happy]Hello Reeve. [calm]The king asks for iron and axe.'),
          say('albertha', '[calm]And we are here to help you deliver that.'),
          say('thordram', "[angry]But you will need to do the work, of course."),
          say('albertha', "But we'll be here to guide you! [happy]Good luck!"),
        ] },
      { name: 'Gold for the Crown', eye: true, start: { buildings: [
          { type: 'bakery', dx: 2, dy: -4 },
          { type: 'mill', dx: 2, dy: -3 },
          { type: 'woodcutter', dx: -3, dy: -2 },
          { type: 'hunters_cottage', dx: 0, dy: -2 },
          { type: 'farm', dx: 2, dy: -2 },
          { type: 'quarry', dx: 5, dy: -1 },
          { type: 'well', dx: -9, dy: 0 },
          { type: 'fishing_hut', dx: -9, dy: 1 },
          { type: 'woodcutter', dx: -3, dy: 2 },
          { type: 'sawmill', dx: -1, dy: 2 },
        ] }, goals: [more('gold', 12), more('coins', 40)],
        letter: letter(['The crown must pay its soldiers. Gold, Reeve, and coin. My counsellors will place an Eye of Shades at the border; it will shield you from the demons.'], true),
        dialogue: [
          say('albertha', 'The Eye watches the border so that you need not. [question]Is that not a comfort?'),
          say('thordram', '[angry]It watches. What it sees, it keeps.'),
          say('albertha', '[happy]Now to it! Time to find some gold!'),
          say('thordram', '[angry]Make haste!'),
        ] },
      { name: 'Draughts of Mending', start: { buildings: [
          { type: 'quarry', dx: 3, dy: -6 },
          { type: 'woodcutter', dx: 7, dy: -6 },
          { type: 'woodcutter', dx: 7, dy: -1 },
          { type: 'salt_mine', dx: -5, dy: 0 },
          { type: 'sawmill', dx: 2, dy: 0 },
          { type: 'farm', dx: -3, dy: 1 },
          { type: 'mill', dx: -5, dy: 2 },
          { type: 'mill', dx: -3, dy: 2 },
          { type: 'bakery', dx: -1, dy: 2 },
          { type: 'kitchen', dx: 1, dy: 2 },
          { type: 'hunters_cottage', dx: 3, dy: 2 },
          { type: 'herb_gatherer', dx: 7, dy: 2 },
          { type: 'well', dx: -1, dy: 8 },
          { type: 'well', dx: 0, dy: 8 },
          { type: 'fishing_hut', dx: 1, dy: 9 },
        ] }, eye: true, goals: [more('potion', 8), more('leather_armor', 6)],
        letter: letter(['Reeve, the first soldiers are coming home from the border, wounded and worn. Send draughts to mend them, and leather armour so that fewer need mending. Albertha says her herbs and crystals will do more than any surgeon. I pray she is right.'], true),
        dialogue: [
          say('albertha', '[happy]Draughts! How lovely. [calm]Every soldier ought to sleep soundly.'),
          say('thordram', "[angry]A man who sleeps doesn't talk."),
          say('albertha', '[happy]Thordram means they will be well rested!'),
          say('thordram', '[angry]I mean what I mean.'),
          say('reeve', '[question]Is there anything in these draughts I should know about?'),
          say('albertha', '[happy]Only honey and rosemary, Reeve.'),
          say('thordram', '[whisper]And a little something to keep the fear away.'),
        ],
        after: [
          say('thordram', '[calm]The soldiers drank it gladly. Every one of them.'),
          say('albertha', '[happy]Such good appetites!'),
        ] },
      { name: 'Relics and Starlight', start: { buildings: [] }, eye: true, goals: [more('ancient_relic', 2), more('fallen_star', 2)],
        letter: letter(['Reeve, my counsellors speak of relics and fallen stars, old magic that might turn the war. Find what you can. I do not understand it, but I trust them.'], true),
        dialogue: [
          say('thordram', '[calm]Relics remember. It is their only fault.'),
          say('reeve', '[question]Remember what?'),
          say('albertha', '[happy]Oh, everything! Who held them, who lost them, who wept over them.'),
          say('thordram', '[angry]Bring them whole. A chipped relic is a poor memory.'),
          say('albertha', '[whisper]And do not drop the stars, dear. They are still warm.'),
        ] },
      { name: 'The Roads Are Not Safe', start: { buildings: [] }, eye: true, goals: [{ key: 'x:carriers', type: 'carriers', amount: 60 }, more('steel', 10)],
        letter: letter(['Reeve, the roads are not safe and the wagons do not arrive. Build yours, and build them well. I must have steel for the smiths before the cold sets in.'], true),
        dialogue: [
          say('thordram', '[angry]Sixty carriers. [calm]A road is only as long as the legs on it.'),
          say('albertha', '[happy]And a village is only as strong as its roads! The more wagons, the better.'),
          say('reeve', '[question]Why does the crown need so many of mine?'),
          say('albertha', '[calm]To carry what must be carried, Reeve.'),
          say('thordram', '[calm]And to be somewhere, when it is needed.'),
        ],
        after: [
          say('albertha', '[happy]Such a lovely lot of wagons! [whisper]Thordram, are they not lovely?'),
          say('thordram', '[calm]They will do.'),
        ] },
      { name: 'The Border at Numbjar', start: { buildings: [] }, eye: true, rivals: 1, ai: 12, end: 'hq',
        letter: letter(['Reeve, Numbjar has closed its gates against us and will not say why. My counsellors believe they shelter the demons. Take their border fortress in my name. I do not ask it lightly.'], true),
        dialogue: [
          say('thordram', '[angry]Numbjar. The gate that does not open.'),
          say('reeve', '[sad]These are farmers like mine. Are we certain they shelter anything?'),
          say('albertha', '[happy]Certain? Oh, who is ever certain?'),
          say('thordram', '[angry]The king has decided. Do you doubt the king?'),
          say('reeve', '[calm]No. [sad]I only wish I knew what I am fighting for.'),
          say('albertha', '[happy]For Farael, naturally!'),
        ],
        events: [{ at: 180, tell: [say('thordram', '[angry]Their walls still hold. Do not let them.')] }],
        after: [
          say('thordram', '[calm]One gate. One more.'),
          say('albertha', '[happy]Do not look so grim, Reeve! The king will be pleased.'),
        ] },
      { name: 'The Border at Vedahast', start: { buildings: [] }, eye: true, rivals: 1, ai: 16, end: 'hq',
        letter: letter(['Reeve, Vedahast now. They have sent no answer to my letters, and silence is an answer. I am told it is the same dark that closed Numbjar. Forgive me for asking this of you again.'], true),
        dialogue: [
          say('albertha', '[happy]Vedahast! They never answered the king.'),
          say('reeve', '[question]Did anyone ask them anything?'),
          say('thordram', '[angry]Silence is an answer.'),
          say('reeve', '[sad]Silence is also what frightened people give.'),
          say('albertha', '[whisper]Then frighten them less, Reeve. Quickly.'),
        ],
        after: [
          say('thordram', '[calm]Two borders. The king will sleep better.'),
          say('albertha', '[whisper]And so shall we.'),
        ] },
      { name: 'The Eye Closes', start: { buildings: [] }, eye: true, fog: true, rivals: 1, ai: 20, races: { 2: 'demon' }, end: 'hq',
        letter: letter(['Reeve, a fog has risen around the Eye, and my counsellors say the fog is the demons. Hold your village. Hold it until the fog lifts, whatever you hear.'], true),
        dialogue: [
          say('albertha', '[whisper]You must not leave the Eye. Whatever you hear, you must not.'),
          say('reeve', '[scared]I hear nothing but the fog.'),
          say('thordram', '[angry]Then it is working. [calm]Stay where you are.'),
        ],
        events: [
          { at: 240, tell: [say('thordram', '[calm]The siege tightens. How inconvenient.'), say('albertha', '[whisper]Thordram. Not yet.')] },
          { at: 420, tell: [say('reeve', '[scared]Something is moving out there. Many things.'), say('thordram', '[angry]Hold.')] },
        ],
        lifted: [
          say('baelthar', '[calm]The Eye is gone, and so is the mask. [whisper]I am Baelthar.'),
          say('mordrath', '[calm]And I am Mordrath. [angry]We thank you, Reeve. You have been of great use.'),
          say('reeve', '[scared]You. All this time, you.'),
          say('baelthar', '[whisper]All this time.'),
          say('mordrath', '[calm]Do not look so wounded. We never raised a hand. [angry]Yours built every wall.'),
        ],
        after: [
          say('reeve', '[sad]Every wall, every wagon, every gate. I built the war they wanted.'),
        ] },
      { name: 'Ashes', rivals: 1, ai: 24, races: { 2: 'demon' }, end: 'hq',
        letter: letter(['Reeve, the villages are ash. I have learned who stood behind my counsellors, and I will write his name only once: Onden. I was blind, and you were used. Forgive us both, and put out what he has lit.'], true),
        dialogue: [
          say('onden', '[whisper]You have kept my house tidy, Reeve. I thank you.'),
          say('reeve', '[angry]Your house? These were homes.'),
          say('onden', '[calm]I lit nothing. [whisper]The Rule forbids it. Hands do that. Yours, theirs.'),
          say('onden', '[calm]I only whisper. Mortals do the rest.'),
          say('reeve', '[angry]Then listen to this.'),
        ],
        after: [
          say('reeve', '[sad]He never touched a flame, and still the villages burned.'),
        ] },
      { name: 'Embers', rivals: 1, ai: 28, races: { 2: 'demon' }, end: 'hq',
        letter: letter(['Reeve, embers remain, and wherever they glow the dark is not far. Put them out before the wind finds them.'], true),
        dialogue: [
          say('baelthar', '[whisper]Rest, Reeve. Let the embers burn. Nobody would blame you.'),
          say('reeve', '[angry]I would.'),
          say('mordrath', '[calm]Pity. We hoped you were tired.'),
        ],
        after: [
          say('baelthar', '[whisper]Tired yet?'),
          say('reeve', '[calm]No.'),
        ] },
      { name: 'The Book Opens', letter: letter(['Reeve, there is a book in the north, older than my crown. My scribes say it holds the Rule that binds the dark. Bring it to me, and bring it unharmed.'], true),
        dialogue: [
          say('baelthar', '[whisper]Do not open it.'),
          say('mordrath', '[angry]Leave it where it sleeps.'),
          say('reeve', '[question]You are afraid of a book?'),
          say('baelthar', '[calm]Of what it says.'),
        ],
        after: [
          say('reeve', '[calm]"Whispers are permitted. Hands are not." [question]It binds them, not us. Their hands are tied, and ours are free?'),
          say('baelthar', '[whisper]Free to do what, Reeve?'),
          say('mordrath', '[angry]Free to be used.'),
          say('reeve', '[calm]Free to say no.'),
        ] },
      { name: 'Outposts I', rivals: 1, ai: 30, races: { 2: 'demon' }, end: 'hq',
        letter: letter(['Reeve, the road to Onden is held by outposts. The first stands where the old road meets the hills. Take it, and the rest will follow.'], true),
        dialogue: [
          say('reeve', '[calm]My roads brought their wagons. Now they will bring mine.'),
          say('mordrath', '[angry]Clever. [whisper]Careful.'),
        ] },
      { name: 'Outposts II', rivals: 1, ai: 34, races: { 2: 'demon' }, end: 'hq',
        letter: letter(['Reeve, the second outpost is stronger than the first. I have no more soldiers to send, only my thanks, and you have those already.'], true),
        dialogue: [
          say('baelthar', '[whisper]Stop at the second outpost, Reeve. Keep your village. We will forget you.'),
          say('reeve', '[calm]You never forgot me. You used me.'),
          say('baelthar', '[sad]A pity. We were fond of your wagons.'),
        ] },
      { name: 'Outposts III', rivals: 1, ai: 38, races: { 2: 'demon' }, end: 'hq',
        letter: letter(['Reeve, the third outpost is the last before the fortress. After it there is only Onden. I wish I could stand beside you.'], true),
        dialogue: [
          say('mordrath', '[angry]Three outposts. Do you mean to reach Onden?'),
          say('reeve', '[calm]I mean to reach home.'),
          say('baelthar', '[scared]He is listening, you know. He hears all of this.'),
        ],
        after: [
          say('onden', '[whisper]Come then, Reeve. Come to my door.'),
        ] },
      { name: 'The Outer Fortress', rivals: 1, ai: 45, races: { 2: 'demon' }, end: 'hq',
        letter: letter(['Reeve, the outer fortress guards the way to him. If it holds, Farael falls. I have no counsellors left, only you.'], true),
        dialogue: [
          say('mordrath', '[angry]This fortress has never fallen.'),
          say('reeve', '[calm]Then it is overdue.'),
          say('baelthar', '[whisper]Our master is not patient. Neither are we.'),
          say('reeve', '[calm]Good.'),
        ],
        after: [
          say('mordrath', '[angry]Fool! You have opened his door.'),
          say('baelthar', '[scared]He knows your name now.'),
        ] },
      { name: 'The Vault', rivals: 1, ai: 50, races: { 2: 'demon' }, end: 'hq',
        letter: letter(['Reeve, my scribes say the vault holds the Seal that keeps the Rule. If Onden takes it, the Rule dies with it. Take it first.'], true),
        dialogue: [
          say('reeve', '[question]A vault. What is inside that he fears to lose?'),
          say('baelthar', '[whisper]The Seal. The Rule holds because the Seal holds.'),
          say('mordrath', '[angry]Do not touch it!'),
          say('reeve', '[calm]You are afraid, I think. [happy]Good.'),
        ],
        after: [
          say('reeve', '[calm]The Seal is warm, like something alive. It will not leave my hand.'),
        ] },
      { name: 'The March', rivals: 1, ai: 55, end: 'hq',
        letter: letter(['Reeve, Numbjar and Vedahast have joined their armies and march on you. I have written to both, and neither has answered. I am so sorry.'], true),
        dialogue: [
          say('reeve', '[sad]They march on me as though I had burned their homes. [calm]I took their borders. I can hardly blame them.'),
          say('baelthar', '[whisper]Run, then. Or stay and be hated.'),
          say('reeve', '[question]Can I tell them who truly lit the fires?'),
          say('mordrath', '[angry]They will not listen. Frightened people never do.'),
          say('reeve', '[calm]Then I will hold the road until they are ready to.'),
        ],
        after: [
          say('reeve', '[sad]I did not want to win this. I wanted to be heard.'),
        ] },
      { name: 'Onden', rivals: 1, ai: 70, races: { 2: 'demon' }, end: 'hq', meteorProof: ['knight'],
        letter: letter(['Reeve, this is the last letter. Whatever happens, you have already done more than any king could ask. Go home when it is done.'], true),
        dialogue: [
          say('onden', '[calm]Come, Reeve. Let us see what a quiet life is worth.'),
          say('reeve', '[calm]More than your whispers.'),
          say('onden', '[whisper]Whispers are permitted. [angry]Hands are not. [calm]Yet here you stand, with mine bound and yours so very busy.'),
          say('reeve', '[calm]Busy is all I have ever been. [angry]It is enough.'),
        ],
        events: [
          { at: 90, weather: 'storm', tell: [say('onden', '[whisper]A storm owes nothing to the Rule. It is only weather.')] },
          { at: 300, tornado: 6 },
          { at: 540, super: 8 },
          { at: 780, meteors: 60, tell: [say('onden', '[angry]The stars fall where they will.')] },
        ],
        after: [
          say('onden', '[sad]So the Rule holds. [whisper]How tiresome.'),
          say('reeve', '[calm]It always did.'),
        ] },
    ],

    epilogue: [
      'The dark was bound by an old Rule, and the Rule held: it never commanded, it only whispered.',
      'The kingdoms learned the truth too late to thank you, and you went home to your village.',
    ],
  };
})(window.CityBuilder);
