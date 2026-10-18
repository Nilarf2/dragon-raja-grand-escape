export function configurePlaces(C) {
  const player = C.player;
  const A = C.ANCHORS, fr = C.station.frame, P2 = C.station.plat2, P1 = C.station.plat1;
  const W2 = fr.W(P2.nc, 58), W1 = fr.W(P1.nc, 74);
  C.PLACES = {
    station: { name: 'Baishinji Station  梅津寺駅', x: W2[0], z: W2[1], b: 290, p: -2 },
    platform1: { name: 'Platform 1', x: W1[0], z: W1[1], b: 250, p: 0 },
    lot: { name: 'The empty lot', x: A.parkingLot.x + 14, z: A.parkingLot.z - 6, b: 240, p: -4 },
    lane: { name: 'The shrine lane', x: A.townStreet[0].x, z: A.townStreet[0].z + 4, b: 356, p: 4 },
    shrine: { name: 'Town shrine & hill tram', x: A.townStreet[5].x, z: A.townStreet[5].z + 2, b: 356, p: 8 },
    summit: { name: 'Summit, the mine shrine', x: A.jizo.x, z: A.jizo.z + 2, b: 0, p: 0 },
    rock: { name: 'The rock at the cliff', x: A.cliffRock.x + Math.sin(A.cliffRock.rot) * 2.5, z: A.cliffRock.z + Math.cos(A.cliffRock.rot) * 2.5, b: 285, p: -8 },
    wheel: { name: 'The Ferris wheel', x: A.ferrisWheel.x + 30, z: A.ferrisWheel.z + 30, b: 315, p: 12 },
    beach: { name: 'The beach', x: fr.W(P2.n0 - 6.2, 90)[0], z: fr.W(P2.n0 - 6.2, 90)[1], b: 318, p: 2 },   // on the dry sand south of the beach stairs, looking north along the wall
  };
  C.goto = (k) => { const p = C.PLACES[k]; if (!p) return; player.place(p.x, p.z); player.faceBearing(p.b); player.pitch = p.p * Math.PI / 180; return p.name; };
  C.placeName = (pos) => { let best = '', bd = 60; for (const k in C.PLACES) { const p = C.PLACES[k], d = Math.hypot(p.x - pos.x, p.z - pos.z); if (d < bd) { bd = d; best = p.name; } } return best; };

}
