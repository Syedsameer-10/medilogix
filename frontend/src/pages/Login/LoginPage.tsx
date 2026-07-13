import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useNavigate } from 'react-router-dom';
import { FiEye, FiEyeOff, FiLock, FiMail } from 'react-icons/fi';
import { z } from 'zod';
import medilogixLogo from '../../assets/medilogix-logo.png';
import { useAuth } from '../../contexts/AuthContext';
import { usePageTitle } from '../../hooks/usePageTitle';

const loginSchema = z.object({
  gmail: z.string().email().refine((value) => value.toLowerCase().endsWith('@gmail.com'), 'Enter a valid Gmail address.'),
  password: z.string().min(8),
});

type LoginFormValues = z.infer<typeof loginSchema>;

export function LoginPage() {
  usePageTitle('Login');
  const { login } = useAuth();
  const navigate = useNavigate();
  const [errorMessage, setErrorMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
  const { register, handleSubmit } = useForm<LoginFormValues>();

  async function onSubmit(values: LoginFormValues) {
    const parsedValues = loginSchema.safeParse(values);

    if (!parsedValues.success) {
      setErrorMessage('Enter a valid Gmail address and a password with at least 8 characters.');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage('');

    try {
      await login(parsedValues.data.gmail, parsedValues.data.password);
      navigate('/patients', { replace: true });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Login is temporarily unavailable. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="grid min-h-screen place-items-center bg-[#f4f7fb] px-4 py-8 text-[#07194c]">
      <section className="w-full max-w-[440px] rounded-xl border border-[#e1e7f2] bg-white p-7 shadow-[0_24px_70px_rgba(15,23,42,0.12)] sm:p-9">
        <div className="text-center">
          <img alt="MediLogiX" className="mx-auto h-12 w-auto object-contain" src={medilogixLogo} />
          <h1 className="mt-6 text-3xl font-extrabold tracking-normal">Sign in</h1>
          <p className="mt-2 text-sm font-medium text-[#64749f]">Access your MediLogiX patient records.</p>
        </div>

        <form className="mt-7 space-y-4" onSubmit={handleSubmit(onSubmit)}>
          <label className="block">
            <span className="text-sm font-bold">Gmail</span>
            <span className="mt-2 flex h-12 items-center gap-3 rounded-md border border-[#d7deea] bg-white px-4 focus-within:border-[#0647ff] focus-within:ring-4 focus-within:ring-blue-100">
              <FiMail aria-hidden="true" className="text-[#7d8db7]" />
              <input
                autoComplete="email"
                className="min-w-0 flex-1 border-0 bg-transparent text-sm outline-none"
                placeholder="name@gmail.com"
                type="email"
                {...register('gmail')}
              />
            </span>
          </label>

          <label className="block">
            <span className="text-sm font-bold">Password</span>
            <span className="mt-2 flex h-12 items-center gap-3 rounded-md border border-[#d7deea] bg-white px-4 focus-within:border-[#0647ff] focus-within:ring-4 focus-within:ring-blue-100">
              <FiLock aria-hidden="true" className="text-[#7d8db7]" />
              <input
                autoComplete="current-password"
                className="min-w-0 flex-1 border-0 bg-transparent text-sm outline-none"
                placeholder="Enter password"
                type={isPasswordVisible ? 'text' : 'password'}
                {...register('password')}
              />
              <button
                aria-label={isPasswordVisible ? 'Hide password' : 'Show password'}
                className="grid h-8 w-8 shrink-0 place-items-center rounded text-[#64749f] transition hover:bg-[#eef4ff] hover:text-[#0647ff] focus:outline-none focus:ring-2 focus:ring-[#0647ff]"
                onClick={() => setIsPasswordVisible((visible) => !visible)}
                type="button"
              >
                {isPasswordVisible ? <FiEyeOff aria-hidden="true" /> : <FiEye aria-hidden="true" />}
              </button>
            </span>
          </label>

          {errorMessage ? <p className="rounded-md bg-rose-50 px-3 py-2 text-sm font-bold text-rose-700">{errorMessage}</p> : null}

          <button
            className="h-12 w-full rounded-md bg-[#0647ff] text-sm font-extrabold text-white shadow-[0_14px_28px_rgba(6,71,255,0.24)] transition hover:bg-[#053ee0] disabled:cursor-not-allowed disabled:opacity-70"
            disabled={isSubmitting}
            type="submit"
          >
            {isSubmitting ? 'Signing in...' : 'Sign in'}
          </button>
        </form>

        <p className="mt-6 text-center text-sm font-medium text-[#64749f]">
          New user? <Link className="font-extrabold text-[#0647ff]" to="/signup">Sign up</Link>
        </p>
      </section>
    </main>
  );
}
