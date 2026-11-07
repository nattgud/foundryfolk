/* Storymode, "The Gentle Turning": berättelsen som data. Allt spelaren läser skrivs här som engelsk text, och texten är själva
   översättningsnyckeln (se lang/lang.js): när ett kapitel är klart läggs dess texter in i alla språkfiler, precis som övriga texter.
   Text som ska översättas får alltså inte byggas ihop av delar (bynamnet är en variabel: {village}).

   Texterna är det godkända manuset. De översätts till de andra språken sist, när alla texter är slutgiltiga.

   seed:      körningsfröet för alla kapitel: samma kapitel ger alltid samma karta (se Levels.storyInfo)
   speakers:  vem som talar i en dialog: { id: { name, color, voice, narrator } } (narrator: true = berättaren: ingen namnrad, kursiv text)
   unlock:    byggnad -> kapitlet den blir byggbar i (byggnader som inte står här finns från kapitel 1). Storyn har egen tabell.
   prologue, epilogue: stycken som visas i läsvyn.
   music:     egen musik i stället för den vanliga: { prologue, epilogue } är en fil eller en lista (null = den vanliga musiken)
               och spelas medan prologen och epilogen läses. Ett kapitel kan ha eget music-fält som ersätter standardmusiken i kapitlet (se chapters).
   chapters:  ett per bana, i ordning. Alla fält utom name är valfria:
     name         kapitlets namn
     music        egen musik i kapitlet: en fil eller lista (lugn musik), t.ex. 'music/chapter9.mp3', eller { calm, battle, disaster } med en lista per läge (false = det läget har ingen musik: { battle: false } stänger av stridsmusiken i kapitlet, den lugna fortsätter). Fungerar som standardmusiken (blandad ordning, strid och katastrof byter låt); ett läge som inte anges behåller standardmusiken
     letter       { lines: [stycken], throne, greeting } från kungen, visas före banan (throne: signaturen är "In service of the throne"; greeting: egen hälsning i stället för standardens)
     dialogue     [{ who, text }] tryckt dialog som visas efter brevet
     lifted       dialog som visas när dimman lyfter (Eye of Shades förstörd)
     after        dialog som visas när kapitlet är klart
     dialogMusic  { intro, events, lifted, after }: egen musik medan den delens dialog läses (en fil eller lista, spelas i loop, spelets musik tystas så länge). intro = brev och inledande dialog,
                  events = händelsernas dialoger (tell), lifted = när dimman lyft, after = efter banan. En del som saknas, eller null, låter spelets musik fortsätta. Exempel: dialogMusic: { after: 'music/sorg.mp3' }
     goals        målen som på banorna ({ type, resource | id, amount }), men { resource, more: n } betyder n fler än man börjar med.
                  Utan goals räknas målen fram som på en vanlig bana. Med end: 'hq' är fiendens HQ det enda målet.
     rivals, ai   antal fiender (0 om inget anges) och deras styrka som en banas nummer; races: { spelare: ras } (se Players.race)
     start        { buildings: [...] }: färdiga byggnader vid starten (inga bärare). Varje post är { type, dx, dy } (exakt plats, rutor från HQ)
                  eller bara ett id (automatisk plats runt HQ). Placera dem i spelet och kör CityBuilder.Story.layout() i konsolen för färdiga rader.
     eye, fog     eye: true = Eye of Shades står närmare fienden än något annat, eye: { reach } = längre eller kortare dit (andel av avståndet mellan baserna, annars 0,3), eye: { dx, dy } = på en bestämd plats; fog: konstant dimma tills den förstörs
     end          'hq': kapitlet är klart när fiendens HQ förstörs
     waves        { from, every (sekunder), size: [första, +1 var N:e våg, högst (utelämnas: ingen gräns)], kinds: [soldattyper i turordning], maxAlive (valfritt), until: 'fog', spawn: [[dx, dy], ...] (valfritt: platser i rutor från spelarens HQ där soldaterna dyker upp, t.ex. [[50, 0], [-50, 0]]; utan spawn vid fiendens HQ) }: kapitlets egna anfallsvågor från
                  fiendens HQ mot spelarens, oberoende av datorns vanliga anfallsregler (ai.js). until: 'fog' = tills dimman lyft, annars tills kapitlet är klart
     events       [{ at (sekunder), goal, when, tell: dialog | give: { vara: antal, ... } (läggs i spelarens huvudlager) | music: byter musiken (samma form som kapitlets music, och läggs läge för läge ovanpå kapitlets och tidigare händelsers; null = tillbaka till standardmusiken) | weather: 'storm' | tornado: radie | super: radie | meteors: sekunder }]. En händelse sker en gång, när alla
                  villkor den har slår till. at: sekunder in i kapitlet. goal: målet med det numret (1 = första målet) är klart. whileFog: true = bara så länge dimman ligger (en händelse som kommer för sent hoppas över). when: { resource, amount } (har så mycket av en vara)
                  eller { type: 'build', id, amount } (har byggt så många), samma slag som goals. { goal: n, left: k } = mål nummer n har högst k kvar (t.ex. näst sista yxan, utan att upprepa målets siffror); { resource, made: n } = n har tillverkats eller samlats i kapitlet, oavsett vart varan tog vägen (också direkt till nästa hus, utan att passera lagret); { resource, more: n } = lagret har n fler än man började med; { sees: 'rival' } = man har sett någon av fiendens byggnader (soldater räknas inte); { sees: 'soldier' } = en av datorns soldater syns (t.ex. en anfallsvåg, som inte har någon byggnad). T.ex. { goal: 1, tell: [say('albertha', 'Well done!')] }
     scenery      [[typ, x, y, bredd, höjd, lager], ...] kulisser på exakta rutor (bredd, höjd och lager valfria, null/false hoppar över: fyller en rektangel; lager 0 är standard, högre ritas ovanpå, negativa under). Bara bilder, ingen byggnad: går att gå över, men inget kan byggas där.
                  Typerna står i sceneryTypes. Spelarens bas ligger på 0, 0. Exempel: scenery: [['ruin', 4, -3], ['ruin', 5, -3, 3, 2], ['fire', 6, -2, null, null, 1]]
     meteorProof  enhetstyper som meteorer inte skadar */
(function (CityBuilder) {
  'use strict';

  const letter = (lines, throne, greeting) => ({ lines, throne: !!throne, greeting });
  const say = (who, text) => ({ who, text });
  const more = (resource, n) => ({ resource, more: n });

  CityBuilder.Config.story = {
		title: "The Gentle Turning",
		village: "Thunebrook",
		seed: 1861,
		music: { prologue: null, epilogue: null }, // t.ex. prologue: 'music/prologue.mp3'
		speakers: {
			// voice: { pitch ×, dark (lowpass ×), stretch (längre ljud, långsammare text), slide (tonen sjunker), detune (cent, en andra ostämd röst) }
			reeve: { name: "You", color: "#7572ff" },
			pipwick: {
				name: "Pipwick",
				color: "#79ddd8",
				voice: { pitch: 0.8 },
			},
			thordram: {
				name: "Thordram",
				color: "#5ae655",
				voice: { pitch: 0.75 },
			},
			albertha: {
				name: "Albertha",
				color: "#e266ab",
				voice: { pitch: 1.25 },
			},
			mordrath: {
				name: "Mordrath",
				color: "#6bb132",
				voice: {
					pitch: 0.6,
					dark: 0.65,
					stretch: 2.4,
					slide: 0.22,
					detune: -45,
				},
			},
			baelthar: {
				name: "Baelthar",
				color: "#9e1460",
				voice: {
					pitch: 0.8,
					dark: 0.8,
					stretch: 2.4,
					slide: 0.22,
					detune: 70,
				},
			},
			onden: {
				name: "Onden",
				color: "#ca2a18",
				voice: {
					pitch: 0.42,
					dark: 0.5,
					stretch: 3.2,
					slide: 0.3,
					detune: -60,
				},
			},
			narrator: {
				name: "",
				color: "",
				narrator: true,
				voice: { pitch: 0.9, dark: 0.85 },
			},
		},
		// Rösten i dialogerna (systems/voice.js). Ett [tonläge] i en replik, t.ex. '[angry]Nej!', byter tonläge från den platsen (tills nästa tagg).
		// wave, pitch (Hz), vary (% slumpad variation), every (ljud var N:e tecken), dur (ms), volume (%), speed (ms per tecken), cutoff (Hz), byLetter (tonhöjd följer bokstaven 0/1; med syllables följer den vokalen: i ljusast, e, a, o, u mörkast),
		// noise (% luft), voice (% röstklang), vibrato (%), syllables (1 = ett ljud per vokalgrupp, 0 = ett ljud var 'every':e bokstav; bara bokstäver låter i båda). Tonläge: pitch ×, vary ×, speed ×, volume ×, slope (tonhöjdens lutning över meningen).
		voice: {
			wave: "sawtooth",
			pitch: 314,
			vary: 31,
			every: 2,
			syllables: 1,
			dur: 102,
			volume: 40,
			speed: 35,
			cutoff: 3450,
			byLetter: 1,
			noise: 23,
			voice: 100,
			vibrato: 97,
			moods: {
				calm: { pitch: 1, vary: 1, speed: 1.15, volume: 1, slope: 0 },
				happy: {
					pitch: 1.2,
					vary: 1.4,
					speed: 0.9,
					volume: 1.1,
					slope: 0.1,
				},
				angry: {
					pitch: 0.85,
					vary: 0.8,
					speed: 1.6,
					volume: 1.75,
					slope: -0.1,
				},
				sad: {
					pitch: 1,
					vary: 0.35,
					speed: 2,
					volume: 0.65,
					slope: -0.25,
				},
				question: {
					pitch: 1,
					vary: 1,
					speed: 1,
					volume: 1,
					slope: 0.4,
				},
				whisper: {
					pitch: 1.05,
					vary: 0.2,
					speed: 2,
					volume: 0.45,
					slope: 0,
				},
				confused: {
					pitch: 1,
					vary: 1.6,
					speed: 1.1,
					volume: 0.9,
					slope: 0.3,
				},
				scared: {
					pitch: 1.3,
					vary: 2.95,
					speed: 0.8,
					volume: 1,
					slope: 0.15,
				},
				slow: { pitch: 1, vary: 1, speed: 3, volume: 0.8, slope: 0 },
				yell: {
					pitch: 1.1,
					vary: 1,
					speed: 2.4,
					volume: 2,
					slope: 0.0,
				},
			},
		},
		greeting: "To the Reeve of {village},",
		signature: {
			realm: "In service of the realm",
			throne: "In service of the throne",
			name: "Maegnius, King of Farael",
		},
		// Bakgrunden bakom dialogerna och styckena (images/story/<namn>.jpg, 1376x768). default gäller alla kapitel utan egen; chapters: { kapitelnummer: namn }.
		// Ett kapitel kan också ha scene: 'namn' i sin egen data. Bilden kan bytas under kapitlet: { intro, events, lifted, after } i stället för ett namn (intro = brev och inledande dialog, events = händelserna, lifted = när dimman lyft, after = efter banan), och en händelse kan ha eget scene: 'namn'. Utan bild (scenes saknas) behålls den vanliga mörka rutan.
		scenes: {
			default: "meadow",
			chapters: {
				11: { events: "siege", lifted: "siege", after: "siege" },
				12: "siege",
				15: "demon",
				16: "demon",
				17: "demon",
				18: "demon",
				19: "demon",
				20: "demon",
				21: "demon",
			},
		},

		// Kulisser (kapitlets scenery). Bilden är images/scenery/<typ>.png, eller <typ>1.png, <typ>2.png ... om variants > 1 (en slumpas per ruta). frames > 1: bilden är en remsa
		// med lika många rutor bredvid varandra som spelas upp fps gånger i sekunden. light: lyser upp natten (radie i rutor). Saknas bilden ritas en enkel reserv.
		sceneryTypes: {
			ruin: { variants: 5 },
			fire: { frames: 16, fps: 8, light: 3 },
		},

		unlock: {
			woodcutter: 1,
			quarry: 1,
			sawmill: 1,
			warehouse: 1,
			berry_gatherer: 2,
			gatherer: 2,
			well: 2,
			hunters_cottage: 2,
			herb_gatherer: 2,
			fishing_hut: 2,
			clay_pit: 3,
			charcoal_burner: 3,
			farm: 3,
			planter: 3,
			brickworks: 3,
			watchtower: 3,
			mill: 4,
			bakery: 4,
			coal_mine: 4,
			mine: 4,
			iron_mine: 4,
			iron_smelter: 4,
			toolsmith: 4,
			rock_crusher: 4,
			apple_gatherer: 5,
			mushroom_gatherer: 5,
			sand_collector: 5,
			kitchen: 5,
			gold_mine: 5,
			gold_smelter: 5,
			mint: 5,
			copper_mine: 5,
			tin_mine: 5,
			copper_smelter: 5,
			tin_smelter: 5,
			bronze_foundry: 5,
			silver_mine: 5,
			silver_smelter: 5,
			leatherworker: 6,
			alchemist: 6,
			large_warehouse: 6,
			limestone_quarry: 6,
			crystal_gatherer: 6,
			glassworks: 6,
			salt_mine: 6,
			enchanter: 7,
			moonstone_gatherer: 7,
			relic_hunter: 7,
			fallen_star_collector: 7,
			market: 8,
			great_depot: 8,
			steelworks: 8,
			wall: 9,
			guard_tower: 9,
			bowyer: 9,
			stables: 9,
			garrison: 9,
			swordsmith: 10,
			armorsmith: 10,
			sulfur_mine: 13,
			gemstone_mine: 13,
			shrine: 14,
			monument: 999, // vinstbyggnaden i Free Realm används inte i storyn
		},

		prologue: [
			"Farael is a kingdom of farms and forests, of quiet villages and old roads. Its king, Maegnius, is a just man, loved by his people.",
			"Magic runs through the land, in its springs, its stones and the hands of those who learn it.",
			"But the dark is older still. It has stirred since before the first village was raised, patient and hungry.",
			"It is bound by an old Rule. None remember who made it.",
			"The dark may whisper. It may tempt, and it may test. But it may never command.",
			"Whispers are permitted. Hands are not.",
			"There are those who believe the Rule cannot be broken. Others believe it already has.",
			"You are the Reeve of a small village at the edge of the realm. No hero, no soldier, only someone with good land, honest work and a quiet life you mean to keep.",
			"Then a letter arrives.",
			"Your closest companion in the village is Pipwick, a former royal roadkeeper. He knows the roads of Farael better than anyone, though his inventions are not always quite as reliable.",
		],
		// Efter prologens stycken (när brevet kommit)
		prologueDialogue: [
			say("pipwick", "[happy]A letter from the king! How exciting!"),
			say("reeve", "You haven't even read it."),
			say(
				"pipwick",
				"Important things always have seals. Terrible things too, unfortunately.",
			),
			say("reeve", "Do you ever have anything useful to say?"),
			say("pipwick", "Constantly. People are simply too busy to notice."),
		],
		//  Voice emotions: calm, happy, angry, sad, question, whisper, scared
		chapters: [
			// 1
			{
				name: "The Summons",
				goals: [more("wood", 30), more("stone", 30)],
				letter: letter([
					"Demons are attacking Farael and burning our border villages. I cannot ask you to take up a sword, only an axe.",
					"Send me thirty timber and thirty stone, quickly. Every contribution matters.",
				]),
				dialogue: [
					say(
						"pipwick",
						"[happy]Thirty timber and thirty stone. Quite a delivery!",
					),
					say("reeve", "The king needs them to defend the border."),
					say(
						"pipwick",
						"Then we'll get them there. I know every road to the border camps.",
					),
					say("reeve", "I thought you retired."),
					say(
						"pipwick",
						"Roads don't stop needing attention just because a man stops getting paid.",
					),
				],
			},
			// 2
			{
				name: "Meals for Many",
				start: {
					buildings: [
						{ type: "woodcutter", dx: -2, dy: -3 },
						{ type: "sawmill", dx: -1, dy: -2 },
						{ type: "quarry", dx: 3, dy: 4 },
					],
				},
				goals: [more("berries", 25), more("fish", 25)],
				letter: letter([
					"My thanks. Your carriers have reached the camps, and the men speak your name.",
					"Now they need food. Send berries and fish, as much as you can find. A hungry soldier is of little use to anyone.",
				]),
				dialogue: [
					say(
						"pipwick",
						"[happy]Food for the soldiers! A job I can appreciate.",
					),
					say("reeve", "You seem unusually pleased."),
					say(
						"pipwick",
						"Hungry soldiers complain. And they usually complain to whoever is in charge.",
					),
					say("reeve", "You mean me?"),
					say("pipwick", "Precisely. I'm protecting you."),
				],
			},
			// 3
			{
				name: "Walls of Brick",
				start: {
					buildings: [
						{ type: "quarry", dx: 6, dy: -1 },
						{ type: "hunters_cottage", dx: 2, dy: 2 },
						{ type: "sawmill", dx: -1, dy: 3 },
						{ type: "berry_gatherer", dx: 4, dy: 3 },
						{ type: "woodcutter", dx: -1, dy: 5 },
					],
				},
				goals: [more("brick", 25), more("plank", 25)],
				letter: letter([
					"The camps are fed, thanks to you. The passes must now be walled before the demons return.",
					"Could you send brick and planks? I know I ask a great deal of you, but the safety of our people depends on it.",
				]),
				dialogue: [
					say(
						"pipwick",
						"[happy]Walls! Finally, something that stays where you put it.",
					),
					say("reeve", "You sound experienced."),
					say("pipwick", "I once built a bridge that moved."),
					say("reeve", "Bridges aren't supposed to move."),
					say("pipwick", "That's what everyone kept telling me."),
				],
			},
			// 4
			{
				name: "The Iron Debt",
				start: {
					buildings: [
						{ type: "quarry", dx: 4, dy: 4 },
						{ type: "sawmill", dx: 2, dy: 7 },
						{ type: "woodcutter", dx: 4, dy: 8 },
					],
				},
				goals: [more("iron", 20), more("axe", 6)],
				letter: letter(
					[
						"War is costly. The smiths need you to deliver iron and tools.",
						"My counsellors, Thordram and Albertha, will help you see to it. They have my full confidence.",
					],
					true,
				),
				dialogue: [
					say(
						"pipwick",
						"[happy]Iron and tools! I know a thing or two about iron.",
					),
					say("reeve", "I thought you worked with roads."),
					say(
						"pipwick",
						"Roads need tools. Tools need iron. Simple enough.",
					),
					say(
						"thordram",
						"[calm]Reeve. Iron and tools. The king requires both.",
					),
					say(
						"albertha",
						"[happy]And we are here to help you deliver them!",
					),
					say(
						"pipwick",
						"[slow]Oh. [sad]I wasn't told anyone else would be helping.",
					),
					say("thordram", "You were not required."),
					say("pipwick", "[confused]Not required?"),
					say(
						"albertha",
						"[happy]You've done wonderfully. Leave the rest to us!",
					),
					say("reeve", "Are you leaving, Pipwick?"),
					say(
						"pipwick",
						"Apparently. The counsellors have everything under control.",
					),
					say("thordram", "We do."),
					say(
						"pipwick",
						"Right, then. If you need me, you know where to find me.",
					),
					say("reeve", "Take care, Pipwick."),
					say(
						"pipwick",
						"You too. Don't let them work you too hard.",
					),
					say("narrator", "Pipwick leaves."),
					say(
						"thordram",
						"Let us get to it! We will help. But you will need to do the work, of course.",
					),
					say(
						"albertha",
						"[happy]Naturally. We wouldn't dream of taking that pleasure away from you.",
					),
					say("reeve", "How generous."),
					say("thordram", "We try to be efficient."),
					say(
						"albertha",
						"[happy]He means we are very pleased to meet you!",
					),
				],
				events: [
					{
						when: { resource: "iron_ore", made: 1 },
						tell: [
							say(
								"thordram",
								"Now you got iron ore. Smelt it with charcoal and you will have an iron bar",
							),
							say("albertha", "[happy]Just what the king needs!"),
						],
					},
					{
						when: { resource: "iron", made: 1 },
						tell: [
							say(
								"albertha",
								"[happy]There you go! Your first iron bar!",
							),
							say(
								"thordram",
								"Keep it up. We'll be done before you know it.",
							),
							say("albertha", "[happy]Although..."),
							say(
								"thordram",
								"Yes. Make sure to make a lot of it. [sad]Some needs to go to make axes.",
							),
						],
					},
					{
						when: { goal: 2, left: 1 },
						tell: [
							say("thordram", "Just one more axe to go."),
							say("albertha", "[happy]Great!"),
						],
					},
				],
				after: [
					say("thordram", "And that was that."),
					say("albertha", "[happy]Easy!"),
					say("thordram", "It could've been done faster."),
					say("albertha", "[happy]This was fast!"),
					say("thordram", "Sufficiently."),
				],
			},
			// 5
			{
				name: "Gold for the Crown",
				start: {
					buildings: [
						{ type: "bakery", dx: 2, dy: -4 },
						{ type: "mill", dx: 2, dy: -3 },
						{ type: "woodcutter", dx: -3, dy: -2 },
						{ type: "hunters_cottage", dx: 0, dy: -2 },
						{ type: "farm", dx: 2, dy: -2 },
						{ type: "quarry", dx: 5, dy: -1 },
						{ type: "well", dx: -9, dy: 0 },
						{ type: "fishing_hut", dx: -9, dy: 1 },
						{ type: "woodcutter", dx: -3, dy: 2 },
						{ type: "sawmill", dx: -1, dy: 2 },
					],
				},
				eye: true,
				goals: [more("gold", 12), more("coins", 40)],
				letter: letter(
					[
						"The crown must pay its soldiers. Gold, and coin.",
						"Find and produce enough for us to finance this war.",
						"My counsellors will place an Eye of Shades at the border. It will watch the surrounding lands and shield your village from the demons.",
						"You need only continue your work.",
					],
					true,
				),
				dialogue: [
					say(
						"albertha",
						"[happy]The Eye watches the border so that you need not. Is that not a comfort?",
					),
					say(
						"thordram",
						"[calm]It watches. What it sees, it keeps.",
					),
					say("reeve", "[question]Does it see everything?"),
					say("thordram", "That is the intention."),
					say(
						"albertha",
						"[happy]Don't worry, Reeve. It is quite friendly.",
					),
					say("reeve", "It's a stone eye."),
					say("albertha", "[happy]Yes. A very polite one."),
					say("thordram", "[angry]Gold. We are getting distracted."),
				],
			},
			// 6
			{
				name: "Draughts of Mending",
				start: {
					buildings: [
						{ type: "quarry", dx: 3, dy: -6 },
						{ type: "woodcutter", dx: 7, dy: -6 },
						{ type: "woodcutter", dx: 7, dy: -1 },
						{ type: "salt_mine", dx: -5, dy: 0 },
						{ type: "sawmill", dx: 2, dy: 0 },
						{ type: "farm", dx: -3, dy: 1 },
						{ type: "mill", dx: -5, dy: 2 },
						{ type: "mill", dx: -3, dy: 2 },
						{ type: "bakery", dx: -1, dy: 2 },
						{ type: "kitchen", dx: 1, dy: 2 },
						{ type: "hunters_cottage", dx: 3, dy: 2 },
						{ type: "herb_gatherer", dx: 7, dy: 2 },
						{ type: "well", dx: -1, dy: 8 },
						{ type: "well", dx: 0, dy: 8 },
						{ type: "fishing_hut", dx: 1, dy: 9 },
					],
				},
				eye: true,
				goals: [more("potion", 8), more("leather_armor", 6)],
				letter: letter(
					[
						"The first soldiers are coming home from the border, wounded and worn.",
						"Send draughts to mend them, and leather armour so that fewer need mending.",
						"Albertha says her herbs and crystals will do more than any surgeon. I pray she is right.",
					],
					true,
				),
				dialogue: [
					say(
						"albertha",
						"[happy]Draughts! How lovely. Every soldier ought to sleep soundly.",
					),
					say(
						"thordram",
						"[calm]A man who sleeps doesn't ask questions.",
					),
					say(
						"albertha",
						"[happy]Thordram means they will be well rested!",
					),
					say("thordram", "I mean what I mean."),
					say(
						"reeve",
						"[question]Is there anything in these draughts I should know about?",
					),
					say("albertha", "[happy]Only honey and rosemary, Reeve."),
					say(
						"thordram",
						"And a little something to keep the fear away.",
					),
					say(
						"reeve",
						"That sounds suspiciously like something I should know about.",
					),
					say(
						"albertha",
						"[calm]Fear is terribly inconvenient. It makes people hesitate.",
					),
				],
				events: [
					{
						when: { resource: "potion", made: 1 },
						tell: [
							say(
								"albertha",
								"[happy]There! The first batch is ready. They should be feeling much better already.",
							),
							say("reeve", "[question]Have you tested them?"),
							say("albertha", "[happy]Of course!"),
							say("reeve", "[question]On whom?"),
							say(
								"albertha",
								"[happy]Oh, don't look so concerned. I am still here, aren't I?",
							),
							say("thordram", "That proves very little."),
						],
					},
				],
				after: [
					say(
						"thordram",
						"The soldiers drank it gladly. Every one of them.",
					),
					say("albertha", "[happy]Such good appetites!"),
					say("thordram", "None asked what was in it."),
					say("albertha", "[happy]Isn't that lovely?"),
					say("reeve", "[sad]I'm beginning to think it is not."),
				],
			},
			// 7
			{
				name: "Relics and Starlight",
				start: {
					buildings: [
						{ type: "clay_pit", dx: -2, dy: -8 },
						{ type: "brickworks", dx: -3, dy: -7 },
						{ type: "quarry", dx: 2, dy: -4 },
						{ type: "woodcutter", dx: -2, dy: -3 },
						{ type: "herb_gatherer", dx: 10, dy: -2 },
						{ type: "kitchen", dx: -9, dy: -1 },
						{ type: "bakery", dx: -8, dy: -1 },
						{ type: "mill", dx: -7, dy: -1 },
						{ type: "farm", dx: -6, dy: -1 },
						{ type: "hunters_cottage", dx: -2, dy: -1 },
						{ type: "warehouse", dx: -6, dy: 1 },
						{ type: "sawmill", dx: -1, dy: 2 },
						{ type: "woodcutter", dx: -2, dy: 3 },
						{ type: "fishing_hut", dx: -8, dy: 4 },
						{ type: "well", dx: -7, dy: 5 },
						{ type: "berry_gatherer", dx: 2, dy: 6 },
					],
				},
				eye: true,
				goals: [more("ancient_relic", 2), more("fallen_star", 2)],
				letter: letter(
					[
						"My counsellors speak of relics and fallen stars, old magic that might turn the war.",
						"Find what you can. I do not pretend to understand all of it, but I trust those who do.",
					],
					true,
				),
				dialogue: [
					say(
						"thordram",
						"[calm]Relics remember. It is their only fault.",
					),
					say("reeve", "[question]Remember what?"),
					say(
						"albertha",
						"[happy]Oh, everything! Who held them, who lost them, who wept over them.",
					),
					say(
						"thordram",
						"Bring them whole. A chipped relic is a poor memory.",
					),
					say(
						"albertha",
						"[happy]And do not drop the stars, dear. They are still warm.",
					),
					say(
						"reeve",
						"[question]How can a star fall without burning everything?",
					),
					say(
						"albertha",
						"[happy]Oh, magic. It does all sorts of things.",
					),
					say("thordram", "An explanation of remarkable precision."),
				],
				events: [
					{
						when: { resource: "fallen_star", made: 1 },
						tell: [
							say("albertha", "[happy]Oh! You found one!"),
							say("reeve", "It is still warm."),
							say("albertha", "[happy]I told you!"),
							say("thordram", "Don't hold it for too long."),
							say("reeve", "[question]Why?"),
							say("thordram", "Because I said so."),
							say("albertha", "He means it may burn you."),
							say(
								"reeve",
								"That would have been useful to know earlier.",
							),
							say("albertha", "[happy]I thought you knew!"),
						],
					},
				],
				after: [
					say("thordram", "Everything accounted for?"),
					say(
						"albertha",
						"[happy]Every relic, every star. A splendid collection!",
					),
					say("thordram", "The crown will be pleased."),
					say("reeve", "I hope someone knows what to do with them."),
					say("thordram", "Someone always does."),
				],
			},
			// 8
			{
				name: "The Roads Are Not Safe",
				start: {
					buildings: [
						{ type: "woodcutter", dx: -10, dy: -5 },
						{ type: "well", dx: 7, dy: -4 },
						{ type: "fishing_hut", dx: 8, dy: -3 },
						{ type: "sawmill", dx: -7, dy: -2 },
						{ type: "woodcutter", dx: -9, dy: -1 },
						{ type: "hunters_cottage", dx: 2, dy: 0 },
						{ type: "quarry", dx: -5, dy: 2 },
						{ type: "farm", dx: 0, dy: 2 },
						{ type: "mill", dx: 1, dy: 2 },
						{ type: "bakery", dx: 2, dy: 2 },
						{ type: "herb_gatherer", dx: -1, dy: 4 },
						{ type: "mill", dx: 1, dy: 6 },
						{ type: "salt_mine", dx: 1, dy: 8 },
						{ type: "warehouse", dx: 4, dy: 9 },
						{ type: "clay_pit", dx: 2, dy: 11 },
						{ type: "brickworks", dx: 3, dy: 11 },
					],
				},
				eye: true,
				goals: [
					{ key: "x:carriers", type: "carriers", amount: 120 },
					more("steel", 15),
				],
				letter: letter(
					[
						"The roads are not safe and the supplies do not arrive.",
						"Put more carriers on the roads, and keep the roads in good repair. I must have steel for the smiths before the cold sets in.",
						"The crown cannot afford further delays.",
					],
					true,
				),
				dialogue: [
					say(
						"thordram",
						"[calm]A hundred and twenty carriers. A road is only as long as the legs on it.",
					),
					say(
						"albertha",
						"[happy]And a village is only as strong as its roads! The more carriers, the better.",
					),
					say(
						"reeve",
						"[question]Why does the crown need so many of mine?",
					),
					say(
						"albertha",
						"[calm]To carry what must be carried, Reeve.",
					),
					say("thordram", "And to be somewhere, when it is needed."),
					say("reeve", "That explains almost nothing."),
					say("thordram", "Then we are making progress."),
				],
				events: [
					{
						when: { type: "carriers", amount: 90 },
						tell: [
							say(
								"albertha",
								"[happy]Look at them! So many little carriers!",
							),
							say("reeve", "They are not little."),
							say(
								"albertha",
								"[happy]Everything is little when you look at it from far away.",
							),
							say("thordram", "Remarkably profound."),
							say("albertha", "[happy]Thank you!"),
							say("thordram", "It was not praise."),
							say("reeve", "I had gathered that."),
						],
					},
				],
				after: [
					say(
						"albertha",
						"[happy]Such a lovely lot of carriers! Thordram, are they not lovely?",
					),
					say("thordram", "They will do."),
					say("albertha", "[happy]He likes them."),
					say("thordram", "I tolerate them."),
					say(
						"reeve",
						"That's practically affection, coming from you.",
					),
				],
			},
			// 9
			{
				name: "The Border at Numbjar",
				start: {
					buildings: [
						{ type: "quarry", dx: -1, dy: -6 },
						{ type: "clay_pit", dx: -9, dy: -2 },
						{ type: "brickworks", dx: -8, dy: -2 },
						{ type: "kitchen", dx: -6, dy: -2 },
						{ type: "sawmill", dx: 2, dy: -2 },
						{ type: "woodcutter", dx: 3, dy: -2 },
						{ type: "warehouse", dx: -10, dy: 0 },
						{ type: "bakery", dx: -6, dy: 0 },
						{ type: "mill", dx: -5, dy: 0 },
						{ type: "farm", dx: -4, dy: 0 },
						{ type: "hunters_cottage", dx: -2, dy: 0 },
						{ type: "charcoal_burner", dx: 2, dy: 0 },
						{ type: "woodcutter", dx: 3, dy: 2 },
						{ type: "herb_gatherer", dx: -4, dy: 4 },
						{ type: "sand_collector", dx: 7, dy: 4 },
						{ type: "fishing_hut", dx: 6, dy: 5 },
						{ type: "berry_gatherer", dx: -12, dy: 6 },
						{ type: "well", dx: 5, dy: 6 },
					],
				},
				eye: true,
				rivals: 1,
				ai: 12,
				end: "hq",
				letter: letter(
					[
						"Numbjar has closed its gates against us and will not say why.",
						"My counsellors believe they shelter the demons. We cannot allow such a threat to remain at our border.",
						"Take their border fortress in my name. The safety of Farael must come first.",
					],
					true,
				),
				dialogue: [
					say(
						"thordram",
						"[calm]Numbjar. The gate that does not open.",
					),
					say(
						"reeve",
						"[question]These are farmers like mine. Are we certain they shelter anything?",
					),
					say("albertha", "[happy]Certain? Oh, who is ever certain?"),
					say("reeve", "That's reassuring."),
					say("thordram", "The king has decided."),
					say(
						"reeve",
						"[question]Has anyone actually spoken to them?",
					),
					say(
						"albertha",
						"They have not answered the king's letters.",
					),
					say("reeve", "Perhaps they have a reason."),
					say("thordram", "Silence is an answer."),
					say(
						"reeve",
						"Silence is also what frightened people give.",
					),
					say(
						"albertha",
						"[happy]Then frighten them less, Reeve. Quickly.",
					),
					say("reeve", "That is not quite how that works."),
				],
				events: [
					{
						when: { sees: "rival" },
						tell: [
							say(
								"reeve",
								"They're not coming out. They're just holding the walls.",
							),
							say("thordram", "An effective strategy."),
							say("reeve", "They're defending their homes."),
							say("thordram", "As are you."),
							say("reeve", "I'm not the one attacking theirs."),
							say(
								"albertha",
								"[calm]Reeve, please. We all have difficult jobs today.",
							),
						],
					},
				],
				after: [
					say("thordram", "One gate. One more."),
					say(
						"albertha",
						"[happy]Do not look so grim, Reeve! The king will be pleased.",
					),
					say("reeve", "I hope he knows what he's pleased about."),
					say("thordram", "He knows better than us all."),
				],
			},
			// 10
			{
				name: "The Border at Vedahast",
				start: {
					buildings: [
						{ type: "guard_tower", dx: 19, dy: -8 },
						{ type: "quarry", dx: -1, dy: -7 },
						{ type: "clay_pit", dx: -7, dy: -5 },
						{ type: "quarry", dx: -4, dy: -5 },
						{ type: "brickworks", dx: -5, dy: -3 },
						{ type: "woodcutter", dx: 3, dy: -2 },
						{ type: "charcoal_burner", dx: -10, dy: -1 },
						{ type: "iron_mine", dx: -8, dy: -1 },
						{ type: "iron_smelter", dx: -10, dy: 0 },
						{ type: "kitchen", dx: -8, dy: 0 },
						{ type: "bakery", dx: -6, dy: 0 },
						{ type: "mill", dx: -5, dy: 0 },
						{ type: "farm", dx: -4, dy: 0 },
						{ type: "hunters_cottage", dx: -2, dy: 0 },
						{ type: "berry_gatherer", dx: -2, dy: 2 },
						{ type: "sawmill", dx: 1, dy: 2 },
						{ type: "woodcutter", dx: 2, dy: 3 },
						{ type: "herb_gatherer", dx: -8, dy: 4 },
						{ type: "woodcutter", dx: 12, dy: 4 },
						{ type: "mushroom_gatherer", dx: -3, dy: 8 },
						{ type: "well", dx: 0, dy: 9 },
						{ type: "fishing_hut", dx: -1, dy: 10 },
					],
				},
				eye: true,
				rivals: 1,
				ai: 16,
				end: "hq",
				letter: letter(
					[
						"Vedahast now. They have sent no answer to my letters, and silence is an answer.",
						"I am told it is the same dark that closed Numbjar. We cannot allow it to spread.",
						"I trust you understand the urgency. The crown has no time left for hesitation.",
					],
					true,
				),
				dialogue: [
					say(
						"albertha",
						"[happy]Vedahast! They never answered the kings call.",
					),
					say("reeve", "[question]What was their response?"),
					say("thordram", "Silence is an answer."),
					say("reeve", "[slow]Sounds familiar..."),
					say("thordram", "It remains true."),
					say("reeve", "I'm not too sure about that."),
					say("albertha", "[happy]That's okay. We're sure for you."),
					say(
						"thordram",
						"[angry]The king requires results, not comfort.",
					),
					say(
						"reeve",
						"If it is for the king and the safety of the realm I guess.",
					),
				],
				events: [
					{
						when: { sees: "rival" },
						tell: [
							say(
								"reeve",
								"Another village. Another gate. How many more?",
							),
							say("albertha", "Only what is necessary."),
							say("reeve", "[question]Necessary for whom?"),
							say("thordram", "That is not a useful question."),
							say("reeve", "It seems rather useful to me."),
							say(
								"albertha",
								"[calm]Perhaps we can discuss it when everyone is safe.",
							),
							say("reeve", "I guess. But then we'll talk!"),
						],
					},
				],
				after: [
					say("thordram", "Two borders. The king will sleep better."),
					say("albertha", "[happy]And so shall we."),
					say("reeve", "[sad]About that talk."),
					say("albertha", "Of course! After a good nights sleep."),
				],
			},
			// 11
			{
				name: "The Eye Closes",
				start: {
					buildings: [
						{ type: "wall", dx: -2, dy: -18 },
						{ type: "wall", dx: -1, dy: -18 },
						{ type: "wall", dx: 0, dy: -18 },
						{ type: "wall", dx: 1, dy: -18 },
						{ type: "wall", dx: 2, dy: -18 },
						{ type: "wall", dx: 4, dy: -18 },
						{ type: "wall", dx: 5, dy: -18 },
						{ type: "wall", dx: 6, dy: -18 },
						{ type: "wall", dx: 7, dy: -18 },
						{ type: "wall", dx: 8, dy: -18 },
						{ type: "wall", dx: -3, dy: -17 },
						{ type: "wall", dx: -2, dy: -17 },
						{ type: "wall", dx: 11, dy: -17 },
						{ type: "wall", dx: 12, dy: -17 },
						{ type: "wall", dx: 13, dy: -17 },
						{ type: "wall", dx: 14, dy: -17 },
						{ type: "watchtower", dx: -21, dy: -16 },
						{ type: "wall", dx: -3, dy: -16 },
						{ type: "wall", dx: 6, dy: -16 },
						{ type: "wall", dx: 14, dy: -16 },
						{ type: "wall", dx: 15, dy: -16 },
						{ type: "wall", dx: 16, dy: -16 },
						{ type: "wall", dx: 17, dy: -16 },
						{ type: "wall", dx: 18, dy: -16 },
						{ type: "wall", dx: -3, dy: -15 },
						{ type: "watchtower", dx: 0, dy: -15 },
						{ type: "wall", dx: 6, dy: -15 },
						{ type: "wall", dx: 18, dy: -15 },
						{ type: "wall", dx: -5, dy: -14 },
						{ type: "wall", dx: -4, dy: -14 },
						{ type: "wall", dx: -3, dy: -14 },
						{ type: "wall", dx: 6, dy: -14 },
						{ type: "wall", dx: 7, dy: -14 },
						{ type: "wall", dx: 8, dy: -14 },
						{ type: "wall", dx: 18, dy: -14 },
						{ type: "wall", dx: 19, dy: -14 },
						{ type: "wall", dx: -8, dy: -13 },
						{ type: "wall", dx: -7, dy: -13 },
						{ type: "wall", dx: -6, dy: -13 },
						{ type: "wall", dx: -5, dy: -13 },
						{ type: "wall", dx: 8, dy: -13 },
						{ type: "wall", dx: 20, dy: -13 },
						{ type: "wall", dx: 21, dy: -13 },
						{ type: "wall", dx: 22, dy: -13 },
						{ type: "wall", dx: 23, dy: -13 },
						{ type: "wall", dx: -12, dy: -12 },
						{ type: "wall", dx: -11, dy: -12 },
						{ type: "wall", dx: -10, dy: -12 },
						{ type: "wall", dx: -9, dy: -12 },
						{ type: "wall", dx: -8, dy: -12 },
						{ type: "wall", dx: -6, dy: -12 },
						{ type: "wall", dx: 7, dy: -12 },
						{ type: "wall", dx: 8, dy: -12 },
						{ type: "wall", dx: -12, dy: -11 },
						{ type: "wall", dx: -6, dy: -11 },
						{ type: "wall", dx: 7, dy: -11 },
						{ type: "wall", dx: -12, dy: -10 },
						{ type: "wall", dx: -6, dy: -10 },
						{ type: "wall", dx: 6, dy: -10 },
						{ type: "wall", dx: 7, dy: -10 },
						{ type: "wall", dx: 26, dy: -10 },
						{ type: "wall", dx: -21, dy: -9 },
						{ type: "wall", dx: -18, dy: -9 },
						{ type: "wall", dx: -17, dy: -9 },
						{ type: "wall", dx: -16, dy: -9 },
						{ type: "wall", dx: -15, dy: -9 },
						{ type: "wall", dx: -14, dy: -9 },
						{ type: "wall", dx: -13, dy: -9 },
						{ type: "wall", dx: -12, dy: -9 },
						{ type: "wall", dx: -6, dy: -9 },
						{ type: "wall", dx: 6, dy: -9 },
						{ type: "wall", dx: 26, dy: -9 },
						{ type: "wall", dx: -12, dy: -8 },
						{ type: "wall", dx: 4, dy: -8 },
						{ type: "wall", dx: 6, dy: -8 },
						{ type: "wall", dx: 26, dy: -8 },
						{ type: "wall", dx: -12, dy: -7 },
						{ type: "wall", dx: 4, dy: -7 },
						{ type: "wall", dx: 5, dy: -7 },
						{ type: "wall", dx: 6, dy: -7 },
						{ type: "wall", dx: 7, dy: -7 },
						{ type: "wall", dx: 8, dy: -7 },
						{ type: "wall", dx: 26, dy: -7 },
						{ type: "wall", dx: -25, dy: -6 },
						{ type: "wall", dx: -12, dy: -6 },
						{ type: "wall", dx: -7, dy: -6 },
						{ type: "wall", dx: 8, dy: -6 },
						{ type: "wall", dx: 26, dy: -6 },
						{ type: "wall", dx: -25, dy: -5 },
						{ type: "wall", dx: -12, dy: -5 },
						{ type: "wall", dx: -7, dy: -5 },
						{ type: "bakery", dx: -6, dy: -5 },
						{ type: "quarry", dx: -2, dy: -5 },
						{ type: "guard_tower", dx: 7, dy: -5 },
						{ type: "wall", dx: 8, dy: -5 },
						{ type: "wall", dx: 26, dy: -5 },
						{ type: "wall", dx: -25, dy: -4 },
						{ type: "wall", dx: -16, dy: -4 },
						{ type: "wall", dx: -15, dy: -4 },
						{ type: "wall", dx: -14, dy: -4 },
						{ type: "wall", dx: -13, dy: -4 },
						{ type: "wall", dx: -12, dy: -4 },
						{ type: "wall", dx: -7, dy: -4 },
						{ type: "mill", dx: -6, dy: -4 },
						{ type: "quarry", dx: 0, dy: -4 },
						{ type: "wall", dx: 8, dy: -4 },
						{ type: "guard_tower", dx: -27, dy: -3 },
						{ type: "guard_tower", dx: -23, dy: -3 },
						{ type: "wall", dx: -21, dy: -3 },
						{ type: "wall", dx: -20, dy: -3 },
						{ type: "wall", dx: -19, dy: -3 },
						{ type: "wall", dx: -16, dy: -3 },
						{ type: "wall", dx: -7, dy: -3 },
						{ type: "farm", dx: -6, dy: -3 },
						{ type: "wall", dx: 8, dy: -3 },
						{ type: "wall", dx: 27, dy: -3 },
						{ type: "wall", dx: 28, dy: -3 },
						{ type: "wall", dx: 29, dy: -3 },
						{ type: "wall", dx: -25, dy: -2 },
						{ type: "wall", dx: -19, dy: -2 },
						{ type: "wall", dx: -18, dy: -2 },
						{ type: "wall", dx: -17, dy: -2 },
						{ type: "wall", dx: -16, dy: -2 },
						{ type: "woodcutter", dx: -8, dy: -2 },
						{ type: "wall", dx: -7, dy: -2 },
						{ type: "wall", dx: 8, dy: -2 },
						{ type: "wall", dx: 9, dy: -2 },
						{ type: "wall", dx: 10, dy: -2 },
						{ type: "wall", dx: 11, dy: -2 },
						{ type: "wall", dx: 12, dy: -2 },
						{ type: "wall", dx: 14, dy: -2 },
						{ type: "wall", dx: 15, dy: -2 },
						{ type: "wall", dx: 16, dy: -2 },
						{ type: "wall", dx: 27, dy: -2 },
						{ type: "guard_tower", dx: 28, dy: -2 },
						{ type: "wall", dx: 29, dy: -2 },
						{ type: "wall", dx: -31, dy: -1 },
						{ type: "wall", dx: -30, dy: -1 },
						{ type: "wall", dx: -29, dy: -1 },
						{ type: "wall", dx: -28, dy: -1 },
						{ type: "wall", dx: -27, dy: -1 },
						{ type: "wall", dx: -26, dy: -1 },
						{ type: "wall", dx: -25, dy: -1 },
						{ type: "wall", dx: -24, dy: -1 },
						{ type: "wall", dx: -23, dy: -1 },
						{ type: "wall", dx: -22, dy: -1 },
						{ type: "wall", dx: -21, dy: -1 },
						{ type: "guard_tower", dx: -16, dy: -1 },
						{ type: "wall", dx: -7, dy: -1 },
						{ type: "guard_tower", dx: -6, dy: -1 },
						{ type: "iron_smelter", dx: 5, dy: -1 },
						{ type: "charcoal_burner", dx: 7, dy: -1 },
						{ type: "wall", dx: 12, dy: -1 },
						{ type: "wall", dx: 14, dy: -1 },
						{ type: "wall", dx: 16, dy: -1 },
						{ type: "wall", dx: 19, dy: -1 },
						{ type: "wall", dx: 20, dy: -1 },
						{ type: "wall", dx: 21, dy: -1 },
						{ type: "wall", dx: 22, dy: -1 },
						{ type: "wall", dx: 29, dy: -1 },
						{ type: "wall", dx: -32, dy: 0 },
						{ type: "wall", dx: -31, dy: 0 },
						{ type: "wall", dx: -21, dy: 0 },
						{ type: "wall", dx: -20, dy: 0 },
						{ type: "wall", dx: -19, dy: 0 },
						{ type: "wall", dx: 16, dy: 0 },
						{ type: "wall", dx: 17, dy: 0 },
						{ type: "wall", dx: 18, dy: 0 },
						{ type: "wall", dx: 19, dy: 0 },
						{ type: "wall", dx: 24, dy: 0 },
						{ type: "wall", dx: 29, dy: 0 },
						{ type: "wall", dx: -33, dy: 1 },
						{ type: "wall", dx: -32, dy: 1 },
						{ type: "guard_tower", dx: -23, dy: 1 },
						{ type: "wall", dx: -19, dy: 1 },
						{ type: "wall", dx: -18, dy: 1 },
						{ type: "wall", dx: -17, dy: 1 },
						{ type: "guard_tower", dx: -12, dy: 1 },
						{ type: "wall", dx: -8, dy: 1 },
						{ type: "wall", dx: -7, dy: 1 },
						{ type: "wall", dx: -6, dy: 1 },
						{ type: "wall", dx: -5, dy: 1 },
						{ type: "armorsmith", dx: -4, dy: 1 },
						{ type: "guard_tower", dx: 5, dy: 1 },
						{ type: "iron_mine", dx: 8, dy: 1 },
						{ type: "wall", dx: 25, dy: 1 },
						{ type: "wall", dx: 26, dy: 1 },
						{ type: "wall", dx: 29, dy: 1 },
						{ type: "wall", dx: -35, dy: 2 },
						{ type: "wall", dx: -34, dy: 2 },
						{ type: "wall", dx: -33, dy: 2 },
						{ type: "woodcutter", dx: -8, dy: 2 },
						{ type: "wall", dx: -5, dy: 2 },
						{ type: "sawmill", dx: 0, dy: 2 },
						{ type: "hunters_cottage", dx: 2, dy: 2 },
						{ type: "wall", dx: 3, dy: 2 },
						{ type: "wall", dx: 4, dy: 2 },
						{ type: "wall", dx: 5, dy: 2 },
						{ type: "guard_tower", dx: 32, dy: 2 },
						{ type: "wall", dx: -33, dy: 3 },
						{ type: "wall", dx: -5, dy: 3 },
						{ type: "leatherworker", dx: -4, dy: 3 },
						{ type: "bowyer", dx: -3, dy: 3 },
						{ type: "swordsmith", dx: -2, dy: 3 },
						{ type: "wall", dx: 2, dy: 3 },
						{ type: "wall", dx: 3, dy: 3 },
						{ type: "wall", dx: 5, dy: 3 },
						{ type: "guard_tower", dx: 16, dy: 3 },
						{ type: "wall", dx: 22, dy: 3 },
						{ type: "wall", dx: 23, dy: 3 },
						{ type: "wall", dx: 24, dy: 3 },
						{ type: "wall", dx: 29, dy: 3 },
						{ type: "wall", dx: 30, dy: 3 },
						{ type: "wall", dx: -5, dy: 4 },
						{ type: "wall", dx: -4, dy: 4 },
						{ type: "wall", dx: -3, dy: 4 },
						{ type: "wall", dx: -2, dy: 4 },
						{ type: "wall", dx: -1, dy: 4 },
						{ type: "wall", dx: 0, dy: 4 },
						{ type: "wall", dx: 1, dy: 4 },
						{ type: "wall", dx: 2, dy: 4 },
						{ type: "wall", dx: 5, dy: 4 },
						{ type: "wall", dx: 7, dy: 4 },
						{ type: "wall", dx: 8, dy: 4 },
						{ type: "wall", dx: 9, dy: 4 },
						{ type: "wall", dx: 10, dy: 4 },
						{ type: "wall", dx: 11, dy: 4 },
						{ type: "wall", dx: 12, dy: 4 },
						{ type: "wall", dx: 13, dy: 4 },
						{ type: "wall", dx: 14, dy: 4 },
						{ type: "guard_tower", dx: 21, dy: 4 },
						{ type: "guard_tower", dx: 28, dy: 4 },
						{ type: "wall", dx: 30, dy: 4 },
						{ type: "wall", dx: -35, dy: 5 },
						{ type: "woodcutter", dx: 2, dy: 5 },
						{ type: "wall", dx: 14, dy: 5 },
						{ type: "wall", dx: 29, dy: 5 },
						{ type: "wall", dx: 30, dy: 5 },
						{ type: "woodcutter", dx: -5, dy: 6 },
						{ type: "woodcutter", dx: 9, dy: 6 },
						{ type: "wall", dx: 14, dy: 6 },
						{ type: "wall", dx: 15, dy: 6 },
						{ type: "wall", dx: 16, dy: 6 },
						{ type: "wall", dx: 17, dy: 6 },
						{ type: "wall", dx: 18, dy: 6 },
						{ type: "wall", dx: 19, dy: 6 },
						{ type: "wall", dx: 20, dy: 6 },
						{ type: "wall", dx: 21, dy: 6 },
						{ type: "wall", dx: 29, dy: 6 },
						{ type: "wall", dx: 21, dy: 7 },
						{ type: "wall", dx: 22, dy: 7 },
						{ type: "wall", dx: 23, dy: 7 },
						{ type: "wall", dx: 29, dy: 7 },
						{ type: "well", dx: 2, dy: 8 },
						{ type: "woodcutter", dx: 14, dy: 8 },
						{ type: "wall", dx: 23, dy: 8 },
						{ type: "wall", dx: 23, dy: 9 },
						{ type: "wall", dx: 24, dy: 9 },
						{ type: "wall", dx: 25, dy: 9 },
						{ type: "wall", dx: 26, dy: 9 },
						{ type: "watchtower", dx: 24, dy: 11 },
						{ type: "watchtower", dx: -11, dy: 14 },
						{ type: "watchtower", dx: -34, dy: 15 },
						{ type: "wall", dx: 18, dy: 15 },
						{ type: "wall", dx: 19, dy: 15 },
						{ type: "wall", dx: 15, dy: 17 },
						{ type: "wall", dx: -28, dy: 19 },
						{ type: "wall", dx: 7, dy: 19 },
						{ type: "wall", dx: 10, dy: 19 },
						{ type: "wall", dx: 11, dy: 19 },
						{ type: "wall", dx: -28, dy: 20 },
						{ type: "wall", dx: -27, dy: 20 },
						{ type: "wall", dx: 6, dy: 20 },
						{ type: "wall", dx: 7, dy: 20 },
						{ type: "wall", dx: -27, dy: 21 },
						{ type: "wall", dx: -27, dy: 22 },
						{ type: "wall", dx: -27, dy: 23 },
						{ type: "wall", dx: -24, dy: 23 },
						{ type: "wall", dx: -10, dy: 23 },
						{ type: "wall", dx: -27, dy: 24 },
						{ type: "wall", dx: -24, dy: 24 },
						{ type: "watchtower", dx: -22, dy: 24 },
						{ type: "wall", dx: -13, dy: 24 },
						{ type: "wall", dx: -6, dy: 24 },
						{ type: "wall", dx: 1, dy: 24 },
						{ type: "wall", dx: 2, dy: 24 },
						{ type: "wall", dx: 3, dy: 24 },
						{ type: "wall", dx: 4, dy: 24 },
						{ type: "wall", dx: -27, dy: 25 },
						{ type: "wall", dx: -13, dy: 25 },
						{ type: "wall", dx: -27, dy: 26 },
						{ type: "wall", dx: -13, dy: 26 },
						{ type: "wall", dx: -27, dy: 27 },
						{ type: "wall", dx: -22, dy: 27 },
						{ type: "wall", dx: -21, dy: 27 },
						{ type: "wall", dx: -20, dy: 27 },
						{ type: "wall", dx: -18, dy: 27 },
						{ type: "wall", dx: -17, dy: 27 },
						{ type: "wall", dx: -16, dy: 27 },
						{ type: "wall", dx: -27, dy: 28 },
						{ type: "wall", dx: -27, dy: 29 },
						{ type: "wall", dx: -17, dy: 31 },
						{ type: "wall", dx: -17, dy: 32 },
						{ type: "wall", dx: -19, dy: 33 },
						{ type: "wall", dx: -18, dy: 33 },
						{ type: "wall", dx: -17, dy: 33 },
					],
				},
				eye: { reach: 0.1 },
				fog: true,
				rivals: 1,
				ai: 20,
				// races: { 2: 'demon' },
				end: "fog",
				dialogMusic: {
					intro: "music/siege_intro.mp3",
					after: "music/siege_after.mp3",
				},
				waves: {
					from: 300,
					every: 30,
					size: [1, 1],
					kinds: ["swordsman"],
					until: "fog",
					spawn: [
						[50, 0],
						[-50, 0],
					],
				},
				letter: letter(
					[
						"A fog has risen around the Eye, and my counsellors say the fog is the demons.",
						"The Eye must remain intact. Hold your village. Hold it until the fog lifts, whatever you hear.",
						"Do not leave your position. Do not question the Eye.",
						"This is an order.",
					],
					true,
				),
				dialogue: [
					say(
						"albertha",
						"[whisper]You must not leave the Eye. Whatever happens at the walls, it must remain protected.",
					),
					say(
						"reeve",
						"The two kingdoms are gathering outside. Surely the walls are our greatest concern?",
					),
					say(
						"thordram",
						"The walls keep them out. The Eye keeps something far worse at bay.",
					),
					say("reeve", "[question]And if they reach the Eye?"),
					say(
						"thordram",
						"Then we have failed in more ways than one.",
					),
					say(
						"albertha",
						"[happy]Fortunately, the Eye is rather difficult to destroy.",
					),
					say("reeve", "I was hoping you'd say impossible."),
					say("thordram", "Hope is not a defence. Stay alert."),
				],
				events: [
					{
						at: 0,
						music: "music/siege1.mp3",
					},
					{
						at: 30,
						give: {
							wood: 100,
							sword: 20,
							bow: 40,
							steel: 40,
							leather_armor: 40,
							iron_armor: 30,
						},
						tell: [
							say(
								"albertha",
								"How about some extra weapons and armor?",
							),
							say(
								"thordram",
								"This makes you happy now, Reeve. Does it not?",
							),
						],
					},
					{
						at: 300,
						tell: [
							say("albertha", "[slow]I have a bad feeling."),
							say(
								"thordram",
								"[happy]That means this could be fun!",
							),
							say("albertha", "We'll see for who."),
						],
					},
					{
						when: { sees: "soldier" },
						music: { calm: "music/siege2.mp3", battle: false },
						whileFog: true,
						tell: [
							say(
								"thordram",
								"[yell]The Numbjar kingdom is attacking from the easter! Vedahast are not far behind from the west.",
							),
							say(
								"albertha",
								"[whisper]And neither army must get anywhere near the Eye.",
							),
							say(
								"reeve",
								"[question]Why would they even want it?",
							),
							say(
								"thordram",
								"Because some powers are worth conquering. Others are worth destroying.",
							),
							say(
								"reeve",
								"I was beginning to think this was just a territorial dispute.",
							),
						],
					},
					{
						at: 720,
						whileFog: true,
						tell: [
							say(
								"reeve",
								"[scared]They're at the walls! I can hear the fighting on both sides!",
							),
							say(
								"thordram",
								"[angry]Keep the eastern gate secured! Do not let them through!",
							),
							say(
								"reeve",
								"The western defences are struggling!",
							),
							say(
								"albertha",
								"[whisper]Thordram, the Eye. We cannot afford to lose sight of it.",
							),
							say(
								"reeve",
								"How are we supposed to defend the walls and the Eye at the same time?",
							),
							say(
								"thordram",
								"[angry]We do both. There is no alternative.",
							),
						],
					},
				],
				lifted: [
					say("reeve", "[slow]The Eye..."),
					say("albertha", "It is gone."),
					say("thordram", "[happy]Finally!"),
					say(
						"narrator",
						"The two counsellors fall silent. And something starts to change.",
					),
					say(
						"mordrath",
						"The Eye is gone, and so is that [angry]damn [calm]human skin. I am Mordrath, not Thordram.",
					),
					say(
						"baelthar",
						"And I [angry]hated [calm]being old Albertha. [angry]Horrible!",
					),
					say("reeve", "[scared]Where are the soldiers?"),
					say("baelthar", "Gone."),
					say("reeve", "The camps?"),
					say("mordrath", "Empty."),
					say("reeve", "[sad]The wounded?"),
					say(
						"baelthar",
						"Oh, Reeve. Still asking the right questions.",
					),
					say("reeve", "[slow]You. [angry]All this time, [slow]you."),
					say("baelthar", "All this time."),
					say(
						"mordrath",
						"Do not look so wounded. We never raised a hand. Yours built every wall.",
					),
					say("reeve", "The Eye. You used it to hide everything."),
					say("baelthar", "To obscure a few inconvenient details."),
					say(
						"mordrath",
						"It also kept your attention exactly where we wanted it.",
					),
					say("reeve", "[question]And the king?"),
					say("baelthar", "Which king?"),
					say("reeve", "Maegnius."),
					say(
						"mordrath",
						"Ah. You still believe you have been writing to him?",
					),
					say("reeve", "[scared]What have you done?"),
					say(
						"baelthar",
						"We have been wearing the crown quite comfortably.",
					),
					say(
						"mordrath",
						"The real king has not answered a letter in some time.",
					),
					say("reeve", "You replaced him."),
					say(
						"baelthar",
						"A kingdom needs a king. We simply provided one.",
					),
					say("reeve", "[question]And the Rule?"),
					say("mordrath", "A rather inconvenient old thing."),
					say(
						"baelthar",
						"It was never meant to be circumvented so easily.",
					),
					say(
						"mordrath",
						"But a kingdom can be invaded without its people knowing who has taken it.",
					),
					say("baelthar", "A crown is a useful disguise."),
				],
				after: [
					say(
						"reeve",
						"[sad]Every wall, every road, every gate. I built the war they wanted.",
					),
					say("mordrath", "You did."),
					say("reeve", "And you wore the crown."),
					say("baelthar", "We did."),
					say(
						"reeve",
						"[angry]I think I'm beginning to dislike both of you.",
					),
					say("baelthar", "Oh, we were hoping for that."),
					say(
						"narrator",
						"The demons leave to join their master. Cowards.",
					),
				],
			},
			// 12
			{
				name: "Ashes",
				rivals: 0,
				goals: [more("water", 40), more("sand", 40)],
				// ai: 24,
				// races: { 2: 'demon' },
				music: "music/ashes.mp3",
				scenery: [
					["ruin", 2, -4, 1, 4, 0],
					["fire", 2, -3, 1, 1, 1],
					["ruin", 4, -3, 2, 1, 0],
					["ruin", 4, -1, 2, 1, 0],
					["fire", 4, -1, 1, 1, 1],
					["ruin", 2, 1, 1, 3, 0],
					["fire", 2, 2, 1, 1, 1],
					["ruin", 4, 1, 1, 1, 0],
					["ruin", 6, 1, 1, 1, 0],
				], // kulisser på exakta rutor, bas = 0, 0: [['ruin', x, y], ['ruin', x, y, bredd, höjd], ['fire', x, y]]
				letter: letter(
					[
						"The villages are ash. The borders have fallen, and the crown has been taken from those who once served it.",
						"If this reaches an honest hand: the letters sent in my name were not mine. Those who wrote them used my seal, and those who obeyed them were used as I was.",
						"The one behind it all is Onden. He has broken the old Rule and taken the throne.",
						"I cannot undo what has been done. I can only hope that someone will stop what remains. These are the last words I will write.",
					],
					false,
					"To whoever finds this,",
				),
				dialogue: [
					say(
						"narrator",
						"The letter was never sent. It was found. And by who?",
					),
					say("pipwick", "[happy]Reeve! There you are!"),
					say("reeve", "[question]Pipwick? Where have you been?"),
					say(
						"pipwick",
						"The counsellors sent me on a royal assignment. There was no assignment. They simply wanted me out of the way.",
					),
					say("reeve", "And you found the letter?"),
					say(
						"pipwick",
						"On my way back. I recognised the royal seal, so I thought you ought to see it.",
					),
					say(
						"reeve",
						"[sad]The King is dead, Pipwick. And none of this was his doing.",
					),
					say(
						"pipwick",
						"[sad]I gathered as much. The counsellors never did like being questioned.",
					),
					say("reeve", "They're demons. Onden has taken the throne."),
					say("pipwick", "[question]Onden?"),
					say(
						"reeve",
						"We can discuss it later. Right now, we need to survive.",
					),
					say(
						"pipwick",
						"[calm]Then it is fortunate I still have my tools.",
					),
					say(
						"narrator",
						"Pipwick glances across the ruined village before setting down his equipment.",
					),
					say(
						"pipwick",
						"[question]Before anything else, look at the fires. Half of what is left is still burning.",
					),
					say(
						"reeve",
						"Then that comes first. Water to douse them, sand to smother what is left. If the embers die, the dark has less to feed on.",
					),
					say("pipwick", "And after that, we rebuild."),
					say("reeve", "One step at a time."),
				],

				events: [
					{
						at: 30,
						tell: [
							say(
								"narrator",
								"A nearby fire suddenly dies. Its smoke hangs motionless before slowly gathering into a familiar shape.",
							),
							say("pipwick", "[whisper]Reeve..."),
							say("reeve", "I see him."),
							say(
								"onden",
								"My house looks rather different now. But I must admit, you have made it quite useful.",
							),
							say(
								"reeve",
								"[angry]These were homes! People lived here!",
							),
							say(
								"onden",
								"And now their ruins serve a greater purpose.",
							),
							say("reeve", "You killed the King."),
							say("onden", "He was in my way."),
							say(
								"reeve",
								"[angry]The Rule forbids you from taking the throne!",
							),
							say(
								"onden",
								"The Rule forbids the dark from commanding. The crown, however, has always been an exception.",
							),
							say(
								"reeve",
								"[sad]All those letters... You made me believe I was serving the King.",
							),
							say("onden", "And you served admirably."),
							say(
								"reeve",
								"[angry]I will see you answer for this!",
							),
							say("onden", "I rather doubt that."),
							say(
								"narrator",
								"The smoke scatters in the wind. The fire slowly returns, but Onden is gone.",
							),
						],
					},

					{
						at: 120,
						tell: [
							say(
								"narrator",
								"A distant crash echoes from the ruined outskirts. Pipwick stops working and looks towards the sound.",
							),
							say(
								"pipwick",
								"[question]That wasn't one of ours, was it?",
							),
							say("reeve", "No. Stay behind me."),
							say("baelthar", "[angry]Show yourself!"),
							say("mordrath", "Enough. We know who is there."),
							say("reeve", "[question]Mordrath? Baelthar?"),
							say("pipwick", "You know them?"),
							say("reeve", "[sad]They used to advise me."),
							say("baelthar", "And you trusted us."),
							say(
								"reeve",
								"[angry]You were never what you claimed to be.",
							),
							say("mordrath", "Neither were you, apparently."),
							say(
								"pipwick",
								"I think we have rather a lot to discuss.",
							),
						],
					},

					{
						at: 150,
						tell: [
							say(
								"narrator",
								"Mordrath tries to stand, but his injured leg gives way. Baelthar leans against the broken wall, struggling to remain upright.",
							),
							say("reeve", "What happened to you?"),
							say(
								"baelthar",
								"[angry]Something that does not concern you.",
							),
							say(
								"mordrath",
								"The fighting was... less favourable than expected.",
							),
							say("reeve", "And Onden simply left you here?"),
							say(
								"baelthar",
								"He had other matters to attend to.",
							),
							say(
								"pipwick",
								"[question]So even demons can be discarded.",
							),
							say(
								"mordrath",
								"Choose your next words carefully.",
							),
							say("reeve", "Enough. You can barely stand."),
							say(
								"baelthar",
								"Do not mistake our condition for weakness.",
							),
						],
					},

					{
						at: 160,
						tell: [
							say(
								"narrator",
								"Mordrath and Baelthar attempt to summon their powers. Their wounds flare with pain, and their attempts fail.",
							),
							say("baelthar", "[angry]Damn these wounds."),
							say("mordrath", "We cannot fight like this."),
							say(
								"reeve",
								"Then you should have thought of that before turning against us.",
							),
							say(
								"pipwick",
								"[happy]Well, this is rather convenient.",
							),
							say("reeve", "[question]What is?"),
							say(
								"pipwick",
								"I brought something that might come in handy.",
							),
							say(
								"narrator",
								"Pipwick retrieves heavy iron restraints and a length of chain from his equipment.",
							),
							say("baelthar", "[angry]You wouldn't dare."),
							say(
								"pipwick",
								"You can barely stand. I think I dare.",
							),
							say(
								"mordrath",
								"Our powers will return when we recover.",
							),
							say(
								"reeve",
								"Then you had better hope we have no reason to let you recover.",
							),
							say(
								"baelthar",
								"You cannot keep us imprisoned forever.",
							),
							say("reeve", "Watch me."),
						],
					},

					{
						at: 170,
						tell: [
							say(
								"narrator",
								"Pipwick checks the restraints while Reeve surveys the surrounding ruins.",
							),
							say("baelthar", "You intend to keep us like this?"),
							say(
								"reeve",
								"You will remain under guard. Your powers will not be returning while you are in our custody.",
							),
							say(
								"mordrath",
								"You cannot keep us chained forever.",
							),
							say(
								"reeve",
								"I don't intend to rely on chains alone.",
							),
							say(
								"pipwick",
								"[happy]I've already started working on something more permanent.",
							),
							say("baelthar", "[angry]You think you have won?"),
							say(
								"reeve",
								"No. But you are no longer in a position to threaten anyone.",
							),
							say("mordrath", "Onden will come for us."),
							say(
								"reeve",
								"Then perhaps he can explain why he left you behind.",
							),
							say(
								"pipwick",
								"All secured. I wouldn't try anything clever if I were you.",
							),
						],
					},
				],
			},
			// 13
			{
				name: "Embers",
				goals: [more("wood", 40), more("stone", 30)],
				dialogue: [
					say(
						"reeve",
						"The fires are out. Now we build: timber and stone, walls first and roofs after.",
					),
					say(
						"baelthar",
						"[whisper]Rest, Reeve. Let the ruins lie. Nobody would blame you.",
					),
					say("reeve", "I would."),
					say("mordrath", "A little guilt. How useful."),
					say("reeve", "You seem to know quite a lot about it."),
					say("baelthar", "We have had time to study."),
					say("reeve", "Find a hobby."),
					say("mordrath", "We did. You."),
					say(
						"pipwick",
						"[sad]I used to know every village road in Farael.",
					),
					say("reeve", "What happened?"),
					say(
						"pipwick",
						"I suppose I still do. There's just less left to recognise.",
					),
					say("reeve", "We'll rebuild."),
					say("pipwick", "Good. I'll bring my tools."),
				],
				events: [
					{
						when: [
							{ resource: "wood", made: 20 },
							{ resource: "stone", made: 20 },
						],
						tell: [
							say(
								"baelthar",
								"You are making a habit of cleaning up after us.",
							),
							say("reeve", "Someone has to."),
							say(
								"mordrath",
								"And you have always been so willing.",
							),
							say("reeve", "I'm trying something new."),
							say("baelthar", "How exciting."),
							say(
								"pipwick",
								"[happy]Look at that. The town are shaping up.",
							),
							say("reeve", "One step closer."),
							say("pipwick", "Small victories count too."),
						],
					},
				],
				after: [
					say("baelthar", "Tired yet?"),
					say("reeve", "No."),
					say("mordrath", "You should be."),
					say("reeve", "I'll add it to the list."),
				],
			},
			// 14
			{
				name: "The Book Opens",
				start: {
					buildings: [
						{ type: "well", dx: 7, dy: 2 },
						{ type: "well", dx: 8, dy: 4 },
					],
				},
				goals: [
					{
						key: "b:enchanter",
						type: "build",
						id: "enchanter",
						amount: 1,
					},
					{ key: "x:casts", type: "casts", amount: 3 },
				],
				dialogue: [
					say(
						"reeve",
						"The old grimoire from the enchanter's tower. It will not open for a reader. Only for someone who casts from it.",
					),
					say("baelthar", "Do not open it."),
					say("mordrath", "Leave it where it sleeps."),
					say("reeve", "[question]You are afraid of a book?"),
					say("baelthar", "More like \"intelligently cautious\"."),
					say("reeve", "Then perhaps I should read it."),
					say("mordrath", "Curiosity is a dangerous habit."),
					say(
						"reeve",
						"So is giving orders. I've had enough of both.",
					),
					say("pipwick", "[question]You're opening that old book?"),
					say("reeve", "It seems to respond to magic."),
					say(
						"pipwick",
						"A book that opens itself. I should invent a cupboard like that.",
					),
					say("reeve", "Start with one that stays closed."),
					say("pipwick", "Fair point."),
				],
				events: [
					{
						when: { type: "casts", amount: 1 },
						tell: [
							say("baelthar", "Put it down, Reeve."),
							say(
								"reeve",
								"One spell, one page. It is opening by itself.",
							),
							say("mordrath", "Then close it."),
							say(
								"reeve",
								"You two are remarkably concerned about my reading habits.",
							),
							say("baelthar", "We prefer our secrets unread."),
						],
					},
				],
				after: [
					say(
						"reeve",
						'"Whispers are permitted. Hands are not." It binds them, not us. Their hands are tied, and ours are free?',
					),
					say("baelthar", "Free to do what, Reeve?"),
					say("mordrath", "Free to be used."),
					say("reeve", "Free to say no."),
					say("baelthar", "How very noble."),
					say("reeve", "Don't worry. I won't make a habit of it."),
					say("pipwick", "So the demons are bound by the Rule?"),
					say("reeve", "Their hands are tied. Ours are free."),
					say("pipwick", "Then let's use ours wisely."),
				],
			},
			// 15
			{
				name: "Outposts I",
				rivals: 1,
				ai: 30,
				races: { 2: "demon" },
				end: "hq",
				dialogue: [
					say(
						"reeve",
						"The first outpost holds the road where it meets the hills. If I take it, the rest may follow.",
					),
					say(
						"reeve",
						"My roads brought their supplies. Now they will bring mine.",
					),
					say("mordrath", "Clever. Careful."),
					say(
						"reeve",
						"I'm beginning to understand why you liked my roads so much.",
					),
					say("baelthar", "We did put them to excellent use."),
					say("reeve", "You won't be using them again."),
					say(
						"pipwick",
						"[happy]Roads! Finally, something I know about.",
					),
					say("reeve", "These roads will carry our supplies."),
					say(
						"pipwick",
						"Then I'll help keep them clear. My last road-clearing invention was a little too effective.",
					),
					say("reeve", "What happened?"),
					say("pipwick", "There was no road left."),
				],
				events: [
					{
						at: 120,
						tell: [
							say(
								"mordrath",
								"You have learned to build rather impressive roads.",
							),
							say("reeve", "Thank you."),
							say("mordrath", "That was not praise."),
							say("reeve", "I know. I was being polite."),
							say("baelthar", "How unusual."),
						],
					},
				],
				after: [
					say("mordrath", "The first outpost has fallen."),
					say("reeve", "One less obstacle."),
					say("baelthar", "There are always more."),
					say("reeve", "I was afraid you'd say that."),
				],
			},
			// 16
			{
				name: "Outposts II",
				rivals: 1,
				ai: 34,
				races: { 2: "demon" },
				end: "hq",
				dialogue: [
					say(
						"reeve",
						"The second outpost is stronger than the first, and there is no one left to send but me.",
					),
					say(
						"baelthar",
						"Stop here, Reeve. Keep your village. We will forget you.",
					),
					say("reeve", "You never forgot me. You used me."),
					say(
						"baelthar",
						"Used? Such an ugly word. We preferred partnership.",
					),
					say("reeve", "You gave me orders."),
					say(
						"baelthar",
						"And you followed them. A remarkably productive partnership.",
					),
					say("reeve", "I can build you more roads."),
					say("baelthar", "Really?"),
					say("reeve", "No."),
					say("mordrath", "A disappointing negotiation."),
					say(
						"pipwick",
						"[sad]I never thought we'd march against the crown.",
					),
					say("reeve", "Neither did I."),
					say(
						"pipwick",
						"I always imagined retiring beside a quiet bridge.",
					),
					say("reeve", "You still can."),
					say(
						"pipwick",
						"Good. I'll find one that hasn't burned down.",
					),
				],
				events: [
					{
						at: 180,
						tell: [
							say("mordrath", "You are wasting resources."),
							say("reeve", "I have plenty."),
							say("mordrath", "You will need them."),
							say("reeve", "[question]For what?"),
							say("baelthar", "For the long walk home, perhaps."),
							say("reeve", "I'll manage."),
							say("mordrath", "You always did."),
						],
					},
				],
				after: [
					say(
						"baelthar",
						"Another outpost. You really are determined.",
					),
					say(
						"reeve",
						"I've had a lot of practice following orders.",
					),
					say("mordrath", "And now?"),
					say("reeve", "Now I'm following my own."),
				],
			},
			// 17
			{
				name: "Outposts III",
				rivals: 1,
				ai: 38,
				races: { 2: "demon" },
				end: "hq",
				dialogue: [
					say(
						"reeve",
						"The third outpost is the last before the fortress. After it there is only Onden.",
					),
					say(
						"mordrath",
						"Three outposts. Do you mean to reach Onden?",
					),
					say("reeve", "I mean to reach home."),
					say(
						"baelthar",
						"[whisper]He is listening, you know. He hears all of this.",
					),
					say("reeve", "Then I hope he's comfortable."),
					say("mordrath", "He is not known for patience."),
					say("reeve", "Neither am I."),
					say("baelthar", "That is new."),
					say(
						"pipwick",
						"[question]You really mean to go all the way to Onden?",
					),
					say("reeve", "There's no one else."),
					say("pipwick", "There rarely is, is there?"),
					say("reeve", "Are you afraid?"),
					say(
						"pipwick",
						"Terribly. But I'd rather save the kingdom than lose it.",
					),
				],
				events: [
					{
						at: 150,
						tell: [
							say("baelthar", "You could still turn back."),
							say("reeve", "You keep saying that."),
							say("baelthar", "We keep hoping."),
							say("reeve", "You must be new to disappointment."),
							say("mordrath", "We are not."),
							say(
								"reeve",
								"Good. Then this won't be unfamiliar.",
							),
						],
					},
				],
				after: [
					say("onden", "[whisper]Come then, Reeve. Come to my door."),
					say("reeve", "I was going to."),
					say("onden", "I know."),
				],
			},
			// 18
			{
				name: "The Outer Fortress",
				rivals: 1,
				ai: 45,
				races: { 2: "demon" },
				end: "hq",
				dialogue: [
					say(
						"reeve",
						"The outer fortress guards the way to him. If it holds, Farael falls.",
					),
					say("mordrath", "This fortress has never fallen."),
					say("reeve", "Then it is overdue."),
					say(
						"baelthar",
						"[angry]Our master is not patient. Neither are we.",
					),
					say("reeve", "Good."),
					say("mordrath", "You have become rather unpleasant."),
					say("reeve", "I've had excellent teachers."),
					say(
						"pipwick",
						"[sad]That's the last fortress before the throne.",
					),
					say("reeve", "Yes."),
					say(
						"pipwick",
						"I always thought the king's roads led somewhere safe.",
					),
					say("reeve", "They should have."),
					say("pipwick", "Then let's make sure this one does."),
				],
				events: [
					{
						at: 240,
						tell: [
							say(
								"baelthar",
								"Do you really think you can reach him?",
							),
							say("reeve", "I'm already here."),
							say(
								"mordrath",
								"Technically, you are still outside.",
							),
							say(
								"reeve",
								"And you're standing inside it. We all have our problems.",
							),
							say("baelthar", "I almost missed this."),
						],
					},
				],
				after: [
					say("mordrath", "[angry]Fool! You have opened his door."),
					say("baelthar", "He knows your name now."),
					say("reeve", "He knew it before."),
					say("onden", "[whisper]Indeed, I did."),
				],
			},
			// 19
			{
				name: "The Stolen Crown",
				rivals: 1,
				ai: 50,
				races: { 2: "demon" },
				end: "hq",
				dialogue: [
					say(
						"reeve",
						"Onden's keep. What is inside that he cannot afford to lose?",
					),
					say(
						"baelthar",
						"The crown. He took it from the king's own head.",
					),
					say(
						"mordrath",
						"The Rule bends around the crown. While he holds it, the old binding cannot reach him.",
					),
					say("mordrath", "[angry]Do not touch it!"),
					say("reeve", "You are afraid, I think. Good."),
					say("baelthar", "You have no idea what it will do to you."),
					say("reeve", "That makes two of us."),
				],
				events: [
					{
						at: 150,
						tell: [
							say("mordrath", "Stop."),
							say("reeve", "You've said that before."),
							say("mordrath", "This is different."),
							say(
								"reeve",
								"Everything is always different when you don't get your way.",
							),
							say(
								"baelthar",
								"Reeve, listen to him. Just this once.",
							),
							say("reeve", "Now I'm certain I shouldn't."),
						],
					},
				],
				after: [
					say("pipwick", "[scared]Reeve. That crown..."),
					say("reeve", "What about it?"),
					say(
						"pipwick",
						"I've seen it before. It was always guarded.",
					),
					say("reeve", "Because of the Rule?"),
					say("pipwick", "I suppose so."),
					say(
						"reeve",
						"The crown is warm, like something alive. It will not leave my hand.",
					),
					say("baelthar", "You have no idea what you have done."),
					say(
						"reeve",
						"I'm beginning to think that's a family trait.",
					),
					say("pipwick", "[sad]Is it supposed to stay in your hand?"),
					say("reeve", "It won't let go."),
					say(
						"pipwick",
						"That's unfortunate. I was going to suggest somewhere safe.",
					),
				],
			},
			// 20
			{
				name: "The March",
				rivals: 1,
				ai: 55,
				end: "hq",
				waves: {
					from: 90,
					every: 60,
					size: [3, 1],
					kinds: ["swordsman", "swordsman", "archer", "knight"],
				},
				dialogue: [
					say(
						"reeve",
						"[sad]Vedahast marches because I took their homes. I called it protecting Farael. I can hardly blame them.",
					),
					say("baelthar", "There. At last, some honesty."),
					say("mordrath", "You could still surrender."),
					say("reeve", "And let them burn?"),
					say("baelthar", "They might."),
					say(
						"reeve",
						"Then I'll have to give them a better reason not to.",
					),
					say("mordrath", "They will never forgive you."),
					say("reeve", "I know."),
					say("baelthar", "You are prepared to be hated?"),
					say("reeve", "I've had worse conversations."),
					say("pipwick", "[sad]They lost their homes because of us."),
					say("reeve", "I know."),
					say("pipwick", "They won't care who gave the orders."),
					say("reeve", "Neither would I."),
					say("pipwick", "Then let's stop Onden."),
					say("reeve", "That's the plan."),
				],
				events: [
					{
						at: 180,
						tell: [
							say(
								"mordrath",
								"The soldiers of Vedahast are getting closer.",
							),
							say("reeve", "I noticed."),
							say(
								"baelthar",
								"Perhaps you should tell them who really burned their homes.",
							),
							say("reeve", "I intend to."),
							say("mordrath", "They will not listen."),
							say("reeve", "Then I'll keep talking."),
							say("baelthar", "Stubborn little creature."),
						],
					},
					{
						at: 360,
						tell: [
							say("reeve", "Vedahast is still coming."),
							say("mordrath", "Of course they are."),
							say("reeve", "I wouldn't blame them either."),
							say("baelthar", "Then why keep fighting?"),
							say(
								"reeve",
								"Because they're not the ones who should be fighting.",
							),
							say(
								"mordrath",
								"A distinction they may not appreciate.",
							),
							say("reeve", "It isn't for their appreciation."),
							say("pipwick", "They're still coming."),
							say("reeve", "I know."),
							say("pipwick", "Then we keep going."),
							say("reeve", "Even if they hate us?"),
							say("pipwick", "Especially then."),
						],
					},
				],
				after: [
					say(
						"reeve",
						"[sad]I did not want to win this. I wanted to be heard.",
					),
					say("baelthar", "And if they never listen?"),
					say("reeve", "Then at least I stopped running."),
					say("mordrath", "A curious definition of victory."),
				],
			},
			// 21
			{
				name: "Onden",
				rivals: 1,
				ai: 70,
				races: { 2: "demon" },
				end: "hq",
				meteorProof: ["knight"],
				dialogue: [
					say("reeve", "The last gate. Onden is behind it."),
					say(
						"pipwick",
						"[sad]Reeve. Whatever happens, I want you to know something.",
					),
					say("reeve", "What is it?"),
					say(
						"pipwick",
						"You were the first person who took my work seriously.",
					),
					say("reeve", "Your inventions were useful."),
					say(
						"pipwick",
						"Most people just asked me to stop making them.",
					),
					say("reeve", "I may have done that once or twice."),
					say("pipwick", "Yes. But you always asked nicely."),
					say("reeve", "I'll be back, Pipwick."),
					say(
						"pipwick",
						"See that you are. I still owe you a proper road.",
					),
					say("narrator", "Pipwick steps aside. You approach Onden."),
					say(
						"onden",
						"[calm]You wanted a quiet life. A little land. A village that needed nothing from you.",
					),
					say("reeve", "I still do."),
					say(
						"onden",
						"Then go home. Let the embers burn. Let the kingdoms settle their own debts.",
					),
					say("reeve", "I tried that."),
					say("onden", "And look where it brought you."),
					say("reeve", "Yes. I noticed."),
					say(
						"onden",
						"Whispers are permitted. Hands are not. Yet here you stand, with mine bound and yours so very busy.",
					),
					say("reeve", "Busy is all I have ever been. It is enough."),
					say(
						"onden",
						"You built my armies. You broke my borders. You brought kingdoms to their knees.",
					),
					say("reeve", "I know."),
					say("onden", "And still you believe yourself different?"),
					say("reeve", "I made mistakes."),
					say("onden", "You made choices."),
					say("reeve", "Yes."),
					say("onden", "And you will make more."),
					say("reeve", "Probably."),
					say("onden", "Then what makes you think you can stop me?"),
					say("reeve", "I don't."),
					say("onden", "At last. Honesty."),
					say("reeve", "I only need to stop helping you."),
					say("onden", "You think that is enough?"),
					say("reeve", "It's a start."),
					say("onden", "You cannot control the storm, Reeve."),
					say("reeve", "I wasn't planning to."),
					say(
						"onden",
						"A storm owes nothing to the Rule. It is only weather.",
					),
				],
				events: [
					{
						at: 90,
						weather: "storm",
						tell: [
							say(
								"onden",
								"You have come so far. All those walls. All those roads. All those dead.",
							),
							say("reeve", "I remember."),
							say(
								"onden",
								"Then finish it. Break the crown. End the Rule. No more whispers. No more waiting.",
							),
							say("reeve", "And what happens then?"),
							say(
								"onden",
								"You would finally have the power to stop me.",
							),
							say("reeve", "By becoming something worse?"),
							say("onden", "By doing what must be done."),
							say("reeve", "I've heard that before."),
						],
					},
					{ at: 300, tornado: 6 },
					{ at: 540, super: 8 },
					{
						at: 780,
						meteors: 60,
						tell: [
							say("onden", "The stars fall where they will."),
							say(
								"reeve",
								"And people choose what they do beneath them.",
							),
							say(
								"onden",
								"You still believe choice makes a difference?",
							),
							say("reeve", "It made all the difference to you."),
							say("onden", "I have not finished."),
							say("reeve", "Neither have I."),
						],
					},
				],
				after: [
					say("onden", "So the Rule holds. How tiresome."),
					say("reeve", "It always did."),
					say("onden", "You have not defeated me."),
					say("reeve", "I know."),
					say("onden", "Then what have you accomplished?"),
					say("reeve", "I stopped doing your work."),
					say("onden", "How very little."),
					say("reeve", "It was enough."),
				],
			},
		],

		epilogue: [
			"The dark was bound by an old Rule, and the Rule held: it could whisper, tempt and deceive, but it could never command.",
			"Yet a kingdom had been invaded, its king replaced, and its people led into war without knowing who truly held the crown.",
			"Farael would remember the war for generations. Some would call you a hero. Others would remember the villages you took.",
			"The truth would take longer to settle.",
			"And so you returned to Thunebrook.",
			"The fields still needed tending. The roads still needed mending. And for the first time in a long while, nobody was sending you orders.",
			"It was a quiet life.",
			"Not quite the one you had left behind.",
			"But yours.",
		],
  };
})(window.CityBuilder);
