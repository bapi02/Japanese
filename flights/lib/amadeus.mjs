// Amadeus Self-Service API 얇은 클라이언트.
// Node 18+ 와 Cloudflare Worker 양쪽에서 전역 fetch 로 동작한다.

const HOSTS = {
  test: 'https://test.api.amadeus.com',
  production: 'https://api.amadeus.com',
};

export class AmadeusError extends Error {
  constructor(message, status, body) {
    super(message);
    this.name = 'AmadeusError';
    this.status = status;
    this.body = body;
  }
}

export function createClient({ clientId, clientSecret, env = 'production', fetchImpl = fetch }) {
  if (!clientId || !clientSecret) throw new Error('Amadeus clientId / clientSecret 이 필요합니다.');
  const host = HOSTS[env] || HOSTS.production;
  let token = null;
  let tokenExpiresAt = 0;

  async function getToken() {
    if (token && Date.now() < tokenExpiresAt - 30_000) return token;
    const res = await fetchImpl(`${host}/v1/security/oauth2/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: clientId,
        client_secret: clientSecret,
      }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new AmadeusError('Amadeus 토큰 발급 실패', res.status, body);
    token = body.access_token;
    tokenExpiresAt = Date.now() + (body.expires_in ?? 1799) * 1000;
    return token;
  }

  /** GET /v2/shopping/flight-offers */
  async function flightOffers(params) {
    const t = await getToken();
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (v === undefined || v === null || v === '') continue;
      qs.set(k, String(v));
    }
    const res = await fetchImpl(`${host}/v2/shopping/flight-offers?${qs}`, {
      headers: { Authorization: `Bearer ${t}` },
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      const detail = body?.errors?.[0]?.detail || body?.errors?.[0]?.title || res.statusText;
      throw new AmadeusError(`항공권 조회 실패: ${detail}`, res.status, body);
    }
    return body;
  }

  return { flightOffers, getToken, host };
}
