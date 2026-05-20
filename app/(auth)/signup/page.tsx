import { SignupForm } from '@/components/auth/SignupForm'

export const metadata = { title: 'Sign up — AI Council' }

export default function SignupPage() {
  return (
    <>
      <h1 className="text-xl font-bold text-zinc-900 mb-1">Create account</h1>
      <p className="text-sm text-zinc-500 mb-6">Start convening your council</p>
      <SignupForm />
    </>
  )
}
