// Worker da Cloudflare que entrega ao jogo as credenciais (temporárias) do TURN gratuito da Cloudflare.
// O TURN só é usado por quem não consegue ligação direta com o anfitrião (internet de celular, CGNAT, roteador fechado).
// O jogo busca este endereço ao criar ou entrar numa sala (VITE_TURN_ENDPOINT). Passo a passo: ./LEIA-ME.md
//
// Variáveis do Worker (Settings > Variables):
//   TURN_KEY_ID         id da chave TURN (Cloudflare > Calls > TURN)
//   TURN_KEY_API_TOKEN  token da chave (guarde como "Secret")
//   ALLOWED_ORIGINS     sites que podem pedir credenciais, separados por vírgula. Ex.: https://zomba.gabrielvidoretto.com.br

const TTL_SECONDS = 6 * 3600;

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') ?? '';
    const allowed = String(env.ALLOWED_ORIGINS ?? '').split(',').map((s) => s.trim().replace(/\/+$/, '')).filter(Boolean);
    const cors = { 'access-control-allow-origin': allowed.includes(origin) ? origin : allowed[0] ?? '', vary: 'Origin' };

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: { ...cors, 'access-control-allow-methods': 'GET', 'access-control-max-age': '86400' } });
    }
    if (request.method !== 'GET') return new Response('método não permitido', { status: 405, headers: cors });
    // páginas de outros sites (e pedidos sem origem, como curl) não podem gastar a cota
    if (!allowed.includes(origin)) return new Response('origem não permitida', { status: 403, headers: cors });
    if (!env.TURN_KEY_ID || !env.TURN_KEY_API_TOKEN) return new Response('TURN não configurado', { status: 500, headers: cors });

    const res = await fetch(`https://rtc.live.cloudflare.com/v1/turn/keys/${env.TURN_KEY_ID}/credentials/generate-ice-servers`, {
      method: 'POST',
      headers: { authorization: `Bearer ${env.TURN_KEY_API_TOKEN}`, 'content-type': 'application/json' },
      body: JSON.stringify({ ttl: TTL_SECONDS }),
    });
    if (!res.ok) return new Response('a Cloudflare recusou o pedido', { status: 502, headers: cors });
    const data = await res.json();
    // só o TURN (o jogo já tem o STUN dele) e sem a porta 53, que os navegadores bloqueiam
    const iceServers = (data.iceServers ?? [])
      .map((s) => ({ ...s, urls: [].concat(s.urls).filter((u) => u.startsWith('turn') && !/:53(\?|$)/.test(u)) }))
      .filter((s) => s.urls.length && s.username);
    return new Response(JSON.stringify({ iceServers }), {
      headers: { ...cors, 'content-type': 'application/json', 'cache-control': 'private, max-age=600' },
    });
  },
};
