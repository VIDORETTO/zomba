// Diagnóstico do modo direto: acha o roteador pelo UPnP, lê o IP externo dele e compara com o IP público.
// Não abre porta nenhuma. Uso: node tools/upnp-probe.mjs [porta para conferir se está aberta]
import { networkInterfaces } from 'node:os';
import { externalIp, findRouter, portTarget, unreachable } from '../servidor/upnp.mjs';

const all = Object.values(networkInterfaces()).flat().filter((a) => a && a.family === 'IPv4' && !a.internal);
const lan = (all.find((a) => a.address.startsWith('192.168.')) ?? all[0])?.address;
console.log('IP na rede local:', lan);
const svc = await findRouter(lan);
console.log('roteador com UPnP:', svc ? svc.url : 'nenhum respondeu');
const ext = svc ? await externalIp(svc).catch((e) => `erro: ${e.message}`) : null;
console.log('IP externo do roteador:', ext);
const pub = await (await fetch('https://api.ipify.org')).text();
console.log('IP público visto da internet:', pub);
if (ext && ext !== pub) console.log(/^100\./.test(ext) && unreachable(ext) ? 'CGNAT da operadora: o modo direto não funciona nesta internet' : 'dois roteadores em sequência: o modem da operadora precisa de DMZ (ou modo bridge) para o modo direto');
else if (ext) console.log('modo direto deve funcionar');
if (svc && process.argv[2]) console.log('porta', process.argv[2], 'aberta para:', (await portTarget(svc, Number(process.argv[2]))) ?? 'fechada');
