import { AuthCodeErrorView } from './AuthCodeErrorView';
import { AuthParticles } from '../AuthParticles';

export default function AuthCodeErrorPage() {
  return (
    <main
      style={{ colorScheme: 'light' }}
      className="relative grid min-h-screen place-items-center overflow-hidden bg-gradient-to-br from-[#e5f3ff] via-white to-[#fff0e4] px-5 text-[#101715]"
    >
      <AuthParticles />
      <div className="relative w-full max-w-md rounded-2xl border border-[#d4e2f2] bg-white/90 p-8 shadow-xl shadow-[#245beb]/10 backdrop-blur">
        <AuthCodeErrorView />
      </div>
    </main>
  );
}
