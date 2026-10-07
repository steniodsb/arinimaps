import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    /**
     * O proxy (src/proxy.ts) intercepta a requisição para renovar a sessão do
     * Supabase e, para isso, precisa ter o corpo em mãos — o padrão do Next é
     * guardar só os primeiros 10 MB. Medido em 10/09/2026: o DXF de Iturama tem
     * 103 MB e o upload morria com "Failed to parse body as FormData", sem que
     * nada no navegador dissesse por quê. A rota de cartografia foi tirada do
     * matcher do proxy (ela mesma confere a sessão), e este limite fica como
     * rede de segurança para qualquer outro envio grande.
     */
    proxyClientMaxBodySize: "220mb",
  },
  /**
   * Cabeçalhos de segurança em todas as respostas (item 6.2 do roadmap):
   *  · nosniff — o navegador não "adivinha" tipo: arquivo servido como imagem não vira página;
   *  · frame-ancestors/X-Frame-Options — o site não pode ser embutido em outro (clickjacking);
   *  · object-src/base-uri/form-action — fecham vetores clássicos de injeção sem
   *    mexer nos scripts (uma CSP completa de script-src exige nonce e fica para
   *    quando houver homologação para testar o mapa, o tour e o satélite);
   *  · HSTS — só tem efeito em https; o navegador passa a recusar http por 1 ano;
   *  · Permissions-Policy — câmera (selfie do aceite) e localização só no próprio site.
   */
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'self'; object-src 'none'; base-uri 'self'; form-action 'self'" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Strict-Transport-Security", value: "max-age=31536000" },
          { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=(self), payment=(), usb=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
