import { AuthCodeErrorView } from './AuthCodeErrorView';

export default function AuthCodeErrorPage() {
  return (
    <main style={{ colorScheme: "light" }} className="grid min-h-screen place-items-center bg-white px-5 text-neutral-950">
      <AuthCodeErrorView />
    </main>
  );
}
