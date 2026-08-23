"use client";

import type { MouseEvent } from "react";
import { signIn } from "next-auth/react";
import { Button } from "./Button";

export function SignInButton() {
  function handleClick(event: MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    signIn("google", { callbackUrl: "/dashboard" });
  }

  return (
    <Button variant="accent" onClick={handleClick}>
      Sign in with Google
    </Button>
  );
}
