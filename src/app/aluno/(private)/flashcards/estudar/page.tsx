import { Suspense } from "react";
import EstudarClient from "./estudar-client";

export const dynamic = "force-dynamic";

export default function Page() {
  return (
    <Suspense fallback={null}>
      <EstudarClient />
    </Suspense>
  );
}
