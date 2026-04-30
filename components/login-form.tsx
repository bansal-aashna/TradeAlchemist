"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { signInWithEmailAndPassword } from "firebase/auth";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { auth } from "@/lib/firebase";
import { getCurrentUser, initCurrentUser } from "@/lib/api";

const loginSchema = z.object({
  email: z.string().email("Enter a valid email address."),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters.")
    .max(72, "Password is too long."),
});

type LoginValues = z.infer<typeof loginSchema>;

export function LoginForm() {
  const router = useRouter();
  const [authError, setAuthError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: "",
      password: "",
    },
  });

  useEffect(() => {
    document.documentElement.dataset.theme = "dark";
  }, []);

  const onSubmit = async (values: LoginValues) => {
    setAuthError(null);
    try {
      const userCredential = await signInWithEmailAndPassword(auth, values.email, values.password);
      const token = await userCredential.user.getIdToken();
      await initCurrentUser(token);
      await getCurrentUser(token);
      router.push("/dashboard");
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Could not sign in. Check your credentials and try again.";
      setAuthError(message);
    }
  };

  return (
    <main className="ta-shell ta-auth-page">
      <div className="ta-auth-brand">
        <div className="ta-logo ta-auth-logo">
          <img src="/logo-dark.png" alt="TradeAlchemist Logo" />
        </div>
        <h1 className="ta-auth-brand-name">TradeAlchemist</h1>
      </div>

      <Card className="ta-auth-card">
        <div className="ta-auth-header">
          <h2 className="ta-auth-heading">Welcome Back</h2>
          <p className="ta-auth-copy">
            Enter your email and password to access your portfolio.
          </p>
        </div>
        <form className="ta-form" onSubmit={handleSubmit(onSubmit)} noValidate>
          <div className="ta-auth-field">
            <label className="ta-label" htmlFor="email">
              Email
            </label>
            <Input id="email" type="email" placeholder="m@example.com" {...register("email")} />
            {errors.email ? <p className="ta-error">{errors.email.message}</p> : null}
          </div>

          <div className="ta-auth-field">
            <label className="ta-label" htmlFor="password">
              Password
            </label>
            <Input id="password" type="password" placeholder="" {...register("password")} />
            {errors.password ? <p className="ta-error">{errors.password.message}</p> : null}
          </div>

          <Button type="submit" isLoading={isSubmitting} loadingText="Signing In...">
            Sign In
          </Button>
          {authError ? <p className="ta-error">{authError}</p> : null}
        </form>
        <p className="ta-link-row ta-auth-link-row">
          Don&apos;t have an account? <Link href="/signup">Sign Up</Link>
        </p>
      </Card>
    </main>
  );
}
