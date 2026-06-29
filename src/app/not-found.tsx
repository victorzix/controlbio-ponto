import Link from "next/link";
import { Home, MapPinOff } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Página 404 no padrão do design system. Renderizada dentro do root layout. */
export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-background p-6 text-center">
      <div className="flex max-w-sm flex-col items-center gap-4">
        <span className="bg-muted text-muted-foreground flex size-12 items-center justify-center rounded-full">
          <MapPinOff className="size-6" />
        </span>
        <div className="space-y-1">
          <h1 className="text-xl font-semibold">Página não encontrada</h1>
          <p className="text-muted-foreground text-sm">
            O endereço que você tentou abrir não existe ou foi movido.
          </p>
        </div>
        <Button asChild className="h-11">
          <Link href="/">
            <Home className="size-4" />
            Voltar ao início
          </Link>
        </Button>
      </div>
    </div>
  );
}
