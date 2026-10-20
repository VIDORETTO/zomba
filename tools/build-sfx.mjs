// Gera os sons gravados do jogo (public/sfx/*.ogg) a partir dos pacotes CC0 baixados.
// Uso: node tools/build-sfx.mjs <pasta "Prepared SFX Library"> <pasta Audio do Kenney Impact Sounds> <pasta dos zumbis>
// Pacotes (todos CC0; ver assets/LICENSES.md):
//   The Free Firearm Sound Library (opengameart.org/content/the-free-firearm-sound-library)
//   Kenney Impact Sounds (kenney.nl/assets/impact-sounds)
//   Zumbis, numa pasta só: zombie-1..24.wav de "Zombies Sound Pack" (artisticdude), fastzombie1.ogg e
//   zombienoise1..3.ogg de "Zombie noises and moans" (ianzazz) e darsycho_zombie-moans.ogg de "Zombie moans" (Darsycho)
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';

const [guns, kenney, zombies] = process.argv.slice(2);
if (!guns || !kenney || !zombies) throw new Error('uso: node tools/build-sfx.mjs <armas> <kenney/Audio> <zumbis>');
const out = 'public/sfx';
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

// [arquivo, início do disparo (s), duração (s)] — inícios achados pela análise de picos de cada gravação
const SHOTS = {
  // microfone perto: o estalo seco do tiro (duas ou três variações por família)
  'gun-pistol': [['Walther PPQ/X_31P.wav', 1.08, 0.5], ['1911/A_42P.wav', 0.94, 0.48], ['Bersa/F_47P.wav', 0.33, 0.62]],
  'gun-magnum': [['Ruger Single Six/S_14P.wav', 0.67, 0.7], ['Smith & Wesson 642/V_22P.wav', 0.67, 0.9]],
  'gun-rifle': [['AR-15/D_32P.wav', 0.7, 0.42], ['SKS/U_14P.wav', 3.58, 0.4], ['AK-47/C_28P.wav', 3.26, 0.4]],
  'gun-smg': [['Carl Gustav M45/G_31P.wav', 3.5, 0.36], ['PPSh/P_30P.wav', 0.97, 0.4]],
  'gun-shotgun': [['Mossberg/N_30P.wav', 4.96, 0.5], ['Nova/O_21P.wav', 0.43, 0.48], ['Model 12/K_22P.wav', 0.84, 0.5]],
  'gun-sniper': [['Tikka/W_29P.wav', 0.58, 0.7], ['Savage 10 .300 Blackout/T_17P.wav', 0.86, 0.7]],
  // microfone longe: o eco que fica no ar (tocado por baixo do estalo)
  'tail-pistol': [['1911/A_34P.wav', 1.54, 1.6]],
  'tail-magnum': [['Smith & Wesson 642/V_22P.wav', 5.51, 1.6]],
  'tail-rifle': [['AR-15/D_24P.wav', 0.55, 1.4]],
  'tail-smg': [['Bersa/F_41P.wav', 0.44, 1.2]],
  'tail-shotgun': [['Mossberg/N_26P.wav', 0.79, 1.6]],
  'tail-sniper': [['Tikka/W_24P.wav', 0.75, 1.6]],
};

const KENNEY = {
  'step-hard': ['footstep_concrete_000', 'footstep_concrete_001', 'footstep_concrete_002', 'footstep_concrete_003', 'footstep_concrete_004'],
  'step-wood': ['footstep_wood_000', 'footstep_wood_001', 'footstep_wood_002', 'footstep_wood_003', 'footstep_wood_004'],
  'step-dirt': ['footstep_grass_000', 'footstep_grass_001', 'footstep_grass_002', 'footstep_grass_003', 'footstep_grass_004'],
  'board-break': ['impactPlank_medium_000', 'impactPlank_medium_001', 'impactPlank_medium_002', 'impactPlank_medium_003'],
  'board-fix': ['impactWood_heavy_000', 'impactWood_heavy_001', 'impactWood_heavy_002'],
  'flesh': ['impactPunch_medium_000', 'impactPunch_medium_001', 'impactPunch_medium_002', 'impactPunch_heavy_000'],
};

// Corta, mistura em mono e normaliza o pico em -1 dB (o volumedetect sai no stderr do ffmpeg).
function run(input, name, filters) {
  const probe = spawnSync('ffmpeg', ['-hide_banner', '-i', input, '-af', `${filters},volumedetect`, '-f', 'null', '-'], { encoding: 'utf8' });
  const max = /max_volume: (-?[\d.]+) dB/.exec(probe.stderr ?? '');
  if (!max) throw new Error(`${input}: ${probe.stderr?.slice(-300)}`);
  const file = join(out, `${name}.ogg`);
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', input, '-af', `${filters},volume=${(-1 - Number(max[1])).toFixed(2)}dB`, '-ac', '1', '-ar', '44100', '-c:a', 'libvorbis', '-q:a', '5', file]);
  return statSync(file).size;
}

// Vozes dos zumbis: [arquivo, início (s), duração (s) ou 0 = inteiro]. Gemido = quem anda (mais grave,
// como os zumbis lentos do modo clássico); rosnado = quem corre ou dispara; golpe = ataque; morte = gemido bem grave.
const DARSYCHO = 'darsycho_zombie-moans.ogg';
const VOICES = {
  'z-moan': {
    pitch: 0.88,
    list: [['zombie-16.wav', 0, 0], ['zombie-17.wav', 0, 0], ['zombie-18.wav', 0, 0], ['zombie-21.wav', 0, 0], ['zombie-20.wav', 0, 0],
      ['zombie-15.wav', 0, 0], ['zombie-1.wav', 0, 0], ['zombie-4.wav', 0, 0], ['zombie-22.wav', 0, 0], ['zombie-23.wav', 0, 0],
      [DARSYCHO, 0.28, 2.64], [DARSYCHO, 3.67, 2.51], [DARSYCHO, 6.65, 2.2], [DARSYCHO, 11.53, 2.91], ['zombienoise1.ogg', 0, 0], ['zombienoise2.ogg', 0, 0]],
  },
  'z-growl': {
    pitch: 0.95,
    list: [['zombie-8.wav', 0, 0], ['zombie-9.wav', 0, 0], ['zombie-10.wav', 0, 0], ['zombie-11.wav', 0, 0], ['zombie-12.wav', 0, 0],
      ['zombie-14.wav', 0, 0], ['zombie-19.wav', 0, 0], ['zombienoise3.ogg', 0, 0], [DARSYCHO, 9.3, 0.85], [DARSYCHO, 10.43, 0.78]],
  },
  'z-attack': {
    pitch: 1,
    list: [['zombie-3.wav', 0, 0], ['zombie-5.wav', 0, 0], ['zombie-6.wav', 0, 0], ['zombie-7.wav', 0, 0], ['zombie-24.wav', 0, 0], ['zombie-13.wav', 0, 0], ['fastzombie1.ogg', 0, 0]],
  },
  'z-death': {
    pitch: 0.76,
    list: [['zombie-16.wav', 0, 0], ['zombie-17.wav', 0, 0], ['zombie-18.wav', 0, 0], ['zombie-2.wav', 0, 0], [DARSYCHO, 3.67, 2.51]],
  },
};

let total = 0;
for (const [base, list] of Object.entries(SHOTS)) {
  list.forEach(([f, start, dur], i) => {
    const s = Math.max(0, start - 0.004);
    const fade = dur * 0.45;
    // o estalo de perto é comprimido (mais corpo, como tiro de jogo); o eco fica natural
    const comp = base.startsWith('gun-') ? ',acompressor=threshold=0.05:ratio=8:attack=0.5:release=80' : '';
    const filters = `atrim=start=${s}:duration=${dur},asetpts=PTS-STARTPTS,pan=mono|c0=0.5*c0+0.5*c1,highpass=f=35${comp},afade=t=in:d=0.002,afade=t=out:st=${(dur - fade).toFixed(3)}:d=${fade.toFixed(3)}`;
    total += run(join(guns, f), `${base}-${i}`, filters);
  });
}
for (const [base, list] of Object.entries(KENNEY)) {
  list.forEach((f, i) => {
    total += run(join(kenney, `${f}.ogg`), `${base}-${i}`, 'anull');
  });
}
for (const [base, { pitch, list }] of Object.entries(VOICES)) {
  list.forEach(([file, start, dur], i) => {
    const trim = dur ? `atrim=start=${start}:duration=${dur},asetpts=PTS-STARTPTS,` : '';
    // tom mais grave sem mudar a qualidade: toca o áudio mais devagar (fica também um pouco mais longo)
    const tone = pitch !== 1 ? `,aresample=44100,asetrate=${Math.round(44100 * pitch)},aresample=44100` : '';
    const filters = `${trim}aformat=channel_layouts=mono,highpass=f=50${tone},areverse,afade=t=in:d=0.12,areverse,afade=t=in:d=0.006`;
    total += run(join(zombies, file), `${base}-${i}`, filters);
  });
}
console.log(`pronto: ${(total / 1024).toFixed(0)} KB em ${out}`);
