import { describe, expect, it } from 'vitest';
import { repairDamagedParameter, wrapJsxChildren } from '../src/adapters/layout.js';

const WRAPPED = '<TraceIQProvider>{children}</TraceIQProvider>';

describe('wrapJsxChildren', () => {
  it('wraps the JSX child, not the destructured parameter', () => {
    const layout = 'export default function RootLayout({ children }: { children: React.ReactNode }) {\n  return <html><body>{children}</body></html>;\n}';
    const result = wrapJsxChildren(layout)!;
    expect(result).toContain('RootLayout({ children }: { children: React.ReactNode })');
    expect(result).toContain(`<body>${WRAPPED}</body>`);
  });

  it('handles the create-next-app layout with Readonly props', () => {
    const layout = `export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={inter.className}>{children}</body>
    </html>
  );
}`;
    const result = wrapJsxChildren(layout)!;
    expect(result).toContain('RootLayout({\n  children,\n}: Readonly<{');
    expect(result).toContain(`<body className={inter.className}>${WRAPPED}</body>`);
  });

  it('wraps children inside existing providers on their own line', () => {
    const layout = `export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full">
      <body className="min-h-full flex flex-col antialiased">
        <AuthProvider>
          <ServiceWorkerRegister />
          <ToastProvider />
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}`;
    const result = wrapJsxChildren(layout)!;
    expect(result).toContain('RootLayout({ children }: { children: React.ReactNode })');
    expect(result).toContain(`<ToastProvider />\n          ${WRAPPED}\n        </AuthProvider>`);
  });

  it('works for untyped JavaScript layouts', () => {
    const result = wrapJsxChildren('export default function RootLayout({ children }) {\n  return <html><body>{ children }</body></html>;\n}')!;
    expect(result).toContain('RootLayout({ children })');
    expect(result).toContain(`<body>${WRAPPED}</body>`);
  });

  it('repairs a layout an older installer broke, then wraps the JSX child', () => {
    const broken = `import { TraceIQProvider } from '@/components/traceiq-provider';
export default function RootLayout(<TraceIQProvider>{children}</TraceIQProvider>: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}`;
    const repaired = repairDamagedParameter(broken);
    expect(repaired).toContain('RootLayout({ children }: { children: React.ReactNode })');
    expect(repaired).not.toContain('RootLayout(<TraceIQProvider>');
    const fixed = wrapJsxChildren(repaired)!;
    expect(fixed).toContain(`<AuthProvider>\n          ${WRAPPED}\n        </AuthProvider>`);
    expect(fixed.match(/TraceIQProvider/g)).toHaveLength(3); // import + open + close
  });

  it('leaves a healthy layout alone when repairing', () => {
    const healthy = 'export default function RootLayout({ children }: { children: React.ReactNode }) {\n  return <body>{children}</body>;\n}';
    expect(repairDamagedParameter(healthy)).toBe(healthy);
  });

  it('returns null when the layout never renders children in JSX', () => {
    expect(wrapJsxChildren('export default function RootLayout({ children }) {\n  return render(children);\n}')).toBeNull();
    expect(wrapJsxChildren('export default function Page() { return <div /> }')).toBeNull();
  });
});
