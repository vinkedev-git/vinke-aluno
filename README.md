# Vinke — Portal do Aluno

Portal do aluno do **Vinke**, plataforma de questões para o ENEM: caderno de questões, questão do dia, simulados, flashcards e acompanhamento de estudo.

Base derivada do código do Anestesia Questões, com infraestrutura 100% independente (Firebase, Vercel e integrações próprias).

## Stack

- Next.js (App Router) + React + TypeScript + Tailwind
- Firebase: Firestore, Auth (client + Admin SDK)
- Resend (e-mails transacionais)

## Rodando localmente

1. Copie `.env.example` para `.env.local` e preencha com as credenciais do projeto Firebase do Vinke.
2. Instale e rode:

```bash
npm install
npm run dev
```

Acesse http://localhost:3000/aluno.
