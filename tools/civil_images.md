# Bilder till civila byggnader och detaljer

Spelet fungerar utan bilderna (enkla reservbilder ritas), men varje fil du lägger in ersätter reservbilden för sin sort.
Systemet: `js/systems/civils.js`, tabellen: `js/config/civils.js`.

## Var och hur

- Mapp: `public/images/buildings/human/` (och valfritt `public/images/buildings/demon/` om demonerna ska se annorlunda ut; saknas demonbilden används människans).
- Namn: `civil_<sort>.png`, eller `civil_<sort>1.png`, `civil_<sort>2.png` ... om sorten har flera varianter (`variants` i tabellen).
- Storlek: **64x64** för hela byggnader, **16x16** för små detaljer. Genomskinlig bakgrund (PNG med alfa). Stilen som övriga byggnader: pixelkonst, snett uppifrån, mörka konturer, ljus från vänster.
- Kör `node tools/racemanifest.js` efter att du lagt in nya bilder (servern kör den också vid start), annars ritas reservbilden.

## Hela byggnader (64x64)

| Fil | Motiv |
|---|---|
| `civil_house1..4.png` | boningshus: liten hydda, trähus med halmtak, stenhus, större hus med skorsten |
| `civil_park1..2.png` | park/trädgård: gräs, rabatter, buskar, en liten bänk; variant 2 med en gammal ek |
| `civil_pub.png` | pub/ölstuga: skylt med sejdel, tunnor utanför |
| `civil_fountain.png` | fontän på liten stenplatta |
| `civil_market1..2.png` | marknadsplats: stånd med röda och gula markiser, lådor och korgar |
| `civil_inn.png` | värdshus: större trähus med stall och skylt |
| `civil_infirmary.png` | sjukstuga: vitt hus med rött kors eller örter |
| `civil_graveyard1..2.png` | kyrkogård: gravstenar och kors, låg mur; variant 2 med ett träd |
| `civil_theater.png` | teater/festplats: liten scen med färgade tyger och vimplar |
| `civil_bathhouse.png` | badhus: lågt stenhus med ånga |
| `civil_poorhouse.png` | fattighus: ruffigt långhus med lappat tak |
| `civil_gambling.png` | spelhus: mörkt hus med lyktor och tärningsskylt |
| `civil_church.png` | kyrka: stenkyrka med litet torn |
| `civil_school.png` | skola: långt trähus med klocka |

## Små detaljer (16x16)

`civil_flowers1..3.png` (blommor), `civil_lamppost.png` (lyktstolpe), `civil_bush1..2.png` (buske), `civil_barrel.png` (tunna), `civil_crates.png` (lådor), `civil_haybale.png` (hövändel), `civil_bench.png` (bänk), `civil_signpost.png` (vägskylt).

## Skapa bilderna

Jag kan inte nå din lokala bildgenerering härifrån, så den här delen gör du själv. Förslag:

1. Generera större (512x512 eller 1024x1024) med samma verktyg som du gjort övriga bilder. Om det är Krita med pluginet *Krita AI Diffusion* (som använder ComfyUI som backend) fungerar det bra: skapa ett nytt dokument, rita eller beskriv motivet och generera. Är du osäker på vad du använder: titta under Inställningar > Dockers i Krita efter "AI Image Generation".
2. Promptens kärna (anpassa motivet): `pixel art, small medieval <motiv>, three-quarter top-down view, dark outline, warm light from the upper left, limited color palette, transparent background, game asset, single object centered`. Lägg gärna till `no text, no ground, no shadow` så bilden får genomskinlig bakgrund.
3. Skala ner till 64x64 (hela byggnader) eller 16x16 (detaljer): i Krita *Bild > Skala bild till ny storlek*, filter *Box* eller *Bicubic*. Rensa upp kantpixlar för hand vid behov: särskilt de små 16x16-bilderna blir bättre om du ritar om dem.
4. Spara som PNG med alfa under rätt namn och kör `node tools/racemanifest.js`.

Ändra hur många av varje sort som byggs, och när de låses upp, i tabellen i `js/config/civils.js`.
