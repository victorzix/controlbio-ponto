import { getCurrentUser } from "@/lib/auth";

/** Home da área interna (placeholder). As telas de ponto chegam nas próximas features. */
export default async function HomePage() {
  const user = await getCurrentUser();
  const firstName = user?.name?.split(" ")[0] ?? "";

  return (
    <div className="space-y-2">
      <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
        Olá, {firstName} 👋
      </h1>
      <p className="text-muted-foreground">
        Você está autenticado. As telas de registro de ponto chegam nas próximas
        features.
      </p>
    </div>
  );
}
