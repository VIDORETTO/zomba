// Traçado da planta de referência em pixels da imagem mostrada em 2000x1125.
// Conversão: x_m = (px - 1000) * 0.15 ; z_m = (py - 560) * 0.15  (z cresce para baixo na planta = sul)
export const SCALE = 0.15;
export const ORIGIN = [1000, 560];

// Áreas jogáveis. kind: chao (piso firme), pe (pegada de colosso; piso firme onde o pé desce), tanque (plataforma do tanque)
// area = id da porta que libera (null = início; 'lama' = qualquer porta que leve à Terra de Ninguém)
export const AREAS = [
  // ---- início ----
  { id: 'posto', name: 'Posto de Comando (G1)', area: null, kind: 'chao', poly: [[1632, 820], [1742, 820], [1742, 910], [1800, 910], [1800, 1005], [1742, 1005], [1742, 968], [1632, 968]] },
  // ---- porta 'casamata' (750) ----
  { id: 'trinch-leste-anel', name: 'Trincheira Leste (anel)', area: 'casamata', kind: 'chao', poly: [[1525, 680], [1608, 680], [1608, 750], [1525, 750]], pillar: [[1550, 702], [1583, 734]] },
  { id: 'trinch-leste-diag', name: 'Trincheira Leste (rampa ao Posto)', area: 'casamata', kind: 'chao', poly: [[1585, 750], [1608, 750], [1665, 822], [1638, 822]] },
  { id: 'trinch-leste-sobe', name: 'Trincheira Leste (subida à Casamata)', area: 'casamata', kind: 'chao', poly: [[1448, 515], [1497, 515], [1497, 600], [1545, 682], [1518, 690], [1470, 622], [1448, 622]] },
  { id: 'casamata', name: 'Casamata (G2)', area: 'casamata', kind: 'chao', poly: [[1428, 431], [1497, 431], [1497, 515], [1428, 515], [1418, 490], [1418, 455]] },
  { id: 'casamata-norte', name: 'Casamata (corredor norte)', area: 'casamata', kind: 'chao', poly: [[1448, 369], [1469, 369], [1469, 431], [1448, 431]] },
  { id: 'casamata-ponte', name: 'Casamata (passarela para a lama)', area: 'casamata', kind: 'chao', poly: [[1458, 335], [1512, 262], [1534, 276], [1480, 350], [1469, 369], [1448, 369]] },
  { id: 'bunker', name: 'Cripta da Casamata (tábua)', area: 'casamata', kind: 'chao', poly: [[1497, 417], [1531, 417], [1531, 556], [1497, 556]] },
  { id: 'bunker-lajes', name: 'Cripta (lajes de pedra)', area: 'casamata', kind: 'chao', poly: [[1594, 417], [1628, 417], [1628, 556], [1594, 556]] },
  // ---- porta 'estacao' (750) ----
  { id: 'estacao', name: 'Estação do Tanque', area: 'estacao', kind: 'chao', poly: [[1356, 775], [1450, 775], [1450, 790], [1600, 790], [1600, 905], [1633, 905], [1633, 940], [1356, 940]] },
  { id: 'estacao-plat', name: 'Plataforma da Estação', area: 'estacao', kind: 'tanque', poly: [[1376, 844], [1449, 844], [1449, 938], [1376, 938]] },
  { id: 'estacao-rampa', name: 'Rampa da Estação', area: 'estacao', kind: 'tanque', poly: [[1428, 790], [1488, 722], [1508, 738], [1450, 805]] },
  // ---- porta 'oficina' (1000, três portões) ----
  { id: 'oficina-galpao', name: 'Oficina (galpão)', area: 'oficina', kind: 'chao', poly: [[1264, 365], [1413, 365], [1413, 415], [1395, 415], [1395, 460], [1370, 460], [1370, 490], [1350, 490], [1350, 546], [1320, 546], [1320, 490], [1295, 460], [1295, 415], [1264, 415]] },
  { id: 'oficina-liga', name: 'Oficina (passagem à Casamata)', area: 'oficina', kind: 'chao', poly: [[1413, 385], [1448, 385], [1448, 405], [1413, 405]] },
  { id: 'oficina', name: 'Oficina (G3)', area: 'oficina', kind: 'chao', poly: [[1236, 546], [1372, 546], [1372, 626], [1326, 626], [1326, 640], [1389, 640], [1389, 709], [1326, 709], [1326, 674], [1236, 674]] },
  // ---- Terra de Ninguém (livre a partir de 'casamata' OU 'estacao') ----
  { id: 'faixa', name: 'Terra de Ninguém (faixa firme)', area: 'lama', kind: 'chao', poly: [[1060, 342], [1264, 372], [1264, 398], [1060, 372]] },
  // ---- Escavação (livre a partir da lama) ----
  { id: 'cunha', name: 'Escavação (cunha norte)', area: 'lama', kind: 'chao', poly: [[875, 330], [930, 326], [1050, 382], [1060, 500], [1030, 500], [1030, 448], [930, 448], [878, 445]] },
  { id: 'esc-leste', name: 'Escavação (corredor leste)', area: 'lama', kind: 'chao', poly: [[960, 500], [1060, 500], [1060, 535], [960, 525]] },
  { id: 'esc-sul', name: 'Escavação (corredor sul)', area: 'lama', kind: 'chao', poly: [[885, 575], [920, 575], [920, 640], [998, 632], [998, 662], [893, 676], [885, 676]] },
  { id: 'esc-oeste', name: 'Escavação (corredor oeste)', area: 'lama', kind: 'chao', poly: [[745, 500], [840, 500], [840, 524], [745, 524]] },
  { id: 'esc-laco', name: 'Escavação (laço oeste)', area: 'lama', kind: 'chao', poly: [[729, 398], [767, 398], [767, 578], [756, 600], [745, 650], [760, 690], [826, 672], [826, 700], [760, 725], [712, 700], [700, 640], [729, 578]] },
  { id: 'esc-laco-topo', name: 'Escavação (topo do laço)', area: 'lama', kind: 'chao', poly: [[729, 398], [770, 383], [800, 383], [850, 452], [835, 462], [785, 405], [767, 410]] },
  { id: 'esc-trilha', name: 'Trilha oeste (até o barracão)', area: 'lama', kind: 'chao', poly: [[607, 519], [745, 519], [745, 541], [607, 541]] },
  { id: 'f-lama', name: 'Descida sul (F até a lama)', area: 'lama', kind: 'chao', poly: [[845, 789], [878, 789], [884, 840], [850, 840]] },
  { id: 'e-lama', name: 'Descida sul (E até a lama)', area: 'lama', kind: 'chao', poly: [[1010, 675], [1045, 675], [1045, 745], [1010, 745]] },
  // ---- porta 'vala' (1000, dois portões) ----
  { id: 'vala', name: 'Vala Sul (G4)', area: 'vala', kind: 'chao', poly: [[830, 880], [915, 866], [960, 840], [997, 806], [997, 945], [960, 985], [889, 1015], [889, 935], [830, 935]] },
  { id: 'vala-portao-leste', name: 'Vala Sul (portão leste)', area: 'vala', kind: 'chao', poly: [[1032, 772], [1059, 772], [1059, 803], [1032, 803]] },
  // ---- porta 'quartel' (1250, dois portões) ----
  { id: 'quartel', name: 'Quartel Norte (G5)', area: 'quartel', kind: 'chao', poly: [[877, 47], [1047, 47], [1047, 190], [981, 190], [981, 131], [877, 131]] },
  { id: 'quartel-desce', name: 'Quartel Norte (descida)', area: 'quartel', kind: 'chao', poly: [[836, 176], [866, 176], [884, 262], [852, 266]] },
  // ---- porta 'igreja' (1250) ou pelo tanque ----
  { id: 'igreja', name: 'Igreja', area: 'igreja', kind: 'chao', poly: [[359, 495], [482, 469], [527, 686], [503, 692], [506, 741], [409, 741], [401, 686]] },
  { id: 'igreja-plat', name: 'Plataforma da Igreja', area: 'igreja', kind: 'tanque', poly: [[392, 470], [400, 446], [420, 438], [440, 442], [535, 395], [548, 418], [455, 470]] },
  { id: 'oeste-liga', name: 'Posto Oeste (corredor)', area: 'igreja', kind: 'chao', poly: [[301, 692], [336, 692], [336, 717], [301, 717]] },
  { id: 'oeste', name: 'Posto Oeste (G6)', area: 'igreja', kind: 'chao', poly: [[201, 623], [301, 623], [301, 737], [201, 737]] },
];

// Pegadas dos colossos (piso firme onde o pé desce). Cada uma pertence à área em que está.
export const FEET = [
  { id: 'K', robot: 'atlas', area: 'quartel', r: [815, 47, 874, 176] },
  { id: 'A', robot: 'atlas', area: 'lama', r: [815, 300, 875, 430] },
  { id: 'F', robot: 'atlas', area: 'lama', r: [823, 657, 893, 789] },
  { id: 'H', robot: 'atlas', area: 'vala', r: [823, 932, 889, 1074] },
  { id: 'B', robot: 'golias', area: 'quartel', r: [981, 190, 1047, 329] },
  { id: 'E', robot: 'golias', area: 'lama', r: [998, 535, 1067, 675] },
  { id: 'G', robot: 'golias', area: 'vala', r: [997, 800, 1070, 945] },
  { id: 'D', robot: 'tita', area: 'igreja', r: [336, 606, 406, 741] },
  { id: 'C', robot: 'tita', area: 'lama', r: [541, 501, 607, 640] },
  { id: 'I', robot: 'tita', area: 'oficina', r: [1372, 542, 1435, 678] },
  { id: 'J', robot: 'tita', area: 'casamata', r: [1531, 417, 1594, 556] },
];

// Lama (Terra de Ninguém): faixas com largura em px
export const MUD = [
  { id: 'lama-norte-leste', w: 46, path: [[515, 520], [528, 440], [580, 375], [660, 322], [760, 287], [870, 287], [960, 312], [1050, 342], [1150, 315], [1300, 264], [1430, 250], [1530, 264], [1615, 302], [1660, 382], [1670, 470], [1660, 560], [1615, 630], [1560, 682]] },
  { id: 'lama-sul-larga', w: 72, path: [[1010, 740], [1200, 735], [1440, 732]] },
  { id: 'lama-oeste-sul', w: 46, path: [[515, 520], [522, 600], [560, 690], [640, 780], [740, 850], [850, 868], [930, 842], [990, 792], [1060, 762], [1200, 748], [1350, 744], [1440, 742], [1495, 712], [1535, 690], [1560, 682]] },
];

// Escavação: anel (centro, raio externo, raio do fosso)
export const RING = { c: [900, 512], r: 70, hole: 13 };

// Faixa curva da plataforma norte do tanque (dentro da cunha)
export const TANK_N = { id: 'norte-plat', poly: [[962, 382], [985, 378], [990, 460], [966, 460]] };

// Rota do tanque (laço fechado, sentido: Estação -> sul -> Igreja -> norte -> Escavação Norte -> leste -> Estação)
export const TANK_PATH = [
  [1412, 890, 'estacao'], [1440, 800], [1480, 735], [1440, 742], [1350, 744], [1200, 748], [1060, 762], [990, 792], [930, 842], [850, 868],
  [740, 850], [640, 780], [560, 690], [522, 600], [515, 520], [528, 470], [500, 430, 'igreja'], [580, 375], [660, 322], [760, 287], [870, 287],
  [960, 312], [976, 400, 'norte'], [1010, 330], [1150, 315], [1300, 264], [1430, 250], [1530, 264], [1615, 302], [1660, 382], [1670, 470],
  [1660, 560], [1615, 630], [1560, 682], [1500, 715], [1440, 790],
];

export const POINTS = {
  gen: { G1: [1687, 868], G2: [1452, 465], G3: [1280, 602], G4: [928, 920], G5: [926, 90], G6: [248, 682] },
  box: { G1: [1785, 940], G2: [1515, 445], G3: [1310, 565], G4: [970, 855], G5: [925, 55], G6: [420, 683] },
  fizz: { G1: [1785, 983], G2: [1485, 453], G3: [1313, 635], G4: [905, 965], G5: [962, 110], G6: [285, 645] },
  perk: { folego: [1717, 912], reflexo: [1415, 657], couraca: [862, 908], gatilho: [893, 115] },
  forja: [900, 512],
  gramofone: [865, 523],
  disco: [[758, 463], [950, 519], [1048, 513]],
  peca_fogo: [[474, 583], [502, 651], [286, 717]],
  peca_gelo: [[1533, 450], [1528, 533], [1612, 540]],
  peca_raio: [[940, 778], [1052, 908], [897, 943]],
  peca_vento: [[1025, 80], [870, 115], [918, 180]],
  portal: { fogo: [1575, 930], vento: [1035, 880], raio: [990, 158], gelo: [428, 738] },
  bau: [[850, 145], [574, 608], [1032, 646], [855, 962]],
  lapide: [[1597, 275], [835, 623], [786, 1012]],
  domo: [[694, 400], [891, 229], [987, 920]],
  carroca: [[948, 258], [1104, 465], [793, 775]],
  tabua: [1612, 515],
  altar_igreja: [458, 650],
  desafio: [[1690, 965], [250, 742]],
  escudo_rodas: [[1523, 255], [1560, 430], [1577, 690]],
  escudo_trava: [[1340, 590], [1525, 820], [1568, 968]],
  escudo_armacao: [[857, 320], [878, 706], [852, 1056]],
  drone_cerebro: [1745, 972],
  drone_helice: [925, 550],
  drone_corpo: [[633, 350], [690, 833], [440, 755]],
  pa: [[1600, 925], [1758, 912], [930, 180], [1032, 920], [390, 530]],
  monte: [[843, 108], [585, 380], [845, 418], [1300, 282], [1505, 285], [1645, 477], [1645, 527], [1257, 655], [987, 647], [1258, 745], [1525, 767], [1622, 790], [1488, 868], [1540, 962], [905, 890], [758, 857], [625, 773], [218, 707]],
  bancada: [[1660, 840], [1330, 392], [440, 560]],
  spawn: [[1660, 850], [1712, 850], [1660, 940], [1712, 940]],
};

// Portões comprados: mesmo id = abrem juntos. (x, y) no meio do vão; n = normal (lado de quem compra), w em px
export const DOORS = [
  { id: 'casamata', name: 'Casamata', cost: 750, gates: [{ at: [1651, 821], n: [0, 1], w: 27 }] },
  { id: 'estacao', name: 'Estação do Tanque', cost: 750, gates: [{ at: [1633, 922], n: [1, 0], w: 30 }] },
  { id: 'oficina', name: 'Oficina', cost: 1000, gates: [{ at: [1430, 395], n: [1, 0], w: 20 }, { at: [1264, 385], n: [-1, 0], w: 26 }, { at: [1357, 709], n: [0, 1], w: 30 }] },
  { id: 'vala', name: 'Vala Sul', cost: 1000, gates: [{ at: [870, 872], n: [0, -1], w: 30 }, { at: [1045, 772], n: [0, -1], w: 27 }] },
  { id: 'quartel', name: 'Quartel Norte', cost: 1250, gates: [{ at: [868, 264], n: [0, 1], w: 30 }, { at: [1014, 329], n: [0, 1], w: 30 }] },
  { id: 'igreja', name: 'Igreja', cost: 1250, gates: [{ at: [510, 610], n: [1, 0], w: 27 }] },
];

// Barricadas (janelas com tábuas). n aponta para dentro da área
export const ENTRIES = [
  { area: 'posto', at: [1742, 860], n: [-1, 0] }, { area: 'posto', at: [1665, 968], n: [0, -1] },
  { area: 'estacao', at: [1356, 810], n: [1, 0] }, { area: 'casamata', at: [1418, 472], n: [1, 0] },
  { area: 'oficina', at: [1236, 610], n: [1, 0] }, { area: 'quartel', at: [1047, 100], n: [-1, 0] },
  { area: 'vala', at: [856, 1074], n: [0, -1] }, { area: 'igreja', at: [470, 741], n: [0, -1] },
  { area: 'oeste', at: [201, 680], n: [1, 0] },
];
