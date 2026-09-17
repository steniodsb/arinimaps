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
};

export default nextConfig;
