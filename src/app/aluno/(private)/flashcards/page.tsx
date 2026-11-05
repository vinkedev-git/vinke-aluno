import FlashcardsClient from "./flashcards-client";
import SeloPremium from "@/components/aluno/SeloPremium";

export const dynamic = "force-dynamic";

export default function Page() {
  return (
    <>
      <SeloPremium recurso="Flashcards" />
      <FlashcardsClient />
    </>
  );
}
