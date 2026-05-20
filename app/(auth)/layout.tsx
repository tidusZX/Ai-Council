export default function AuthLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen bg-zinc-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <a href="/" className="text-xl font-bold text-zinc-900">
            AI Council
          </a>
          <p className="text-sm text-zinc-500 mt-1">Expert perspectives, instantly</p>
        </div>
        <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm p-6">
          {children}
        </div>
      </div>
    </div>
  )
}
