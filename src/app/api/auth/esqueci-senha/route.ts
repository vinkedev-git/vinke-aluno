export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth } from "@/lib/firebaseAdmin";
import { Resend } from "resend";

const getResend = () => new Resend(process.env.RESEND_API_KEY);

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://aluno.vinke.app.br";
const LOGO_URL = `${APP_URL}/logo-icon.png`;

function buildEmailHtml(resetLink: string): string {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Redefinição de senha</title>
</head>
<body style="margin:0;padding:0;background-color:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f1f5f9;padding:40px 16px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">

          <!-- Header -->
          <tr>
            <td align="center" style="background:linear-gradient(135deg,#1e3a8a 0%,#1d4ed8 50%,#2563eb 100%);border-radius:20px 20px 0 0;padding:36px 32px 32px;">
              <img src="${LOGO_URL}" alt="Vinke" width="64" height="64"
                style="display:block;margin:0 auto 16px;border-radius:16px;" />
              <p style="margin:0;font-size:13px;font-weight:600;letter-spacing:0.12em;text-transform:uppercase;color:rgba(147,197,253,0.9);">
                Vinke
              </p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="background:#ffffff;padding:40px 40px 32px;border-left:1px solid #e2e8f0;border-right:1px solid #e2e8f0;">
              <h1 style="margin:0 0 12px;font-size:24px;font-weight:700;color:#0f172a;line-height:1.3;">
                Redefinição de senha
              </h1>
              <p style="margin:0 0 24px;font-size:15px;color:#475569;line-height:1.6;">
                Recebemos uma solicitação para redefinir a senha da sua conta.
                Clique no botão abaixo para criar uma nova senha:
              </p>

              <!-- CTA Button -->
              <table cellpadding="0" cellspacing="0" style="margin:0 0 28px;">
                <tr>
                  <td align="center" style="border-radius:12px;background:linear-gradient(135deg,#1d4ed8,#2563eb);">
                    <a href="${resetLink}"
                      style="display:inline-block;padding:14px 32px;font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:12px;letter-spacing:0.01em;">
                      Redefinir minha senha
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin:0 0 8px;font-size:13px;color:#94a3b8;line-height:1.6;">
                Se o botão não funcionar, copie e cole o link abaixo no seu navegador:
              </p>
              <p style="margin:0 0 28px;font-size:12px;color:#64748b;word-break:break-all;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:10px 12px;">
                ${resetLink}
              </p>

              <!-- Warning box -->
              <table cellpadding="0" cellspacing="0" width="100%">
                <tr>
                  <td style="background:#fefce8;border:1px solid #fde68a;border-radius:10px;padding:14px 16px;">
                    <p style="margin:0;font-size:13px;color:#92400e;line-height:1.5;">
                      <strong>Este link expira em 1 hora.</strong> Se você não solicitou a redefinição de senha, ignore este e-mail — sua conta permanece segura.
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background:#f8fafc;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 20px 20px;padding:24px 40px;">
              <p style="margin:0 0 6px;font-size:13px;color:#94a3b8;text-align:center;">
                Enviado por <strong style="color:#64748b;">Vinke</strong>
              </p>
              <p style="margin:0;font-size:12px;color:#cbd5e1;text-align:center;">
                © ${new Date().getFullYear()} Vinke — Todos os direitos reservados
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

// Simples rate limit em memória (por processo — suficiente para início)
const _attempts = new Map<string, { count: number; resetAt: number }>();
function isRateLimited(email: string): boolean {
  const now = Date.now();
  const entry = _attempts.get(email);
  if (!entry || now > entry.resetAt) {
    _attempts.set(email, { count: 1, resetAt: now + 60_000 });
    return false;
  }
  if (entry.count >= 3) return true;
  entry.count += 1;
  return false;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as { email?: unknown };
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";

    if (!email || !email.includes("@")) {
      return NextResponse.json({ ok: false, error: "E-mail inválido." }, { status: 400 });
    }

    // Rate limit: máximo 3 tentativas por e-mail por minuto
    if (isRateLimited(email)) {
      // Retorna ok=true para não revelar se o e-mail existe
      return NextResponse.json({ ok: true });
    }

    const actionCodeSettings = {
      // URL para onde o Firebase redireciona DEPOIS de processar o reset.
      // Para que o link vá DIRETO para nossa página (sem passar pelo Firebase),
      // é necessário configurar o "Custom action URL" no Firebase Console:
      //   Authentication > Templates > Password reset > (lápis) > Customize action URL
      //   → https://aluno.vinke.app.br/aluno/redefinir-senha
      url: `${APP_URL}/aluno/entrar`,
      handleCodeInApp: false,
    };

    // Gera o link de redefinição via Firebase Admin
    const resetLink = await getAdminAuth().generatePasswordResetLink(email, actionCodeSettings);

    // Envia o e-mail bonito via Resend
    await getResend().emails.send({
      from: "Vinke <noreply@vinke.app.br>",
      to: email,
      subject: "Redefinição de senha — Vinke",
      html: buildEmailHtml(resetLink),
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    // Loga só a mensagem — nunca o objeto completo (pode conter e-mail do usuário)
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[esqueci-senha]", msg);
    // Sempre retorna ok=true para não revelar se o e-mail existe no sistema
    return NextResponse.json({ ok: true });
  }
}
