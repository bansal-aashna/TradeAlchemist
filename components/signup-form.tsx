"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  createUserWithEmailAndPassword,
  updateProfile,
} from "firebase/auth";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { auth } from "@/lib/firebase";
import { getCurrentUser, initCurrentUser } from "@/lib/api";

const signupSchema = z
  .object({
    fullName: z.string().min(2, "Please enter your full name."),
    email: z.string().email("Enter a valid email address."),
    password: z
      .string()
      .min(8, "Password must be at least 8 characters.")
      .max(72, "Password is too long."),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    path: ["confirmPassword"],
    message: "Passwords do not match.",
  });

type SignupValues = z.infer<typeof signupSchema>;

export function SignupForm() {
  const router = useRouter();
  const [authError, setAuthError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<SignupValues>({
    resolver: zodResolver(signupSchema),
    defaultValues: {
      fullName: "",
      email: "",
      password: "",
      confirmPassword: "",
    },
  });

  useEffect(() => {
    document.documentElement.dataset.theme = "dark";
  }, []);

  const onSubmit = async (values: SignupValues) => {
    setAuthError(null);
    try {
      const userCredential = await createUserWithEmailAndPassword(
        auth,
        values.email,
        values.password,
      );
      await updateProfile(userCredential.user, {
        displayName: values.fullName,
      });
      const token = await userCredential.user.getIdToken(true);
      await initCurrentUser(token);
      await getCurrentUser(token);
      router.replace("/dashboard");
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Could not create account. Please try again.";
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

      <Card className="ta-auth-card ta-signup-card">
        <div className="ta-auth-header">
          <h2 className="ta-auth-heading">Create Account</h2>
          <p className="ta-auth-copy">
            Enter your details to start building your virtual portfolio.
          </p>
        </div>
        <form className="ta-form" onSubmit={handleSubmit(onSubmit)} noValidate>
          <div className="ta-auth-field">
            <label className="ta-label" htmlFor="fullName">
              Full Name
            </label>
            <Input id="fullName" type="text" placeholder="Alex Trader" {...register("fullName")} />
            {errors.fullName ? <p className="ta-error">{errors.fullName.message}</p> : null}
          </div>

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

          <div className="ta-auth-field">
            <label className="ta-label" htmlFor="confirmPassword">
              Confirm Password
            </label>
            <Input
              id="confirmPassword"
              type="password"
              placeholder=""
              {...register("confirmPassword")}
            />
            {errors.confirmPassword ? <p className="ta-error">{errors.confirmPassword.message}</p> : null}
          </div>

          <Button
            type="submit"
            isLoading={isSubmitting}
            loadingText="Creating Account..."
          >
            Sign Up
          </Button>
          {authError ? <p className="ta-error">{authError}</p> : null}
        </form>

        <p className="ta-link-row ta-auth-link-row">
          Already have an account? <Link href="/login">Sign In</Link>
        </p>
      </Card>
    </main>
  );
}
