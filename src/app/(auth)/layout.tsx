/** Layout das telas públicas de autenticação. Centralizado e mobile first. */
export default function AuthLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-background p-4">
      {children}
    </div>
  );
}
