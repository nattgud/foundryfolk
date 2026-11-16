/* Civila byggnader och detaljer (systems/civils.js): en by som växer av sig själv runt allt spelare (och datorer) bygger. De är bara utseende: de blockerar aldrig något
   (enheter går rakt över dem, byggnader kan placeras på deras rutor och då försvinner de direkt), de har inget liv, ingen logik och inget synfält.

   Två slag (kind):
     big    en hel ruta, 64x64. Hus, pubar, kyrkor ...          Bilden: images/buildings/<ras>/civil_<id>.png (med variants: civil_<id>1.png, civil_<id>2.png ...)
     decor  en liten sak, 16x16 (25 % av en ruta). Blommor, lyktstolpar ...   Bilden: images/buildings/<ras>/civil_<id>.png (16x16, samma namnregel)
   Rasmappen är human eller demon; saknas rasens bild används människans, och saknas den också ritas en enkel reservbild. Kör node tools/racemanifest.js efter nya bilder.

   Var de byggs: en hel ruta bara på ledig gräs- eller sandruta som ligger intill en väg (stig, slitage >= roadWear) eller intill spelarens egen byggnad, aldrig på själva vägen.
   En liten detalj sitter i kanten av en sådan ruta, mot vägen eller byggnaden (tre platser per sida). När: 1-15 sekunder (delay) efter att en spelares byggnad byggts eller rivits,
   och dessutom var heartbeat:e sekund (så att tiden ensam också ger fler). Varje gång läggs en enda ny, av den sort som saknas mest. De tonar in under 5-10 sekunder (fade).
   Försvinner: bygger spelaren på rutan (direkt), vattnet stiger över den, en meteor slår ner vid den, en tornado far över den, eld bränner rutan, eller spelaren slås ut.

   Hur många av varje sort: (from) byggnader krävs, (after) minuter krävs, sedan
        önskat antal = min(max, avrundat ner (rate * spelarens byggnader + perMinute * minuter))
   Spelarens byggnader = färdiga eller påbörjade byggnader utom varuhögar, murar och döda byggnader. weight (valfri, 1) väger sorten vid slumpen.
   Banan kan stänga av allt med civils: false. */
CityBuilder.Config.civils = {
  enabled: true,
  max: 100000,          // tak per spelare (högt från början, justera om det behövs)
  radius: 10,           // hur långt från byggnaden som utlöste det en ny får hamna (rutor)
  delay: [1, 15],       // sekunder från att en byggnad byggts eller rivits till att något nytt kan växa fram
  fade: [5, 10],        // sekunder det tar att tona in
  pathWear: 0.125,      // en ruta med minst så här mycket slitage är en stig (syns som stig): inget civilt byggs där, och står något där när stigen uppstår tonar det ut
  leave: [2, 4],        // sekunder det tar att tona ut när en stig uppstår under något
  roadWear: 0.3,        // en ruta räknas som väg när dess slitage är minst så här (0-1, se pathdecay.js)
  heartbeat: 20,        // sekunder mellan att tiden ensam ger en ny (per spelare)
  types: {
    // ---- hela rutor ----
    house:      { kind: 'big', variants: 4, from: 1,  after: 0,  rate: 0.5,   perMinute: 0.15,  max: 400, weight: 3, color: '#b98a5a', roof: '#8a3b2d' },   // boningshus: hyddor och hus
    park:       { kind: 'big', variants: 2, from: 5,  after: 2,  rate: 0.09,  perMinute: 0.02,  max: 40,  color: '#4f8f45', roof: '#3d7a3a' },   // park och trädgård
    pub:        { kind: 'big', variants: 1, from: 6,  after: 3,  rate: 0.07,  perMinute: 0.02,  max: 25,  color: '#a5703d', roof: '#5a3a22' },   // pub / ölstuga
    fountain:   { kind: 'big', variants: 1, from: 8,  after: 4,  rate: 0.05,  perMinute: 0.01,  max: 16,  color: '#8fb4c9', roof: '#6f93a8' },   // fontän
    market:     { kind: 'big', variants: 2, from: 10, after: 5,  rate: 0.04,  perMinute: 0.01,  max: 16,  color: '#c9a24b', roof: '#a8432f' },   // marknadsplats
    inn:        { kind: 'big', variants: 1, from: 12, after: 6,  rate: 0.04,  perMinute: 0.01,  max: 12,  color: '#b08a62', roof: '#6f4a2d' },   // värdshus
    infirmary:  { kind: 'big', variants: 1, from: 12, after: 7,  rate: 0.03,  perMinute: 0.005, max: 10,  color: '#d9d4c7', roof: '#a33a3a' },   // sjukstuga
    graveyard:  { kind: 'big', variants: 2, from: 14, after: 8,  rate: 0.025, perMinute: 0.005, max: 8,   color: '#7d8a7a', roof: '#59615a' },   // kyrkogård
    theater:    { kind: 'big', variants: 1, from: 15, after: 8,  rate: 0.03,  perMinute: 0.01,  max: 10,  color: '#a9566a', roof: '#6d2f3f' },   // teater / underhållning / festplats
    bathhouse:  { kind: 'big', variants: 1, from: 15, after: 8,  rate: 0.03,  perMinute: 0.005, max: 10,  color: '#9fc0c9', roof: '#5f8794' },   // badhus
    poorhouse:  { kind: 'big', variants: 1, from: 16, after: 10, rate: 0.025, perMinute: 0.005, max: 8,   color: '#8a7d6a', roof: '#5f5446' },   // fattighus
    gambling:   { kind: 'big', variants: 1, from: 18, after: 10, rate: 0.025, perMinute: 0.005, max: 8,   color: '#6f4a8a', roof: '#442c5a' },   // spelhus
    church:     { kind: 'big', variants: 1, from: 20, after: 12, rate: 0.02,  perMinute: 0.003, max: 6,   color: '#cfc8b8', roof: '#6b6b78' },   // kyrka
    school:     { kind: 'big', variants: 1, from: 25, after: 14, rate: 0.015, perMinute: 0.003, max: 6,   color: '#b3874f', roof: '#7a2f2f' },   // skola

    // ---- små detaljer längs vägar och byggnader ----
    flowers:    { kind: 'decor', variants: 3, from: 2, after: 0, rate: 0.8,  perMinute: 0.3,  max: 600, weight: 1,   color: '#d94f8c' },   // blommor
    lamppost:   { kind: 'decor', variants: 1, from: 4, after: 1, rate: 0.6,  perMinute: 0.2,  max: 400, weight: 1,   color: '#f2c14e' },   // lyktstolpe
    bush:       { kind: 'decor', variants: 2, from: 3, after: 0, rate: 0.4,  perMinute: 0.15, max: 300, weight: 0.8, color: '#3f7a3c' },   // buske
    barrel:     { kind: 'decor', variants: 1, from: 3, after: 1, rate: 0.25, perMinute: 0.1,  max: 200, weight: 0.6, color: '#8a5a32' },   // tunna
    crates:     { kind: 'decor', variants: 1, from: 4, after: 1, rate: 0.25, perMinute: 0.1,  max: 200, weight: 0.6, color: '#a37a45' },   // lådor
    haybale:    { kind: 'decor', variants: 1, from: 3, after: 1, rate: 0.2,  perMinute: 0.1,  max: 150, weight: 0.6, color: '#d1b34f' },   // hövändel
    woodpile:      { kind: 'decor', variants: 1, from: 6, after: 2, rate: 0.2,  perMinute: 0.08, max: 150, weight: 0.5, color: '#6f4a2d' },   // vedtrave
    signpost:   { kind: 'decor', variants: 1, from: 5, after: 2, rate: 0.15, perMinute: 0.05, max: 100, weight: 0.4, color: '#c9b38a' },   // vägskylt
  },
};
