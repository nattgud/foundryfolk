/* Optimeraren (js/optimizer.js): mäter bildfrekvensen och slår av det som inte behövs, steg för steg, när spelet blir för segt, och slår på det igen när det går lätt.
   Bara det visuella och "extra": inget som påverkar hur spelet fungerar. Av och på i huvudmenyn (Options: optimizer).
   levels: nivå 1 är första ändringen, nivå 2 lägger till nästa osv. (nivåerna gäller samtidigt). Egenskaperna i en nivå (utom name):
     villagers: andel av det vanliga antalet invånare (0-1); decor: false = de små detaljerna (lyktstolpar, tunnor...) ritas inte; civils: false = civila byggnader och invånare ritas inte;
     simpleCarriers: true = bärare ritas som små färgade rutor (ingen bild, ingen animation). */
(function (CityBuilder) {
  'use strict';
  CityBuilder.Config.optimizer = {
    targetFps: 60,        // målet innan skärmens uppdateringsfrekvens är mätt (optimizer.js mäter den: 60, 144, 240 Hz ...). Begränsas bildfrekvensen i menyn (30 FPS) är det målet
    maxTargetFps: 144,    // högsta målet: på en 240 Hz-skärm räcker 144
    minTargetFps: 30,
    tolerance: .1,        // för segt = bildtiden är mer än så här mycket över målet (10 % = under ca 130 av 144 fps, under 54 av 60)
    slowSeconds: 3,       // så många sekunder i rad måste det vara segt innan en nivå läggs på
    headroom: .75,        // "går lätt" = bildens beräkning och ritning tar mindre än så här av tiden som målet ger per bild
    recoverSeconds: 20,   // så många sekunder i rad måste det gå lätt innan en nivå tas bort; dubblas (till högst maxRecoverSeconds) om det blir segt igen strax efter
    maxRecoverSeconds: 240,
    warmup: 3,            // sekunder som hoppas över efter laddning, paus eller en hackig stund
    sleepSeconds: 60,     // en flik som är dold så här länge "sover": cacharna släpps och skärmens canvas krymper till 1x1 pixel (frigör minne); allt byggs upp igen när fliken visas
    memory: {             // minnet (bara där webbläsaren visar det: Chrome ger performance.memory för JS-minnet)
      checkSeconds: 10,   // hur ofta minnet mäts
      softMB: 500,        // över så här mycket JS-minne släpps cacharna (Optimizer.register)
      trimSeconds: 60,    // tidigast så här ofta städas det
      growthMB: 150,      // också när minnet vuxit så här mycket sedan senaste städningen, även under softMB
    },
    levels: [
      { name: 'Fewer villagers', villagers: .35 },
      { name: 'Hide small details', decor: false },
      { name: 'Hide civil buildings', civils: false },
      { name: 'Simple carriers', simpleCarriers: true },
    ],
  };
})(window.CityBuilder);
