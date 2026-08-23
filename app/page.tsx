import { getServerSession } from "next-auth/next";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { Card } from "@/components/Card";
import { SignInButton } from "@/components/SignInButton";

export default async function HomePage() {
  const session = await getServerSession(authOptions);
  if (session) {
    redirect("/dashboard");
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-4">
      <Card className="w-full max-w-md px-6 py-8">
        <h1 className="text-h1 text-text">Hire</h1>
        <p className="text-body text-text-muted mt-2">
          AI-powered job application replies for your inbox.
        </p>
        <p className="text-sub text-text-faint mt-4">
          Sign in with Google is required — this app reads your Gmail inbox to
          detect and reply to job applications.
        </p>
        <div className="mt-6">
          <SignInButton />
        </div>
      </Card>
    </main>
  );
}
