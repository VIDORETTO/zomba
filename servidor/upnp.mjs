// Abre e fecha uma porta no roteador pelo UPnP (o "abrir porta automático" que a maioria dos roteadores tem),
// para o modo direto do servidor, sem Cloudflare. Sem bibliotecas: SSDP para achar o roteador e SOAP para pedir.
import dgram from 'node:dgram';

const SSDP = { host: '239.255.255.250', port: 1900 };
const TARGETS = [
  'urn:schemas-upnp-org:device:InternetGatewayDevice:1',
  'urn:schemas-upnp-org:device:InternetGatewayDevice:2',
  'urn:schemas-upnp-org:service:WANIPConnection:1',
  'urn:schemas-upnp-org:service:WANPPPConnection:1',
];

// Procura roteadores na rede: devolve os endereços das descrições (LOCATION) que responderam.
function search(lanIp, ms) {
  return new Promise((ok) => {
    const found = new Set();
    const sock = dgram.createSocket({ type: 'udp4', reuseAddr: true });
    const done = () => {
      try {
        sock.close();
      } catch {
        // já fechado
      }
      ok([...found]);
    };
    sock.on('error', done);
    sock.on('message', (buf) => {
      const loc = /^location:\s*(\S+)/im.exec(buf.toString())?.[1];
      if (loc) found.add(loc);
    });
    // sai pela placa da rede local (e não pela do Tailscale, Docker ou VPN)
    sock.bind(0, lanIp, () => {
      try {
        sock.setMulticastInterface(lanIp);
      } catch {
        // segue com a placa padrão
      }
      for (const st of TARGETS) {
        const msg = Buffer.from(`M-SEARCH * HTTP/1.1\r\nHOST: ${SSDP.host}:${SSDP.port}\r\nMAN: "ssdp:discover"\r\nMX: 2\r\nST: ${st}\r\n\r\n`);
        sock.send(msg, SSDP.port, SSDP.host);
      }
      setTimeout(done, ms);
    });
  });
}

const tag = (xml, name) => new RegExp(`<(?:\\w+:)?${name}>([^<]*)</(?:\\w+:)?${name}>`, 'i').exec(xml)?.[1]?.trim();

// Lê a descrição do roteador e acha o serviço que abre portas (WANIPConnection ou WANPPPConnection).
async function service(location) {
  const xml = await (await fetch(location, { signal: AbortSignal.timeout(4000) })).text();
  const base = tag(xml, 'URLBase') || location;
  for (const block of xml.match(/<service>[\s\S]*?<\/service>/gi) ?? []) {
    const type = tag(block, 'serviceType');
    const control = tag(block, 'controlURL');
    if (type && control && /WAN(IP|PPP)Connection/.test(type)) return { type, url: new URL(control, base).href };
  }
  return null;
}

async function soap(svc, action, args = {}) {
  const body = `<?xml version="1.0"?>
<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/">
<s:Body><u:${action} xmlns:u="${svc.type}">${Object.entries(args).map(([k, v]) => `<${k}>${v}</${k}>`).join('')}</u:${action}></s:Body>
</s:Envelope>`;
  const res = await fetch(svc.url, {
    method: 'POST',
    headers: { 'content-type': 'text/xml; charset="utf-8"', soapaction: `"${svc.type}#${action}"` },
    body,
    signal: AbortSignal.timeout(5000),
  });
  const text = await res.text();
  if (!res.ok) {
    const code = tag(text, 'errorCode');
    const err = new Error(`${tag(text, 'errorDescription') ?? `erro ${res.status}`}${code ? ` (${code})` : ''}`);
    err.code = code;
    throw err;
  }
  return text;
}

// Acha o roteador. Devolve null se nenhum responder (UPnP desligado ou roteador sem suporte).
export async function findRouter(lanIp, ms = 3000) {
  for (const loc of await search(lanIp, ms)) {
    try {
      const svc = await service(loc);
      if (svc) return svc;
    } catch {
      // descrição ilegível: tenta o próximo
    }
  }
  return null;
}

export async function externalIp(svc) {
  return tag(await soap(svc, 'GetExternalIPAddress'), 'NewExternalIPAddress') || null;
}

// Abre a porta TCP (mesmo número fora e dentro) para este computador. Prefere um prazo (some sozinha se o
// computador desligar sem fechar); roteadores que só aceitam porta permanente recebem prazo 0.
export async function openPort(svc, lanIp, port, leaseSeconds = 3600) {
  const args = (lease) => ({
    NewRemoteHost: '',
    NewExternalPort: port,
    NewProtocol: 'TCP',
    NewInternalPort: port,
    NewInternalClient: lanIp,
    NewEnabled: 1,
    NewPortMappingDescription: 'Zomba',
    NewLeaseDuration: lease,
  });
  try {
    await soap(svc, 'AddPortMapping', args(leaseSeconds));
    return leaseSeconds;
  } catch (err) {
    if (err.code !== '725') throw err;
    await soap(svc, 'AddPortMapping', args(0));
    return 0;
  }
}

// para quem a porta está aberta no roteador (null: fechada)
export async function portTarget(svc, port) {
  try {
    const xml = await soap(svc, 'GetSpecificPortMappingEntry', { NewRemoteHost: '', NewExternalPort: port, NewProtocol: 'TCP' });
    return tag(xml, 'NewInternalClient') ?? null;
  } catch {
    return null;
  }
}

export async function closePort(svc, port) {
  await soap(svc, 'DeletePortMapping', { NewRemoteHost: '', NewExternalPort: port, NewProtocol: 'TCP' });
}

// Endereço que não serve para receber conexões de fora: rede privada ou CGNAT da operadora (100.64.0.0/10)
export function unreachable(ip) {
  return /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|127\.|0\.)/.test(ip) || /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(ip);
}
