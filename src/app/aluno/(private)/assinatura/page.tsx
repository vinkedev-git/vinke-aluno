import { Suspense } from "react";
import AssinaturaClient from "./assinatura-client";

export const dynamic = "force-dynamic";

export default function Page() {
  return (
    <Suspense fallback={null}>
      <AssinaturaClient />
    </Suspense>
  );
}
