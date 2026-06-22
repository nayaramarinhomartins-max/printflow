# PrintFlow — Sistema de Gestão Gráfica

Sistema web completo para gestão de produção gráfica — desenvolvido com React, TypeScript, Vite, Tailwind CSS e Supabase.

## Sobre o projeto

Plataforma SaaS para empresas gráficas gerenciarem pedidos, produção, templates e anúncios em um único sistema, substituindo controles manuais e planilhas.

## Módulos

- **Dashboard** — visão geral de produção, pedidos e KPIs
- **Produção** — controle de itens em produção com status e fluxo
- **Produção em Massa** — processamento de múltiplos itens
- **Templates** — biblioteca de templates por categoria
- **Anúncios** — gestão de anúncios vinculados a templates
- **Histórico** — registro completo de pedidos
- **Importação** — importação de pedidos em lote
- **Impressão** — geração de documentos para impressão
- **Configurações** — gestão de usuários e preferências

## Stack

- React + TypeScript
- Vite
- Tailwind CSS
- Supabase (autenticação e banco de dados)
- Recharts (gráficos)
- Lucide React (ícones)

## Como rodar

```bash
npm install
cp .env.example .env
# preencha as variáveis no .env
npm run dev
```

## Variáveis de ambiente

```
VITE_SUPABASE_URL=sua_url_do_supabase
VITE_SUPABASE_ANON_KEY=sua_chave_anonima_do_supabase
```

## Desenvolvido por

[Nayara Martins](https://linkedin.com/in/nayaramartinsdev) — Desenvolvedora de Sistemas para Empresas
