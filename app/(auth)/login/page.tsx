import { LoginForm } from '@/components/auth/LoginForm'

export const metadata = { title: 'Sign in — AI Council' }

export default function LoginPage() {
  return (
    <>
      <h1 className="text-xl font-bold text-zinc-900 mb-1">Welcome back</h1>
      <p className="text-sm text-zinc-500 mb-6">Sign in to your council</p>
      <LoginForm />
    </>
  )
}
