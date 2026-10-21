/* Datorspelare (se systems/ai.js). Datorn bygger med samma regler och kostnader som spelaren.
   build: byggordning som [byggnadstyp, målantal]. Första posten som inte nått sitt antal avgör vad som byggs härnäst.
          Saknas resurser eller förkunskaper byggs de först automatiskt: en producent för varje insats och byggresurs
          (t.ex. garnison -> tegelbruk -> lergrop), så listan behöver bara nämna det datorn faktiskt vill ha.
   maxUnderConstruction: så många byggnader får vara under uppbyggnad samtidigt.
   thinkSeconds: tid mellan besluten.   resourceRadius: hur långt från basen den söker malm, träd m.m. (rutor).
   blockedSeconds: väntetid innan en byggnad som inte gick att placera provas igen.
   patienceSeconds: har datorn väntat så länge på en resurs som den redan har producenter för byggs ytterligare en (högst maxPerType av varje typ). */
CityBuilder.Config.ai = {
  thinkSeconds: 2,
  maxUnderConstruction: 2,
  resourceRadius: 40,
  blockedSeconds: 60,
  patienceSeconds: 30,
  maxPerType: 12,
  build: [
    ['woodcutter', 2], ['sawmill', 1], ['quarry', 1], ['warehouse', 1], ['woodcutter', 3],
    ['guard_tower', 1], ['garrison', 1], ['quarry', 2], ['sawmill', 2], ['guard_tower', 2],
    ['warehouse', 2], ['garrison', 2], ['woodcutter', 4], ['guard_tower', 3], ['large_warehouse', 1],
  ],
};
